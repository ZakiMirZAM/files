"""Story DCF: price a reader's story inputs on the page's own forecast.

Glue between the cached individual payload and the pure story math in
valuation/story.py. The model's numbers are read from the forecast the page
already shows, the cost of capital is the site's own (compute_wacc on the same
latest row, rate inputs and lease debt the model used), and the result has the
same shape as that forecast so ForecastSection can render either one.

Never mutates the forecast it is given: the payload is cached and shared.
"""
from __future__ import annotations

from typing import Any, Mapping

from individualanalysis import compute_wacc
from valuation.story import ModelInputs, StoryInputs, story_sensitivity, value_story

_NO_VALUATION = "No valuation is available for this company, so the story cannot be priced."
_UNSOLVABLE = ("The story's numbers do not produce a solvable valuation: the operating "
               "profit is not positive, or the stable-phase cost of capital does not "
               "clear the stable growth rate.")

# Request body key -> StoryInputs field.
_BODY_FIELDS = {
    "totalMarket": "total_market", "marketGrowth10y": "market_growth",
    "shareYear10": "share_year10", "targetMargin": "target_margin",
    "salesToCapital": "sales_to_capital", "failureProbability": "failure_probability",
    "distressProceeds": "distress_proceeds", "stableRoic": "stable_roic",
}


def model_inputs(forecast: dict) -> ModelInputs:
    """The model's own numbers, exactly as the page's forecast carries them."""
    a = forecast["assumptions"]
    wb = forecast["waccBuild"]
    return ModelInputs(
        base_revenue=a["baseRevenue"], margin_cur=a["operatingMarginCurrent"],
        margin_tgt=a["operatingMarginTarget"], tax=a["taxRate"],
        g_high=a["revenueGrowthInitial"], rf=wb["riskFreeRate"], roic=a["roic"],
        roic_stable=(forecast.get("valuationSelection") or {}).get("roicStable"),
        reinvest_method=a["reinvestmentMethod"],
        sales_to_capital=(forecast.get("growthReconciliation") or {}).get("salesToCapitalUsed"),
        equity_adjust=((forecast.get("cash") or 0.0) - (forecast.get("grossDebt") or 0.0)
                       - (forecast.get("minorityInterest") or 0.0)),
        shares=a["dilutedShares"], beta=wb["beta"],
    )


def story_inputs_from_body(body: Mapping[str, Any]) -> StoryInputs:
    """camelCase request body -> StoryInputs; a missing key or null keeps the model's number."""
    return StoryInputs(**{field: body.get(key) for key, field in _BODY_FIELDS.items()})


def build_story_forecast(forecast: dict, latest: Mapping, story: StoryInputs) -> dict:
    """The page's forecast re-priced on the story, or {"applicable": False, "reason"}."""
    if not forecast or forecast.get("applicable") is False:
        forecast = forecast or {}
        return {"applicable": False,
                "reason": forecast.get("notApplicableReason") or forecast.get("reason") or _NO_VALUATION}

    a = forecast["assumptions"]
    wb = forecast["waccBuild"]
    memo: dict[float | None, float | None] = {}

    def wacc_of_beta(b: float | None) -> float | None:
        # The same function and inputs the model used; memoised per beta as
        # compute_forecast does, since the sensitivity grid re-asks the same betas.
        if b not in memo:
            memo[b] = compute_wacc(latest, b, wb["riskFreeRate"], wb["equityRiskPremium"],
                                   a["taxRate"], lease_debt=wb.get("leaseDebt") or 0.0)[0]
        return memo[b]

    v = value_story(model_inputs(forecast), story, wacc_of_beta)
    if v is None:
        return {"applicable": False, "reason": _UNSOLVABLE}

    engine, kw = v["engine"], v["kwargs"]
    value = v["failureAdjustedPerShare"]
    price = forecast.get("currentPrice")
    comparable = (forecast.get("priceComparison") or {}).get("applicable") is not False
    mos = (round((value - price) / price, 4)
           if comparable and isinstance(price, (int, float)) and price > 0 else None)
    horizon = len(engine["rows"])
    return {
        **forecast,
        "assumptions": {
            **a, "horizonYears": horizon,
            "revenueGrowthInitial": v["revenueGrowth"]["used"],
            "revenueGrowthTerminal": v["stableGrowth"],
            "operatingMarginTarget": kw["margin_tgt"],
            # A story sales-to-capital switches the bridge; say which one ran.
            "reinvestmentMethod": kw["reinvest_method"],
            "salesToCapital": kw["sales_to_capital"],
            "stableRoic": kw["roic_stable"],
        },
        "years": [forecast["baseYear"] + t for t in range(1, horizon + 1)],
        "valuationSelection": None,
        "rows": engine["rows"],
        "pvExplicit": engine["pvExplicit"],
        "terminalValue": engine["terminalValue"],
        "pvTerminal": engine["pvTerminal"],
        "firmValue": engine["firmValue"],
        "equityValue": engine["equityValue"],
        "intrinsicPerShare": value,
        "marginOfSafety": mos,
        "exitCrossCheckPerShare": None,
        "evEbitdaCrossCheckPerShare": None,
        "evEbitdaImpliedGrowth": None,
        "betaOneIntrinsicPerShare": None,
        "eva": None,
        "sensitivity": story_sensitivity(
            kw, wacc=a["wacc"], rf=wb["riskFreeRate"],
            probability=v["failureProbability"], distress_per_share=v["distressPerShare"]),
        "storyChecks": {
            "inputs": v["checks"],
            "revenueGrowth": v["revenueGrowth"],
            "marketYear10": v["marketYear10"],
            "revenueYear10": v["revenueYear10"],
            "impliedShareYear10": v["impliedShareYear10"],
            "stableGrowth": v["stableGrowth"],
            "riskFreeRate": wb["riskFreeRate"],
            "ironTriangleReturn": v["ironTriangleReturn"],
            "wacc": a["wacc"],
            "valueIfStoryWorksPerShare": v["valueIfStoryWorksPerShare"],
            "failureProbability": v["failureProbability"],
            "distressPerShare": v["distressPerShare"],
            "failureAdjustedPerShare": v["failureAdjustedPerShare"],
        },
    }
