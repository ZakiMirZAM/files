"""
betas/schema.py

DDL for the bottom-up beta engine. All tables live in **financials.db** (the
same DB the resolver joins against: financials, tickers, beta_history,
industry_beta_history), so there are no cross-database ATTACHes and the
``FINANCIALS_DB`` env override gives tests isolation for free.

Tables
------
damodaran_industry
    Damodaran's by-industry-group benchmark metrics, current snapshot.
    Generic long form keyed (region, industry, dataset, metric) — identical
    layout to the valuation_debug table so the loader ports 1:1.
damodaran_industry_hist
    The same metrics from his ARCHIVED yearly files, keyed by year. Feeds the
    historical per-year bottom-up betas for the WACC/EVA trend charts.
segment_revenue
    Business-segment revenue per (cik, fiscal year) parsed from the company's
    10-K XBRL instance on SEC EDGAR.
segment_industry_map
    Permanent cache of segment-name -> Damodaran-group classifications
    (alias / keyword / LLM / manual), so the LLM is consulted at most once
    (plus one retry) per (ticker, segment) ever.
computed_betas
    The resolver's output per ticker with full provenance: method (L1..L7),
    confidence, D/E used, coverage, components JSON, warnings JSON, and an
    inputs hash for cheap staleness checks.
"""

from __future__ import annotations

import sqlite3

BETAS_TABLES = (
    "damodaran_industry",
    "damodaran_industry_hist",
    "segment_revenue",
    "segment_industry_map",
    "computed_betas",
)

_DDL: tuple[str, ...] = (
    """
    CREATE TABLE IF NOT EXISTS damodaran_industry (
        region   TEXT NOT NULL,
        industry TEXT NOT NULL,
        dataset  TEXT NOT NULL,            -- 'beta' | 'ps'
        metric   TEXT NOT NULL,            -- 'unlevered_beta', 'ev_sales', ...
        value    REAL,
        asof     TEXT,
        PRIMARY KEY (region, industry, dataset, metric)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_betas_damodaran_industry "
    "ON damodaran_industry(industry)",
    """
    CREATE TABLE IF NOT EXISTS damodaran_industry_hist (
        region     TEXT NOT NULL,
        industry   TEXT NOT NULL,
        dataset    TEXT NOT NULL,
        metric     TEXT NOT NULL,
        year       INTEGER NOT NULL,
        value      REAL,
        fetched_at TEXT,
        PRIMARY KEY (region, industry, dataset, metric, year)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_betas_damodaran_hist "
    "ON damodaran_industry_hist(industry, year)",
    """
    CREATE TABLE IF NOT EXISTS segment_revenue (
        cik                  TEXT NOT NULL,
        fy                   INTEGER NOT NULL,   -- fiscal year of the 10-K period end
        segment              TEXT NOT NULL,      -- human label from the XBRL member
        axis                 TEXT NOT NULL,      -- 'business' | 'product'
        revenue              REAL NOT NULL,      -- as filed, reporting currency
        consolidated_revenue REAL,               -- same-filing dimensionless total
        accession            TEXT,
        unit                 TEXT,
        fetched_at           TEXT,
        PRIMARY KEY (cik, fy, axis, segment)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_segment_revenue_cik ON segment_revenue(cik, fy)",
    """
    CREATE TABLE IF NOT EXISTS segment_industry_map (
        ticker       TEXT NOT NULL,
        segment_norm TEXT NOT NULL,        -- lower/strip-normalized segment name
        industry     TEXT,                 -- Damodaran group, NULL = unmappable
        source       TEXT NOT NULL,        -- 'alias' | 'keyword' | 'llm' | 'manual'
        confidence   REAL,
        model        TEXT,
        asof         TEXT,
        PRIMARY KEY (ticker, segment_norm)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS computed_betas (
        ticker          TEXT PRIMARY KEY,
        beta            REAL NOT NULL,     -- final levered beta fed to CAPM
        unlevered       REAL,              -- firm unlevered beta before relevering
        method          TEXT NOT NULL,     -- bottom_up_ev_sales | bottom_up_revenue |
                                           -- bottom_up_single | inhouse_industry |
                                           -- regression_stored | sector_damodaran |
                                           -- market_default
        confidence      TEXT NOT NULL,     -- 'high' | 'medium' | 'low'
        de_ratio        REAL,
        de_source       TEXT,              -- 'firm_market' | 'damodaran_industry'
        tax_rate        REAL,
        coverage        REAL,              -- mapped-segment revenue coverage (L1/L2)
        regression_beta REAL,
        divergence      REAL,              -- |beta - regression_beta| when both exist
        components_json TEXT,              -- list of per-segment component dicts
        warnings_json   TEXT,
        inputs_hash     TEXT,
        computed_at     TEXT
    )
    """,
)


def ensure_betas_schema(conn: sqlite3.Connection) -> None:
    """Idempotently create the beta-engine tables (CREATE TABLE IF NOT EXISTS)."""
    for stmt in _DDL:
        conn.execute(stmt)
    conn.commit()
