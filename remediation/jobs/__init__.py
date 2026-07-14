"""Phase 5 STANDING AUTOMATION for the financials-DB remediation.

This package holds the recurring maintenance jobs that keep the fundamentals
warehouse current after the one-shot Phase 1-4 remediation. Each module exposes
a ``main(db_path, ...)`` entry point plus an ``argparse`` ``__main__`` and is
driven by Windows Task Scheduler (see ``register_tasks.ps1``):

  universe_sync    (weekly)    SEC registrant diff -> security_map add/rename/delist
  filings_watch    (daily)     EDGAR daily index -> per-filer fundamentals refresh
  market_weekly    (weekly)    market-cap + FX rate refresh
  bulk_sweep       (quarterly) thin re-run of the Phase 3 backfill + ratio fills
  freshness_monitor(daily)     staleness report to freshness_report.txt + stdout

Every run writes a ``job_runs`` marker; per-item failures are logged and counted,
never fatal to the run. Jobs take an explicit ``db_path`` argv (no default) and
are network-free-testable (see ``backend/test_phase5_jobs.py``).
"""
