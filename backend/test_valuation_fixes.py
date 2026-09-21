"""Regression tests locking down the valuation-correctness fixes from the
2026-06-26 audit (verified against Damodaran, *Investment Valuation*).

Network-free and DB-free: the functions under test are pure given a row-like
mapping, so plain dicts stand in for sqlite3.Row (both expose keys()/__getitem__).

Run:  cd backend && python -m pytest test_valuation_fixes.py -q
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "data"))

import comparitivestockanalysis as cmp  # noqa: E402
import individualanalysis as ia  # noqa: E402


# ── Helpers: _pos_div / _first_not_none ──────────────────────────────────────

def test_pos_div_rejects_nonpositive_denominator():
    assert cmp._pos_div(100.0, -50.0) is None      # negative denom → meaningless
    assert cmp._pos_div(100.0, 0.0) is None         # zero denom
    assert cmp._pos_div(100.0, 25.0) == 4.0         # positive denom → divides
    assert cmp._pos_div(None, 25.0) is None


def test_first_not_none_preserves_zero():
    assert cmp._first_not_none(0.0, 5.0) == 0.0      # genuine 0.0 kept (unlike `or`)
    assert cmp._first_not_none(None, 5.0) == 5.0
    assert cmp._first_not_none(None, None) is None


# ── _compute_ranked_metrics edge-case guards ─────────────────────────────────

def test_negative_equity_voids_financial_leverage():
    row = {"Total Assets": 1000.0, "Total Stockholders Equity": -200.0}
    m = cmp._compute_ranked_metrics(row)
    assert m["Financial Leverage"] is None           # neg book equity → not meaningful


def test_negative_fcf_voids_pfcf_ratio():
    row = {"Market Cap": 1000.0, "Free Cash Flow": -50.0}
    m = cmp._compute_ranked_metrics(row)
    assert m["PFCF Ratio"] is None                   # neg FCF is not a "cheap" signal


def test_negative_current_liabilities_void_liquidity_ratios():
    row = {"Total Current Assets": 500.0, "Total Current Liabilities": -100.0, "Inventory": 50.0}
    m = cmp._compute_ranked_metrics(row)
    assert m["Quick Ratio"] is None
    assert m["Current Ratio"] is None


def test_debt_service_uses_absolute_interest_expense():
    # Interest expense stored negative must not flip the coverage denominator.
    row = {"EBITDA": 100.0, "Interest Expense": -10.0, "Short Term Debt": 0.0}
    m = cmp._compute_ranked_metrics(row)
    assert m["Debt Service Coverage"] == 100.0 / 10.0


# ── Geometric growth (Damodaran Ch.11) ───────────────────────────────────────

def _fcf_rows(series):
    return [{"Free Cash Flow Per Share": v, "Calendar Year": 2020 + i}
            for i, v in enumerate(series)]


def test_engine_growth_is_geometric_not_arithmetic():
    # FCF/share 1 -> 2 -> 1: YoY = +100%, -50%. Arithmetic mean = +25%;
    # geometric mean = 0%. The measurement must return ~0. (The comparative
    # module's duplicate helper died with the legacy-DCF retirement; the
    # engine's helper is the single implementation.)
    g = ia._historical_fcf_growth(_fcf_rows([1.0, 2.0, 1.0]))
    assert g is not None and abs(g) < 1e-9
    g_raw = ia._historical_fcf_growth_unclamped(_fcf_rows([1.0, 2.0, 1.0]))
    assert g_raw is not None and abs(g_raw) < 1e-9


def test_geometric_growth_matches_pure_compounding():
    # 100 -> 110 -> 121 is a clean 10% CAGR; geometric mean must recover 0.10.
    g = ia._historical_fcf_growth(_fcf_rows([100.0, 110.0, 121.0]))
    assert g is not None and abs(g - 0.10) < 1e-9


def test_unclamped_growth_measures_past_the_old_cap():
    # A 30% compounder must read ~30%, not a pinned 20% (the CAT symptom).
    g_raw = ia._historical_fcf_growth_unclamped(
        _fcf_rows([100.0, 130.0, 169.0, 219.7]))
    assert g_raw is not None and abs(g_raw - 0.30) < 1e-9


# ── New value-score engine: magnitude, negative cap, sector weighting ────────

# Realistic metric dicts keyed by the DEFAULT profile's metric names.
GOOD = {
    "roic_wacc_spread": 0.12, "eva_margin": 0.15, "excess_return": 0.10,
    "net_margin": 0.20, "dupont_ebit_margin": 0.25, "Gross Profit Ratio": 0.55,
    "roic": 0.20, "roe": 0.25, "roa": 0.12, "asset_turnover": 1.0,
    "fcf_net_income": 1.0, "interest_coverage": 12.0, "income_quality": 1.2,
    "revenue_growth": 0.15, "net_income_growth": 0.18,
    "net_debt_ebitda": 1.0, "sbc_revenue": 0.02, "pfcf": 12.0, "ev_ebitda": 9.0,
    "Graham Number Ratio": 1.2,
}
WEAK = {  # positive but mediocre across the board
    "roic_wacc_spread": 0.005, "eva_margin": 0.01, "excess_return": 0.005,
    "net_margin": 0.03, "dupont_ebit_margin": 0.05, "Gross Profit Ratio": 0.20,
    "roic": 0.05, "roe": 0.05, "roa": 0.02, "asset_turnover": 0.4,
    "fcf_net_income": 0.5, "interest_coverage": 3.0, "income_quality": 0.8,
    "revenue_growth": 0.02, "net_income_growth": 0.01,
    "net_debt_ebitda": 3.5, "sbc_revenue": 0.08, "pfcf": 30.0, "ev_ebitda": 18.0,
    "Graham Number Ratio": 0.7,
}


def _snap(ticker, metrics, sector=None):
    return cmp.TickerSnapshot(ticker, None, sector, None, 2024, metrics=dict(metrics))


def test_level_score_monotonic_and_inverted():
    # Higher-is-better climbs with the level; negative economic profit is near zero.
    assert cmp._level_score("eva_margin", -0.10) < cmp._level_score("eva_margin", 0.0)
    assert cmp._level_score("eva_margin", 0.0) < cmp._level_score("eva_margin", 0.10)
    assert cmp._level_score("eva_margin", -0.10) == 0.0
    # Lower-is-better: a cheaper P/FCF scores higher than an expensive one.
    assert cmp._level_score("pfcf", 8.0) > cmp._level_score("pfcf", 30.0)


def test_strong_business_outscores_weak_one():
    scores = cmp.score_industry([_snap("GOOD", GOOD), _snap("WEAK", WEAK)])
    assert scores["GOOD"] > scores["WEAK"] + 25      # magnitude gap is real
    assert scores["GOOD"] >= 70 and scores["WEAK"] <= 45


def test_magnitude_not_winner_take_all():
    # Two excellent businesses, one marginally better. Pure percentile would give
    # 100 vs 0; the absolute level keeps both close (not winner-take-all).
    a = {**GOOD, "eva_margin": 0.20, "net_margin": 0.26}
    b = {**GOOD, "eva_margin": 0.18, "net_margin": 0.24}
    scores = cmp.score_industry([_snap("AAA", a), _snap("BBB", b)])
    assert scores["AAA"] >= 60 and scores["BBB"] >= 60
    assert abs(scores["AAA"] - scores["BBB"]) < 10


def test_negative_profitability_cannot_rank_high():
    # A money-loser that tops every metric vs. a solid profitable peer. The loser
    # must be capped and must NOT outrank a genuinely strong business.
    loser = {**GOOD, "net_margin": -0.10, "eva_margin": -0.05, "roe": -0.08}
    scores = cmp.score_industry([_snap("LOSS", loser), _snap("OK", GOOD)])
    assert scores["LOSS"] <= cmp.NEG_PROFIT_CAP
    assert scores["OK"] > scores["LOSS"]


def test_sector_weighting_changes_score():
    # Net interest margin is heavily weighted for a bank but absent from the tech
    # profile, so the same company scores differently under the two sector profiles.
    bank = {"net_interest_margin": 0.04, "roe": 0.14, "excess_return": 0.04,
            "roa": 0.012, "net_margin": 0.22, "revenue_growth": 0.06,
            "net_income_growth": 0.05, "income_quality": 1.1, "pb": 1.2}
    peer = {"net_interest_margin": 0.015, "roe": 0.06, "excess_return": 0.0,
            "roa": 0.004, "net_margin": 0.08, "revenue_growth": 0.02,
            "net_income_growth": 0.01, "income_quality": 0.8, "pb": 2.5}
    fin = cmp.score_industry([_snap("A", bank), _snap("B", peer)], sector="Financial Services")
    tech = cmp.score_industry([_snap("A", bank), _snap("B", peer)], sector="Technology")
    assert fin["A"] != tech["A"]              # sector profile actually changes the score


def test_score_industry_single_ticker_is_zero():
    assert cmp.score_industry([_snap("AAA", GOOD)]) == {"AAA": 0.0}


def test_coverage_floor_sinks_sparse_ticker():
    sparse = _snap("CCC", {"pfcf": 12.0})     # one metric, well under coverage floor
    scores = cmp.score_industry([_snap("AAA", GOOD), _snap("BBB", WEAK), sparse])
    assert scores["CCC"] == 0.0


# ── Cost-of-capital fixes (Phase 1, Damodaran Ch.8) ──────────────────────────

def test_after_tax_cost_of_debt_uses_marginal_not_effective_rate():
    # Damodaran Ch.8: the debt tax shield uses the MARGINAL rate, not the firm's
    # effective rate. Here effective is 35% but the shield must apply 21%.
    row = {"Market Cap": 100e9, "Total Debt": 40e9, "Operating Income": 12e9,
           "Interest Expense": 2e9}
    _, comp = ia.compute_wacc(row, beta=1.1, rf=0.045, erp=0.04, tax=0.35)
    expected_after = comp["costOfDebtPretax"] * (1 - ia.MARGINAL_TAX_RATE)
    assert abs(comp["costOfDebtAfterTax"] - round(expected_after, 4)) < 1e-4
    assert comp["marginalTaxRate"] == 0.21
    assert comp["effectiveTaxRate"] == 0.35


def test_lease_debt_enters_wacc_weight_only_when_supplied():
    row = {"Market Cap": 60e9, "Total Debt": 40e9, "Operating Income": 8e9,
           "Interest Expense": 2e9}
    _, base = ia.compute_wacc(row, beta=1.0, rf=0.045, erp=0.04, tax=0.21)
    _, leased = ia.compute_wacc(row, beta=1.0, rf=0.045, erp=0.04, tax=0.21, lease_debt=20e9)
    assert leased["weightDebt"] > base["weightDebt"]   # leases lift the debt weight
    assert leased["leaseDebt"] == 20e9
    assert base["leaseDebt"] == 0.0


def test_lease_only_firm_still_gets_cost_of_debt():
    # A firm with no conventional debt but capitalized operating leases (Gap case).
    row = {"Market Cap": 30e9, "Total Debt": 0.0, "Operating Income": 3e9,
           "Interest Expense": 0.0}
    _, comp = ia.compute_wacc(row, beta=1.0, rf=0.045, erp=0.04, tax=0.21, lease_debt=8e9)
    assert comp["costOfDebtPretax"] is not None
    assert comp["weightDebt"] > 0


# ── Earnings normalization (Phase 2, Damodaran Ch.9) ─────────────────────────

import earnings_normalization as en  # noqa: E402

_NORM_ROWS = [
    {"Calendar Year": 2022, "Revenue": 100e9, "Operating Income": 20e9, "Net Income": 16e9,
     "Interest Income": 1.2e9, "Total Debt": 30e9, "Capital Lease Obligations": 4e9,
     "Short Term Investments": 10e9, "Long Term Investments": 50e9,
     "Stock Based Compensation": 6e9, "Operating Cash Flow": 22e9, "Goodwill": 8e9,
     "Total Assets": 200e9, "t_sector": "Technology", "t_industry": "Software"},
    {"Calendar Year": 2023, "Revenue": 110e9, "Operating Income": 5e9, "Net Income": 4e9,
     "Interest Income": 1.5e9, "Total Debt": 30e9, "Capital Lease Obligations": 4e9,
     "Short Term Investments": 11e9, "Long Term Investments": 52e9,
     "Stock Based Compensation": 7e9, "Operating Cash Flow": 24e9, "Goodwill": 3e9,
     "Total Assets": 205e9, "t_sector": "Technology", "t_industry": "Software"},
    {"Calendar Year": 2024, "Revenue": 120e9, "Operating Income": 26e9, "Net Income": 21e9,
     "Interest Income": 1.8e9, "Total Debt": 30e9, "Capital Lease Obligations": 4e9,
     "Short Term Investments": 12e9, "Long Term Investments": 55e9,
     "Stock Based Compensation": 8e9, "Operating Cash Flow": 28e9, "Goodwill": 3e9,
     "Total Assets": 210e9, "t_sector": "Technology", "t_industry": "Software"},
]


def test_investment_income_removed_for_non_financial():
    r = en.remove_investment_income(_NORM_ROWS[-1], sector="Technology",
                                    industry="Software", effective_tax=0.15)
    assert r["applicable"]
    # core NI = 21b - 1.8b*(1-0.15)
    assert abs(r["coreNetIncome"] - (21e9 - 1.8e9 * 0.85)) < 1.0
    assert r["marketableSecuritiesHeldAside"] == 12e9 + 55e9


def test_investment_income_skipped_for_financial_firm():
    r = en.remove_investment_income(_NORM_ROWS[-1], sector="Financial Services",
                                    industry="Banks", effective_tax=0.15)
    assert r["applicable"] is False
    assert "financial" in r["reason"].lower()


def test_one_time_normalizes_to_median_margin_and_flags_outlier():
    o = en.normalize_one_time(_NORM_ROWS)
    # margins 20%, 4.5%, 21.7% -> median 20% -> normalized EBIT = 0.20 * 120b
    assert abs(o["medianOperatingMargin"] - 0.20) < 1e-6
    assert abs(o["normalizedEbit"] - 24e9) < 1.0
    assert 2023 in [f["year"] for f in o["flaggedYears"]]   # the 4.5% year is flagged


def test_capital_leases_not_double_counted_but_footnote_is_additive():
    balance = en.capitalize_leases(_NORM_ROWS[-1], pretax_cost_of_debt=0.06, total_debt=30e9)
    assert balance["waccImpact"] is False and balance["additiveDebtForWacc"] == 0.0
    footnote = en.capitalize_leases(_NORM_ROWS[-1], pretax_cost_of_debt=0.06,
                                    total_debt=30e9, lease_commitment_pv=9e9)
    assert footnote["waccImpact"] is True and footnote["additiveDebtForWacc"] == 9e9
    assert footnote["totalDebtWithLeases"] == 39e9


def test_build_normalized_earnings_aggregates_all_blocks():
    out = en.build_normalized_earnings(_NORM_ROWS, pretax_cost_of_debt=0.06,
                                       effective_tax=0.15, total_debt=30e9)
    assert set(out) >= {"leases", "investmentIncome", "oneTime", "goodwillSbc",
                        "additiveDebtForWacc", "excludesFinancials"}
    assert out["excludesFinancials"] is False
    assert out["goodwillSbc"]["sbcToRevenue"] is not None


# ── Earnings-quality & volatility detectors (Phase 3, Damodaran checklist) ────

def _rev_ni_rows(pairs):
    """Build minimal rows from [(year, revenue, net_income, operating_income), ...]."""
    return [{"Calendar Year": y, "Revenue": rev, "Net Income": ni, "Operating Income": oi}
            for (y, rev, ni, oi) in pairs]


def test_cv_and_yoy_pairs_helpers():
    assert ia._cv([100, 100, 100]) == 0.0            # no variation
    assert ia._cv([100, 200]) is None                 # <3 points
    rows = _rev_ni_rows([(2021, 100, 10, 12), (2022, 110, 12, 13)])
    pairs = ia._yoy_pairs(rows, "Revenue")
    assert pairs == [(2022, 0.10)]                    # 10% revenue growth


def test_earnings_outstripping_revenue_flagged():
    # NI grows far faster than revenue every year → the efficiency-mirage flag.
    rows = _rev_ni_rows([
        (2020, 100, 5, 6), (2021, 105, 8, 9), (2022, 110, 13, 14),
        (2023, 116, 22, 24), (2024, 121, 38, 40),
    ])
    sh = ia._shenanigans(rows)
    flag = next(f for f in sh["flags"] if f["key"] == "earn_vs_rev")
    assert flag["severity"] in ("medium", "high")


def test_earnings_volatility_flag_high_for_swinging_ebit():
    rows = _rev_ni_rows([
        (2020, 100, 10, 30), (2021, 100, 10, -5), (2022, 100, 10, 40),
        (2023, 100, 10, 2), (2024, 100, 10, 35),
    ])
    sh = ia._shenanigans(rows)
    flag = next(f for f in sh["flags"] if f["key"] == "earnings_volatility")
    assert flag["severity"] in ("medium", "high")


def test_stable_earnings_not_flagged_volatile():
    rows = _rev_ni_rows([
        (2020, 100, 20, 25), (2021, 105, 21, 26), (2022, 110, 22, 27),
        (2023, 115, 23, 28), (2024, 120, 24, 29),
    ])
    sh = ia._shenanigans(rows)
    flag = next(f for f in sh["flags"] if f["key"] == "earnings_volatility")
    assert flag["severity"] == "ok"


# ── XBRL financial-facts parser (Phase 4, Damodaran Ch.9) ────────────────────

from betas import edgar_client as _ec  # noqa: E402

_XBRL_FIXTURE = b"""<?xml version="1.0"?>
<xbrl xmlns:us-gaap="http://fasb.org/us-gaap/2024" xmlns:dei="http://xbrl.sec.gov/dei/2024"
      xmlns:xbrldi="http://xbrl.org/2006/xbrldi">
  <context id="FY"><period><startDate>2024-01-01</startDate><endDate>2024-12-31</endDate></period></context>
  <context id="INST"><period><instant>2024-12-31</instant></period></context>
  <context id="SEG"><period><startDate>2024-01-01</startDate><endDate>2024-12-31</endDate></period>
    <entity><segment><xbrldi:explicitMember dimension="us-gaap:StatementBusinessSegmentsAxis">A</xbrldi:explicitMember></segment></entity>
  </context>
  <dei:DocumentPeriodEndDate contextRef="INST">2024-12-31</dei:DocumentPeriodEndDate>
  <us-gaap:Revenues contextRef="FY" unitRef="usd">1000</us-gaap:Revenues>
  <us-gaap:Revenues contextRef="SEG" unitRef="usd">600</us-gaap:Revenues>
  <us-gaap:OperatingIncomeLoss contextRef="FY" unitRef="usd">200</us-gaap:OperatingIncomeLoss>
  <us-gaap:ResearchAndDevelopmentExpense contextRef="FY" unitRef="usd">150</us-gaap:ResearchAndDevelopmentExpense>
  <us-gaap:NetIncomeLoss contextRef="FY" unitRef="usd">120</us-gaap:NetIncomeLoss>
  <us-gaap:OperatingLeaseLiability contextRef="INST" unitRef="usd">340</us-gaap:OperatingLeaseLiability>
</xbrl>"""


def test_parse_financial_facts_extracts_consolidated_lines():
    ff = _ec.parse_financial_facts(_XBRL_FIXTURE)
    assert ff is not None
    assert ff.period_end == "2024-12-31" and ff.fiscal_year == 2024
    assert ff.income["revenue"] == 1000          # consolidated, NOT the 600 segment fact
    assert ff.income["operatingIncome"] == 200
    assert ff.income["researchAndDevelopment"] == 150
    assert ff.income["netIncome"] == 120


def test_operating_lease_pv_from_liability_tag():
    ff = _ec.parse_financial_facts(_XBRL_FIXTURE)
    assert _ec.operating_lease_pv(ff) == 340       # the Ch.9 debt value of leases


def test_operating_lease_pv_none_when_absent():
    assert _ec.operating_lease_pv(None) is None


# ── Phase 0: _run_fcff_projection characterization (vault-gap build) ─────────

_PROJ_KW = dict(base_revenue=100e9, margin_cur=0.20, margin_tgt=0.20, tax=0.21,
                equity_adjust=0.0, shares=1e9)


def test_fcff_projection_basic_positive_value():
    out = ia._run_fcff_projection(roic=0.15, wacc=0.09, g_init=0.06, g_term=0.03, **_PROJ_KW)
    assert out is not None and out["intrinsicPerShare"] > 0
    assert len(out["rows"]) == ia.FORECAST_HORIZON_YEARS


def test_fcff_projection_rejects_wacc_below_terminal_growth():
    assert ia._run_fcff_projection(roic=0.15, wacc=0.02, g_init=0.06, g_term=0.03, **_PROJ_KW) is None


def test_fcff_value_not_monotonic_when_roic_below_wacc():
    # Growth destroys value when ROIC < WACC, until the reinvestment cap binds.
    lo = ia._run_fcff_projection(roic=0.05, wacc=0.10, g_init=0.00, g_term=0.00, **_PROJ_KW)
    mid = ia._run_fcff_projection(roic=0.05, wacc=0.10, g_init=0.03, g_term=0.03, **_PROJ_KW)
    assert lo is not None and mid is not None
    assert mid["intrinsicPerShare"] < lo["intrinsicPerShare"]   # more growth, less value


# ── Reverse DCF (Penman Ch.4) ────────────────────────────────────────────────

def _reverse_kw(**over):
    kw = dict(base_revenue=100e9, margin_cur=0.20, margin_tgt=0.20, tax=0.21,
              roic=0.15, wacc=0.09, rf_eff=0.045, equity_adjust=0.0, shares=1e9,
              g_base=0.05, hist_growth=0.05)
    kw.update(over)
    return kw


def test_reverse_dcf_round_trip_recovers_known_growth():
    # Price the stock with g=8%, then ask the scanner what growth that price implies.
    g_true = 0.08
    priced = ia._run_fcff_projection(roic=0.15, wacc=0.09,
                                     g_init=g_true, g_term=min(0.045, g_true), **_PROJ_KW)
    out = ia._reverse_dcf_scan(price=priced["intrinsicPerShare"], **_reverse_kw())
    assert out is not None and out["status"] == "solved"
    assert abs(out["impliedGrowth"] - g_true) < 0.005


def test_reverse_dcf_below_band_when_price_absurdly_low():
    out = ia._reverse_dcf_scan(price=0.01, **_reverse_kw())
    assert out["status"] == "below_band" and out["impliedGrowth"] is None


def test_reverse_dcf_above_band_when_price_absurdly_high():
    out = ia._reverse_dcf_scan(price=1e6, **_reverse_kw())
    assert out["status"] == "above_band" and out["impliedGrowth"] is None


# ── EPV / Tobin's Q / owner earnings ─────────────────────────────────────────

_LATEST = {"Calendar Year": 2024, "Revenue": 100e9, "Operating Income": 20e9,
           "Net Income": 15e9, "Weighted Average Shs Out Dil": 1e9,
           "Cash And Cash Equivalents": 10e9, "Total Debt": 20e9,
           "Minority Interest": 0.0, "Market Cap": 300e9, "Total Assets": 150e9,
           "Depreciation And Amortization": 5e9, "Change In Working Capital": -1e9,
           "Capital Expenditure": -8e9, "Free Cash Flow": 12e9,
           "Total Other Income Expenses Net": 0.5e9, "Income Before Tax": 19e9,
           "t_sector": "Technology", "t_industry": "Software"}


def test_epv_arithmetic_and_bridge():
    out = ia._epv(_LATEST, normalized_ebit=20e9, tax=0.21, wacc=0.08,
                  dcf_intrinsic=250.0, price=300.0)
    assert out["applicable"]
    # firm = 20e9*0.79/0.08 = 197.5e9; equity = +10e9 cash −20e9 debt = 187.5e9 → $187.50
    assert abs(out["epvPerShare"] - 187.5) < 0.01
    assert abs(out["growthPremiumPerShare"] - (250.0 - 187.5)) < 0.01


def test_epv_skips_financials_and_negative_earnings():
    fin = dict(_LATEST, t_sector="Financial Services")
    assert ia._epv(fin, normalized_ebit=20e9, tax=0.21, wacc=0.08,
                   dcf_intrinsic=None, price=None)["applicable"] is False
    neg = ia._epv(_LATEST, normalized_ebit=-5e9, tax=0.21, wacc=0.08,
                  dcf_intrinsic=None, price=None)
    assert neg["applicable"] is False and "negative" in neg["reason"]


def test_tobins_q_ratio_and_trend():
    rows = [dict(_LATEST, **{"Calendar Year": 2023, "Market Cap": 240e9}), _LATEST]
    out = ia._tobins_q(rows)
    assert out["applicable"]
    # latest: (300e9 + 20e9) / 150e9 = 2.133
    assert abs(out["latest"] - 2.133) < 0.001
    assert [t["year"] for t in out["trend"]] == [2023, 2024]


def test_owner_earnings_formula_and_proxy():
    # One row means no prior year, so maintenance capex falls back to the D&A proxy.
    out = ia._owner_earnings([_LATEST])
    assert out["applicable"]
    assert out["maintenanceCapexMethod"] == "dda_proxy_insufficient"
    # OE = NI + D&A − maint(=D&A) + ΔWC = 15e9 − 1e9 = 14e9
    assert abs(out["ownerEarnings"] - 14e9) < 1.0
    assert out["maintenanceCapexProxy"] == 5e9
    assert abs(out["growthCapex"] - 3e9) < 1.0        # |−8e9| − 5e9
    assert out["lookThroughFlag"] is False             # 0.5/19 < 10%


def test_owner_earnings_greenwald_uses_prior_years():
    prior = dict(_LATEST, **{"Calendar Year": 2023, "Revenue": 90e9,
                             "Property Plant Equipment Net": 45e9})
    latest = dict(_LATEST, **{"Property Plant Equipment Net": 50e9})
    out = ia._owner_earnings([prior, latest])
    assert out["applicable"]
    assert out["maintenanceCapexMethod"] == "greenwald"
    # PP&E/sales over the prior rows = 45e9/90e9 = 0.50
    # growth capex = 0.50 * (100e9 − 90e9) = 5e9
    # maint = |−8e9| − 5e9 = 3e9
    assert abs(out["maintenanceCapexProxy"] - 3e9) < 1.0
    # OE = 15e9 + 5e9 − 3e9 − 1e9 = 16e9
    assert abs(out["ownerEarnings"] - 16e9) < 1.0
    assert abs(out["growthCapex"] - 5e9) < 1.0        # |−8e9| − 3e9


def test_maintenance_capex_keeps_the_greenwald_estimate_for_a_shrinking_firm():
    """A firm whose revenue fell subtracted NO growth capex, so the estimate is
    already the whole of capex and the D&A floor has nothing to protect against.
    PSTV's upkeep is its full 67,000 of capex; the floor was publishing D&A of
    445,000 instead, nearly seven times too much."""
    prior = dict(_LATEST, **{"Calendar Year": 2023, "Revenue": 120e9,
                             "Property Plant Equipment Net": 60e9,
                             "Capital Expenditure": -9e9})
    # Revenue shrinks 120e9 → 100e9; capex 1e9 is far under 0.25 × D&A (1.25e9).
    latest = dict(_LATEST, **{"Capital Expenditure": -1e9,
                              "Property Plant Equipment Net": 50e9})
    maint, method = ia._maintenance_capex([prior, latest], 1)
    assert method == "greenwald"
    assert abs(maint - 1e9) < 1.0


def test_maintenance_capex_floor_still_catches_a_fast_grower():
    """The floor exists for the opposite case: growth so fast that the estimate
    charges almost no upkeep at all."""
    prior = dict(_LATEST, **{"Calendar Year": 2023, "Revenue": 50e9,
                             "Property Plant Equipment Net": 25e9})
    latest = dict(_LATEST, **{"Property Plant Equipment Net": 50e9})
    # PP&E/sales = 0.50; growth capex = 0.50 × (100e9 − 50e9) = 25e9 > |capex|,
    # so maint clamps to 0, under 0.25 × 5e9.
    maint, method = ia._maintenance_capex([prior, latest], 1)
    assert method == "dda_proxy_floor"
    assert maint == 5e9


def test_maintenance_capex_falls_back_across_a_year_gap():
    """A missing fiscal year turns a multi-year revenue change into one year of
    growth capex, which silently overstates it."""
    prior = dict(_LATEST, **{"Calendar Year": 2020, "Revenue": 90e9,
                             "Property Plant Equipment Net": 45e9})
    latest = dict(_LATEST, **{"Calendar Year": 2024,
                              "Property Plant Equipment Net": 50e9})
    maint, method = ia._maintenance_capex([prior, latest], 1)
    assert method == "dda_proxy_insufficient"
    assert maint == 5e9


def test_owner_earnings_never_publishes_negative_growth_capex():
    """On the D&A fallback the proxy can exceed actual capex, which would print a
    negative 'growth' figure. It clamps at zero and the split stays honest."""
    rows = [dict(_LATEST, **{"Capital Expenditure": -1e9})]
    out = ia._owner_earnings(rows)
    assert out["maintenanceCapexMethod"] == "dda_proxy_insufficient"
    assert out["growthCapex"] == 0.0
    # The identity stays true in both directions, with the gap named rather than
    # buried: capex + underInvestment = maintenance + growth.
    assert out["underInvestment"] == pytest.approx(4e9)
    assert (out["capitalExpenditure"] + out["underInvestment"]
            == pytest.approx(out["maintenanceCapexProxy"] + out["growthCapex"]))


# ── Display multiples: stored-vs-computed selection and sanity bands ─────────


def _mrow(**kw):
    base = {"Reported Currency": "USD", "Market Cap": 300e9, "Revenue": 100e9,
            "Operating Cash Flow": 30e9, "Free Cash Flow": 12e9}
    base.update(kw)
    return base


def test_price_multiple_prefers_the_computed_ratio_for_a_usd_filer():
    """Market Cap is refreshed to spot weekly while the stored ratio is frozen at
    the fiscal-year pull (AAPL stored 9.18 against a computed 10.73)."""
    row = _mrow(**{"Price To Sales Ratio": 2.0})
    assert ia._price_multiple(row, "Price To Sales Ratio", 300e9, 100e9) == pytest.approx(3.0)


def test_price_multiple_keeps_the_stored_ratio_for_a_non_usd_filer():
    """For some foreign filers the stored Market Cap is on a different basis than
    Revenue: TSM computes 0.58 against a stored P/S of 10.55."""
    row = _mrow(**{"Reported Currency": "TWD", "Price To Sales Ratio": 10.55})
    assert ia._price_multiple(row, "Price To Sales Ratio", 300e9, 100e9) == pytest.approx(10.55)


def test_price_multiple_keeps_the_stored_ratio_when_the_two_diverge():
    row = _mrow(**{"Price To Sales Ratio": 0.5})   # computed 3.0 is 6x the stored
    assert ia._price_multiple(row, "Price To Sales Ratio", 300e9, 100e9) == pytest.approx(0.5)


def test_price_multiple_treats_a_stored_zero_as_missing_but_does_not_guess():
    """19,031 rows store a P/S of exactly 0. That is missing data, not a free
    company, and it must not fall through to a computed value built from inputs
    that may not share a basis."""
    row = _mrow(**{"Reported Currency": "JPY", "Price To Sales Ratio": 0.0})
    assert ia._price_multiple(row, "Price To Sales Ratio", 300e9, 100e9) is None


def test_price_multiple_rejects_non_positive_and_absurd_values():
    neg = _mrow(**{"Operating Cash Flow": -30e9, "POCF Ratio": -5.0})
    assert ia._price_multiple(neg, "POCF Ratio", 300e9, -30e9) is None
    absurd = _mrow(**{"Operating Cash Flow": 1e3, "POCF Ratio": 0.0})
    assert ia._price_multiple(absurd, "POCF Ratio", 300e9, 1e3) is None


def test_sga_revenue_outside_a_sane_band_is_dropped():
    """The stored column holds 14,449 rows above 1.0 and a maximum of 7.96e7; at
    the '%' display unit a stored 1,515 prints as 151,500 percent."""
    rows = [dict(_LATEST, **{"Sales General And Administrative To Revenue": v})
            for v in (0.0663, 1.5, 2.5, -0.4, 1515.0)]
    got = [ia._compute_one_metric(r, None, None)["sga_revenue"] for r in rows]
    assert got[0] == pytest.approx(0.0663)
    assert got[1] == pytest.approx(1.5)     # inside the band: real for a loss-maker
    assert got[2] is None and got[3] is None and got[4] is None


# ── Industry life-cycle classifier + strategic groups (Phase 3) ──────────────

import api as apimod  # noqa: E402


def _series(vals, start=2018):
    return [(start + i, v) for i, v in enumerate(vals)]


def test_lifecycle_stages_by_growth_band():
    flat_m = _series([0.15] * 8)
    assert apimod._lifecycle_from_series(_series([0.20, 0.22, 0.18, 0.25, 0.19]), flat_m)["stage"] == "emerging"
    assert apimod._lifecycle_from_series(_series([0.10, 0.09, 0.11, 0.10, 0.12]), flat_m)["stage"] == "growth"
    assert apimod._lifecycle_from_series(_series([0.03, 0.04, 0.02, 0.05, 0.03]), flat_m)["stage"] == "mature"


def test_lifecycle_declining_needs_persistent_negatives():
    flat_m = _series([0.15] * 8)
    # Two of the last three years negative + negative median → declining.
    out = apimod._lifecycle_from_series(_series([0.01, -0.02, -0.04, -0.03, -0.05]), flat_m)
    assert out["stage"] == "declining"
    # One bad year in an otherwise positive run is a trough, not decline.
    trough = apimod._lifecycle_from_series(_series([0.04, 0.05, 0.03, -0.06, 0.04]), flat_m)
    assert trough["stage"] == "mature"


def test_lifecycle_insufficient_history_and_cyclical_flag():
    short = apimod._lifecycle_from_series(_series([0.10, 0.12]), _series([0.2, 0.2]))
    assert short["applicable"] is False
    swing = apimod._lifecycle_from_series(_series([0.45, -0.10, 0.30, 0.05, 0.40]), _series([0.15] * 5))
    assert swing["cyclicalSwings"] is True and swing["confidence"] == "low"


def _sg_panel(rows):
    return {"sectors": [r[0] for r in rows],
            "data": {r[0]: {"operatingMargin": r[1], "marketCap": r[2],
                            "liabilitiesToEquity": r[3], "revenueGrowth": r[4]} for r in rows}}


def test_strategic_groups_quadrants_and_badges():
    panel = _sg_panel([
        ("BIGHI", 30.0, 500e9, 2.5, 20.0),   # scale leader, leveraged?, fast?
        ("SMLHI", 28.0, 10e9, 0.5, 15.0),    # premium niche
        ("BIGLO", 10.0, 400e9, 1.0, 2.0),    # volume incumbent
        ("SMLLO", 5.0, 8e9, 3.0, 1.0),       # challenger, leveraged
    ])
    out = apimod._strategic_groups_from_metrics(panel)
    assert out["applicable"]
    by_ticker = {p["ticker"]: p for p in out["points"]}
    assert by_ticker["BIGHI"]["group"] == "scale_leaders"
    assert by_ticker["SMLHI"]["group"] == "premium_niche"
    assert by_ticker["BIGLO"]["group"] == "volume_incumbents"
    assert by_ticker["SMLLO"]["group"] == "challengers"
    assert "leveraged" in by_ticker["SMLLO"]["badges"]


def test_strategic_groups_deterministic_and_guards():
    panel = _sg_panel([(f"T{i}", 10.0 + i, (i + 1) * 1e9, 1.0, 5.0) for i in range(8)])
    a = apimod._strategic_groups_from_metrics(panel)
    b = apimod._strategic_groups_from_metrics(panel)
    assert a == b                                        # no seeds, no drift
    tiny = apimod._strategic_groups_from_metrics(_sg_panel([("A", 10, 1e9, 1, 5), ("B", 12, 2e9, 1, 5)]))
    assert tiny["applicable"] is False
    missing = _sg_panel([("OK", 10, 1e9, 1, 5), ("NOMC", 12, None, 1, 5),
                         ("OK2", 20, 3e9, 1, 5), ("OK3", 8, 2e9, 1, 5), ("OK4", 15, 4e9, 1, 5)])
    out = apimod._strategic_groups_from_metrics(missing)
    assert "NOMC" in out["unclassified"]


# ── _capital_base: goodwill share of invested capital + tangible ROIC/EVA ────
# (Investment Valuation Ch.25: the return on the operating assets vs the return
# on the full price paid, acquisitions included.)

_CB_ROW = {
    "Calendar Year": 2025,
    "Total Stockholders Equity": 8e9,
    "Total Debt": 4e9,                 # invested capital 12e9, same base as ROIC
    "Goodwill": 5e9,
    "Intangible Assets": 1e9,
    "Goodwill And Intangible Assets": 6e9,
    "Operating Income": 2.5e9,
    "Income Before Tax": 2.4e9,
    "Income Tax Expense": 0.48e9,      # 20% effective -> NOPAT 2.0e9
}


def test_capital_base_reconciles_with_and_without_goodwill():
    out = ia._capital_base(_CB_ROW, wacc=0.08)
    assert out["applicable"]
    assert out["investedCapital"] == 12e9
    assert out["tangibleInvestedCapital"] == 6e9
    assert out["goodwillPctInvestedCapital"] == round(5.0 / 12.0, 4)
    assert out["roic"] == round(2e9 / 12e9, 4)
    assert out["roicTangible"] == round(2e9 / 6e9, 4)
    assert out["eva"] == round(2e9 - 0.08 * 12e9, 0)
    assert out["evaTangible"] == round(2e9 - 0.08 * 6e9, 0)


def test_capital_base_derives_combined_when_column_missing():
    row = {k: v for k, v in _CB_ROW.items() if k != "Goodwill And Intangible Assets"}
    out = ia._capital_base(row, wacc=None)
    assert out["goodwillAndIntangibles"] == 6e9    # goodwill + other intangibles
    assert out["eva"] is None                       # no WACC, EVA stays honest
    assert out["roicTangible"] == round(2e9 / 6e9, 4)


def test_capital_base_not_applicable_without_ic_or_goodwill():
    no_ic = {"Calendar Year": 2025, "Goodwill": 5e9}
    assert ia._capital_base(no_ic, wacc=0.08)["applicable"] is False
    no_gw = {"Calendar Year": 2025, "Total Stockholders Equity": 8e9, "Total Debt": 4e9}
    assert ia._capital_base(no_gw, wacc=0.08)["applicable"] is False


def test_capital_base_negative_tangible_ic_voids_tangible_metrics():
    # Goodwill larger than invested capital (heavily written-up acquirer with
    # thin book equity): a negative tangible base makes NOPAT/base meaningless.
    row = dict(_CB_ROW, **{"Total Stockholders Equity": 1e9, "Total Debt": 2e9})
    out = ia._capital_base(row, wacc=0.08)
    assert out["applicable"]
    assert out["tangibleInvestedCapital"] == -3e9
    assert out["roicTangible"] is None
    assert out["evaTangible"] is None


# ── Financial-sector guard on the credit block ───────────────────────────────
#
# JPM's FY2025 row: EBIT 72.6bn against interest expense 97.9bn, because a
# bank's interest expense is what it pays for deposits, not a fixed charge out
# of operating income. That gives 0.74x "coverage", which the Damodaran
# synthetic-rating table maps to Caa/CCC with a 10 percent default spread, and
# the letter then supplied half the composite credit score and tripped the
# sub-1x hard cap at 35. The reading is an artifact of running a manufacturer's
# table over a lender.

def _bank_rows(sector="Financial Services", industry="Banks - Diversified"):
    """One JPM-shaped year. Figures are JPM's FY2025 row, in millions."""
    return [{
        "Calendar Year": 2025,
        "t_sector": sector, "t_industry": industry, "t_name": "Test Bank",
        "Revenue": 279_745.0, "Operating Income": 72_595.0,
        "Interest Expense": 97_898.0, "Net Income": 58_000.0,
        "Total Assets": 4_424_900.0, "Total Stockholders Equity": 362_438.0,
        "Total Debt": 800_000.0, "Cash And Cash Equivalents": 500_000.0,
        "Market Cap": 964_496.0, "Reported Currency": "USD",
        "EBITDA": 80_000.0, "Free Cash Flow": 40_000.0,
        "Total Current Assets": None, "Total Current Liabilities": None,
        "Inventory": None, "Short Term Debt": 100_000.0,
        "Operating Cash Flow": 50_000.0,
    }]


def test_bank_credit_block_withdraws_the_synthetic_rating():
    out = ia._credit_analysis(_bank_rows())
    assert out["kind"] == "bank"
    assert out["isFinancial"] is True
    assert out["rating"]["letter"] is None
    assert out["rating"]["investmentGrade"] is None
    assert out["rating"]["interestCoverage"] is None
    # defaultSpread is a marker, not a withdrawal: the rating block keeps a
    # numeric spread because the cost of debt needs one, and this says the
    # number is the model's fallback rather than a reading off the bank.
    assert set(out["notApplicable"]) == {
        "syntheticRating", "interestCoverage", "defaultSpread",
    }
    assert out["rating"]["spread"] is not None


def test_the_withdrawn_rating_is_the_one_that_was_being_shown():
    """The guard is doing work: unguarded, the same row rates Caa/CCC."""
    unguarded = ia._synthetic_rating(72_595.0 / 97_898.0, 964_496.0 * 1e6)
    assert unguarded["letter"] == "Caa/CCC"
    assert unguarded["spread"] == pytest.approx(0.1000, abs=1e-4)
    assert unguarded["interestCoverage"] == pytest.approx(0.74, abs=0.01)


def test_the_bank_score_no_longer_rides_on_that_letter():
    """With no letter the composite is the bank track's own three metrics.

    Before: rating_base for Caa/CCC blended in at half weight and the sub-1x
    coverage cap pinned the score at 35 or below, so a bank with healthy
    capital adequacy still read "weak".
    """
    out = ia._credit_analysis(_bank_rows())
    capped = ia._credit_score(
        ia._synthetic_rating(72_595.0 / 97_898.0, 964_496.0 * 1e6),
        out["bank"]["metrics"], {"band": "na"})
    assert capped["score"] <= 35.0
    assert out["summary"]["score"] > capped["score"]


def test_the_bank_track_keeps_its_own_metrics():
    out = ia._credit_analysis(_bank_rows())
    labels = [m["label"] for m in out["metrics"]]
    assert "Equity / Total Assets (capital adequacy)" in labels
    assert "Return on Assets" in labels
    assert out["bank"]["equityToAssets"] is not None
    assert out["bank"]["leverageMultiple"] is not None


def test_a_reit_keeps_its_rating_on_the_same_track():
    """Real estate rides the bank TRACK (fcff_applicable covers REITs) but its
    interest cover is an ordinary fixed-charge cover, so the rating stays."""
    out = ia._credit_analysis(_bank_rows("Real Estate", "REIT - Office"))
    assert out["kind"] == "bank"
    assert out["isFinancial"] is False
    assert out["rating"]["letter"] is not None
    assert out["notApplicable"] == {}


def test_a_non_financial_credit_block_is_unchanged():
    rows = _bank_rows("Technology", "Semiconductors")
    rows[0]["Interest Expense"] = 259.0     # NVDA-shaped: EBIT covers interest easily
    out = ia._credit_analysis(rows)
    assert out["kind"] == "corporate"
    assert out["isFinancial"] is False
    assert out["notApplicable"] == {}
    assert out["rating"]["letter"] == "Aaa/AAA"
    assert out["rating"]["interestCoverage"] is not None
