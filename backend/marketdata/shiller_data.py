"""
marketdata/shiller_data.py  (ported from valuation_debug/data_sources/shiller_data.py)

Robert Shiller's monthly S&P 500 dataset — the canonical *free* source for
index-level fundamentals (price, dividends, earnings, CPI) going back to 1871,
plus the cyclically adjusted P/E (CAPE / PE10).

Source strategy (robust, dependency-light, self-healing)
--------------------------------------------------------
Both of Shiller's "canonical" free feeds go stale on *fundamentals*: the
datahub.io CSV mirror keeps price current but zero-fills earnings/CPI/CAPE after
mid-2023, and Shiller's own ``ie_data.xls`` is frozen at Sept-2023. So
:meth:`ShillerData.load` *merges* three free sources, filling each field from the
freshest source that has it:

  1. **datahub CSV** — long history + current *price* (zeros → None).
  2. **Shiller ie_data.xls** *(optional, needs ``xlrd``)* — historical overlay.
  3. **multpl.com monthly tables** — Shiller-derived and **current**: CAPE,
     trailing-twelve-month earnings, dividend, and price.

Every source is failure-isolated: if one is unreachable the others still load.
"""

from __future__ import annotations

import csv
import datetime as _dt
import io
import logging
import re
import sqlite3
from dataclasses import dataclass

from .http_cache import cached_download, cached_text
from .schema import ensure_external_schema

logger = logging.getLogger(__name__)

# Data-vintage guard: a newest COMPLETE month older than this many months means
# the merged fundamentals have gone stale (the past mid-2023 mirror incident).
STALE_MONTHS_THRESHOLD = 3

# Primary: datahub mirror of Shiller's data (CSV).
DATAHUB_CSV_URL = (
    "https://raw.githubusercontent.com/datasets/s-and-p-500/master/data/data.csv"
)
# Secondary (documented): Shiller's canonical spreadsheet (.xls, needs xlrd).
SHILLER_XLS_URL = "http://www.econ.yale.edu/~shiller/data/ie_data.xls"

# Tertiary: multpl.com monthly tables — Shiller-derived and kept current.
MULTPL_SERIES: tuple[tuple[str, str, str], ...] = (
    ("cape", "https://www.multpl.com/shiller-pe/table/by-month", "multpl_cape.html"),
    ("earnings", "https://www.multpl.com/s-p-500-earnings/table/by-month",
     "multpl_earnings.html"),
    ("dividend", "https://www.multpl.com/s-p-500-dividend/table/by-month",
     "multpl_dividend.html"),
    ("sp500", "https://www.multpl.com/s-p-500-historical-prices/table/by-month",
     "multpl_price.html"),
)

# Numeric fields merged across sources (everything except the date key).
_MERGE_FIELDS: tuple[str, ...] = (
    "sp500", "dividend", "earnings", "cpi", "long_rate",
    "real_price", "real_dividend", "real_earnings", "cape",
)

_MONTHS = {m: i for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
     "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], start=1)}

# multpl row, e.g. ``<td>Jun 1, 2026</td><td>\n&#x2002;\n41.43\n</td>``.
_MULTPL_ROW_RE = re.compile(
    r"<td>\s*([A-Z][a-z]{2})\s+(\d{1,2}),\s*(\d{4})\s*</td>\s*"
    r"<td>[^<]*?(-?\d[\d,]*(?:\.\d+)?)\s*</td>",
    re.S,
)


@dataclass(frozen=True)
class ShillerRow:
    """One month of Shiller's S&P 500 series. Any field may be None."""

    date: str  # ISO YYYY-MM-01
    sp500: float | None
    dividend: float | None
    earnings: float | None
    cpi: float | None
    long_rate: float | None
    real_price: float | None
    real_dividend: float | None
    real_earnings: float | None
    cape: float | None

    @property
    def is_complete(self) -> bool:
        """True when the row has the fields the valuation models need: a positive
        index level and positive trailing earnings (CPI is *not* required)."""
        return (
            self.sp500 is not None
            and self.sp500 > 0
            and self.earnings is not None
            and self.earnings > 0
        )


def _f(raw: str | None) -> float | None:
    if raw is None:
        return None
    s = raw.strip()
    if s == "" or s.lower() in {"nan", "na", "null"}:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _fz(raw: str | None) -> float | None:
    """Like :func:`_f` but treats a literal ``0.0`` as *missing* (``None``).

    The datahub mirror zero-fills every fundamental column in its stale tail. No
    real S&P 500 value is ever exactly zero, so a zero is unambiguously a
    placeholder — coercing it to None lets the merge overlay a fresh value."""
    v = _f(raw)
    return None if (v is not None and v == 0.0) else v


def _norm_date(raw: str) -> str | None:
    """Normalise Shiller/datahub date forms to ISO YYYY-MM-01."""
    s = raw.strip()
    if not s:
        return None
    if "-" in s:  # ISO-ish
        parts = s.split("-")
        if len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit():
            return f"{int(parts[0]):04d}-{int(parts[1]):02d}-01"
        return None
    if "." in s:  # Shiller decimal, e.g. .01==Jan, .10==Oct
        y, _, frac = s.partition(".")
        if y.isdigit() and frac.isdigit():
            month = int(frac.ljust(2, "0")[:2])
            month = min(max(month, 1), 12)
            return f"{int(y):04d}-{month:02d}-01"
    if s.isdigit() and len(s) == 4:
        return f"{int(s):04d}-01-01"
    return None


def _parse_multpl_table(html: str) -> dict[str, float]:
    """Parse a multpl.com ``/table/by-month`` page into ``{ISO-date: value}``.

    Rows are listed newest-first; the topmost row for a month wins, so the
    freshest available value is kept."""
    out: dict[str, float] = {}
    for mon, _day, yr, val in _MULTPL_ROW_RE.findall(html):
        m = _MONTHS.get(mon)
        if not m:
            continue
        iso = f"{int(yr):04d}-{m:02d}-01"
        if iso in out:  # keep first (freshest) occurrence per month
            continue
        try:
            out[iso] = float(val.replace(",", ""))
        except ValueError:
            continue
    return out


def _row_to_fields(r: ShillerRow) -> dict[str, float | None]:
    return {f: getattr(r, f) for f in _MERGE_FIELDS}


def _merged_row(
    base: ShillerRow | None, date: str, new: dict[str, float | None]
) -> ShillerRow:
    """Return a ShillerRow for ``date`` that keeps every non-None field of
    ``base`` and fills the gaps from ``new`` (the overlay source)."""
    cur: dict[str, float | None] = (
        _row_to_fields(base) if base is not None
        else {f: None for f in _MERGE_FIELDS}
    )
    for f in _MERGE_FIELDS:
        if cur.get(f) is None and new.get(f) is not None:
            cur[f] = new[f]
    return ShillerRow(date=date, **cur)  # type: ignore[arg-type]


class ShillerData:
    """Loader/parser/persistence for Shiller's monthly S&P 500 dataset."""

    def __init__(self, *, cache_dir: str | None = None) -> None:
        self.cache_dir = cache_dir
        # Populated by load()/store(): the most recent data-vintage staleness signal.
        self.last_staleness: dict | None = None

    # ── load ──────────────────────────────────────────────────────────────────
    def load(
        self,
        *,
        force: bool = False,
        max_age_days: float = 7.0,
        use_xls: bool = True,
        use_web_supplement: bool = True,
    ) -> list[ShillerRow]:
        """Return all rows ascending by date, merged across every available free
        source so recent months carry *current* fundamentals."""
        by_date: dict[str, ShillerRow] = {}

        for r in self._load_datahub_csv(force=force, max_age_days=max_age_days):
            by_date[r.date] = r

        if use_xls:
            for r in self._load_shiller_xls(force=force, max_age_days=max_age_days):
                by_date[r.date] = _merged_row(by_date.get(r.date), r.date,
                                              _row_to_fields(r))

        if use_web_supplement:
            for date, fields in self._load_multpl_supplement(
                force=force, max_age_days=max_age_days
            ).items():
                by_date[date] = _merged_row(by_date.get(date), date, fields)

        rows = sorted(by_date.values(), key=lambda r: r.date)
        self._record_staleness(rows)
        return rows

    def _load_datahub_csv(self, *, force: bool, max_age_days: float) -> list[ShillerRow]:
        text = cached_text(
            DATAHUB_CSV_URL,
            "shiller_sp500.csv",
            cache_dir=self.cache_dir,
            max_age_days=max_age_days,
            force=force,
        )
        if not text:
            return []
        reader = csv.DictReader(io.StringIO(text))

        def col(row: dict[str, str], *names: str) -> str | None:
            for n in names:
                for k in row:
                    if k.strip().lower() == n.lower():
                        return row[k]
            return None

        out: list[ShillerRow] = []
        for row in reader:
            date = _norm_date(col(row, "Date") or "")
            if date is None:
                continue
            out.append(
                ShillerRow(
                    date=date,
                    sp500=_fz(col(row, "SP500", "S&P Comp.", "Price")),
                    dividend=_fz(col(row, "Dividend")),
                    earnings=_fz(col(row, "Earnings")),
                    cpi=_fz(col(row, "Consumer Price Index", "CPI")),
                    long_rate=_fz(col(row, "Long Interest Rate", "Long Rate")),
                    real_price=_fz(col(row, "Real Price")),
                    real_dividend=_fz(col(row, "Real Dividend")),
                    real_earnings=_fz(col(row, "Real Earnings")),
                    cape=_fz(col(row, "PE10", "CAPE", "Cyclically Adjusted PE Ratio")),
                )
            )
        out.sort(key=lambda r: r.date)
        return out

    def _load_shiller_xls(self, *, force: bool, max_age_days: float) -> list[ShillerRow]:
        """Best-effort parse of Shiller's ie_data.xls (needs xlrd)."""
        try:
            import pandas as pd  # noqa: PLC0415
        except ImportError:
            return []
        result = cached_download(
            SHILLER_XLS_URL,
            "ie_data.xls",
            cache_dir=self.cache_dir,
            max_age_days=max_age_days,
            force=force,
        )
        if result.data is None:
            return []
        try:
            df = pd.read_excel(io.BytesIO(result.data), sheet_name="Data",
                               skiprows=7, engine="xlrd")
        except Exception:  # noqa: BLE001 — xlrd missing or format drift
            return []
        out: list[ShillerRow] = []
        for _, r in df.iterrows():
            date = _norm_date(str(r.iloc[0]))
            if date is None:
                continue

            def g(i: int) -> float | None:
                try:
                    v = float(r.iloc[i])
                    return v if v == v else None  # drop NaN
                except (ValueError, TypeError, IndexError):
                    return None

            out.append(ShillerRow(
                date=date, sp500=g(1), dividend=g(2), earnings=g(3),
                cpi=g(4), long_rate=g(6), real_price=g(7),
                real_dividend=g(8), real_earnings=g(10), cape=g(12),
            ))
        out.sort(key=lambda r: r.date)
        return out

    def _load_multpl_supplement(
        self, *, force: bool, max_age_days: float
    ) -> dict[str, dict[str, float | None]]:
        """Fetch + parse multpl's monthly CAPE/earnings/dividend/price tables."""
        out: dict[str, dict[str, float | None]] = {}
        for field, url, fname in MULTPL_SERIES:
            try:
                text = cached_text(
                    url, fname, cache_dir=self.cache_dir,
                    max_age_days=max_age_days, force=force,
                )
            except Exception:  # noqa: BLE001 — one bad page must not abort the rest
                text = None
            if not text:
                continue
            for iso, val in _parse_multpl_table(text).items():
                out.setdefault(iso, {})[field] = val
        return out

    # ── persistence ─────────────────────────────────────────────────────────────
    def store(self, conn: sqlite3.Connection, rows: list[ShillerRow] | None = None) -> int:
        """Upsert rows into ``shiller_sp500``. Loads if ``rows`` is None."""
        if rows is None:
            rows = self.load()
        if not rows:
            return 0
        ensure_external_schema(conn)
        now = _dt.datetime.now().isoformat(timespec="seconds")
        conn.executemany(
            """
            INSERT INTO shiller_sp500
                (date, sp500, dividend, earnings, cpi, long_rate,
                 real_price, real_dividend, real_earnings, cape, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(date) DO UPDATE SET
                sp500=excluded.sp500, dividend=excluded.dividend,
                earnings=excluded.earnings, cpi=excluded.cpi,
                long_rate=excluded.long_rate, real_price=excluded.real_price,
                real_dividend=excluded.real_dividend,
                real_earnings=excluded.real_earnings, cape=excluded.cape,
                fetched_at=excluded.fetched_at
            """,
            [
                (r.date, r.sp500, r.dividend, r.earnings, r.cpi, r.long_rate,
                 r.real_price, r.real_dividend, r.real_earnings, r.cape, now)
                for r in rows
            ],
        )
        conn.commit()
        self._record_staleness(rows)
        return len(rows)

    # ── data-vintage staleness signal ────────────────────────────────────────
    @staticmethod
    def staleness_signal(rows: list[ShillerRow]) -> dict:
        """Describe how current the newest COMPLETE month is (price + trailing
        earnings), independent of the fetched-at stamp. ``is_stale`` is True when
        the newest complete month lags today by more than ``STALE_MONTHS_THRESHOLD``
        months — the signature of the silent mid-2023 mirror revert."""
        complete = ShillerData.latest_complete(rows)
        complete_date = complete.date if complete else None
        cape_date = None
        for r in reversed(rows):
            if r.cape is not None and r.cape > 0:
                cape_date = r.date
                break
        lag = _months_behind(complete_date) if complete_date else None
        is_stale = lag is not None and lag > STALE_MONTHS_THRESHOLD
        return {
            "is_stale": is_stale,
            "complete_date": complete_date,
            "cape_date": cape_date,
            "months_lagged": lag,
        }

    def _record_staleness(self, rows: list[ShillerRow]) -> dict:
        """Compute + cache the staleness signal and log a WARNING when stale."""
        sig = self.staleness_signal(rows)
        self.last_staleness = sig
        if sig["is_stale"]:
            logger.warning(
                "Shiller data vintage stale: newest complete month %s lags %s "
                "months (cape through %s); CAPE / implied ERP / Fed model may be "
                "using stale fundamentals.",
                sig["complete_date"], sig["months_lagged"], sig["cape_date"],
            )
        return sig

    # ── derived helpers ──────────────────────────────────────────────────────
    @staticmethod
    def latest_complete(rows: list[ShillerRow]) -> ShillerRow | None:
        """Most recent row carrying the fields the valuation models need."""
        for r in reversed(rows):
            if r.is_complete:
                return r
        return None

    @staticmethod
    def latest_level(rows: list[ShillerRow]) -> float | None:
        """Most recent S&P 500 index level (newest row with a positive price),
        independent of whether trailing earnings has caught up to that month."""
        for r in reversed(rows):
            if r.sp500 is not None and r.sp500 > 0:
                return r.sp500
        return None

    @staticmethod
    def latest_cape(rows: list[ShillerRow]) -> float | None:
        for r in reversed(rows):
            if r.cape is not None and r.cape > 0:
                return r.cape
        return None

    @staticmethod
    def real_earnings_cagr(rows: list[ShillerRow], years: int = 10) -> float | None:
        """Annualised growth of *real* earnings over the trailing ``years``."""
        usable = [r for r in rows
                  if r.real_earnings is not None and r.real_earnings > 0]
        if len(usable) < years * 12 + 1:
            return None
        end = usable[-1]
        try:
            end_year = int(end.date[:4])
        except ValueError:
            return None
        target = f"{end_year - years:04d}{end.date[4:]}"
        start = min(usable, key=lambda r: abs(_month_index(r.date) - _month_index(target)))
        if start.real_earnings is None or start.real_earnings <= 0:
            return None
        n = (_month_index(end.date) - _month_index(start.date)) / 12.0
        if n <= 0:
            return None
        return (end.real_earnings / start.real_earnings) ** (1.0 / n) - 1.0

    @staticmethod
    def real_earnings_through_date(rows: list[ShillerRow]) -> str | None:
        """The actual end-date of the real-earnings window that
        :meth:`real_earnings_cagr` measures. No current free source supplies real
        earnings, so this typically lags today by a year or more: the 10y CAGR is
        a trailing figure through this date, not a current one."""
        usable = [r for r in rows
                  if r.real_earnings is not None and r.real_earnings > 0]
        return usable[-1].date if usable else None


def _month_index(iso_date: str) -> int:
    """Months since year 0 for cheap date arithmetic on YYYY-MM strings."""
    y = int(iso_date[:4])
    m = int(iso_date[5:7])
    return y * 12 + (m - 1)


def _months_behind(iso_date: str) -> int:
    """How many months the given YYYY-MM date lags the current month."""
    today = _dt.date.today()
    today_idx = today.year * 12 + (today.month - 1)
    return today_idx - _month_index(iso_date)


def read_stored(conn: sqlite3.Connection) -> list[ShillerRow]:
    """Read Shiller rows back out of ``shiller_sp500`` (ascending)."""
    try:
        rows = conn.execute(
            """SELECT date, sp500, dividend, earnings, cpi, long_rate,
                      real_price, real_dividend, real_earnings, cape
               FROM shiller_sp500 ORDER BY date"""
        ).fetchall()
    except sqlite3.OperationalError:
        return []
    return [
        ShillerRow(r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9])
        for r in rows
    ]
