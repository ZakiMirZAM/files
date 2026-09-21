"""Growth and margin splits (Rule A items 10 and 11).

Growth split (exact in logs):
    ln(company rev now / 5y ago) = ln(industry rev now / then)
                                 + ln(company share now / then)
    Shown as points per year.

Margin split (exact arithmetic):
    company margin = industry median
                   + (group median - industry median)
                   + (company - group median)
"""

from __future__ import annotations

import math
import statistics
from typing import Any, Optional

from connections._helpers import _safe_float
from industry_structure.peers import PeerSet
from industry_structure.dimensions import (
    default_axes,
    median_split_groups,
)


def build_growth_split(
    conn: Any,
    ticker: str,
    industry: str,
    now_peers: PeerSet,
    then_peers: Optional[PeerSet],
) -> Optional[dict[str, Any]]:
    """Growth split: company CAGR vs industry CAGR and share change
    (Rule A item 10, exact in logs, reported as points per year).

    Requires the company AND the industry to have both end years.
    Returns None when data is insufficient.
    """
    if then_peers is None or not now_peers.peers or not then_peers.peers:
        return None

    years = now_peers.fiscal_year - then_peers.fiscal_year
    if years <= 0:
        return None

    # Company revenue in both years
    shares_now = now_peers.revenue_shares()
    shares_then = then_peers.revenue_shares()

    company_rev_now: Optional[float] = None
    company_rev_then: Optional[float] = None
    for p in now_peers.peers:
        if p.ticker == ticker:
            company_rev_now = p.revenue_usd
            break
    for p in then_peers.peers:
        if p.ticker == ticker:
            company_rev_then = p.revenue_usd
            break

    if company_rev_now is None or company_rev_then is None:
        return None
    if company_rev_now <= 0 or company_rev_then <= 0:
        return None

    industry_rev_now = now_peers.total_revenue_usd
    industry_rev_then = then_peers.total_revenue_usd
    if industry_rev_now <= 0 or industry_rev_then <= 0:
        return None

    share_now = shares_now.get(ticker)
    share_then = shares_then.get(ticker)
    if share_now is None or share_then is None:
        return None
    if share_now <= 0 or share_then <= 0:
        return None

    # Exact in logs. The company's own log growth is not computed: it IS
    # the industry term plus the share term, and publishing a separately
    # rounded copy of it was debug residue.
    industry_log_growth = math.log(industry_rev_now / industry_rev_then)
    share_log_change = math.log(share_now / share_then)

    # Convert to annual points. The split is rounded ONCE at the end and the
    # total is rebuilt from the rounded parts, so the printed identity
    # company = industry + share holds exactly at the printed precision
    # (finding LOW).
    industry_points = round(industry_log_growth / years, 6)
    share_points = round(share_log_change / years, 6)
    company_cagr = round(industry_points + share_points, 6)

    return {
        "companyCagr5y": company_cagr,
        "industryCagr5y": industry_points,
        "industryPoints": industry_points,
        "sharePoints": share_points,
        "shareNow": round(share_now, 6),
        "shareThen": round(share_then, 6),
        "years": years,
    }


def build_margin_split(
    ticker: str,
    now_peers: PeerSet,
    sector: Optional[str],
) -> Optional[dict[str, Any]]:
    """Margin split: company margin = industry median + group effect + company
    effect (Rule A item 11, exact arithmetic).

    The three parts sum exactly to the company margin.
    """
    # Find company operating margin
    company_margin: Optional[float] = None
    all_margins: list[float] = []
    peer_dicts: list[dict[str, Any]] = []

    for p in now_peers.peers:
        rev = _safe_float(p.ratios.get("Revenue"))
        op_inc = _safe_float(p.ratios.get("Operating Income"))
        if rev is not None and rev > 0 and op_inc is not None:
            margin = op_inc / rev
            all_margins.append(margin)
            peer_dicts.append({
                "ticker": p.ticker,
                "ratios": p.ratios,
                "margin": margin,
            })
            if p.ticker == ticker:
                company_margin = margin

    if company_margin is None or len(all_margins) < 2:
        return None

    industry_median = statistics.median(all_margins)

    # Finding C2: the median split runs over EVERY peer, not only those with
    # a computable operating margin, so this agrees with the group map and
    # with the company block's group.
    x_key, y_key = default_axes(sector)
    groups = median_split_groups(
        [{"ticker": p.ticker, "ratios": p.ratios} for p in now_peers.peers],
        x_key, y_key,
    )

    company_group = groups.get(ticker)
    if company_group is None:
        # Fall back: group median = industry median
        group_median = industry_median
    else:
        group_margins = [
            pd["margin"] for pd in peer_dicts
            if groups.get(pd["ticker"]) == company_group
        ]
        group_median = statistics.median(group_margins) if group_margins else industry_median

    # Exact decomposition, rounded once at the end: the three printed parts
    # are rounded and the printed total is their sum, so the identity holds
    # at the printed precision (finding LOW).
    industry_part = round(industry_median, 6)
    group_part = round(group_median - industry_median, 6)
    company_part = round(company_margin - group_median, 6)

    return {
        "company": round(industry_part + group_part + company_part, 6),
        "industryMedian": industry_part,
        "groupMedian": round(group_median, 6),
        "industryPart": industry_part,
        "groupPart": group_part,
        "companyPart": company_part,
        "group": company_group,
        "firmCount": len(peer_dicts),
    }
