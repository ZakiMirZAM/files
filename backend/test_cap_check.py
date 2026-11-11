"""Locks the market-cap check rules in data/cap_check.py. Network-free."""
import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from data import cap_check as C  # noqa: E402
from data import usd_ingest as U  # noqa: E402
from data.financial_db import EXCEL_COLUMNS  # noqa: E402


# ── decide ───────────────────────────────────────────────────────────────────

def test_agreement_keeps_the_stored_value():
    assert C.decide(100.0, 110.0, 5000.0)[0] == "keep"       # within 25 percent
    assert C.decide(100.0, 80.0, None)[0] == "keep"


def test_replace_when_price_times_shares_fits_todays_cap():
    # MODEC-type row: statements in USD, cap left in yen (150x too big)
    action, value, _ = C.decide(8.1e11, 5.4e9, 4.0e9)
    assert action == "replace" and value == 5.4e9


def test_keep_when_the_stored_value_is_the_one_that_fits():
    # Yahoo's price or the share count is off, the vendor cap is fine
    action, value, _ = C.decide(5.0e9, 9.0e10, 4.0e9)
    assert action == "keep" and value is None


def test_clear_when_neither_value_fits():
    assert C.decide(8.0e13, 3.0e11, 2.0e8) == (
        "clear", None, "neither value fits today's cap")


def test_heavy_issuer_price_times_shares_wins_when_it_is_the_closer_one():
    # Nostrum-type row: stored 330bn, price x shares 3.3bn, chained 24bn
    action, value, reason = C.decide(3.3e11, 3.3e9, 2.4e10)
    assert action == "replace" and value == 3.3e9 and "10x" in reason
    # both far away: nothing verifies either one
    assert C.decide(9.5e11, 5.7e12, 1.65e11)[0] == "clear"


def test_both_fit_keeps_the_vendor_value():
    assert C.decide(1.0e9, 2.0e9, 1.5e9)[0] == "keep"


def test_without_an_arbiter_only_an_impossible_value_is_replaced():
    # stored is impossible (1000x revenue and equity), expected is normal
    action, value, _ = C.decide(8.4e13, 6.0e8, None, revenue=3e8, equity=2e8)
    assert action == "replace" and value == 6.0e8
    # an ordinary disagreement with nothing to arbitrate is left alone
    assert C.decide(5.0e9, 1.0e9, None, revenue=3e9, equity=2e9)[0] == "keep"


def test_no_independent_price_changes_nothing():
    assert C.decide(5.0e9, None, 4.0e9)[0] == "no_price"
    assert C.decide(5.0e9, 0.0, None)[0] == "no_price"


def test_empty_cell_is_filled_only_with_a_credible_value():
    assert C.decide(None, 6.0e8, 5.0e8) == (
        "replace", 6.0e8, "empty cell filled with price x shares")
    assert C.decide(None, 6.0e8, None)[0] == "no_price"            # nothing confirms it
    assert C.decide(None, 6.0e8, 1.0e6)[0] == "no_price"           # does not fit
    assert C.decide(None, 9e13, None, revenue=1e8, equity=1e8)[0] == "no_price"


# ── the impossible-cap rule ──────────────────────────────────────────────────

IMPOSSIBLE_CASES = [
    # cap, revenue, equity, impossible?
    (8.4e13, 3e8, 2e8, True),      # 84 trillion haulier
    (2e14, 4e11, 1e11, True),      # above the ceiling, whatever the multiples
    (1.35e13, 2.7e8, 3e14, True),  # 13.5 trillion with junk equity: above the ceiling
    (8.0e13, 2.3e8, 4e12, True),
    (3.2e13, 4.3e10, 4e9, True),   # 736x sales and 7986x equity (pre-listing junk)
    (3.5e12, 3.9e11, 5.7e10, False),   # Apple
    (2e10, 1e6, 5e9, False),       # pre-revenue company with real equity
    (3e11, 1.5e11, 1e6, False),    # buy-back company with almost no equity
    (3e11, 1.5e11, -2e9, False),   # negative equity, real sales
    (5e9, 1.0, 1.0, False),        # under the floor
    (2.7e12, 4e8, None, True),     # no equity on file, 6661x sales
    (2e12, None, 1.3e9, True),     # no revenue on file, 1642x equity
    (2e12, None, None, False),     # nothing to judge with
    (7.6e11, 1.95e9, 1.83e9, True),    # 391x and 417x
    (1.5e11, 1e9, 1e9, False),     # 150x both: unusual, not impossible
    (None, 1e9, 1e9, False),
]


@pytest.mark.parametrize("cap,revenue,equity,want", IMPOSSIBLE_CASES)
def test_is_impossible(cap, revenue, equity, want):
    assert C.is_impossible(cap, revenue, equity) is want


def test_sql_quarantine_rule_matches_the_python_rule():
    """`usd_ingest.quarantine_impossible_caps` (SQL) and `is_impossible` must
    make the same call on every case."""
    conn = _db()
    for i, (cap, revenue, equity, _want) in enumerate(IMPOSSIBLE_CASES):
        conn.execute('INSERT INTO financials (Ticker, "Calendar Year", "Market Cap", '
                     'Revenue, "Total Stockholders Equity") VALUES (?,?,?,?,?)',
                     (f"T{i}", 2024, cap, revenue, equity))
    U.quarantine_impossible_caps(conn)
    cleared = {t for (t,) in conn.execute("SELECT ticker FROM usd_ingest_cap_quarantine")}
    assert cleared == {f"T{i}" for i, c in enumerate(IMPOSSIBLE_CASES) if c[3]}


def test_a_replacement_must_itself_be_possible():
    """Aselsan-type row: the stored cap is fine, the share-history figure is
    500x sales and 650x equity. The stored value stays."""
    conn = _db()
    _ins(conn, "ASELS.IS", 2012, "2012-12-31", 1.0e9, 1.0e8, 9.1e8, 7.1e8)
    prices = {"currency": "USD", "splits": [("2020-01-01", 500.0)],
              "dates": ["2012-12-28"], "closes": [10.0], "cap_now": None,
              "close_now": 10.0, "share_dates": ["2012-12-01"], "share_counts": [1.0e8]}
    # traded price 10 x 500 = 5000, x 1e8 shares = 5e11: impossible
    assert C.check_ticker(conn, "ASELS.IS", prices, {}, {}) == {"keep": 1}
    assert conn.execute('SELECT "Market Cap" FROM financials').fetchone()[0] == 1.0e9
    assert "impossible" in conn.execute("SELECT reason FROM cap_check_audit").fetchone()[0]


def test_a_replacement_must_not_be_less_credible_than_the_stored_value():
    assert C.worst_multiple(3.1e11, 4.0e9, 2.2e10) == pytest.approx(77.5)
    assert C.worst_multiple(None, 1.0, 1.0) is None and C.worst_multiple(1e9, None, None) is None
    # Naspers: stored 77x sales, proposed 781x sales
    assert C.replacement_is_no_worse(3.1e11, 3.12e12, 4.0e9, 2.2e10) is False
    # Casino: stored 10x sales, proposed 0.1x
    assert C.replacement_is_no_worse(5.0e11, 5.0e9, 5.0e10, 1.0e10) is True
    # both extreme, the proposal less so: allowed
    assert C.replacement_is_no_worse(9e12, 3e11, 1e9, 1e9) is True
    # nothing to judge the proposal with: allowed
    assert C.replacement_is_no_worse(1e9, 5e9, None, None) is True

    conn = _db()
    _ins(conn, "NPN.JO", 2020, "2020-03-31", 3.1e11, 4.0e8, 4.0e9, 2.2e10)
    prices = {"currency": "USD", "splits": [("2021-01-01", 10.0)],
              "dates": ["2020-03-30"], "closes": [780.0], "cap_now": None,
              "close_now": 1.0, "share_dates": ["2020-03-01"], "share_counts": [4.0e8]}
    # traded price 7800 x 4e8 shares = 3.12e12: 781x sales, 142x equity
    assert C.check_ticker(conn, "NPN.JO", prices, {}, {}) == {"keep": 1}
    assert conn.execute('SELECT "Market Cap" FROM financials').fetchone()[0] == 3.1e11


def test_an_impossible_stored_cap_without_a_price_is_cleared():
    conn = _db()
    _ins(conn, "INGM", 2015, "2015-12-31", 3.2e13, 1e8, 4.3e10, 4e9)
    assert C.check_ticker(conn, "INGM", None, {}, {}) == {"clear": 1}
    cap, pe, rev = conn.execute(
        'SELECT "Market Cap", "PE Ratio", Revenue FROM financials').fetchone()
    assert cap is None and pe is None and rev == 4.3e10


# ── prices ───────────────────────────────────────────────────────────────────

def test_close_on_uses_the_last_trading_day_and_rejects_a_stale_price():
    dates = ["2015-12-28", "2015-12-30", "2016-03-01"]
    closes = [10.0, 11.0, 20.0]
    assert C.close_on(dates, closes, "2015-12-31") == 11.0
    assert C.close_on(dates, closes, "2015-12-30") == 11.0
    assert C.close_on(dates, closes, "2016-02-15") is None      # 47 days old
    assert C.close_on(dates, closes, "2015-01-01") is None      # before history


def test_expected_cap():
    assert C.expected_cap(10.0, 1e6, 0.5) == 5e6
    assert C.expected_cap(None, 1e6, 0.5) is None
    assert C.expected_cap(10.0, 0, 0.5) is None
    assert C.expected_cap(10.0, 1e6, None) is None


# ── share counts that were not restated for a later split ───────────────────

def test_split_factor_after_counts_only_later_splits():
    splits = [("2014-06-09", 7.0), ("2020-08-31", 4.0)]
    assert C.split_factor_after(splits, "2012-09-29") == 28.0
    assert C.split_factor_after(splits, "2015-09-26") == 4.0
    assert C.split_factor_after(splits, "2021-09-25") == 1.0
    assert C.split_factor_after([("2024-06-14", 0.01)], "2015-12-31") == 0.01


def test_split_candidate_corrects_an_unrestated_share_count():
    # 1:100 consolidation later; stored cap 100x too big. Anchor P/S 0.05.
    # stored P/S = 10 (200x the anchor), raw-price P/S = 0.1 (2x the anchor)
    assert C.split_candidate(5.0e11, 5.0e9, 5.0e10, 0.05) == 5.0e9


def test_split_candidate_leaves_a_restated_share_count_alone():
    # Apple-type row: shares WERE restated. stored P/S 4 vs anchor 8: fine.
    assert C.split_candidate(6.2e11, 28 * 6.2e11, 1.56e11, 8.0) is None
    # stored is far from the anchor but the raw price is no better: no change
    assert C.split_candidate(5.0e11, 4.0e11, 5.0e10, 0.05) is None
    assert C.split_candidate(5.0e11, 5.0e9, 5.0e10, None) is None
    assert C.split_candidate(5.0e11, None, 5.0e10, 0.05) is None


def test_restatement_verdict_from_as_of_share_counts():
    # Casino: row shares equal the as-of count, 1:100 consolidation later
    assert C.restatement_verdict([(108.1e6, 108.1e6, 0.01), (107.9e6, 107.1e6, 0.01)]) == "raw"
    # Apple: row shares are 4x the as-of count, 4:1 split later
    assert C.restatement_verdict([(21883e6, 5388e6, 4.0), (16701e6, 16530e6, 1.0)]) == "restated"
    # rows after the last split say nothing; neither do rows without history
    assert C.restatement_verdict([(100.0, 100.0, 1.0), (100.0, None, 0.01)]) is None
    # contradicting rows: change nothing
    assert C.restatement_verdict([(100.0, 100.0, 0.01), (1.0, 100.0, 0.01)]) is None
    # General Electric: a real 1:8 consolidation the vendor restated, plus
    # spin-offs Yahoo records as splits that it did not. Rows after the
    # consolidation look raw, rows before it fit neither: no verdict.
    assert C.restatement_verdict([(1100e6, 8700e6, 0.2), (1090e6, 1095e6, 1.6)]) is None
    # one odd row among many clear ones does not veto (Casino 2023)
    clear = [(108e6, 108e6, 0.01)] * 7
    assert C.restatement_verdict(clear + [(525e6, 110e6, 0.01)]) == "raw"
    assert C.restatement_verdict(clear[:2] + [(525e6, 110e6, 0.01)]) is None


def test_shares_on_uses_a_recent_as_of_count_only():
    dates, counts = ["2016-01-10", "2016-11-01"], [100.0, 110.0]
    assert C.shares_on(dates, counts, "2016-12-31") == 110.0
    assert C.shares_on(dates, counts, "2016-03-01") == 100.0
    assert C.shares_on(dates, counts, "2017-12-31") is None      # too old
    assert C.shares_on(dates, counts, "2015-12-31") is None      # before history
    assert C.shares_on([], [], "2016-12-31") is None


def test_share_history_decides_before_the_anchor_does():
    """Restated shares (Apple-type) with a P/S that collapsed later: the anchor
    alone would 'correct' a right value. The share history stops that."""
    conn = _db()
    _ins(conn, "FALL", 2015, "2015-12-31", 5.0e11, 1.0e10, 5.0e10, 1.0e10)   # restated: 1e8 x 100
    _ins(conn, "FALL", 2024, "2024-12-31", 4.0e8, 4.0e8, 8.0e9, 1.0e9)
    prices = {"currency": "USD", "splits": [("2024-06-14", 100.0)],
              "dates": ["2015-12-30", "2024-12-30"], "closes": [50.0, 1.0],
              "cap_now": None, "close_now": 1.0,
              "share_dates": ["2015-11-01"], "share_counts": [1.0e8]}
    assert C.check_ticker(conn, "FALL", prices, {}, {}) == {"keep": 2}

    conn2 = _db()
    _ins(conn2, "RAW", 2015, "2015-12-31", 5.0e11, 1.0e8, 5.0e10, 1.0e10)    # raw shares
    _ins(conn2, "RAW", 2024, "2024-12-31", 4.0e8, 4.0e8, 8.0e9, 1.0e9)       # after the split
    prices2 = {"currency": "USD", "splits": [("2024-06-14", 0.01)],
               "dates": ["2015-12-30", "2024-12-30"], "closes": [5000.0, 1.0],
               "cap_now": None, "close_now": 1.0,
               "share_dates": ["2015-11-01"], "share_counts": [1.0e8]}
    assert C.check_ticker(conn2, "RAW", prices2, {}, {}) == {"replace": 1, "keep": 1}
    assert conn2.execute('SELECT "Market Cap" FROM financials WHERE "Calendar Year" = 2015'
                         ).fetchone()[0] == pytest.approx(5.0e9)

    # the same raw-share row with NO witness (no later year, no cap today):
    # the share history alone is not enough to overrule the vendor
    conn3 = _db()
    _ins(conn3, "RAW", 2015, "2015-12-31", 5.0e11, 1.0e8, 5.0e10, 1.0e10)
    prices3 = dict(prices2, dates=["2015-12-30"], closes=[5000.0])
    assert C.check_ticker(conn3, "RAW", prices3, {}, {}) == {"keep": 1}


def test_exact_is_confirmed_needs_a_second_witness():
    # anchor P/S 0.05: stored at 10x sales, traded-price figure at 0.1x -> nearer
    assert C.exact_is_confirmed(5.0e11, 5.0e9, 5.0e10, 0.05, None) is True
    # a 5:1 split, Yahoo share history NOT as-of: the figure is 5x a right cap.
    # anchor P/S 5: stored at 5x sales, figure at 25x -> farther, not confirmed
    assert C.exact_is_confirmed(5.0e10, 2.5e11, 1.0e10, 5.0, None) is False
    # no anchor: today's cap chained back decides
    assert C.exact_is_confirmed(5.0e11, 5.0e9, 5.0e10, None, 6.0e9) is True
    assert C.exact_is_confirmed(5.0e11, 5.0e9, 5.0e10, None, 4.0e11) is False
    # no witness at all
    assert C.exact_is_confirmed(5.0e11, 5.0e9, 5.0e10, None, None) is False
    # an empty cell: the figure must sit near the anchor
    assert C.exact_is_confirmed(None, 5.0e9, 5.0e10, 0.05, None) is True
    assert C.exact_is_confirmed(None, 5.0e12, 5.0e10, 0.05, None) is False


def test_rerun_keeps_the_original_value_in_the_audit():
    conn = _db()
    _ins(conn, "6269.T", 2024, "2024-12-31", 1.0e11, 1e8, 4.0e9, 1.0e9)
    prices = {"currency": "JPY", "dates": ["2024-12-30"], "closes": [1000.0],
              "cap_now": 1.1e11, "close_now": 1100.0}
    rates = {("JPY", "2024-12"): 0.0065}
    C.check_ticker(conn, "6269.T", prices, rates, spot={"JPY": 0.0065})
    C.check_ticker(conn, "6269.T", prices, rates, spot={"JPY": 0.0065})   # second run
    stored, action = conn.execute("SELECT stored, action FROM cap_check_audit").fetchone()
    assert stored == 1.0e11          # the value before ANY correction
    assert action == "keep"          # the second run finds the corrected cell in order


def test_dry_run_and_failed_download_do_not_mark_a_ticker_done(tmp_path, monkeypatch):
    db = str(tmp_path / "copy.db")
    conn = _db_file(db)
    _ins(conn, "BIG", 2024, "2024-12-31", 5.0e10, 1e8, 4.0e9, 1.0e9)
    conn.commit()
    conn.close()

    def done():
        c = sqlite3.connect(db)
        try:
            return c.execute("SELECT ticker FROM cap_check_progress").fetchall()
        finally:
            c.close()

    good = {"currency": "USD", "dates": ["2024-12-30"], "closes": [500.0],
            "cap_now": 5.0e10, "close_now": 500.0}
    monkeypatch.setattr(C, "fetch_prices", lambda t: good)
    C.run(db, apply=False, workers=1)                       # dry run
    assert done() == []
    monkeypatch.setattr(C, "fetch_prices", lambda t: None)  # rate limited
    C.run(db, apply=True, workers=1)
    assert done() == []
    monkeypatch.setattr(C, "fetch_prices", lambda t: good)
    C.run(db, apply=True, workers=1)
    assert done() == [("BIG",)]


def test_check_ticker_applies_the_split_rule_only_where_shares_were_not_restated():
    conn = _db()
    # consolidation 1:100 on 2024-06-14. 2015 row: raw shares, adjusted price.
    _ins(conn, "CO.PA", 2015, "2015-12-31", 5.0e11, 1.0e8, 5.0e10, 1.0e10)
    _ins(conn, "CO.PA", 2024, "2024-12-31", 4.0e8, 4.0e8, 8.0e9, 1.0e9)   # after it
    prices = {"currency": "USD", "splits": [("2024-06-14", 0.01)],
              "dates": ["2015-12-30", "2024-12-30"], "closes": [5000.0, 1.0],
              "cap_now": None, "close_now": 1.0}
    counts = C.check_ticker(conn, "CO.PA", prices, {}, {})
    assert counts == {"keep": 1, "replace": 1}
    assert conn.execute('SELECT "Market Cap" FROM financials WHERE "Calendar Year"=2015'
                        ).fetchone()[0] == pytest.approx(5.0e9)
    assert "not restated" in conn.execute(
        "SELECT reason FROM cap_check_audit WHERE year = 2015").fetchone()[0]


# ── ratios ───────────────────────────────────────────────────────────────────

ROW = {"Total Debt": 300.0, "Cash And Cash Equivalents": 100.0,
       "Total Stockholders Equity": 500.0, "Goodwill And Intangible Assets": 100.0,
       "Net Income": 50.0, "Revenue": 400.0, "Operating Cash Flow": 80.0,
       "Free Cash Flow": 40.0, "Dividends Paid": -10.0, "EBITDA": 120.0}


def test_recompute_price_ratios_are_consistent_with_the_cap():
    r = C.recompute_price_ratios(ROW, 1000.0)
    assert r["Market Cap"] == 1000.0
    assert r["Enterprise Value"] == 1200.0
    assert r["PE Ratio"] == 20.0 and r["Price To Sales Ratio"] == 2.5
    assert r["PB Ratio"] == 2.0 and r["PTB Ratio"] == 2.0   # vendor: PTB = PB
    assert r["POCF Ratio"] == 12.5 and r["PFCF Ratio"] == 25.0
    assert r["EV To Sales"] == 3.0 and r["Enterprise Value Over EBITDA"] == 10.0
    assert r["Earnings Yield"] == 0.05 and r["Free Cash Flow Yield"] == 0.04
    assert r["Dividend Yield"] == 0.01
    assert set(r) == set(C.PRICE_COLUMNS)


def test_recompute_never_divides_by_zero_and_clear_blanks_everything():
    r = C.recompute_price_ratios(dict(ROW, **{"Net Income": 0.0, "Revenue": None}), 1000.0)
    assert r["PE Ratio"] is None and r["Price To Sales Ratio"] is None
    assert all(v is None for v in C.recompute_price_ratios(ROW, None).values())


def test_price_columns_match_the_ingest_quarantine_list():
    assert C.PRICE_COLUMNS == U.PRICE_COLUMNS


# ── check_ticker on a database ───────────────────────────────────────────────

def _db(path=":memory:"):
    conn = sqlite3.connect(path)
    cols = ", ".join(
        f'"{c}" TEXT' if c in U.TEXT_COLUMNS else f'"{c}" REAL'
        for c in EXCEL_COLUMNS if c not in ("Ticker", "Calendar Year"))
    conn.execute(f'CREATE TABLE financials (Ticker TEXT NOT NULL, '
                 f'"Calendar Year" INTEGER NOT NULL, {cols}, last_updated TEXT, '
                 f'"Source Currency" TEXT, "FX Rate" REAL, '
                 f'PRIMARY KEY (Ticker, "Calendar Year"))')
    conn.execute(U.QUARANTINE_DDL)
    return conn


def _db_file(path):
    """A file database that `cap_check.run` can open (needs the rate tables)."""
    conn = _db(path)
    conn.execute("CREATE TABLE fx_rates_monthly (currency TEXT, month TEXT, close REAL, avg REAL)")
    conn.execute("CREATE TABLE fx_rates (currency TEXT, usd_per_unit REAL, asof TEXT)")
    conn.execute("CREATE TABLE job_runs (job TEXT PRIMARY KEY, last_run TEXT)")
    return conn


def _ins(conn, ticker, year, date, cap, shares, revenue, equity, net_income=10.0):
    conn.execute(
        'INSERT INTO financials (Ticker, "Calendar Year", Date, "Market Cap", '
        '"Weighted Average Shs Out", Revenue, "Total Stockholders Equity", '
        '"Net Income", "PE Ratio", "Price To Sales Ratio") VALUES (?,?,?,?,?,?,?,?,?,?)',
        (ticker, year, date, cap, shares, revenue, equity, net_income,
         (cap / net_income) if cap else None, (cap / revenue) if cap else None))


def test_check_ticker_fixes_a_cap_left_in_the_listing_currency():
    conn = _db()
    # statements in USD, cap in yen: 1,000 yen x 1e8 shares = 1e11 "USD"
    _ins(conn, "6269.T", 2024, "2024-12-31", 1.0e11, 1e8, 4.0e9, 1.0e9)
    _ins(conn, "6269.T", 2023, "2023-12-31", 6.3e8, 1e8, 3.5e9, 0.9e9)   # correct row
    prices = {"currency": "JPY", "dates": ["2023-12-29", "2024-12-30"],
              "closes": [900.0, 1000.0], "cap_now": 1.1e11, "close_now": 1100.0}
    rates = {("JPY", "2023-12"): 0.007, ("JPY", "2024-12"): 0.0065}
    counts = C.check_ticker(conn, "6269.T", prices, rates, spot={"JPY": 0.0065})
    assert counts == {"keep": 1, "replace": 1}
    cap, pe, ps, rev = conn.execute(
        'SELECT "Market Cap", "PE Ratio", "Price To Sales Ratio", Revenue '
        'FROM financials WHERE "Calendar Year" = 2024').fetchone()
    assert cap == pytest.approx(1000.0 * 1e8 * 0.0065)          # 650 million USD
    assert pe == pytest.approx(cap / 10.0) and ps == pytest.approx(cap / 4.0e9)
    assert rev == 4.0e9                                          # statements untouched
    assert conn.execute('SELECT "Market Cap" FROM financials '
                        'WHERE "Calendar Year" = 2023').fetchone()[0] == 6.3e8
    audit = conn.execute("SELECT year, stored, action FROM cap_check_audit "
                         "ORDER BY year").fetchall()
    assert audit == [(2023, 6.3e8, "keep"), (2024, 1.0e11, "replace")]


def test_check_ticker_restores_a_quarantined_cap_and_records_the_old_value():
    conn = _db()
    _ins(conn, "9078.T", 2024, "2024-12-31", None, 1e7, 3e8, 2e8)
    conn.execute("INSERT INTO usd_ingest_cap_quarantine VALUES "
                 "('9078.T', 2024, 'FY', 8.4e13, 3e8, 2e8, 'x')")
    prices = {"currency": "JPY", "dates": ["2024-12-30"], "closes": [2000.0],
              "cap_now": 2.1e10, "close_now": 2100.0}
    counts = C.check_ticker(conn, "9078.T", prices, {("JPY", "2024-12"): 0.0065},
                            spot={"JPY": 0.0065})
    assert counts == {"replace": 1}
    assert conn.execute('SELECT "Market Cap" FROM financials').fetchone()[0] \
        == pytest.approx(2000.0 * 1e7 * 0.0065)
    stored, reason = conn.execute(
        "SELECT stored, reason FROM cap_check_audit").fetchone()
    assert stored == 8.4e13 and reason.startswith("quarantined cap restored")


def test_check_ticker_without_prices_changes_nothing():
    conn = _db()
    _ins(conn, "DEAD", 2015, "2015-12-31", 5e9, 1e8, 1e9, 1e9)
    assert C.check_ticker(conn, "DEAD", None, {}, {}) == {"no_price": 1}
    assert conn.execute('SELECT "Market Cap" FROM financials').fetchone()[0] == 5e9


def test_dry_run_writes_the_audit_but_not_the_row():
    conn = _db()
    _ins(conn, "X", 2024, "2024-12-31", 1.0e11, 1e8, 4.0e9, 1.0e9)
    prices = {"currency": "USD", "dates": ["2024-12-30"], "closes": [10.0],
              "cap_now": 1.1e9, "close_now": 11.0}
    C.check_ticker(conn, "X", prices, {}, {}, apply=False)
    assert conn.execute('SELECT "Market Cap" FROM financials').fetchone()[0] == 1.0e11
    assert conn.execute("SELECT action FROM cap_check_audit").fetchone()[0] == "replace"
