"""Characterization tests for group_scoring.py (sector/industry scorecard value
score + integrity checks).

Network-free and DB-free: score_groups works on plain aggregated-column dicts
(display units, percents ×100) and build_group_integrity on plain by-year dicts
(stored-column decimals), exactly as the api.py call sites supply them.

Run:  cd backend && python -m pytest test_group_scoring.py -q
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "data"))

import group_scoring as gs  # noqa: E402


# ── Fixtures: matrix columns in DISPLAY units ────────────────────────────────

def _strong_col() -> dict:
    """A quality sector column: wide spread, real EVA margin, cash-backed."""
    return {
        "roicWaccSpread": 12.0, "evaMargin": 6.0, "excessReturnEquity": 10.0,
        "wacc": 7.0, "fcfToNetIncome": 1.1, "dupontEbitMargin": 24.0,
        "actualPB": 3.0, "justifiedPB": 3.2, "revenueGrowth": 9.0,
        "netDebtToOcf": 1.0, "netMargin": 15.0, "netInterestMargin": None,
    }


def _weak_col() -> dict:
    """A weak column: negative spread, value-destructive, levered, rich."""
    return {
        "roicWaccSpread": -3.0, "evaMargin": -2.0, "excessReturnEquity": -4.0,
        "wacc": 10.5, "fcfToNetIncome": 0.3, "dupontEbitMargin": 4.0,
        "actualPB": 4.0, "justifiedPB": 1.5, "revenueGrowth": 2.0,
        "netDebtToOcf": 6.0, "netMargin": 2.0, "netInterestMargin": None,
    }


def _mid_col() -> dict:
    return {
        "roicWaccSpread": 4.0, "evaMargin": 1.5, "excessReturnEquity": 3.0,
        "wacc": 8.5, "fcfToNetIncome": 0.8, "dupontEbitMargin": 12.0,
        "actualPB": 2.0, "justifiedPB": 2.0, "revenueGrowth": 6.0,
        "netDebtToOcf": 3.0, "netMargin": 8.0, "netInterestMargin": None,
    }


# ── Curves: display-unit calibration (the unit trap) ─────────────────────────

def test_spread_curve_is_in_display_units():
    # 15 DISPLAY points of spread must score near the top of the curve; 1.5
    # points (which would be 15pp if decimals were mistakenly passed as
    # percents) must not. Guards the percent-vs-decimal trap.
    hi = gs._level_score("roicWaccSpread", 15.0)
    lo = gs._level_score("roicWaccSpread", 1.5)
    assert hi is not None and hi >= 90.0
    assert lo is not None and lo < 40.0


def test_curves_monotonic():
    for metric, anchors in gs.GROUP_METRIC_CURVES.items():
        levels = [a[0] for a in anchors]
        scores = [a[1] for a in anchors]
        assert levels == sorted(levels), f"{metric} anchors not sorted"
        if metric in gs._LOWER_IS_BETTER:
            assert scores == sorted(scores, reverse=True), f"{metric} not decreasing"
        else:
            assert scores == sorted(scores), f"{metric} not increasing"


def test_lower_is_better_inversion():
    # A 7% WACC must outscore an 11% one; 1x net debt/OCF must outscore 6x.
    assert gs._level_score("wacc", 7.0) > gs._level_score("wacc", 11.0)
    assert gs._level_score("netDebtToOcf", 1.0) > gs._level_score("netDebtToOcf", 6.0)
    assert gs._level_score("pbGap", -1.0) > gs._level_score("pbGap", 1.0)


def test_eva_margin_and_spread_agree_directionally():
    strong = gs.scoring_inputs(_strong_col())
    weak = gs.scoring_inputs(_weak_col())
    for metric in ("roicWaccSpread", "evaMargin"):
        assert gs._level_score(metric, strong[metric]) > gs._level_score(metric, weak[metric])


def test_pb_gap_derived_from_actual_minus_justified():
    inputs = gs.scoring_inputs(_weak_col())
    assert inputs["pbGap"] == 4.0 - 1.5
    # Missing either side → None, not a fabricated 0.
    col = _weak_col()
    col["justifiedPB"] = None
    assert gs.scoring_inputs(col)["pbGap"] is None


# ── score_groups ─────────────────────────────────────────────────────────────

def test_strong_outscores_mid_outscores_weak():
    scores = gs.score_groups(
        {"Strong": _strong_col(), "Mid": _mid_col(), "Weak": _weak_col()}
    )
    assert scores["Strong"] > scores["Mid"] > scores["Weak"]
    assert scores["Strong"] > 60.0


def test_negative_core_profit_capped():
    scores = gs.score_groups({"Weak": _weak_col(), "Strong": _strong_col()})
    assert scores["Weak"] <= gs.NEG_PROFIT_CAP


def test_financials_profile_not_capped_on_spread():
    # A Financial Services group with a negative (structurally meaningless)
    # spread but a strong equity-side excess return must NOT be capped under
    # its own profile, but IS capped under the default profile.
    fin = {
        "roicWaccSpread": -2.0, "evaMargin": None, "excessReturnEquity": 6.0,
        "wacc": None, "fcfToNetIncome": None, "dupontEbitMargin": 30.0,
        "actualPB": 1.2, "justifiedPB": 1.6, "revenueGrowth": 7.0,
        "netDebtToOcf": None, "netMargin": 22.0, "netInterestMargin": 3.2,
    }
    peer = dict(fin, excessReturnEquity=1.0, netInterestMargin=2.0, netMargin=10.0)
    fin_scores = gs.score_groups({"Banks": fin, "Insurers": peer},
                                 sector="Financial Services")
    assert fin_scores["Banks"] > gs.NEG_PROFIT_CAP
    default_scores = gs.score_groups({"Banks": fin, "Insurers": peer})
    assert default_scores["Banks"] <= gs.NEG_PROFIT_CAP


def test_coverage_floor_sinks_sparse_column():
    sparse = {k: None for k in _strong_col()}
    sparse["revenueGrowth"] = 8.0  # 1.0 of 15.0 total weight — below the floor
    scores = gs.score_groups({"Sparse": sparse, "Full": _strong_col()})
    assert scores["Sparse"] == 0.0
    assert scores["Full"] > 0.0


def test_single_group_returns_zero():
    assert gs.score_groups({"Only": _strong_col()}) == {"Only": 0.0}


def test_rank_groups_deterministic_ties():
    ranks = gs.rank_groups({"B": 50.0, "A": 50.0, "C": 70.0})
    assert ranks == {"C": 1, "A": 2, "B": 3}


def test_sector_by_group_profiles_apply_per_column():
    # The same column data scores differently under the Financial Services
    # profile than under the default profile (spread excluded there).
    col = dict(_weak_col(), netInterestMargin=3.0)
    both = gs.score_groups(
        {"Financial Services": dict(col), "Technology": dict(col)},
        sector_by_group={"Financial Services": "Financial Services",
                         "Technology": "Technology"},
    )
    assert both["Financial Services"] != both["Technology"]


# ── Integrity checks: by-year DECIMAL fixtures ───────────────────────────────

def _years(rows: dict[int, dict]) -> dict[int, dict]:
    for r in rows.values():
        r.setdefault("_ticker_count", 50)
    return rows


def _clean_by_year() -> dict[int, dict]:
    """Six steady years: nothing should fire."""
    out = {}
    for i, y in enumerate(range(2020, 2026)):
        out[y] = {
            "Total Other Income Expenses Net": 5.0, "Income Before Tax": 100.0,
            "Income Quality": 1.1, "Operating Income Ratio": 0.18 + 0.002 * i,
            "Operating Income": 90.0 + 2 * i, "Tax Burden": 0.79,
            "Gross Profit Ratio": 0.40 + 0.002 * i, "Goodwill": 200.0,
            "Net Income Growth": 0.08, "Deferred Revenue": 50.0 + i,
            "Revenue Growth": 0.07, "Receivables Growth": 0.08,
            "ROE": 0.16, "ROA": 0.07, "ROIC": 0.12, "Net Income": 70.0 + 2 * i,
            "Financial Leverage": 2.3,
        }
    return _years(out)


def _fire(check_list, check_id):
    return next(c for c in check_list if c["id"] == check_id)


def test_clean_history_fires_nothing():
    checks = gs.build_group_integrity("Clean", _clean_by_year())
    tripped = [c for c in checks if c["severity"] in ("medium", "high")]
    assert tripped == [], [c["id"] for c in tripped]


def test_nonop_income_share_fires():
    by = _clean_by_year()
    by[2025]["Total Other Income Expenses Net"] = 30.0   # 30% of pretax
    c = _fire(gs.build_group_integrity("G", by), "nonop_income_share")
    assert c["severity"] == "medium"
    by[2025]["Total Other Income Expenses Net"] = 45.0   # 45% → high (2x escalation)
    c = _fire(gs.build_group_integrity("G", by), "nonop_income_share")
    assert c["severity"] == "high"


def test_ocf_ni_fires_below_floor_and_bad():
    by = _clean_by_year()
    by[2025]["Income Quality"] = 0.7
    assert _fire(gs.build_group_integrity("G", by), "ocf_ni")["severity"] == "medium"
    by[2025]["Income Quality"] = 0.4
    assert _fire(gs.build_group_integrity("G", by), "ocf_ni")["severity"] == "high"


def test_margin_vs_median_fires():
    by = _clean_by_year()
    by[2025]["Operating Income Ratio"] = 0.32   # ~13ppt above ~0.185 median
    assert _fire(gs.build_group_integrity("G", by), "margin_vs_median")["severity"] == "medium"


def test_tax_windfall_fires():
    by = _clean_by_year()
    by[2025]["Tax Burden"] = 0.95   # kept 95% of pretax vs 0.79 norm
    assert _fire(gs.build_group_integrity("G", by), "tax_windfall")["severity"] == "medium"


def test_gm_swing_fires():
    by = _clean_by_year()
    by[2025]["Gross Profit Ratio"] = by[2024]["Gross Profit Ratio"] + 0.07
    assert _fire(gs.build_group_integrity("G", by), "gm_swing")["severity"] == "medium"


def test_goodwill_base_effect_fires():
    by = _clean_by_year()
    by[2024]["Goodwill"] = 150.0        # −25% write-down into 2024
    by[2025]["Net Income Growth"] = 0.40  # then a profit rebound
    assert _fire(gs.build_group_integrity("G", by), "goodwill_base_effect")["severity"] in ("medium", "high")


def test_ebit_cv_fires_on_lumpy_earnings():
    # Boom-bust growth (−40%, +117%, −46%, +100%, −43%) = cyclical, fires.
    by = _clean_by_year()
    lumpy = [100.0, 60.0, 130.0, 70.0, 140.0, 80.0]
    for y, v in zip(sorted(by), lumpy):
        by[y]["Operating Income"] = v
    assert _fire(gs.build_group_integrity("G", by), "ebit_cv")["severity"] in ("medium", "high")


def test_ebit_cv_ignores_steady_growth():
    # A fast but STEADY grower (+20% every year) must NOT read as lumpy —
    # this is the level-CV trap the growth-rate measure exists to avoid.
    by = _clean_by_year()
    v = 50.0
    for y in sorted(by):
        by[y]["Operating Income"] = v
        v *= 1.20
    assert _fire(gs.build_group_integrity("G", by), "ebit_cv")["severity"] == "ok"


def test_deferred_rev_drawdown_fires():
    by = _clean_by_year()
    by[2025]["Deferred Revenue"] = by[2024]["Deferred Revenue"] * 0.8  # −20%
    assert _fire(gs.build_group_integrity("G", by), "deferred_rev_drawdown")["severity"] in ("medium", "high")


def test_base_year_growth_fires_off_negative_base():
    by = _clean_by_year()
    by[2024]["Net Income"] = -10.0
    by[2025]["Net Income Growth"] = 2.5
    assert _fire(gs.build_group_integrity("G", by), "base_year_growth")["severity"] == "medium"


def test_receivables_vs_revenue_fires():
    by = _clean_by_year()
    by[2025]["Receivables Growth"] = 0.25   # 18ppt above revenue growth
    assert _fire(gs.build_group_integrity("G", by), "receivables_vs_revenue")["severity"] == "medium"


def test_leverage_roe_fires_the_2017_pattern():
    # ROE jumps 30ppt while ROA falls: the Consumer Cyclical 2017 signature.
    by = _clean_by_year()
    by[2024]["ROE"], by[2024]["ROA"] = 0.23, 0.085
    by[2025]["ROE"], by[2025]["ROA"] = 0.53, 0.074
    by[2025]["Financial Leverage"] = 6.6
    c = _fire(gs.build_group_integrity("G", by), "leverage_roe")
    assert c["severity"] in ("medium", "high")


def test_leverage_roe_skipped_for_equity_lens():
    by = _clean_by_year()
    by[2025]["ROE"], by[2025]["ROA"] = 0.53, 0.01
    by[2025]["Financial Leverage"] = 12.0
    c = _fire(gs.build_group_integrity("G", by, equity_lens=True), "leverage_roe")
    assert c["severity"] == "na"


def test_roe_roic_sign_disagreement_fires_high():
    by = _clean_by_year()
    by[2025]["ROE"], by[2025]["ROIC"] = -0.09, 0.15   # 2018 Consumer Cyclical
    assert _fire(gs.build_group_integrity("G", by), "roe_roic_sign")["severity"] == "high"


def test_top5_concentration_fires():
    by = _clean_by_year()
    comps = [{"_mc": 900.0}] * 5 + [{"_mc": 10.0}] * 20   # top-5 ≈ 96%
    c = _fire(gs.build_group_integrity("G", by, comps=comps), "top5_concentration")
    assert c["severity"] in ("medium", "high")
    even = [{"_mc": 100.0}] * 20
    c = _fire(gs.build_group_integrity("G", by, comps=even), "top5_concentration")
    assert c["severity"] == "ok"


def test_composition_drift_fires():
    by = _clean_by_year()
    for y in by:
        by[y]["_ticker_count"] = 900
    by[2025]["_ticker_count"] = 1200   # +33% in one year
    assert _fire(gs.build_group_integrity("G", by), "composition_drift")["severity"] == "medium"


def test_composition_drift_catches_cumulative_two_year_creep():
    # 910 -> 1057 -> 1192: each step under the 25% bar, the two-year drift over
    # it (the Financial Services 2023-2025 pattern).
    by = _clean_by_year()
    for y in by:
        by[y]["_ticker_count"] = 910
    by[2024]["_ticker_count"] = 1057
    by[2025]["_ticker_count"] = 1192
    assert _fire(gs.build_group_integrity("G", by), "composition_drift")["severity"] == "medium"


def test_leverage_roe_fires_on_leverage_jump_alone():
    # Even with the ROE mean unusable (poisoned by negative-equity outliers),
    # the equity-multiplier jump plus a falling ROA still catches the pattern.
    by = _clean_by_year()
    for y in by:
        by[y]["ROE"] = None
    by[2024]["ROA"], by[2025]["ROA"] = 0.085, 0.074
    by[2024]["Financial Leverage"], by[2025]["Financial Leverage"] = 4.9, 6.6
    c = _fire(gs.build_group_integrity("G", by), "leverage_roe")
    assert c["severity"] == "medium"


def test_receivables_gap_na_on_implausible_aggregate():
    by = _clean_by_year()
    by[2025]["Receivables Growth"] = 60.0   # +6000%: small-base artifact
    assert _fire(gs.build_group_integrity("G", by), "receivables_vs_revenue")["severity"] == "na"


def test_gm_swing_na_when_universe_shifts():
    by = _clean_by_year()
    by[2025]["Gross Profit Ratio"] = by[2024]["Gross Profit Ratio"] + 0.07
    by[2024]["_ticker_count"], by[2025]["_ticker_count"] = 50, 65   # +30% universe
    assert _fire(gs.build_group_integrity("G", by), "gm_swing")["severity"] == "na"


def test_plausibility_bounds_flags_pinned_aggregates():
    by = _clean_by_year()
    col = {"netDebtToOcf": 25.0, "roic": 8.0}
    clip = {"netDebtToOcf": (-10.0, 25.0), "roic": (-100.0, 200.0)}
    c = _fire(gs.build_group_integrity("G", by, matrix_col=col, clip=clip),
              "plausibility_bounds")
    assert c["severity"] == "medium"
    assert "netDebtToOcf" in c["detail"]


def test_rank_3y_median_flags_one_hot_year():
    peers = {}
    for name, roics in {
        "Hot":    [0.02, 0.03, 0.25],   # one hot year vaults it to #1
        "SteadyA": [0.14, 0.14, 0.14],
        "SteadyB": [0.12, 0.12, 0.12],
        "SteadyC": [0.10, 0.10, 0.10],
        "SteadyD": [0.09, 0.09, 0.09],
        "SteadyE": [0.08, 0.08, 0.08],
    }.items():
        peers[name] = _years({
            2023 + i: {"ROIC": v, "_ticker_count": 40} for i, v in enumerate(roics)
        })
    c = _fire(gs.build_group_integrity("Hot", peers["Hot"], peers_by_year=peers),
              "rank_3y_median")
    assert c["severity"] == "medium"


def test_trailing_partial_year_is_ignored():
    # A half-filed trailing fiscal year (count collapses to <60% of prior)
    # must not become "this year" — the filing calendar is not a signal.
    by = _clean_by_year()
    by[2026] = dict(by[2025])
    by[2026]["_ticker_count"] = 15          # 30% of the 50-company universe
    by[2026]["Gross Profit Ratio"] = 0.60   # would trip gm_swing if read
    checks = gs.build_group_integrity("G", by)
    assert _fire(checks, "gm_swing")["severity"] == "ok"
    tripped = [c for c in checks if c["severity"] in ("medium", "high")]
    assert tripped == []


def test_missing_inputs_report_na_not_crash():
    by = _years({2025: {"_ticker_count": 40}})
    checks = gs.build_group_integrity("Thin", by)
    assert all(c["severity"] in ("ok", "na") for c in checks)
    assert {c["id"] for c in checks} == set(gs.QUESTIONS)


def test_every_check_has_humanized_question():
    # Standing answerable questions: detailed, group-named, no em dashes, no
    # curly quotes, and the group interpolated for pronoun clarity.
    by = _clean_by_year()
    checks = gs.build_group_integrity("Technology", by)
    for c in checks:
        q = c["question"]
        assert q.endswith("?")
        assert "—" not in q and "–" not in q     # no em/en dashes (repo copy rule)
        assert "“" not in q and "”" not in q     # no curly quotes
        assert "Technology" in q                  # group interpolated (pronoun clarity)
        assert 40 <= len(q) <= 260                # detailed, not terse
        assert "tier" in c and c["tier"] in (
            gs.TIER_ONE_TIME, gs.TIER_AVERAGING)


def test_all_sixteen_checks_always_present_and_answerable():
    # The deck is a STANDING deck: every check returns every call, whatever the
    # data, each with a question + tier + detail so it can render as a text box.
    for by in (_clean_by_year(), _years({2025: {"_ticker_count": 40}})):
        checks = gs.build_group_integrity("Energy", by)
        assert len(checks) == 16
        assert {c["id"] for c in checks} == set(gs.QUESTIONS)
        for c in checks:
            assert c["question"] and c["tier"] and c["detail"]
            assert "Energy" in c["question"]


def test_details_have_no_em_dashes():
    # The supporting note (shown as the question hint) must also be clean copy.
    by = _clean_by_year()
    by[2025]["Income Quality"] = 0.4          # trip a couple so fired details render
    by[2025]["Tax Burden"] = 0.95
    for c in gs.build_group_integrity("Healthcare", by):
        assert "—" not in (c["detail"] or "") and "–" not in (c["detail"] or "")


def test_fired_orders_worst_first():
    checks = [
        {"id": "a", "severity": "ok"},
        {"id": "b", "severity": "medium"},
        {"id": "c", "severity": "high"},
        {"id": "d", "severity": "na"},
    ]
    assert [c["id"] for c in gs.fired(checks)] == ["c", "b"]
