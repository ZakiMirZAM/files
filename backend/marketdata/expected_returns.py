"""Forward expected-return building blocks (Ilmanen, *Expected Returns*).

The classic four-term decomposition of what the S&P 500 offers from today's
price, over a ten-year horizon:

    E[r, nominal] = dividend yield + real earnings growth + expected inflation
                    + valuation change

Each term comes from data the marketdata layer already stores:

  * dividend yield      — Shiller monthly dividend / index level
  * real earnings growth — trailing 10-year CAGR of Shiller real earnings
                           (index-level, so past buybacks are already inside it;
                           adding a separate buyback term would double count)
  * expected inflation  — FRED T10YIE, the 10-year breakeven rate
  * valuation change    — CAPE drifting back to its 30-YEAR median over the
                          horizon: (anchor / current)^(1/10) − 1, clamped to
                          ±4% a year for display sanity. The full-history median
                          (back to 1881) is shown only as a "conservative"
                          secondary reading; treating it as the headline would
                          hard-code a permanent drag from a different accounting
                          and rate regime.

A missing term stays None and the sum is flagged partial — the app never
substitutes a guess for a live number.
"""

from __future__ import annotations

import sqlite3
from statistics import median
from typing import Optional

from .fred_client import read_series
from .shiller_data import ShillerData, ShillerRow, read_stored, _month_index

HORIZON_YEARS = 10
ANCHOR_WINDOW_MONTHS = 30 * 12   # 30-year median CAPE anchor
VALUATION_CLAMP = 0.04           # ±4%/yr display clamp on the reversion term


def _median_cape(rows: list[ShillerRow], window: Optional[int]) -> Optional[float]:
    """Median CAPE over the trailing ``window`` months (None = full history)."""
    capes = [r.cape for r in rows if r.cape is not None and r.cape > 0]
    if not capes:
        return None
    if window is not None:
        capes = capes[-window:]
    if len(capes) < 60:  # under five years of observations is not an anchor
        return None
    return median(capes)


def _valuation_change(current: Optional[float], anchor: Optional[float]) -> Optional[float]:
    """Annualised price drift if CAPE reverts to ``anchor`` over the horizon."""
    if current is None or current <= 0 or anchor is None or anchor <= 0:
        return None
    raw = (anchor / current) ** (1.0 / HORIZON_YEARS) - 1.0
    return max(-VALUATION_CLAMP, min(VALUATION_CLAMP, raw))


def _dividend_yield(rows: list[ShillerRow]) -> Optional[float]:
    latest = ShillerData.latest_complete(rows)
    if latest is None or not latest.sp500 or not latest.dividend:
        return None
    if latest.sp500 <= 0 or latest.dividend <= 0:
        return None
    return latest.dividend / latest.sp500


def _breakeven_inflation(conn: sqlite3.Connection) -> Optional[float]:
    obs = read_series(conn, "T10YIE")
    if not obs:
        return None
    v = obs[-1].value
    if v is None or not (0 < v < 10):
        return None
    return v / 100.0


def compute_expected_return(conn: sqlite3.Connection) -> Optional[dict]:
    """The latest four-term decomposition. Returns None only when the Shiller
    store is empty; otherwise a dict with each term (None when unavailable),
    the nominal total, and a ``partial`` flag."""
    rows = read_stored(conn)
    if not rows:
        return None

    dp = _dividend_yield(rows)
    g_real = ShillerData.real_earnings_cagr(rows, years=HORIZON_YEARS)
    infl = _breakeven_inflation(conn)
    cape = ShillerData.latest_cape(rows)
    anchor_30y = _median_cape(rows, ANCHOR_WINDOW_MONTHS)
    anchor_full = _median_cape(rows, None)
    dval = _valuation_change(cape, anchor_30y)
    dval_conservative = _valuation_change(cape, anchor_full)

    terms = [dp, g_real, infl, dval]
    available = [t for t in terms if t is not None]
    partial = len(available) < len(terms)
    total = sum(available) if available else None
    total_conservative = None
    if not partial and dval_conservative is not None:
        total_conservative = dp + g_real + infl + dval_conservative

    return {
        "dividendYield": round(dp, 4) if dp is not None else None,
        "realEarningsGrowth": round(g_real, 4) if g_real is not None else None,
        "expectedInflation": round(infl, 4) if infl is not None else None,
        "valuationChange": round(dval, 4) if dval is not None else None,
        "currentCape": round(cape, 2) if cape is not None else None,
        "anchorCape30y": round(anchor_30y, 2) if anchor_30y is not None else None,
        "anchorCapeFull": round(anchor_full, 2) if anchor_full is not None else None,
        "expectedReturnNominal": round(total, 4) if total is not None else None,
        "expectedReturnConservative": round(total_conservative, 4) if total_conservative is not None else None,
        "partial": partial,
        "horizonYears": HORIZON_YEARS,
    }


def expected_return_series(conn: sqlite3.Connection) -> list[tuple[str, float]]:
    """Year-end history of the four-term total, for the chart. Only years where
    every term exists make the series (breakeven inflation starts in 2003, so
    the line begins around 2004)."""
    rows = read_stored(conn)
    if not rows:
        return []
    # Month-end breakeven readings keyed by YYYY-MM.
    infl_by_month: dict[str, float] = {}
    for obs in read_series(conn, "T10YIE"):
        if obs.value is not None and 0 < obs.value < 10:
            infl_by_month[obs.date[:7]] = obs.value / 100.0

    out: list[tuple[str, float]] = []
    for i, r in enumerate(rows):
        if not r.date.startswith(tuple(str(y) for y in range(1990, 2100))):
            continue
        if r.date[5:7] != "12":
            continue
        upto = rows[: i + 1]
        dp = _dividend_yield(upto)
        g_real = ShillerData.real_earnings_cagr(upto, years=HORIZON_YEARS)
        infl = infl_by_month.get(r.date[:7])
        cape = r.cape if (r.cape is not None and r.cape > 0) else None
        dval = _valuation_change(cape, _median_cape(upto, ANCHOR_WINDOW_MONTHS))
        if None in (dp, g_real, infl, dval):
            continue
        out.append((r.date, round(dp + g_real + infl + dval, 4)))
    return out
