"""Sector profit pool (plan 2.10, Rule A item 14).

Per industry in a sector: revenueUsd, revenueShare, operatingMargin
(profit over revenue), operatingProfitUsd, profitShare,
profitShareFiveYearsAgo.

Shares sum to one.  A negative sector total is handled explicitly:
shares are returned as null with a ``negativeSectorProfit`` flag.

Finding H6: the aggregation itself lives in ``sector_pool.py`` and is
shared with the connections bundle, so both surfaces print the same
share for the same fiscal year.
"""

from __future__ import annotations

import sqlite3
from typing import Any, Optional

from industry_structure.sector_pool import build_sector_pool


def build_profit_pool(
    conn: sqlite3.Connection,
    sector: str,
    *,
    pool: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Build the profit pool for a sector.

    Returns per-industry: revenueUsd, revenueShare, operatingMargin,
    operatingProfitUsd, profitShare, profitShareFiveYearsAgo.
    """
    if pool is None:
        pool = build_sector_pool(conn, sector)
    if pool is None:
        return {
            "applicable": False,
            "reason": "No fiscal year with enough coverage for this sector",
            "sector": sector,
        }

    now = pool["now"]
    then = pool["then"]
    if not now["industries"]:
        return {
            "applicable": False,
            "reason": "No industries found for this sector",
            "sector": sector,
        }

    rows = _build_industry_rows(now, then)

    return {
        "applicable": True,
        "sector": sector,
        "fiscalYear": pool["fiscalYear"],
        "fiscalYear5yAgo": pool["fiscalYear5yAgo"],
        "coverage": pool.get("coverage"),
        "industries": rows,
        "negativeSectorProfit": now["totalOperatingProfitUsd"] <= 0,
        "totalRevenueUsd": round(now["totalRevenueUsd"], 0),
        "totalOperatingProfitUsd": round(now["totalOperatingProfitUsd"], 0),
        "nullIndustryRowsDropped": now["nullIndustryRowsDropped"],
        "duplicateListingsDropped": pool.get("duplicateListingsDropped", 0),
        "firmCount": now["firmCount"],
    }


def _build_industry_rows(
    now: dict[str, Any],
    then: dict[str, Any],
) -> list[dict[str, Any]]:
    """Assemble per-industry profit pool rows."""
    total_rev_now = now["totalRevenueUsd"]
    total_profit_now = now["totalOperatingProfitUsd"]
    total_profit_then = then["totalOperatingProfitUsd"]

    neg_now = total_profit_now <= 0
    neg_then = total_profit_then <= 0

    rows: list[dict[str, Any]] = []
    for ind, figures in now["industries"].items():
        rev = figures["revenueUsd"]
        op = figures["operatingProfitUsd"]
        margin = op / rev if rev > 0 else None
        rev_share = rev / total_rev_now if total_rev_now > 0 else None
        profit_share: Optional[float] = None if neg_now else op / total_profit_now

        if neg_then:
            profit_share_then: Optional[float] = None
        else:
            op_then = then["industries"].get(ind, {}).get("operatingProfitUsd", 0.0)
            profit_share_then = op_then / total_profit_then

        rows.append({
            "industry": ind,
            "firmCount": figures["firmCount"],
            "revenueUsd": round(rev, 0),
            "revenueShare": round(rev_share, 6) if rev_share is not None else None,
            "operatingMargin": round(margin, 4) if margin is not None else None,
            "operatingProfitUsd": round(op, 0),
            "profitShare": round(profit_share, 6) if profit_share is not None else None,
            "profitShareFiveYearsAgo": (
                round(profit_share_then, 6) if profit_share_then is not None else None
            ),
        })

    rows.sort(
        key=lambda x: x["revenueShare"] if x["revenueShare"] is not None else 0,
        reverse=True,
    )
    return rows
