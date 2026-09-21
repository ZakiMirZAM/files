"""In-process cache for sector-level data used by the connections bundle.

Caches sector episodes, industry panels and the sector profit pool with a
30-minute TTL. Ten companies in the same sector hit the DB once; the other
nine read from memory.

The cache class itself lives in ``connections/_ttl_cache.py``; it carries
the single-flight (finding M1) and bounded-LRU (finding M2) properties this
module relies on.
"""

from __future__ import annotations

import sqlite3
import statistics
from typing import Any, Optional

from connections._ttl_cache import DEFAULT_TTL_SECONDS, TtlLruCache
from industry_structure.panel import IndustryPanel, load_industry_panel
from industry_structure.sector_pool import build_sector_pool
from side_caches import register_side_cache

_TTL_SECONDS = DEFAULT_TTL_SECONDS  # 30 minutes

# Entry caps (finding M2). A panel is the heavy one: every year of an
# industry with its ratio columns.
_MAX_PANELS = 12
_MAX_EPISODES = 8
_MAX_POOLS = 8

_episodes_cache = TtlLruCache(_MAX_EPISODES)
_panel_cache = TtlLruCache(_MAX_PANELS)
_pool_cache = TtlLruCache(_MAX_POOLS)


def get_sector_pool(
    conn: sqlite3.Connection,
    sector: str,
) -> Optional[dict[str, Any]]:
    """The one sector pool (finding H6), cached by sector for 30 min."""
    return _pool_cache.get_or_build(
        sector, lambda: build_sector_pool(conn, sector),
    )


def preload_sector(conn: sqlite3.Connection, sector: str) -> None:
    """Warm the sector pool and the sector episode medians.

    The pool picks the SECTOR's own fiscal year (finding H6) and carries
    both peer sets with it, so the sector-level work is one build rather
    than one per caller-supplied year.
    """
    get_sector_pool(conn, sector)
    get_sector_episodes(conn, sector)


def get_sector_episodes(
    conn: sqlite3.Connection,
    sector: str,
) -> dict[str, Any]:
    """Batch-load sector episodes (revenue change 2020, gross margins 2020-2023).

    Cached for 30 min.
    """
    return _episodes_cache.get_or_build(
        ("sector", sector), lambda: _batch_group_episodes(conn, "sector", sector),
    )


# Only these two columns of ``tickers`` may be used as a grouping column
# (finding LOW: whitelist group_col in the episode SQL).
_GROUP_COLS = ("sector", "industry")


def _batch_group_episodes(
    conn: sqlite3.Connection,
    group_col: str,
    group_val: str,
) -> dict[str, Any]:
    """Compute revenue change 2020 and gross margins 2020-2023 in ONE query."""
    if group_col not in _GROUP_COLS:
        raise ValueError(f"unsupported group column: {group_col}")
    rows = conn.execute(
        'SELECT f.Ticker,'
        ' CAST(f."Calendar Year" AS INTEGER) AS yr,'
        ' f."Revenue" AS rev,'
        ' f."Gross Profit Ratio" AS gpr'
        ' FROM financials f'
        ' JOIN tickers t ON t.ticker = f.Ticker'
        ' LEFT JOIN security_map s ON s.symbol = f.Ticker'
        f' WHERE t.{group_col} = ?'
        ' AND COALESCE(s.is_primary, 1) = 1'
        " AND f.Ticker NOT GLOB '*-P[A-Z]'"
        ' AND CAST(f."Calendar Year" AS INTEGER) IN (2019, 2020, 2021, 2022, 2023)'
        ' AND f."Reported Currency" IS NOT NULL'
        ' ORDER BY f.Ticker, yr',
        (group_val,),
    ).fetchall()

    ticker_data: dict[str, dict[int, dict[str, Any]]] = {}
    for r in rows:
        tk = r["Ticker"]
        yr = int(r["yr"])
        ticker_data.setdefault(tk, {})[yr] = {
            "rev": float(r["rev"]) if r["rev"] is not None else None,
            "gpr": float(r["gpr"]) if r["gpr"] is not None else None,
        }

    changes: list[float] = []
    for years in ticker_data.values():
        r19 = years.get(2019, {}).get("rev")
        r20 = years.get(2020, {}).get("rev")
        if r19 is not None and r20 is not None and r19 != 0:
            changes.append((r20 - r19) / abs(r19))

    rev_change_2020 = round(statistics.median(changes), 4) if changes else None

    gross_margin: dict[str, Any] = {}
    for yr in (2020, 2021, 2022, 2023):
        vals = [
            years[yr]["gpr"]
            for years in ticker_data.values()
            if yr in years and years[yr]["gpr"] is not None
        ]
        gross_margin[str(yr)] = round(statistics.median(vals), 4) if vals else None

    return {
        "revenueChange2020": rev_change_2020,
        "grossMargin": gross_margin,
    }


def get_industry_panel(
    conn: sqlite3.Connection,
    industry: str,
) -> Optional[IndustryPanel]:
    """Load industry panel, cached by industry name for 30 min."""
    return _panel_cache.get_or_build(
        industry, lambda: load_industry_panel(conn, industry),
    )


def cache_sizes() -> dict[str, int]:
    """Entry counts per cache, for diagnostics and tests."""
    return {
        "panels": len(_panel_cache),
        "episodes": len(_episodes_cache),
        "pools": len(_pool_cache),
    }


def clear_sector_cache() -> None:
    """Clear all caches (called on backend restart / cache clear)."""
    _episodes_cache.clear()
    _panel_cache.clear()
    _pool_cache.clear()


register_side_cache(
    ("", "db"), clear_sector_cache, name="connections.sector_cache",
)
