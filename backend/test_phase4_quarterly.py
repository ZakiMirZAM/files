"""Network-free tests for the Phase 4 QUARTERLY + TTM patch.

Covers:
  - _init_db creates financials_quarterly (same cols, PK incl. Period).
  - save_quarters inserts one row per fiscal quarter with correct Periods,
    and the PK prevents duplicate quarters (second run inserts 0).
  - save_ttm upserts a TTM snapshot and RESTATES it on a second call.
  - derive_q4 computes FY-(Q1+Q2+Q3) for flows and copies balance columns.
  - ttm_lib.choose_latest pure logic: annual fallback + TTM substitution +
    shadow/off leave the annual row unchanged.

All yfinance access is monkeypatched with synthetic pandas frames; no network.
"""

import os
import sys
import sqlite3
import pandas as pd
import pytest

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_HERE, "..", "data"))
sys.path.insert(0, os.path.join(_HERE, "..", "remediation"))

from financial_db import FinancialDB  # noqa: E402
import ttm_lib  # noqa: E402


# ── fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture()
def db(tmp_path):
    """A fresh FinancialDB on a temp file (real schema, no data)."""
    return FinancialDB(str(tmp_path / "t.db"))


def _q_ts(y, m, d):
    return pd.Timestamp(year=y, month=m, day=d)


def _synthetic_quarterly():
    """Four quarters in calendar 2023 (Q1 earliest end date → Q4 latest).
    Columns are period-end timestamps, newest-first as yfinance returns them.
    Revenue on income, Total Assets on balance, Operating Cash Flow on cash."""
    cols = [_q_ts(2023, 12, 31), _q_ts(2023, 9, 30),
            _q_ts(2023, 6, 30), _q_ts(2023, 3, 31)]
    inc = pd.DataFrame({c: [v] for c, v in zip(cols, [400.0, 300.0, 250.0, 200.0])},
                       index=["Total Revenue"])
    bal = pd.DataFrame({c: [v] for c, v in zip(cols, [5000.0, 4800.0, 4500.0, 4000.0])},
                       index=["Total Assets"])
    cf = pd.DataFrame({c: [v] for c, v in zip(cols, [90.0, 80.0, 70.0, 60.0])},
                      index=["Operating Cash Flow"])
    return {"inc": inc, "bal": bal, "cf": cf, "info": {}}


# ── schema ───────────────────────────────────────────────────────────────────

def test_init_creates_quarterly_table(db):
    with db._connect() as conn:
        names = {r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'")}
        assert "financials_quarterly" in names
        cols = {r[1] for r in conn.execute(
            "PRAGMA table_info(financials_quarterly)")}
        assert {"Ticker", "Calendar Year", "Period", "Revenue"} <= cols
        pk = {r[1] for r in conn.execute(
            "PRAGMA table_info(financials_quarterly)") if r[5] > 0}
        assert pk == {"Ticker", "Calendar Year", "Period"}


# ── save_quarters ────────────────────────────────────────────────────────────

def test_save_quarters_inserts_four_rows_with_periods(db, monkeypatch):
    monkeypatch.setattr(db, "_fetch_yf_quarterly",
                        lambda t: _synthetic_quarterly())

    n = db.save_quarters("AAPL", verbose=False)
    assert n == 4

    with db._connect() as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            'SELECT Period, "Calendar Year", Revenue, "Total Assets", '
            '"Operating Cash Flow", Date FROM financials_quarterly '
            "WHERE Ticker='AAPL' ORDER BY Date"
        ).fetchall()
    assert [r["Period"] for r in rows] == ["Q1", "Q2", "Q3", "Q4"]
    assert all(int(r["Calendar Year"]) == 2023 for r in rows)
    # Q1 is the earliest quarter end (2023-03-31) → revenue 200.
    assert rows[0]["Revenue"] == 200.0
    assert rows[3]["Revenue"] == 400.0
    assert rows[0]["Total Assets"] == 4000.0
    assert rows[0]["Operating Cash Flow"] == 60.0


def test_save_quarters_pk_prevents_duplicates(db, monkeypatch):
    monkeypatch.setattr(db, "_fetch_yf_quarterly",
                        lambda t: _synthetic_quarterly())
    assert db.save_quarters("AAPL", verbose=False) == 4
    # Second run: identical quarters, INSERT OR IGNORE → nothing new.
    assert db.save_quarters("AAPL", verbose=False) == 0
    with db._connect() as conn:
        (count,) = conn.execute(
            "SELECT COUNT(*) FROM financials_quarterly WHERE Ticker='AAPL'"
        ).fetchone()
    assert count == 4


# ── save_ttm ─────────────────────────────────────────────────────────────────

def test_save_ttm_upserts_and_restates(db, monkeypatch):
    monkeypatch.setattr(db, "get_ttm", lambda t: {
        "Ticker": t.upper(), "Period": "TTM", "Date": "2024-05-01",
        "Revenue": 1200.0, "Total Assets": 6000.0,
    })
    assert db.save_ttm("AAPL", verbose=False) is True

    with db._connect() as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM financials_quarterly "
            "WHERE Ticker='AAPL' AND Period='TTM'").fetchone()
    assert int(row["Calendar Year"]) == 2024
    assert row["Revenue"] == 1200.0

    # Rolling snapshot: a second call with new figures RESTATES the same row.
    monkeypatch.setattr(db, "get_ttm", lambda t: {
        "Ticker": t.upper(), "Period": "TTM", "Date": "2024-05-01",
        "Revenue": 1500.0, "Total Assets": 6100.0,
    })
    assert db.save_ttm("AAPL", verbose=False) is True
    with db._connect() as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM financials_quarterly "
            "WHERE Ticker='AAPL' AND Period='TTM'").fetchall()
    assert len(rows) == 1
    assert rows[0]["Revenue"] == 1500.0
    assert rows[0]["Total Assets"] == 6100.0


def test_save_ttm_false_when_no_data(db, monkeypatch):
    monkeypatch.setattr(db, "get_ttm", lambda t: {})
    assert db.save_ttm("AAPL", verbose=False) is False


# ── derive_q4 ────────────────────────────────────────────────────────────────

def _insert_fy(db, ticker, year, revenue, total_assets,
               date=None):
    # derive_q4 only runs for December fiscal year-ends (calendar-aligned
    # quarters); default the FY Date accordingly.
    fy_date = date or f"{year}-12-31"
    with db._connect() as conn:
        conn.execute(
            'INSERT INTO financials (Ticker, "Calendar Year", Period, '
            'Revenue, "Total Assets", Date) VALUES (?,?,?,?,?,?)',
            (ticker, year, "FY", revenue, total_assets, fy_date))
        conn.commit()


def _insert_quarter(db, ticker, year, period, revenue, total_assets):
    with db._connect() as conn:
        conn.execute(
            'INSERT INTO financials_quarterly (Ticker, "Calendar Year", '
            'Period, Revenue, "Total Assets") VALUES (?,?,?,?,?)',
            (ticker, year, period, revenue, total_assets))
        conn.commit()


def test_derive_q4_computes_flow_and_copies_balance(db):
    _insert_fy(db, "MSFT", 2022, revenue=1000.0, total_assets=5000.0)
    _insert_quarter(db, "MSFT", 2022, "Q1", 200.0, 4000.0)
    _insert_quarter(db, "MSFT", 2022, "Q2", 250.0, 4500.0)
    _insert_quarter(db, "MSFT", 2022, "Q3", 300.0, 4800.0)

    created = db.derive_q4("MSFT", verbose=False)
    assert created == 1

    with db._connect() as conn:
        conn.row_factory = sqlite3.Row
        q4 = conn.execute(
            "SELECT * FROM financials_quarterly "
            "WHERE Ticker='MSFT' AND Period='Q4'").fetchone()
    # Flow: FY − (Q1+Q2+Q3) = 1000 − 750 = 250.
    assert q4["Revenue"] == 250.0
    # Balance: copied from the FY row, NOT differenced.
    assert q4["Total Assets"] == 5000.0

    # Idempotent: Q4 now exists, so a second call derives nothing.
    assert db.derive_q4("MSFT", verbose=False) == 0


def test_derive_q4_skips_non_december_fiscal_year(db):
    # AAPL-style September FYE: quarters are calendar-labeled, the FY row is
    # fiscal-labeled, so FY-(Q1+Q2+Q3) would mix periods. Must be skipped.
    _insert_fy(db, "AAPL2", 2022, revenue=1000.0, total_assets=5000.0,
               date="2022-09-24")
    _insert_quarter(db, "AAPL2", 2022, "Q1", 200.0, 4000.0)
    _insert_quarter(db, "AAPL2", 2022, "Q2", 250.0, 4500.0)
    _insert_quarter(db, "AAPL2", 2022, "Q3", 300.0, 4800.0)
    assert db.derive_q4("AAPL2", verbose=False) == 0


def test_derive_q4_skips_incomplete_quarters(db):
    _insert_fy(db, "NVDA", 2022, revenue=1000.0, total_assets=5000.0)
    _insert_quarter(db, "NVDA", 2022, "Q1", 200.0, 4000.0)
    _insert_quarter(db, "NVDA", 2022, "Q2", 250.0, 4500.0)
    # No Q3 → cannot derive Q4.
    assert db.derive_q4("NVDA", verbose=False) == 0


# ── ttm_lib pure logic ───────────────────────────────────────────────────────

_ALL_COLS = ["Ticker", "Calendar Year", "Period", "Reported Currency",
             "Revenue", "Net Income", "Total Assets"]
_METRIC_COLS = ttm_lib.metric_columns(_ALL_COLS)


def _annual():
    return {"Ticker": "AAPL", "Calendar Year": 2023, "Period": "FY",
            "Reported Currency": "USD", "Revenue": 1000.0,
            "Net Income": 100.0, "Total Assets": 5000.0,
            "yr": 2023, "sec": "Technology", "beta": 1.2}


def test_metric_columns_excludes_identity():
    assert "Revenue" in _METRIC_COLS
    assert "Calendar Year" not in _METRIC_COLS
    assert "Reported Currency" not in _METRIC_COLS


def test_choose_latest_annual_fallback_when_no_ttm():
    annual = _annual()
    out = ttm_lib.choose_latest(annual, None, "on", _METRIC_COLS)
    assert out == annual
    assert out is not annual  # a copy, never the same object


def test_choose_latest_on_substitutes_metrics_only():
    annual = _annual()
    ttm = {"Revenue": 1300.0, "Net Income": None, "Total Assets": 5200.0,
           "Reported Currency": "EUR", "Calendar Year": 2024}
    out = ttm_lib.choose_latest(annual, ttm, "on", _METRIC_COLS)
    # Metric present & non-null → substituted.
    assert out["Revenue"] == 1300.0
    assert out["Total Assets"] == 5200.0
    # Null TTM metric → keep the annual figure.
    assert out["Net Income"] == 100.0
    # Identity/label columns are NEVER overlaid.
    assert out["Reported Currency"] == "USD"
    assert out["Calendar Year"] == 2023
    # Alias columns the API adds survive untouched.
    assert out["yr"] == 2023 and out["sec"] == "Technology" and out["beta"] == 1.2


@pytest.mark.parametrize("mode", ["off", "shadow", "OFF", "Shadow", "bogus"])
def test_choose_latest_non_on_modes_leave_annual_unchanged(mode):
    annual = _annual()
    ttm = {"Revenue": 9999.0}
    out = ttm_lib.choose_latest(annual, ttm, mode, _METRIC_COLS)
    assert out == annual  # valuations never move outside 'on'


def test_ttm_shadow_fields_shapes_side_by_side_view():
    ttm = {"Revenue": 1300.0, "Net Income": None, "Total Assets": 5200.0}
    fields = ttm_lib.ttm_shadow_fields(ttm, _METRIC_COLS)
    assert fields == {"ttm_Revenue": 1300.0, "ttm_Total Assets": 5200.0}
    assert ttm_lib.ttm_shadow_fields(None, _METRIC_COLS) == {}
