"""Breakeven reverse DCF: what each driver must be for the value to equal the price.

The forward model asks what the company is worth on its numbers. This asks, one
driver at a time and holding the others at the model's numbers, what revenue
growth, target margin, return on capital after growth ends, or sales to capital
today's price needs; then prices two grids of pairs, so a reader can see which
combinations clear the price.

Method (citations stay in code, never in user-facing copy):
  * Narrative and Numbers Ch.10, Table 10.2: the breakeven grid of value per
    share across revenue growth and target margin, read against the price.
  * Investment Valuation Ch.12: growth adds value only while the return on new
    capital beats its cost, so when the stable return is below the cost of
    capital no growth reaches a price above the value, and the return itself is
    the driver the price is betting on.

Every trial runs the story engine path (valuation.story.resolve_story on an
all-null story, which is the model's 3-stage variant, then
engines.run_fcff_revenue) with the page's own cost of capital. Pure apart from
build_reverse_breakeven reading the forecast, the latest row and the story
context; never mutates any of them.
"""
from __future__ import annotations

import statistics
from typing import Callable, Optional

from story_dcf import _finite, _not_applicable, model_inputs, wacc_of_beta_for
from valuation.engines import run_fcff_revenue
from valuation.story import StoryInputs, _revenue_after_path, resolve_story, stable_growth

_NO_PRICE = "No current price is available, so there is nothing for the valuation to solve against."
_UNSOLVABLE = ("The model's own numbers do not produce a solvable valuation, so there is no "
               "breakeven to find.")

_SCAN_POINTS = 41        # grid points per range before bisecting each sign change
_BISECT_STEPS = 60

GROWTH_RANGE = (-0.10, 0.60)
MARGIN_RANGE = (0.0, 0.80)
ROIC_HIGH = 1.00
S2C_RANGE = (0.2, 20.0)


Kwargs = dict
Valuer = Callable[[Kwargs], Optional[float]]


# ── Setting one driver on the engine kwargs (always a new dict) ────────────

def with_growth(kw: Kwargs, g: float, rf: float) -> Kwargs:
    """Years 1-5 growth; stable growth follows it, as the forward model does."""
    return {**kw, "g_high": g, "g_stable": stable_growth(g, rf)}


def with_margin(kw: Kwargs, m: float) -> Kwargs:
    return {**kw, "margin_tgt": m}


def with_stable_roic(kw: Kwargs, r: float) -> Kwargs:
    return {**kw, "roic_stable": r}


def with_sales_to_capital(kw: Kwargs, s: float) -> Kwargs:
    # A sales-to-capital number switches the reinvestment bridge, exactly as a
    # story input does in resolve_story.
    return {**kw, "reinvest_method": "salesToCapital", "sales_to_capital": s}


def effective_stable_roic(kw: Kwargs) -> Optional[float]:
    """The terminal return the engine actually uses: roic_stable, else the
    high-growth return it fades to (engines.run_fcff_revenue)."""
    return kw.get("roic_stable") or kw.get("roic_high")


def engine_valuer(wacc_of_beta: Callable) -> Valuer:
    def value(kw: Kwargs) -> Optional[float]:
        out = run_fcff_revenue(wacc_of_beta=wacc_of_beta, **kw)
        return None if out is None else out["intrinsicPerShare"]
    return value


# ── Solver ───────────────────────────────────────────────────────────────────

def solve_breakeven(value_at: Callable[[float], Optional[float]], price: float,
                    lo: float, hi: float, near: Optional[float] = None) -> dict:
    """The driver value in [lo, hi] at which value_at equals the price.

    value_at need not be monotonic (growth destroys value when the return is below
    the cost of capital), so the range is scanned, every sign change is bisected,
    and the root nearest `near` (the model's number) is reported. With no crossing,
    "above_range" means the price is above every value the range produces and
    "below_range" that it is below every one; status is None when nothing in the
    range could be valued at all."""
    points = []
    for i in range(_SCAN_POINTS):
        x = lo + (hi - lo) * i / (_SCAN_POINTS - 1)
        v = value_at(x)
        if v is not None:
            points.append((x, v - price))
    base = {"implied": None, "low": round(lo, 4), "high": round(hi, 4)}
    if not points:
        return {**base, "status": None}

    roots = [x for x, f in points if f == 0.0]
    for (xa, fa), (xb, fb) in zip(points, points[1:]):
        if fa * fb >= 0:
            continue
        a, f_a, b = xa, fa, xb
        for _ in range(_BISECT_STEPS):
            mid = (a + b) / 2.0
            v = value_at(mid)
            if v is None:
                break
            if (v - price > 0) == (f_a > 0):
                a, f_a = mid, v - price
            else:
                b = mid
        roots.append((a + b) / 2.0)
    if roots:
        anchor = near if near is not None else (lo + hi) / 2.0
        return {**base, "implied": round(min(roots, key=lambda r: abs(r - anchor)), 4),
                "status": "solved"}
    return {**base, "status": "above_range" if all(f < 0 for _, f in points) else "below_range"}


def _driver_specs(kw: Kwargs, rf: float) -> dict:
    """Driver -> (set it on the kwargs, search low, search high, model's number)."""
    return {
        "revenueGrowth": (lambda x: with_growth(kw, x, rf), *GROWTH_RANGE, kw["g_high"]),
        "targetMargin": (lambda x: with_margin(kw, x), *MARGIN_RANGE, kw["margin_tgt"]),
        "stableRoic": (lambda x: with_stable_roic(kw, x), kw["g_stable"] + 0.001, ROIC_HIGH,
                       effective_stable_roic(kw)),
        "salesToCapital": (lambda x: with_sales_to_capital(kw, x), *S2C_RANGE,
                           kw.get("sales_to_capital")),
    }


def solve_drivers(kw: Kwargs, value: Valuer, price: float, rf: float) -> dict:
    """Implied value of each of the four drivers, the others at the model's numbers."""
    out = {}
    for name, (set_driver, lo, hi, model) in _driver_specs(kw, rf).items():
        out[name] = {"model": model,
                     **solve_breakeven(lambda x, _s=set_driver: value(_s(x)), price, lo, hi, model)}
    return out


# ── Grids ────────────────────────────────────────────────────────────────────

_GRID_POINTS = 7
_PAST_IMPLIED = 0.25     # the axis runs this share of its span beyond the implied number
_MIN_SPAN = 0.02         # so a model already at its breakeven still gets a readable axis


def grid_axis(name: str, kw: Kwargs, value: Valuer, rf: float, solved: dict,
              probe: Optional[Valuer] = None) -> tuple[list, int]:
    """Seven ascending points from the model's number towards the price: past the
    implied number when the driver solves, else out to the search limit on the
    side where value moves towards the price. `probe` values each limit (default:
    the other drivers at the model's numbers; a grid probes with its other axis
    at its far end, since growth only pays where returns are high enough).
    Returns (axis, index of the model's number)."""
    probe = probe or value
    set_driver, lo, hi, model = _driver_specs(kw, rf)[name]
    start = model if model is not None else lo
    if solved["status"] == "solved":
        end = solved["implied"]
        end += (end - start) * _PAST_IMPLIED if end != start else _MIN_SPAN
        end = min(max(end, lo), hi)
    else:
        v_lo, v_hi = probe(set_driver(lo)), probe(set_driver(hi))
        if v_lo is None or v_hi is None:
            end = hi if v_lo is None else lo
        elif solved["status"] == "below_range":
            end = lo if v_lo < v_hi else hi       # the price needs less value
        else:
            end = hi if v_hi >= v_lo else lo      # the price needs more value
    if abs(end - start) < _MIN_SPAN:
        end = start + (_MIN_SPAN if end >= start else -_MIN_SPAN)
    step = (end - start) / (_GRID_POINTS - 1)
    axis = [start + step * i for i in range(_GRID_POINTS)]
    # The model's own number stays exact, so its cell equals the model's value.
    return (axis, 0) if step > 0 else (axis[::-1], _GRID_POINTS - 1)


def breakeven_grid(kw: Kwargs, value: Valuer, price: float, rf: float,
                   col_driver: str, drivers: dict) -> dict:
    """Value per share across revenue growth (rows) and one other driver (cols),
    each axis running from the model's number towards the price; each cell
    flagged against the price."""
    set_col = with_margin if col_driver == "targetMargin" else with_stable_roic
    cols, col_model = grid_axis(col_driver, kw, value, rf, drivers[col_driver])
    col_far = cols[-1] if col_model == 0 else cols[0]
    rows, row_model = grid_axis("revenueGrowth", kw, value, rf, drivers["revenueGrowth"],
                                probe=lambda k: value(set_col(k, col_far)))
    cells = []
    for g in rows:
        row_kw = with_growth(kw, g, rf)
        line = []
        for j, c in enumerate(cols):
            # A stable return must beat stable growth (Investment Valuation Ch.12),
            # except the model's own return: its column shows what the model values.
            ok = not (col_driver == "stableRoic" and c <= row_kw["g_stable"] and j != col_model)
            v = value(set_col(row_kw, c)) if ok else None
            line.append({"value": v, "atOrAbovePrice": v is not None and v >= price})
        cells.append(line)
    return {"rowDriver": "revenueGrowth", "colDriver": col_driver,
            "rowAxis": rows, "colAxis": cols,
            "rowModelIndex": row_model, "colModelIndex": col_model,
            "cells": cells,
            "reachesPrice": any(c["atOrAbovePrice"] for line in cells for c in line)}


# ── The block ────────────────────────────────────────────────────────────────

def _five_year_median_growth(history: list) -> Optional[float]:
    vals = [h["revenueGrowth"] for h in history if _finite(h.get("revenueGrowth"))][-5:]
    return statistics.median(vals) if len(vals) == 5 else None


def _peer(ranges: dict, key: str, stat: str) -> Optional[float]:
    return (ranges.get(key) or {}).get(stat)


def reverse_breakeven(kw: Kwargs, value: Valuer, price: float, rf: float) -> Optional[dict]:
    """Pure core: drivers, grids and the implied year-10 revenue, or None when the
    model's own numbers do not value."""
    base = value(kw)
    if base is None:
        return None
    drivers = solve_drivers(kw, value, price, rf)
    g = drivers["revenueGrowth"]
    return {
        "valueAtModel": base,
        "stableGrowth": round(kw["g_stable"], 4),
        "drivers": drivers,
        "grids": {"growthMargin": breakeven_grid(kw, value, price, rf, "targetMargin", drivers),
                  "growthRoic": breakeven_grid(kw, value, price, rf, "stableRoic", drivers)},
        # The revenue path is the one the engine runs (3 stages: 5 high + 5 fading).
        "impliedRevenueYear10": (_revenue_after_path(kw["base_revenue"], g["implied"], rf, 3)
                                 if g["status"] == "solved" else None),
    }


# Driver -> (story-context history field, firm basis, industry range key).
_FIRM = {"revenueGrowth": (None, "fiveYearMedian", "revenueGrowth"),
         "targetMargin": (None, "fiveYearMedian", "operatingMargin"),
         "stableRoic": ("roic", "latest", "roic"),
         "salesToCapital": ("salesToCapital", "latest", "salesToCapital")}


def build_reverse_breakeven(forecast: dict | None, latest, ctx: dict | None) -> dict:
    """The route's block: the core priced on the page's forecast, plus the firm's
    and its peers' figures beside each driver. {"applicable": False, "reason"}
    when there is no valuation or no comparable price."""
    if not forecast or forecast.get("applicable") is False:
        return _not_applicable(forecast)
    comparison = forecast.get("priceComparison") or {}
    if comparison.get("applicable") is False:
        return {"applicable": False, "reason": comparison.get("reason") or _NO_PRICE}
    price = forecast.get("currentPrice")
    if not _finite(price) or price <= 0:
        return {"applicable": False, "reason": _NO_PRICE}

    model = model_inputs(forecast)
    kw = resolve_story(model, StoryInputs())["kwargs"]
    core = reverse_breakeven(kw, engine_valuer(wacc_of_beta_for(forecast, latest)), price, model.rf)
    if core is None:
        return {"applicable": False, "reason": _UNSOLVABLE}

    ctx = ctx if ctx and ctx.get("applicable") is not False else {}
    history = ctx.get("history") or []
    latest_h = history[-1] if history else {}
    industry = ctx.get("industry") or {}
    ranges = industry.get("ranges") or {}
    firm_five_year = {"revenueGrowth": _five_year_median_growth(history),
                      "targetMargin": ctx.get("fiveYearMedianMargin")}
    drivers = []
    for name, solved in core["drivers"].items():
        field, basis, range_key = _FIRM[name]
        drivers.append({
            "driver": name, **solved,
            "firm": firm_five_year[name] if field is None else latest_h.get(field),
            "firmBasis": basis,
            "peerMedian": _peer(ranges, range_key, "median"),
            "peerTopDecile": _peer(ranges, range_key, "p90"),
        })

    wacc = forecast["assumptions"].get("wacc")
    revenue10 = core["impliedRevenueYear10"]
    peer_total = industry.get("totalRevenue")
    roic = core["drivers"]["stableRoic"]
    return {
        "applicable": True,
        "priceUsed": price,
        "valueAtModel": core["valueAtModel"],
        "wacc": wacc,
        "stableGrowth": core["stableGrowth"],
        "drivers": drivers,
        "grids": core["grids"],
        "plausibility": {
            "impliedRevenueYear10": revenue10,
            "peerTotalRevenue": peer_total,
            # Both in the company's reporting currency (story_dcf.market_position).
            "impliedShareOfPeerRevenue": (revenue10 / peer_total
                                          if revenue10 is not None and _finite(peer_total)
                                          and peer_total > 0 else None),
            "impliedStableRoic": roic["implied"] if roic["status"] == "solved" else None,
            "currentRoic": latest_h.get("roic"),
            "wacc": wacc,
        },
    }
