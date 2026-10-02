"""The "next two years" block: last reported year, the model's first two years,
and the Yahoo Finance consensus shown only when it ties to our reported year.

A synthetic company with hand-computed figures (FY2025 and FY2024 below), a
hand-built forecast dict standing in for compute_forecast's output, and small
pandas frames shaped like yfinance's ``revenue_estimate`` / ``earnings_estimate``.
The tie-out cases use the live figures from the 2026-09-27 probe (MSFT, TSM,
PSTV). Network-free and DB-free: plain dicts stand in for sqlite3.Row.

Run:  cd backend && python -m pytest test_next_two_years.py -q
"""
import math
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "data"))

import pandas as pd  # noqa: E402
import pytest  # noqa: E402

import financial_db as fdb  # noqa: E402
from next_two_years import build_next_two_years  # noqa: E402


def _row(year, date, **kw):
    # FY2025: tax 40/200 = 20% -> NOPAT 160; reinvestment |-100| - 60 - (-20) = 60;
    # FCFF 100; ROIC 160 / (600 + 200) = 0.20; margin 200/1000 = 0.20.
    r = {"Calendar Year": year, "Date": date, "Reported Currency": "USD",
         "Revenue": 1000.0, "Operating Income": 200.0, "Income Before Tax": 200.0,
         "Income Tax Expense": 40.0, "Capital Expenditure": -100.0,
         "Depreciation and Amortization Cashflow": 60.0, "Change In Working Capital": -20.0,
         "Total Stockholders Equity": 600.0, "Total Debt": 200.0, "EPS Diluted": 5.0}
    r.update(kw)
    return r


PRIOR = _row(2024, "2024-12-31", **{"Revenue": 900.0, "Operating Income": 171.0,
                                    "Total Stockholders Equity": 500.0, "EPS Diluted": 4.5})
ROWS = [_row(2025, "2025-12-31"), PRIOR]          # deliberately newest-first
FORECAST = {
    "applicable": True,
    "years": [2026, 2027, 2028],
    "rows": [
        {"revenue": 1100.0, "operatingMargin": 0.205, "ebitAfterTax": 180.4,
         "reinvestment": 66.0, "fcff": 114.4, "roic": 0.2},
        {"revenue": 1210.0, "operatingMargin": 0.21, "ebitAfterTax": 203.28,
         "reinvestment": 72.6, "fcff": 130.68, "roic": 0.2},
        {"revenue": 1331.0, "operatingMargin": 0.215, "ebitAfterTax": 228.93,
         "reinvestment": 79.9, "fcff": 149.03, "roic": 0.2},
    ],
    "eva": {"projected": [{"year": 1, "eva": 100.4}, {"year": 2, "eva": 116.68}]},
    "waccBuild": {"wacc": 0.10},
    "assumptions": {"wacc": 0.10, "taxRate": 0.20},
}


def _block(metric_avg, year_ago, analysts=20):
    return {"avg": metric_avg, "low": None if metric_avg is None else metric_avg * 0.9,
            "high": None if metric_avg is None else metric_avg * 1.1,
            "analysts": analysts, "yearAgo": year_ago}


def _est(last="2025-12", nxt="2026-12", ccy="USD", rev=(1100.0, 1000.0), rev_next=1200.0,
         eps=(5.5, 5.0), eps_next=6.0):
    return {"lastFiscalYearEnd": last, "nextFiscalYearEnd": nxt, "financialCurrency": ccy,
            "current": {"revenue": _block(*rev), "eps": _block(*eps) if eps else None},
            "next": {"revenue": _block(rev_next, rev[0]),
                     "eps": _block(eps_next, eps[0]) if eps else None}}


def _rows_by_key(out):
    return {r["key"]: r for r in out["rows"]}


# ── Model and last-reported columns ────────────────────────────────────────

def test_model_columns_map_from_the_forecast_and_eps_has_no_model_value():
    out = build_next_two_years(ROWS, FORECAST, None)
    rk = _rows_by_key(out)
    assert [r["key"] for r in out["rows"]] == ["revenue", "operatingMargin", "nopat", "reinvestment",
                                               "fcff", "roic", "eva", "eps"]
    assert out["modelYears"] == [2026, 2027] and out["lastFiscalYear"] == 2025
    assert (rk["revenue"]["model1"], rk["revenue"]["model2"]) == (1100.0, 1210.0)
    assert rk["nopat"]["model1"] == 180.4            # ebitAfterTax
    assert rk["fcff"]["model2"] == 130.68
    assert (rk["eva"]["model1"], rk["eva"]["model2"]) == (100.4, 116.68)
    assert rk["eps"]["model1"] is None and rk["eps"]["model2"] is None
    assert out["consensus"] is None


def test_last_reported_uses_the_models_own_definitions():
    rk = _rows_by_key(build_next_two_years(ROWS, FORECAST, None))
    assert rk["revenue"]["lastReported"] == 1000.0
    assert rk["operatingMargin"]["lastReported"] == pytest.approx(0.20)
    assert rk["nopat"]["lastReported"] == pytest.approx(160.0)
    assert rk["reinvestment"]["lastReported"] == pytest.approx(60.0)
    # FCFF = NOPAT - reinvestment = 160 - 60
    assert rk["fcff"]["lastReported"] == pytest.approx(100.0)
    assert rk["roic"]["lastReported"] == pytest.approx(0.20)
    # EVA on START-of-year capital (FY2024 equity 500 + debt 200): 160 - 0.10 x 700 = 90
    assert rk["eva"]["lastReported"] == pytest.approx(90.0)
    assert rk["eps"]["lastReported"] == 5.0


def test_eva_needs_the_immediately_prior_year():
    gap = [_row(2025, "2025-12-31"), _row(2022, "2022-12-31")]
    rk = _rows_by_key(build_next_two_years(gap, FORECAST, None))
    assert rk["eva"]["lastReported"] is None
    assert rk["fcff"]["lastReported"] == pytest.approx(100.0)


def test_history_is_oldest_first_and_currency_skips_a_null():
    rows = [_row(2025, "2025-12-31", **{"Reported Currency": None}), PRIOR]
    out = build_next_two_years(rows, FORECAST, None)
    assert [h["year"] for h in out["history"]] == [2024, 2025]
    assert out["history"][0]["operatingMargin"] == pytest.approx(0.19)
    assert out["currency"] == "USD"


@pytest.mark.parametrize("rows,forecast", [
    ([], FORECAST),
    (ROWS, None),
    (ROWS, {"applicable": False, "reason": "Banks are valued on equity."}),
    (ROWS, {"applicable": False, "notApplicableReason": "REIT"}),
    (ROWS, {**FORECAST, "rows": FORECAST["rows"][:1]}),
    (ROWS, {**FORECAST, "rows": []}),
])
def test_not_applicable(rows, forecast):
    out = build_next_two_years(rows, forecast, _est())
    assert out["applicable"] is False and out["reason"]
    assert "\u2014" not in out["reason"]   # no em dash in UI-bound copy


def test_not_applicable_passes_the_models_reason_through():
    out = build_next_two_years(ROWS, {"applicable": False, "reason": "Banks are valued on equity."}, None)
    assert out["reason"] == "Banks are valued on equity."


# ── Consensus tie-out ──────────────────────────────────────────────────────

def test_consensus_shown_when_it_ties_within_five_percent():
    # MSFT: analyst-basis FY26 EPS 17.28 vs GAAP 17.95, a 3.7% gap -> shown.
    rows = [_row(2025, "2025-12-31", **{"EPS Diluted": 17.95}), PRIOR]
    out = build_next_two_years(rows, FORECAST, _est(eps=(19.76, 17.28), eps_next=23.68))
    cur, nxt = out["consensus"]["years"]
    assert out["consensus"]["source"] == "Yahoo Finance"
    assert (cur["label"], cur["fiscalYear"], cur["fiscalYearEnd"]) == ("current", 2026, "2026-12")
    assert (nxt["fiscalYear"], nxt["fiscalYearEnd"]) == (2027, "2027-12")
    assert cur["revenueHiddenReason"] is None and cur["epsHiddenReason"] is None
    assert cur["revenue"]["avg"] == 1100.0 and cur["revenue"]["analysts"] == 20
    # current growth is over OUR reported year: 1100 / 1000 - 1; 19.76 / 17.95 - 1
    assert cur["revenue"]["growth"] == pytest.approx(0.10)
    assert cur["eps"]["growth"] == pytest.approx(19.76 / 17.95 - 1, abs=1e-6)
    # next growth is estimate over estimate: 1200 / 1100 - 1
    assert nxt["revenue"]["growth"] == pytest.approx(1200 / 1100 - 1, abs=1e-6)
    assert nxt["eps"]["avg"] == 23.68


def test_adr_eps_is_hidden_but_revenue_ties():
    # TSM: yearAgoEps 10.65 is USD per ADR; our 66.25 is TWD per share.
    rows = [_row(2025, "2025-12-31", **{"Reported Currency": "TWD", "EPS Diluted": 66.25}), PRIOR]
    out = build_next_two_years(rows, FORECAST, _est(ccy="TWD", eps=(16.93, 10.65), eps_next=21.93))
    for year in out["consensus"]["years"]:
        assert year["eps"] is None and year["epsHiddenReason"] == "does_not_tie"
        assert year["revenue"] is not None and year["revenueHiddenReason"] is None


def test_database_a_year_behind_hides_every_figure():
    # MSFT today: we have FY Jun-2025, Yahoo already reports FY Jun-2026.
    rows = [_row(2025, "2025-06-30"), _row(2024, "2024-06-30")]
    out = build_next_two_years(rows, FORECAST, _est(last="2026-06", nxt="2027-06"))
    for year in out["consensus"]["years"]:
        assert year["revenue"] is None and year["eps"] is None
        assert year["revenueHiddenReason"] == year["epsHiddenReason"] == "database_behind"


def test_yahoo_behind_or_missing_year_end_does_not_tie():
    for est in (_est(last="2024-12", nxt="2025-12"), _est(last=None)):
        for year in build_next_two_years(ROWS, FORECAST, est)["consensus"]["years"]:
            assert year["revenueHiddenReason"] == year["epsHiddenReason"] == "does_not_tie"


def test_another_reporting_currency_does_not_tie_but_null_is_unknown():
    out = build_next_two_years(ROWS, FORECAST, _est(ccy="EUR"))
    assert out["consensus"]["years"][0]["revenueHiddenReason"] == "does_not_tie"
    out = build_next_two_years(ROWS, FORECAST, _est(ccy=None))
    assert out["consensus"]["years"][0]["revenueHiddenReason"] is None


def test_missing_estimate_is_no_coverage():
    out = build_next_two_years(ROWS, FORECAST, _est(eps=None))
    cur, nxt = out["consensus"]["years"]
    assert cur["eps"] is None and cur["epsHiddenReason"] == "no_coverage"
    assert nxt["epsHiddenReason"] == "no_coverage"
    assert cur["revenueHiddenReason"] is None


def test_loss_maker_ties_but_has_no_growth():
    # EPS -0.29 (Yahoo) vs -0.30 (ours) ties; growth across a loss means nothing.
    rows = [_row(2025, "2025-12-31", **{"EPS Diluted": -0.30}), PRIOR]
    out = build_next_two_years(rows, FORECAST, _est(eps=(-3.92, -0.29), eps_next=-2.40))
    cur, nxt = out["consensus"]["years"]
    assert cur["eps"]["avg"] == -3.92 and cur["eps"]["growth"] is None
    assert nxt["eps"]["growth"] is None


def test_march_year_end_matches_on_the_date_not_the_label():
    # ~12% of rows label a Mar-2025 year "2024". Yahoo's lastFiscalYearEnd 2025-03 is
    # that same year (not database_behind), and "current" is labelled like our rows.
    rows = [_row(2024, "2025-03-31"), _row(2023, "2024-03-31")]
    forecast = {**FORECAST, "years": [2025, 2026, 2027]}
    out = build_next_two_years(rows, forecast, _est(last="2025-03", nxt="2026-03"))
    cur = out["consensus"]["years"][0]
    assert cur["revenueHiddenReason"] is None
    assert (cur["fiscalYear"], cur["fiscalYearEnd"]) == (2025, "2026-03")
    assert cur["fiscalYear"] == out["modelYears"][0]


def test_consensus_years_always_sit_under_the_model_years():
    # Database a year behind (MSFT): Yahoo's next year end is 2027-06, but the
    # columns still read FY2026 / FY2027 beside the model; the real end stays.
    rows = [_row(2025, "2025-06-30"), _row(2024, "2024-06-30")]
    out = build_next_two_years(rows, FORECAST, _est(last="2026-06", nxt="2027-06"))
    cur, nxt = out["consensus"]["years"]
    assert [cur["fiscalYear"], nxt["fiscalYear"]] == out["modelYears"] == [2026, 2027]
    assert (cur["fiscalYearEnd"], nxt["fiscalYearEnd"]) == ("2027-06", "2028-06")
    # 53-week year ending 2026-01-03, labelled 2025; Yahoo's next ends 2026-12.
    rows = [_row(2025, "2026-01-03"), _row(2024, "2024-12-28")]
    cur, nxt = build_next_two_years(rows, FORECAST, _est(last="2026-01", nxt="2026-12"))[
        "consensus"]["years"]
    assert (cur["fiscalYear"], nxt["fiscalYear"]) == (2026, 2027)
    assert cur["fiscalYearEnd"] == "2026-12"


def test_row_without_a_date_falls_back_to_the_year_label():
    rows = [_row(2025, None), PRIOR]
    assert build_next_two_years(rows, FORECAST, _est())["consensus"]["years"][0]["revenueHiddenReason"] is None
    behind = build_next_two_years(rows, FORECAST, _est(last="2026-12", nxt="2027-12"))
    assert behind["consensus"]["years"][0]["revenueHiddenReason"] == "database_behind"


# ── estimates_from_yf / fetch_forward_yf ───────────────────────────────────

def _epoch(y, m, d):
    return int(datetime(y, m, d, tzinfo=timezone.utc).timestamp())


INFO = {"lastFiscalYearEnd": _epoch(2025, 9, 27), "nextFiscalYearEnd": _epoch(2026, 9, 27),
        "financialCurrency": "USD", "forwardPE": 35.58, "forwardEps": 9.585,
        "epsCurrentYear": 8.831, "numberOfAnalystOpinions": 40}
IDX = pd.Index(["0q", "+1q", "0y", "+1y"], name="period")
REV_DF = pd.DataFrame({"avg": [1.0, 2.0, 477.83e9, 527.95e9], "low": [1.0, 2.0, 471.8e9, math.nan],
                       "high": [1.0, 2.0, 484.0e9, 594.9e9], "numberOfAnalysts": [30, 30, 40, 40],
                       "yearAgoRevenue": [1.0, 2.0, 416.161e9, 477.83e9],
                       "growth": [0.1, 0.1, 0.148, 0.105]}, index=IDX)
EPS_DF = pd.DataFrame({"avg": [1.0, 2.0, 8.819, 9.578], "low": [1.0, 2.0, 8.28, 8.69],
                       "high": [1.0, 2.0, 8.94, 10.67], "yearAgoEps": [1.0, 2.0, 7.46, 8.819],
                       "numberOfAnalysts": [30, 30, 39, math.nan],
                       "growth": [0.1, 0.1, 0.182, 0.086]}, index=IDX)


def test_estimates_from_yf_normalizes_the_annual_rows():
    out = fdb.estimates_from_yf(REV_DF, EPS_DF, INFO)
    assert (out["lastFiscalYearEnd"], out["nextFiscalYearEnd"]) == ("2025-09", "2026-09")
    assert out["financialCurrency"] == "USD"
    cur = out["current"]
    assert cur["revenue"] == {"avg": 477.83e9, "low": 471.8e9, "high": 484.0e9,
                              "analysts": 40, "yearAgo": 416.161e9}
    assert type(cur["revenue"]["analysts"]) is int and type(cur["revenue"]["avg"]) is float
    assert cur["eps"]["yearAgo"] == pytest.approx(7.46)
    assert out["next"]["revenue"]["low"] is None          # NaN -> None
    assert out["next"]["eps"]["analysts"] is None


def test_estimates_from_yf_is_none_without_annual_rows():
    empty = pd.DataFrame()
    quarterly_only = REV_DF.loc[["0q", "+1q"]]
    assert fdb.estimates_from_yf(None, None, INFO) is None
    assert fdb.estimates_from_yf(empty, empty, INFO) is None
    assert fdb.estimates_from_yf(quarterly_only, None, INFO) is None
    one_side = fdb.estimates_from_yf(REV_DF, None, None)
    assert one_side["current"]["eps"] is None and one_side["lastFiscalYearEnd"] is None


def test_fetch_forward_uses_one_ticker_and_survives_yahoo_failures(monkeypatch):
    made = []

    class Ok:
        def __init__(self, sym):
            made.append(sym)
        info = INFO
        revenue_estimate = REV_DF
        earnings_estimate = EPS_DF

    class NoEstimates(Ok):
        @property
        def revenue_estimate(self):
            raise RuntimeError("HTTP Error 404")

    class Unknown(Ok):
        @property
        def info(self):
            raise RuntimeError("HTTP Error 404")

    monkeypatch.setattr(fdb.yf, "Ticker", Ok)
    out = fdb.fetch_forward_yf("AAPL")
    assert made == ["AAPL"]
    assert out["consensus"]["forwardPe"] == pytest.approx(35.58)
    assert out["estimates"]["current"]["revenue"]["avg"] == 477.83e9

    monkeypatch.setattr(fdb.yf, "Ticker", NoEstimates)
    out = fdb.fetch_forward_yf("AAPL")
    assert out["consensus"] is not None and out["estimates"] is None

    monkeypatch.setattr(fdb.yf, "Ticker", Unknown)
    assert fdb.fetch_forward_yf("ZZZQX") == {"consensus": None, "estimates": None}
