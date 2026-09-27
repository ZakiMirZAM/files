"""Tests for the /story-answer route: the pure helpers in story_answer.py, then the
server wiring (skipped when claude_agent_sdk is not installed).

  python -m pytest rag/test_story_answer.py -q
"""
import asyncio, inspect, json, os, sys
import pytest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import story_answer
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

QUESTION = ("What business is Ferrari really in? Work it out in steps:\n"
            "1. Name the job customers pay for.\n2. List the substitutes.\nClose the market.")
OK = {"ticker": "RACE", "company": "Ferrari", "questionId": "indiv.story.market",
      "question": QUESTION, "userAnswer": "Luxury goods, not cars.", "data": "Firm revenue: $6.7B"}


def test_validate_accepts_every_story_and_check_id_and_rejects_others():
    for qid in story_answer.QUESTION_IDS:
        assert story_answer.validate_request({**OK, "questionId": qid})[0] is None
    assert len(story_answer.QUESTION_IDS) == 11
    for bad in ("indiv.story.nope", "", None, 3):
        assert story_answer.validate_request({**OK, "questionId": bad})[0] == story_answer.ERR_ID


def test_validate_caps_and_required_fields():
    v = story_answer.validate_request
    assert v({**OK, "userAnswer": ""})[0] is None                      # blank is researched
    assert v({**OK, "question": " "})[0] == story_answer.ERR_QUESTION
    assert v({**OK, "question": "x" * 6001})[0] == story_answer.ERR_QUESTION_LONG
    assert v({**OK, "userAnswer": "x" * 12001})[0] == story_answer.ERR_ANSWER_LONG
    assert v({**OK, "otherAnswers": {"indiv.story.edge": "x" * 12001}})[0] == story_answer.ERR_ANSWER_LONG
    assert v({**OK, "otherAnswers": ["x"]})[0] == story_answer.ERR_OTHERS
    assert v({**OK, "data": ""})[0] == story_answer.ERR_DATA
    assert v({**OK, "data": "x" * 60001})[0] == story_answer.ERR_DATA_LONG
    assert v({**OK, "ticker": ""})[0] == story_answer.ERR_TICKER
    assert v([])[0]


def test_validate_keeps_only_known_other_answers():
    _err, p = story_answer.validate_request(
        {**OK, "otherAnswers": {"indiv.story.edge": " brand ", "evil": "x", "indiv.story.end": ""}})
    assert p["otherAnswers"] == {"indiv.story.edge": "brand"}


def test_prompt_carries_question_steps_answer_and_data():
    _e, p = story_answer.validate_request(OK)
    text = story_answer.build_prompt(p, "\n\nGUIDE")
    assert QUESTION in text and "1. Name the job customers pay for." in text
    assert "The reader's answer:\nLuxury goods, not cars." in text
    assert "Computed data on the page" in text and "Firm revenue: $6.7B" in text
    assert "The story being tested" not in text
    assert text.index("GUIDE") < text.index("Return the JSON object now.")
    assert text.endswith("Return the JSON object now.")


def test_prompt_marks_a_blank_answer_and_lists_the_story_being_tested():
    _e, p = story_answer.validate_request({**OK, "questionId": "indiv.story.synthesis", "userAnswer": "",
        "otherAnswers": {"indiv.story.market": "luxury", "indiv.story.edge_duration": "decades"}})
    text = story_answer.build_prompt(p)
    assert f"The reader's answer:\n{story_answer.NO_ANSWER}" in text
    assert "Question 1, what market it is really in:\nluxury" in text
    assert "Question 8, how long the advantage lasts:\ndecades" in text
    assert text.index("Question 1,") < text.index("Question 8,")


def test_parse_adequate_and_inadequate_shapes():
    parse = story_answer.parse_answer_output
    assert parse('{"adequate": true, "answer": "ignored", "sources": ["x"]}') == \
        {"adequate": True, "answer": "", "sources": []}
    out = parse('Here:\n```json\n{"adequate": false, "answer": "Line one.\nLine two.", '
                '"sources": ["Competitive Strategy, chapter 1", " ", "https://x.com/10k"]}\n```')
    assert out == {"adequate": False, "answer": "Line one.\nLine two.",
                   "sources": ["Competitive Strategy, chapter 1", "https://x.com/10k"]}
    assert parse('{"adequate": false, "answer": "a"}')["sources"] == []


def test_parse_rejects_malformed_output():
    for bad in ("no json", "[]", '{"answer": "a"}', '{"adequate": "no", "answer": "a"}',
                '{"adequate": false, "answer": ""}', '{"adequate": false, "answer": 3}',
                '{"adequate": false, "answer": "a", "sources": "x"}',
                '{"adequate": false, "answer": "a", "sources": [1]}'):
        assert story_answer.parse_answer_output(bad) is None, bad


def test_parse_caps_the_answer_and_the_sources():
    raw = json.dumps({"adequate": False, "answer": "x" * 9000, "sources": ["s" * 500] * 20})
    out = story_answer.parse_answer_output(raw)
    assert len(out["answer"]) == story_answer.MAX_OUT_ANSWER
    assert len(out["sources"]) == story_answer.MAX_SOURCES and len(out["sources"][0]) == story_answer.MAX_SOURCE


# --- server wiring ---
server = pytest.importorskip("server", reason="claude_agent_sdk not installed")


class _Req:
    def __init__(self, body): self._body = body
    async def json(self):
        if isinstance(self._body, Exception): raise self._body
        return self._body


def call(body):
    resp = asyncio.run(server.handle_story_answer(_Req(body)))
    return resp.status, json.loads(resp.body.decode())


def test_handler_runs_the_answer_prompt_with_web_and_research(monkeypatch):
    seen = {}
    async def fake(prompt, model, system_prompt, max_turns, label, allow_web=True, budget_usd=None):
        seen.update(prompt=prompt, model=model, system=system_prompt, turns=max_turns, label=label,
                    web=allow_web, budget=budget_usd)
        return '{"adequate": false, "answer": "A researched answer.", "sources": ["Book, chapter 2"]}', []
    monkeypatch.setattr(server, "run_agent", fake)
    monkeypatch.setattr(server.research_tools, "MODE", "on")
    status, body = call(OK)
    assert status == 200
    assert body == {"adequate": False, "answer": "A researched answer.", "sources": ["Book, chapter 2"]}
    assert seen["model"] == server.ASK_MODEL and seen["system"] == server.STORY_ANSWER_SYSTEM
    assert seen["turns"] == server.STORY_ANSWER_MAX_TURNS == 16
    assert seen["budget"] == server.STORY_ANSWER_BUDGET_USD == 1.5
    assert seen["label"] == "/story-answer" and seen["web"] is True
    assert server.research_tools.GUIDANCE in seen["prompt"]


def test_handler_failures_are_json(monkeypatch):
    assert call(ValueError("not json"))[0] == 400
    status, body = call({**OK, "questionId": "indiv.nope"})
    assert status == 400 and body["error"] == story_answer.ERR_ID
    async def boom(*a, **k): raise RuntimeError("sdk down")
    monkeypatch.setattr(server, "run_agent", boom)
    status, body = call(OK)
    assert status == 503 and body["error"]
    async def junk(*a, **k): return "no json here", []
    monkeypatch.setattr(server, "run_agent", junk)
    status, body = call(OK)
    assert status == 503 and body["error"] == "The AI answer could not be read. Try again."


def test_story_answer_route_is_wired_and_exposed():
    import ai_proxy
    assert server.EFFORT_BY_LABEL["/story-answer"] == "medium"
    assert '"/story-answer"' in inspect.getsource(server.main)
    assert "/story-answer" in ai_proxy.STREAM_PATHS
    conf = open(os.path.join(REPO, "deploy", "nginx.conf"), encoding="utf-8").read()
    block = conf[conf.index("location = /story-answer"):]
    block = block[:block.index("\n        }\n")]
    assert "zone=story_answer_zone burst=11" in block and "proxy_read_timeout 600s" in block
