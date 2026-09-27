"""Story DCF: price a reader's story inputs on the page's own forecast.

Glue between the cached individual payload and the pure story math in
valuation/story.py. The model's numbers are read from the forecast the page
already shows, the cost of capital is the site's own (compute_wacc on the same
latest row, rate inputs and lease debt the model used), and the result has the
same shape as that forecast so ForecastSection can render either one.

The second half builds the story context: the facts the AI reads before it
turns the reader's answers into inputs (company history, industry ranges,
market position, credit, balance sheet, the model's own assumptions), plus
the same facts as a text data block, one figure per line, which the Tier 0
grader (rag/eval/graders.report) checks each proof against.

Never mutates the forecast it is given: the payload is cached and shared.
"""
from __future__ import annotations

import logging
import math
import statistics
from typing import Any, Callable, Iterable, Mapping

import individualanalysis as ia
from individualanalysis import MARGINAL_TAX_RATE, compute_wacc
from valuation.story import (ModelInputs, StoryInputs, TEN_YEAR_DEFAULT_RATE, rating_class,
                             story_sensitivity, value_story)

log = logging.getLogger("story_dcf")

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


def _not_applicable(forecast: dict | None) -> dict:
    """The forecast's own reason when it has one, else the generic sentence."""
    forecast = forecast or {}
    return {"applicable": False,
            "reason": forecast.get("notApplicableReason") or forecast.get("reason") or _NO_VALUATION}


def build_story_forecast(forecast: dict, latest: Mapping, story: StoryInputs) -> dict:
    """The page's forecast re-priced on the story, or {"applicable": False, "reason"}."""
    if not forecast or forecast.get("applicable") is False:
        return _not_applicable(forecast)

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


# ── Story context (GET /api/individual/{ticker}/story-context) ──────────────

_HISTORY_YEARS = 10


def _by_year(rows: Iterable[Mapping]) -> list:
    return sorted(rows, key=lambda r: int(r["Calendar Year"]))


def _finite(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def percentile_summary(values: Iterable[Any]) -> dict | None:
    """Median, 75th and 90th percentile of the finite values; None under three."""
    vals = [float(v) for v in values if _finite(v)]
    if len(vals) < 3:
        return None
    q = statistics.quantiles(vals, n=20, method="inclusive")
    return {"median": round(statistics.median(vals), 4), "p75": round(q[14], 4),
            "p90": round(q[17], 4), "count": len(vals)}


def company_history(rows: Iterable[Mapping]) -> list[dict]:
    """The last ten fiscal years, oldest first, with the ratios the story leans on."""
    window = _by_year(rows)[-(_HISTORY_YEARS + 1):]    # one extra row feeds the first growth
    out: list[dict] = []
    prev_year, prev_rev = None, None
    for row in window:
        year = int(row["Calendar Year"])
        rev = ia._row_val(row, "Revenue")
        # Year over year only: across a missing filing year the change is not a yearly rate.
        growth = (rev / prev_rev - 1.0
                  if rev is not None and (prev_rev or 0.0) > 0 and prev_year == year - 1 else None)
        out.append({
            "year": year, "revenue": rev, "revenueGrowth": growth,
            "operatingMargin": ia._safe_div(ia._row_val(row, "Operating Income"), rev),
            "salesToCapital": ia.sales_to_capital(row),
            "roic": ia._compute_return_ratios(row).get("Return On Invested Capital"),
        })
        prev_year, prev_rev = year, rev
    return out[-_HISTORY_YEARS:]


def _capital(row: Mapping) -> float | None:
    """Equity + debt - cash: the invested capital ia.sales_to_capital divides by."""
    equity = ia._row_val(row, "Total Stockholders Equity")
    if equity is None:
        equity = ia._row_val(row, "Total Equity")
    if equity is None:
        return None
    return (equity + (ia._row_val(row, "Total Debt") or 0.0)
            - (ia._row_val(row, "Cash And Cash Equivalents") or 0.0))


def marginal_sales_to_capital(rows: Iterable[Mapping], years: int = 5) -> float | None:
    """Revenue added per unit of capital added over the last `years` years."""
    rows = _by_year(rows)
    if len(rows) < years + 1:
        return None
    start, end = rows[-(years + 1)], rows[-1]
    rev0, rev1 = ia._row_val(start, "Revenue"), ia._row_val(end, "Revenue")
    cap0, cap1 = _capital(start), _capital(end)
    if None in (rev0, rev1, cap0, cap1) or cap1 - cap0 <= 0:
        return None
    ratio = (rev1 - rev0) / (cap1 - cap0)
    # Same bounds the model applies to its own sales to capital: a near-flat
    # capital base (heavy buybacks) otherwise prints an absurd ratio.
    return ratio if ia._S2C_MIN <= ratio <= ia._S2C_MAX else None


# Latest filing per company, plus the year before it for growth. Same universe as
# api._industry_sales_to_capital and api._industry_roic, so these medians agree
# with the anchors the model itself uses.
_INDUSTRY_SQL = """
SELECT f."Revenue", f."Operating Income", f."Total Stockholders Equity",
       f."Total Debt", f."Cash And Cash Equivalents", p."Revenue"
FROM financials f
JOIN tickers t ON t.ticker = f.Ticker
JOIN (SELECT Ticker, MAX(CAST("Calendar Year" AS INTEGER)) AS y
      FROM financials
      WHERE "Calendar Year" GLOB '[0-9][0-9][0-9][0-9]'
      GROUP BY Ticker) last
  ON last.Ticker = f.Ticker
 AND CAST(f."Calendar Year" AS INTEGER) = last.y
LEFT JOIN financials p
  ON p.Ticker = f.Ticker
 AND CAST(p."Calendar Year" AS INTEGER) = last.y - 1
WHERE t.industry = ? AND f."Revenue" > 0 AND f."Market Cap" > 0
"""


def industry_ranges(conn, industry: str) -> dict:
    """Percentile summaries of four ratios across the industry's latest filings.

    Ratios only, so nothing is FX-converted: each is unitless within its own filer.
    The filters are those of the two api anchors, plus a margin band and a growth band."""
    try:
        vals: dict[str, list[float]] = {"operatingMargin": [], "salesToCapital": [],
                                        "roic": [], "revenueGrowth": []}
        for rev, op, eq, td, cash, rev_prev in conn.execute(_INDUSTRY_SQL, (industry,)):
            td, cash = td or 0.0, cash or 0.0
            if op is not None and abs(op / rev) <= 1.0:
                vals["operatingMargin"].append(op / rev)
            if eq is not None:
                capital = eq + td - cash
                if capital > 0 and 0.2 <= rev / capital <= 20.0:
                    vals["salesToCapital"].append(rev / capital)
                if op is not None and op > 0 and eq + td > 0:
                    roic = op * (1.0 - MARGINAL_TAX_RATE) / (eq + td)
                    if 0.0 < roic <= 0.60:
                        vals["roic"].append(roic)
            if rev_prev is not None and rev_prev > 0 and -0.9 <= rev / rev_prev - 1.0 <= 3.0:
                vals["revenueGrowth"].append(rev / rev_prev - 1.0)
        return {name: percentile_summary(v) for name, v in vals.items()}
    except Exception as exc:  # noqa: BLE001 - the ranges are context, never a blocker
        log.warning("[story] industry ranges for %s failed: %s", industry, exc)
        return {}


_NO_MARKET = {"fiscalYear": None, "firmCount": None, "totalRevenue": None, "companyShare": None}


def market_position(panel: Any, ticker: str) -> dict:
    """The company's revenue share of its industry panel's latest year.

    The share is on USD revenue (the panel's rule); the total is the company's own
    revenue divided by that share, so it stays in the company's reporting currency."""
    if panel is None:
        return dict(_NO_MARKET)
    ps = panel.by_year.get(panel.fiscal_year)
    if ps is None:
        return {**_NO_MARKET, "fiscalYear": panel.fiscal_year}
    share = ps.revenue_shares().get(ticker)
    peer = next((p for p in ps.peers if p.ticker == ticker), None)
    return {"fiscalYear": panel.fiscal_year, "firmCount": len(ps.peers),
            "totalRevenue": peer.revenue_local / share if share and peer else None,
            "companyShare": share}


def _reporting_currency(rows: list) -> str | None:
    """The latest row that carries a currency: a NULL on the newest row is not a change."""
    for row in reversed(rows):
        c = (ia._row_str(row, "Reported Currency") or "").strip()
        if c:
            return c
    return None


def build_story_context(*, ticker: str, analysis: dict, rows: list, ranges: dict,
                        market: dict) -> dict:
    """Contract C3: the factual bundle plus its data block, or not applicable."""
    analysis = analysis or {}
    forecast = analysis.get("forecast")
    if not forecast or forecast.get("applicable") is False:
        return _not_applicable(forecast)
    rows = _by_year(rows)
    a = forecast["assumptions"]
    wb = forecast.get("waccBuild") or {}
    history = company_history(rows)
    margins = [h["operatingMargin"] for h in history if h["operatingMargin"] is not None][-5:]
    letter = ((analysis.get("creditAnalysis") or {}).get("rating") or {}).get("letter")
    cls = rating_class(letter)
    ctx = {
        "applicable": True, "ticker": ticker,
        "companyName": analysis.get("name") or ticker,
        "currency": _reporting_currency(rows),
        "latestYear": history[-1]["year"] if history else None,
        "history": history,
        # Five years or nothing: a median of two years is not a five-year median.
        "fiveYearMedianMargin": statistics.median(margins) if len(margins) == 5 else None,
        "marginalSalesToCapital5y": marginal_sales_to_capital(rows),
        "industry": {"name": analysis.get("industry"), **market, "ranges": ranges},
        "credit": {"syntheticRating": letter, "ratingClass": cls,
                   "tenYearDefaultRate": TEN_YEAR_DEFAULT_RATE.get(cls),
                   "interestCoverage": wb.get("interestCoverage")},
        "balance": {"cash": forecast.get("cash"), "grossDebt": forecast.get("grossDebt"),
                    "minorityInterest": forecast.get("minorityInterest"),
                    "dilutedShares": a.get("dilutedShares")},
        "riskFreeRate": wb.get("riskFreeRate"),
        "wacc": a.get("wacc"),
        "model": {
            "baseRevenue": a.get("baseRevenue"),
            "revenueGrowthInitial": a.get("revenueGrowthInitial"),
            "revenueGrowthTerminal": a.get("revenueGrowthTerminal"),
            "operatingMarginCurrent": a.get("operatingMarginCurrent"),
            "operatingMarginTarget": a.get("operatingMarginTarget"),
            "salesToCapital": (forecast.get("growthReconciliation") or {}).get("salesToCapitalUsed"),
            "stableRoic": (forecast.get("valuationSelection") or {}).get("roicStable"),
            "taxRate": a.get("taxRate"),
            "intrinsicPerShare": forecast.get("intrinsicPerShare"),
        },
        "defaultRates": dict(TEN_YEAR_DEFAULT_RATE),
    }
    ctx["dataBlock"] = story_data_block(ctx)
    return ctx


# ── Data block ───────────────────────────────────────────────────────────────
# Formats mirror frontend/src/lib/aiDataContext.ts fmtVal, the formats the grader
# parses. The labels are shaped by rag/eval/graders.py, which must not change
# (it also verifies every /ask, /explain and /define answer). A proof's figure
# binds to the context line whose label shares its content words, and a label
# whose words are a subset of another's ties with it. Ties keep line order, and
# only the first four candidates are compared, so a tie can bind a correct
# figure to the wrong line. Hence:
#   * no two lines of one unit family differ only by a grader stopword
#     ("latest", "industry", "company", "a", ...): the firm's figures say "Firm",
#     peer figures say "Peer";
#   * no digits in a label: years are dropped (so no per-year lines) and ordinals
#     are read as numbers (so "upper quartile" and "top decile", not 75th/90th);
#   * no threshold words ("target", "minimum", "benchmark", ...), which make a
#     figure ungradable, and no "spread"/"premium"-style words, which mark it derived;
#   * rating class A prints as "single-A", since the bare "A" is a stopword.
# test_story_dcf pins the exact grammar and runs every line through the real grader.

_LADDER = ((1e12, 2, "T"), (1e9, 1, "B"), (1e6, 0, "M"), (1e3, 0, "K"))


def _money(v: float, mark: str = "$") -> str:
    a, sign = abs(v), "-" if v < 0 else ""
    for at, digits, suffix in _LADDER:
        if a >= at:
            return f"{sign}{mark}{a / at:.{digits}f}{suffix}"
    return f"{sign}{mark}{a:.0f}"


def _count(v: float) -> str:
    return _money(v, mark="")


def _pct(v: float) -> str:
    return f"{v * 100:.2f}%"


def _ratio(v: float) -> str:
    return f"{v:.2f}x"


def _per_share(v: float) -> str:
    return f"{'-' if v < 0 else ''}${abs(v):.2f}"


def _whole(v: float) -> str:
    return str(int(v))


def _class_name(cls: str) -> str:
    return "single-A" if cls == "A" else cls


_FIRM_FIELDS = (("revenue", "Firm revenue", _money),
                ("revenueGrowth", "Firm revenue growth", _pct),
                ("operatingMargin", "Firm operating margin", _pct),
                ("salesToCapital", "Firm sales to capital", _ratio),
                ("roic", "Firm ROIC", _pct))
_RANGE_FIELDS = (("operatingMargin", "operating margin", _pct),
                 ("salesToCapital", "sales to capital", _ratio),
                 ("roic", "ROIC", _pct), ("revenueGrowth", "revenue growth", _pct))
_RANGE_STATS = (("median", "median"), ("p75", "upper quartile"), ("p90", "top decile"))
_MODEL_FIELDS = (("revenueGrowthInitial", "Model high growth rate", _pct),
                 ("revenueGrowthTerminal", "Model stable growth rate", _pct),
                 ("operatingMarginCurrent", "Model operating margin today", _pct),
                 ("operatingMarginTarget", "Model long-run operating margin", _pct),
                 ("salesToCapital", "Model sales to capital", _ratio),
                 ("stableRoic", "Model return on capital after growth ends", _pct),
                 ("taxRate", "Model tax rate", _pct),
                 ("intrinsicPerShare", "Model intrinsic value per share", _per_share))


def story_data_block(ctx: dict) -> str:
    """The context as "<label>: <value>" lines; a missing figure drops its line.

    Summary figures only: the per-year history stays in the JSON for the page."""
    lines: list[str] = []

    def put(label: str, value: Any, fmt: Callable[[float], str]) -> None:
        if _finite(value):
            lines.append(f"{label}: {fmt(value)}")

    head = f"Company: {ctx['companyName']} ({ctx['ticker']})"
    if ctx.get("currency"):
        head += f", reporting currency {ctx['currency']}"
    if ctx.get("latestYear") is not None:
        head += f", latest fiscal year {ctx['latestYear']}"
    lines.append(head)

    history = ctx.get("history") or []
    latest = history[-1] if history else {}
    for key, label, fmt in _FIRM_FIELDS:
        put(label, latest.get(key), fmt)
    put("Five-year median operating margin", ctx.get("fiveYearMedianMargin"), _pct)
    put("Marginal sales to capital over five years", ctx.get("marginalSalesToCapital5y"), _ratio)

    peers = ctx.get("industry") or {}
    if peers.get("name"):
        group = f"Peer group: {peers['name']}"
        if peers.get("fiscalYear") is not None:
            group += f", fiscal year {peers['fiscalYear']}"
        lines.append(group)
    put("Peer company count", peers.get("firmCount"), _whole)
    put("Peer total revenue", peers.get("totalRevenue"), _money)
    put("Firm share of peer revenue", peers.get("companyShare"), _pct)
    ranges = peers.get("ranges") or {}
    for key, name, fmt in _RANGE_FIELDS:
        summary = ranges.get(key) or {}
        for stat, stat_name in _RANGE_STATS:
            put(f"Peer {stat_name} {name}", summary.get(stat), fmt)

    credit = ctx.get("credit") or {}
    if credit.get("syntheticRating"):
        lines.append(f"Synthetic rating: {credit['syntheticRating']}")
    if credit.get("ratingClass"):
        lines.append(f"Synthetic rating class: {_class_name(credit['ratingClass'])}")
    put("Interest coverage", credit.get("interestCoverage"), _ratio)

    balance = ctx.get("balance") or {}
    put("Cash", balance.get("cash"), _money)
    put("Gross debt", balance.get("grossDebt"), _money)
    put("Minority interest", balance.get("minorityInterest"), _money)
    put("Diluted shares", balance.get("dilutedShares"), _count)
    put("Risk-free rate", ctx.get("riskFreeRate"), _pct)
    put("WACC", ctx.get("wacc"), _pct)

    model = ctx.get("model") or {}
    for key, label, fmt in _MODEL_FIELDS:
        put(label, model.get(key), fmt)

    for cls, rate in (ctx.get("defaultRates") or {}).items():
        put(f"Ten-year default rate for the {_class_name(cls)} rating class", rate, _pct)
    return "\n".join(lines)
