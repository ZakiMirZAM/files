"""Phase 1 characterization tests: ingest validation guards.

The 2026-05-26 Wisesheets ingest wrote ~13k rows whose Calendar Year /
Period columns hold error strings ('Unavailable', '2025 data not
available yet.'). These tests pin the guard that keeps such rows out.

Run:  cd backend && python -m pytest test_ingest_validation.py -q
"""

import os
import sys
import sqlite3

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "data"))

from financial_db import FinancialDB, is_valid_year_period  # noqa: E402


# ── The pure validator ────────────────────────────────────────────────────────

@pytest.mark.parametrize("year", ["2024", 2024, "1990", "2035", "2012"])
def test_validator_accepts_real_years(year):
    assert is_valid_year_period(year) is True


@pytest.mark.parametrize("year", [
    "Unavailable",
    "2025 data not available yet.",
    "2012 data not available yet.",
    None, "", "nan", "20244", "24", 0, 1850, 2100,
])
def test_validator_rejects_junk_years(year):
    assert is_valid_year_period(year) is False


@pytest.mark.parametrize("period", ["FY", "Q1", "Q2", "Q3", "Q4", "TTM", None])
def test_validator_accepts_known_periods(period):
    assert is_valid_year_period("2024", period) is True


@pytest.mark.parametrize("period", [
    "Unavailable", "2025 data not available yet.", "annual", "H1",
])
def test_validator_rejects_junk_periods(period):
    assert is_valid_year_period("2024", period) is False


# ── CSV ingest applies the guard ─────────────────────────────────────────────

CSV_CONTENT = """2024,,,
Ticker,Calendar Year,Period,Revenue
GOODCO,2024,FY,1000000
BADCO,Unavailable,Unavailable,
LATECO,2025 data not available yet.,2025 data not available yet.,
Q_CO,2024,Q9,5
"""


def test_ingest_csv_skips_invalid_rows(tmp_path):
    db_path = tmp_path / "t.db"
    csv_path = tmp_path / "y2024.csv"
    csv_path.write_text(CSV_CONTENT, encoding="utf-8")

    db = FinancialDB(str(db_path))
    inserted = db.ingest_csv(str(csv_path), verbose=False)

    con = sqlite3.connect(str(db_path))
    rows = con.execute(
        'SELECT Ticker, "Calendar Year", Period FROM financials').fetchall()
    con.close()

    assert inserted == 1
    assert rows == [("GOODCO", 2024, "FY")]


def test_ingest_csv_valid_rows_still_upsert(tmp_path):
    db_path = tmp_path / "t.db"
    csv_path = tmp_path / "y2024.csv"
    csv_path.write_text(CSV_CONTENT, encoding="utf-8")

    db = FinancialDB(str(db_path))
    db.ingest_csv(str(csv_path), verbose=False)
    # Re-ingest: upsert on (Ticker, Calendar Year), still exactly one row
    db.ingest_csv(str(csv_path), verbose=False)

    con = sqlite3.connect(str(db_path))
    n = con.execute("SELECT COUNT(*) FROM financials").fetchone()[0]
    con.close()
    assert n == 1
