"""Industry panel: single-query loader for all years of an industry.

Extracted from peers.py to keep that module under 400 lines. Nothing in
``peers`` imports this module any more, so the two form a plain one-way
dependency rather than the re-export cycle they used to.
"""

from __future__ import annotations

import math
import sqlite3
from dataclasses import dataclass, field
from typing import Optional

from industry_structure.dedupe import dedupe_listings
from industry_structure.peers import (
    Peer,
    PeerSet,
    _ratio_select,
    _row_to_peer,
    peer_columns,
    peer_from_where,
    pick_year_detail,
)

# A firm that simply has not filed the latest year yet is not an exit. Only
# count one once its last reported year is at least this many years behind
# the picked year (finding H4).
NET_ENTRY_REPORTING_LAG = 2


@dataclass
class IndustryPanel:
    """All peer data for an industry across all years, loaded in one query."""
    by_year: dict[int, PeerSet]
    fiscal_year: int  # latest year (from pick_year)
    industry: str
    ticker_spans: dict[str, tuple[int, int]]  # ticker -> (first_yr, last_yr)
    # ticker -> calendar year of security_map.valid_to, for rows whose
    # security_map.status is 'delisted'. Empty when the table or its
    # columns are absent.
    delisted_year: dict[str, int] = field(default_factory=dict)
    # Coverage of the picked year: firms / firms in the best-covered year.
    coverage: Optional[float] = None


def load_delisted_years(
    conn: sqlite3.Connection,
    industry: str,
) -> dict[str, int]:
    """``{ticker: year}`` for delisted symbols of an industry.

    Degrades to an empty dict when ``security_map`` has no ``status`` /
    ``valid_to`` columns (a pre-remediation DB, and the test fixtures).
    """
    try:
        cols = {r[1] for r in conn.execute("PRAGMA table_info(security_map)")}
    except sqlite3.Error:
        return {}
    if not {"status", "valid_to"} <= cols:
        return {}
    try:
        rows = conn.execute(
            "SELECT s.symbol AS symbol, s.valid_to AS valid_to"
            " FROM security_map s JOIN tickers t ON t.ticker = s.symbol"
            " WHERE t.industry = ? AND s.status = 'delisted'"
            " AND s.valid_to IS NOT NULL",
            (industry,),
        ).fetchall()
    except sqlite3.Error:
        return {}
    out: dict[str, int] = {}
    for r in rows:
        raw = str(r["valid_to"])[:4]
        if raw.isdigit():
            out[r["symbol"]] = int(raw)
    return out


def load_industry_panel(
    conn: sqlite3.Connection,
    industry: str,
) -> Optional[IndustryPanel]:
    """Load ALL rows for an industry across ALL years in ONE query.

    Returns an IndustryPanel with PeerSets keyed by fiscal year,
    the latest year (from pick_year), and ticker first/last year spans.
    """
    detail = pick_year_detail(conn, industry)
    if detail is None:
        return None
    latest_year = detail["fiscalYear"]

    sql = (
        "SELECT " + peer_columns() + ", " + _ratio_select()
        + peer_from_where(group_col="industry")
        + " ORDER BY yr, rev_usd DESC"
    )
    rows = conn.execute(sql, (industry,)).fetchall()
    if not rows:
        return None

    by_year: dict[int, list[Peer]] = {}
    ticker_spans: dict[str, tuple[int, int]] = {}

    for r in rows:
        yr = int(r["yr"])
        by_year.setdefault(yr, []).append(_row_to_peer(r, yr))

    peer_sets: dict[int, PeerSet] = {}
    for yr, peers in by_year.items():
        kept, dropped = dedupe_listings(peers)
        peer_sets[yr] = PeerSet(
            peers=kept, fiscal_year=yr, group_name=industry,
            duplicate_listings_dropped=dropped,
        )
        for p in kept:
            if p.ticker in ticker_spans:
                first, last = ticker_spans[p.ticker]
                ticker_spans[p.ticker] = (min(first, yr), max(last, yr))
            else:
                ticker_spans[p.ticker] = (yr, yr)

    return IndustryPanel(
        by_year=peer_sets,
        fiscal_year=latest_year,
        industry=industry,
        ticker_spans=ticker_spans,
        delisted_year=load_delisted_years(conn, industry),
        coverage=detail.get("coverage"),
    )


def net_entry_window(
    latest_year: int,
    window: int = 5,
) -> Optional[tuple[int, int]]:
    """``[from, to]`` of the net-entry window (finding H4).

    The window ends ``NET_ENTRY_REPORTING_LAG`` years before the picked
    fiscal year, because a firm that has not filed the most recent year or
    two has not exited: it is late. Counting those as exits made
    Semiconductors 2024 read minus 40.
    """
    start_year = latest_year - window
    end_year = latest_year - NET_ENTRY_REPORTING_LAG
    if end_year < start_year:
        return None
    return (start_year, end_year)


def panel_net_entry(
    panel: IndustryPanel,
    latest_year: Optional[int] = None,
    window: int = 5,
) -> Optional[int]:
    """Net entry over the lagged window (finding H4).

    Entries: tickers whose first reported year falls in the window.
    Exits: tickers whose LAST reported year falls in the window (so the
    firm has been silent for at least ``NET_ENTRY_REPORTING_LAG`` years),
    or whose ``security_map`` row is delisted with a ``valid_to`` in the
    window.

    ``latest_year`` defaults to the panel's own picked fiscal year, which
    is what every caller passes.

    Counts listings, not firm births.
    """
    if latest_year is None:
        latest_year = panel.fiscal_year
    bounds = net_entry_window(latest_year, window)
    if bounds is None:
        return None
    start_year, end_year = bounds

    entries = sum(
        1 for first, _ in panel.ticker_spans.values()
        if start_year <= first <= end_year
    )
    exited: set[str] = {
        tk for tk, (_, last) in panel.ticker_spans.items()
        if start_year <= last <= end_year
    }
    for tk, yr in panel.delisted_year.items():
        if tk in panel.ticker_spans and start_year <= yr <= end_year:
            exited.add(tk)
    return entries - len(exited)


def revenue_cagr(
    now: PeerSet,
    then: PeerSet,
) -> Optional[float]:
    """Industry-level revenue CAGR in logs, converted to annual points.

    Uses total USD revenue of the peer set at each date.
    """
    rev_now = now.total_revenue_usd
    rev_then = then.total_revenue_usd
    if rev_now <= 0 or rev_then <= 0:
        return None
    years = now.fiscal_year - then.fiscal_year
    if years <= 0:
        return None
    log_growth = math.log(rev_now / rev_then)
    annual = log_growth / years
    return annual
