"""Life-cycle-aware growth estimation + the growth-viability deck (Damodaran Ch.11).

Network-free and DB-free: the functions under test are pure given row-like
mappings, so plain dicts stand in for sqlite3.Row.

Run:  cd backend && python -m pytest test_growth_estimation.py -q
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "data"))

import pytest  # noqa: E402

import individualanalysis as ia  # noqa: E402


# ── Helpers ──────────────────────────────────────────────────────────────────

def _row(year, revenue, op_income, **kw):
    """A financials row with the columns the growth engine reads."""
    base = {
        "Calendar Year": str(year),
        "Revenue": revenue,
        "Operating Income": op_income,
        "Net Income": op_income * 0.75 if op_income is not None else None,
        "Total Stockholders Equity": kw.get("equity", 1000.0),
        "Total Debt": kw.get("debt", 0.0),
        "Cash And Cash Equivalents": kw.get("cash", 0.0),
        "Capital Expenditure": kw.get("capex", -100.0),
        "Depreciation And Amortization": kw.get("dep", 50.0),
        "Depreciation and Amortization Cashflow": kw.get("dep", 50.0),
        "Change In Working Capital": kw.get("d_nwc", 10.0),
        "Income Before Tax": op_income,
        "Income Tax Expense": (op_income * 0.21) if (op_income or 0) > 0 else 0.0,
        "Market Cap": kw.get("mcap", 5e9),
    }
    base.update({k: v for k, v in kw.items() if k not in
                 ("equity", "debt", "cash", "capex", "dep", "d_nwc", "mcap")})
    return base


@pytest.fixture(autouse=True)
def _default_mode(monkeypatch):
    """Every test states its own mode; default the env so one test cannot leak
    its GROWTH_MODEL into the next."""
    monkeypatch.delenv("GROWTH_MODEL", raising=False)


# ── The flag ─────────────────────────────────────────────────────────────────

def test_growth_model_defaults_to_shadow(monkeypatch):
    monkeypatch.delenv("GROWTH_MODEL", raising=False)
    assert ia.growth_model() == "shadow"


def test_growth_model_rejects_junk(monkeypatch):
    monkeypatch.setenv("GROWTH_MODEL", "banana")
    assert ia.growth_model() == "shadow"      # never silently drives valuations


@pytest.mark.parametrize("mode", ["regression", "shadow", "fundamental"])
def test_growth_model_reads_each_mode(monkeypatch, mode):
    monkeypatch.setenv("GROWTH_MODEL", mode)
    assert ia.growth_model() == mode


# ── Sales-to-capital: cash must be subtracted ────────────────────────────────

def test_sales_to_capital_subtracts_cash():
    # A cash-rich company: equity 1000, no debt, 600 of it is undeployed cash.
    # Capital actually working in the business is 400, not 1000. Leaving the cash
    # in would report 1.0 and then demand 2.5x the reinvestment it really needs.
    r = _row(2024, revenue=400.0, op_income=40.0, equity=1000.0, cash=600.0)
    assert ia.sales_to_capital(r) == pytest.approx(1.0)      # 400 / (1000 + 0 - 600)


def test_sales_to_capital_rejects_implausible_ratio():
    r = _row(2024, revenue=1.0, op_income=0.1, equity=1000.0)   # ratio 0.001
    assert ia.sales_to_capital(r) is None


def test_sales_to_capital_rejects_nonpositive_capital():
    r = _row(2024, revenue=500.0, op_income=50.0, equity=100.0, cash=500.0)
    assert ia.sales_to_capital(r) is None       # capital would be negative


# ── Fundamental growth: reinvestment rate x ROIC (+ efficiency) ──────────────

def test_fundamental_growth_is_reinvestment_times_roic():
    # reinvestment rate = (|capex| - dep + d_nwc) / NOPAT = (100 - 50 + 10) / NOPAT.
    # Both years carry the same return on capital, so there is no efficiency gain
    # and the growth is purely reinvestment x ROIC.
    rows = [_row(2023, 900.0, 100.0), _row(2024, 1000.0, 100.0)]
    roic = ia._compute_return_ratios(rows[-1]).get("Return On Invested Capital")
    nopat = ia._nopat_for_row(rows[-1])
    expected_reinvest = (100.0 - 50.0 + 10.0) / nopat
    out = ia._fundamental_growth(rows, roic=roic)
    assert out is not None
    assert out["reinvestmentRate"] == pytest.approx(expected_reinvest, rel=1e-3)
    assert out["efficiencyTerm"] == 0.0          # flat return, so no second-order term
    assert out["growth"] == pytest.approx(expected_reinvest * roic, rel=1e-3)


def test_fundamental_growth_adds_efficiency_when_roic_improves():
    # Prior-year ROIC lower than this year's adds the (new - old)/old term, which
    # a purely backward-looking growth rate cannot see (Damodaran Ch.11).
    rows = [_row(2023, 900.0, 50.0), _row(2024, 1000.0, 100.0)]
    flat = ia._fundamental_growth(rows, roic=0.20)
    assert flat is not None
    assert flat["efficiencyTerm"] > 0.0
    assert flat["growth"] > flat["base"]


def test_fundamental_growth_none_when_roic_carries_no_signal():
    rows = [_row(2023, 900.0, -50.0), _row(2024, 1000.0, -80.0)]
    assert ia._fundamental_growth(rows, roic=-0.05) is None
    assert ia._fundamental_growth(rows, roic=0.0) is None
    assert ia._fundamental_growth(rows, roic=None) is None


# ── Reconciliation: which growth leads, and why ──────────────────────────────

def test_reconcile_leans_fundamental_for_a_mature_company():
    g, note = ia._reconcile_growth(historical=0.04, fundamental=0.10, stage="mature")
    expected = 0.60 * 0.10 + 0.40 * 0.04     # FUNDAMENTAL_BLEND_WEIGHT
    assert g == pytest.approx(expected)
    assert "fundamental" in note


def test_reconcile_lets_the_revenue_trend_lead_for_a_young_company():
    # A young company's return on capital says nothing about its growth, so the
    # revenue path leads and fundamentals become the sustainability check.
    g, note = ia._reconcile_growth(historical=0.40, fundamental=0.05, stage="emerging")
    assert g == 0.40
    assert "revenue trend" in note


def test_reconcile_falls_back_to_history_when_fundamental_is_missing():
    g, note = ia._reconcile_growth(historical=0.07, fundamental=None, stage="mature")
    assert g == 0.07
    assert "not meaningful" in note


# ── Life-cycle-aware clamps ──────────────────────────────────────────────────

def test_stage_bounds_do_not_clip_a_young_grower_at_the_mature_ceiling():
    lo_e, hi_e = ia._stage_bounds("emerging")
    lo_m, hi_m = ia._stage_bounds("mature")
    assert hi_m == ia.FORECAST_GROWTH_CAP      # mature keeps today's 25%
    assert hi_e > hi_m                          # a young grower is not clipped to it
    assert hi_e >= 0.50


def test_stage_bounds_let_a_declining_firm_actually_shrink():
    lo_d, _ = ia._stage_bounds("declining")
    assert lo_d < ia.FORECAST_GROWTH_FLOOR


def test_stage_bounds_fall_back_to_the_flat_pair_when_stage_is_unknown():
    assert ia._stage_bounds(None) == (ia.FORECAST_GROWTH_FLOOR, ia.FORECAST_GROWTH_CAP)


# ── The shadow-mode guarantee ────────────────────────────────────────────────

def _profitable_fast_grower():
    """Profitable (so the earnings bridge values it today) AND growing fast enough
    to be classified `emerging`, which is the exact company whose valuation the
    wider stage ceiling would move. Revenue compounds at ~30%, well past the flat
    25% cap, so the two ceilings genuinely disagree."""
    rows, rev, op = [], 400.0, 60.0
    for y in range(2017, 2026):
        rows.append(_row(y, rev, op, equity=900.0, debt=100.0, cash=50.0,
                         capex=-90.0, dep=40.0,
                         **{"Weighted Average Shs Out Dil": 100.0}))
        rev *= 1.30
        op *= 1.30
    return rows


def _forecast(rows, mode, monkeypatch):
    monkeypatch.setenv("GROWTH_MODEL", mode)
    return ia.compute_forecast(rows, beta=1.0, rf=0.04, erp=0.045, price=100.0,
                               industry_norms={"salesToInvestedCapital": 2.0,
                                               "operatingMargin": 0.15,
                                               "revenueGrowth": 0.08})


def test_shadow_does_not_move_the_valuation_of_a_company_that_already_had_one(monkeypatch):
    # The whole promise of `shadow`: a company with an intrinsic value today comes
    # out of shadow with the SAME intrinsic value. The trap is the stage ceiling.
    # A profitable company classified `emerging` would see its cap widen from 25%
    # to 60%, which moves the number before the user ever flips the flag.
    rows = _profitable_fast_grower()
    base = _forecast(rows, "regression", monkeypatch)
    shadow = _forecast(rows, "shadow", monkeypatch)
    assert base is not None and shadow is not None

    life = shadow["lifecycle"]
    assert life["applicable"] and life["stage"] == "emerging"     # the risky case
    gr = shadow["growthReconciliation"]
    assert gr["reinvestmentMethod"] == "earnings"                 # already valued
    assert gr["growthCap"] == ia.FORECAST_GROWTH_CAP              # stage cap withheld

    assert shadow["intrinsicPerShare"] == base["intrinsicPerShare"]
    assert (shadow["assumptions"]["revenueGrowthInitial"]
            == base["assumptions"]["revenueGrowthInitial"] == ia.FORECAST_GROWTH_CAP)

    # ...and flipping the flag is what lets the stage ceiling through.
    full = _forecast(rows, "fundamental", monkeypatch)
    assert full["growthReconciliation"]["growthCap"] == ia._stage_bounds("emerging")[1]


# ── The sales-to-capital projection values a loss-making company ─────────────

def _projection(reinvest_method, roic, s2c=None):
    return ia._run_fcff_projection(
        base_revenue=1000.0, margin_cur=-0.05, margin_tgt=0.15, tax=0.21,
        roic=roic, wacc=0.09, g_init=0.20, g_term=0.04,
        equity_adjust=0.0, shares=100.0,
        reinvest_method=reinvest_method, sales_to_capital=s2c,
    )


def test_earnings_bridge_still_refuses_a_nonpositive_roic():
    # Unchanged behavior: g / ROIC is meaningless when the return is not positive.
    assert _projection("earnings", roic=-0.05) is None
    assert _projection("earnings", roic=None) is None


def test_sales_to_capital_bridge_values_a_company_the_earnings_bridge_cannot():
    # THE headline fix: a loss-making company gets a valuation instead of nothing.
    assert _projection("earnings", roic=-0.05) is None
    out = _projection("salesToCapital", roic=-0.05, s2c=2.0)
    assert out is not None
    assert out["intrinsicPerShare"] is not None
    assert out["rows"][0]["reinvestment"] > 0     # growth is being funded


def test_sales_to_capital_bridge_needs_a_ratio():
    assert _projection("salesToCapital", roic=-0.05, s2c=None) is None
    assert _projection("salesToCapital", roic=-0.05, s2c=0.0) is None


def test_a_lower_sales_to_capital_ratio_means_more_reinvestment_and_less_value():
    # Damodaran: a higher ratio is more efficient growth and more value for the
    # same growth rate. A capital-hungry firm (low ratio) must be worth less.
    efficient = _projection("salesToCapital", roic=-0.05, s2c=4.0)
    hungry = _projection("salesToCapital", roic=-0.05, s2c=1.0)
    assert efficient["intrinsicPerShare"] > hungry["intrinsicPerShare"]
    assert hungry["rows"][0]["reinvestment"] > efficient["rows"][0]["reinvestment"]


# ── The growth-viability deck ────────────────────────────────────────────────

def _healthy_rows():
    rows = []
    rev, op = 800.0, 120.0
    for y in range(2018, 2026):
        rows.append(_row(y, rev, op))
        rev *= 1.06
        op *= 1.06
    return rows


def _forecast_stub(**kw):
    return {
        "assumptions": {"roic": kw.get("roic", 0.18), "wacc": kw.get("wacc", 0.09)},
        "growthReconciliation": {
            "historical": kw.get("historical", 0.06),
            "fundamental": kw.get("fundamental", 0.07),
            "reinvestmentRate": kw.get("reinvest", 0.40),
            "growthUsed": kw.get("used", 0.06),
        },
        "reverseDcf": {"impliedGrowth": kw.get("implied", 0.07)},
        "lifecycle": {"applicable": True, "stage": "mature",
                      "cyclicalSwings": False, "medianGrowth5y": 0.06},
    }


def test_deck_always_returns_every_question():
    out = ia.build_growth_viability(_healthy_rows(), _forecast_stub(), {"flags": []}, "Acme")
    assert out["applicable"] is True
    ids = {c["id"] for c in out["checks"]}
    assert ids == set(ia.GROWTH_QUESTIONS)      # a STANDING deck: all of them, always


def test_deck_survives_a_missing_forecast_and_missing_flags():
    out = ia.build_growth_viability(_healthy_rows(), None, None, "Acme")
    assert len(out["checks"]) == len(ia.GROWTH_QUESTIONS)
    assert all(c["severity"] in ("ok", "medium", "high", "na") for c in out["checks"])


def test_every_question_is_humanized_and_names_the_company():
    out = ia.build_growth_viability(_healthy_rows(), _forecast_stub(), {"flags": []}, "Acme Corp")
    for c in out["checks"]:
        q = c["question"]
        assert q.endswith("?")
        assert "Acme Corp" in q                  # no unclear pronoun reference
        assert "—" not in q and "–" not in q     # no em/en dashes (repo copy rule)
        assert "“" not in q and "”" not in q
        assert 40 <= len(q) <= 300               # detailed, not terse
        assert c["tier"] and c["detail"]


def test_details_carry_no_em_dashes():
    out = ia.build_growth_viability(_healthy_rows(), _forecast_stub(), {"flags": []}, "Acme")
    for c in out["checks"]:
        assert "—" not in (c["detail"] or "") and "–" not in (c["detail"] or "")


def _fire(out, key):
    return next(c for c in out["checks"] if c["id"] == key)


def test_roic_below_cost_of_capital_flags_high():
    out = ia.build_growth_viability(
        _healthy_rows(), _forecast_stub(roic=0.05, wacc=0.09), {"flags": []}, "Acme")
    assert _fire(out, "roic_vs_wacc")["severity"] == "high"


def test_roic_above_cost_of_capital_passes():
    out = ia.build_growth_viability(
        _healthy_rows(), _forecast_stub(roic=0.18, wacc=0.09), {"flags": []}, "Acme")
    assert _fire(out, "roic_vs_wacc")["severity"] == "ok"


def test_earnings_outrunning_revenue_flags():
    # Revenue crawls while profit races: margin expansion or accounting, not growth.
    rows, rev, op = [], 1000.0, 50.0
    for y in range(2019, 2026):
        rows.append(_row(y, rev, op))
        rev *= 1.01
        op *= 1.35
    out = ia.build_growth_viability(rows, _forecast_stub(), {"flags": []}, "Acme")
    assert _fire(out, "earnings_vs_revenue")["severity"] in ("medium", "high")


def test_market_share_ceiling_flags_a_rate_the_economy_cannot_support():
    out = ia.build_growth_viability(
        _healthy_rows(), _forecast_stub(historical=0.35), {"flags": []}, "Acme")
    assert _fire(out, "market_share_ceiling")["severity"] in ("medium", "high")


def test_sentiment_gap_flags_when_the_price_assumes_more_than_the_fundamentals_fund():
    out = ia.build_growth_viability(
        _healthy_rows(), _forecast_stub(implied=0.25, fundamental=0.05),
        {"flags": []}, "Acme")
    c = _fire(out, "sentiment_gap")
    assert c["severity"] in ("medium", "high")


def test_small_or_lossmaking_company_gets_extra_scrutiny():
    rows = [_row(2024, 100.0, -20.0, mcap=3e8)]
    out = ia.build_growth_viability(rows, None, None, "Tiny")
    assert _fire(out, "small_cap_scrutiny")["severity"] == "medium"


def test_a_large_established_company_does_not_trip_the_small_cap_flag():
    out = ia.build_growth_viability(_healthy_rows(), _forecast_stub(), {"flags": []}, "Acme")
    assert _fire(out, "small_cap_scrutiny")["severity"] == "ok"


def test_forensic_flags_are_reused_rather_than_recomputed():
    shn = {"flags": [{"key": "nonop_income", "severity": "high", "value": 0.45,
                      "threshold": 0.20, "detail": "Other income is 45% of pre-tax profit."}]}
    out = ia.build_growth_viability(_healthy_rows(), _forecast_stub(), shn, "Acme")
    c = _fire(out, "one_time_gains")
    assert c["severity"] == "high"
    assert "45%" in c["detail"]
