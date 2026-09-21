"""Environment indicators (plan 2.9 headers)."""

from __future__ import annotations

from typing import Any, Optional

from industry_structure.entry_exit import compute_scale_slope
from industry_structure.evolution import cross_firm_totals_usd
from industry_structure.helpers import _median_of
from industry_structure.panel import IndustryPanel, revenue_cagr
from industry_structure.peers import PeerSet


def build_environment_indicators(
    ps: PeerSet,
    *,
    panel: Optional[IndustryPanel] = None,
    scale_slope_result: Optional[dict[str, Any]] = None,
    revenue_cagr_5y: Optional[float] = None,
    net_entry_5y: Optional[int] = None,
) -> dict[str, Any]:
    """Raw header indicators for plan 2.9 environment sections.

    None of these figures carries a cross-industry percentile, so this
    block takes no median table.
    """
    hhi_val = ps.hhi()
    cr4_val = ps.cr4()

    if scale_slope_result is None:
        scale_slope_result = compute_scale_slope(ps)
    slope = scale_slope_result.get("slope")
    r2 = scale_slope_result.get("r2")

    cagr = revenue_cagr_5y

    # Median years of history from panel ticker_spans
    if panel is not None:
        spans = [
            last - first
            for first, last in panel.ticker_spans.values()
        ]
    else:
        spans = []
    median_years = _median_of(spans)

    # Growth first five vs last five years from panel
    five_ago = ps.fiscal_year - 5
    ten_ago = ps.fiscal_year - 10
    if panel is not None:
        ps_5ago = panel.by_year.get(five_ago)
        ps_10ago = panel.by_year.get(ten_ago)
    else:
        ps_5ago = None
        ps_10ago = None
    growth_first5 = (
        revenue_cagr(ps_5ago, ps_10ago)
        if ps_5ago and ps_10ago else None
    )
    growth_last5 = revenue_cagr(ps, ps_5ago) if ps_5ago else None

    # Capex to depreciation (total over total for latest year, USD-converted).
    # Same three sums the evolution series uses, so the latest point of that
    # chart and this header cannot disagree.
    total_capex, total_dep, _total_ppe = cross_firm_totals_usd(ps.peers)
    capex_to_dep = total_capex / total_dep if total_dep > 0 else None

    return {
        "hhi": round(hhi_val, 1),
        "cr4": round(cr4_val, 4),
        "scaleSlope": slope,
        "scaleR2": r2,
        "revenueCagr5y": (
            round(cagr, 4) if cagr is not None else None
        ),
        "medianYearsOfHistory": (
            round(median_years, 1) if median_years is not None else None
        ),
        "growthFirst5y": (
            round(growth_first5, 4) if growth_first5 is not None else None
        ),
        "growthLast5y": (
            round(growth_last5, 4) if growth_last5 is not None else None
        ),
        "capexToDepreciation": (
            round(capex_to_dep, 4) if capex_to_dep is not None else None
        ),
        "inflationAdjusted5yRevenueChange": None,
        "netEntry5y": net_entry_5y,
        "countries": None,
    }
