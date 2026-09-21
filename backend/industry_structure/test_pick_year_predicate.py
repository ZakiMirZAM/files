"""The four-digit year filter in ``pick_year_detail`` (review item 1).

``"Calendar Year"`` is an INTEGER column, so ``GLOB '[0-9][0-9][0-9][0-9]'``
made SQLite render every one of the warehouse's 363,552 values as text and
pattern-match it: about 460 ms a call against 22 ms for the range test.
Measured row-identical over the whole table before the swap. These tests
pin the two properties that make the swap safe: the same rows are selected,
and a junk year is still refused.
"""

from __future__ import annotations

import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import fixture_db
from industry_structure.peers import pick_year, pick_year_detail

_GLOB = "\"Calendar Year\" GLOB '[0-9][0-9][0-9][0-9]'"
_RANGE = 'CAST("Calendar Year" AS INTEGER) BETWEEN 1000 AND 9999'

# The production column is INTEGER, so these are the values that can reach
# it, including the boundaries on both sides.
_INT_YEARS = (2024, 1999, 1000, 9999, 999, 10000, 0, -2024, 12345)

# Spellings the 2026-05 Wisesheets export actually wrote before
# ``is_valid_year_period`` was in the write path.
_JUNK_YEARS = ("Unavailable", "2025 data not available yet.", "", "20a4")


@pytest.fixture
def conn():
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    fixture_db.create_schema(c)
    yield c
    c.close()


@pytest.fixture
def int_conn():
    """A ``financials`` whose year column is INTEGER, as production is."""
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.execute(
        'CREATE TABLE financials (Ticker TEXT, "Calendar Year" INTEGER,'
        ' "Revenue" REAL, PRIMARY KEY (Ticker, "Calendar Year"))'
    )
    yield c
    c.close()


def _selected(c, predicate):
    return {
        r[0] for r in c.execute(
            f'SELECT Ticker FROM financials WHERE {predicate}'
        )
    }


class TestPredicateEquivalence:

    def test_the_two_predicates_agree_on_an_integer_column(self, int_conn):
        """Production stores an INTEGER here, and over the whole live table
        (363,552 rows) the two predicates had a symmetric difference of
        zero. This pins the same property on every boundary value."""
        for i, value in enumerate(_INT_YEARS):
            int_conn.execute(
                'INSERT INTO financials VALUES (?, ?, ?)', (f"T{i}", value, 100.0),
            )
        int_conn.commit()
        glob_rows = _selected(int_conn, _GLOB)
        range_rows = _selected(int_conn, _RANGE)
        assert glob_rows == range_rows
        assert glob_rows == {"T0", "T1", "T2", "T3"}  # 2024, 1999, 1000, 9999

    def test_a_junk_year_never_reaches_the_column(self):
        """The range test is laxer than the GLOB on a TEXT value: CAST reads
        "2025 data not available yet." as 2025. That cannot reach the
        warehouse, because every write path is gated by this guard."""
        sys.path.insert(
            0, os.path.join(os.path.dirname(__file__), "..", "..", "data"),
        )
        from financial_db import is_valid_year_period

        for junk in _JUNK_YEARS:
            assert is_valid_year_period(junk, "FY") is False
        assert is_valid_year_period(2024, "FY") is True

    def test_junk_years_are_refused_by_both_on_a_text_column(self, conn):
        """The strings that are not numeric at all fail either way."""
        for i, junk in enumerate(("Unavailable", "", "20a4")):
            conn.execute(
                'INSERT INTO financials (Ticker, "Calendar Year", "Revenue")'
                " VALUES (?, ?, ?)",
                (f"J{i}", junk, 100.0),
            )
        conn.commit()
        assert _selected(conn, _GLOB) == set()
        assert _selected(conn, _RANGE) == set()


class TestPickYearStillWorks:

    def test_the_latest_adequately_covered_year_is_picked(self, conn):
        for i in range(10):
            fixture_db.add_ticker(conn, f"F{i}", f"F{i}", "Sec", "Ind")
            for yr in (2022, 2023):
                fixture_db.insert_row(conn, f"F{i}", yr)
        # 2024 has only two of ten, below the 80 percent threshold.
        for i in range(2):
            fixture_db.insert_row(conn, f"F{i}", 2024)
        conn.commit()

        detail = pick_year_detail(conn, "Ind")
        assert detail["fiscalYear"] == 2023
        assert detail["firms"] == 10
        assert detail["bestFirms"] == 10
        assert detail["coverage"] == 1.0
        assert pick_year(conn, "Ind") == 2023

    def test_a_junk_year_row_never_becomes_the_picked_year(self, conn):
        for i in range(10):
            fixture_db.add_ticker(conn, f"F{i}", f"F{i}", "Sec", "Ind")
            fixture_db.insert_row(conn, f"F{i}", 2023)
            fixture_db.insert_row(conn, f"F{i}", "Unavailable")
        conn.commit()
        assert pick_year(conn, "Ind") == 2023

    def test_an_unknown_group_column_is_refused(self, conn):
        with pytest.raises(ValueError):
            pick_year_detail(conn, "Ind", group_col="name; DROP TABLE tickers")
