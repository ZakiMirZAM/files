"""DCF accuracy plan (2026-09-27, built 2026-10-22): the input policies and the
acceptance criteria, network- and DB-free.

Acceptance criteria pinned here:
  * no negative terminal value, stable reinvestment below 90%;
  * no single-year swing drives growth (tripling one year's working-capital
    change or capex moves growth used by less than 1 point);
  * payment networks and data firms off the bank path, lenders on it;
  * negative book equity is not a loss;
  * VALUATION_ENGINE=legacy keeps the old rules.

Run:  cd backend && python -m pytest test_dcf_policy.py -q
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import pytest  # noqa: E402

import individualanalysis as ia  # noqa: E402
from valuation import policy as pol  # noqa: E402
from valuation import stages as vs  # noqa: E402


@pytest.fixture(autouse=True)
def _damodaran(monkeypatch):
    monkeypatch.delenv("VALUATION_ENGINE", raising=False)
    monkeypatch.delenv("GROWTH_MODEL", raising=False)


def _row(year, revenue, op_income, **kw):
    base = {
        "Calendar Year": str(year), "Revenue": revenue, "Operating Income": op_income,
        "Net Income": op_income * 0.75,
        "Total Stockholders Equity": kw.pop("equity", 1000.0),
        "Total Debt": kw.pop("debt", 0.0),
        "Cash And Cash Equivalents": kw.pop("cash", 0.0),
        "Capital Expenditure": kw.pop("capex", -100.0),
        "Depreciation And Amortization": 50.0,
        "Depreciation and Amortization Cashflow": 50.0,
        "Change In Working Capital": kw.pop("d_nwc", 10.0),
        "Income Before Tax": op_income, "Income Tax Expense": op_income * 0.21,
        "Market Cap": kw.pop("mcap", 5e9), "Weighted Average Shs Out Dil": 100.0,
    }
    base.update(kw)
    return base


def _compounder(n=8, g=0.10, margin=0.25, **override):
    rows = []
    rev = 1000.0
    for i in range(n):
        rows.append(_row(2015 + i, rev, rev * margin))
        rev *= 1 + g
    for k, v in override.items():
        rows[-2][k] = v
    return rows


def _forecast(rows, **kw):
    return ia.compute_forecast(rows, beta=1.0, rf=0.0518, erp=0.0332, price=100.0,
                               industry_norms={"salesToInvestedCapital": 2.0,
                                               "operatingMargin": 0.15,
                                               "expectedInflation": 0.022, **kw})


# ── growth driver ─────────────────────────────────────────────────────────────

def test_growth_driver_shrinks_the_organic_trend_toward_the_base_rate():
    revs = [100 * 1.30 ** i for i in range(6)]
    out = pol.growth_driver(revs, [None] * 6)
    assert out["organicTrend"] == pytest.approx(0.30)
    assert out["growth"] == pytest.approx(0.7 * 0.30 + 0.3 * 0.05)


def test_bought_revenue_is_not_organic_growth():
    # 100 -> 200 in one year, 90 of it bought: organic growth is 10%, not 100%.
    rates = pol.organic_growth_rates([100.0, 200.0], [None, 90.0])
    assert rates == [pytest.approx(0.10)]
    # never strips more than the year's gain
    assert pol.organic_growth_rates([100.0, 105.0], [None, 50.0]) == [pytest.approx(0.0)]


def test_growth_driver_needs_three_years():
    assert pol.growth_driver([100.0, 110.0, 121.0], [None] * 3) is None


def test_a_single_year_swing_does_not_drive_growth():
    base = _forecast(_compounder())
    swung = _forecast(_compounder(**{"Change In Working Capital": -90.0,
                                     "Capital Expenditure": -300.0}))
    g0 = base["assumptions"]["revenueGrowthInitial"]
    g1 = swung["assumptions"]["revenueGrowthInitial"]
    assert abs(g1 - g0) < 0.01


# ── margin target ─────────────────────────────────────────────────────────────

def test_rising_margin_is_kept_not_faded_to_the_old_median():
    out = pol.margin_target([0.20, 0.24, 0.28, 0.32, 0.36], cyclical=False)
    assert out["value"] == pytest.approx(0.36)


def test_flat_or_falling_margin_uses_the_five_year_median():
    out = pol.margin_target([0.10, 0.30, 0.25, 0.28, 0.22], cyclical=False)
    assert out["value"] == pytest.approx(0.25)


def test_cyclical_margin_uses_the_cycle_average():
    ms = [0.05, 0.15, 0.02, 0.18, 0.04, 0.16, 0.03, 0.20, 0.06, 0.25]
    out = pol.margin_target(ms, cyclical=True)
    assert out["value"] == pytest.approx((0.06 + 0.15) / 2)


# ── stable growth ─────────────────────────────────────────────────────────────

def test_stable_growth_is_the_lower_of_rf_and_nominal_growth():
    assert pol.stable_growth(0.0518, 0.040, 0.30, declining=False)["value"] == pytest.approx(0.040)
    assert pol.stable_growth(0.030, 0.040, 0.30, declining=False)["value"] == pytest.approx(0.030)
    assert pol.stable_growth(0.0518, 0.040, 0.30, declining=False, basis="rf")["value"] == pytest.approx(0.0518)


def test_stable_growth_is_decoupled_from_a_low_growth_reading():
    # The old rule set g_stable = min(rf, g_high): a -4% year meant 0% forever.
    assert pol.stable_growth(0.0518, 0.040, -0.04, declining=False)["value"] == pytest.approx(0.040)


def test_a_declining_firm_may_shrink_forever_but_not_below_the_floor():
    assert pol.stable_growth(0.05, 0.04, -0.02, declining=True)["value"] == pytest.approx(-0.02)
    assert pol.stable_growth(0.05, 0.04, -0.20, declining=True)["value"] == pytest.approx(pol.DECLINE_FLOOR)


def test_long_run_nominal_growth_uses_breakeven_inflation():
    assert pol.long_run_nominal_growth(0.025) == pytest.approx(0.018 + 0.025)
    assert pol.long_run_nominal_growth(None) == pytest.approx(0.018 + 0.022)


# ── stable return ─────────────────────────────────────────────────────────────

def test_durable_moat_keeps_a_capped_share_of_its_excess():
    out = pol.stable_return([0.40, 0.42, 0.45, 0.43, 0.44], 0.09)
    assert out["share"] == 0.5
    # durable (above WACC in all five years by 8+ points): the 6-point cap
    assert out["value"] == pytest.approx(0.09 + pol.STABLE_EXCESS_CAP_DURABLE)
    assert out["source"] == "cappedExcess"


def test_a_lapse_year_drops_the_durable_tier():
    out = pol.stable_return([0.40, 0.42, 0.08, 0.43, 0.44], 0.09)
    assert out["share"] == 0.25
    assert out["value"] == pytest.approx(0.09 + pol.STABLE_EXCESS_CAP)


def test_hypergrowth_is_not_a_margin_cycle_but_autos_are():
    assert not pol.margin_is_cyclical([100, 95, 110, 108, 120, 150, 145, 160, 170, 175],
                                      [0.27, 0.25, 0.26, 0.24, 0.27, 0.30, 0.29, 0.30, 0.31, 0.32])
    assert pol.margin_is_cyclical([100, 80, 95, 105, 90, 110, 115, 100, 120, 125],
                                  [0.06, 0.01, 0.05, 0.07, 0.02, 0.08, 0.07, 0.03, 0.06, 0.07])


def test_documented_moat_lifts_the_cap():
    out = pol.stable_return([0.40, 0.42, 0.45, 0.43, 0.44], 0.09, moat_documented=True)
    assert out["value"] == pytest.approx(0.09 + 0.5 * (0.43 - 0.09))


def test_modest_excess_gets_a_quarter_share():
    out = pol.stable_return([0.12, 0.13, 0.12, 0.14, 0.13], 0.09)
    assert out["share"] == 0.25
    assert out["value"] == pytest.approx(0.09 + 0.25 * 0.04)


def test_value_destroyer_keeps_its_own_return():
    out = pol.stable_return([0.05, 0.06, 0.05, 0.04, 0.05], 0.09)
    assert out["value"] == pytest.approx(0.05)
    assert out["source"] == "ownBelowCostOfCapital"


def test_never_below_cost_of_capital_for_a_firm_that_earns_it():
    for hist in ([0.10, 0.30, 0.09, 0.50, 0.11], [0.20, 0.20, 0.20]):
        assert pol.stable_return(hist, 0.09)["value"] >= 0.09


def test_guard_keeps_stable_reinvestment_below_ninety_percent():
    # Apple's old case: a 5.0% industry median against 5.18% stable growth.
    ronic, diag = pol.guard_stable_return(0.050, 0.0518, 0.08)
    assert 0.0518 / ronic < pol.STABLE_RR_MAX
    assert diag["id"] == "stable_return_raised"
    tv = vs.terminal_value_firm(100.0, 0.0518, 0.08, ronic)
    assert tv is not None and tv["value"] > 0


def test_guard_leaves_a_healthy_return_alone():
    assert pol.guard_stable_return(0.12, 0.04, 0.08) == (0.12, None)


# ── end-to-end acceptance on a synthetic compounder ──────────────────────────

def test_forecast_terminal_value_is_positive_and_reinvestment_bounded():
    out = _forecast(_compounder())
    assert out["terminalValue"] > 0
    assert out["rows"][-1]["reinvestmentRate"] < pol.STABLE_RR_MAX
    sel = out["valuationSelection"]
    assert sel["roicStable"] >= sel["stableReturnPolicy"]["costOfCapital"] - 1e-9
    gs = out["growthReconciliation"]["stableGrowth"]
    assert out["assumptions"]["revenueGrowthTerminal"] == pytest.approx(gs["value"], abs=1e-4)
    assert "min" in sel["stableGrowthAlternatives"]


def test_rising_margin_survives_into_the_forecast():
    rows = []
    rev = 1000.0
    for i, m in enumerate([0.20, 0.22, 0.25, 0.28, 0.31, 0.34]):
        rows.append(_row(2018 + i, rev, rev * m))
        rev *= 1.08
    out = _forecast(rows)
    assert out["assumptions"]["operatingMarginTarget"] == pytest.approx(0.34, abs=1e-4)


def test_valuation_roic_subtracts_cash():
    rows = [_row(2024, 1000.0, 200.0, equity=1000.0, cash=600.0)]
    assert ia._valuation_roic(rows, 0, None) == pytest.approx(200 * 0.79 / 400)


# ── financials routing ───────────────────────────────────────────────────────

def _fin(industry, interest_expense, receivables=0.0):
    return {"t_sector": "Financial Services", "t_industry": industry,
            "Revenue": 1000.0, "Total Assets": 5000.0,
            "Interest Expense": interest_expense, "Net Receivables": receivables}


def test_payment_networks_and_data_firms_leave_the_bank_path():
    assert ia.fcff_applicable(_fin("Financial - Credit Services", 15.0, 350.0))[0] is True   # Visa
    assert ia.fcff_applicable(_fin("Financial - Data & Stock Exchanges", 19.0))[0] is True   # S&P Global
    assert ia.fcff_applicable(_fin("Financial - Data & Stock Exchanges", None))[0] is True   # CBOE-like
    assert ia.fcff_applicable(_fin("Financial - Credit Services", 13.0, 2950.0))[0] is True  # PayPal: cheap funding


def test_lenders_stay_on_the_equity_path():
    assert ia.fcff_applicable(_fin("Financial - Credit Services", 102.0))[0] is False        # AXP: funding cost
    assert ia.fcff_applicable(_fin("Financial - Credit Services", 833.0))[0] is False        # NAVI
    assert ia.fcff_applicable(_fin("Financial - Credit Services", 31.0, 3200.0))[0] is False # SEZL: loan book
    assert ia.fcff_applicable(_fin("Financial - Credit Services", 0.0))[0] is False          # interest filed in revenue
    assert ia.fcff_applicable(_fin("Banks - Diversified", 350.0))[0] is False                # JPM


def test_legacy_keeps_the_sector_wide_guard(monkeypatch):
    monkeypatch.setenv("VALUATION_ENGINE", "legacy")
    assert ia.fcff_applicable(_fin("Financial - Credit Services", 15.0))[0] is False


# ── comparative score: negative book equity is not a loss ────────────────────

def test_negative_equity_roe_is_meaningless_not_negative():
    from comparitivestockanalysis import _has_negative_core_profit
    rows = [_row(2023, 1000.0, 300.0), _row(2024, 1100.0, 330.0, equity=-500.0, ROE=-0.5)]
    hist = ia.metric_history(rows)
    roe = hist.get("roe", {}).get(2024)
    assert roe is None
    assert _has_negative_core_profit({"roe": roe, "net_margin": 0.22}) is False


def test_young_firm_terminal_value_stays_positive_once_profitable():
    # Tesla FY2018 shape: losses today, an industry margin at the horizon, and
    # an own sales-to-capital so low that revenue-tied reinvestment would
    # exceed the terminal year's profit forever.
    from valuation import engines as ve
    out = ve.run_fcff_revenue(
        base_revenue=1000.0, margin_cur=-0.05, margin_tgt=0.06, tax=0.21,
        g_high=0.40, g_stable=0.041, n_high=0, n_transition=10,
        wacc_of_beta=lambda b: 0.09, beta_high=1.0,
        reinvest_method="salesToCapital", sales_to_capital=0.5,
        equity_adjust=0.0, shares=100.0)
    assert out is not None and out["terminalValue"] > 0


def test_engine_guards_a_low_perpetual_return_from_any_caller():
    # Tesla FY2018 as the forecast actually ran it: revenue-driven track, no
    # stable return passed, own ROIC 2.8% below 2.9% stable growth.
    from valuation import engines as ve
    out = ve.run_fcff_revenue(
        base_revenue=1000.0, margin_cur=-0.02, margin_tgt=0.058, tax=0.21,
        g_high=0.44, g_stable=0.0291, n_high=0, n_transition=10,
        wacc_of_beta=lambda b: 0.08, beta_high=1.0, roic_high=0.0277,
        roic_stable=None, reinvest_method="salesToCapital", sales_to_capital=1.5,
        equity_adjust=0.0, shares=100.0)
    assert out is not None and out["terminalValue"] > 0
    assert out["reinvestmentStable"] < 0.90
