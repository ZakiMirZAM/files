"""Story DCF glue (story_dcf.py) and the POST /api/individual/{ticker}/story-dcf route.

Prices a reader's story inputs on the page's own forecast: the same engine, the
same cost of capital, a new dict every time (the cached payload is never
mutated). An all-null story must equal the model's 3-stage variant.

Network-free and DB-free: the route tests stub _story_base.

Run:  cd backend && python -m pytest test_story_dcf.py -q
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "data"))

import copy  # noqa: E402
from pytest import approx  # noqa: E402
import individualanalysis as ia  # noqa: E402
import story_dcf as sd  # noqa: E402
from valuation.story import StoryInputs  # noqa: E402
from test_damodaran_models import _mature_dividend_payer, _profitable_fast_grower, _NORMS  # noqa: E402
# Imported here, not lazily: financial_db's global warning filter is only in force
# during collection, and api.py's pre-existing on_event deprecations would
# otherwise print from inside the first route test.
import api  # noqa: E402,F401


def _model(rows):
    return ia.compute_forecast(rows, beta=1.0, rf=0.04, erp=0.05, price=20.0, industry_norms=_NORMS)

def _latest(rows):
    return sorted(rows, key=lambda r: int(r["Calendar Year"]))[-1]

def test_model_inputs_mirror_the_forecast():
    f = _model(_mature_dividend_payer())
    mi = sd.model_inputs(f)
    assert mi.base_revenue == f["assumptions"]["baseRevenue"]
    assert mi.reinvest_method == "earnings" and mi.shares == 100.0
    assert mi.rf == f["waccBuild"]["riskFreeRate"]
    assert mi.roic_stable == f["valuationSelection"]["roicStable"]

def test_all_null_story_equals_the_model_three_stage_variant():
    for rows in (_mature_dividend_payer(), _profitable_fast_grower()):
        f = _model(rows)
        v3 = f["valuationSelection"]["stageVariants"]["3"]
        sf = sd.build_story_forecast(f, _latest(rows), StoryInputs())
        assert v3["applicable"]
        assert sf["intrinsicPerShare"] == approx(v3["intrinsicPerShare"], rel=1e-3)

def test_story_forecast_has_the_page_forecast_shape():
    rows = _mature_dividend_payer(); f = _model(rows)
    sf = sd.build_story_forecast(f, _latest(rows), StoryInputs(target_margin=0.2))
    for key in ("assumptions", "rows", "years", "pvExplicit", "pvTerminal", "terminalValue",
                "firmValue", "equityValue", "intrinsicPerShare", "currentPrice",
                "marginOfSafety", "sensitivity", "waccBuild", "storyChecks", "cash", "grossDebt"):
        assert key in sf
    assert len(sf["rows"]) == 10 and sf["years"] == [f["baseYear"] + t for t in range(1, 11)]
    assert sf["valuationSelection"] is None and sf["exitCrossCheckPerShare"] is None
    assert sf["assumptions"]["operatingMarginTarget"] == 0.2
    assert set(sf["storyChecks"]["inputs"]) == {"totalMarket", "marketGrowth10y", "shareYear10",
        "targetMargin", "salesToCapital", "failureProbability", "distressProceeds", "stableRoic"}
    assert sf["storyChecks"]["wacc"] == f["assumptions"]["wacc"]

def test_failure_probability_sets_the_one_value_per_share():
    rows = _mature_dividend_payer(); f = _model(rows)
    sf = sd.build_story_forecast(f, _latest(rows), StoryInputs(failure_probability=0.2))
    c = sf["storyChecks"]
    assert sf["intrinsicPerShare"] == approx(c["valueIfStoryWorksPerShare"] * 0.8, abs=0.01)
    assert sf["marginOfSafety"] == approx((sf["intrinsicPerShare"] - 20.0) / 20.0, abs=1e-4)

def test_unusable_price_keeps_the_margin_of_safety_empty():        # Review Focus 4
    rows = _mature_dividend_payer(); f = copy.deepcopy(_model(rows))
    f["currentPrice"] = None; f["marginOfSafety"] = None
    f["priceComparison"] = {"applicable": False, "reason": "quote is a receipt"}
    sf = sd.build_story_forecast(f, _latest(rows), StoryInputs(target_margin=0.2))
    assert sf["marginOfSafety"] is None and sf["priceComparison"]["applicable"] is False

def test_unsolvable_story_is_not_applicable_not_an_error():         # Review Focus 5
    rows = _mature_dividend_payer(); f = _model(rows)
    sf = sd.build_story_forecast(f, _latest(rows), StoryInputs(target_margin=-0.5))
    assert sf["applicable"] is False and sf["reason"]

def test_not_applicable_model_forecast_passes_its_reason_through():
    sf = sd.build_story_forecast({"applicable": False, "notApplicableReason": "FCFF is the wrong model."}, {}, StoryInputs())
    assert sf == {"applicable": False, "reason": "FCFF is the wrong model."}

def test_body_names_map_onto_story_inputs():
    s = sd.story_inputs_from_body({"totalMarket": 1.0, "marketGrowth10y": 0.02, "shareYear10": 0.1,
        "targetMargin": 0.2, "salesToCapital": 2.0, "failureProbability": 0.1,
        "distressProceeds": 5.0, "stableRoic": 0.09})
    assert s == StoryInputs(1.0, 0.02, 0.1, 0.2, 2.0, 0.1, 5.0, 0.09)

# --- routes ----------------------------------------------------------------
def _client(monkeypatch):
    import api
    from fastapi.testclient import TestClient
    rows = _mature_dividend_payer()
    monkeypatch.setattr(api, "_story_base",
                        lambda tk: ({"forecast": _model(rows), "name": "Test Co"}, sorted(rows, key=lambda r: int(r["Calendar Year"]))))
    return TestClient(api.app)

def test_individual_route_delegates_to_the_shared_payload():
    import inspect, api
    assert "_individual_payload(" in inspect.getsource(api.individual_endpoint)
    assert list(inspect.signature(api._individual_payload).parameters) == ["ticker_upper"]

def test_story_dcf_route_prices_each_body_fresh(monkeypatch):
    c = _client(monkeypatch)
    a = c.post("/api/individual/TEST/story-dcf", json={"targetMargin": 0.10}).json()
    b = c.post("/api/individual/TEST/story-dcf", json={"targetMargin": 0.30}).json()
    assert a["applicable"] is not False and a["intrinsicPerShare"] != b["intrinsicPerShare"]
    assert c.post("/api/individual/TEST/story-dcf", json={}).status_code == 200

def test_story_dcf_rejects_nonsense_at_the_boundary(monkeypatch):
    c = _client(monkeypatch)
    for body in ({"marketGrowth10y": 9}, {"failureProbability": 1.5}, {"totalMarket": "abc"},
                 {"totalMarket": 0}, {"salesToCapital": -1}, {"unknownField": 1}):
        assert c.post("/api/individual/TEST/story-dcf", json=body).status_code == 422, body

def test_story_forecast_never_mutates_the_cached_forecast():
    rows = _mature_dividend_payer(); f = _model(rows); before = copy.deepcopy(f)
    sd.build_story_forecast(f, _latest(rows), StoryInputs(target_margin=0.2, sales_to_capital=2.0))
    assert f == before

def test_story_dcf_bounds_are_exactly_the_contract_edges(monkeypatch):
    # The body bounds are the only range guard story.py has, so pin each edge.
    c = _client(monkeypatch)
    inside = ({"totalMarket": 9.9e15}, {"marketGrowth10y": -0.5}, {"marketGrowth10y": 1.0},
              {"shareYear10": 0}, {"shareYear10": 10}, {"targetMargin": -2}, {"targetMargin": 2},
              {"salesToCapital": 100}, {"failureProbability": 0}, {"failureProbability": 1},
              {"distressProceeds": 0}, {"stableRoic": 2}, {"stableRoic": None})
    outside = ({"totalMarket": 1e16}, {"marketGrowth10y": -0.51}, {"marketGrowth10y": 1.01},
               {"shareYear10": -0.01}, {"shareYear10": 10.01}, {"targetMargin": -2.01},
               {"targetMargin": 2.01}, {"salesToCapital": 0}, {"salesToCapital": 100.01},
               {"failureProbability": -0.01}, {"distressProceeds": -0.01}, {"distressProceeds": 1e16},
               {"stableRoic": 0}, {"stableRoic": 2.01},
               {"failureProbability": True}, {"targetMargin": "0.2"})   # not numbers
    for body in inside:
        assert c.post("/api/individual/TEST/story-dcf", json=body).status_code == 200, body
    for body in outside:
        assert c.post("/api/individual/TEST/story-dcf", json=body).status_code == 422, body

def test_story_dcf_without_a_forecast_is_not_applicable(monkeypatch):
    import api
    from fastapi.testclient import TestClient
    monkeypatch.setattr(api, "_story_base", lambda tk: (None, []))
    r = TestClient(api.app).post("/api/individual/TEST/story-dcf", json={}).json()
    assert r["applicable"] is False and r["reason"]
