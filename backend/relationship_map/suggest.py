"""Add one company to a READY map at a reader's request (Head to Head B5).

The reader names a company and a group; Ask AI answers a FIXED question
(``prompt.SUGGEST_TEMPLATE``) and the link it returns goes through the same
``parse`` rules as a full build. A valid link is appended to the shared map;
anything else is answered "not-added" with the AI's reason and the map is
left alone.

Cost guards: at most ONE check runs in the process at a time (its own
``_LOCK``, separate from the build lock), and every check counts toward the
same ``build.MAX_BUILDS_PER_DAY`` as a full build. A name already in that
group is answered at once with the existing link and costs nothing.
"""

from __future__ import annotations

import copy
import datetime as dt
import json
import logging
import threading
from typing import Any, Callable, Optional

from relationship_map import build, parse, store
from relationship_map.prompt import SUGGESTION_GROUPS, build_suggest_question, clean_name

log = logging.getLogger(__name__)

REQUEST_CATEGORY = "Added at a reader's request"
NO_MAP = "Build the relationship map first."
FULL = "That group of the map is full."
NO_SOURCE = "Ask AI did not give a source the reader can open."
UNREADABLE = "Ask AI did not return an answer that could be read."
FAILED = "Ask AI could not check this company right now."

# ponytail: one process-wide lock, one paid check at a time on the single
# uvicorn worker; move to a row-level claim in the store if workers > 1.
_LOCK = threading.Lock()


def is_busy() -> bool:
    return _LOCK.locked()


def find_existing(v: dict[str, Any], group: str, name: str) -> Optional[tuple[dict, str]]:
    """``(link, category)`` of a link in ``group`` whose name matches ``name``
    ignoring case, or None. Pure."""
    want = name.casefold()
    for cat in ((v.get("groups") or {}).get(group) or {}).get("categories") or []:
        for link in cat.get("links") or []:
            if str(link.get("name", "")).casefold() == want:
                return link, cat["category"]
    return None


def add_link(payload: dict[str, Any], group: str, link: dict[str, Any],
             category: str) -> Optional[str]:
    """Append ``link`` to ``payload`` in place. Returns the category used, or
    None when there is no room.

    The category is matched by name ignoring case; a new one is opened when
    there is room for a category. A full category (``MAX_LINKS``) sends the
    link to ``REQUEST_CATEGORY`` instead, under the same caps."""
    groups = payload.setdefault("groups", {})
    g = groups.setdefault(group, {"suggestion": group in SUGGESTION_GROUPS, "categories": []})
    cats = g["categories"]
    for wanted in (category, REQUEST_CATEGORY):
        cat = next((c for c in cats if c["category"].casefold() == wanted.casefold()), None)
        if cat is None:
            if len(cats) >= parse.MAX_CATEGORIES:
                continue
            cat = {"category": wanted, "links": []}
            cats.append(cat)
        if len(cat["links"]) < parse.MAX_LINKS:
            cat["links"].append(link)
            payload["linkCount"] = int(payload.get("linkCount") or 0) + 1
            return cat["category"]
    return None


def _added(link: dict, group: str, category: str) -> dict[str, Any]:
    return {"link": link, "group": group, "category": category}


def _not_added(reason: str, name: str, group: str) -> dict[str, Any]:
    return {"reason": reason, "name": name, "group": group}


def check(ticker: str, company: str, group: str, name: str, *,
          conn_factory: build.ConnFactory, resolve: Callable[[str], str],
          ask: build.AskFn, now_fn: Callable[[], dt.datetime]) -> tuple[str, dict[str, Any]]:
    """The synchronous check: ``(status, result)``, status "added",
    "not-added" or "failed". Saves the map only on "added"."""
    v = store.ready_view(ticker)
    if v is None:
        return "failed", {"error": NO_MAP}
    group_cats = ((v.get("groups") or {}).get(group) or {}).get("categories") or []
    data = json.dumps({"company": company, "ticker": ticker, "group": group,
                       "categories": [c["category"] for c in group_cats]})
    resp = ask(build_suggest_question(name, group, company), f"{ticker} {company}", data)
    obj = parse.extract_last_json((resp or {}).get("answer"))
    if obj is None:
        return "failed", {"error": UNREADABLE}
    reason = parse.clean_text(obj.get("reason"), 400)
    raw_link = obj.get("link")
    if not isinstance(raw_link, dict):
        return "not-added", _not_added(reason or "Ask AI found that it does not belong.",
                                       name, group)
    checked = parse.validate_map({"groups": {group: [{"category": "x", "links": [raw_link]}]}})
    if checked["linkCount"] == 0:
        return "not-added", _not_added(NO_SOURCE if checked["droppedNoSource"]
                                       else (reason or NO_SOURCE), name, group)
    link = checked["groups"][group]["categories"][0]["links"][0]
    link["addedOnRequest"] = True
    with conn_factory() as conn:
        build.resolve_links(conn, {group: {"categories": [{"links": [link]}]}}, resolve)

    # Re-read: the map may have changed while Ask AI was answering.
    v = store.ready_view(ticker)
    if v is None:
        return "failed", {"error": NO_MAP}
    existing = find_existing(v, group, link["name"])
    if existing is not None:
        return "added", _added(existing[0], group, existing[1])
    payload = copy.deepcopy({k: val for k, val in v.items() if k != "status"})
    used = add_link(payload, group, link,
                    parse.clean_text(obj.get("category"), 80) or REQUEST_CATEGORY)
    if used is None:
        return "not-added", _not_added(FULL, name, group)
    payload["updatedAt"] = store.iso(now_fn())
    store.save_payload(ticker, payload)
    return "added", _added(link, group, used)


def start_check(ticker: str, company: str, group: str, name: str, *,
                conn_factory: build.ConnFactory, resolve: Callable[[str], str],
                ask: Optional[build.AskFn] = None,
                now_fn: Callable[[], dt.datetime] = build._utcnow) -> dict[str, Any]:
    """What POST answers. ``{"status": "checking", "id"}`` when a paid check
    starts on a background thread; ``"added"`` at once for a duplicate name;
    ``"none"`` without a ready map; ``"busy"`` when a check is running or the
    daily cap is spent."""
    name = clean_name(name)
    v = store.ready_view(ticker)
    if v is None:
        return {"status": "none", "reason": NO_MAP}
    existing = find_existing(v, group, name)
    if existing is not None:
        result = _added(existing[0], group, existing[1])
        sid = store.create_suggestion(ticker, group, name, now_fn(), "added", result)
        return {"status": "added", "id": sid, **result}
    if not _LOCK.acquire(blocking=False):
        return {"status": "busy"}
    try:
        if not build.take_daily_slot(now_fn()):
            _LOCK.release()
            return {"status": "busy"}
        sid = store.create_suggestion(ticker, group, name, now_fn())
    except Exception:
        _LOCK.release()
        raise

    def _target() -> None:
        try:
            status, result = check(ticker, company, group, name, conn_factory=conn_factory,
                                   resolve=resolve, ask=ask or build.rag_ask, now_fn=now_fn)
        except Exception as exc:  # noqa: BLE001 - a check must never stay "checking"
            log.warning("[relationship_map] suggestion %s for %s failed: %s", sid, ticker, exc)
            status, result = "failed", {"error": FAILED}
        try:
            store.finish_suggestion(sid, status, result)
        finally:
            _LOCK.release()

    threading.Thread(target=_target, name=f"relmap-suggest-{ticker}", daemon=True).start()
    return {"status": "checking", "id": sid}
