"""Tests for the uses-of-cash block.

The sign traps are the reason this module exists, so they are the bulk of the file.
Every fixture below is shaped on a real row from the live financials table.
"""

from __future__ import annotations

import pytest

from uses_of_cash import build_uses_of_cash


def _row(year: int, **kw) -> dict:
    """A fiscal-year row with the DB's own sign convention.

    Outflow columns arrive NEGATIVE from the source data, exactly as they are
    stored, so the fixtures pass negatives and the module is responsible for
    turning them into positive uses.
    """
    base = {
        "Calendar Year": year,
        "Operating Cash Flow": 100_000.0,
        "Capital Expenditure": -10_000.0,
        "Research And Development Expenses": 5_000.0,
        "Acquisitions Net": -2_000.0,
        "Common Stock Repurchased": -20_000.0,
        "Dividends Paid": -8_000.0,
        "Debt Repayment": -4_000.0,
    }
    base.update(kw)
    return base


# ── the JNJ trap: positive Debt Repayment is BORROWING, not repayment ──────────

def test_positive_debt_repayment_is_a_source_not_a_use():
    """JNJ FY2025 has Debt Repayment = +9,637,000,000. That is net BORROWING.

    abs() would draw ten billion dollars of borrowing as if it were ten billion
    dollars of debt paydown. It must land in sources, and the use must be zero.
    """
    out = build_uses_of_cash([_row(2025, **{"Debt Repayment": 9_637_000_000.0})])
    y = out["years"][0]

    assert y["uses"]["debtRepaid"] == 0.0, "borrowing must not become a use of cash"
    assert y["sources"]["netDebtRaised"] == 9_637_000_000.0
    # and it is still 'reported' — the company told us, we just read the sign
    assert y["reported"]["debtRepaid"] is True


def test_negative_debt_repayment_is_a_genuine_use():
    """MSFT FY2025 has Debt Repayment = -8,962,000,000. That IS repayment."""
    out = build_uses_of_cash([_row(2025, **{"Debt Repayment": -8_962_000_000.0})])
    y = out["years"][0]

    assert y["uses"]["debtRepaid"] == 8_962_000_000.0
    assert y["sources"]["netDebtRaised"] is None


# ── the same trap on Acquisitions Net (net of divestitures) ────────────────────

def test_positive_acquisitions_net_is_a_divestiture_not_a_purchase():
    out = build_uses_of_cash([_row(2024, **{"Acquisitions Net": 3_500_000.0})])
    y = out["years"][0]

    assert y["uses"]["acquisitions"] == 0.0, "a divestiture is not a use of cash"
    assert y["sources"]["netDivestitures"] == 3_500_000.0


def test_negative_acquisitions_net_is_a_genuine_purchase():
    out = build_uses_of_cash([_row(2024, **{"Acquisitions Net": -17_541_000_000.0})])
    y = out["years"][0]

    assert y["uses"]["acquisitions"] == 17_541_000_000.0
    assert y["sources"]["netDivestitures"] is None


# ── the GOOGL trap: NULL is not zero ──────────────────────────────────────────

def test_null_financing_lines_are_unreported_not_zero():
    """Alphabet has NULL buybacks / debt / acquisitions for FY2023-25.

    Rendering those as 0 would state that Alphabet bought back no stock, which is
    false. They must come back as None with reported=False so the UI can say
    'not reported' instead of drawing an empty bar.
    """
    out = build_uses_of_cash([_row(2025, **{
        "Common Stock Repurchased": None,
        "Debt Repayment": None,
        "Acquisitions Net": None,
    })])
    y = out["years"][0]

    for k in ("buybacks", "debtRepaid", "acquisitions"):
        assert y["uses"][k] is None, f"{k}: a NULL must not become 0"
        assert y["reported"][k] is False

    # the lines that ARE reported still work
    assert y["uses"]["capex"] == 10_000.0
    assert y["reported"]["capex"] is True


def test_zero_is_distinguishable_from_unreported():
    """A genuine zero (the company spent nothing) is NOT the same as a NULL."""
    out = build_uses_of_cash([_row(2024, **{"Common Stock Repurchased": 0.0})])
    y = out["years"][0]

    assert y["uses"]["buybacks"] == 0.0
    assert y["reported"]["buybacks"] is True, "a reported zero is still reported"


# ── the denominator trap: negative operating cash flow ────────────────────────

def test_negative_ocf_produces_no_share_rather_than_a_negative_share():
    """94,788 rows have negative OCF. Dividing by it inverts every sign."""
    out = build_uses_of_cash([_row(2020, **{"Operating Cash Flow": -50_000.0})])
    y = out["years"][0]

    assert y["ocfPositive"] is False
    assert y["shareOfOcf"] is None, "must not emit a negative percentage"
    assert y["shareReason"] and "negative" in y["shareReason"].lower()
    # dollars are still shown, because they are still true
    assert y["uses"]["capex"] == 10_000.0


def test_positive_ocf_produces_shares():
    out = build_uses_of_cash([_row(2024)])
    y = out["years"][0]

    assert y["ocfPositive"] is True
    assert y["shareOfOcf"]["capex"] == pytest.approx(0.10)
    assert y["shareOfOcf"]["buybacks"] == pytest.approx(0.20)
    assert y["totalUsesShareOfOcf"] == pytest.approx(0.49)  # 10+5+2+20+8+4 = 49


# ── house invariants ──────────────────────────────────────────────────────────

def test_rows_are_sorted_ascending_regardless_of_caller_order():
    """A caller once passed DESC rows and every company was scored on its oldest
    year. Every function that indexes rows positionally must guard against it."""
    asc = build_uses_of_cash([_row(2022), _row(2023), _row(2024)])
    desc = build_uses_of_cash([_row(2024), _row(2023), _row(2022)])

    assert [y["year"] for y in asc["years"]] == [2022, 2023, 2024]
    assert asc == desc


def test_totals_sum_the_years():
    out = build_uses_of_cash([_row(2023), _row(2024)])

    assert out["totals"]["capex"] == 20_000.0
    assert out["totals"]["buybacks"] == 40_000.0
    assert out["totalOperatingCashFlow"] == 200_000.0


def test_empty_history_is_not_applicable_and_does_not_raise():
    out = build_uses_of_cash([])
    assert out["applicable"] is False
    assert out["reason"]


def test_company_reporting_none_of_the_lines_is_not_applicable():
    out = build_uses_of_cash([{
        "Calendar Year": 2024,
        "Operating Cash Flow": 100_000.0,
        "Capital Expenditure": None,
        "Research And Development Expenses": None,
        "Acquisitions Net": None,
        "Common Stock Repurchased": None,
        "Dividends Paid": None,
        "Debt Repayment": None,
    }])
    assert out["applicable"] is False


def test_missing_columns_do_not_raise():
    """A row that simply lacks the columns must degrade, not explode."""
    out = build_uses_of_cash([{"Calendar Year": 2024, "Operating Cash Flow": 1_000.0,
                               "Capital Expenditure": -100.0}])
    assert out["applicable"] is True
    assert out["years"][0]["uses"]["capex"] == 100.0
    assert out["years"][0]["uses"]["dividends"] is None


def test_no_em_dashes_in_user_facing_strings():
    """House style: no em dashes anywhere in copy."""
    out = build_uses_of_cash([_row(2020, **{"Operating Cash Flow": -5.0}), _row(2024)])

    def walk(o):
        if isinstance(o, str):
            assert "—" not in o and "–" not in o, f"dash in: {o[:60]}"
        elif isinstance(o, dict):
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(out)
