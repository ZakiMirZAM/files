"""Exposure table: raw columns for the top N firms of an industry.

Implements the exposure table from plan section 1.3.
All values are RAW (no scores, no labels, no thresholds).
"""

from __future__ import annotations

from typing import Any, Optional

from connections._helpers import _safe_float
from connections.leverage import _interest_coverage, _net_debt_ebitda
from industry_structure.peers import PeerSet

# How many firms the table covers. The caller needs the same cut to fetch
# their episode figures, so it reads this rather than repeating a literal.
EXPOSURE_TOP_N = 20


def _interest_per_point_pct(ratios: dict[str, Any]) -> Optional[float]:
    """Total Debt * 0.01 / Operating Income.

    Null when Operating Income <= 0 (Rule A item 12 upper bound).
    """
    debt = _safe_float(ratios.get("Total Debt"))
    op = _safe_float(ratios.get("Operating Income"))
    if debt is None or op is None or op <= 0:
        return None
    return round((debt * 0.01) / op, 4)


def _operating_leverage(
    ratios: dict[str, Any],
    prior: Optional[dict[str, Any]],
) -> Optional[float]:
    """Percent change in operating income over percent change in revenue.

    Both years come from the annual ``financials`` table through the
    industry panel, so there is no TTM overlay to guard against here; the
    marker CLAUDE.md describes (``_ttm_overlay`` skipping this ratio
    because a trailing-twelve-month numerator would be compared against a
    full prior year) applies to ``_company_metrics``, not to this path.
    """
    if not prior:
        return None
    rev_now = _safe_float(ratios.get("Revenue"))
    rev_prev = _safe_float(prior.get("Revenue"))
    op_now = _safe_float(ratios.get("Operating Income"))
    op_prev = _safe_float(prior.get("Operating Income"))
    if None in (rev_now, rev_prev, op_now, op_prev):
        return None
    if rev_prev == 0 or op_prev == 0:
        return None
    rev_change = (rev_now - rev_prev) / abs(rev_prev)
    if rev_change == 0:
        return None
    op_change = (op_now - op_prev) / abs(op_prev)
    return round(op_change / rev_change, 3)


def _round(v: Optional[float], places: int) -> Optional[float]:
    return round(v, places) if v is not None else None


def build_exposures(
    peers: PeerSet,
    *,
    top_n: int = EXPOSURE_TOP_N,
    shares_now: Optional[dict[str, float]] = None,
    shares_then: Optional[dict[str, float]] = None,
    revenue_change_2020: Optional[dict[str, Optional[float]]] = None,
    gross_margin_2020: Optional[dict[str, Optional[float]]] = None,
    gross_margin_2022: Optional[dict[str, Optional[float]]] = None,
    prior_peers: Optional[PeerSet] = None,
) -> list[dict[str, Any]]:
    """Build the exposure table for the top N firms by USD revenue.

    Returns a list of raw-column rows (Rule A: no scores, no labels). The
    coverage and net-debt helpers are the ones ``leverage.py`` uses for the
    group medians, so a row and the median above it are the same ratio;
    only the rounding is this table's own.
    """
    sorted_peers = sorted(peers.peers, key=lambda p: p.revenue_usd, reverse=True)
    top = sorted_peers[:top_n]

    prior_by_ticker: dict[str, dict[str, Any]] = {}
    if prior_peers is not None:
        prior_by_ticker = {p.ticker: p.ratios for p in prior_peers.peers}

    rows: list[dict[str, Any]] = []
    for p in top:
        r = p.ratios

        # Share change 5y (points)
        share_change: Optional[float] = None
        if shares_now and shares_then:
            s_now = shares_now.get(p.ticker)
            s_then = shares_then.get(p.ticker)
            if s_now is not None and s_then is not None:
                share_change = round((s_now - s_then) * 100, 2)

        # Revenue change 2020
        rev_ch = None
        if revenue_change_2020:
            rev_ch = revenue_change_2020.get(p.ticker)

        # Gross margin change 2020 to 2022 (points)
        gm_change: Optional[float] = None
        if gross_margin_2020 and gross_margin_2022:
            gm20 = gross_margin_2020.get(p.ticker)
            gm22 = gross_margin_2022.get(p.ticker)
            if gm20 is not None and gm22 is not None:
                gm_change = round((gm22 - gm20) * 100, 2)

        rows.append({
            "ticker": p.ticker,
            "name": p.name,
            "revenueUsd": round(p.revenue_usd, 0),
            "interestCoverage": _round(_interest_coverage(r), 2),
            "netDebtToEbitda": _round(_net_debt_ebitda(r), 2),
            "interestPerPointPctOfOperatingIncome": _interest_per_point_pct(r),
            "revenueChange2020": rev_ch,
            "grossMarginChange2020to2022": gm_change,
            "operatingLeverage": _operating_leverage(
                r, prior_by_ticker.get(p.ticker),
            ),
            "shareChange5y": share_change,
            # Left null deliberately: no helper returns a per-company ROIC
            # and WACC off the same rows. The peer ratios give a PRE-TAX
            # ROIC while ``compute_wacc`` needs the full snapshot (beta
            # resolver, lease debt, live ERP), so subtracting the two
            # would mix an after-tax cost of capital from a different
            # pipeline against a pre-tax return.
            "roicMinusWacc": None,
        })

    return rows
