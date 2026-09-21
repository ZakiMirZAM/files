"""Value system: compare an industry with its supplier and buyer (plan 2.7).

For the focal industry and optional supplier/buyer industries: hhi,
hhiFiveYearsAgo, medianOperatingMargin, revenueCagr5y; for the focal
industry also daysPayableByYear[] and daysReceivableByYear[] (medians).
"""

from __future__ import annotations

import sqlite3
import statistics
from typing import Any, Optional

from industry_structure.groups import _resolve_peer_set
from industry_structure.helpers import _safe_div
from industry_structure.panel import IndustryPanel, revenue_cagr
from industry_structure.peers import load_peers_at_year

# The count below which an industry's medians rest on very few firms. The
# figures are still printed; the flag says how many they came from.
THIN_PEER_SET_THRESHOLD = 10


def _industry_summary(
    conn: sqlite3.Connection,
    industry: str,
    *,
    panel: Optional[IndustryPanel] = None,
) -> dict[str, Any]:
    """Compute hhi, hhiFiveYearsAgo, medianOperatingMargin, revenueCagr5y
    for one industry.  When ``panel`` is provided, derive PeerSets from
    it instead of running separate SQL queries.
    """
    ps = _resolve_peer_set(conn, industry, panel)

    if ps is None:
        return {
            "applicable": False,
            "reason": "No peer data found for this industry",
            "industry": industry,
            "fiscalYear": None,
            "firmCount": 0,
            "thinPeerSet": True,
            "duplicateListingsDropped": 0,
            "hhi": None,
            "hhiFiveYearsAgo": None,
            "medianOperatingMargin": None,
            "revenueCagr5y": None,
        }

    hhi_now = ps.hhi()

    five_ago = ps.fiscal_year - 5
    if panel is not None:
        ps_then = panel.by_year.get(five_ago)
    else:
        ps_then = load_peers_at_year(conn, industry, five_ago)
    hhi_then = ps_then.hhi() if ps_then else None

    margins = []
    for p in ps.peers:
        m = _safe_div(
            p.ratios.get("Operating Income"), p.ratios.get("Revenue"),
        )
        if m is not None:
            margins.append(m)
    med_margin = statistics.median(margins) if margins else None

    cagr = revenue_cagr(ps, ps_then) if ps_then else None

    return {
        "applicable": True,
        "reason": None,
        "industry": industry,
        "fiscalYear": ps.fiscal_year,
        "firmCount": len(ps.peers),
        # Below ten firms the figures are still the real ones; they are
        # simply drawn from a thin set, and the reader is told the count
        # rather than shown a blank (finding M7). No judgement text.
        "thinPeerSet": len(ps.peers) < THIN_PEER_SET_THRESHOLD,
        "duplicateListingsDropped": ps.duplicate_listings_dropped,
        "hhi": round(hhi_now, 1),
        "hhiFiveYearsAgo": (
            round(hhi_then, 1) if hhi_then is not None else None
        ),
        "medianOperatingMargin": (
            round(med_margin, 4) if med_margin is not None else None
        ),
        "revenueCagr5y": (
            round(cagr, 4) if cagr is not None else None
        ),
    }


def _days_series_from_panel(
    panel: IndustryPanel,
    col: str,
    latest_year: int,
    window: int = 5,
) -> list[dict[str, Any]]:
    """Median of a 'days' column by year from the in-memory panel."""
    start_year = latest_year - window + 1
    by_year: dict[int, list[float]] = {}
    for yr, ps in panel.by_year.items():
        if yr < start_year or yr > latest_year:
            continue
        vals: list[float] = []
        for p in ps.peers:
            v = p.ratios.get(col)
            if v is not None:
                try:
                    vals.append(float(v))
                except (TypeError, ValueError):
                    pass
        if vals:
            by_year[yr] = vals
    return [
        {"year": yr, "value": round(statistics.median(vals), 2)}
        for yr, vals in sorted(by_year.items())
        if vals
    ]


# ── Public API ─────────────────────────────────────────────────────────────────

def build_value_system(
    conn: sqlite3.Connection,
    industry: str,
    *,
    supplier: Optional[str] = None,
    buyer: Optional[str] = None,
) -> dict[str, Any]:
    """Build the value system comparison for an industry and its neighbors."""
    # Finding M1: the same cached panel /structure and /api/connections use.
    from connections.sector_cache import get_industry_panel  # noqa: PLC0415

    panel = get_industry_panel(conn, industry)
    focal = _industry_summary(conn, industry, panel=panel)

    # Days payable and receivable for the focal industry
    latest_year = panel.fiscal_year if panel else 2024

    if panel is not None:
        focal["daysPayableByYear"] = _days_series_from_panel(
            panel, "Days Payables Outstanding", latest_year,
        )
        focal["daysReceivableByYear"] = _days_series_from_panel(
            panel, "Days Sales Outstanding", latest_year,
        )
    else:
        focal["daysPayableByYear"] = []
        focal["daysReceivableByYear"] = []

    result: dict[str, Any] = {
        "focal": focal,
        "supplier": None,
        "buyer": None,
    }

    if supplier:
        result["supplier"] = _industry_summary(
            conn, supplier, panel=get_industry_panel(conn, supplier),
        )
    if buyer:
        result["buyer"] = _industry_summary(
            conn, buyer, panel=get_industry_panel(conn, buyer),
        )

    return result
