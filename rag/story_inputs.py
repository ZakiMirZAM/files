"""Pure helpers for POST /story-inputs: request validation, prompt assembly, output
parsing and the per-row verification status. No I/O, no SDK, so the whole contract
is testable without a model (rag/test_story_inputs.py).

The route turns a reader's eight story answers into the nine inputs of the story
DCF (backend/valuation/story.py): eight numbers and the stage count. The AI's JSON
is never trusted as-is: every row is rebuilt from known keys, the unit is overwritten with the canonical one, and a value
that is not a finite number rejects the whole output rather than reaching the page.
"""
from __future__ import annotations

import json
import math

# Same names and order as backend/valuation/story.py INPUT_NAMES (contract C1),
# then the stage count (the story-dcf body's `stages`).
INPUT_NAMES = ("totalMarket", "marketGrowth10y", "shareYear10", "targetMargin",
               "salesToCapital", "failureProbability", "distressProceeds", "stableRoic",
               "stages")
STAGE_COUNTS = (1, 2, 3)

UNITS = {
    "totalMarket": "currency", "distressProceeds": "currency",
    "marketGrowth10y": "rate",
    "shareYear10": "fraction", "targetMargin": "fraction",
    "failureProbability": "fraction", "stableRoic": "fraction",
    "salesToCapital": "ratio",
    "stages": "count",
}

# (answer id, question number, label the prompt uses). The page has /story-answer
# write every answer first, so a blank one arrives only when that call failed on a
# blank reader answer; it reaches the model as NO_ANSWER and the prompt's
# null-with-reason rule covers it.
NO_ANSWER = "(No answer given.)"
STORY_QUESTIONS = [
    ("indiv.story.market", 1, "what market it is really in"),
    ("indiv.story.new_customers", 2, "who the new customers are"),
    ("indiv.story.size", 3, "whether size helps it win"),
    ("indiv.story.edge", 4, "why customers pay it more, or it spends less"),
    ("indiv.story.growth_cost", 5, "what growth requires"),
    ("indiv.story.outside_forces", 6, "what it cannot control"),
    ("indiv.story.end", 7, "what could end the story"),
    ("indiv.story.edge_duration", 8, "how long the advantage lasts"),
    ("indiv.story.synthesis", 9, "the whole story"),
]

MAX_ANSWER = 12_000
MAX_DATA = 60_000
MAX_TICKER = 12
MAX_COMPANY = 200

ERR_ANSWERS = "answers to the eight story questions are required"
ERR_ANSWER_LONG = "an answer is too long"
ERR_DATA = "data is required"
ERR_DATA_LONG = "data is too long"
ERR_TICKER = "ticker is required"

# Output caps: characters per text field, items per list.
MAX_QUOTE, MAX_PROOF, MAX_SOURCE, MAX_SOURCES = 400, 1500, 200, 6
MAX_FLAG, MAX_FLAGS, MAX_WEAKEST, MAX_COUNTER = 400, 6, 600, 800


def validate_request(data) -> tuple[str | None, dict | None]:
    """(error, None) for an invalid body, else (None, clean payload)."""
    if not isinstance(data, dict) or not isinstance(data.get("answers"), dict):
        return ERR_ANSWERS, None
    raw = data["answers"]
    answers: dict[str, str] = {}
    for qid, _n, _label in STORY_QUESTIONS:
        value = raw.get(qid)
        text = value.strip() if isinstance(value, str) else ""
        if not text:
            # Tolerated: see NO_ANSWER above.
            continue
        if len(text) > MAX_ANSWER:
            return ERR_ANSWER_LONG, None
        answers[qid] = text

    block = data.get("data")
    block = block.strip() if isinstance(block, str) else ""
    if not block:
        return ERR_DATA, None
    if len(block) > MAX_DATA:
        return ERR_DATA_LONG, None

    ticker = data.get("ticker")
    ticker = ticker.strip() if isinstance(ticker, str) else ""
    if not ticker or len(ticker) > MAX_TICKER:
        return ERR_TICKER, None

    company = data.get("company")
    company = company.strip() if isinstance(company, str) else ""
    # ponytail: an over-long company name is cut, not refused; it only labels the prompt.
    company = company[:MAX_COMPANY] or ticker
    return None, {"ticker": ticker, "company": company, "answers": answers, "data": block}


def build_prompt(payload: dict) -> str:
    answers = payload["answers"]
    # The eight input questions always appear, blank ones marked NO_ANSWER; the
    # ninth appears only when answered.
    blocks = [f"Question {n}, {label}:\n{answers.get(qid) or NO_ANSWER}"
              for qid, n, label in STORY_QUESTIONS
              if answers.get(qid) or qid != STORY_QUESTIONS[-1][0]]
    return "\n\n".join([
        f"Subject: {payload['ticker']} ({payload['company']})",
        "Computed data on the page (AUTHORITATIVE LIVE DATA: the site computed these exact "
        "figures from its own data):\n" + payload["data"],
        "The reader's story answers:",
        *blocks,
        "Return the JSON object now.",
    ])


class _Malformed(Exception):
    pass


def _text(value, cap: int) -> str:
    """A string field: absent or null is "", anything else that is not a string is malformed."""
    if value is None:
        return ""
    if not isinstance(value, str):
        raise _Malformed
    return value.strip()[:cap]


def _texts(value, cap: int, most: int) -> list[str]:
    """A list of strings: absent or null is [], any other shape is malformed."""
    if value is None:
        return []
    if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
        raise _Malformed
    return [v.strip()[:cap] for v in value[:most]]


def _number(value):
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise _Malformed
    try:
        finite = math.isfinite(value)
    except OverflowError:                      # an integer too large for a float
        finite = False
    if not finite:
        raise _Malformed
    return value


def _stage_count(value):
    """1, 2 or 3 as an int; any other number is no stage count (null), not a malformed output."""
    return int(value) if value in STAGE_COUNTS else None


def parse_story_output(text: str) -> dict | None:
    """The model's JSON object, rebuilt to the C4 shape, or None when it is unusable."""
    if not isinstance(text, str):
        return None
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < start:
        return None
    try:
        obj = json.loads(text[start:end + 1])
    except ValueError:
        return None
    if not isinstance(obj, dict) or not isinstance(obj.get("rows"), list):
        return None
    try:
        by_name: dict[str, dict] = {}
        for row in obj["rows"]:
            name = row.get("input") if isinstance(row, dict) else None
            if name not in UNITS:
                continue                       # unknown or unnamed rows are ignored
            if name in by_name:
                return None
            by_name[name] = {
                "input": name,
                "storyQuote": _text(row.get("storyQuote"), MAX_QUOTE),
                "value": _stage_count(_number(row.get("value"))) if name == "stages"
                         else _number(row.get("value")),
                "unit": UNITS[name],
                "proof": _text(row.get("proof"), MAX_PROOF),
                "sources": _texts(row.get("sources"), MAX_SOURCE, MAX_SOURCES),
            }
        if len(by_name) != len(INPUT_NAMES):
            return None
        return {
            "rows": [by_name[name] for name in INPUT_NAMES],
            "riskFlags": _texts(obj.get("riskFlags"), MAX_FLAG, MAX_FLAGS),
            "weakestLink": _text(obj.get("weakestLink"), MAX_WEAKEST),
            "counterStory": _text(obj.get("counterStory"), MAX_COUNTER),
        }
    except _Malformed:
        return None


def row_status(report: dict | None) -> str:
    """Tier 0 calls a proof with no checkable figure "clean", so a clean report that
    reconciled nothing is "unchecked", not "verified"."""
    if report is None:
        return "unavailable"
    if report.get("status") == "flagged":
        return "flagged"
    if (report.get("matched") or 0) + (report.get("approx") or 0) >= 1:
        return "verified"
    return "unchecked"
