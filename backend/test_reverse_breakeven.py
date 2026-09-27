"""Breakeven reverse DCF (reverse_breakeven.py) and GET /api/individual/{ticker}/reverse-dcf.

Each driver is solved on a fixture whose answer is known (value it at a chosen
driver, use that value as the price, solve back), an unreachable price reports
above_range, the grids are 7 x 7 with the at-or-above-price flag, and the AAPL
shape (stable return below the cost of capital) leaves growth unsolvable while
the stable return itself solves.

Network-free and DB-free. Run:  cd backend && python -m pytest test_reverse_breakeven.py -q
"""
import copy
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import pytest  # noqa: E402
from pytest import approx  # noqa: E402
import reverse_breakeven as rb  # noqa: E402
import api  # noqa: E402,F401  (see test_story_dcf: import during collection)
from test_story_dcf import _latest, _model  # noqa: E402
from test_damodaran_models import _mature_dividend_payer  # noqa: E402

RF = 0.04
WACC = 0.08

def _kw(**over):
    kw = {"base_revenue": 1000.0, "margin_cur": 0.15, "margin_tgt": 0.20, "tax": 0.25,
          "g_high": 0.08, "g_stable": 0.04, "n_high": 5, "n_transition": 5,
          "beta_high": 1.0, "roic_high": 0.15, "roic_stable": 0.12,
          "reinvest_method": "earnings", "sales_to_capital": 2.0,
          "equity_adjust": 0.0, "shares": 100.0}
    return {**kw, **over}

VALUE = rb.engine_valuer(lambda b: WACC)

SETTERS = {
    "revenueGrowth": lambda kw, x: rb.with_growth(kw, x, RF),
    "targetMargin": rb.with_margin,
    "stableRoic": rb.with_stable_roic,
    "salesToCapital": rb.with_sales_to_capital,
}
KNOWN = {"revenueGrowth": 0.15, "targetMargin": 0.30, "stableRoic": 0.20, "salesToCapital": 3.0}


@pytest.mark.parametrize("driver", list(KNOWN))
def test_each_driver_solves_back_to_a_known_answer(driver):
    kw = _kw()
    price = VALUE(SETTERS[driver](kw, KNOWN[driver]))
    out = rb.solve_drivers(kw, VALUE, price, RF)[driver]
    assert out["status"] == "solved"
    assert VALUE(SETTERS[driver](kw, out["implied"])) == approx(price, rel=0.005)


def test_an_unreachable_price_is_above_range_and_a_tiny_one_below():
    kw = _kw()
    high = rb.solve_drivers(kw, VALUE, 1e6, RF)
    low = rb.solve_drivers(kw, VALUE, 0.01, RF)
    for name in ("targetMargin", "stableRoic"):
        assert high[name]["status"] == "above_range" and high[name]["implied"] is None
        assert low[name]["status"] == "below_range" and low[name]["implied"] is None


def test_search_ranges_are_the_contract():
    kw = _kw()
    out = rb.solve_drivers(kw, VALUE, VALUE(kw), RF)
    assert (out["revenueGrowth"]["low"], out["revenueGrowth"]["high"]) == (-0.1, 0.6)
    assert (out["targetMargin"]["low"], out["targetMargin"]["high"]) == (0.0, 0.8)
    assert (out["stableRoic"]["low"], out["stableRoic"]["high"]) == (0.041, 1.0)
    assert (out["salesToCapital"]["low"], out["salesToCapital"]["high"]) == (0.2, 20.0)
    assert out["targetMargin"]["model"] == 0.20 and out["stableRoic"]["model"] == 0.12


def _grid(kw, price, col):
    return rb.breakeven_grid(kw, VALUE, price, RF, col, rb.solve_drivers(kw, VALUE, price, RF))


@pytest.mark.parametrize("col", ["targetMargin", "stableRoic"])
def test_grids_run_from_the_model_past_the_implied_number_and_flag_each_cell(col):
    kw = _kw()
    price = VALUE(kw) * 1.3                     # above the model's value: both drivers must rise
    g = _grid(kw, price, col)
    drivers = rb.solve_drivers(kw, VALUE, price, RF)
    assert len(g["rowAxis"]) == len(g["colAxis"]) == 7
    assert len(g["cells"]) == 7 and all(len(r) == 7 for r in g["cells"])
    for axis in (g["rowAxis"], g["colAxis"]):
        assert axis == sorted(axis)
    # The model's own pair is an exact grid point and values at the model's value.
    assert g["rowAxis"][g["rowModelIndex"]] == kw["g_high"]
    assert g["colAxis"][g["colModelIndex"]] == (0.20 if col == "targetMargin" else 0.12)
    assert g["cells"][g["rowModelIndex"]][g["colModelIndex"]]["value"] == approx(VALUE(kw))
    # The column axis passes the implied number, so the price is crossed on the model's row.
    assert max(g["colAxis"]) > drivers[col]["implied"]
    assert g["reachesPrice"] is True
    assert any(c["atOrAbovePrice"] for c in g["cells"][g["rowModelIndex"]])
    for row in g["cells"]:
        for c in row:
            assert c["atOrAbovePrice"] == (c["value"] is not None and c["value"] >= price)


def test_a_price_no_combination_reaches_says_so():
    g = _grid(_kw(), 1e6, "targetMargin")
    assert g["reachesPrice"] is False
    # Unsolved: the margin axis runs from the model out to the search limit.
    assert g["colAxis"][0] == 0.20 and g["colAxis"][-1] == approx(0.80)


def test_the_models_own_return_is_valued_even_below_stable_growth():
    kw = _kw(roic_stable=0.035)                 # below stable growth (0.04), like AAPL
    g = _grid(kw, VALUE(kw) * 2, "stableRoic")
    j = g["colModelIndex"]
    assert g["colAxis"][j] == 0.035
    assert g["cells"][g["rowModelIndex"]][j]["value"] == approx(VALUE(kw))
    assert all(row[j]["value"] is not None for row in g["cells"])


def test_aapl_shape_growth_unsolvable_but_stable_return_solves():
    # Stable return 5% below an 8.24% cost of capital: growth destroys value, so
    # no growth reaches a price far above the model's value, but the return does.
    wacc = rb.engine_valuer(lambda b: 0.0824)
    kw = rb.with_growth(_kw(roic_high=0.05, roic_stable=0.05, margin_cur=0.30, margin_tgt=0.30),
                        0.06, 0.041)
    price = wacc(kw) * 6.0     # AAPL: $341 against a $54.91 model value
    core = rb.reverse_breakeven(kw, wacc, price, 0.041)
    d = core["drivers"]
    assert d["revenueGrowth"]["status"] == "above_range"
    assert d["stableRoic"]["status"] == "solved"
    solved = wacc(rb.with_stable_roic(kw, d["stableRoic"]["implied"]))
    assert solved == approx(price, rel=0.005)
    assert d["stableRoic"]["implied"] > 0.0824
    assert core["impliedRevenueYear10"] is None
    grid = core["grids"]["growthRoic"]
    assert grid["reachesPrice"] is True
    assert any(c["atOrAbovePrice"] for row in grid["cells"] for c in row)
    assert max(grid["colAxis"]) > d["stableRoic"]["implied"]


def test_implied_revenue_year10_follows_the_implied_growth():
    kw = _kw()
    price = VALUE(rb.with_growth(kw, 0.15, RF))
    core = rb.reverse_breakeven(kw, VALUE, price, RF)
    g = core["drivers"]["revenueGrowth"]["implied"]
    engine = rb.run_fcff_revenue(**rb.with_growth(kw, g, RF), wacc_of_beta=lambda b: WACC)
    assert core["impliedRevenueYear10"] == approx(engine["rows"][-1]["revenue"], rel=1e-6)


# --- the block on a real forecast -------------------------------------------

_CTX = {"applicable": True,
        "history": [{"revenueGrowth": x, "roic": 0.2, "salesToCapital": 1.5}
                    for x in (0.01, 0.02, 0.03, 0.04, 0.05)],
        "fiveYearMedianMargin": 0.18,
        "industry": {"totalRevenue": 1e6,
                     "ranges": {"revenueGrowth": {"median": 0.05, "p90": 0.2},
                                "operatingMargin": {"median": 0.1, "p90": 0.3},
                                "roic": {"median": 0.09, "p90": 0.25},
                                "salesToCapital": {"median": 1.2, "p90": 4.0}}}}


def test_block_on_the_page_forecast_carries_firm_and_peer_figures():
    rows = _mature_dividend_payer()
    f = _model(rows)
    before = copy.deepcopy(f)
    out = rb.build_reverse_breakeven(f, _latest(rows), _CTX)
    assert f == before
    assert out["applicable"] is True and out["priceUsed"] == f["currentPrice"]
    assert [d["driver"] for d in out["drivers"]] == ["revenueGrowth", "targetMargin",
                                                    "stableRoic", "salesToCapital"]
    by = {d["driver"]: d for d in out["drivers"]}
    assert by["revenueGrowth"]["firm"] == 0.03 and by["revenueGrowth"]["firmBasis"] == "fiveYearMedian"
    assert by["targetMargin"]["firm"] == 0.18 and by["targetMargin"]["peerTopDecile"] == 0.3
    assert by["stableRoic"]["firm"] == 0.2 and by["stableRoic"]["firmBasis"] == "latest"
    assert by["salesToCapital"]["peerMedian"] == 1.2
    p = out["plausibility"]
    assert p["currentRoic"] == 0.2 and p["wacc"] == f["assumptions"]["wacc"]
    assert p["peerTotalRevenue"] == 1e6
    assert by["revenueGrowth"]["status"] == "solved" and p["impliedRevenueYear10"] > 0
    assert p["impliedShareOfPeerRevenue"] == approx(p["impliedRevenueYear10"] / 1e6)
    assert p["impliedStableRoic"] == by["stableRoic"]["implied"]
    assert set(out["grids"]) == {"growthMargin", "growthRoic"}


def test_block_contract_when_there_is_nothing_to_solve_against():
    rows = _mature_dividend_payer()
    f = _model(rows)
    assert rb.build_reverse_breakeven(None, None, None)["applicable"] is False
    assert rb.build_reverse_breakeven({"applicable": False, "reason": "R."}, None, None) == \
        {"applicable": False, "reason": "R."}
    assert rb.build_reverse_breakeven({**f, "currentPrice": None}, _latest(rows), _CTX) == \
        {"applicable": False, "reason": rb._NO_PRICE}
    refused = {**f, "priceComparison": {"applicable": False, "reason": "Different currency."}}
    assert rb.build_reverse_breakeven(refused, _latest(rows), _CTX) == \
        {"applicable": False, "reason": "Different currency."}
    # No story context: the block still solves, the firm and peer figures are null.
    out = rb.build_reverse_breakeven(f, _latest(rows), None)
    assert out["applicable"] is True and all(d["peerMedian"] is None for d in out["drivers"])


def test_reverse_dcf_route(monkeypatch):
    from fastapi.testclient import TestClient
    api.invalidate_cache("db")
    rows = _mature_dividend_payer()
    monkeypatch.setattr(api, "_story_base", lambda tk: ({"name": "T", "industry": "W", "forecast": _model(rows)}, rows))
    monkeypatch.setattr(api, "_story_industry", lambda industry: ({}, None))
    body = TestClient(api.app).get("/api/individual/TEST/reverse-dcf").json()
    assert body["applicable"] is True and len(body["drivers"]) == 4
    monkeypatch.setattr(api, "_story_base", lambda tk: (None, []))
    api.invalidate_cache("db")
    assert TestClient(api.app).get("/api/individual/TEST2/reverse-dcf").json()["applicable"] is False
