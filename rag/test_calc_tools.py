"""Tests for the calculator tool and its ledger. Network-free, no SDK required.

  python -m pytest rag/test_calc_tools.py -q
"""
from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import calc_tools


@pytest.fixture(autouse=True)
def ledger():
    token = calc_tools.begin()
    yield
    calc_tools.end(token)


def test_returns_the_result_at_the_requested_precision():
    out = calc_tools.evaluate_expression("(0.142 - 0.084) * 100", precision=4)
    assert "5.8000" in out


def test_emits_a_stable_machine_line():
    """The `#calc` line is what the ledger and any log scrape parse."""
    out = calc_tools.evaluate_expression("2 + 2", precision=0, label="check")
    assert "#calc expr=" in out and "result=4" in out


def test_label_is_echoed_when_given():
    out = calc_tools.evaluate_expression("1 + 1", label="ROIC minus WACC spread")
    assert out.startswith("ROIC minus WACC spread:")


def test_house_unicode_operators_are_accepted():
    """The app writes x, division sign and U+2212 minus in prose and labels."""
    assert "6.0000" in calc_tools.evaluate_expression("10 − 4")
    assert "2.5000" in calc_tools.evaluate_expression("10 ÷ 4")
    assert "40.0000" in calc_tools.evaluate_expression("10 × 4")


@pytest.mark.parametrize("expr", [
    "__import__('os').system('x')", "().__class__.__bases__", "9**9**9", "1/0",
    "open('x')", "lambda: 1", "'a'*10**9",
])
def test_hostile_input_returns_an_error_message_not_an_exception(expr):
    out = calc_tools.evaluate_expression(expr)
    assert out.startswith("Error:")


def test_empty_expression_is_handled():
    assert calc_tools.evaluate_expression("").startswith("Error:")


def test_precision_is_clamped():
    assert f"precision={calc_tools.MAX_PRECISION}" in \
        calc_tools.evaluate_expression("1/3", precision=999)
    assert "precision=0" in calc_tools.evaluate_expression("1/3", precision=-5)


def test_bad_precision_type_falls_back():
    assert "0.3333" in calc_tools.evaluate_expression("1/3", precision="oops")


# --- the ledger, which is the point ----------------------------------------
def test_every_evaluation_is_recorded():
    calc_tools.evaluate_expression("1 + 1", label="a")
    calc_tools.evaluate_expression("2 + 2", label="b")
    assert [e.label for e in calc_tools.entries()] == ["a", "b"]


def test_a_failed_evaluation_is_not_recorded():
    calc_tools.evaluate_expression("1/0")
    assert calc_tools.entries() == []


def test_ledger_is_bounded():
    for i in range(calc_tools.MAX_LEDGER + 40):
        calc_tools.evaluate_expression(f"{i} + 1")
    assert len(calc_tools.entries()) == calc_tools.MAX_LEDGER


def test_ledger_is_per_request():
    calc_tools.evaluate_expression("1 + 1", label="first")
    inner = calc_tools.begin()
    assert calc_tools.entries() == []
    calc_tools.end(inner)
    assert len(calc_tools.entries()) == 1


def test_transcription_error_is_detected():
    """The defect class nothing else can see: the tool returned 5.8000 and the
    prose says 5.9."""
    calc_tools.evaluate_expression("(0.142 - 0.084) * 100", precision=4,
                                   label="spread")
    errors = calc_tools.find_transcription_errors(
        "The spread is 5.9pp, which is wide.")
    assert errors and errors[0]["tool_result"] == pytest.approx(5.8)


def test_correctly_quoted_result_is_not_flagged():
    calc_tools.evaluate_expression("(0.142 - 0.084) * 100", precision=4, label="spread")
    assert calc_tools.find_transcription_errors("The spread is 5.80pp.") == []


def test_rounded_restatement_is_not_a_transcription_error():
    calc_tools.evaluate_expression("(0.142 - 0.084) * 100", precision=1, label="spread")
    assert calc_tools.find_transcription_errors("The spread is 5.8pp.") == []


def test_no_ledger_means_no_findings():
    assert calc_tools.find_transcription_errors("anything at all", ledger=[]) == []


# --- flag discipline --------------------------------------------------------
def test_default_is_on():
    """Two-valued on|off: there is no honest shadow for handing a model a tool,
    because exposing it changes behaviour by definition.

    The default flipped to `on` on 2026-07-29, when ASK_SYSTEM gained a CALCULATOR
    section. It shipped `off` only because the prompt could not mention the tool,
    and a tool the model is never told about earns its turns rarely.
    """
    assert calc_tools.MODE in ("on", "off")
    assert os.environ.get("RAG_CALC", "on").lower() == calc_tools.MODE


def test_tools_and_servers_are_empty_when_off(monkeypatch):
    monkeypatch.setattr(calc_tools, "MODE", "off")
    assert calc_tools.servers() == {}


def test_the_instruction_lives_in_the_description_not_a_prompt():
    """The description must carry the whole behavioural ask on its own.

    ASK_SYSTEM now also instructs the model to use this tool, but `/explain` and
    `/define` still run on prompts that are unchanged and hash-locked, so for those
    two routes the description remains the only instruction there is.
    """
    d = calc_tools.DESCRIPTION.lower()
    assert "every calculation" in d
    assert "in one call" in d
    assert "page data" in d          # tells it not to recompute a given figure
    assert "exactly as given" in d   # guards against transcription drift
