"""
betas/segment_store.py — persistence + coverage math for 10-K segment revenues.

Rows come from edgar_client's XBRL parse and are keyed (cik, fy, axis, segment).
The resolver reads the newest fiscal year for a CIK and prefers the 'business'
axis over 'product' (which is only stored when the business axis was absent).
"""

from __future__ import annotations

import datetime as _dt
import sqlite3
from dataclasses import dataclass

from .schema import ensure_betas_schema


@dataclass(frozen=True)
class SegmentRow:
    segment: str
    revenue: float
    axis: str
    consolidated_revenue: float | None


def upsert_segments(
    conn: sqlite3.Connection,
    *,
    cik: str,
    fy: int,
    axis: str,
    segments: dict[str, float],
    consolidated_revenue: float | None,
    accession: str | None,
    unit: str | None,
) -> int:
    """Replace the (cik, fy, axis) segment set with a fresh parse. Returns rows."""
    ensure_betas_schema(conn)
    now = _dt.datetime.now().isoformat(timespec="seconds")
    conn.execute(
        "DELETE FROM segment_revenue WHERE cik = ? AND fy = ? AND axis = ?",
        [cik, fy, axis],
    )
    n = 0
    for segment, revenue in segments.items():
        conn.execute(
            """INSERT INTO segment_revenue
                   (cik, fy, segment, axis, revenue, consolidated_revenue,
                    accession, unit, fetched_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [cik, fy, segment, axis, revenue, consolidated_revenue,
             accession, unit, now],
        )
        n += 1
    conn.commit()
    return n


def latest_segments(conn: sqlite3.Connection, cik: str) -> tuple[int, list[SegmentRow]] | None:
    """Newest fiscal year's segments for a CIK, preferring the business axis.
    Returns (fy, rows) or None when nothing is stored."""
    try:
        row = conn.execute(
            "SELECT MAX(fy) FROM segment_revenue WHERE cik = ?", [cik]).fetchone()
    except sqlite3.OperationalError:
        return None
    fy = row[0] if row else None
    if fy is None:
        return None
    for axis in ("business", "product"):
        rows = conn.execute(
            """SELECT segment, revenue, axis, consolidated_revenue
               FROM segment_revenue WHERE cik = ? AND fy = ? AND axis = ?
               ORDER BY revenue DESC""",
            [cik, fy, axis],
        ).fetchall()
        if rows:
            return int(fy), [SegmentRow(r[0], float(r[1]), r[2],
                                        float(r[3]) if r[3] is not None else None)
                             for r in rows]
    return None


def segment_sum_ratio(rows: list[SegmentRow]) -> float | None:
    """Σ(segment revenue) / consolidated revenue — the sanity check that catches
    double-counted axes and un-eliminated intersegment revenue. None when the
    consolidated total is unknown."""
    if not rows:
        return None
    consolidated = rows[0].consolidated_revenue
    if consolidated is None or consolidated <= 0:
        return None
    return sum(r.revenue for r in rows if r.revenue > 0) / consolidated


def stored_fy(conn: sqlite3.Connection, cik: str) -> int | None:
    """Newest stored fiscal year for a CIK (staleness check for re-fetch)."""
    try:
        row = conn.execute(
            "SELECT MAX(fy) FROM segment_revenue WHERE cik = ?", [cik]).fetchone()
        return int(row[0]) if row and row[0] is not None else None
    except sqlite3.OperationalError:
        return None
