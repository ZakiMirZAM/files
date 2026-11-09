"""Tests for the Learn routes (rag/learn.py): request validation, prompt assembly,
robust output parsing and the handlers with a fake agent. No live model calls.

  python -m pytest rag/test_learn.py -q
"""
import asyncio
import json
import os
import random
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import learn  # noqa: E402

CARD = {"front": "What does ROIC measure?",
        "back": "- ROIC = NOPAT / Invested capital\n\n- It measures the return on all capital.",
        "tags": ["Ratio Analysis", "roic", 3]}


# --- JSON extraction --------------------------------------------------------------
@pytest.mark.parametrize("text", [
    '{"cards": []}',
    'Here you go:\n```json\n{"cards": []}\n```\nDone.',
    'chatter {"cards": []} more chatter',
    '```\n{"cards": []}\n```',
])
def test_extract_json_handles_fences_and_chatter(text):
    assert learn.extract_json(text) == {"cards": []}


def test_extract_json_reads_a_bare_list_and_raw_newlines():
    assert learn.extract_json('[1, 2]') == [1, 2]
    assert learn.extract_json('{"a": "line one\nline two"}') == {"a": "line one\nline two"}


@pytest.mark.parametrize("text", [None, "", "   ", "no json here", "{broken", 7])
def test_extract_json_returns_none_on_garbage(text):
    assert learn.extract_json(text) is None


def test_tidy_enforces_house_typography():
    assert learn.tidy("a — b") == "a, b"
    assert learn.tidy("2010–2020") == "2010-2020"
    assert learn.tidy("“quoted” it’s") == '"quoted" it\'s'
    assert learn.tidy("5 − 3") == "5 − 3"           # the real minus sign stays


# --- /learn/cards -------------------------------------------------------------------
def test_validate_cards_request():
    v = learn.validate_cards_request
    err, p = v({"request": " CFA Level 1 ", "count": 10})
    assert err is None and p == {"request": "CFA Level 1", "count": 10, "avoid": []}
    assert v({"request": "", "count": 5})[0] == learn.ERR_REQUEST
    assert v({"request": "x" * 2001, "count": 5})[0] == learn.ERR_REQUEST_LONG
    for bad in (0, 26, -1, 2.5, "5", True, None):
        assert v({"request": "x", "count": bad})[0] == learn.ERR_COUNT
    assert v({"request": "x", "count": 5.0})[0] is None
    assert v({"request": "x", "count": 5, "avoid": "nope"})[0] == learn.ERR_AVOID
    assert v({"request": "x", "count": 5, "avoid": [1]})[0] == learn.ERR_AVOID
    assert v([])[0] == learn.ERR_REQUEST


def test_avoid_list_is_capped_keeping_the_most_recent():
    many = [f"front {i}" for i in range(1000)]
    _err, p = learn.validate_cards_request({"request": "x", "count": 1, "avoid": many})
    assert len(p["avoid"]) == learn.MAX_AVOID_ITEMS and p["avoid"][-1] == "front 999"
    _err, p = learn.validate_cards_request({"request": "x", "count": 1, "avoid": ["y" * 500]})
    assert p["avoid"] == ["y" * learn.MAX_AVOID_ITEM]


def test_build_cards_prompt_carries_request_count_and_avoid():
    _e, p = learn.validate_cards_request({"request": "Bond duration", "count": 7,
                                          "avoid": ["What is duration?"]})
    text = learn.build_cards_prompt(p, "\n\nGUIDE")
    assert "Bond duration" in text and "exactly 7 cards" in text
    assert "- What is duration?" in text and "GUIDE" in text
    assert text.endswith("Return the JSON object now.")
    assert "already written" not in learn.build_cards_prompt({**p, "avoid": []})


def test_parse_cards_validates_dedupes_and_caps():
    out = json.dumps({"cards": [
        CARD,
        {**CARD, "front": "what does ROIC measure"},      # duplicate by key
        {"front": "", "back": "x"},                       # empty front
        {"front": "Q2", "back": ""},                      # empty back
        "not a card",
        {"front": "Old one", "back": "- b"},              # in avoid
        {"front": "Q3 — dash", "back": "- b"},
        {"front": "Q4", "back": "- b"},
    ]})
    cards = learn.parse_cards_output(out, count=2, avoid=["Old one"])
    assert [c["front"] for c in cards] == ["What does ROIC measure?", "Q3, dash"]
    assert cards[0]["tags"] == ["ratio-analysis", "roic"]


def test_parse_cards_accepts_bare_list_and_rejects_unusable():
    assert learn.parse_cards_output(json.dumps([CARD]), 5)[0]["front"] == CARD["front"]
    assert learn.parse_cards_output('{"cards": []}', 5) is None
    assert learn.parse_cards_output('{"cards": "x"}', 5) is None
    assert learn.parse_cards_output("sorry", 5) is None
    assert learn.parse_cards_output(json.dumps({"cards": [{"front": "x" * 700, "back": "b"}]}), 5) is None


# --- /learn/quiz --------------------------------------------------------------------
MC = {"type": "mc", "prompt": "Which ratio uses NOPAT?",
      "choices": ["ROIC", "ROE", "Current ratio", "Quick ratio"], "answer": 0,
      "explanation": "ROIC divides NOPAT by invested capital."}
SHORT = {"type": "short", "prompt": "Why subtract cash from invested capital?",
         "answer": "Cash earns little and is not used in operations."}


def test_validate_quiz_request():
    v = learn.validate_quiz_request
    err, p = v({"request": "Bonds", "mcCount": 3, "shortCount": 2})
    assert err is None and p["mcCount"] == 3 and p["shortCount"] == 2 and p["cards"] == []
    assert v({"mcCount": 3})[0] == learn.ERR_SUBJECT
    assert v({"request": "x", "mcCount": 0, "shortCount": 0})[0] == learn.ERR_COUNTS
    assert v({"request": "x", "mcCount": 10, "shortCount": 6})[0] == learn.ERR_COUNTS
    assert v({"request": "x", "mcCount": -1, "shortCount": 3})[0] == learn.ERR_COUNTS
    assert v({"request": "x", "mcCount": "3"})[0] == learn.ERR_COUNTS
    assert v({"request": "x", "mcCount": 2})[0] is None              # shortCount defaults to 0
    assert v({"cards": "x", "mcCount": 1})[0] == learn.ERR_CARDS
    assert v({"cards": [1], "mcCount": 1})[0] == learn.ERR_CARDS
    assert v({"cards": [{"front": "", "back": ""}], "mcCount": 1})[0] == learn.ERR_SUBJECT


def test_validate_quiz_caps_the_card_source():
    cards = [{"front": "f" * 400, "back": "b" * 2000} for _ in range(500)]
    _e, p = learn.validate_quiz_request({"cards": cards, "mcCount": 1})
    assert len(p["cards"][0]["front"]) == learn.MAX_SOURCE_FRONT
    assert len(p["cards"][0]["back"]) == learn.MAX_SOURCE_BACK
    assert sum(len(c["front"]) + len(c["back"]) for c in p["cards"]) <= learn.MAX_SOURCE_TOTAL


def test_build_quiz_prompt():
    _e, p = learn.validate_quiz_request({"request": "Bonds", "cards": [{"front": "F", "back": "B"}],
                                         "mcCount": 4, "shortCount": 1, "avoid": ["Old q"]})
    text = learn.build_quiz_prompt(p)
    assert "Bonds" in text and "Card 1\nFront: F\nBack: B" in text
    assert "exactly 4 multiple-choice" in text and "exactly 1 short-answer" in text
    assert "- Old q" in text


def test_parse_quiz_shuffles_but_keeps_the_correct_choice():
    out = json.dumps({"questions": [MC, SHORT]})
    for seed in range(20):
        qs = learn.parse_quiz_output(out, 1, 1, rng=random.Random(seed))
        assert [q["type"] for q in qs] == ["mc", "short"]
        assert qs[0]["choices"][qs[0]["answer"]] == "ROIC"
        assert sorted(qs[0]["choices"]) == sorted(MC["choices"])


@pytest.mark.parametrize("answer", ["A", "a", "ROIC", " roic ", 0, 0.0])
def test_parse_quiz_reads_answer_as_index_letter_or_text(answer):
    qs = learn.parse_quiz_output(json.dumps({"questions": [{**MC, "answer": answer}]}), 1, 0)
    assert qs[0]["choices"][qs[0]["answer"]] == "ROIC"


@pytest.mark.parametrize("bad", [
    {**MC, "choices": ["a", "b", "c"]},                 # three choices
    {**MC, "choices": ["a", "a", "c", "d"]},            # duplicate choice
    {**MC, "answer": 4},
    {**MC, "answer": "E"},
    {**MC, "answer": True},
    {**MC, "prompt": ""},
    {**MC, "type": "essay"},
    {**SHORT, "answer": ""},
])
def test_parse_quiz_drops_malformed_questions(bad):
    assert learn.parse_quiz_output(json.dumps({"questions": [bad]}), 1, 1) is None


def test_parse_quiz_caps_each_type_dedupes_and_orders_mc_first():
    qs = [SHORT, MC, {**MC, "prompt": "Which ratio uses NOPAT"}, {**MC, "prompt": "Second"},
          {**SHORT, "type": "short answer", "prompt": "Another"}]
    out = learn.parse_quiz_output(json.dumps({"questions": qs}), 1, 5, avoid=[])
    assert [q["prompt"] for q in out] == [MC["prompt"], SHORT["prompt"], "Another"]
    assert learn.parse_quiz_output(json.dumps([MC]), 1, 0, avoid=[MC["prompt"]]) is None


# --- /learn/grade -------------------------------------------------------------------
def test_validate_grade_request():
    v = learn.validate_grade_request
    ok = {"question": "Q", "modelAnswer": "M", "userAnswer": "U"}
    err, p = v({**ok, "selfScore": 0.5})
    assert err is None and p["selfScore"] == 0.5
    assert v({**ok, "userAnswer": ""})[0] is None
    assert v({**ok, "question": ""})[0] == learn.ERR_QUESTION
    assert v({**ok, "question": "x" * 2001})[0] == learn.ERR_QUESTION_LONG
    assert v({**ok, "modelAnswer": ""})[0] == learn.ERR_MODEL_ANSWER
    assert v({**ok, "userAnswer": "x" * 6001})[0] == learn.ERR_ANSWER_LONG
    for bad in (0.3, 2, "1", True):
        assert v({**ok, "selfScore": bad})[0] == learn.ERR_SELF_SCORE


def test_build_grade_prompt():
    _e, p = learn.validate_grade_request({"question": "Q", "modelAnswer": "M", "userAnswer": "",
                                          "selfScore": 1})
    text = learn.build_grade_prompt(p)
    assert "(No answer given.)" in text and "own score: 1" in text


@pytest.mark.parametrize("raw,score", [(1, 1.0), (0, 0.0), (0.5, 0.5), (0.7, 0.5),
                                       (0.9, 1.0), ("0.5", 0.5)])
def test_parse_grade_snaps_the_score(raw, score):
    out = learn.parse_grade_output(json.dumps({"score": raw, "feedback": "Good — mostly."}))
    assert out == {"score": score, "feedback": "Good, mostly."}


@pytest.mark.parametrize("text", [
    '{"score": 2, "feedback": "x"}', '{"score": -1, "feedback": "x"}',
    '{"score": "high", "feedback": "x"}', '{"score": true, "feedback": "x"}',
    '{"score": 1, "feedback": ""}', '[1]', "nothing",
])
def test_parse_grade_rejects_bad_output(text):
    assert learn.parse_grade_output(text) is None


# --- handlers with a fake agent -----------------------------------------------------
class _Req:
    def __init__(self, body):
        self._body = body

    async def json(self):
        if isinstance(self._body, Exception):
            raise self._body
        return self._body


def _handlers(reply=None, exc=None):
    calls = []

    async def run_agent(prompt, model, system, max_turns, label, allow_web=True, budget_usd=None):
        calls.append({"prompt": prompt, "model": model, "system": system, "label": label,
                      "allow_web": allow_web, "max_turns": max_turns, "budget": budget_usd})
        if exc:
            raise exc
        return reply, []

    def pick_model(data, default):
        return "haiku-id" if data.get("model") == "haiku" else default

    return learn.make_handlers(run_agent, pick_model, "opus-id", "\n\nGUIDE"), calls


def _run(handler, body):
    resp = asyncio.new_event_loop().run_until_complete(handler(_Req(body)))
    return resp.status, json.loads(resp.body.decode())


def test_cards_handler_happy_path_and_model_switch():
    h, calls = _handlers(json.dumps({"cards": [CARD]}))
    status, body = _run(h["cards"], {"request": "ROIC", "count": 1, "model": "haiku"})
    assert status == 200 and body["cards"][0]["front"] == CARD["front"]
    c = calls[0]
    assert c["label"] == "/learn/cards" and c["model"] == "haiku-id" and c["allow_web"] is True
    assert c["system"] is learn.LEARN_CARDS_SYSTEM and "GUIDE" in c["prompt"]


def test_quiz_handler_uses_tools_and_grade_handler_does_not():
    h, calls = _handlers(json.dumps({"questions": [MC]}))
    status, body = _run(h["quiz"], {"request": "x", "mcCount": 1})
    assert status == 200 and body["questions"][0]["type"] == "mc"
    assert calls[0]["allow_web"] is True and calls[0]["model"] == "opus-id"
    h, calls = _handlers('{"score": 1, "feedback": "Right."}')
    status, body = _run(h["grade"], {"question": "Q", "modelAnswer": "M", "userAnswer": "U"})
    assert status == 200 and body == {"score": 1.0, "feedback": "Right."}
    assert calls[0]["allow_web"] is False and calls[0]["system"] is learn.LEARN_GRADE_SYSTEM
    assert "GUIDE" not in calls[0]["prompt"]


@pytest.mark.parametrize("route,body", [
    ("cards", {"request": "", "count": 1}),
    ("quiz", {"mcCount": 1}),
    ("grade", {"question": ""}),
])
def test_handlers_return_400_json_on_bad_requests(route, body):
    h, calls = _handlers("{}")
    status, out = _run(h[route], body)
    assert status == 400 and out["error"] and not calls
    status, out = _run(h[route], ValueError("not json"))
    assert status == 400 and out == {"error": learn.ERR_JSON}


@pytest.mark.parametrize("route,body", [
    ("cards", {"request": "x", "count": 1}),
    ("quiz", {"request": "x", "mcCount": 1}),
    ("grade", {"question": "Q", "modelAnswer": "M", "userAnswer": "U"}),
])
def test_handlers_return_503_json_on_agent_failure_or_garbage(route, body):
    h, _ = _handlers(exc=RuntimeError("boom"))
    assert _run(h[route], body) == (503, {"error": learn.ERR_BACKEND})
    h, _ = _handlers("I cannot help with that.")
    assert _run(h[route], body) == (503, {"error": learn.ERR_UNREADABLE})


def test_bulletize_puts_a_marker_on_every_top_level_paragraph():
    back = ("- First idea.\n\n  - A variable.\n\nSecond idea without a marker.\n\n"
            "* Star bullet.\n\n1. A step.")
    assert learn.bulletize(back) == ("- First idea.\n\n  - A variable.\n\n- Second idea without a marker."
                                     "\n\n- Star bullet.\n\n1. A step.")


def test_parse_cards_bulletizes_the_back():
    out = json.dumps({"cards": [{"front": "Q", "back": "- One.\n\nTwo."}]})
    assert learn.parse_cards_output(out, 1)[0]["back"] == "- One.\n\n- Two."
