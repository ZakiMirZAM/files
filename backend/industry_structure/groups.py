"""Strategic group map and share-return curve (plan 2.5, 2.6).

Rebuilds the strategic groups with proper Porter axes (not margin vs
market cap) and adds the quadratic return-against-share fit.
"""

from __future__ import annotations

import math
import sqlite3
import statistics
from typing import Any, Optional

from industry_structure.helpers import sector_of
from industry_structure.panel import IndustryPanel
from industry_structure.peers import (
    PeerSet,
    load_peers,
    load_peers_at_year,
)
from industry_structure.dimensions import (
    AXIS_REGISTRY,
    axis_value,
    compute_industry_medians,
    default_axes,
    median_split_groups,
)


def _roic(peer_ratios: dict[str, Any]) -> Optional[float]:
    """Pre-tax ROIC = Operating Income / (equity + debt).

    This is a PRE-TAX measure because the peer ratios dict does not
    carry a reliable effective tax rate.  The app's after-tax ROIC
    (individualanalysis._nopat_for_row / _invested_capital) requires
    the full snapshot row, which is unavailable here.  The output
    field is named ``preTaxRoic`` to avoid confusion.
    """
    op = peer_ratios.get("Operating Income")
    equity = peer_ratios.get("Total Stockholders Equity")
    debt = peer_ratios.get("Total Debt")
    if op is None or equity is None or debt is None:
        return None
    try:
        fop, feq, fdebt = float(op), float(equity), float(debt)
    except (TypeError, ValueError):
        return None
    ic = feq + fdebt
    if ic <= 0:
        return None
    return fop / ic  # pre-tax ROIC, consistent across the group map


# ── Pearson correlation (Rule A item 15) ──────────────────────────────────────

def pearson_correlation(x: list[float], y: list[float]) -> Optional[float]:
    """Pearson r between two equal-length lists. Returns None if < 3 pairs."""
    if len(x) != len(y) or len(x) < 3:
        return None
    n = len(x)
    mx = sum(x) / n
    my = sum(y) / n
    sxx = sum((xi - mx) ** 2 for xi in x)
    syy = sum((yi - my) ** 2 for yi in y)
    sxy = sum((x[i] - mx) * (y[i] - my) for i in range(n))
    denom = math.sqrt(sxx * syy)
    if denom == 0:
        return None
    return sxy / denom


# ── Strategic groups builder (plan 2.5) ───────────────────────────────────────

def _resolve_peer_set(
    conn: sqlite3.Connection,
    industry: str,
    panel: Optional[IndustryPanel],
) -> Optional[PeerSet]:
    """Get PeerSet from panel or load_peers."""
    if panel is not None and panel.fiscal_year in panel.by_year:
        return panel.by_year[panel.fiscal_year]
    return load_peers(conn, industry)


def _compute_firm_axes(
    sorted_peers: list,
    x_key: str,
    y_key: str,
    industry_medians: dict[str, Optional[float]],
    shares: dict[str, float],
) -> tuple[list[dict[str, Any]], list[float], list[float]]:
    """Compute axis values and pre-tax ROIC for each firm."""
    firms: list[dict[str, Any]] = []
    x_vals: list[float] = []
    y_vals: list[float] = []
    for p in sorted_peers:
        xv = axis_value(p.ratios, x_key, industry_medians)
        yv = axis_value(p.ratios, y_key, industry_medians)
        roic_val = _roic(p.ratios)
        rev_share = shares.get(p.ticker, 0.0)
        firms.append({
            "ticker": p.ticker, "name": p.name,
            "x": round(xv, 6) if xv is not None else None,
            "y": round(yv, 6) if yv is not None else None,
            "xFiveYearsAgo": None, "yFiveYearsAgo": None,
            "group": None,
            "revenueShare": round(rev_share, 6),
            "preTaxRoic": round(roic_val, 4) if roic_val is not None else None,
        })
        if xv is not None and yv is not None:
            x_vals.append(xv)
            y_vals.append(yv)
    return firms, x_vals, y_vals


def _fill_five_years_ago(
    firms: list[dict[str, Any]],
    ps_then: Optional[PeerSet],
    x_key: str,
    y_key: str,
) -> None:
    """Populate xFiveYearsAgo/yFiveYearsAgo from a historical PeerSet."""
    if ps_then is None:
        return
    then_map = {p.ticker: p for p in ps_then.peers}
    then_medians = compute_industry_medians([
        {"ticker": p.ticker, "ratios": p.ratios}
        for p in ps_then.peers
    ])
    for firm in firms:
        p_then = then_map.get(firm["ticker"])
        if p_then is None:
            continue
        xv = axis_value(p_then.ratios, x_key, then_medians)
        yv = axis_value(p_then.ratios, y_key, then_medians)
        firm["xFiveYearsAgo"] = round(xv, 6) if xv is not None else None
        firm["yFiveYearsAgo"] = round(yv, 6) if yv is not None else None


def _build_group_summaries(
    firms: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Build group summary dicts from firm-level group assignments."""
    group_map: dict[str, list[dict[str, Any]]] = {}
    for firm in firms:
        label = firm["group"]
        if label is None:
            continue
        group_map.setdefault(label, []).append(firm)
    groups: list[dict[str, Any]] = []
    for label, members in group_map.items():
        combined_share = sum(f["revenueShare"] for f in members)
        roics = [f["preTaxRoic"] for f in members if f["preTaxRoic"] is not None]
        median_roic = statistics.median(roics) if roics else None
        roic_range = (min(roics), max(roics)) if roics else None
        groups.append({
            "label": label,
            "combinedShare": round(combined_share, 4),
            "medianPreTaxRoic": round(median_roic, 4) if median_roic is not None else None,
            "preTaxRoicRange": (
                [round(roic_range[0], 4), round(roic_range[1], 4)]
                if roic_range else None
            ),
            "firmCount": len(members),
        })
    return groups


def build_strategic_groups(
    conn: sqlite3.Connection,
    industry: str,
    *,
    x_key: Optional[str] = None,
    y_key: Optional[str] = None,
    limit: int = 40,
    panel: Optional[IndustryPanel] = None,
) -> dict[str, Any]:
    """Build the strategic group map for an industry."""
    ps = _resolve_peer_set(conn, industry, panel)
    if ps is None:
        return {"applicable": False, "reason": "No peer data found", "industry": industry}

    sector = sector_of(conn, industry)
    dx, dy = default_axes(sector)
    if x_key is None:
        x_key = dx
    if y_key is None:
        y_key = dy
    if x_key not in AXIS_REGISTRY or y_key not in AXIS_REGISTRY:
        return {"applicable": False, "reason": f"Unknown axis: {x_key} or {y_key}"}

    # Finding C2: the medians, the median split and the group summaries are
    # computed over EVERY peer in the industry. ``limit`` only decides how
    # many firms are handed to the chart. Slicing first made the same
    # company land in different groups on the map and in the connections
    # panel (TSM was "Low R&D" on one and "High R&D" on the other).
    all_peers = sorted(ps.peers, key=lambda p: p.revenue_usd, reverse=True)
    shares = ps.revenue_shares()
    all_peer_dicts = [{"ticker": p.ticker, "ratios": p.ratios} for p in all_peers]
    industry_medians = compute_industry_medians(all_peer_dicts)

    all_firms, x_vals, y_vals = _compute_firm_axes(
        all_peers, x_key, y_key, industry_medians, shares,
    )

    group_labels = median_split_groups(all_peer_dicts, x_key, y_key)
    for firm in all_firms:
        firm["group"] = group_labels.get(firm["ticker"])

    # Summaries describe the WHOLE group, not just its plotted members.
    groups = _build_group_summaries(all_firms)

    firms = all_firms[:limit]
    five_ago = ps.fiscal_year - 5
    ps_then = (
        panel.by_year.get(five_ago) if panel is not None
        else load_peers_at_year(conn, industry, five_ago)
    )
    _fill_five_years_ago(firms, ps_then, x_key, y_key)

    axis_corr = pearson_correlation(x_vals, y_vals)
    axes_list = [
        {"key": k, "label": dim.label, "meaning": dim.meaning}
        for k, dim in AXIS_REGISTRY.items()
    ]

    # Full membership, for every firm the split was computed over.
    #
    # ``firms`` is capped at ``limit`` (100 at most, against 512 peers in
    # Semiconductors), so a caller reading membership off it could name the
    # group of the largest firms only. The peer ranking prints the best RANKED
    # companies instead, and nineteen of thirty rows came back "group not
    # reported" for firms that are very much in a group.
    #
    # Compact by construction: the labels are interned into ``groupLabels`` and
    # each firm carries an index into it, so a 512-firm industry adds about
    # twelve bytes per firm rather than a repeated forty-character sentence.
    # A firm with no group (a missing axis value) is left out entirely, which
    # is what lets "group not reported" keep its meaning.
    label_index: dict[str, int] = {}
    group_by_ticker: dict[str, int] = {}
    for tk, label in group_labels.items():
        if label is None:
            continue
        idx = label_index.get(label)
        if idx is None:
            idx = len(label_index)
            label_index[label] = idx
        group_by_ticker[tk.upper()] = idx
    group_label_list = [lbl for lbl, _i in sorted(label_index.items(), key=lambda kv: kv[1])]

    return {
        "applicable": True, "industry": industry,
        "fiscalYear": ps.fiscal_year, "firms": firms, "groups": groups,
        "axisCorrelation": round(axis_corr, 4) if axis_corr is not None else None,
        "axes": axes_list, "defaultAxes": {"x": dx, "y": dy},
        "xKey": x_key, "yKey": y_key, "limit": limit,
        "plotted": len(firms),
        "available": len(ps.peers),
        "duplicateListingsDropped": ps.duplicate_listings_dropped,
        "groupLabels": group_label_list,
        "groupByTicker": group_by_ticker,
    }


# ── Share-return curve (plan 2.6) ─────────────────────────────────────────────

def _quadratic_fit(
    x: list[float],
    y: list[float],
) -> Optional[dict[str, Any]]:
    """Fit y = a*x^2 + b*x + c via closed-form least squares.

    Returns coefficients [a, b, c], r2, and n.
    """
    n = len(x)
    if n < 4:
        return None

    # Build normal equations for degree-2 polynomial
    # [sum(x^4) sum(x^3) sum(x^2)] [a]   [sum(x^2*y)]
    # [sum(x^3) sum(x^2) sum(x)  ] [b] = [sum(x*y)  ]
    # [sum(x^2) sum(x)   n       ] [c]   [sum(y)     ]
    sx = [sum(xi ** k for xi in x) for k in range(5)]
    sxy = [sum(x[i] ** k * y[i] for i in range(n)) for k in range(3)]

    # Solve 3x3 system using Cramer's rule
    A = [
        [sx[4], sx[3], sx[2]],
        [sx[3], sx[2], sx[1]],
        [sx[2], sx[1], n],
    ]
    B = [sxy[2], sxy[1], sxy[0]]

    def _det3(m):
        return (
            m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
            - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
            + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
        )

    det_A = _det3(A)
    if abs(det_A) < 1e-15:
        return None

    def _replace_col(m, col, b_vec):
        m2 = [row[:] for row in m]
        for i in range(3):
            m2[i][col] = b_vec[i]
        return m2

    a = _det3(_replace_col(A, 0, B)) / det_A
    b = _det3(_replace_col(A, 1, B)) / det_A
    c = _det3(_replace_col(A, 2, B)) / det_A

    # R-squared
    y_mean = sum(y) / n
    ss_tot = sum((yi - y_mean) ** 2 for yi in y)
    ss_res = sum((y[i] - (a * x[i] ** 2 + b * x[i] + c)) ** 2 for i in range(n))
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else None

    return {
        "coefficients": [round(a, 8), round(b, 6), round(c, 4)],
        "r2": round(r2, 4) if r2 is not None else None,
        "n": n,
    }


def build_share_return(
    conn: sqlite3.Connection,
    industry: str,
    *,
    panel: Optional[IndustryPanel] = None,
) -> dict[str, Any]:
    """Plot return on capital against revenue share with quadratic fit.

    Also: median ROIC of top quarter by share vs the rest.
    """
    ps = _resolve_peer_set(conn, industry, panel)
    if ps is None:
        return {"applicable": False, "reason": "No peer data found"}

    shares = ps.revenue_shares()

    points: list[dict[str, Any]] = []
    share_roic_pairs: list[tuple[float, float]] = []

    for p in ps.peers:
        rev_share = shares.get(p.ticker, 0.0)
        roic_val = _roic(p.ratios)
        points.append({
            "ticker": p.ticker,
            "revenueShare": round(rev_share, 6),
            "preTaxRoic": round(roic_val, 4) if roic_val is not None else None,
        })
        if roic_val is not None:
            share_roic_pairs.append((rev_share, roic_val))

    # Quadratic fit
    if len(share_roic_pairs) >= 4:
        x_vals = [s for s, _ in share_roic_pairs]
        y_vals = [r for _, r in share_roic_pairs]
        fit = _quadratic_fit(x_vals, y_vals)
    else:
        fit = None

    # Top quarter by share vs rest
    sorted_by_share = sorted(share_roic_pairs, key=lambda t: t[0], reverse=True)
    quarter_n = max(1, len(sorted_by_share) // 4)
    top_quarter = [r for _, r in sorted_by_share[:quarter_n]]
    rest = [r for _, r in sorted_by_share[quarter_n:]]
    med_top = statistics.median(top_quarter) if top_quarter else None
    med_rest = statistics.median(rest) if rest else None

    return {
        "applicable": True,
        "industry": industry,
        "fiscalYear": ps.fiscal_year,
        "points": points,
        "fit": fit,
        "topQuarterMedianPreTaxRoic": round(med_top, 4) if med_top is not None else None,
        "restMedianPreTaxRoic": round(med_rest, 4) if med_rest is not None else None,
    }
