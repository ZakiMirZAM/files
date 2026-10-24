"""Input policies for the damodaran engine (DCF accuracy plan, 2026-09-27).

Each function turns measured history into ONE model input and says where it
came from. Pure: numbers in, numbers out, so every rule is testable against
the evidence that chose it (plan section 0.1, backtest of 81 companies over
FY2015/2018/2020 with 5-year outcomes).

  growth_driver      5-yr ORGANIC revenue trend shrunk 30% toward a base rate
                     (best backtest error 4.3% vs 7.2% for reinvestment x ROIC;
                     revenue is the more persistent series: Damodaran IV-U
                     Ch.11, Mauboussin Base Rate Book, McKinsey growth decay).
  margin_target      current margin if it has been rising, else 5-yr median;
                     cycle average for cyclicals (error 2.52%, bias ~0, vs
                     3.19% / -1.11% for the full-history median).
  stable_growth      decoupled from the high-growth rate: min(rf, long-run
                     nominal growth); declining firms may shrink forever.
  stable_return      return on NEW capital in perpetuity: WACC plus a share of
                     the firm's own excess, capped at WACC + 3 pts (Damodaran
                     2007: "At best, mature firms have earned 2-3% over their
                     cost of capital ... this should represent a cap").
  guard_stable_return  reinvestment g/RONIC never reaches 90%: no negative
                     terminal value can come out of the engine.
"""
from __future__ import annotations

import math
from typing import Optional, Sequence

__all__ = [
    "GROWTH_SHRINK", "GROWTH_BASE_RATE", "REAL_GROWTH_LONG_RUN",
    "STABLE_EXCESS_CAP", "STABLE_RR_MAX", "DECLINE_FLOOR",
    "organic_growth_rates", "growth_driver", "margin_is_cyclical", "margin_target",
    "STABLE_EXCESS_CAP_DURABLE",
    "long_run_nominal_growth", "stable_growth", "excess_share",
    "stable_return", "guard_stable_return",
]

# ponytail: one flat base rate; a size-bucketed table (Mauboussin) is the
# upgrade if the backtest shows large caps biased high.
GROWTH_SHRINK = 0.30           # weight on the base rate
GROWTH_BASE_RATE = 0.05        # long-run nominal revenue growth of listed firms
REAL_GROWTH_LONG_RUN = 0.018   # CBO 2027-36 real GDP projection (~1.7-1.8%)
STABLE_EXCESS_CAP = 0.03       # max perpetual RONIC - WACC, modest advantage
# A durable moat (above WACC in every one of the last five years, by 8+ points
# at the median) may keep up to 6 points forever: Damodaran's patent-protected
# Eli Lilly keeps 15% against an 8.54% cost of capital in stable growth.
STABLE_EXCESS_CAP_DURABLE = 0.06
STABLE_RR_MAX = 0.90           # stable reinvestment g / RONIC ceiling
DECLINE_FLOOR = -0.05          # Damodaran IV-U Ch.12: -5% a year for a shrinking firm
_TREND_YEARS = 5
_CYCLE_YEARS = 10


def organic_growth_rates(revenues: Sequence[Optional[float]],
                         acquired: Sequence[Optional[float]]) -> list[float]:
    """Year-on-year ORGANIC growth: (revenue_t - revenue bought in year t) /
    revenue_{t-1} - 1, for consecutive positive revenues. ``acquired[i]`` is
    the revenue bought in year i (None = no deal or unknown). The bought
    revenue never strips more than that year's gain."""
    out: list[float] = []
    for i in range(1, len(revenues)):
        prev, cur = revenues[i - 1], revenues[i]
        if prev is None or cur is None or prev <= 0 or cur <= 0:
            continue
        bought = (acquired[i] or 0.0) if i < len(acquired) else 0.0
        organic = cur - min(bought, max(cur - prev, 0.0))
        out.append(organic / prev - 1.0)
    return out


def growth_driver(revenues: Sequence[Optional[float]],
                  acquired: Sequence[Optional[float]], *,
                  base_rate: float = GROWTH_BASE_RATE,
                  shrink: float = GROWTH_SHRINK) -> Optional[dict]:
    """The high-growth revenue rate: geometric mean of the last five organic
    YoY rates, shrunk toward the base rate. None with fewer than 3 years."""
    rates = [r for r in organic_growth_rates(revenues, acquired)[-_TREND_YEARS:] if r > -1.0]
    if len(rates) < 3:
        return None
    trend = math.exp(sum(math.log1p(r) for r in rates) / len(rates)) - 1.0
    used = (1.0 - shrink) * trend + shrink * base_rate
    return {"growth": used, "organicTrend": trend, "years": len(rates),
            "baseRate": base_rate, "shrink": shrink}


def margin_is_cyclical(revenues: Sequence[Optional[float]],
                       margins: Sequence[Optional[float]]) -> bool:
    """A margin that rides a cycle: over the last ten years revenue fell in at
    least two years AND the margin's range exceeds half its median. Growth
    swings alone (a hypergrowth year) do not make a margin cyclical."""
    revs = [r for r in revenues if r is not None][-_CYCLE_YEARS:]
    ms = [m for m in margins if m is not None][-_CYCLE_YEARS:]
    if len(revs) < 5 or len(ms) < 5:
        return False
    declines = sum(1 for a, b in zip(revs, revs[1:]) if b < a)
    med = _median(ms)
    return declines >= 2 and med > 0 and (max(ms) - min(ms)) / med > 0.5


def margin_target(margins: Sequence[Optional[float]], *, cyclical: bool) -> Optional[dict]:
    """Operating-margin target for the end of the explicit period.

    Cyclical firms: median of up to ten years (a whole cycle; Graham and
    Dodd's seven-year normal). Otherwise: today's margin when it has risen over
    the last five years and sits at or above their median; else that median.
    None when no margin is on file."""
    ms = [m for m in margins if m is not None]
    if not ms:
        return None
    if cyclical:
        window = ms[-_CYCLE_YEARS:]
        return {"value": _median(window), "source": f"cycle average ({len(window)}-year median)"}
    recent = ms[-_TREND_YEARS:]
    med = _median(recent)
    cur = ms[-1]
    if len(recent) >= 3 and cur > recent[0] and cur >= med:
        return {"value": cur, "source": "current margin (risen over the last five years)"}
    return {"value": med, "source": f"{len(recent)}-year median margin"}


def long_run_nominal_growth(expected_inflation: Optional[float]) -> float:
    """Long-run nominal economy growth: CBO real growth + market breakeven
    inflation (T10YIE); 2.2% inflation when the series is missing."""
    ok = expected_inflation is not None and -0.01 < expected_inflation < 0.10
    return REAL_GROWTH_LONG_RUN + (expected_inflation if ok else 0.022)


def stable_growth(rf: float, nominal_growth: float, g_high: Optional[float], *,
                  declining: bool, basis: str = "min") -> dict:
    """Perpetual growth, independent of the noisy high-growth rate.

    basis "min" (default): min(rf, long-run nominal growth). basis "rf": the
    risk-free rate (Damodaran's consistency rule). A declining firm whose own
    growth is below the cap keeps it, down to DECLINE_FLOOR."""
    cap = rf if basis == "rf" else min(rf, nominal_growth)
    if declining and g_high is not None and g_high < cap:
        return {"value": max(DECLINE_FLOOR, g_high), "basis": basis,
                "source": "declining company: its own growth, floored at -5%"}
    src = "risk-free rate" if (basis == "rf" or rf <= nominal_growth) else "long-run nominal growth"
    return {"value": cap, "basis": basis, "source": src}


def excess_share(own_history: Sequence[Optional[float]], wacc: float) -> tuple[float, str]:
    """How much of its own excess return a firm keeps on new capital forever.

    0.5 when ROIC beat WACC in at least 4 of the last 5 years by >= 8 pts at
    the median; 0.25 for a smaller persistent excess (>= 2 pts); else 0."""
    hist = [r for r in own_history if r is not None][-5:]
    if len(hist) < 4:
        return 0.0, "fewer than four years of returns on file"
    above = sum(1 for r in hist if r > wacc)
    excess = _median(hist) - wacc
    if above == len(hist) and excess >= 0.08:
        return 0.5, (f"return on capital above the cost of capital in {above} of "
                     f"{len(hist)} years, by {excess:.0%} at the median")
    if above >= 4 and excess >= 0.02:
        return 0.25, f"a modest excess return held in {above} of {len(hist)} years"
    return 0.0, "no excess return that has held for most of the last five years"


def stable_return(own_history: Sequence[Optional[float]], wacc_stable: float, *,
                  industry_aggregate: Optional[float] = None,
                  moat_documented: bool = False) -> dict:
    """Return on NEW capital in perpetuity (RONIC).

    RONIC = WACC + share x (own normalized ROIC - WACC), capped at WACC + 3 pts
    unless a moat is documented. A firm whose own normalized ROIC is below WACC
    keeps it (value destroyers stay value destroyers, Damodaran 2016). The
    capital-weighted industry aggregate is reported, never used as the target."""
    hist = [r for r in own_history if r is not None][-5:]
    own = _median(hist) if hist else None
    share, why = excess_share(hist, wacc_stable)
    cap = None if moat_documented else wacc_stable + (
        STABLE_EXCESS_CAP_DURABLE if share == 0.5 else STABLE_EXCESS_CAP)
    if own is None:
        value, source = wacc_stable, "costOfCapital"
    elif own < wacc_stable:
        value, source = own, "ownBelowCostOfCapital"
    else:
        value = wacc_stable + share * (own - wacc_stable)
        source = "costOfCapitalPlusShare"
        if cap is not None and value > cap:
            value, source = cap, "cappedExcess"
    return {"value": value, "source": source, "share": share, "shareReason": why,
            "ownNormalized": own, "industryAggregate": industry_aggregate, "cap": cap}


def guard_stable_return(ronic: float, g_stable: float,
                        wacc_stable: float) -> tuple[float, Optional[dict]]:
    """Keep stable reinvestment g/RONIC below STABLE_RR_MAX. A return too low
    to fund perpetual growth is raised to max(WACC, g / STABLE_RR_MAX) and the
    change is reported; nothing is silent."""
    if g_stable <= 0 or (ronic > 0 and g_stable / ronic < STABLE_RR_MAX):
        return ronic, None
    fixed = max(wacc_stable, g_stable / STABLE_RR_MAX)
    need = f"{g_stable / ronic:.0%}" if ronic > 0 else "more than all"
    return fixed, {
        "id": "stable_return_raised",
        "severity": "warning",
        "detail": (f"A perpetual return of {ronic:.1%} cannot fund {g_stable:.1%} growth "
                   f"forever (it would need {need} of profit reinvested). The return on "
                   f"new capital is raised to {fixed:.1%}."),
        "from": round(ronic, 4), "to": round(fixed, 4),
    }


def _median(vals: Sequence[float]) -> float:
    s = sorted(vals)
    n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2.0
