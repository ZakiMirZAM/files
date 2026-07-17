"""
betas/classify.py — map 10-K segment names to Damodaran's 94 industry groups.

Resolution order (cheapest first; deterministic outcomes and settled LLM verdicts
are cached in segment_industry_map so the LLM is consulted at most twice per
(ticker, segment); a transient RAG outage is left uncached so it retries later):

    1. structural  — corporate/eliminations buckets -> unmappable (excluded
                     from coverage rather than mis-weighted)
    2. alias       — the segment name IS a yfinance industry label or an exact
                     Damodaran group name (confidence 1.0)
    3. keyword     — ~40 curated high-precision stems (confidence 0.8)
    4. llm         — RAG server /ask with a strict pick-one-verbatim prompt,
                     validated against the group list, one retry (confidence 0.6)
    5. unmappable  — an LLM failure is NOT mapped to the parent industry (that
                     fabricates a business that isn't there); the segment stays
                     unmappable and the resolver's coverage gate excludes it. A
                     parent-industry guess is used only when the LLM is disabled
                     entirely (allow_llm=False), and is never cached.

The RAG server (localhost:3001, override RAG_BASE) runs Claude through the
Agent SDK; the prompt forbids web search and demands one verbatim list entry,
which keeps the call cheap and the validation trivial.
"""

from __future__ import annotations

import datetime as _dt
import json
import os
import re
import sqlite3
import urllib.error
import urllib.request

from .damodaran_industry import _INDUSTRY_ALIASES, all_group_names, alias_industry
from .schema import ensure_betas_schema

_RAG_BASE = os.environ.get("RAG_BASE", "http://localhost:3001")
_ASK_TIMEOUT_S = 120

# Version stamp for deterministic (alias/keyword) classifications, written to the
# segment_industry_map.model column so improved rules can re-derive stale rows.
_CLASSIFIER_VERSION = "det-2026-07-17"

# Sentinel distinguishing a RAG transport failure (server unreachable — retry
# later) from a genuine "no valid answer" (server answered — cache as unmappable).
_UNREACHABLE: object = object()

# Segments that are accounting buckets, not businesses.
_STRUCTURAL = re.compile(
    r"^(corporate( and other)?|all other( segments)?|other( sales)?|"
    r"(segment )?eliminations?( and other)?|eliminations? and other|"
    r"product and service other|reconciling items?|intersegment|unallocated)$",
    re.IGNORECASE)

# High-precision keyword stems -> Damodaran group. First match wins, so a specific
# stem must precede any broader stem it contains ("investment banking" before
# "banking", "reinsurance" before "insurance"); ambiguous stems are deliberately
# absent so they reach the LLM instead of mis-mapping.
_KEYWORD_STEMS: tuple[tuple[str, str], ...] = (
    ("cloud", "Software (System & Application)"),
    ("software", "Software (System & Application)"),
    ("saas", "Software (System & Application)"),
    ("semiconductor", "Semiconductor"),
    ("foundry", "Semiconductor"),
    ("chip", "Semiconductor"),
    ("pharmaceutical", "Drugs (Pharmaceutical)"),
    ("pharma", "Drugs (Pharmaceutical)"),
    ("biotech", "Drugs (Biotechnology)"),
    ("vaccine", "Drugs (Pharmaceutical)"),
    ("medical device", "Healthcare Products"),
    ("medtech", "Healthcare Products"),
    ("surgical", "Healthcare Products"),
    ("diagnostic", "Healthcare Products"),
    ("health insurance", "Healthcare Support Services"),
    ("investment banking", "Brokerage & Investment Banking"),
    ("banking", "Banks (Regional)"),
    ("bank", "Banks (Regional)"),
    ("reinsurance", "Reinsurance"),
    ("insurance", "Insurance (General)"),
    ("wealth management", "Investments & Asset Management"),
    ("asset management", "Investments & Asset Management"),
    ("brokerage", "Brokerage & Investment Banking"),
    ("financial services", "Financial Svcs. (Non-bank & Insurance)"),
    ("payments", "Financial Svcs. (Non-bank & Insurance)"),
    ("aerospace", "Aerospace/Defense"),
    ("defense", "Aerospace/Defense"),
    ("space systems", "Aerospace/Defense"),
    ("upstream", "Oil/Gas (Production and Exploration)"),
    ("exploration", "Oil/Gas (Production and Exploration)"),
    ("downstream", "Oil/Gas (Integrated)"),
    ("refining", "Oil/Gas (Integrated)"),
    ("midstream", "Oil/Gas Distribution"),
    ("pipeline", "Oil/Gas Distribution"),
    ("oilfield", "Oilfield Svcs/Equip."),
    ("networking", "Telecom. Equipment"),
    ("server", "Computers/Peripherals"),
    ("storage", "Computers/Peripherals"),
    ("personal computing", "Computers/Peripherals"),
    ("devices", "Computers/Peripherals"),
    ("wireless", "Telecom (Wireless)"),
    ("telecom", "Telecom. Services"),
    ("broadband", "Telecom. Services"),
    ("streaming", "Entertainment"),
    ("studios", "Entertainment"),
    ("entertainment", "Entertainment"),
    ("advertising", "Advertising"),
    ("e-commerce", "Retail (Special Lines)"),
    ("ecommerce", "Retail (Special Lines)"),
    ("online stores", "Retail (Special Lines)"),
    ("retail", "Retail (General)"),
    ("grocery", "Retail (Grocery and Food)"),
    ("beverage", "Beverage (Soft)"),
    ("snacks", "Food Processing"),
    ("nutrition", "Food Processing"),
    ("foods", "Food Processing"),
    ("agricultur", "Farming/Agriculture"),
    ("automotive", "Auto & Truck"),
    ("vehicle", "Auto & Truck"),
    ("mobility", "Auto & Truck"),
    ("machinery", "Machinery"),
    ("industrial equipment", "Machinery"),
    ("construction", "Engineering/Construction"),
    ("electrical", "Electrical Equipment"),
    ("energy generation", "Power"),
    ("renewable", "Green & Renewable Energy"),
    ("utilities", "Utility (General)"),
    ("electric", "Utility (General)"),
    ("chemicals", "Chemical (Diversified)"),
    ("mining", "Metals & Mining"),
    ("metals", "Metals & Mining"),
    ("steel", "Steel"),
    ("paper", "Paper/Forest Products"),
    ("packaging", "Packaging & Container"),
    ("real estate", "Real Estate (Operations & Services)"),
    ("logistics", "Transportation"),
    ("freight", "Transportation"),
    ("transportation", "Transportation"),
    ("airline", "Air Transport"),
    ("hotels", "Hotel/Gaming"),
    ("resorts", "Hotel/Gaming"),
    ("casino", "Hotel/Gaming"),
    ("restaurants", "Restaurant/Dining"),
    ("apparel", "Apparel"),
    ("footwear", "Shoe"),
    ("household products", "Household Products"),
    ("personal care", "Household Products"),
    ("tobacco", "Tobacco"),
    ("waste", "Environmental & Waste Services"),
    ("staffing", "Business & Consumer Services"),
    ("consulting", "Business & Consumer Services"),
)


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip().lower())


# ── cache access ──────────────────────────────────────────────────────────────

def get_cached(conn: sqlite3.Connection, ticker: str, segment: str) -> tuple[str | None, str] | None:
    """(industry|None, source) if this (ticker, segment) was classified before."""
    try:
        row = conn.execute(
            "SELECT industry, source FROM segment_industry_map "
            "WHERE ticker = ? AND segment_norm = ?",
            [ticker.upper(), _norm(segment)]).fetchone()
    except sqlite3.OperationalError:
        return None
    return (row[0], row[1]) if row else None


def _store(conn: sqlite3.Connection, ticker: str, segment: str,
           industry: str | None, source: str, confidence: float,
           model: str | None = None) -> None:
    ensure_betas_schema(conn)
    conn.execute(
        """INSERT INTO segment_industry_map
               (ticker, segment_norm, industry, source, confidence, model, asof)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(ticker, segment_norm) DO UPDATE SET
               industry=excluded.industry, source=excluded.source,
               confidence=excluded.confidence, model=excluded.model,
               asof=excluded.asof""",
        [ticker.upper(), _norm(segment), industry, source, confidence, model,
         _dt.date.today().isoformat()],
    )
    conn.commit()


# ── deterministic passes ──────────────────────────────────────────────────────

def _deterministic(segment: str, groups: list[str]) -> tuple[str | None, str, float] | None:
    """(industry, source, confidence) or None to escalate to the LLM."""
    norm = _norm(segment)
    if _STRUCTURAL.match(norm):
        return None, "keyword", 1.0  # structural bucket -> unmappable by design
    exact_group = next((g for g in groups if g.lower() == norm), None)
    if exact_group:
        return exact_group, "alias", 1.0
    alias = _INDUSTRY_ALIASES.get(norm)
    if alias:
        return alias, "alias", 1.0
    for stem, group in _KEYWORD_STEMS:
        if stem in norm:
            return group, "keyword", 0.8
    return None


# ── LLM pass (RAG /ask) ───────────────────────────────────────────────────────

def _ask(question: str, context: str) -> str | None | object:
    """A group name, None (server answered but empty), or _UNREACHABLE (transport
    failure — the caller must not cache a permanent verdict on this)."""
    payload = json.dumps({"question": question, "context": context,
                          "section": "individual"}).encode()
    req = urllib.request.Request(
        f"{_RAG_BASE}/ask", data=payload,
        headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=_ASK_TIMEOUT_S) as resp:
            body = json.loads(resp.read())
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
        return _UNREACHABLE  # server unreachable / bad response — retry later
    answer = body.get("answer")
    return str(answer) if answer else None


def _validate_answer(answer: str, groups: list[str]) -> str | None:
    cleaned = re.sub(r"[*_`\"'#>]", "", answer).strip()
    cleaned = cleaned.splitlines()[0].strip() if cleaned else ""
    for g in groups:
        if g.lower() == cleaned.lower():
            return g
    contained = [g for g in groups if g.lower() in answer.lower()]
    if len(contained) == 1:
        return contained[0]
    return None


def _llm_classify(segment: str, ticker: str, company_name: str | None,
                  company_industry: str | None, groups: list[str]) -> str | None | object:
    listing = "\n".join(groups)
    base_q = (
        "You are classifying a company business segment into exactly one industry group. "
        f"Company: {company_name or ticker} ({ticker}), "
        f"listed industry: {company_industry or 'unknown'}. "
        f'Business segment name: "{segment}". '
        "Reply with ONLY one industry name copied verbatim from this list, nothing else - "
        "no punctuation, no explanation, no web search needed:\n" + listing
    )
    for attempt, question in enumerate((
        base_q,
        "Your previous reply was invalid. Reply with only one line containing one "
        "exact name from the list.\n" + base_q,
    )):
        answer = _ask(question, ticker)
        if answer is _UNREACHABLE:
            return _UNREACHABLE  # transport failure — signal the caller to retry later
        if answer is None:
            continue  # server answered but empty; re-prompt, then give up
        valid = _validate_answer(answer, groups)
        if valid:
            return valid
    return None  # server answered, no valid group after retries — genuinely unmappable


# ── public API ────────────────────────────────────────────────────────────────

def classify_segment(
    conn: sqlite3.Connection, *, ticker: str, segment: str,
    company_name: str | None, company_industry: str | None,
    allow_llm: bool = True, force: bool = False,
) -> str | None:
    """Damodaran group for one segment (None = unmappable). Settled outcomes are
    cached; a transport failure is left uncached so a later run retries."""
    if not force:
        cached = get_cached(conn, ticker, segment)
        if cached is not None:
            return cached[0]

    groups = all_group_names(conn)
    if not groups:
        return None  # Damodaran snapshot not loaded yet — don't cache

    det = _deterministic(segment, groups)
    if det is not None:
        industry, source, confidence = det
        _store(conn, ticker, segment, industry, source, confidence,
               model=_CLASSIFIER_VERSION)
        return industry

    reachable = True
    if allow_llm:
        llm_result = _llm_classify(segment, ticker, company_name,
                                   company_industry, groups)
        if isinstance(llm_result, str):
            _store(conn, ticker, segment, llm_result, "llm", 0.6, model="rag/ask")
            return llm_result
        # str = success (returned above); None = server answered but no valid
        # group; _UNREACHABLE = transport failure (retry later, do not cache).
        reachable = llm_result is not _UNREACHABLE

    if not allow_llm:
        # LLM disabled entirely: fall back to the parent company's industry as a
        # last-resort guess, but leave it UNCACHED (H2) so a later LLM-enabled run
        # derives the real segment industry instead of inheriting a stale guess.
        return alias_industry(company_industry)

    # H2: an LLM failure must NOT be cached as a successful parent mapping and must
    # NOT count toward bottom-up coverage; the segment is unmappable. M: write the
    # permanent unmappable verdict only when the RAG server actually answered; on a
    # transport failure leave the row uncached so a later run retries rather than
    # dropping the segment from coverage forever.
    if reachable:
        _store(conn, ticker, segment, None, "llm", 0.0, model="rag/ask")
    return None


def warm_universe(conn: sqlite3.Connection, *, tickers: list[str] | None = None,
                  force: bool = False) -> dict[str, int]:
    """Classify every stored segment for the given tickers (default: all tickers
    that have segment data)."""
    if tickers is None:
        rows = conn.execute(
            """SELECT DISTINCT t.ticker FROM tickers t
               JOIN financials f ON f.Ticker = t.ticker AND f."Cik" IS NOT NULL
               JOIN segment_revenue s
                 ON s.cik = printf('%010d', CAST(f."Cik" AS INTEGER))
               ORDER BY t.ticker""").fetchall()
        tickers = [r[0] for r in rows]
    stats: dict[str, int] = {}
    for t in tickers:
        info = conn.execute(
            "SELECT name, industry FROM tickers WHERE ticker = ?", [t.upper()]).fetchone()
        name, industry = (info[0], info[1]) if info else (None, None)
        cik_row = conn.execute(
            'SELECT "Cik" FROM financials WHERE Ticker = ? AND "Cik" IS NOT NULL '
            'ORDER BY "Calendar Year" DESC LIMIT 1', [t.upper()]).fetchone()
        if not cik_row or not cik_row[0]:
            stats["no_cik"] = stats.get("no_cik", 0) + 1
            continue
        cik = re.sub(r"\D", "", str(cik_row[0])).zfill(10)
        seg_rows = conn.execute(
            "SELECT DISTINCT segment FROM segment_revenue WHERE cik = ?", [cik]).fetchall()
        for (segment,) in seg_rows:
            result = classify_segment(
                conn, ticker=t, segment=segment, company_name=name,
                company_industry=industry, force=force)
            key = "mapped" if result else "unmapped"
            stats[key] = stats.get(key, 0) + 1
    return stats
