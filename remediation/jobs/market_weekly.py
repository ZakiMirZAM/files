"""market_weekly (weekly): refresh market caps and FX rates.

Thin wrapper over the two ``FinancialDB`` maintenance calls the size-weighted
scorecards depend on:

  - ``refresh_market_caps()`` re-reads the latest stored Market Cap from
    yfinance for every ticker (kept in the company's REPORTING currency).
  - ``refresh_fx_rates()`` refreshes ``fx_rates`` (currency -> USD) so
    cross-currency size WEIGHTS reconcile; ratios are never FX-converted.

Both are additive/idempotent and isolate their own failures. Writes a
``job_runs`` marker.

Usage:
    python remediation/jobs/market_weekly.py <db_path>
"""

from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _jobslib as jobs  # noqa: E402

jobs.ensure_sys_path()

JOB_NAME = "market_weekly"


def main(db_path: str, *, db_factory=None) -> int:
    """Refresh market caps then FX rates. Each step is guarded so a failure in
    one does not skip the other or the job marker."""
    if not os.path.exists(db_path):
        print(f"DB not found: {db_path}", file=sys.stderr)
        return 2

    if db_factory is None:
        from financial_db import FinancialDB  # lazy: pulls yfinance/pandas
        db_factory = FinancialDB
    db = db_factory(db_path)

    print("[market_weekly] refreshing market caps ...")
    try:
        caps = db.refresh_market_caps()
        print(f"  market caps: {caps}")
    except Exception as exc:  # noqa: BLE001 — never let one step abort the run
        print(f"  WARN: refresh_market_caps failed: {exc}", file=sys.stderr)

    print("[market_weekly] refreshing FX rates ...")
    try:
        n = db.refresh_fx_rates()
        print(f"  fx rates stored: {n}")
    except Exception as exc:  # noqa: BLE001
        print(f"  WARN: refresh_fx_rates failed: {exc}", file=sys.stderr)

    jobs.write_job_run(db_path, JOB_NAME)
    return 0


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Weekly market-cap + FX refresh.")
    p.add_argument("db_path", help="Path to the working financials DB (read-write).")
    return p.parse_args(argv)


if __name__ == "__main__":
    raise SystemExit(main(_parse_args().db_path))
