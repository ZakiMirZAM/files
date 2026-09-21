"""The ``job_runs`` completion marker, in one place.

``job_runs`` has ``job TEXT PRIMARY KEY``, so a plain INSERT crashes on the
second run of any job. The upsert was written out three times (this
package's two resumable walks and ``remediation/jobs/_jobslib.py``); it
lives here once, and ``_jobslib.write_job_run`` delegates to it while
keeping its own fallback for a legacy DB whose ``job_runs`` has no primary
key.
"""

from __future__ import annotations

import datetime
import sqlite3
from typing import Optional

DDL = "CREATE TABLE IF NOT EXISTS job_runs (job TEXT PRIMARY KEY, last_run TEXT)"


def ensure_job_runs(conn: sqlite3.Connection) -> None:
    """Create ``job_runs`` when a fresh DB does not have it yet."""
    conn.execute(DDL)


def upsert_job_run(
    conn: sqlite3.Connection,
    job: str,
    last_run: Optional[str] = None,
    *,
    commit: bool = True,
) -> None:
    """Write the completion marker for ``job``.

    ``last_run`` defaults to now, in the same ``YYYY-MM-DDTHH:MM:SS`` shape
    the freshness tooling reads. Raises ``sqlite3.OperationalError`` on a
    legacy table with no primary key; the caller decides whether to fall
    back (see ``remediation/jobs/_jobslib.write_job_run``).
    """
    ensure_job_runs(conn)
    stamp = last_run or datetime.datetime.now().isoformat(timespec="seconds")
    conn.execute(
        "INSERT INTO job_runs(job, last_run) VALUES(?, ?) "
        "ON CONFLICT(job) DO UPDATE SET last_run=excluded.last_run",
        [job, stamp],
    )
    if commit:
        conn.commit()


def last_run(conn: sqlite3.Connection, job: str) -> Optional[str]:
    """The stored marker for ``job``, or None."""
    try:
        row = conn.execute(
            "SELECT last_run FROM job_runs WHERE job = ?", [job],
        ).fetchone()
    except sqlite3.Error:
        return None
    return str(row[0]) if row and row[0] is not None else None
