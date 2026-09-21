"""Share stability evidence block (plan 2.2, Rule A items 5, 7)."""

from __future__ import annotations

from typing import Any, Optional

from industry_structure.entry_exit import spearman_rank_correlation
from industry_structure.peers import PeerSet, top5_share_change


def build_share_stability(
    ps_now: PeerSet,
    ps_then: Optional[PeerSet],
) -> dict[str, Any]:
    """top5ShareChange5y, shareRankCorrelation5y (Rule A items 5, 7).

    Neither figure is ranked across industries, so this block takes no
    cross-industry median table.
    """
    if ps_then is None:
        return {
            "top5ShareChange5y": None,
            "shareRankCorrelation5y": None,
        }

    t5 = top5_share_change(ps_now, ps_then)

    shares_now = ps_now.revenue_shares()
    shares_then = ps_then.revenue_shares()
    common_tickers = sorted(set(shares_now.keys()) & set(shares_then.keys()))

    if len(common_tickers) >= 3:
        x_vals = [shares_then[t] for t in common_tickers]
        y_vals = [shares_now[t] for t in common_tickers]
        rho = spearman_rank_correlation(x_vals, y_vals)
    else:
        rho = None

    return {
        "top5ShareChange5y": round(t5, 4) if t5 is not None else None,
        "shareRankCorrelation5y": round(rho, 4) if rho is not None else None,
    }
