"""Tests for Tier 1 (rarr.py) and its /verify wiring.

The pure tests are network-free and run anywhere. The tests that need the live
FastAPI backend on :8000 are marked `live` and skip themselves when nothing is
listening, so `pytest rag/` stays green on a machine with the backend down.

  python -m pytest rag/test_rarr.py -q
  python -m pytest rag/test_rarr.py -q -m live     # needs the backend on :8000
"""
from __future__ import annotations

import asyncio
import inspect
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import rarr
import verify
from eval import extract

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CTX = """AAPL (Apple Inc.), sector Technology
Key ratios: Return On Equity=1.57, Return On Invested Capital=0.41
Valuation: DCF intrinsic $185.40, WACC 8.42%, margin of safety -12.30%"""


def company(label, value, unit=extract.PCT, decimals=6):
    return rarr.Evidence(label, value, unit, decimals, f"benchmarks:{label}.company",
                         rarr.COMPANY)


def group(label, value, unit=extract.PCT):
    return rarr.Evidence(label, value, unit, 6, f"benchmarks:{label}.industry", rarr.GROUP)


def library(label, value, unit=extract.PCT):
    return rarr.Evidence(label, value, unit, 2, "vault:Books/X/Ch1.md", rarr.LIBRARY)


WACC = [company("WACC", 8.42)]


def run(answer, evidence=WACC, ctx=CTX):
    return rarr.reconcile(answer, ctx, evidence)


# --- the module contains no model call --------------------------------------
def test_tier_one_makes_zero_llm_calls():
    """The whole point of Tier 1 here: a model that rewrites a sentence to fit a
    number is the failure the verification layer exists to catch. If this fails,
    someone reached for a model to resolve an ambiguity that must be declined."""
    source = inspect.getsource(rarr)
    for forbidden in ("claude_agent_sdk", "anthropic", "run_agent", "options_for"):
        assert forbidden not in source, f"rarr.py must not reference {forbidden}"


def test_http_goes_through_aiohttp_not_urllib():
    """server.py is an aiohttp event loop; a blocking fetch here starves the Agent
    SDK control-request handshake and every parked request 500s. That is the same
    bug that put `search_vault` behind `asyncio.to_thread`."""
    imports = [ln.strip() for ln in inspect.getsource(rarr).splitlines()
               if ln.startswith(("import ", "from "))]
    assert "import aiohttp" in imports
    for blocking in ("urllib", "requests", "http.client", "httpx"):
        assert not any(blocking in ln for ln in imports), \
            f"rarr.py must not import {blocking}"


# --- minimal substitution, at the written precision --------------------------
@pytest.mark.parametrize("raw,answer,value,expected", [
    ("15.90%", "Apple's WACC is 15.90% today.", 8.42, "8.42%"),
    ("15.9%", "Apple's WACC is 15.9% today.", 8.42, "8.4%"),
    ("16%", "Apple's WACC is 16% today.", 8.42, "8%"),
    ("15.9000%", "Apple's WACC is 15.9000% today.", 8.42, "8.4200%"),
])
def test_substitution_keeps_the_written_precision(raw, answer, value, expected):
    """The model's precision is its claim of precision. Rewriting `16%` as `8.42%`
    would assert two digits the answer never asserted."""
    out = run(answer, [company("WACC", value)])
    assert out["status"] == "revised"
    assert out["edits"][0]["replacement"] == expected
    assert out["revisedAnswer"] == answer.replace(raw, expected)


def test_substitution_keeps_the_currency_mark_and_scale_word():
    answer = "The DCF intrinsic value is $402.10B on that basis."
    out = run(answer, [company("DCF intrinsic value", 185.4e9, extract.USD)])
    assert out["edits"][0]["replacement"] == "$185.40B"
    assert out["revisedAnswer"].endswith("on that basis.")


def test_substitution_keeps_a_unicode_minus_sign():
    """U+2212 is load-bearing in this repo. A rewrite must not silently downgrade
    it to an ASCII hyphen."""
    tok = [t for t in extract.scan("Margin of safety is −22.50% here.") if t.gradable][0]
    assert rarr.render(tok, -12.3) == "−12.30%"


def test_substitution_keeps_an_ascii_minus_sign():
    tok = [t for t in extract.scan("Margin of safety is -22.50% here.") if t.gradable][0]
    assert rarr.render(tok, -12.3) == "-12.30%"


def test_only_the_flagged_token_moves():
    """Smallest possible edit: every other character of the answer is untouched."""
    answer = "Apple's WACC is 15.90%, which the model derived from its own inputs."
    out = run(answer)
    revised = out["revisedAnswer"]
    assert revised.replace("8.42%", "15.90%") == answer


def test_a_grouped_figure_is_not_rewritten():
    """Rebuilding thousands separators is formatting invention, not a minimal edit."""
    tok = [t for t in extract.scan("Revenue of $1,234.50 for the year.") if t.gradable][0]
    assert rarr.render(tok, 999.0) is None


# --- comparative clauses are flagged, never edited ---------------------------
@pytest.mark.parametrize("answer", [
    "Apple's WACC is 15.90%, above the industry hurdle.",
    "Apple's WACC is 15.90%, below what peers carry.",
    "Apple's WACC is 15.90%, which exceeds the cost of debt.",
    "Apple's WACC is 15.90%, a premium to the sector.",
    "Apple's WACC is 15.90%, a discount to what the group pays.",
    "Apple's WACC is 15.90%, wider than the gap peers carry.",
    "Apple's WACC is 15.90%, narrower than the band peers carry.",
    "Apple's WACC is 15.90% and its ROIC − WACC leg is the one that moves.",
])
def test_a_comparative_clause_is_flagged_not_edited(answer):
    """Substituting the number can falsify the sentence even when the number
    itself becomes correct. Sentence rewriting was rejected by the owner, so the
    only honest move left is to report it."""
    out = run(answer)
    assert out["status"] == "unchanged"
    assert out["revisedAnswer"] is None
    assert out["edits"] == []
    assert out["unresolved"], "a declined edit must still be reported"


def test_the_comparative_reason_names_the_clause():
    out = run("Apple's WACC is 15.90%, above the industry hurdle.")
    assert "comparative" in out["unresolved"][0]["reason"]


def test_a_plain_hyphen_inside_a_word_is_not_a_comparison():
    """`cash-flow` must not read as `a − b`, or nothing is ever editable."""
    assert not rarr.is_comparative("The cash-flow-weighted WACC is 15.90% today.")


def test_a_negative_number_is_not_a_comparison():
    assert not rarr.is_comparative("Margin of safety is -12.30% right now.")


def test_a_time_span_is_not_a_comparison():
    """"over the past decade" is a span. Reading a bare `over` as a comparison
    would decline most of the edits this module exists to make."""
    assert not rarr.is_comparative("The WACC has averaged 15.90% over the past decade.")
    out = run("Apple's WACC has averaged 15.90% over the past decade.")
    assert out["status"] == "revised"


# --- preservation guards ------------------------------------------------------
def test_a_non_unique_original_is_refused():
    """Two identical figures give no way to know which one was meant, so the edit
    is dropped rather than applied to whichever `str.replace` finds first."""
    revised, reason = rarr.apply_edit("WACC 15.90% and again WACC 15.90%.",
                                      "15.90%", "8.42%", [8.42])
    assert revised is None
    assert "exactly once" in reason


def test_a_non_unique_original_reaches_the_report_as_unresolved():
    out = run("The WACC is 15.90% and the WACC is still 15.90%.")
    assert out["status"] == "unchanged"
    assert all("exactly once" in u["reason"] for u in out["unresolved"])


def test_a_revision_introducing_an_unsupported_number_is_refused():
    """The second guard: whatever the revision adds must be something the evidence
    actually said."""
    revised, reason = rarr.apply_edit("The WACC is 15.90%.", "15.90%", "8.42%",
                                      allowed=[41.2])
    assert revised is None
    assert "introduce" in reason


def test_a_supported_replacement_passes_both_guards():
    revised, reason = rarr.apply_edit("The WACC is 15.90%.", "15.90%", "8.42%", [8.42])
    assert revised == "The WACC is 8.42%."
    assert reason == ""


def test_a_rounded_replacement_still_passes_the_introduction_guard():
    """Rendering at the written precision moves the value off the raw evidence
    figure, so the guard has to allow the rendered value, not just the source one."""
    out = run("Apple's WACC is 15.9% today.", [company("WACC", 8.4231)])
    assert out["edits"][0]["replacement"] == "8.4%"


# --- no evidence means no edit ------------------------------------------------
def test_no_evidence_means_no_edit():
    out = run("Apple's WACC is 15.90% today.", evidence=[])
    assert out["status"] == "unchanged"
    assert out["edits"] == []
    assert "no evidence" in out["unresolved"][0]["reason"]


def test_evidence_for_a_different_metric_is_not_used():
    out = run("Apple's WACC is 15.90% today.", [company("Net Interest Margin", 3.1)])
    assert out["edits"] == []


def test_a_group_benchmark_never_drives_an_edit():
    """After `label_tokens` drops "industry" and "sector" as stopwords, a group
    column is indistinguishable from the company's own metric by label. Letting it
    drive an edit would rewrite a company figure to a peer average."""
    out = run("Apple's WACC is 15.90% today.", [group("WACC", 8.42)])
    assert out["edits"] == []
    assert out["unresolved"]


def test_a_group_benchmark_vetoes_an_edit_it_agrees_with():
    """If the flagged figure IS the industry average, the sentence is probably
    about the industry, and rewriting it to the company value breaks it."""
    out = run("The WACC is 11.00% on that basis.",
              [company("WACC", 8.42), group("WACC", 11.0)])
    assert out["edits"] == []
    assert "group" in out["unresolved"][0]["reason"]


def test_the_library_never_drives_an_edit():
    out = run("Apple's WACC is 15.90% today.", [library("WACC", 15.90)])
    assert out["edits"] == []


def test_a_library_match_marks_the_claim_supported():
    """A rule of thumb the app has no authoritative value for is corroborated by
    the vault, not corrected against it."""
    out = run("Apple's WACC is 15.90% today.", [library("WACC", 15.90)])
    assert out["supported"] and "library" in out["supported"][0]["note"]


def test_company_agreement_marks_a_tier_zero_false_positive():
    out = run("Apple's WACC is 15.90% today.", [company("WACC", 15.90)])
    assert out["status"] == "unchanged"
    assert out["supported"] and out["supported"][0]["source"].endswith(".company")


def test_a_disagreement_below_the_written_precision_is_not_an_edit():
    out = run("Apple's WACC is 8%.", [company("WACC", 8.42)])
    assert out["edits"] == []


@pytest.mark.parametrize("answer", [
    "Apple's WACC came in at over 15.90% last year.",
    "Apple's WACC came in under 15.90% last year.",
    "Apple's WACC ran 15.90-18.20% across the period.",
])
def test_a_hedged_bound_is_never_rewritten(answer):
    out = run(answer)
    assert out["edits"] == []


def test_the_edit_count_is_bounded():
    assert rarr.MAX_EDITS <= 20
    answer = " ".join(f"Metric{i} WACC is 15.9{i}% today." for i in range(40))
    out = run(answer, WACC)
    assert len(out["edits"]) + len(out["unresolved"]) + len(out["supported"]) <= rarr.MAX_EDITS


# --- evidence construction ----------------------------------------------------
BENCH = {
    "wacc": {"label": "WACC", "unit": "%", "company": 8.42, "industry": 9.1, "sector": 9.9},
    "pe": {"label": "P/E Ratio", "unit": "x", "company": 31.2, "industry": None,
           "sector": 24.0},
    "broken": {"label": "Junk", "unit": "%", "company": None, "industry": None,
               "sector": None},
    "notadict": 5,
}


def test_benchmark_rows_carry_role_unit_and_provenance():
    rows = rarr.evidence_from_benchmarks(BENCH)
    by_source = {r.source: r for r in rows}
    assert by_source["benchmarks:wacc.company"].role == rarr.COMPANY
    assert by_source["benchmarks:wacc.industry"].role == rarr.GROUP
    assert by_source["benchmarks:pe.company"].unit == extract.TIMES
    assert "benchmarks:broken.company" not in by_source
    assert not any(r.source.startswith("benchmarks:notadict") for r in rows)


def test_benchmark_rows_survive_a_garbage_payload():
    for junk in (None, {}, {"x": None}, {"x": {"company": "NaN"}}, {"x": {"company": True}}):
        assert rarr.evidence_from_benchmarks(junk) == []


def test_beta_rows_split_the_resolver_output_by_role():
    rows = {r.source: r for r in rarr.evidence_from_beta(
        {"value": 1.21, "unlevered": 1.02, "regression_beta": 1.44, "de_ratio": 0.31,
         "tax_rate": 0.21, "method": "L1"})}
    assert rows["beta:value"].role == rarr.COMPANY
    assert rows["beta:regression_beta"].role == rarr.GROUP
    assert rows["beta:de_ratio"].role == rarr.GROUP


def test_beta_rows_survive_a_garbage_payload():
    assert rarr.evidence_from_beta({}) == []
    assert rarr.evidence_from_beta({"value": None}) == []


def test_passage_rows_are_library_role():
    hits = [{"source": "Books/A/Ch1.md", "text": "A current ratio of 2.00 is typical."}]
    rows = rarr.evidence_from_passages(hits)
    assert rows and all(r.role == rarr.LIBRARY for r in rows)
    assert rows[0].source == "vault:Books/A/Ch1.md"


def test_passage_rows_survive_garbage():
    assert rarr.evidence_from_passages(None) == []
    assert rarr.evidence_from_passages([None, 5, {}]) == []


def test_doctrinal_claims_are_the_ones_worth_a_vault_search():
    """The library can speak to a rule of thumb. It cannot speak to a measurement,
    and searching it for one only buys an embed and a KNN."""
    doctrinal = "Apple's WACC is 15.90%, a level investors generally accept."
    assert rarr.doctrinal_labels(doctrinal, CTX)
    assert rarr.doctrinal_labels("Apple's WACC is 15.90% today.", CTX) == []


def test_the_vault_is_only_searched_for_a_doctrinal_claim():
    asked: list[str] = []

    def spy(query, _category=None):
        asked.append(query)
        return []

    asyncio.run(rarr.tier1("Apple's WACC is 15.90% today.", None, data_context=CTX,
                           vault_search=spy))
    assert asked == []
    asyncio.run(rarr.tier1("Apple's WACC is 15.90%, a level investors generally accept.",
                           None, data_context=CTX, vault_search=spy))
    assert asked, "a doctrinal claim should reach the library"
    assert len(asked) <= rarr.MAX_VAULT_QUERIES


# --- totality -----------------------------------------------------------------
@pytest.mark.parametrize("answer,ctx", [
    ("", CTX), ("   ", CTX), (None, CTX), ("x", None),
    ("|||", "|||"), ("`unclosed", "%%%"), ("0" * 4000, CTX),
    ("− − −", "= = ="), ("\n\n\n", "12,,,34"), ("$$$%%%xx", "{"),
])
def test_tier1_never_raises(answer, ctx):
    """A verification bug must never turn a good answer into a 500. `context` is
    deliberately not a symbol, so nothing here touches the network."""
    out = asyncio.run(rarr.tier1(answer, None, section="individual",
                                 context="not a ticker!", data_context=ctx))
    assert out["status"] in ("unchanged", "revised")


def test_tier1_survives_a_broken_grader(monkeypatch):
    def boom(*_a, **_k):
        raise RuntimeError("grader exploded")
    monkeypatch.setattr(rarr.graders, "grade_claims", boom)
    out = asyncio.run(rarr.tier1("Apple's WACC is 15.90%.", None, data_context=CTX))
    assert out["status"] == "unchanged"
    assert out["edits"] == []


def test_tier1_survives_a_broken_vault_search(monkeypatch):
    def boom(*_a, **_k):
        raise RuntimeError("ollama down")
    answer = "A typical WACC threshold is 15.90% for this kind of company."
    out = asyncio.run(rarr.tier1(answer, None, data_context=CTX, vault_search=boom))
    assert out["status"] == "unchanged"


def test_tier1_does_not_touch_the_network_for_a_group_page():
    """`context` on a sector page is a group NAME, and "TECHNOLOGY" is ten legal
    ticker characters. Sending it would request a company that does not exist."""
    async def explode(*_a, **_k):
        raise AssertionError("no HTTP call may be made for a non-individual section")
    evidence, reached = asyncio.run(rarr.research("sector", "TECHNOLOGY", ["WACC"]))
    assert evidence == [] and reached["benchmarks"] == 0


def test_log_line_tolerates_none():
    rarr.log_line(None)
    rarr.log_line({})


def test_the_flag_mirrors_verify():
    assert rarr.MODE == verify.MODE
    assert rarr.enabled() == (verify.MODE == "on")


# --- the benchmarks cache -----------------------------------------------------
def test_benchmarks_are_cached_per_ticker(monkeypatch):
    """The endpoint is rate limited at 20/minute per IP and every verification
    arrives from loopback, so they all share one bucket."""
    calls = []

    async def fake_get(_session, path, key):
        calls.append(path)
        return {"metrics": {"wacc": {"label": "WACC", "unit": "%", "company": 8.42}}}

    monkeypatch.setattr(rarr, "_get_json", fake_get)
    rarr._bench_cache._data.clear()

    async def main():
        await rarr.benchmarks(None, "AAPL")
        await rarr.benchmarks(None, "AAPL")
        await rarr.benchmarks(None, "MSFT")
    asyncio.run(main())
    assert len(calls) == 2, "the second AAPL call must come from the cache"
    assert rarr.BENCH_TTL_S == 1800


def test_a_failed_benchmark_fetch_is_not_an_error(monkeypatch):
    async def fake_get(*_a, **_k):
        return None
    monkeypatch.setattr(rarr, "_get_json", fake_get)
    rarr._bench_cache._data.clear()
    assert asyncio.run(rarr.benchmarks(None, "ZZZZ")) == {}


def test_a_failed_fetch_is_never_cached(monkeypatch):
    """A 30-minute memory of one timeout would silently disable Tier 1 for that
    ticker long after the backend recovered."""
    outcomes = [None, {"metrics": {"wacc": {"label": "WACC", "unit": "%",
                                            "company": 8.42}}}]

    async def fake_get(*_a, **_k):
        return outcomes.pop(0)

    monkeypatch.setattr(rarr, "_get_json", fake_get)
    rarr._bench_cache._data.clear()

    async def main():
        first = await rarr.benchmarks(None, "AAPL")
        second = await rarr.benchmarks(None, "AAPL")
        return first, second
    first, second = asyncio.run(main())
    assert first == {}
    assert second, "the recovery must not be masked by a cached failure"


def test_beta_is_fetched_only_when_a_flagged_claim_names_it(monkeypatch):
    """/api/beta/{ticker} is uncached by design and rate limited at 10/minute, so
    it is not spent on answers that never mention beta."""
    asked: list[str] = []

    async def fake_bench(_session, _ticker):
        return {}

    async def fake_beta(_session, ticker):
        asked.append(ticker)
        return {"value": 1.21}

    monkeypatch.setattr(rarr, "benchmarks", fake_bench)
    monkeypatch.setattr(rarr, "beta", fake_beta)

    asyncio.run(rarr.research("individual", "AAPL", ["Apple's WACC is"]))
    assert asked == []
    _ev, reached = asyncio.run(rarr.research("individual", "AAPL", ["its levered beta is"]))
    assert asked == ["AAPL"] and reached["beta"] == 1


# --- /verify wiring -----------------------------------------------------------
server = pytest.importorskip("server", reason="claude_agent_sdk not installed")


class _Req:
    """The two things handle_verify touches on an aiohttp request."""

    def __init__(self, body):
        self._body = body

    async def json(self):
        if isinstance(self._body, Exception):
            raise self._body
        return self._body


def call(body):
    resp = asyncio.run(server.handle_verify(_Req(body)))
    return resp.status, json.loads(resp.body.decode())


def test_an_unknown_token_is_expired():
    """After a restart the in-process store is empty, which is every token."""
    status, body = call({"token": "nope-this-was-never-issued"})
    assert status == 200 and body == {"status": "expired"}


def test_a_missing_token_is_expired():
    assert call({})[1]["status"] == "expired"
    assert call({"token": ""})[1]["status"] == "expired"


def test_a_bad_body_is_a_400_not_a_500():
    status, body = call(ValueError("not json"))
    assert status == 400 and body["status"] == "error"


def test_a_token_expires_after_its_ttl(monkeypatch):
    monkeypatch.setattr(server, "VERIFY_TTL_S", -1)
    token = server.issue_verify_token("a", "b", "AAPL", "individual", {"status": "flagged"})
    assert server.take_pending(token) is None
    assert call({"token": token})[1]["status"] == "expired"


def test_the_ttl_is_fifteen_minutes():
    assert server.VERIFY_TTL_S == 15 * 60


def test_the_store_is_lru_capped():
    server._pending.clear()
    tokens = [server.issue_verify_token("a", "b", "T", "individual", {}) for _ in range(300)]
    assert len(server._pending) <= server.VERIFY_MAX_TOKENS == 256
    assert server.take_pending(tokens[0]) is None, "the oldest token must be evicted first"
    assert server.take_pending(tokens[-1]) is not None
    server._pending.clear()


def test_a_token_is_reusable_inside_its_ttl(monkeypatch):
    """A caller whose first attempt came back `partial` must be able to retry."""
    async def canned(*_a, **_k):
        return {"status": "unchanged", "edits": []}
    monkeypatch.setattr(rarr, "tier1", canned)
    token = server.issue_verify_token("a", "b", "AAPL", "individual", {"status": "flagged"})
    assert call({"token": token})[1]["status"] == "unchanged"
    assert call({"token": token})[1]["status"] == "unchanged"


def test_the_tier1_cap_is_45_seconds():
    assert server.TIER1_TIMEOUT_S == 45


def test_a_timeout_returns_the_tier0_report_as_partial(monkeypatch):
    async def slow(*_a, **_k):
        await asyncio.sleep(5)
    monkeypatch.setattr(rarr, "tier1", slow)
    monkeypatch.setattr(server, "TIER1_TIMEOUT_S", 0.05)
    monkeypatch.setattr(verify, "MODE", "on")
    token = server.issue_verify_token("a", "b", "AAPL", "individual",
                                      {"status": "flagged", "mismatched": 2})
    status, body = call({"token": token})
    assert status == 200
    assert body["status"] == "partial"
    assert body["verification"]["mismatched"] == 2


def test_a_tier1_crash_also_degrades_to_partial(monkeypatch):
    async def boom(*_a, **_k):
        raise RuntimeError("tier 1 exploded")
    monkeypatch.setattr(rarr, "tier1", boom)
    monkeypatch.setattr(verify, "MODE", "on")
    token = server.issue_verify_token("a", "b", "AAPL", "individual", {"status": "flagged"})
    assert call({"token": token})[1]["status"] == "partial"


def test_a_successful_pass_returns_the_revision_and_the_tier0_report(monkeypatch):
    async def canned(*_a, **_k):
        return {"status": "revised", "revisedAnswer": "fixed", "edits": [{"text": "x"}]}
    monkeypatch.setattr(rarr, "tier1", canned)
    monkeypatch.setattr(verify, "MODE", "on")
    token = server.issue_verify_token("a", "b", "AAPL", "individual",
                                      {"status": "flagged", "mismatched": 1})
    _status, body = call({"token": token})
    assert body["revisedAnswer"] == "fixed"
    assert body["verification"]["mismatched"] == 1


def test_the_route_is_registered():
    assert '"/verify"' in inspect.getsource(server.main)


def test_the_prompts_are_not_touched_by_tier_one():
    """Restated here so a Tier 1 change that reaches for a prompt fails in its own
    suite, not only in test_prompts.py."""
    for name in ("ASK_SYSTEM", "EXPLAIN_SYSTEM", "DEFINE_SYSTEM"):
        assert name not in inspect.getsource(rarr)
    assert list(inspect.signature(server.run_agent).parameters) == [
        "prompt", "model", "system_prompt", "max_turns", "label", "allow_web", "budget_usd"]


def test_a_token_is_only_issued_in_on_mode():
    """Issued in handle_ask ONLY when the flag is `on` and Tier 0 flagged."""
    source = inspect.getsource(server.handle_ask)
    assert 'verify.MODE == "on"' in source
    assert 'report.get("status") == "flagged"' in source


# --- deployment surface -------------------------------------------------------
def test_the_heartbeat_proxy_streams_verify():
    import ai_proxy
    assert "/verify" in ai_proxy.STREAM_PATHS


def test_nginx_exposes_verify():
    """`location / { return 404; }` means an unlisted route works locally and 404s
    in production, which is invisible until a user hits it."""
    with open(os.path.join(REPO, "deploy", "nginx.conf"), encoding="utf-8") as fh:
        conf = fh.read()
    assert "location = /verify" in conf
    assert "zone=verify_zone" in conf
    assert "limit_req_zone $client_ip zone=verify_zone" in conf


# --- live backend -------------------------------------------------------------
live = pytest.mark.live


LIVE_TICKER = os.environ.get("RARR_LIVE_TICKER", "AAPL")


def _backend_up() -> bool:
    import requests
    try:
        requests.get(f"{rarr.API_BASE}/api/health", timeout=2).raise_for_status()
        return True
    except Exception:
        return False


def _warm_benchmarks() -> None:
    """The endpoint builds two 30-minute-cached scorecard matrices on a cold
    process and can take well over the module's 6s client timeout the first time.
    Tier 1 correctly gives up in that case, so the live tests warm it first and
    then exercise the real path."""
    import requests
    try:
        requests.get(f"{rarr.API_BASE}/api/individual/{LIVE_TICKER}/benchmarks",
                     timeout=180).raise_for_status()
    except Exception as exc:                    # noqa: BLE001
        pytest.skip(f"benchmarks endpoint unavailable: {type(exc).__name__}")


@live
def test_benchmarks_endpoint_returns_a_flat_metric_map():
    if not _backend_up():
        pytest.skip("backend not running on :8000")
    _warm_benchmarks()
    rarr._bench_cache._data.clear()

    async def main():
        timeout = rarr.aiohttp.ClientTimeout(total=rarr.HTTP_TIMEOUT)
        async with rarr.aiohttp.ClientSession(timeout=timeout) as s:
            return await rarr.benchmarks(s, LIVE_TICKER)
    metrics = asyncio.run(main())
    assert isinstance(metrics, dict) and metrics
    row = next(iter(metrics.values()))
    assert {"label", "unit", "company", "industry", "sector"} <= set(row)


@live
def test_live_benchmarks_produce_company_evidence():
    if not _backend_up():
        pytest.skip("backend not running on :8000")
    _warm_benchmarks()
    rarr._bench_cache._data.clear()

    async def main():
        timeout = rarr.aiohttp.ClientTimeout(total=rarr.HTTP_TIMEOUT)
        async with rarr.aiohttp.ClientSession(timeout=timeout) as s:
            return rarr.evidence_from_benchmarks(await rarr.benchmarks(s, LIVE_TICKER))
    rows = asyncio.run(main())
    assert any(r.role == rarr.COMPANY for r in rows)
    assert any(r.role == rarr.GROUP for r in rows)


@live
def test_live_tier1_reaches_a_verdict_on_a_wrong_figure():
    """End to end against the real endpoint. An obviously wrong figure must come
    back as a minimal substitution or as an honest unresolved, never as a rewrite
    and never as an exception."""
    if not _backend_up():
        pytest.skip("backend not running on :8000")
    _warm_benchmarks()
    rarr._bench_cache._data.clear()
    answer = f"{LIVE_TICKER}'s WACC is 99.90% on the app's own figures."
    out = asyncio.run(rarr.tier1(answer, None, section="individual",
                                 context=LIVE_TICKER, data_context=CTX))
    assert out["status"] in ("revised", "unchanged")
    assert out["researched"]["benchmarks"] > 0
    assert out["edits"] or out["unresolved"] or out["supported"]
    for edit in out["edits"]:
        assert edit["replacement"].endswith("%")
        assert out["revisedAnswer"].count(edit["replacement"]) >= 1
    if not out["edits"]:
        assert out["revisedAnswer"] is None


@live
def test_live_research_skips_beta_for_a_non_beta_claim():
    if not _backend_up():
        pytest.skip("backend not running on :8000")
    _warm_benchmarks()
    rarr._bench_cache._data.clear()
    _ev, reached = asyncio.run(rarr.research("individual", LIVE_TICKER, ["its WACC is"]))
    assert reached["beta"] == 0
