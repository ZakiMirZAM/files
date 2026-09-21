"""The financial-sector guard on ``/api/industry/{industry}/structure``.

The frontend has always declared ``isFinancial`` and ``notApplicable`` on
this payload and never received either, so a bank industry printed a gross
margin and a cost-of-goods line that are 1.0 and 0.0 by construction. The
guard nulls the same families the connections blocks null, keeps every key,
and says why in plain words.
"""

from __future__ import annotations

import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import fixture_db
from connections.sector_cache import clear_sector_cache
from financial_guard import is_financial
from industry_structure.ranks import clear_cache
from industry_structure.structure import build_industry_structure


def _fixture(path: str, sector: str, industry: str) -> None:
    conn = sqlite3.connect(path)
    fixture_db.create_schema(conn)
    for i in range(12):
        tk = f"F{i}"
        fixture_db.add_ticker(conn, tk, f"Firm {i}", sector, industry)
        for yr in range(2015, 2025):
            fixture_db.insert_row(
                conn, tk, yr,
                rev=1000.0 + i * 100 + (yr - 2015) * 10,
                gpr=0.30 + i * 0.02,
            )
    conn.commit()
    conn.close()


@pytest.fixture
def bank_conn(tmp_path):
    path = str(tmp_path / "bank.db")
    _fixture(path, "Financial Services", "Banks - Diversified")
    c = sqlite3.connect(path)
    c.row_factory = sqlite3.Row
    clear_sector_cache()
    clear_cache()
    yield c
    c.close()
    clear_sector_cache()
    clear_cache()


@pytest.fixture
def chip_conn(tmp_path):
    path = str(tmp_path / "chip.db")
    _fixture(path, "Technology", "Semiconductors")
    c = sqlite3.connect(path)
    c.row_factory = sqlite3.Row
    clear_sector_cache()
    clear_cache()
    yield c
    c.close()
    clear_sector_cache()
    clear_cache()


class TestPredicate:

    def test_connections_and_structure_ask_the_same_question(self):
        assert is_financial(
            "Financial Services", "Banks - Diversified", include_real_estate=False,
        ) is True
        assert is_financial(
            "Technology", "Semiconductors", include_real_estate=False,
        ) is False

    def test_real_estate_is_the_one_difference(self):
        assert is_financial("Real Estate", "REIT - Industrial", include_real_estate=False) is False
        assert is_financial("Real Estate", "REIT - Industrial", include_real_estate=True) is True


class TestNonFinancialIndustry:

    def test_the_markers_are_present_and_empty(self, chip_conn):
        out = build_industry_structure(chip_conn, "Semiconductors")
        assert out["applicable"] is True
        assert out["isFinancial"] is False
        assert out["notApplicable"] == {}

    def test_the_gross_margin_figures_are_untouched(self, chip_conn):
        out = build_industry_structure(chip_conn, "Semiconductors")
        assert out["entryEvidence"]["grossMarginMedian"]["value"] is not None
        assert out["entryEvidence"]["grossMarginIqr"] is not None
        assert any(
            pt["value"] is not None
            for pt in out["evolution"]["grossMarginSpread"]
        )


class TestFinancialIndustry:

    def test_the_markers_say_financial_with_reasons(self, bank_conn):
        out = build_industry_structure(bank_conn, "Banks - Diversified")
        assert out["isFinancial"] is True
        assert set(out["notApplicable"]) == {
            "grossMarginMedian",
            "grossMarginIqr",
            "grossMarginSpread",
            "leaderCogsToRevenue5y",
        }
        for reason in out["notApplicable"].values():
            assert reason.endswith(".")
            assert "—" not in reason  # house style: no em dashes

    def test_the_gross_margin_tiles_are_nulled_with_their_keys_kept(self, bank_conn):
        out = build_industry_structure(bank_conn, "Banks - Diversified")
        gm = out["entryEvidence"]["grossMarginMedian"]
        assert set(gm) == {"value", "percentile"}
        assert gm == {"value": None, "percentile": None}
        assert out["entryEvidence"]["grossMarginIqr"] is None

    def test_the_leaders_cogs_table_keeps_its_shape(self, bank_conn):
        out = build_industry_structure(bank_conn, "Banks - Diversified")
        table = out["entryEvidence"]["leaderCogsToRevenue5y"]
        assert table, "the table itself must still be there"
        for leader in table:
            assert set(leader) == {"ticker", "name", "years"}
            assert leader["years"], "the years must survive"
            for point in leader["years"]:
                assert set(point) == {"year", "value"}
                assert point["value"] is None

    def test_the_evolution_spread_keeps_its_years(self, bank_conn):
        out = build_industry_structure(bank_conn, "Banks - Diversified")
        spread = out["evolution"]["grossMarginSpread"]
        assert spread
        for point in spread:
            assert point["year"] is not None
            assert point["value"] is None

    def test_nothing_else_is_nulled(self, bank_conn):
        out = build_industry_structure(bank_conn, "Banks - Diversified")
        assert out["concentration"]["hhi"]["value"] is not None
        assert out["entryEvidence"]["ppeToRevenue"]["value"] is not None
        assert out["exitEvidence"]["ppeToAssets"]["value"] is not None
        assert out["evolution"]["revenue"], "the revenue series is unaffected"
