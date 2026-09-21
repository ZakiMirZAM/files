"""Shared fixtures for industry_structure tests.

Network-free, DB-free: builds tiny SQLite fixtures with only the columns
we read.
"""

import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import fixture_db
from industry_structure.ranks import clear_cache


# ── Fixture builder ────────────────────────────────────────────────────────────

def build_fixture(path: str, *, multi_industry: bool = False) -> None:
    """Build a minimal financials.db with enough columns for testing."""
    conn = sqlite3.connect(path)
    fixture_db.create_schema(conn)

    alpha_companies = [
        ("A1", "Alpha One",   "Tech", "Alpha", "USD", "2024", 300, 60,  150, 0.50, -10, 100, 80,  40, 900, 500, 200, 50,  20, -25, 30, 40, 150, 70, 100, 50,  60, 80,  45, 30, 45),
        ("A2", "Alpha Two",   "Tech", "Alpha", "USD", "2024", 300, 45,  120, 0.40, -5,  80,  65,  30, 800, 400, 180, 30,  15, -20, 50, 30, 180, 50, 80,  40,  50, 70,  40, 35, 30),
        ("A3", "Alpha Three", "Tech", "Alpha", "USD", "2024", 200, 20,  80,  0.40, -8,  60,  30,  10, 500, 300, 120, 40,  10, -15, 20, 20, 120, 30, 60,  30,  40, 50,  50, 40, 15),
        ("A4", "Alpha Four",  "Tech", "Alpha", "USD", "2024", 200, 10,  60,  0.30, -3,  50,  20,  5,  400, 250, 100, 35,  8,  -10, 10, 15, 140, 20, 50,  20,  30, 40,  55, 45, 10),
    ]
    alpha_5y_ago = [
        ("A1", "Alpha One",   "Tech", "Alpha", "USD", "2019", 200, 40, 100, 0.50, -8,  80, 55, 25, 600, 400, 150, 40, 15, -18, 25, 35, 100, 50, 80, 40, 50, 65, 42, 28, 32),
        ("A2", "Alpha Two",   "Tech", "Alpha", "USD", "2019", 250, 38, 100, 0.40, -4,  70, 50, 22, 700, 350, 160, 25, 12, -16, 45, 28, 150, 45, 70, 35, 45, 60, 38, 33, 29),
        ("A3", "Alpha Three", "Tech", "Alpha", "USD", "2019", 180, 18, 72,  0.40, -6,  50, 25, 8,  400, 270, 100, 35, 8,  -12, 18, 18, 108, 25, 50, 25, 35, 45, 48, 38, 13),
        ("A4", "Alpha Four",  "Tech", "Alpha", "USD", "2019", 170, 9,  51,  0.30, -2,  40, 15, 3,  350, 220, 90,  30, 6,  -8,  8,  12, 119, 18, 45, 18, 28, 36, 52, 42, 10),
    ]

    for data in alpha_companies + alpha_5y_ago:
        tk, name, sector, ind, ccy, yr, rev, op, gp, gpr, ie, td, ebitda, ni, mc, ta, eq, nd, da, capex, rd, sga, cogs, ocf, ppe, intang, cash, cashst, dayspay, dayssales, fcf = data
        try:
            conn.execute(
                "INSERT INTO tickers VALUES (?, ?, ?, ?)",
                (tk, name, sector, ind),
            )
        except sqlite3.IntegrityError:
            pass
        conn.execute(
            'INSERT INTO financials (Ticker, "Calendar Year", "Reported Currency", "Revenue", "Operating Income", "Gross Profit", "Gross Profit Ratio", "Interest Expense", "Total Debt", "EBITDA", "Net Income", "Market Cap", "Total Assets", "Total Stockholders Equity", "Net Debt", "Depreciation And Amortization", "Capital Expenditure", "Research And Development Expenses", "Selling General And Administrative Expenses", "Cost Of Revenue", "Operating Cash Flow", "Property Plant Equipment Net", "Intangible Assets", "Cash And Cash Equivalents", "Cash And Short Term Investments", "Days Payables Outstanding", "Days Sales Outstanding", "Free Cash Flow") VALUES '
            '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (tk, yr, ccy, rev, op, gp, gpr, ie, td, ebitda, ni, mc, ta, eq,
             nd, da, capex, rd, sga, cogs, ocf, ppe, intang, cash, cashst,
             dayspay, dayssales, fcf),
        )

    if multi_industry:
        _add_multi_industry_data(conn)

    conn.commit()
    conn.close()


def _add_multi_industry_data(conn: sqlite3.Connection) -> None:
    """Add 12 industries + Beta/Gamma for cross-industry and profit pool tests."""
    for ind_idx in range(12):
        ind_name = f"Industry{ind_idx}"
        for firm_idx in range(12):
            tk = f"I{ind_idx}F{firm_idx}"
            rev = 100 + ind_idx * 10 + firm_idx * 5
            op = rev * (0.05 + ind_idx * 0.01)
            gpr = 0.30 + ind_idx * 0.02
            da = rev * 0.03
            capex = -(rev * 0.04)
            rd = rev * (0.01 + ind_idx * 0.005)
            sga = rev * 0.15
            cogs = rev * (1 - gpr)
            ppe = rev * 0.2
            try:
                conn.execute(
                    "INSERT INTO tickers VALUES (?, ?, ?, ?)",
                    (tk, f"Firm {tk}", "Tech", ind_name),
                )
            except sqlite3.IntegrityError:
                pass
            conn.execute(
                'INSERT INTO financials (Ticker, "Calendar Year", "Reported Currency", "Revenue", "Operating Income", "Gross Profit", "Gross Profit Ratio", "Interest Expense", "Total Debt", "EBITDA", "Net Income", "Market Cap", "Total Assets", "Total Stockholders Equity", "Net Debt", "Depreciation And Amortization", "Capital Expenditure", "Research And Development Expenses", "Selling General And Administrative Expenses", "Cost Of Revenue", "Operating Cash Flow", "Property Plant Equipment Net", "Intangible Assets", "Cash And Cash Equivalents", "Cash And Short Term Investments", "Days Payables Outstanding", "Days Sales Outstanding", "Free Cash Flow") VALUES '
                '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                (tk, "2024", "USD", rev, op, rev * gpr, gpr, -5, 50,
                 op + da, op * 0.7, rev * 3, rev * 2, rev, 30, da, capex,
                 rd, sga, cogs, op * 0.8, ppe, rev * 0.05, rev * 0.1,
                 rev * 0.15, 40 + ind_idx, 30 + ind_idx, op * 0.5),
            )

    beta_companies = [
        ("B1", "Beta One",   "Health", "Beta",  "USD", "2024", 500, 100, 250, 0.50, -15, 200, 130, 60, 1500, 800, 400, 100, 30, -40, 60, 50, 250, 100, 200, 80, 100, 130, 35, 25, 60),
        ("B2", "Beta Two",   "Health", "Beta",  "USD", "2024", 300, -30,  90, 0.30, -10, 150,  -5, -40, 800, 500, 200, 80,  20, -25, 40, 35, 210, 60,  120, 50,  80, 100, 40, 30, -55),
    ]
    beta_5y = [
        ("B1", "Beta One",   "Health", "Beta",  "USD", "2019", 400,  80, 200, 0.50, -12, 180, 110, 50, 1200, 700, 350, 90,  25, -35, 50, 45, 200, 80, 180, 70,  90, 120, 32, 22, 45),
        ("B2", "Beta Two",   "Health", "Beta",  "USD", "2019", 250, -20,  75, 0.30, -8,  130, -5, -30, 600, 400, 170, 70,  18, -20, 35, 30, 175, 50, 100, 40,  65,  85, 37, 27, -38),
    ]
    gamma_companies = [
        ("G1", "Gamma One", "Health", "Gamma", "USD", "2024", 400, 80, 200, 0.50, -10, 100, 100, 50, 1200, 600, 300, 60, 25, -30, 50, 40, 200, 80, 150, 60, 80, 100, 38, 28, 50),
    ]
    gamma_5y = [
        ("G1", "Gamma One", "Health", "Gamma", "USD", "2019", 350, 70, 175, 0.50, -8,  90,  90, 45, 1000, 550, 280, 50, 22, -28, 45, 38, 175, 70, 130, 55, 70,  90, 35, 25, 42),
    ]
    for data in beta_companies + beta_5y + gamma_companies + gamma_5y:
        tk, name, sector, ind, ccy, yr, rev, op, gp, gpr, ie, td, ebitda, ni, mc, ta, eq, nd, da, capex, rd, sga, cogs, ocf, ppe, intang, cash, cashst, dayspay, dayssales, fcf = data
        try:
            conn.execute(
                "INSERT INTO tickers VALUES (?, ?, ?, ?)",
                (tk, name, sector, ind),
            )
        except sqlite3.IntegrityError:
            pass
        conn.execute(
            'INSERT INTO financials (Ticker, "Calendar Year", "Reported Currency", "Revenue", "Operating Income", "Gross Profit", "Gross Profit Ratio", "Interest Expense", "Total Debt", "EBITDA", "Net Income", "Market Cap", "Total Assets", "Total Stockholders Equity", "Net Debt", "Depreciation And Amortization", "Capital Expenditure", "Research And Development Expenses", "Selling General And Administrative Expenses", "Cost Of Revenue", "Operating Cash Flow", "Property Plant Equipment Net", "Intangible Assets", "Cash And Cash Equivalents", "Cash And Short Term Investments", "Days Payables Outstanding", "Days Sales Outstanding", "Free Cash Flow") VALUES '
            '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (tk, yr, ccy, rev, op, gp, gpr, ie, td, ebitda, ni, mc, ta, eq,
             nd, da, capex, rd, sga, cogs, ocf, ppe, intang, cash, cashst,
             dayspay, dayssales, fcf),
        )


# ── Pytest fixtures ────────────────────────────────────────────────────────────

@pytest.fixture
def db_path(tmp_path):
    path = str(tmp_path / "test_fin.db")
    build_fixture(path)
    return path


@pytest.fixture
def db_multi(tmp_path):
    path = str(tmp_path / "test_multi.db")
    build_fixture(path, multi_industry=True)
    return path


@pytest.fixture
def conn(db_path):
    c = sqlite3.connect(db_path)
    c.row_factory = sqlite3.Row
    clear_cache()
    yield c
    c.close()


@pytest.fixture
def conn_multi(db_multi):
    c = sqlite3.connect(db_multi)
    c.row_factory = sqlite3.Row
    clear_cache()
    yield c
    c.close()
