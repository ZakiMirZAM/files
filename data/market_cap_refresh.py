"""market_cap_refresh.py

Resumable, budget-bounded version of ``FinancialDB.refresh_market_caps``.

The weekly MarketWeekly job walks roughly 32,000 tickers at about a second
each. It has no resume point, so the run that was killed after 58 minutes at
14,800 tickers threw away everything it had fetched and started over on the
following Saturday, which meant the sweep never finished at all.

This module ports the pattern ``data/market_pe.py`` already uses for the weekly
index-PE walk:

  * a progress table keyed on the run date, one row per ticker;
  * per-ticker commit, so a kill loses at most the ticker in flight;
  * batches bounded by a ticker count AND a wall-clock budget;
  * the next run RESUMES the unfinished run rather than restarting it;
  * a run left unfinished for too long is abandoned and a fresh one starts;
  * the ``job_runs`` marker is written only when the universe is finished.

``FinancialDB.refresh_market_caps`` keeps its public behaviour for callers that
want a single blocking pass.

Like that function, this one converts each quote out of the LISTING's currency
into the row's reporting currency before writing it (``data/fx_convert.py``).
The raw quote is what put TSM's USD ADR cap into its TWD row.
"""

from __future__ import annotations

import datetime
import logging
import os
import sqlite3
import sys
import time
from typing import Callable, Optional

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import _jobs
import _resumable
from financial_db import ROW_CURRENCY, fx_rates_from, write_market_cap

log = logging.getLogger("market_cap_refresh")

JOB_NAME = "market_weekly_caps"

# An unfinished run older than this is abandoned rather than resumed: past a
# week the caps it already fetched are the stale thing we were refreshing.
RESUME_DAYS = _resumable.RESUME_DAYS


def ensure_tables(conn: sqlite3.Connection) -> None:
    _resumable.create_progress_table(
        conn, "market_cap_progress",
        (("market_cap", "REAL"), ("status", "TEXT"), ("fetched_at", "TEXT")),
    )
    _jobs.ensure_job_runs(conn)


def pick_run_date(conn: sqlite3.Connection, *, resume_days: int = RESUME_DAYS) -> str:
    """Resume the most recent unfinished run when it is young enough, else start
    a run dated today. Abandoned runs are purged on the way past.

    This job keeps its progress rows after a run completes (they ARE the
    record that it finished), so a completed run inside the window is
    resumed and immediately finds nothing pending. No ``finished_sql`` is
    passed for that reason.
    """
    return _resumable.pick_run_date(
        conn, "market_cap_progress", resume_days=resume_days,
    )


def _write_job_run(conn: sqlite3.Connection, job: str = JOB_NAME) -> None:
    """Upsert the completion marker (``data/_jobs.py``)."""
    _jobs.upsert_job_run(conn, job)


def _split_fetch_result(res) -> tuple[Optional[float], Optional[str], bool]:
    """Normalise a ``fetch`` return into ``(cap, quote_currency, currency_known)``.

    The currency-aware fetcher returns ``(cap, currency)``; a plain float-returning
    fetcher (what existing callers and tests inject) returns just the cap, and for
    those the currency is UNKNOWN. An unknown currency is treated as "already in
    the row's currency", which is exactly the old behaviour, so injecting a plain
    fetcher keeps working."""
    if isinstance(res, tuple):
        cap, ccy = (list(res) + [None, None])[:2]
        return (None if cap is None else float(cap)), ccy, True
    return (None if res is None else float(res)), None, False


def refresh_market_caps_resumable(
    db_path: str,
    *,
    fetch: Optional[Callable[[str], object]] = None,
    tickers: Optional[list[str]] = None,
    batch_size: int = 40000,
    budget_seconds: float = 3 * 3600.0,
    throttle: float = 0.0,
    verbose: bool = True,
) -> dict:
    """Refresh the stored Market Cap for each ticker's latest year, resumably.

    ``fetch`` is injectable for testing and defaults to the currency-aware
    yfinance helper. It may return either ``(cap, quote_currency)`` — the cap is
    then CONVERTED into the row's ``"Reported Currency"`` and skipped when the
    pair has no rate — or a bare float, which is taken to be in the row's own
    currency already and written unchanged.

    Returns a dict carrying ``complete`` (the universe is finished), ``updated``
    / ``skipped`` / ``unconvertible`` for THIS call, the cumulative run totals,
    and ``remaining``.
    """
    if fetch is None:
        from financial_db import fetch_latest_market_cap_currency_yf  # noqa: PLC0415
        fetch = fetch_latest_market_cap_currency_yf

    conn = sqlite3.connect(db_path, timeout=30.0)
    try:
        # Match the busy_timeout the other writers use, and commit per ticker so
        # the write lock is never held across a network round trip. Holding it
        # across the fan-out is what used to lock every API reader out.
        conn.execute("PRAGMA busy_timeout = 30000")
        ensure_tables(conn)
        conn.commit()
        run_date = pick_run_date(conn)

        # Phase 1 — short READ transaction: universe + latest year per ticker.
        if tickers is None:
            tickers = [r[0] for r in conn.execute("SELECT DISTINCT Ticker FROM financials")]
        latest_year = {
            r[0]: r[1]
            # A range test, not a GLOB: "Calendar Year" is an INTEGER column,
            # so GLOB renders all 363k values as text and pattern-matches
            # them. Verified row-identical over the whole table; every write
            # path is gated by financial_db.is_valid_year_period anyway.
            for r in conn.execute(
                'SELECT Ticker, MAX(CAST("Calendar Year" AS INTEGER)) FROM financials '
                'WHERE CAST("Calendar Year" AS INTEGER) BETWEEN 1000 AND 9999 '
                "GROUP BY Ticker"
            )
        }
        rates = fx_rates_from(conn)
        already = _resumable.done_tickers(conn, "market_cap_progress", run_date)
        pending = [t for t in tickers if t not in already]

        started = time.monotonic()
        processed = updated = skipped = failed = unconvertible = 0
        for tk in pending:
            if processed >= max(1, int(batch_size)):
                break
            if processed and (time.monotonic() - started) >= budget_seconds:
                break

            quote_ccy: Optional[str] = None
            ccy_known = False
            try:
                cap, quote_ccy, ccy_known = _split_fetch_result(fetch(tk))
            except Exception as exc:  # noqa: BLE001 — one bad ticker never aborts a sweep
                log.debug("market cap fetch failed for %s: %s", tk, exc)
                cap, failed = None, failed + 1
            yr = latest_year.get(tk)

            # Phase 2: one short WRITE per ticker, the cap itself plus its
            # progress row, so a kill loses at most the ticker in flight. The
            # quote is in the LISTING's currency and the row is in the filer's
            # reporting currency, so write_market_cap converts and declines to
            # write when the pair cannot be resolved: a raw quote would corrupt
            # the row. A fetcher that reports no currency at all keeps the old
            # contract, where the quote is taken as already in the row's own
            # currency.
            cap_row: Optional[float] = None
            if cap is not None and yr is not None:
                cap_row = write_market_cap(
                    conn, tk, int(yr), cap,
                    quote_ccy if ccy_known else ROW_CURRENCY,
                    rates,
                )

            if cap is None or yr is None:
                status = "skipped"
                skipped += 1
            elif cap_row is None:
                status = "unconvertible"
                unconvertible += 1
            else:
                status = "updated"
                updated += 1
            conn.execute(
                "INSERT OR REPLACE INTO market_cap_progress "
                "(run_date, ticker, market_cap, status, fetched_at) VALUES (?, ?, ?, ?, ?)",
                [run_date, tk, cap_row if cap_row is not None else cap, status,
                 datetime.datetime.now().isoformat(timespec="seconds")],
            )
            conn.commit()

            processed += 1
            if verbose and processed % 100 == 0:
                print(f"  [market-cap] {processed} fetched this batch…", flush=True)
            if throttle:
                time.sleep(throttle)

        remaining = len(pending) - processed
        totals = conn.execute(
            "SELECT COUNT(*), COALESCE(SUM(status = 'updated'), 0) "
            "FROM market_cap_progress WHERE run_date = ?",
            [run_date],
        ).fetchone()
        run_seen, run_updated = int(totals[0]), int(totals[1])

        complete = remaining <= 0
        # The progress rows are NOT dropped on completion: they are the record
        # that this run finished. Dropping them made the very next invocation see
        # an empty table and walk the whole universe again. They age out through
        # pick_run_date's purge, which is what starts the following week's run.
        if complete and processed:
            _write_job_run(conn)

        result = {
            "run_date": run_date,
            "complete": complete,
            "done": processed,
            "remaining": max(0, remaining),
            "updated": updated,
            "skipped": skipped,
            "unconvertible": unconvertible,
            "failed": failed,
            "run_seen": run_seen,
            "run_updated": run_updated,
            "total": len(tickers),
        }
    finally:
        conn.close()

    if verbose:
        state = "complete" if result["complete"] else f"{result['remaining']} remaining"
        print(f"  [market-cap] batch done — {updated} refreshed, {skipped} kept DB value, "
              f"{unconvertible} left alone (currency unresolved) ({state})", flush=True)
    return result
