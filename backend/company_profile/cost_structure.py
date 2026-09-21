"""Cost structure against the strategic group (plan 3.2).

For the company and its strategic-group median: cogsToRevenue, sgaToRevenue,
rdToRevenue, daToRevenue, operatingMargin, plus groupLabel, groupFirmCount,
and per-line differences in points (company minus group).

Every line is a local-currency numerator over a local-currency denominator,
so it is currency-neutral and never FX-converted (CLAUDE.md). The group is
the median-split group of ``company_profile.common.company_groups`` — the
same label ``connections/`` shows. A company that does not report a line
(banks and REITs have no cost of revenue) gets ``None`` for it, never 0.
"""

from __future__ import annotations

from typing import Any, Optional

from industry_structure.peers import PeerSet

from financial_guard import (
    COST_STRUCTURE_GUARDED_FIELDS,
    is_financial,
    not_applicable_map,
)

from company_profile.common import (
    company_groups,
    group_data_note,
    median_of,
    r6,
    safe_div,
)

_LINES: tuple[tuple[str, str], ...] = (
    ("cogsToRevenue", "Cost Of Revenue"),
    ("sgaToRevenue", "Selling General And Administrative Expenses"),
    ("rdToRevenue", "Research And Development Expenses"),
    ("daToRevenue", "Depreciation And Amortization"),
    ("operatingMargin", "Operating Income"),
)


def _line(ratios: dict[str, Any], column: str) -> Optional[float]:
    return safe_div(ratios.get(column), ratios.get("Revenue"))


def build_cost_structure(
    ticker: str,
    now_peers: PeerSet,
    sector: Optional[str],
    industry: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """Cost structure for a company against its strategic-group median.

    Returns ``None`` when the company is not in the peer set — the caller
    turns that into the block's ``None`` rather than a fabricated table.

    ``industry`` only feeds the financial-sector guard: a lender reports no
    cost of goods, so its cost-of-revenue line is nulled and named in
    ``notApplicable``. It is not the vendor leaving the column empty, which
    would null itself: JPM's stored "Cost Of Revenue" is 112 billion dollars
    of funding cost, so the line rendered as a 40 percent cost ratio and a
    59 percent gross margin for a bank.
    """
    ticker = ticker.upper()
    company_peer = next(
        (p for p in now_peers.peers if p.ticker.upper() == ticker), None,
    )
    if company_peer is None:
        return None

    groups = company_groups(now_peers, sector)
    company_group = groups.get(company_peer.ticker)

    if company_group is None:
        # No group assignment (a missing axis value). Fall back to the whole
        # industry and say so, rather than pretending a group median exists.
        group_peers = list(now_peers.peers)
        group_basis = "industry"
    else:
        group_peers = [p for p in now_peers.peers if groups.get(p.ticker) == company_group]
        group_basis = "strategicGroup"

    company: dict[str, Optional[float]] = {}
    group: dict[str, Optional[float]] = {}
    differences: dict[str, Optional[float]] = {}
    for key, column in _LINES:
        c = _line(company_peer.ratios, column)
        g = median_of([_line(p.ratios, column) for p in group_peers])
        company[key] = r6(c)
        group[key] = r6(g)
        differences[key] = r6(c - g) if c is not None and g is not None else None

    financial = is_financial(sector, industry, include_real_estate=False)
    if financial:
        for key in COST_STRUCTURE_GUARDED_FIELDS:
            # Nulled in all three maps, not dropped: the table keeps its rows
            # so the reader sees the line is there and why it is blank.
            company[key] = None
            group[key] = None
            differences[key] = None

    return {
        "applicable": True,
        "ticker": ticker,
        "company": company,
        "group": group,
        "differences": differences,
        "isFinancial": financial,
        "notApplicable": (
            not_applicable_map(COST_STRUCTURE_GUARDED_FIELDS) if financial else {}
        ),
        "groupLabel": company_group,
        "groupBasis": group_basis,
        "groupFirmCount": len(group_peers),
        "peerCount": len(now_peers.peers),
        "fiscalYear": now_peers.fiscal_year,
        "dataNote": group_data_note(len(group_peers)),
    }
