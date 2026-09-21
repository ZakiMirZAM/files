"""Tests for strategic groups, share return, quadratic fit, Pearson, dimensions."""

import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from industry_structure.groups import (
    build_strategic_groups,
    build_share_return,
    pearson_correlation,
    _quadratic_fit,
)


class TestStrategicGroups:

    def test_basic_output(self, conn):
        result = build_strategic_groups(conn, "Alpha")
        assert result.get("applicable") is True
        assert len(result["firms"]) == 4
        assert "groups" in result
        assert "axisCorrelation" in result
        assert "axes" in result
        assert "defaultAxes" in result

    def test_axis_correlation(self):
        x = [1.0, 2.0, 3.0, 4.0, 5.0]
        y = [2.0, 4.0, 6.0, 8.0, 10.0]
        assert abs(pearson_correlation(x, y) - 1.0) < 1e-6


class TestShareReturn:

    def test_basic_output(self, conn):
        result = build_share_return(conn, "Alpha")
        assert result.get("applicable") is True
        assert len(result["points"]) == 4
        assert "topQuarterMedianPreTaxRoic" in result
        assert "restMedianPreTaxRoic" in result


class TestQuadraticFit:

    def test_recovers_planted_coefficients(self):
        x = [float(i) for i in range(20)]
        y = [2 * xi ** 2 - 3 * xi + 1 for xi in x]
        result = _quadratic_fit(x, y)
        assert result is not None
        a, b, c = result["coefficients"]
        assert abs(a - 2.0) < 0.01
        assert abs(b - (-3.0)) < 0.01
        assert abs(c - 1.0) < 0.1
        assert result["r2"] is not None
        assert abs(result["r2"] - 1.0) < 0.001

    def test_too_few_points(self):
        assert _quadratic_fit([1.0, 2.0, 3.0], [1.0, 4.0, 9.0]) is None


class TestMedianSplitGroups:

    def test_never_empty_label(self):
        from industry_structure.dimensions import median_split_groups
        peers = [
            {"ticker": "A", "ratios": {
                "Research And Development Expenses": 30, "Revenue": 300,
                "Depreciation And Amortization": 20,
                "Property Plant Equipment Net": 60}},
            {"ticker": "B", "ratios": {
                "Research And Development Expenses": 50, "Revenue": 300,
                "Depreciation And Amortization": 15,
                "Property Plant Equipment Net": 45}},
            {"ticker": "C", "ratios": {
                "Research And Development Expenses": 20, "Revenue": 200,
                "Depreciation And Amortization": 40,
                "Property Plant Equipment Net": 80}},
            {"ticker": "D", "ratios": {
                "Research And Development Expenses": 10, "Revenue": 200,
                "Depreciation And Amortization": 35,
                "Property Plant Equipment Net": 70}},
        ]
        groups = median_split_groups(peers, "techLeadership", "capitalIntensity")
        for tk, label in groups.items():
            if label is not None:
                assert len(label) > 0, f"Empty label for {tk}"


class TestGroupMapPayload:

    def test_firms_carry_five_years_ago(self, conn):
        result = build_strategic_groups(conn, "Alpha")
        assert result.get("applicable") is True
        for firm in result["firms"]:
            assert "xFiveYearsAgo" in firm
            assert "yFiveYearsAgo" in firm

    def test_payload_shape(self, conn):
        result = build_strategic_groups(conn, "Alpha")
        assert "axes" in result
        assert isinstance(result["axes"], list)
        assert "defaultAxes" in result
        assert "x" in result["defaultAxes"]
        assert "y" in result["defaultAxes"]
        assert "axisCorrelation" in result
        for g in result["groups"]:
            assert "combinedShare" in g
            assert "medianPreTaxRoic" in g
            assert "preTaxRoicRange" in g
            assert "firmCount" in g

    def test_unknown_axis_returns_not_applicable(self, conn):
        result = build_strategic_groups(
            conn, "Alpha", x_key="bogusAxis", y_key="techLeadership",
        )
        assert result.get("applicable") is False

    def test_same_axis_allowed_at_module_level(self, conn):
        result = build_strategic_groups(
            conn, "Alpha",
            x_key="techLeadership", y_key="techLeadership",
        )
        assert result.get("applicable") is True


class TestFullGroupMembership:
    """``groupByTicker`` names every firm the median split ran over.

    ``firms[]`` is capped at ``limit`` (100 at most, against 512 peers in
    Semiconductors), so membership read off it covered the largest firms only.
    The peer ranking prints the best RANKED companies instead, and nineteen of
    thirty rows came back "group not reported" for firms that are in a group.
    """

    def test_every_split_firm_is_named_even_below_the_limit(self, conn):
        """Two of the four Alpha firms are plotted; all four are named."""
        capped = build_strategic_groups(conn, "Alpha", limit=2)
        assert capped["plotted"] == 2
        assert capped["available"] == 4
        assert len(capped["groupByTicker"]) == 4
        plotted = {f["ticker"].upper() for f in capped["firms"]}
        assert set(capped["groupByTicker"]) - plotted        # names firms off the map

    def test_indexes_resolve_against_the_label_list(self, conn):
        result = build_strategic_groups(conn, "Alpha")
        labels = result["groupLabels"]
        assert labels and len(set(labels)) == len(labels)   # interned, no repeats
        for tk, idx in result["groupByTicker"].items():
            assert isinstance(idx, int)
            assert 0 <= idx < len(labels)
            assert tk == tk.upper()

    def test_membership_agrees_with_the_plotted_firms(self, conn):
        result = build_strategic_groups(conn, "Alpha")
        labels = result["groupLabels"]
        for firm in result["firms"]:
            if firm["group"] is None:
                assert firm["ticker"].upper() not in result["groupByTicker"]
                continue
            idx = result["groupByTicker"][firm["ticker"].upper()]
            assert labels[idx] == firm["group"]

    def test_every_summarised_group_is_reachable(self, conn):
        """The label list and the group summaries name the same groups."""
        result = build_strategic_groups(conn, "Alpha")
        assert set(result["groupLabels"]) == {g["label"] for g in result["groups"]}

    def test_counts_reconcile_with_the_summaries(self, conn):
        result = build_strategic_groups(conn, "Alpha")
        labels = result["groupLabels"]
        counted: dict[str, int] = {}
        for idx in result["groupByTicker"].values():
            counted[labels[idx]] = counted.get(labels[idx], 0) + 1
        for g in result["groups"]:
            assert counted[g["label"]] == g["firmCount"]

    def test_an_ungrouped_firm_is_absent_not_null(self, conn):
        """Absence is the signal. A firm with no axis value is left out, so
        "group not reported" keeps meaning "outside the split"."""
        result = build_strategic_groups(conn, "Alpha")
        assert None not in result["groupByTicker"].values()
        assert all(v is not None for v in result["groupByTicker"].values())

    def test_the_existing_fields_are_unchanged(self, conn):
        result = build_strategic_groups(conn, "Alpha")
        for key in ("applicable", "industry", "fiscalYear", "firms", "groups",
                    "axisCorrelation", "axes", "defaultAxes", "xKey", "yKey",
                    "limit", "plotted", "available", "duplicateListingsDropped"):
            assert key in result
