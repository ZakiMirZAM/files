"""Learn slice A3: the company page's formula trees.

Each tree's RESULT is the page's own number (the latest metric_history point),
so these tests check the part that could still be wrong: that the variables
under a result are the right lines and the app's own derived values.

Run:  cd backend && python -m pytest test_page_formulas.py -q
Needs FINANCIALS_DB (or financials.db at the repo root); skips otherwise.
"""

import math
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "data"))

import api  # noqa: E402
import individualanalysis as ia  # noqa: E402
from page_formulas import build_page_trees  # noqa: E402

TICKERS = ["KO", "AAPL", "JPM", "XOM", "MSFT"]

# Ratios the app computes from two lines with no stored column in front.
PURE = {
    "net_margin", "asset_turnover", "equity_multiplier", "dupont_tax_burden",
    "dupont_interest_burden", "dupont_ebit_margin", "operating_margin",
    "fcf_net_income", "liabilities_equity", "net_debt_ocf", "cogs_inventory",
    "roa", "current_ratio", "fcf_total_debt", "ev_ebit", "sales_invested_capital",
}


def _rows(ticker):
    if not os.path.exists(str(api.DB_PATH)):
        pytest.skip("financials.db not available")
    rows = ia.load_ticker_rows(api.get_db(), ticker)
    if not rows:
        pytest.skip(f"no rows for {ticker}")
    return sorted(rows, key=lambda r: int(r["Calendar Year"]))


def _trees(ticker):
    rows = _rows(ticker)
    hist = ia.metric_history(rows, beta=1.1, rf=0.043, erp=0.05)
    trees = build_page_trees(rows, hist, ia.DISPLAY_METRICS, beta=1.1, rf=0.043, erp=0.05,
                             beta_hist={}, hist_params={}, currency="USD")
    return rows, hist, trees


def _close(a, b):
    # Tree values travel rounded to 6 decimals (formulas.Node.to_dict).
    return math.isclose(a, b, rel_tol=1e-5, abs_tol=1e-6)


@pytest.mark.parametrize("ticker", TICKERS)
def test_results_are_the_page_numbers(ticker):
    rows, hist, trees = _trees(ticker)
    yr = int(rows[-1]["Calendar Year"])
    for key, tree in trees["history"].items():
        want = (hist.get(key) or {}).get(yr)
        got = tree["value"]
        assert (want is None and got is None) or _close(got, round(want, 6)), (ticker, key, want, got)


@pytest.mark.parametrize("ticker", TICKERS)
def test_pure_ratios_are_their_two_lines(ticker):
    _rows_, _hist, trees = _trees(ticker)
    for key in PURE & set(trees["history"]):
        t = trees["history"][key]
        top, bottom = t["children"][0]["value"], t["children"][1]["value"]
        if t["value"] is None or top is None or not bottom:
            continue
        assert _close(t["value"], top / bottom), (ticker, key, t["value"], top, bottom)


@pytest.mark.parametrize("ticker", TICKERS)
def test_wacc_tree_adds_up(ticker):
    _rows_, _hist, trees = _trees(ticker)
    w = trees["history"].get("wacc")
    if not w or w["value"] is None:
        pytest.skip("no WACC")
    kids = {c["key"]: c["value"] for c in w["children"]}
    if "costOfDebtAfterTax" not in kids:
        assert _close(w["value"], kids["costOfEquity"])
        return
    e, d = kids["marketValueEquity"], kids["bookValueDebt"]
    expect = e / (e + d) * kids["costOfEquity"] + d / (e + d) * kids["costOfDebtAfterTax"]
    assert math.isclose(w["value"], expect, rel_tol=1e-3), (ticker, w["value"], expect)


@pytest.mark.parametrize("ticker", TICKERS)
def test_nopat_and_invested_capital_are_the_apps(ticker):
    rows, _hist, trees = _trees(ticker)
    roic = trees["history"]["roic"]
    nopat, ic = roic["children"][0]["value"], roic["children"][1]["value"]
    assert nopat == (None if ia._nopat_for_row(rows[-1]) is None else round(ia._nopat_for_row(rows[-1]), 6))
    want_ic = ia._invested_capital(rows[-1])
    assert ic == (None if want_ic is None else round(want_ic, 6))


STATEMENT_COLS = {
    "EBITDA": "EBITDA", "Gross Profit": "Gross Profit", "Free Cash Flow": "Free Cash Flow",
    "Return on Invested Capital": "ROIC", "Return on Equity": "ROE",
    "Gross Profit Ratio": "Gross Profit Ratio", "Operating Income Ratio": "Operating Income Ratio",
    "Debt to Equity": "Debt To Equity", "Current Ratio": "Current Ratio",
}


@pytest.mark.parametrize("ticker", TICKERS)
def test_statement_results_use_the_pages_latest_non_blank_year(ticker):
    """The page skips blank years, so a blank latest year must not turn the
    tree's number into n/a while the page shows an earlier year's value."""
    rows, _hist, trees = _trees(ticker)
    for label, col in STATEMENT_COLS.items():
        vals = [ia._row_val(r, col) for r in rows]
        latest = next((v for v in reversed(vals) if v is not None), None)
        tree = trees["metrics"].get(label)
        if latest is None:
            assert tree is None, (ticker, label)
        else:
            assert tree is not None and _close(tree["value"], round(latest, 6)), (ticker, label)


def test_blank_latest_year_falls_back_to_the_prior_year():
    rows = _rows("KO")
    last = dict(rows[-1])
    last["Free Cash Flow"] = None
    patched = rows[:-1] + [last]
    hist = ia.metric_history(patched, beta=1.1, rf=0.043, erp=0.05)
    trees = build_page_trees(patched, hist, ia.DISPLAY_METRICS, beta=1.1, rf=0.043, erp=0.05,
                             beta_hist={}, hist_params={}, currency="USD")
    fcf = trees["metrics"]["Free Cash Flow"]
    assert _close(fcf["value"], round(ia._row_val(rows[-2], "Free Cash Flow"), 6))
    assert fcf["children"][0]["source"].endswith(f"FY{int(rows[-2]['Calendar Year'])}")


@pytest.mark.parametrize("ticker", TICKERS)
def test_every_tree_has_a_formula(ticker):
    _rows_, _hist, trees = _trees(ticker)
    for group in ("history", "metrics"):
        for key, t in trees[group].items():
            assert t["formula"] and t["children"], (ticker, group, key)
