"""Strategic dimensions for the industry structure axis registry.

Implements the axis registry from plan section 2.5 and the median-split
strategic groups from Rule A item 16.

Each dimension is a strategic choice (not an outcome), computed from a
peer's ratio columns. The ``specialization`` axis is NOT included now
(plan says it is not needed yet).
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass
from typing import Any, Callable, Optional

from industry_structure.helpers import _safe_div


# ── Axis registry ───────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Dimension:
    """One strategic dimension for the group map."""
    key: str
    label: str
    meaning: str
    compute: Callable[[dict[str, Any], Optional[float]], Optional[float]]


def _tech_leadership(ratios: dict[str, Any], _med: Optional[float] = None) -> Optional[float]:
    """R&D to revenue."""
    return _safe_div(ratios.get("Research And Development Expenses"), ratios.get("Revenue"))


def _brand_service(ratios: dict[str, Any], _med: Optional[float] = None) -> Optional[float]:
    """SG&A to revenue."""
    return _safe_div(
        ratios.get("Selling General And Administrative Expenses"),
        ratios.get("Revenue"),
    )


def _capital_intensity(ratios: dict[str, Any], _med: Optional[float] = None) -> Optional[float]:
    """PP&E to revenue (plan 2.5: how much fixed capital the strategy needs).

    Uses the real PP&E column (Property Plant Equipment Net) which exists
    in financials.db.  Falls back to D&A / Revenue only when PP&E is NULL.
    """
    ppe = ratios.get("Property Plant Equipment Net")
    rev = ratios.get("Revenue")
    if ppe is not None and rev is not None:
        result = _safe_div(ppe, rev)
        if result is not None:
            return result
    # Fallback: D&A to revenue
    return _safe_div(
        ratios.get("Depreciation And Amortization"),
        ratios.get("Revenue"),
    )


def _vertical_integration(ratios: dict[str, Any], _med: Optional[float] = None) -> Optional[float]:
    """(Revenue - COGS + D&A) / Revenue, i.e. how much of final value
    the firm produces itself."""
    rev = ratios.get("Revenue")
    cogs = ratios.get("Cost Of Revenue")
    dep = ratios.get("Depreciation And Amortization")
    if rev is None or cogs is None:
        return None
    try:
        frev, fcogs = float(rev), float(cogs)
    except (TypeError, ValueError):
        return None
    if frev == 0:
        return None
    fdep = float(dep) if dep is not None else 0.0
    return (frev - fcogs + fdep) / frev


def _cost_position(ratios: dict[str, Any], industry_median: Optional[float] = None) -> Optional[float]:
    """COGS/Revenue minus the industry median: how lean vs rivals."""
    ratio = _safe_div(ratios.get("Cost Of Revenue"), ratios.get("Revenue"))
    if ratio is None or industry_median is None:
        return None
    return ratio - industry_median


def _price_policy(ratios: dict[str, Any], industry_median: Optional[float] = None) -> Optional[float]:
    """Gross margin minus industry median: price premium."""
    gm = ratios.get("Gross Profit Ratio")
    if gm is None:
        gm = _safe_div(ratios.get("Gross Profit"), ratios.get("Revenue"))
    if gm is None or industry_median is None:
        return None
    return float(gm) - industry_median


def _leverage(ratios: dict[str, Any], _med: Optional[float] = None) -> Optional[float]:
    """Debt to capital (total debt / (total debt + equity))."""
    debt = ratios.get("Total Debt")
    equity = ratios.get("Total Stockholders Equity")
    if debt is None or equity is None:
        return None
    try:
        fd, fe = float(debt), float(equity)
    except (TypeError, ValueError):
        return None
    denom = fd + fe
    if denom == 0:
        return None
    return fd / denom


AXIS_REGISTRY: dict[str, Dimension] = {
    "techLeadership": Dimension(
        "techLeadership", "R&D intensity",
        "How much the firm invests to lead in technology",
        _tech_leadership,
    ),
    "brandService": Dimension(
        "brandService", "SG&A intensity",
        "How much it spends on selling, brand, and service",
        _brand_service,
    ),
    "capitalIntensity": Dimension(
        "capitalIntensity", "PP&E intensity",
        "How much fixed capital the strategy needs",
        _capital_intensity,
    ),
    "verticalIntegration": Dimension(
        "verticalIntegration", "Value-added share",
        "How much of the final value it produces itself",
        _vertical_integration,
    ),
    "costPosition": Dimension(
        "costPosition", "Cost vs peers",
        "How lean its production cost is against rivals",
        _cost_position,
    ),
    "pricePolicy": Dimension(
        "pricePolicy", "Price premium",
        "Its price premium; partly a result, so read with care",
        _price_policy,
    ),
    "leverage": Dimension(
        "leverage", "Debt to capital",
        "How much financial risk the strategy carries",
        _leverage,
    ),
}


# ── Default axes per sector ─────────────────────────────────────────────────

_SECTOR_DEFAULT_AXES: dict[str, tuple[str, str]] = {
    "Technology": ("techLeadership", "verticalIntegration"),
    "Healthcare": ("techLeadership", "verticalIntegration"),
    "Consumer Cyclical": ("brandService", "costPosition"),
    "Consumer Defensive": ("brandService", "costPosition"),
    "Industrials": ("capitalIntensity", "costPosition"),
    "Energy": ("capitalIntensity", "costPosition"),
    "Basic Materials": ("capitalIntensity", "costPosition"),
}
_DEFAULT_FALLBACK = ("brandService", "capitalIntensity")


def default_axes(sector: Optional[str]) -> tuple[str, str]:
    """Return the default (x, y) axis keys for a sector."""
    if sector is None:
        return _DEFAULT_FALLBACK
    return _SECTOR_DEFAULT_AXES.get(sector, _DEFAULT_FALLBACK)


# ── Median-split groups (Rule A item 16) ────────────────────────────────────

def compute_industry_medians(
    peers: list[dict[str, Any]],
) -> dict[str, Optional[float]]:
    """Industry-median values for the axes that need them (costPosition,
    pricePolicy).

    ``peers`` is a list of dicts with a ``ratios`` key. This is the one
    implementation: ``groups.py`` and ``company_profile/rivals.py`` both
    had a character-for-character copy.
    """
    cogs_rev_vals = []
    gm_vals = []
    for p in peers:
        r = p.get("ratios", {})
        cr = _safe_div(r.get("Cost Of Revenue"), r.get("Revenue"))
        if cr is not None:
            cogs_rev_vals.append(cr)
        gm = r.get("Gross Profit Ratio")
        if gm is None:
            gm = _safe_div(r.get("Gross Profit"), r.get("Revenue"))
        if gm is not None:
            gm_vals.append(float(gm))
    return {
        "cogs_revenue_median": statistics.median(cogs_rev_vals) if cogs_rev_vals else None,
        "gross_margin_median": statistics.median(gm_vals) if gm_vals else None,
    }


def axis_value(
    ratios: dict[str, Any],
    axis_key: str,
    industry_medians: dict[str, Optional[float]],
) -> Optional[float]:
    """One axis value for a peer."""
    dim = AXIS_REGISTRY.get(axis_key)
    if dim is None:
        return None
    med: Optional[float] = None
    if axis_key == "costPosition":
        med = industry_medians.get("cogs_revenue_median")
    elif axis_key == "pricePolicy":
        med = industry_medians.get("gross_margin_median")
    return dim.compute(ratios, med)


def _label_from_axes(
    x_high: bool,
    y_high: bool,
    x_dim: Dimension,
    y_dim: Dimension,
) -> str:
    """Build a human-readable group label from two axes (Rule A item 16).

    Example: "High R&D intensity, high value-added share".
    """
    x_word = "High" if x_high else "Low"
    y_word = "high" if y_high else "low"
    return f"{x_word} {_mid_sentence(x_dim.label)}, {y_word} {_mid_sentence(y_dim.label)}"


def _mid_sentence(label: str) -> str:
    """Lowercase a label's first letter for use mid-sentence, leaving acronyms
    such as "R&D" alone (a second character that is not lowercase marks one)."""
    if len(label) >= 2 and label[0].isupper() and label[1].islower():
        return label[0].lower() + label[1:]
    return label


def median_split_groups(
    peers: list[dict[str, Any]],
    x_key: str,
    y_key: str,
) -> dict[str, Optional[str]]:
    """Split peers at the industry median on each axis (Rule A item 16).

    ``peers`` is a list of dicts with at least ``ticker`` and ``ratios`` keys.

    Returns {ticker: group_label_or_None}. Firms missing either value
    get None (no group).
    """
    x_dim = AXIS_REGISTRY.get(x_key)
    y_dim = AXIS_REGISTRY.get(y_key)
    if x_dim is None or y_dim is None:
        return {p["ticker"]: None for p in peers}

    industry_medians = compute_industry_medians(peers)

    # Compute axis values
    values: dict[str, tuple[Optional[float], Optional[float]]] = {}
    x_vals: list[float] = []
    y_vals: list[float] = []
    for p in peers:
        tk = p["ticker"]
        ratios = p.get("ratios", {})
        xv = axis_value(ratios, x_key, industry_medians)
        yv = axis_value(ratios, y_key, industry_medians)
        values[tk] = (xv, yv)
        if xv is not None:
            x_vals.append(xv)
        if yv is not None:
            y_vals.append(yv)

    if not x_vals or not y_vals:
        return {p["ticker"]: None for p in peers}

    x_median = statistics.median(x_vals)
    y_median = statistics.median(y_vals)

    result: dict[str, Optional[str]] = {}
    for p in peers:
        tk = p["ticker"]
        xv, yv = values[tk]
        if xv is None or yv is None:
            result[tk] = None
            continue
        x_high = xv >= x_median
        y_high = yv >= y_median
        result[tk] = _label_from_axes(x_high, y_high, x_dim, y_dim)
    return result
