"""The RAG system prompts change only deliberately. This suite is what enforces it.

Two different guarantees live here, and confusing them is how the protection gets
lost:

  1. NO RUNTIME MUTATION. No flag state, no tool, no code path may edit, append to
     or wrap a prompt while the server is running. This has never been relaxed and
     must not be. `test_options_never_alter_the_system_prompt` is the guard, and it
     fails on the MECHANISM (a concatenation in `options_for`) rather than on the
     text, which is what makes it durable.
  2. NO SILENT AUTHORING CHANGE. The prompt TEXT is hashed, so any edit fails
     loudly with a diff-able signal. A deliberate, owner-approved edit is allowed;
     it just has to update the hash in the SAME commit so the prompt change and the
     hash change review together.

History, because the difference matters. These prompts were originally IMMUTABLE by
owner constraint, so every new tool had to be taught through its TOOL DESCRIPTION
(see `search_vault` at rag/server.py and `company_news` at rag/news_tools.py). On
2026-07-29 the owner lifted that constraint for `/ask` only, and ASK_SYSTEM was
rewritten from docs/prompts/metric-definitions-master-prompt-v2.md.
`EXPLAIN_SYSTEM` and `DEFINE_SYSTEM` remain unchanged and are still the reason the
tool-description mechanism has to keep working: those two routes have no other way
to learn about a tool.

If you are here because a hash test failed and you did NOT mean to change a prompt,
you have found a real bug. If you did mean to, regenerate with the one-liner in
`test_prompt_text_is_unchanged` and say why in the commit.

  python -m pytest rag/test_prompts.py -q
"""
from __future__ import annotations

import hashlib
import itertools
import os
import subprocess
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

server = pytest.importorskip("server", reason="claude_agent_sdk not installed")
calc_tools = pytest.importorskip("calc_tools", reason="claude_agent_sdk not installed")

# A failure here is not a bug in the test: it means someone changed a prompt. If
# that was deliberate and owner-approved, update the hash in the SAME commit as the
# prompt change so the two are reviewable together.
#
# ASK_SYSTEM re-recorded 2026-07-29: owner-approved rewrite from
# docs/prompts/metric-definitions-master-prompt-v2.md (answer-first structure, the
# house style rules, the Quality Score facts, and new CALCULATOR and WRITING
# FIGURES sections). The other two were recorded 2026-07-28 and are UNCHANGED by
# that rewrite, which is itself part of the guarantee: only /ask was in scope.
#
# ASK_SYSTEM re-recorded 2026-08-07: owner-approved ADDITIVE section
# "QUALITATIVE ANALYSIS MUST BE CAUSAL AND SPECIFIC" (causes before metrics,
# specificity floor, banned generic reasons, name-swap test, verdict flip
# conditions), inserted between the skepticism and WRITING FIGURES sections.
# EXPLAIN_SYSTEM and DEFINE_SYSTEM unchanged.
#
# ASK_SYSTEM re-recorded 2026-08-08: owner edit strengthening the qualitative
# mandate. "Always ask WHY" added to SUBJECT AND QUESTION; frame 1 now requires
# answering every 5W1H item with qualitative analysis and research, not only
# financial numbers; the causal-analysis section is retitled "EVERY RESPONSE
# SHOULD BE MAINLY QUALITATIVE ANALYSIS". EXPLAIN_SYSTEM and DEFINE_SYSTEM
# unchanged.
#
# ASK_SYSTEM and EXPLAIN_SYSTEM re-recorded 2026-08-11: owner edit trimming the
# prompts. ASK_SYSTEM drops the length-throttle line, compresses frames 1, 2, 6,
# 7 and 8, drops the "keep sentences short" and superficial "-ing" style rules
# and the no-en-dash clause, and adds a repeat-words-freely rule plus a
# competitive-strategy qualitative mandate on every number. EXPLAIN_SYSTEM drops
# its whole trailing STYLE block. DEFINE_SYSTEM unchanged.
#
# ASK_SYSTEM re-recorded 2026-09-21: owner edit of 2026-09-20 to frame text. The
# sentence "A frame that genuinely has nothing to say for this subject gets one
# honest sentence saying so, not a paragraph of padding." was removed.
# EXPLAIN_SYSTEM and DEFINE_SYSTEM unchanged.
#
# STORY_SYSTEM recorded 2026-09-27: new owner-approved /story-inputs route; the
# other three prompts unchanged. Re-recorded the same day so its label names and
# proof examples follow the story data block's Firm/Peer grammar (commit 48bd93b),
# with the proof-phrasing rules the Tier 0 grader needs.
#
# STORY_SYSTEM re-recorded and STORY_ANSWER_SYSTEM recorded 2026-09-27 (owner
# approval, Task 9): every story answer now arrives (the reader's, or one the new
# /story-answer route researched), so STORY_SYSTEM drops its "too thin, use the
# fallback" sentence and every "Fallback:" clause, keeping each input's rule and
# the null-with-reason rule. ASK, EXPLAIN and DEFINE unchanged.
EXPECTED = {
    "ASK_SYSTEM": "4a07ca798a9adde9022d87e9a139cf898f4a55d0d0af53ec236347cd0113c4eb",
    "EXPLAIN_SYSTEM": "7ab1fd4b392db5ff82546a95786a38744618a28ff727a53e52e7915fcaf0cc03",
    "DEFINE_SYSTEM": "0bd480bd4844636a16bafd43ece4daabfe0083f732e6b0719a8441eb019c275a",
    "STORY_SYSTEM": "bfff71405e1ed1d375c8ec187c8b6daa321a1508f25107fa2a7f2059520f53f3",
    "STORY_ANSWER_SYSTEM": "6ca21a98ab76c4284d717af8bdcdf8dbfabbea22e9a807adff56331328d9be7a",
}

PROMPTS = ("ASK_SYSTEM", "EXPLAIN_SYSTEM", "DEFINE_SYSTEM", "STORY_SYSTEM", "STORY_ANSWER_SYSTEM")


def digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


@pytest.mark.parametrize("name", PROMPTS)
def test_prompt_text_is_unchanged(name):
    """Pins the prompt bytes. Regenerate with:
       python -c "import sys;sys.path.insert(0,'rag');import server,hashlib;\
print({n: hashlib.sha256(getattr(server,n).encode()).hexdigest() for n in \
['ASK_SYSTEM','EXPLAIN_SYSTEM','DEFINE_SYSTEM','STORY_SYSTEM',\
'STORY_ANSWER_SYSTEM']})"
    """
    actual = digest(getattr(server, name))
    assert actual == EXPECTED[name], (
        f"{name} changed. If this edit is owner-approved, update EXPECTED in the "
        "same commit so the prompt change and the hash change review together.")


@pytest.mark.parametrize("verify_mode,calc_mode", list(itertools.product(
    ("off", "shadow", "on"), ("off", "on"))))
def test_options_never_alter_the_system_prompt(verify_mode, calc_mode, monkeypatch):
    """No flag state may append, wrap or edit a prompt.

    This is the test that actually protects the constraint, because it fails on
    the mechanism (a concatenation in `options_for`) rather than on the text.
    """
    for module_name, attr in (("verify", "MODE"), ("calc_tools", "MODE")):
        module = sys.modules.get(module_name)
        if module is not None:
            monkeypatch.setattr(module, attr,
                                verify_mode if module_name == "verify" else calc_mode,
                                raising=False)

    for name in PROMPTS:
        literal = getattr(server, name)
        opts = server.options_for(model="claude-haiku-4-5", system_prompt=literal,
                                  max_turns=4)
        assert opts.system_prompt == literal, (
            f"options_for mutated {name} with RAG_VERIFY={verify_mode} "
            f"RAG_CALC={calc_mode}. Teach tools through their tool description, "
            "not by appending to a prompt.")


def test_options_for_does_not_concatenate_anything_to_a_prompt():
    """A direct guard on the mechanism: pass a sentinel and require it back whole."""
    sentinel = "SENTINEL-PROMPT-DO-NOT-MODIFY"
    opts = server.options_for(model="claude-haiku-4-5", system_prompt=sentinel, max_turns=2)
    assert opts.system_prompt == sentinel


@pytest.mark.parametrize("name", PROMPTS)
def test_prompt_still_carries_its_load_bearing_rules(name):
    """A prompt could be replaced wholesale and still hash-fail informatively, but
    these are the clauses other code depends on, so assert them by content."""
    text = getattr(server, name)
    # EXPLAIN_SYSTEM dropped its whole trailing STYLE block in the owner's
    # 2026-08-11 trim (recorded above EXPECTED), so the no-em-dash rule is
    # asserted only on the two prompts that still carry one.
    if name != "EXPLAIN_SYSTEM":
        assert "em dash" in text.lower(), f"{name} lost the no-em-dash style rule"
    if name != "DEFINE_SYSTEM":
        assert "vault" in text.lower(), f"{name} lost its vault-first sourcing rule"


def test_ask_still_refuses_to_be_a_yes_man():
    """The counter-case rule is the one the owner calls out by name.

    It survived the 2026-07-29 rewrite but MOVED from CRITICAL THINKING into
    ANSWER SHAPE, which is exactly the kind of edit that loses a rule by accident.
    Assert it by content so a future reorganisation cannot drop it silently.
    """
    text = server.ASK_SYSTEM
    assert "Always give the other side" in text, \
        "ASK_SYSTEM lost the mandate to argue the opposing case"
    assert "careful analyst say no" in text, \
        "ASK_SYSTEM lost the 'what would make a careful analyst disagree' instruction"
    assert "agreeable" in text, \
        "ASK_SYSTEM lost the rule against softening a weakness to be agreeable"


def test_ask_still_declares_the_page_data_authoritative():
    """eval/graders.py cites this clause as the ENTIRE justification for grading
    figures deterministically instead of fact-checking them. If the clause goes,
    every Tier 0 `mismatch` verdict loses its basis, so the grader and this prompt
    have to move together."""
    text = server.ASK_SYSTEM
    assert "AUTHORITATIVE" in text
    assert "Computed data on the page" in text


# --- the owner's analytical method (added 2026-07-29) ------------------------
def test_ask_carries_all_eight_analytical_frames():
    """The eight frames the owner uses for investment and economic decisions.

    Asserted one at a time so a failure names the frame that went missing rather
    than just reporting that the prompt changed. Every one of these already exists
    somewhere in the product (questions.ts asks most of them verbatim); the prompt
    is what makes an ANSWER carry them.
    """
    text = server.ASK_SYSTEM
    frames = {
        "5W1H + significance": "Who, what, where, when, why and how",
        "assumptions named": "ASSUMPTIONS the",
        "limitations": "LIMITATIONS",
        "frame 3 is a menu, not a checklist": "MENU, not a checklist",
        "tradeoffs and incentives": "Tradeoffs, inefficiencies, incentives",
        "geography and politics": "political landscape",
        "best industry or company": "best industry or the best company",
        "pros against cons": "pros against the cons",
        "how it can be analyzed": "Show the method by PERFORMING it",
        "long against short term": "Long term against short term",
        "possible/plausible/probable": "possible, plausible, and probable",
    }
    for label, needle in frames.items():
        assert needle in text, f"ASK_SYSTEM lost the {label} frame"


def test_ask_carries_the_house_sector_analysis_for_economic_questions():
    """Economic answers must name which sectors benefit and why, in the format the
    app's own 51 economic definition files use (00-INDEX.md parts 3 and 4).

    The eleven GICS sectors are asserted individually: a prompt that names ten of
    them produces an answer that silently drops one, which is exactly the failure
    the "account for all eleven" instruction exists to prevent.
    """
    text = server.ASK_SYSTEM
    for sector in ("Communication Services", "Consumer Discretionary", "Consumer Staples",
                   "Energy", "Financials", "Health Care", "Industrials",
                   "Information Technology", "Materials", "Real Estate", "Utilities"):
        assert sector in text, f"ASK_SYSTEM lost the {sector} sector from the classification list"
    # The rule that makes the "why" an explanation rather than an observation.
    assert "EARNINGS channel" in text and "never a correlation" in text, \
        "ASK_SYSTEM lost the rule that the mechanism must be an earnings or discount-rate channel"
    # The cause of a move changes which sectors benefit; this is the subtlest rule
    # in the economic files and the easiest to drop in an edit.
    assert "CAUSE of the move changes the answer" in text
    assert "(none)" in text, "ASK_SYSTEM lost the instruction to fill an empty sector column"


def test_ask_carries_the_humanizer_anti_patterns():
    """The anti-pattern half of the humanizer skill.

    Deliberately NOT the PERSONALITY AND SOUL half, which tells the writer to use
    "I", state opinions and leave in half-formed thoughts. That fights the house
    voice (short sentences, one idea each, define every term) and would turn a
    valuation answer into a blog post. Owner's decision, recorded here so a future
    reader does not "complete" the import.
    """
    text = server.ASK_SYSTEM
    for label, needle in {
        "vague attribution": "No vague attribution",
        "knowledge-cutoff disclaimer": "No knowledge-cutoff disclaimers",
        "negative parallelism": "No negative parallelism",
        # The superficial "-ing" clause rule was dropped from ASK_SYSTEM in the
        # owner's 2026-08-11 trim (recorded above EXPECTED), so it is not asserted.
        "copula avoidance": 'Write "is"',
        "curly quotes and emoji": "Straight quotes only",
        "conversational artifacts": "No conversational artifacts",
        "generic positive closing": "No generic positive closing",
    }.items():
        assert needle in text, f"ASK_SYSTEM lost the {label} rule"


def test_ask_prompt_obeys_its_own_typography_rules():
    """The prompt bans em dashes, en dashes and curly quotes. It must not contain
    them itself, or it is teaching by counter-example."""
    text = server.ASK_SYSTEM
    assert "—" not in text, "ASK_SYSTEM contains an em dash"
    assert "–" not in text, "ASK_SYSTEM contains an en dash"
    for ch in ("“", "”", "‘", "’"):
        assert ch not in text, "ASK_SYSTEM contains a curly quotation mark"


@pytest.mark.parametrize("name", ("STORY_SYSTEM", "STORY_ANSWER_SYSTEM"))
def test_story_prompt_obeys_its_own_typography_rules(name):
    text = getattr(server, name)
    assert "—" not in text and "–" not in text
    for ch in ("“", "”", "‘", "’"):
        assert ch not in text
    assert "AUTHORITATIVE" in text and "search_vault" in text


def test_story_system_has_no_fallbacks_but_keeps_the_null_rule():
    text = server.STORY_SYSTEM
    assert "allback" not in text
    assert "set value to null and say why in the proof" in text


def test_ask_puts_the_sources_line_last():
    """eval/extract.py blanks from a `Sources:` match to END OF STRING (MULTILINE +
    DOTALL) before scanning numbers. That is only safe while the prompt guarantees
    the line is last and forbids any earlier one."""
    # Whitespace-normalised: the prompt is hard-wrapped, so a phrase can straddle a
    # line break and a literal substring test would fail on formatting alone.
    flat = " ".join(server.ASK_SYSTEM.split())
    assert "LAST line" in flat
    assert "Related chapters elsewhere in the library" in flat, \
        "ASK_SYSTEM stopped forbidding the other line shape extract.py blanks on"


def test_rag_calc_off_removes_the_calculator_from_the_advertised_tools():
    """`RAG_CALC=off` is the documented rollback, so prove it actually rolls back.

    This has to run in a SUBPROCESS. `server.ALLOWED_TOOLS` splats
    `calc_tools.TOOLS` at import time, so monkeypatching the flag afterwards cannot
    change it. The previous version of this test did exactly that, and passed only
    because the default was itself `off`, which made the monkeypatch a no-op rather
    than an effective one. Flipping the default to `on` on 2026-07-29 is what
    exposed it.
    """
    code = ("import sys, os; sys.path.insert(0, os.getcwd()); import server; "
            "print('CALC' if 'mcp__calc__evaluate' in server.ALLOWED_TOOLS else 'NOCALC')")
    run = subprocess.run([sys.executable, "-c", code],
                         cwd=os.path.dirname(os.path.abspath(__file__)),
                         env={**os.environ, "RAG_CALC": "off"},
                         capture_output=True, text=True, timeout=180)
    assert run.returncode == 0, run.stderr
    assert run.stdout.strip().splitlines()[-1] == "NOCALC", run.stdout


def test_the_calculator_is_advertised_by_default():
    """The other half of the flag: `on` is the shipped default, and the tool has to
    actually reach the model's tool list for the prompt's CALCULATOR section to mean
    anything."""
    if calc_tools.MODE != "on":            # a shell with RAG_CALC=off set
        pytest.skip("RAG_CALC is not 'on' in this environment")
    opts = server.options_for(model="claude-haiku-4-5",
                              system_prompt=server.ASK_SYSTEM, max_turns=4)
    assert "mcp__calc__evaluate" in (opts.allowed_tools or [])


# --- reasoning effort --------------------------------------------------------
def test_options_for_defaults_to_no_explicit_effort():
    """A caller that does not pass effort must get the SDK's own default (None
    here means "let the SDK decide", documented as "high")."""
    opts = server.options_for(model="claude-haiku-4-5",
                              system_prompt=server.DEFINE_SYSTEM, max_turns=4)
    assert opts.effort is None


def test_options_for_passes_through_an_explicit_effort():
    opts = server.options_for(model="claude-haiku-4-5", system_prompt=server.DEFINE_SYSTEM,
                              max_turns=4, effort="low")
    assert opts.effort == "low"


def test_effort_is_keyed_by_label_not_model():
    """The effort lookup is keyed by route label, never by model. The two short
    routes shared one model string until 2026-08-07 (when /explain moved to
    Sonnet 5), which is why keying by model was a live clobbering hazard; the
    label keying must survive any future model reshuffle the same way."""
    assert server.EFFORT_BY_LABEL["/explain"] == server.EXPLAIN_EFFORT
    assert server.EFFORT_BY_LABEL["/define"] == server.DEFINE_EFFORT


def test_every_route_runs_medium_effort():
    """All three routes run "medium" effort as of 2026-09-05 (owner decision).
    They ran "low" from 2026-08-14 to 2026-09-05, and "high" from 2026-08-07 to
    2026-08-14.

    Emphatically NOT "max". "max" was shipped briefly on /ask and measured 15
    turns at $2.09 on one answer, overrunning the client's timeout so finished
    work was discarded. Raising any of these without re-measuring latency is
    the mistake this test exists to prevent.
    """
    assert server.ASK_EFFORT == "medium"
    assert server.EXPLAIN_EFFORT == server.DEFINE_EFFORT == "medium"


def test_route_models_are_the_owner_pinned_set():
    """All three routes were unified onto Opus 4.6 on 2026-09-05 (owner
    decision). /define no longer stays on Sonnet."""
    assert server.ASK_MODEL == "claude-opus-4-6"
    assert server.EXPLAIN_MODEL == "claude-opus-4-6"
    assert server.DEFINE_MODEL == "claude-opus-4-6"


def test_run_agent_looks_up_effort_by_label_internally():
    """The lookup lives in run_agent's BODY, not its signature (which
    test_run_agent_signature_is_untouched pins), so this checks the source rather
    than the (unchanged) parameter list."""
    import inspect
    src = inspect.getsource(server.run_agent)
    assert "EFFORT_BY_LABEL" in src


def test_health_reports_ask_effort():
    import asyncio
    import json

    class _Req:
        pass

    resp = asyncio.get_event_loop_policy().new_event_loop().run_until_complete(
        server.handle_health(_Req()))
    body = json.loads(resp.body.decode())
    assert body["ask_effort"] == server.ASK_EFFORT
