"""
marketdata/fred_client.py  (trimmed from valuation_debug/data_sources/fred_client.py)

A small, reusable FRED client: cached, persistable observations stored to the
``macro_series`` table. The catalog is trimmed to exactly the series the
IntrinsicEd app's ported metrics need:

  * Treasury yields used as risk-free inputs (DGS1, DGS10),
  * 10-year breakeven inflation (T10YIE) for the implied-ERP growth input,
  * Economic Policy Uncertainty — US daily (USEPUINDXD) and global (GEPUCURRENT).

The default API key matches the one already embedded in ``backend/api.py`` so the
client works "for free" out of the box; set ``FRED_API_KEY`` to override.
"""

from __future__ import annotations

import datetime as _dt
import json
import os
import sqlite3
from dataclasses import dataclass

from .http_cache import cached_download
from .schema import ensure_external_schema

# Key comes from the environment only; FRED fetches fail soft when unset.
DEFAULT_FRED_API_KEY = os.environ.get("FRED_API_KEY", "")
_FRED_BASE = "https://api.stlouisfed.org/fred/series/observations"


@dataclass(frozen=True)
class Obs:
    """One observation: an ISO date string and a float value."""

    date: str
    value: float


# ── Series catalog (trimmed) ──────────────────────────────────────────────────
# group -> list of (series_id, human label, unit). IDs verified against FRED.
FRED_CATALOG: dict[str, list[tuple[str, str, str]]] = {
    "treasury_par_yields": [
        ("DGS1", "1-Year Treasury", "%"),
        ("DGS10", "10-Year Treasury", "%"),
    ],
    "breakeven_inflation": [
        ("T10YIE", "10-Year Breakeven Inflation", "%"),
    ],
    "psychology": [
        ("USEPUINDXD", "Economic Policy Uncertainty (US, daily)", "index"),
        ("GEPUCURRENT", "Global Economic Policy Uncertainty (current GDP weights)", "index"),
    ],
    # The economy's own pace — the live ceiling on any perpetual growth
    # assumption (Damodaran Ch.12: stable growth cannot outrun the economy,
    # with the risk-free rate as its proxy). Stored as the LEVEL series; every
    # consumer derives the same trailing year-over-year rate from it, so there
    # is exactly one definition of "nominal GDP growth" in the app (api.py's
    # get_nominal_gdp_growth is the request-path twin of the same computation).
    "national_accounts": [
        ("GDP", "Nominal GDP (quarterly level)", "$B"),
    ],
    # Corporate credit risk premia. The two ICE BofA option-adjusted spreads are
    # the market's live compensation for default risk over Treasuries, and the
    # Baa minus 10-Year Treasury series is the long-run investment-grade version
    # of the same idea.
    "credit_spreads": [
        ("BAMLH0A0HYM2", "High-Yield OAS", "%"),
        ("BAMLC0A0CM", "Investment-Grade OAS", "%"),
        ("BAA10Y", "Baa minus 10Y Treasury", "%"),
    ],
}


def catalog_series_ids(groups: list[str] | None = None) -> list[str]:
    """Flatten the catalog (optionally restricted to ``groups``) to series IDs."""
    use = groups or list(FRED_CATALOG)
    out: list[str] = []
    for g in use:
        out.extend(sid for sid, _, _ in FRED_CATALOG.get(g, []))
    return out


def _series_meta(series_id: str) -> tuple[str, str]:
    """Return (label, unit) for a catalog series, or (series_id, '') if unknown."""
    for entries in FRED_CATALOG.values():
        for sid, label, unit in entries:
            if sid == series_id:
                return label, unit
    return series_id, ""


class FredClient:
    """Cached, persistable FRED observation fetcher."""

    def __init__(
        self,
        api_key: str | None = None,
        *,
        cache_dir: str | os.PathLike[str] | None = None,
    ) -> None:
        self.api_key = api_key or DEFAULT_FRED_API_KEY
        self.cache_dir = cache_dir

    # ── fetch ─────────────────────────────────────────────────────────────────
    def _url(self, series_id: str, start: str, end: str) -> str:
        return (
            f"{_FRED_BASE}?series_id={series_id}"
            f"&api_key={self.api_key}&file_type=json"
            f"&observation_start={start}&observation_end={end}"
        )

    def fetch_series(
        self,
        series_id: str,
        start_date: str = "1990-01-01",
        end_date: str | None = None,
        *,
        max_age_days: float = 1.0,
        force: bool = False,
    ) -> list[Obs]:
        """Fetch one FRED series as a list of :class:`Obs`, skipping missing
        ('.') values. Cached by series id with 1-day freshness by default."""
        end_date = end_date or _dt.date.today().isoformat()
        url = self._url(series_id, start_date, end_date)
        result = cached_download(
            url,
            f"fred_{series_id}.json",
            cache_dir=self.cache_dir,
            max_age_days=max_age_days,
            force=force,
        )
        if result.data is None:
            return []
        try:
            payload = json.loads(result.data)
        except (json.JSONDecodeError, ValueError):
            return []
        out: list[Obs] = []
        for o in payload.get("observations", []):
            raw = o.get("value")
            if raw is None or raw == ".":
                continue
            try:
                out.append(Obs(o["date"], float(raw)))
            except (TypeError, ValueError):
                continue
        return out

    def latest(self, series_id: str, **kwargs: object) -> tuple[str | None, float | None]:
        """Most recent (date, value) for a series, or (None, None)."""
        obs = self.fetch_series(series_id, **kwargs)  # type: ignore[arg-type]
        if not obs:
            return None, None
        last = obs[-1]
        return last.date, last.value

    # ── persistence ─────────────────────────────────────────────────────────────
    @staticmethod
    def store_series(
        conn: sqlite3.Connection,
        series_id: str,
        obs: list[Obs],
        *,
        label: str | None = None,
        unit: str | None = None,
        source: str = "FRED",
    ) -> int:
        """Upsert ``obs`` into ``macro_series``. Returns rows written."""
        if not obs:
            return 0
        ensure_external_schema(conn)
        if label is None or unit is None:
            cat_label, cat_unit = _series_meta(series_id)
            label = label or cat_label
            unit = unit or cat_unit
        now = _dt.datetime.now().isoformat(timespec="seconds")
        conn.executemany(
            """
            INSERT INTO macro_series (series_id, date, value, source, label, unit, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(series_id, date) DO UPDATE SET
                value = excluded.value,
                source = excluded.source,
                label = excluded.label,
                unit = excluded.unit,
                fetched_at = excluded.fetched_at
            """,
            [(series_id, o.date, o.value, source, label, unit, now) for o in obs],
        )
        conn.commit()
        return len(obs)

    def refresh_catalog(
        self,
        conn: sqlite3.Connection,
        *,
        groups: list[str] | None = None,
        start_date: str = "1990-01-01",
        force: bool = False,
    ) -> dict[str, int]:
        """Fetch and persist every catalog series (optionally restricted to
        ``groups``). Returns {series_id: rows_written}. Never raises on a single
        series failure — a missing feed yields 0 rows for that id."""
        results: dict[str, int] = {}
        for series_id in catalog_series_ids(groups):
            try:
                obs = self.fetch_series(series_id, start_date, force=force)
                results[series_id] = self.store_series(conn, series_id, obs)
            except Exception:  # noqa: BLE001 — one bad series must not abort the rest
                results[series_id] = 0
        return results


def read_series(conn: sqlite3.Connection, series_id: str) -> list[Obs]:
    """Read a stored series back out of ``macro_series`` (ascending by date)."""
    try:
        rows = conn.execute(
            "SELECT date, value FROM macro_series WHERE series_id = ? ORDER BY date",
            [series_id],
        ).fetchall()
    except sqlite3.OperationalError:
        return []
    return [Obs(r[0], float(r[1])) for r in rows]
