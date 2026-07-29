"""Tier 1: research a flagged claim against the app's own live data, then make the
smallest edit that fixes it.

This is RARR (research, then revise) with the language model taken out of every
stage. Tier 0 (verify.py) can only say "this figure disagrees with the block the
page handed the model". Tier 1 goes and asks the app what the figure actually is,
and if the app answers, it rewrites the digits and nothing else.

Three stages, none of which calls a model:

  research   GET /api/individual/{ticker}/benchmarks (~20 metric keys, each with
             the company value plus its industry and sector benchmark) and, only
             when a flagged claim is about beta, GET /api/beta/{ticker}. Plus a
             vault search for claims that read as a rule of thumb rather than as
             a measurement.
  agreement  eval.graders.compare(), the SAME comparison Tier 0 used, so a claim
             cannot be judged by one rule on the way in and another on the way
             out.
  revision   replace the flagged token's `raw` substring with the correct value
             rendered at the SAME written precision. One substring, in place.

WHY THE EDIT IS SO SMALL. Sentence rewriting was considered and rejected by the
owner: a model rewriting a sentence to fit a number is exactly the failure the
verification layer exists to catch, and a deterministic rewriter cannot preserve
an argument it does not understand. So the only edit this module can make is
"these digits, at this precision, in this one place".

That is still not always safe, and the guards below are what make the difference:

  * A COMPARATIVE CLAUSE is never edited, only flagged. "ROIC of 47% sits above
    the 12% hurdle" stops being true the moment 47 becomes 9, and the sentence
    now asserts something the evidence contradicts. Substituting a number can
    falsify a sentence even when the number itself becomes correct.
  * ONLY THE COMPANY COLUMN may drive an edit. The industry and sector benchmarks
    come back in the same payload and, after `label_tokens` drops "industry" and
    "sector" as stopwords, they are indistinguishable from the company's own
    metric by label alone. They are therefore a VETO: if a flagged figure equals
    the industry average, the sentence is probably about the industry, and
    rewriting it to the company value would break a correct claim.
  * THE VAULT NEVER DRIVES AN EDIT. A textbook threshold is not this company's
    measurement. A library match can only mark a claim supported.
  * PRESERVATION GUARDS run on every edit: the original substring must appear
    verbatim exactly once (otherwise there is no way to know which occurrence was
    meant), and the revision may not introduce a numeric token that no evidence
    supports. A failed guard drops the edit and reports `unresolved`.
  * NO EVIDENCE MEANS NO EDIT. Ever. Silence from the app is not disagreement.

Not handled here: transcription errors (the calculator ledger against the prose)
and stated arithmetic. Tier 0 already reports both, and both are defects in the
model's own working rather than disagreements with an external source, so they
are outside what "research and revise" means.

`tier1()` is TOTAL, on the same contract as `verify.tier0()`: it catches
everything and degrades to "unchanged" on any failure. The answer is the product.

HTTP DISCIPLINE (this runs inside server.py's aiohttp event loop):
  * aiohttp, never urllib. A blocking call here starves the Agent SDK's
    control-request handshake (60s timeout) and every parked request 500s. That
    is the same bug that made `search_vault` run through `asyncio.to_thread`.
  * The benchmarks payload is cached for 30 minutes per ticker. That endpoint is
    rate limited at 20/minute per IP and every call from this module arrives from
    loopback, so all verifications share one bucket.
  * Retries are off. A retry storm against our own rate-limited endpoint buys
    nothing and costs the bucket.
"""
from __future__ import annotations

import asyncio
import os
import re
import time
from collections import Counter
from dataclasses import dataclass

import aiohttp

from source_utils import CircuitBreaker, TTLCache, fetch_json, normalize_ticker

# Reconciliation is REUSED, never reimplemented: a claim graded by Tier 0 and then
# re-graded by Tier 1 under different rules would let a defect wash out between
# the two passes. `_units_line_up` and `_DERIVED` are private to the grader but are
# part of the same one comparison, so they are read from it rather than copied.
from eval import extract, graders

MODE = os.environ.get("RAG_VERIFY", "shadow").lower()

API_BASE = os.environ.get("RAG_API_BASE", "http://localhost:8000").rstrip("/")
HTTP_TIMEOUT = 6.0          # per request; the route's own 45s cap is the ceiling
BENCH_TTL_S = 1800.0        # 30 min, matching the endpoint's own @cached window
MAX_EDITS = 12              # a pathological answer must not drive an unbounded loop
MAX_VAULT_QUERIES = 3       # each is an embed + KNN on a worker thread
MAX_CANDIDATES = 6          # evidence rows compared per claim

_bench_cache = TTLCache(BENCH_TTL_S)
_breaker = CircuitBreaker(threshold=3, cooldown=300.0)

# Roles decide what a matching evidence row is allowed to do. See the module
# docstring: only COMPANY may drive an edit.
COMPANY, GROUP, LIBRARY = "company", "group", "library"

_UNIT_MAP = {"%": extract.PCT, "x": extract.TIMES, "$": extract.USD}


def enabled() -> bool:
    """Mirrors verify.py's flag. Tier 1 is reachable only in `on`, because that is
    the only mode in which a token is ever issued."""
    return MODE == "on"


@dataclass(frozen=True)
class Evidence:
    label: str
    value: float
    unit: str
    decimals: int      # as WRITTEN by the source; 6 means full JSON precision
    source: str        # provenance string returned to the caller
    role: str          # COMPANY | GROUP | LIBRARY


# --- research ---------------------------------------------------------------
def _finite(v) -> float | None:
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    f = float(v)
    return f if f == f and abs(f) != float("inf") else None


async def _get_json(session: aiohttp.ClientSession, path: str, key: str):
    """One guarded GET. Returns None on anything other than a clean payload."""
    if _breaker.is_open(key):
        return None
    try:
        payload = await fetch_json(session, f"{API_BASE}{path}",
                                   timeout=HTTP_TIMEOUT, retries=0)
    except Exception as exc:                    # noqa: BLE001 - totality
        _breaker.record_failure(key)
        print(f"[rarr] {key} fetch failed: {type(exc).__name__}: {exc}", flush=True)
        return None
    _breaker.record_success(key)
    return payload if isinstance(payload, dict) else None


async def benchmarks(session: aiohttp.ClientSession, ticker: str) -> dict:
    """The flat metric map for one ticker, cached per ticker for 30 minutes.

    The cache is not an optimization. Without it every verification of every
    answer about the same company spends the endpoint's 20/minute budget, which
    all loopback callers share.
    """
    hit = _bench_cache.get(ticker)
    if hit is not None:
        return hit                              # type: ignore[return-value]
    payload = await _get_json(session, f"/api/individual/{ticker}/benchmarks", "benchmarks")
    if payload is None:
        # A FAILURE is never cached: a 30-minute memory of one timeout would
        # silently disable Tier 1 for that ticker long after the backend recovered.
        # The circuit breaker is what stops the retry pressure.
        return {}
    metrics = payload.get("metrics")
    out = metrics if isinstance(metrics, dict) else {}
    # An EMPTY result is never cached, for the same reason a failed fetch is not
    # (line above): the backend returns 200 with `metrics: {}` when its own
    # aggregation degraded on a transient error (e.g. a SQLite writer lock), and a
    # 30-minute memory of that empty would blank the benchmarks for a recovered
    # ticker. A real company with peers always has at least one metric.
    if out:
        _bench_cache.set(ticker, out)
    return out


async def beta(session: aiohttp.ClientSession, ticker: str) -> dict:
    """The full BetaResult. Deliberately uncached, because /api/beta/{ticker} is
    itself uncached and documented as the verification-harness surface: the point
    of the endpoint is to show what the resolver produces right now. It is only
    called when a flagged claim actually names beta, so the 10/minute budget is
    not spent on answers that never mention it."""
    return await _get_json(session, f"/api/beta/{ticker}", "beta") or {}


def evidence_from_benchmarks(metrics: dict) -> list[Evidence]:
    """One row per (metric, column). Percent columns arrive already x100, matching
    the individual page, and `compare` carries the scale-equivalence class anyway."""
    out: list[Evidence] = []
    for key, row in (metrics or {}).items():
        if not isinstance(row, dict):
            continue
        label = str(row.get("label") or key)
        unit = _UNIT_MAP.get(str(row.get("unit") or ""), extract.PLAIN)
        for column, role in (("company", COMPANY), ("industry", GROUP), ("sector", GROUP)):
            value = _finite(row.get(column))
            if value is None:
                continue
            out.append(Evidence(label=label, value=value, unit=unit, decimals=6,
                                source=f"benchmarks:{key}.{column}", role=role))
    return out


# The resolver's own inputs (D/E, tax rate, the regression beta it may have
# rejected) are GROUP-role on purpose: they are real figures but they are not the
# beta the page shows, so they may veto an edit and never drive one.
_BETA_FIELDS = (
    ("value", "Beta", COMPANY),
    ("unlevered", "Unlevered Beta", COMPANY),
    ("regression_beta", "Regression Beta", GROUP),
    ("de_ratio", "Debt To Equity", GROUP),
    ("tax_rate", "Tax Rate", GROUP),
)


def evidence_from_beta(payload: dict) -> list[Evidence]:
    out: list[Evidence] = []
    for key, label, role in _BETA_FIELDS:
        value = _finite((payload or {}).get(key))
        if value is None:
            continue
        out.append(Evidence(label=label, value=value, unit=extract.PLAIN, decimals=6,
                            source=f"beta:{key}", role=role))
    return out


def evidence_from_passages(hits, label_hint: str = "") -> list[Evidence]:
    """Labelled figures inside retrieved vault passages, read with the same scanner
    the answer is read with. LIBRARY role: corroboration only."""
    out: list[Evidence] = []
    for hit in hits or []:
        if not isinstance(hit, dict):
            continue
        source = str(hit.get("source") or "vault")
        for tok in extract.scan(str(hit.get("text") or "")):
            if not tok.gradable or not tok.label:
                continue
            out.append(Evidence(label=tok.label or label_hint, value=tok.value,
                                unit=tok.unit, decimals=tok.decimals,
                                source=f"vault:{source}", role=LIBRARY))
    return out


# A claim written as doctrine rather than as a measurement. The app has no
# authoritative value for "a healthy current ratio is 2.0", so the library is the
# only place that can speak to it.
_DOCTRINAL = re.compile(
    r"\b(?:rule of thumb|typical(?:ly)?|threshold|hurdle|benchmark|conventional|"
    r"textbook|generally|commonly|healthy|comfortable|acceptable|considered|"
    r"widely (?:used|held)|investors? (?:look|want|expect))\b", re.IGNORECASE)
_BETA_CUE = re.compile(r"\bbetas?\b", re.IGNORECASE)


def _clause(text: str, span: tuple[int, int]) -> str:
    """The sentence the token sits in, bounded the same way the grader bounds it.

    Deliberately NOT narrowed to a table cell. A wide clause finds more
    comparatives, and finding a comparative means declining to edit, so the wider
    window is the safer one.
    """
    left = max(text.rfind(".", 0, span[0]), text.rfind("\n", 0, span[0])) + 1
    ends = [p for p in (text.find(".", span[1]), text.find("\n", span[1])) if p != -1]
    return text[left:min(ends) if ends else len(text)]


# --- agreement --------------------------------------------------------------
def _candidates(tok, evidence: list[Evidence]) -> list[tuple[Evidence, str, float]]:
    """(evidence, verdict, comparable expected) for every plausible row, best first.

    The derived-vs-derived check is the grader's own: a spread is not its base
    metric, and pairing them reported correct answers as hallucinations.
    """
    claim_derived = bool(graders._DERIVED.search(tok.label))
    scored: list[tuple[float, Evidence]] = []
    for ev in evidence:
        if not graders._units_line_up(tok.unit, ev.unit):
            continue
        if claim_derived != bool(graders._DERIVED.search(ev.label)):
            continue
        score = graders.label_score(tok.label, ev.label)
        if score >= graders.LABEL_MIN:
            scored.append((score, ev))
    scored.sort(key=lambda pair: -pair[0])
    out: list[tuple[Evidence, str, float]] = []
    for _score, ev in scored[:MAX_CANDIDATES]:
        verdict, _adjusted, comparable = graders.compare(tok, ev.value, ev.decimals)
        out.append((ev, verdict, comparable))
    return out


# Substituting a number inside one of these can turn a true sentence false, so the
# claim is reported and left alone. "above"/"below"/"exceeds" state a relation the
# new number may not satisfy; "versus"/"premium"/"discount" and an `a − b`
# construction state a difference the new number silently changes.
_COMPARATIVE = re.compile(
    r"\b(?:above|below|exceed(?:s|ed|ing)?|versus|vs\.?|premium|discount|wider|"
    r"narrower|higher than|lower than|greater than|less than|more than|"
    r"compared (?:to|with)|relative to|against|outpaces?|trails?|ahead of|"
    r"behind|spread|gap|differen(?:ce|tial)|clears?|short of|shy of|"
    r"double|half of|times the)\b", re.IGNORECASE)
# "over the past decade" is a time span, not a comparison, so bare `over`/`under`
# are deliberately absent. The extractor already turns them into a hedge when they
# introduce the figure, and a hedged bound is refused a few lines below anyway.
# `ROIC − WACC` and `41.2 - 8.42`. A U+2212 with any spacing, or an ASCII hyphen
# with spaces on both sides. A bare hyphen is not included: it is a word join
# ("cash-flow") or a negative sign, and neither is a comparison.
_MINUS_CONSTRUCT = re.compile(r"[\w%)\]]\s*−\s*[\w$(]|[\w%)\]] - [\w$(]")


def is_comparative(clause: str) -> bool:
    return bool(_COMPARATIVE.search(clause) or _MINUS_CONSTRUCT.search(clause))


# --- revision ---------------------------------------------------------------
def render(tok, value: float) -> str | None:
    """`value` written the way the token was written: same precision, same sign
    style, same currency mark, same scale word, same unit tail.

    Returns None whenever the rewrite would have to invent formatting (a grouped
    figure needs its thousands separators rebuilt, a range has two magnitudes),
    because inventing formatting is no longer the smallest possible edit.
    """
    m = extract._NUM.match(tok.raw)
    if m is None or m.end() != len(tok.raw):
        return None
    int_txt = m.group("int") or ""
    if "," in int_txt or " " in int_txt:
        return None
    scale = tok.scale_applied or 1.0
    if not scale:
        return None
    display = value / scale
    if display != display or abs(display) == float("inf"):
        return None
    written_sign = m.group("sign") or ""
    if display < 0:
        sign = "−" if written_sign == "−" else "-"
    else:
        sign = "+" if written_sign == "+" else ""
    body = f"{abs(display):.{tok.decimals}f}"
    return (f"{sign}{m.group('cur') or ''}{body}"
            f"{m.group('scale') or ''}{m.group('tail') or ''}")


def _values(text: str) -> Counter:
    return Counter(round(t.value, 9) for t in extract.scan(text))


def _introduced(before: str, after: str, allowed: list[float]) -> float | None:
    """The first numeric value the revision adds that no evidence supports."""
    was, now = _values(before), _values(after)
    for value, count in now.items():
        if count <= was.get(value, 0):
            continue
        if not any(abs(value - a) <= max(1e-9, 1e-6 * abs(a)) for a in allowed):
            return value
    return None


def apply_edit(working: str, original: str, replacement: str,
               allowed: list[float]) -> tuple[str | None, str]:
    """The preservation guards. Returns (revised text, "") or (None, reason)."""
    if working.count(original) != 1:
        return None, f"'{original}' does not appear exactly once in the answer"
    revised = working.replace(original, replacement, 1)
    if revised == working:
        return None, "the substitution would change nothing"
    intruder = _introduced(working, revised, allowed)
    if intruder is not None:
        return None, f"the revision would introduce {intruder:g}, which no evidence supports"
    return revised, ""


def _decide(answer: str, tok, cands: list[tuple[Evidence, str, float]]) -> dict:
    """What to do about one flagged claim, before any text is touched."""
    if not cands:
        return {"kind": "unresolved", "reason": "no evidence found for this figure"}

    agree = [(ev, exp) for ev, verdict, exp in cands
             if verdict in (graders.MATCH, graders.APPROX)]
    for ev, _exp in agree:
        if ev.role == COMPANY:
            return {"kind": "supported", "source": ev.source,
                    "note": "the app's own value agrees with the answer"}
    for ev, _exp in agree:
        if ev.role == LIBRARY:
            return {"kind": "supported", "source": ev.source,
                    "note": "matches a published threshold in the library"}
    for ev, _exp in agree:
        if ev.role == GROUP:
            return {"kind": "unresolved", "reason":
                    f"matches {ev.label} for the group ({ev.source}), so the clause may not "
                    "be about the company"}

    # Checked before the disagreement, because a bound that the evidence fails to
    # satisfy is not a wrong VALUE. "over 20%" against a real 12% is a false
    # statement, but "over 12%" is a strange one, and neither is a smaller edit.
    if tok.hedge in ("over", "under", "range"):
        return {"kind": "unresolved",
                "reason": f"a '{tok.hedge}' claim states a bound, not a value"}

    disagreeing = [(ev, exp) for ev, verdict, exp in cands
                   if verdict == graders.MISMATCH and ev.role == COMPANY]
    if not disagreeing:
        return {"kind": "unresolved",
                "reason": "no company-level evidence spoke to this figure"}

    if is_comparative(_clause(answer, tok.span)):
        return {"kind": "unresolved",
                "reason": "the clause is comparative, so replacing the number could "
                          "falsify the sentence"}

    ev, expected = disagreeing[0]
    replacement = render(tok, expected)
    if replacement is None:
        return {"kind": "unresolved",
                "reason": "the correct value cannot be written at the stated precision"}
    if replacement == tok.raw:
        return {"kind": "supported", "source": ev.source,
                "note": "the disagreement is below the precision the answer wrote"}
    return {"kind": "edit", "replacement": replacement, "expected": expected,
            "source": ev.source, "label": ev.label}


# --- the whole deterministic pass -------------------------------------------
def reconcile(answer: str, data_context: str, evidence: list[Evidence]) -> dict:
    """Grade, decide, and apply. Pure and network-free, which is what makes the
    interesting behaviour testable without a backend."""
    verdicts = graders.grade_claims(answer, data_context or "")
    flagged = [c for c in verdicts if c.verdict == graders.MISMATCH]

    working = answer
    edits: list[dict] = []
    supported: list[dict] = []
    unresolved: list[dict] = []

    for claim in flagged[:MAX_EDITS]:
        tok = claim.token
        cands = _candidates(tok, evidence)
        decision = _decide(answer, tok, cands)
        base = {"text": tok.raw, "label": tok.label, "stated": tok.value, "line": tok.line}

        if decision["kind"] == "supported":
            supported.append({**base, "source": decision["source"], "note": decision["note"]})
            continue
        if decision["kind"] == "unresolved":
            unresolved.append({**base, "reason": decision["reason"]})
            continue

        replacement = decision["replacement"]
        allowed = [ev.value for ev in evidence]
        parsed = extract._num_of(replacement)
        if parsed is not None:
            # The rendered string is what the scanner will read back, and rounding
            # to the written precision moves it off the raw evidence value.
            allowed.append(parsed[0])
        revised, reason = apply_edit(working, tok.raw, replacement, allowed)
        if revised is None:
            unresolved.append({**base, "reason": reason})
            continue
        working = revised
        edits.append({**base, "replacement": replacement, "corrected": decision["expected"],
                      "via": decision["label"], "source": decision["source"]})

    return {
        "status": "revised" if edits else "unchanged",
        "revisedAnswer": working if edits else None,
        "edits": edits,
        "supported": supported,
        "unresolved": unresolved,
        "flaggedConsidered": len(flagged),
    }


async def research(section: str, context: str, flagged_labels: list[str],
                   vault_labels: list[str] | None = None,
                   vault_search=None) -> tuple[list[Evidence], dict]:
    """Everything the app can be asked about this answer, and what was reached.

    The endpoints are only called for an individual-company answer. `context` on a
    sector or industry page is a group NAME, and a group name that happens to look
    like a symbol ("TECHNOLOGY" is ten legal ticker characters) would send a
    request for a company that does not exist.
    """
    evidence: list[Evidence] = []
    reached = {"benchmarks": 0, "beta": 0, "vault": 0}

    ticker = normalize_ticker(context) if section == "individual" else ""
    if ticker:
        timeout = aiohttp.ClientTimeout(total=HTTP_TIMEOUT)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            rows = evidence_from_benchmarks(await benchmarks(session, ticker))
            evidence.extend(rows)
            reached["benchmarks"] = len(rows)
            if any(_BETA_CUE.search(lbl or "") for lbl in flagged_labels):
                brows = evidence_from_beta(await beta(session, ticker))
                evidence.extend(brows)
                reached["beta"] = len(brows)

    if vault_search is not None:
        for query in (vault_labels or [])[:MAX_VAULT_QUERIES]:
            try:
                hits = await asyncio.to_thread(vault_search, query, None)
            except Exception as exc:            # noqa: BLE001 - totality
                print(f"[rarr] vault search failed: {type(exc).__name__}: {exc}", flush=True)
                continue
            rows = evidence_from_passages(hits, query)
            evidence.extend(rows)
            reached["vault"] += len(rows)

    return evidence, reached


def doctrinal_labels(answer: str, data_context: str) -> list[str]:
    """Labels of the flagged claims that read as doctrine, so the library is worth
    asking about them. Everything else is a measurement and the library cannot
    speak to it."""
    out: list[str] = []
    for claim in graders.grade_claims(answer, data_context or ""):
        if claim.verdict != graders.MISMATCH or not claim.token.label:
            continue
        if _DOCTRINAL.search(_clause(answer, claim.token.span)):
            label = claim.token.label.strip()
            if label and label not in out:
                out.append(label)
    return out


async def tier1(answer: str, report: dict | None = None, *, section: str = "",
                context: str = "", data_context: str = "", vault_search=None) -> dict:
    """Research and revise. TOTAL: degrades to `unchanged` rather than raising.

    `report` is Tier 0's, carried only so a caller can hand back what it already
    had; the claims themselves are re-graded here so Tier 1 works from real
    `NumToken`s (spans, written precision, hedges) rather than from the flattened
    JSON Tier 0 puts on the wire.
    """
    started = time.perf_counter()
    blank = {"mode": MODE, "status": "unchanged", "revisedAnswer": None, "edits": [],
             "supported": [], "unresolved": [], "flaggedConsidered": 0,
             "researched": {"benchmarks": 0, "beta": 0, "vault": 0}, "evidence": 0}
    if not answer:
        return {**blank, "elapsedMs": 0.0}
    try:
        verdicts = graders.grade_claims(answer, data_context or "")
        labels = [c.token.label for c in verdicts
                  if c.verdict == graders.MISMATCH and c.token.label]
        doctrinal = doctrinal_labels(answer, data_context)
        evidence, reached = await research(section, context, labels,
                                           vault_labels=doctrinal,
                                           vault_search=vault_search)
        out = reconcile(answer, data_context, evidence)
        return {"mode": MODE, **out, "researched": reached, "evidence": len(evidence),
                "elapsedMs": round((time.perf_counter() - started) * 1000, 1)}
    except Exception as exc:                    # noqa: BLE001 - totality is the contract
        print(f"[rarr] tier1 failed: {type(exc).__name__}: {exc}", flush=True)
        return {**blank, "elapsedMs": round((time.perf_counter() - started) * 1000, 1)}


def log_line(report: dict | None) -> None:
    """One line beside the Tier 0 telemetry."""
    if not report:
        return
    reached = report.get("researched", {})
    print(f"[/verify] tier1={report.get('mode')} status={report.get('status')} "
          f"flagged={report.get('flaggedConsidered', 0)} "
          f"edits={len(report.get('edits', []))} "
          f"supported={len(report.get('supported', []))} "
          f"unresolved={len(report.get('unresolved', []))} "
          f"evidence={report.get('evidence', 0)} "
          f"bench={reached.get('benchmarks', 0)} beta={reached.get('beta', 0)} "
          f"vault={reached.get('vault', 0)} ms={report.get('elapsedMs')}", flush=True)
