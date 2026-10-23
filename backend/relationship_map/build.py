"""Run one relationship-map build: ask the RAG server, validate, resolve, save.

At most ONE build runs in the process at a time (``_LOCK``); a second start
while one is running is answered "busy" and starts nothing. The build runs
on a daemon thread so the POST that asked for it returns at once. The RAG
call, the DB connection factory and the symbol resolver are all injected,
so tests never reach the real RAG server or ``financials.db``.
"""

from __future__ import annotations

import datetime as dt
import json
import logging
import os
import threading
import urllib.request
from typing import Any, Callable, ContextManager, Optional

from relationship_map import parse, store
from relationship_map.prompt import PROMPT_VERSION, build_question

log = logging.getLogger(__name__)

ASK_TIMEOUT_S = 600
PEERS_IN_DATA = 15

# ponytail: one process-wide lock, so one paid build at a time on the single
# uvicorn worker; move to a row-level claim in the store if workers > 1.
_LOCK = threading.Lock()

# Spend cap across all visitors. ponytail: in-process count, resets on a
# restart; move into the store if restarts become frequent.
MAX_BUILDS_PER_DAY = 40
_BUILDS_TODAY: dict[str, int] = {}

AskFn = Callable[[str, str, str], dict]
ConnFactory = Callable[[], ContextManager[Any]]


def _utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def rag_ask(question: str, context: str, data: str) -> dict:
    """POST the fixed question to the RAG server's /ask. Returns its JSON."""
    base = os.environ.get("RAG_URL", "http://127.0.0.1:3001").rstrip("/")
    body = json.dumps({
        "question": question, "context": context,
        "section": "comparative", "data": data,
    }).encode()
    req = urllib.request.Request(
        f"{base}/ask", data=body,
        headers={"Content-Type": "application/json"}, method="POST",
    )
    with urllib.request.urlopen(req, timeout=ASK_TIMEOUT_S) as resp:  # noqa: S310 (fixed local URL)
        out = json.loads(resp.read())
    return out if isinstance(out, dict) else {}


def is_busy() -> bool:
    return _LOCK.locked()


def take_daily_slot(now: dt.datetime) -> bool:
    """Count one paid Ask AI call against ``MAX_BUILDS_PER_DAY``; False (and
    nothing counted) when today's cap is spent. Shared by map builds and
    suggestion checks. Callers hold their own lock, and the GIL makes this
    small read-modify-write safe enough for the two of them."""
    day = now.date().isoformat()
    if day not in _BUILDS_TODAY:
        _BUILDS_TODAY.clear()
    if _BUILDS_TODAY.get(day, 0) >= MAX_BUILDS_PER_DAY:
        return False
    _BUILDS_TODAY[day] = _BUILDS_TODAY.get(day, 0) + 1
    return True


def latest_filing_year(conn: Any, ticker: str) -> Optional[int]:
    """The ticker's latest annual ``Calendar Year`` in ``financials``, or None."""
    r = conn.execute(
        'SELECT MAX(CAST("Calendar Year" AS INTEGER)) FROM financials WHERE Ticker = ?',
        (ticker,),
    ).fetchone()
    return int(r[0]) if r and r[0] is not None else None


def context_data(conn: Any, ticker: str, name: str, sector: Optional[str],
                 industry: Optional[str]) -> str:
    """The database facts sent with the question: who the company is, its
    latest USD revenue, and the largest same-industry companies on file."""
    lines = [f"Company: {name} ({ticker})", f"Sector: {sector or 'unknown'}",
             f"Industry: {industry or 'unknown'}"]
    peers = None
    if industry:
        from company_profile.common import industry_peer_set  # noqa: PLC0415
        peers = industry_peer_set(conn, industry)
    if peers is not None:
        own = next((p for p in peers.peers if p.ticker.upper() == ticker), None)
        if own is not None and own.revenue_usd:
            lines.append(
                f"Latest revenue (USD, fiscal {peers.fiscal_year}): {own.revenue_usd:,.0f}")
        others = sorted(
            (p for p in peers.peers if p.ticker.upper() != ticker),
            key=lambda p: p.revenue_usd or 0.0, reverse=True,
        )[:PEERS_IN_DATA]
        if others:
            lines.append(
                "Largest companies in the same industry in this database (name, ticker): "
                + "; ".join(f"{p.name} ({p.ticker})" for p in others))
    return "\n".join(lines)


def resolve_links(conn: Any, groups: dict[str, Any], resolve: Callable[[str], str]) -> None:
    """Fill ``resolvedTicker`` and ``inDatabase`` on every link in place.

    ``inDatabase`` is true only when the resolved symbol is in ``tickers``
    AND has at least one ``financials`` row (an exact-key lookup, so it
    uses the primary-key index)."""
    seen: dict[str, bool] = {}
    for link in parse.iter_links(groups):
        tk = link.get("ticker")
        if not tk:
            continue
        resolved = resolve(tk)
        link["resolvedTicker"] = resolved
        if resolved not in seen:
            in_tickers = conn.execute(
                "SELECT 1 FROM tickers WHERE UPPER(ticker) = ? LIMIT 1", (resolved,),
            ).fetchone() is not None
            seen[resolved] = in_tickers and conn.execute(
                "SELECT 1 FROM financials WHERE Ticker = ? LIMIT 1", (resolved,),
            ).fetchone() is not None
        link["inDatabase"] = seen[resolved]


def run_build(ticker: str, name: str, sector: Optional[str], industry: Optional[str], *,
              conn_factory: ConnFactory, resolve: Callable[[str], str],
              ask: AskFn, now_fn: Callable[[], dt.datetime] = _utcnow) -> None:
    """The synchronous build. Always leaves the row ready or failed."""
    try:
        with conn_factory() as conn:
            data = context_data(conn, ticker, name, sector, industry)
        resp = ask(build_question(name, ticker), f"{ticker} {name}", data)
        obj = parse.extract_last_json((resp or {}).get("answer"))
        if obj is None:
            store.mark_failed(ticker, "Ask AI did not return a map.", now_fn())
            return
        result = parse.validate_map(obj)
        if result["linkCount"] == 0:
            store.mark_failed(ticker, "no sourced links", now_fn())
            return
        with conn_factory() as conn:
            resolve_links(conn, result["groups"], resolve)
            filing_year = latest_filing_year(conn, ticker)
        now = now_fn()
        store.mark_ready(ticker, {
            "ticker": ticker,
            "name": name,
            "builtAt": store.iso(now),
            "promptVersion": PROMPT_VERSION,
            "latestFilingYear": filing_year,
            "groups": result["groups"],
            "linkCount": result["linkCount"],
            "droppedNoSource": result["droppedNoSource"],
            "sources": parse.clean_sources((resp or {}).get("sources")),
        }, now)
    except Exception as exc:  # noqa: BLE001 — a build must never stay "building"
        log.warning("[relationship_map] build for %s failed: %s", ticker, exc)
        store.mark_failed(ticker, "Ask AI could not build the map right now.", now_fn())


def start_build(ticker: str, name: str, sector: Optional[str], industry: Optional[str], *,
                refresh: bool, conn_factory: ConnFactory, resolve: Callable[[str], str],
                ask: Optional[AskFn] = None, now_fn: Callable[[], dt.datetime] = _utcnow,
                current_filing_year: Optional[int] = None) -> str:
    """``"started"``, ``"busy"`` (another build holds the lock) or
    ``"skipped"`` (the cooldown rule, re-checked under the lock, says no)."""
    if not _LOCK.acquire(blocking=False):
        return "busy"
    try:
        if not store.decide_build(now_fn(), store.get_row(ticker), refresh,
                                  current_filing_year, PROMPT_VERSION):
            _LOCK.release()
            return "skipped"
        if not take_daily_slot(now_fn()):
            _LOCK.release()
            return "busy"
        store.mark_building(ticker, now_fn())
    except Exception:
        _LOCK.release()
        raise

    def _target() -> None:
        try:
            run_build(ticker, name, sector, industry, conn_factory=conn_factory,
                      resolve=resolve, ask=ask or rag_ask, now_fn=now_fn)
        finally:
            _LOCK.release()

    threading.Thread(target=_target, name=f"relmap-{ticker}", daemon=True).start()
    return "started"
