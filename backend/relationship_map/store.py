"""SQLite store for relationship maps, plus the pure status rules.

One row per company in ``relationship_maps.db`` (``RELATIONSHIP_MAPS_DB``
overrides the path). Every access opens and closes its own connection, and
the table is created on first use. ``view`` and ``decide_build`` are pure:
they take the row and the clock and never touch the file.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator, Optional

STALE_AFTER = dt.timedelta(minutes=20)
REBUILD_AFTER = dt.timedelta(hours=24)
RETRY_FAILED_AFTER = dt.timedelta(hours=1)
STALE_ERROR = "The build did not finish."

_SCHEMA = (
    "CREATE TABLE IF NOT EXISTS relationship_maps ("
    " ticker TEXT PRIMARY KEY, status TEXT NOT NULL, payload TEXT,"
    " built_at TEXT, error TEXT, attempts INTEGER NOT NULL DEFAULT 0,"
    " started_at TEXT)"
)


def db_path() -> Path:
    env = os.environ.get("RELATIONSHIP_MAPS_DB")
    return Path(env) if env else Path(__file__).resolve().parent.parent / "relationship_maps.db"


@contextmanager
def _connect() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(str(db_path()), timeout=10.0)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute(_SCHEMA)
        yield conn
        conn.commit()
    finally:
        conn.close()


def iso(t: dt.datetime) -> str:
    return t.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse_iso(s: Any) -> Optional[dt.datetime]:
    if not isinstance(s, str) or not s:
        return None
    try:
        t = dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None
    return t if t.tzinfo else t.replace(tzinfo=dt.timezone.utc)


# ── Reads and writes ────────────────────────────────────────────────────────

def get_row(ticker: str) -> Optional[dict[str, Any]]:
    with _connect() as conn:
        r = conn.execute(
            "SELECT * FROM relationship_maps WHERE ticker = ?", (ticker,),
        ).fetchone()
    return dict(r) if r else None


def mark_building(ticker: str, now: dt.datetime) -> None:
    """Start a build. A previous ready map (payload, built_at) is kept."""
    with _connect() as conn:
        conn.execute(
            "INSERT INTO relationship_maps (ticker, status, attempts, started_at)"
            " VALUES (?, 'building', 1, ?)"
            " ON CONFLICT(ticker) DO UPDATE SET status = 'building',"
            " attempts = attempts + 1, started_at = excluded.started_at",
            (ticker, iso(now)),
        )


def mark_ready(ticker: str, payload: dict[str, Any], now: dt.datetime) -> None:
    with _connect() as conn:
        conn.execute(
            "UPDATE relationship_maps SET status = 'ready', payload = ?,"
            " built_at = ?, error = NULL WHERE ticker = ?",
            (json.dumps(payload), iso(now), ticker),
        )


def mark_failed(ticker: str, error: str, now: dt.datetime) -> None:
    """Record a failed build. A previous ready map stays readable: a failed
    rebuild must not take away a map every reader was already seeing."""
    with _connect() as conn:
        conn.execute(
            "UPDATE relationship_maps SET"
            " status = CASE WHEN payload IS NULL THEN 'failed' ELSE 'ready' END,"
            " built_at = CASE WHEN payload IS NULL THEN ? ELSE built_at END,"
            " error = ? WHERE ticker = ?",
            (iso(now), error, ticker),
        )


def ready_competitors(ticker: str) -> tuple[Optional[str], tuple[str, ...]]:
    """``(builtAt, sorted in-database competitor tickers)`` of a READY map.

    ``(None, ())`` when there is no ready map or the store cannot be read: the
    rivals table then behaves exactly as it did before maps existed.
    """
    try:
        v = view(get_row(ticker), dt.datetime.now(dt.timezone.utc))
    except sqlite3.Error:
        return None, ()
    if v.get("status") != "ready":
        return None, ()
    comp = (v.get("groups") or {}).get("competitors") or {}
    found = {
        link["resolvedTicker"]
        for cat in comp.get("categories") or []
        for link in cat.get("links") or []
        if link.get("inDatabase") and link.get("resolvedTicker")
    }
    return v.get("builtAt"), tuple(sorted(found))


# ── Pure status rules ───────────────────────────────────────────────────────

def _ready_view(row: dict[str, Any]) -> Optional[dict[str, Any]]:
    try:
        payload = json.loads(row.get("payload") or "")
    except (TypeError, ValueError):
        return None
    if not isinstance(payload, dict):
        return None
    return {"status": "ready", **payload}


def view(row: Optional[dict[str, Any]], now: dt.datetime) -> dict[str, Any]:
    """What GET returns for a stored row.

    A build left "building" longer than ``STALE_AFTER`` is treated as failed
    (or as the previous ready map, when there is one)."""
    if row is None:
        return {"status": "none"}
    status = row.get("status")
    if status == "building":
        started = _parse_iso(row.get("started_at"))
        if started is not None and now - started <= STALE_AFTER:
            return {"status": "building", "startedAt": row.get("started_at")}
        ready = _ready_view(row) if row.get("payload") else None
        return ready or {"status": "failed", "error": STALE_ERROR,
                         "builtAt": row.get("started_at")}
    if status == "ready":
        ready = _ready_view(row)
        if ready is not None:
            return ready
        return {"status": "failed", "error": "The saved map could not be read.",
                "builtAt": row.get("built_at")}
    return {"status": "failed", "error": row.get("error") or "The build failed.",
            "builtAt": row.get("built_at")}


def decide_build(now: dt.datetime, row: Optional[dict[str, Any]], refresh: bool) -> bool:
    """Start a build when there is no map or the last one failed, or when a
    refresh is asked for and the ready map is older than ``REBUILD_AFTER``.
    A build in progress is never restarted."""
    v = view(row, now)
    if v["status"] == "none":
        return True
    if v["status"] == "failed":
        # A failed build cost money too: wait before trying again.
        failed = _parse_iso(v.get("builtAt"))
        return failed is None or now - failed > RETRY_FAILED_AFTER
    if v["status"] == "ready" and refresh:
        built = _parse_iso(v.get("builtAt"))
        return built is None or now - built > REBUILD_AFTER
    return False
