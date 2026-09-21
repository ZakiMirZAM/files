"""The one sector pool (finding H6).

Two engines used to answer "what share of the sector is this industry?"
and disagreed: the connections bundle measured the industry at the
INDUSTRY's picked year and kept rows whose industry label is NULL in the
sector denominator, while the profit pool measured everything at the
SECTOR's picked year and dropped those rows. Energy / Oil & Gas
Integrated read 0.4952 on one page and 0.4524 on the other.

One rule now, used by both:

* anything stated as a share of the sector is measured at the SECTOR's
  own picked fiscal year (``pick_year_detail(..., group_col="sector")``),
  for the numerator as well as the denominator;
* a row whose ``tickers.industry`` is NULL cannot be attributed to any
  industry, so it is dropped from both, and the count is reported as
  ``nullIndustryRowsDropped``;
* the rows are the sector peer set, so the primary-listing filter, the
  currency contract and the cross-listing de-duplication of H2 all apply
  once, here.
"""

from __future__ import annotations

import sqlite3
from typing import Any, Optional

from industry_structure.peers import (
    PeerSet,
    load_sector_peers,
    pick_year_detail,
)


def _operating_profit_usd(peer) -> Optional[float]:
    """Operating income converted to USD with the peer's own revenue rate."""
    op = peer.ratios.get("Operating Income")
    if op is None:
        return None
    try:
        return float(op) * peer.usd_per_unit
    except (TypeError, ValueError):
        return None


def pool_from_peerset(ps: Optional[PeerSet]) -> dict[str, Any]:
    """Aggregate a sector peer set into per-industry revenue and profit."""
    industries: dict[str, dict[str, Any]] = {}
    null_rows = 0
    if ps is None:
        return {
            "industries": {},
            "totalRevenueUsd": 0.0,
            "totalOperatingProfitUsd": 0.0,
            "nullIndustryRowsDropped": 0,
            "firmCount": 0,
        }

    for p in ps.peers:
        ind = p.industry
        if ind is None:
            null_rows += 1
            continue
        entry = industries.setdefault(
            ind, {"revenueUsd": 0.0, "operatingProfitUsd": 0.0, "firmCount": 0},
        )
        entry["revenueUsd"] += p.revenue_usd
        op_usd = _operating_profit_usd(p)
        if op_usd is not None:
            entry["operatingProfitUsd"] += op_usd
        entry["firmCount"] += 1

    return {
        "industries": industries,
        "totalRevenueUsd": sum(d["revenueUsd"] for d in industries.values()),
        "totalOperatingProfitUsd": sum(
            d["operatingProfitUsd"] for d in industries.values()
        ),
        "nullIndustryRowsDropped": null_rows,
        "firmCount": sum(d["firmCount"] for d in industries.values()),
    }


def build_sector_pool(
    conn: sqlite3.Connection,
    sector: str,
) -> Optional[dict[str, Any]]:
    """The sector pool now and five years earlier, at the sector's own year.

    Returns None when the sector has no usable year.
    """
    detail = pick_year_detail(conn, sector, group_col="sector")
    if detail is None:
        return None
    year = detail["fiscalYear"]

    ps_now = load_sector_peers(conn, sector, year)
    ps_then = load_sector_peers(conn, sector, year - 5)

    now = pool_from_peerset(ps_now)
    then = pool_from_peerset(ps_then)

    return {
        "sector": sector,
        "fiscalYear": year,
        "fiscalYear5yAgo": year - 5,
        "coverage": detail.get("coverage"),
        "now": now,
        "then": then,
        # The peer sets themselves, so the caller does not run the same
        # query again for the sector's median margin and leverage.
        "peersNow": ps_now,
        "peersThen": ps_then,
        "duplicateListingsDropped": (
            ps_now.duplicate_listings_dropped if ps_now else 0
        ),
    }


def industry_shares(
    pool: Optional[dict[str, Any]],
    industry: str,
) -> dict[str, Optional[float]]:
    """This industry's share of sector revenue and operating profit.

    Both are taken from the same pool, so ``/api/connections`` and
    ``/api/sector/{s}/profit-pool`` print the same number for the same
    fiscal year. A share of profit is null when the sector's total
    operating profit is not positive: a share of a negative total does
    not mean anything.
    """
    out: dict[str, Optional[float]] = {
        "shareOfSectorRevenue": None,
        "shareOfSectorProfit": None,
        "shareOfSectorRevenue5yAgo": None,
        "shareOfSectorProfit5yAgo": None,
        "sectorFiscalYear": None,
    }
    if pool is None:
        return out
    out["sectorFiscalYear"] = pool["fiscalYear"]

    for suffix, key in (("", "now"), ("5yAgo", "then")):
        side = pool[key]
        row = side["industries"].get(industry)
        if row is None:
            continue
        total_rev = side["totalRevenueUsd"]
        total_op = side["totalOperatingProfitUsd"]
        if total_rev > 0:
            out[f"shareOfSectorRevenue{suffix}"] = round(
                row["revenueUsd"] / total_rev, 6,
            )
        if total_op > 0:
            out[f"shareOfSectorProfit{suffix}"] = round(
                row["operatingProfitUsd"] / total_op, 6,
            )
    return out
