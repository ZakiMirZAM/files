"""Business profile for a company (plan 3.1).

Cache pattern follows ``backend/esg_data.py``.
"""

from __future__ import annotations

import logging
import os
import re
import sqlite3
import threading
import time
from typing import Any, Optional

log = logging.getLogger("company_profile")

_FRESHNESS_DAYS = 30
_10K_EXTRACT_CHARS = 4000
# yfinance is a blocking HTTP call inside a request. Cap it hard: a slow or
# hanging quote server must cost the individual page a couple of seconds, not
# the whole request.
_YF_TIMEOUT_SECONDS = 6.0
# After a failed fetch, do not try again for this long. Without it a ticker
# yfinance has no data for re-attempts the network on EVERY page view, because
# the cache row stays stale forever.
_FAIL_COOLDOWN_SECONDS = 3600.0
# yfinance's longBusinessSummary is free text from a third party. Cap it so a
# malformed response cannot write an unbounded blob into financials.db.
_SUMMARY_MAX_CHARS = 8000

_fail_until: dict[str, float] = {}
_ensured_dbs: set[str] = set()
_lock = threading.Lock()


def network_disabled() -> bool:
    """True when this process must not make a yfinance call.

    The backend test suite is network-free by contract, and pytest sets
    ``PYTEST_CURRENT_TEST`` for every test it runs, so a test that forgets to
    patch ``_fetch_yfinance`` still cannot reach the network.
    ``COMPANY_PROFILE_NETWORK=off`` is the operator switch.
    """
    if os.environ.get("COMPANY_PROFILE_NETWORK", "on").lower() == "off":
        return True
    return "PYTEST_CURRENT_TEST" in os.environ


# ── Table management ────────────────────────────────────────────────────────

_CREATE_SQL = """CREATE TABLE IF NOT EXISTS business_profile (
               ticker TEXT PRIMARY KEY,
               summary TEXT,
               website TEXT,
               country TEXT,
               employees INTEGER,
               ten_k_extract TEXT,
               fetched_at TEXT
           )"""


def _ensure_table(conn: sqlite3.Connection) -> None:
    """Create the cache table once per database, not once per request.

    The DDL is keyed on the connection's database file, so a fresh connection
    to an already-prepared financials.db skips the statement entirely and the
    read path never asks SQLite for a write lock the scheduled jobs may hold.
    """
    try:
        row = conn.execute("PRAGMA database_list").fetchone()
        db_key = (row[2] if row else "") or ":memory:"
    except sqlite3.Error:
        db_key = ":memory:"
    # An in-memory database is per-connection, so it can never be "already done".
    if db_key != ":memory:":
        with _lock:
            if db_key in _ensured_dbs:
                return
    conn.execute(_CREATE_SQL)
    conn.commit()
    if db_key != ":memory:":
        with _lock:
            _ensured_dbs.add(db_key)


def _is_stale(fetched_at: Optional[str]) -> bool:
    """Return True when the cached row is older than 30 days or missing."""
    if fetched_at is None:
        return True
    try:
        from datetime import datetime, timezone
        ts = datetime.fromisoformat(fetched_at.replace("Z", "+00:00"))
        age_days = (datetime.now(timezone.utc) - ts).total_seconds() / 86400
        return age_days > _FRESHNESS_DAYS
    except (ValueError, TypeError):
        return True


# ── yfinance fetch ──────────────────────────────────────────────────────────

def _resolve_yf_symbol(conn: sqlite3.Connection, ticker: str) -> str:
    """Use symbol_yf from security_map when it exists and differs."""
    try:
        row = conn.execute(
            "SELECT symbol_yf FROM security_map WHERE symbol = ?",
            (ticker.upper(),),
        ).fetchone()
        if row and row[0]:
            return row[0]
    except sqlite3.OperationalError:
        pass
    return ticker.upper()


def _yf_info(yf_symbol: str) -> Optional[dict[str, Any]]:
    """The raw blocking yfinance call, run on a worker thread by the caller."""
    try:
        import yfinance as yf
    except ImportError:
        return None
    try:
        return yf.Ticker(yf_symbol).info
    except Exception:  # noqa: BLE001 — any third-party failure is "no data"
        return None


def _as_int(v: Any) -> Optional[int]:
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _fetch_yfinance(yf_symbol: str) -> Optional[dict[str, Any]]:
    """Business info from yfinance, or None on failure or timeout.

    ``yf.Ticker(...).info`` has no timeout argument of its own, so it runs on
    a daemon thread the caller abandons after ``_YF_TIMEOUT_SECONDS``. A hung
    request cannot hold the individual-page response open.
    """
    if network_disabled():
        return None

    result: dict[str, Any] = {}

    def _run() -> None:
        info = _yf_info(yf_symbol)
        if info:
            result["info"] = info

    worker = threading.Thread(target=_run, daemon=True)
    worker.start()
    worker.join(_YF_TIMEOUT_SECONDS)
    info = result.get("info")
    if not info:
        return None

    summary = info.get("longBusinessSummary")
    if isinstance(summary, str):
        summary = _cut_at_sentence(summary.strip(), _SUMMARY_MAX_CHARS)
    else:
        summary = None
    return {
        "summary": summary,
        "website": info.get("website"),
        "country": info.get("country"),
        "employees": _as_int(info.get("fullTimeEmployees")),
    }


# ── 10-K extract ────────────────────────────────────────────────────────────

def _cut_at_sentence(text: str, max_chars: int) -> str:
    """Truncate text at a sentence boundary within max_chars."""
    if len(text) <= max_chars:
        return text
    truncated = text[:max_chars]
    # Find the last sentence-ending punctuation
    for sep in [". ", ".\n", ".\t"]:
        idx = truncated.rfind(sep)
        if idx > max_chars // 2:
            return truncated[: idx + 1]
    # Fall back to last period
    idx = truncated.rfind(".")
    if idx > max_chars // 2:
        return truncated[: idx + 1]
    return truncated


_HTML_TAG_RE = re.compile(r"<[^>]+>")
_MULTI_SPACE_RE = re.compile(r"\s+")


def _strip_html(html: str) -> str:
    """Remove HTML tags and collapse whitespace."""
    text = _HTML_TAG_RE.sub(" ", html)
    text = _MULTI_SPACE_RE.sub(" ", text).strip()
    return text


def _fetch_10k_extract(
    conn: sqlite3.Connection,
    ticker: str,
) -> Optional[str]:
    """Fetch and cache a short extract of the 10-K business section.

    Uses ``edgar_client.latest_10k`` and ``_primary_doc_url``.
    Gated by EARNINGS_XBRL. Every failure path returns None rather than
    raising.

    There is no timeout here. The function used to take a ``timeout``
    argument that nothing passed and nothing read, under a docstring that
    claimed it never blocks; ``cached_download`` takes no timeout, so the
    claim was false. The download's own socket timeout is what bounds this
    call, and the whole refresh is itself off the request path only when
    the cached row is fresh (see the follow-up note in the review).
    """
    if network_disabled():
        return None
    if os.environ.get("EARNINGS_XBRL", "on").lower() == "off":
        return None
    try:
        from betas.edgar_client import (
            cik_for_ticker,
            latest_10k,
            _primary_doc_url,
        )
        from marketdata.http_cache import cached_download
    except ImportError:
        return None

    try:
        cik = cik_for_ticker(conn, ticker)
        if cik is None:
            return None
        tenk = latest_10k(cik)
        if tenk is None:
            return None
        doc_url = _primary_doc_url(cik, tenk.accession)
        if doc_url is None:
            return None
        html = cached_download(
            doc_url,
            f"sec_10k_{tenk.accession.replace('-', '')}.html",
            max_age_days=365.0,
            user_agent="IntrinsicFinEd admin@intrinsicfined.org",
        )
        if html is None:
            return None
        text = _strip_html(html)
        if len(text) < 200:
            return None
        return _cut_at_sentence(text, _10K_EXTRACT_CHARS)
    except Exception as exc:  # noqa: BLE001
        log.debug("10-K extract failed for %s: %s", ticker, exc)
        return None


# ── Segments from segment_store ─────────────────────────────────────────────

def _load_segments(conn: sqlite3.Connection, ticker: str) -> list[dict[str, Any]]:
    """Load EDGAR segments via segment_store.latest_segments."""
    try:
        from betas.edgar_client import cik_for_ticker
        from betas.segment_store import latest_segments
    except ImportError:
        return []
    try:
        cik = cik_for_ticker(conn, ticker)
        if cik is None:
            return []
        result = latest_segments(conn, cik)
        if result is None:
            return []
        fy, rows = result
        total_rev = sum(r.revenue for r in rows if r.revenue > 0)
        segments = []
        for r in rows:
            share = r.revenue / total_rev if total_rev > 0 else None
            segments.append({
                "name": r.segment,
                "revenue": r.revenue,
                "share": round(share, 4) if share is not None else None,
                "fiscalYear": fy,
            })
        return segments
    except Exception as exc:  # noqa: BLE001
        log.debug("segment load failed for %s: %s", ticker, exc)
        return []


# ── Main entry point ────────────────────────────────────────────────────────

def get_business_profile(
    conn: sqlite3.Connection,
    ticker: str,
) -> dict[str, Any]:
    """Return the business profile for a ticker (plan 3.1).

    DB-cached with a 30-day freshness window. Any yfinance failure returns
    the cached row or ``{"applicable": False, "reason": ...}``.
    """
    ticker = ticker.upper()
    try:
        # The scheduled refresh jobs hold write locks on financials.db. Wait
        # for one rather than raising "database is locked" and dropping the
        # whole block.
        conn.execute("PRAGMA busy_timeout = 5000")
    except sqlite3.Error:
        pass
    _ensure_table(conn)

    # Read cache
    cached = conn.execute(
        "SELECT summary, website, country, employees, ten_k_extract, fetched_at "
        "FROM business_profile WHERE ticker = ?",
        (ticker,),
    ).fetchone()

    fetched_at = cached["fetched_at"] if cached else None
    # Stale-while-error: a stale row is still served while a refresh fails,
    # and a failed refresh is not retried on the next page view.
    with _lock:
        cooling = _fail_until.get(ticker, 0.0) > time.monotonic()
    need_refresh = _is_stale(fetched_at) and not cooling

    if need_refresh:
        yf_sym = _resolve_yf_symbol(conn, ticker)
        yf_data = _fetch_yfinance(yf_sym)
        if yf_data is not None:
            # Also try 10-K extract
            ten_k = _fetch_10k_extract(conn, ticker)
            from datetime import datetime, timezone
            now_iso = datetime.now(timezone.utc).isoformat()
            conn.execute(
                "INSERT OR REPLACE INTO business_profile "
                "(ticker, summary, website, country, employees, ten_k_extract, fetched_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    ticker,
                    yf_data.get("summary"),
                    yf_data.get("website"),
                    yf_data.get("country"),
                    yf_data.get("employees"),
                    ten_k,
                    now_iso,
                ),
            )
            conn.commit()
            segments = _load_segments(conn, ticker)
            result: dict[str, Any] = {
                "applicable": True,
                "summary": yf_data.get("summary"),
                "website": yf_data.get("website"),
                "country": yf_data.get("country"),
                "employees": yf_data.get("employees"),
                "fetchedAt": now_iso,
                "source": "yfinance",
            }
            if ten_k:
                result["tenKExtract"] = ten_k
            if segments:
                result["segments"] = segments
            return result
        # yfinance failed: back off, then fall through to whatever is cached.
        with _lock:
            _fail_until[ticker] = time.monotonic() + _FAIL_COOLDOWN_SECONDS

    # Return from cache
    if cached is not None:
        segments = _load_segments(conn, ticker)
        result = {
            "applicable": True,
            "summary": cached["summary"],
            "website": cached["website"],
            "country": cached["country"],
            "employees": cached["employees"],
            "fetchedAt": cached["fetched_at"],
            "source": "yfinance (cached)",
        }
        if cached["ten_k_extract"]:
            result["tenKExtract"] = cached["ten_k_extract"]
        if segments:
            result["segments"] = segments
        return result

    return {"applicable": False, "reason": "No business description available"}
