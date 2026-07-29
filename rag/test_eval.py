"""Tests for the answer-verification extractors and graders (RARR Phase 0).

All network-free. The eval package does not run in the request path, so there is
no `live` tier here; the live checks arrive with the eval set in Phase 1.

  python -m pytest rag/test_eval.py -q
"""
from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import safe_math
from eval import extract, graders
from eval.extract import PCT, PP, PLAIN, TIMES, USD, YEAR, ORDINAL

# A realistic blob: WACC is already x100 while Key ratios are raw decimals, which
# is the trap that would otherwise flag half of every individual-page answer.
# Captured VERBATIM from buildDataContext() by running the real TypeScript through
# node. Note `Return On Invested Capital=0.41`: num() defaults to toFixed(2), so a
# raw ratio arrives quantised to 2dp. Do not "tidy" these to more decimals; the
# quantisation is the point, and a fixture with 0.4120 hid a live false positive.
CTX = """AAPL (Apple Inc.), sector Technology
Key ratios: Return On Equity=1.57, Return On Invested Capital=0.41, Gross Margin=0.46
Valuation: DCF intrinsic $185.40, WACC 8.42%, margin of safety -12.30%
Verdict: Quality compounder (quality score 82)
Metrics: Revenue = $391.04B; Operating Income = $123.22B"""


# --- the three local hazards ------------------------------------------------
def test_minus_sign_u2212_is_a_sign_only_before_a_digit():
    """U+2212 is load-bearing in ~234 places in this repo (`ROIC − WACC`). Reading
    it as a sign would invent a negative number in every definition label."""
    assert extract.scan("the ROIC − WACC spread is wide") == []
    toks = extract.scan("a decline of −8.4% this year")
    assert len(toks) == 1
    assert toks[0].value == pytest.approx(-8.4)
    assert toks[0].unit == PCT


def test_en_dash_between_numbers_is_a_range_not_a_subtraction():
    toks = extract.scan("margins of 8–9% are typical")
    assert len(toks) == 1
    assert (toks[0].lo, toks[0].hi) == (8.0, 9.0)
    assert toks[0].hedge == "range"


def test_tight_ascii_hyphen_is_also_a_range():
    """`8-9%` must not scan as 8 plus NEGATIVE 9%. That invented negative is
    exactly the false-positive class the badge cannot afford."""
    toks = extract.scan("margins run 8-9% in a downturn")
    assert len(toks) == 1
    assert (toks[0].lo, toks[0].hi) == (8.0, 9.0)


def test_spaced_hyphen_stays_a_subtraction():
    assert len(extract.scan("the difference 41.2 - 8.42 is wide")) == 2


def test_percent_and_percentage_points_never_compare():
    """A pp delta checked against a pct level would flag every spread in the app."""
    v = [c for c in graders.grade_claims("the spread is 4.55pp", "Fed model: spread 0.45pp")
         if c.token.gradable]
    assert v[0].verdict == graders.MISMATCH
    ok = [c for c in graders.grade_claims("the spread is 0.45pp", "Fed model: spread 0.45pp")
          if c.token.gradable]
    assert ok[0].verdict == graders.MATCH


def test_bps_normalizes_to_pp():
    tok = extract.scan("a 25bps move")[0]
    assert tok.unit == PP
    assert tok.value == pytest.approx(0.25)


# --- formats pinned to the frontend serializer ------------------------------
@pytest.mark.parametrize("text,value,unit,decimals", [
    ("$1.23T", 1.23e12, USD, 2),
    ("$45.6B", 45.6e9, USD, 1),
    ("$789M", 789e6, USD, 0),
    ("$12K", 12e3, USD, 0),
    ("12.34%", 12.34, PCT, 2),
    ("1.23x", 1.23, TIMES, 2),
    ("+1.20pp", 1.20, PP, 2),
    ("+12.3%", 12.3, PCT, 1),
])
def test_scale_suffixes_match_the_frontend_formatter(text, value, unit, decimals):
    """Pinned to fmtVal() in frontend/src/lib/aiDataContext.ts:170-182. If that
    formatter changes, this fails rather than silently mis-parsing."""
    tok = extract.scan(f"the figure is {text} today")[0]
    assert tok.value == pytest.approx(value)
    assert tok.unit == unit
    assert tok.decimals == decimals


# --- things that must never be graded a mismatch ----------------------------
def test_year_is_not_a_quantity():
    assert extract.scan("revenue grew in 2024")[0].unit == YEAR
    assert not extract.scan("revenue grew in 2024")[0].gradable


def test_rank_n_of_m_is_skipped():
    assert all(t.unit == ORDINAL for t in extract.scan("Rank 3 of 11 in the sector"))


def test_filing_forms_and_index_names_are_blanked():
    for noise in ["it filed a 10-K", "a 10-Q in Q3", "see the S&P 500", "per DEF 14A"]:
        assert extract.scan(noise) == [], noise


def test_sources_line_is_excluded_from_the_scan():
    """The Sources line carries chapter numbers, ISBNs and years, and would poison
    every count in the report."""
    body = "WACC is 8.42%.\n\nSources: Books/x/Ch16 - Chapter 15.md, ISBN 9781394262748, 2024"
    assert len(extract.scan(body)) == 1


def test_ordered_list_markers_are_not_claims():
    assert extract.scan("1. First point\n2. Second point") == []


# --- labels -----------------------------------------------------------------
def test_label_window_never_starts_inside_the_previous_number():
    """Without the clamp, `8.42% against a ROIC of 41.2%` labels the second figure
    `42% against a ROIC of`, and the grader matches on its neighbour's digits."""
    toks = extract.scan("WACC is 8.42% against a ROIC of 41.2%")
    assert "42%" not in toks[1].label
    assert "ROIC" in toks[1].label


def test_table_cell_label_is_row_plus_column():
    table = "| Metric | Company |\n| --- | --- |\n| WACC | 8.42% |"
    assert "WACC" in extract.scan(table)[0].label


def test_acronym_alias_reuses_the_retrieval_expansion_map():
    assert graders.label_score("wacc", "weighted average cost of capital") == 1.0


def test_unrelated_labels_do_not_match():
    assert graders.label_score("WACC", "Return On Equity") == 0.0


# --- the scale-equivalence class --------------------------------------------
def test_raw_decimal_context_matches_a_percent_claim():
    """`Key ratios: roic=0.4120` and a claim of `41.2%` are the same number."""
    v = [c for c in graders.grade_claims("ROIC is 41.2%", CTX) if c.token.gradable]
    assert v[0].verdict == graders.MATCH
    assert v[0].scale_adjusted is True


@pytest.mark.parametrize("claim", ["41.2%", "40.7%", "41.0%", "0.41"])
def test_context_quantisation_is_absorbed_not_flagged(claim):
    """`num()` writes a raw ratio at 2dp, so `Return On Invested Capital=0.41`
    means the true value is anywhere in [0.405, 0.415]. Read through the x100
    scale-equivalence that is +/-0.5 PERCENTAGE POINTS, and a correct claim of
    41.2% would be flagged if only the claim's own precision were considered."""
    v = [c for c in graders.grade_claims(f"ROIC is {claim}", CTX) if c.token.gradable]
    assert v[0].verdict == graders.MATCH, f"{claim} flagged against a 2dp context"


def test_context_quantisation_does_not_excuse_a_far_wrong_number():
    """The widened band must stay narrow enough to catch a real error."""
    v = [c for c in graders.grade_claims("ROIC is 44.0%", CTX) if c.token.gradable]
    assert v[0].verdict == graders.MISMATCH


def test_scale_equivalence_does_not_excuse_a_wrong_number():
    v = [c for c in graders.grade_claims("ROIC is 38.5%", CTX) if c.token.gradable]
    assert v[0].verdict == graders.MISMATCH


def test_mismatch_reports_the_figure_in_the_claims_own_units():
    """Showing "stated 38.5% vs page data 0.412" reads as a unit bug, not a
    disagreement."""
    v = [c for c in graders.grade_claims("ROIC is 38.5%", CTX) if c.token.gradable]
    assert v[0].expected == pytest.approx(41.0)   # 0.41 rescaled, not the raw 0.41


# --- tolerance --------------------------------------------------------------
def test_tolerance_is_half_a_unit_in_the_last_written_place():
    """The model's precision is its claim of precision."""
    ctx = "Valuation: WACC 8.42%"
    assert [c for c in graders.grade_claims("WACC is 8%", ctx)
            if c.token.gradable][0].verdict == graders.MATCH
    assert [c for c in graders.grade_claims("WACC is 8.90%", ctx)
            if c.token.gradable][0].verdict == graders.MISMATCH


def test_hedged_claim_is_absorbed():
    v = [c for c in graders.grade_claims("WACC is about 8.4%", "Valuation: WACC 8.42%")
         if c.token.gradable]
    assert v[0].verdict == graders.MATCH


def test_over_and_under_are_inequalities():
    ctx = "Metrics: Interest Coverage = 25.30x"
    assert [c for c in graders.grade_claims("coverage is above 20x", ctx)
            if c.token.gradable][0].verdict == graders.MATCH
    assert [c for c in graders.grade_claims("coverage is above 40x", ctx)
            if c.token.gradable][0].verdict == graders.MISMATCH


# --- the false-positive guard, the most important property here -------------
def test_unlabeled_figure_is_unsupported_not_mismatch():
    """The prompt explicitly permits vault, web and general-knowledge figures, so
    most numbers in a good answer SHOULD be ungraded."""
    r = graders.report(
        "The risk-free rate is 4.28% and peers trade at 24x earnings.", CTX)
    assert r["mismatched"] == 0
    # Silent by either route: unsupported (no label match) or ungraded (the clause
    # attributes the figure elsewhere, e.g. "peers trade at"). Both are correct;
    # only a mismatch would be a defect.
    assert r["bound"] == 0


def test_a_correct_answer_produces_no_flags():
    answer = ("Apple's WACC is 8.42%, ROIC is 41.2%, DCF intrinsic value is $185.40 "
              "per share, margin of safety is -12.30%, and revenue was $391.04B.")
    r = graders.report(answer, CTX)
    assert r["mismatched"] == 0
    assert r["numeric_fidelity"] == 1.0


def test_empty_and_missing_context_never_flags():
    for ctx in ("", None):
        assert graders.report("WACC is 8.42%.", ctx or "")["mismatched"] == 0


# --- arithmetic -------------------------------------------------------------
def test_arithmetic_error_is_caught():
    bad = [a for a in graders.grade_arithmetic("the spread is 41.2 - 8.42 = 35.10") if not a.ok]
    assert len(bad) == 1
    assert bad[0].computed == pytest.approx(32.78)


def test_correct_arithmetic_passes():
    assert all(a.ok for a in graders.grade_arithmetic("the spread is 41.2 - 8.42 = 32.78"))


def test_display_equation_names_its_result_on_the_left():
    """`Spread = 41.2 − 8.42 = 32.78` computes the SECOND-TO-LAST segment. Splitting
    on the final `=` alone leaves "Spread =" in the expression and it never evaluates."""
    d = extract.derivations("`Spread = 41.2 − 8.42 = 32.78`")
    assert len(d) == 1
    assert d[0].lhs.strip() == "41.2 − 8.42"


def test_a_derivation_is_reported_once():
    assert len(extract.derivations("`Spread = 41.2 − 8.42 = 32.78`")) == 1


def test_growth_restatement_is_checked():
    ok = graders.grade_arithmetic("revenue rose from 383.3 to 391.0, up 2.0%")
    assert ok and all(a.ok for a in ok)
    bad = graders.grade_arithmetic("revenue rose from 383.3 to 391.0, up 12.0%")
    assert any(not a.ok for a in bad)


def test_unit_incompatible_arithmetic_is_skipped_not_failed():
    assert all(a.ok for a in graders.grade_arithmetic("$4.2B - 8.42% = 3.1"))


def test_self_contradiction_between_prose_and_table():
    answer = ("The WACC is 8.42%.\n\n| Metric | Value |\n| --- | --- |\n| WACC | 9.90% |")
    assert graders.self_contradictions(answer)


# --- totality ---------------------------------------------------------------
@pytest.mark.parametrize("junk", [
    "", "   ", "|||", "| a |\n| --- |", "`unclosed", "###", "1.2.3.4.5",
    "$$$", "%%%", "− − −", "\n\n\n", "0" * 5000, "= = =", "12,,,34",
])
def test_grading_never_raises_on_garbage(junk):
    graders.report(junk, CTX)
    graders.report("WACC is 8.42%", junk)


def test_grading_is_fast_enough():
    """Tier 0 runs inline in the request path, so it has to be free."""
    import time
    answer = ("Apple's WACC is 8.42% and ROIC is 41.2%. " * 2000)
    t0 = time.time()
    graders.report(answer, CTX)
    assert time.time() - t0 < 2.0


# --- the grader's own smoke alarm -------------------------------------------
def test_grader_rejects_corrupted_answers():
    """Perturb every bound number, flip an operator, and assert the scores
    collapse. If the grader scores garbage highly, every downstream number in this
    project is fiction."""
    good = ("WACC is 8.42%, ROIC is 41.2%, DCF intrinsic value is $185.40, "
            "margin of safety is -12.30%, revenue was $391.04B.")
    corrupt = ("WACC is 15.90%, ROIC is 12.7%, DCF intrinsic value is $402.10, "
               "margin of safety is 55.40%, revenue was $118.00B.")
    assert graders.report(good, CTX)["numeric_fidelity"] == 1.0
    assert graders.report(corrupt, CTX)["numeric_fidelity"] == 0.0
    assert graders.report(corrupt, CTX)["mismatched"] >= 5


# --- safe_math, hostile suite -----------------------------------------------
@pytest.mark.parametrize("expr", [
    "__import__('os').system('echo pwned')",
    "().__class__.__bases__[0].__subclasses__()",
    "(1).__class__",
    "9**9**9",
    "2**10**10",
    "1/0",
    "'a'*10**9",
    "[i for i in range(10**9)]",
    "lambda: 1",
    "open('x')",
    "exec('x=1')",
    "eval('1+1')",
    "x := 1",
    "1 if True else 2",
    "{}",
    "1 and 2",
    "1 < 2",
    "0" * 600,
    "((((((((((1))))))))))" * 40,
])
def test_evaluator_rejects_hostile_input(expr):
    """Must return an error string. Never raise, never execute."""
    value, err = safe_math.evaluate(expr)
    assert value is None
    assert err


@pytest.mark.parametrize("expr,want", [
    ("(0.142 - 0.084) * 100", 5.8),
    ("41.2 − 8.42", 32.78),
    ("123.22 ÷ 391.04", 0.31510842880523733),
    ("2 × 3", 6),
    ("1,234 + 1", 1235),
    ("sqrt(16)", 4),
    ("round(3.14159, 2)", 3.14),
    ("max(1, 2, 3)", 3),
    ("abs(-5)", 5),
    ("2**10", 1024),
])
def test_evaluator_computes_valid_expressions(expr, want):
    value, err = safe_math.evaluate(expr)
    assert err is None
    assert value == pytest.approx(want)


def test_evaluator_handles_the_house_unicode_operators():
    """The app writes ÷ × − (U+2212) in prose and definition labels."""
    assert safe_math.evaluate("10 − 4")[0] == pytest.approx(6)
    assert safe_math.evaluate("10 ÷ 4")[0] == pytest.approx(2.5)
    assert safe_math.evaluate("10 × 4")[0] == pytest.approx(40)


# --- constants are measured, not chosen -------------------------------------
def test_tolerance_constants_are_documented_as_provisional():
    """These are set defensibly but NOT yet calibrated. verify_calibrate.py sweeps
    them against real exported answers targeting zero false-positive mismatches,
    after which this test pins the measured values and records the alternatives."""
    assert graders.REL_FLOOR == 0.002
    assert graders.HEDGE_REL == 0.05
    assert graders.LABEL_MIN == 0.34
