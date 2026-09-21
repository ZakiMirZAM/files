"""The shared pieces of the two resumable universe walks (``data/``).

``data/_jobs.py`` owns the ``job_runs`` upsert; ``data/_resumable.py`` owns
the progress DDL, the run-date pick with its seven-day abandonment window
and the already-done set. ``market_pe`` and ``market_cap_refresh`` keep
their own batch loops.
"""

from __future__ import annotations

import datetime
import os
import sqlite3
import sys

import pytest

_HERE = os.path.dirname(os.path.abspath(__file__))
for _p in (os.path.join(_HERE, "..", "data"), _HERE):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import _jobs  # noqa: E402
import _resumable  # noqa: E402


@pytest.fixture
def conn():
    c = sqlite3.connect(":memory:")
    yield c
    c.close()


class TestJobRuns:

    def test_first_write_creates_the_table_and_the_row(self, conn):
        _jobs.upsert_job_run(conn, "market_pe", "2026-09-20T10:00:00")
        assert _jobs.last_run(conn, "market_pe") == "2026-09-20T10:00:00"

    def test_a_second_run_updates_rather_than_crashing(self, conn):
        _jobs.upsert_job_run(conn, "market_pe", "2026-09-20T10:00:00")
        _jobs.upsert_job_run(conn, "market_pe", "2026-09-27T10:00:00")
        rows = conn.execute("SELECT job, last_run FROM job_runs").fetchall()
        assert rows == [("market_pe", "2026-09-27T10:00:00")]

    def test_two_jobs_keep_their_own_rows(self, conn):
        _jobs.upsert_job_run(conn, "market_pe", "2026-09-20T10:00:00")
        _jobs.upsert_job_run(conn, "market_weekly_caps", "2026-09-21T10:00:00")
        assert _jobs.last_run(conn, "market_pe") == "2026-09-20T10:00:00"
        assert _jobs.last_run(conn, "market_weekly_caps") == "2026-09-21T10:00:00"

    def test_a_legacy_table_without_a_primary_key_raises_for_the_caller(self, conn):
        conn.execute("CREATE TABLE job_runs (job TEXT, last_run TEXT)")
        with pytest.raises(sqlite3.OperationalError):
            _jobs.upsert_job_run(conn, "market_pe")

    def test_last_run_is_none_when_nothing_was_written(self, conn):
        assert _jobs.last_run(conn, "market_pe") is None


class TestProgressTable:

    def test_the_ddl_keys_on_run_date_and_ticker(self, conn):
        _resumable.create_progress_table(
            conn, "p", (("mc", "REAL"), ("included", "INTEGER")),
        )
        cols = [r[1] for r in conn.execute("PRAGMA table_info(p)")]
        assert cols == ["run_date", "ticker", "mc", "included"]
        conn.execute("INSERT INTO p VALUES ('2026-09-20', 'AAPL', 1.0, 1)")
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute("INSERT INTO p VALUES ('2026-09-20', 'AAPL', 2.0, 1)")

    def test_a_hostile_table_name_is_refused(self, conn):
        with pytest.raises(ValueError):
            _resumable.create_progress_table(conn, "p; DROP TABLE x", ())

    def test_done_tickers_is_scoped_to_the_run(self, conn):
        _resumable.create_progress_table(conn, "p", (("mc", "REAL"),))
        conn.executemany("INSERT INTO p VALUES (?, ?, ?)", [
            ("2026-09-20", "AAPL", 1.0),
            ("2026-09-20", "MSFT", 2.0),
            ("2026-09-13", "NVDA", 3.0),
        ])
        assert _resumable.done_tickers(conn, "p", "2026-09-20") == {"AAPL", "MSFT"}


class TestPickRunDate:

    TODAY = datetime.date(2026, 9, 20)

    def _table(self, conn, rows):
        _resumable.create_progress_table(conn, "p", (("mc", "REAL"),))
        conn.executemany(
            "INSERT INTO p VALUES (?, ?, ?)",
            [(d, t, 1.0) for d, t in rows],
        )
        conn.commit()

    def test_an_empty_table_starts_a_run_dated_today(self, conn):
        self._table(conn, [])
        assert _resumable.pick_run_date(conn, "p", today=self.TODAY) == "2026-09-20"

    def test_a_young_unfinished_run_is_resumed(self, conn):
        self._table(conn, [("2026-09-17", "AAPL")])
        assert _resumable.pick_run_date(conn, "p", today=self.TODAY) == "2026-09-17"

    def test_the_newest_unfinished_run_wins(self, conn):
        self._table(conn, [("2026-09-15", "AAPL"), ("2026-09-18", "MSFT")])
        assert _resumable.pick_run_date(conn, "p", today=self.TODAY) == "2026-09-18"

    def test_an_abandoned_run_is_purged_and_a_fresh_one_starts(self, conn):
        self._table(conn, [("2026-09-01", "AAPL")])
        assert _resumable.pick_run_date(conn, "p", today=self.TODAY) == "2026-09-20"
        assert conn.execute("SELECT COUNT(*) FROM p").fetchone()[0] == 0

    def test_a_finished_run_is_never_resumed(self, conn):
        """market_pe's rule: a run that wrote its aggregate row is done."""
        self._table(conn, [("2026-09-18", "AAPL")])
        conn.execute("CREATE TABLE agg (run_date TEXT)")
        conn.execute("INSERT INTO agg VALUES ('2026-09-18')")
        conn.commit()
        picked = _resumable.pick_run_date(
            conn, "p", finished_sql="SELECT run_date FROM agg", today=self.TODAY,
        )
        assert picked == "2026-09-20"

    def test_without_finished_sql_a_completed_run_is_still_resumed(self, conn):
        """market_cap_refresh keeps its progress rows as the completion
        record, so it resumes the run and finds nothing pending."""
        self._table(conn, [("2026-09-18", "AAPL")])
        assert _resumable.pick_run_date(conn, "p", today=self.TODAY) == "2026-09-18"

    def test_a_junk_run_date_is_skipped_not_crashed_on(self, conn):
        self._table(conn, [("not-a-date", "AAPL"), ("2026-09-18", "MSFT")])
        assert _resumable.pick_run_date(conn, "p", today=self.TODAY) == "2026-09-18"

    def test_a_future_dated_run_is_not_resumed(self, conn):
        self._table(conn, [("2026-09-25", "AAPL")])
        assert _resumable.pick_run_date(conn, "p", today=self.TODAY) == "2026-09-20"


class TestBothWalksUseTheHelpers:

    def test_market_pe_picks_the_unfinished_run(self, tmp_path):
        import market_pe

        path = str(tmp_path / "f.db")
        conn = sqlite3.connect(path)
        market_pe._ensure_table(conn)
        conn.execute(
            "INSERT INTO market_pe_progress VALUES (?, ?, ?, ?, ?)",
            (datetime.date.today().isoformat(), "AAPL", 1.0, 1.0, 1),
        )
        conn.commit()
        assert market_pe._pick_run_date(conn) == datetime.date.today().isoformat()
        conn.close()

    def test_market_cap_refresh_shares_the_window(self):
        import market_cap_refresh

        assert market_cap_refresh.RESUME_DAYS == _resumable.RESUME_DAYS
