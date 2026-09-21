"""Shared numeric + grouping helpers for the company_profile package.

One place for the three things every module here needs:

* ``safe_float`` / ``safe_div`` / ``r6`` — NaN and infinity never reach JSON.
  ``float("nan")`` and ``float("inf")`` are valid Python floats but invalid
  JSON, and a single one of them turns the whole snapshot into a 500.
* ``company_groups`` — ONE median-split call, so cost_structure, rivals and
  spreads cannot drift apart or from ``connections/bundle.py``.
* ``rank_desc`` — one direction-free ranking rule (highest value is rank 1,
  ties share the lowest rank, nulls are excluded from the count).
"""

from __future__ import annotations

import math
import sqlite3
import statistics
from typing import Any, Optional

from industry_structure.peers import PeerSet
from industry_structure.dimensions import default_axes, median_split_groups

# Below this many firms the group median rests on one or two observations.
# Reported as a count in ``dataNote``; nothing is suppressed and nothing is
# judged (Rule A).
MIN_GROUP_FIRMS = 3


def safe_float(v: Any) -> Optional[float]:
    """float(v) or None. NaN and +/-inf are None — they are not valid JSON."""
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def safe_div(a: Any, b: Any) -> Optional[float]:
    """a / b as a finite float, or None."""
    fa, fb = safe_float(a), safe_float(b)
    if fa is None or fb is None or fb == 0:
        return None
    try:
        out = fa / fb
    except (ZeroDivisionError, OverflowError):
        return None
    return out if math.isfinite(out) else None


def r6(v: Optional[float]) -> Optional[float]:
    """Round to six places, dropping non-finite values."""
    f = safe_float(v)
    return round(f, 6) if f is not None else None


def median_of(values: list[Any]) -> Optional[float]:
    """Median of the finite values, or None when there are none."""
    vals = [f for f in (safe_float(v) for v in values) if f is not None]
    return statistics.median(vals) if vals else None


def company_groups(
    now_peers: PeerSet,
    sector: Optional[str],
) -> dict[str, Optional[str]]:
    """{ticker: median-split group label} over the WHOLE peer set.

    The peer list passed to ``median_split_groups`` is what decides the two
    medians, so it decides the labels. This uses every peer in the set, which
    is exactly what ``connections/bundle.py`` (the block that *displays* the
    company's group) does, so the label shown here and the label shown there
    are the same string.

    ``connections/splits.py#build_margin_split`` runs the same split over a
    subset (peers with positive revenue AND a non-null Operating Income). On
    every industry measured that subset is the full set, so the labels agree;
    it is a latent divergence, not a live one, and splits.py is owned
    elsewhere. ``test_group_label_matches_connections`` locks the agreement so
    a future data change cannot break it silently.
    """
    x_key, y_key = default_axes(sector)
    peer_dicts = [{"ticker": p.ticker, "ratios": p.ratios} for p in now_peers.peers]
    return median_split_groups(peer_dicts, x_key, y_key)


def cogs_plus_sga(ratios: dict[str, Any]) -> Optional[float]:
    """(COGS + SG&A) / Revenue. BOTH lines required.

    A bank reports SG&A and no cost of revenue. Substituting 0 for the
    missing COGS published its SG&A ratio under a "cost of goods plus SG&A"
    heading and ranked it as the leanest firm in its industry. Banks and
    REITs get ``None`` here, never a zero.
    """
    cogs = safe_div(ratios.get("Cost Of Revenue"), ratios.get("Revenue"))
    sga = safe_div(
        ratios.get("Selling General And Administrative Expenses"),
        ratios.get("Revenue"),
    )
    if cogs is None or sga is None:
        return None
    return cogs + sga


def industry_peer_set(conn: sqlite3.Connection, industry: str) -> Optional[PeerSet]:
    """The industry's latest-year peer set, from the ONE shared 30-min cache.

    ``connections/sector_cache.py`` already caches the industry panel, and
    the panel's latest-year PeerSet is the same object ``load_peers`` would
    rebuild. A reader looking at the page, at ``/api/individual/...`` and at
    the two profile routes therefore sees ONE peer set, one fiscal year and
    one set of strategic-group labels. Imported lazily: ``connections``
    imports only ``industry_structure``, so there is no cycle, and the lazy
    import keeps it that way if that ever changes.
    """
    from connections.sector_cache import get_industry_panel  # noqa: PLC0415
    panel = get_industry_panel(conn, industry)
    if panel is None:
        return None
    return panel.by_year.get(panel.fiscal_year)


def rank_desc(
    values: list[tuple[str, Optional[float]]],
    ticker: str,
) -> dict[str, Optional[int]]:
    """Position of ``ticker`` when the non-null values are sorted highest-first.

    Direction-free: the sort is always descending, so rank 1 means "largest
    number", never "best". Ties share the lowest (numerically smallest) rank,
    so two firms tied at the top are both rank 1 and the next firm is rank 3.
    Nulls are dropped, so ``count`` is the number of firms that actually
    reported the figure, not the size of the industry.
    """
    valid = [(t, f) for t, f in ((t, safe_float(v)) for t, v in values) if f is not None]
    count = len(valid)
    if count == 0:
        return {"rank": None, "count": 0}
    ordered = sorted(valid, key=lambda x: x[1], reverse=True)
    rank_map: dict[str, int] = {}
    current = 1
    for i, (t, v) in enumerate(ordered):
        if i > 0 and v < ordered[i - 1][1]:
            current = i + 1
        rank_map.setdefault(t, current)
    return {"rank": rank_map.get(ticker.upper()), "count": count}


def group_data_note(group_firm_count: Optional[int]) -> Optional[str]:
    """A count, not a judgement, when the strategic group is very small."""
    if group_firm_count is None:
        return None
    if group_firm_count < MIN_GROUP_FIRMS:
        return (
            f"The strategic group holds {group_firm_count} "
            f"{'firm' if group_firm_count == 1 else 'firms'}, so its median "
            f"rests on {group_firm_count} "
            f"{'observation' if group_firm_count == 1 else 'observations'}."
        )
    return None
