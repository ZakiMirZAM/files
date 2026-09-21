"""Tests for ranks.py: percentile rank + cross-industry medians."""

from industry_structure.ranks import (
    percentile_rank,
    build_cross_industry_medians,
)


class TestPercentileRank:

    def test_midpoint_ties(self):
        vals = [1.0, 2.0, 2.0, 3.0, 4.0]
        assert abs(percentile_rank(2.0, vals) - 0.4) < 1e-6

    def test_lowest_value(self):
        vals = [1.0, 2.0, 3.0, 4.0, 5.0]
        assert abs(percentile_rank(1.0, vals) - 0.1) < 1e-6

    def test_highest_value(self):
        vals = [1.0, 2.0, 3.0, 4.0, 5.0]
        assert abs(percentile_rank(5.0, vals) - 0.9) < 1e-6

    def test_all_equal(self):
        vals = [3.0, 3.0, 3.0]
        assert abs(percentile_rank(3.0, vals) - 0.5) < 1e-6

    def test_ten_firm_floor_in_cross_medians(self, conn_multi):
        medians = build_cross_industry_medians(conn_multi, 2024)
        assert "Alpha" not in medians
        assert "Industry0" in medians
