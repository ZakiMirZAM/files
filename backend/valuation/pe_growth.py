"""P/E vs growth and returns, and justified EV/NOPAT (pure arithmetic).

Damodaran, *Investment Valuation* (4th ed.):
- Ch.18: forward P/E = payout ÷ (Ke − g) with payout = 1 − g/ROE, so growth
  raises the P/E only when ROE is above the cost of equity. The two-stage
  form is the book's own equation, reproduced by the tests.
- Ch.17: EV/FCFF = 1 ÷ (WACC − g). With FCFF = NOPAT × (1 − g/ROIC) that is
  the justified EV/NOPAT below.
- Ch.11: historical growth as a geometric average, or as the slope of a
  log-linear regression; neither is meaningful when earnings go negative.

Every function returns None rather than a number when its formula does not
hold (growth at or above the discount rate, a non-positive return).
"""
from __future__ import annotations

import math
import statistics
from typing import Callable, Optional

# ── Single stage ──────────────────────────────────────────────────────────


def fair_forward_pe(roe: float, ke: float, g: float) -> Optional[float]:
    """(1 − g/ROE) ÷ (Ke − g): price over NEXT year's earnings. Needs g below
    both Ke and ROE: growth at or above ROE means a negative payout (new
    shares sold), where the formula stops describing a value."""
    if roe <= 0 or ke <= g or g >= roe:
        return None
    return (1.0 - g / roe) / (ke - g)


def implied_growth(pe: float, roe: float, ke: float) -> Optional[float]:
    """The perpetual growth that makes the fair P/E equal ``pe`` at this ROE.

    Solves pe = (1 − g/ROE)/(Ke − g) for g. No answer when ROE equals Ke (the
    fair P/E is 1/Ke whatever g is) or when the answer would reach Ke."""
    if pe <= 0 or roe <= 0:
        return None
    denom = pe - 1.0 / roe
    if abs(denom) < 1e-12:
        return None
    g = (pe * ke - 1.0) / denom
    return g if -1.0 < g < ke else None   # earnings cannot fall more than 100% a year


def implied_return(pe: float, roe: float, g: float) -> Optional[float]:
    """The return a buyer at ``pe`` earns if earnings grow at g forever:
    r = g + (1 − g/ROE) ÷ P/E (the same equation solved for Ke). Growth at or
    above ROE needs a negative payout, where the inversion no longer holds."""
    if pe <= 0 or roe <= 0 or g >= roe:
        return None
    return g + (1.0 - g / roe) / pe


def growth_premium_share(earnings_yield: float, ke: float) -> Optional[float]:
    """1 − (E/P) ÷ Ke: the share of the price that pays for growth, since
    E ÷ Ke is what the earnings are worth if they never grow."""
    if ke <= 0:
        return None
    return 1.0 - earnings_yield / ke


# ── Two stage (Ch.18) ─────────────────────────────────────────────────────


def two_stage_pe(g: float, n: float, payout: float, ke: float, g_stable: float,
                 payout_stable: float, ke_stable: Optional[float] = None,
                 trailing: bool = False) -> Optional[float]:
    """Ch.18's two-stage P/E: n years at g with ``payout``, then ``g_stable``
    forever with ``payout_stable``. Forward (on next year's EPS) unless
    ``trailing``; the trailing form is the forward one times (1 + g)."""
    ke_st = ke if ke_stable is None else ke_stable
    if ke_st <= g_stable:
        return None
    ratio = (1.0 + g) / (1.0 + ke)
    if abs(ke - g) < 1e-12:
        high = payout * n / (1.0 + ke)          # the limit as g → Ke
    else:
        high = payout * (1.0 - ratio ** n) / (ke - g)
    stable = ((1.0 + g) ** (n - 1) * (1.0 + g_stable) * payout_stable
              / ((ke_st - g_stable) * (1.0 + ke) ** n))
    pe = high + stable
    return pe * (1.0 + g) if trailing else pe


def panel_two_stage_pe(g: float, n: float, roe: float, ke: float,
                       g_stable: float) -> Optional[float]:
    """The panel's two-stage forward P/E: payout 1 − g/ROE while growing,
    then the return on new investment falls to Ke, so payout 1 − g_stable/Ke
    and growth after year n adds no value."""
    if roe <= 0 or ke <= 0:
        return None
    return two_stage_pe(g, n, 1.0 - g / roe, ke, g_stable, 1.0 - g_stable / ke)


def _solve(f: Callable[[float], Optional[float]], target: float,
           lo: float, hi: float, steps: int = 240) -> dict:
    """First x in [lo, hi] where f(x) = target: scan for a sign change, then
    bisect. When f never reaches the target the result names the side it
    falls off ("above" every value, or "below")."""
    xs = [lo + (hi - lo) * i / steps for i in range(steps + 1)]
    ys = [f(x) for x in xs]
    pts = [(x, y) for x, y in zip(xs, ys) if y is not None and math.isfinite(y)]
    if not pts:
        return {"value": None, "bound": None}
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if (y0 - target) * (y1 - target) <= 0:
            for _ in range(80):
                mid = (x0 + x1) / 2.0
                ym = f(mid)
                if ym is None:
                    break
                if (y0 - target) * (ym - target) <= 0:
                    x1 = mid
                else:
                    x0, y0 = mid, ym
            return {"value": (x0 + x1) / 2.0, "bound": None}
    values = [y for _, y in pts]
    return {"value": None, "bound": "above" if target > max(values) else "below"}


def solve_two_stage_growth(pe: float, n: float, roe: float, ke: float,
                           g_stable: float) -> dict:
    """The growth for ``n`` years the P/E implies in the two-stage model.
    A P/E no growth rate reaches comes back as a bound: growth above ROE
    needs a negative payout (new equity), which caps what n years can add."""
    out = _solve(lambda g: panel_two_stage_pe(g, n, roe, ke, g_stable),
                 pe, -0.50, 1.00)
    return {"growth": out["value"], "bound": out["bound"]}


def solve_high_growth_years(pe: float, g: float, roe: float, ke: float,
                            g_stable: float, max_years: float = 60.0) -> dict:
    """How many years of growth at ``g`` the P/E implies. ``bound`` says
    whether the P/E sits above or below everything 0 to ``max_years`` gives."""
    out = _solve(lambda n: panel_two_stage_pe(g, n, roe, ke, g_stable),
                 pe, 0.0, max_years, steps=max(1, int(max_years * 4)))
    return {"years": out["value"], "bound": out["bound"]}


# ── Grid, rate shock, scenarios ───────────────────────────────────────────

_STEPS = (-0.02, -0.01, 0.0, 0.01, 0.02)


def fair_pe_grid(roe: float, ke: float, g: float) -> dict:
    """Fair forward P/E across cost of equity (rows) and growth (columns),
    two points either side of the base case."""
    ke_axis = [ke + d for d in _STEPS]
    g_axis = [g + d for d in _STEPS]
    return {
        "keAxis": ke_axis,
        "growthAxis": g_axis,
        "matrix": [[fair_forward_pe(roe, k, gg) for gg in g_axis] for k in ke_axis],
    }


def stable_growth(rf: float, sustainable_growth: Optional[float]) -> float:
    """Stable growth = retention × ROE, never below zero or above the
    risk-free rate (Ch.12), the rule the P/B panel already applies."""
    return min(rf, max(0.0, sustainable_growth or 0.0))


def rate_shock(roe: float, ke: float, rf: float,
               sustainable_growth: Optional[float], bp: float = 0.01) -> dict:
    """Fair P/E after the risk-free rate moves ``bp`` either way. The cost of
    equity moves with it, and so does the cap on stable growth."""
    def at(shift: float) -> Optional[float]:
        return fair_forward_pe(roe, ke + shift, stable_growth(rf + shift, sustainable_growth))
    return {"up": at(bp), "down": at(-bp)}


def growth_scenarios(rates: dict[str, Optional[float]], roe: float, ke: float,
                     g_stable: float, years: float = 5.0) -> list[dict]:
    """Bear / base / bull from the panel's own growth rates: lowest, middle,
    highest, each held ``years`` in the two-stage model. Missing rates are
    skipped; two rates give bear and bull, one gives base."""
    have = sorted((v, k) for k, v in rates.items() if v is not None)
    names = {1: ["base"], 2: ["bear", "bull"], 3: ["bear", "base", "bull"]}.get(len(have), [])
    return [
        {"case": case, "source": src, "growth": g,
         "fairPe": panel_two_stage_pe(g, years, roe, ke, g_stable)}
        for case, (g, src) in zip(names, have)
    ]


# ── Historical growth (Ch.11) ─────────────────────────────────────────────


def geometric_growth(first: Optional[float], last: Optional[float],
                     years: int) -> Optional[float]:
    """(last ÷ first)^(1/years) − 1; not meaningful when either end is ≤ 0."""
    if first is None or last is None or first <= 0 or last <= 0 or years <= 0:
        return None
    return (last / first) ** (1.0 / years) - 1.0


def log_linear_growth(values: list[Optional[float]]) -> Optional[float]:
    """Slope b of ln(EPS) = a + b·t, returned as a compound rate e^b − 1.
    Needs every value positive (the log does not exist otherwise)."""
    if len(values) < 3 or any(v is None or v <= 0 for v in values):
        return None
    fit = ols(list(range(len(values))), [math.log(v) for v in values])
    return math.exp(fit["slope"]) - 1.0 if fit else None


def ols(xs: list[float], ys: list[float]) -> Optional[dict]:
    """Ordinary least squares y = intercept + slope·x, with R²."""
    if len(xs) < 3 or len(xs) != len(ys):
        return None
    mx, my = statistics.fmean(xs), statistics.fmean(ys)
    sxx = sum((x - mx) ** 2 for x in xs)
    if sxx <= 1e-12:  # equal x values leave float residue, not spread
        return None
    slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx
    intercept = my - slope * mx
    syy = sum((y - my) ** 2 for y in ys)
    ss_res = sum((y - intercept - slope * x) ** 2 for x, y in zip(xs, ys))
    return {"slope": slope, "intercept": intercept,
            "r2": (1.0 - ss_res / syy) if syy > 0 else None}


MIN_PEERS_FOR_FIT = 5   # a line through three or four firms describes nothing


def peer_comparison(peers: list[dict], subject: str) -> dict:
    """Each peer's P/E minus its fair P/E, and a regression of P/E on the
    spread (ROE − Ke) across every peer, subject included. The subject's
    residual is its P/E minus the P/E the line predicts at its spread. No
    line on fewer than ``MIN_PEERS_FOR_FIT`` firms."""
    rows = [
        {**p, "isSubject": p["ticker"] == subject,
         "gap": (p["pe"] - p["fairPe"]) if p.get("fairPe") is not None else None}
        for p in peers
    ]
    fit = (ols([p["spread"] for p in rows], [p["pe"] for p in rows])
           if len(rows) >= MIN_PEERS_FOR_FIT else None)
    me = next((p for p in rows if p["isSubject"]), None)
    subject_out = None
    if fit and me is not None:
        predicted = fit["intercept"] + fit["slope"] * me["spread"]
        subject_out = {"predictedPe": predicted, "residual": me["pe"] - predicted}
    return {
        "peers": rows,
        "regression": {**fit, "n": len(rows)} if fit else None,
        "subject": subject_out,
        "peerCount": len(rows),
    }


# ── Justified EV/NOPAT ────────────────────────────────────────────────────


def justified_ev_nopat(roic: float, wacc: float, g: float) -> Optional[float]:
    """EV ÷ this year's NOPAT the fundamentals justify:
    (1 − g/ROIC)(1 + g) ÷ (WACC − g). When ROIC equals WACC the growth
    term cancels and the multiple is (1 + g) ÷ WACC. Growth at or above ROIC
    needs reinvestment beyond all of NOPAT, so free cash flow turns negative
    and there is no multiple to justify."""
    if roic <= 0 or wacc <= g or g >= roic:
        return None
    return (1.0 - g / roic) * (1.0 + g) / (wacc - g)
