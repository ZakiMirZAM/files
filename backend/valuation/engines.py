"""Multi-stage model runners (Damodaran Ch. 13 DDM / Ch. 14 FCFE / Ch. 15 FCFF).

Pure functions: every input is explicit, nothing reads a database or an env
var, so the book's worked examples replicate directly in tests. The Phase-3
orchestrator (compute_intrinsic_valuation) feeds these from FirmInputs and the
model selector.

Shared mechanics (see stages.py for the stable-phase rules):
  * explicit years follow a build_schedule() plan — high phase constant,
    transition linear, discounting at the CUMULATED cost of equity/capital;
  * the FINAL explicit year's reinvestment/payout is computed off the STABLE
    growth rate ("growth lags reinvestment", Ch. 12 4th ed) — this is what
    makes terminal value invariant to g when the stable return equals the
    cost of capital (the Alloy Mills theorem);
  * negative FCFE years keep their negative present values — that IS the
    dilution cost of future equity issues; no share-count adjustment (Ch. 14);
  * an unsolvable perpetuity returns None, never a fabricated value.
"""
from __future__ import annotations

from typing import Callable, Optional

from .stages import (
    build_schedule,
    gordon,
    stable_beta,
    stable_reinvestment_rate,
    terminal_value_equity,
    terminal_value_firm,
)

__all__ = ["run_ddm", "run_fcfe", "run_fcff", "run_fcff_revenue",
           "fcff_stage_variants", "STAGE_SHAPES"]

# Stage count → (constant high-growth years, linear transition years).
# 2-stage = P&G's five-and-drop; 3-stage = the Amgen/Coca-Cola 5 + 5.
STAGE_SHAPES: dict[int, tuple[int, int]] = {1: (0, 0), 2: (5, 0), 3: (5, 5)}
# The n-stage revenue-driven path (young/loss-making firms): inputs change
# every year for a decade — an all-transition schedule.
NSTAGE_SHAPE: tuple[int, int] = (0, 10)


def _payout_path(payout_high: float, payout_stable: float,
                 n_high: int, n_transition: int) -> list[float]:
    """Payout (or its reinvestment-rate mirror) per explicit year: constant in
    the high phase, linear increments through the transition."""
    path = [payout_high] * n_high
    for j in range(1, n_transition + 1):
        path.append(payout_high + (payout_stable - payout_high) * j / n_transition)
    return path


def run_ddm(*,
            eps0: float,
            payout_high: float,
            g_high: float,
            g_stable: float,
            ke_of_beta: Callable[[Optional[float]], float],
            beta_high: Optional[float],
            roe_stable: float,
            n_high: int,
            n_transition: int = 0,
            payout_stable: Optional[float] = None) -> Optional[dict]:
    """Dividend discount model, 1/2/3-stage by (n_high, n_transition).

    1-stage (both zero): Gordon growth off today's dividend.
    2-stage: constant high growth then an abrupt drop to stable.
    3-stage: high phase, linear transition of growth/payout/cost of equity
    (cumulated discounting), then stable.
    Stable payout is 1 − g/ROE_stable unless supplied (Ch. 13 consistency)."""
    if eps0 is None or eps0 <= 0:
        return None
    ke_stable = ke_of_beta(stable_beta(
        beta_high, from_high_growth=(n_high + n_transition) > 0))

    if n_high == 0 and n_transition == 0:
        dps0 = eps0 * payout_high
        if dps0 <= 0:
            return None
        value = gordon(dps0 * (1.0 + g_stable), ke_stable, g_stable)
        if value is None:
            return None
        return {
            "stageCount": 1,
            "intrinsicPerShare": value,
            "growthInitial": g_stable,
            "growthTerminal": g_stable,
            "costOfEquityStable": round(ke_stable, 4),
            "rows": [],
            "pvDividends": 0.0,
            "pvTerminal": value,
        }

    plans = build_schedule(n_high=n_high, n_transition=n_transition,
                           g_high=g_high, g_stable=g_stable,
                           beta_high=beta_high, ke_of_beta=ke_of_beta)
    # The high phase pays the HIGH payout through its final year (P&G's own
    # two-stage keeps 50% payout in year 5); only the terminal value switches
    # to the stable payout. A transition fades payout linearly and ends
    # exactly at the stable level (the JP Morgan convention).
    tv_probe = terminal_value_equity(1.0, g_stable, ke_stable, roe_stable,
                                     payout_stable=payout_stable)
    if tv_probe is None:
        return None
    payout_st = tv_probe["payoutStable"]
    payouts = _payout_path(payout_high, payout_st, n_high, n_transition)

    rows = []
    eps = eps0
    pv_div = 0.0
    for plan, payout in zip(plans, payouts):
        eps *= (1.0 + plan.growth)
        dps = eps * payout
        pv = dps / plan.df_equity
        pv_div += pv
        rows.append({
            "year": plan.t, "phase": plan.phase,
            "growth": round(plan.growth, 4), "eps": round(eps, 4),
            "payout": round(payout, 4), "dps": round(dps, 4),
            "costOfEquity": round(plan.cost_of_equity, 4),
            "discountFactor": round(plan.df_equity, 6),
            "pv": round(pv, 4),
        })

    tv = terminal_value_equity(eps, g_stable, ke_stable, roe_stable,
                               payout_stable=payout_stable)
    if tv is None:
        return None
    pv_terminal = tv["value"] / plans[-1].df_equity
    return {
        "stageCount": 3 if n_transition else 2,
        "intrinsicPerShare": pv_div + pv_terminal,
        "growthInitial": g_high,
        "growthTerminal": g_stable,
        "payoutStable": tv["payoutStable"],
        "costOfEquityStable": round(ke_stable, 4),
        "terminalValue": round(tv["value"], 4),
        "pvDividends": round(pv_div, 4),
        "pvTerminal": round(pv_terminal, 4),
        "rows": rows,
    }


def run_fcfe(*,
             ni0: float,
             err_high: float,
             g_high: float,
             g_stable: float,
             ke_of_beta: Callable[[Optional[float]], float],
             beta_high: Optional[float],
             roe_stable: float,
             n_high: int,
             n_transition: int = 0) -> Optional[dict]:
    """FCFE model, 1/2/3-stage: FCFE_t = NI_t × (1 − ERR_t), with the equity
    reinvestment rate fading from its high-phase level to the stable
    g/ROE_stable (Ch. 14's E-model structure). Negative FCFE years keep their
    negative present values — the dilution rule."""
    if ni0 is None or ni0 <= 0:
        return None
    ke_stable = ke_of_beta(stable_beta(
        beta_high, from_high_growth=(n_high + n_transition) > 0))
    err_stable = stable_reinvestment_rate(g_stable, roe_stable)
    if err_stable is None:
        return None

    if n_high == 0 and n_transition == 0:
        fcfe_next = ni0 * (1.0 + g_stable) * (1.0 - err_stable)
        value = gordon(fcfe_next, ke_stable, g_stable)
        if value is None:
            return None
        return {
            "stageCount": 1,
            "equityValue": value,
            "growthInitial": g_stable,
            "growthTerminal": g_stable,
            "equityReinvestmentStable": round(err_stable, 4),
            "costOfEquityStable": round(ke_stable, 4),
            "rows": [],
            "pvFcfe": 0.0,
            "pvTerminal": value,
        }

    plans = build_schedule(n_high=n_high, n_transition=n_transition,
                           g_high=g_high, g_stable=g_stable,
                           beta_high=beta_high, ke_of_beta=ke_of_beta)
    # High phase reinvests at the high rate through its final year (the
    # Illustration 14.3 trap is about the TERMINAL year's reinvestment, not
    # the explicit years); a transition fades ERR and ends at the stable rate.
    errs = _payout_path(err_high, err_stable, n_high, n_transition)

    rows = []
    ni = ni0
    pv_fcfe = 0.0
    for plan, err in zip(plans, errs):
        ni *= (1.0 + plan.growth)
        fcfe = ni * (1.0 - err)
        pv = fcfe / plan.df_equity   # negative stays negative: dilution cost
        pv_fcfe += pv
        rows.append({
            "year": plan.t, "phase": plan.phase,
            "growth": round(plan.growth, 4), "netIncome": round(ni, 4),
            "equityReinvestmentRate": round(err, 4), "fcfe": round(fcfe, 4),
            "costOfEquity": round(plan.cost_of_equity, 4),
            "discountFactor": round(plan.df_equity, 6),
            "pv": round(pv, 4),
        })

    fcfe_next = ni * (1.0 + g_stable) * (1.0 - err_stable)
    tv = gordon(fcfe_next, ke_stable, g_stable)
    if tv is None:
        return None
    pv_terminal = tv / plans[-1].df_equity
    return {
        "stageCount": 3 if n_transition else 2,
        "equityValue": pv_fcfe + pv_terminal,
        "growthInitial": g_high,
        "growthTerminal": g_stable,
        "equityReinvestmentStable": round(err_stable, 4),
        "costOfEquityStable": round(ke_stable, 4),
        "terminalValue": round(tv, 4),
        "pvFcfe": round(pv_fcfe, 4),
        "pvTerminal": round(pv_terminal, 4),
        "rows": rows,
    }


def run_fcff(*,
             ebit_after_tax0: float,
             g_high: float,
             g_stable: float,
             roic_high: float,
             roic_stable: float,
             wacc_of_beta: Callable[[Optional[float]], float],
             beta_high: Optional[float],
             n_high: int,
             n_transition: int = 0) -> Optional[dict]:
    """FCFF firm model, 1/2/3-stage, driven off after-tax operating income:

        RR_t   = g_{t+1} / ROIC_t      (growth lags reinvestment)
        FCFF_t = EBIT(1−t)_t × (1 − RR_t)
        TV_n   = EBIT(1−t)_n (1+g)(1 − g/ROIC_stable) / (WACC_stable − g)

    The RR convention makes the Alloy Mills theorem hold exactly: with
    ROIC_stable = WACC, firm value is invariant to the stable growth rate."""
    if ebit_after_tax0 is None or ebit_after_tax0 <= 0:
        return None
    if roic_high is None or roic_high <= 0:
        return None
    wacc_stable = wacc_of_beta(stable_beta(
        beta_high, from_high_growth=(n_high + n_transition) > 0))

    if n_high == 0 and n_transition == 0:
        tv = terminal_value_firm(ebit_after_tax0, g_stable, wacc_stable,
                                 roic_stable)
        if tv is None:
            return None
        return {
            "stageCount": 1,
            "firmValue": tv["value"],
            "growthInitial": g_stable,
            "growthTerminal": g_stable,
            "reinvestmentStable": tv["reinvestmentRate"],
            "waccStable": round(wacc_stable, 4),
            "rows": [],
            "pvFcff": 0.0,
            "pvTerminal": tv["value"],
        }

    plans = build_schedule(n_high=n_high, n_transition=n_transition,
                           g_high=g_high, g_stable=g_stable,
                           beta_high=beta_high, ke_of_beta=wacc_of_beta,
                           wacc_of_beta=wacc_of_beta)
    roic_path = ([roic_high] * n_high
                 + [roic_high + (roic_stable - roic_high) * j / n_transition
                    for j in range(1, n_transition + 1)])

    rows = []
    ebit_at = ebit_after_tax0
    pv_fcff = 0.0
    for plan, roic_t in zip(plans, roic_path):
        ebit_at *= (1.0 + plan.growth)
        # Reinvestment funds NEXT year's growth at this year's return quality;
        # in the final explicit year that is the stable pair g/ROIC_stable.
        if plan.t == plans[-1].t:
            rr = stable_reinvestment_rate(g_stable, roic_stable)
        else:
            rr = stable_reinvestment_rate(plan.next_growth, roic_t)
        if rr is None:
            return None
        fcff = ebit_at * (1.0 - rr)
        pv = fcff / (plan.df_firm or plan.df_equity)
        pv_fcff += pv
        rows.append({
            "year": plan.t, "phase": plan.phase,
            "growth": round(plan.growth, 4),
            "ebitAfterTax": round(ebit_at, 4),
            "roic": round(roic_t, 4),
            "reinvestmentRate": round(rr, 4),
            "reinvestment": round(ebit_at * rr, 4),
            "fcff": round(fcff, 4),
            "wacc": round(plan.wacc if plan.wacc is not None else plan.cost_of_equity, 4),
            "discountFactor": round(plan.df_firm or plan.df_equity, 6),
            "pvFcff": round(pv, 4),
        })

    tv = terminal_value_firm(ebit_at, g_stable, wacc_stable, roic_stable)
    if tv is None:
        return None
    df_n = plans[-1].df_firm or plans[-1].df_equity
    pv_terminal = tv["value"] / df_n
    return {
        "stageCount": 3 if n_transition else 2,
        "firmValue": pv_fcff + pv_terminal,
        "growthInitial": g_high,
        "growthTerminal": g_stable,
        "reinvestmentStable": tv["reinvestmentRate"],
        "waccStable": round(wacc_stable, 4),
        "terminalValue": round(tv["value"], 4),
        "pvFcff": round(pv_fcff, 4),
        "pvTerminal": round(pv_terminal, 4),
        "rows": rows,
    }


def run_fcff_revenue(*,
                     base_revenue: float,
                     margin_cur: float,
                     margin_tgt: float,
                     tax: float,
                     g_high: float,
                     g_stable: float,
                     n_high: int,
                     n_transition: int,
                     wacc_of_beta: Callable[[Optional[float]], float],
                     beta_high: Optional[float],
                     roic_high: Optional[float] = None,
                     roic_stable: Optional[float] = None,
                     reinvest_method: str = "earnings",
                     sales_to_capital: Optional[float] = None,
                     equity_adjust: float = 0.0,
                     shares: Optional[float] = None) -> Optional[dict]:
    """Revenue-driven multi-stage FCFF valuation — the production engine behind
    every stage variant (the pure ``run_fcff`` above is the EBIT-driven form
    the book's worked examples replicate).

    Mechanics per year: revenue compounds along the stage schedule; the
    operating margin fades linearly across the whole explicit period from
    today's to the target (unchanged from the legacy engine — a margin story
    is a company trajectory, not a stage artifact); reinvestment funds NEXT
    year's growth at this year's return (RR_t = g_{t+1}/ROIC_t, the rule that
    makes terminal value invariant to g when returns equal the cost of
    capital), or tracks added revenue via sales-to-capital for firms whose
    earnings carry no signal; the discount rate follows the drifting beta with
    CUMULATED factors; the terminal reinvests g/ROIC_stable forever.

    1-stage (n_high = n_transition = 0) is the stable-growth perpetuity off
    the CURRENT margin. Returns None when the inputs cannot support the model
    — never a fabricated value."""
    use_s2c = reinvest_method == "salesToCapital"
    if (base_revenue is None or base_revenue <= 0
            or margin_cur is None or margin_tgt is None
            or shares is None or shares <= 0):
        return None
    if use_s2c:
        if sales_to_capital is None or sales_to_capital <= 0:
            return None
    elif roic_high is None or roic_high <= 0:
        return None

    total = n_high + n_transition
    wacc_stable = wacc_of_beta(stable_beta(beta_high,
                                           from_high_growth=total > 0))

    if total == 0:
        ebit_at0 = base_revenue * margin_cur * (1.0 - tax)
        if ebit_at0 <= 0:
            return None
        ret_stable = roic_stable if roic_stable else roic_high
        tv = terminal_value_firm(ebit_at0, g_stable, wacc_stable,
                                 ret_stable or 0.0)
        if tv is None:
            return None
        firm_value = tv["value"]
        equity_value = firm_value + (equity_adjust or 0.0)
        return {
            "rows": [],
            "pvExplicit": 0.0,
            "fcffTerminal": tv["fcffNext"],
            "terminalValue": round(firm_value, 2),
            "pvTerminal": round(firm_value, 2),
            "firmValue": round(firm_value, 2),
            "equityValue": round(equity_value, 2),
            "intrinsicPerShare": round(equity_value / shares, 2),
            "stageCount": 1,
            "nHigh": 0, "nTransition": 0,
            "waccStable": round(wacc_stable, 4),
            "reinvestmentStable": tv["reinvestmentRate"],
        }

    plans = build_schedule(n_high=n_high, n_transition=n_transition,
                           g_high=g_high, g_stable=g_stable,
                           beta_high=beta_high, ke_of_beta=wacc_of_beta,
                           wacc_of_beta=wacc_of_beta)
    roic_path: list[Optional[float]] = []
    for plan in plans:
        if roic_high is None:
            roic_path.append(None)
        elif plan.phase == "high" or n_transition == 0:
            roic_path.append(roic_high)
        else:
            j = plan.t - n_high
            target = roic_stable if roic_stable else roic_high
            roic_path.append(roic_high + (target - roic_high) * j / n_transition)

    pv_explicit = 0.0
    rev = base_revenue
    ebit_after_tax = 0.0
    proj_rows: list[dict] = []
    for plan, roic_t in zip(plans, roic_path):
        frac = (plan.t - 1) / (total - 1) if total > 1 else 1.0
        margin_t = margin_cur + (margin_tgt - margin_cur) * frac
        prev_rev = rev
        rev = rev * (1.0 + plan.growth)
        ebit = rev * margin_t
        ebit_after_tax = ebit * (1.0 - tax)
        if use_s2c:
            reinvestment = max(0.0, (rev - prev_rev) / sales_to_capital)
            reinvest_rate = (reinvestment / ebit_after_tax) if ebit_after_tax else None
        else:
            # The earnings bridge is meaningless on a non-positive earnings
            # base — mirror the 1-stage branch's refusal instead of silently
            # producing a plausible-but-wrong value. (The sales-to-capital
            # path above is the structure for loss-making years.)
            if ebit_after_tax <= 0:
                return None
            # Growth lags reinvestment: this year's plowback funds NEXT year's
            # growth at this year's return quality (the final explicit year
            # already sets aside the stable pair).
            if plan.t == plans[-1].t:
                rr = stable_reinvestment_rate(
                    g_stable, roic_stable if roic_stable else roic_t)
            else:
                rr = stable_reinvestment_rate(plan.next_growth, roic_t)
            if rr is None:
                return None
            reinvest_rate = rr
            reinvestment = ebit_after_tax * rr
        fcff = ebit_after_tax - reinvestment
        df = plan.df_firm or plan.df_equity
        pv = fcff / df
        pv_explicit += pv
        proj_rows.append({
            "year": plan.t,
            "phase": plan.phase,
            "growth": round(plan.growth, 4),
            "revenue": round(rev, 2),
            "operatingMargin": round(margin_t, 4),
            "taxRate": round(tax, 4),
            "ebit": round(ebit, 2),
            "ebitAfterTax": round(ebit_after_tax, 2),
            "roic": round(roic_t, 4) if roic_t is not None else None,
            "reinvestmentRate": (round(reinvest_rate, 4)
                                 if reinvest_rate is not None else None),
            "reinvestment": round(reinvestment, 2),
            "fcff": round(fcff, 2),
            "wacc": round(plan.wacc if plan.wacc is not None
                          else plan.cost_of_equity, 4),
            "discountFactor": round(df, 6),
            "pvFcff": round(pv, 2),
        })

    ret_stable = roic_stable if roic_stable else roic_path[-1]
    if ret_stable is not None and ret_stable > 0:
        tv = terminal_value_firm(ebit_after_tax, g_stable, wacc_stable,
                                 ret_stable)
        if tv is None:
            return None
        fcff_terminal = tv["fcffNext"]
        terminal_value = tv["value"]
        reinvest_stable = tv["reinvestmentRate"]
    else:
        # No positive return even at the horizon: reinvest to hold terminal
        # revenue growth via sales-to-capital (the legacy convention).
        if wacc_stable <= g_stable:
            return None
        reinvest_term = (max(0.0, (rev * g_stable) / sales_to_capital)
                         if sales_to_capital else 0.0)
        fcff_terminal = ebit_after_tax * (1.0 + g_stable) - reinvest_term
        terminal_value = fcff_terminal / (wacc_stable - g_stable)
        reinvest_stable = None
    df_n = plans[-1].df_firm or plans[-1].df_equity
    pv_terminal = terminal_value / df_n

    firm_value = pv_explicit + pv_terminal
    equity_value = firm_value + (equity_adjust or 0.0)
    return {
        "rows": proj_rows,
        "pvExplicit": round(pv_explicit, 2),
        "fcffTerminal": round(fcff_terminal, 2),
        "terminalValue": round(terminal_value, 2),
        "pvTerminal": round(pv_terminal, 2),
        "firmValue": round(firm_value, 2),
        "equityValue": round(equity_value, 2),
        "intrinsicPerShare": round(equity_value / shares, 2),
        "stageCount": 3 if n_transition else (2 if n_high else 1),
        "nHigh": n_high, "nTransition": n_transition,
        "waccStable": round(wacc_stable, 4),
        "reinvestmentStable": reinvest_stable,
    }


def _mos(intrinsic: Optional[float], price: Optional[float]) -> Optional[float]:
    if intrinsic is None or price is None or price <= 0:
        return None
    return round((intrinsic - price) / price, 4)


def _accuracy_note(stage_count: int, recommended: int,
                   track: str, g_high: float, g_stable: float) -> str:
    """One-sentence teaching note on why this stage count fits or misfits."""
    gap = g_high - g_stable
    if track == "nstage" and stage_count == 3:
        return ("The n-stage path lets growth, margin and reinvestment change "
                "every year, which is the only honest structure for a company "
                "whose earnings carry no signal yet.")
    if stage_count == recommended:
        if stage_count == 1:
            return ("Growth at or below the risk-free rate with no meaningful "
                    "excess returns is stable growth already; adding explicit "
                    "years would invent a high-growth phase that does not "
                    "exist.")
        if stage_count == 2:
            return ("A five-year window at the measured growth rate with an "
                    "abrupt shift to stable growth fits a moderate advantage; "
                    "a transition phase would add inputs without adding "
                    "information.")
        return ("Growth this far above the stable rate cannot vanish "
                "overnight; the five-year transition lets growth, "
                "reinvestment and the discount rate descend together.")
    if stage_count == 1:
        return (f"A single-stage model locks today's economics in forever and "
                f"ignores the measured {g_high:.0%} growth phase entirely; it "
                "understates a company still compounding above the stable "
                "rate.")
    if stage_count == 2:
        if gap > 0.15:
            return (f"A two-stage model forces growth to fall from "
                    f"{g_high:.0%} to {g_stable:.0%} overnight after year "
                    "five, which cuts off the transition years a decline this "
                    "large actually takes.")
        return ("A two-stage model fits a moderate grower; for this company "
                "it trades a little realism in the hand-off year for a "
                "simpler set of inputs.")
    return ("A three-stage model adds a transition phase this company's "
            "modest growth gap does not require; the extra inputs add "
            "estimation noise more than information.")


def fcff_stage_variants(*,
                        base_revenue: float,
                        margin_cur: float,
                        margin_tgt: float,
                        tax: float,
                        g_high: float,
                        g_stable: float,
                        wacc_of_beta: Callable[[Optional[float]], float],
                        beta_high: Optional[float],
                        roic_high: Optional[float],
                        roic_stable: Optional[float],
                        roic_stable_source: str,
                        reinvest_method: str,
                        sales_to_capital: Optional[float],
                        equity_adjust: float,
                        shares: Optional[float],
                        price: Optional[float],
                        track: str,
                        recommended_stages: int) -> dict:
    """Every applicable stage-count variant of the firm-side valuation, each
    with its own intrinsic value, margin of safety and accuracy note. A
    structurally invalid variant is reported as {"applicable": False,
    "reason"} rather than omitted, so the UI can teach why."""
    variants: dict[str, dict] = {}
    for stage_count, (n_h, n_t) in STAGE_SHAPES.items():
        if track == "nstage":
            if stage_count in (1, 2):
                variants[str(stage_count)] = {
                    "applicable": False,
                    "reason": ("With negative earnings there is no stable or "
                               "high-growth earnings base to anchor a "
                               f"{stage_count}-stage model; the revenue-driven "
                               "n-stage path is the workable structure."),
                }
                continue
            n_h, n_t = NSTAGE_SHAPE
        out = run_fcff_revenue(
            base_revenue=base_revenue, margin_cur=margin_cur,
            margin_tgt=margin_tgt, tax=tax,
            g_high=g_high, g_stable=g_stable, n_high=n_h, n_transition=n_t,
            wacc_of_beta=wacc_of_beta, beta_high=beta_high,
            roic_high=roic_high, roic_stable=roic_stable,
            reinvest_method=reinvest_method,
            sales_to_capital=sales_to_capital,
            equity_adjust=equity_adjust, shares=shares)
        if out is None:
            variants[str(stage_count)] = {
                "applicable": False,
                "reason": ("The inputs cannot support this structure (the "
                           "stable-phase discount rate does not clear the "
                           "growth rate, or the base earnings are not "
                           "positive)."),
            }
            continue
        variants[str(stage_count)] = {
            "applicable": True,
            "intrinsicPerShare": out["intrinsicPerShare"],
            "marginOfSafety": _mos(out["intrinsicPerShare"], price),
            "stageCount": stage_count,
            "nHigh": out["nHigh"], "nTransition": out["nTransition"],
            "growthInitial": round(g_high if (out["nHigh"] + out["nTransition"]) else g_stable, 4),
            "growthTerminal": round(g_stable, 4),
            "waccStable": out["waccStable"],
            "reinvestmentStable": out["reinvestmentStable"],
            # The provenance label only means something on the earnings path;
            # a sales-to-capital variant never touched the ROIC anchor.
            "roicStableSource": (roic_stable_source
                                 if reinvest_method == "earnings" else None),
            "terminalValue": out["terminalValue"],
            "pvExplicit": out["pvExplicit"],
            "pvTerminal": out["pvTerminal"],
            "accuracyNote": _accuracy_note(stage_count, recommended_stages,
                                           track, g_high, g_stable),
            "rows": out["rows"],
            "raw": out,
        }
    return variants


def ddm_stage_variants(*,
                       eps0: float,
                       payout_high: float,
                       g_high: float,
                       g_stable: float,
                       ke_of_beta: Callable[[Optional[float]], float],
                       beta_high: Optional[float],
                       roe_stable: float,
                       price: Optional[float],
                       recommended_stages: int) -> dict:
    """Every applicable stage-count variant of the dividend discount model,
    mirroring fcff_stage_variants: intrinsic value, margin of safety and an
    accuracy note per variant; invalid structures carry their reason."""
    variants: dict[str, dict] = {}
    for stage_count, (n_h, n_t) in STAGE_SHAPES.items():
        out = run_ddm(eps0=eps0, payout_high=payout_high, g_high=g_high,
                      g_stable=g_stable, ke_of_beta=ke_of_beta,
                      beta_high=beta_high, roe_stable=roe_stable,
                      n_high=n_h, n_transition=n_t)
        if out is None:
            variants[str(stage_count)] = {
                "applicable": False,
                "reason": ("The inputs cannot support this structure (no "
                           "positive dividend base, or the stable cost of "
                           "equity does not clear the growth rate)."),
            }
            continue
        intrinsic = round(out["intrinsicPerShare"], 2)
        variants[str(stage_count)] = {
            "applicable": True,
            "intrinsicPerShare": intrinsic,
            "marginOfSafety": _mos(intrinsic, price),
            "stageCount": stage_count,
            "nHigh": n_h, "nTransition": n_t,
            "growthInitial": round(g_high if (n_h + n_t) else g_stable, 4),
            "growthTerminal": round(g_stable, 4),
            "payoutStable": out.get("payoutStable"),
            "costOfEquityStable": out.get("costOfEquityStable"),
            "terminalValue": out.get("terminalValue"),
            "pvDividends": out.get("pvDividends"),
            "pvTerminal": out.get("pvTerminal"),
            "accuracyNote": _accuracy_note(stage_count, recommended_stages,
                                           "ddm", g_high, g_stable),
            "rows": out["rows"],
            "raw": out,
        }
    return variants
