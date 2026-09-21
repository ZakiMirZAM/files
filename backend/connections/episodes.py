"""Historical episodes: revenue shocks and margin recovery (Rule A item 13).

Revenue change FY2019 to FY2020 and gross margin for FY2020-2023,
for a company, its industry median, and its sector median.
"""

from __future__ import annotations

import sqlite3
import statistics
from typing import Any, Optional

from connections._helpers import _safe_float


def _revenue_change_2020(
    conn: sqlite3.Connection,
    ticker: str,
) -> Optional[float]:
    """Revenue change from FY2019 to FY2020 for one company, in pct."""
    rows = conn.execute(
        'SELECT CAST("Calendar Year" AS INTEGER) AS yr, "Revenue" AS rev'
        " FROM financials"
        " WHERE Ticker = ?"
        ' AND CAST("Calendar Year" AS INTEGER) IN (2019, 2020)'
        " ORDER BY yr",
        (ticker,),
    ).fetchall()
    rev_by_year = {int(r["yr"]): _safe_float(r["rev"]) for r in rows}
    r19 = rev_by_year.get(2019)
    r20 = rev_by_year.get(2020)
    if r19 is None or r20 is None or r19 == 0:
        return None
    return round((r20 - r19) / abs(r19), 4)


def _gross_margins(
    conn: sqlite3.Connection,
    ticker: str,
    years: tuple[int, ...] = (2020, 2021, 2022, 2023),
) -> dict[str, Optional[float]]:
    """Gross Profit Ratio for specific years for one company."""
    placeholders = ",".join("?" for _ in years)
    rows = conn.execute(
        'SELECT CAST("Calendar Year" AS INTEGER) AS yr,'
        ' "Gross Profit Ratio" AS gpr'
        " FROM financials"
        f" WHERE Ticker = ? AND CAST(\"Calendar Year\" AS INTEGER) IN ({placeholders})"
        " ORDER BY yr",
        (ticker, *years),
    ).fetchall()
    by_year = {int(r["yr"]): _safe_float(r["gpr"]) for r in rows}
    return {str(y): by_year.get(y) for y in years}


def build_episodes(
    conn: sqlite3.Connection,
    *,
    ticker: Optional[str] = None,
) -> dict[str, Any]:
    """Episode data for ONE company: revenue change 2019 to 2020, and the
    gross margin of 2020 to 2023.

    Returns ``{"company": {...} | None}``. The industry and sector medians
    used to be computed here in SQL as well; they are served by
    ``sector_cache._batch_group_episodes`` (one query instead of five) and
    ``episodes_from_panel`` (zero queries), which is what every caller uses.
    """
    company: dict[str, Any] = {}
    if ticker:
        company["revenueChange2020"] = _revenue_change_2020(conn, ticker)
        company["grossMargin"] = _gross_margins(conn, ticker)

    return {"company": company if company else None}


# ── Panel-based derivations (zero SQL) ────────────────────────────────────

def episodes_from_panel(
    panel: Any,
) -> dict[str, Any]:
    """Derive industry-level episode data from an IndustryPanel in memory.

    Uses panel.by_year to get PeerSets at years 2019-2023, extracting
    per-firm Revenue and Gross Profit Ratio from the carried ratios dict.
    Zero SQL queries.
    """
    by_year = panel.by_year

    # Revenue change 2019->2020
    ps_2019 = by_year.get(2019)
    ps_2020 = by_year.get(2020)
    changes: list[float] = []
    if ps_2019 and ps_2020:
        rev_19 = {p.ticker: _safe_float(p.ratios.get("Revenue")) for p in ps_2019.peers}
        rev_20 = {p.ticker: _safe_float(p.ratios.get("Revenue")) for p in ps_2020.peers}
        for tk in set(rev_19) & set(rev_20):
            r19 = rev_19[tk]
            r20 = rev_20[tk]
            if r19 is not None and r20 is not None and r19 != 0:
                changes.append((r20 - r19) / abs(r19))

    rev_change_2020 = round(statistics.median(changes), 4) if changes else None

    # Gross margins for 2020-2023
    gross_margin: dict[str, Optional[float]] = {}
    for yr in (2020, 2021, 2022, 2023):
        ps = by_year.get(yr)
        if ps is None:
            gross_margin[str(yr)] = None
            continue
        vals = [
            float(p.ratios["Gross Profit Ratio"])
            for p in ps.peers
            if p.ratios.get("Gross Profit Ratio") is not None
            and _safe_float(p.ratios["Gross Profit Ratio"]) is not None
        ]
        gross_margin[str(yr)] = round(statistics.median(vals), 4) if vals else None

    return {
        "revenueChange2020": rev_change_2020,
        "grossMargin": gross_margin,
    }


def company_episodes_from_panel(
    panel: Any,
    ticker: str,
) -> dict[str, Any]:
    """Derive company-level episode data from an IndustryPanel in memory.

    Returns {revenueChange2020, grossMargin} for a single ticker.
    """
    by_year = panel.by_year

    # Revenue change 2019->2020
    rev_change: Optional[float] = None
    ps_2019 = by_year.get(2019)
    ps_2020 = by_year.get(2020)
    if ps_2019 and ps_2020:
        r19: Optional[float] = None
        r20: Optional[float] = None
        for p in ps_2019.peers:
            if p.ticker == ticker:
                r19 = _safe_float(p.ratios.get("Revenue"))
                break
        for p in ps_2020.peers:
            if p.ticker == ticker:
                r20 = _safe_float(p.ratios.get("Revenue"))
                break
        if r19 is not None and r20 is not None and r19 != 0:
            rev_change = round((r20 - r19) / abs(r19), 4)

    # Gross margins
    gross_margin: dict[str, Optional[float]] = {}
    for yr in (2020, 2021, 2022, 2023):
        ps = by_year.get(yr)
        gpr: Optional[float] = None
        if ps:
            for p in ps.peers:
                if p.ticker == ticker:
                    gpr = _safe_float(p.ratios.get("Gross Profit Ratio"))
                    break
        gross_margin[str(yr)] = gpr

    return {
        "revenueChange2020": rev_change,
        "grossMargin": gross_margin,
    }


def per_ticker_episodes_from_panel(
    panel: Any,
    tickers: list[str],
) -> tuple[dict[str, Optional[float]], dict[str, Optional[float]], dict[str, Optional[float]]]:
    """Derive per-ticker episode data for the exposure table from a panel.

    Returns (rev_change_2020, gm_2020, gm_2022) dicts keyed by ticker.
    """
    by_year = panel.by_year

    rev_change_2020: dict[str, Optional[float]] = {}
    gm_2020: dict[str, Optional[float]] = {}
    gm_2022: dict[str, Optional[float]] = {}

    ticker_set = set(tickers)

    # Build lookup dicts for 2019, 2020, 2022
    rev_2019: dict[str, Optional[float]] = {}
    rev_2020: dict[str, Optional[float]] = {}
    gpr_2020: dict[str, Optional[float]] = {}
    gpr_2022: dict[str, Optional[float]] = {}

    ps_2019 = by_year.get(2019)
    if ps_2019:
        for p in ps_2019.peers:
            if p.ticker in ticker_set:
                rev_2019[p.ticker] = _safe_float(p.ratios.get("Revenue"))

    ps_2020 = by_year.get(2020)
    if ps_2020:
        for p in ps_2020.peers:
            if p.ticker in ticker_set:
                rev_2020[p.ticker] = _safe_float(p.ratios.get("Revenue"))
                gpr_2020[p.ticker] = _safe_float(p.ratios.get("Gross Profit Ratio"))

    ps_2022 = by_year.get(2022)
    if ps_2022:
        for p in ps_2022.peers:
            if p.ticker in ticker_set:
                gpr_2022[p.ticker] = _safe_float(p.ratios.get("Gross Profit Ratio"))

    for tk in tickers:
        r19 = rev_2019.get(tk)
        r20 = rev_2020.get(tk)
        if r19 is not None and r20 is not None and r19 != 0:
            rev_change_2020[tk] = round((r20 - r19) / abs(r19), 4)
        else:
            rev_change_2020[tk] = None
        gm_2020[tk] = gpr_2020.get(tk)
        gm_2022[tk] = gpr_2022.get(tk)

    return rev_change_2020, gm_2020, gm_2022
