"""Story valuation math (valuation/story.py): book replications + story rules.

Replicates Narrative and Numbers Ch.9 (Ferrari Tables 9.4 and 9.5, the Uber
failure adjustment of Table 9.2) through the production engine, then pins the
rules that decide, input by input, whether a story number is applied or the
model's own number is kept.

Network-free and DB-free.

Run:  cd backend && python -m pytest test_story_valuation.py -q
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from pytest import approx  # noqa: E402

from valuation import story as st  # noqa: E402
from valuation.engines import run_fcff_revenue  # noqa: E402

FERRARI = dict(base_revenue=2763.0, margin_cur=0.182, margin_tgt=0.182, tax=0.3354,
               g_high=0.04, g_stable=0.007, n_high=5, n_transition=5, beta_high=0.9,
               roic_high=None, roic_stable=0.007 / 0.0481, reinvest_method="salesToCapital",
               sales_to_capital=1.42, equity_adjust=-623.0 - 13.0 + 1141.0, shares=1.0)


def _ferrari_wacc(b):   # 6.96% at beta 0.9, 7.00% at the stable beta 1.0 (see Task 1 notes)
    return 0.07 + ((1.0 if b is None else b) - 1.0) * 0.004


def _rev_it_up_wacc(b):  # 8.00% at beta 2.0, 7.50% at the stable beta 1.0
    return 0.075 + ((1.0 if b is None else b) - 1.0) * 0.005


def test_ferrari_exclusive_club_replicates_table_9_4():
    # Tolerance 0.1%: the book prints whole euros and rounds every year's cash flow.
    out = run_fcff_revenue(wacc_of_beta=_ferrari_wacc, **FERRARI)
    assert out["rows"][-1]["revenue"] == approx(3715, rel=1e-3)
    assert out["terminalValue"] == approx(6835, rel=1e-3)
    assert out["pvTerminal"] == approx(3485, rel=1e-3)
    assert out["pvExplicit"] == approx(2321, rel=1e-3)
    assert out["firmValue"] == approx(5806, rel=1e-3)
    assert out["equityValue"] == approx(6311, rel=1e-3)


def test_ferrari_rev_it_up_table_9_5_uses_the_8_to_7_5_path():
    out = run_fcff_revenue(wacc_of_beta=_rev_it_up_wacc,
                           **{**FERRARI, "margin_tgt": 0.1432, "g_high": 0.12,
                              "roic_stable": 0.12, "beta_high": 2.0})
    assert out["terminalValue"] == approx(8315, rel=1e-3)
    assert out["pvTerminal"] == approx(3906, rel=1e-3)
    # Margin-fade convention differs from the book (engine (t-1)/9, book t/10): 0.7% high.
    assert out["firmValue"] == approx(5537, rel=0.01)


def test_ferrari_story_through_value_story():
    # A story whose market, growth and share land year-10 revenue on the book's 3,714.35.
    model = st.ModelInputs(base_revenue=2763.0, margin_cur=0.182, margin_tgt=0.10, tax=0.3354,
                           g_high=0.02, rf=0.007, roic=None, roic_stable=0.09,
                           reinvest_method="salesToCapital", sales_to_capital=2.0,
                           equity_adjust=505.0, shares=1.0, beta=0.9)
    story = st.StoryInputs(total_market=37143.5, market_growth=0.0, share_year10=0.1,
                           target_margin=0.182, sales_to_capital=1.42,
                           failure_probability=0.0, distress_proceeds=0.0,
                           stable_roic=0.007 / 0.0481)
    v = st.value_story(model, story, _ferrari_wacc)
    assert v["revenueGrowth"]["used"] == approx(0.04, abs=1e-5)
    assert v["engine"]["firmValue"] == approx(5806, rel=1e-3)
    assert v["failureAdjustedPerShare"] == approx(6311, rel=1e-3)
    assert all(c["status"] == "applied" for c in v["checks"].values())


def test_uber_failure_adjustment_table_9_2():
    assert st.failure_adjusted(6550.0, 0.10, 0.0) == approx(5895.0)


def test_failure_adjustment_adds_the_distress_proceeds():
    assert st.failure_adjusted(100.0, 0.25, 20.0) == approx(80.0)


def test_year10_revenue_is_market_times_growth_times_share():
    assert st.year10_revenue(100_000.0, 0.03, 0.10) == approx(100_000.0 * 1.03 ** 10 * 0.10)


def test_stable_growth_never_exceeds_the_risk_free_rate():
    assert st.stable_growth(0.12, 0.04) == 0.04
    assert st.stable_growth(0.02, 0.04) == 0.02
    assert st.stable_growth(-0.05, 0.04) == 0.0


def test_solver_recovers_ferrari_growth():
    assert st.solve_high_growth(2763.0, 3714.35, 0.007) == approx(0.04, abs=1e-5)


def test_solver_path_is_the_engine_path():
    g = st.solve_high_growth(1000.0, 3000.0, 0.04)
    out = run_fcff_revenue(base_revenue=1000.0, margin_cur=0.1, margin_tgt=0.1, tax=0.25,
                           g_high=g, g_stable=st.stable_growth(g, 0.04), n_high=5,
                           n_transition=5, wacc_of_beta=lambda b: 0.09, beta_high=1.0,
                           roic_high=None, roic_stable=0.12, reinvest_method="salesToCapital",
                           sales_to_capital=2.0, equity_adjust=0.0, shares=1.0)
    assert out["rows"][-1]["revenue"] == approx(3000.0, rel=1e-6)


def test_solver_refuses_what_it_cannot_reach():
    assert st.solve_high_growth(1000.0, 1e9, 0.04) is None      # needs over 100% a year
    assert st.solve_high_growth(1000.0, 0.0, 0.04) is None
    assert st.solve_high_growth(0.0, 1000.0, 0.04) is None
    assert st.solve_high_growth(None, 1000.0, 0.04) is None


def test_iron_triangle_on_ferrari():
    out = run_fcff_revenue(wacc_of_beta=_ferrari_wacc, **FERRARI)
    base = 2763.0 * 0.182 * (1 - 0.3354)
    assert st.iron_triangle(base, out["rows"]) == approx(0.1718, abs=5e-4)
    assert st.iron_triangle(100.0, [{"ebitAfterTax": 110.0, "reinvestment": 0.0}]) is None


def test_rating_class_maps_every_synthetic_letter():
    cases = {"Aaa/AAA": "AAA", "Aa2/AA": "AA", "A1/A+": "A", "A2/A": "A", "A3/A-": "A",
             "Baa2/BBB": "BBB", "Ba1/BB+": "BB", "Ba2/BB": "BB", "B1/B+": "B", "B2/B": "B",
             "B3/B-": "B", "Caa/CCC": "CCC/C", "Ca/CC": "CCC/C", "C/D": "CCC/C"}
    for letter, cls in cases.items():
        assert st.rating_class(letter) == cls
    assert st.rating_class(None) is None and st.rating_class("junk") is None
    assert st.TEN_YEAR_DEFAULT_RATE["BBB"] == 0.0332 and st.TEN_YEAR_DEFAULT_RATE["CCC/C"] == 0.5038


MODEL = st.ModelInputs(base_revenue=1000.0, margin_cur=0.10, margin_tgt=0.12, tax=0.25,
                       g_high=0.08, rf=0.04, roic=0.15, roic_stable=0.10,
                       reinvest_method="earnings", sales_to_capital=None,
                       equity_adjust=-200.0, shares=100.0, beta=1.1)


def _wacc(b): return 0.08 + ((1.0 if b is None else b) - 1.0) * 0.05


def test_all_null_story_runs_the_model_numbers_on_the_ten_year_shape():
    v = st.value_story(MODEL, st.StoryInputs(), _wacc)
    ref = run_fcff_revenue(base_revenue=1000.0, margin_cur=0.10, margin_tgt=0.12, tax=0.25,
                           g_high=0.08, g_stable=0.04, n_high=5, n_transition=5,
                           wacc_of_beta=_wacc, beta_high=1.1, roic_high=0.15, roic_stable=0.10,
                           reinvest_method="earnings", sales_to_capital=None,
                           equity_adjust=-200.0, shares=100.0)
    assert v["engine"]["intrinsicPerShare"] == ref["intrinsicPerShare"] == approx(14.34)
    assert v["failureAdjustedPerShare"] == approx(14.34)
    assert {c["rule"] for c in v["checks"].values()} == {"missingInput"}
    assert v["impliedShareYear10"] is None


FULL = st.StoryInputs(total_market=20000.0, market_growth=0.05, share_year10=0.12,
                      target_margin=0.20, sales_to_capital=2.5, failure_probability=0.05,
                      distress_proceeds=1000.0, stable_roic=0.11)


def test_full_story_applies_every_input():
    v = st.value_story(MODEL, FULL, _wacc)
    assert all(c["status"] == "applied" for c in v["checks"].values())
    assert v["engine"]["rows"][-1]["revenue"] == approx(20000 * 1.05 ** 10 * 0.12, rel=1e-6)
    assert v["impliedShareYear10"] == approx(0.12, rel=1e-6)
    assert v["engine"]["rows"][-1]["operatingMargin"] == approx(0.20)
    rows = v["engine"]["rows"]
    assert rows[1]["reinvestment"] == approx((rows[1]["revenue"] - rows[0]["revenue"]) / 2.5, rel=1e-4)
    assert v["distressPerShare"] == approx(10.0)
    assert v["failureAdjustedPerShare"] == approx(v["valueIfStoryWorksPerShare"] * 0.95 + 10.0 * 0.05, abs=0.01)


def test_share_above_100_keeps_the_model_growth():
    v = st.value_story(MODEL, st.StoryInputs(total_market=20000.0, market_growth=0.05, share_year10=1.2), _wacc)
    for name in ("totalMarket", "marketGrowth10y", "shareYear10"):
        assert v["checks"][name] == {"status": "kept", "rule": "shareAbove100"}
    assert v["revenueGrowth"]["used"] == 0.08
    assert v["impliedShareYear10"] == approx(v["revenueYear10"] / (20000 * 1.05 ** 10))


def test_revenue_needs_all_three_inputs():
    v = st.value_story(MODEL, st.StoryInputs(market_growth=0.05, share_year10=0.1), _wacc)
    assert v["checks"]["totalMarket"]["rule"] == "missingInput"
    assert v["checks"]["marketGrowth10y"]["rule"] == "revenueNeedsAllThree"
    assert v["checks"]["shareYear10"]["rule"] == "revenueNeedsAllThree"


def test_unreachable_revenue_is_kept_with_its_rule():
    v = st.value_story(MODEL, st.StoryInputs(total_market=1e12, market_growth=0.0, share_year10=0.5), _wacc)
    assert v["checks"]["shareYear10"]["rule"] == "growthUnsolvable"


def test_margin_at_100_and_low_stable_return_keep_the_model_numbers():
    v = st.value_story(MODEL, st.StoryInputs(target_margin=1.0, stable_roic=0.03), _wacc)
    assert v["checks"]["targetMargin"] == {"status": "kept", "rule": "marginAtOrAbove100"}
    assert v["checks"]["stableRoic"] == {"status": "kept", "rule": "stableRoicNotAboveStableGrowth"}
    assert v["engine"]["rows"][-1]["operatingMargin"] == approx(0.12)


def test_story_sales_to_capital_keeps_the_model_stable_return():
    # The story switches an earnings-method model to sales to capital but says
    # nothing about the stable return: the model's own 10% must reach the engine.
    story = st.StoryInputs(sales_to_capital=2.5)
    r = st.resolve_story(MODEL, story)
    assert r["kwargs"]["reinvest_method"] == "salesToCapital"
    assert r["kwargs"]["roic_stable"] == 0.10
    assert r["checks"]["stableRoic"] == {"status": "kept", "rule": "missingInput"}
    v = st.value_story(MODEL, story, _wacc)
    ref = run_fcff_revenue(**{**r["kwargs"], "wacc_of_beta": _wacc})
    assert v["engine"]["intrinsicPerShare"] == ref["intrinsicPerShare"] == approx(15.55)


def test_unsolvable_story_returns_none():
    assert st.value_story(MODEL, st.StoryInputs(target_margin=-0.5), _wacc) is None


def test_story_sensitivity_axes_and_failure_adjustment():
    r = st.resolve_story(MODEL, st.StoryInputs())
    plain = st.story_sensitivity(r["kwargs"], wacc=0.09, rf=0.04, probability=0.0, distress_per_share=0.0)
    assert plain["waccAxis"] == [0.075, 0.0825, 0.09, 0.0975, 0.105]
    assert plain["growthAxis"] == [0.05, 0.065, 0.08, 0.095, 0.11]
    centre = run_fcff_revenue(**{**r["kwargs"], "wacc_of_beta": lambda b: 0.09})
    assert plain["matrix"][2][2] == approx(centre["intrinsicPerShare"])
    adj = st.story_sensitivity(r["kwargs"], wacc=0.09, rf=0.04, probability=0.1, distress_per_share=0.0)
    assert adj["matrix"][2][2] == approx(plain["matrix"][2][2] * 0.9, abs=0.01)
