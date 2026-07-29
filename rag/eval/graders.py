"""Deterministic grading of an answer against the figures the app gave it.

The app's prompt declares the "Computed data on the page" block AUTHORITATIVE and
tells the model to ignore any web figure that contradicts it. That turns checking
those figures from open-domain fact-checking into closed-domain reconciliation: a
labelled number that contradicts the block is wrong by the app's own contract, and
no retrieval or model is needed to say so.

Design bias, stated once because every rule below follows from it: **only
`mismatch` is a defect, and every ambiguity resolves away from `mismatch`.** An
unlabelled figure, a figure the block never carried, a unit we cannot line up, a
label we cannot resolve: all of these grade silent. The prompt explicitly permits
the model to bring figures from the vault, the web and general knowledge, so most
numbers in a good answer SHOULD be ungraded. A false "this number is wrong" badge
is worse than no badge at all, because it teaches the user to stop reading it.

The context is parsed with the SAME grammar as the answer (`extract.scan`), so a
format the scanner mishandles is mishandled identically on both sides and cannot
manufacture a disagreement.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from functools import lru_cache

from .extract import (DATE, ORDINAL, PCT, PLAIN, PP, TIMES, USD, YEAR,
                      Derivation, NumToken, derivations, preprocess, scan,
                      table_labels)
from safe_math import evaluate

try:                                   # the ablated acronym map, reused not duplicated
    from retrieval import EXPANSIONS
except Exception:                      # noqa: BLE001 - graders must import standalone
    EXPANSIONS = {}

# --- calibrated constants ---------------------------------------------------
# Provisional. `verify_calibrate.py` sweeps these against real exported answers
# with a target of ZERO false-positive mismatches, and the chosen values are then
# frozen by a test recording what the alternatives scored.
REL_FLOOR = 0.002     # absorbs double-rounding through toFixed + a scale conversion
HEDGE_REL = 0.05      # "about 8%" is satisfied within 5%
HEDGE_WIDE = 0.10     # beyond 5% but inside 10% grades approx, never mismatch
LABEL_MIN = 0.34      # Jaccard floor for accepting a label match
MAX_CONTRADICTION_TOKENS = 300   # inline-path backstop; real answers carry well under 100

MATCH, APPROX, MISMATCH = "match", "approx", "mismatch"
PRESENT, UNSUPPORTED, UNGRADED = "present_unlabeled", "unsupported", "ungraded"


@dataclass(frozen=True)
class ClaimVerdict:
    token: NumToken
    verdict: str
    expected: float | None = None
    expected_label: str = ""
    scale_adjusted: bool = False
    note: str = ""


@dataclass(frozen=True)
class ArithVerdict:
    derivation: Derivation
    ok: bool
    computed: float | None
    note: str = ""


# --- label normalization ----------------------------------------------------
_NON_ALNUM = re.compile(r"[^a-z0-9]+")
_TRAILING_PAREN = re.compile(r"\s*\([^)]*\)\s*$")
_STOPWORDS = frozenset({
    "the", "a", "an", "of", "for", "is", "was", "are", "at", "in", "on", "to", "and",
    "its", "it", "this", "that", "with", "by", "as", "from", "has", "had", "have",
    "sits", "runs", "reached", "stands", "about", "roughly", "approximately", "over",
    "under", "above", "below", "around", "near", "nearly", "up", "down", "than",
    "company", "industry", "sector", "latest", "current", "value", "values",
})


def norm_label(text: str) -> str:
    """Lowercase, punctuation-free. Mirrors `resolveDefNumber`'s normLabel in the
    frontend so a label resolves the same way on both sides of the wire."""
    return _NON_ALNUM.sub("", (text or "").lower())


@lru_cache(maxsize=8192)
def label_tokens(text: str) -> frozenset[str]:
    """Content words of a label, with any acronym expanded through the retrieval map.

    Cached because it is called once per (claim, candidate) pair and walks the whole
    expansion map; without the cache the grader is quadratic in a hot loop.
    """
    raw = _TRAILING_PAREN.sub("", (text or "").lower())
    words = [w for w in _NON_ALNUM.sub(" ", raw).split() if w and w not in _STOPWORDS]
    out: set[str] = set(words)
    joined = " ".join(words)
    for key, expansion in EXPANSIONS.items():
        k = key.lower()
        if k in words or (len(k) > 3 and k in joined):
            out.update(w for w in _NON_ALNUM.sub(" ", expansion.lower()).split()
                       if w not in _STOPWORDS)
    return frozenset(out)


# Words that never identify a metric on their own. An overlap consisting only of
# these is not evidence of a match: measured against real answers, a bare "ratio"
# was pairing a debt-to-equity claim with Current Ratio and reporting it as a
# hallucination. Keep this list SMALL and purely generic. "debt", "equity" and
# "gross" must NOT be here, or `Debt To Equity` stops matching itself.
_WEAK_TOKENS = frozenset({
    "ratio", "ratios", "total", "value", "score", "rate", "per", "share", "shares",
    "level", "figure", "number", "amount", "key", "metric", "metrics",
})


def label_score(a: str, b: str) -> float:
    """Overlap of expanded content words, with generic-only overlaps rejected.

    A subset scores 1.0, which is what lets a short label like `wacc` match a
    context entry called `Valuation: WACC`. But the overlap must carry at least
    one distinguishing word first.
    """
    ta, tb = label_tokens(a), label_tokens(b)
    if not ta or not tb:
        return 0.0
    inter = ta & tb
    if not inter or not (inter - _WEAK_TOKENS):
        return 0.0
    if ta <= tb or tb <= ta:
        return 1.0
    return len(inter) / len(ta | tb)


# --- context parsing --------------------------------------------------------
@dataclass(frozen=True)
class ContextValue:
    label: str
    value: float
    unit: str
    decimals: int = 6      # as WRITTEN in the blob; 6 means "full precision" (JSON)


def _flatten_json(obj, prefix: str = "") -> list[ContextValue]:
    out: list[ContextValue] = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            out.extend(_flatten_json(v, f"{prefix} {_split_camel(str(k))}".strip()))
    elif isinstance(obj, list):
        for item in obj:
            out.extend(_flatten_json(item, prefix))
    elif isinstance(obj, bool):
        pass
    elif isinstance(obj, (int, float)):
        out.append(ContextValue(prefix, float(obj), PLAIN))
    return out


_CAMEL = re.compile(r"(?<=[a-z0-9])(?=[A-Z])")


def _split_camel(s: str) -> str:
    return _CAMEL.sub(" ", s).replace("_", " ")


def parse_context(blob: str) -> list[ContextValue]:
    """Every labelled figure the app handed the model.

    Segments split on blank lines. A segment that parses as JSON is flattened to
    dotted paths (several sections hand-roll `JSON.stringify` instead of using
    `buildDataContext`); anything else goes through the same scanner the answer
    does, so both sides share one grammar.
    """
    if not blob:
        return []
    out: list[ContextValue] = []
    for segment in re.split(r"\n\s*\n", blob):
        segment = segment.strip()
        if not segment:
            continue
        if segment[0] in "{[":
            try:
                out.extend(_flatten_json(json.loads(segment)))
                continue
            except (ValueError, TypeError):
                pass
        for tok in scan(segment):
            if tok.unit in (YEAR, ORDINAL, DATE) or not tok.label:
                continue
            out.append(ContextValue(tok.label, tok.value, tok.unit, tok.decimals))
    return out


# --- comparison -------------------------------------------------------------
def tolerance(tok: NumToken, expected: float, ctx_decimals: int = 6,
              ctx_scale: float = 1.0) -> float:
    """Half a unit in the last written place on BOTH sides, widened for a hedge.

    The model's precision is its claim of precision: `8%` asserts far less than
    `8.42%` and must be graded far more loosely.

    The context's precision matters just as much, and missing it is a live
    false-positive source. `num()` in aiDataContext.ts:7-9 defaults to
    `toFixed(2)`, so `Key ratios: Return On Invested Capital=0.41` reaches the
    model already quantised. Read through the x100 scale-equivalence that is
    +/-0.5 PERCENTAGE POINTS of uncertainty, so a perfectly correct claim of
    41.2% would be flagged against a context that only ever said "0.41".
    """
    claim_ulp = 0.5 * (10.0 ** -tok.decimals) * abs(tok.scale_applied or 1.0)
    ctx_ulp = 0.5 * (10.0 ** -ctx_decimals) * abs(ctx_scale or 1.0)
    rel = HEDGE_REL if tok.hedge == "about" else REL_FLOOR
    return max(claim_ulp + ctx_ulp, rel * abs(expected))


def _units_line_up(claim: str, ctx: str) -> bool:
    """Which claim/context unit pairs may be compared at all.

    PLAIN is a near-wildcard because `Key ratios:` emits bare decimals with no
    unit, and a percent claim against a raw decimal is the legitimate common case.

    USD is the exception and it has to be: measured against real answers, letting
    a dollar amount match a bare decimal paired `$74.2B` with a Gross Profit Ratio
    of 0.56 and reported it as a hallucination. A currency figure is never a bare
    ratio, so it only ever compares against another currency figure.

    PCT against PP stays blocked, or every spread in the app reads as an error.
    """
    if claim == ctx:
        return True
    if USD in (claim, ctx):
        return False
    return PLAIN in (claim, ctx)


def compare(tok: NumToken, expected: float, ctx_decimals: int = 6,
            ctx_unit: str = PLAIN) -> tuple[str, bool, float]:
    """(verdict, scale_adjusted, comparable_expected) for one claim.

    The third element is the candidate actually judged against, in the CLAIM's
    units. Reporting the raw context value instead would show the user
    "Stated 38.5% vs page data 0.412", which reads as a unit bug rather than as
    the disagreement it is.
    """
    # (value, scale_adjusted, uncertainty multiplier on the context's own ulp)
    candidates: list[tuple[float, bool, float]] = [(expected, False, 1.0)]
    # THE SCALE-EQUIVALENCE CLASS, and it is ONLY legitimate when the context value
    # is a raw PLAIN decimal, whose fraction-vs-percent scale is ambiguous
    # (`Key ratios: roic=0.41`). When the context was scanned WITH an explicit unit
    # (PCT/PP/TIMES/USD) its scale is unambiguous, so a x100 claim against it is a
    # real error, not a scale artefact. Without this gate, "82%" was graded a MATCH
    # against a context of "Dividend Yield 0.82%" -- a 100x-wrong number accepted as
    # correct, the single worst outcome for this module.
    if ctx_unit == PLAIN:
        if tok.unit in (PCT, PP) and abs(expected) <= 1.5:
            candidates.append((expected * 100.0, True, 100.0))
        if tok.unit == PLAIN and abs(tok.value) <= 1.5 and abs(expected) > 1.5:
            candidates.append((expected / 100.0, True, 0.01))
        # PLAIN vs PLAIN across the same x100 divide: a claim of `10` ("10
        # percentage points") against a context threshold stored as `0.1`.
        if tok.unit == PLAIN and abs(tok.value) > 1.5 and 0 < abs(expected) <= 1.5:
            candidates.append((expected * 100.0, True, 100.0))

    best = (UNSUPPORTED, False, expected)
    best_delta = float("inf")
    for exp, adjusted, ctx_mult in candidates:
        tol = tolerance(tok, exp, ctx_decimals, ctx_mult)
        # A hedge that is violated is a MISMATCH, not UNSUPPORTED. rarr.tier1 reads
        # compare() directly and filters its disagreement evidence on == MISMATCH,
        # so a bare `continue` here (leaving the UNSUPPORTED initializer) meant a
        # violated "over/under/range" claim was never flagged with evidence in hand.
        if tok.hedge == "range" and tok.lo is not None and tok.hi is not None:
            if tok.lo - tol <= exp <= tok.hi + tol:
                return MATCH, adjusted, exp
            delta = min(abs(exp - tok.lo), abs(exp - tok.hi))
        elif tok.hedge == "over":
            if exp >= tok.value - tol:
                return MATCH, adjusted, exp
            delta = abs(tok.value - exp)
        elif tok.hedge == "under":
            if exp <= tok.value + tol:
                return MATCH, adjusted, exp
            delta = abs(tok.value - exp)
        else:
            delta = abs(tok.value - exp)
            if delta <= tol:
                return MATCH, adjusted, exp
        # Keep the NEAREST candidate, so the reported figure is the one in the
        # claim's own units rather than whichever scale happened to be tried first.
        if delta < best_delta:
            best_delta = delta
            verdict = (APPROX if tok.hedge == "about" and delta <= max(tol, HEDGE_WIDE * abs(exp))
                       else MISMATCH)
            best = (verdict, adjusted, exp)
    return best


# A figure the answer does not assert as the subject's own current value. Both
# classes were measured as false positives on real answers:
#   "A WACC of 11% versus 10% changes the intrinsic value modestly"  <- a sensitivity
#   "Third-party estimates range from 6.7% (Alpha Spread) to 12%"    <- attributed
_HYPOTHETICAL = re.compile(
    r"\b(?:if|were|suppose|assuming|hypothetical|sensitivity|scenario|instead of|"
    r"rather than|versus|vs\.?|compared with|would (?:be|imply|give|mean)|"
    r"each additional|every extra|per \d|"
    # "WACC rises from 10% to 12%" is a sensitivity row, not a statement of the
    # current value. Measured as a false positive on a real answer.
    r"(?:rises?|falls?|drops?|moves?|climbs?|declines?|goes?)\s+(?:from|to)|"
    r"\bfor (?:example|instance)\b|\bsay\b|\bimagine\b)\b", re.IGNORECASE)
# "A CV of 0.25 says one standard deviation equals 25%" teaches the reader how to
# read the metric; it is not a claim about this subject's value.
_ILLUSTRATIVE = re.compile(
    r"\b(?:an?|every)\s+[A-Za-z][\w /-]{1,28}\s+of\s+$|"
    r"\b(?:means?|implies|indicates?|says?|signals?|tells? you|would mean)\b",
    re.IGNORECASE)
# "oscillated between roughly 2% and 8%" is a historical RANGE, so neither endpoint
# is the current value. The scanner's range rule only covers adjacent forms.
_BETWEEN_RANGE = re.compile(r"\bbetween\b[^.\n]{0,40}$", re.IGNORECASE)
# A DERIVED quantity is not its base metric. Measured as the last artefact class:
# `| Spread (ROIC - WACC) | -641 bps |` bound to ROIC because the row label names
# ROIC, and "Weighted at 13% debt" bound to WACC. If the claim is described as a
# spread/weight/premium and the context entry is not, they are different things.
_DERIVED = re.compile(
    r"\b(?:spread|gap|premium|discount|excess|weight(?:ed|ing)?|contribution|"
    r"delta|difference|multiplies|multiple of|times the|net change|swing)\b",
    re.IGNORECASE)
_ATTRIBUTED = re.compile(
    r"\b(?:third[- ]party|estimates?|according to|per [A-Z]|consensus|analysts?|"
    r"street|research firm|reported by|cited|survey|textbook|rule of thumb|"
    r"historically|historical average|typical(?:ly)?|peers? (?:trade|average))\b",
    re.IGNORECASE)


def _is_asserted(answer: str, tok: NumToken) -> bool:
    """False when the clause frames the number as hypothetical or someone else's."""
    left = max(answer.rfind(".", 0, tok.span[0]), answer.rfind("\n", 0, tok.span[0])) + 1
    right = min([p for p in (answer.find(".", tok.span[1]), answer.find("\n", tok.span[1]))
                 if p != -1] or [len(answer)])
    clause = answer[left:right]
    if _HYPOTHETICAL.search(clause) or _ATTRIBUTED.search(clause):
        return False
    before = answer[left:tok.span[0]]
    # Both of these look only at the text BEFORE the number, because they are about
    # how the number was introduced.
    return not (_BETWEEN_RANGE.search(before) or _ILLUSTRATIVE.search(before))


def grade_claims(answer: str, data_context: str) -> list[ClaimVerdict]:
    """Reconcile every numeric claim in `answer` against `data_context`."""
    ctx = parse_context(data_context)
    out: list[ClaimVerdict] = []
    for tok in scan(answer):
        if not tok.gradable:
            out.append(ClaimVerdict(tok, UNGRADED))
            continue
        if not _is_asserted(answer, tok):
            out.append(ClaimVerdict(tok, UNGRADED, note="not asserted as a current value"))
            continue
        claim_is_derived = bool(_DERIVED.search(tok.label))
        scored = [(label_score(tok.label, c.label), c) for c in ctx
                  if _units_line_up(tok.unit, c.unit)
                  # A spread is not its base metric, and a weight is not the rate.
                  and claim_is_derived == bool(_DERIVED.search(c.label))]
        scored = [(s, c) for s, c in scored if s >= LABEL_MIN]
        scored.sort(key=lambda sc: -sc[0])

        if not scored:
            # No label to hang it on. Is the magnitude present anywhere at all?
            present = any(abs(tok.value - c.value) <= tolerance(tok, c.value, c.decimals)
                          for c in ctx)
            out.append(ClaimVerdict(tok, PRESENT if present else UNSUPPORTED))
            continue

        # Prefer any candidate that agrees; only report a mismatch when NONE does.
        # `c.unit` gates the scale-equivalence so a x100 claim cannot match an
        # already-percent context value.
        verdicts = [(compare(tok, c.value, c.decimals, c.unit), c) for _s, c in scored[:4]]
        for (v, adj, exp), c in verdicts:
            if v == MATCH:
                out.append(ClaimVerdict(tok, MATCH, exp, c.label, adj))
                break
        else:
            for (v, adj, exp), c in verdicts:
                if v == APPROX:
                    out.append(ClaimVerdict(tok, APPROX, exp, c.label, adj))
                    break
            else:
                (v, adj, exp), c = verdicts[0]
                out.append(ClaimVerdict(tok, MISMATCH, exp, c.label, adj))
    return out


def grade_arithmetic(answer: str) -> list[ArithVerdict]:
    """Re-evaluate every derivation the answer states. Unit-incompatible ones are
    skipped rather than failed: they are usually a parse artefact, not a claim."""
    out: list[ArithVerdict] = []
    for d in derivations(answer):
        if d.operand_units and not _all_compatible(d.operand_units):
            out.append(ArithVerdict(d, True, None, "skipped: incompatible operand units"))
            continue
        value, err = evaluate(d.lhs)
        if value is None:
            out.append(ArithVerdict(d, True, None, f"skipped: {err}"))
            continue
        half_ulp = 0.5 * (10.0 ** -d.rhs_decimals)
        tol = max(half_ulp, 0.005 * abs(d.rhs))
        out.append(ArithVerdict(d, abs(value - d.rhs) <= tol, value))
    return out


def _all_compatible(units: tuple[str, ...]) -> bool:
    kinds = {u for u in units if u != PLAIN}
    return len(kinds) <= 1 or kinds <= {PCT, PP}


def self_contradictions(answer: str) -> list[tuple[str, float, float]]:
    """One metric carrying two materially different values in the same answer,
    typically prose against a table. Free to compute, and no external evidence
    could find it.

    Matching is pairwise through `label_score` rather than on an exact normalized
    string: the prose says "The WACC is" and the table cell says "WACC Value", so
    keying on the literal label would never pair them.
    """
    # Two cells on the SAME table row are never a contradiction: a row legitimately
    # holds a value beside its benchmark ("Current Ratio | 0.42 | 1.5 typical").
    # Per-cell labels now distinguish them, so most such pairs no longer score as a
    # match at all, but the guard stays because a row can repeat a column header.
    # Excluding table tokens ENTIRELY is the wrong fix: that also kills the
    # prose-against-table catch this exists for.
    in_table = set(table_labels(preprocess(answer)))
    toks = [t for t in scan(answer) if t.gradable and t.label and not t.hedge]
    # Tier 0 runs inline in the request path, so this must stay bounded on any
    # input. Real answers carry well under 100 figures; the cap only bites on
    # pathological text, where a partial contradiction scan is the right trade.
    toks = toks[:MAX_CONTRADICTION_TOKENS]
    # Only compare tokens that share a content word. Without the inverted index
    # this is quadratic over every pair in the answer.
    postings: dict[str, list[int]] = {}
    for i, t in enumerate(toks):
        for w in label_tokens(t.label):
            postings.setdefault(w, []).append(i)
    pairs: set[tuple[int, int]] = set()
    for idxs in postings.values():
        if len(idxs) > 40:          # a word this common carries no discriminating power
            continue
        for pi, i in enumerate(idxs):
            for j in idxs[pi + 1:]:
                pairs.add((i, j))

    out: list[tuple[str, float, float]] = []
    seen: set[tuple[int, int]] = set()
    for i, j in sorted(pairs):
        a, b = toks[i], toks[j]
        if a.line == b.line and a.line in in_table:
            continue
        if a.unit != b.unit or label_score(a.label, b.label) < LABEL_MIN:
            continue
        if abs(a.value - b.value) <= max(tolerance(a, b.value), tolerance(b, a.value)):
            continue
        key = (min(a.line, b.line), max(a.line, b.line))
        if key in seen:
            continue
        seen.add(key)
        out.append((a.label, min(a.value, b.value), max(a.value, b.value)))
    return out


def report(answer: str, data_context: str) -> dict:
    """The whole deterministic pass, as the shape Tier 0 will return."""
    claims = grade_claims(answer, data_context)
    arith = grade_arithmetic(answer)
    counts: dict[str, int] = {}
    for c in claims:
        counts[c.verdict] = counts.get(c.verdict, 0) + 1
    bound = counts.get(MATCH, 0) + counts.get(APPROX, 0) + counts.get(MISMATCH, 0)
    return {
        "checked": sum(1 for c in claims if c.token.gradable),
        "bound": bound,
        "matched": counts.get(MATCH, 0),
        "approx": counts.get(APPROX, 0),
        "mismatched": counts.get(MISMATCH, 0),
        "unsupported": counts.get(UNSUPPORTED, 0),
        "present_unlabeled": counts.get(PRESENT, 0),
        "numeric_fidelity": (counts.get(MATCH, 0) + counts.get(APPROX, 0)) / bound if bound else None,
        "arithmetic": {
            "checked": sum(1 for a in arith if a.computed is not None),
            "errors": sum(1 for a in arith if not a.ok),
        },
        # INFORMATIONAL ONLY, deliberately named so. Measured on real answers this
        # detector still fires on cross-row table comparisons and on coarse prose
        # label windows (an answer discussing geometric, arithmetic and implied ERP
        # in one paragraph reads as three contradictions). It is not calibrated, so
        # it must never gate a badge or enter a defect count until it is.
        "contradictions_informational": len(self_contradictions(answer)),
        "flagged": [c for c in claims if c.verdict == MISMATCH],
        "arith_errors": [a for a in arith if not a.ok],
    }
