"""Regression tests for the 2026-09-20 read-only review findings.

One test (or one class) per finding id: C1, C2, H1, H2, H3, H4, H6, H7,
H8, H9, plus the payload-serialization sweep and one characterization
test against the real ``financials.db`` when it is present.

Network-free. Every fixture is a tiny SQLite file built in tmp_path.
"""

from __future__ import annotations

import json
import math
import os
import sqlite3
import sys
from datetime import date

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from connections.bundle import build_connections, resolve_ticker_alias
from connections.economy import _latest_and_prior, build_economy_block
from connections.financial_guard import is_financial
from connections.sector_cache import clear_sector_cache
from connections.splits import build_margin_split
from industry_structure.dimensions import default_axes, median_split_groups
from industry_structure.groups import build_strategic_groups, build_share_return
from industry_structure.panel import (
    NET_ENTRY_REPORTING_LAG,
    load_industry_panel,
    net_entry_window,
    panel_net_entry,
)
import fixture_db
from industry_structure.dedupe import dedupe_listings
from industry_structure.peers import (
    Peer,
    PeerSet,
    load_peers,
    pick_year_detail,
    top5_share_change_detail,
)
from industry_structure.profit_pool import build_profit_pool
from industry_structure.ranks import build_cross_industry_medians, clear_cache
from industry_structure.sector_pool import build_sector_pool
from industry_structure.structure import build_industry_structure
from industry_structure.value_system import build_value_system

_COLUMNS = fixture_db.COLUMNS
_create_schema = fixture_db.create_schema
_insert = fixture_db.insert_row


def build_review_fixture(path: str) -> None:
    """Two Tech industries, one Financials industry, a cross-listed pair."""
    conn = sqlite3.connect(path)
    _create_schema(conn)

    def _ticker(tk, name, sector, industry):
        conn.execute(
            "INSERT OR IGNORE INTO tickers VALUES (?, ?, ?, ?)",
            (tk, name, sector, industry),
        )

    # Chips: 14 firms. The first four carry high R&D so the median split
    # lands differently over the top 4 than over all 14 (finding C2).
    for i in range(14):
        tk = f"CH{i}"
        _ticker(tk, f"Chip {i}", "Tech", "Chips")
        rd_share = 0.25 if i < 4 else 0.02
        for yr, scale in ((2019, 0.6), (2024, 1.0)):
            rev = (2000 - i * 120) * scale
            _insert(
                conn, tk, yr, rev=rev, rd=rev * rd_share,
                cogs=rev * (0.5 + i * 0.01),
                op=rev * (0.20 - i * 0.01),
            )

    # A cross-listed pair inside Chips: same revenue, currency, year and net
    # income; CHX_US carries the larger USD market cap (finding H2).
    for tk, mc in (("CHX", 900.0), ("CHX.AS", 100.0)):
        _ticker(tk, "Twin Listing", "Tech", "Chips")
        for yr in (2019, 2024):
            _insert(conn, tk, yr, rev=700.0 if yr == 2024 else 500.0,
                    mc=mc, ni=42.0)

    # Gear: 12 firms, thinner margins, so the Tech sector median differs
    # from the Chips median (finding C1).
    for i in range(12):
        tk = f"GR{i}"
        _ticker(tk, f"Gear {i}", "Tech", "Gear")
        for yr, scale in ((2019, 0.7), (2024, 1.0)):
            rev = (900 - i * 50) * scale
            _insert(conn, tk, yr, rev=rev, op=rev * 0.02, rd=rev * 0.01)

    # A Tech row whose industry label is NULL: the sector pool has to drop
    # it from both numerator and denominator (finding H6).
    conn.execute("INSERT INTO tickers VALUES ('NOIND', 'No Industry', 'Tech', NULL)")
    for yr in (2019, 2024):
        _insert(conn, "NOIND", yr, rev=5000.0, op=1500.0)

    # Financial Services: the credit ratios must come back null (H7).
    for i in range(11):
        tk = f"BK{i}"
        _ticker(tk, f"Bank {i}", "Financial Services", "Banks - Diversified")
        for yr in (2019, 2024):
            rev = 3000 - i * 100
            _insert(conn, tk, yr, rev=rev, cogs=0.0, gpr=1.0,
                    ie=-rev * 0.4, op=rev * 0.25)

    # An early exit and a late filer, for the net-entry rule (H4).
    _ticker("GONE", "Gone Co", "Tech", "Chips")
    for yr in (2019, 2020):
        _insert(conn, "GONE", yr, rev=111.0)
    _ticker("LATE", "Late Filer", "Tech", "Chips")
    for yr in (2019, 2023):
        _insert(conn, "LATE", yr, rev=222.0)

    conn.execute(
        "INSERT INTO security_map (symbol, cik, is_primary, status, valid_to) VALUES ('GONE', '0000000123', 1, 'delisted', '2020-06-01')"
    )
    conn.execute(
        "INSERT INTO security_map (symbol, cik, is_primary, status, valid_to) VALUES ('CH0', '0000000999', 1, 'active', NULL)"
    )
    conn.execute(
        "INSERT INTO security_map (symbol, cik, is_primary, status, valid_to) VALUES ('CH0-PA', '0000000999', 0, 'active', NULL)"
    )
    conn.commit()
    conn.close()


@pytest.fixture
def rconn(tmp_path):
    path = str(tmp_path / "review.db")
    build_review_fixture(path)
    c = sqlite3.connect(path)
    c.row_factory = sqlite3.Row
    clear_cache()
    clear_sector_cache()
    yield c
    c.close()
    clear_cache()
    clear_sector_cache()


# ── C1 ──────────────────────────────────────────────────────────────────────

class TestC1IndustryMedianOperatingMargin:

    def test_industry_block_uses_its_own_peers_not_the_sector(self, rconn):
        """Literal figures, not a recompute of the implementation.

        The fixture's Chips firms all run a 0.13 operating margin and its
        Gear firms a thinner one, so the industry median and the sector
        median are different numbers by construction. Re-deriving the
        median inside the test would have passed against the bug this
        guards, which returned the SECTOR median under the industry key.
        """
        payload = build_connections(rconn, industry="Chips")
        assert payload["industry"]["medianOperatingMargin"] == 0.13
        assert payload["sector"]["medianOperatingMargin"] == 0.085

    def test_five_years_ago_is_present_for_industry_and_sector(self, rconn):
        payload = build_connections(rconn, industry="Chips")
        assert payload["industry"]["medianOperatingMargin5yAgo"] is not None
        assert payload["sector"]["medianOperatingMargin5yAgo"] is not None


# ── C2 ──────────────────────────────────────────────────────────────────────

class TestC2OneGroupPerCompany:

    def test_median_split_over_all_peers_equals_group_map_group(self, rconn):
        result = build_strategic_groups(rconn, "Chips", limit=4)
        ps = load_peers(rconn, "Chips")
        x_key, y_key = default_axes("Tech")
        expected = median_split_groups(
            [{"ticker": p.ticker, "ratios": p.ratios} for p in ps.peers],
            x_key, y_key,
        )
        for firm in result["firms"]:
            assert firm["group"] == expected[firm["ticker"]]

    def test_group_map_agrees_with_the_connections_block(self, rconn):
        result = build_strategic_groups(rconn, "Chips", limit=4)
        plotted = {f["ticker"]: f["group"] for f in result["firms"]}
        assert plotted, "the fixture must plot at least one firm"
        for ticker, label in plotted.items():
            payload = build_connections(rconn, ticker=ticker)
            assert payload["company"]["group"]["label"] == label

    def test_limit_only_trims_the_plotted_list(self, rconn):
        wide = build_strategic_groups(rconn, "Chips", limit=40)
        narrow = build_strategic_groups(rconn, "Chips", limit=4)
        assert narrow["plotted"] == 4
        assert narrow["available"] == wide["available"]
        # The summaries describe the whole group either way.
        assert (
            sorted((g["label"], g["firmCount"]) for g in narrow["groups"])
            == sorted((g["label"], g["firmCount"]) for g in wide["groups"])
        )

    def test_margin_split_group_matches_too(self, rconn):
        ps = load_peers(rconn, "Chips")
        split = build_margin_split("CH0", ps, "Tech")
        payload = build_connections(rconn, ticker="CH0")
        assert split["group"] == payload["company"]["group"]["label"]


# ── H1 ──────────────────────────────────────────────────────────────────────

def _macro_db(tmp_path, rows, name="macro.db"):
    path = str(tmp_path / name)
    conn = sqlite3.connect(path)
    conn.execute(
        "CREATE TABLE macro_series (series_id TEXT, date TEXT, value REAL)"
    )
    conn.executemany("INSERT INTO macro_series VALUES (?, ?, ?)", rows)
    conn.commit()
    conn.close()
    return path


class TestH1TwelveMonthChange:

    def test_prior_is_the_last_print_on_or_before_minus_twelve_months(self, tmp_path):
        rows = [("T10YIE", f"2025-{m:02d}-01", 2.0 + m * 0.1) for m in range(1, 13)]
        rows += [("T10YIE", f"2026-{m:02d}-01", 3.0 + m * 0.1) for m in range(1, 10)]
        path = _macro_db(tmp_path, rows)
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        try:
            out = _latest_and_prior(conn, "T10YIE", today=date(2026, 9, 10))
        finally:
            conn.close()
        assert out["asOf"] == "2026-09-01"
        assert out["priorDate"] == "2025-09-01"
        assert out["value"] == pytest.approx(3.9)
        assert out["priorValue"] == pytest.approx(2.9)
        assert out["change12m"] == pytest.approx(1.0)

    def test_taking_the_365th_row_would_reach_further_back(self, tmp_path):
        """The old rule took ``LIMIT 365`` rows, about 17.5 months of daily
        prints, and reported that as a twelve-month change."""
        rows = [
            ("DGS10", f"2025-{m:02d}-{d:02d}", 4.0)
            for m in range(1, 13) for d in (1, 15)
        ]
        rows += [
            ("DGS10", f"2026-{m:02d}-{d:02d}", 5.0)
            for m in range(1, 10) for d in (1, 15)
        ]
        path = _macro_db(tmp_path, rows, "daily.db")
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        try:
            out = _latest_and_prior(conn, "DGS10", today=date(2026, 9, 20))
            oldest = conn.execute(
                "SELECT date FROM macro_series WHERE series_id='DGS10'"
                " ORDER BY date DESC LIMIT 365"
            ).fetchall()[-1]["date"]
        finally:
            conn.close()
        assert out["priorDate"].startswith("2025-09")
        assert oldest < out["priorDate"]

    def test_change_is_null_when_the_series_is_shorter_than_a_year(self, tmp_path):
        rows = [("DGS1", "2026-08-01", 4.0), ("DGS1", "2026-09-01", 4.2)]
        path = _macro_db(tmp_path, rows, "short.db")
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        try:
            out = _latest_and_prior(conn, "DGS1", today=date(2026, 9, 10))
        finally:
            conn.close()
        assert out["value"] == pytest.approx(4.2)
        assert out["change12m"] is None
        assert "twelve months" in out["reason"]

    def test_a_stale_daily_series_is_nulled_with_a_reason(self, tmp_path):
        rows = [("DGS10", "2026-01-05", 4.0), ("DGS10", "2025-01-05", 3.0)]
        path = _macro_db(tmp_path, rows, "stale.db")
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        try:
            out = _latest_and_prior(conn, "DGS10", today=date(2026, 9, 20))
        finally:
            conn.close()
        assert out["stale"] is True
        assert out["value"] is None
        assert out["change12m"] is None
        assert out["asOf"] == "2026-01-05"
        assert "45 days" in out["reason"]

    def test_missing_market_db_still_returns_the_full_shape(self, tmp_path, monkeypatch):
        monkeypatch.setenv("MARKET_DATA_DB", str(tmp_path / "nope.db"))
        block = build_economy_block()
        for key in ("tenYearYield", "oneYearYield", "breakeven10y"):
            assert set(block[key]) == {
                "value", "change12m", "asOf", "priorDate", "priorValue",
                "stale", "reason",
            }


# ── H2 ──────────────────────────────────────────────────────────────────────

class TestH2CrossListings:

    def _twin(self, ticker, mc, ni=42.0, rev=700.0):
        return Peer(
            ticker=ticker, name=ticker, revenue_usd=rev, revenue_local=rev,
            reported_currency="USD", calendar_year=2024,
            ratios={"Revenue": rev, "Net Income": ni, "Market Cap": mc},
            usd_per_unit=1.0,
        )

    def test_larger_usd_market_cap_survives(self):
        kept, dropped = dedupe_listings([
            self._twin("SMALL.AS", 100.0), self._twin("BIG", 900.0),
        ])
        assert dropped == 1
        assert [p.ticker for p in kept] == ["BIG"]

    def test_tie_falls_back_to_the_sec_registered_line(self):
        kept, dropped = dedupe_listings([
            self._twin("AGN.AS", None), self._twin("AEG", None),
        ])
        assert dropped == 1
        assert kept[0].ticker == "AEG"

    def test_different_net_income_is_not_the_same_issuer(self):
        kept, dropped = dedupe_listings([
            self._twin("ONE", 100.0, ni=10.0), self._twin("TWO", 200.0, ni=20.0),
        ])
        assert dropped == 0
        assert len(kept) == 2

    def test_different_revenue_is_not_the_same_issuer(self):
        kept, dropped = dedupe_listings([
            self._twin("ONE", 100.0, rev=700.0), self._twin("TWO", 200.0, rev=701.0),
        ])
        assert dropped == 0

    def test_the_peer_loader_drops_them_once_for_everyone(self, rconn):
        ps = load_peers(rconn, "Chips")
        tickers = [p.ticker for p in ps.peers]
        assert "CHX" in tickers
        assert "CHX.AS" not in tickers
        assert ps.duplicate_listings_dropped == 1

        payload = build_connections(rconn, industry="Chips")
        assert payload["industry"]["duplicateListingsDropped"] == 1
        assert "CHX.AS" not in [r["ticker"] for r in payload["exposures"]]


# ── H3 ──────────────────────────────────────────────────────────────────────

class TestH3Top5ShareChange:

    def test_a_firm_absent_five_years_ago_is_excluded(self):
        now = PeerSet(
            peers=[
                Peer("A", "A", 500, 500, "USD", 2024),
                Peer("NEW", "NEW", 500, 500, "USD", 2024),
            ],
            fiscal_year=2024, group_name="T",
        )
        then = PeerSet(
            peers=[Peer("A", "A", 500, 500, "USD", 2019)],
            fiscal_year=2019, group_name="T",
        )
        out = top5_share_change_detail(now, then)
        # A went from 100% to 50%, so 50 points over the one comparable firm.
        assert out["firmsCompared"] == 1
        assert out["value"] == pytest.approx(50.0)

    def test_firms_compared_reaches_the_payload(self, rconn):
        payload = build_connections(rconn, industry="Chips")
        assert payload["industry"]["top5ShareChangeFirmsCompared"] >= 1


# ── H4 ──────────────────────────────────────────────────────────────────────

class TestH4NetEntry:

    def test_a_late_filer_is_not_an_exit(self, rconn):
        panel = load_industry_panel(rconn, "Chips")
        window = net_entry_window(panel.fiscal_year)
        assert window == (
            panel.fiscal_year - 5, panel.fiscal_year - NET_ENTRY_REPORTING_LAG,
        )
        # LATE last reported 2023, inside the lag, so it must not count.
        assert panel.ticker_spans["LATE"][1] == 2023
        assert panel_net_entry(panel, panel.fiscal_year) is not None

    def test_a_delisted_symbol_inside_the_window_is_an_exit(self, rconn):
        panel = load_industry_panel(rconn, "Chips")
        assert panel.delisted_year.get("GONE") == 2020
        with_delisted = panel_net_entry(panel, 2024, window=5)
        panel.delisted_year = {}
        without = panel_net_entry(panel, 2024, window=5)
        assert with_delisted == without  # GONE's last year is 2020 either way

    def test_the_window_is_stated_in_the_payload(self, rconn):
        payload = build_industry_structure(rconn, "Chips")
        assert payload["netEntryWindow"] == list(
            net_entry_window(payload["fiscalYear"])
        )
        evo = payload["evolution"]
        assert evo["netEntryWindow"] == payload["netEntryWindow"]
        assert "2019" in evo["netEntryRule"]
        last_plotted = max(p["year"] for p in evo["netEntry"])
        assert last_plotted <= payload["fiscalYear"] - NET_ENTRY_REPORTING_LAG


# ── H6 ──────────────────────────────────────────────────────────────────────

class TestH6ShareOfSector:

    def test_both_endpoints_agree_on_the_share_and_the_year(self, rconn):
        pool = build_profit_pool(rconn, "Tech")
        conn_payload = build_connections(rconn, industry="Chips")
        ind = conn_payload["industry"]

        row = next(r for r in pool["industries"] if r["industry"] == "Chips")
        assert ind["sectorFiscalYear"] == pool["fiscalYear"]
        assert ind["shareOfSectorRevenue"] == pytest.approx(row["revenueShare"])
        assert ind["shareOfSectorProfit"] == pytest.approx(row["profitShare"])

    def test_null_industry_rows_are_dropped_from_both_sides(self, rconn):
        pool = build_profit_pool(rconn, "Tech")
        assert pool["nullIndustryRowsDropped"] == 1
        shares = [r["revenueShare"] for r in pool["industries"]]
        assert sum(shares) == pytest.approx(1.0, abs=1e-6)
        assert "NOIND" not in {r["industry"] for r in pool["industries"]}

    def test_the_sector_pool_is_measured_at_the_sectors_own_year(self, rconn):
        pool = build_sector_pool(rconn, "Tech")
        detail = pick_year_detail(rconn, "Tech", group_col="sector")
        assert pool["fiscalYear"] == detail["fiscalYear"]


# ── H7 ──────────────────────────────────────────────────────────────────────

class TestH7Financials:

    def test_sector_and_keyword_both_trigger_the_guard(self):
        assert is_financial("Financial Services", "Banks - Diversified")
        assert is_financial("Industrials", "Insurance brokers")
        assert not is_financial("Technology", "Semiconductors")
        # Real Estate keeps net debt to EBITDA: the app computes it there.
        assert not is_financial("Real Estate", "REIT - Office")

    def test_a_bank_gets_nulls_and_reasons_on_every_block(self, rconn):
        payload = build_connections(rconn, ticker="BK0")
        company = payload["company"]
        assert company["isFinancial"] is True
        assert company["interestCoverage"] is None
        assert company["syntheticRating"] is None
        assert company["interestPerPoint"] is None
        assert set(company["notApplicable"]) >= {
            "interestCoverage", "syntheticRating", "interestPerPoint",
            "grossMargin",
        }
        # The gross-margin years keep their keys (finding M9).
        assert company["grossMargin"]
        assert all(v is None for v in company["grossMargin"].values())

        industry = payload["industry"]
        assert industry["isFinancial"] is True
        assert industry["medianInterestCoverage"] is None
        assert industry["medianNetDebtToEbitda"] is None

        sector = payload["sector"]
        assert sector["isFinancial"] is True
        assert sector["shareCoverageBelow2"] is None

        for row in payload["exposures"]:
            assert row["interestCoverage"] is None
            assert row["netDebtToEbitda"] is None
            assert row["notApplicable"]

    def test_a_non_financial_is_untouched(self, rconn):
        payload = build_connections(rconn, ticker="CH0")
        assert payload["company"]["isFinancial"] is False
        assert payload["company"]["interestCoverage"] is not None
        assert payload["industry"]["medianInterestCoverage"] is not None


# ── H8 ──────────────────────────────────────────────────────────────────────

class TestH8Currency:

    def _eur_fixture(self, tmp_path):
        path = str(tmp_path / "eur.db")
        conn = sqlite3.connect(path)
        _create_schema(conn)
        for i in range(11):
            tk = f"EU{i}"
            conn.execute(
                "INSERT INTO tickers VALUES (?, ?, ?, ?)",
                (tk, f"Euro {i}", "Tech", "Chips"),
            )
            for yr in (2019, 2024):
                _insert(conn, tk, yr, rev=1000.0 - i * 50, ccy="EUR",
                        debt=400.0)
        conn.commit()
        conn.close()
        c = sqlite3.connect(path)
        c.row_factory = sqlite3.Row
        return c

    def test_local_money_gets_a_usd_companion_and_a_currency(self, tmp_path):
        conn = self._eur_fixture(tmp_path)
        try:
            payload = build_connections(conn, ticker="EU0")
        finally:
            conn.close()
        company = payload["company"]
        assert company["reportingCurrency"] == "EUR"
        assert company["totalDebt"] == pytest.approx(400.0)
        assert company["totalDebtUsd"] == pytest.approx(440.0)
        assert company["operatingIncomeUsd"] == pytest.approx(
            company["operatingIncome"] * 1.1
        )
        assert company["interestPerPointUsd"] == pytest.approx(4.4)

    def test_unknown_currency_leaves_the_usd_fields_null(self, tmp_path):
        conn = self._eur_fixture(tmp_path)
        try:
            conn.execute("DELETE FROM fx_rates WHERE currency = 'EUR'")
            conn.commit()
            payload = build_connections(conn, ticker="EU0")
        finally:
            conn.close()
        # Every row drops out of the peer set, so there is no company block
        # to mis-label: the contract is that a USD figure is never invented.
        company = payload["company"]
        assert company["totalDebtUsd"] is None or company["reportingCurrency"]


# ── H9 ──────────────────────────────────────────────────────────────────────

class TestH9Percentiles:

    def test_cr4_cr8_hhi_and_cagr_are_ranked(self, rconn):
        payload = build_industry_structure(rconn, "Chips")
        conc = payload["concentration"]
        for key in ("cr4", "cr8", "hhi"):
            assert conc[key]["percentile"] is not None, key
            assert 0.0 <= conc[key]["percentile"] <= 1.0
        cagr = payload["rivalryEvidence"]["revenueCagr5y"]
        assert cagr["percentile"] is not None

    def test_the_cross_industry_table_carries_the_industry_level_keys(self, rconn):
        table = build_cross_industry_medians(rconn, 2024)
        assert "Chips" in table and "Gear" in table
        for ind in ("Chips", "Gear"):
            assert set(table[ind]) >= {"cr4", "cr8", "hhi", "revenueCagr5y"}

    def test_the_ranking_rows_use_the_displayed_recipe(self, rconn):
        """Finding M8: the cross-industry pass joins fx_rates and drops the
        cross-listed twin, exactly like ``load_peers``, so the ranked HHI
        is the HHI the page prints."""
        table = build_cross_industry_medians(rconn, 2024)
        ps = load_peers(rconn, "Chips")
        # The displayed figures, as literals: 15 firms after the
        # cross-listed twin is collapsed.
        assert len(ps.peers) == 15
        assert ps.hhi() == pytest.approx(778.2786994145417, abs=1e-9)
        assert ps.cr4() == pytest.approx(0.40944881889763785, abs=1e-12)
        # ... and the ranking pass reproduces them exactly, which is the
        # property finding M8 was about.
        assert table["Chips"]["hhi"] == pytest.approx(778.2786994145417, abs=1e-9)
        assert table["Chips"]["cr4"] == pytest.approx(0.40944881889763785, abs=1e-12)


# ── NEW: scope, alias guard ─────────────────────────────────────────────────

class TestNewContract:

    def test_scope_economy_returns_only_the_macro_blocks(self, rconn):
        payload = build_connections(rconn, scope="economy")
        assert set(payload) == {"scope", "economy", "credit"}

    def test_build_connections_folds_an_alias_itself(self, rconn):
        payload = build_connections(rconn, ticker="ch0-pa")
        assert payload["company"]["ticker"] == "CH0"

    def test_an_unknown_ticker_degrades_instead_of_raising(self, rconn):
        payload = build_connections(rconn, ticker="NOSUCH")
        assert payload["company"] is None

    def test_an_exchange_suffix_keeps_its_dot(self, rconn):
        """CLAUDE.md's dot->dash trap: an unconditional replace sends every
        foreign listing to a symbol that does not exist."""
        assert resolve_ticker_alias(rconn, "chx.as") == "CHX.AS"
        payload = build_connections(rconn, ticker="CHX.AS")
        assert payload["company"]["ticker"] == "CHX.AS"


# ── M7 ──────────────────────────────────────────────────────────────────────

class TestM7ValueSystem:

    def test_counts_and_years_on_every_side(self, rconn):
        out = build_value_system(rconn, "Chips", supplier="Gear",
                                 buyer="Banks - Diversified")
        for side in ("focal", "supplier", "buyer"):
            block = out[side]
            assert block["fiscalYear"] is not None
            assert block["firmCount"] > 0
            assert "thinPeerSet" in block

    def test_a_thin_partner_keeps_its_raw_figures(self, tmp_path):
        path = str(tmp_path / "thin.db")
        conn = sqlite3.connect(path)
        _create_schema(conn)
        for i in range(3):
            conn.execute(
                "INSERT INTO tickers VALUES (?, ?, ?, ?)",
                (f"TH{i}", f"Thin {i}", "Tech", "Thin"),
            )
            for yr in (2019, 2024):
                _insert(conn, f"TH{i}", yr, rev=100.0 + i)
        conn.commit()
        conn.close()
        c = sqlite3.connect(path)
        c.row_factory = sqlite3.Row
        try:
            out = build_value_system(c, "Thin")
        finally:
            c.close()
        focal = out["focal"]
        assert focal["thinPeerSet"] is True
        assert focal["firmCount"] == 3
        assert focal["hhi"] is not None
        assert focal["medianOperatingMargin"] is not None


# ── H5 and M1: cache behaviour ──────────────────────────────────────────────

class TestH5CacheClear:

    def test_clearing_drops_the_side_caches_too(self, rconn):
        from connections import sector_cache
        from industry_structure import ranks

        build_connections(rconn, industry="Chips")
        build_cross_industry_medians(rconn, 2024)
        assert sector_cache.cache_sizes()["panels"] >= 1
        assert ranks._cache

        sector_cache.clear_sector_cache()
        ranks.clear_cache()
        assert sector_cache.cache_sizes() == {
            "panels": 0, "episodes": 0, "pools": 0,
        }
        assert not ranks._cache

    def test_api_invalidate_cache_reaches_them(self, rconn):
        """`POST /api/cache/clear` promises everything.

        ``api.py#_clear_side_caches`` now makes ONE call,
        ``side_caches.clear_side_caches(prefix)``, which runs whatever the
        cache-owning modules registered. This exercises that call, without
        importing the whole app.
        """
        import side_caches
        from connections import sector_cache
        from industry_structure import ranks

        build_connections(rconn, industry="Chips")
        build_cross_industry_medians(rconn, 2024)
        assert sector_cache.cache_sizes()["panels"] >= 1
        assert ranks._cache

        cleared = side_caches.clear_side_caches("db")

        assert set(cleared) == {
            "connections.sector_cache",
            "connections.economy",
            "industry_structure.ranks",
        }
        assert sector_cache.cache_sizes()["panels"] == 0
        assert not ranks._cache

    def test_econ_invalidation_reaches_the_macro_cache_only(self):
        """The marketdata scheduler clears with "econ". That must drop the
        macro blocks, and must NOT throw away the industry panels."""
        import side_caches

        cleared = side_caches.clear_side_caches("econ")
        assert cleared == ["connections.economy"]


class TestM1SingleFlight:

    def test_eight_concurrent_cold_requests_build_once(self, tmp_path):
        import threading
        from connections import sector_cache

        path = str(tmp_path / "flight.db")
        build_review_fixture(path)

        builds = []
        real = sector_cache.load_industry_panel

        def counting(conn, industry):
            builds.append(industry)
            return real(conn, industry)

        sector_cache.load_industry_panel = counting
        try:
            sector_cache.clear_sector_cache()
            results = []
            barrier = threading.Barrier(8)

            def worker():
                own = sqlite3.connect(path)
                own.row_factory = sqlite3.Row
                barrier.wait()
                results.append(sector_cache.get_industry_panel(own, "Chips"))
                own.close()

            threads = [threading.Thread(target=worker) for _ in range(8)]
            for t in threads:
                t.start()
            for t in threads:
                t.join()
        finally:
            sector_cache.load_industry_panel = real

        assert len(results) == 8
        assert all(r is not None for r in results)
        assert len(builds) == 1

    def test_the_panel_cache_is_bounded(self, rconn):
        from connections import sector_cache

        sector_cache.clear_sector_cache()
        for i in range(sector_cache._MAX_PANELS + 6):
            sector_cache._panel_cache.put(f"ind{i}", object())
        assert len(sector_cache._panel_cache) == sector_cache._MAX_PANELS


# ── Serialization sweep ─────────────────────────────────────────────────────

def _hostile_fixture(path):
    """Zero revenue peers, negative profit, missing columns, one firm."""
    conn = sqlite3.connect(path)
    _create_schema(conn)
    conn.execute("INSERT INTO tickers VALUES ('Z1','Zero','Tech','Void')")
    conn.execute("INSERT INTO tickers VALUES ('Z2','Neg','Tech','Void')")
    conn.execute("INSERT INTO tickers VALUES ('Z3','Odd','Tech','Void')")
    for yr in (2019, 2024):
        _insert(conn, "Z1", yr, rev=0.000001, op=0.0, ie=0.0, debt=0.0,
                ni=None, mc=None)
        _insert(conn, "Z2", yr, rev=50.0, op=-9999.0, gpr=None, cogs=None,
                ie=0.0, debt=None)
        _insert(conn, "Z3", yr, rev=1e13, op=1e12, gpr=1.0, ccy="XXX")
    conn.commit()
    conn.close()


class TestPayloadsSerialize:
    """Every builder's payload must survive ``allow_nan=False``: a NaN or an
    Infinity serializes to invalid JSON that the browser refuses."""

    @pytest.fixture
    def hostile(self, tmp_path):
        path = str(tmp_path / "hostile.db")
        _hostile_fixture(path)
        c = sqlite3.connect(path)
        c.row_factory = sqlite3.Row
        clear_cache()
        clear_sector_cache()
        yield c
        c.close()
        clear_cache()
        clear_sector_cache()

    def _dump(self, payload):
        text = json.dumps(payload, allow_nan=False, default=str)
        assert "NaN" not in text and "Infinity" not in text
        return text

    def test_connections(self, hostile):
        for kwargs in (
            {"scope": "economy"},
            {"industry": "Void"},
            {"sector": "Tech"},
            {"ticker": "Z1"},
            {"ticker": "Z2"},
            {"ticker": "Z3"},
        ):
            self._dump(build_connections(hostile, **kwargs))

    def test_structure_and_maps(self, hostile):
        self._dump(build_industry_structure(hostile, "Void"))
        self._dump(build_industry_structure(hostile, "Nonexistent"))
        self._dump(build_strategic_groups(hostile, "Void"))
        self._dump(build_share_return(hostile, "Void"))
        self._dump(build_value_system(hostile, "Void", supplier="Nope"))
        self._dump(build_profit_pool(hostile, "Tech"))
        self._dump(build_profit_pool(hostile, "Nonexistent"))

    def test_review_fixture_payloads(self, rconn):
        self._dump(build_connections(rconn, ticker="CH0"))
        self._dump(build_connections(rconn, ticker="BK0"))
        self._dump(build_industry_structure(rconn, "Chips"))
        self._dump(build_strategic_groups(rconn, "Chips"))
        self._dump(build_profit_pool(rconn, "Tech"))
        self._dump(build_value_system(rconn, "Chips", supplier="Gear"))


# ── Characterization against the real DB ────────────────────────────────────

_REAL_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "financials.db",
)


@pytest.fixture
def live():
    conn = sqlite3.connect(f"file:{_REAL_DB}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    clear_cache()
    clear_sector_cache()
    yield conn
    conn.close()
    clear_cache()
    clear_sector_cache()


@pytest.mark.skipif(
    not os.path.exists(_REAL_DB),
    reason="financials.db is not present (it is git-ignored)",
)
class TestRealDataCharacterization:
    """Pins a few live figures so a silent drift is visible.

    Opened READ ONLY. Tolerances are wide enough to absorb a quarterly
    refresh and narrow enough to catch a methodology change.
    """

    def test_semiconductor_concentration(self, live):
        payload = build_industry_structure(live, "Semiconductors")
        conc = payload["concentration"]
        assert payload["firmCount"] > 300
        # Pinned 2026-09-20 on fiscal 2025: 512 firms, CR4 0.3264,
        # CR8 0.4737, HHI 403.7.
        assert conc["cr4"]["value"] == pytest.approx(0.3264, abs=0.04)
        assert conc["cr8"]["value"] == pytest.approx(0.4737, abs=0.05)
        assert conc["hhi"]["value"] == pytest.approx(403.7, abs=80)
        assert conc["cr4"]["percentile"] is not None
        assert conc["hhi"]["percentile"] is not None

    def test_apple_margin_split_adds_up(self, live):
        payload = build_connections(live, ticker="AAPL")
        split = payload["company"]["margin"]
        assert split is not None
        total = (
            split["industryPart"] + split["groupPart"] + split["companyPart"]
        )
        assert total == pytest.approx(split["company"], abs=1e-9)
        # Pinned 2026-09-20: company 0.3197, industry median 0.0231,
        # group 0.0161, company effect 0.2805 over 129 Consumer Electronics
        # peers.
        assert split["company"] == pytest.approx(0.3197, abs=0.03)
        assert split["industryMedian"] == pytest.approx(0.0231, abs=0.03)
        assert split["companyPart"] == pytest.approx(0.2805, abs=0.05)
