"""Economy connection: latest macro values from market_data.db.

Implements the economy and credit blocks of the connections bundle.
Reads from the ``macro_series`` table (see ``backend/marketdata/schema.py``
for column names: series_id, date, value).

Both builders take no arguments and read six daily FRED series that move at
most once a day, yet they were rebuilt (two connections, twelve queries) on
every per-ticker connections request. A ten-minute cache keyed on nothing
serves them from memory, and one connection answers both. The marketdata
scheduler's "econ" invalidation clears it, so a fresh macro print is never
held back by the TTL.
"""

from __future__ import annotations

import os
import sqlite3
from datetime import date
from typing import Any, Optional

from connections._ttl_cache import TtlLruCache
from side_caches import register_side_cache

# Ten minutes. The series are daily; the cache exists to stop one page view
# of ten companies paying for twelve identical queries.
_ECONOMY_TTL_SECONDS = 10 * 60

# Two entries, one per block. Keyed on the constant block name because
# neither builder takes an argument.
_macro_cache = TtlLruCache(2, ttl=_ECONOMY_TTL_SECONDS)


_MARKET_DATA_DB = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "market_data.db"
)

_SERIES_IDS = (
    "DGS10",           # 10-year Treasury yield
    "DGS1",            # 1-year Treasury yield
    "T10YIE",          # 10-year breakeven inflation
    "BAMLH0A0HYM2",   # high-yield spread
    "BAMLC0A0CM",      # investment-grade spread
    "BAA10Y",          # BAA spread
)


def _get_market_db_path() -> str:
    return os.environ.get("MARKET_DATA_DB", _MARKET_DATA_DB)


# A daily FRED series that has not printed in this many days is stale: the
# figure is nulled rather than shown as current (finding H1).
_STALE_AFTER_DAYS = 45

_NULL_ENTRY = {
    "value": None,
    "change12m": None,
    "asOf": None,
    "priorDate": None,
    "priorValue": None,
    "stale": False,
    "reason": None,
}


def _empty_entry(reason: Optional[str] = None) -> dict[str, Any]:
    entry = dict(_NULL_ENTRY)
    entry["reason"] = reason
    return entry


def _latest_and_prior(
    conn: sqlite3.Connection,
    series_id: str,
    *,
    today: Optional[date] = None,
    stale_after_days: int = _STALE_AFTER_DAYS,
) -> dict[str, Any]:
    """Latest value and the value twelve months earlier for a macro series.

    Finding H1: the prior observation is the last one dated on or before
    the latest date minus twelve months. Taking the 365th most recent ROW
    reached back about 17.5 months on a daily series (roughly 252 prints a
    year), which put the wrong sign on the ten-year breakeven's change.

    ``change12m`` is null when the series does not reach back a year. When
    the latest observation is older than ``stale_after_days`` the whole
    entry is nulled and ``reason`` says why.

    Returns {value, change12m, asOf, priorDate, priorValue, stale, reason}.
    """
    latest = conn.execute(
        "SELECT date, value FROM macro_series"
        " WHERE series_id = ? AND value IS NOT NULL"
        " ORDER BY date DESC LIMIT 1",
        (series_id,),
    ).fetchone()
    if latest is None:
        return _empty_entry(f"No observations stored for {series_id}.")

    latest_date = str(latest["date"])
    latest_val = float(latest["value"])

    age_days: Optional[int] = None
    try:
        obs_date = date.fromisoformat(latest_date[:10])
        age_days = ((today or date.today()) - obs_date).days
    except ValueError:
        age_days = None

    if age_days is not None and age_days > stale_after_days:
        entry = _empty_entry(
            f"The latest {series_id} observation is dated {latest_date}, "
            f"{age_days} days old; anything past {stale_after_days} days is "
            "not current, so the figure is withheld."
        )
        entry["asOf"] = latest_date
        entry["stale"] = True
        return entry

    prior = conn.execute(
        "SELECT date, value FROM macro_series"
        " WHERE series_id = ? AND value IS NOT NULL"
        " AND date <= date(?, '-12 months')"
        " ORDER BY date DESC LIMIT 1",
        (series_id, latest_date),
    ).fetchone()

    change: Optional[float] = None
    prior_date: Optional[str] = None
    prior_val: Optional[float] = None
    reason: Optional[str] = None
    if prior is None:
        reason = (
            f"{series_id} does not reach back twelve months before "
            f"{latest_date}, so the change is not computed."
        )
    else:
        prior_date = str(prior["date"])
        prior_val = round(float(prior["value"]), 4)
        change = round(latest_val - float(prior["value"]), 4)

    return {
        "value": round(latest_val, 4),
        "change12m": change,
        "asOf": latest_date,
        "priorDate": prior_date,
        "priorValue": prior_val,
        "stale": False,
        "reason": reason,
    }


def _spread_entry(d: dict[str, Any]) -> dict[str, Any]:
    return {
        "value": d.get("value"),
        "change12m": d.get("change12m"),
        "asOf": d.get("asOf"),
        "priorDate": d.get("priorDate"),
        "priorValue": d.get("priorValue"),
        "stale": d.get("stale", False),
        "reason": d.get("reason"),
    }


def _economy_null(reason: str) -> dict[str, Any]:
    return {
        "tenYearYield": _empty_entry(reason),
        "oneYearYield": _empty_entry(reason),
        "curveSlope": None,
        "breakeven10y": _empty_entry(reason),
    }


def _credit_null(reason: str) -> dict[str, Any]:
    entry = _spread_entry(_empty_entry(reason))
    return {
        "highYieldSpread": dict(entry),
        "investmentGradeSpread": dict(entry),
        "baaSpread": dict(entry),
    }


def _build_macro_blocks() -> dict[str, dict[str, Any]]:
    """Both blocks off ONE read-only connection.

    Returns ``{"economy": ..., "credit": ...}``. Every failure path answers
    with the same all-null shape and a reason, so the caller never has to
    tell an outage from a genuine gap.
    """
    db_path = _get_market_db_path()

    if not os.path.exists(db_path):
        reason = "market_data.db is not present on this machine."
        return {"economy": _economy_null(reason), "credit": _credit_null(reason)}

    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        tables = {r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()}
        if "macro_series" not in tables:
            reason = "market_data.db has no macro_series table."
            return {"economy": _economy_null(reason), "credit": _credit_null(reason)}

        ten_yr = _latest_and_prior(conn, "DGS10")
        one_yr = _latest_and_prior(conn, "DGS1")
        breakeven = _latest_and_prior(conn, "T10YIE")

        curve_slope: Optional[float] = None
        if ten_yr["value"] is not None and one_yr["value"] is not None:
            curve_slope = round(ten_yr["value"] - one_yr["value"], 4)

        return {
            "economy": {
                "tenYearYield": ten_yr,
                "oneYearYield": one_yr,
                "curveSlope": curve_slope,
                "breakeven10y": breakeven,
            },
            "credit": {
                "highYieldSpread": _spread_entry(_latest_and_prior(conn, "BAMLH0A0HYM2")),
                "investmentGradeSpread": _spread_entry(_latest_and_prior(conn, "BAMLC0A0CM")),
                "baaSpread": _spread_entry(_latest_and_prior(conn, "BAA10Y")),
            },
        }
    finally:
        conn.close()


def _macro_blocks() -> dict[str, dict[str, Any]]:
    return _macro_cache.get_or_build("macro", _build_macro_blocks)


def build_economy_block() -> dict[str, Any]:
    """The economy connection block.

    Returns {tenYearYield, oneYearYield, curveSlope, breakeven10y}, or a
    block with all-null values when market_data.db is unavailable.
    """
    return _macro_blocks()["economy"]


def build_credit_block() -> dict[str, Any]:
    """The credit connection block.

    Returns {highYieldSpread, investmentGradeSpread, baaSpread}.
    """
    return _macro_blocks()["credit"]


def clear_economy_cache() -> None:
    """Drop the cached macro blocks (cache clear / fresh macro print)."""
    _macro_cache.clear()


# "econ" as well as "" and "db": the marketdata scheduler invalidates with
# "econ" when a fresh aggregate lands, and these figures come out of
# market_data.db.
register_side_cache(
    ("", "db", "econ"), clear_economy_cache, name="connections.economy",
)
