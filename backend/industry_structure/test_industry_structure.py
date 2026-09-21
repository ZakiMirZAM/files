"""Tests for the industry_structure package.

Network-free, DB-free: builds tiny SQLite fixtures with only the columns
we read. Run:  cd backend && python -m pytest industry_structure/ -q

Follows TDD: each test was written before the implementation.
"""

import os
import sqlite3
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "data"))

import fixture_db
from industry_structure.peers import PeerSet, Peer, load_peers, pick_year
from industry_structure.dimensions import (
    AXIS_REGISTRY,
    default_axes,
    median_split_groups,
)


# ── SQLite fixture ──────────────────────────────────────────────────────────

def _build_fixture(path: str) -> None:
    """Build a minimal financials.db with enough columns for peer loading."""
    conn = sqlite3.connect(path)
    fixture_db.create_schema(conn, fx=False)

    # Insert FX rates
    conn.executemany("INSERT INTO fx_rates VALUES (?, ?, ?)", [
        ("USD", 1.0, "2024-01-01"),
        ("EUR", 1.1, "2024-01-01"),
        ("JPY", 0.007, "2024-01-01"),
    ])

    # Industry "Chips" with 4 companies: shares 30, 30, 20, 20
    # Revenue in USD: 300, 300, 200, 200 (total 1000)
    companies = [
        ("A", "Company A", "Tech", "Chips", "USD", "2024", 300, 100, 50, 0.50, -10, 100, 120, 20, 500, 200, 50, -20, 30, 40, 150, 80),
        ("B", "Company B", "Tech", "Chips", "USD", "2024", 300, 90, 40, 0.47, -5, 80, 110, 15, 400, 180, 30, -15, 50, 30, 160, 70),
        ("C", "Company C", "Tech", "Chips", "USD", "2024", 200, 80, 30, 0.40, -8, 60, 90, 10, 300, 120, 40, -10, 20, 20, 120, 50),
        ("D", "Company D", "Tech", "Chips", "USD", "2024", 200, 70, 20, 0.35, -3, 50, 80, 8, 250, 100, 35, -8, 10, 15, 100, 40),
        # Company with NULL Reported Currency -- should be DROPPED
        ("E", "Company E", "Tech", "Chips", None, "2024", 500, 200, 100, 0.50, -20, 200, 250, 30, 800, 300, 100, -30, 60, 50, 200, 100),
        # Company with zero revenue -- should be EXCLUDED
        ("F", "Company F", "Tech", "Chips", "USD", "2024", 0, 0, 0, 0, 0, 0, 0, 0, 100, 50, 10, 0, 0, 0, 10, 0),
        # Company with negative revenue -- should be EXCLUDED
        ("G", "Company G", "Tech", "Chips", "USD", "2024", -100, -50, -20, 0, 0, -30, -20, -5, 100, 50, 10, 0, 0, 0, 10, 0),
    ]
    for tk, name, sector, ind, ccy, yr, rev, mc, op, gpr, ie, td, ebitda, ni, ta, eq, nd, capex, rnd, sga, cogs, ocf in companies:
        conn.execute("INSERT INTO tickers VALUES (?, ?, ?, ?)", (tk, name, sector, ind))
        conn.execute(
            'INSERT INTO financials (Ticker, "Calendar Year", "Reported Currency", "Revenue", "Market Cap", "Operating Income", "Gross Profit", "Gross Profit Ratio", "Interest Expense", "Total Debt", "EBITDA", "Net Income", "Total Assets", "Total Stockholders Equity", "Net Debt", "Capital Expenditure", "Depreciation And Amortization", "Research And Development Expenses", "Selling General And Administrative Expenses", "Cost Of Revenue", "Operating Cash Flow", "Property Plant Equipment Net", "Intangible Assets", "Cash And Cash Equivalents", "Cash And Short Term Investments", "Days Payables Outstanding", "Days Sales Outstanding", "Free Cash Flow") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (tk, yr, ccy, rev, mc, op, rev * gpr if ccy else None, gpr, ie, td, ebitda, ni, ta, eq, nd, capex, abs(capex) if capex else None, rnd, sga, cogs, ocf,
             None, None, None, None, None, None, None),  # new columns: PPE, intang, cash, cashST, daysPay, daysSales, FCF
        )

    # Also add a preferred share that should be excluded
    conn.execute("INSERT INTO tickers VALUES ('A-PA', 'Company A Pref', 'Tech', 'Chips')")
    conn.execute(
        'INSERT INTO financials (Ticker, "Calendar Year", "Reported Currency", "Revenue", "Market Cap", "Operating Income", "Gross Profit", "Gross Profit Ratio", "Interest Expense", "Total Debt", "EBITDA", "Net Income", "Total Assets", "Total Stockholders Equity", "Net Debt", "Capital Expenditure", "Depreciation And Amortization", "Research And Development Expenses", "Selling General And Administrative Expenses", "Cost Of Revenue", "Operating Cash Flow", "Property Plant Equipment Net", "Intangible Assets", "Cash And Cash Equivalents", "Cash And Short Term Investments", "Days Payables Outstanding", "Days Sales Outstanding", "Free Cash Flow") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ('A-PA', '2024', 'USD', 300, 100, 50, 150, 0.50, -10, 100, 120, 20, 500, 200, 50, 20, 20, 30, 40, 150, 80,
         None, None, None, None, None, None, None),
    )

    # Company in 2019 for pick_year 80% test: only 2 of 4 have data
    conn.execute(
        'INSERT INTO financials (Ticker, "Calendar Year", "Reported Currency", "Revenue", "Market Cap", "Operating Income", "Gross Profit", "Gross Profit Ratio", "Interest Expense", "Total Debt", "EBITDA", "Net Income", "Total Assets", "Total Stockholders Equity", "Net Debt", "Capital Expenditure", "Depreciation And Amortization", "Research And Development Expenses", "Selling General And Administrative Expenses", "Cost Of Revenue", "Operating Cash Flow", "Property Plant Equipment Net", "Intangible Assets", "Cash And Cash Equivalents", "Cash And Short Term Investments", "Days Payables Outstanding", "Days Sales Outstanding", "Free Cash Flow") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ('A', '2019', 'USD', 200, 80, 40, 100, 0.50, -8, 80, 100, 15, 400, 150, 40, 15, 15, 25, 35, 100, 60,
         None, None, None, None, None, None, None),
    )
    conn.execute(
        'INSERT INTO financials (Ticker, "Calendar Year", "Reported Currency", "Revenue", "Market Cap", "Operating Income", "Gross Profit", "Gross Profit Ratio", "Interest Expense", "Total Debt", "EBITDA", "Net Income", "Total Assets", "Total Stockholders Equity", "Net Debt", "Capital Expenditure", "Depreciation And Amortization", "Research And Development Expenses", "Selling General And Administrative Expenses", "Cost Of Revenue", "Operating Cash Flow", "Property Plant Equipment Net", "Intangible Assets", "Cash And Cash Equivalents", "Cash And Short Term Investments", "Days Payables Outstanding", "Days Sales Outstanding", "Free Cash Flow") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ('B', '2019', 'USD', 180, 70, 35, 85, 0.47, -4, 70, 90, 12, 350, 130, 25, 12, 12, 40, 25, 95, 55,
         None, None, None, None, None, None, None),
    )

    conn.commit()
    conn.close()


@pytest.fixture
def db_path(tmp_path):
    path = str(tmp_path / "test_fin.db")
    _build_fixture(path)
    return path


@pytest.fixture
def conn(db_path):
    c = sqlite3.connect(db_path)
    c.row_factory = sqlite3.Row
    yield c
    c.close()


# ── PeerSet tests ───────────────────────────────────────────────────────────

def test_hhi_four_shares():
    """Shares 30, 30, 20, 20 give HHI 2600 (Rule A item 3)."""
    peers = [
        Peer("A", "A", 300, 300, "USD", 2024),
        Peer("B", "B", 300, 300, "USD", 2024),
        Peer("C", "C", 200, 200, "USD", 2024),
        Peer("D", "D", 200, 200, "USD", 2024),
    ]
    ps = PeerSet(peers=peers, fiscal_year=2024, group_name="Test")
    assert ps.hhi() == 2600.0
    assert ps.cr4() == 1.0


def test_null_currency_dropped(conn):
    """A row with NULL Reported Currency is dropped (HARD RULE)."""
    ps = load_peers(conn, "Chips")
    assert ps is not None
    tickers = {p.ticker for p in ps.peers}
    # E has NULL currency, should be dropped
    assert "E" not in tickers
    # A, B, C, D should be present (F and G excluded for zero/negative revenue)
    assert {"A", "B", "C", "D"} == tickers


def test_zero_negative_revenue_excluded(conn):
    """Zero and negative revenue rows are excluded (HARD RULE)."""
    ps = load_peers(conn, "Chips")
    assert ps is not None
    tickers = {p.ticker for p in ps.peers}
    assert "F" not in tickers
    assert "G" not in tickers


def test_preferred_shares_excluded(conn):
    """Preferred shares (*-P[A-Z]) are excluded."""
    ps = load_peers(conn, "Chips")
    assert ps is not None
    tickers = {p.ticker for p in ps.peers}
    assert "A-PA" not in tickers


def test_pick_year_80pct_rule(conn):
    """pick_year applies the 80% rule."""
    # 2024 has 4 companies (A, B, C, D), 2019 has 2 (A, B)
    # Best year in lookback is 2024 with 4; 80% = 3.2
    # 2024 has 4 >= 3.2, so should pick 2024
    yr = pick_year(conn, "Chips", lookback=6)
    assert yr == 2024

    # If we only look at years with 2 or fewer, 80% of 2 = 1.6
    # Year 2019 has 2 >= 1.6, so should work
    # But pick_year looks at last N years sorted desc, and 2024 qualifies first


def test_cr4_hhi_from_db(conn):
    """CR4 and HHI from loaded peers match expected values."""
    ps = load_peers(conn, "Chips")
    assert ps is not None
    # A=300, B=300, C=200, D=200, total=1000
    assert abs(ps.cr4() - 1.0) < 1e-6
    assert abs(ps.hhi() - 2600.0) < 1e-6


# ── Dimensions tests ────────────────────────────────────────────────────────

def test_default_axes():
    """default_axes returns correct sector defaults."""
    assert default_axes("Technology") == ("techLeadership", "verticalIntegration")
    assert default_axes("Consumer Cyclical") == ("brandService", "costPosition")
    assert default_axes("Industrials") == ("capitalIntensity", "costPosition")
    assert default_axes("Financial Services") == ("brandService", "capitalIntensity")


def test_median_split_no_empty_label():
    """median_split_groups never yields an empty label."""
    peers = [
        {"ticker": "A", "ratios": {"Research And Development Expenses": 30, "Revenue": 300,
                                     "Depreciation And Amortization": 20}},
        {"ticker": "B", "ratios": {"Research And Development Expenses": 50, "Revenue": 300,
                                     "Depreciation And Amortization": 15}},
        {"ticker": "C", "ratios": {"Research And Development Expenses": 20, "Revenue": 200,
                                     "Depreciation And Amortization": 40}},
        {"ticker": "D", "ratios": {"Research And Development Expenses": 10, "Revenue": 200,
                                     "Depreciation And Amortization": 35}},
    ]
    groups = median_split_groups(peers, "techLeadership", "capitalIntensity")
    for tk, label in groups.items():
        if label is not None:
            assert len(label) > 0, f"Empty label for {tk}"


def test_missing_axis_no_group():
    """Firms missing an axis value get no group."""
    peers = [
        {"ticker": "A", "ratios": {"Research And Development Expenses": 30, "Revenue": 300,
                                     "Depreciation And Amortization": 20}},
        {"ticker": "B", "ratios": {"Research And Development Expenses": None, "Revenue": 300,
                                     "Depreciation And Amortization": 15}},
        {"ticker": "C", "ratios": {"Research And Development Expenses": 20, "Revenue": 200,
                                     "Depreciation And Amortization": 40}},
        {"ticker": "D", "ratios": {"Research And Development Expenses": 10, "Revenue": 200,
                                     "Depreciation And Amortization": 35}},
    ]
    groups = median_split_groups(peers, "techLeadership", "capitalIntensity")
    # B has None R&D -> should get no group
    assert groups["B"] is None
    # Others should have groups
    for tk in ["A", "C", "D"]:
        assert groups[tk] is not None
