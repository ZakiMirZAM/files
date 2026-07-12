"""
backend/marketdata
==================

A scoped port of the market-level data sources from the standalone
``valuation_debug`` engine, trimmed to *only* the metrics the IntrinsicEd app
surfaces in its Economic Analysis and Sector pages:

  * Shiller CAPE (PE10) + index price/earnings        — :mod:`shiller_data`
  * Damodaran implied ERP + S&P-500 trailing EPS       — :mod:`damodaran_market`
  * Live risk-free rate + S&P-500 valuation/projection — :mod:`market_inputs`
  * EPU (US + global) and GPR macro-uncertainty series — :mod:`geopolitical_data`
  * FRED treasury/inflation/EPU series                 — :mod:`fred_client`
  * Sector SPDR ETF price history (all 11 + SPY)       — :mod:`sector_etf`

Everything sector/industry-*specific* from valuation_debug (the Damodaran
industry benchmark tables, sector betas, sector WACC/EVA models, the in-house
industry averages, and the company financial DB) is intentionally **excluded**.

The package keeps its own small SQLite DB (``backend/market_data.db``) and file
cache (``backend/data_cache/``), separate from the large ``financials.db`` of
SEC fundamentals, so refreshing market data never touches the heavy DB.
"""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path

# ``backend/`` — the parent of this package directory.
BACKEND_DIR = Path(__file__).resolve().parent.parent

# Dedicated, small SQLite DB for the ported market data (NOT financials.db).
MARKET_DB_PATH = Path(
    os.environ.get("MARKET_DATA_DB", BACKEND_DIR / "market_data.db")
)

# File cache for downloaded sources (matches http_cache's default of
# ``<package parent>/data_cache`` == ``backend/data_cache``).
CACHE_DIR = Path(os.environ.get("MARKETDATA_CACHE", BACKEND_DIR / "data_cache"))


def connect() -> sqlite3.Connection:
    """Open a connection to the dedicated market-data DB, ensuring the schema.

    The caller owns the connection and should close it (use ``with connect()``).
    """
    from .schema import ensure_external_schema

    MARKET_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(MARKET_DB_PATH))
    ensure_external_schema(conn)
    return conn


__all__ = ["BACKEND_DIR", "MARKET_DB_PATH", "CACHE_DIR", "connect"]
