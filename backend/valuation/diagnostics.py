"""WARN-only sanity checks on a projection (Damodaran Ch. 11/12).

The old engine CLAMPED growth to per-stage bounds; the rebuilt engine measures
what the fundamentals say and WARNS when the result strains credibility. A
diagnostic never changes a number — it appears in the payload for the user
(and the growth-viability deck) to weigh.
"""
from __future__ import annotations

import math
from typing import Optional

__all__ = ["lifecycle_band_warning", "market_share_warning",
           "imputed_roic_warnings", "LIFECYCLE_ADVISORY_BANDS"]

# Ch. 11's life-cycle growth table, kept as ADVISORY bands (the old
# _STAGE_GROWTH_BOUNDS clamps, demoted to warnings).
LIFECYCLE_ADVISORY_BANDS: dict[str, tuple[float, float]] = {
    "emerging":  (-0.10, 0.60),
    "growth":    (-0.10, 0.35),
    "mature":    (-0.10, 0.25),
    "declining": (-0.25, 0.15),
}


def lifecycle_band_warning(g: Optional[float],
                           stage: Optional[str]) -> Optional[dict]:
    """A growth rate outside the typical band for the company's life-cycle
    stage. Advisory: the rate still drives the model; the user is told it is
    unusual for the stage."""
    if g is None or stage not in LIFECYCLE_ADVISORY_BANDS:
        return None
    lo, hi = LIFECYCLE_ADVISORY_BANDS[stage]
    if lo <= g <= hi:
        return None
    return {
        "id": "lifecycle_band",
        "severity": "warning",
        "detail": (f"A growth rate of {g:.0%} is outside the {lo:.0%} to "
                   f"{hi:.0%} range typical of a {stage} company; the model "
                   "uses it as measured, but check what is driving it."),
        "value": round(g, 4), "bandLow": lo, "bandHigh": hi, "stage": stage,
    }


def market_share_warning(g: Optional[float],
                         years: int,
                         gdp_growth: Optional[float]) -> Optional[dict]:
    """Compounding is deceptive (Ch. 11): a rate far above the economy's pace
    implies a scale the market may not hold. States the LIVE economy growth
    when available rather than a hardcoded number."""
    if g is None or g <= 0.15:
        return None
    years_to_10x = math.log(10.0) / math.log(1.0 + g)
    econ = (f"{gdp_growth:.1%}" if gdp_growth is not None
            else "the risk-free rate, its long-run proxy")
    return {
        "id": "implied_market_share",
        "severity": "warning",
        "detail": (f"At {g:.0%} a year the company grows tenfold in about "
                   f"{years_to_10x:.0f} years, against an economy growing "
                   f"near {econ}; somebody has to lose that market share."),
        "value": round(g, 4),
        "yearsToTenfold": round(years_to_10x, 1),
        "economyGrowth": round(gdp_growth, 4) if gdp_growth is not None else None,
    }


def imputed_roic_warnings(proj_rows: list[dict],
                          invested_capital0: Optional[float],
                          industry_roic: Optional[float],
                          wacc: Optional[float]) -> list[dict]:
    """Ch. 11's consistency check for the revenue-driven path: each year,
    after-tax operating income over CUMULATIVE invested capital. A projected
    return far above the industry's means the model is under-reinvesting —
    the growth is being bought too cheaply."""
    if not proj_rows or invested_capital0 is None or invested_capital0 <= 0:
        return []
    out: list[dict] = []
    capital = invested_capital0
    final_roic = None
    for row in proj_rows:
        reinvest = row.get("reinvestment")
        ebit_at = row.get("ebitAfterTax")
        if reinvest is not None:
            capital += reinvest
        if ebit_at is not None and capital > 0:
            final_roic = ebit_at / capital
    if final_roic is None:
        return []
    benchmark = industry_roic if industry_roic is not None else wacc
    label = "its industry's median return" if industry_roic is not None \
        else "the cost of capital"
    if benchmark is not None and final_roic > max(2.0 * benchmark, benchmark + 0.10):
        out.append({
            "id": "imputed_roic",
            "severity": "warning",
            "detail": (f"The projection's final-year return on cumulative "
                       f"invested capital works out to {final_roic:.0%}, far "
                       f"above {label} ({benchmark:.0%}); the reinvestment "
                       "may be too light for the growth being claimed."),
            "value": round(final_roic, 4),
            "benchmark": round(benchmark, 4),
        })
    return out
