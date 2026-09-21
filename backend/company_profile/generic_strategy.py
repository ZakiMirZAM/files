"""Generic competitive strategies (plan 3.3, Porter figure 2-1).

Raw figures with the company's RANK inside its industry — rank and count, no
percentile label, no placement on the grid, no threshold applied. Porter's
grid itself is drawn on the frontend as a static figure; the reader places
the company, the app does not.

Owner rule (Rule A): no scores, no classifiers, no good/bad labels.
"""

from __future__ import annotations

from typing import Any, Optional

from industry_structure.peers import PeerSet

from financial_guard import (
    GENERIC_STRATEGY_GUARDED_FIELDS,
    is_financial,
    not_applicable_map,
)

from company_profile.common import (
    cogs_plus_sga as _cogs_plus_sga,
    median_of,
    r6,
    rank_desc,
    safe_div,
    safe_float,
)


def _gross_margin(ratios: dict[str, Any]) -> Optional[float]:
    gpr = safe_float(ratios.get("Gross Profit Ratio"))
    if gpr is not None:
        return gpr
    return safe_div(ratios.get("Gross Profit"), ratios.get("Revenue"))


def _rd_to_revenue(ratios: dict[str, Any]) -> Optional[float]:
    return safe_div(
        ratios.get("Research And Development Expenses"), ratios.get("Revenue"),
    )


def _sga_to_revenue(ratios: dict[str, Any]) -> Optional[float]:
    return safe_div(
        ratios.get("Selling General And Administrative Expenses"),
        ratios.get("Revenue"),
    )


def build_generic_strategy(
    ticker: str,
    now_peers: PeerSet,
    segment_count: Optional[int] = None,
    sector: Optional[str] = None,
    industry: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """Generic-strategy figures with industry ranks (plan 3.3).

    Returns ``None`` when the company is not in the peer set.
    ``segment_count`` comes from the business profile's EDGAR segments; it is
    ``None`` for a company EDGAR reports no segments for.

    ``sector`` and ``industry`` feed the financial-sector guard only. Porter's
    cost-leadership axis is built on cost of revenue and gross margin, neither
    of which a lender reports, so for a bank the two cost blocks are nulled and
    named in ``notApplicable``. The rank goes with the value: a rank among
    figures that do not mean anything is not a rank.
    """
    ticker = ticker.upper()
    company_peer = next(
        (p for p in now_peers.peers if p.ticker.upper() == ticker), None,
    )
    if company_peer is None:
        return None
    company_tk = company_peer.ticker

    shares = now_peers.revenue_shares()

    def _figure(fn) -> list[tuple[str, Optional[float]]]:
        return [(p.ticker, fn(p.ratios)) for p in now_peers.peers]

    cogs_sga = _figure(_cogs_plus_sga)
    gross_margins = _figure(_gross_margin)
    rd = _figure(_rd_to_revenue)
    sga = _figure(_sga_to_revenue)
    rev_share = [(p.ticker, shares.get(p.ticker)) for p in now_peers.peers]

    def _block(pairs: list[tuple[str, Optional[float]]]) -> dict[str, Any]:
        value = next((v for t, v in pairs if t == company_tk), None)
        return {"value": r6(value), **rank_desc(pairs, company_tk)}

    industry_median_gm = median_of([v for _t, v in gross_margins])
    company_gm = next((v for t, v in gross_margins if t == company_tk), None)
    gm_gap = (
        round(company_gm - industry_median_gm, 6)
        if company_gm is not None and industry_median_gm is not None
        else None
    )

    out = {
        "applicable": True,
        "ticker": ticker,
        "costOfGoodsPlusSgaToRevenue": _block(cogs_sga),
        "grossMarginGap": {
            "value": gm_gap,
            "companyGrossMargin": r6(company_gm),
            "industryMedianGrossMargin": r6(industry_median_gm),
            **rank_desc(gross_margins, company_tk),
        },
        "rdToRevenue": _block(rd),
        "sgaToRevenue": _block(sga),
        "revenueShare": _block(rev_share),
        "segmentCount": segment_count,
        "peerCount": len(now_peers.peers),
        "fiscalYear": now_peers.fiscal_year,
    }

    financial = is_financial(sector, industry, include_real_estate=False)
    out["isFinancial"] = financial
    out["notApplicable"] = (
        not_applicable_map(GENERIC_STRATEGY_GUARDED_FIELDS) if financial else {}
    )
    if financial:
        for key in GENERIC_STRATEGY_GUARDED_FIELDS:
            block = out.get(key)
            if not isinstance(block, dict):
                continue
            # Every number in the block goes, the keys stay. The rank is
            # dropped with the value it ranked.
            out[key] = {k: None for k in block}
    return out
