"""Shared helper functions for industry structure evidence blocks."""

from __future__ import annotations

import sqlite3
import statistics
from typing import Any, Optional

from group_sql import named_group_sql
from industry_structure.peers import Peer


def sector_of(conn: sqlite3.Connection, industry: str) -> Optional[str]:
    """The sector one industry sits in, or None when the warehouse does not say.

    The structure builder, the strategic group map and the connections bundle
    each asked this question with their own copy of the query. They ask it here
    now, so the blank-group guard cannot be dropped from one of them.
    """
    row = conn.execute(
        f"SELECT sector FROM tickers WHERE industry = ? AND {named_group_sql('sector')}"
        " LIMIT 1",
        (industry,),
    ).fetchone()
    return row["sector"] if row else None


def _safe_div(a: Any, b: Any) -> Optional[float]:
    if a is None or b is None:
        return None
    try:
        fa, fb = float(a), float(b)
    except (TypeError, ValueError):
        return None
    if fb == 0:
        return None
    return fa / fb


def _median_of(values: list[float]) -> Optional[float]:
    if not values:
        return None
    return statistics.median(values)


def _iqr_of(values: list[float]) -> Optional[float]:
    if len(values) < 4:
        return None
    s = sorted(values)
    n = len(s)
    q1 = s[n // 4]
    q3 = s[3 * n // 4]
    return q3 - q1


def _peer_ratio(peer: Peer, num_col: str, denom_col: str) -> Optional[float]:
    return _safe_div(peer.ratios.get(num_col), peer.ratios.get(denom_col))


def _peer_val(peer: Peer, col: str) -> Optional[float]:
    v = peer.ratios.get(col)
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _abs_val(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        return abs(float(v))
    except (TypeError, ValueError):
        return None
