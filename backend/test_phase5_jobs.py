"""Network-free tests for the Phase 5 standing-automation jobs.

Covers:
  - filings_watch.parse_form_idx     (synthetic index -> filtered CIK/form hits)
  - filings_watch date + mapping helpers
  - universe_sync.compute_diff       (synthetic SEC snapshot vs a temp map ->
                                      registrant / rename / delist actions)
  - universe_sync.apply_diff         (round-trip against a temp DB)
  - freshness_monitor.classify + section builders (WARN / ALERT lines)

All network (http_get) and FinancialDB calls are avoided: the pure functions
take their inputs directly, and the sweep loop is exercised with stubs.
"""

from __future__ import annotations

import os
import sqlite3
import sys
from datetime import date

import pytest

# Standalone imports: data/, remediation/, remediation/jobs/.
_REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for _p in (os.path.join(_REPO, "data"),
           os.path.join(_REPO, "remediation"),
           os.path.join(_REPO, "remediation", "jobs")):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import filings_watch as fw  # noqa: E402
import freshness_monitor as fm  # noqa: E402
import universe_sync as us  # noqa: E402


# ══════════════════════════════════════════════════════════════════════════════
# filings_watch: form.idx parsing
# ══════════════════════════════════════════════════════════════════════════════
_IDX_SAMPLE = """Description:           Daily Index of EDGAR Dissemination Feed by Form Type
Last Data Received:    July 10, 2026
Comments:              webmaster@sec.gov

Form Type   Company Name                                          CIK         Date Filed  File Name
---------------------------------------------------------------------------------------------------------------------
10-K        APPLE INC                                             320193      2026-07-10  edgar/data/320193/0000320193-26-000001.txt
10-Q        MICROSOFT CORP                                        789019      2026-07-10  edgar/data/789019/0000789019-26-000010.txt
8-K         SOME NOISE CO                                         111111      2026-07-10  edgar/data/111111/0001111111-26-000002.txt
20-F        FOREIGN FILER PLC                                     222222      2026-07-10  edgar/data/222222/0002222222-26-000003.txt
10-K/A      RESTATER INC                                          333333      2026-07-10  edgar/data/333333/0003333333-26-000004.txt
4           INSIDER PERSON                                        444444      2026-07-10  edgar/data/444444/0004444444-26-000005.txt
"""


def test_parse_form_idx_extracts_all_rows():
    filings = fw.parse_form_idx(_IDX_SAMPLE)
    forms = [f.form for f in filings]
    assert forms == ["10-K", "10-Q", "8-K", "20-F", "10-K/A", "4"]
    apple = filings[0]
    assert apple.cik == "320193"
    assert apple.date_filed == "2026-07-10"
    assert apple.file_name.endswith("0000320193-26-000001.txt")


def test_parse_form_idx_no_header_returns_empty():
    assert fw.parse_form_idx("garbage\nwith no header\n") == []


def test_filter_target_filings_keeps_only_periodic_reports():
    kept = {f.form for f in fw.filter_target_filings(fw.parse_form_idx(_IDX_SAMPLE))}
    assert kept == {"10-K", "10-Q", "20-F", "10-K/A"}  # 8-K and Form 4 dropped


def test_map_hits_to_symbols_uses_padded_cik_and_primaries():
    filings = fw.filter_target_filings(fw.parse_form_idx(_IDX_SAMPLE))
    primary_by_cik = {
        "0000320193": "AAPL",   # Apple
        "0000789019": "MSFT",   # Microsoft
        "0000222222": "FFP",    # Foreign filer
        # 333333 deliberately absent -> unmapped restatement
    }
    hits = fw.map_hits_to_symbols(filings, primary_by_cik)
    assert hits == {"AAPL": "10-K", "MSFT": "10-Q", "FFP": "20-F"}


# ── date selection ──────────────────────────────────────────────────────────────
def test_previous_business_day_skips_weekend():
    # Monday 2026-07-13 -> previous business day is Friday 2026-07-10.
    assert fw.previous_business_day(date(2026, 7, 13)) == date(2026, 7, 10)


def test_dates_to_process_override_wins():
    assert fw.dates_to_process(
        date(2026, 7, 13), None, override=date(2026, 1, 2)) == [date(2026, 1, 2)]


def test_dates_to_process_no_last_run_is_prev_business_day():
    assert fw.dates_to_process(date(2026, 7, 13), None) == [date(2026, 7, 10)]


def test_dates_to_process_catches_up_business_days_capped():
    # last run Tue 2026-07-07; today Mon 2026-07-13 -> Wed/Thu/Fri (8,9,10),
    # weekend excluded, ascending, within the cap.
    got = fw.dates_to_process(date(2026, 7, 13), date(2026, 7, 7))
    assert got == [date(2026, 7, 8), date(2026, 7, 9), date(2026, 7, 10)]


def test_daily_index_url_quarter():
    url = fw.daily_index_url(date(2026, 7, 10))
    assert "2026/QTR3/form.20260710.idx" in url


# ── sweep loop with stubs (no network, no FinancialDB) ──────────────────────────
class _StubDB:
    def __init__(self, db_path, raise_on=None):
        self.db_path = db_path
        self.refreshed: list[str] = []
        self._raise_on = raise_on or set()

    def update_ticker(self, sym, verbose=True, fill_gaps=False):
        if sym in self._raise_on:
            raise RuntimeError("boom")
        self.refreshed.append(sym)
        return 0

    def save_quarters(self, sym, verbose=True):
        return 0

    def derive_q4(self, sym, verbose=True):
        return 0

    def save_ttm(self, sym, verbose=True):
        return True


def _seed_filings_db(path: str) -> None:
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE security_map (symbol TEXT PRIMARY KEY, cik TEXT, "
                 "is_primary INTEGER, status TEXT)")
    conn.execute("CREATE TABLE job_runs (job TEXT PRIMARY KEY, last_run TEXT)")
    conn.executemany(
        "INSERT INTO security_map (symbol, cik, is_primary, status) VALUES (?,?,?,?)",
        [("AAPL", "0000320193", 1, "active"),
         ("MSFT", "0000789019", 1, "awaiting_first_financials")])
    conn.commit()
    conn.close()


def test_filings_watch_run_dry_run_lists_without_writing(tmp_path):
    db = str(tmp_path / "f.db")
    _seed_filings_db(db)

    def http_get(url):
        return _IDX_SAMPLE.encode("latin-1")

    counts = fw.run(db, override=date(2026, 7, 10), dry_run=True,
                    db_factory=_StubDB, http_get=http_get)
    assert counts["hits"] == 2  # AAPL + MSFT mapped (others unmapped)
    assert counts["refreshed"] == 0  # dry-run writes nothing
    with sqlite3.connect(db) as c:  # no job marker on a dry run
        assert c.execute("SELECT COUNT(*) FROM job_runs").fetchone()[0] == 0


def test_filings_watch_run_refreshes_and_activates(tmp_path):
    db = str(tmp_path / "f.db")
    _seed_filings_db(db)
    captured = {}

    def factory(path):
        captured["db"] = _StubDB(path)
        return captured["db"]

    def http_get(url):
        return _IDX_SAMPLE.encode("latin-1")

    counts = fw.run(db, override=date(2026, 7, 10), dry_run=False,
                    db_factory=factory, http_get=http_get)
    assert counts["refreshed"] == 2
    assert counts["failed"] == 0
    assert counts["activated"] == 1  # MSFT flips awaiting_first_financials->active
    with sqlite3.connect(db) as c:
        status = c.execute(
            "SELECT status FROM security_map WHERE symbol='MSFT'").fetchone()[0]
        assert status == "active"
        assert c.execute("SELECT COUNT(*) FROM job_runs WHERE job=?",
                         [fw.JOB_NAME]).fetchone()[0] == 1


def test_filings_watch_counts_per_item_failure(tmp_path):
    db = str(tmp_path / "f.db")
    _seed_filings_db(db)

    def factory(path):
        return _StubDB(path, raise_on={"AAPL"})

    counts = fw.run(db, override=date(2026, 7, 10), dry_run=False,
                    db_factory=factory, http_get=lambda url: _IDX_SAMPLE.encode("latin-1"))
    assert counts["failed"] == 1 and counts["refreshed"] == 1


# ══════════════════════════════════════════════════════════════════════════════
# universe_sync: diff logic
# ══════════════════════════════════════════════════════════════════════════════
def _sec(tickers):
    """Build a SecUniverse from [(symbol, cik, exchange, title)] in SEC order."""
    raw = {str(i): {"ticker": t[0], "cik_str": t[1], "title": t[3]}
           for i, t in enumerate(tickers)}
    ex = {"fields": ["cik", "name", "ticker", "exchange"],
          "data": [[t[1], t[3], t[0], t[2]] for t in tickers]}
    return us.parse_sec_universe(raw, ex)


def test_compute_diff_new_registrant_is_primary():
    sec = _sec([("NEWCO", 900001, "Nasdaq", "NewCo Inc")])
    diff = us.compute_diff(sec, existing=[], has_data=set(), today="2026-07-13")
    assert len(diff.registrants) == 1
    reg = diff.registrants[0]
    assert reg.symbol == "NEWCO"
    assert reg.is_primary == 1
    assert reg.status == "awaiting_first_financials"
    assert reg.cik == "0000900001"
    assert reg.name == "NewCo Inc"  # SEC title carried for the tickers upsert
    assert not diff.renames and not diff.delist_symbols


def test_compute_diff_second_class_of_new_cik_is_alias():
    # Same brand-new CIK, two share classes; SEC-first is primary, the other an alias.
    sec = _sec([("NEWCO-A", 900002, "Nasdaq", "NewCo A"),
                ("NEWCO-B", 900002, "Nasdaq", "NewCo B")])
    diff = us.compute_diff(sec, existing=[], has_data=set(), today="2026-07-13")
    assert len(diff.registrants) == 1 and diff.registrants[0].symbol == "NEWCO-A"
    assert len(diff.renames) == 1 and diff.renames[0].symbol == "NEWCO-B"
    assert diff.renames[0].is_primary == 0


def test_compute_diff_same_cik_new_symbol_is_rename():
    # CIK already known via an existing symbol -> the new spelling is an alias.
    existing = [us.ExistingRow("OLDSY", "0000900003", "OLDSY", 1, "active")]
    sec = _sec([("OLDSY", 900003, "NYSE", "Renamed Co"),
                ("NEWSY", 900003, "NYSE", "Renamed Co")])
    diff = us.compute_diff(sec, existing=existing, has_data={"OLDSY"},
                           today="2026-07-13")
    assert [r.symbol for r in diff.renames] == ["NEWSY"]
    assert not diff.registrants  # OLDSY already present, NEWSY is the rename


def test_compute_diff_delists_cik_absent_from_sec():
    existing = [
        us.ExistingRow("DEADX", "0000900004", "DEADX", 1, "active"),
        us.ExistingRow("LIVEX", "0000900005", "LIVEX", 1, "active"),
    ]
    sec = _sec([("LIVEX", 900005, "NYSE", "Live Co")])  # DEADX's CIK gone
    diff = us.compute_diff(sec, existing=existing, has_data=set(),
                           today="2026-07-13")
    assert diff.delist_symbols == ["DEADX"]


def test_compute_diff_does_not_delist_fmp_only_names():
    # A domestic name security_map never learned from SEC (symbol_sec is None)
    # must not be delisted just because it's absent from the SEC files.
    existing = [us.ExistingRow("FMPONLY", "0000900006", None, 1, "active")]
    sec = _sec([("SOMEONE", 900007, "NYSE", "Someone")])
    diff = us.compute_diff(sec, existing=existing, has_data=set(),
                           today="2026-07-13")
    assert diff.delist_symbols == []


def test_compute_diff_ignores_placeholder_zero_cik():
    # The sentinel all-zero CIK must never anchor a delist group: a lone SEC-known
    # symbol sharing it cannot drag unrelated zero-CIK rows into a delist.
    existing = [
        us.ExistingRow("SECKNOWN", "0000000000", "SECKNOWN", 1, "active"),
        us.ExistingRow("FMPA", "0000000000", None, 0, "active"),
        us.ExistingRow("FMPB", "0000000000", None, 0, "active"),
    ]
    sec = _sec([("OTHER", 900099, "NYSE", "Other")])  # SECKNOWN's "cik" absent
    diff = us.compute_diff(sec, existing, has_data=set(), today="2026-07-13")
    assert diff.delist_symbols == []  # zero CIK is not a real identity


def test_guard_delist_trips_on_mass_delist():
    diff = us.Diff(delist_symbols=[f"S{i}" for i in range(30)])
    tripped = us.guard_delist(diff, existing_count=100, max_fraction=0.05)
    assert tripped is True
    assert diff.delist_symbols == []  # circuit-breaker cleared the delist


def test_guard_delist_allows_small_delist():
    diff = us.Diff(delist_symbols=["S1", "S2"])
    tripped = us.guard_delist(diff, existing_count=100, max_fraction=0.05)
    assert tripped is False
    assert diff.delist_symbols == ["S1", "S2"]


def test_apply_diff_round_trip(tmp_path):
    db = str(tmp_path / "u.db")
    conn = sqlite3.connect(db)
    conn.execute(
        "CREATE TABLE security_map (cik TEXT, symbol TEXT PRIMARY KEY, "
        "symbol_sec TEXT, symbol_yf TEXT, symbol_fmp TEXT, kind TEXT, "
        "is_primary INTEGER, exchange TEXT, status TEXT, valid_from TEXT, "
        "valid_to TEXT)")
    conn.execute("CREATE TABLE tickers (ticker TEXT PRIMARY KEY, name TEXT, "
                 "exchange TEXT, last_updated TEXT)")
    conn.execute(
        "INSERT INTO security_map (cik, symbol, symbol_sec, is_primary, status) "
        "VALUES ('0000900008','DEADX','DEADX',1,'active')")
    conn.commit()

    sec = _sec([("NEWCO", 900001, "Nasdaq", "NewCo Inc")])  # DEADX absent -> delist
    existing = us.load_existing(conn)
    diff = us.compute_diff(sec, existing, has_data=set(), today="2026-07-13")
    counts = us.apply_diff(conn, diff, "2026-07-13")

    assert counts["registrants"] == 1
    assert counts["delisted"] == 1
    assert counts["tickers"] == 1
    row = conn.execute(
        "SELECT is_primary, status FROM security_map WHERE symbol='NEWCO'"
    ).fetchone()
    assert row == (1, "awaiting_first_financials")
    dead = conn.execute(
        "SELECT status, valid_to FROM security_map WHERE symbol='DEADX'"
    ).fetchone()
    assert dead == ("delisted", "2026-07-13")
    tk = conn.execute("SELECT name FROM tickers WHERE ticker='NEWCO'").fetchone()
    assert tk == ("NewCo Inc",)
    conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# freshness_monitor: thresholds + section verdicts
# ══════════════════════════════════════════════════════════════════════════════
@pytest.mark.parametrize("value,expected", [
    (0.10, "OK"), (0.40, "WARN"), (0.70, "ALERT"), (None, "ALERT"),
])
def test_classify_higher_is_worse(value, expected):
    assert fm.classify(value, fm.FROZEN_FRAC_WARN, fm.FROZEN_FRAC_ALERT) == expected


@pytest.mark.parametrize("count,expected", [
    (5, "OK"), (0, "ALERT"),
])
def test_classify_lower_is_worse_for_counts(count, expected):
    assert fm.classify(count, 1, 1, higher_is_worse=False) == expected


def _seed_freshness_db(path: str, *, fx_asof: str, ttm_updated: str | None,
                       job_last: str) -> None:
    conn = sqlite3.connect(path)
    conn.execute('CREATE TABLE financials (Ticker TEXT, "Calendar Year" TEXT)')
    conn.execute('CREATE TABLE financials_quarterly (Ticker TEXT, '
                 '"Calendar Year" INTEGER, Period TEXT, last_updated TEXT)')
    conn.execute("CREATE TABLE fx_rates (currency TEXT, usd_per_unit REAL, asof TEXT)")
    conn.execute("CREATE TABLE job_runs (job TEXT PRIMARY KEY, last_run TEXT)")
    # Two fresh tickers (2025) and one frozen (2019) -> 1/3 frozen.
    conn.executemany('INSERT INTO financials VALUES (?,?)',
                     [("A", "2025"), ("B", "2025"), ("C", "2019")])
    conn.execute("INSERT INTO fx_rates VALUES ('EUR', 1.1, ?)", [fx_asof])
    if ttm_updated is not None:
        conn.execute("INSERT INTO financials_quarterly VALUES "
                     "('A', 2025, 'TTM', ?)", [ttm_updated])
    conn.execute("INSERT INTO job_runs VALUES ('filings_watch', ?)", [job_last])
    conn.commit()
    conn.close()


def test_check_fx_warn_when_stale(tmp_path):
    db = str(tmp_path / "fresh.db")
    _seed_freshness_db(db, fx_asof="2026-07-01", ttm_updated="2026-07-10",
                       job_last="2026-07-13")
    with sqlite3.connect(f"file:{db}?mode=ro", uri=True) as conn:
        line, _ = fm.check_fx(conn, date(2026, 7, 15))  # 14 days -> WARN
    assert line.status == "WARN"


def test_check_fx_alert_when_very_stale(tmp_path):
    db = str(tmp_path / "fresh.db")
    _seed_freshness_db(db, fx_asof="2026-05-01", ttm_updated="2026-07-10",
                       job_last="2026-07-13")
    with sqlite3.connect(f"file:{db}?mode=ro", uri=True) as conn:
        line, _ = fm.check_fx(conn, date(2026, 7, 15))  # ~75 days -> ALERT
    assert line.status == "ALERT"


def test_check_ttm_alert_when_no_rows(tmp_path):
    db = str(tmp_path / "fresh.db")
    _seed_freshness_db(db, fx_asof="2026-07-14", ttm_updated=None,
                       job_last="2026-07-13")
    with sqlite3.connect(f"file:{db}?mode=ro", uri=True) as conn:
        line, _ = fm.check_ttm(conn, date(2026, 7, 15))
    assert line.status == "ALERT"  # count == 0


def test_check_fundamentals_frozen_fraction(tmp_path):
    db = str(tmp_path / "fresh.db")
    _seed_freshness_db(db, fx_asof="2026-07-14", ttm_updated="2026-07-10",
                       job_last="2026-07-13")
    with sqlite3.connect(f"file:{db}?mode=ro", uri=True) as conn:
        line, extra = fm.check_fundamentals(conn, date(2026, 7, 15))
    # 1 of 3 tickers frozen (33%) -> WARN band; distribution is reported.
    assert line.status == "WARN"
    assert any("2025" in row for row in extra)


def test_build_report_runs_end_to_end(tmp_path):
    db = str(tmp_path / "fresh.db")
    _seed_freshness_db(db, fx_asof="2026-07-14", ttm_updated="2026-07-10",
                       job_last="2026-07-13")
    report = fm.build_report(db, today=date(2026, 7, 15))
    assert "data freshness report" in report
    assert "fundamentals frozen" in report
    assert "fx rates" in report
    assert "ttm rows" in report
    assert "job runs" in report


# ══════════════════════════════════════════════════════════════════════════════
# market_weekly: resumable, budget-bounded market-cap sweep
# ══════════════════════════════════════════════════════════════════════════════
import market_cap_refresh as mcr  # noqa: E402
import market_weekly as mw  # noqa: E402


def _caps_db(path, tickers, years=(2023, 2024)):
    conn = sqlite3.connect(path)
    conn.execute('CREATE TABLE financials (Ticker TEXT, "Calendar Year" TEXT, '
                 '"Market Cap" REAL)')
    conn.executemany('INSERT INTO financials VALUES (?, ?, ?)',
                     [(t, str(y), 1.0) for t in tickers for y in years])
    conn.commit()
    conn.close()
    return str(path)


class _FakeFetcher:
    """Records every ticker asked for; returns a distinct cap per ticker."""

    def __init__(self, missing=(), raises=()):
        self.calls = []
        self._missing, self._raises = set(missing), set(raises)

    def __call__(self, ticker):
        self.calls.append(ticker)
        if ticker in self._raises:
            raise RuntimeError("boom")
        if ticker in self._missing:
            return None
        return 100.0 + len(ticker)


def _caps(db, ticker, year):
    conn = sqlite3.connect(db)
    try:
        return conn.execute('SELECT "Market Cap" FROM financials WHERE Ticker = ? '
                            'AND "Calendar Year" = ?', (ticker, str(year))).fetchone()[0]
    finally:
        conn.close()


def _progress_rows(db):
    conn = sqlite3.connect(db)
    try:
        return conn.execute("SELECT COUNT(*) FROM market_cap_progress").fetchone()[0]
    finally:
        conn.close()


def test_market_cap_sweep_resumes_without_refetching(tmp_path):
    """The killed run used to throw away 14,800 fetched tickers and start over."""
    db = _caps_db(tmp_path / "f.db", [f"T{i}" for i in range(1, 6)])
    fetch = _FakeFetcher()

    first = mcr.refresh_market_caps_resumable(db, fetch=fetch, batch_size=2, verbose=False)
    assert first["complete"] is False
    assert first["done"] == 2 and first["remaining"] == 3
    assert _progress_rows(db) == 2          # the work is durable mid-run

    second = mcr.refresh_market_caps_resumable(db, fetch=fetch, batch_size=2, verbose=False)
    assert second["run_date"] == first["run_date"]
    assert second["done"] == 2 and second["remaining"] == 1

    third = mcr.refresh_market_caps_resumable(db, fetch=fetch, batch_size=2, verbose=False)
    assert third["complete"] is True
    assert third["run_updated"] == 5
    # The scratch is KEPT: it is the record that this run finished, so a re-run
    # in the same week is a no-op instead of a second full sweep.
    assert _progress_rows(db) == 5
    again = mcr.refresh_market_caps_resumable(db, fetch=fetch, batch_size=2, verbose=False)
    assert again["complete"] is True and again["done"] == 0

    # Each ticker fetched exactly once across the three batches.
    assert sorted(fetch.calls) == ["T1", "T2", "T3", "T4", "T5"]
    assert len(fetch.calls) == len(set(fetch.calls))
    # Only the LATEST year is restated.
    assert _caps(db, "T1", 2024) == 102.0
    assert _caps(db, "T1", 2023) == 1.0


def test_market_cap_sweep_writes_job_run_only_on_completion(tmp_path):
    db = _caps_db(tmp_path / "f.db", [f"T{i}" for i in range(1, 4)])
    fetch = _FakeFetcher()

    mcr.refresh_market_caps_resumable(db, fetch=fetch, batch_size=1, verbose=False)
    conn = sqlite3.connect(db)
    assert conn.execute("SELECT COUNT(*) FROM job_runs").fetchone()[0] == 0
    conn.close()

    for _ in range(3):
        res = mcr.refresh_market_caps_resumable(db, fetch=fetch, batch_size=1, verbose=False)
    assert res["complete"] is True
    conn = sqlite3.connect(db)
    try:
        jobs_rows = conn.execute("SELECT job FROM job_runs").fetchall()
    finally:
        conn.close()
    assert [j[0] for j in jobs_rows] == [mcr.JOB_NAME]
    # Upsert, not insert: a later completed run must not crash on the PK.
    mcr._write_job_run(sqlite3.connect(db))


def test_market_cap_sweep_budget_stops_the_batch(tmp_path):
    db = _caps_db(tmp_path / "f.db", [f"T{i}" for i in range(1, 4)])
    res = mcr.refresh_market_caps_resumable(db, fetch=_FakeFetcher(), batch_size=10,
                                            budget_seconds=0, verbose=False)
    assert res["complete"] is False
    assert res["done"] == 1 and res["remaining"] == 2


def test_market_cap_sweep_abandons_a_stale_run(tmp_path):
    db = _caps_db(tmp_path / "f.db", ["AAA"])
    old = (date.today() - __import__("datetime").timedelta(days=30)).isoformat()
    conn = sqlite3.connect(db)
    mcr.ensure_tables(conn)
    conn.execute("INSERT INTO market_cap_progress VALUES (?, 'AAA', 1.0, 'updated', ?)",
                 [old, old])
    conn.commit()
    conn.close()

    fetch = _FakeFetcher()
    res = mcr.refresh_market_caps_resumable(db, fetch=fetch, verbose=False)
    assert res["run_date"] == date.today().isoformat()
    assert fetch.calls == ["AAA"]          # not treated as already done


def test_market_cap_sweep_counts_a_failing_fetch_as_skipped(tmp_path):
    db = _caps_db(tmp_path / "f.db", ["AAA", "BBB"])
    res = mcr.refresh_market_caps_resumable(
        db, fetch=_FakeFetcher(raises=("AAA",)), verbose=False)
    assert res["complete"] is True
    assert res["failed"] == 1 and res["skipped"] == 1 and res["updated"] == 1
    assert _caps(db, "AAA", 2024) == 1.0   # untouched: the DB value is kept


def _job_run_count(db, job):
    conn = sqlite3.connect(db)
    try:
        return conn.execute(
            "SELECT COUNT(*) FROM job_runs WHERE job = ?", [job]).fetchone()[0]
    except sqlite3.OperationalError:
        return 0       # table not created yet
    finally:
        conn.close()


def test_market_weekly_returns_nonzero_when_every_step_fails(tmp_path):
    db = _caps_db(tmp_path / "f.db", ["AAA"])

    def _boom(*_a, **_k):
        raise RuntimeError("no network")

    class _BadDB:
        def __init__(self, _path):
            pass

        def refresh_fx_rates(self):
            raise RuntimeError("no network")

    assert mw.main(db, cap_refresher=_boom, db_factory=_BadDB) == 1


def test_market_weekly_withholds_the_marker_while_the_sweep_resumes(tmp_path):
    db = _caps_db(tmp_path / "f.db", ["AAA"])

    class _OkDB:
        def __init__(self, _path):
            pass

        def refresh_fx_rates(self):
            return 3

    def _partial(*_a, **_k):
        return {"complete": False, "remaining": 12, "run_date": "2026-09-20"}

    assert mw.main(db, cap_refresher=_partial, db_factory=_OkDB) == 0
    assert _job_run_count(db, mw.JOB_NAME) == 0

    def _done(*_a, **_k):
        return {"complete": True, "remaining": 0, "run_date": "2026-09-20"}

    assert mw.main(db, cap_refresher=_done, db_factory=_OkDB) == 0
    assert _job_run_count(db, mw.JOB_NAME) == 1
