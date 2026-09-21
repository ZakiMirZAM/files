"""
market_pe.py

Weekly market-wide aggregate PE / earnings yield for the economic-analysis
"Fed model" (earnings yield vs the 1-Year Treasury, FRED DGS1).

The aggregate is a TRUE market-cap-weighted index PE:

    earnings_i = marketCap_i * EPS_i / price_i        (= shares * EPS)
    index_PE   = sum(marketCap_i) / sum(earnings_i)
    earnings_yield = sum(earnings_i) / sum(marketCap_i) = 1 / index_PE

Universe: USD filers in financials.db, DEDUPED BY CIK so a company is counted
once (dual-class / multiply-listed tickers — GOOGL/GOOG, BRK-A/BRK-B — collapse
to one CIK). The representative ticker per CIK is the share class with the
largest stored Market Cap; yfinance is queried by that ticker (yfinance has no
CIK lookup — the CIK is purely the dedup/company key).

Price and trailing EPS come from yfinance (current price / TTM EPS). If yfinance
has no trailing EPS for a ticker, EPS falls back to the company's most-recent
year in financials.db ("EPS", then "EPS Diluted").

Each run writes one row to the market_aggregates table, accumulating a weekly
series. Designed to be invoked autonomously by the backend's in-process weekly
scheduler; also runnable as a script for a manual/fallback computation.
"""

from __future__ import annotations

import datetime
import logging
import os
import sqlite3
import time
from typing import Optional

import _jobs
import _resumable

log = logging.getLogger("market_pe")

_DEFAULT_DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "financials.db")

# Drop per-company readings whose |price/EPS| exceeds this — these are almost
# always data errors (a near-zero EPS exploding the ratio), not real valuations.
_PE_SANITY = 1000.0

# An unfinished run older than this is abandoned rather than resumed.
_RESUME_DAYS = _resumable.RESUME_DAYS

# Job name used for the job_runs completion/attempt marker.
_JOB_NAME = "market_pe"


def _f(v: object) -> Optional[float]:
    """Coerce to a finite float, or None."""
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f == f and f not in (float("inf"), float("-inf")) else None


def _ensure_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS market_aggregates (
          computed_date TEXT PRIMARY KEY,
          market_pe REAL,
          earnings_yield REAL,
          n_constituents INTEGER,
          method TEXT,
          computed_at TEXT,
          run_date TEXT
        )
        """
    )
    # run_date arrived after the table shipped; add it in place on an older file.
    cols = {r[1] for r in conn.execute("PRAGMA table_info(market_aggregates)")}
    if "run_date" not in cols:
        conn.execute("ALTER TABLE market_aggregates ADD COLUMN run_date TEXT")
    # Outcome of the most recent COMPLETE walk, success or failure. Without this a
    # failed complete run left no trace, so the staleness gate saw "never computed"
    # and restarted the whole universe sweep every six hours, indefinitely.
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS market_pe_status (
          run_date TEXT PRIMARY KEY,
          status TEXT,
          reason TEXT,
          n_included INTEGER,
          n_dropped INTEGER,
          completed_at TEXT
        )
        """
    )
    # Per-ticker scratch so a multi-hour, rate-limited universe walk survives a
    # crash/restart and resumes instead of starting over. Dropped once the run
    # writes its market_aggregates row.
    _resumable.create_progress_table(
        conn, "market_pe_progress",
        (("mc", "REAL"), ("earnings", "REAL"), ("included", "INTEGER")),
    )


def _has_table(conn: sqlite3.Connection, name: str) -> bool:
    return conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?", [name]
    ).fetchone() is not None


def _latest_usd_rows(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    """One row per USD-filer ticker at its most recent calendar year, with the
    fields needed for the aggregate (CIK, stored Market Cap, stored EPS).

    Restricted to PRIMARY listings, the same way the comparative ranking queries
    do it (``_ranking_for_industry`` in backend/api.py). A warrant or unit keeps
    the company's per-share EPS against a fraction-of-a-cent warrant price, and
    the resulting earnings term dwarfs the whole index: MVSTW alone contributed
    -4.23e14 to a -6.74e14 total on the 2026-09-20 run."""
    conn.row_factory = sqlite3.Row
    # Pre-remediation DBs (and test fixtures) have no security_map; degrade to the
    # unfiltered universe rather than failing the walk.
    primary_join = primary_filter = ""
    if _has_table(conn, "security_map"):
        primary_join = " LEFT JOIN security_map s ON s.symbol = f.Ticker"
        # CIK '0000000000' is a placeholder, never an identity, so an is_primary=0
        # row carrying it must not remove a real ticker from the universe.
        primary_filter = (
            " AND (COALESCE(s.is_primary, 1) = 1"
            " OR COALESCE(s.cik, '') = '0000000000')"
        )
    return conn.execute(
        f"""
        SELECT f.Ticker AS ticker, f.Cik AS cik,
               f."Market Cap" AS mc, f."EPS" AS eps, f."EPS Diluted" AS eps_d
        FROM financials f
        JOIN (
            SELECT Ticker, MAX(CAST("Calendar Year" AS INTEGER)) AS y
            FROM financials
            WHERE "Reported Currency" = 'USD'
            GROUP BY Ticker
        ) m ON m.Ticker = f.Ticker AND CAST(f."Calendar Year" AS INTEGER) = m.y
        {primary_join}
        WHERE f."Reported Currency" = 'USD'
          -- US listings only: a foreign listing that merely REPORTS in USD (0005.HK,
          -- BYAN.JK) carries a local-currency Market Cap and a local-currency
          -- yfinance quote, so its earnings term is in the wrong unit and can flip
          -- the cap-weighted total negative (the 2026-09-13 run ended
          -- insufficient_data for exactly this reason).
          AND f.Ticker NOT LIKE '%.%'
        {primary_filter}
        """
    ).fetchall()


def _dedup_by_cik(rows: list[sqlite3.Row]) -> list[sqlite3.Row]:
    """Collapse to one representative row per company (CIK) — the share class
    with the largest stored Market Cap. Rows lacking a CIK key on their ticker."""
    by_company: dict[str, sqlite3.Row] = {}
    for r in rows:
        cik = r["cik"]
        # An all-zero CIK is the placeholder, not an identity — key those on the
        # ticker so every placeholder company does not collapse into one bucket.
        if cik in (None, "") or str(cik).strip().strip("0") == "":
            key = f"ticker:{r['ticker']}"
        else:
            key = str(cik).strip()
        cur = by_company.get(key)
        if cur is None or (_f(r["mc"]) or -1.0) > (_f(cur["mc"]) or -1.0):
            by_company[key] = r
    return list(by_company.values())


# A run is FINISHED once it has written its aggregate row; those are never
# resumed, however young they are.
_FINISHED_RUNS_SQL = (
    "SELECT run_date FROM market_aggregates WHERE run_date IS NOT NULL"
)


def _pick_run_date(conn: sqlite3.Connection) -> str:
    """Resume the newest unfinished run inside the window, else start today."""
    return _resumable.pick_run_date(
        conn, "market_pe_progress",
        finished_sql=_FINISHED_RUNS_SQL,
        resume_days=_RESUME_DAYS,
    )


def _record_attempt(
    conn: sqlite3.Connection,
    run_date: str,
    status: str,
    reason: Optional[str],
    n_included: int,
    n_dropped: int,
) -> None:
    """Upsert the outcome of a COMPLETE walk into market_pe_status, and stamp
    job_runs so the shared freshness tooling sees the attempt too. Best-effort:
    a bookkeeping failure must never sink a run that otherwise worked."""
    now = datetime.datetime.now().isoformat(timespec="seconds")
    try:
        conn.execute(
            """
            INSERT INTO market_pe_status
              (run_date, status, reason, n_included, n_dropped, completed_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(run_date) DO UPDATE SET
              status=excluded.status, reason=excluded.reason,
              n_included=excluded.n_included, n_dropped=excluded.n_dropped,
              completed_at=excluded.completed_at
            """,
            [run_date, status, reason, n_included, n_dropped, now],
        )
        _jobs.upsert_job_run(conn, _JOB_NAME, now)
    except sqlite3.Error as exc:
        log.warning("market PE aggregate: could not record run status: %s", exc)


def last_attempt_date(db_path: str = _DEFAULT_DB) -> Optional[str]:
    """ISO date of the most recent COMPLETE walk, successful or not.

    The scheduler's staleness gate reads this rather than only the published
    aggregate: a failed complete run leaves no aggregate row, and treating that
    as "never computed" restarted the whole universe sweep every six hours."""
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    except sqlite3.Error:
        return None
    try:
        dates = []
        for sql in ("SELECT MAX(computed_date) FROM market_aggregates",
                    "SELECT MAX(run_date) FROM market_pe_status"):
            try:
                row = conn.execute(sql).fetchone()
            except sqlite3.OperationalError:
                continue  # table not created yet
            if row and row[0]:
                dates.append(str(row[0]))
        return max(dates) if dates else None
    finally:
        conn.close()


def compute_market_pe_aggregate(
    db_path: str = _DEFAULT_DB,
    *,
    throttle: float = 0.05,
    persist: bool = True,
    yf_module=None,
    batch_size: int = 400,
    budget_seconds: float = 600.0,
) -> dict:
    """Compute the market-cap-weighted index PE + earnings yield across USD
    filers (deduped by CIK) and (by default) persist a dated row to
    market_aggregates. ``yf_module`` is injectable for testing; defaults to the
    real ``yfinance``.

    The universe is walked in BATCHES: one call processes at most ``batch_size``
    tickers, or until ``budget_seconds`` elapses, and records one row per ticker
    in market_pe_progress so the next call resumes where this one stopped. The
    aggregate row is written only by the call that finishes the universe.
    ``complete`` says whether the run finished; ``ok`` flags success.
    """
    if yf_module is None:
        import yfinance as yf_module  # noqa: PLC0415 — lazy so import is cheap
    batch_size = max(1, int(batch_size))

    # A dry run must not write ANYTHING — not the CREATE TABLEs, not the
    # abandoned-run DELETE that _pick_run_date does. Opening read-only makes that
    # a property of the connection rather than a promise of the code below.
    if persist:
        conn = sqlite3.connect(db_path, timeout=30.0)
    else:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=30.0)
    try:
        # Other jobs (FilingsWatch, MarketWeekly, backfills) write this file with a
        # 30s busy_timeout; match it, and commit per row below so the write lock
        # is held for milliseconds rather than across a batch of network calls.
        conn.execute("PRAGMA busy_timeout = 30000")
        if persist:
            _ensure_table(conn)
            conn.commit()
            run_date = _pick_run_date(conn)
        else:
            run_date = datetime.date.today().isoformat()
        companies = _dedup_by_cik(_latest_usd_rows(conn))
        if persist:
            already = _resumable.done_tickers(conn, "market_pe_progress", run_date)
        else:
            already = set()  # --no-persist keeps progress in memory for this call only
            batch_size, budget_seconds = len(companies) or 1, float("inf")  # nothing to resume
        pending = [r for r in companies if r["ticker"] not in already]

        started = time.monotonic()
        processed = 0
        batch_included = 0
        memory: list[tuple[Optional[float], Optional[float], int]] = []

        for r in pending:
            if processed >= batch_size:
                break
            if processed and (time.monotonic() - started) >= budget_seconds:
                break

            ticker = r["ticker"]
            db_eps = _f(r["eps"])
            if db_eps is None:
                db_eps = _f(r["eps_d"])
            try:
                info = yf_module.Ticker(ticker).info or {}
            except Exception:  # noqa: BLE001 — one bad ticker must not abort the run
                info = {}

            price = _f(info.get("currentPrice")) or _f(info.get("regularMarketPrice")) or _f(info.get("previousClose"))
            eps = _f(info.get("trailingEps"))
            if eps is None:
                eps = db_eps  # fallback: most-recent-year EPS from financials.db
            mc = _f(info.get("marketCap")) or _f(r["mc"])  # fallback: stored market cap

            row_mc: Optional[float] = None
            row_earnings: Optional[float] = None
            if price is None or price <= 0 or mc is None or mc <= 0 or eps is None:
                included_i = 0
            else:
                pe_i = price / eps if eps != 0 else None
                earnings_i = mc * eps / price  # shares * EPS
                # Two guards. The PE bound catches a near-zero EPS inflating
                # the ratio. The second is pure arithmetic and needs no
                # calibration: earnings larger than the company's own market
                # cap is an earnings yield above 100 percent, which no listed
                # company has, and it catches a mismatched share base (a stale
                # post-reverse-split EPS) that lands inside the PE bound.
                #
                # There used to be a symmetric LOWER PE bound of 0.02 as well.
                # It is subsumed: with mc > 0 and price > 0,
                # |earnings_i| > mc is |mc * eps / price| > mc, which is
                # |price/eps| < 1, a superset of |price/eps| < 0.02. Every row
                # the lower bound dropped, the second guard drops anyway. The
                # near-zero-PRICE case it was added for is still covered.
                if pe_i is not None and abs(pe_i) > _PE_SANITY:
                    included_i = 0
                elif abs(earnings_i) > mc:
                    included_i = 0
                else:
                    included_i = 1
                    row_mc = mc
                    row_earnings = earnings_i

            processed += 1
            batch_included += included_i
            if persist:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO market_pe_progress
                      (run_date, ticker, mc, earnings, included)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    [run_date, ticker, row_mc, row_earnings, included_i],
                )
                conn.commit()  # per row: never hold the lock across a yfinance call
            else:
                memory.append((row_mc, row_earnings, included_i))
            if throttle:
                time.sleep(throttle)

        # No commit here: the loop above commits after every row, precisely so
        # the write lock is never held across a yfinance call.
        if processed and batch_included == 0:
            log.warning(
                "market PE aggregate: batch processed %d tickers but included 0 "
                "(rate limited?) run_date=%s", processed, run_date)

        remaining = len(pending) - processed
        if remaining > 0:
            return {"ok": True, "complete": False, "done": processed,
                    "remaining": remaining, "run_date": run_date}

        if persist:
            agg = conn.execute(
                """
                SELECT COALESCE(SUM(CASE WHEN included = 1 THEN mc END), 0.0),
                       COALESCE(SUM(CASE WHEN included = 1 THEN earnings END), 0.0),
                       COALESCE(SUM(included), 0),
                       COUNT(*)
                FROM market_pe_progress WHERE run_date = ?
                """,
                [run_date],
            ).fetchone()
            total_mc, total_earnings, included, seen = float(agg[0]), float(agg[1]), int(agg[2]), int(agg[3])
        else:
            total_mc = sum(m for m, _e, i in memory if i and m is not None)
            total_earnings = sum(e for _m, e, i in memory if i and e is not None)
            included = sum(i for _m, _e, i in memory)
            seen = len(memory)
        skipped = seen - included

        now = datetime.datetime.now()
        # The walk can span days; publish under the date it FINISHED, and keep the
        # start date beside it so a resumed run still matches its progress rows.
        completed_date = now.date().isoformat()
        if included == 0 or total_mc <= 0 or total_earnings <= 0:
            log.warning("market PE aggregate: insufficient data (included=%s, total_earnings=%s)", included, total_earnings)
            if persist:
                # Nothing usable to keep; drop the scratch so the next call starts
                # clean. Record the failure first: without a dated marker the
                # staleness gate reads "never computed" and relaunches the whole
                # universe sweep on the next 6h tick, forever.
                _record_attempt(conn, run_date, "failed", "insufficient_data",
                                included, skipped)
                conn.execute("DELETE FROM market_pe_progress WHERE run_date = ?", [run_date])
                conn.commit()
            return {"ok": False, "reason": "insufficient_data", "n_constituents": included,
                    "skipped": skipped, "complete": True, "done": processed,
                    "remaining": 0, "run_date": run_date}

        index_pe = total_mc / total_earnings
        earnings_yield = total_earnings / total_mc
        result = {
            "ok": True,
            "computed_date": completed_date,
            "run_date": run_date,
            "market_pe": round(index_pe, 4),
            "earnings_yield": round(earnings_yield, 6),
            "n_constituents": included,
            "skipped": skipped,
            "method": "cap_weighted_usd_cik",
            "computed_at": now.isoformat(timespec="seconds"),
            "done": processed,
            "remaining": 0,
            "complete": True,
        }

        if persist:
            conn.execute(
                """
                INSERT OR REPLACE INTO market_aggregates
                  (computed_date, market_pe, earnings_yield, n_constituents, method,
                   computed_at, run_date)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                [result["computed_date"], result["market_pe"], result["earnings_yield"],
                 result["n_constituents"], result["method"], result["computed_at"],
                 run_date],
            )
            _record_attempt(conn, run_date, "ok", None, included, skipped)
            conn.execute("DELETE FROM market_pe_progress WHERE run_date = ?", [run_date])
            conn.commit()
    finally:
        conn.close()

    log.info("market PE aggregate: PE=%.2f, earnings_yield=%.3f%%, n=%d (skipped %d)",
             index_pe, earnings_yield * 100, included, skipped)
    return result


def read_market_aggregates(db_path: str = _DEFAULT_DB) -> list[dict]:
    """All persisted weekly aggregates, oldest→newest. Empty list if none/no table."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            "SELECT computed_date, market_pe, earnings_yield, n_constituents, computed_at "
            "FROM market_aggregates ORDER BY computed_date"
        ).fetchall()
    except sqlite3.OperationalError:
        return []  # table not created yet
    finally:
        conn.close()
    return [dict(r) for r in rows]


def latest_computed_date(db_path: str = _DEFAULT_DB) -> Optional[str]:
    """ISO date of the most recent aggregate, or None.

    One MAX, not the whole weekly series sorted and indexed from the end.
    """
    conn = sqlite3.connect(db_path)
    try:
        row = conn.execute(
            "SELECT MAX(computed_date) FROM market_aggregates"
        ).fetchone()
    except sqlite3.OperationalError:
        return None  # table not created yet
    finally:
        conn.close()
    return str(row[0]) if row and row[0] is not None else None


if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser(description="Compute the weekly market-cap-weighted PE aggregate.")
    parser.add_argument("--db", default=_DEFAULT_DB, help="Path to financials.db")
    parser.add_argument("--no-persist", action="store_true", help="Compute but do not write to the DB")
    parser.add_argument("--batch-size", type=int, default=400, help="Tickers per batch")
    parser.add_argument("--budget-seconds", type=float, default=600.0, help="Wall-clock budget per batch")
    parser.add_argument("--max-batches", type=int, default=0, help="Stop after N batches (0 = run to completion)")
    args = parser.parse_args()
    batches = 0
    while True:
        out = compute_market_pe_aggregate(
            args.db,
            persist=not args.no_persist,
            batch_size=args.batch_size,
            budget_seconds=args.budget_seconds,
        )
        print(out)
        batches += 1
        if out.get("complete") or args.no_persist:
            break
        if args.max_batches and batches >= args.max_batches:
            break
