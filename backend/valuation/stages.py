"""Stage schedules, transition interpolation, cumulated discounting, and the
stable-phase discipline (Damodaran Ch. 12/13/14/15).

The rules hard-wired here (each is a book constraint, not a preference):

  * stable growth cannot exceed the risk-free rate (the proxy for nominal
    economy growth) — enforced by the callers that build g_stable;
  * a stable firm reinvests g/Return — growth is never free (Ch. 12);
  * the FINAL explicit year's reinvestment is computed off the NEXT year's
    (stable) growth, "since growth should lag reinvestment" (Ch. 12, 4th ed);
  * stable-period beta lies in [0.8, 1.2] (two-thirds of US firms do);
  * stable returns anchor toward the industry average, since whole industries
    hold excess returns for long periods, and toward the cost of capital when
    no industry anchor exists;
  * transition years interpolate growth, payout/reinvestment, and the cost of
    capital in linear increments, and are discounted at the CUMULATED cost of
    capital (the Amgen/Coca-Cola convention).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Optional

__all__ = [
    "YearPlan", "STABLE_BETA_MIN", "STABLE_BETA_MAX",
    "stable_beta", "stable_return", "fade_path",
    "build_schedule", "stable_reinvestment_rate",
    "terminal_value_firm", "terminal_value_equity",
    "gordon", "h_model",
]

STABLE_BETA_MIN = 0.8
STABLE_BETA_MAX = 1.2


@dataclass(frozen=True)
class YearPlan:
    t: int                      # 1-based forecast year
    phase: str                  # "high" | "transition"
    growth: float               # growth applied IN this year
    next_growth: float          # growth of year t+1 (drives this year's reinvestment)
    beta: Optional[float]
    cost_of_equity: float
    wacc: Optional[float]
    df_equity: float            # CUMULATED Π(1 + ke_τ), τ = 1..t
    df_firm: Optional[float]    # CUMULATED Π(1 + wacc_τ), τ = 1..t


def stable_beta(beta_now: Optional[float], *, from_high_growth: bool = False) -> float:
    """Ch. 12's stable-period beta policy, split the way the book's own
    examples split it:

      * a firm ARRIVING at stability from high growth converges on the
        market's risk — beta 1.0 (P&G 0.9→1.0, Coca-Cola 0.9→1.0,
        JP Morgan 1.06→1.0);
      * a firm that is ALREADY stable keeps its own beta, clamped to the
        [0.8, 1.2] band a perpetual beta must live in (Con Ed stays 0.80,
        Volkswagen stays 1.20);
      * no beta at all means the market's own risk, beta = 1.
    """
    if from_high_growth or beta_now is None:
        return 1.0
    return min(max(float(beta_now), STABLE_BETA_MIN), STABLE_BETA_MAX)


def stable_return(own: Optional[float],
                  industry: Optional[float],
                  cost_of_capital: float) -> tuple[float, str]:
    """The return on capital (or equity) a firm is allowed to keep earning in
    perpetuity. Ch. 12's ruling: excess returns fade, but snapping them to the
    cost of capital at an instant is unreasonable — anchor toward the INDUSTRY
    average when one exists (whole industries earn excess returns for long
    periods); with no industry anchor, meet the cost of capital halfway; with
    no information at all, zero excess returns."""
    if industry is not None and industry > 0:
        return float(industry), "industryMedian"
    if own is not None and own > 0:
        return (float(own) + cost_of_capital) / 2.0, "fadeTowardCostOfCapital"
    return cost_of_capital, "costOfCapital"


def fade_path(start: float, end: float, steps: int) -> list[float]:
    """Linear increments from just after ``start`` down to exactly ``end`` in
    ``steps`` steps — the book's transition convention (JP Morgan: ke 9.98%
    fades 9.918, 9.856, 9.794, 9.732, 9.67 over five transition years)."""
    if steps <= 0:
        return []
    return [start + (end - start) * j / steps for j in range(1, steps + 1)]


def build_schedule(*,
                   n_high: int,
                   n_transition: int,
                   g_high: float,
                   g_stable: float,
                   beta_high: Optional[float],
                   ke_of_beta: Callable[[Optional[float]], float],
                   wacc_of_beta: Optional[Callable[[Optional[float]], float]] = None,
                   ) -> list[YearPlan]:
    """The year-by-year plan for a 1/2/3-stage model.

    n_high years at (g_high, beta_high), then n_transition years interpolating
    growth and beta linearly to (g_stable, stable_beta(beta_high)); the cost
    of equity/capital follows the drifting beta, and each year's discount
    factor is the CUMULATED product of every year's rate up to it. A 1-stage
    model is the empty schedule (pure perpetuity, no explicit years)."""
    beta_st = stable_beta(beta_high, from_high_growth=True)
    growth_fade = fade_path(g_high, g_stable, n_transition)
    beta_fade = fade_path(beta_high if beta_high is not None else 1.0,
                          beta_st, n_transition)

    plans: list[YearPlan] = []
    df_e = 1.0
    df_f: Optional[float] = 1.0 if wacc_of_beta is not None else None
    total = n_high + n_transition
    for t in range(1, total + 1):
        if t <= n_high:
            phase = "high"
            g = g_high
            b = beta_high
        else:
            phase = "transition"
            j = t - n_high - 1
            g = growth_fade[j]
            b = beta_fade[j]
        # Growth of the year AFTER t — the stable rate once the path ends.
        if t < n_high:
            g_next = g_high
        elif t < total:
            g_next = growth_fade[t - n_high]
        else:
            g_next = g_stable
        ke = ke_of_beta(b)
        df_e *= (1.0 + ke)
        wacc = None
        if wacc_of_beta is not None:
            wacc = wacc_of_beta(b)
            df_f = (df_f or 1.0) * (1.0 + wacc)
        plans.append(YearPlan(t=t, phase=phase, growth=g, next_growth=g_next,
                              beta=b, cost_of_equity=ke, wacc=wacc,
                              df_equity=df_e, df_firm=df_f))
    return plans


def stable_reinvestment_rate(g_stable: float, stable_ret: float) -> Optional[float]:
    """Ch. 12: a firm growing at g forever must reinvest g/Return of its
    after-tax operating income forever. Negative g yields a negative rate —
    the partial-self-liquidation case, kept deliberately. None when the
    stable return carries no signal."""
    if stable_ret is None or stable_ret <= 0:
        return None
    return g_stable / stable_ret


def terminal_value_firm(ebit_after_tax_n: float,
                        g_stable: float,
                        wacc_stable: float,
                        roic_stable: float) -> Optional[dict]:
    """Firm-side stable-growth terminal value:

        RR_stable = g / ROIC_stable
        FCFF_{n+1} = EBIT(1−t)_n × (1 + g) × (1 − RR_stable)
        TV_n = FCFF_{n+1} / (WACC_stable − g)

    None when the perpetuity is unsolvable (WACC ≤ g) or the stable return
    carries no signal — never a negative or fabricated terminal value."""
    rr = stable_reinvestment_rate(g_stable, roic_stable)
    if rr is None or wacc_stable <= g_stable:
        return None
    fcff_next = ebit_after_tax_n * (1.0 + g_stable) * (1.0 - rr)
    return {
        "reinvestmentRate": round(rr, 4),
        "fcffNext": round(fcff_next, 4),
        "value": fcff_next / (wacc_stable - g_stable),
    }


def terminal_value_equity(eps_n: float,
                          g_stable: float,
                          ke_stable: float,
                          roe_stable: float,
                          *,
                          payout_stable: Optional[float] = None) -> Optional[dict]:
    """Equity-side stable-growth terminal value (DDM form):

        payout_stable = 1 − g / ROE_stable   (unless supplied)
        DPS_{n+1} = EPS_n × (1 + g) × payout_stable
        TV_n = DPS_{n+1} / (ke_stable − g)
    """
    if ke_stable <= g_stable:
        return None
    if payout_stable is None:
        if roe_stable is None or roe_stable <= 0:
            return None
        payout_stable = 1.0 - g_stable / roe_stable
    payout_stable = min(max(payout_stable, 0.0), 1.0)
    dps_next = eps_n * (1.0 + g_stable) * payout_stable
    return {
        "payoutStable": round(payout_stable, 4),
        "dpsNext": round(dps_next, 4),
        "value": dps_next / (ke_stable - g_stable),
    }


def gordon(cf_next: float, r: float, g: float) -> Optional[float]:
    """Single-stage perpetuity: CF_{1} / (r − g). None when unsolvable."""
    if r <= g:
        return None
    return cf_next / (r - g)


def h_model(dps0: float, g_a: float, g_n: float, ke: float,
            two_h_years: float) -> Optional[dict]:
    """The H model (Fuller & Hsia; Ch. 13.5): growth declines linearly from
    g_a to g_n over 2H years, payout and cost of equity held constant:

        V = DPS0(1 + g_n)/(ke − g_n)  +  DPS0 × H × (g_a − g_n)/(ke − g_n)

    First term: value of stable growth. Second: value of the extraordinary
    phase. Only meaningful for firms already paying substantial dividends."""
    if ke <= g_n:
        return None
    h = two_h_years / 2.0
    stable_component = dps0 * (1.0 + g_n) / (ke - g_n)
    extraordinary = dps0 * h * (g_a - g_n) / (ke - g_n)
    return {
        "stableComponent": round(stable_component, 4),
        "extraordinaryComponent": round(extraordinary, 4),
        "value": stable_component + extraordinary,
        "hYears": h,
    }
