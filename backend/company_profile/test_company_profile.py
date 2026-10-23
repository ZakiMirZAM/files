"""Tests for backend/company_profile/ (plan 3.1-3.5, 5.2).

Network-free, DB-free: in-memory SQLite fixtures.
"""

from __future__ import annotations

import os
import sqlite3
import statistics
import sys
from unittest.mock import MagicMock, patch

import pytest

# Ensure backend/ and its packages are importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


import fixture_db


# ── Fixture builder ──────────────────────────────────────────────────────────

def _build_db() -> sqlite3.Connection:
    """Build an in-memory SQLite with enough data for all tests."""
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    fixture_db.create_schema(conn, fx=False)

    conn.execute("INSERT INTO fx_rates VALUES ('USD', 1.0, '2024-01-01')")
    conn.execute("INSERT INTO fx_rates VALUES ('TWD', 0.031, '2024-01-01')")

    # Tech sector, Chips industry: 5 companies (2024 + 2019)
    companies = [
        # ticker, name, sector, industry, ccy, year, rev, op, gp, gpr, ie, td, ebitda, ni, mc, ta, eq, nd, da, capex, rd, sga, cogs, ocf, ppe, intang, cash, cashst, dayspay, dayssales, fcf
        ("CHIP1", "ChipCo A", "Technology", "Chips", "USD", "2024", 1000, 200, 500, 0.50, -20, 300, 250, 150, 5000, 3000, 1500, 100, 50, -80, 100, 100, 500, 250, 400, 100, 200, 300, 45, 30, 170),
        ("CHIP2", "ChipCo B", "Technology", "Chips", "USD", "2024", 800,  100, 320, 0.40, -15, 200, 130, 70,  3000, 2000, 1000, 80,  40, -60, 80,  80,  480, 130, 300, 80,  150, 200, 40, 35, 70),
        ("CHIP3", "ChipCo C", "Technology", "Chips", "USD", "2024", 600,  60,  210, 0.35, -10, 150, 80,  30,  2000, 1500, 700,  60,  30, -40, 30,  60,  390, 80,  250, 60,  100, 150, 50, 40, 40),
        ("CHIP4", "ChipCo D", "Technology", "Chips", "USD", "2024", 400,  20,  120, 0.30, -5,  100, 30,  10,  1000, 1000, 400,  50,  20, -25, 10,  40,  280, 30,  150, 40,  80,  100, 55, 45, 5),
        ("CHIP5", "ChipCo E", "Technology", "Chips", "USD", "2024", 200,  -20, 40,  0.20, -8,  80,  -10, -30, 500,  600,  200,  30,  10, -15, 5,   30,  160, -10, 80,  20,  50,  60,  60, 50, -25),
        # 2019 data
        ("CHIP1", "ChipCo A", "Technology", "Chips", "USD", "2019", 700, 140, 350, 0.50, -15, 250, 180, 100, 3500, 2200, 1200, 80,  40, -60, 70, 80, 350, 170, 300, 80, 150, 250, 42, 28, 110),
        ("CHIP2", "ChipCo B", "Technology", "Chips", "USD", "2019", 650, 80,  260, 0.40, -12, 180, 100, 50,  2500, 1800, 900,  70,  35, -50, 60, 70, 390, 100, 250, 70, 120, 180, 38, 32, 50),
        ("CHIP3", "ChipCo C", "Technology", "Chips", "USD", "2019", 550, 55,  192, 0.35, -8,  130, 70,  25,  1800, 1300, 600,  50,  25, -35, 25, 55, 358, 70,  220, 50, 90,  130, 48, 38, 35),
    ]

    # Financial sector: bank without COGS
    bank_data = [
        ("BANK1", "BigBank", "Financial Services", "Banks", "USD", "2024", 500, 100, None, None, -50, 400, None, 80, 4000, 10000, 2000, 200, 20, -10, None, 100, None, 80, 50, 10, 200, 250, None, None, 70),
        ("BANK2", "SmallBank", "Financial Services", "Banks", "USD", "2024", 300, 50, None, None, -30, 300, None, 40, 2000, 6000, 1200, 100, 15, -5, None, 80, None, 50, 30, 5, 100, 120, None, None, 45),
    ]

    # Foreign company in TWD
    foreign_data = [
        ("TSM-TW", "TSMC", "Technology", "Chips", "TWD", "2024", 30000, 10000, 18000, 0.60, -200, 5000, 12000, 8000, 500000, 200000, 100000, 2000, 2000, -8000, 3000, 2000, 12000, 6000, 50000, 5000, 20000, 30000, 40, 25, 2000),
    ]

    for row in companies + bank_data + foreign_data:
        tk, name, sector, ind, ccy, yr = row[:6]
        vals = row[6:]
        try:
            conn.execute(
                "INSERT INTO tickers VALUES (?, ?, ?, ?)",
                (tk, name, sector, ind),
            )
        except sqlite3.IntegrityError:
            pass
        conn.execute(
            'INSERT INTO financials (Ticker, "Calendar Year", "Reported Currency", "Revenue", "Operating Income", "Gross Profit", "Gross Profit Ratio", "Interest Expense", "Total Debt", "EBITDA", "Net Income", "Market Cap", "Total Assets", "Total Stockholders Equity", "Net Debt", "Depreciation And Amortization", "Capital Expenditure", "Research And Development Expenses", "Selling General And Administrative Expenses", "Cost Of Revenue", "Operating Cash Flow", "Property Plant Equipment Net", "Intangible Assets", "Cash And Cash Equivalents", "Cash And Short Term Investments", "Days Payables Outstanding", "Days Sales Outstanding", "Free Cash Flow") VALUES '
            '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (tk, yr, ccy, *vals),
        )

    # security_map entry with a symbol_yf spelling
    conn.execute(
        "INSERT INTO security_map (symbol, symbol_yf, is_primary, status)"
        " VALUES (?, ?, ?, ?)",
        ("TSM-TW", "TSM", 1, "active"),
    )

    # "Dividends Paid" is NOT in peers._RATIO_COLS, so rivals.py reads it off
    # the financials row directly. It is part of the shared fixture schema.
    conn.commit()
    return conn


@pytest.fixture
def conn():
    c = _build_db()
    yield c
    c.close()


# ── Helper to load peers ──────────────────────────────────────────────────────

def _load_chip_peers(conn):
    from industry_structure.peers import load_peers
    return load_peers(conn, "Chips")


def _load_bank_peers(conn):
    from industry_structure.peers import load_peers
    return load_peers(conn, "Banks")


# ═══════════════════════════════════════════════════════════════════════════════
# 1. Profile tests (plan 3.1)
# ═══════════════════════════════════════════════════════════════════════════════

class TestProfile:
    def test_cache_hit(self, conn):
        """A freshly written cache row is returned without a yfinance call."""
        from company_profile.profile import _ensure_table, get_business_profile
        _ensure_table(conn)
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "INSERT INTO business_profile VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("CHIP1", "Test summary", "https://chip1.com", "USA", 5000, None, now),
        )
        conn.commit()

        result = get_business_profile(conn, "CHIP1")
        assert result["applicable"] is True
        assert result["summary"] == "Test summary"
        assert result["website"] == "https://chip1.com"
        assert result["employees"] == 5000

    def test_stale_refresh_with_yfinance_mock(self, conn):
        """When the cache is stale, yfinance is called; on success the DB is updated."""
        from company_profile.profile import _ensure_table, get_business_profile
        _ensure_table(conn)
        # Insert stale entry
        conn.execute(
            "INSERT INTO business_profile VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("CHIP1", "Old summary", None, None, None, None, "2020-01-01T00:00:00+00:00"),
        )
        conn.commit()

        # _fetch_yfinance returns the already-extracted dict shape
        mock_info = {
            "summary": "New summary from yfinance",
            "website": "https://new.com",
            "country": "USA",
            "employees": 10000,
        }
        with patch("company_profile.profile._fetch_yfinance", return_value=mock_info):
            with patch("company_profile.profile._fetch_10k_extract", return_value=None):
                result = get_business_profile(conn, "CHIP1")

        assert result["applicable"] is True
        assert result["summary"] == "New summary from yfinance"
        assert result["employees"] == 10000

    def test_network_failure_falls_back_to_cache(self, conn):
        """When yfinance fails on a stale entry, the cached row is returned."""
        from company_profile.profile import _ensure_table, get_business_profile
        _ensure_table(conn)
        conn.execute(
            "INSERT INTO business_profile VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("CHIP1", "Cached summary", "https://cached.com", "USA", 3000, None, "2020-01-01T00:00:00+00:00"),
        )
        conn.commit()

        with patch("company_profile.profile._fetch_yfinance", return_value=None):
            result = get_business_profile(conn, "CHIP1")

        assert result["applicable"] is True
        assert result["summary"] == "Cached summary"
        assert result["source"] == "yfinance (cached)"

    def test_no_data_marker(self, conn):
        """When no cache and yfinance fails, return not-applicable."""
        from company_profile.profile import _ensure_table, get_business_profile
        _ensure_table(conn)

        with patch("company_profile.profile._fetch_yfinance", return_value=None):
            result = get_business_profile(conn, "NOEXIST")

        assert result["applicable"] is False
        assert "reason" in result

    def test_symbol_yf_used(self, conn):
        """security_map.symbol_yf is passed to yfinance when it differs."""
        from company_profile.profile import _resolve_yf_symbol
        sym = _resolve_yf_symbol(conn, "TSM-TW")
        assert sym == "TSM"

    def test_cut_at_sentence_end(self):
        """10-K extract is cut at a sentence boundary."""
        from company_profile.profile import _cut_at_sentence
        text = "First sentence. Second sentence. Third sentence. Fourth sentence."
        result = _cut_at_sentence(text, 45)
        assert result.endswith(".")
        assert len(result) <= 45
        # Should include "First sentence. Second sentence." (32 chars)
        assert "Second sentence." in result

    def test_cut_at_sentence_preserves_short(self):
        """Text shorter than max_chars is returned unchanged."""
        from company_profile.profile import _cut_at_sentence
        text = "Short text."
        assert _cut_at_sentence(text, 100) == text



    def test_network_disabled_under_pytest(self):
        """The profile module refuses to touch the network inside a test run."""
        from company_profile.profile import network_disabled, _fetch_yfinance
        assert network_disabled() is True
        assert _fetch_yfinance("AAPL") is None

    def test_table_ddl_is_not_reissued_for_a_file_database(self, tmp_path):
        """_ensure_table remembers a prepared file DB instead of running DDL.

        Proof: after the first call the table is dropped behind its back. A
        second call that still issued the DDL would recreate it.
        """
        import company_profile.profile as prof
        path = str(tmp_path / "probe.db")
        fconn = sqlite3.connect(path)
        try:
            prof._ensured_dbs.discard(path)
            prof._ensure_table(fconn)
            assert path in prof._ensured_dbs
            fconn.execute("DROP TABLE business_profile")
            fconn.commit()
            prof._ensure_table(fconn)
            names = [
                r[0] for r in fconn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'",
                )
            ]
            assert "business_profile" not in names
        finally:
            prof._ensured_dbs.discard(path)
            fconn.close()

    def test_in_memory_database_always_runs_the_ddl(self, conn):
        """An in-memory DB is per-connection, so it can never be skipped."""
        from company_profile.profile import _ensure_table
        _ensure_table(conn)
        conn.execute("DROP TABLE business_profile")
        _ensure_table(conn)
        names = [
            r[0] for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'",
            )
        ]
        assert "business_profile" in names


# ==============================================================================
# 3. Generic strategy (plan 3.3)
# ==============================================================================

class TestGenericStrategy:
    def test_ranks_correct_with_ties(self):
        """Ties share the lowest rank and the next value skips."""
        from company_profile.common import rank_desc
        values = [("A", 0.5), ("B", 0.5), ("C", 0.3)]
        assert rank_desc(values, "A")["rank"] == 1
        assert rank_desc(values, "B")["rank"] == 1
        assert rank_desc(values, "C")["rank"] == 3
        assert rank_desc(values, "A")["count"] == 3

    def test_missing_values_excluded_from_count(self):
        """Nulls never enter the count and never receive a rank."""
        from company_profile.common import rank_desc
        values = [("A", 0.5), ("B", None), ("C", 0.3)]
        assert rank_desc(values, "A")["count"] == 2
        assert rank_desc(values, "B")["rank"] is None

    def test_nan_and_inf_are_dropped(self):
        """A NaN or infinity can never be ranked or serialized."""
        from company_profile.common import rank_desc, r6, safe_div
        values = [("A", 0.5), ("B", float("nan")), ("C", float("inf"))]
        assert rank_desc(values, "A") == {"rank": 1, "count": 1}
        assert r6(float("nan")) is None
        assert r6(float("inf")) is None
        assert safe_div(float("nan"), 2) is None

    def test_generic_strategy_returns_ranks_and_context(self, conn):
        from company_profile.generic_strategy import build_generic_strategy
        ps = _load_chip_peers(conn)
        result = build_generic_strategy("CHIP1", ps, segment_count=3)
        assert result["applicable"] is True
        assert result["rdToRevenue"]["rank"] == 1
        assert result["segmentCount"] == 3
        assert result["fiscalYear"] == ps.fiscal_year
        assert result["peerCount"] == len(ps.peers)

    def test_bank_gets_null_not_zero_for_cogs_line(self, conn):
        """A firm with no cost of revenue has no COGS+SG&A figure at all."""
        from company_profile.generic_strategy import build_generic_strategy
        ps = _load_bank_peers(conn)
        result = build_generic_strategy("BANK1", ps)
        assert result["costOfGoodsPlusSgaToRevenue"]["value"] is None
        assert result["costOfGoodsPlusSgaToRevenue"]["count"] == 0


# ==============================================================================
# 4. Rival capabilities (plan 3.4)
# ==============================================================================

def _peer(ticker="TEST", **ratios):
    p = MagicMock()
    p.ticker = ticker
    p.name = ticker
    p.reported_currency = ratios.pop("_ccy", "USD")
    base = {
        "Revenue": 100, "Net Income": 10, "Total Assets": 200,
        "Total Stockholders Equity": 100, "Total Debt": 50,
        "Cost Of Revenue": 60, "Selling General And Administrative Expenses": 20,
        "Operating Income": 20, "Free Cash Flow": 5,
        "Cash And Short Term Investments": 30,
        "Capital Expenditure": -15, "Depreciation And Amortization": 10,
    }
    base.update(ratios)
    p.ratios = base
    return p


class TestSustainableGrowth:
    def test_product_equals_the_four_factors_multiplied(self):
        """The headline number is exactly the four factors multiplied."""
        from company_profile.rivals import sustainable_growth
        product, f = sustainable_growth(
            revenue=1000, net_income=100, total_assets=800,
            equity=400, dividends_paid=40,
        )
        assert f["margin"] == round(100 / 1000, 6)
        assert f["assetTurnover"] == round(1000 / 800, 6)
        assert f["assetsOverEquity"] == round(800 / 400, 6)
        assert f["retention"] == round(1 - 40 / 100, 6)
        expected = (100 / 1000) * (1000 / 800) * (800 / 400) * (1 - 40 / 100)
        assert abs(product - expected) < 1e-9

    def test_replicates_coca_cola_fiscal_2025(self):
        """Hand computation against the real KO row in financials.db.

        Read from financials.db on 2026-09-20 (Calendar Year 2025):
        net income 13,107,000,000; dividends paid -8,779,000,000;
        revenue 47,941,000,000; total assets 104,816,000,000;
        equity 32,169,000,000. All USD, all one fiscal year.
        """
        from company_profile.rivals import sustainable_growth
        ni, dp = 13_107_000_000.0, -8_779_000_000.0
        rev, ta, eq = 47_941_000_000.0, 104_816_000_000.0, 32_169_000_000.0
        product, f = sustainable_growth(rev, ni, ta, eq, abs(dp))

        margin = ni / rev                      # 0.273398
        turnover = rev / ta                    # 0.457380
        leverage = ta / eq                     # 3.258230
        retention = 1 - (abs(dp) / ni)         # 0.330206
        assert abs(f["margin"] - round(margin, 6)) < 1e-9
        assert abs(f["assetTurnover"] - round(turnover, 6)) < 1e-9
        assert abs(f["assetsOverEquity"] - round(leverage, 6)) < 1e-9
        assert abs(f["retention"] - round(retention, 6)) < 1e-9
        assert abs(product - margin * turnover * leverage * retention) < 1e-6
        # The stored Payout Ratio (0.669794766) is 1 minus the retention.
        assert abs((1 - retention) - 0.669794766) < 1e-6
        # Cross-check: 0.2734 x 0.4574 x 3.2582 x 0.3302 = 0.1345
        assert abs(product - 0.134553) < 5e-5

    def test_null_on_negative_equity(self):
        from company_profile.rivals import sustainable_growth
        product, f = sustainable_growth(100, 10, 200, -50, 2)
        assert product is None
        assert f["margin"] is not None  # the factors are still shown

    def test_null_on_negative_earnings(self):
        from company_profile.rivals import sustainable_growth
        product, f = sustainable_growth(100, -10, 200, 100, 0)
        assert product is None
        assert f["retention"] is None

    def test_null_when_dividends_unknown(self):
        """No dividend figure means no retention, so no product, not a 1.0."""
        from company_profile.rivals import sustainable_growth
        product, f = sustainable_growth(100, 10, 200, 100, None)
        assert product is None
        assert f["retention"] is None

    def test_payout_above_one_is_not_clamped(self):
        """A firm paying out more than it earned keeps its raw retention."""
        from company_profile.rivals import sustainable_growth
        product, f = sustainable_growth(1000, 100, 800, 400, 150)
        assert f["retention"] == round(1 - 1.5, 6)
        assert f["retention"] < 0
        expected = 0.1 * 1.25 * 2.0 * -0.5
        assert abs(product - expected) < 1e-9


class TestCapabilityRow:
    def test_cogs_plus_sga_is_null_when_cogs_missing(self):
        """A bank's SG&A must not be published as a COGS+SG&A figure."""
        from company_profile.rivals import _capability_row
        row = _capability_row(_peer(**{"Cost Of Revenue": None}))
        assert row["cogsAndSgaToRevenue"] is None

    def test_cash_months_uses_revenue_minus_operating_income(self):
        """Operating costs = revenue minus operating income, less non-cash D&A."""
        from company_profile.rivals import _capability_row
        p = _peer(**{
            "Revenue": 1200, "Operating Income": 200,
            "Depreciation And Amortization": 100,
            "Cash And Short Term Investments": 300,
        })
        # cash operating costs = 1200 - 200 - 100 = 900; one month is 75.
        assert abs(_capability_row(p)["cashMonthsOfOpCosts"] - 4.0) < 1e-9

    def test_cash_months_defined_for_a_bank(self, conn):
        """The definition needs no COGS, so a bank still gets a runway figure."""
        from company_profile.rivals import _capability_row
        ps = _load_bank_peers(conn)
        bank = next(p for p in ps.peers if p.ticker == "BANK1")
        row = _capability_row(bank)
        assert row["cashMonthsOfOpCosts"] is not None
        assert row["cogsAndSgaToRevenue"] is None

    def test_head_to_head_fields_from_the_fixture(self, conn):
        """CHIP1 FY2024: NI 150, rev 1000, TA 3000, eq 1500, debt 300,
        cash+ST 300, op inc 200."""
        from company_profile.rivals import _capability_row
        chip1 = next(p for p in _load_chip_peers(conn).peers if p.ticker == "CHIP1")
        row = _capability_row(chip1)
        assert row["netMargin"] == 0.15
        assert row["assetTurnover"] == round(1000 / 3000, 6)
        assert row["equityMultiplier"] == 2.0
        assert row["roe"] == 0.1
        assert row["returnOnCapital"] == round(200 / (300 - 300 + 1500), 6)
        assert row["revenueUsd"] == 1000.0
        # ROE is the product of its three legs (up to rounding).
        assert abs(row["netMargin"] * (1000 / 3000) * 2.0 - row["roe"]) < 1e-6

    def test_head_to_head_nulls_on_missing_inputs(self):
        from company_profile.rivals import _capability_row
        row = _capability_row(_peer(**{
            "Net Income": None, "Total Debt": None,
        }))
        assert row["netMargin"] is None and row["roe"] is None
        assert row["returnOnCapital"] is None  # missing debt is not zero debt
        assert row["assetTurnover"] == 0.5  # other legs unaffected
        no_cash = _capability_row(_peer(**{"Cash And Short Term Investments": None}))
        assert no_cash["returnOnCapital"] is None

    def test_head_to_head_nulls_on_non_positive_denominators(self):
        from company_profile.rivals import _capability_row
        neg_eq = _capability_row(_peer(**{"Total Stockholders Equity": -100}))
        assert neg_eq["roe"] is None and neg_eq["equityMultiplier"] is None
        zero = _capability_row(_peer(**{"Revenue": 0, "Total Assets": 0}))
        assert zero["netMargin"] is None and zero["assetTurnover"] is None
        # debt 50 - cash 200 + equity 100 = -50: capital base not positive.
        thin = _capability_row(_peer(**{"Cash And Short Term Investments": 200}))
        assert thin["returnOnCapital"] is None
        # debt 50 - cash 30 + equity 100 = 120 -> 20 / 120.
        assert _capability_row(_peer())["returnOnCapital"] == round(20 / 120, 6)

    def test_capex_to_depreciation_is_a_magnitude(self):
        from company_profile.rivals import _capability_row
        assert _capability_row(_peer())["capexToDepreciation"] == 1.5
        neg = _peer(**{"Depreciation And Amortization": -10})
        assert _capability_row(neg)["capexToDepreciation"] == 1.5


class TestRivalValidation:
    def test_more_than_three_rejected(self, conn):
        from company_profile.rivals import get_rival_capabilities
        ps = _load_chip_peers(conn)
        out = get_rival_capabilities(
            conn, "CHIP1", ["CHIP2", "CHIP3", "CHIP4", "CHIP5"], ps, "Technology",
        )
        assert out["applicable"] is False and out["status"] == 400

    def test_duplicates_collapse_before_the_count(self, conn):
        from company_profile.rivals import validate_rivals
        ps = _load_chip_peers(conn)
        cleaned, err = validate_rivals(
            "CHIP1", ["chip2", "CHIP2", "CHIP3", "CHIP3"], ps,
        )
        assert err is None
        assert cleaned == ["CHIP2", "CHIP3"]

    def test_company_itself_is_dropped_not_rejected(self, conn):
        from company_profile.rivals import validate_rivals
        ps = _load_chip_peers(conn)
        cleaned, err = validate_rivals("CHIP1", ["CHIP1", "CHIP2"], ps)
        assert err is None and cleaned == ["CHIP2"]

    def test_rival_outside_industry_rejected(self, conn):
        from company_profile.rivals import get_rival_capabilities
        ps = _load_chip_peers(conn)
        out = get_rival_capabilities(conn, "CHIP1", ["BANK1"], ps, "Technology")
        assert out["applicable"] is False and out["status"] == 400

    def test_company_outside_panel_is_404(self, conn):
        from company_profile.rivals import validate_rivals
        ps = _load_chip_peers(conn)
        _cleaned, err = validate_rivals("NOPE", ["CHIP2"], ps)
        assert err["status"] == 404


class TestRivalsPayload:
    def test_dividends_come_from_the_peer_set_fiscal_year(self, conn):
        """Retention is read off the same fiscal year as the other factors."""
        from company_profile.rivals import dividends_and_earnings
        ps = _load_chip_peers(conn)
        conn.execute(
            'UPDATE financials SET "Dividends Paid" = -30 '
            "WHERE Ticker = 'CHIP1' AND \"Calendar Year\" = '2024'",
        )
        conn.execute(
            'UPDATE financials SET "Dividends Paid" = -999 '
            "WHERE Ticker = 'CHIP1' AND \"Calendar Year\" = '2019'",
        )
        conn.commit()
        got = dividends_and_earnings(conn, ["CHIP1"], ps.fiscal_year)
        assert ps.fiscal_year == 2024
        assert got["CHIP1"]["dividendsPaid"] == 30.0  # sign removed, 2019 ignored

    def test_capability_table_carries_fiscal_year_and_group(self, conn):
        from company_profile.rivals import get_rival_capabilities
        ps = _load_chip_peers(conn)
        out = get_rival_capabilities(conn, "CHIP1", ["CHIP2"], ps, "Technology")
        assert out["applicable"] is True
        assert [c["ticker"] for c in out["capabilities"]] == ["CHIP1", "CHIP2"]
        assert out["fiscalYear"] == ps.fiscal_year
        assert out["peerCount"] == len(ps.peers)
        assert out["groupLabel"]

    def test_group_rivals_carry_share_and_label(self, conn):
        from company_profile.rivals import list_group_rivals
        ps = _load_chip_peers(conn)
        rivals = list_group_rivals("CHIP1", ps, "Technology")
        assert "CHIP1" not in [r["ticker"] for r in rivals]
        for r in rivals:
            assert set(r) == {
                "ticker", "name", "revenueUsd", "revenueShare", "groupLabel",
            }
            assert 0.0 <= r["revenueShare"] <= 1.0
        assert rivals == sorted(rivals, key=lambda r: r["revenueUsd"], reverse=True)

    def test_group_shares_over_the_selected_set_only(self, conn):
        """CHIP1+CHIP2: shares of 1800 in 2024 and of 1350 in 2019; no 2014."""
        from company_profile.rivals import get_rival_capabilities
        ps = _load_chip_peers(conn)
        gs = get_rival_capabilities(
            conn, "CHIP1", ["CHIP2"], ps, "Technology",
        )["groupShares"]
        assert gs["years"] == [2024, 2019, 2014]
        assert gs["complete"] == [True, True, False]
        assert gs["basis"] == "total company revenue, not product-line revenue"
        rows = {r["ticker"]: r["shares"] for r in gs["rows"]}
        assert [r["ticker"] for r in gs["rows"]] == ["CHIP1", "CHIP2"]
        assert rows["CHIP1"] == [round(1000 / 1800, 6), round(700 / 1350, 6), None]
        assert rows["CHIP2"] == [round(800 / 1800, 6), round(650 / 1350, 6), None]

    def test_group_shares_year_is_all_null_when_a_firm_is_missing(self, conn):
        """CHIP4 has no 2019 row, so 2019 is null for EVERY firm, never a
        share of CHIP1+CHIP2 alone."""
        from company_profile.rivals import get_rival_capabilities
        ps = _load_chip_peers(conn)
        gs = get_rival_capabilities(
            conn, "CHIP1", ["CHIP2", "CHIP4"], ps, "Technology", "Chips",
        )["groupShares"]
        assert gs["complete"] == [True, False, False]
        for r in gs["rows"]:
            assert r["shares"][1] is None and r["shares"][2] is None
        assert abs(sum(r["shares"][0] for r in gs["rows"]) - 1.0) < 1e-5

    def test_group_shares_use_usd_revenue(self, conn):
        """TWD filer: its share uses the fx-converted amount."""
        from company_profile.rivals import group_revenue_shares
        ps = _load_chip_peers(conn)
        gs = group_revenue_shares(conn, "Chips", ["CHIP1", "TSM-TW"], 2024, ps)
        tsm_usd = 30000 * 0.031
        assert gs["rows"][1]["shares"][0] == round(tsm_usd / (1000 + tsm_usd), 6)

    def test_data_note_counts_a_small_group(self):
        from company_profile.common import group_data_note
        assert group_data_note(5) is None
        note = group_data_note(2)
        assert "2 firms" in note
        # A count, never a judgement (Rule A).
        for word in ("too few", "unreliable", "weak", "poor", "good"):
            assert word not in note.lower()


# ==============================================================================
# 5. Strategic group identity with connections/
# ==============================================================================

class TestGroupIdentity:
    def test_group_label_matches_connections(self, conn):
        """The label here is the label connections/ assigns the same company."""
        from company_profile.common import company_groups
        from company_profile.cost_structure import build_cost_structure
        from connections.splits import build_margin_split
        from industry_structure.dimensions import default_axes, median_split_groups

        ps = _load_chip_peers(conn)
        mine_all = company_groups(ps, "Technology")
        x, y = default_axes("Technology")
        bundle_all = median_split_groups(
            [{"ticker": p.ticker, "ratios": p.ratios} for p in ps.peers], x, y,
        )
        for tk in ("CHIP1", "CHIP2", "CHIP3", "CHIP4", "CHIP5", "TSM-TW"):
            mine = mine_all.get(tk)
            # connections/bundle.py L182 assigns the displayed group label.
            assert mine == bundle_all.get(tk)
            assert build_cost_structure(tk, ps, "Technology")["groupLabel"] == mine

            # connections/splits.py must report the median of THIS group.
            split = build_margin_split(tk, ps, "Technology")
            if split is not None and mine is not None:
                margins = [
                    float(p.ratios["Operating Income"]) / float(p.ratios["Revenue"])
                    for p in ps.peers if mine_all.get(p.ticker) == mine
                ]
                assert abs(split["groupMedian"] - statistics.median(margins)) < 1e-9


# ==============================================================================
# 6. Cost structure (plan 3.2)
# ==============================================================================

class TestCostStructure:
    def test_differences_are_exact_arithmetic(self, conn):
        from company_profile.cost_structure import build_cost_structure
        ps = _load_chip_peers(conn)
        result = build_cost_structure("CHIP1", ps, "Technology")
        for key in ("cogsToRevenue", "sgaToRevenue", "rdToRevenue",
                    "daToRevenue", "operatingMargin"):
            c = result["company"][key]
            g = result["group"][key]
            d = result["differences"][key]
            if c is not None and g is not None:
                assert abs(d - (c - g)) < 1e-9
            else:
                assert d is None

    def test_bank_without_cogs_gives_nulls(self, conn):
        from company_profile.cost_structure import build_cost_structure
        result = build_cost_structure(
            "BANK1", _load_bank_peers(conn), "Financial Services",
        )
        assert result["company"]["cogsToRevenue"] is None
        assert result["differences"]["cogsToRevenue"] is None
        assert result["company"]["operatingMargin"] is not None

    def test_unknown_company_returns_none(self, conn):
        from company_profile.cost_structure import build_cost_structure
        assert build_cost_structure(
            "NOPE", _load_chip_peers(conn), "Technology",
        ) is None

    def test_carries_fiscal_year_and_peer_count(self, conn):
        """Literal figures: the fixture's Chips panel is six firms at FY2024,
        and CHIP1 lands in the high-R&D, high-value-added group of three.

        Reading the fiscal year and the peer count back off the same peer
        set the builder was handed asserted nothing about the builder."""
        from company_profile.cost_structure import build_cost_structure
        out = build_cost_structure("CHIP1", _load_chip_peers(conn), "Technology")
        assert out["fiscalYear"] == 2024
        assert out["peerCount"] == 6
        assert out["groupBasis"] == "strategicGroup"
        assert out["groupLabel"] == "High R&D intensity, high value-added share"
        assert out["groupFirmCount"] == 3


# ==============================================================================
# 7. Currency invariant
# ==============================================================================

class TestCurrencyInvariant:
    def test_no_ratio_mixes_currencies(self, conn):
        """A TWD filer's ratios are TWD over TWD, never TWD over USD."""
        from company_profile.cost_structure import build_cost_structure
        from company_profile.rivals import _capability_row
        ps = _load_chip_peers(conn)
        tsm = next(p for p in ps.peers if p.ticker == "TSM-TW")
        assert tsm.reported_currency == "TWD"
        assert tsm.revenue_usd != tsm.revenue_local  # the USD figure differs

        cost = build_cost_structure("TSM-TW", ps, "Technology")
        assert abs(cost["company"]["cogsToRevenue"] - 12000 / 30000) < 1e-9

        row = _capability_row(tsm, dividends_paid=800.0)
        assert abs(row["debtToEquity"] - 5000 / 100000) < 1e-9
        # Local net income over local revenue; the USD conversion never enters.
        assert abs(row["sustainableGrowthFactors"]["margin"] - 8000 / 30000) < 1e-6

    def test_revenue_share_is_the_usd_amount(self, conn):
        """Shares are AMOUNTS, so they are FX-converted, unlike the ratios."""
        from company_profile.rivals import list_group_rivals
        ps = _load_chip_peers(conn)
        tsm = next(p for p in ps.peers if p.ticker == "TSM-TW")
        assert abs(tsm.revenue_usd - 30000 * 0.031) < 1e-6
        for r in list_group_rivals("CHIP1", ps, "Technology"):
            if r["ticker"] == "TSM-TW":
                assert abs(r["revenueUsd"] - 30000 * 0.031) < 1e-3


# ==============================================================================
# 8. Spread table (plan 5.2)
# ==============================================================================

_SPREAD_PEERS = {
    "AAA": {"roic": 20.0, "pe": 30.0},
    "BBB": {"roic": 10.0, "pe": 20.0},
    "CCC": {"roic": 5.0, "pe": None},
    "DDD": {"roic": 15.0, "pe": 25.0},
}


def _spread_table(ticker="AAA", group=("AAA", "BBB")):
    from company_profile.spreads import build_spread_table
    return build_spread_table(
        ticker, dict(_SPREAD_PEERS), set(group),
        labels={"roic": "ROIC", "pe": "P/E Ratio"},
        units={"roic": "%", "pe": "x"},
        industry_weighted={"roic": 13.0, "pe": 24.0},
        sector_weighted={"roic": 11.0, "pe": 22.0},
        group_label="High R&D intensity, high value-added share",
        industry="Chips", sector="Technology", fiscal_year=2025,
    )


class TestSpreads:
    def test_group_median_is_populated(self):
        """The column this table exists for is no longer null."""
        m = _spread_table()["metrics"]["roic"]
        assert m["groupMedian"] == statistics.median([20.0, 10.0])
        assert m["gapGroup"] == round(20.0 - 15.0, 6)

    def test_every_column_of_the_plan_is_present(self):
        out = _spread_table()
        for key in ("roic", "pe"):
            m = out["metrics"][key]
            for field in ("company", "industryMedian", "groupMedian",
                          "gapIndustry", "gapGroup", "rank", "count"):
                assert field in m, f"{key} missing {field}"
        assert out["groupLabel"]
        assert out["fiscalYear"] == 2025
        assert out["peerCount"] == 4

    def test_gaps_are_exact_arithmetic(self):
        m = _spread_table()["metrics"]["roic"]
        assert m["gapIndustry"] == round(m["company"] - m["industryMedian"], 6)
        assert m["gapGroup"] == round(m["company"] - m["groupMedian"], 6)
        assert m["gapSector"] == round(m["company"] - m["sectorWeighted"], 6)

    def test_rank_is_descending_and_direction_free(self):
        metrics = _spread_table()["metrics"]
        assert metrics["roic"]["rank"] == 1 and metrics["roic"]["count"] == 4
        assert _spread_table("CCC")["metrics"]["roic"]["rank"] == 4

    def test_nulls_shrink_the_count_not_the_rank_scale(self):
        m = _spread_table()["metrics"]["pe"]
        assert m["count"] == 3  # CCC did not report a P/E
        assert _spread_table("CCC")["metrics"]["pe"]["rank"] is None

    def test_units_are_display_units_and_never_mixed(self):
        """Percent metrics stay x100; nothing in the row is rescaled."""
        out = _spread_table()
        roic = out["metrics"]["roic"]
        assert roic["unit"] == "%" and out["metrics"]["pe"]["unit"] == "x"
        for field in ("company", "industryMedian", "groupMedian",
                      "industryWeighted", "sectorWeighted"):
            assert roic[field] > 1.0, f"{field} looks like a decimal fraction"
        assert "display units" in out["unitsNote"]

    def test_company_outside_its_own_group_still_ranks(self):
        out = _spread_table("CCC", group=("AAA", "BBB"))
        assert out["metrics"]["roic"]["rank"] == 4
        assert out["metrics"]["roic"]["groupMedian"] == statistics.median([20.0, 10.0])

    def test_no_nan_reaches_the_payload(self):
        import json
        from company_profile.spreads import build_spread_table
        out = build_spread_table(
            "AAA",
            {"AAA": {"roic": float("nan")}, "BBB": {"roic": float("inf")},
             "CCC": {"roic": 4.0}},
            {"AAA"}, labels={"roic": "ROIC"}, units={"roic": "%"},
        )
        json.dumps(out, allow_nan=False)
        m = out["metrics"]["roic"]
        assert m["company"] is None and m["count"] == 1


# ==============================================================================
# 9. Snapshot wiring
# ==============================================================================

class TestSnapshotWiring:
    def test_no_duplicate_peer_cache(self):
        """The package uses the shared cache, not a second copy of it."""
        import individualanalysis
        assert not hasattr(individualanalysis, "_cached_load_peers")
        assert not hasattr(individualanalysis, "_PEER_CACHE")
        assert hasattr(individualanalysis, "_company_profile_peers")

    def test_peer_helper_reads_the_shared_cache(self, conn):
        """_company_profile_peers goes through connections/sector_cache."""
        import individualanalysis
        from connections import sector_cache
        sector_cache.clear_sector_cache()
        try:
            ps = individualanalysis._company_profile_peers(conn, "Chips")
            assert ps is not None and len(ps.peers) == 6
            assert "Chips" in sector_cache._panel_cache
            # A second call must not re-query: drop the table and ask again.
            conn.execute("DROP TABLE financials")
            assert individualanalysis._company_profile_peers(conn, "Chips") is ps
        finally:
            sector_cache.clear_sector_cache()

    def test_each_block_is_wrapped_in_its_own_try_except(self):
        """The block contract: a raising builder becomes None, never a 500."""
        import inspect
        import individualanalysis
        src = inspect.getsource(individualanalysis.build_individual_snapshot)
        for marker in ("business profile failed", "cost structure failed",
                       "generic strategy failed"):
            assert marker in src

    def test_a_raising_builder_really_raises(self, conn):
        """Locks the raise the wrapper above is there to catch."""
        from company_profile import cost_structure as cs
        ps = _load_chip_peers(conn)
        with patch.object(cs, "company_groups", side_effect=RuntimeError("boom")):
            with pytest.raises(RuntimeError):
                cs.build_cost_structure("CHIP1", ps, "Technology")


# ==============================================================================
# 9. Financial-sector guard (the same guard backend/connections/ applies)
#
# The bank rows in the fixture above report no cost of revenue at all, so the
# nulls they produce prove nothing about the guard: a missing column nulls
# itself. The real warehouse is the opposite case. JPM's FY2025 row carries a
# "Cost Of Revenue" of 112 billion dollars, which is the vendor folding funding
# cost and credit provisions into the line, and a "Gross Profit Ratio" of
# 0.599. Those produced a 40 percent cost-of-goods share and a 59 percent gross
# margin for a bank, next to a connections block whose own guard said a bank
# has no cost of revenue at all.
#
# So these build a JPM-shaped peer: a lender that DOES report the line.
# ==============================================================================

def _lender_peers():
    """Three lenders, each reporting a vendor-supplied cost of revenue."""
    from industry_structure.peers import Peer, PeerSet
    rows = [
        ("LEND1", 279_745.0, 112_138.0, 167_607.0, 0.599142, 60_018.0, 72_595.0),
        ("LEND2", 191_567.0, 84_145.0, 107_422.0, 0.560754, 52_246.0, 37_695.0),
        ("LEND3", 100_000.0, 45_000.0, 55_000.0, 0.550000, 25_000.0, 20_000.0),
    ]
    peers = [
        Peer(
            ticker=tk, name=tk, revenue_usd=rev, revenue_local=rev,
            reported_currency="USD", calendar_year=2025,
            ratios={
                "Revenue": rev,
                "Cost Of Revenue": cogs,
                "Gross Profit": gp,
                "Gross Profit Ratio": gpr,
                "Selling General And Administrative Expenses": sga,
                "Operating Income": op,
                "Research And Development Expenses": 0.0,
                "Depreciation And Amortization": rev * 0.03,
                "Property Plant Equipment Net": rev * 0.1,
                "Total Debt": rev * 2,
                "Total Stockholders Equity": rev * 1.3,
            },
        )
        for tk, rev, cogs, gp, gpr, sga, op in rows
    ]
    return PeerSet(peers=peers, fiscal_year=2025, group_name="Banks - Diversified")


class TestFinancialGuardOnCompanyProfile:
    def test_cost_structure_withdraws_a_lenders_cost_of_goods(self):
        from company_profile.cost_structure import build_cost_structure
        out = build_cost_structure(
            "LEND1", _lender_peers(), "Financial Services", "Banks - Diversified",
        )
        assert out["company"]["cogsToRevenue"] is None
        assert out["group"]["cogsToRevenue"] is None
        assert out["differences"]["cogsToRevenue"] is None
        assert out["isFinancial"] is True
        assert "cogsToRevenue" in out["notApplicable"]
        # The rows a bank really does report survive.
        assert out["company"]["sgaToRevenue"] == pytest.approx(60_018.0 / 279_745.0, abs=5e-7)
        assert out["company"]["operatingMargin"] == pytest.approx(72_595.0 / 279_745.0, abs=5e-7)

    def test_cost_structure_is_byte_identical_for_a_non_financial(self, conn):
        from company_profile.cost_structure import build_cost_structure
        ps = _load_chip_peers(conn)
        before = build_cost_structure("CHIP1", ps, "Technology")
        after = build_cost_structure("CHIP1", ps, "Technology", "Chips")
        for key in ("company", "group", "differences", "groupLabel", "groupFirmCount"):
            assert before[key] == after[key]
        assert after["isFinancial"] is False
        assert after["notApplicable"] == {}

    def test_generic_strategy_withdraws_both_cost_blocks_for_a_lender(self):
        from company_profile.generic_strategy import build_generic_strategy
        out = build_generic_strategy(
            "LEND1", _lender_peers(), 4, "Financial Services", "Banks - Diversified",
        )
        # Every number in the two guarded blocks goes, including the rank: a
        # rank among figures that do not mean anything is not a rank.
        assert out["costOfGoodsPlusSgaToRevenue"] == {
            "value": None, "rank": None, "count": None,
        }
        assert out["grossMarginGap"] == {
            "value": None, "companyGrossMargin": None,
            "industryMedianGrossMargin": None, "rank": None, "count": None,
        }
        assert out["isFinancial"] is True
        assert set(out["notApplicable"]) == {
            "costOfGoodsPlusSgaToRevenue", "grossMarginGap",
        }
        # SG&A and revenue share are real for a bank and keep their ranks.
        assert out["sgaToRevenue"]["value"] == pytest.approx(60_018.0 / 279_745.0, abs=5e-7)
        assert out["revenueShare"]["rank"] == 1

    def test_generic_strategy_unguarded_would_have_printed_the_figures(self):
        """The guard is doing work, not restating a null.

        Without a sector the same lender produces a 61.5 percent cost share and
        a 4.9 point gross-margin gap, which is what the page printed.
        """
        from company_profile.generic_strategy import build_generic_strategy
        out = build_generic_strategy("LEND1", _lender_peers(), 4)
        assert out["costOfGoodsPlusSgaToRevenue"]["value"] == pytest.approx(
            (112_138.0 + 60_018.0) / 279_745.0, abs=5e-7)
        assert out["grossMarginGap"]["companyGrossMargin"] == pytest.approx(0.599142, abs=5e-7)
        assert out["isFinancial"] is False

    def test_generic_strategy_is_unchanged_for_a_non_financial(self, conn):
        from company_profile.generic_strategy import build_generic_strategy
        ps = _load_chip_peers(conn)
        before = build_generic_strategy("CHIP1", ps, 3)
        after = build_generic_strategy("CHIP1", ps, 3, "Technology", "Chips")
        for key in ("costOfGoodsPlusSgaToRevenue", "grossMarginGap",
                    "rdToRevenue", "sgaToRevenue", "revenueShare"):
            assert before[key] == after[key]
        assert after["isFinancial"] is False

    def test_insurance_is_a_lender_but_real_estate_is_not(self):
        """The guard is asked WITHOUT real estate, matching connections/.

        A REIT's cost of revenue is a real property operating cost, so nulling
        it here would disagree with every other surface that shows it.
        """
        from company_profile.cost_structure import build_cost_structure
        ins = build_cost_structure(
            "LEND1", _lender_peers(), "Industrials", "Insurance brokers")
        assert ins["isFinancial"] is True
        reit = build_cost_structure(
            "LEND1", _lender_peers(), "Real Estate", "REIT - Office")
        assert reit["isFinancial"] is False
        assert reit["company"]["cogsToRevenue"] is not None


class TestSpreadHistory:
    """Per-year medians use the same true-median rule as the latest table."""

    _HIST = {
        "AAA": {"roic": {2022: 18.0, 2023: 20.0, 2024: 22.0}},
        "BBB": {"roic": {2023: 10.0, 2024: 12.0}},
        "CCC": {"roic": {2022: 4.0, 2023: 6.0, 2024: 8.0}},
        "DDD": {"roic": {2024: 30.0}},
    }

    def test_medians_per_year(self):
        from company_profile.spreads import build_spread_history
        out = build_spread_history("aaa", self._HIST, {"AAA", "BBB"})
        rows = {r["year"]: r for r in out["roic"]}
        assert [r["year"] for r in out["roic"]] == [2022, 2023, 2024]
        # 2022: two firms reported, below MIN_HISTORY_REPORTERS -> null medians.
        assert rows[2022] == {"year": 2022, "company": 18.0,
                              "industryMedian": None, "groupMedian": None,
                              "industryCount": 2, "groupCount": 1}
        assert rows[2023]["industryMedian"] == 10.0   # 20, 10, 6
        assert rows[2023]["groupMedian"] is None      # 2 group firms only
        assert rows[2024]["industryMedian"] == 17.0   # 22, 12, 8, 30
        assert rows[2024]["industryCount"] == 4

    def test_group_median_with_enough_firms(self):
        from company_profile.spreads import build_spread_history
        out = build_spread_history("AAA", self._HIST, {"AAA", "BBB", "CCC"})
        rows = {r["year"]: r for r in out["roic"]}
        assert rows[2024]["groupMedian"] == 12.0      # 22, 12, 8
        assert rows[2023]["groupMedian"] == 10.0      # 20, 10, 6

    def test_limited_to_last_years_and_company_metrics_only(self):
        from company_profile.spreads import build_spread_history
        out = build_spread_history("AAA", self._HIST, {"AAA"}, max_years=2)
        assert [r["year"] for r in out["roic"]] == [2023, 2024]
        assert build_spread_history("NOPE", self._HIST, set()) == {}
