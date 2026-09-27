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
# A full block in the Task 3 grammar (backend/story_dcf.py story_data_block, fix
# round 1, commit 48bd93b): every one of its 48 labels, in order.
BLOCK = """Company: Ferrari N.V. (RACE), reporting currency EUR, latest fiscal year 2025
Firm revenue: $6.7B
Firm revenue growth: 11.80%
Firm operating margin: 18.20%
Firm sales to capital: 1.42x
Firm ROIC: 24.10%
Five-year median operating margin: 17.60%
Marginal sales to capital over five years: 1.38x
Peer group: Auto Manufacturers, fiscal year 2025
Peer company count: 42
Peer total revenue: $2.9T
Firm share of peer revenue: 0.23%
Peer median operating margin: 4.46%
Peer upper quartile operating margin: 8.10%
Peer top decile operating margin: 12.30%
Peer median sales to capital: 1.10x
Peer upper quartile sales to capital: 1.60x
Peer top decile sales to capital: 2.40x
Peer median ROIC: 6.20%
Peer upper quartile ROIC: 9.80%
Peer top decile ROIC: 14.50%
Peer median revenue growth: 3.10%
Peer upper quartile revenue growth: 7.40%
Peer top decile revenue growth: 11.90%
Synthetic rating: A3/A-
Synthetic rating class: single-A
Interest coverage: 22.40x
Cash: $1.5B
Gross debt: $2.9B
Minority interest: $12M
Diluted shares: 179M
Risk-free rate: 4.30%
WACC: 6.96%
Model high growth rate: 4.00%
Model stable growth rate: 0.70%
Model operating margin today: 18.20%
Model long-run operating margin: 18.20%
Model sales to capital: 1.42x
Model return on capital after growth ends: 9.00%
Model tax rate: 33.54%
Model intrinsic value per share: $210.55
Ten-year default rate for the AAA rating class: 0.70%
Ten-year default rate for the AA rating class: 0.72%
Ten-year default rate for the single-A rating class: 1.24%
Ten-year default rate for the BBB rating class: 3.32%
Ten-year default rate for the BB rating class: 11.78%
Ten-year default rate for the B rating class: 23.74%
Ten-year default rate for the CCC/C rating class: 50.38%"""

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
    # Blank answers are allowed: each gets its input's fallback in the prompt.
    assert story_inputs.validate_request({**ok, "answers": {**answers, "indiv.story.size": "  "}})[0] is None
    assert story_inputs.validate_request({**ok, "answers": {}})[0] is None
    assert story_inputs.validate_request({**ok, "data": ""})[0]
    assert story_inputs.validate_request({**ok, "answers": {**answers, "indiv.story.edge": "x" * 12001}})[0]
    assert story_inputs.validate_request([])[0]

def test_prompt_carries_the_block_and_only_answered_questions():
    answers = {qid: f"answer {n}" for qid, n, _l in story_inputs.STORY_QUESTIONS[:8]}
    p = story_inputs.build_prompt({"ticker": "RACE", "company": "Ferrari", "answers": answers, "data": BLOCK})
    assert "Computed data on the page" in p and BLOCK in p
    assert "Question 7, what could end the story:\nanswer 7" in p
    assert "Question 9" not in p

def test_prompt_marks_blank_answers_for_their_fallback():
    p = story_inputs.build_prompt({"ticker": "RACE", "company": "Ferrari", "answers": {}, "data": BLOCK})
    assert f"Question 1, what market it is really in:\n{story_inputs.NO_ANSWER}" in p
    assert f"Question 8, how long the advantage lasts:\n{story_inputs.NO_ANSWER}" in p
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
    good = verify.tier0("Firm operating margin is 18.20%. Peer top decile operating margin "
                        "is 12.30%.", BLOCK, [])
    bad = verify.tier0("Firm sales to capital is 2.10x.", BLOCK, [])
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

def test_a_proof_written_the_way_the_prompt_asks_is_verified_on_the_route(monkeypatch):
    """The prompt's own citation examples, and proofs in its "<label> is <value>"
    form, come back "verified" through the real Tier 0 grader on this route. A wrong
    block figure comes back "flagged" with its per-claim detail, and a proof that
    cites no block figure is "unchecked"."""
    import verify
    monkeypatch.setattr(verify, "MODE", "shadow")
    for example in ("Firm operating margin is 18.20%", "Peer top decile operating margin is 12.30%"):
        assert f'"{example}"' in server.STORY_SYSTEM
    proofs = {
        "totalMarket": "Peer total revenue is $2.9T. The reader drew a wider market, so the story keeps it.",
        "targetMargin": ("Firm operating margin is 18.20%. Peer top decile operating margin is 12.30%. "
                         "The edge passes steps 3 and 4, so the margin stays at the top of the peer range."),
        "salesToCapital": "Firm sales to capital is 2.10x.",
        "failureProbability": ("Synthetic rating class is single-A. Ten-year default rate for the "
                               "single-A rating class is 1.24%."),
        "stableRoic": "WACC is 6.96%. No edge survives step 2, so the return after year 10 equals it.",
        "distressProceeds": "The answer gives no reason to expect proceeds above zero.",
    }
    rows = [{**r, "proof": proofs.get(r["input"], r["proof"])} for r in GOOD["rows"]]
    async def fake(*a, **k): return json.dumps({**GOOD, "rows": rows}), []
    monkeypatch.setattr(server, "run_agent", fake)
    status, body = call({"ticker": "RACE", "company": "Ferrari", "answers": ANSWERS, "data": BLOCK})
    got = {r["input"]: r["verification"] for r in body["rows"]}
    assert status == 200
    for name in ("totalMarket", "targetMargin", "failureProbability", "stableRoic"):
        assert got[name]["status"] == "verified", (name, got[name]["report"])
    assert got["salesToCapital"]["status"] == "flagged"
    assert got["salesToCapital"]["report"]["flagged"][0]["via"] == "Firm sales to capital"
    assert got["distressProceeds"]["status"] == "unchecked"

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
