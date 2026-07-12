"""
backend/betas — Damodaran bottom-up beta engine (Investment Valuation, Ch. 8).

Public surface (kept deliberately small; heavy imports stay lazy):

    ensure_betas_schema(conn)      -- idempotent DDL for the 5 engine tables
    DamodaranIndustryData          -- NYU Stern industry benchmark loader
    beta_mode()                    -- BETA_RESOLVER env flag: 'on'|'shadow'|'off'
    resolve_beta(...)              -- L1..L7 resolution chain   (bottom_up.py)
    get_beta_fast(...)             -- DB-only cached read       (bottom_up.py)

All tables live in financials.db next to the fundamentals the resolver joins
against. Everything degrades gracefully: any missing dataset, network failure
or unmapped industry falls through to the next resolution level, ending at the
stored regression beta and finally the market beta of 1.0.
"""

from __future__ import annotations

import os

from .bottom_up import (
    BetaComponent,
    BetaResult,
    get_beta_fast,
    get_result_fast,
    historical_bottom_up,
    resolve_beta,
)
from .damodaran_industry import DamodaranIndustryData, IndustryBenchmark, alias_industry
from .schema import ensure_betas_schema

__all__ = [
    "BetaComponent",
    "BetaResult",
    "DamodaranIndustryData",
    "IndustryBenchmark",
    "alias_industry",
    "beta_mode",
    "ensure_betas_schema",
    "get_beta_fast",
    "get_result_fast",
    "historical_bottom_up",
    "resolve_beta",
]


def beta_mode() -> str:
    """BETA_RESOLVER feature flag: 'on' (resolver drives valuations), 'shadow'
    (compute + attach provenance, valuations keep the stored beta), or 'off'
    (resolver never runs). Default flipped to 'on' after the verification run
    of 2026-06-30 (see tmp/beta_verify_*.json); set BETA_RESOLVER=shadow or
    =off to fall back. Re-read each call so tests can flip it."""
    mode = os.environ.get("BETA_RESOLVER", "on").strip().lower()
    return mode if mode in ("on", "shadow", "off") else "on"
