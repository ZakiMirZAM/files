"""Pure helpers for POST /story-answer: request validation, prompt assembly and output
parsing. No I/O, no SDK, so the contract is testable without a model
(rag/test_story_answer.py).

The route answers one question of the reader's story. It never judges the reader's
answer: the agent always researches (vault first, then the web) and writes the
answer, keeping and building on the reader's points when the reader wrote any. The
page then converts the AI's answers through /story-inputs.
"""
from __future__ import annotations

import json

from story_inputs import MAX_ANSWER, MAX_COMPANY, MAX_DATA, MAX_TICKER, STORY_QUESTIONS

# The nine story questions (eight inputs + synthesis), then the two checks.
CHECK_QUESTIONS = [
    ("indiv.story_test", "whether the story is possible, plausible and probable"),
    ("indiv.big_market", "whether the story relies on a big market many rivals chase"),
]
STORY_IDS = tuple(qid for qid, _n, _l in STORY_QUESTIONS)
QUESTION_IDS = STORY_IDS + tuple(qid for qid, _l in CHECK_QUESTIONS)

NO_ANSWER = "(No answer given.)"
MAX_QUESTION = 6_000

ERR_ID = "questionId is not a story question"
ERR_QUESTION = "question is required"
ERR_QUESTION_LONG = "question is too long"
ERR_ANSWER_LONG = "an answer is too long"
ERR_OTHERS = "otherAnswers must be an object"
ERR_DATA = "data is required"
ERR_DATA_LONG = "data is too long"
ERR_TICKER = "ticker is required"

# Output caps.
MAX_OUT_ANSWER, MAX_SOURCE, MAX_SOURCES = 6_000, 300, 12


def _clean(value) -> str:
    return value.strip() if isinstance(value, str) else ""


def validate_request(data) -> tuple[str | None, dict | None]:
    """(error, None) for an invalid body, else (None, clean payload)."""
    if not isinstance(data, dict):
        return ERR_QUESTION, None
    qid = data.get("questionId")
    if qid not in QUESTION_IDS:
        return ERR_ID, None

    question = _clean(data.get("question"))
    if not question:
        return ERR_QUESTION, None
    if len(question) > MAX_QUESTION:
        return ERR_QUESTION_LONG, None

    user_answer = _clean(data.get("userAnswer"))      # blank is allowed: the AI answers it
    if len(user_answer) > MAX_ANSWER:
        return ERR_ANSWER_LONG, None

    raw_others = data.get("otherAnswers")
    if raw_others is not None and not isinstance(raw_others, dict):
        return ERR_OTHERS, None
    others: dict[str, str] = {}
    for sid in STORY_IDS:                             # unknown keys are ignored
        text = _clean((raw_others or {}).get(sid))
        if len(text) > MAX_ANSWER:
            return ERR_ANSWER_LONG, None
        if text:
            others[sid] = text

    block = _clean(data.get("data"))
    if not block:
        return ERR_DATA, None
    if len(block) > MAX_DATA:
        return ERR_DATA_LONG, None

    ticker = _clean(data.get("ticker"))
    if not ticker or len(ticker) > MAX_TICKER:
        return ERR_TICKER, None
    company = _clean(data.get("company"))[:MAX_COMPANY] or ticker
    return None, {"ticker": ticker, "company": company, "questionId": qid,
                  "question": question, "userAnswer": user_answer,
                  "otherAnswers": others, "data": block}


def build_prompt(payload: dict, guidance: str = "") -> str:
    """The user message. `guidance` is the research-tool note /ask also appends."""
    parts = [
        f"Subject: {payload['ticker']} ({payload['company']})",
        "Computed data on the page (AUTHORITATIVE LIVE DATA: the site computed these exact "
        "figures from its own data):\n" + payload["data"],
        "The question:\n" + payload["question"],
        "The reader's answer:\n" + (payload["userAnswer"] or NO_ANSWER),
    ]
    others = payload["otherAnswers"]
    if others:
        parts.append("The story being tested:\n" + "\n\n".join(
            f"Question {n}, {label}:\n{others[qid]}"
            for qid, n, label in STORY_QUESTIONS if qid in others))
    return "\n\n".join(parts) + guidance + "\n\nReturn the JSON object now."


def parse_answer_output(text: str) -> dict | None:
    """{answer, sources, builtOnReader}, or None when the output is unusable."""
    if not isinstance(text, str):
        return None
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < start:
        return None
    try:
        # strict=False: a raw line break inside the answer string is still readable.
        obj = json.loads(text[start:end + 1], strict=False)
    except ValueError:
        return None
    if not isinstance(obj, dict) or not isinstance(obj.get("builtOnReader"), bool):
        return None
    answer, sources = obj.get("answer"), obj.get("sources", [])
    if not isinstance(answer, str) or not answer.strip():
        return None
    if not isinstance(sources, list) or not all(isinstance(s, str) for s in sources):
        return None
    return {"answer": answer.strip()[:MAX_OUT_ANSWER],
            "sources": [s.strip()[:MAX_SOURCE] for s in sources if s.strip()][:MAX_SOURCES],
            "builtOnReader": obj["builtOnReader"]}
