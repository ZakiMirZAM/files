"""Concentration evidence block (plan 2.2)."""

from __future__ import annotations

from typing import Any

from industry_structure.peers import PeerSet
from industry_structure.ranks import ranked_value


def build_concentration(
    ps: PeerSet,
    cross_medians: dict[str, dict[str, float]],
) -> dict[str, Any]:
    """firmCount, cr4, cr8, hhi, top10[]."""
    industry = ps.group_name
    shares = ps.revenue_shares()

    sorted_peers = sorted(ps.peers, key=lambda p: p.revenue_usd, reverse=True)
    top10 = []
    leader_rev = sorted_peers[0].revenue_usd if sorted_peers else 1.0
    for rank_idx, p in enumerate(sorted_peers[:10]):
        share = shares.get(p.ticker, 0.0)
        relative = p.revenue_usd / leader_rev if leader_rev > 0 else None
        top10.append({
            "rank": rank_idx + 1,
            "ticker": p.ticker,
            "name": p.name,
            "revenueUsd": p.revenue_usd,
            "share": round(share, 6),
            "relativeShare": round(relative, 4) if relative is not None else None,
        })

    cr4_val = ps.cr4()
    cr8_val = ps.cr8()
    hhi_val = ps.hhi()

    return {
        "firmCount": len(ps.peers),
        "cr4": ranked_value(round(cr4_val, 4), industry, "cr4", cross_medians),
        "cr8": ranked_value(round(cr8_val, 4), industry, "cr8", cross_medians),
        "hhi": ranked_value(round(hhi_val, 1), industry, "hhi", cross_medians),
        "top10": top10,
    }
