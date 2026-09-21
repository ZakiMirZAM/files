"""Entry and exit evidence blocks (plan 2.2, Rule A items 6, 8)."""

from __future__ import annotations

import math
from typing import Any, Optional

from industry_structure.helpers import (
    _abs_val,
    _iqr_of,
    _median_of,
    _peer_ratio,
    _peer_val,
    _safe_div,
)
from industry_structure.peers import PeerSet
from industry_structure.ranks import ranked_value


# ── Scale slope (Rule A item 6) ─────────────────────────────────────────────

def compute_scale_slope(ps: PeerSet) -> dict[str, Any]:
    """Simple regression of operating margin on ln(USD revenue).

    Margins trimmed at 5th and 95th percentiles.  Returns slope, r2,
    firmCount.
    """
    pairs: list[tuple[float, float]] = []
    for p in ps.peers:
        margin = _peer_ratio(p, "Operating Income", "Revenue")
        if margin is None or p.revenue_usd <= 0:
            continue
        pairs.append((math.log(p.revenue_usd), margin))

    if len(pairs) < 5:
        return {"slope": None, "r2": None, "firmCount": len(pairs)}

    margins_sorted = sorted(m for _, m in pairs)
    n = len(margins_sorted)
    p5 = margins_sorted[max(0, int(n * 0.05))]
    p95 = margins_sorted[min(n - 1, int(n * 0.95))]

    trimmed = [(x, y) for x, y in pairs if p5 <= y <= p95]
    if len(trimmed) < 5:
        return {"slope": None, "r2": None, "firmCount": len(trimmed)}

    return _linear_regression(trimmed)


def _linear_regression(
    trimmed: list[tuple[float, float]],
) -> dict[str, Any]:
    """Simple linear regression on (x, y) pairs."""
    n_t = len(trimmed)
    sum_x = sum(x for x, _ in trimmed)
    sum_y = sum(y for _, y in trimmed)
    sum_xy = sum(x * y for x, y in trimmed)
    sum_xx = sum(x * x for x, _ in trimmed)
    sum_yy = sum(y * y for _, y in trimmed)

    denom = n_t * sum_xx - sum_x * sum_x
    if denom == 0:
        return {"slope": None, "r2": None, "firmCount": n_t}

    slope = (n_t * sum_xy - sum_x * sum_y) / denom
    intercept = (sum_y - slope * sum_x) / n_t

    ss_tot = sum_yy - sum_y * sum_y / n_t
    ss_res = sum((y - (slope * x + intercept)) ** 2 for x, y in trimmed)
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else None

    return {
        "slope": round(slope, 6),
        "r2": round(r2, 4) if r2 is not None else None,
        "firmCount": n_t,
    }


def spearman_rank_correlation(
    x: list[float], y: list[float],
) -> Optional[float]:
    """Spearman rank correlation between two lists of the same length.

    Returns None if fewer than 3 pairs. Ties handled with average ranks.
    """
    if len(x) != len(y) or len(x) < 3:
        return None
    n = len(x)

    def _ranks(vals: list[float]) -> list[float]:
        indexed = sorted(range(n), key=lambda i: vals[i])
        ranks = [0.0] * n
        i = 0
        while i < n:
            j = i
            while j < n - 1 and vals[indexed[j]] == vals[indexed[j + 1]]:
                j += 1
            avg_rank = (i + j) / 2.0 + 1
            for k in range(i, j + 1):
                ranks[indexed[k]] = avg_rank
            i = j + 1
        return ranks

    rx = _ranks(x)
    ry = _ranks(y)

    d_sq = sum((rx[i] - ry[i]) ** 2 for i in range(n))
    denom = n * (n * n - 1)
    if denom == 0:
        return None
    return 1.0 - 6.0 * d_sq / denom


# ── Entry evidence ───────────────────────────────────────────────────────────

def _peer_median(ps: PeerSet, fn) -> Optional[float]:
    """Median of ``fn`` over the peers, ignoring the ones it cannot answer."""
    return _median_of([v for v in (fn(p) for p in ps.peers) if v is not None])


def _entry_barrier_medians(ps: PeerSet) -> dict[str, Optional[float]]:
    """Median barrier ratios for entry evidence, keyed by payload name."""
    gm_vals = [
        float(p.ratios["Gross Profit Ratio"])
        for p in ps.peers
        if p.ratios.get("Gross Profit Ratio") is not None
    ]
    return {
        "ppeToRevenue": _peer_median(ps, lambda p: _safe_div(
            _peer_val(p, "Property Plant Equipment Net"),
            p.revenue_local,
        )),
        "capexToRevenue": _peer_median(ps, lambda p: _safe_div(
            _abs_val(p.ratios.get("Capital Expenditure")),
            p.revenue_local,
        )),
        "rdToRevenue": _peer_median(ps, lambda p: _peer_ratio(
            p, "Research And Development Expenses", "Revenue",
        )),
        "sgaToRevenue": _peer_median(ps, lambda p: _peer_ratio(
            p, "Selling General And Administrative Expenses", "Revenue",
        )),
        "grossMarginMedian": _median_of(gm_vals),
        "grossMarginIqr": _iqr_of(gm_vals),
        "incumbentCashToAssets": _peer_median(ps, lambda p: _safe_div(
            p.ratios.get("Cash And Short Term Investments"),
            p.ratios.get("Total Assets"),
        )),
    }


# payload key -> the cross-industry metric key it is ranked against.
_ENTRY_RANKED: tuple[tuple[str, str], ...] = (
    ("ppeToRevenue", "ppeToRevenue"),
    ("capexToRevenue", "capexToRevenue"),
    ("rdToRevenue", "rdToRevenue"),
    ("sgaToRevenue", "sgaToRevenue"),
)


def _entry_result_dict(
    industry: str,
    medians: dict[str, Optional[float]],
    slope_result: dict[str, Any],
    cross_medians: dict[str, dict[str, float]],
    net_entry_5y: Optional[int],
) -> dict[str, Any]:
    """Assemble the entry evidence result dict."""
    def _rv(key: str, metric_key: str):
        val = medians.get(key)
        return ranked_value(
            round(val, 4) if val is not None else None,
            industry, metric_key, cross_medians,
        )

    gm_iqr = medians.get("grossMarginIqr")
    result: dict[str, Any] = {
        key: _rv(key, metric_key) for key, metric_key in _ENTRY_RANKED
    }
    result.update({
        "scaleSlope": slope_result.get("slope"),
        "scaleR2": slope_result.get("r2"),
        "scaleFirms": slope_result.get("firmCount"),
        "grossMarginMedian": _rv("grossMarginMedian", "grossMargin"),
        "grossMarginIqr": round(gm_iqr, 4) if gm_iqr is not None else None,
        "incumbentCashToAssets": _rv("incumbentCashToAssets", "cashToAssets"),
        "netEntry5y": net_entry_5y,
    })
    return result


def _leader_cogs_to_revenue_5y(
    ps: PeerSet,
    panel: Any,
) -> Optional[list[dict[str, Any]]]:
    """COGS / Revenue for the top 4 firms by USD revenue, for each of the
    last 5 years.

    Returns a list of {ticker, name, years: [{year, value}]} sorted by
    current revenue descending.  ``value`` is local / local (currency-neutral).
    """
    if panel is None:
        return None

    # Top 4 by current-year USD revenue
    sorted_peers = sorted(ps.peers, key=lambda p: p.revenue_usd, reverse=True)
    leaders = sorted_peers[:4]
    if not leaders:
        return None

    latest = ps.fiscal_year
    year_range = range(latest - 4, latest + 1)  # 5 years inclusive

    result: list[dict[str, Any]] = []
    for leader in leaders:
        yearly: list[dict[str, Any]] = []
        for yr in year_range:
            yr_ps = panel.by_year.get(yr)
            if yr_ps is None:
                yearly.append({"year": yr, "value": None})
                continue
            match = next(
                (p for p in yr_ps.peers if p.ticker == leader.ticker), None,
            )
            if match is None:
                yearly.append({"year": yr, "value": None})
                continue
            cogs = match.ratios.get("Cost Of Revenue")
            rev = match.revenue_local
            if cogs is not None and rev and rev > 0:
                yearly.append({"year": yr, "value": round(float(cogs) / rev, 4)})
            else:
                yearly.append({"year": yr, "value": None})
        result.append({
            "ticker": leader.ticker,
            "name": leader.name,
            "years": yearly,
        })
    return result


def build_entry_evidence(
    ps: PeerSet,
    cross_medians: dict[str, dict[str, float]],
    *,
    net_entry_5y: Optional[int] = None,
    panel: Any = None,
) -> dict[str, Any]:
    """ppeToRevenue, capexToRevenue, rdToRevenue, sgaToRevenue, scaleSlope,
    scaleR2, scaleFirms, grossMarginMedian, grossMarginIqr,
    incumbentCashToAssets, netEntry5y, leaderCogsToRevenue5y.
    """
    medians = _entry_barrier_medians(ps)
    slope_result = compute_scale_slope(ps)
    result = _entry_result_dict(
        ps.group_name, medians, slope_result, cross_medians, net_entry_5y,
    )
    result["leaderCogsToRevenue5y"] = _leader_cogs_to_revenue_5y(ps, panel)
    return result


# ── Exit evidence ────────────────────────────────────────────────────────────

def build_exit_evidence(
    ps: PeerSet,
    cross_medians: dict[str, dict[str, float]],
) -> dict[str, Any]:
    """ppeToAssets, intangiblesToAssets, shareOfFirmsWithCapexBelowDepreciation."""
    industry = ps.group_name

    ppe_assets = _peer_median(ps, lambda p: _safe_div(
        p.ratios.get("Property Plant Equipment Net"),
        p.ratios.get("Total Assets"),
    ))
    intang_assets = _peer_median(ps, lambda p: _safe_div(
        p.ratios.get("Intangible Assets"),
        p.ratios.get("Total Assets"),
    ))

    below_count = 0
    total_count = 0
    for p in ps.peers:
        capex = _abs_val(p.ratios.get("Capital Expenditure"))
        dep = _peer_val(p, "Depreciation And Amortization")
        if capex is not None and dep is not None and dep > 0:
            total_count += 1
            if capex < dep:
                below_count += 1
    capex_below_dep = below_count / total_count if total_count > 0 else None

    return {
        "ppeToAssets": ranked_value(
            round(ppe_assets, 4) if ppe_assets is not None else None,
            industry, "ppeToAssets", cross_medians,
        ),
        "intangiblesToAssets": ranked_value(
            round(intang_assets, 4) if intang_assets is not None else None,
            industry, "intangiblesToAssets", cross_medians,
        ),
        "shareOfFirmsWithCapexBelowDepreciation": (
            round(capex_below_dep, 4)
            if capex_below_dep is not None else None
        ),
    }
