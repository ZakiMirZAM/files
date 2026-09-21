"""Tests for entry/exit, rivalry, stability, concentration, scale slope."""

import math
import os
import sqlite3
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from industry_structure.peers import Peer, PeerSet, load_peers
from industry_structure.panel import load_industry_panel, panel_net_entry
from industry_structure.concentration import build_concentration
from industry_structure.entry_exit import (
    _leader_cogs_to_revenue_5y,
    build_entry_evidence,
    build_exit_evidence,
    compute_scale_slope,
    spearman_rank_correlation,
)
from industry_structure.helpers import _safe_div
from industry_structure.stability import build_share_stability


class TestConcentration:

    def test_hhi_2600_cr4_1(self):
        peers = [
            Peer("A", "A", 300, 300, "USD", 2024),
            Peer("B", "B", 300, 300, "USD", 2024),
            Peer("C", "C", 200, 200, "USD", 2024),
            Peer("D", "D", 200, 200, "USD", 2024),
        ]
        ps = PeerSet(peers=peers, fiscal_year=2024, group_name="Test")
        assert ps.hhi() == 2600.0
        assert ps.cr4() == 1.0

    def test_build_concentration(self, conn):
        ps = load_peers(conn, "Alpha")
        assert ps is not None
        conc = build_concentration(ps, {})
        assert conc["firmCount"] == 4
        assert abs(conc["cr4"]["value"] - 1.0) < 1e-4
        assert abs(conc["hhi"]["value"] - 2600.0) < 1e-1
        assert len(conc["top10"]) == 4


class TestScaleSlope:

    def test_planted_slope_recovered(self):
        peers = []
        for i in range(20):
            rev = 100 + i * 50
            margin = 0.05 + 0.02 * math.log(rev)
            op = rev * margin
            p = Peer(f"T{i}", f"T{i}", rev, rev, "USD", 2024,
                      ratios={"Operating Income": op, "Revenue": rev})
            peers.append(p)
        ps = PeerSet(peers=peers, fiscal_year=2024, group_name="Test")
        result = compute_scale_slope(ps)
        assert result["slope"] is not None
        assert abs(result["slope"] - 0.02) < 0.005
        assert result["r2"] is not None
        assert result["r2"] > 0.9
        assert result["firmCount"] >= 15


class TestShareStability:

    def test_excludes_firms_missing_in_either_year(self):
        peers_now = [
            Peer("A", "A", 300, 300, "USD", 2024),
            Peer("B", "B", 300, 300, "USD", 2024),
            Peer("C", "C", 200, 200, "USD", 2024),
            Peer("NEW", "NEW", 200, 200, "USD", 2024),
        ]
        peers_then = [
            Peer("A", "A", 250, 250, "USD", 2019),
            Peer("B", "B", 250, 250, "USD", 2019),
            Peer("C", "C", 200, 200, "USD", 2019),
            Peer("OLD", "OLD", 100, 100, "USD", 2019),
        ]
        ps_now = PeerSet(peers=peers_now, fiscal_year=2024, group_name="Test")
        ps_then = PeerSet(peers=peers_then, fiscal_year=2019, group_name="Test")
        result = build_share_stability(ps_now, ps_then)
        assert result["shareRankCorrelation5y"] is not None

    def test_spearman_equals_1_for_unchanged_order(self):
        x = [10.0, 20.0, 30.0, 40.0, 50.0]
        y = [100.0, 200.0, 300.0, 400.0, 500.0]
        rho = spearman_rank_correlation(x, y)
        assert rho is not None
        assert abs(rho - 1.0) < 1e-6

    def test_spearman_minus_1_for_reversed_order(self):
        x = [10.0, 20.0, 30.0, 40.0, 50.0]
        y = [500.0, 400.0, 300.0, 200.0, 100.0]
        rho = spearman_rank_correlation(x, y)
        assert rho is not None
        assert abs(rho - (-1.0)) < 1e-6


class TestNetEntry:

    def test_excludes_latest_year(self, conn):
        """Kept from the superseded SQL ``compute_net_entry``, pointed at
        the panel version (finding LOW). The fixture's four Alpha firms
        all first report 2019 and last report 2024, so with the H4 window
        [2019, 2022] they are four entries and no exits."""
        panel = load_industry_panel(conn, "Alpha")
        ne = panel_net_entry(panel, 2024, window=5)
        assert ne is not None
        assert ne == 4


class TestCurrencyNeutralRatios:
    """C2/C3: PP&E/revenue and capex/revenue must use revenue_local,
    not revenue_usd, so the ratio stays currency-neutral.
    """

    def test_ppe_rev_uses_local_currency(self):
        """EUR firm: PP&E 100 EUR / rev 200 EUR = 0.5.
        Wrong (USD): PP&E 100 EUR / rev 220 USD = 0.4545.
        """
        p = Peer(
            "EU1", "EU Firm", revenue_usd=220.0, revenue_local=200.0,
            reported_currency="EUR", calendar_year=2024,
            ratios={"Property Plant Equipment Net": 100.0, "Revenue": 200.0},
            usd_per_unit=1.1,
        )
        # Correct: local currency
        ratio = _safe_div(100.0, p.revenue_local)
        assert ratio is not None
        assert abs(ratio - 0.5) < 1e-6

        # Wrong: USD
        wrong = _safe_div(100.0, p.revenue_usd)
        assert wrong is not None
        assert abs(wrong - 100.0 / 220.0) < 1e-6
        assert abs(wrong - 0.5) > 0.04  # visibly different

    def test_entry_evidence_uses_local(self):
        """build_entry_evidence with a EUR firm returns the local ratio."""
        peers = [
            Peer("EU1", "EU", 220.0, 200.0, "EUR", 2024,
                 ratios={
                     "Property Plant Equipment Net": 100.0,
                     "Capital Expenditure": -50.0,
                     "Revenue": 200.0,
                     "Operating Income": 40.0,
                     "Gross Profit Ratio": 0.4,
                     "Research And Development Expenses": 20.0,
                     "Selling General And Administrative Expenses": 30.0,
                     "Cash And Short Term Investments": 60.0,
                     "Total Assets": 500.0,
                 },
                 usd_per_unit=1.1),
        ]
        ps = PeerSet(peers=peers, fiscal_year=2024, group_name="TestInd")
        result = build_entry_evidence(ps, {})
        ppe_rev = result["ppeToRevenue"]["value"]
        capex_rev = result["capexToRevenue"]["value"]
        # PP&E 100 / rev 200 = 0.5
        assert ppe_rev is not None
        assert abs(ppe_rev - 0.5) < 1e-3
        # |capex| 50 / rev 200 = 0.25
        assert capex_rev is not None
        assert abs(capex_rev - 0.25) < 1e-3

    def test_leader_cogs_to_revenue_5y(self):
        """leaderCogsToRevenue5y returns COGS/Revenue for the top 4 firms
        across 5 years from the panel."""
        from dataclasses import dataclass
        from typing import Dict

        @dataclass
        class FakePanel:
            by_year: Dict[int, PeerSet]
            fiscal_year: int
            industry: str
            ticker_spans: dict

        def _peer(ticker, name, rev_usd, rev_local, yr, cogs):
            return Peer(
                ticker=ticker, name=name,
                revenue_usd=rev_usd, revenue_local=rev_local,
                reported_currency="USD", calendar_year=yr,
                ratios={"Cost Of Revenue": cogs, "Revenue": rev_local},
                usd_per_unit=1.0,
            )

        by_year = {}
        for yr in range(2020, 2025):
            by_year[yr] = PeerSet(
                peers=[
                    _peer("BIG", "Big Co", 1000, 1000, yr, 400 + (yr - 2020) * 10),
                    _peer("MED", "Med Co", 500, 500, yr, 300),
                    _peer("SML", "Small Co", 200, 200, yr, 150),
                ],
                fiscal_year=yr,
                group_name="TestInd",
            )

        panel = FakePanel(
            by_year=by_year, fiscal_year=2024,
            industry="TestInd", ticker_spans={},
        )
        ps = by_year[2024]

        result = _leader_cogs_to_revenue_5y(ps, panel)
        assert result is not None
        assert len(result) == 3  # only 3 firms, top 4 returns all 3
        assert result[0]["ticker"] == "BIG"
        assert result[1]["ticker"] == "MED"

        # BIG in 2024: COGS 440 / Rev 1000 = 0.44
        big_2024 = next(
            y for y in result[0]["years"] if y["year"] == 2024
        )
        assert big_2024["value"] is not None
        assert abs(big_2024["value"] - 0.44) < 1e-3

        # BIG in 2020: COGS 400 / Rev 1000 = 0.40
        big_2020 = next(
            y for y in result[0]["years"] if y["year"] == 2020
        )
        assert abs(big_2020["value"] - 0.40) < 1e-3

        # 5 years of data per firm
        assert len(result[0]["years"]) == 5

    def test_leader_cogs_no_panel(self):
        """leaderCogsToRevenue5y returns None when panel is None."""
        peers = [
            Peer("A", "A", 100, 100, "USD", 2024,
                 ratios={"Cost Of Revenue": 50, "Revenue": 100},
                 usd_per_unit=1.0),
        ]
        ps = PeerSet(peers=peers, fiscal_year=2024, group_name="TestInd")
        result = _leader_cogs_to_revenue_5y(ps, None)
        assert result is None

    def test_entry_evidence_includes_leader_cogs(self):
        """build_entry_evidence result includes leaderCogsToRevenue5y key."""
        peers = [
            Peer("EU1", "EU", 220.0, 200.0, "EUR", 2024,
                 ratios={
                     "Property Plant Equipment Net": 100.0,
                     "Capital Expenditure": -50.0,
                     "Revenue": 200.0,
                     "Operating Income": 40.0,
                     "Gross Profit Ratio": 0.4,
                     "Research And Development Expenses": 20.0,
                     "Selling General And Administrative Expenses": 30.0,
                     "Cash And Short Term Investments": 60.0,
                     "Total Assets": 500.0,
                     "Cost Of Revenue": 120.0,
                 },
                 usd_per_unit=1.1),
        ]
        ps = PeerSet(peers=peers, fiscal_year=2024, group_name="TestInd")
        result = build_entry_evidence(ps, {})
        # Without panel, should be None
        assert "leaderCogsToRevenue5y" in result
        assert result["leaderCogsToRevenue5y"] is None
