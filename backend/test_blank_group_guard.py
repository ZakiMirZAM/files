"""A blank sector or industry is not a group.

``tickers.sector`` holds ``''`` (an empty string, not NULL) for eleven junk
rows, so every ``WHERE sector IS NOT NULL`` query treated "" as a twelfth GICS
sector. It got its own matrix column, its own value score, and it inflated every
"rank N of M" on the sector page to twelve.

These tests pin the guard on the by-year aggregates (the query behind the group
pages' peer ranks) and assert the guard is present in the other group queries
that share the pattern.

Run:  cd backend && python -m pytest test_blank_group_guard.py -q
"""

from __future__ import annotations

import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "data"))


def _warehouse(tmp_path):
    """A temporary warehouse with one real sector, one blank and one whitespace."""
    import financial_db

    db = financial_db.FinancialDB(str(tmp_path / "f.db"))
    conn = sqlite3.connect(db.db_path)
    conn.execute("CREATE TABLE IF NOT EXISTS security_map "
                 "(symbol TEXT PRIMARY KEY, cik TEXT, is_primary INTEGER)")
    conn.executemany(
        "INSERT INTO tickers (ticker, name, sector, industry) VALUES (?, ?, ?, ?)",
        [("REAL", "Real Co", "Technology", "Software"),
         ("BLANK", "Junk Warrant", "", ""),
         ("SPACE", "Junk Unit", "   ", "   ")])
    conn.executemany(
        'INSERT INTO financials (Ticker, "Calendar Year", "Reported Currency", '
        '"Market Cap", "Revenue", "Net Income", "Total Stockholders Equity") '
        "VALUES (?, ?, 'USD', ?, ?, ?, ?)",
        [(t, 2025, 1.0e9, 5.0e8, 5.0e7, 3.0e8) for t in ("REAL", "BLANK", "SPACE")])
    conn.executemany(
        "INSERT OR REPLACE INTO fx_rates(currency, usd_per_unit, asof) "
        "VALUES (?, ?, '2026-01-01')", [("USD", 1.0)])
    conn.commit()
    conn.close()
    return db


def test_blank_sector_is_not_a_group_in_the_by_year_aggregates(tmp_path):
    import industry_averages

    db = _warehouse(tmp_path)
    by_year = industry_averages.compute_sector_averages_by_year(
        db, metrics=["Revenue"])
    groups = {g for year in by_year.values() for g in year}

    assert "Technology" in groups
    assert "" not in groups
    assert "   " not in groups
    assert groups == {"Technology"}, (
        "a blank sector became a twelfth peer on every sector page")


def test_blank_industry_is_not_a_group_either(tmp_path):
    import industry_averages

    db = _warehouse(tmp_path)
    by_year = industry_averages.compute_industry_averages_by_year(
        db, metrics=["Revenue"])
    groups = {g for year in by_year.values() for g in year}
    assert groups == {"Software"}


def test_the_guard_is_one_fragment_with_both_halves():
    from group_sql import named_group_sql

    assert named_group_sql("t.industry") == (
        "t.industry IS NOT NULL AND TRIM(t.industry) <> ''"
    )
    assert named_group_sql("sector") == "sector IS NOT NULL AND TRIM(sector) <> ''"


# Every module that filters on a group column, and how its SQL spells it. The
# check below is stronger than looking for a TRIM beside each NULL test: a
# hand-written guard fails here even when it is correct today, because the next
# one written beside it is the one that will be missing its TRIM half.
_GROUP_QUERY_MODULES = (
    "api",
    "industry_averages",
    "comparitivestockanalysis",
    "connections.bundle",
    "industry_structure.groups",
    "industry_structure.structure",
    "industry_structure.helpers",
)


def test_no_group_query_spells_the_guard_by_hand():
    """The pattern is easy to reintroduce, so assert on the SQL itself: only
    ``group_sql.named_group_sql`` may emit it."""
    import importlib
    import inspect
    import re

    hand_written = re.compile(r"IS NOT NULL\s*\"?\s*\n?\s*\"?\s*AND TRIM\(|IS NOT NULL AND TRIM\(")
    offenders = []
    for name in _GROUP_QUERY_MODULES:
        mod = importlib.import_module(name)
        src = inspect.getsource(mod)
        if name == "industry_structure.helpers":
            continue  # it IS the shared sector lookup, and it calls the helper
        for line in src.splitlines():
            if hand_written.search(line):
                offenders.append(f"{name}: {line.strip()}")
    assert not offenders, (
        "these spell the blank-group guard themselves instead of calling "
        f"group_sql.named_group_sql: {offenders}"
    )


def test_every_group_query_goes_through_the_helper():
    """The flip side: each of those modules actually calls it, so the check
    above cannot pass merely because a module stopped filtering at all."""
    import importlib
    import inspect

    for name in ("api", "industry_averages", "comparitivestockanalysis",
                 "industry_structure.helpers"):
        src = inspect.getsource(importlib.import_module(name))
        assert "named_group_sql(" in src, name


def test_one_sector_lookup_serves_the_three_that_asked_it():
    """The structure builder, the group map and the connections bundle each had
    their own copy of ``SELECT sector FROM tickers WHERE industry = ?``."""
    import importlib
    import inspect

    for name in ("connections.bundle", "industry_structure.groups",
                 "industry_structure.structure"):
        src = inspect.getsource(importlib.import_module(name))
        assert "sector_of(conn" in src, name
        assert "SELECT sector FROM tickers" not in src, name
