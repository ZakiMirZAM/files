"""Bundle: assemble the full connections payload.

``build_connections(conn, *, sector, industry, ticker, scope)`` returns
the unified connections dict with blocks: economy, credit, sector,
industry, company, exposures.

This module resolves the scope and assembles; each block is built in its
own module (``company_block``, ``group_blocks``, ``exposure_rows``).

Performance: loads the industry panel ONCE (single SQL query for all
years), derives peer sets and episodes from it in memory, and caches
sector-level data with a 30-minute TTL behind a per-key lock.
"""

from __future__ import annotations

import logging
import sqlite3
from typing import Any, Optional

from connections.company_block import build_company_block
from connections.economy import build_credit_block, build_economy_block
from connections.episodes import episodes_from_panel
from connections.exposure_rows import build_exposure_rows
from connections.group_blocks import build_industry_block, build_sector_block
from connections.sector_cache import (
    get_industry_panel,
    get_sector_episodes,
    get_sector_pool,
)
from industry_structure.helpers import sector_of
from industry_structure.panel import IndustryPanel
from industry_structure.peers import PeerSet

log = logging.getLogger(__name__)


def resolve_ticker_alias(conn: sqlite3.Connection, ticker: str) -> str:
    """Fold a listing alias onto the symbol that carries the fundamentals.

    ``api.py#_resolve_symbol`` already does this before the route calls
    in, but the builder is also used directly (tests, warm-up scripts and
    other callers), so it guards itself: an unresolved alias returns an
    empty company block rather than a wrong one.
    """
    upper = (ticker or "").strip().upper()
    if not upper:
        return upper

    # The dot->dash step is for US share classes (BRK.B is stored BRK-B).
    # Exchange-suffixed listings keep their dot (IFX.DE, 000660.KS), so it
    # only applies when the dotted spelling is not itself a known symbol.
    # This mirrors ``api.py#_resolve_symbol_core``; an unconditional replace
    # sent every foreign listing to a symbol that does not exist.
    try:
        known = conn.execute(
            "SELECT 1 FROM tickers WHERE ticker = ? LIMIT 1", (upper,),
        ).fetchone() is not None
    except sqlite3.Error:
        known = False
    normalized = upper if known else upper.replace(".", "-")

    for candidate in (upper, normalized):
        try:
            row = conn.execute(
                "SELECT p.symbol AS primary_symbol"
                " FROM security_map a"
                " JOIN security_map p ON p.cik = a.cik AND p.is_primary = 1"
                " WHERE a.symbol = ? AND a.cik IS NOT NULL"
                " AND a.cik <> '0000000000'"
                " LIMIT 1",
                (candidate,),
            ).fetchone()
        except sqlite3.Error:
            return normalized
        if row and row["primary_symbol"]:
            return str(row["primary_symbol"])
    return normalized


def _resolve_scope(
    conn: sqlite3.Connection,
    sector: Optional[str],
    industry: Optional[str],
    ticker: Optional[str],
) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """Fill in whichever of (sector, industry, ticker) the caller left out."""
    if ticker:
        ticker = resolve_ticker_alias(conn, ticker)

    if ticker and (not sector or not industry):
        row = conn.execute(
            "SELECT sector, industry FROM tickers WHERE ticker = ?", (ticker,),
        ).fetchone()
        if row is not None:
            sector = sector or row["sector"]
            industry = industry or row["industry"]

    if industry and not sector:
        sector = sector_of(conn, industry) or sector

    return (sector, industry, ticker)


def build_connections(
    conn: sqlite3.Connection,
    *,
    sector: Optional[str] = None,
    industry: Optional[str] = None,
    ticker: Optional[str] = None,
    scope: Optional[str] = None,
) -> dict[str, Any]:
    """Build the full connections payload.

    When only ``ticker`` is given, resolves sector and industry from
    the tickers table. Listing aliases are folded onto the primary symbol
    here as well as at the route, so a direct caller cannot get a company
    block belonging to a different company.

    ``scope="economy"`` returns only the economy and credit blocks; the
    other blocks are omitted entirely so the frontend can ask for the
    macro lines without paying for a panel load.

    Returns {economy, credit, sector, industry, company, exposures}.
    """
    economy = build_economy_block()
    credit = build_credit_block()
    if scope == "economy":
        return {"scope": "economy", "economy": economy, "credit": credit}

    sector, industry, ticker = _resolve_scope(conn, sector, industry, ticker)

    # Load industry panel (ONE query -> all years -> derive now/then peers)
    panel: Optional[IndustryPanel] = None
    now_peers: Optional[PeerSet] = None
    then_peers: Optional[PeerSet] = None
    industry_episodes: Optional[dict[str, Any]] = None
    industry_coverage: Optional[float] = None

    if industry:
        panel = get_industry_panel(conn, industry)
        if panel:
            now_peers = panel.by_year.get(panel.fiscal_year)
            then_peers = panel.by_year.get(panel.fiscal_year - 5)
            industry_episodes = episodes_from_panel(panel)
            industry_coverage = panel.coverage

    # Sector-level data: one cached pool carries the peer sets and the year.
    sector_pool: Optional[dict[str, Any]] = None
    sector_ep: Optional[dict[str, Any]] = None
    if sector:
        sector_pool = get_sector_pool(conn, sector)
        sector_ep = get_sector_episodes(conn, sector)

    sector_block = (
        build_sector_block(sector, sector_pool, sector_ep) if sector else None
    )

    industry_block: Optional[dict[str, Any]] = None
    if industry:
        industry_block = build_industry_block(
            industry, sector or "",
            now_peers, then_peers,
            sector_pool,
            industry_episodes=industry_episodes,
            coverage=industry_coverage,
        )

    company_block: Optional[dict[str, Any]] = None
    if ticker and industry and sector:
        company_block = build_company_block(
            conn, ticker, industry, sector,
            now_peers, then_peers,
            panel=panel,
        )

    exposures: Optional[list[dict[str, Any]]] = None
    if now_peers and industry:
        exposures = build_exposure_rows(
            conn, industry, sector, now_peers, then_peers, panel,
        )

    return {
        "economy": economy,
        "credit": credit,
        "sector": sector_block,
        "industry": industry_block,
        "company": company_block,
        "exposures": exposures,
    }
