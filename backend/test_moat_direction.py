"""Moat direction and growth sustainability (feature plan item 11).

Every expected value is hand-computed in the comment beside it. Network-free
and DB-free: plain dicts stand in for sqlite3.Row, as in test_pe_growth_block.py.

Run:  cd backend && python -m pytest test_moat_direction.py -q
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import pytest  # noqa: E402

import individualanalysis as ia  # noqa: E402

# ROIC falls 1 point a year while WACC rises half a point a year, 2019-2024.
ROIC = {2019 + i: 0.20 - 0.01 * i for i in range(6)}
WACC = {2019 + i: 0.07 + 0.005 * i for i in range(6)}
HIST = {"roic": ROIC, "wacc": WACC}


# ── Spread direction ────────────────────────────────────────────────────────

def test_spread_now_then_and_slope():
    out = ia._spread_direction(HIST)
    # 2024: 0.15 − 0.095 = 0.055;  2019: 0.20 − 0.07 = 0.13
    assert out["year"] == 2024 and out["yearThen"] == 2019
    assert out["spreadNow"] == pytest.approx(0.055)
    assert out["spreadThen"] == pytest.approx(0.13)
    # spread falls exactly 1.5 points a year, so the OLS slope is −0.015
    assert out["slopePerYear"] == pytest.approx(-0.015)
    assert out["yearsInSlope"] == 6


def test_spread_change_splits_exactly_into_roic_and_wacc():
    out = ia._spread_direction(HIST)
    # ΔROIC = 0.15 − 0.20 = −0.05;  ΔWACC = 0.095 − 0.07 = +0.025
    assert out["returnChange"] == pytest.approx(-0.05)
    assert out["costChange"] == pytest.approx(0.025)
    # Δspread = ΔROIC − ΔWACC = −0.075 = 0.055 − 0.13, exact at print precision
    assert out["spreadChange"] == pytest.approx(out["returnChange"] - out["costChange"], abs=1e-9)
    assert out["spreadChange"] == pytest.approx(out["spreadNow"] - out["spreadThen"])


def test_a_spread_that_fell_only_because_rates_rose_shows_no_roic_change():
    hist = {"roic": {y: 0.15 for y in range(2019, 2025)},
            "wacc": {2019 + i: 0.07 + 0.005 * i for i in range(6)}}
    out = ia._spread_direction(hist)
    assert out["returnChange"] == pytest.approx(0.0)
    assert out["costChange"] == pytest.approx(0.025)
    assert out["returnFadePerYear"] == pytest.approx(0.0)


def test_years_to_zero_only_while_positive_and_falling():
    out = ia._spread_direction(HIST)
    # 0.055 / 0.015 = 3.67 years
    assert out["yearsToZeroAtThisPace"] == pytest.approx(3.67, abs=0.01)
    rising = {"roic": {2019 + i: 0.10 + 0.01 * i for i in range(6)},
              "wacc": {y: 0.08 for y in range(2019, 2025)}}
    assert ia._spread_direction(rising)["yearsToZeroAtThisPace"] is None


def test_missing_year_then_leaves_the_split_blank():
    hist = {"roic": {2022: 0.1, 2023: 0.1, 2024: 0.1},
            "wacc": {2022: 0.08, 2023: 0.08, 2024: 0.08}}
    out = ia._spread_direction(hist)
    assert out["spreadThen"] is None and out["spreadChange"] is None
    assert out["slopePerYear"] == pytest.approx(0.0)


def test_no_history_returns_none():
    assert ia._spread_direction({}) is None
    assert ia._spread_direction(None) is None


# ── One fade rate for the strip and the Growth Viability flag ──────────────

def test_roic_fade_is_minus_the_slope():
    fade = ia._roic_fade(ROIC)
    assert fade["fade"] == pytest.approx(0.01)
    assert fade["first"] == pytest.approx(0.20) and fade["last"] == pytest.approx(0.15)


def test_roic_fade_needs_three_years():
    assert ia._roic_fade({2023: 0.1, 2024: 0.09}) is None


def test_growth_viability_flag_reads_the_same_fade():
    rows = [{"Calendar Year": y, "Revenue": 100.0, "Operating Income": 10.0} for y in range(2019, 2025)]
    fast = {2019 + i: 0.30 - 0.03 * i for i in range(6)}          # fades 3 points a year
    out = ia.build_growth_viability(rows, None, None, "Acme", roic_hist=fast)
    check = next(c for c in out["checks"] if c["id"] == "moat_roic_decay")
    assert check["value"] == pytest.approx(0.03)
    assert check["severity"] == "medium"
    assert ia._spread_direction({"roic": fast, "wacc": {y: 0.08 for y in fast}})[
        "returnFadePerYear"] == pytest.approx(check["value"])


def test_banks_run_the_same_arithmetic_on_roe_and_cost_of_equity():
    hist = {"roic": {y: 0.03 for y in range(2019, 2025)},
            "wacc": {y: 0.09 for y in range(2019, 2025)},
            "roe": {2019 + i: 0.10 + 0.01 * i for i in range(6)},
            "cost_of_equity": {y: 0.10 for y in range(2019, 2025)}}
    out = ia._spread_direction(hist, equity_basis=True)
    # 2024 ROE 0.15 − 0.10 = 0.05; 2019 0.10 − 0.10 = 0.00
    assert out["basis"] == "equity"
    assert out["spreadNow"] == pytest.approx(0.05) and out["spreadThen"] == pytest.approx(0.0)
    assert out["returnChange"] == pytest.approx(0.05) and out["costChange"] == pytest.approx(0.0)
    assert ia._spread_direction(hist)["basis"] == "capital"


def test_moat_block_uses_the_equity_basis_for_a_bank():
    rows = [{"Calendar Year": y, "t_sector": "Financial Services", "t_industry": "Banks - Diversified",
             "Revenue": 100.0, "Gross Profit": 60.0, "Operating Income": 25.0} for y in range(2019, 2025)]
    hist = {"roe": {y: 0.12 for y in range(2019, 2025)},
            "cost_of_equity": {y: 0.10 for y in range(2019, 2025)}}
    out = ia._moat_direction(rows, hist, None)
    assert out["spread"]["basis"] == "equity"
    assert out["incrementalRoic"] is None
    assert out["shareAndMargins"]["grossMarginNow"] is None
    assert out["shareAndMargins"]["operatingMarginNow"] == pytest.approx(0.25)


# ── Four-factor sustainable growth ─────────────────────────────────────────

def _fin_rows(div=-6.0, bb=None):
    rows = []
    for i, y in enumerate(range(2019, 2025)):
        rows.append({"Calendar Year": y, "Revenue": 100.0 * 1.1 ** i, "Net Income": 10.0,
                     "Total Assets": 125.0, "Total Stockholders Equity": 62.5,
                     "Dividends Paid": div, "Common Stock Repurchased": bb})
    return rows


def test_four_factors_multiply_to_the_product():
    out = ia._sustainable_growth_history(_fin_rows())
    last = out["rows"][-1]
    # margin 10/161.051, turnover 161.051/125, A/E 2.0, retention 1 − 6/10 = 0.4
    product = last["margin"] * last["assetTurnover"] * last["assetsOverEquity"] * last["retention"]
    assert last["sustainableGrowth"] == pytest.approx(product, rel=1e-5)
    # = NI/E × retention = 0.16 × 0.4 = 0.064
    assert last["sustainableGrowth"] == pytest.approx(0.064, rel=1e-5)
    assert [r["year"] for r in out["rows"]] == [2020, 2021, 2022, 2023, 2024]


def test_revenue_cagr_over_the_same_window():
    out = ia._sustainable_growth_history(_fin_rows())
    assert out["revenueCagr"] == pytest.approx(0.10, abs=1e-6)
    assert out["revenueFromYear"] == 2019 and out["revenueToYear"] == 2024


def test_buybacks_count_as_cash_returned():
    # Apple-shaped: ROE 160%, dividends 1.5 and buybacks 10 on net income 10.
    rows = [{"Calendar Year": y, "Revenue": 400.0, "Net Income": 10.0, "Total Assets": 35.0,
             "Total Stockholders Equity": 6.25, "Dividends Paid": -1.5,
             "Common Stock Repurchased": -10.0} for y in range(2019, 2025)]
    out = ia._sustainable_growth_history(rows)
    last = out["rows"][-1]
    # retention 1 − 11.5/10 = −0.15; growth 1.6 × −0.15 = −0.24, never above 100%
    assert last["retention"] == pytest.approx(-0.15)
    assert last["sustainableGrowth"] == pytest.approx(-0.24, rel=1e-5)
    assert out["buybacksIncluded"] is True


def test_negative_equity_or_loss_is_not_published():
    rows = _fin_rows()
    rows[-1]["Total Stockholders Equity"] = -5.0
    rows[-2]["Net Income"] = -3.0
    out = ia._sustainable_growth_history(rows)
    assert out["rows"][-1]["sustainableGrowth"] is None
    assert out["rows"][-2]["sustainableGrowth"] is None
    assert out["yearsAveraged"] == 3


def test_no_payout_data_at_all_is_missing_not_full_retention():
    # Both columns NULL: the DB stores an explicit 0 for a non-payer, so this is a gap.
    rows = _fin_rows(div=None, bb=None)
    out = ia._sustainable_growth_history(rows)
    assert out["rows"][-1]["retention"] is None
    assert out["rows"][-1]["sustainableGrowth"] is None
    # An explicit zero payout still reads as 100% retained.
    assert ia._sustainable_growth_history(_fin_rows(div=0.0))["rows"][-1]["retention"] == pytest.approx(1.0)


def test_growth_viability_text_follows_the_trend_not_the_endpoints():
    rows = [{"Calendar Year": y, "Revenue": 100.0, "Operating Income": 10.0} for y in range(2019, 2025)]
    rising = {2019 + i: 0.10 + 0.03 * i for i in range(6)}
    out = ia.build_growth_viability(rows, None, None, "Acme", roic_hist=rising)
    check = next(c for c in out["checks"] if c["id"] == "moat_roic_decay")
    assert check["severity"] == "ok" and "risen about" in check["detail"]
    # A rise too small to print is "holding", never "risen about 0%".
    flat = {2019 + i: 0.20 + 0.001 * i for i in range(6)}
    out = ia.build_growth_viability(rows, None, None, "Acme", roic_hist=flat)
    check = next(c for c in out["checks"] if c["id"] == "moat_roic_decay")
    assert "holding near" in check["detail"]


def test_no_buyback_column_is_reported():
    assert ia._sustainable_growth_history(_fin_rows(bb=None))["buybacksIncluded"] is False


# ── Share, margins and the return on new capital ──────────────────────────

def test_share_and_margins_now_and_then():
    rows = [{"Calendar Year": 2019, "Revenue": 100.0, "Gross Profit": 40.0, "Operating Income": 15.0},
            {"Calendar Year": 2024, "Revenue": 200.0, "Gross Profit": 70.0, "Operating Income": 24.0}]
    split = {"shareNow": 0.12, "shareThen": 0.10, "years": 5, "fiscalYear": 2024}
    out = ia._share_and_margins(rows, split)
    assert out["grossMarginNow"] == pytest.approx(0.35) and out["grossMarginThen"] == pytest.approx(0.40)
    assert out["operatingMarginNow"] == pytest.approx(0.12) and out["operatingMarginThen"] == pytest.approx(0.15)
    assert out["shareNow"] == 0.12 and out["shareThen"] == 0.10
    assert out["shareYear"] == 2024 and out["shareYearThen"] == 2019


def test_share_blank_without_a_split():
    out = ia._share_and_margins([{"Calendar Year": 2024, "Revenue": 1.0}], None)
    assert out["shareNow"] is None and out["shareYearThen"] is None


def test_incremental_roic_over_the_window(monkeypatch):
    nopat = {2019: 10.0, 2024: 16.0}
    ic = {2019: 100.0, 2024: 130.0}
    monkeypatch.setattr(ia, "_nopat_for_row", lambda r: nopat.get(r["Calendar Year"]))
    monkeypatch.setattr(ia, "_invested_capital", lambda r: ic.get(r["Calendar Year"]))
    rows = [{"Calendar Year": y} for y in (2019, 2024)]
    # (16 − 10) / (130 − 100) = 20%
    assert ia._incremental_roic(rows)["value"] == pytest.approx(0.20)
    ic[2024] = 90.0                                               # capital shrank
    assert ia._incremental_roic(rows) is None
    ic[2024] = 104.0                                              # grew 4%, below the 5% floor
    assert ia._incremental_roic(rows) is None
