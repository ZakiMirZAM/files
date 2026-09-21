"""Leverage and coverage metrics across a peer set.

Uses the same definitions as ``individualanalysis.py``:
- interest_coverage = Operating Income / abs(Interest Expense)
- net_debt_ebitda = Net Debt / EBITDA (or the stored column)
"""

from __future__ import annotations

import statistics
from typing import Any, Optional

from connections._helpers import _safe_float
from industry_structure.peers import PeerSet


def _interest_coverage(ratios: dict[str, Any]) -> Optional[float]:
    """Same definition as individualanalysis.py L2559."""
    op_inc = _safe_float(ratios.get("Operating Income"))
    interest = _safe_float(ratios.get("Interest Expense"))
    if op_inc is None or interest is None or interest == 0:
        return None
    return op_inc / abs(interest)


def _net_debt_ebitda(ratios: dict[str, Any]) -> Optional[float]:
    """Same definition as individualanalysis.py L2456."""
    net_debt = _safe_float(ratios.get("Net Debt"))
    ebitda = _safe_float(ratios.get("EBITDA"))
    if net_debt is None or ebitda is None or ebitda == 0:
        return None
    return net_debt / ebitda


def _has_interest_expense(ratios: dict[str, Any]) -> bool:
    """Whether the firm has a non-null, non-zero interest expense."""
    ie = _safe_float(ratios.get("Interest Expense"))
    return ie is not None and ie != 0


def build_leverage_block(peers: PeerSet) -> dict[str, Any]:
    """Leverage metrics across a peer set.

    Returns:
        medianInterestCoverage: median IC across peers with interest expense
        medianNetDebtToEbitda: median ND/EBITDA across all peers
        shareCoverageBelow2: share of firms with IC < 2 (denominator = firms
            WITH interest expense, per HARD RULE)
        firmsWithInterest: count of firms with interest expense
    """
    ic_vals: list[float] = []
    nde_vals: list[float] = []
    firms_with_interest = 0
    below_2_count = 0

    for p in peers.peers:
        r = p.ratios
        ic = _interest_coverage(r)
        nde = _net_debt_ebitda(r)

        if nde is not None:
            nde_vals.append(nde)

        if _has_interest_expense(r):
            firms_with_interest += 1
            if ic is not None:
                ic_vals.append(ic)
                if ic < 2.0:
                    below_2_count += 1

    share_below_2: Optional[float] = None
    if firms_with_interest > 0:
        share_below_2 = round(below_2_count / firms_with_interest, 4)

    return {
        "medianInterestCoverage": round(statistics.median(ic_vals), 2) if ic_vals else None,
        "medianNetDebtToEbitda": round(statistics.median(nde_vals), 2) if nde_vals else None,
        "shareCoverageBelow2": share_below_2,
        "firmsWithInterest": firms_with_interest,
    }
