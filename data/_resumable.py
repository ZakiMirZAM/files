"""The shared half of the two resumable universe walks.

``market_pe.py`` and ``market_cap_refresh.py`` walk roughly 30,000 tickers
at about a second each, so both keep a per-ticker progress table keyed on
the run date, resume the unfinished run on the next invocation, and abandon
a run that has gone stale. They had two copies of that, and the copies had
already drifted on the one decision that matters:

* ``market_pe`` asked for the newest run date whose run has produced no
  ``market_aggregates`` row, so a FINISHED run is never resumed;
* ``market_cap_refresh`` asked for ``MAX(run_date)`` and relied on its
  progress rows surviving completion as the completion record, which works
  but says nothing about whether the run finished.

The first rule is the intended one: "resume the newest run that has not
finished yet". It is shared here, with the finished-run test supplied by
the caller, because the two jobs record completion in different tables.
``market_cap_refresh`` keeps its progress rows, so for it the test is
"this run has nothing left pending", which the caller already computes;
passing no ``finished_sql`` reproduces its old behaviour exactly.

Each job keeps its own batch loop: the fetching, the guards and what a row
means are genuinely different.
"""

from __future__ import annotations

import datetime
import sqlite3
from typing import Optional

# An unfinished run older than this is abandoned rather than resumed: past a
# week, what it already fetched is the stale thing we were refreshing.
RESUME_DAYS = 7

_IDENT_OK = set(
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_"
)


def _check_table(table: str) -> str:
    """Table names are interpolated, so they are checked, not trusted."""
    if not table or not set(table) <= _IDENT_OK:
        raise ValueError(f"unsupported progress table name: {table!r}")
    return table


def create_progress_table(
    conn: sqlite3.Connection,
    table: str,
    payload_columns: tuple[tuple[str, str], ...],
) -> None:
    """``(run_date, ticker, <payload>, PRIMARY KEY (run_date, ticker))``."""
    _check_table(table)
    cols = "".join(f"  {name} {decl},\n" for name, decl in payload_columns)
    conn.execute(
        f"CREATE TABLE IF NOT EXISTS {table} (\n"
        "  run_date TEXT,\n"
        "  ticker TEXT,\n"
        f"{cols}"
        "  PRIMARY KEY (run_date, ticker)\n"
        ")"
    )


def purge_abandoned(
    conn: sqlite3.Connection,
    table: str,
    *,
    today: Optional[datetime.date] = None,
    resume_days: int = RESUME_DAYS,
) -> None:
    """Drop progress rows older than the abandonment window, and commit."""
    _check_table(table)
    day = today or datetime.date.today()
    cutoff = (day - datetime.timedelta(days=resume_days)).isoformat()
    conn.execute(f"DELETE FROM {table} WHERE run_date < ?", [cutoff])
    conn.commit()


def pick_run_date(
    conn: sqlite3.Connection,
    table: str,
    *,
    finished_sql: Optional[str] = None,
    today: Optional[datetime.date] = None,
    resume_days: int = RESUME_DAYS,
) -> str:
    """Resume the newest unfinished run inside the window, else start today.

    ``finished_sql`` is a SELECT returning the run dates that HAVE finished
    (for ``market_pe``: the ones with a ``market_aggregates`` row). Those
    are never resumed. Abandoned runs are purged on the way past.
    """
    _check_table(table)
    day = today or datetime.date.today()
    purge_abandoned(conn, table, today=day, resume_days=resume_days)

    finished: set[str] = set()
    if finished_sql:
        finished = {str(r[0]) for r in conn.execute(finished_sql).fetchall()}

    rows = conn.execute(
        f"SELECT DISTINCT run_date FROM {table} ORDER BY run_date DESC"
    ).fetchall()
    for r in rows:
        raw = str(r[0])
        if raw in finished:
            continue
        try:
            started = datetime.date.fromisoformat(raw)
        except (TypeError, ValueError):
            continue
        if 0 <= (day - started).days <= resume_days:
            return raw
    return day.isoformat()


def done_tickers(
    conn: sqlite3.Connection,
    table: str,
    run_date: str,
) -> set[str]:
    """The tickers this run has already recorded."""
    _check_table(table)
    return {
        str(r[0])
        for r in conn.execute(
            f"SELECT ticker FROM {table} WHERE run_date = ?", [run_date],
        )
    }
