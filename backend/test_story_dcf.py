"""Story DCF glue (story_dcf.py) and the POST /api/individual/{ticker}/story-dcf route.

Prices a reader's story inputs on the page's own forecast: the same engine, the
same cost of capital, a new dict every time (the cached payload is never
mutated). An all-null story must equal the model's 3-stage variant.

Network-free and DB-free: the route tests stub _story_base (and _story_industry);
the industry-range test runs on an in-memory fixture database. The data-block
tests run every line through the real Tier 0 grader (rag/eval/graders.py).

Run:  cd backend && python -m pytest test_story_dcf.py -q
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "data"))

import copy  # noqa: E402
import sqlite3  # noqa: E402
import fixture_db  # noqa: E402
from pytest import approx  # noqa: E402
import individualanalysis as ia  # noqa: E402
import story_dcf as sd  # noqa: E402
from valuation.story import StoryInputs  # noqa: E402
from industry_structure.panel import IndustryPanel  # noqa: E402
from industry_structure.peers import Peer, PeerSet  # noqa: E402
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


# --- story context (GET /api/individual/{ticker}/story-context) -----------
def test_percentile_summary():
    s = sd.percentile_summary([float(x) for x in range(1, 12)] + [None, float("nan")])
    assert s == {"median": 6.0, "p75": 8.5, "p90": 10.0, "count": 11}
    assert sd.percentile_summary([1.0, 2.0]) is None

def test_company_history_and_marginal_sales_to_capital():
    rows = []
    for i, y in enumerate(range(2019, 2025)):
        rev = 100.0 + 20.0 * i
        rows.append({"Calendar Year": y, "Revenue": rev, "Operating Income": rev * 0.1,
                     "Total Stockholders Equity": 50.0 + 10.0 * i, "Total Debt": 0.0,
                     "Cash And Cash Equivalents": 0.0})
    h = sd.company_history(rows)
    assert [r["year"] for r in h] == list(range(2019, 2025))
    assert h[0]["revenueGrowth"] is None and h[1]["revenueGrowth"] == approx(0.2)
    assert h[-1]["operatingMargin"] == approx(0.1)
    assert sd.marginal_sales_to_capital(rows) == approx(100.0 / 50.0)
    assert sd.marginal_sales_to_capital(rows[:5]) is None

def test_marginal_sales_to_capital_drops_ratios_outside_the_model_bounds():
    # Buybacks can leave invested capital almost flat while revenue grows
    # (AAPL printed 246x); the model discards the same ratios.
    rows = [{"Calendar Year": y, "Revenue": 100.0 + 50.0 * i,
             "Total Stockholders Equity": 50.0 + 0.1 * i, "Total Debt": 0.0,
             "Cash And Cash Equivalents": 0.0} for i, y in enumerate(range(2019, 2025))]
    assert sd.marginal_sales_to_capital(rows) is None

def test_industry_ranges_on_a_fixture_database():
    conn = sqlite3.connect(":memory:"); conn.row_factory = sqlite3.Row
    fixture_db.create_schema(conn)
    for tk, rev, prev, m in (("A", 1000.0, 800.0, 0.10), ("B", 2000.0, 2000.0, 0.20),
                             ("C", 3000.0, 2500.0, 0.05), ("D", 4000.0, 5000.0, 0.15)):
        fixture_db.add_ticker(conn, tk, tk, "Tech", "Widgets")
        fixture_db.insert_row(conn, tk, 2025, rev=rev, op=rev * m)
        fixture_db.insert_row(conn, tk, 2024, rev=prev, op=prev * m)
    fixture_db.add_ticker(conn, "Z", "Z", "Tech", "Other")
    fixture_db.insert_row(conn, "Z", 2025, rev=9000.0, op=9000.0 * 0.9)
    r = sd.industry_ranges(conn, "Widgets")
    assert r["operatingMargin"]["median"] == approx(0.125) and r["operatingMargin"]["count"] == 4
    assert r["revenueGrowth"]["median"] == approx(0.1)
    assert r["salesToCapital"]["median"] == approx(1 / 1.1, rel=1e-4)
    assert r["roic"]["median"] == approx((0.10 + 0.15) / 2 * 0.79 / 1.2, rel=1e-3)   # stored to 4 dp

def _peer(tk, usd, local, ccy="USD"):
    return Peer(ticker=tk, name=tk, revenue_usd=usd, revenue_local=local,
                reported_currency=ccy, calendar_year=2025)

def test_market_position_from_the_panel():
    ps = PeerSet(peers=[_peer("A", 100.0, 100.0), _peer("B", 300.0, 300.0 / 1.1, "EUR"),
                        _peer("C", 600.0, 600.0)], fiscal_year=2025, group_name="Widgets")
    panel = IndustryPanel(by_year={2025: ps}, fiscal_year=2025, industry="Widgets", ticker_spans={})
    m = sd.market_position(panel, "B")
    assert m["companyShare"] == approx(0.3) and m["totalRevenue"] == approx(300.0 / 1.1 / 0.3)
    assert m["fiscalYear"] == 2025 and m["firmCount"] == 3
    assert sd.market_position(panel, "ZZZ")["companyShare"] is None
    assert sd.market_position(None, "B") == {"fiscalYear": None, "firmCount": None,
                                              "totalRevenue": None, "companyShare": None}

_FULL_RANGES = {"operatingMargin": {"median": 0.0446, "p75": 0.081, "p90": 0.123, "count": 40},
                "salesToCapital": {"median": 1.1, "p75": 1.6, "p90": 2.4, "count": 40},
                "roic": {"median": 0.071, "p75": 0.102, "p90": 0.155, "count": 40},
                "revenueGrowth": {"median": 0.031, "p75": 0.064, "p90": 0.118, "count": 40}}

def _ctx(ranges=None):
    rows = _mature_dividend_payer()
    analysis = {"name": "Test Co", "industry": "Widgets", "forecast": _model(rows),
                "creditAnalysis": {"rating": {"letter": "A3/A-"}}}
    ranges = ranges or {"operatingMargin": {"median": 0.0446, "p75": 0.081, "p90": 0.123, "count": 40},
                        "salesToCapital": None, "roic": None, "revenueGrowth": None}
    market = {"fiscalYear": 2025, "firmCount": 42, "totalRevenue": 45.6e9, "companyShare": 0.0606}
    return sd.build_story_context(ticker="TEST", analysis=analysis, rows=rows, ranges=ranges, market=market)

def test_story_context_carries_the_contract_keys():
    c = _ctx()
    f = _model(_mature_dividend_payer())
    assert c["applicable"] is True and c["companyName"] == "Test Co" and c["ticker"] == "TEST"
    for key in ("currency", "latestYear", "history", "fiveYearMedianMargin", "marginalSalesToCapital5y",
                "industry", "credit", "balance", "riskFreeRate", "wacc", "model", "defaultRates", "dataBlock"):
        assert key in c
    assert c["credit"]["syntheticRating"] == "A3/A-"
    assert c["credit"]["ratingClass"] == "A" and c["credit"]["tenYearDefaultRate"] == 0.0124
    assert c["model"]["revenueGrowthInitial"] == f["assumptions"]["revenueGrowthInitial"]
    assert c["industry"]["companyShare"] == 0.0606 and c["industry"]["name"] == "Widgets"
    assert len(c["history"]) == 9 and c["history"][-1]["year"] == c["latestYear"]   # JSON keeps it

def test_data_block_lines_follow_the_grader_grammar():
    lines = _ctx()["dataBlock"].splitlines()
    for expected in ("Peer group: Widgets, fiscal year 2025",
                     "Peer company count: 42",
                     "Peer median operating margin: 4.46%",
                     "Peer top decile operating margin: 12.30%",
                     "Peer total revenue: $45.6B",
                     "Firm share of peer revenue: 6.06%",
                     "Synthetic rating class: single-A",
                     "Ten-year default rate for the single-A rating class: 1.24%",
                     "Ten-year default rate for the CCC/C rating class: 50.38%"):
        assert expected in lines
    assert any(l.startswith("Firm operating margin: ") and l.endswith("%") for l in lines)
    assert any(l.startswith("Model long-run operating margin: ") and l.endswith("%") for l in lines)
    assert not any("None" in l or "n/a" in l for l in lines)
    assert not any(l[0].isdigit() for l in lines)                          # no per-year lines
    assert not any(l.startswith("Peer median sales to capital") for l in lines)  # missing range omitted
    assert not any(l.startswith("Model sales to capital") for l in lines)  # earnings track: no ratio

# --- the data block under the real Tier 0 grader ----------------------------
# The exact line grammar, in order, with every figure present. Task 4's prompt
# is written against this list; change both together.
_BLOCK_LABELS = [
    "Company",
    "Firm revenue", "Firm revenue growth", "Firm operating margin", "Firm sales to capital", "Firm ROIC",
    "Five-year median operating margin", "Marginal sales to capital over five years",
    "Peer group", "Peer company count", "Peer total revenue", "Firm share of peer revenue",
    *(f"Peer {stat} {metric}"
      for metric in ("operating margin", "sales to capital", "ROIC", "revenue growth")
      for stat in ("median", "upper quartile", "top decile")),
    "Synthetic rating", "Synthetic rating class", "Interest coverage",
    "Cash", "Gross debt", "Minority interest", "Diluted shares", "Risk-free rate", "WACC",
    "Model high growth rate", "Model stable growth rate", "Model operating margin today",
    "Model long-run operating margin", "Model sales to capital",
    "Model return on capital after growth ends", "Model tax rate", "Model intrinsic value per share",
    *(f"Ten-year default rate for the {cls} rating class"
      for cls in ("AAA", "AA", "single-A", "BBB", "BB", "B", "CCC/C")),
]
_TEXT_ONLY = {"Company", "Peer group", "Synthetic rating class"}   # no figure to grade

def _grader():
    # The production grader exactly as rag/verify.py imports it (rag appended,
    # so no rag module can shadow a backend one), with its acronym map loaded.
    rag = os.path.join(os.path.dirname(__file__), "..", "rag")
    if rag not in sys.path:
        sys.path.append(rag)
    from eval import graders
    assert graders.EXPANSIONS, "the grader loaded without its production acronym map"
    return graders

def _full_block():
    c = _ctx(_FULL_RANGES)
    # This fixture leaves three figures empty; fill them so every grammar line prints.
    return sd.story_data_block({**c, "marginalSalesToCapital5y": 1.38,
                                "credit": {**c["credit"], "interestCoverage": 22.4},
                                "balance": {**c["balance"], "minorityInterest": 12.0},
                                "model": {**c["model"], "salesToCapital": 1.42}})

def _figure_lines(block):
    for line in block.splitlines():
        label, value = line.split(": ", 1)
        if label not in _TEXT_ONLY:
            yield line, label, value

def test_full_data_block_has_the_exact_grammar():
    assert [line.split(": ", 1)[0] for line in _full_block().splitlines()] == _BLOCK_LABELS

def test_every_data_block_figure_binds_to_its_own_line_in_the_real_grader():
    g = _grader()
    block = _full_block()
    context = g.parse_context(block)
    for line, label, value in _figure_lines(block):
        proof = f"{label} is {value}."
        rep = g.report(proof, block)
        assert rep["matched"] >= 1 and rep["mismatched"] == 0 and rep["flagged"] == [], proof
        (claim,) = [c for c in g.grade_claims(proof, block) if c.token.gradable]
        own = g.parse_context(line)[0].label
        assert claim.expected_label == own, proof
        # Unique: no other line of a comparable unit ties with the claim's label.
        ties = [c.label for c in context if g._units_line_up(claim.token.unit, c.unit)
                and g.label_score(claim.token.label, c.label) >= 1.0]
        assert ties == [own], (proof, ties)

def test_a_wrong_figure_against_any_data_block_line_is_flagged():
    import re
    g = _grader()
    block = _full_block()

    def wrong(m):     # same written precision, clearly a different number
        digits = len(m.group(0).split(".")[1]) if "." in m.group(0) else 0
        return f"{float(m.group(0)) * 2 + 7:.{digits}f}"

    for line, label, value in _figure_lines(block):
        proof = f"{label} is {re.sub(r'[0-9]+(?:[.][0-9]+)?', wrong, value, count=1)}."
        rep = g.report(proof, block)
        assert rep["mismatched"] == 1 and rep["matched"] == 0, proof
        assert rep["flagged"][0].expected_label == g.parse_context(line)[0].label, proof

def test_story_industry_reads_ranges_and_the_panel_share(monkeypatch):
    # The real panel loader on a fixture DB: its peer tickers must be the ones
    # market_position looks up, or every company silently loses its share line.
    import contextlib
    import api
    from connections.sector_cache import clear_sector_cache
    conn = sqlite3.connect(":memory:"); conn.row_factory = sqlite3.Row
    fixture_db.create_schema(conn)
    for tk, rev in (("SA", 1000.0), ("SB", 3000.0), ("SC", 6000.0)):
        fixture_db.add_ticker(conn, tk, tk, "Tech", "StoryWidgets")
        fixture_db.insert_row(conn, tk, 2025, rev=rev)
        fixture_db.insert_row(conn, tk, 2024, rev=rev)
    monkeypatch.setattr(api, "db_conn", lambda: contextlib.nullcontext(conn))
    assert api._story_industry(None) == ({}, None)
    try:
        ranges, panel = api._story_industry("StoryWidgets")
        m = sd.market_position(panel, "SB")
    finally:
        clear_sector_cache()
    assert ranges["operatingMargin"]["count"] == 3
    assert m["companyShare"] == approx(0.3) and m["totalRevenue"] == approx(10000.0)
    assert m["firmCount"] == 3 and m["fiscalYear"] == 2025

def test_story_context_route(monkeypatch):
    import api
    from fastapi.testclient import TestClient
    api.invalidate_cache("db")
    rows = _mature_dividend_payer()
    monkeypatch.setattr(api, "_story_base", lambda tk: ({"name": "T", "industry": "W", "forecast": _model(rows)}, rows))
    monkeypatch.setattr(api, "_story_industry", lambda industry: ({}, None))
    body = TestClient(api.app).get("/api/individual/TEST/story-context").json()
    assert body["applicable"] is True and body["dataBlock"]
    monkeypatch.setattr(api, "_story_base", lambda tk: (None, []))
    api.invalidate_cache("db")
    assert TestClient(api.app).get("/api/individual/TEST2/story-context").json()["applicable"] is False


def test_story_dcf_body_takes_a_stage_count(monkeypatch):
    c = _client(monkeypatch)
    for n in (1, 2, 3):
        r = c.post("/api/individual/TEST/story-dcf", json={"stages": n}).json()
        assert r["storyChecks"]["stages"] == {"story": n, "used": n}
        assert len(r["rows"]) == {1: 0, 2: 5, 3: 10}[n] and r["assumptions"]["horizonYears"] == len(r["rows"])
    assert c.post("/api/individual/TEST/story-dcf", json={"stages": None}).json()["storyChecks"]["stages"] == \
        {"story": None, "used": 3}
    for bad in (0, 4, 2.5, "2", True):
        assert c.post("/api/individual/TEST/story-dcf", json={"stages": bad}).status_code == 422, bad


def test_all_null_story_with_no_stage_count_is_the_three_stage_variant():
    rows = _mature_dividend_payer(); f = _model(rows)
    sf = sd.build_story_forecast(f, _latest(rows), sd.story_inputs_from_body({"stages": None}))
    assert sf["intrinsicPerShare"] == approx(f["valuationSelection"]["stageVariants"]["3"]["intrinsicPerShare"], rel=1e-3)
