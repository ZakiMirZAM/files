"""Tests for the /story-inputs route: the pure helpers in story_inputs.py, then the
server wiring (skipped when claude_agent_sdk is not installed).

  python -m pytest rag/test_story_inputs.py -q
"""
import asyncio, inspect, json, os, sys
import pytest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import story_inputs
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ANSWERS = {qid: "an answer" for qid, _n, _l in story_inputs.STORY_QUESTIONS[:8]}

GOOD = {"rows": [{"input": n, "storyQuote": "q", "value": 0.1, "unit": "x", "proof": "p",
                  "sources": ["Narrative and Numbers, chapter 8"]} for n in story_inputs.INPUT_NAMES],
        "riskFlags": ["a"], "weakestLink": "w", "counterStory": "c"}
BLOCK = ("Latest operating margin: 18.20%\nLatest sales to capital: 1.42x\n"
         "Industry operating margin median: 4.46%\nIndustry operating margin 90th percentile: 12.30%\n"
         "WACC: 6.96%")      # Task 3 grammar

def test_parse_accepts_prose_and_fences_and_canonicalises_units():
    out = story_inputs.parse_story_output("Here:\n```json\n" + json.dumps(GOOD) + "\n```")
    assert [r["input"] for r in out["rows"]] == list(story_inputs.INPUT_NAMES)
    assert out["rows"][0]["unit"] == "currency" and out["rows"][4]["unit"] == "ratio"

def test_parse_rejects_malformed_output():
    missing = {**GOOD, "rows": GOOD["rows"][:7]}
    stringy = {**GOOD, "rows": [{**GOOD["rows"][0], "value": "9%"}] + GOOD["rows"][1:]}
    booly = {**GOOD, "rows": [{**GOOD["rows"][0], "value": True}] + GOOD["rows"][1:]}
    for bad in ("not json", json.dumps([]), json.dumps(missing), json.dumps(stringy), json.dumps(booly)):
        assert story_inputs.parse_story_output(bad) is None

def test_parse_rejects_duplicates_and_non_finite_values_and_drops_unknown_keys():
    dup = {**GOOD, "rows": GOOD["rows"] + [GOOD["rows"][0]]}
    for value in ("Infinity", "NaN", "1" + "0" * 400):
        raw = json.dumps(GOOD).replace('"value": 0.1', '"value": ' + value, 1)
        assert story_inputs.parse_story_output(raw) is None
    assert story_inputs.parse_story_output(json.dumps(dup)) is None
    extra = {**GOOD, "rows": [{**GOOD["rows"][0], "verification": {"status": "verified"}},
                              {"input": "somethingElse"}] + GOOD["rows"][1:]}
    out = story_inputs.parse_story_output(json.dumps(extra))
    assert len(out["rows"]) == 8 and "verification" not in out["rows"][0]

def test_parse_truncates_long_text():
    long = {**GOOD, "rows": [{**GOOD["rows"][0], "proof": "x" * 5000}] + GOOD["rows"][1:]}
    assert len(story_inputs.parse_story_output(json.dumps(long))["rows"][0]["proof"]) == 1500

def test_validate_request():
    answers = {qid: "an answer" for qid, _n, _l in story_inputs.STORY_QUESTIONS[:8]}
    ok = {"ticker": "RACE", "company": "Ferrari", "answers": answers, "data": BLOCK}
    assert story_inputs.validate_request(ok)[0] is None
    assert story_inputs.validate_request({**ok, "answers": {**answers, "indiv.story.size": "  "}})[0]
    assert story_inputs.validate_request({**ok, "data": ""})[0]
    assert story_inputs.validate_request({**ok, "answers": {**answers, "indiv.story.edge": "x" * 12001}})[0]
    assert story_inputs.validate_request([])[0]

def test_prompt_carries_the_block_and_only_answered_questions():
    answers = {qid: f"answer {n}" for qid, n, _l in story_inputs.STORY_QUESTIONS[:8]}
    p = story_inputs.build_prompt({"ticker": "RACE", "company": "Ferrari", "answers": answers, "data": BLOCK})
    assert "Computed data on the page" in p and BLOCK in p
    assert "Question 7, what could end the story:\nanswer 7" in p
    assert "Question 9" not in p

def test_row_status():
    assert story_inputs.row_status(None) == "unavailable"
    assert story_inputs.row_status({"status": "flagged", "matched": 3, "approx": 0}) == "flagged"
    assert story_inputs.row_status({"status": "clean", "matched": 1, "approx": 0}) == "verified"
    assert story_inputs.row_status({"status": "clean", "matched": 0, "approx": 1}) == "verified"
    assert story_inputs.row_status({"status": "clean", "matched": 0, "approx": 0}) == "unchecked"

def test_the_grader_checks_a_proof_against_the_block(monkeypatch):
    import verify
    monkeypatch.setattr(verify, "MODE", "shadow")
    good = verify.tier0("The latest operating margin of 18.20% sits above the industry "
                        "operating margin 90th percentile of 12.30%.", BLOCK, [])
    bad = verify.tier0("The latest sales to capital of 2.10x is high.", BLOCK, [])
    assert story_inputs.row_status(good) == "verified"
    assert story_inputs.row_status(bad) == "flagged"

# --- server wiring ---
server = pytest.importorskip("server", reason="claude_agent_sdk not installed")

class _Req:
    def __init__(self, body): self._body = body
    async def json(self):
        if isinstance(self._body, Exception): raise self._body
        return self._body

def call(body):
    resp = asyncio.run(server.handle_story_inputs(_Req(body)))
    return resp.status, json.loads(resp.body.decode())

def test_handler_runs_the_story_prompt_on_vault_search_only(monkeypatch):
    seen = {}
    async def fake(prompt, model, system_prompt, max_turns, label, allow_web=True, budget_usd=None):
        seen.update(model=model, system=system_prompt, turns=max_turns, label=label,
                    web=allow_web, budget=budget_usd)
        return json.dumps(GOOD), []
    monkeypatch.setattr(server, "run_agent", fake)
    status, body = call({"ticker": "RACE", "company": "Ferrari", "answers": ANSWERS, "data": BLOCK})
    assert status == 200 and len(body["rows"]) == 8
    assert all(r["verification"]["status"] in {"verified", "flagged", "unchecked", "unavailable"} for r in body["rows"])
    rep = body["rows"][0]["verification"]["report"]
    assert rep is None or "flagged" in rep          # this route ships the report unstripped
    assert seen == {"model": server.ASK_MODEL, "system": server.STORY_SYSTEM, "turns": server.STORY_MAX_TURNS,
                    "label": "/story-inputs", "web": False, "budget": server.STORY_BUDGET_USD}

def test_handler_failures_are_json(monkeypatch):
    assert call(ValueError("not json"))[0] == 400
    assert call({"answers": {}, "data": BLOCK})[0] == 400
    async def boom(*a, **k): raise RuntimeError("sdk down")
    monkeypatch.setattr(server, "run_agent", boom)
    status, body = call({"ticker": "RACE", "company": "F", "answers": ANSWERS, "data": BLOCK})
    assert status == 503 and body["error"]
    async def junk(*a, **k): return "no json here", []
    monkeypatch.setattr(server, "run_agent", junk)
    assert call({"ticker": "RACE", "company": "F", "answers": ANSWERS, "data": BLOCK})[0] == 503

def test_story_route_is_wired_and_exposed():
    import ai_proxy
    assert server.EFFORT_BY_LABEL["/story-inputs"] == server.STORY_EFFORT == "medium"
    assert '"/story-inputs"' in inspect.getsource(server.main)
    assert "/story-inputs" in ai_proxy.STREAM_PATHS
    conf = open(os.path.join(REPO, "deploy", "nginx.conf"), encoding="utf-8").read()
    assert "location = /story-inputs" in conf and "zone=story_zone" in conf

def test_existing_routes_are_untouched():
    assert server.EFFORT_BY_LABEL["/ask"] == server.ASK_EFFORT
    assert server.EFFORT_BY_LABEL["/explain"] == server.EXPLAIN_EFFORT
    assert server.EFFORT_BY_LABEL["/define"] == server.DEFINE_EFFORT
