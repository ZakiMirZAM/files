"""Number and derivation grammar for model-written financial prose.

This module turns an answer into checkable atoms. Everything downstream is only
as good as this, and its false-positive rate is what decides whether the whole
verification layer is usable: a badge that wrongly says "this number is wrong"
teaches the user to ignore the badge.

So the bias throughout is toward NOT producing a token, and toward classifying a
token as something that can never be graded a mismatch. Years, ordinals, filing
form numbers and dates are recognised precisely so they can be excluded.

Formats are pinned to what the app actually emits. `fmtVal()` in
frontend/src/lib/aiDataContext.ts:170-182 writes `$1.23T` (2dp), `$45.6B` (1dp),
`$789M` (0dp), `$12K` (0dp), `12.34%` (2dp), `1.23x` (2dp), and
`summarizeTrendForAI` writes `+1.20pp` and `+12.3%`. `decimals` records the
precision AS WRITTEN, because the model's precision is its claim of precision and
that is what sets the tolerance downstream.

Three local hazards, each of which has its own test:

  * U+2212 MINUS is load-bearing in this repo (~234 places, definition labels like
    `ROIC − WACC`). It is a SIGN only when immediately followed by a digit.
  * An en dash between two numbers is a range, not a subtraction.
  * `pp` and `bps` are DELTA units. A `pp` claim may never be compared against a
    `pct` level, and conflating them would flag every spread in the app.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

# --- units ------------------------------------------------------------------
PCT = "pct"          # a level, e.g. 8.42%
PP = "pp"            # a delta, e.g. +1.20pp. NEVER comparable to PCT.
USD = "usd"
TIMES = "times"      # 1.23x
PLAIN = "plain"
YEAR = "year"        # never graded a mismatch
ORDINAL = "ordinal"  # never graded a mismatch
DATE = "date"        # never graded a mismatch
THRESHOLD = "threshold"  # a bar the metric is measured AGAINST, not a claim
DURATION = "duration"    # "over 14 years" is a span, not a figure

UNGRADABLE = frozenset({YEAR, ORDINAL, DATE, THRESHOLD, DURATION})

_SCALES = {
    "t": 1e12, "tn": 1e12, "trillion": 1e12,
    "b": 1e9, "bn": 1e9, "billion": 1e9,
    "m": 1e6, "mm": 1e6, "million": 1e6,
    "k": 1e3, "thousand": 1e3,
}


@dataclass(frozen=True)
class NumToken:
    raw: str
    value: float
    unit: str
    decimals: int                      # as written, before scale normalization
    span: tuple[int, int]
    line: int
    label: str = ""
    hedge: str | None = None           # about | over | under
    lo: float | None = None            # range low, when hedge == "range"
    hi: float | None = None
    scale_applied: float = 1.0

    @property
    def gradable(self) -> bool:
        return self.unit not in UNGRADABLE


@dataclass(frozen=True)
class Derivation:
    raw: str
    lhs: str                           # expression, normalized for safe_math
    rhs: float
    rhs_unit: str
    rhs_decimals: int
    line: int
    kind: str                          # equation | inline | percent_of | change | spread
    operand_units: tuple[str, ...] = field(default=())


# --- preprocessing ----------------------------------------------------------
# Everything excluded is BLANKED WITH SPACES rather than deleted, so every span
# stays valid against the original string and a caller can still quote the text.

_SOURCES_LINE = re.compile(r"^\s*(sources?|related chapters elsewhere in the library)\s*:.*",
                           re.IGNORECASE | re.MULTILINE | re.DOTALL)
_RELATED_LINE = re.compile(r"^\s*related chapters elsewhere in the library\s*:.*$",
                           re.IGNORECASE | re.MULTILINE)
_ORDERED_MARKER = re.compile(r"^(\s*)(\d{1,2}\.)(\s)", re.MULTILINE)
_HEADING_HASHES = re.compile(r"^#{1,6}\s", re.MULTILINE)

# Identifiers that merely look numeric. Blanked before scanning.
_NOISE = re.compile(
    r"""(?xi)
    \b(?:10|20|40|8|6|11)-[KQFA]\b        # 10-K, 10-Q, 20-F, 8-K
  | \bDEF\s+14A\b
  | \bS&P\s*\d{3,4}\b
  | \bFTSE\s*\d+\b
  | \bNasdaq\s*\d+\b
  | \bRussell\s*\d{4}\b
  | \bQ[1-4]\b
  | \bFY\s?\d{2,4}\b
  | \bCh(?:apter)?\s?\d+\b
  | \bTable\s+\d+\b
  | \bChapter\s+\d+\b
  | \b\d{4}-\d{2}-\d{2}\b               # 2024-01-01
  | \b\d{4}-\d{2}\b                     # 2019-01 (the trend Path format)
  | \bISBN[\s\d-]+
  | \b97[89]\d{10}\b
    """
)
_ORDINAL_PAT = re.compile(
    r"""(?xi)
    \#\d+
  | \brank(?:ed)?\s+\d+(?:\s+(?:of|out\s+of)\s+\d+)?
  | \btop\s+\d+\b
  | \b\d+(?:st|nd|rd|th)\b
  | \(\s*\d+\s*\)
    """
)


_CODE_SPAN = re.compile(r"`[^`\n]+`")


def _blank(text: str, pattern: re.Pattern) -> str:
    return pattern.sub(lambda m: " " * len(m.group(0)), text)


def _blank_symbolic_spans(text: str) -> str:
    """Blank inline code spans that are ALGEBRA rather than arithmetic.

    `WACC = (E / (D + E)) x Ke + (D / (D + E)) x Kd x (1 - t)` contains a literal
    `1`, and grading it produced a flag against Debt To Equity. The `1` is part of
    the notation, not a claim about the company.

    Letters outnumbering digits separates the two cleanly: an algebraic identity is
    mostly symbols, while a worked line like `Spread = 41.2 - 8.42 = 32.78` is
    mostly digits and must survive so the arithmetic checker still sees it.
    """
    def replace(m: re.Match) -> str:
        body = m.group(0)
        # Count letters vs digits on the RIGHT of the last '=' only. A worked
        # equation's metric NAME lives on the left ("Economic Value Added = ..."),
        # and counting it made any equation with a descriptive name look like
        # algebra and get blanked, hiding a real arithmetic error from the checker.
        rhs = body.rsplit("=", 1)[-1]
        letters = sum(c.isalpha() for c in rhs)
        digits = sum(c.isdigit() for c in rhs)
        return " " * len(body) if letters > digits else body
    return _CODE_SPAN.sub(replace, text)


def preprocess(text: str) -> str:
    """Blank the regions that must never yield a claim, preserving all offsets.

    The `Sources:` line matters most: it is full of chapter numbers, ISBNs and
    years, and scanning it would poison every count in the report.
    """
    if not text:
        return ""
    out = _blank(text, _SOURCES_LINE)
    out = _blank(out, _RELATED_LINE)
    out = _ORDERED_MARKER.sub(lambda m: m.group(1) + " " * len(m.group(2)) + m.group(3), out)
    out = _blank(out, _HEADING_HASHES)
    out = _blank(out, _NOISE)
    out = _blank_symbolic_spans(out)
    return out


# --- tables -----------------------------------------------------------------
_TABLE_SEP = re.compile(r"^\s*\|?[\s:|-]*-{2,}[\s:|-]*\|?\s*$")


def table_labels(text: str) -> dict[int, list[tuple[int, int, str]]]:
    """Per-CELL labels for pipe-table body rows, as absolute character spans.

    Returns line number -> [(start, end, "row label + that cell's column header")].

    Per-cell rather than per-line, and that distinction is load-bearing. Giving
    every cell in a row the same label made `ROIC | 47% | >= 12% | 6.47pp spread`
    label the spread as ROIC, which then reported a correct answer as a
    hallucination. It also made a value and its own benchmark look like a
    self-contradiction. Column headers are what separate them.

    The grammar mirrors frontend/src/lib/markdown.ts: a header row, a separator
    row, then body rows.
    """
    out: dict[int, list[tuple[int, int, str]]] = {}
    lines = text.split("\n")
    starts: list[int] = []
    pos = 0
    for line in lines:
        starts.append(pos)
        pos += len(line) + 1

    def cells_of(line: str, base: int) -> list[tuple[int, int, str]]:
        """(abs_start, abs_end, text) per cell, keeping real offsets.

        Only the leading/trailing empty EDGE cells from a `| ... |` border are
        dropped. A genuinely blank INTERIOR cell is kept, because dropping it
        shifts every later cell onto the wrong column header and mislabels the
        values after it.
        """
        parts = line.split("|")
        spans: list[tuple[int, int, str]] = []
        cursor = 0
        for part in parts:
            spans.append((base + cursor, base + cursor + len(part), part.strip()))
            cursor += len(part) + 1
        lo, hi = 0, len(spans)
        if spans and not spans[0][2]:
            lo = 1
        if len(spans) > lo and not spans[-1][2]:
            hi = len(spans) - 1
        return spans[lo:hi]

    i = 0
    while i < len(lines) - 1:
        if "|" in lines[i] and _TABLE_SEP.match(lines[i + 1]) and "|" in lines[i + 1]:
            headers = [c[2] for c in cells_of(lines[i], starts[i])]
            j = i + 2
            while j < len(lines) and "|" in lines[j]:
                row_cells = cells_of(lines[j], starts[j])
                row_label = row_cells[0][2] if row_cells else ""
                entries: list[tuple[int, int, str]] = []
                for idx, (cs, ce, _txt) in enumerate(row_cells):
                    header = headers[idx] if idx < len(headers) else ""
                    label = " ".join(p for p in (row_label, header) if p)
                    entries.append((cs, ce, label or row_label))
                out[j] = entries
                j += 1
            i = j
        else:
            i += 1
    return out


# --- hedges -----------------------------------------------------------------
_HEDGE_ABOUT = re.compile(
    r"(?i)\b(?:about|roughly|approximately|approx\.?|around|near(?:ly)?|close to|circa|some|~)\s*$")
_HEDGE_OVER = re.compile(
    r"(?i)\b(?:over|above|more than|greater than|at least|north of|in excess of|exceeds?)\s*$")
_HEDGE_UNDER = re.compile(
    r"(?i)\b(?:under|below|less than|fewer than|at most|shy of|beneath)\s*$")


# A bar the metric is compared AGAINST. Measured on real answers, the model writes
# comparison tables like `41% | >=35% |`, and grading the 35% against the metric's
# actual value reported a correct answer as a hallucination. Distinct from the
# `over`/`above` hedge, which IS a claim about the value.
_THRESHOLD_CUE = re.compile(
    r"(?:[≥≤⩾⩽]|>=|<=|\bat least\b|\bminimum\b|\bmin\.?\b|\bmax\.?\b|\btarget\b|"
    r"\bthreshold\b|\bhurdle\b|\bbar\b|\bcutoff\b|\bpasses? at\b|\bflags? at\b)\s*$",
    re.IGNORECASE)
# "over 14 years", "across 3 quarters": a span, not a metric value.
_DURATION_AFTER = re.compile(
    r"^\s*(?:years?|yrs?|months?|quarters?|weeks?|days?|decades?|periods?)\b", re.IGNORECASE)


# The same idea one level up: a whole COLUMN can be thresholds. Measured on real
# answers, `1.25x+` under a "Typical Industrial Threshold" header and
# `12.0% (threshold)` were both graded against the metric's actual value. The cue
# is in the header or trails the number, so the preceding-text check cannot see it.
_THRESHOLD_LABEL = re.compile(
    r"\b(?:threshold|target|minimum|maximum|ceiling|floor|hurdle|benchmark|typical|"
    r"required|passes|bar|limit|standard|guideline|rule of thumb)\b", re.IGNORECASE)
# Narrower than the header list on purpose. A COLUMN headed "Typical" holds
# benchmarks, but "margins of 8-9% are typical" is a claim about margins, and
# treating the trailing word as a threshold cue silently dropped it.
_THRESHOLD_TRAILING = re.compile(
    r"^\s*\(?\s*(?:threshold|ceiling|floor|minimum|maximum|hurdle|limit|cutoff)\b",
    re.IGNORECASE)


def _is_threshold(text: str, start: int, label: str = "") -> bool:
    if _THRESHOLD_CUE.search(text[max(0, start - 24):start]):
        return True
    if label and _THRESHOLD_LABEL.search(label):
        return True
    # "12.0% (threshold)" and "3.0x ceiling": the cue trails the figure, but it has
    # to be adjacent to it, not merely somewhere later in the sentence.
    tail = text[start:start + 30]
    after = tail[len(tail) - len(tail.lstrip("0123456789.,%xX$€£¥ ")):]
    return bool(_THRESHOLD_TRAILING.match(after))


def _hedge_before(text: str, start: int) -> str | None:
    window = text[max(0, start - 28):start]
    if window.rstrip().endswith("~"):
        return "about"
    if _HEDGE_ABOUT.search(window):
        return "about"
    if _HEDGE_OVER.search(window):
        return "over"
    if _HEDGE_UNDER.search(window):
        return "under"
    return None


# --- the token grammar ------------------------------------------------------
_NUM = re.compile(
    r"""(?x)
    (?P<sign>[-−+])?                       # a sign ONLY when a digit follows
    (?P<cur>[$€£¥])?
    (?P<int>\d{1,3}(?:[, ]\d{3})+|\d+)
    (?P<frac>\.\d+)?
    (?P<scale>\s?(?:trillion|billion|million|thousand|tn|bn|mm|[TBMK]|(?<=\d)[mk])\b)?
    (?P<tail>\s?(?:%|pp|bps|bp|x|×))?
    """
)
# A range separator. An en/em dash may carry spaces; an ASCII hyphen may NOT,
# because `8 - 9` is a subtraction while `8-9` is a range. "to" is deliberately
# excluded: "from 383.3 to 391.0" is a CHANGE, and reading it as a range would
# invent a claim the answer never made.
_RANGE_JOIN = re.compile(r"^(?:\s*[–—]\s*|-(?=\d))")
_LABEL_STOP = re.compile(r"[.;!?|]")


def _label_before(text: str, start: int, floor: int) -> str:
    """Up to ~64 characters preceding the number, cut at a clause boundary.

    `floor` is the greater of the line start and the END of the previous token, so
    a window can never begin in the middle of an earlier number. Without that
    clamp, `8.42% against a ROIC of 41.2%` labels the second figure `42% against a
    ROIC of`, and the grader then matches on the digits of its neighbour.
    """
    window = text[max(floor, start - 64):start]
    # `Label: 8.4%` and `roic=0.1234` both end in a separator we can split on.
    window = window.rstrip().rstrip(":=,( ")
    cut = _LABEL_STOP.search(window[::-1])
    if cut:
        window = window[len(window) - cut.start():]
    return window.strip(" -−–,:=(").strip()


def _classify(m: re.Match, text: str) -> tuple[str, float]:
    """(unit, scale multiplier) for one match."""
    tail = (m.group("tail") or "").strip().lower()
    scale_raw = (m.group("scale") or "").strip().lower()
    scale = _SCALES.get(scale_raw, 1.0)
    if tail == "%":
        return PCT, scale
    if tail in ("pp",):
        return PP, scale
    if tail in ("bps", "bp"):
        return PP, 0.01          # 25bps is 0.25pp
    if tail in ("x", "×"):
        return TIMES, scale
    if m.group("cur"):
        return USD, scale
    if scale_raw:
        return PLAIN, scale
    digits = m.group("int")
    if (not m.group("frac") and not m.group("sign") and len(digits) == 4
            and 1900 <= int(digits) <= 2100):
        return YEAR, 1.0
    return PLAIN, 1.0


def scan(text: str) -> list[NumToken]:
    """Every gradable numeric claim in `text`, with its unit, precision and label."""
    if not text:
        return []
    clean = preprocess(text)
    tbl = table_labels(clean)
    ordinal_spans = [(m.start(), m.end()) for m in _ORDINAL_PAT.finditer(clean)]

    line_starts: list[int] = [0]
    for i, ch in enumerate(clean):
        if ch == "\n":
            line_starts.append(i + 1)

    def line_of(pos: int) -> int:
        lo, hi = 0, len(line_starts) - 1
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if line_starts[mid] <= pos:
                lo = mid
            else:
                hi = mid - 1
        return lo

    out: list[NumToken] = []
    consumed_to = -1
    prev_end = 0          # end of the last token, so a label cannot start inside it
    for m in _NUM.finditer(clean):
        if m.start() < consumed_to:
            continue
        digits = m.group("int")
        if not digits:
            continue
        # A sign is only a sign directly against a digit; `ROIC − WACC` has a space.
        sign_txt = m.group("sign") or ""
        raw = m.group(0)
        frac = m.group("frac") or ""
        decimals = len(frac) - 1 if frac else 0

        unit, scale = _classify(m, clean)

        magnitude = float(digits.replace(",", "").replace(" ", "") + frac)
        value = (-magnitude if sign_txt == "-" or sign_txt == "−" else magnitude) * scale

        ln = line_of(m.start())
        floor = max(line_starts[ln], prev_end)
        label = ""
        for cs, ce, cell_label in tbl.get(ln, ()):
            if cs <= m.start() < ce:
                label = cell_label
                break
        label = label or _label_before(clean, m.start(), floor)

        # Classification runs AFTER the label, because a whole table COLUMN can be
        # thresholds and only its header says so.
        if any(s <= m.start() < e for s, e in ordinal_spans):
            unit = ORDINAL
        elif _is_threshold(clean, m.start(), label):
            unit = THRESHOLD
        elif unit == PLAIN and _DURATION_AFTER.match(clean[m.end():]):
            unit = DURATION

        # Range: `8-9%`, `8 to 9%`, `8–9%`. Same unit, ascending, one token.
        lo_v = hi_v = None
        hedge = _hedge_before(clean, m.start())
        rest = clean[m.end():]
        rm = _RANGE_JOIN.match(rest)
        if rm:
            nxt = _NUM.match(rest[rm.end():])
            if nxt:
                n_unit, n_scale = _classify(nxt, clean)
                n_frac = nxt.group("frac") or ""
                n_val = float(nxt.group("int").replace(",", "") + n_frac) * n_scale
                if n_val > value and (unit == n_unit or unit == PLAIN):
                    lo_v, hi_v = value, n_val
                    hedge = "range"
                    unit = n_unit if unit == PLAIN else unit
                    decimals = max(decimals, len(n_frac) - 1 if n_frac else 0)
                    end = m.end() + rm.end() + nxt.end()
                    raw = clean[m.start():end]
                    consumed_to = end

        out.append(NumToken(
            raw=raw, value=value, unit=unit, decimals=decimals,
            span=(m.start(), m.start() + len(raw)), line=ln, label=label,
            hedge=hedge, lo=lo_v, hi=hi_v, scale_applied=scale,
        ))
        prev_end = m.start() + len(raw)
    return out


# --- derivations ------------------------------------------------------------
_OPS = r"[-+−*×/÷]"
_N = r"[-−+]?[$€£¥]?\d[\d,]*(?:\.\d+)?\s?(?:trillion|billion|million|thousand|tn|bn|[TBMK])?\s?(?:%|pp|bps|x|×)?"

_EQUATION_LINE = re.compile(r"^\s*`([^`]*=[^`]*)`\s*$", re.MULTILINE)
_INLINE_EQ = re.compile(rf"(?P<lhs>{_N}(?:\s*{_OPS}\s*{_N})+)\s*=\s*(?P<rhs>{_N})")
_PERCENT_OF = re.compile(
    rf"(?P<a>{_N})\s*%?\s+of\s+(?P<b>{_N})\s+(?:is|equals|gives|comes to|=)\s*(?P<c>{_N})", re.I)
_SPREAD = re.compile(
    rf"(?P<a>{_N})\s*(?:versus|vs\.?|against|over|minus|less)\s*(?P<b>{_N})"
    rf"[^.\n]{{0,44}}?\b(?:spread|gap|difference|premium|discount)\s*(?:of|is|=)?\s*(?P<c>{_N})", re.I)
# "from 383.3 to 391.0, up 2.0%" - the growth restatement this app writes constantly.
_CHANGE = re.compile(
    rf"\bfrom\s+(?P<a>{_N})\s+to\s+(?P<b>{_N})[^.\n]{{0,30}}?"
    rf"\b(?:up|down|a\s+(?:rise|gain|fall|drop|decline|decrease|increase)\s+of|"
    rf"growth\s+of|an?\s+increase\s+of)\s+(?P<c>{_N})", re.I)


def _num_of(s: str) -> tuple[float, str, int] | None:
    m = _NUM.match(s.strip())
    if not m:
        return None
    unit, scale = _classify(m, s)
    frac = m.group("frac") or ""
    sign = m.group("sign") or ""
    mag = float(m.group("int").replace(",", "").replace(" ", "") + frac)
    val = (-mag if sign in ("-", "−") else mag) * scale
    return val, unit, (len(frac) - 1 if frac else 0)


def derivations(text: str) -> list[Derivation]:
    """Spans the answer presents as a computation, in a form safe_math can check.

    Templates are tried strongest-first and a span is claimed once, so a display
    equation is not also reported as a bare inline equation.
    """
    if not text:
        return []
    clean = preprocess(text)
    out: list[Derivation] = []
    claimed: list[tuple[int, int]] = []

    def overlaps(span: tuple[int, int]) -> bool:
        return any(span[0] < e and s < span[1] for s, e in claimed)

    def add(span: tuple[int, int], raw: str, lhs: str, rhs_txt: str,
            kind: str, units: tuple[str, ...]) -> None:
        if overlaps(span):
            return
        parsed = _num_of(rhs_txt)
        if parsed is None:
            return
        rhs, rhs_unit, rhs_dec = parsed
        claimed.append(span)
        out.append(Derivation(raw=raw.strip(), lhs=lhs.strip(), rhs=rhs, rhs_unit=rhs_unit,
                              rhs_decimals=rhs_dec, line=clean.count("\n", 0, span[0]),
                              kind=kind, operand_units=units))

    for m in _EQUATION_LINE.finditer(clean):
        # `Spread = 41.2 − 8.42 = 32.78` names the result on the left, so the
        # computation is the SECOND-TO-LAST segment, not everything before the
        # final `=`. Taking rpartition alone leaves "Spread =" in the expression.
        parts = m.group(1).split("=")
        if len(parts) < 2:
            continue
        lhs, rhs = parts[-2], parts[-1]
        if _num_of(rhs) and re.search(r"\d", lhs):
            add(m.span(), m.group(0), _strip_units(lhs), rhs, "equation", ())

    for m in _INLINE_EQ.finditer(clean):
        units = tuple(u for _, u, _ in filter(None, (_num_of(x) for x in re.findall(_N, m.group("lhs")))))
        add(m.span(), m.group(0), _strip_units(m.group("lhs")), m.group("rhs"), "inline", units)

    for m in _PERCENT_OF.finditer(clean):
        a, b = _num_of(m.group("a")), _num_of(m.group("b"))
        if a and b:
            add(m.span(), m.group(0), f"({a[0]} / 100) * {b[0]}", m.group("c"),
                "percent_of", (a[1], b[1]))

    for m in _CHANGE.finditer(clean):
        a, b = _num_of(m.group("a")), _num_of(m.group("b"))
        if a and b and a[0] and _units_compatible(a[1], b[1]):
            add(m.span(), m.group(0), f"(({b[0]} - {a[0]}) / abs({a[0]})) * 100",
                m.group("c"), "change", (a[1], b[1]))

    for m in _SPREAD.finditer(clean):
        a, b = _num_of(m.group("a")), _num_of(m.group("b"))
        if a and b and _units_compatible(a[1], b[1]):
            add(m.span(), m.group(0), f"{a[0]} - {b[0]}", m.group("c"), "spread", (a[1], b[1]))

    out.sort(key=lambda d: d.line)
    return out


_UNIT_STRIP = re.compile(r"(?i)[$€£¥]|%|pp|bps|bp|x|×|trillion|billion|million|thousand|tn|bn|\b[TBMK]\b")


def _strip_units(expr: str) -> str:
    """Drop currency and unit marks so safe_math sees pure arithmetic. Scale words
    are dropped too, which is safe only because compatibility is checked first and
    both sides then share a scale."""
    return _UNIT_STRIP.sub("", expr)


def _units_compatible(a: str, b: str) -> bool:
    """You cannot subtract a percent from a dollar. PP and PCT are compatible with
    each other (a level minus a level yields a delta) but with nothing else."""
    if a == b:
        return True
    return {a, b} <= {PCT, PP} or {a, b} <= {PLAIN, TIMES}
