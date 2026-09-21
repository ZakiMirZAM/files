"""The company block of the connections payload.

One company's debt, coverage, synthetic rating, 2020 episode, growth and
margin splits, and its strategic group.
"""

from __future__ import annotations

import logging
import sqlite3
import statistics
from typing import Any, Optional

from connections._helpers import _safe_float
from connections.episodes import build_episodes, company_episodes_from_panel
from connections.financial_guard import (
    COMPANY_GUARDED_FIELDS,
    apply_guard,
    is_financial,
)
from connections.splits import build_growth_split, build_margin_split
from industry_structure.dimensions import default_axes, median_split_groups
from industry_structure.panel import IndustryPanel
from industry_structure.peers import PeerSet

log = logging.getLogger(__name__)


def _synthetic_rating_from_peer(
    op_inc: Optional[float],
    ie: Optional[float],
    mc: Optional[float],
) -> Optional[str]:
    """Get synthetic rating letter from pre-loaded peer data.

    Avoids the SQL query and heavy ``individualanalysis`` import
    by using values already extracted from the PeerSet.
    """
    try:
        from individualanalysis import _synthetic_rating
    except ImportError as exc:  # noqa: BLE001 — log, do not swallow (finding LOW)
        log.warning(
            "connections: synthetic rating unavailable, "
            "individualanalysis did not import: %s", exc,
        )
        return None

    ic: Optional[float] = None
    if op_inc is not None and ie is not None and ie != 0:
        ic = op_inc / abs(ie)

    result = _synthetic_rating(ic, mc)
    return result.get("letter")


def _company_group_block(
    ticker: str,
    now_peers: PeerSet,
    sector: str,
) -> Optional[dict[str, Any]]:
    """The company's strategic group, computed over EVERY peer (finding C2)."""
    x_key, y_key = default_axes(sector)
    peer_dicts = [{"ticker": p.ticker, "ratios": p.ratios} for p in now_peers.peers]
    groups = median_split_groups(peer_dicts, x_key, y_key)
    company_group = groups.get(ticker)
    if not company_group:
        return None

    group_tickers = {t for t, g in groups.items() if g == company_group}
    roics: list[float] = []
    company_roic: Optional[float] = None
    for p in now_peers.peers:
        op = _safe_float(p.ratios.get("Operating Income"))
        equity = _safe_float(p.ratios.get("Total Stockholders Equity"))
        debt = _safe_float(p.ratios.get("Total Debt"))
        if op is None or equity is None or debt is None:
            continue
        ic_denom = equity + debt
        if ic_denom <= 0:
            continue
        roic = op / ic_denom
        if p.ticker in group_tickers:
            roics.append(roic)
        if p.ticker == ticker:
            company_roic = roic

    median_roic = round(statistics.median(roics), 4) if roics else None

    rank: Optional[int] = None
    if company_roic is not None and roics:
        rank = 1 + sum(1 for r in roics if r > company_roic)

    return {
        "label": company_group,
        "firmCount": len(group_tickers),
        "medianPreTaxRoic": median_roic,
        "rankByPreTaxRoic": rank,
        "axes": [x_key, y_key],
    }


def _company_facts(
    conn: sqlite3.Connection,
    ticker: str,
    now_peers: Optional[PeerSet],
) -> dict[str, Any]:
    """The company's own figures, from the peer set when it is in it."""
    facts: dict[str, Any] = {
        "total_debt": None, "op_inc": None, "ie": None, "mc": None,
        "currency": None, "usd_per_unit": None, "name": ticker,
    }

    if now_peers:
        for p in now_peers.peers:
            if p.ticker == ticker:
                facts.update(
                    total_debt=_safe_float(p.ratios.get("Total Debt")),
                    op_inc=_safe_float(p.ratios.get("Operating Income")),
                    ie=_safe_float(p.ratios.get("Interest Expense")),
                    mc=_safe_float(p.ratios.get("Market Cap")),
                    currency=p.reported_currency,
                    usd_per_unit=p.usd_per_unit,
                    name=p.name,
                )
                break

    # Fall back to SQL when the peer set answered with neither figure: the
    # ticker is not in the current peers, or its row carries no debt and no
    # operating income.
    if facts["total_debt"] is not None or facts["op_inc"] is not None:
        return facts

    row = conn.execute(
        'SELECT "Total Debt", "Operating Income", "Interest Expense",'
        ' "Market Cap", "Revenue", "Gross Profit Ratio", "Reported Currency"'
        " FROM financials WHERE Ticker = ?"
        ' AND "Reported Currency" IS NOT NULL'
        ' ORDER BY CAST("Calendar Year" AS INTEGER) DESC LIMIT 1',
        (ticker,),
    ).fetchone()
    if row:
        facts.update(
            total_debt=_safe_float(row["Total Debt"]),
            op_inc=_safe_float(row["Operating Income"]),
            ie=_safe_float(row["Interest Expense"]),
            mc=_safe_float(row["Market Cap"]),
            currency=row["Reported Currency"],
        )

    name_row = conn.execute(
        "SELECT name FROM tickers WHERE ticker = ?", (ticker,),
    ).fetchone()
    facts["name"] = name_row["name"] if name_row else ticker
    return facts


def build_company_block(
    conn: sqlite3.Connection,
    ticker: str,
    industry: str,
    sector: str,
    now_peers: Optional[PeerSet],
    then_peers: Optional[PeerSet],
    *,
    panel: Optional[IndustryPanel] = None,
) -> dict[str, Any]:
    """Build the company block of the connections payload."""
    facts = _company_facts(conn, ticker, now_peers)
    total_debt = facts["total_debt"]
    op_inc = facts["op_inc"]
    ie = facts["ie"]
    usd_per_unit = facts["usd_per_unit"]

    # Interest per point (Rule A item 12)
    interest_per_point: Optional[float] = None
    interest_per_point_pct: Optional[float] = None
    if total_debt is not None:
        interest_per_point = round(total_debt * 0.01, 2)
        if op_inc is not None and op_inc > 0:
            interest_per_point_pct = round(interest_per_point / op_inc, 4)

    # Interest coverage
    ic_val: Optional[float] = None
    if op_inc is not None and ie is not None and ie != 0:
        ic_val = round(op_inc / abs(ie), 2)

    # Money fields are LOCAL currency (finding H8): TSM reports in TWD, so a
    # bare 1.06e12 debt must never render with a dollar sign. The USD
    # companions convert with the peer's own revenue rate; unknown currency
    # leaves them null.
    def _usd(v: Optional[float]) -> Optional[float]:
        if v is None or usd_per_unit is None:
            return None
        return round(v * usd_per_unit, 2)

    # Episodes from panel (zero SQL)
    if panel:
        company_episodes = company_episodes_from_panel(panel, ticker)
    else:
        company_episodes = build_episodes(conn, ticker=ticker).get("company", {}) or {}

    growth = (
        build_growth_split(conn, ticker, industry, now_peers, then_peers)
        if now_peers and then_peers else None
    )
    margin = build_margin_split(ticker, now_peers, sector) if now_peers else None
    group_info = _company_group_block(ticker, now_peers, sector) if now_peers else None

    block: dict[str, Any] = {
        "ticker": ticker,
        "name": facts["name"],
        "sector": sector,
        "industry": industry,
        "fiscalYear": now_peers.fiscal_year if now_peers else None,
        "reportingCurrency": facts["currency"],
        "totalDebt": total_debt,
        "totalDebtUsd": _usd(total_debt),
        "operatingIncome": op_inc,
        "operatingIncomeUsd": _usd(op_inc),
        "interestPerPoint": interest_per_point,
        "interestPerPointUsd": _usd(interest_per_point),
        "interestPerPointPctOfOperatingIncome": interest_per_point_pct,
        "interestCoverage": ic_val,
        "syntheticRating": _synthetic_rating_from_peer(op_inc, ie, facts["mc"]),
        "revenueChange2020": company_episodes.get("revenueChange2020"),
        "grossMargin": company_episodes.get("grossMargin", {}) or {},
        "growth": growth,
        "margin": margin,
        "group": group_info,
    }

    # The year keys of grossMargin survive the guard, so the shape never
    # changes (finding M9).
    apply_guard(
        block, COMPANY_GUARDED_FIELDS,
        financial=is_financial(sector, industry),
        year_maps=("grossMargin",),
    )
    return block
