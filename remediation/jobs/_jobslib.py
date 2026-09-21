"""Shared helpers for the Phase 5 standing-automation jobs.

Stdlib-only so the light jobs (universe_sync, freshness_monitor) never pull in
pandas/yfinance. Provides:

  - SEC-etiquette HTTP GET (contact UA, <=8 req/s rate limiter, retries)
  - ``write_job_run`` (the ``job_runs`` completion marker)
  - ``ensure_sys_path`` (adds data/ + remediation/ + this dir so bare-name
    imports match the repo convention used by the Phase 3 scripts)
  - ``write_python_path`` (persists the real interpreter for register_tasks.ps1)
"""

from __future__ import annotations

import os
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from datetime import date

# ── SEC etiquette ─────────────────────────────────────────────────────────────
USER_AGENT = "IntrinsicFinEd admin@intrinsicfined.org"
MIN_SEC_INTERVAL = 1.0 / 8.0  # <= 8 requests/second
HTTP_TIMEOUT = 30.0

# ── repo paths ────────────────────────────────────────────────────────────────
JOBS_DIR = os.path.dirname(os.path.abspath(__file__))
REMEDIATION_DIR = os.path.dirname(JOBS_DIR)
REPO_ROOT = os.path.dirname(REMEDIATION_DIR)
DATA_DIR = os.path.join(REPO_ROOT, "data")
PYTHON_PATH_FILE = os.path.join(JOBS_DIR, "python_path.txt")


def ensure_sys_path() -> None:
    """Add data/, remediation/, and this dir to ``sys.path`` (idempotent).

    Mirrors the standalone-import wiring the Phase 3 scripts use, so jobs can
    ``import identity_lib`` / ``from financial_db import FinancialDB`` by bare
    name whether run as a file path or imported by a test.
    """
    for path in (DATA_DIR, REMEDIATION_DIR, JOBS_DIR):
        if path not in sys.path:
            sys.path.insert(0, path)


class RateLimiter:
    """Wall-clock spacer so sec.gov hits stay under the request cap."""

    def __init__(self, min_interval: float = MIN_SEC_INTERVAL) -> None:
        self._min = min_interval
        self._last = 0.0

    def wait(self) -> None:
        gap = self._min - (time.monotonic() - self._last)
        if gap > 0:
            time.sleep(gap)
        self._last = time.monotonic()


_sec_limiter = RateLimiter()


def http_get(url: str, *, rate_limited: bool = True, retries: int = 2) -> bytes | None:
    """GET bytes with the SEC contact UA. Returns None on 404 / repeated error.

    Only sec.gov hosts need pacing; pass ``rate_limited=False`` for other hosts.
    Never raises: transient errors are retried with linear backoff, then logged.
    """
    last_err: Exception | None = None
    for attempt in range(retries + 1):
        if rate_limited:
            _sec_limiter.wait()
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
                return resp.read()
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                return None
            last_err = exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last_err = exc
        time.sleep(0.5 * (attempt + 1))
    print(f"  http_get failed: {url} ({last_err})", file=sys.stderr)
    return None


def write_job_run(db_path: str, job: str) -> None:
    """Insert the ``job_runs`` completion marker. Best-effort (logs on failure).

    Creates the table if a fresh DB does not have it yet, so a first run on a
    clean copy never dies on a missing ``job_runs``.
    """
    ensure_sys_path()
    import _jobs  # noqa: PLC0415 - data/ is on sys.path via ensure_sys_path

    try:
        with sqlite3.connect(db_path) as conn:
            try:
                _jobs.upsert_job_run(conn, job, commit=False)
            except sqlite3.OperationalError:
                # Legacy DB where job_runs lacks the PRIMARY KEY: emulate the
                # upsert so the marker still lands.
                conn.execute("DELETE FROM job_runs WHERE job = ?", [job])
                conn.execute(
                    "INSERT INTO job_runs(job, last_run) VALUES(?, datetime('now'))",
                    [job],
                )
            conn.commit()
    except sqlite3.Error as exc:
        print(f"  WARN: could not write job_runs marker for {job!r}: {exc}",
              file=sys.stderr)


def today_iso() -> str:
    """Today's date as an ISO ``YYYY-MM-DD`` string (own function so tests can
    monkeypatch the clock)."""
    return date.today().isoformat()


def write_python_path(exe: str | None = None) -> str:
    """Persist the real interpreter path to ``python_path.txt`` for the task
    registrar. Defaults to ``sys.executable`` (the interpreter running this),
    which is the real python, not the broken WindowsApps ``python`` alias.
    Returns the path written."""
    exe = exe or sys.executable
    with open(PYTHON_PATH_FILE, "w", encoding="utf-8") as fh:
        fh.write(exe.strip())
    return exe


if __name__ == "__main__":
    # `python remediation/jobs/_jobslib.py` writes python_path.txt so the
    # PowerShell registrar can pick up the real interpreter with no argument.
    written = write_python_path()
    print(f"wrote {PYTHON_PATH_FILE} -> {written}")
