"""market_weekly (weekly): refresh market caps and FX rates.

Wrapper over the two maintenance calls the size-weighted scorecards depend on:

  - the market-cap sweep re-reads the latest stored Market Cap from yfinance for
    every ticker (kept in the company's REPORTING currency). It runs through
    ``market_cap_refresh.refresh_market_caps_resumable``: roughly 32,000 tickers
    at about a second each does not fit in one sitting, and the unresumable
    version threw away a 14,800-ticker run every time it was killed. Each batch
    is bounded by a ticker count and a wall-clock budget, every ticker is
    committed as it lands, and the NEXT run picks the walk up where this one
    stopped.
  - ``refresh_fx_rates()`` refreshes ``fx_rates`` (currency -> USD) so
    cross-currency size WEIGHTS reconcile; ratios are never FX-converted.

Both are additive/idempotent and isolate their own failures. The ``job_runs``
marker is written when the cap sweep FINISHES the universe, not on every batch.
Exit code is 1 when every step failed, so the Task Scheduler history shows a
failed run instead of a green one.

Usage:
    python remediation/jobs/market_weekly.py <db_path> [--budget-seconds N] [--batch-size N]
"""

from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _jobslib as jobs  # noqa: E402

jobs.ensure_sys_path()

JOB_NAME = "market_weekly"


DEFAULT_BUDGET_SECONDS = 3 * 3600.0
DEFAULT_BATCH_SIZE = 40000  # effectively unbounded; the wall-clock budget rules


def main(
    db_path: str,
    *,
    db_factory=None,
    cap_refresher=None,
    budget_seconds: float = DEFAULT_BUDGET_SECONDS,
    batch_size: int = DEFAULT_BATCH_SIZE,
) -> int:
    """Refresh market caps then FX rates. Each step is guarded so a failure in
    one does not skip the other. Returns 2 when the DB is missing, 1 when EVERY
    step failed, 0 otherwise (including a cap sweep that is mid-universe and
    will resume next run)."""
    if not os.path.exists(db_path):
        print(f"DB not found: {db_path}", file=sys.stderr)
        return 2

    if cap_refresher is None:
        from market_cap_refresh import refresh_market_caps_resumable  # noqa: PLC0415
        cap_refresher = refresh_market_caps_resumable

    caps_ok = fx_ok = False
    complete = False

    print("[market_weekly] refreshing market caps ...")
    try:
        caps = cap_refresher(db_path, batch_size=batch_size, budget_seconds=budget_seconds)
        complete = bool(caps.get("complete"))
        print(f"  market caps: {caps}")
        if not complete:
            print(f"  market caps: {caps.get('remaining')} tickers left; "
                  f"the next run resumes run_date={caps.get('run_date')}")
        caps_ok = True
    except Exception as exc:  # noqa: BLE001 — never let one step abort the run
        print(f"  WARN: market cap refresh failed: {exc}", file=sys.stderr)

    print("[market_weekly] refreshing FX rates ...")
    try:
        if db_factory is None:
            from financial_db import FinancialDB  # lazy: pulls yfinance/pandas
            db_factory = FinancialDB
        n = db_factory(db_path).refresh_fx_rates()
        print(f"  fx rates stored: {n}")
        fx_ok = True
    except Exception as exc:  # noqa: BLE001
        print(f"  WARN: refresh_fx_rates failed: {exc}", file=sys.stderr)

    if not caps_ok and not fx_ok:
        print("[market_weekly] every step failed", file=sys.stderr)
        return 1

    # The marker means "the weekly maintenance finished", so a cap sweep that is
    # still mid-universe does not earn one. (refresh_market_caps_resumable writes
    # its own finer-grained marker for the sweep itself.)
    if complete:
        jobs.write_job_run(db_path, JOB_NAME)
    else:
        print("[market_weekly] cap sweep incomplete; job_runs marker withheld")
    return 0


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Weekly market-cap + FX refresh.")
    p.add_argument("db_path", help="Path to the working financials DB (read-write).")
    p.add_argument("--budget-seconds", type=float, default=DEFAULT_BUDGET_SECONDS,
                   help="Wall-clock budget for the market-cap sweep (it resumes next run).")
    p.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE,
                   help="Maximum tickers per run.")
    return p.parse_args(argv)


if __name__ == "__main__":
    _args = _parse_args()
    raise SystemExit(main(_args.db_path, budget_seconds=_args.budget_seconds,
                          batch_size=_args.batch_size))
