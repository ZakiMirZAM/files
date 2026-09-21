"""Integration tests: full structure, evolution, value system, profit pool, net entry window."""

import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import fixture_db
from industry_structure.evolution import build_evolution
from industry_structure.panel import (
    IndustryPanel,
    load_industry_panel,
    net_entry_window,
    panel_net_entry,
)
from industry_structure.peers import PeerSet, pick_year
from industry_structure.profit_pool import build_profit_pool
from industry_structure.structure import build_industry_structure
from industry_structure.value_system import build_value_system


class TestFullStructure:

    def test_returns_all_blocks(self, conn):
        result = build_industry_structure(conn, "Alpha")
        assert "concentration" in result
        assert "entryEvidence" in result
        assert "exitEvidence" in result
        assert "rivalryEvidence" in result
        assert "shareStability" in result
        assert "evolution" in result
        assert "environmentIndicators" in result
        assert result["firmCount"] == 4
        # leaderCogsToRevenue5y should be present in entryEvidence
        entry = result["entryEvidence"]
        assert "leaderCogsToRevenue5y" in entry

    def test_unknown_industry_returns_the_shared_no_data_shape(self, conn):
        """Finding M9: one shape everywhere, never {"error": ...} at 200."""
        result = build_industry_structure(conn, "Nonexistent")
        assert "error" not in result
        assert result["applicable"] is False
        assert result["reason"]


class TestEvolution:

    def test_returns_series(self, conn):
        panel = load_industry_panel(conn, "Alpha")
        assert panel is not None
        result = build_evolution(panel, 2024)
        assert "revenue" in result
        assert "hhi" in result
        assert "grossMarginSpread" in result
        assert len(result["revenue"]) >= 2


class TestValueSystem:

    def test_with_and_without_partners(self, conn_multi):
        result = build_value_system(conn_multi, "Alpha")
        assert result["focal"]["industry"] == "Alpha"
        assert result["supplier"] is None
        assert result["buyer"] is None
        assert result["focal"]["hhi"] is not None

    def test_with_partners(self, conn_multi):
        result = build_value_system(
            conn_multi, "Beta", supplier="Gamma", buyer="Alpha",
        )
        assert result["focal"]["industry"] == "Beta"
        assert result["supplier"]["industry"] == "Gamma"
        assert result["buyer"]["industry"] == "Alpha"

    def test_days_series(self, conn):
        result = build_value_system(conn, "Alpha")
        focal = result["focal"]
        assert "daysPayableByYear" in focal
        assert "daysReceivableByYear" in focal


class TestProfitPool:

    def test_shares_sum_to_one(self, conn_multi):
        pool = build_profit_pool(conn_multi, "Health")
        assert "industries" in pool
        industries = pool["industries"]
        assert len(industries) >= 2

        rev_shares = [
            i["revenueShare"]
            for i in industries
            if i["revenueShare"] is not None
        ]
        assert abs(sum(rev_shares) - 1.0) < 1e-4

        if not pool.get("negativeSectorProfit"):
            profit_shares = [
                i["profitShare"]
                for i in industries
                if i["profitShare"] is not None
            ]
            assert abs(sum(profit_shares) - 1.0) < 1e-4

    def test_negative_total_returns_null_shares(self, tmp_path):
        """When sector total profit is negative, profitShare is null."""
        from industry_structure.conftest import build_fixture

        path = str(tmp_path / "neg_profit.db")
        conn = sqlite3.connect(path)
        fixture_db.create_schema(conn, fx=False)
        conn.execute("INSERT INTO fx_rates VALUES ('USD', 1.0, '2024-01-01')")
        conn.execute("INSERT INTO tickers VALUES ('X1','X1','Bad','BadInd')")
        conn.execute(
            'INSERT INTO financials (Ticker, "Calendar Year", "Reported Currency", "Revenue", "Operating Income", "Gross Profit", "Gross Profit Ratio", "Interest Expense", "Total Debt", "EBITDA", "Net Income", "Market Cap", "Total Assets", "Total Stockholders Equity", "Net Debt", "Depreciation And Amortization", "Capital Expenditure", "Research And Development Expenses", "Selling General And Administrative Expenses", "Cost Of Revenue", "Operating Cash Flow", "Property Plant Equipment Net", "Intangible Assets", "Cash And Cash Equivalents", "Cash And Short Term Investments", "Days Payables Outstanding", "Days Sales Outstanding", "Free Cash Flow") VALUES '
            '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            ('X1', '2024', 'USD', 100, -50, 30, 0.30, -5, 50, -30, -60,
             200, 300, 100, 30, 10, -15, 5, 10, 70, -40, 50, 10, 20, 30,
             40, 35, -65),
        )
        conn.row_factory = sqlite3.Row
        conn.commit()
        pool = build_profit_pool(conn, "Bad")
        assert pool.get("negativeSectorProfit") is True
        for ind in pool.get("industries", []):
            assert ind["profitShare"] is None
        conn.close()


class TestNetEntryWindowEdges:

    def test_window_edges_with_panel(self):
        spans = {
            "ENTRY_2020": (2020, 2025),
            "ENTRY_2019": (2019, 2025),
            "ENTRY_2018": (2018, 2025),
            "EXIT_2020":  (2015, 2020),
            "EXIT_2024":  (2015, 2024),
            "EXIT_2025":  (2015, 2025),
            "EXIT_2019":  (2010, 2019),
            "STABLE":     (2010, 2025),
        }
        panel = IndustryPanel(
            by_year={},
            fiscal_year=2025,
            industry="Test",
            ticker_spans=spans,
        )
        result = panel_net_entry(panel, latest_year=2025, window=5)
        # Window = [2020, 2023] (H4: the last two years lag, so a firm that
        # last reported 2024 has not exited, it is late).
        # Entries: ENTRY_2020 = 1
        # Exits: EXIT_2020 (last=2020) = 1
        assert result == 0

    def test_latest_year_excluded_from_exits(self):
        spans = {"STILL_HERE": (2015, 2025)}
        panel = IndustryPanel(
            by_year={}, fiscal_year=2025, industry="Test",
            ticker_spans=spans,
        )
        result = panel_net_entry(panel, latest_year=2025, window=5)
        assert result == 0

    def test_window_is_reported_with_the_count(self, conn):
        """The superseded SQL builder is gone (finding LOW); what the
        endpoint now has to state is the window the count was taken over."""
        panel = load_industry_panel(conn, "Alpha")
        assert panel is not None
        panel_ne = panel_net_entry(panel, panel.fiscal_year, window=5)
        window = net_entry_window(panel.fiscal_year, 5)
        assert window == (panel.fiscal_year - 5, panel.fiscal_year - 2)
        assert panel_ne is not None


class TestPickYearCoverageRule:
    """C1: the 80% coverage rule picks the latest year with at least
    80% of the best-covered year's firm count, not just MAX year.
    """

    def test_sparse_latest_year_skipped(self, tmp_path):
        """If 2024 has only 2 firms but 2023 has 10, pick 2023."""
        path = str(tmp_path / "sparse.db")
        conn = sqlite3.connect(path)
        conn.execute(
            'CREATE TABLE financials ('
            '    Ticker TEXT, "Calendar Year" TEXT,'
            '    "Reported Currency" TEXT, "Revenue" REAL,'
            '    PRIMARY KEY (Ticker, "Calendar Year"))'
        )
        conn.execute(
            "CREATE TABLE tickers "
            "(ticker TEXT PRIMARY KEY, name TEXT, sector TEXT, industry TEXT)"
        )
        conn.execute(
            "CREATE TABLE security_map "
            "(symbol TEXT PRIMARY KEY, is_primary INTEGER)"
        )
        # 10 firms in 2023
        for i in range(10):
            tk = f"S{i}"
            conn.execute(
                "INSERT INTO tickers VALUES (?,?,?,?)",
                (tk, tk, "Sec", "SparseInd"),
            )
            conn.execute(
                'INSERT INTO financials VALUES (?,?,?,?)',
                (tk, "2023", "USD", 100 + i * 10),
            )
        # Only 2 firms in 2024 (below 80% of 10 = 8)
        for i in range(2):
            tk = f"S{i}"
            conn.execute(
                'INSERT INTO financials VALUES (?,?,?,?)',
                (tk, "2024", "USD", 110 + i * 10),
            )
        conn.commit()
        conn.row_factory = sqlite3.Row

        year = pick_year(conn, "SparseInd", lookback=3)
        assert year == 2023, (
            f"Expected 2023 (10 firms), got {year}; "
            "2024 has only 2 firms, below 80% threshold"
        )
        conn.close()

    def test_all_years_adequate(self, tmp_path):
        """When all years meet 80%, pick the latest."""
        path = str(tmp_path / "full.db")
        conn = sqlite3.connect(path)
        conn.execute(
            'CREATE TABLE financials ('
            '    Ticker TEXT, "Calendar Year" TEXT,'
            '    "Reported Currency" TEXT, "Revenue" REAL,'
            '    PRIMARY KEY (Ticker, "Calendar Year"))'
        )
        conn.execute(
            "CREATE TABLE tickers "
            "(ticker TEXT PRIMARY KEY, name TEXT, sector TEXT, industry TEXT)"
        )
        conn.execute(
            "CREATE TABLE security_map "
            "(symbol TEXT PRIMARY KEY, is_primary INTEGER)"
        )
        for i in range(10):
            tk = f"F{i}"
            conn.execute(
                "INSERT INTO tickers VALUES (?,?,?,?)",
                (tk, tk, "Sec", "FullInd"),
            )
            for yr in ("2022", "2023", "2024"):
                conn.execute(
                    'INSERT INTO financials VALUES (?,?,?,?)',
                    (tk, yr, "USD", 100 + i * 10),
                )
        conn.commit()
        conn.row_factory = sqlite3.Row

        year = pick_year(conn, "FullInd", lookback=3)
        assert year == 2024
        conn.close()


class TestCrossCurrencyAggregation:
    """C4: when summing capex/dep/PP&E across firms in different currencies,
    each value must be converted to USD via usd_per_unit.
    """

    def test_evolution_converts_capex_dep_to_usd(self, tmp_path):
        """Two firms: one USD, one EUR (fx 1.1). Sum must use USD."""
        from industry_structure.conftest import build_fixture
        from industry_structure.peers import Peer, PeerSet

        usd_firm = Peer(
            "US1", "US Firm", 200.0, 200.0, "USD", 2024,
            ratios={
                "Capital Expenditure": -100.0,
                "Depreciation And Amortization": 30.0,
                "Property Plant Equipment Net": 400.0,
                "Revenue": 200.0,
                "Operating Income": 40.0,
                "Gross Profit Ratio": 0.4,
                "Research And Development Expenses": 20.0,
            },
            usd_per_unit=1.0,
        )
        eur_firm = Peer(
            "EU1", "EU Firm", 330.0, 300.0, "EUR", 2024,
            ratios={
                "Capital Expenditure": -200.0,
                "Depreciation And Amortization": 100.0,
                "Property Plant Equipment Net": 600.0,
                "Revenue": 300.0,
                "Operating Income": 30.0,
                "Gross Profit Ratio": 0.35,
                "Research And Development Expenses": 15.0,
            },
            usd_per_unit=1.1,
        )
        ps = PeerSet(
            peers=[usd_firm, eur_firm], fiscal_year=2024, group_name="Mixed",
        )

        # Correct USD totals:
        # capex: 100*1.0 + 200*1.1 = 100 + 220 = 320
        # dep:    30*1.0 + 100*1.1 =  30 + 110 = 140
        correct_capex = 320.0
        correct_dep = 140.0

        # Wrong (no FX): capex 300, dep 130
        wrong_capex = 300.0
        wrong_dep = 130.0
        assert abs(correct_capex - wrong_capex) > 1.0  # visibly different

        from industry_structure.evolution import cross_firm_totals_usd
        total_capex, total_dep, total_ppe = cross_firm_totals_usd(
            ps.peers,
        )
        assert abs(total_capex - correct_capex) < 1e-6
        assert abs(total_dep - correct_dep) < 1e-6
        assert abs(total_ppe - (400.0 + 600.0 * 1.1)) < 1e-6
