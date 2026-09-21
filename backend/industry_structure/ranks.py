"""Percentile rank of an industry figure among all industries (Rule A item 5).

The rank is the share of industries (with at least ten firms) whose median
for a given metric is LOWER than the target industry's median.  Ties take
the midpoint: ``(count_below + 0.5 * count_equal) / total``.

The cross-industry table of medians is built in a single pass over the
latest-year peer rows (not one query per industry per metric) and is
cached because it is reused by every structure call.
"""

from __future__ import annotations

import math
import sqlite3
import statistics
import threading
import time
from typing import Any, Optional

from industry_structure.dedupe import dedupe_listings
from industry_structure.peers import (
    Peer,
    _row_to_peer,
    peer_from_where,
)
from side_caches import register_side_cache


# ── Cache ──────────────────────────────────────────────────────────────────────

_MIN_FIRMS = 10
# Longer than the 30-minute route cache on purpose: the two used to expire
# together, so the first /structure of every window paid the ~1.1 s rebuild
# even though the warm-up had already primed it.
_CACHE_TTL = 60 * 60  # 60 minutes
_MAX_ENTRIES = 4  # one per fiscal year in play

_lock = threading.Lock()
# Per-key cache: {cache_key: (result, timestamp)}
_cache: dict[str, tuple[Any, float]] = {}
# One lock per cache key so eight cold requests run ONE build (finding M1).
_key_locks: dict[str, threading.Lock] = {}


def _is_key_fresh(key: str) -> bool:
    entry = _cache.get(key)
    if entry is None:
        return False
    _, ts = entry
    return time.monotonic() - ts < _CACHE_TTL


def _lock_for(key: str) -> threading.Lock:
    with _lock:
        lock = _key_locks.get(key)
        if lock is None:
            lock = threading.Lock()
            _key_locks[key] = lock
        return lock


def _store(key: str, value: Any) -> None:
    with _lock:
        _cache[key] = (value, time.monotonic())
        while len(_cache) > _MAX_ENTRIES:
            oldest = min(_cache, key=lambda k: _cache[k][1])
            _cache.pop(oldest, None)
            _key_locks.pop(oldest, None)


def clear_cache() -> None:
    """Force a refresh on next call (test helper)."""
    global _cache
    with _lock:
        _cache = {}
        _key_locks.clear()


register_side_cache(("", "db"), clear_cache, name="industry_structure.ranks")


# ── Core builder ───────────────────────────────────────────────────────────────

# Metrics we compute cross-industry medians for.
# Key = human label, value = (numerator_col, denominator_col | None).
# When denominator is None, the column value IS the metric.
_METRIC_DEFS: dict[str, tuple[Optional[str], Optional[str]]] = {
    "grossMargin": ("Gross Profit Ratio", None),
    "operatingMargin": ("Operating Income", "Revenue"),
    "ppeToRevenue": ("Property Plant Equipment Net", "Revenue"),
    "capexToRevenue": ("Capital Expenditure", "Revenue"),
    "rdToRevenue": ("Research And Development Expenses", "Revenue"),
    "sgaToRevenue": ("Selling General And Administrative Expenses", "Revenue"),
    "daToRevenue": ("Depreciation And Amortization", "Revenue"),
    "cogsToRevenue": ("Cost Of Revenue", "Revenue"),
    "debtToCapital": ("Total Debt", None),  # special: debt / (debt + equity)
    "cashToAssets": ("Cash And Short Term Investments", "Total Assets"),
    "ppeToAssets": ("Property Plant Equipment Net", "Total Assets"),
    "intangiblesToAssets": ("Intangible Assets", "Total Assets"),
    "revenueCagr5y": (None, None),  # computed separately
}

# Industry-level figures (not a median of per-firm values). They are
# computed in the same pass so cr4, cr8, hhi and revenueCagr5y get a
# percentile like every other figure (finding H9).
_INDUSTRY_LEVEL_KEYS = ("cr4", "cr8", "hhi", "revenueCagr5y")

# The financial columns the full cross-industry pass reads.
_RANK_COLS = (
    "Gross Profit Ratio", "Operating Income", "Revenue",
    "Property Plant Equipment Net",
    "Capital Expenditure", "Research And Development Expenses",
    "Selling General And Administrative Expenses",
    "Depreciation And Amortization", "Cost Of Revenue",
    "Total Debt", "Total Stockholders Equity",
    "Cash And Short Term Investments", "Total Assets",
    "Intangible Assets", "Net Income", "Market Cap",
)

# The five-years-back pass only sums one revenue figure per industry, so it
# reads the columns ``dedupe_listings`` needs and nothing else. Loading all
# 16 built a full Peer per row to throw 15 of them away.
_REVENUE_ONLY_COLS = ("Revenue", "Net Income", "Market Cap")


def _safe_ratio(num: Any, denom: Any) -> Optional[float]:
    if num is None or denom is None:
        return None
    try:
        fn, fd = float(num), float(denom)
    except (TypeError, ValueError):
        return None
    if fd == 0:
        return None
    return fn / fd


def _debt_to_capital(row: dict[str, Any]) -> Optional[float]:
    debt = row.get("Total Debt")
    equity = row.get("Total Stockholders Equity")
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


def _compute_metric(row: dict[str, Any], key: str) -> Optional[float]:
    """Compute one metric value from a peer's ratio dict."""
    if key == "debtToCapital":
        return _debt_to_capital(row)
    if key == "revenueCagr5y":
        return None  # handled at industry level
    num_col, denom_col = _METRIC_DEFS[key]
    if num_col is None:
        return None
    if denom_col is None:
        val = row.get(num_col)
        if val is None:
            return None
        try:
            return float(val)
        except (TypeError, ValueError):
            return None
    return _safe_ratio(row.get(num_col), row.get(denom_col))


def _capex_abs(v: Any) -> Optional[float]:
    """Capital expenditure is stored negative; return absolute value."""
    if v is None:
        return None
    try:
        fv = float(v)
    except (TypeError, ValueError):
        return None
    return abs(fv)


def _cross_industry_sql(cols: tuple[str, ...]) -> str:
    """One row per primary listing, with the SAME recipe as ``load_peers``.

    Finding M8: the pass used to omit the ``fx_rates`` join, so a row
    whose currency is unknown stayed in the ranking population although
    the displayed median dropped it. The join comes from
    ``peers.peer_from_where`` now, so the two cannot diverge again.
    """
    from industry_structure.peers import peer_columns  # noqa: PLC0415

    ratio_sel = ", ".join(f'f."{c}"' for c in cols)
    return (
        "SELECT " + peer_columns(with_industry=True) + ", " + ratio_sel
        + peer_from_where(year=True)
    )


def _rows_by_industry(
    conn: sqlite3.Connection,
    year: int,
    *,
    cols: tuple[str, ...] = _RANK_COLS,
) -> dict[str, list[Peer]]:
    """Fetch one year and group de-duplicated rows by industry (H2, H9)."""
    grouped: dict[str, list[Peer]] = {}
    for r in conn.execute(_cross_industry_sql(cols), (year,)).fetchall():
        ind = r["t_industry"]
        if ind is None:
            continue
        grouped.setdefault(ind, []).append(_row_to_peer(
            r, year,
            ratios={col: r[col] for col in cols},
            name=r["Ticker"],
            industry=ind,
        ))
    return {ind: dedupe_listings(peers)[0] for ind, peers in grouped.items()}


def _industry_level_figures(peers: list[Any]) -> dict[str, float]:
    """cr4, cr8 and hhi from the industry's USD revenue shares."""
    total = sum(p.revenue_usd for p in peers)
    if total <= 0:
        return {}
    shares = sorted((p.revenue_usd / total for p in peers), reverse=True)
    return {
        "cr4": sum(shares[:4]),
        "cr8": sum(shares[:8]),
        "hhi": sum((s * 100) ** 2 for s in shares),
    }


def build_cross_industry_medians(
    conn: sqlite3.Connection,
    year: int,
) -> dict[str, dict[str, float]]:
    """Build {industry: {metric: median}} for all industries with >= 10 firms.

    Two SQL queries: one for the given year, one for five years earlier
    (revenue only, for ``revenueCagr5y``). Medians and the industry-level
    figures are computed in Python. Cached for ``_CACHE_TTL`` seconds
    behind a per-key lock, so concurrent cold requests build once.
    """
    cache_key = f"medians_{year}"
    with _lock:
        if _is_key_fresh(cache_key):
            return _cache[cache_key][0]

    with _lock_for(cache_key):
        with _lock:
            if _is_key_fresh(cache_key):
                return _cache[cache_key][0]
        result = _build_cross_industry_medians(conn, year)
        _store(cache_key, result)
        return result


def _build_cross_industry_medians(
    conn: sqlite3.Connection,
    year: int,
) -> dict[str, dict[str, float]]:
    by_industry = _rows_by_industry(conn, year)

    # Second pass, five years back: total USD revenue only.
    revenue_then: dict[str, float] = {
        ind: sum(p.revenue_usd for p in peers)
        for ind, peers in _rows_by_industry(
            conn, year - 5, cols=_REVENUE_ONLY_COLS,
        ).items()
    }

    result: dict[str, dict[str, float]] = {}
    for ind, peers in by_industry.items():
        if len(peers) < _MIN_FIRMS:
            continue

        per_metric: dict[str, list[float]] = {
            k: [] for k in _METRIC_DEFS if k not in _INDUSTRY_LEVEL_KEYS
        }
        for p in peers:
            row_dict = p.ratios
            capex_abs = _capex_abs(row_dict.get("Capital Expenditure"))
            for key in per_metric:
                if key == "capexToRevenue":
                    val = _safe_ratio(capex_abs, row_dict.get("Revenue"))
                else:
                    val = _compute_metric(row_dict, key)
                if val is not None:
                    per_metric[key].append(val)

        med_dict: dict[str, float] = {
            key: statistics.median(vals)
            for key, vals in per_metric.items()
            if len(vals) >= 3  # need at least a few for a meaningful median
        }
        med_dict.update(_industry_level_figures(peers))

        rev_now = sum(p.revenue_usd for p in peers)
        rev_then = revenue_then.get(ind, 0.0)
        if rev_now > 0 and rev_then > 0:
            med_dict["revenueCagr5y"] = math.log(rev_now / rev_then) / 5

        if med_dict:
            result[ind] = med_dict

    return result


# ── Percentile rank ────────────────────────────────────────────────────────────

def percentile_rank(
    target_value: float,
    all_values: list[float],
) -> float:
    """Percentile rank with midpoint ties (Rule A item 5).

    Returns the share of values strictly below the target plus half the
    share of values equal to it:  ``(below + 0.5 * equal) / total``.
    """
    if not all_values:
        return 0.5
    total = len(all_values)
    below = sum(1 for v in all_values if v < target_value)
    equal = sum(1 for v in all_values if v == target_value)
    return (below + 0.5 * equal) / total


def rank_industry_metric(
    industry: str,
    metric_key: str,
    cross_medians: dict[str, dict[str, float]],
) -> Optional[float]:
    """Percentile rank of one industry's median for a metric.

    Returns None when the industry is not in the cross-industry table
    or the metric is unavailable.
    """
    ind_medians = cross_medians.get(industry)
    if ind_medians is None:
        return None
    target = ind_medians.get(metric_key)
    if target is None:
        return None

    all_vals = [
        m[metric_key]
        for m in cross_medians.values()
        if metric_key in m
    ]
    if not all_vals:
        return None
    return percentile_rank(target, all_vals)


def ranked_value(
    value: Optional[float],
    industry: str,
    metric_key: str,
    cross_medians: dict[str, dict[str, float]],
) -> dict[str, Any]:
    """Return ``{"value": x, "percentile": p}`` for a scalar figure."""
    pct = rank_industry_metric(industry, metric_key, cross_medians)
    return {"value": value, "percentile": pct}
