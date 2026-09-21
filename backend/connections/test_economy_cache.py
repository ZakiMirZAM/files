"""The macro blocks are built once per ten minutes, off one connection.

``build_economy_block`` and ``build_credit_block`` take no arguments and
read six daily FRED series, yet they ran twelve queries on two connections
for every per-ticker connections request.
"""

from __future__ import annotations

import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import side_caches
from connections import economy


@pytest.fixture
def macro_db(tmp_path, monkeypatch):
    path = str(tmp_path / "market_data.db")
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE macro_series (series_id TEXT, date TEXT, value REAL)")
    rows = []
    for series in ("DGS10", "DGS1", "T10YIE", "BAMLH0A0HYM2", "BAMLC0A0CM", "BAA10Y"):
        rows.append((series, "2099-01-02", 4.0))
        rows.append((series, "2098-01-02", 3.0))
    conn.executemany("INSERT INTO macro_series VALUES (?, ?, ?)", rows)
    conn.commit()
    conn.close()
    monkeypatch.setenv("MARKET_DATA_DB", path)
    economy.clear_economy_cache()
    yield path
    economy.clear_economy_cache()


def test_both_blocks_come_from_one_build(macro_db, monkeypatch):
    builds = []
    real = economy._build_macro_blocks

    def counting():
        builds.append(1)
        return real()

    monkeypatch.setattr(economy, "_build_macro_blocks", counting)
    economy.clear_economy_cache()

    first_econ = economy.build_economy_block()
    first_credit = economy.build_credit_block()
    second_econ = economy.build_economy_block()

    assert len(builds) == 1, "one build serves the economy AND the credit block"
    assert first_econ is second_econ
    assert first_econ["tenYearYield"]["value"] == 4.0
    assert first_credit["baaSpread"]["value"] == 4.0


def test_clearing_forces_a_rebuild(macro_db, monkeypatch):
    builds = []
    real = economy._build_macro_blocks
    monkeypatch.setattr(
        economy, "_build_macro_blocks", lambda: (builds.append(1), real())[1],
    )
    economy.clear_economy_cache()

    economy.build_economy_block()
    economy.clear_economy_cache()
    economy.build_economy_block()
    assert len(builds) == 2


def test_the_cache_is_registered_for_the_econ_invalidation():
    side_caches.load_cache_modules()
    assert "connections.economy" in side_caches.registered_names()
    assert side_caches.clear_side_caches("econ") == ["connections.economy"]


def test_a_missing_database_still_answers_with_reasons(tmp_path, monkeypatch):
    monkeypatch.setenv("MARKET_DATA_DB", str(tmp_path / "nope.db"))
    economy.clear_economy_cache()
    econ = economy.build_economy_block()
    credit = economy.build_credit_block()
    assert econ["tenYearYield"]["value"] is None
    assert "not present" in econ["tenYearYield"]["reason"]
    assert credit["highYieldSpread"]["value"] is None
    assert set(credit) == {"highYieldSpread", "investmentGradeSpread", "baaSpread"}
    economy.clear_economy_cache()
