"""One in-memory ``financials.db`` schema for the backend test fixtures.

Five test modules used to carry their own copy of this schema
(``industry_structure/conftest.py``, ``industry_structure/test_industry_structure.py``,
``connections/test_connections.py``, ``connections/test_review_fixes.py``,
``company_profile/test_company_profile.py``) and they had already drifted:
some still created columns ``peers._RATIO_COLS`` had dropped, and only one
of them gave ``security_map`` the ``cik`` column the de-duplication reads.

``create_schema`` builds the four tables every peer query touches, and
``insert_row`` writes one ``financials`` row from keyword overrides on a
plausible default company, so a test states only the figures it cares
about.
"""

from __future__ import annotations

import sqlite3
from typing import Any

COLUMNS: tuple[str, ...] = (
    "Ticker", "Calendar Year", "Reported Currency", "Revenue", "Market Cap",
    "Operating Income", "Gross Profit", "Gross Profit Ratio",
    "Interest Expense", "Total Debt", "EBITDA", "Net Income", "Total Assets",
    "Total Stockholders Equity", "Net Debt", "Depreciation And Amortization",
    "Capital Expenditure", "Research And Development Expenses",
    "Selling General And Administrative Expenses", "Cost Of Revenue",
    "Operating Cash Flow", "Property Plant Equipment Net",
    "Intangible Assets", "Cash And Cash Equivalents",
    "Cash And Short Term Investments", "Days Payables Outstanding",
    "Days Sales Outstanding", "Free Cash Flow", "Dividends Paid",
)

# "Calendar Year" is INTEGER in the warehouse, and it is the second half of
# the primary key, so the bare four-digit range test in pick_year_detail is
# answered from the covering index. A fixture that declared it TEXT would
# not exercise the real plan, and the bare range would select nothing.
_TEXT_COLUMNS = ("Ticker", "Reported Currency")
_INT_COLUMNS = ("Calendar Year",)


def create_schema(conn: sqlite3.Connection, *, fx: bool = True) -> None:
    """Create financials, tickers, fx_rates and security_map.

    ``security_map`` carries ``cik``, ``status`` and ``valid_to``, so the
    de-duplication rule and the delisted-year lookup both have real columns
    to read rather than degrading to their absent-table fallbacks.
    """
    def _decl(c: str) -> str:
        if c in _TEXT_COLUMNS:
            return "TEXT"
        return "INTEGER" if c in _INT_COLUMNS else "REAL"

    cols = ", ".join(f'"{c}" {_decl(c)}' for c in COLUMNS)
    conn.execute(
        f'CREATE TABLE financials ({cols}, PRIMARY KEY (Ticker, "Calendar Year"))'
    )
    conn.execute(
        "CREATE TABLE tickers (ticker TEXT PRIMARY KEY, name TEXT,"
        " sector TEXT, industry TEXT)"
    )
    conn.execute(
        "CREATE TABLE fx_rates (currency TEXT PRIMARY KEY,"
        " usd_per_unit REAL NOT NULL, asof TEXT NOT NULL)"
    )
    conn.execute(
        "CREATE TABLE security_map (symbol TEXT PRIMARY KEY, cik TEXT,"
        " symbol_yf TEXT, is_primary INTEGER, status TEXT, valid_to TEXT)"
    )
    if fx:
        conn.executemany(
            "INSERT INTO fx_rates VALUES (?, ?, ?)",
            [("USD", 1.0, "2024-01-01"), ("EUR", 1.1, "2024-01-01")],
        )


def add_ticker(
    conn: sqlite3.Connection,
    ticker: str,
    name: str,
    sector: str,
    industry: str,
) -> None:
    """Insert into ``tickers``, ignoring a repeat of the same symbol."""
    try:
        conn.execute(
            "INSERT INTO tickers VALUES (?, ?, ?, ?)",
            (ticker, name, sector, industry),
        )
    except sqlite3.IntegrityError:
        pass


def default_row(ticker: str, year: Any, **over: Any) -> dict[str, Any]:
    """One plausible company-year, with keyword overrides applied.

    Short aliases exist for the figures tests set most often: ``rev``,
    ``mc``, ``op``, ``gpr``, ``ie``, ``debt``, ``ni``, ``rd``, ``cogs``,
    ``ccy``. Any full column name may also be passed.
    """
    rev = over.pop("rev", 1000.0)
    row: dict[str, Any] = {
        "Ticker": ticker,
        "Calendar Year": year,
        "Reported Currency": over.pop("ccy", "USD"),
        "Revenue": rev,
        "Market Cap": over.pop("mc", rev * 2),
        "Operating Income": over.pop("op", rev * 0.12),
        "Gross Profit": rev * 0.4,
        "Gross Profit Ratio": over.pop("gpr", 0.4),
        "Interest Expense": over.pop("ie", -rev * 0.01),
        "Total Debt": over.pop("debt", rev * 0.3),
        "EBITDA": rev * 0.18,
        "Net Income": over.pop("ni", rev * 0.08),
        "Total Assets": rev * 2.0,
        "Total Stockholders Equity": rev * 0.9,
        "Net Debt": rev * 0.2,
        "Depreciation And Amortization": rev * 0.05,
        "Capital Expenditure": -rev * 0.06,
        "Research And Development Expenses": over.pop("rd", rev * 0.08),
        "Selling General And Administrative Expenses": rev * 0.1,
        "Cost Of Revenue": over.pop("cogs", rev * 0.6),
        "Operating Cash Flow": rev * 0.15,
        "Property Plant Equipment Net": rev * 0.25,
        "Intangible Assets": rev * 0.05,
        "Cash And Cash Equivalents": rev * 0.1,
        "Cash And Short Term Investments": rev * 0.12,
        "Days Payables Outstanding": 40.0,
        "Days Sales Outstanding": 35.0,
        "Free Cash Flow": rev * 0.09,
        "Dividends Paid": None,
    }
    row.update(over)
    return row


def insert_row(conn: sqlite3.Connection, ticker: str, year: Any, **over: Any) -> None:
    """Write one ``financials`` row built by ``default_row``."""
    row = default_row(ticker, year, **over)
    conn.execute(
        f'INSERT INTO financials VALUES ({",".join("?" for _ in COLUMNS)})',
        [row[c] for c in COLUMNS],
    )
