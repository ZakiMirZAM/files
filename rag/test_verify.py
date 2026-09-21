"""Tests for Tier 0 and its wiring into the server. Network-free.

  python -m pytest rag/test_verify.py -q
"""
from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import calc_tools
import verify

CTX = """AAPL (Apple Inc.), sector Technology
Key ratios: Return On Equity=1.57, Return On Invested Capital=0.41
Valuation: DCF intrinsic $185.40, WACC 8.42%, margin of safety -12.30%"""

GOOD = "Apple's WACC is 8.42% and its DCF intrinsic value is $185.40 per share."
BAD = "Apple's WACC is 15.90% and its DCF intrinsic value is $402.10 per share."


@pytest.fixture
def shadow(monkeypatch):
    monkeypatch.setattr(verify, "MODE", "shadow")
    return verify


def test_default_mode_is_shadow():
    """Shadow logs without acting. It is the correct production mode while the
    grader is still being calibrated, because nothing user-visible depends on it."""
    assert os.environ.get("RAG_VERIFY", "shadow").lower() == verify.MODE


def test_off_returns_nothing_at_all(monkeypatch):
    """`off` must be byte-identical to the pre-verification server: no key, no log."""
    monkeypatch.setattr(verify, "MODE", "off")
    assert verify.tier0(GOOD, CTX) is None
    assert verify.public(None) is None


def test_a_correct_answer_is_clean(shadow):
    report = verify.tier0(GOOD, CTX)
    assert report["status"] == "clean"
    assert report["mismatched"] == 0


def test_a_wrong_answer_is_flagged(shadow):
    report = verify.tier0(BAD, CTX)
    assert report["status"] == "flagged"
    assert report["mismatched"] >= 2


def test_shadow_withholds_the_per_claim_detail(shadow):
    """Counts are fine to return; individual claims are not, because nothing should
    be able to render a badge from an uncalibrated grader."""
    public = verify.public(verify.tier0(BAD, CTX))
    assert "flagged" not in public
    assert public["mismatched"] >= 2


def test_on_also_withholds_the_per_claim_detail(monkeypatch):
    """`on` changes what the server DOES with a flag (Tier 1 runs), not what it
    publishes. The per-claim lists stay server-side in every mode."""
    monkeypatch.setattr(verify, "MODE", "on")
    public = verify.public(verify.tier0(BAD, CTX))
    for key in ("flagged", "arithmeticErrors", "transcriptionErrors"):
        assert key not in public
    assert public["mismatched"] >= 2


def test_expose_flag_returns_the_detail(monkeypatch):
    """The debug escape hatch, off in production."""
    monkeypatch.setattr(verify, "MODE", "on")
    monkeypatch.setattr(verify, "EXPOSE", True)
    public = verify.public(verify.tier0(BAD, CTX))
    assert public["flagged"] and public["flagged"][0]["expected"] is not None
    assert "arithmeticErrors" in public and "transcriptionErrors" in public


def test_contradictions_are_named_informational(shadow):
    """The detector is not calibrated, so the key name has to say so."""
    assert "contradictionsInformational" in verify.tier0(GOOD, CTX)


# --- totality: a verification bug must never break an answer ----------------
@pytest.mark.parametrize("answer,context", [
    ("", CTX), ("   ", CTX), (GOOD, ""), (GOOD, None),
    ("|||", "|||"), ("`unclosed", "%%%"), ("0" * 5000, CTX),
    ("− − −", "= = ="), ("\n\n\n", "12,,,34"),
])
def test_tier0_never_raises(shadow, answer, context):
    verify.tier0(answer, context)


def test_tier0_survives_a_broken_grader(shadow, monkeypatch):
    def boom(*_a, **_k):
        raise RuntimeError("grader exploded")
    monkeypatch.setattr(verify, "_report", boom)
    assert verify.tier0(GOOD, CTX) is None


def test_log_line_tolerates_none(shadow):
    verify.log_line("/ask", None)


def test_tier0_is_fast_enough(shadow):
    """It runs inline in the request path, so it has to be free."""
    import time
    answer = "Apple's WACC is 8.42% and ROIC is 41.2%. " * 200
    t0 = time.perf_counter()
    verify.tier0(answer, CTX)
    assert (time.perf_counter() - t0) < 1.0


# --- the calculator ledger feeds Tier 0 -------------------------------------
def test_transcription_error_reaches_the_report(shadow):
    token = calc_tools.begin()
    try:
        calc_tools.evaluate_expression("(0.142 - 0.084) * 100", precision=4,
                                       label="spread")
        ledger = calc_tools.entries()
        report = verify.tier0("The spread is 5.9pp.", CTX, ledger)
    finally:
        calc_tools.end(token)
    assert report["transcriptionErrors"]
    assert report["status"] == "flagged"


def test_no_ledger_is_fine(shadow):
    assert verify.tier0(GOOD, CTX, None)["transcriptionErrors"] == []


# --- server wiring ----------------------------------------------------------
server = pytest.importorskip("server", reason="claude_agent_sdk not installed")


def test_calc_tools_are_absent_from_allowed_tools_when_off():
    if calc_tools.MODE == "off":
        assert calc_tools.TOOL_NAME not in server.ALLOWED_TOOLS


def test_the_original_five_tools_are_still_advertised():
    for name in (server.VAULT_TOOL, "WebSearch", "WebFetch"):
        assert name in server.ALLOWED_TOOLS


def test_run_agent_signature_is_untouched():
    """The ledger is opened in the HANDLER precisely so this protected function
    needs no signature change."""
    import inspect
    params = list(inspect.signature(server.run_agent).parameters)
    assert params == ["prompt", "model", "system_prompt", "max_turns", "label",
                      "allow_web", "budget_usd"]


def test_health_reports_every_flag():
    """Operationally the flags must be readable without shell access to the box."""
    import asyncio

    class _Req:
        pass

    resp = asyncio.get_event_loop_policy().new_event_loop().run_until_complete(
        server.handle_health(_Req()))
    import json
    body = json.loads(resp.body.decode())
    assert body["verify"] == verify.MODE
    assert body["calc"] == calc_tools.MODE
    assert body["retrieval"]
