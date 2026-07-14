"""freshness_monitor (daily/weekly): staleness report for the warehouse.

Reads the DB read-only and the Phase 3 checkpoints, then writes a plain-text
report (``freshness_report.txt``) and echoes it to stdout. Every section carries
an OK / WARN / ALERT verdict against documented thresholds:

  Fundamentals    fraction of tickers whose newest Calendar Year is "frozen"
                  (older than last year). WARN > 30%, ALERT > 60%.
  FX rates        age in days of the oldest fx_rates.asof.
                  WARN > 10d, ALERT > 30d.
  TTM rows        count of Period='TTM' rows (WARN < 1 == ALERT at 0), and their
                  median last_updated age. WARN > 100d, ALERT > 200d.
  Job runs        age of each job's most recent last_run.
                  WARN > 10d, ALERT > 40d (a job silent for weeks).
  Checkpoints     failed/unresolved counts from phase3 / phase3b checkpoints.
                  WARN > 50, ALERT > 500.

Nothing is written to the DB. Usage:
    python remediation/jobs/freshness_monitor.py <db_path>
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import statistics
import sys
from dataclasses import dataclass
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _jobslib as jobs  # noqa: E402

JOB_NAME = "freshness_monitor"
REPORT_FILE = os.path.join(jobs.JOBS_DIR, "freshness_report.txt")

# ── documented thresholds ───────────────────────────────────────────────────────
FROZEN_FRAC_WARN, FROZEN_FRAC_ALERT = 0.30, 0.60
FX_AGE_WARN_DAYS, FX_AGE_ALERT_DAYS = 10, 30
TTM_AGE_WARN_DAYS, TTM_AGE_ALERT_DAYS = 100, 200
JOB_AGE_WARN_DAYS, JOB_AGE_ALERT_DAYS = 10, 40
CHECKPOINT_WARN, CHECKPOINT_ALERT = 50, 500

_STATUS_ORDER = {"OK": 0, "WARN": 1, "ALERT": 2}


@dataclass(frozen=True)
class Line:
    label: str
    status: str  # OK | WARN | ALERT
    detail: str

    def render(self) -> str:
        return f"  [{self.status:<5}] {self.label}: {self.detail}"


def classify(value: float | None, warn: float, alert: float,
             *, higher_is_worse: bool = True) -> str:
    """Bucket ``value`` into OK / WARN / ALERT against two thresholds.

    ``higher_is_worse`` (the default) treats bigger values as more stale (ages,
    counts of failures). Set it False for metrics where a small value is the
    problem (e.g. a TTM row count). A ``None`` value is treated as ALERT
    (missing data is the worst signal a monitor can get).
    """
    if value is None:
        return "ALERT"
    if higher_is_worse:
        if value > alert:
            return "ALERT"
        if value > warn:
            return "WARN"
        return "OK"
    if value < alert:
        return "ALERT"
    if value < warn:
        return "WARN"
    return "OK"


def _age_days(iso: str | None, today: date) -> int | None:
    """Whole days between an ISO date/datetime string and ``today``. None on
    unparseable input."""
    if not iso:
        return None
    try:
        parsed = datetime.fromisoformat(str(iso).replace("Z", "")).date()
    except ValueError:
        try:
            parsed = date.fromisoformat(str(iso)[:10])
        except ValueError:
            return None
    return (today - parsed).days


# ── section builders (each returns (Line, extra stdout lines)) ───────────────────
def check_fundamentals(conn: sqlite3.Connection, today: date) -> tuple[Line, list[str]]:
    """Max-Calendar-Year distribution + frozen fraction."""
    current_year = today.year
    frozen_before = current_year - 1  # newest year < this == frozen
    rows = conn.execute(
        'SELECT my, COUNT(*) FROM ('
        '  SELECT Ticker, MAX(CAST("Calendar Year" AS INTEGER)) AS my '
        '  FROM financials '
        "  WHERE \"Calendar Year\" GLOB '[0-9][0-9][0-9][0-9]' "
        '  GROUP BY Ticker) GROUP BY my ORDER BY my DESC'
    ).fetchall()
    total = sum(n for _, n in rows)
    frozen = sum(n for y, n in rows if y is not None and int(y) < frozen_before)
    frac = (frozen / total) if total else None
    status = classify(frac, FROZEN_FRAC_WARN, FROZEN_FRAC_ALERT)
    pct = f"{frac * 100:.1f}%" if frac is not None else "n/a"
    line = Line("fundamentals frozen",
                status,
                f"{frozen}/{total} tickers newest year < {frozen_before} ({pct})")
    extra = ["  max Calendar Year distribution (year: tickers):"]
    for y, n in rows[:8]:
        extra.append(f"      {y}: {n}")
    return line, extra


def check_fx(conn: sqlite3.Connection, today: date) -> tuple[Line, list[str]]:
    row = conn.execute(
        "SELECT COUNT(*), MIN(asof), MAX(asof) FROM fx_rates").fetchone()
    count = int(row[0]) if row else 0
    oldest = row[1] if row else None
    age = _age_days(oldest, today)
    status = classify(age, FX_AGE_WARN_DAYS, FX_AGE_ALERT_DAYS)
    detail = (f"{count} rates, oldest asof {oldest} "
              f"({age}d old)" if age is not None else f"{count} rates, no asof")
    return Line("fx rates", status, detail), []


def check_ttm(conn: sqlite3.Connection, today: date) -> tuple[Line, list[str]]:
    try:
        rows = conn.execute(
            "SELECT last_updated FROM financials_quarterly WHERE Period = 'TTM'"
        ).fetchall()
    except sqlite3.OperationalError:
        return Line("ttm rows", "ALERT", "financials_quarterly missing"), []
    count = len(rows)
    ages = [a for a in (_age_days(r[0], today) for r in rows) if a is not None]
    median = statistics.median(ages) if ages else None
    count_status = classify(count, 1, 1, higher_is_worse=False)  # 0 -> ALERT
    age_status = classify(median, TTM_AGE_WARN_DAYS, TTM_AGE_ALERT_DAYS)
    status = max((count_status, age_status), key=lambda s: _STATUS_ORDER[s])
    median_txt = f"{median:.0f}d" if median is not None else "n/a"
    return Line("ttm rows", status,
                f"count={count}, median age={median_txt}"), []


def check_jobs(conn: sqlite3.Connection, today: date) -> tuple[Line, list[str]]:
    """Age of each job's most recent last_run; worst verdict rolls up."""
    try:
        rows = conn.execute(
            "SELECT job, MAX(last_run) FROM job_runs GROUP BY job ORDER BY job"
        ).fetchall()
    except sqlite3.OperationalError:
        return Line("job runs", "ALERT", "job_runs table missing"), []
    if not rows:
        return Line("job runs", "ALERT", "no job_runs recorded"), []
    worst = "OK"
    extra = ["  last run per job:"]
    for job, last in rows:
        age = _age_days(last, today)
        st = classify(age, JOB_AGE_WARN_DAYS, JOB_AGE_ALERT_DAYS)
        if _STATUS_ORDER[st] > _STATUS_ORDER[worst]:
            worst = st
        age_txt = f"{age}d" if age is not None else "?"
        extra.append(f"      [{st:<5}] {job}: {last} ({age_txt} ago)")
    return Line("job runs", worst, f"{len(rows)} jobs tracked"), extra


def _checkpoint_failures(path: str, key: str = "failed") -> int | None:
    """Count entries under ``key`` in a checkpoint JSON. None if absent."""
    if not os.path.exists(path):
        return None
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
    except (json.JSONDecodeError, OSError):
        return None
    val = data.get(key)
    if isinstance(val, dict):
        return len(val)
    if isinstance(val, list):
        return len(val)
    if isinstance(val, int):
        return val
    return 0


def check_checkpoints() -> tuple[Line, list[str]]:
    """Failed/unresolved counts across the Phase 3 checkpoints."""
    sources = [
        ("phase3 backfill failed",
         os.path.join(jobs.REMEDIATION_DIR, "phase3_checkpoint.json"), "failed"),
        ("phase3b delisted failed",
         os.path.join(jobs.REMEDIATION_DIR, "phase3b_checkpoint.json"), "failed"),
        ("phase3b unresolved",
         os.path.join(jobs.REMEDIATION_DIR, "phase3b_targets.json"), "unresolved"),
    ]
    worst = "OK"
    extra = ["  checkpoint failure counts:"]
    seen_any = False
    for label, path, key in sources:
        count = _checkpoint_failures(path, key)
        if count is None:
            extra.append(f"      {label}: (no file)")
            continue
        seen_any = True
        st = classify(count, CHECKPOINT_WARN, CHECKPOINT_ALERT)
        if _STATUS_ORDER[st] > _STATUS_ORDER[worst]:
            worst = st
        extra.append(f"      [{st:<5}] {label}: {count}")
    if not seen_any:
        worst = "OK"
    return Line("checkpoints", worst, "phase3 / phase3b resume state"), extra


def build_report(db_path: str, today: date | None = None) -> str:
    """Assemble the full plain-text report string (also returned for tests)."""
    today = today or date.today()
    header = [
        "IntrinsicFinEd - data freshness report",
        f"generated: {datetime.now().isoformat(timespec='seconds')}",
        f"db: {db_path}",
        "",
    ]
    body: list[str] = []
    with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True) as conn:
        for builder in (check_fundamentals, check_fx, check_ttm, check_jobs):
            line, extra = builder(conn, today)
            body.append(line.render())
            body.extend(extra)
    cp_line, cp_extra = check_checkpoints()
    body.append(cp_line.render())
    body.extend(cp_extra)
    return "\n".join(header + body) + "\n"


def main(db_path: str) -> int:
    if not os.path.exists(db_path):
        print(f"DB not found: {db_path}", file=sys.stderr)
        return 2
    report = build_report(db_path)
    try:
        with open(REPORT_FILE, "w", encoding="utf-8") as fh:
            fh.write(report)
    except OSError as exc:
        print(f"  WARN: could not write {REPORT_FILE}: {exc}", file=sys.stderr)
    print(report, end="")
    jobs.write_job_run(db_path, JOB_NAME)
    return 0


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Warehouse freshness report.")
    p.add_argument("db_path", help="Path to the working financials DB (read-only).")
    return p.parse_args(argv)


if __name__ == "__main__":
    raise SystemExit(main(_parse_args().db_path))
