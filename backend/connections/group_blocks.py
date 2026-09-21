"""The industry and sector blocks of the connections payload.

Both describe a GROUP of firms rather than one company, so they share the
same guarded fields and the same leverage/episode shape.
"""

from __future__ import annotations

from typing import Any, Optional

from connections._helpers import _nz
from connections.financial_guard import (
    GROUP_GUARDED_FIELDS,
    apply_guard,
    is_financial,
)
from connections.leverage import build_leverage_block
from connections.sector_links import _median_operating_margin
from industry_structure.panel import revenue_cagr
from industry_structure.peers import PeerSet, top5_share_change_detail
from industry_structure.sector_pool import industry_shares


def build_industry_block(
    industry: str,
    sector: str,
    now_peers: Optional[PeerSet],
    then_peers: Optional[PeerSet],
    sector_pool: Optional[dict[str, Any]],
    *,
    industry_episodes: Optional[dict[str, Any]] = None,
    coverage: Optional[float] = None,
) -> dict[str, Any]:
    """Build the industry block of the connections payload."""
    fiscal_year: Optional[int] = None
    firm_count: Optional[int] = None
    cr4_val: Optional[float] = None
    hhi_val: Optional[float] = None
    rev_cagr: Optional[float] = None
    leverage_data: dict[str, Any] = {}
    dup_dropped = 0
    t5: dict[str, Optional[float]] = {"value": None, "firmsCompared": 0}

    if now_peers:
        fiscal_year = now_peers.fiscal_year
        firm_count = len(now_peers.peers)
        dup_dropped = now_peers.duplicate_listings_dropped
        cr4_val = round(now_peers.cr4(), 4) if now_peers.peers else None
        hhi_val = round(now_peers.hhi(), 1) if now_peers.peers else None
        leverage_data = build_leverage_block(now_peers)

    if now_peers and then_peers:
        t5 = top5_share_change_detail(now_peers, then_peers)
        rev_cagr = revenue_cagr(now_peers, then_peers)
        if rev_cagr is not None:
            rev_cagr = _nz(round(rev_cagr, 4))

    ind_ep = industry_episodes or {}
    # Both shares come out of the single sector pool, measured at the
    # SECTOR's own picked fiscal year (finding H6), so /api/connections and
    # /api/sector/{s}/profit-pool cannot disagree.
    sl = industry_shares(sector_pool, industry)

    block: dict[str, Any] = {
        "name": industry,
        "sector": sector,
        "fiscalYear": fiscal_year,
        "coverage": coverage,
        "firmCount": firm_count,
        "duplicateListingsDropped": dup_dropped,
        "cr4": cr4_val,
        "hhi": hhi_val,
        "top5ShareChange5y": (
            round(t5["value"], 2) if t5.get("value") is not None else None
        ),
        "top5ShareChangeFirmsCompared": t5.get("firmsCompared"),
        "revenueCagr5y": rev_cagr,
        "medianInterestCoverage": leverage_data.get("medianInterestCoverage"),
        "medianNetDebtToEbitda": leverage_data.get("medianNetDebtToEbitda"),
        "shareCoverageBelow2": leverage_data.get("shareCoverageBelow2"),
        "firmsWithInterest": leverage_data.get("firmsWithInterest"),
        "revenueChange2020": ind_ep.get("revenueChange2020"),
        "grossMargin": ind_ep.get("grossMargin", {}) or {},
        "medianOperatingMargin": _median_operating_margin(now_peers),
        "medianOperatingMargin5yAgo": _median_operating_margin(then_peers),
        "sectorFiscalYear": sl.get("sectorFiscalYear"),
        "shareOfSectorRevenue": sl.get("shareOfSectorRevenue"),
        "shareOfSectorProfit": sl.get("shareOfSectorProfit"),
        "shareOfSectorRevenue5yAgo": sl.get("shareOfSectorRevenue5yAgo"),
        "shareOfSectorProfit5yAgo": sl.get("shareOfSectorProfit5yAgo"),
    }

    apply_guard(
        block, GROUP_GUARDED_FIELDS,
        financial=is_financial(sector, industry),
        year_maps=("grossMargin",),
    )
    return block


def build_sector_block(
    sector: str,
    sector_pool: Optional[dict[str, Any]],
    sector_episodes: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Build the sector block of the connections payload."""
    peers_now = sector_pool.get("peersNow") if sector_pool else None
    peers_then = sector_pool.get("peersThen") if sector_pool else None
    leverage_data = build_leverage_block(peers_now) if peers_now else {}
    sec_ep = sector_episodes or {}

    block: dict[str, Any] = {
        "name": sector,
        "fiscalYear": sector_pool.get("fiscalYear") if sector_pool else None,
        "coverage": sector_pool.get("coverage") if sector_pool else None,
        "firmCount": sector_pool["now"]["firmCount"] if sector_pool else None,
        "duplicateListingsDropped": (
            sector_pool.get("duplicateListingsDropped", 0) if sector_pool else 0
        ),
        "nullIndustryRowsDropped": (
            sector_pool["now"]["nullIndustryRowsDropped"] if sector_pool else 0
        ),
        # The sector's scorecard Value Score is computed in api.py, which
        # imports this package, so reading it here would be a cycle. The
        # three keys stay in the payload and the frontend fills them.
        "valueScore": None,
        "valueRank": None,
        "sectorCount": None,
        "medianInterestCoverage": leverage_data.get("medianInterestCoverage"),
        "medianNetDebtToEbitda": leverage_data.get("medianNetDebtToEbitda"),
        "shareCoverageBelow2": leverage_data.get("shareCoverageBelow2"),
        "firmsWithInterest": leverage_data.get("firmsWithInterest"),
        "revenueChange2020": sec_ep.get("revenueChange2020"),
        "grossMargin": sec_ep.get("grossMargin", {}) or {},
        "medianOperatingMargin": _median_operating_margin(peers_now),
        "medianOperatingMargin5yAgo": _median_operating_margin(peers_then),
    }

    apply_guard(
        block, GROUP_GUARDED_FIELDS,
        financial=is_financial(sector, None),
        year_maps=("grossMargin",),
    )
    return block
