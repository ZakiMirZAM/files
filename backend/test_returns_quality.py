"""Characterization tests for backend/returns_quality.py.

Network-free. Dict rows stand in for sqlite3.Row, matching test_valuation_fixes.py.

The AAPL fixture is real: the figures were pulled from the live backend on
2026-07-17 (FY2020-FY2025) and are what the section must reproduce. The two
tests that matter most are `test_five_year_average_is_never_a_fallback` and
`test_negative_reinvestment_is_carried_not_floored`, because those encode the
two design rules the rest of the engine currently breaks.
"""

from __future__ import annotations

import math

import pytest

from returns_quality import (
    DEPARTURE_GAP,
    WINDOW,
    build_returns_quality,
    growth_expected_vs_actual,
    reinvestment_vs_history,
    roe_vs_history,
    roic_vs_history,
    roic_vs_industry,
)


def _row(year, **kw):
    """A financials row. Defaults are internally consistent so a test only has
    to state the columns it cares about."""
    base = {
        "Calendar Year": year,
        "Revenue": 1000.0,
        "Operating Income": 300.0,
        "Income Before Tax": 290.0,
        "Income Tax Expense": 58.0,       # 20% effective
        "Net Income": 232.0,
        "Total Stockholders Equity": 500.0,
        "Total Debt": 300.0,
        "Total Assets": 1500.0,
        "Capital Expenditure": -80.0,
        "Depreciation and Amortization Cashflow": 60.0,
        "Change In Working Capital": 10.0,
        "Payout Ratio": 0.25,
        "ROE": None,
        "ROIC": None,
    }
    base.update(kw)
    return base


# Real AAPL, pulled from the running backend. ROE/ROIC are the stored columns.
AAPL = [
    _row(2020, ROE=0.8787, ROIC=0.2427, Revenue=274515000000.0,
         **{"Operating Income": 66288000000.0, "Income Before Tax": 67091000000.0,
            "Income Tax Expense": 9680000000.0, "Net Income": 57411000000.0,
            "Total Stockholders Equity": 65339000000.0, "Total Debt": 122278000000.0,
            "Total Assets": 323888000000.0, "Capital Expenditure": -7309000000.0,
            "Depreciation and Amortization Cashflow": 11056000000.0,
            "Change In Working Capital": 5690000000.0}),
    _row(2021, ROE=1.5007, ROIC=0.3893, Revenue=365817000000.0,
         **{"Operating Income": 108949000000.0, "Income Before Tax": 109207000000.0,
            "Income Tax Expense": 14527000000.0, "Net Income": 94680000000.0,
            "Total Stockholders Equity": 63090000000.0, "Total Debt": 124719000000.0,
            "Total Assets": 351002000000.0, "Capital Expenditure": -11085000000.0,
            "Depreciation and Amortization Cashflow": 11284000000.0,
            "Change In Working Capital": -4911000000.0}),
    _row(2022, ROE=1.9696, ROIC=0.4517, Revenue=394328000000.0,
         **{"Operating Income": 119437000000.0, "Income Before Tax": 119103000000.0,
            "Income Tax Expense": 19300000000.0, "Net Income": 99803000000.0,
            "Total Stockholders Equity": 50672000000.0, "Total Debt": 120069000000.0,
            "Total Assets": 352755000000.0, "Capital Expenditure": -10708000000.0,
            "Depreciation and Amortization Cashflow": 11104000000.0,
            "Change In Working Capital": 1200000000.0}),
    _row(2023, ROE=1.5608, ROIC=0.4339, Revenue=383285000000.0,
         **{"Operating Income": 114301000000.0, "Income Before Tax": 113736000000.0,
            "Income Tax Expense": 16741000000.0, "Net Income": 96995000000.0,
            "Total Stockholders Equity": 62146000000.0, "Total Debt": 111088000000.0,
            "Total Assets": 352583000000.0, "Capital Expenditure": -10959000000.0,
            "Depreciation and Amortization Cashflow": 11519000000.0,
            "Change In Working Capital": -6577000000.0}),
    _row(2024, ROE=1.6459, ROIC=0.4431, Revenue=391035000000.0,
         **{"Operating Income": 123216000000.0, "Income Before Tax": 123485000000.0,
            "Income Tax Expense": 29749000000.0, "Net Income": 93736000000.0,
            "Total Stockholders Equity": 56950000000.0, "Total Debt": 106629000000.0,
            "Total Assets": 364980000000.0, "Capital Expenditure": -9447000000.0,
            "Depreciation and Amortization Cashflow": 11445000000.0,
            "Change In Working Capital": 3651000000.0}),
    _row(2025, ROE=1.5191, ROIC=0.5197, Revenue=416161000000.0,
         **{"Operating Income": 133017000000.0, "Income Before Tax": 132670000000.0,
            "Income Tax Expense": 20706000000.0, "Net Income": 112010000000.0,
            "Total Stockholders Equity": 73749000000.0, "Total Debt": 98186000000.0,
            "Total Assets": 378513000000.0, "Capital Expenditure": -12720000000.0,
            "Depreciation and Amortization Cashflow": 12148000000.0,
            "Change In Working Capital": -19000000000.0}),
]

# The live Consumer Electronics scorecard, decimalized from the matrix.
AAPL_INDUSTRY = {
    "name": "Consumer Electronics",
    "universe": "90 companies",
    "roic": 0.4952,
    "wacc": 0.0815,
    "spread": 0.4137,
    "roe": 0.8114,
    "ownWacc": 0.0819,
    "ownSalesToCapital": 2.771,
    "industrySalesToCapital": 1.519,
    "reinvestmentRate": None,   # does not exist yet
}


# ── the two design rules ─────────────────────────────────────────────────────

def test_five_year_average_is_never_a_fallback():
    """Both expected-growth figures are ALWAYS returned, even when the current
    one is extreme. Nothing substitutes an average for a point estimate."""
    g = growth_expected_vs_actual(AAPL)
    assert g["applicable"] is True
    # Apple's current expected growth is deeply negative and must survive intact.
    assert g["expectedCurrent"] < 0
    assert g["expectedFiveYearAverage"] is not None
    assert g["expectedCurrent"] != g["expectedFiveYearAverage"]
    # Both inputs are exposed so the reader can see which one moved.
    assert g["inputs"]["reinvestmentCurrent"] is not None
    assert g["inputs"]["reinvestmentFiveYearAverage"] is not None
    assert g["inputs"]["roicCurrent"] == pytest.approx(0.5197)


def test_negative_reinvestment_is_carried_not_floored():
    """A negative reinvestment rate is real information, not a data error. The
    forecast path floors it to 0.0; this section must not."""
    r = reinvestment_vs_history(AAPL, AAPL_INDUSTRY)
    assert r["current"] < 0
    assert r["isConsumingAssetBase"] is True
    # The engine's growth path reports 0.0 for exactly this input. We report the
    # real value, so expected growth stays negative rather than collapsing.
    g = growth_expected_vs_actual(AAPL)
    assert g["inputs"]["reinvestmentCurrent"] < 0
    assert g["expectedCurrent"] == pytest.approx(
        g["inputs"]["reinvestmentCurrent"] * g["inputs"]["roicCurrent"]
    )


# ── ROE against its own history ──────────────────────────────────────────────

def test_roe_current_below_its_own_five_year_average():
    h = roe_vs_history(AAPL)
    assert h["applicable"] is True
    assert h["current"] == pytest.approx(1.5191)
    assert h["avg5"] == pytest.approx(1.6392, abs=1e-3)
    assert h["median5"] == pytest.approx(1.5608)
    assert h["gap"] == pytest.approx(-0.1201, abs=1e-3)
    assert h["yearsUsed"] == WINDOW
    assert h["leverageCurrent"] == pytest.approx(378513000000.0 / 73749000000.0, rel=1e-4)


def test_roe_falls_back_to_computed_when_column_null():
    rows = [_row(y, ROE=None) for y in (2021, 2022, 2023, 2024, 2025)]
    h = roe_vs_history(rows)
    assert h["current"] == pytest.approx(232.0 / 500.0)


def test_departure_flag_tracks_the_gap():
    h = roe_vs_history(AAPL)
    assert h["isDeparture"] is (abs(h["gap"]) >= DEPARTURE_GAP)


# ── ROIC against its own history, and why ────────────────────────────────────

def test_roic_current_above_its_own_five_year_average():
    h = roic_vs_history(AAPL)
    assert h["current"] == pytest.approx(0.5197)
    assert h["avg5"] == pytest.approx(0.4475, abs=1e-3)
    assert h["gap"] == pytest.approx(0.0722, abs=1e-3)


def test_attribution_names_turnover_as_the_largest_driver():
    """Apple's return rose mostly because capital turnover rose, not margin."""
    a = roic_vs_history(AAPL)["attribution"]
    assert a is not None
    effects = {
        "turnover": a["turnoverEffect"],
        "margin": a["marginEffect"],
        "tax": a["taxEffect"],
    }
    assert max(effects, key=lambda k: effects[k]) == "turnover"
    assert all(v > 0 for v in effects.values())
    assert a["total"] == pytest.approx(
        a["marginEffect"] + a["taxEffect"] + a["turnoverEffect"]
    )


def test_attribution_reports_when_it_cannot_reconcile():
    """The stored ROIC column and the computed components rest on different
    bases, so the decomposition must say so rather than imply an exact split."""
    a = roic_vs_history(AAPL)["attribution"]
    assert a["reconciles"] is False
    assert a["reconcileNote"] is not None
    assert a["productNow"] != pytest.approx(a["reportedRoic"], abs=0.01)


def test_attribution_reconciles_when_bases_agree():
    """With no stored column the headline is computed from the same rows as the
    components, so the product must match."""
    rows = [_row(y, ROIC=None) for y in (2021, 2022, 2023, 2024, 2025)]
    a = roic_vs_history(rows)["attribution"]
    assert a["reconciles"] is True
    assert a["reconcileNote"] is None


# ── ROIC and spread against the industry ─────────────────────────────────────

def test_spread_gap_against_industry():
    r = roic_vs_industry(AAPL, AAPL_INDUSTRY)
    assert r["applicable"] is True
    assert r["roicGap"] == pytest.approx(0.5197 - 0.4952, abs=1e-4)
    assert r["company"]["spread"] == pytest.approx(0.5197 - 0.0819, abs=1e-4)
    assert r["spreadGap"] == pytest.approx(0.4378 - 0.4137, abs=1e-3)


def test_leverage_tell_fires_when_roe_gap_dwarfs_roic_gap():
    """Apple beats its industry by 2.45pp on ROIC and 70.8pp on ROE. That is
    leverage, and the block must say so rather than let it read as advantage."""
    r = roic_vs_industry(AAPL, AAPL_INDUSTRY)
    assert r["roeGap"] > r["roicGap"] * 3
    assert r["leverageTell"] is not None
    assert "leverage" in r["leverageTell"].lower()


def test_industry_block_is_inapplicable_without_a_benchmark():
    r = roic_vs_industry(AAPL, None)
    assert r["applicable"] is False
    assert "reason" in r


# ── growth ───────────────────────────────────────────────────────────────────

def test_actual_growth_uses_every_year_not_two_endpoints():
    g = growth_expected_vs_actual(AAPL)
    assert g["actual"] is not None
    # Revenue 274.5B -> 416.2B over 5 periods. A CAGR reads ~8.7%; the
    # regression uses every year and lands lower.
    cagr = (416161000000.0 / 274515000000.0) ** (1 / 5) - 1
    assert g["actual"] != pytest.approx(cagr, abs=1e-3)
    assert 0.0 < g["actual"] < 0.15


def test_divergence_is_actual_against_current_expected():
    g = growth_expected_vs_actual(AAPL)
    assert g["divergence"] == pytest.approx(abs(g["actual"] - g["expectedCurrent"]))
    # Apple grew while reinvesting less than nothing: a very wide divergence.
    assert g["divergence"] > 0.15


def test_reinvestment_required_reads_the_relationship_backwards():
    g = growth_expected_vs_actual(AAPL)
    assert g["reinvestmentRequiredForActual"] == pytest.approx(
        g["actual"] / g["inputs"]["roicCurrent"]
    )


def test_equity_lens_uses_retention_times_roe():
    g = growth_expected_vs_actual(AAPL)
    eq = g["equityLens"]
    assert eq["expected"] == pytest.approx(eq["retention"] * eq["roe"])


# ── reinvestment ─────────────────────────────────────────────────────────────

def test_reinvestment_reports_missing_industry_benchmark_honestly():
    r = reinvestment_vs_history(AAPL, AAPL_INDUSTRY)
    assert r["industryReinvestmentRate"] is None
    assert r["benchmarkNote"] is not None
    # Sales to capital is the only benchmark that does exist.
    assert r["industrySalesToInvestedCapital"] == pytest.approx(1.519)


def test_capex_below_depreciation_is_flagged():
    r = reinvestment_vs_history(AAPL, AAPL_INDUSTRY)
    assert r["capexToDepreciationCurrent"] == pytest.approx(12720.0 / 12148.0, rel=1e-3)
    assert r["isBelowRenewal"] is False   # 2025 capex slightly exceeds depreciation


# ── ordering, guards, aggregator ─────────────────────────────────────────────

def test_descending_rows_do_not_invert_the_result():
    """A caller once passed DESC rows and every company was scored on its oldest
    year. The window sort must be defensive."""
    asc = roe_vs_history(AAPL)
    desc = roe_vs_history(list(reversed(AAPL)))
    assert asc["current"] == desc["current"]
    assert asc["avg5"] == pytest.approx(desc["avg5"])


def test_window_takes_the_last_five_years_only():
    h = roe_vs_history(AAPL)
    assert h["yearsUsed"] == 5
    assert "2020" not in h["series"]
    assert "2025" in h["series"]


def test_zero_equity_does_not_raise():
    rows = [_row(y, **{"Total Stockholders Equity": 0.0, "ROE": None}) for y in (2021, 2022, 2023)]
    h = roe_vs_history(rows)
    assert h["applicable"] is False


def test_empty_rows_return_none():
    assert build_returns_quality([]) is None


def test_aggregator_returns_all_five_blocks():
    out = build_returns_quality(AAPL, industry_norms=AAPL_INDUSTRY)
    assert set(out) >= {"roeHistory", "roicHistory", "roicIndustry", "growth", "reinvestment"}
    assert all(math.isfinite(v) for v in [out["roeHistory"]["current"], out["roicHistory"]["current"]])


def test_one_broken_block_does_not_break_the_rest():
    """No industry benchmark must not stop the history blocks rendering."""
    out = build_returns_quality(AAPL, industry_norms=None)
    assert out["roicIndustry"]["applicable"] is False
    assert out["roeHistory"]["applicable"] is True
    assert out["growth"]["applicable"] is True
