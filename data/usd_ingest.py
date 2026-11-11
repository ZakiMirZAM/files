"""usd_ingest.py — load the owner's per-year workbook tabs as USD rows.

The workbook ("better data") holds every company in its own REPORTING currency,
as filed at the time (verified 2026-11-10 against SEC XBRL: Toyota, TSMC, SAP,
Novo, Alibaba match to 1.000 back to 2008). The owner's rule is that the
warehouse stores USD. This module is the one place that does that conversion.

Rules, and why:

* **One rate per row: the month-end close of the row's own fiscal period end**
  (`fx_rates_monthly.close`). Every money column in the row is multiplied by
  that single rate. A single rate keeps every within-row identity and ratio
  exactly what it was in the filing currency (margin, ROE, P/E, cap = P/S x
  revenue, net change in cash = end - beginning). Mixing an average rate for
  flows with a close rate for stocks would move every computed ratio away from
  the stored ratio columns, which this codebase treats as a silent-bug class.
* **A ratio, a growth rate, a day count and a share count are never converted.**
* **A missing rate is a rejected row, never a guessed 1:1.** Rejects are
  written to `usd_ingest_rejects` with the reason.
* The original currency and the rate used are kept in `"Source Currency"` and
  `"FX Rate"`, so the conversion can be audited and reversed.
  `"Reported Currency"` becomes `'USD'`, which is what makes every existing
  reader (FX weights, price reconciliation, location rates) treat the row as a
  dollar statement without a code change.
* **The year key is the year of the row's period-end Date**, the same key the
  live update path (`FinancialDB._fetch_yf_annual`) uses, so a later yfinance
  update lands on the row it belongs to. The vendor's "Calendar Year" cell
  follows a different convention and is ignored. A tab may hold a fiscal year
  that ends by June of the next year; when two tabs would give one company the
  same year key, the first is kept and the second goes to the rejects table.

Nothing here touches the network.
"""

from __future__ import annotations

import csv
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Iterable, Optional

from data.financial_db import EXCEL_COLUMNS, is_valid_year_period
from data.fx_convert import normalize_currency

TEXT_COLUMNS = frozenset({
    "Ticker", "Name", "Sector", "Industry", "Date", "Reported Currency",
    "Period", "Cik", "Filling Date", "Accepted Date", "Calendar Year",
})

# Vendor spellings that `normalize_currency` cannot know about.
_CURRENCY_ALIASES = {"NIS": "ILS"}


def _span(first: str, last: str) -> list[str]:
    """Columns from `first` to `last` inclusive, in warehouse order."""
    i, j = EXCEL_COLUMNS.index(first), EXCEL_COLUMNS.index(last)
    return EXCEL_COLUMNS[i:j + 1]


# Columns with no currency in them. Everything numeric that is NOT listed here
# is money (absolute or per share) and is converted.
UNITLESS_COLUMNS = frozenset(
    ["Gross Profit Ratio", "EBITDA Ratio", "Operating Income Ratio",
     "Income Before Tax Ratio", "Net Income Ratio",
     "Weighted Average Shs Out", "Weighted Average Shs Out Dil",
     "ROIC", "Return On Tangible Assets", "ROE"]
    + _span("PE Ratio", "Stock Based Compensation To Revenue")
    + _span("Days Sales Outstanding", "Inventory Turnover")
    + _span("Revenue Growth", "SGA Expenses Growth")
)

MONEY_COLUMNS = tuple(
    c for c in EXCEL_COLUMNS if c not in TEXT_COLUMNS and c not in UNITLESS_COLUMNS
)

EXTRA_COLUMNS = ("Source Currency", "FX Rate")

REJECT_DDL = """
CREATE TABLE IF NOT EXISTS usd_ingest_rejects (
    source   TEXT NOT NULL,
    ticker   TEXT NOT NULL,
    date     TEXT,
    currency TEXT,
    reason   TEXT NOT NULL
)
"""


# ── rates ────────────────────────────────────────────────────────────────────

def load_rates(conn: sqlite3.Connection) -> dict[tuple[str, str], float]:
    """{(currency, 'YYYY-MM'): USD per unit at the month's close}."""
    return {
        (c, m): r for c, m, r in conn.execute(
            "SELECT currency, month, close FROM fx_rates_monthly")
    }


def _prev_month(month: str) -> str:
    y, m = int(month[:4]), int(month[5:7])
    return f"{y - 1}-12" if m == 1 else f"{y}-{m - 1:02d}"


def usd_rate(currency: object, date: object,
             rates: dict[tuple[str, str], float]) -> Optional[float]:
    """USD per one unit of `currency` (minor units included) at the close of
    the month `date` falls in. Looks back at most two months for a gap in the
    series. `None` when the code is not a currency or there is no rate."""
    raw = str(currency or "").strip()
    norm = normalize_currency(_CURRENCY_ALIASES.get(raw.upper(), raw))
    if norm is None:
        return None
    major, divisor = norm
    if major == "USD":
        return 1.0 / divisor
    month = str(date or "")[:7]
    if len(month) != 7 or month[4] != "-":
        return None
    for _ in range(3):
        rate = rates.get((major, month))
        if rate is not None and rate > 0:
            return rate / divisor
        month = _prev_month(month)
    return None


# ── one row ──────────────────────────────────────────────────────────────────

def _num(v: object) -> Optional[float]:
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None
    try:
        f = float(s)
    except ValueError:
        return None
    return f if f == f and f not in (float("inf"), float("-inf")) else None


def _text(v: object) -> Optional[str]:
    s = str(v).strip() if v is not None else ""
    return s or None


def convert_row(raw: dict, rates: dict[tuple[str, str], float]
                ) -> tuple[Optional[dict], Optional[str]]:
    """One workbook row (header -> cell text) -> (USD record, None), or
    (None, reason) when the row cannot be converted. A row with no statement
    at all (the owner blanked it) returns (None, None): nothing to load and
    nothing to report."""
    date = (_text(raw.get("Date")) or "")[:10] or None
    if date is None and _num(raw.get("Revenue")) is None \
            and _num(raw.get("Total Assets")) is None:
        return None, None

    currency = _text(raw.get("Reported Currency"))
    if currency is None:
        return None, "no reporting currency"
    if date is None:
        return None, "no period end date"
    rate = usd_rate(currency, date, rates)
    if rate is None:
        return None, f"no {currency} rate for {date[:7]}"

    rec: dict = {}
    for col in EXCEL_COLUMNS:
        if col in TEXT_COLUMNS:
            rec[col] = _text(raw.get(col))
        else:
            rec[col] = _num(raw.get(col))
    rec["Date"] = date
    return _apply_rate(rec, currency, rate), None


def _apply_rate(rec: dict, currency: str, rate: float) -> dict:
    for col in MONEY_COLUMNS:
        if rec.get(col) is not None:
            rec[col] = rec[col] * rate
    norm = normalize_currency(_CURRENCY_ALIASES.get(currency.upper(), currency))
    rec["Source Currency"] = norm[0] if norm else currency
    rec["FX Rate"] = rate
    rec["Reported Currency"] = "USD"
    return rec


def convert_record(rec: dict, rates: dict[tuple[str, str], float],
                   spot: Optional[dict[str, float]] = None) -> Optional[dict]:
    """A typed record from a LIVE source (yfinance annual / quarterly / TTM) ->
    a USD copy, or `None` when it cannot be converted (the caller must then
    write nothing). `rec["Reported Currency"]` is the currency the figures are
    in and `rec["Date"]` the period end.

    `spot` ({currency: USD per unit}, the `fx_rates` table) is used only when
    the monthly table has no rate yet for the period, which is the normal case
    for a statement filed this month."""
    currency = _text(rec.get("Reported Currency"))
    date = (_text(rec.get("Date")) or "")[:10]
    if currency is None or not date:
        return None
    rate = usd_rate(currency, date, rates)
    if rate is None and spot:
        raw = _CURRENCY_ALIASES.get(currency.upper(), currency)
        norm = normalize_currency(raw)
        latest = max((m for (_c, m) in rates), default="")
        if norm is not None and date[:7] >= latest and spot.get(norm[0]):
            rate = spot[norm[0]] / norm[1]
    if rate is None:
        return None
    return _apply_rate(dict(rec), currency, rate)


# ── tables ───────────────────────────────────────────────────────────────────

def ensure_columns(conn: sqlite3.Connection, table: str) -> None:
    """Add "Source Currency" / "FX Rate" to `table` when they are missing."""
    have = {r[1] for r in conn.execute(f'PRAGMA table_info("{table}")')}
    if "Source Currency" not in have:
        conn.execute(f'ALTER TABLE "{table}" ADD COLUMN "Source Currency" TEXT')
    if "FX Rate" not in have:
        conn.execute(f'ALTER TABLE "{table}" ADD COLUMN "FX Rate" REAL')


def _insert_sql(table: str, cols: list[str]) -> str:
    col_sql = ", ".join(f'"{c}"' for c in cols)
    marks = ", ".join("?" for _ in cols)
    return f'INSERT OR REPLACE INTO "{table}" ({col_sql}) VALUES ({marks})'


def _fiscal_year(date: str) -> int:
    """Year key of an annual period ending on `date` ('YYYY-MM-DD').

    A 52/53-week filer's year can end on 1-7 January (2009-01-02, 2010-01-01),
    which is the year that just closed, and its next year can then end on 31
    December of that same calendar year. Keying on the bare calendar year would
    put two fiscal years on one key every few years. So a period that ends in
    the first ten days of January belongs to the year before."""
    year, month, day = int(date[:4]), int(date[5:7]), int(date[8:10])
    return year - 1 if (month == 1 and day <= 10) else year


def _days_between(earlier: str, later: str) -> int:
    """Days from `earlier` to `later` (ISO dates); negative when reversed."""
    from datetime import date
    try:
        return (date.fromisoformat(later[:10]) - date.fromisoformat(earlier[:10])).days
    except ValueError:
        return -1


def read_tab(path: str | Path) -> Iterable[dict]:
    """Rows of one staging CSV as header -> cell text."""
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            yield row


def load_tab(conn: sqlite3.Connection, rows: Iterable[dict], *, source: str,
             table: str, annual: bool = False,
             period: Optional[str] = None,
             rates: Optional[dict] = None,
             seen: Optional[set] = None) -> dict:
    """Convert and write one tab.

    The year key is the year of the row's own period-end Date. `annual=True`
    stores Period 'FY'; otherwise the row's Period cell is used and a row
    without one is rejected. `period` overrides the Period cell (`'TTM'` for
    the TTM tab). `seen` carries the (ticker, year, period) keys already
    written in this run, so a second row for a key is rejected instead of
    silently replacing the first. Returns counts."""
    rates = rates if rates is not None else load_rates(conn)
    seen = seen if seen is not None else set()
    conn.execute(REJECT_DDL)
    ensure_columns(conn, table)
    cols = (["Ticker", "Calendar Year"]
            + [c for c in EXCEL_COLUMNS if c not in ("Ticker", "Calendar Year")]
            + list(EXTRA_COLUMNS) + ["last_updated"])
    sql = _insert_sql(table, cols)
    now = datetime.now().isoformat()
    stats = {"loaded": 0, "blank": 0, "rejected": 0}
    batch, rejects = [], []
    for raw in rows:
        ticker = _text(raw.get("Ticker"))
        if not ticker:
            continue
        rec, reason = convert_row(raw, rates)
        if rec is None:
            if reason is None:
                stats["blank"] += 1
            else:
                stats["rejected"] += 1
                rejects.append((source, ticker, _text(raw.get("Date")),
                                _text(raw.get("Reported Currency")), reason))
            continue
        row_year = _fiscal_year(rec["Date"]) if annual else int(rec["Date"][:4])
        row_period = period or ("FY" if annual else rec.get("Period"))
        if not row_period or not is_valid_year_period(row_year, row_period):
            stats["rejected"] += 1
            rejects.append((source, ticker, rec["Date"], rec["Source Currency"],
                            f"invalid year/period {row_year}/{row_period}"))
            continue
        key = (ticker, row_year, row_period)
        if key in seen and annual:
            # A 52/53-week filer can end two fiscal years inside one calendar
            # year (2016-01-02 and 2016-12-31). The earlier period then belongs
            # to the year before, which is free precisely because of that. Move
            # the stored row back instead of dropping a whole fiscal year.
            #
            # A company that reported March years and then switched to
            # December has a whole run of earlier years sitting one key too
            # late (2009-03 on 2009, 2010-03 on 2010, then 2010-12 wants 2010).
            # So walk back to the first free year and shift the run by one.
            stored = conn.execute(
                f'SELECT Date FROM "{table}" WHERE Ticker = ? AND "Calendar Year" = ?',
                (ticker, row_year)).fetchone()
            free = row_year - 1
            while (ticker, free, row_period) in seen and row_year - free < 30:
                free -= 1
            if (stored and stored[0] and _days_between(stored[0], rec["Date"]) >= 60
                    and (ticker, free, row_period) not in seen
                    and is_valid_year_period(free, row_period)):
                # oldest first, so no step lands on an occupied key
                for y in range(free + 1, row_year + 1):
                    conn.execute(
                        f'UPDATE "{table}" SET "Calendar Year" = ? '
                        f'WHERE Ticker = ? AND "Calendar Year" = ?',
                        (y - 1, ticker, y))
                seen.add((ticker, free, row_period))
                seen.discard(key)
                stats["rekeyed"] = stats.get("rekeyed", 0) + 1
        if key in seen:
            stats["rejected"] += 1
            rejects.append((source, ticker, rec["Date"], rec["Source Currency"],
                            f"key {row_year}/{row_period} already loaded from an earlier tab"))
            continue
        seen.add(key)
        rec["Calendar Year"] = row_year
        rec["Period"] = row_period
        rec["last_updated"] = now
        batch.append([rec.get(c) for c in cols])
        stats["loaded"] += 1
    conn.executemany(sql, batch)
    conn.executemany(
        "INSERT INTO usd_ingest_rejects (source, ticker, date, currency, reason) "
        "VALUES (?,?,?,?,?)", rejects)
    return stats


# ── whole-warehouse load ─────────────────────────────────────────────────────

# ISO 3166 alpha-2 (what the workbook holds) -> the country name the rest of
# the code expects (`tickers.country` held yfinance names; `country_rates`
# resolves names). Codes not listed are stored as they are.
COUNTRY_NAMES = {
    "US": "United States", "CN": "China", "IN": "India", "JP": "Japan",
    "CA": "Canada", "AU": "Australia", "TW": "Taiwan", "HK": "Hong Kong",
    "GB": "United Kingdom", "KR": "South Korea", "ID": "Indonesia",
    "SE": "Sweden", "TH": "Thailand", "FR": "France", "IL": "Israel",
    "DE": "Germany", "SG": "Singapore", "BR": "Brazil", "SA": "Saudi Arabia",
    "PL": "Poland", "MY": "Malaysia", "IT": "Italy", "CH": "Switzerland",
    "NO": "Norway", "DK": "Denmark", "RU": "Russia", "ZA": "South Africa",
    "FI": "Finland", "ES": "Spain", "TR": "Turkey", "BE": "Belgium",
    "NL": "Netherlands", "MX": "Mexico", "NZ": "New Zealand", "GR": "Greece",
    "KY": "Cayman Islands", "IE": "Ireland", "AE": "United Arab Emirates",
    "BM": "Bermuda", "AT": "Austria", "LU": "Luxembourg", "PT": "Portugal",
    "CL": "Chile", "JE": "Jersey", "GG": "Guernsey", "QA": "Qatar",
    "CY": "Cyprus", "IS": "Iceland", "VG": "British Virgin Islands",
    "AR": "Argentina", "IM": "Isle of Man", "MO": "Macau", "KW": "Kuwait",
    "MT": "Malta", "CZ": "Czechia", "EG": "Egypt", "CO": "Colombia",
    "HU": "Hungary", "EE": "Estonia", "MU": "Mauritius", "PE": "Peru",
    "MC": "Monaco", "UA": "Ukraine", "GI": "Gibraltar", "RO": "Romania",
    "KZ": "Kazakhstan", "VN": "Vietnam", "PA": "Panama", "PH": "Philippines",
    "LV": "Latvia", "PG": "Papua New Guinea", "BS": "Bahamas", "BG": "Bulgaria",
    "UY": "Uruguay", "PR": "Puerto Rico", "LI": "Liechtenstein", "BH": "Bahrain",
    "LT": "Lithuania", "SI": "Slovenia", "NG": "Nigeria", "KH": "Cambodia",
    "MN": "Mongolia", "BB": "Barbados", "MM": "Myanmar", "ZM": "Zambia",
    "MA": "Morocco", "GE": "Georgia", "GA": "Gabon", "JO": "Jordan",
    "AZ": "Azerbaijan", "BD": "Bangladesh", "SK": "Slovakia",
    "DO": "Dominican Republic", "CR": "Costa Rica", "CW": "Curaçao",
    "MK": "North Macedonia", "LK": "Sri Lanka", "SN": "Senegal",
    "KG": "Kyrgyzstan", "BW": "Botswana", "MZ": "Mozambique", "NA": "Namibia",
}

ANNUAL_YEARS = range(2008, 2026)
QUARTER_TABS = ("24 Latest Q", "25 Q-1", "26 Q-2", "27 Q-3")
TTM_TAB = "23 TTM"

ALIAS_DDL = """
CREATE TABLE IF NOT EXISTS symbol_alias (
    alias          TEXT PRIMARY KEY,
    primary_symbol TEXT NOT NULL,
    reason         TEXT
)
"""


def _tab_path(staging: Path, year: int) -> Path:
    hits = sorted(staging.glob(f"?? {year}.csv"))
    if len(hits) != 1:
        raise FileNotFoundError(f"expected one staging file for {year}, found {hits}")
    return hits[0]


def kept_delisted(conn: sqlite3.Connection, universe: set[str]) -> list[str]:
    """Old-warehouse tickers that stay: delisted companies that are NOT in the
    new universe and whose every row is already USD (SEC-sourced, phase 3b).
    They are what keeps dead companies in the historical sector averages."""
    rows = conn.execute(
        """
        SELECT f.Ticker
        FROM financials f
        JOIN security_map s ON s.symbol = f.Ticker AND s.status = 'delisted'
        GROUP BY f.Ticker
        HAVING SUM(CASE WHEN f."Reported Currency" = 'USD' THEN 0 ELSE 1 END) = 0
        """).fetchall()
    return sorted(t for (t,) in rows if t not in universe)


def load_tickers(conn: sqlite3.Connection, rows: Iterable[dict],
                 keep: Iterable[str]) -> int:
    """Rebuild `tickers` from the Tickers_Clean tab. Beta and PEG of a ticker
    that survives are kept; every ticker outside the new universe and outside
    `keep` is removed."""
    now = datetime.now().isoformat()
    keep = set(keep)
    old = {t: (b, p) for t, b, p in conn.execute("SELECT ticker, beta, peg FROM tickers")}
    kept_rows = [r for r in conn.execute("SELECT * FROM tickers") if r[0] in keep]
    conn.execute("DELETE FROM tickers")
    n = 0
    for r in rows:
        t = _text(r.get("Ticker"))
        if not t:
            continue
        iso = (_text(r.get("Country")) or "").upper()
        beta, peg = old.get(t, (None, None))
        active = (_text(r.get("Actively Trading")) or "").lower() == "yes"
        conn.execute(
            "INSERT OR REPLACE INTO tickers (ticker, name, sector, industry, "
            "last_updated, exchange, country, beta, peg, status) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            (t, _text(r.get("Name")), _text(r.get("Sector")), _text(r.get("Industry")),
             now, _text(r.get("Exchange")), COUNTRY_NAMES.get(iso, iso or None),
             beta, peg, None if active else "delisted"))
        n += 1
    for row in kept_rows:
        conn.execute(
            f"INSERT OR IGNORE INTO tickers VALUES ({','.join('?' * len(row))})", row)
    return n


def load_aliases(conn: sqlite3.Connection, removed: Iterable[dict]) -> dict:
    """Send every removed ticker to the ticker the owner kept instead, and make
    the kept ticker the primary of its CIK group in `security_map`."""
    conn.execute(ALIAS_DDL)
    conn.execute("DELETE FROM symbol_alias")
    have = {t for (t,) in conn.execute("SELECT DISTINCT Ticker FROM financials")}
    n = 0
    for r in removed:
        alias, kept = _text(r.get("Ticker")), _text(r.get("Kept Instead"))
        if alias and kept and alias != kept and kept in have and alias not in have:
            conn.execute("INSERT OR REPLACE INTO symbol_alias VALUES (?,?,?)",
                         (alias.upper(), kept.upper(), _text(r.get("Removal Reason"))))
            n += 1
    # A CIK group whose primary has no rows any more but which has exactly one
    # member with rows: that member is the primary now (GOOG -> GOOGL).
    flipped = 0
    groups: dict[str, list[tuple[str, int]]] = {}
    for cik, sym, prim in conn.execute(
            "SELECT cik, symbol, is_primary FROM security_map "
            "WHERE cik IS NOT NULL AND cik != '0000000000'"):
        groups.setdefault(cik, []).append((sym, prim))
    for cik, members in groups.items():
        primaries = [s for s, p in members if p == 1]
        if any(s in have for s in primaries):
            continue
        with_rows = [s for s, _ in members if s in have]
        if len(with_rows) != 1:
            continue
        conn.execute("UPDATE security_map SET is_primary = 0 WHERE cik = ?", (cik,))
        conn.execute("UPDATE security_map SET is_primary = 1 WHERE cik = ? AND symbol = ?",
                     (cik, with_rows[0]))
        flipped += 1
    return {"aliases": n, "primaries_flipped": flipped}


# Columns that are built from the share price. When a row's market cap is
# impossible they are all wrong together, so they are cleared together.
PRICE_COLUMNS = (
    "Market Cap", "Enterprise Value", "PE Ratio", "Price To Sales Ratio",
    "POCF Ratio", "PFCF Ratio", "PB Ratio", "PTB Ratio", "EV To Sales",
    "Enterprise Value Over EBITDA", "EV To Operating Cash Flow",
    "EV To Free Cash Flow", "Earnings Yield", "Free Cash Flow Yield",
    "Dividend Yield",
)

QUARANTINE_DDL = """
CREATE TABLE IF NOT EXISTS usd_ingest_cap_quarantine (
    ticker     TEXT NOT NULL,
    year       INTEGER NOT NULL,
    period     TEXT NOT NULL,
    market_cap REAL,
    revenue    REAL,
    equity     REAL,
    reason     TEXT NOT NULL,
    PRIMARY KEY (ticker, year, period)
)
"""

# A cap at or above this is not a company: 10 trillion USD is twice the
# largest company that has ever existed.
_CAP_CEILING_USD = 1e13
# Below this a wrong cap cannot move a sector average, so it is left alone.
_CAP_FLOOR_USD = 1e10
_CAP_MULTIPLE = 200.0

# Mirrors `cap_check.is_impossible` (a test compares the two): at least 10
# billion AND more than 200x BOTH revenue and book equity. A missing one
# counts as failing; both missing means nothing can be judged.
_IMPOSSIBLE_CAP_SQL = f"""
    "Market Cap" >= {_CAP_CEILING_USD}
    OR ("Market Cap" >= {_CAP_FLOOR_USD}
        AND (Revenue IS NOT NULL OR "Total Stockholders Equity" IS NOT NULL)
        AND (Revenue IS NULL OR "Market Cap" > {_CAP_MULTIPLE} * ABS(Revenue))
        AND ("Total Stockholders Equity" IS NULL
             OR "Market Cap" > {_CAP_MULTIPLE} * ABS("Total Stockholders Equity")))
"""


def quarantine_impossible_caps(conn: sqlite3.Connection,
                               table: str = "financials") -> int:
    """Clear the price-built columns of the rows of `table` (`financials` or
    `financials_quarterly`) whose market cap cannot be real, and keep the
    cleared cap in `usd_ingest_cap_quarantine`.

    The workbook's vendor carries corporate-action artefacts: 9078.T (a small
    Japanese haulier) at 84 TRILLION dollars, SPAC shells at 3 trillion. The
    statements of those rows are fine, so only the price side is cleared. The
    rule is deliberately narrow: at least 10 billion dollars AND more than
    200 times BOTH revenue and book equity, or at/above the 10-trillion
    ceiling. A real company fails at most one of the two multiples."""
    if table not in ("financials", "financials_quarterly"):
        raise ValueError(table)
    conn.execute(QUARANTINE_DDL)
    conn.execute(f"""
        INSERT OR REPLACE INTO usd_ingest_cap_quarantine
        SELECT Ticker, "Calendar Year", COALESCE(Period, 'FY'), "Market Cap",
               Revenue, "Total Stockholders Equity",
               CASE WHEN "Market Cap" >= {_CAP_CEILING_USD}
                    THEN 'cap at or above 10 trillion USD'
                    ELSE 'cap over 200x revenue and 200x book equity' END
        FROM "{table}" WHERE {_IMPOSSIBLE_CAP_SQL}""")
    sets = ", ".join(f'"{c}" = NULL' for c in PRICE_COLUMNS)
    cur = conn.execute(f'UPDATE "{table}" SET {sets} WHERE {_IMPOSSIBLE_CAP_SQL}')
    return cur.rowcount


# ── one company, one ticker ──────────────────────────────────────────────────

DUPLICATE_DDL = """
CREATE TABLE IF NOT EXISTS duplicate_listing_audit (
    ticker       TEXT PRIMARY KEY,
    kept         TEXT NOT NULL,
    same_company INTEGER NOT NULL,   -- 1: a second listing; 0: another company's data
    years_equal  INTEGER NOT NULL,
    rows_removed INTEGER NOT NULL
)
"""

_DUP_FROM_YEAR = 2018
_DUP_MIN_YEARS = 3


def _suffix(ticker: str) -> str:
    return ticker.rsplit(".", 1)[1].upper() if "." in ticker else ""


def _name_key(name: Optional[str]) -> str:
    """First word of a company name, lower-case letters and digits only."""
    words = "".join(ch.lower() if ch.isalnum() else " " for ch in (name or "")).split()
    return words[0] if words else ""


def find_duplicate_listings(conn: sqlite3.Connection) -> list[dict]:
    """Tickers that carry the SAME statements as another ticker in at least
    three fiscal years since 2018 (period end, revenue, net income and total
    assets all equal). Each entry: {'ticker', 'kept', 'same_company', 'years'}.

    Two cases look alike and are told apart by the company name and the cap:
    * a second listing of one company (XONA.DE is Exxon Mobil's Frankfurt
      line): it counts the company twice in every sector total;
    * a ticker the vendor filled with ANOTHER company's statements (a small
      London company carrying RELX's figures): its rows are simply wrong.
    Either way the rows go. Only the first case becomes an alias.

    The kept ticker is, in order: the home listing (exchange country = company
    country), the larger company by order of magnitude of market cap, an
    actively trading one, the one with more years, the one without an exchange
    suffix, then alphabetical."""
    sig: dict[tuple, list[str]] = {}
    for t, d, r, n, a in conn.execute(
            'SELECT Ticker, Date, Revenue, "Net Income", "Total Assets" FROM financials '
            'WHERE "Calendar Year" >= ? AND Revenue > 0 AND "Total Assets" > 0 '
            'AND "Net Income" IS NOT NULL AND Date IS NOT NULL', (_DUP_FROM_YEAR,)):
        sig.setdefault((d, round(r, -2), round(n, -2), round(a, -2)), []).append(t)
    pair_years: dict[tuple[str, str], int] = {}
    for tickers in sig.values():
        if 2 <= len(tickers) <= 8:
            ts = sorted(set(tickers))
            for i in range(len(ts)):
                for j in range(i + 1, len(ts)):
                    pair_years[(ts[i], ts[j])] = pair_years.get((ts[i], ts[j]), 0) + 1
    pairs = {p: n for p, n in pair_years.items() if n >= _DUP_MIN_YEARS}

    parent: dict[str, str] = {}

    def find(x: str) -> str:
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for a, b in pairs:
        parent[find(a)] = find(b)
    groups: dict[str, set[str]] = {}
    for a, b in pairs:
        groups.setdefault(find(a), set()).update((a, b))

    info = {t: (name, country, status) for t, name, country, status in conn.execute(
        "SELECT ticker, name, country, status FROM tickers")}
    # the home country of an exchange suffix = the country most of its tickers have
    votes: dict[str, dict[str, int]] = {}
    for t, (_n, country, _s) in info.items():
        if country:
            v = votes.setdefault(_suffix(t), {})
            v[country] = v.get(country, 0) + 1
    home = {sfx: max(v, key=v.get) for sfx, v in votes.items()}
    n_rows = dict(conn.execute("SELECT Ticker, COUNT(*) FROM financials GROUP BY 1"))
    # Size bucket (order of magnitude of the latest cap). When a small company
    # carries a large company's statements, the large one is the real owner.
    # Two listings of one company land in the same bucket, so this does not
    # decide between them.
    import math
    top_cap = dict(conn.execute(
        'SELECT Ticker, MAX("Market Cap") FROM financials '
        'WHERE "Calendar Year" >= ? GROUP BY 1', (_DUP_FROM_YEAR,)))
    size = {t: (int(math.log10(c)) if c and c > 0 else 0) for t, c in top_cap.items()}

    def same_company(a: str, b: str) -> bool:
        """One company under two tickers: the names agree, OR the two carry
        the same market cap as well as the same statements. The second test is
        what recognises a renamed company (II-VI -> Coherent, 888 Holdings ->
        Evoke, a SPAC -> the business it bought): the vendor serves one
        listing's data under both symbols, price side included. A ticker that
        was filled with ANOTHER company's statements keeps its own price, so
        its cap differs."""
        na, nb = _name_key(info.get(a, ("",))[0]), _name_key(info.get(b, ("",))[0])
        if na and nb and (na == nb or (len(na) >= 4 and nb.startswith(na))
                          or (len(nb) >= 4 and na.startswith(nb))):
            return True
        ca, cb = top_cap.get(a), top_cap.get(b)
        return bool(ca and cb and ca > 0 and cb > 0 and 0.8 <= ca / cb <= 1.25)

    def rank(t: str) -> tuple:
        name, country, status = info.get(t, (None, None, None))
        return (
            0 if (country and home.get(_suffix(t)) == country) else 1,
            -size.get(t, 0),
            0 if status is None else 1,
            -n_rows.get(t, 0),
            0 if "." not in t else 1,
            t,
        )

    out = []
    for members in groups.values():
        kept = min(members, key=rank)
        for t in sorted(members - {kept}):
            # Only a member that matches the KEPT ticker itself is its copy.
            # A~B and B~C does not make C a copy of A.
            years = pairs.get(tuple(sorted((t, kept))), 0)
            if years < _DUP_MIN_YEARS:
                continue
            out.append({"ticker": t, "kept": kept, "years": years,
                        "same_company": same_company(t, kept)})
    return sorted(out, key=lambda d: d["ticker"])


# The statement signature two rows must share to be the same fiscal year of
# the same statements (rounded like `find_duplicate_listings` does).
_SAME_ROW_SQL = """
    k.Date = f.Date
    AND ROUND(k.Revenue, -2) = ROUND(f.Revenue, -2)
    AND ROUND(k."Net Income", -2) = ROUND(f."Net Income", -2)
    AND ROUND(k."Total Assets", -2) = ROUND(f."Total Assets", -2)
"""


def remove_duplicate_listings(conn: sqlite3.Connection) -> dict:
    """Apply `find_duplicate_listings`. A second symbol of ONE company loses
    all its rows and becomes an alias of the kept symbol, which holds the
    history. A symbol that carries ANOTHER company's statements loses only the
    copied rows; its own rows stay and it gets no alias."""
    conn.execute(DUPLICATE_DDL)
    conn.execute(ALIAS_DDL)
    found = find_duplicate_listings(conn)
    aliases = wrong = 0
    for d in found:
        if d["same_company"]:
            # one company under two symbols: the kept symbol holds its history
            n = conn.execute("DELETE FROM financials WHERE Ticker = ?",
                             (d["ticker"],)).rowcount
            conn.execute("DELETE FROM financials_quarterly WHERE Ticker = ?", (d["ticker"],))
        else:
            # ANOTHER company's statements under this symbol: only the rows
            # that are copies go. Every other row is this company's own
            # history and stays ("never delete a company").
            n = conn.execute(
                f"""DELETE FROM financials AS f WHERE f.Ticker = ? AND EXISTS (
                        SELECT 1 FROM financials k WHERE k.Ticker = ? AND {_SAME_ROW_SQL})""",
                (d["ticker"], d["kept"])).rowcount
        conn.execute("INSERT OR REPLACE INTO duplicate_listing_audit VALUES (?,?,?,?,?)",
                     (d["ticker"], d["kept"], int(d["same_company"]), d["years"], n))
        if d["same_company"]:
            conn.execute("INSERT OR REPLACE INTO symbol_alias VALUES (?,?,?)",
                         (d["ticker"].upper(), d["kept"].upper(), "Second listing"))
            conn.execute("DELETE FROM tickers WHERE ticker = ?", (d["ticker"],))
            # an alias must never point at a ticker that is itself an alias
            conn.execute("UPDATE symbol_alias SET primary_symbol = ? WHERE primary_symbol = ?",
                         (d["kept"].upper(), d["ticker"].upper()))
            aliases += 1
        else:
            wrong += 1
    # An alias whose target has no rows any more (the target was itself
    # removed without an alias) would send a search to an empty page.
    have = {t.upper() for (t,) in conn.execute("SELECT DISTINCT Ticker FROM financials")}
    orphans = [(a,) for a, p in conn.execute(
        "SELECT alias, primary_symbol FROM symbol_alias") if p not in have]
    conn.executemany("DELETE FROM symbol_alias WHERE alias = ?", orphans)
    return {"duplicates": len(found), "second_listings": aliases, "wrong_company_data": wrong}


def run(db_path: str, staging_dir: str) -> dict:
    """Replace the warehouse content of `db_path` (a COPY, never the live file)
    with the USD-converted workbook. One transaction: a failure leaves the
    copy as it was."""
    if Path(db_path).resolve().name.lower() == "financials.db":
        raise ValueError("refusing the live financials.db: load a copy, then swap")
    staging = Path(staging_dir)
    conn = sqlite3.connect(db_path, timeout=120)
    report: dict = {"annual": {}, "quarterly": {}}
    seen: set = set()
    try:
        rates = load_rates(conn)
        tick_rows = list(read_tab(next(staging.glob("?? Tickers_Clean.csv"))))
        universe = {r["Ticker"].strip() for r in tick_rows if r.get("Ticker")}
        keep = kept_delisted(conn, universe)
        report["kept_delisted"] = len(keep)

        for table in ("financials", "financials_quarterly"):
            ensure_columns(conn, table)
        conn.execute("DROP TABLE IF EXISTS usd_ingest_rejects")
        conn.execute("DROP TABLE IF EXISTS usd_ingest_cap_quarantine")
        conn.execute("CREATE TEMP TABLE _keep (t TEXT PRIMARY KEY)")
        conn.executemany("INSERT INTO _keep VALUES (?)", [(t,) for t in keep])
        conn.execute("DELETE FROM financials WHERE Ticker NOT IN (SELECT t FROM _keep)")
        conn.execute("UPDATE financials SET \"Source Currency\" = 'USD', \"FX Rate\" = 1.0")
        conn.execute("DELETE FROM financials_quarterly")

        for year in ANNUAL_YEARS:
            path = _tab_path(staging, year)
            report["annual"][year] = load_tab(
                conn, read_tab(path), source=str(year), table="financials",
                annual=True, rates=rates, seen=seen)
            print(f"  {year}: {report['annual'][year]}", flush=True)

        for stem in QUARTER_TABS:
            report["quarterly"][stem] = load_tab(
                conn, read_tab(staging / f"{stem}.csv"), source=stem,
                table="financials_quarterly", rates=rates, seen=seen)
            print(f"  {stem}: {report['quarterly'][stem]}", flush=True)
        report["quarterly"][TTM_TAB] = load_tab(
            conn, read_tab(staging / f"{TTM_TAB}.csv"), source=TTM_TAB,
            table="financials_quarterly", period="TTM", rates=rates, seen=seen)
        print(f"  TTM: {report['quarterly'][TTM_TAB]}", flush=True)

        report["caps_quarantined"] = (
            quarantine_impossible_caps(conn, "financials")
            + quarantine_impossible_caps(conn, "financials_quarterly"))
        report["tickers"] = load_tickers(conn, tick_rows, keep)
        report.update(load_aliases(
            conn, read_tab(next(staging.glob("?? Removed.csv")))))
        conn.execute(
            "INSERT INTO job_runs(job, last_run) VALUES('usd_ingest', datetime('now')) "
            "ON CONFLICT(job) DO UPDATE SET last_run=excluded.last_run")
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    return report


if __name__ == "__main__":
    import json
    import sys

    if len(sys.argv) != 3 or Path(sys.argv[1]).name.lower() == "financials.db":
        sys.exit("usage: python -m data.usd_ingest <COPY of the db> <staging csv dir>\n"
                 "       (refuses the live financials.db: load a copy, then swap)")
    print(json.dumps(run(sys.argv[1], sys.argv[2]), indent=1))
