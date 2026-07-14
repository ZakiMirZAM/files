"""bulk_sweep (quarterly): thin orchestrator over the Phase 3 backfill.

Re-runs the two Phase 3 tools end-to-end against the production DB so any
newly-missing primaries and freshly-frozen tickers get their fundamentals
back-filled once a quarter, then recomputes the derived ratio NULLs:

  1. ``phase3_backfill.main([db, "--missing", "--frozen"])``
     (resumable yfinance sweep with checkpoint + adaptive backoff)
  2. ``phase3_complete_rows.main([db, "--ratios"])``
     (set-based derived-ratio NULL fill, network-free)

This is deliberately a thin wrapper: all the real logic (target selection,
pacing, checkpointing) lives in the Phase 3 modules. Writes its own
``job_runs('bulk_sweep')`` marker in addition to the markers those tools write.

Usage:
    python remediation/jobs/bulk_sweep.py <db_path>
"""

from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _jobslib as jobs  # noqa: E402

jobs.ensure_sys_path()

import phase3_backfill  # noqa: E402
import phase3_complete_rows  # noqa: E402

JOB_NAME = "bulk_sweep"


def main(db_path: str) -> int:
    """Run the backfill sweep then the ratio fill. Each stage is isolated so a
    failure in one is logged but still lets the other (and the marker) run."""
    if not os.path.exists(db_path):
        print(f"DB not found: {db_path}", file=sys.stderr)
        return 2

    print("[bulk_sweep] stage 1/2: phase3_backfill --missing --frozen")
    try:
        phase3_backfill.main([db_path, "--missing", "--frozen"])
    except Exception as exc:  # noqa: BLE001 — never let one stage abort the run
        print(f"  WARN: phase3_backfill failed: {exc}", file=sys.stderr)

    print("[bulk_sweep] stage 2/2: phase3_complete_rows --ratios")
    try:
        phase3_complete_rows.main([db_path, "--ratios"])
    except Exception as exc:  # noqa: BLE001
        print(f"  WARN: phase3_complete_rows failed: {exc}", file=sys.stderr)

    jobs.write_job_run(db_path, JOB_NAME)
    print("[bulk_sweep] done")
    return 0


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Quarterly Phase 3 re-sweep.")
    p.add_argument("db_path", help="Path to the working financials DB (read-write).")
    return p.parse_args(argv)


if __name__ == "__main__":
    raise SystemExit(main(_parse_args().db_path))
