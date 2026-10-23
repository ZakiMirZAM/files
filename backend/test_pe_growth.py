"""P/E vs growth and returns, and justified EV/NOPAT: the arithmetic.

Every expected number below is either the owner's worked example (feature plan
item 3), a worked illustration from Damodaran, *Investment Valuation* (4th ed.)
Ch.18, or recomputed by hand in the test's comment.

Run:  cd backend && python -m pytest test_pe_growth.py -q
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import pytest  # noqa: E402

from valuation import pe_growth as pg  # noqa: E402


# ── Single-stage: fair P/E, no-growth P/E, implied growth, implied return ──

def test_fair_pe_matches_the_worked_example():
    # (1 − 0.04 ÷ 0.18) ÷ (0.09 − 0.04) = 15.56
    assert pg.fair_forward_pe(roe=0.18, ke=0.09, g=0.04) == pytest.approx(15.556, abs=1e-3)


def test_growth_adds_nothing_when_roe_equals_the_cost_of_equity():
    # ROE = Ke: every growth rate gives 1 ÷ Ke = 11.1x.
    for g in (0.0, 0.02, 0.05):
        assert pg.fair_forward_pe(roe=0.09, ke=0.09, g=g) == pytest.approx(1 / 0.09)


def test_fair_pe_is_undefined_when_growth_reaches_the_cost_of_equity():
    assert pg.fair_forward_pe(roe=0.18, ke=0.09, g=0.09) is None
    assert pg.fair_forward_pe(roe=-0.05, ke=0.09, g=0.02) is None


def test_implied_growth_matches_the_worked_example():
    # 25x at an 18% ROE and a 9% cost of equity needs 6.4% a year forever.
    g = pg.implied_growth(pe=25, roe=0.18, ke=0.09)
    assert g == pytest.approx(0.0643, abs=1e-4)
    # Round trip: that growth gives back the P/E.
    assert pg.fair_forward_pe(roe=0.18, ke=0.09, g=g) == pytest.approx(25)


def test_implied_growth_is_none_when_no_growth_rate_reaches_the_pe():
    # ROE = Ke: the fair P/E is 11.1x whatever the growth, so 25x has no answer.
    assert pg.implied_growth(pe=25, roe=0.09, ke=0.09) is None


def test_implied_return_and_fair_pe_need_growth_below_roe():
    # Growth at or above ROE needs a negative payout: the equation no longer
    # describes a buyer's return (TSM live: g 29.5% > ROE 24.7% gave r < g),
    # and a fair P/E would come out negative (ROE 3%, Ke 8%, g 4% → −8.33x).
    assert pg.implied_return(pe=20.0, roe=0.2466, g=0.2947) is None
    assert pg.fair_forward_pe(roe=0.03, ke=0.08, g=0.04) is None


def test_implied_growth_below_minus_100_percent_is_none():
    # Bank-like inputs: P/E 8.8 at ROE 11.54%, Ke 7.86% solves to −229% a year.
    assert pg.implied_growth(pe=8.8, roe=0.1154, ke=0.0786) is None
    # −87.5% is extreme but still a possible rate, so it stays.
    assert pg.implied_growth(pe=9.0, roe=0.1154, ke=0.0786) == pytest.approx(-0.875, abs=1e-3)


def test_implied_return_inverts_the_same_equation():
    # r = g + (1 − g/ROE) ÷ P/E = 0.04 + 0.7778 ÷ 15.556 = 0.09
    assert pg.implied_return(pe=15.556, roe=0.18, g=0.04) == pytest.approx(0.09, abs=1e-4)


def test_growth_premium_share_of_price():
    # 4% earnings yield against a 9% cost of equity: 1 − 0.04/0.09 = 55.6% of
    # the price pays for growth.
    assert pg.growth_premium_share(earnings_yield=0.04, ke=0.09) == pytest.approx(0.5556, abs=1e-4)


# ── Two-stage P/E (Damodaran Ch.18) ────────────────────────────────────────

def test_two_stage_reproduces_illustration_18_1():
    # Five years at 20% with a 20% payout, then 4% with a 60% payout, Ke 9.5%.
    pe = pg.two_stage_pe(g=0.20, n=5, payout=0.20, ke=0.095,
                         g_stable=0.04, payout_stable=0.60, trailing=True)
    assert pe == pytest.approx(19.26, abs=0.01)


def test_two_stage_reproduces_the_pg_illustration():
    # P&G, May 2011: 10% for five years at a 50% payout and Ke 8%, then 3% at
    # a 75% payout and Ke 8.5%.
    pe = pg.two_stage_pe(g=0.10, n=5, payout=0.50, ke=0.08, g_stable=0.03,
                         payout_stable=0.75, ke_stable=0.085, trailing=True)
    assert pe == pytest.approx(18.04, abs=0.01)


def test_forward_two_stage_is_trailing_divided_by_one_plus_g():
    kw = dict(g=0.20, n=5, payout=0.20, ke=0.095, g_stable=0.04, payout_stable=0.60)
    assert pg.two_stage_pe(**kw) == pytest.approx(pg.two_stage_pe(**kw, trailing=True) / 1.20)


def test_growth_at_the_cost_of_equity_uses_the_limit_not_a_division_by_zero():
    pe = pg.two_stage_pe(g=0.09, n=5, payout=0.5, ke=0.09, g_stable=0.03, payout_stable=0.6)
    assert math.isfinite(pe)


def test_panel_two_stage_at_zero_years_is_the_stable_term_alone():
    # After the high-growth years new investment earns only Ke. As n → 0 the
    # high-growth term vanishes and E₁ ÷ Ke remains, restated on the year-1
    # earnings the formula is written in: (1 + g_stable) ÷ ((1 + g) × Ke).
    pe = pg.panel_two_stage_pe(g=0.15, n=1e-9, roe=0.25, ke=0.09, g_stable=0.03)
    assert pe == pytest.approx(1 / 0.09 * 1.03 / 1.15, rel=1e-6)


def test_solve_two_stage_growth_round_trips():
    target = pg.panel_two_stage_pe(g=0.12, n=5, roe=0.25, ke=0.09, g_stable=0.03)
    out = pg.solve_two_stage_growth(pe=target, n=5, roe=0.25, ke=0.09, g_stable=0.03)
    assert out["growth"] == pytest.approx(0.12, abs=1e-5)
    assert out["bound"] is None


def test_two_stage_growth_cannot_reach_a_pe_the_roe_does_not_support():
    # ROE 18%, Ke 9%: five years of any growth tops out near 21x, because
    # growth above ROE needs a negative payout. 25x comes back as a bound.
    out = pg.solve_two_stage_growth(pe=25, n=5, roe=0.18, ke=0.09, g_stable=0.04)
    assert out == {"growth": None, "bound": "above"}


def test_implied_years_round_trips():
    target = pg.panel_two_stage_pe(g=0.12, n=7.5, roe=0.25, ke=0.09, g_stable=0.03)
    out = pg.solve_high_growth_years(pe=target, g=0.12, roe=0.25, ke=0.09, g_stable=0.03)
    assert out["years"] == pytest.approx(7.5, abs=1e-3)
    assert out["bound"] is None


def test_implied_years_reports_the_side_it_falls_off():
    # A P/E no number of years reaches is reported as a bound, not a number.
    out = pg.solve_high_growth_years(pe=500, g=0.12, roe=0.25, ke=0.09, g_stable=0.03)
    assert out["years"] is None and out["bound"] == "above"
    out = pg.solve_high_growth_years(pe=2, g=0.12, roe=0.25, ke=0.09, g_stable=0.03)
    assert out["years"] is None and out["bound"] == "below"


# ── Grid, rate shock and scenarios ─────────────────────────────────────────

def test_fair_pe_grid_centres_on_the_base_case():
    grid = pg.fair_pe_grid(roe=0.18, ke=0.09, g=0.04)
    assert grid["keAxis"][2] == pytest.approx(0.09)
    assert grid["growthAxis"][2] == pytest.approx(0.04)
    assert grid["matrix"][2][2] == pytest.approx(15.556, abs=1e-3)
    # Ke 7% with growth 6%: (1 − 0.06/0.18) ÷ 0.01 = 66.67
    assert grid["matrix"][0][4] == pytest.approx(66.667, abs=1e-2)
    # A cell where growth reaches the cost of equity is blank, never negative.
    tight = pg.fair_pe_grid(roe=0.18, ke=0.05, g=0.04)
    assert tight["matrix"][0][4] is None


def test_rate_shock_moves_the_cost_of_equity_and_the_growth_cap_together():
    # rf 4%, Ke 9%, b × ROE = 10% so stable growth is capped at rf.
    out = pg.rate_shock(roe=0.18, ke=0.09, rf=0.04, sustainable_growth=0.10)
    # +100 bp: Ke 10%, g capped at 5% → (1 − 0.05/0.18) ÷ 0.05 = 14.44
    assert out["up"] == pytest.approx(14.444, abs=1e-3)
    # −100 bp: Ke 8%, g capped at 3% → (1 − 0.03/0.18) ÷ 0.05 = 16.67
    assert out["down"] == pytest.approx(16.667, abs=1e-3)


def test_scenarios_rank_the_panel_growth_rates():
    out = pg.growth_scenarios({"historical": 0.20, "sustainable": 0.05, "consensus": 0.10},
                              roe=0.25, ke=0.09, g_stable=0.03)
    assert [s["case"] for s in out] == ["bear", "base", "bull"]
    assert [s["growth"] for s in out] == [0.05, 0.10, 0.20]
    assert [s["source"] for s in out] == ["sustainable", "consensus", "historical"]
    assert out[0]["fairPe"] < out[1]["fairPe"] < out[2]["fairPe"]


def test_scenarios_skip_missing_growth_rates():
    out = pg.growth_scenarios({"historical": None, "sustainable": 0.05, "consensus": 0.10},
                              roe=0.25, ke=0.09, g_stable=0.03)
    assert [s["case"] for s in out] == ["bear", "bull"]


# ── Historical growth, the Ch.11 methods ───────────────────────────────────

def test_geometric_growth():
    # 1.00 → 1.61051 over five years is 10% a year.
    assert pg.geometric_growth(1.0, 1.61051, 5) == pytest.approx(0.10, abs=1e-6)


def test_geometric_growth_is_not_meaningful_with_negative_ends():
    assert pg.geometric_growth(-1.0, 2.0, 5) is None
    assert pg.geometric_growth(1.0, -2.0, 5) is None


def test_log_linear_growth_is_compound_not_log_points():
    # An exact 10% series: the regression slope is ln(1.1); the reported
    # growth must be exp(slope) − 1 = 10%, not 9.53 log points.
    series = [1.1 ** t for t in range(6)]
    assert pg.log_linear_growth(series) == pytest.approx(0.10, abs=1e-9)


def test_log_linear_growth_needs_positive_earnings():
    assert pg.log_linear_growth([1.0, -0.5, 1.2, 1.3]) is None


# ── Peer regression ────────────────────────────────────────────────────────

def test_ols_recovers_a_line():
    fit = pg.ols([0.0, 0.1, 0.2, 0.3], [10.0, 15.0, 20.0, 25.0])
    assert fit["slope"] == pytest.approx(50.0)
    assert fit["intercept"] == pytest.approx(10.0)
    assert fit["r2"] == pytest.approx(1.0)


def test_ols_needs_three_points_and_spread_in_x():
    assert pg.ols([0.1, 0.2], [10.0, 12.0]) is None
    assert pg.ols([0.1, 0.1, 0.1], [10.0, 12.0, 14.0]) is None


# ── Justified EV/NOPAT (item 2) ────────────────────────────────────────────

def test_justified_ev_nopat_hand_computed():
    # ROIC 15%, WACC 10%, g 3%: (1 − 0.03/0.15)(1.03) ÷ 0.07 = 11.771
    assert pg.justified_ev_nopat(roic=0.15, wacc=0.10, g=0.03) == pytest.approx(11.771, abs=1e-3)


def test_justified_ev_nopat_ignores_growth_when_roic_equals_wacc():
    # No spread, no value from growth: (1 + g) ÷ WACC whatever g is.
    for g in (0.0, 0.02, 0.04):
        assert pg.justified_ev_nopat(roic=0.10, wacc=0.10, g=g) == pytest.approx((1 + g) / 0.10)


def test_justified_ev_nopat_undefined_cases():
    assert pg.justified_ev_nopat(roic=0.15, wacc=0.03, g=0.03) is None
    assert pg.justified_ev_nopat(roic=0.0, wacc=0.10, g=0.03) is None


def test_justified_ev_nopat_is_none_when_growth_outruns_roic():
    # DUK live: ROIC 4.13% under g 5.18% needs reinvestment above 100% of
    # NOPAT, so free cash flow is negative and the multiple would read −21.7x.
    assert pg.justified_ev_nopat(roic=0.0413, wacc=0.066, g=0.0518) is None
