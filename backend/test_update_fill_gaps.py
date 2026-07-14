"""Phase 3 characterization tests: update_ticker gap-fill mode.

The additive-only contract stays the default (existing rows are never
touched). fill_gaps=True additionally completes NULL columns on existing
rows from yfinance data, and must NEVER overwrite a non-NULL value.

Run:  cd backend && python -m pytest test_update_fill_gaps.py -q
"""

import os
import sys
import sqlite3

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "data"))

from financial_db import FinancialDB  # noqa: E402


def _seed_sparse_row(db_path: str) -> None:
    con = sqlite3.connect(db_path)
    con.execute(
        'INSERT INTO financials (Ticker, "Calendar Year", Period, '
        '"Net Income") VALUES (?, ?, ?, ?)',
        ("TST", 2024, "FY", 5.0))
    con.execute("INSERT INTO tickers (ticker) VALUES ('TST')")
    con.commit()
    con.close()


def _row(db_path: str, year: int):
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    r = con.execute(
        'SELECT * FROM financials WHERE Ticker=? AND "Calendar Year"=?',
        ("TST", year)).fetchone()
    con.close()
    return r


YF_2024 = {
    "Ticker": "TST", "Calendar Year": 2024, "Period": "FY",
    "Date": "2024-12-31", "Revenue": 100.0, "Net Income": 999.0,
}
YF_2025 = {
    "Ticker": "TST", "Calendar Year": 2025, "Period": "FY",
    "Date": "2025-12-31", "Revenue": 120.0, "Net Income": 12.0,
}


def test_default_mode_never_touches_existing_rows(tmp_path, monkeypatch):
    db_path = str(tmp_path / "t.db")
    db = FinancialDB(db_path)
    _seed_sparse_row(db_path)
    monkeypatch.setattr(db, "_fetch_yf_annual", lambda t: [dict(YF_2024)])

    added = db.update_ticker("TST", verbose=False)

    assert added == 0
    row = _row(db_path, 2024)
    assert row["Revenue"] is None          # gap NOT filled by default
    assert row["Net Income"] == 5.0        # existing value untouched


def test_fill_gaps_fills_nulls_but_never_overwrites(tmp_path, monkeypatch):
    db_path = str(tmp_path / "t.db")
    db = FinancialDB(db_path)
    _seed_sparse_row(db_path)
    monkeypatch.setattr(db, "_fetch_yf_annual", lambda t: [dict(YF_2024)])

    added = db.update_ticker("TST", verbose=False, fill_gaps=True)

    assert added == 0                      # still no NEW year
    row = _row(db_path, 2024)
    assert row["Revenue"] == 100.0         # NULL filled
    assert row["Net Income"] == 5.0        # non-NULL preserved (not 999.0)
    assert row["Date"] == "2024-12-31"     # NULL metadata filled too


def test_fill_gaps_still_inserts_new_years(tmp_path, monkeypatch):
    db_path = str(tmp_path / "t.db")
    db = FinancialDB(db_path)
    _seed_sparse_row(db_path)
    monkeypatch.setattr(
        db, "_fetch_yf_annual",
        lambda t: [dict(YF_2024), dict(YF_2025)])

    added = db.update_ticker("TST", verbose=False, fill_gaps=True)

    assert added == 1                      # 2025 is genuinely new
    assert _row(db_path, 2025)["Revenue"] == 120.0
    assert _row(db_path, 2024)["Revenue"] == 100.0
