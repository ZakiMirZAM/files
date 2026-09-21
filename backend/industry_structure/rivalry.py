"""Rivalry evidence block (plan 2.2)."""

from __future__ import annotations

import statistics
from typing import Any, Optional

from industry_structure.helpers import _median_of, _peer_ratio
from industry_structure.panel import revenue_cagr
from industry_structure.peers import PeerSet
from industry_structure.ranks import ranked_value


def build_rivalry_evidence(
    ps: PeerSet,
    cross_medians: dict[str, dict[str, float]],
    *,
    ps_then: Optional[PeerSet] = None,
) -> dict[str, Any]:
    """revenueCagr5y, daToRevenue, revenueSpreadAmongTop10."""
    industry = ps.group_name

    cagr = revenue_cagr(ps, ps_then) if ps_then else None

    da_vals = [
        v for v in (
            _peer_ratio(p, "Depreciation And Amortization", "Revenue")
            for p in ps.peers
        ) if v is not None
    ]
    da_rev = _median_of(da_vals)

    sorted_peers = sorted(
        ps.peers, key=lambda p: p.revenue_usd, reverse=True,
    )[:10]
    top10_revs = [p.revenue_usd for p in sorted_peers]
    if len(top10_revs) >= 2:
        mean_rev = statistics.mean(top10_revs)
        stdev_rev = statistics.stdev(top10_revs)
        cv = stdev_rev / mean_rev if mean_rev > 0 else None
    else:
        cv = None

    return {
        "revenueCagr5y": ranked_value(
            round(cagr, 4) if cagr is not None else None,
            industry, "revenueCagr5y", cross_medians,
        ),
        "daToRevenue": ranked_value(
            round(da_rev, 4) if da_rev is not None else None,
            industry, "daToRevenue", cross_medians,
        ),
        "revenueSpreadAmongTop10": (
            round(cv, 4) if cv is not None else None
        ),
    }
