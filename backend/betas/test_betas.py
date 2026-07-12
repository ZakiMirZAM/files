"""
Network-free tests for the bottom-up beta engine.

The first block replicates Damodaran's own worked examples from Investment
Valuation Ch. 8 to the book's printed precision — these are the ground truth
for the formula layer. Later blocks cover the weighting helpers and guards.

Run:  cd backend && python -m pytest betas/test_betas.py -q
"""

from __future__ import annotations

import pytest

from betas.formulas import (
    SegmentWeight,
    average_beta_std_error,
    cash_correct,
    clamp_beta,
    ev_sales_weights,
    op_leverage_apply,
    op_leverage_strip,
    relever_beta,
    revenue_weights,
    unlever_beta,
    weighted_unlevered_beta,
)


# ── Chapter 8 worked examples (book-printed numbers) ─────────────────────────

class TestChapter8WorkedExamples:
    def test_boeing_2000_relever(self):
        """Illustration 8.5: βu 0.80, D/E 14.22%, t 35% -> βL ≈ 0.874."""
        assert relever_beta(0.80, 0.1422, 0.35) == pytest.approx(0.874, abs=0.001)

    def test_embraer_2008_relever(self):
        """Illustration 8.10: βu 0.60, D/E 26.84%, t 34% -> βL ≈ 0.707."""
        assert relever_beta(0.60, 0.2684, 0.34) == pytest.approx(0.707, abs=0.001)

    def test_vans_shoes_2001_operating_leverage(self):
        """Illustration 8.4: industry βL 1.60 (D/E 25.28%, t 25.95%) ->
        unlever -> strip industry FC/VC 52.48% -> apply Vans FC/VC 31.16%
        -> relever at Vans D/E 9.41%, t 34.06% -> βL ≈ 1.23."""
        bu_industry = unlever_beta(1.60, 0.2528, 0.2595)
        bu_business = op_leverage_strip(bu_industry, 0.5248)
        bu_vans = op_leverage_apply(bu_business, 0.3116)
        bl_vans = relever_beta(bu_vans, 0.0941, 0.3406)
        assert bl_vans == pytest.approx(1.23, abs=0.005)

    def test_titan_cement_2000(self):
        """Illustration 8.6: 108 comparables βL 0.99 (D/E 27.06%, t 34.2%) ->
        unlever -> relever at Titan D/E 2.36%, t 24.14% -> βL ≈ 0.85."""
        bu = unlever_beta(0.99, 0.2706, 0.342)
        bl = relever_beta(bu, 0.0236, 0.2414)
        assert bl == pytest.approx(0.855, abs=0.005)

    def test_boeing_mcdonnell_merger(self):
        """Illustration 8.7: value-weighted merge βu 0.809 -> relever at
        combined D/E 7.05%, t 35% -> βL ≈ 0.846."""
        bu = (42.5 * 0.80 + 12.555 * 0.85) / (42.5 + 12.555)
        assert bu == pytest.approx(0.809, abs=0.005)
        assert relever_beta(bu, 0.0705, 0.35) == pytest.approx(0.846, abs=0.005)

    def test_cash_correction(self):
        """Ch. 8 sector example: βu 1.00 with cash 10% of firm value ->
        business beta 1.00 / 0.90 ≈ 1.11."""
        assert cash_correct(1.00, 0.10) == pytest.approx(1.111, abs=0.001)

    def test_unlever_relever_round_trip(self):
        bl = 1.37
        bu = unlever_beta(bl, 0.42, 0.21)
        assert relever_beta(bu, 0.42, 0.21) == pytest.approx(bl, abs=1e-12)

    def test_standard_error_shrinks_by_sqrt_n(self):
        """SE(avg of 100 firms at SE 0.50) = 0.05 — the book's own example."""
        assert average_beta_std_error(0.50, 100) == pytest.approx(0.05, abs=1e-12)


# ── Weighting helpers ─────────────────────────────────────────────────────────

class TestWeights:
    def test_ev_sales_weights_two_segments(self):
        """Value weights follow revenue x EV/Sales, not raw revenue."""
        w = ev_sales_weights([("cloud", 100.0, 8.0), ("hardware", 300.0, 1.0)])
        by = {s.segment: s.weight for s in w}
        assert by["cloud"] == pytest.approx(800 / 1100)
        assert by["hardware"] == pytest.approx(300 / 1100)
        assert sum(by.values()) == pytest.approx(1.0)

    def test_ev_sales_weights_drops_nonpositive(self):
        w = ev_sales_weights([("a", 100.0, 2.0), ("elim", -25.0, 2.0), ("b", 0.0, 3.0)])
        assert [s.segment for s in w] == ["a"]
        assert w[0].weight == pytest.approx(1.0)

    def test_revenue_weights(self):
        w = revenue_weights([("a", 60.0), ("b", 40.0)])
        by = {s.segment: s.weight for s in w}
        assert by == {"a": pytest.approx(0.6), "b": pytest.approx(0.4)}

    def test_weighted_unlevered_beta(self):
        weights = [SegmentWeight("a", 0.7359), SegmentWeight("b", 0.2641)]
        assert weighted_unlevered_beta(weights, {"a": 0.80, "b": 0.80}) == pytest.approx(0.80)

    def test_weighted_unlevered_beta_missing_beta_returns_none(self):
        weights = [SegmentWeight("a", 0.5), SegmentWeight("b", 0.5)]
        assert weighted_unlevered_beta(weights, {"a": 1.1}) is None

    def test_empty_weights_return_none_or_empty(self):
        assert ev_sales_weights([]) == []
        assert revenue_weights([]) == []
        assert weighted_unlevered_beta([], {}) is None


# ── Guards ────────────────────────────────────────────────────────────────────

class TestGuards:
    def test_clamp_low(self):
        v, clamped = clamp_beta(0.05)
        assert (v, clamped) == (0.2, True)

    def test_clamp_high(self):
        v, clamped = clamp_beta(4.2)
        assert (v, clamped) == (3.0, True)

    def test_clamp_passthrough(self):
        v, clamped = clamp_beta(1.18)
        assert (v, clamped) == (1.18, False)

    def test_cash_correct_rejects_bad_fraction(self):
        with pytest.raises(ValueError):
            cash_correct(1.0, 1.0)
        with pytest.raises(ValueError):
            cash_correct(1.0, -0.1)
