"""Batched/resumable market-PE aggregate (data/market_pe.py).

Covers the three things the batching has to get right: a partial batch writes no
aggregate row, a resumed run re-fetches nothing, and the all-zero sentinel CIK is
not an identity. Network-free: yfinance is injected as a fake.
"""

import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "data"))

from market_pe import compute_market_pe_aggregate, last_attempt_date  # noqa: E402


_COLUMNS = ['Ticker', 'Cik', '"Market Cap"', 'EPS', '"EPS Diluted"',
            '"Calendar Year"', '"Reported Currency"']


def _make_db(path, rows):
    """rows: (ticker, cik, market_cap, eps, eps_diluted)."""
    conn = sqlite3.connect(path)
    conn.execute(f"CREATE TABLE financials ({', '.join(c + ' TEXT' for c in _COLUMNS)})")
    conn.executemany(
        'INSERT INTO financials (Ticker, Cik, "Market Cap", EPS, "EPS Diluted", '
        '"Calendar Year", "Reported Currency") VALUES (?, ?, ?, ?, ?, ?, ?)',
        [(t, cik, mc, eps, eps_d, "2024", "USD") for t, cik, mc, eps, eps_d in rows],
    )
    conn.commit()
    conn.close()
    return str(path)


def _add_security_map(db, rows):
    """rows: (symbol, cik, is_primary)."""
    conn = sqlite3.connect(db)
    conn.execute("CREATE TABLE IF NOT EXISTS security_map "
                 "(cik TEXT, symbol TEXT PRIMARY KEY, is_primary INTEGER)")
    conn.executemany("INSERT OR REPLACE INTO security_map (symbol, cik, is_primary) "
                     "VALUES (?, ?, ?)", rows)
    conn.commit()
    conn.close()


class FakeYF:
    """Deterministic yfinance stand-in that records every ticker it is asked for.

    ``per_ticker`` overrides the default quote for named tickers, so a single
    fake can serve a mix of sane and pathological rows.
    """

    def __init__(self, price=10.0, eps=1.0, mc=1000.0, per_ticker=None):
        self.calls = []
        self._price, self._eps, self._mc = price, eps, mc
        self._per_ticker = per_ticker or {}

    def Ticker(self, ticker):  # noqa: N802 — mirrors the yfinance API
        self.calls.append(ticker)
        override = self._per_ticker.get(ticker, {})
        quote = {"currentPrice": self._price, "trailingEps": self._eps,
                 "marketCap": self._mc}
        quote.update(override)

        class _T:
            @property
            def info(self):
                return quote

        return _T()


def _aggregates(db):
    conn = sqlite3.connect(db)
    try:
        return conn.execute("SELECT * FROM market_aggregates").fetchall()
    finally:
        conn.close()


def _progress_count(db):
    conn = sqlite3.connect(db)
    try:
        return conn.execute("SELECT COUNT(*) FROM market_pe_progress").fetchone()[0]
    finally:
        conn.close()


def test_batches_resume_without_refetching(tmp_path):
    db = _make_db(tmp_path / "f.db",
                  [(f"T{i}", f"000000000{i}", "1000", "1.0", "1.0") for i in range(1, 6)])
    yf = FakeYF()

    first = compute_market_pe_aggregate(db, throttle=0, yf_module=yf, batch_size=2)
    assert first["complete"] is False
    assert first["done"] == 2
    assert first["remaining"] == 3
    assert _aggregates(db) == []          # nothing published mid-run
    assert _progress_count(db) == 2       # ... but the work is durable

    second = compute_market_pe_aggregate(db, throttle=0, yf_module=yf, batch_size=2)
    assert second["complete"] is False
    assert second["done"] == 2 and second["remaining"] == 1
    assert second["run_date"] == first["run_date"]
    assert _aggregates(db) == []

    third = compute_market_pe_aggregate(db, throttle=0, yf_module=yf, batch_size=2)
    assert third["complete"] is True
    assert third["ok"] is True
    assert third["n_constituents"] == 5
    assert third["market_pe"] == pytest.approx(10.0)

    rows = _aggregates(db)
    assert len(rows) == 1
    assert rows[0][3] == 5                # n_constituents
    assert _progress_count(db) == 0       # scratch cleared once published

    # The whole point of resuming: each ticker was fetched exactly once.
    assert sorted(yf.calls) == ["T1", "T2", "T3", "T4", "T5"]
    assert len(yf.calls) == len(set(yf.calls)) == 5


def test_sentinel_cik_does_not_collapse_companies(tmp_path):
    db = _make_db(tmp_path / "f.db", [
        ("AAA", "0000000000", "1000", "1.0", "1.0"),
        ("BBB", "0000000000", "2000", "1.0", "1.0"),
    ])
    yf = FakeYF()

    res = compute_market_pe_aggregate(db, throttle=0, yf_module=yf, batch_size=10)
    assert res["complete"] is True
    assert res["n_constituents"] == 2
    assert sorted(yf.calls) == ["AAA", "BBB"]


def test_zero_budget_processes_at_most_one_ticker(tmp_path):
    db = _make_db(tmp_path / "f.db",
                  [(f"T{i}", f"000000000{i}", "1000", "1.0", "1.0") for i in range(1, 4)])
    yf = FakeYF()

    res = compute_market_pe_aggregate(db, throttle=0, yf_module=yf,
                                      batch_size=10, budget_seconds=0)
    assert res["complete"] is False
    assert res["done"] == 1
    assert res["remaining"] == 2
    assert len(yf.calls) == 1


def _tables(db):
    conn = sqlite3.connect(db)
    try:
        return {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    finally:
        conn.close()


def test_no_persist_writes_nothing(tmp_path):
    """--no-persist must not even CREATE the scratch/aggregate tables, let alone
    run the abandoned-run DELETE: a dry run has to leave the file byte-identical
    in schema."""
    db = _make_db(tmp_path / "f.db",
                  [(f"T{i}", f"000000000{i}", "1000", "1.0", "1.0") for i in range(1, 3)])
    before = _tables(db)
    yf = FakeYF()

    res = compute_market_pe_aggregate(db, throttle=0, yf_module=yf, persist=False,
                                      batch_size=10)
    assert res["complete"] is True
    assert res["n_constituents"] == 2
    assert _tables(db) == before
    assert "market_aggregates" not in _tables(db)
    assert "market_pe_progress" not in _tables(db)


def test_near_zero_price_row_is_dropped(tmp_path):
    """A warrant priced at a fraction of a cent against a real per-share EPS makes
    |price/EPS| collapse toward zero and mc*EPS/price explode.

    The symmetric LOWER PE bound that used to catch this is gone: it was
    subsumed by the earnings-against-market-cap guard, which is what keeps
    the row out now. The behaviour is unchanged, which is the point."""
    db = _make_db(tmp_path / "f.db", [
        ("GOOD", "0000000001", "1000", "1.0", "1.0"),
        ("WARR", "0000000002", "1000", "1.0", "1.0"),
    ])
    yf = FakeYF(per_ticker={"WARR": {"currentPrice": 0.0001, "trailingEps": -1.0}})

    res = compute_market_pe_aggregate(db, throttle=0, yf_module=yf, batch_size=10)
    assert res["ok"] is True and res["complete"] is True
    assert res["n_constituents"] == 1          # WARR dropped
    assert res["skipped"] == 1
    assert res["market_pe"] == pytest.approx(10.0)


def test_earnings_above_market_cap_is_dropped(tmp_path):
    """|earnings| > market cap is an earnings yield above 100 percent, which is
    arithmetically impossible: the guard must hold independently of the PE bound."""
    db = _make_db(tmp_path / "f.db", [
        ("GOOD", "0000000001", "1000", "1.0", "1.0"),
        ("SPLIT", "0000000002", "1000", "1.0", "1.0"),
    ])
    # PE = 2.0 / 3.0 = 0.67, well inside the 1000 upper bound, so the PE
    # guard lets this through; earnings = 1000 * 3.0 / 2.0 = 1500 against a
    # 1000 cap does not.
    yf = FakeYF(per_ticker={"SPLIT": {"currentPrice": 2.0, "trailingEps": 3.0}})

    res = compute_market_pe_aggregate(db, throttle=0, yf_module=yf, batch_size=10)
    assert res["ok"] is True
    assert res["n_constituents"] == 1
    assert res["market_pe"] == pytest.approx(10.0)


def test_non_primary_listings_are_excluded(tmp_path):
    """security_map is_primary=0 (warrants, units, dual-class siblings) must not
    enter the universe at all, mirroring the comparative ranking queries."""
    db = _make_db(tmp_path / "f.db", [
        ("AAA", "0000000001", "1000", "1.0", "1.0"),
        ("AAAW", "0000000001", "1000", "1.0", "1.0"),
        ("BBB", "0000000002", "2000", "1.0", "1.0"),
    ])
    _add_security_map(db, [("AAA", "0000000001", 1), ("AAAW", "0000000001", 0),
                           ("BBB", "0000000002", 1)])
    yf = FakeYF()

    res = compute_market_pe_aggregate(db, throttle=0, yf_module=yf, batch_size=10)
    assert sorted(yf.calls) == ["AAA", "BBB"]
    assert res["n_constituents"] == 2


def test_placeholder_cik_alias_row_does_not_drop_a_ticker(tmp_path):
    """CIK '0000000000' is a placeholder, never an identity. An is_primary=0 row
    carrying it must not silently remove a real ticker from the universe."""
    db = _make_db(tmp_path / "f.db", [("AAA", "0000000001", "1000", "1.0", "1.0")])
    _add_security_map(db, [("AAA", "0000000000", 0)])
    yf = FakeYF()

    res = compute_market_pe_aggregate(db, throttle=0, yf_module=yf, batch_size=10)
    assert yf.calls == ["AAA"]
    assert res["n_constituents"] == 1


def test_failed_complete_run_is_recorded_and_not_retried(tmp_path):
    """A complete run with nothing usable used to delete its progress and start
    over about four times a day, forever. It must leave a dated failure marker so
    the scheduler can fall back to the normal weekly gate."""
    db = _make_db(tmp_path / "f.db", [("AAA", "0000000001", "1000", "1.0", "1.0")])
    yf = FakeYF(per_ticker={"AAA": {"currentPrice": None, "trailingEps": None,
                                    "marketCap": None}})

    res = compute_market_pe_aggregate(db, throttle=0, yf_module=yf, batch_size=10)
    assert res["ok"] is False
    assert res["reason"] == "insufficient_data"
    assert res["complete"] is True
    assert _progress_count(db) == 0       # scratch still cleared

    conn = sqlite3.connect(db)
    try:
        status = conn.execute(
            "SELECT run_date, status, reason, n_included, n_dropped FROM market_pe_status"
        ).fetchall()
        jobs = conn.execute("SELECT job, last_run FROM job_runs").fetchall()
    finally:
        conn.close()
    assert len(status) == 1
    assert status[0][1] == "failed" and status[0][2] == "insufficient_data"
    assert status[0][3] == 0 and status[0][4] == 1
    assert [j[0] for j in jobs] == ["market_pe"]

    # The attempt is dated, so the API gate sees a run today rather than "never".
    assert last_attempt_date(db) == status[0][0]

    # Re-running upserts rather than crashing on the status PK.
    compute_market_pe_aggregate(db, throttle=0, yf_module=yf, batch_size=10)
    conn = sqlite3.connect(db)
    try:
        assert conn.execute("SELECT COUNT(*) FROM market_pe_status").fetchone()[0] == 1
    finally:
        conn.close()


def test_aggregate_is_stamped_with_the_completion_date(tmp_path):
    """A multi-day walk publishes under the date it FINISHED; the start date is
    kept beside it so a resumed run still matches its own progress rows."""
    import datetime

    db = _make_db(tmp_path / "f.db", [("AAA", "0000000001", "1000", "1.0", "1.0")])
    started = (datetime.date.today() - datetime.timedelta(days=2)).isoformat()
    conn = sqlite3.connect(db)
    conn.execute("CREATE TABLE market_pe_progress (run_date TEXT, ticker TEXT, mc REAL,"
                 " earnings REAL, included INTEGER, PRIMARY KEY (run_date, ticker))")
    conn.execute("INSERT INTO market_pe_progress VALUES (?, 'SEED', 1000.0, 100.0, 1)",
                 [started])
    conn.commit()
    conn.close()

    res = compute_market_pe_aggregate(db, throttle=0, yf_module=FakeYF(), batch_size=10)
    assert res["complete"] is True and res["ok"] is True
    assert res["run_date"] == started
    assert res["computed_date"] == datetime.date.today().isoformat()

    rows = _aggregates(db)
    assert len(rows) == 1
    assert rows[0][0] == datetime.date.today().isoformat()


def test_the_dropped_lower_pe_bound_changes_nothing(tmp_path):
    """The removed |price/EPS| >= 0.02 bound kept no row the remaining guard
    does not keep.

    With mc > 0 and price > 0, ``|earnings_i| > mc`` is
    ``|mc * eps / price| > mc``, which is ``|price/eps| < 1``. That is a
    superset of ``|price/eps| < 0.02``. Checked exhaustively over a grid
    that straddles both thresholds rather than argued from the algebra
    alone; the live market_pe_progress table stores no price or EPS, so it
    cannot answer this question.
    """
    _PE_SANITY = 1000.0
    _OLD_MIN = 0.02
    kept_old = kept_new = 0
    checked = 0
    for mc in (1.0, 1e3, 1e9):
        for price in (1e-6, 1e-4, 0.01, 0.019, 0.02, 0.021, 0.5, 0.999,
                      1.0, 1.001, 2.0, 50.0, 999.0, 1000.0, 1001.0, 1e6):
            for eps in (-1e6, -50.0, -1.0, -0.001, 0.0, 0.001, 1.0, 50.0, 1e6):
                checked += 1
                pe_i = price / eps if eps != 0 else None
                earnings_i = mc * eps / price
                old_included = not (
                    (pe_i is not None and not (_OLD_MIN <= abs(pe_i) <= _PE_SANITY))
                    or abs(earnings_i) > mc
                )
                new_included = not (
                    (pe_i is not None and abs(pe_i) > _PE_SANITY)
                    or abs(earnings_i) > mc
                )
                assert old_included == new_included, (mc, price, eps)
                kept_old += old_included
                kept_new += new_included
    assert checked == 3 * 16 * 9
    assert kept_old == kept_new
    assert kept_new > 0, "the grid must actually keep something"
