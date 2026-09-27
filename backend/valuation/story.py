"""Story valuation: a company narrative's numbers run through the production engine.

Pure: no database, no env var, no network. The page's own model numbers come in
as ModelInputs; the user's story comes in as StoryInputs, where every field is
optional and None means "keep the model's number". Each story input is either
applied or kept, and a kept input carries the rule that kept it, so the page can
say why.

Method (citations stay in code, never in user-facing copy):
  * Narrative and Numbers Ch.7: a story becomes numbers through the total
    market, the share of it the company wins, the target operating margin and
    the sales-to-capital ratio that prices the growth.
  * Narrative and Numbers Ch.8 and Ch.9: the ten-year path (five high-growth
    years, five linear transition years, the 3-stage default) and the failure adjustment
    value = value if the story works x (1 - p) + distress proceeds x p
    (Uber, Table 9.2). test_story_valuation.py replicates Ferrari's
    alternative stories (Tables 9.4 and 9.5) through the engine, and 9.4
    through value_story as well.
  * Investment Valuation Ch.12: stable growth never exceeds the risk-free rate,
    and a stable firm must earn more than it grows to fund that growth. The
    story picks the stage count ("Length of the High-Growth Period"; Narrative
    and Numbers Ch.14 life cycle): 1 stage is a mature firm already near the
    economy's growth, 2 stages a high-growth period that ends abruptly, 3 stages
    high growth that fades gradually.
  * Investment Valuation Ch.22: cumulative default rates by rating class
    (Table 22.8, 10-year column) as a starting point for the failure probability.

The cost of capital is always the site's own: it is injected as the engine's
wacc_of_beta callable and is never a story input.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from .engines import STAGE_SHAPES, run_fcff_revenue
from .stages import fade_path

__all__ = [
    "INPUT_NAMES", "STORY_SHAPE", "TEN_YEAR_DEFAULT_RATE",
    "RULE_MISSING", "RULE_REVENUE_INCOMPLETE", "RULE_SHARE_ABOVE_100",
    "RULE_GROWTH_UNSOLVABLE", "RULE_MARGIN_AT_100", "RULE_ROIC_NOT_ABOVE_GROWTH",
    "RULE_ONE_STAGE",
    "ModelInputs", "StoryInputs",
    "rating_class", "year10_revenue", "stable_growth", "solve_high_growth",
    "iron_triangle", "failure_adjusted", "resolve_story", "value_story",
    "story_sensitivity",
]

INPUT_NAMES = ("totalMarket", "marketGrowth10y", "shareYear10", "targetMargin",
               "salesToCapital", "failureProbability", "distressProceeds", "stableRoic")
STORY_SHAPE = STAGE_SHAPES[3]            # (5, 5): the default when the story names no stage count
_YEARS = 10                              # the story's market and share are always year-10 figures

# Investment Valuation Table 22.8, cumulative default rate over 10 years.
TEN_YEAR_DEFAULT_RATE = {"AAA": 0.0070, "AA": 0.0072, "A": 0.0124, "BBB": 0.0332,
                         "BB": 0.1178, "B": 0.2374, "CCC/C": 0.5038}

RULE_MISSING = "missingInput"
RULE_REVENUE_INCOMPLETE = "revenueNeedsAllThree"
RULE_SHARE_ABOVE_100 = "shareAbove100"
RULE_GROWTH_UNSOLVABLE = "growthUnsolvable"
RULE_MARGIN_AT_100 = "marginAtOrAbove100"
RULE_ROIC_NOT_ABOVE_GROWTH = "stableRoicNotAboveStableGrowth"
RULE_ONE_STAGE = "oneStageNoHighGrowth"

_PLAIN_CLASSES = {"AAA", "AA", "A", "BBB", "BB", "B"}
_DISTRESSED_CLASSES = {"CCC", "CC", "C", "D"}


@dataclass(frozen=True)
class ModelInputs:
    """The model's own numbers, as the page's forecast carries them."""
    base_revenue: float
    margin_cur: float
    margin_tgt: float
    tax: float
    g_high: float
    rf: float
    roic: float | None
    roic_stable: float | None
    reinvest_method: str      # "earnings" | "salesToCapital"
    sales_to_capital: float | None
    equity_adjust: float
    shares: float
    beta: float | None


@dataclass(frozen=True)
class StoryInputs:
    """Every field optional; None keeps the model's number."""
    total_market: float | None = None
    market_growth: float | None = None
    share_year10: float | None = None
    target_margin: float | None = None
    sales_to_capital: float | None = None
    failure_probability: float | None = None
    distress_proceeds: float | None = None
    stable_roic: float | None = None
    stages: int | None = None           # 1, 2 or 3; anything else runs 3


def rating_class(letter: str | None) -> str | None:
    """The default-table class of a synthetic rating such as "A3/A-" (-> "A")."""
    if not letter:
        return None
    grade = letter.rsplit("/", 1)[-1].strip().rstrip("+-")
    if grade in _PLAIN_CLASSES:
        return grade
    if grade in _DISTRESSED_CLASSES:
        return "CCC/C"
    return None


def year10_revenue(total_market: float, market_growth: float, share: float) -> float:
    """Narrative and Numbers Ch.7: the market in year 10 times the share won."""
    return total_market * (1.0 + market_growth) ** _YEARS * share


def stable_growth(g_high: float, rf: float) -> float:
    """Investment Valuation Ch.12: never above the risk-free rate, never below zero."""
    return min(rf, max(0.0, g_high))


def _stage_count(stages: int | None) -> int:
    return stages if stages in STAGE_SHAPES else 3


def _revenue_after_path(base_revenue: float, g: float, rf: float, stages: int = 3) -> float:
    """Year-10 revenue on the growth path build_schedule applies for the stage
    count, carried at stable growth past the explicit years (a 2-stage path has
    five; a 1-stage path has none and grows at stable growth throughout)."""
    n_high, n_transition = STAGE_SHAPES[stages]
    g_stable = stable_growth(g, rf)
    path = [g] * n_high + fade_path(g, g_stable, n_transition)
    revenue = base_revenue
    for x in path + [g_stable] * (_YEARS - len(path)):
        revenue *= 1.0 + x
    return revenue


def solve_high_growth(base_revenue: float, target_revenue: float, rf: float,
                      lo: float = -0.5, hi: float = 1.0, stages: int = 3) -> float | None:
    """The high-phase growth rate that lands year-10 revenue on the target.

    Year-10 revenue rises with g, so bisection on [lo, hi] converges; a target
    outside the bracket's reach returns None rather than an invented rate."""
    if base_revenue is None or base_revenue <= 0 or target_revenue <= 0:
        return None
    if not (_revenue_after_path(base_revenue, lo, rf, stages) <= target_revenue
            <= _revenue_after_path(base_revenue, hi, rf, stages)):
        return None
    for _ in range(200):
        mid = (lo + hi) / 2.0
        if _revenue_after_path(base_revenue, mid, rf, stages) < target_revenue:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2.0


def iron_triangle(base_ebit_after_tax: float, rows: list[dict]) -> float | None:
    """The return the story implies on the capital it invests: after-tax operating
    income added by year 10 over the reinvestment that bought it. None when
    total reinvestment is not positive, since the ratio then carries no signal."""
    reinvested = sum(r["reinvestment"] for r in rows)
    if not rows or reinvested <= 0:
        return None
    return (rows[-1]["ebitAfterTax"] - base_ebit_after_tax) / reinvested


def failure_adjusted(value: float, probability: float, distress_value: float) -> float:
    """Narrative and Numbers Ch.9 (Uber, Table 9.2): weight the going-concern value
    by survival and the distress proceeds by failure."""
    return value * (1.0 - probability) + distress_value * probability


def _check(rule: str | None) -> dict:
    return {"status": "applied" if rule is None else "kept", "rule": rule}


def _round4(x: float | None) -> float | None:
    return None if x is None else round(x, 4)


def resolve_story(model: ModelInputs, story: StoryInputs) -> dict:
    """Decide, input by input, whether the story's number or the model's is used,
    and build the engine kwargs. The order matters: stable growth depends on the
    revenue growth, and the stable-return test depends on stable growth."""
    rules: dict[str, str | None] = {}
    stages = _stage_count(story.stages)
    n_high, n_transition = STAGE_SHAPES[stages]

    # 1. Revenue: market, market growth and share only work as a set. A 1-stage
    #    story has no high-growth phase, so they cannot move revenue at all.
    revenue_inputs = {"totalMarket": story.total_market,
                      "marketGrowth10y": story.market_growth,
                      "shareYear10": story.share_year10}
    g_story = None
    if stages == 1:
        for name, value in revenue_inputs.items():
            rules[name] = RULE_MISSING if value is None else RULE_ONE_STAGE
    elif any(v is None for v in revenue_inputs.values()):
        for name, value in revenue_inputs.items():
            rules[name] = RULE_MISSING if value is None else RULE_REVENUE_INCOMPLETE
    else:
        if story.share_year10 > 1:
            rule = RULE_SHARE_ABOVE_100
        else:
            g_story = solve_high_growth(
                model.base_revenue,
                year10_revenue(story.total_market, story.market_growth, story.share_year10),
                model.rf, stages=stages)
            rule = RULE_GROWTH_UNSOLVABLE if g_story is None else None
        rules.update(dict.fromkeys(revenue_inputs, rule))
    g_high = model.g_high if g_story is None else g_story
    market_year10 = (story.total_market * (1.0 + story.market_growth) ** _YEARS
                     if story.total_market is not None and story.market_growth is not None
                     else None)

    # 2. Stable growth follows whichever high growth is used.
    g_stable = stable_growth(g_high, model.rf)

    # 3. Target margin.
    margin = story.target_margin
    rules["targetMargin"] = (RULE_MISSING if margin is None
                             else RULE_MARGIN_AT_100 if margin >= 1 else None)
    margin_tgt = model.margin_tgt if rules["targetMargin"] else margin
    # The engine's 1-stage perpetuity runs on today's margin, so a story margin
    # there is reached immediately.
    margin_cur = margin if stages == 1 and not rules["targetMargin"] else model.margin_cur

    # 4. Sales to capital switches the reinvestment method.
    if story.sales_to_capital is None:
        rules["salesToCapital"] = RULE_MISSING
        reinvest_method, sales_to_capital = model.reinvest_method, model.sales_to_capital
    else:
        rules["salesToCapital"] = None
        reinvest_method, sales_to_capital = "salesToCapital", story.sales_to_capital

    # 5. Stable return must beat stable growth (Investment Valuation Ch.12).
    roic = story.stable_roic
    rules["stableRoic"] = (RULE_MISSING if roic is None
                           else RULE_ROIC_NOT_ABOVE_GROWTH if roic <= g_stable else None)
    if rules["stableRoic"] is None:
        roic_stable = roic
    else:
        # Keep the stable return the model itself used: compute_forecast passes
        # roic_stable only on the earnings method (sales-to-capital models use the
        # engine's own terminal convention), so an all-null story equals the
        # 3-stage variant. Keyed on the MODEL's method, not the resolved one, so
        # a story that only switches to sales to capital keeps the model's return.
        roic_stable = model.roic_stable if model.reinvest_method == "earnings" else None

    # 6. Failure inputs default to no failure.
    rules["failureProbability"] = RULE_MISSING if story.failure_probability is None else None
    rules["distressProceeds"] = RULE_MISSING if story.distress_proceeds is None else None
    probability = story.failure_probability if story.failure_probability is not None else 0.0
    distress = story.distress_proceeds if story.distress_proceeds is not None else 0.0

    kwargs = {
        "base_revenue": model.base_revenue, "margin_cur": margin_cur,
        "margin_tgt": margin_tgt, "tax": model.tax,
        "g_high": g_high, "g_stable": g_stable,
        "n_high": n_high, "n_transition": n_transition,
        "beta_high": model.beta,
        "roic_high": model.roic if (model.roic or 0) > 0 else None,
        "roic_stable": roic_stable,
        "reinvest_method": reinvest_method, "sales_to_capital": sales_to_capital,
        "equity_adjust": model.equity_adjust, "shares": model.shares,
    }
    return {
        "kwargs": kwargs,
        "checks": {name: _check(rules[name]) for name in INPUT_NAMES},
        "revenueGrowth": {"story": _round4(g_story), "model": _round4(model.g_high),
                          "used": _round4(g_high)},
        "marketYear10": market_year10,
        "stages": {"story": story.stages if story.stages in STAGE_SHAPES else None,
                   "used": stages},
        "failureProbability": probability,
        "distressProceeds": distress,
    }


def value_story(model: ModelInputs, story: StoryInputs,
                wacc_of_beta: Callable[[float | None], float]) -> dict | None:
    """Run the resolved story through run_fcff_revenue. None when the engine
    cannot solve it, never a fabricated value."""
    resolved = resolve_story(model, story)
    kw = resolved["kwargs"]
    engine = run_fcff_revenue(wacc_of_beta=wacc_of_beta, **kw)
    if engine is None:
        return None
    rows = engine["rows"]
    revenue_year10 = _revenue_after_path(kw["base_revenue"], kw["g_high"], model.rf,
                                         resolved["stages"]["used"])
    market_year10 = resolved["marketYear10"]
    base_ebit_after_tax = kw["base_revenue"] * kw["margin_cur"] * (1.0 - kw["tax"])
    value = engine["intrinsicPerShare"]
    distress_per_share = resolved["distressProceeds"] / kw["shares"]
    return {
        **resolved,
        "engine": engine,
        "revenueYear10": revenue_year10,
        "impliedShareYear10": (revenue_year10 / market_year10
                               if market_year10 is not None and market_year10 > 0 else None),
        "stableGrowth": _round4(kw["g_stable"]),
        "ironTriangleReturn": _round4(iron_triangle(base_ebit_after_tax, rows)),
        "valueIfStoryWorksPerShare": value,
        "distressPerShare": distress_per_share,
        "failureAdjustedPerShare": round(
            failure_adjusted(value, resolved["failureProbability"], distress_per_share), 2),
    }


def story_sensitivity(kwargs: dict, *, wacc: float, rf: float,
                      probability: float, distress_per_share: float) -> dict:
    """Failure-adjusted value per share across cost of capital (rows) and high
    growth (columns), on the same axes compute_forecast builds for the model."""
    wacc_axis = [round(wacc + d, 4) for d in (-0.015, -0.0075, 0.0, 0.0075, 0.015)]
    growth_axis = [round(kwargs["g_high"] + d, 4) for d in (-0.03, -0.015, 0.0, 0.015, 0.03)]
    matrix: list[list[float | None]] = []
    for w in wacc_axis:
        cells: list[float | None] = []
        for g in growth_axis:
            out = run_fcff_revenue(**{**kwargs, "g_high": g, "g_stable": stable_growth(g, rf),
                                      "wacc_of_beta": lambda b, _w=w: _w})
            cells.append(None if out is None else round(
                failure_adjusted(out["intrinsicPerShare"], probability, distress_per_share), 2))
        matrix.append(cells)
    return {"waccAxis": wacc_axis, "growthAxis": growth_axis, "matrix": matrix}
