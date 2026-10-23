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
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator, Optional

STALE_AFTER = dt.timedelta(minutes=20)
REBUILD_AFTER = dt.timedelta(hours=24)
RETRY_FAILED_AFTER = dt.timedelta(hours=1)
STALE_ERROR = "The build did not finish."
SUGGEST_STALE_AFTER = dt.timedelta(minutes=15)
SUGGEST_STALE_ERROR = "The check did not finish."
MAX_MAP_RIVALS = 8

_SCHEMA = (
    "CREATE TABLE IF NOT EXISTS relationship_maps ("
    " ticker TEXT PRIMARY KEY, status TEXT NOT NULL, payload TEXT,"
    " built_at TEXT, error TEXT, attempts INTEGER NOT NULL DEFAULT 0,"
    " started_at TEXT)"
)
_SUGGEST_SCHEMA = (
    "CREATE TABLE IF NOT EXISTS relationship_suggestions ("
    " id TEXT PRIMARY KEY, ticker TEXT NOT NULL, grp TEXT NOT NULL, name TEXT NOT NULL,"
    " status TEXT NOT NULL, result TEXT, created_at TEXT NOT NULL)"
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
        conn.execute(_SUGGEST_SCHEMA)
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


def save_payload(ticker: str, payload: dict[str, Any]) -> None:
    """Replace a READY map's payload in place (a reader's added link).
    ``built_at`` and the status are left as they are."""
    with _connect() as conn:
        conn.execute(
            "UPDATE relationship_maps SET payload = ? WHERE ticker = ? AND status = 'ready'",
            (json.dumps(payload), ticker),
        )


def map_version(v: dict[str, Any]) -> Optional[str]:
    """The stamp that changes whenever a ready map's content changes: an
    added link sets ``updatedAt``, a rebuild sets a new ``builtAt``."""
    return v.get("updatedAt") or v.get("builtAt")


def ready_view(ticker: str) -> Optional[dict[str, Any]]:
    """The READY map view, or None (no map, not ready, or store unreadable)."""
    try:
        v = view(get_row(ticker), dt.datetime.now(dt.timezone.utc))
    except sqlite3.Error:
        return None
    return v if v.get("status") == "ready" else None


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
    return map_version(v), tuple(sorted(found))


def map_rivals(v: Optional[dict[str, Any]], ticker: str,
               cap: int = MAX_MAP_RIVALS) -> tuple[str, ...]:
    """Every in-database competitor of a ready map view, in map order, once
    each, the company itself excluded, at most ``cap``. Pure."""
    out: list[str] = []
    comp = ((v or {}).get("groups") or {}).get("competitors") or {}
    for cat in comp.get("categories") or []:
        for link in cat.get("links") or []:
            tk = link.get("resolvedTicker")
            if link.get("inDatabase") and tk and tk != ticker.upper() and tk not in out:
                out.append(tk)
    return tuple(out[:cap])


# -- Suggestions: a reader asks for one company to be checked and added --

def create_suggestion(ticker: str, group: str, name: str, now: dt.datetime,
                      status: str = "checking",
                      result: Optional[dict[str, Any]] = None) -> str:
    sid = uuid.uuid4().hex
    with _connect() as conn:
        conn.execute(
            "INSERT INTO relationship_suggestions (id, ticker, grp, name, status, result,"
            " created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (sid, ticker, group, name, status,
             json.dumps(result) if result is not None else None, iso(now)),
        )
    return sid


def finish_suggestion(sid: str, status: str, result: dict[str, Any]) -> None:
    with _connect() as conn:
        conn.execute(
            "UPDATE relationship_suggestions SET status = ?, result = ? WHERE id = ?",
            (status, json.dumps(result), sid),
        )


def get_suggestion(sid: str) -> Optional[dict[str, Any]]:
    with _connect() as conn:
        r = conn.execute(
            "SELECT * FROM relationship_suggestions WHERE id = ?", (sid,),
        ).fetchone()
    return dict(r) if r else None


def suggestion_view(row: Optional[dict[str, Any]], now: dt.datetime) -> Optional[dict[str, Any]]:
    """What GET returns for a suggestion row. A "checking" row older than
    ``SUGGEST_STALE_AFTER`` reads as failed. Pure."""
    if row is None:
        return None
    if row.get("status") == "checking":
        created = _parse_iso(row.get("created_at"))
        if created is not None and now - created <= SUGGEST_STALE_AFTER:
            return {"status": "checking"}
        return {"status": "failed", "error": SUGGEST_STALE_ERROR}
    try:
        result = json.loads(row.get("result") or "{}")
    except ValueError:
        result = {}
    return {**(result if isinstance(result, dict) else {}), "status": row.get("status")}


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


def rebuild_reason(v: dict[str, Any], current_filing_year: Optional[int],
                   prompt_version: int) -> Optional[str]:
    """Why a READY map may be rebuilt before the cooldown, or None.

    "new prompt" when the map was built from an older question (a payload
    with no ``promptVersion`` is version 1); "new annual filing" when the
    ticker now has a fiscal year later than the map's ``latestFilingYear``.
    """
    if v.get("status") != "ready":
        return None
    try:
        built_version = int(v.get("promptVersion") or 1)
    except (TypeError, ValueError):
        built_version = 1
    if built_version < prompt_version:
        return "new prompt"
    built_year = v.get("latestFilingYear")
    if (isinstance(built_year, int) and isinstance(current_filing_year, int)
            and current_filing_year > built_year):
        return "new annual filing"
    return None


def decide_build(now: dt.datetime, row: Optional[dict[str, Any]], refresh: bool,
                 current_filing_year: Optional[int] = None,
                 prompt_version: int = 1) -> bool:
    """Start a build when there is no map or the last one failed, or when a
    refresh is asked for and the ready map is older than ``REBUILD_AFTER``
    or has a ``rebuild_reason`` (new prompt, new annual filing).
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
        if built is None or now - built > REBUILD_AFTER:
            return True
        return rebuild_reason(v, current_filing_year, prompt_version) is not None
    return False
