"""Network-free tests for remediation/phase3_complete_rows.py (--ratios path).

Seeds a temp DB with known statement values + NULL ratios, runs the ratio
fills directly, and asserts:
  * every derived ratio computes to the expected value,
  * a pre-existing non-NULL ratio is left untouched,
  * a zero-denominator row stays NULL.
"""

import os
import sqlite3
import sys

import pytest

_HERE = os.path.dirname(os.path.abspath(__file__))
for _p in (os.path.join(_HERE, "..", "data"), os.path.join(_HERE, "..", "remediation")):
    _p = os.path.abspath(_p)
    if _p not in sys.path:
        sys.path.insert(0, _p)

import phase3_complete_rows as p3  # noqa: E402
from financial_db import EXCEL_COLUMNS  # noqa: E402

# Columns the ratio specs read or write, plus the PK.
_USED_COLUMNS = [
    "Ticker", "Calendar Year", "Revenue", "Gross Profit", "Operating Income",
    "Net Income", "EBITDA", "Total Stockholders Equity", "Total Current Assets",
    "Total Current Liabilities", "Total Debt", "Total Assets",
    "Operating Cash Flow", "Capital Expenditure", "Free Cash Flow",
    "Weighted Average Shs Out Dil", "Market Cap",
    "Gross Profit Ratio", "Operating Income Ratio", "Net Income Ratio",
    "EBITDA Ratio", "ROE", "Current Ratio", "Debt To Equity", "Debt To Assets",
    "Free Cash Flow Per Share", "Operating Cash Flow Per Share",
    "Revenue Per Share", "Book Value Per Share", "PE Ratio", "PB Ratio",
    "Price To Sales Ratio", "Earnings Yield", "Free Cash Flow Yield",
]


def _make_db(tmp_path) -> sqlite3.Connection:
    """A financials table with just the columns the ratio fills touch."""
    assert set(_USED_COLUMNS) <= set(EXCEL_COLUMNS)  # guards column-name drift
    conn = sqlite3.connect(os.path.join(tmp_path, "t.db"))
    cols = ", ".join(f'"{c}" REAL' for c in _USED_COLUMNS if c != "Ticker")
    conn.execute(
        f'CREATE TABLE financials ("Ticker" TEXT, {cols}, '
        'PRIMARY KEY ("Ticker", "Calendar Year"))'
    )
    return conn


def _insert(conn: sqlite3.Connection, ticker: str, **values) -> None:
    cols = ["Ticker"] + list(values)
    placeholders = ", ".join("?" for _ in cols)
    quoted = ", ".join(f'"{c}"' for c in cols)
    conn.execute(
        f"INSERT INTO financials ({quoted}) VALUES ({placeholders})",
        [ticker] + list(values.values()),
    )
    conn.commit()


@pytest.fixture()
def seeded(tmp_path):
    conn = _make_db(tmp_path)
    # Row 1: complete inputs, all ratios NULL -> should be computed.
    _insert(
        conn, "GOOD", **{
            "Calendar Year": 2020, "Revenue": 1000.0, "Gross Profit": 400.0,
            "Operating Income": 200.0, "Net Income": 100.0, "EBITDA": 300.0,
            "Total Stockholders Equity": 500.0, "Total Current Assets": 800.0,
            "Total Current Liabilities": 400.0, "Total Debt": 250.0,
            "Total Assets": 1250.0, "Operating Cash Flow": 150.0,
            "Capital Expenditure": -50.0, "Weighted Average Shs Out Dil": 100.0,
            "Market Cap": 2000.0,
        },
    )
    # Row 2: a pre-existing ratio must be left untouched.
    _insert(
        conn, "KEEP", **{
            "Calendar Year": 2020, "Revenue": 1000.0, "Gross Profit": 400.0,
            "Gross Profit Ratio": 0.99,
        },
    )
    # Row 3: zero denominators -> ratios must stay NULL.
    _insert(
        conn, "ZERO", **{
            "Calendar Year": 2020, "Revenue": 0.0, "Gross Profit": 50.0,
            "Net Income": 10.0, "Market Cap": 0.0,
            "Total Stockholders Equity": 0.0,
        },
    )
    yield conn
    conn.close()


def _val(conn, ticker, col):
    return conn.execute(
        f'SELECT "{col}" FROM financials WHERE Ticker = ?', [ticker]
    ).fetchone()[0]


def test_derived_ratios_computed(seeded):
    p3.fill_ratios(seeded, verbose=False)
    expected = {
        "Gross Profit Ratio": 0.4, "Operating Income Ratio": 0.2,
        "Net Income Ratio": 0.1, "EBITDA Ratio": 0.3, "ROE": 0.2,
        "Current Ratio": 2.0, "Debt To Equity": 0.5, "Debt To Assets": 0.2,
        "Free Cash Flow": 100.0, "Free Cash Flow Per Share": 1.0,
        "Operating Cash Flow Per Share": 1.5, "Revenue Per Share": 10.0,
        "Book Value Per Share": 5.0, "PE Ratio": 20.0, "PB Ratio": 4.0,
        "Price To Sales Ratio": 2.0, "Earnings Yield": 0.05,
        "Free Cash Flow Yield": 0.05,
    }
    for col, want in expected.items():
        assert _val(seeded, "GOOD", col) == pytest.approx(want), col


def test_free_cash_flow_flows_into_dependents(seeded):
    # FCF is computed in the same run, then read by FCF-per-share / FCF-yield.
    p3.fill_ratios(seeded, verbose=False)
    assert _val(seeded, "GOOD", "Free Cash Flow") == pytest.approx(100.0)
    assert _val(seeded, "GOOD", "Free Cash Flow Per Share") == pytest.approx(1.0)
    assert _val(seeded, "GOOD", "Free Cash Flow Yield") == pytest.approx(0.05)


def test_existing_value_untouched(seeded):
    p3.fill_ratios(seeded, verbose=False)
    assert _val(seeded, "KEEP", "Gross Profit Ratio") == pytest.approx(0.99)


def test_zero_denominator_stays_null(seeded):
    p3.fill_ratios(seeded, verbose=False)
    assert _val(seeded, "ZERO", "Gross Profit Ratio") is None   # Revenue = 0
    assert _val(seeded, "ZERO", "Net Income Ratio") is None      # Revenue = 0
    assert _val(seeded, "ZERO", "Earnings Yield") is None        # Market Cap = 0
    assert _val(seeded, "ZERO", "ROE") is None                   # equity = 0


def test_counts_reported(seeded):
    counts = p3.fill_ratios(seeded, verbose=False)
    # Only the GOOD row is fully computable for these three.
    assert counts["Gross Profit Ratio"] == 1
    assert counts["ROE"] == 1
    assert counts["Free Cash Flow"] == 1
