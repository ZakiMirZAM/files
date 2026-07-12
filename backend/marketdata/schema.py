"""
marketdata/schema.py  (trimmed from valuation_debug/data_sources/schema.py)

Single source of truth for the SQLite tables that hold the market-level data
this package serves. Pure DDL — imports nothing from the rest of the app.

Only the three tables the IntrinsicEd app needs are kept; the sector/industry
Damodaran and sector-beta tables from valuation_debug are intentionally dropped.

Tables
------
macro_series
    Long, generic time series store (FRED, GPR, EPU). One row per
    (series_id, date). ``source`` records provenance.
shiller_sp500
    Robert Shiller's monthly S&P 500 dataset (price, dividend, earnings, CPI,
    long rate, real series, and CAPE / PE10).
market_inputs
    Computed, dated macro inputs for valuation: the live risk-free rate and the
    *implied* equity risk premium (plus the index fundamentals they derive from).

Every statement is ``CREATE TABLE/INDEX IF NOT EXISTS`` — idempotent, so calling
:func:`ensure_external_schema` repeatedly is safe and acts as the migration.
"""

from __future__ import annotations

import sqlite3

# Explicit list so callers/tests can assert the migration ran.
EXTERNAL_TABLES: tuple[str, ...] = (
    "macro_series",
    "shiller_sp500",
    "market_inputs",
)


_DDL: tuple[str, ...] = (
    # ── Generic macro time series (FRED / GPR / EPU) ──────────────────────────
    """
    CREATE TABLE IF NOT EXISTS macro_series (
        series_id  TEXT NOT NULL,
        date       TEXT NOT NULL,          -- ISO YYYY-MM-DD
        value      REAL NOT NULL,
        source     TEXT,                   -- 'FRED' | 'GPR' | 'EPU' | 'computed'
        label      TEXT,
        unit       TEXT,
        fetched_at TEXT,
        PRIMARY KEY (series_id, date)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_macro_series_id ON macro_series(series_id)",

    # ── Shiller monthly S&P 500 dataset ───────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS shiller_sp500 (
        date          TEXT PRIMARY KEY,    -- ISO YYYY-MM-01
        sp500         REAL,                -- nominal index level
        dividend      REAL,                -- annualised nominal dividend
        earnings      REAL,                -- annualised nominal earnings
        cpi           REAL,
        long_rate     REAL,                -- 10y rate, percent
        real_price    REAL,
        real_dividend REAL,
        real_earnings REAL,
        cape          REAL,                -- PE10 (cyclically adjusted P/E)
        fetched_at    TEXT
    )
    """,

    # ── Computed valuation macro inputs (rf + implied ERP), dated ──────────────
    """
    CREATE TABLE IF NOT EXISTS market_inputs (
        asof                TEXT PRIMARY KEY,   -- ISO date of the inputs
        risk_free_rate      REAL,
        equity_risk_premium REAL,
        erp_method          TEXT,               -- 'implied_two_stage'|'damodaran'|'fixed_fallback'
        rf_source           TEXT,               -- 'FRED:DGS10' | 'fallback'
        sp500_level         REAL,
        sp500_earnings      REAL,
        sp500_dividend      REAL,
        cape                REAL,
        earnings_yield      REAL,
        expected_growth     REAL,
        computed_at         TEXT
    )
    """,
)


def ensure_external_schema(conn: sqlite3.Connection) -> None:
    """Create every market-data table/index if missing. Idempotent.

    The caller owns the connection; this commits but does not close it.
    """
    cur = conn.cursor()
    for stmt in _DDL:
        cur.execute(stmt)
    conn.commit()


def existing_external_tables(conn: sqlite3.Connection) -> set[str]:
    """Return the subset of :data:`EXTERNAL_TABLES` that currently exist."""
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table'"
    ).fetchall()
    present = {r[0] for r in rows}
    return {t for t in EXTERNAL_TABLES if t in present}
