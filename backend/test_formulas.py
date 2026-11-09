"""Learn slice A2: every formula tree's result equals the comparison table's value.

company_profile/formulas.py recomputes the 26 comparison metrics on its own so
the sidebar can show each step. These tests hold it to api._company_metrics, the
code that fills the table: if either changes alone, a test fails instead of the
sidebar teaching a derivation that does not produce the number on screen.

Run:  cd backend && python -m pytest test_formulas.py -q
The real-ticker test also needs FINANCIALS_DB (or financials.db at the repo root).
"""

import math
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "data"))

import api  # noqa: E402  (heavy import, done once at collection like test_story_dcf)

RF, ERP = 0.043, 0.051


@pytest.fixture(autouse=True)
def _fixed_rates(monkeypatch):
    """Live macro rates are network-bound; pin them for both code paths. The FX
    lookup behind _company_metrics' size weight reads financials.db, so stub it
    to keep this suite database-free (the real-ticker test restores nothing it
    needs: weights are not part of any tree)."""
    monkeypatch.setattr(api, "_sector_wacc_params", lambda: (RF, ERP))
    monkeypatch.setattr(api, "_live_rf", lambda: RF)
    monkeypatch.setattr(api, "_mc_to_usd", lambda latest, mc: mc)


def _row(**over):
    base = {c: None for c in api._SECTOR_NEEDED_COLS}
    base.update({
        "Revenue": 46e9, "Operating Income": 13e9, "Net Income": 10.6e9,
        "Total Assets": 100e9, "Total Stockholders Equity": 26e9,
        "Total Liabilities": 74e9, "Total Debt": 44e9, "Net Debt": 30e9,
        "Free Cash Flow": 9.7e9, "Operating Cash Flow": 11.5e9,
        "Capital Expenditure": -1.8e9, "Depreciation And Amortization": 1.1e9,
        "Income Before Tax": 12.9e9, "Income Tax Expense": 2.2e9,
        "Interest Expense": 1.6e9, "Market Cap": 300e9, "Payout Ratio": 0.75,
        "Interest Income": 0.9e9, "Revenue Growth": 0.03, "Net Income Growth": -0.01,
        "Reported Currency": "USD", "beta": 0.62, "sec": "Consumer Defensive", "yr": 2024,
    })
    base.update(over)
    return base


PRIOR = _row(**{"Revenue": 44e9, "Operating Income": 12e9, "yr": 2023})

CASES = {
    "typical": _row(),
    "loss_maker": _row(**{"Net Income": -2e9, "Income Before Tax": -1.5e9,
                          "Income Tax Expense": 0.3e9, "Operating Income": -0.5e9}),
    "no_debt": _row(**{"Total Debt": None, "Interest Expense": None, "Net Debt": -5e9}),
    "missing_beta": _row(beta=None),
    "extreme_beta": _row(beta=5.0),
    "high_tax": _row(**{"Income Tax Expense": 9e9}),
    "no_market_cap": _row(**{"Market Cap": None}),
    "bank": _row(**{"sec": "Financial Services", "Revenue": 40e9, "Interest Income": 30e9,
                    "Interest Expense": 12e9, "Total Assets": 1500e9,
                    "Total Stockholders Equity": 150e9}),
    # A Financial Services firm that fails one gate (funding): no NIM.
    "bank_fails_funding": _row(**{"sec": "Financial Services", "Revenue": 40e9,
                                  "Interest Income": 30e9, "Interest Expense": 2e9,
                                  "Total Assets": 1500e9,
                                  "Total Stockholders Equity": 150e9}),
    "v_zero": _row(**{"Market Cap": None, "Total Debt": None, "Interest Expense": None}),
    "interest_zero": _row(**{"Interest Expense": 0.0}),
    "payout_missing": _row(**{"Payout Ratio": None}),
    "beta_below_floor": _row(beta=0.1),
    "beta_negative": _row(beta=-0.4),
    "pretax_missing": _row(**{"Income Before Tax": None}),
    "negative_equity": _row(**{"Total Stockholders Equity": -8e9}),
    "ttm_overlay": _row(_ttm_overlay=True),
}


def _assert_match(latest, prior, label):
    metrics = api._company_metrics(latest, prior)
    trees = api._spread_formula_trees(latest, prior)
    assert set(trees) == set(api._BENCHMARK_KEY_MAP), f"{label}: tree keys differ"
    for ind_key, mx_key in api._BENCHMARK_KEY_MAP.items():
        want = metrics.get(mx_key)
        got = trees[ind_key]["value"]
        if want is None:
            assert got is None, f"{label}/{ind_key}: table None, tree {got}"
        else:
            assert got is not None, f"{label}/{ind_key}: table {want}, tree None"
            assert math.isclose(got, want, rel_tol=1e-5, abs_tol=1e-5), (
                f"{label}/{ind_key}: table {want}, tree {got}")


@pytest.mark.parametrize("label", sorted(CASES))
@pytest.mark.parametrize("with_prior", [True, False])
def test_tree_results_equal_the_table(label, with_prior):
    _assert_match(CASES[label], PRIOR if with_prior else None, label)


def _find(node, key):
    if node["key"] == key:
        return node
    for c in node["children"]:
        hit = _find(c, key)
        if hit is not None:
            return hit
    return None


@pytest.mark.parametrize("label", sorted(CASES))
def test_intermediate_values_equal_the_app(label):
    """Not only the roots: every derived term the trees show equals the value
    _metric_intermediates computes, so a variable row can never be wrong while
    its root happens to agree."""
    latest = CASES[label]
    mid = api._metric_intermediates(latest)
    trees = api._spread_formula_trees(latest, PRIOR)
    wacc, roic, eva_m = trees["wacc"], trees["roic"], trees["eva_margin"]
    checks = {
        "costOfEquity": _find(wacc, "costOfEquity"),
        "costOfDebt": _find(wacc, "costOfDebt"),
        "taxRate": _find(wacc, "taxRate"),
        "nopat": _find(roic, "nopat"),
        "investedCapital": _find(roic, "investedCapital"),
        "eva": _find(eva_m, "eva"),
    }
    for key, node in checks.items():
        want, got = mid[key], node["value"]
        if want is None:
            assert got is None, f"{label}/{key}: app None, tree {got}"
        else:
            assert got is not None and math.isclose(got, want, rel_tol=1e-5, abs_tol=1e-6), (
                f"{label}/{key}: app {want}, tree {got}")


def test_limits_show_in_the_line_with_numbers():
    """When a limit or fallback binds, the 'with your numbers' line says so, so
    the line on screen always produces the value beside it."""
    t = _find(api._spread_formula_trees(CASES["high_tax"], PRIOR)["wacc"], "taxRate")
    assert t["substituted"].startswith("max(0%, min(45%,") and t["display"] == "45.00%"
    kd = _find(api._spread_formula_trees(CASES["interest_zero"], PRIOR)["wacc"], "costOfDebt")
    assert kd["substituted"].startswith("max(2%, min(12%,") and kd["display"] == "2.00%"
    g = _find(api._spread_formula_trees(CASES["payout_missing"], PRIOR)["justified_pb"], "growth")
    assert "0.00%" in g["substituted"] and "n/a" not in g["substituted"]
    fb = _find(api._spread_formula_trees(CASES["pretax_missing"], PRIOR)["wacc"], "taxRate")
    assert fb["substituted"] == "21% fallback" and "missing, zero or negative" in fb["rule"]


def test_sources_name_the_right_period():
    dol = api._spread_formula_trees(CASES["typical"], PRIOR)["operating_leverage"]
    prior_oi = _find(dol, "Prior Operating Income")
    assert prior_oi["source"].endswith("FY2023")
    ttm = api._spread_formula_trees(CASES["ttm_overlay"], PRIOR)["net_margin"]
    assert _find(ttm, "Net Income")["source"].endswith("trailing twelve months")
    assert _find(api._spread_formula_trees(CASES["ttm_overlay"], PRIOR)["pb"],
                 "Total Stockholders Equity")["source"].endswith("FY2024")


def test_every_tree_shows_its_formula_and_variables():
    trees = api._spread_formula_trees(CASES["typical"], PRIOR)
    for key, t in trees.items():
        assert t["formula"], f"{key} has no formula"
        assert t["children"], f"{key} has no variables"
        if key != "net_interest_margin":  # lenders only; "typical" is not a bank
            assert t["display"] != "n/a", f"{key} has no value for a normal company"


def test_wacc_tree_exposes_its_rules_and_inputs():
    wacc = api._spread_formula_trees(CASES["typical"], PRIOR)["wacc"]
    names = [c["key"] for c in wacc["children"]]
    assert names == ["costOfEquity", "costOfDebt", "taxRate", "Market Cap", "Total Debt"]
    ke = wacc["children"][0]
    assert [c["key"] for c in ke["children"]] == ["capmRiskFree", "beta", "equityRiskPremium"]
    kd = wacc["children"][1]
    assert "2% to 12%" in kd["rule"]


def _db_available() -> bool:
    return os.path.exists(str(api.DB_PATH))


@pytest.mark.skipif(not _db_available(), reason="financials.db not available")
@pytest.mark.parametrize("ticker", ["KO", "AAPL", "JPM", "XOM", "TSM"])
def test_real_tickers_match_the_table(ticker):
    latest, prior, _rows = api._company_metric_rows(ticker)
    if latest is None:
        pytest.skip(f"{ticker} not in this database")
    _assert_match(latest, prior, ticker)
