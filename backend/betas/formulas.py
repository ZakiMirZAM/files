"""
betas/formulas.py — the Chapter 8 math, as pure functions.

Every formula follows Damodaran, *Investment Valuation* (3rd ed.), Chapter 8:
"Estimating Risk Parameters and Costs of Financing". No DB, no network, no
side effects — the worked-example unit tests in test_betas.py replicate the
book's own numbers (Boeing 2000, Embraer 2008, Vans Shoes 2001, Titan Cement
2000) against these functions.

Conventions: ``de_ratio`` is the market-value debt-to-equity ratio expressed as
a decimal (14.22% -> 0.1422); ``tax_rate`` is the MARGINAL tax rate, not the
effective rate; betas are plain floats.
"""

from __future__ import annotations

from dataclasses import dataclass

# Plausibility bounds for bottom-up outputs. Regression betas are deliberately
# NOT clamped (existing capm_discount_rate spec); these apply only to levels
# L1-L4/L6 of the resolver, where a value outside the range signals bad inputs
# rather than information.
BETA_MIN = 0.2
BETA_MAX = 3.0


def unlever_beta(levered_beta: float, de_ratio: float, tax_rate: float) -> float:
    """Hamada unlevering: βu = βL / (1 + (1−t)·(D/E))."""
    return levered_beta / (1.0 + (1.0 - tax_rate) * de_ratio)


def relever_beta(unlevered_beta: float, de_ratio: float, tax_rate: float) -> float:
    """Hamada relevering: βL = βu · (1 + (1−t)·(D/E)) at the firm's own
    market-value D/E and marginal tax rate."""
    return unlevered_beta * (1.0 + (1.0 - tax_rate) * de_ratio)


def cash_correct(unlevered_with_cash: float, cash_pct_firm: float) -> float:
    """Strip cash (β≈0) out of an unlevered beta: βu_business = βu / (1 − cash%).

    Damodaran's published "unlevered beta corrected for cash" column already
    embeds this; the function exists for in-house peer averages and tests."""
    if not 0.0 <= cash_pct_firm < 1.0:
        raise ValueError(f"cash_pct_firm must be in [0, 1), got {cash_pct_firm}")
    return unlevered_with_cash / (1.0 - cash_pct_firm)


def op_leverage_strip(unlevered_beta: float, fixed_to_variable: float) -> float:
    """Remove the comparables' operating leverage: βu_business = βu / (1 + FC/VC)."""
    return unlevered_beta / (1.0 + fixed_to_variable)


def op_leverage_apply(business_beta: float, fixed_to_variable: float) -> float:
    """Apply the target firm's own operating leverage: βu = βu_business · (1 + FC/VC)."""
    return business_beta * (1.0 + fixed_to_variable)


@dataclass(frozen=True)
class SegmentWeight:
    """One business segment's share of firm value."""

    segment: str
    weight: float


def ev_sales_weights(
    segments: list[tuple[str, float, float]],
) -> list[SegmentWeight]:
    """Damodaran's preferred value weights: value_i = revenue_i × (EV/Sales)_i.

    ``segments`` is [(name, revenue, ev_sales_multiple)]. Segments with a
    non-positive revenue or multiple are dropped; weights are renormalized over
    what remains. Empty result means EV/Sales weighting is not possible.
    """
    values = [(name, rev * mult) for name, rev, mult in segments
              if rev > 0 and mult > 0]
    total = sum(v for _, v in values)
    if total <= 0:
        return []
    return [SegmentWeight(name, v / total) for name, v in values]


def revenue_weights(segments: list[tuple[str, float]]) -> list[SegmentWeight]:
    """Fallback weights: plain revenue shares (acceptable simpler approach per
    the book when EV/Sales multiples are unavailable)."""
    values = [(name, rev) for name, rev in segments if rev > 0]
    total = sum(v for _, v in values)
    if total <= 0:
        return []
    return [SegmentWeight(name, v / total) for name, v in values]


def weighted_unlevered_beta(
    weights: list[SegmentWeight], betas: dict[str, float]
) -> float | None:
    """βu_firm = Σ w_i · βu_i over the weighted segments. None if any weighted
    segment has no beta (the caller decides which level to fall through to)."""
    if not weights:
        return None
    total = 0.0
    for w in weights:
        bu = betas.get(w.segment)
        if bu is None:
            return None
        total += w.weight * bu
    return total


def clamp_beta(value: float) -> tuple[float, bool]:
    """Clamp a bottom-up beta into the plausible band. Returns (value, clamped)."""
    if value < BETA_MIN:
        return BETA_MIN, True
    if value > BETA_MAX:
        return BETA_MAX, True
    return value, False


def average_beta_std_error(individual_se: float, n: int) -> float:
    """SE of an n-firm average beta = SE_individual / √n — the statistical case
    for bottom-up betas (Ch. 8)."""
    if n < 1:
        raise ValueError("n must be >= 1")
    return individual_se / (n ** 0.5)
