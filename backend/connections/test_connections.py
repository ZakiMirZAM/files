"""Tests for the connections package.

Network-free, DB-free: builds tiny SQLite fixtures with only the columns
we read. Run:  cd backend && python -m pytest connections/ -q

Follows TDD: each test was written before the implementation.
"""

import json
import math
import os
import sqlite3
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "data"))

from industry_structure.peers import PeerSet, Peer, load_peers, pick_year
from connections.leverage import build_leverage_block
from connections.splits import build_growth_split, build_margin_split
from connections.bundle import build_connections


# ── SQLite fixture ──────────────────────────────────────────────────────────

import fixture_db


def _build_fixture(path: str) -> None:
    """Build a minimal financials.db for connection tests."""
    conn = sqlite3.connect(path)
    fixture_db.create_schema(conn, fx=False)

    conn.executemany("INSERT INTO fx_rates VALUES (?, ?, ?)", [
        ("USD", 1.0, "2024-01-01"),
    ])

    # 5 companies in "Chips" industry, "Tech" sector
    # A: big, profitable, interest expense
    # B: medium, profitable, interest expense
    # C: small, profitable, no interest
    # D: small, interest coverage < 2
    # N: no debt at all

    data = [
        # (ticker, name, sector, industry)
        ("A", "AlphaCorp", "Tech", "Chips"),
        ("B", "BetaCorp", "Tech", "Chips"),
        ("C", "GammaCorp", "Tech", "Chips"),
        ("D", "DeltaCorp", "Tech", "Chips"),
        ("N", "NullDebt", "Tech", "Chips"),
    ]
    for tk, name, sector, ind in data:
        conn.execute("INSERT INTO tickers VALUES (?, ?, ?, ?)", (tk, name, sector, ind))

    def _ins(tk, yr, rev, mc, op, gpr, ie, td, ebitda, ni, ta, eq, nd, dep, capex, rnd, sga, cogs, ocf):
        conn.execute(
            'INSERT INTO financials (Ticker, "Calendar Year", "Reported Currency", "Revenue", "Market Cap", "Operating Income", "Gross Profit", "Gross Profit Ratio", "Interest Expense", "Total Debt", "EBITDA", "Net Income", "Total Assets", "Total Stockholders Equity", "Net Debt", "Depreciation And Amortization", "Capital Expenditure", "Research And Development Expenses", "Selling General And Administrative Expenses", "Cost Of Revenue", "Operating Cash Flow", "Property Plant Equipment Net", "Intangible Assets", "Cash And Cash Equivalents", "Cash And Short Term Investments", "Days Payables Outstanding", "Days Sales Outstanding", "Free Cash Flow") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (tk, str(yr), "USD", rev, mc, op, rev * gpr, gpr, ie, td, ebitda, ni, ta, eq, nd, dep, capex, rnd, sga, cogs, ocf,
             None, None, None, None, None, None, None),
        )

    # FY2024
    _ins("A", 2024, 1000, 500, 150, 0.45, -15, 200, 180, 100, 2000, 800, 100, 30, -50, 100, 80, 550, 120)
    _ins("B", 2024, 600, 300, 90, 0.40, -10, 150, 110, 60, 1200, 500, 80, 20, -30, 50, 60, 360, 70)
    _ins("C", 2024, 300, 150, 45, 0.35, 0, 0, 55, 30, 600, 250, -20, 10, -15, 30, 40, 195, 35)
    _ins("D", 2024, 200, 100, 10, 0.30, -8, 100, 20, 5, 400, 100, 80, 8, -10, 10, 25, 140, 8)
    _ins("N", 2024, 100, 50, 20, 0.50, 0, 0, 25, 15, 200, 100, -30, 5, -5, 5, 10, 50, 20)

    # FY2019 (for growth split / episodes)
    _ins("A", 2019, 800, 400, 120, 0.44, -12, 180, 150, 80, 1800, 700, 90, 25, -40, 80, 70, 448, 100)
    _ins("B", 2019, 500, 250, 70, 0.38, -8, 120, 85, 40, 1000, 400, 60, 15, -25, 40, 50, 310, 55)
    _ins("C", 2019, 250, 120, 35, 0.34, 0, 0, 45, 25, 500, 200, -15, 8, -12, 25, 35, 165, 30)
    _ins("D", 2019, 150, 80, 8, 0.28, -6, 90, 15, 3, 350, 80, 70, 6, -8, 8, 20, 108, 5)
    _ins("N", 2019, 80, 40, 15, 0.48, 0, 0, 20, 10, 180, 90, -25, 4, -4, 4, 8, 42, 15)

    # FY2020 (for episodes)
    _ins("A", 2020, 850, 420, 130, 0.44, -13, 190, 160, 85, 1850, 720, 95, 27, -45, 85, 72, 476, 110)
    _ins("B", 2020, 480, 240, 65, 0.38, -9, 130, 80, 38, 1050, 420, 65, 16, -26, 42, 52, 298, 52)
    _ins("D", 2020, 130, 70, 5, 0.27, -7, 95, 10, 2, 370, 85, 75, 7, -9, 9, 22, 95, 4)

    # FY2021 and 2022 for gross margin tracking
    _ins("A", 2021, 900, 450, 140, 0.46, -14, 195, 170, 90, 1900, 750, 98, 28, -48, 90, 75, 486, 115)
    _ins("A", 2022, 950, 460, 145, 0.47, -14, 198, 175, 95, 1950, 770, 99, 29, -49, 95, 78, 504, 118)
    _ins("A", 2023, 980, 480, 148, 0.46, -15, 200, 178, 98, 1980, 790, 100, 30, -50, 98, 80, 529, 120)

    conn.commit()
    conn.close()


@pytest.fixture
def db_path(tmp_path):
    path = str(tmp_path / "test_conn.db")
    _build_fixture(path)
    return path


@pytest.fixture
def conn(db_path):
    c = sqlite3.connect(db_path)
    c.row_factory = sqlite3.Row
    yield c
    c.close()


# ── Leverage tests ──────────────────────────────────────────────────────────

def test_share_below_2_uses_firms_with_interest():
    """Share below 2 uses only firms with interest expense in denominator."""
    peers = [
        Peer("A", "A", 1000, 1000, "USD", 2024,
             ratios={"Operating Income": 150, "Interest Expense": -15, "Net Debt": 100, "EBITDA": 180}),
        Peer("B", "B", 600, 600, "USD", 2024,
             ratios={"Operating Income": 90, "Interest Expense": -10, "Net Debt": 80, "EBITDA": 110}),
        # C has NO interest expense
        Peer("C", "C", 300, 300, "USD", 2024,
             ratios={"Operating Income": 45, "Interest Expense": 0, "Net Debt": -20, "EBITDA": 55}),
        # D has IC < 2 (10/8 = 1.25)
        Peer("D", "D", 200, 200, "USD", 2024,
             ratios={"Operating Income": 10, "Interest Expense": -8, "Net Debt": 80, "EBITDA": 20}),
    ]
    ps = PeerSet(peers=peers, fiscal_year=2024, group_name="Test")
    result = build_leverage_block(ps)

    # Firms with interest: A (IC=10), B (IC=9), D (IC=1.25)
    # 3 firms with interest; 1 (D) below 2
    assert result["firmsWithInterest"] == 3
    assert abs(result["shareCoverageBelow2"] - 1 / 3) < 1e-4


def test_interest_sensitivity_null_when_oi_nonpositive():
    """Interest sensitivity is null when operating income <= 0."""
    from connections.exposures import _interest_per_point_pct
    ratios_neg = {"Total Debt": 100, "Operating Income": -50}
    ratios_zero = {"Total Debt": 100, "Operating Income": 0}
    ratios_ok = {"Total Debt": 100, "Operating Income": 50}
    assert _interest_per_point_pct(ratios_neg) is None
    assert _interest_per_point_pct(ratios_zero) is None
    assert _interest_per_point_pct(ratios_ok) is not None
    # 100 * 0.01 / 50 = 0.02
    assert abs(_interest_per_point_pct(ratios_ok) - 0.02) < 1e-6


# ── Growth split tests ──────────────────────────────────────────────────────

def test_growth_split_sums_exactly(conn):
    """Growth split sums exactly: company log growth == industry log growth
    + share log change within 1e-9."""
    now = load_peers(conn, "Chips", year=2024)
    then = load_peers(conn, "Chips", year=2019)
    assert now is not None and then is not None

    result = build_growth_split(conn, "A", "Chips", now, then)
    assert result is not None

    # Verify: companyCagr5y == industryCagr5y + sharePoints (in annual terms)
    company = result["companyCagr5y"]
    industry = result["industryCagr5y"]
    share = result["sharePoints"]
    assert abs(company - (industry + share)) < 1e-9


def test_growth_split_converts_to_points_per_year(conn):
    """Growth split values are in log points per year."""
    now = load_peers(conn, "Chips", year=2024)
    then = load_peers(conn, "Chips", year=2019)
    assert now is not None and then is not None
    result = build_growth_split(conn, "A", "Chips", now, then)
    assert result is not None
    # Over 5 years, values should be reasonable (not 5x too large)
    assert abs(result["companyCagr5y"]) < 1.0  # log growth per year should be small


# ── Margin split tests ──────────────────────────────────────────────────────

def test_margin_split_sums_exactly(conn):
    """Margin split parts sum exactly to company margin."""
    now = load_peers(conn, "Chips", year=2024)
    assert now is not None

    result = build_margin_split("A", now, "Tech")
    assert result is not None

    # industryPart + groupPart + companyPart == company margin
    total = result["industryPart"] + result["groupPart"] + result["companyPart"]
    assert abs(total - result["company"]) < 1e-9


# ── Episodes tests ──────────────────────────────────────────────────────────

def test_episodes_null_for_missing_year(conn):
    """Episodes return null for a company missing a year."""
    from connections.episodes import _revenue_change_2020, _gross_margins
    # N has no FY2020 data
    rc = _revenue_change_2020(conn, "N")
    assert rc is None

    gm = _gross_margins(conn, "N", years=(2020,))
    assert gm["2020"] is None


def test_episodes_company_with_data(conn):
    """Episodes return values for a company with FY2019 and FY2020."""
    from connections.episodes import _revenue_change_2020
    rc = _revenue_change_2020(conn, "A")
    assert rc is not None
    # A: rev 2019=800, 2020=850 -> change = 50/800 = 0.0625
    assert abs(rc - 0.0625) < 1e-4


# ── Bundle tests ────────────────────────────────────────────────────────────

def test_bundle_all_blocks_for_ticker(conn, db_path, monkeypatch):
    """Bundle returns all blocks for a fixture ticker."""
    # Patch the market data DB path to avoid reading the real one
    monkeypatch.setenv("MARKET_DATA_DB", str(db_path))  # no macro_series table -> nulls

    result = build_connections(conn, ticker="A")

    assert "economy" in result
    assert "credit" in result
    assert "sector" in result
    assert "industry" in result
    assert "company" in result
    assert "exposures" in result

    # Company block should have the ticker
    assert result["company"]["ticker"] == "A"
    assert result["company"]["sector"] == "Tech"
    assert result["company"]["industry"] == "Chips"

    # Industry block
    assert result["industry"]["name"] == "Chips"
    assert result["industry"]["firmCount"] is not None

    # Sector block
    assert result["sector"]["name"] == "Tech"


def test_bundle_nulls_for_no_debt_company(conn, db_path, monkeypatch):
    """Bundle returns nulls (not exceptions) for a company with no debt."""
    monkeypatch.setenv("MARKET_DATA_DB", str(db_path))

    result = build_connections(conn, ticker="N")

    # Should not raise
    assert result["company"] is not None
    # N has 0 total debt and 0 interest expense
    assert result["company"]["totalDebt"] == 0
    # interestPerPoint should be 0
    assert result["company"]["interestPerPoint"] == 0.0
    # interestCoverage should be None (no interest expense)
    assert result["company"]["interestCoverage"] is None


def test_bundle_400_equiv_no_params(conn, db_path, monkeypatch):
    """build_connections with no params returns mostly null blocks."""
    monkeypatch.setenv("MARKET_DATA_DB", str(db_path))
    result = build_connections(conn)
    # economy and credit always have data (or null entries)
    assert result["economy"] is not None
    assert result["credit"] is not None
    # No sector/industry/company/exposures
    assert result["sector"] is None
    assert result["industry"] is None
    assert result["company"] is None
    assert result["exposures"] is None


# ── Panel-based episode tests ──────────────────────────────────────────────

# The fixture is deterministic: these are the figures the live paths return.
INDUSTRY_GROSS_MARGIN = {"2020": 0.38, "2021": 0.46, "2022": 0.47, "2023": 0.46}
COMPANY_A_GROSS_MARGIN = {"2020": 0.44, "2021": 0.46, "2022": 0.47, "2023": 0.46}


def test_panel_episodes_are_the_expected_figures(conn):
    """The episode figures as literals, off the live paths.

    This used to compare the panel path against a SQL twin inside
    ``if both is not None``. Both sides were non-null here, but the guard
    meant a twin that returned nothing would still have passed, and the
    twin was the only caller of four SQL helpers. The twin is gone; the
    live paths are pinned here instead.
    """
    from connections.episodes import (
        build_episodes,
        company_episodes_from_panel,
        episodes_from_panel,
        per_ticker_episodes_from_panel,
    )
    from industry_structure.panel import load_industry_panel

    panel = load_industry_panel(conn, "Chips")
    assert panel is not None

    assert episodes_from_panel(panel) == {
        "revenueChange2020": -0.04, "grossMargin": INDUSTRY_GROSS_MARGIN,
    }
    assert company_episodes_from_panel(panel, "A") == {
        "revenueChange2020": 0.0625, "grossMargin": COMPANY_A_GROSS_MARGIN,
    }
    assert per_ticker_episodes_from_panel(panel, ["A", "B"]) == (
        {"A": 0.0625, "B": -0.04},
        {"A": 0.44, "B": 0.38},
        {"A": 0.47, "B": None},
    )
    # The one SQL episode path left: a single company. It agrees with the
    # panel path, which is the property the vacuous test was reaching for.
    assert build_episodes(conn, ticker="A") == {
        "company": {
            "revenueChange2020": 0.0625, "grossMargin": COMPANY_A_GROSS_MARGIN,
        },
    }


def test_sector_pool_is_cached_by_sector(conn):
    """One build per sector, and the second call hands back that object."""
    from connections.sector_cache import clear_sector_cache, get_sector_pool

    clear_sector_cache()
    pool = get_sector_pool(conn, "Tech")
    assert pool is not None
    assert pool["fiscalYear"] == 2024
    assert pool["fiscalYear5yAgo"] == 2019
    assert pool["now"]["firmCount"] == 5
    assert get_sector_pool(conn, "Tech") is pool


def test_sector_cache_episodes(conn):
    """The batched sector episodes, as literals."""
    from connections.sector_cache import clear_sector_cache, get_sector_episodes

    clear_sector_cache()
    assert get_sector_episodes(conn, "Tech") == {
        "revenueChange2020": -0.04, "grossMargin": INDUSTRY_GROSS_MARGIN,
    }


def test_bundle_industry_only(conn, db_path, monkeypatch):
    """Bundle with industry only returns industry and sector blocks."""
    monkeypatch.setenv("MARKET_DATA_DB", str(db_path))
    result = build_connections(conn, industry="Chips")
    assert result["industry"] is not None
    assert result["industry"]["name"] == "Chips"
    assert result["sector"] is not None
    assert result["sector"]["name"] == "Tech"
    assert result["company"] is None


def test_preload_sector_populates_cache(conn):
    """preload_sector fills the sector pool and the sector episodes.

    It never filled a "peer" cache: that one had no production caller and
    is gone. The assertion names what the call really populates.
    """
    from connections.sector_cache import (
        cache_sizes,
        clear_sector_cache,
        preload_sector,
    )

    clear_sector_cache()
    assert cache_sizes() == {"panels": 0, "episodes": 0, "pools": 0}

    preload_sector(conn, "Tech")

    assert cache_sizes() == {"panels": 0, "episodes": 1, "pools": 1}


def test_industry_panel_cache(conn):
    """Industry panel cache returns the same panel on second call."""
    from connections.sector_cache import get_industry_panel, clear_sector_cache

    clear_sector_cache()
    panel1 = get_industry_panel(conn, "Chips")
    panel2 = get_industry_panel(conn, "Chips")
    assert panel1 is panel2  # same object from cache
