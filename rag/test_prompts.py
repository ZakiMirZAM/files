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
EXPECTED = {
    "ASK_SYSTEM": "a351efbb3ac4f4ac2749c673859639b50d399d87a464f008c168e14385035802",
    "EXPLAIN_SYSTEM": "76c271377fbdfe24fdb4772f437038a3ae42a24e27fb4eee93eddc124837d4d9",
    "DEFINE_SYSTEM": "0bd480bd4844636a16bafd43ece4daabfe0083f732e6b0719a8441eb019c275a",
}

PROMPTS = ("ASK_SYSTEM", "EXPLAIN_SYSTEM", "DEFINE_SYSTEM")


def digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


@pytest.mark.parametrize("name", PROMPTS)
def test_prompt_text_is_unchanged(name):
    """Pins the prompt bytes. Regenerate with:
       python -c "import sys;sys.path.insert(0,'rag');import server,hashlib;\
print({n: hashlib.sha256(getattr(server,n).encode()).hexdigest() for n in \
['ASK_SYSTEM','EXPLAIN_SYSTEM','DEFINE_SYSTEM']})"
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
    """EXPLAIN_MODEL and DEFINE_MODEL are the same string today; if the lookup
    were keyed by model, one route's effort would silently clobber the other's."""
    assert server.EXPLAIN_MODEL == server.DEFINE_MODEL
    assert server.EFFORT_BY_LABEL["/explain"] == server.EXPLAIN_EFFORT
    assert server.EFFORT_BY_LABEL["/define"] == server.DEFINE_EFFORT


def test_ask_is_the_highest_effort_route():
    """/ask is the flagship long-form answer; /explain and /define are short
    sidebar text where the existing Haiku choice already signals speed over depth.

    /ask is "high", NOT "max". "max" was shipped briefly and measured 15 turns at
    $2.09 on one answer, overrunning the client's timeout so finished work was
    discarded. Depth now comes from the model (Opus 5) rather than from spending
    the top reasoning tier on every turn. Raising this back to "max" without
    re-measuring latency is the mistake this line exists to prevent.
    """
    assert server.ASK_EFFORT == "high"
    assert server.EXPLAIN_EFFORT == server.DEFINE_EFFORT == "low"


def test_ask_runs_the_deepest_model():
    """The two short routes stay on Haiku; /ask is the one users read as analysis."""
    assert server.ASK_MODEL == "claude-opus-5"
    assert server.EXPLAIN_MODEL == server.DEFINE_MODEL == "claude-haiku-4-5"


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
