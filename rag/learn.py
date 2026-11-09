"""The Learn section's AI routes: flashcards, practice tests and short-answer grading.

  POST /learn/cards  {request, count, avoid?, model?}
                     -> {cards: [{front, back, tags}]}
  POST /learn/quiz   {request? | cards?, mcCount, shortCount, avoid?, model?}
                     -> {questions: [{type: "mc", prompt, choices[4], answer, explanation}
                                     | {type: "short", prompt, answer}]}
  POST /learn/grade  {question, modelAnswer, userAnswer, selfScore?, model?}
                     -> {score: 0 | 0.5 | 1, feedback}

Every error is JSON: {"error": "..."} with 400 (bad request) or 503 (the model
failed or its output could not be read).

Kept out of server.py on purpose: server.py is protected, so it only imports this
module, adds three routes and names their effort. The prompts below are module
constants, hash-pinned in rag/test_prompts.py like every other prompt, and are
passed to run_agent unmodified. The request-specific parts (the reader's request,
the counts, the cards) ride in the USER message.

A batch is capped (MAX_CARDS_PER_CALL, MAX_QUESTIONS_PER_CALL); the page asks for a
large deck or test in several calls and shows progress, so no single call runs
long enough to hit a budget or a proxy ceiling. There is no cap on the total.

Everything above `make_handlers` is pure (no SDK, no I/O) and tested in
rag/test_learn.py.
"""
from __future__ import annotations

import json
import random
import re

from aiohttp import web

# --- prompts (owner approval required to change; hashes in test_prompts.py) ----
LEARN_CARDS_SYSTEM = """\
You write Anki flashcards for a reader who is learning finance, accounting, economics and investing. The user message gives the reader's request (a topic, a book, an exam syllabus such as "CFA Level 1 Volume 1", or a list of terms) and the exact number of cards to write in this batch. It may also list the fronts of cards already written for the same deck. Never repeat or closely rephrase one of those.

RESEARCH
1. Vault first. Call search_vault several times before writing, once for each distinct idea the cards need, and use the library's own wording, definitions, formulas and rules of thumb. If the results are thin, search again with different wording.
2. Web second. When the vault does not cover a topic, or a fact must be current or exact (a formula, a threshold, the list of topics in a syllabus, a rule that changed), use WebSearch or WebFetch. Prefer the CFA Institute, Investopedia, Corporate Finance Institute and an author's own pages over aggregators.
3. General knowledge last, only to fill what the vault and the web do not cover. Never refuse, and never write a card that says a topic is not covered.
Never invent a figure, a formula or a definition. When a formula is not in the vault, confirm it on the web before writing it.

WHAT TO COVER
Cover the request in the order a course would teach it, one idea per card, so that each card can be recalled on its own. Write cards for definitions, for every formula (written out, with every variable defined and when it applies), for why a formula has its shape, for conditions and limits, for a worked example with the arithmetic shown and checked, for comparisons between ideas that are easy to confuse, and for common errors. Merge small facts into the card they support. No trivia.

CARD FORMAT
front: one clear question that tests understanding or use, in one sentence.
back: three to seven bullets. Each bullet is a line that begins with "- " and holds one idea as a full sentence. Put a blank line between bullets. Write a formula on its own bullet with "=", for example "- Return on equity = Net income / Average shareholders' equity". Indent a sub-bullet with two spaces only to define the variables of a formula or to give a list the source itself gives.
When a bullet is your own analysis rather than what the source says, begin it exactly with "Beyond the text," and apply what fits the idea: its assumptions, its limitations, trade-offs and incentives, how it helps pick the best company or industry, long term against short term, and the strongest opposing view.
tags: one to four lowercase, hyphenated topic tags, for example "ratio-analysis".

STYLE (hard rules)
- Use the source's own wording directly, especially for the definition of a named term.
- Minimize colons. No "Label: text" bullets.
- No question marks in the back.
- Never use the word "anchor".
- No em dashes or en dashes. Use a period, a comma or parentheses, and a plain hyphen for a minus sign. Straight quotes only.
- No "not X but Y" frames and no filler words (crucial, key, pivotal, landscape, robust, delve, underscore, showcase).
- Repeat a word rather than rotating synonyms.
- No citations. Do not name a book, an author, a page, a website or a URL anywhere in a card, and add no source list.
- No headings and no markdown other than the bullets.

WHAT YOU RETURN
Return one JSON object and nothing else: no text before or after it and no code fence.
{"cards": [{"front": "...", "back": "- ...\\n\\n- ...", "tags": ["..."]}]}
Return exactly the number of cards the message asks for."""

LEARN_QUIZ_SYSTEM = """\
You write a practice test for a reader who is learning finance, accounting, economics and investing. The user message gives the subject of the test, either the reader's own request or a deck of the reader's flashcards, and the exact number of multiple-choice and short-answer questions to write in this batch. It may also list questions already written for the same test. Never repeat or closely rephrase one of those.

RESEARCH
When the subject is a deck of flashcards, the cards are the primary source: test what the cards teach, and use search_vault or the web only to confirm a fact or to build a believable wrong choice. When the subject is a request, call search_vault first, several times with different wording, then use WebSearch or WebFetch when the vault does not cover a point or a fact must be current or exact, and general knowledge last. Never refuse. Never invent a figure, a formula or a definition.

THE QUESTIONS
Test understanding and use more than recall of wording: applying a formula to numbers, reading what a result means, choosing between two methods, finding the error in a statement, and explaining why. Mix easy and hard questions and spread them across the whole subject.
Multiple choice: one question and exactly four choices, with exactly one correct choice. The three wrong choices are mistakes a learner really makes (a wrong sign, the wrong denominator, a confused definition), each about as long as the correct choice. Never use "all of the above" or "none of the above". The explanation says in two or three sentences why the correct choice is right and what mistake the most tempting wrong choice makes. When a question uses numbers, work the arithmetic and check it before writing the choices.
Short answer: a question that one to four sentences can answer. The answer is the model answer a grader would accept, in one to four sentences, and it names every point a full answer must contain.

STYLE (hard rules)
- Plain words a learner can follow. Define a term inside the question when the question depends on it.
- No em dashes or en dashes. Use a period, a comma or parentheses, and a plain hyphen for a minus sign. Straight quotes only.
- No "not X but Y" frames and no filler words (crucial, key, pivotal, landscape, robust, delve, underscore, showcase).
- No citations. Do not name a book, an author, a page, a website or a URL, and add no source list.
- No headings and no markdown.

WHAT YOU RETURN
Return one JSON object and nothing else: no text before or after it and no code fence.
{"questions": [{"type": "mc", "prompt": "...", "choices": ["...", "...", "...", "..."], "answer": <index of the correct choice, 0 to 3>, "explanation": "..."}, {"type": "short", "prompt": "...", "answer": "..."}]}
Return exactly the number of each type the message asks for, the multiple-choice questions first."""

LEARN_GRADE_SYSTEM = """\
You grade one short answer on a practice test for a reader who is learning finance, accounting, economics and investing. The user message gives the question, the model answer, the reader's answer, and sometimes the score the reader gave their own answer. Do not call any tool. Grade from the model answer and your own knowledge.

GRADING
Judge whether the reader's answer contains the points the model answer names and whether everything it says is correct. Accept different wording, a different order, and a correct point the model answer leaves out. A wrong statement counts against the answer even when the right points are present.
The score is exactly one of three values: 1 when the answer is correct and complete, 0.5 when it is partly correct or misses a point the model answer requires, and 0 when it is wrong, empty or off the question.

FEEDBACK
Two to five sentences, addressed to the reader as "you", never as "the reader". Say first what the answer got right, then what is missing or wrong and what the correct point is. When the reader's own score differs from yours, say why in one sentence. No headings, no lists and no citations.

STYLE
Plain words. No em dashes or en dashes: use a period, a comma or parentheses. Straight quotes only. No filler words and no closing pleasantries.

WHAT YOU RETURN
Return one JSON object and nothing else: no text before or after it and no code fence.
{"score": <1, 0.5 or 0>, "feedback": "..."}"""

PROMPTS = {
    "LEARN_CARDS_SYSTEM": LEARN_CARDS_SYSTEM,
    "LEARN_QUIZ_SYSTEM": LEARN_QUIZ_SYSTEM,
    "LEARN_GRADE_SYSTEM": LEARN_GRADE_SYSTEM,
}

# --- route budgets ---------------------------------------------------------------
# Reasoning effort per route label, merged into server.EFFORT_BY_LABEL ("medium",
# the owner's setting for every route since 2026-09-05).
EFFORT_BY_LABEL = {"/learn/cards": "medium", "/learn/quiz": "medium", "/learn/grade": "medium"}
CARDS_MAX_TURNS, CARDS_BUDGET_USD = 24, 3.0
QUIZ_MAX_TURNS, QUIZ_BUDGET_USD = 20, 3.0
# Grade runs with allow_web=False (the narrowest tool set options_for offers) and the
# prompt says to call no tool; three turns leave room for one stray call.
GRADE_MAX_TURNS, GRADE_BUDGET_USD = 3, 0.5

# --- request caps ----------------------------------------------------------------
MAX_CARDS_PER_CALL = 25
MAX_QUESTIONS_PER_CALL = 15
MAX_REQUEST = 2_000
MAX_AVOID_ITEMS, MAX_AVOID_ITEM, MAX_AVOID_TOTAL = 600, 200, 40_000
MAX_SOURCE_CARDS, MAX_SOURCE_FRONT, MAX_SOURCE_BACK, MAX_SOURCE_TOTAL = 400, 300, 1_200, 80_000
MAX_QUESTION, MAX_MODEL_ANSWER, MAX_USER_ANSWER = 2_000, 4_000, 6_000

# --- output caps -----------------------------------------------------------------
MAX_FRONT, MAX_BACK, MAX_TAGS, MAX_TAG = 600, 5_000, 6, 40
MAX_PROMPT_OUT, MAX_CHOICE, MAX_EXPLANATION, MAX_FEEDBACK = 1_500, 600, 2_000, 3_000

ERR_JSON = "invalid JSON"
ERR_REQUEST = "request is required"
ERR_REQUEST_LONG = "request is too long"
ERR_COUNT = f"count must be a whole number from 1 to {MAX_CARDS_PER_CALL}"
ERR_SUBJECT = "a request or a list of cards is required"
ERR_COUNTS = f"mcCount and shortCount must be whole numbers that add up to 1 to {MAX_QUESTIONS_PER_CALL}"
ERR_CARDS = "cards must be a list of {front, back}"
ERR_AVOID = "avoid must be a list of strings"
ERR_QUESTION = "question is required"
ERR_QUESTION_LONG = "question is too long"
ERR_MODEL_ANSWER = "modelAnswer is required"
ERR_ANSWER_LONG = "an answer is too long"
ERR_SELF_SCORE = "selfScore must be 0, 0.5 or 1"
ERR_UNREADABLE = "The AI answer could not be read. Try again."
ERR_BACKEND = "AI backend temporarily unavailable"

SCORES = (0.0, 0.5, 1.0)


# --- small helpers ---------------------------------------------------------------
def _clean(value) -> str:
    return value.strip() if isinstance(value, str) else ""


def _whole(value) -> int | None:
    """A whole number from a JSON number (bools refused), else None."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return None


_TYPO = str.maketrans({"“": '"', "”": '"', "‘": "'", "’": "'"})


def tidy(text: str) -> str:
    """House typography on model text: straight quotes, no em or en dashes.

    The prompts already ban both; this is the backstop so a slip never reaches the
    screen. U+2212 (the real minus sign) is left alone on purpose.
    """
    text = text.translate(_TYPO)
    text = re.sub(r"\s*—\s*", ", ", text)               # em dash -> comma
    text = re.sub(r"(?<=\d)\s*–\s*(?=\d)", "-", text)    # 2010–2020 -> 2010-2020
    text = re.sub(r"\s*–\s*", ", ", text)               # other en dashes -> comma
    return text.strip()


def bulletize(back: str) -> str:
    """Every top-level paragraph of a card back starts with "- ".

    The prompt asks for bullets separated by blank lines; a model sometimes drops
    the marker after the first one. Indented sub-bullets and numbered steps are
    left as they are.
    """
    blocks = [b.strip("\n") for b in re.split(r"\n\s*\n", back) if b.strip()]
    out = []
    for block in blocks:
        if re.match(r"\s*([-*•]|\d+[.)])\s", block):
            out.append(re.sub(r"^[*•](?=\s)", "-", block))
        else:
            out.append("- " + block.lstrip())
    return "\n\n".join(out)


def _key(text: str) -> str:
    """Comparison key for de-duplication: lower case, letters and digits only."""
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def _avoid_list(raw) -> tuple[str | None, list[str]]:
    if raw is None:
        return None, []
    if not isinstance(raw, list) or not all(isinstance(x, str) for x in raw):
        return ERR_AVOID, []
    items = [x.strip()[:MAX_AVOID_ITEM] for x in raw if x.strip()]
    items = items[-MAX_AVOID_ITEMS:]                         # most recent win
    total, kept = 0, []
    for item in reversed(items):
        total += len(item) + 1
        if total > MAX_AVOID_TOTAL:
            break
        kept.append(item)
    return None, list(reversed(kept))


def extract_json(text) -> object | None:
    """The first JSON value in model output, tolerant of fences and chatter.

    Tries, in order: the whole text, a ```json fenced block, the span from the
    first "{" to the last "}", then the span from the first "[" to the last "]".
    strict=False keeps a raw line break inside a string readable.
    """
    if not isinstance(text, str) or not text.strip():
        return None
    candidates = [text.strip()]
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.S | re.I)
    if fence:
        candidates.append(fence.group(1).strip())
    for open_, close in (("{", "}"), ("[", "]")):
        start, end = text.find(open_), text.rfind(close)
        if 0 <= start < end:
            candidates.append(text[start:end + 1])
    for chunk in candidates:
        try:
            return json.loads(chunk, strict=False)
        except ValueError:
            continue
    return None


def _items(obj, key: str) -> list | None:
    """obj[key] when obj is a dict, obj itself when the model returned a bare list."""
    if isinstance(obj, dict):
        obj = obj.get(key)
    return obj if isinstance(obj, list) else None


# --- /learn/cards ----------------------------------------------------------------
def validate_cards_request(data) -> tuple[str | None, dict | None]:
    if not isinstance(data, dict):
        return ERR_REQUEST, None
    request = _clean(data.get("request"))
    if not request:
        return ERR_REQUEST, None
    if len(request) > MAX_REQUEST:
        return ERR_REQUEST_LONG, None
    count = _whole(data.get("count"))
    if count is None or not 1 <= count <= MAX_CARDS_PER_CALL:
        return ERR_COUNT, None
    err, avoid = _avoid_list(data.get("avoid"))
    if err:
        return err, None
    return None, {"request": request, "count": count, "avoid": avoid}


def build_cards_prompt(payload: dict, guidance: str = "") -> str:
    parts = [
        "The reader's request:\n" + payload["request"],
        f"Write exactly {payload['count']} cards in this batch.",
    ]
    if payload["avoid"]:
        parts.append("Cards already written for this deck (do not repeat or rephrase these fronts):\n"
                     + "\n".join(f"- {f}" for f in payload["avoid"]))
    return "\n\n".join(parts) + guidance + "\n\nReturn the JSON object now."


def _tags(raw) -> list[str]:
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    for t in raw:
        if not isinstance(t, str):
            continue
        tag = re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")[:MAX_TAG].strip("-")
        if tag and tag not in out:
            out.append(tag)
    return out[:MAX_TAGS]


def parse_cards_output(text, count: int, avoid: list[str] | None = None) -> list[dict] | None:
    """Valid, de-duplicated cards (at most `count`), or None when none are usable.

    A malformed card is dropped rather than failing the batch; the page asks again
    for whatever is still missing.
    """
    items = _items(extract_json(text), "cards")
    if items is None:
        return None
    seen = {_key(a) for a in (avoid or [])}
    cards: list[dict] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        front, back = tidy(_clean(item.get("front"))), bulletize(tidy(_clean(item.get("back"))))
        if not front or not back or len(front) > MAX_FRONT or len(back) > MAX_BACK:
            continue
        k = _key(front)
        if not k or k in seen:
            continue
        seen.add(k)
        cards.append({"front": front, "back": back, "tags": _tags(item.get("tags"))})
        if len(cards) >= count:
            break
    return cards or None


# --- /learn/quiz -----------------------------------------------------------------
def validate_quiz_request(data) -> tuple[str | None, dict | None]:
    if not isinstance(data, dict):
        return ERR_SUBJECT, None
    request = _clean(data.get("request"))
    if len(request) > MAX_REQUEST:
        return ERR_REQUEST_LONG, None
    raw_cards = data.get("cards")
    cards: list[dict] = []
    if raw_cards is not None:
        if not isinstance(raw_cards, list):
            return ERR_CARDS, None
        total = 0
        for c in raw_cards[:MAX_SOURCE_CARDS]:
            if not isinstance(c, dict):
                return ERR_CARDS, None
            front = _clean(c.get("front"))[:MAX_SOURCE_FRONT]
            back = _clean(c.get("back"))[:MAX_SOURCE_BACK]
            if not front or not back:
                continue
            total += len(front) + len(back)
            if total > MAX_SOURCE_TOTAL:
                break
            cards.append({"front": front, "back": back})
    if not request and not cards:
        return ERR_SUBJECT, None
    mc, short = _whole(data.get("mcCount", 0)), _whole(data.get("shortCount", 0))
    if mc is None or short is None or mc < 0 or short < 0 \
            or not 1 <= mc + short <= MAX_QUESTIONS_PER_CALL:
        return ERR_COUNTS, None
    err, avoid = _avoid_list(data.get("avoid"))
    if err:
        return err, None
    return None, {"request": request, "cards": cards, "mcCount": mc, "shortCount": short,
                  "avoid": avoid}


def build_quiz_prompt(payload: dict, guidance: str = "") -> str:
    parts = []
    if payload["request"]:
        parts.append("The reader's request:\n" + payload["request"])
    if payload["cards"]:
        parts.append("The reader's flashcards (the subject of the test):\n" + "\n\n".join(
            f"Card {i}\nFront: {c['front']}\nBack: {c['back']}"
            for i, c in enumerate(payload["cards"], 1)))
    parts.append(f"Write exactly {payload['mcCount']} multiple-choice questions and exactly "
                 f"{payload['shortCount']} short-answer questions in this batch.")
    if payload["avoid"]:
        parts.append("Questions already written for this test (do not repeat or rephrase these):\n"
                     + "\n".join(f"- {q}" for q in payload["avoid"]))
    return "\n\n".join(parts) + guidance + "\n\nReturn the JSON object now."


def _answer_index(raw, choices: list[str]) -> int | None:
    """The correct choice as an index: a number, a letter A-D, or the choice text."""
    n = _whole(raw)
    if n is not None:
        return n if 0 <= n < len(choices) else None
    if isinstance(raw, str):
        s = raw.strip()
        if len(s) == 1 and s.upper() in "ABCD"[:len(choices)]:
            return "ABCD".index(s.upper())
        for i, c in enumerate(choices):
            if _key(c) == _key(s):
                return i
    return None


def _mc(item: dict, rng: random.Random) -> dict | None:
    prompt = tidy(_clean(item.get("prompt")))
    raw = item.get("choices")
    if not prompt or len(prompt) > MAX_PROMPT_OUT or not isinstance(raw, list) or len(raw) != 4:
        return None
    choices = [tidy(c) if isinstance(c, str) else "" for c in raw]
    if any(not c or len(c) > MAX_CHOICE for c in choices) or len({_key(c) for c in choices}) != 4:
        return None
    answer = _answer_index(item.get("answer"), choices)
    if answer is None:
        return None
    # Shuffle so the correct choice is spread evenly: models favour one position.
    order = list(range(4))
    rng.shuffle(order)
    return {"type": "mc", "prompt": prompt, "choices": [choices[i] for i in order],
            "answer": order.index(answer),
            "explanation": tidy(_clean(item.get("explanation")))[:MAX_EXPLANATION]}


def _short(item: dict) -> dict | None:
    prompt, answer = tidy(_clean(item.get("prompt"))), tidy(_clean(item.get("answer")))
    if not prompt or not answer or len(prompt) > MAX_PROMPT_OUT or len(answer) > MAX_MODEL_ANSWER:
        return None
    return {"type": "short", "prompt": prompt, "answer": answer}


def parse_quiz_output(text, mc_count: int, short_count: int, avoid: list[str] | None = None,
                      rng: random.Random | None = None) -> list[dict] | None:
    """Valid questions (at most the requested number of each type, multiple choice
    first), or None when none are usable."""
    items = _items(extract_json(text), "questions")
    if items is None:
        return None
    rng = rng or random.Random()
    seen = {_key(a) for a in (avoid or [])}
    mcs: list[dict] = []
    shorts: list[dict] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        kind = _clean(item.get("type")).lower()
        if kind in ("mc", "multiple choice", "multiple-choice", "multiple_choice"):
            q, bucket, cap = _mc(item, rng), mcs, mc_count
        elif kind in ("short", "short answer", "short-answer", "short_answer"):
            q, bucket, cap = _short(item), shorts, short_count
        else:
            continue
        if q is None or len(bucket) >= cap:
            continue
        k = _key(q["prompt"])
        if k in seen:
            continue
        seen.add(k)
        bucket.append(q)
    return (mcs + shorts) or None


# --- /learn/grade ----------------------------------------------------------------
def validate_grade_request(data) -> tuple[str | None, dict | None]:
    if not isinstance(data, dict):
        return ERR_QUESTION, None
    question = _clean(data.get("question"))
    if not question:
        return ERR_QUESTION, None
    if len(question) > MAX_QUESTION:
        return ERR_QUESTION_LONG, None
    model_answer = _clean(data.get("modelAnswer"))
    if not model_answer:
        return ERR_MODEL_ANSWER, None
    user_answer = _clean(data.get("userAnswer"))      # blank is allowed; it scores 0
    if len(model_answer) > MAX_MODEL_ANSWER or len(user_answer) > MAX_USER_ANSWER:
        return ERR_ANSWER_LONG, None
    self_score = data.get("selfScore")
    if self_score is not None:
        if isinstance(self_score, bool) or not isinstance(self_score, (int, float)) \
                or float(self_score) not in SCORES:
            return ERR_SELF_SCORE, None
        self_score = float(self_score)
    return None, {"question": question, "modelAnswer": model_answer,
                  "userAnswer": user_answer, "selfScore": self_score}


def build_grade_prompt(payload: dict) -> str:
    parts = [
        "The question:\n" + payload["question"],
        "The model answer:\n" + payload["modelAnswer"],
        "The reader's answer:\n" + (payload["userAnswer"] or "(No answer given.)"),
    ]
    if payload["selfScore"] is not None:
        parts.append(f"The reader's own score: {payload['selfScore']:g}")
    return "\n\n".join(parts) + "\n\nReturn the JSON object now."


def parse_grade_output(text) -> dict | None:
    obj = extract_json(text)
    if not isinstance(obj, dict):
        return None
    raw = obj.get("score")
    if isinstance(raw, str):
        try:
            raw = float(raw.strip())
        except ValueError:
            return None
    if isinstance(raw, bool) or not isinstance(raw, (int, float)) or not 0 <= raw <= 1:
        return None
    score = min(SCORES, key=lambda s: abs(s - float(raw)))   # snap to 0, 0.5 or 1
    feedback = tidy(_clean(obj.get("feedback")))
    if not feedback:
        return None
    return {"score": score, "feedback": feedback[:MAX_FEEDBACK]}


# --- aiohttp handlers ------------------------------------------------------------
def make_handlers(run_agent, pick_model, default_model: str, guidance: str = "") -> dict:
    """The three route handlers, bound to server.py's own run_agent and pick_model.

    Injected rather than imported: server.py runs as __main__, so importing it from
    here would load a second copy of the whole server.
    """
    async def _body(request: web.Request):
        try:
            return await request.json()
        except Exception:                      # noqa: BLE001 - a bad body is a 400
            return None

    async def _run(label: str, prompt: str, data: dict, system: str, max_turns: int,
                   budget: float, allow_web: bool) -> str | None:
        try:
            text, _sources = await run_agent(
                prompt, pick_model(data, default_model), system, max_turns=max_turns,
                label=label, allow_web=allow_web, budget_usd=budget)
            return text
        except Exception as exc:               # noqa: BLE001 - never an HTML 500
            print(f"[{label}] agent failed: {type(exc).__name__}: {exc}", flush=True)
            return None

    def _fail(status: int, error: str) -> web.Response:
        return web.json_response({"error": error}, status=status)

    async def cards(request: web.Request) -> web.Response:
        data = await _body(request)
        if data is None:
            return _fail(400, ERR_JSON)
        err, payload = validate_cards_request(data)
        if err:
            return _fail(400, err)
        text = await _run("/learn/cards", build_cards_prompt(payload, guidance), data,
                          LEARN_CARDS_SYSTEM, CARDS_MAX_TURNS, CARDS_BUDGET_USD, True)
        if text is None:
            return _fail(503, ERR_BACKEND)
        parsed = parse_cards_output(text, payload["count"], payload["avoid"])
        if parsed is None:
            print(f"[/learn/cards] unreadable model output ({len(text)} chars)", flush=True)
            return _fail(503, ERR_UNREADABLE)
        if len(parsed) < payload["count"]:
            print(f"[/learn/cards] {len(parsed)} of {payload['count']} cards usable", flush=True)
        return web.json_response({"cards": parsed})

    async def quiz(request: web.Request) -> web.Response:
        data = await _body(request)
        if data is None:
            return _fail(400, ERR_JSON)
        err, payload = validate_quiz_request(data)
        if err:
            return _fail(400, err)
        text = await _run("/learn/quiz", build_quiz_prompt(payload, guidance), data,
                          LEARN_QUIZ_SYSTEM, QUIZ_MAX_TURNS, QUIZ_BUDGET_USD, True)
        if text is None:
            return _fail(503, ERR_BACKEND)
        parsed = parse_quiz_output(text, payload["mcCount"], payload["shortCount"],
                                   payload["avoid"])
        if parsed is None:
            print(f"[/learn/quiz] unreadable model output ({len(text)} chars)", flush=True)
            return _fail(503, ERR_UNREADABLE)
        wanted = payload["mcCount"] + payload["shortCount"]
        if len(parsed) < wanted:
            print(f"[/learn/quiz] {len(parsed)} of {wanted} questions usable", flush=True)
        return web.json_response({"questions": parsed})

    async def grade(request: web.Request) -> web.Response:
        data = await _body(request)
        if data is None:
            return _fail(400, ERR_JSON)
        err, payload = validate_grade_request(data)
        if err:
            return _fail(400, err)
        text = await _run("/learn/grade", build_grade_prompt(payload), data,
                          LEARN_GRADE_SYSTEM, GRADE_MAX_TURNS, GRADE_BUDGET_USD, False)
        if text is None:
            return _fail(503, ERR_BACKEND)
        parsed = parse_grade_output(text)
        if parsed is None:
            print(f"[/learn/grade] unreadable model output ({len(text)} chars)", flush=True)
            return _fail(503, ERR_UNREADABLE)
        return web.json_response(parsed)

    return {"cards": cards, "quiz": quiz, "grade": grade}
