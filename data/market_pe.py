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

log = logging.getLogger("market_pe")

_DEFAULT_DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "financials.db")

# Drop per-company readings whose |price/EPS| exceeds this — these are almost
# always data errors (a near-zero EPS exploding the ratio), not real valuations.
_PE_SANITY = 1000.0


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
          computed_at TEXT
        )
        """
    )


def _latest_usd_rows(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    """One row per USD-filer ticker at its most recent calendar year, with the
    fields needed for the aggregate (CIK, stored Market Cap, stored EPS)."""
    conn.row_factory = sqlite3.Row
    return conn.execute(
        """
        SELECT f.Ticker AS ticker, f.Cik AS cik,
               f."Market Cap" AS mc, f."EPS" AS eps, f."EPS Diluted" AS eps_d
        FROM financials f
        JOIN (
            SELECT Ticker, MAX(CAST("Calendar Year" AS INTEGER)) AS y
            FROM financials
            WHERE "Reported Currency" = 'USD'
            GROUP BY Ticker
        ) m ON m.Ticker = f.Ticker AND CAST(f."Calendar Year" AS INTEGER) = m.y
        WHERE f."Reported Currency" = 'USD'
        """
    ).fetchall()


def _dedup_by_cik(rows: list[sqlite3.Row]) -> list[sqlite3.Row]:
    """Collapse to one representative row per company (CIK) — the share class
    with the largest stored Market Cap. Rows lacking a CIK key on their ticker."""
    by_company: dict[str, sqlite3.Row] = {}
    for r in rows:
        cik = r["cik"]
        key = str(cik).strip() if cik not in (None, "") else f"ticker:{r['ticker']}"
        cur = by_company.get(key)
        if cur is None or (_f(r["mc"]) or -1.0) > (_f(cur["mc"]) or -1.0):
            by_company[key] = r
    return list(by_company.values())


def compute_market_pe_aggregate(
    db_path: str = _DEFAULT_DB,
    *,
    throttle: float = 0.05,
    persist: bool = True,
    yf_module=None,
) -> dict:
    """Compute the market-cap-weighted index PE + earnings yield across USD
    filers (deduped by CIK) and (by default) persist a dated row to
    market_aggregates. ``yf_module`` is injectable for testing; defaults to the
    real ``yfinance``. Returns a result dict (``ok`` flags success)."""
    if yf_module is None:
        import yfinance as yf_module  # noqa: PLC0415 — lazy so import is cheap

    conn = sqlite3.connect(db_path)
    try:
        rows = _latest_usd_rows(conn)
    finally:
        conn.close()

    companies = _dedup_by_cik(rows)
    total_mc = 0.0
    total_earnings = 0.0
    included = 0
    skipped = 0

    for r in companies:
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

        if price is None or price <= 0 or mc is None or mc <= 0 or eps is None:
            skipped += 1
        else:
            pe_i = price / eps if eps != 0 else None
            if pe_i is not None and abs(pe_i) > _PE_SANITY:
                skipped += 1
            else:
                total_mc += mc
                total_earnings += mc * eps / price  # shares * EPS
                included += 1
        if throttle:
            time.sleep(throttle)

    now = datetime.datetime.now()
    if included == 0 or total_mc <= 0 or total_earnings <= 0:
        log.warning("market PE aggregate: insufficient data (included=%s, total_earnings=%s)", included, total_earnings)
        return {"ok": False, "reason": "insufficient_data", "n_constituents": included, "skipped": skipped}

    index_pe = total_mc / total_earnings
    earnings_yield = total_earnings / total_mc
    result = {
        "ok": True,
        "computed_date": now.date().isoformat(),
        "market_pe": round(index_pe, 4),
        "earnings_yield": round(earnings_yield, 6),
        "n_constituents": included,
        "skipped": skipped,
        "method": "cap_weighted_usd_cik",
        "computed_at": now.isoformat(timespec="seconds"),
    }

    if persist:
        conn = sqlite3.connect(db_path)
        try:
            _ensure_table(conn)
            conn.execute(
                """
                INSERT OR REPLACE INTO market_aggregates
                  (computed_date, market_pe, earnings_yield, n_constituents, method, computed_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                [result["computed_date"], result["market_pe"], result["earnings_yield"],
                 result["n_constituents"], result["method"], result["computed_at"]],
            )
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
    """ISO date of the most recent aggregate, or None."""
    rows = read_market_aggregates(db_path)
    return rows[-1]["computed_date"] if rows else None


if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser(description="Compute the weekly market-cap-weighted PE aggregate.")
    parser.add_argument("--db", default=_DEFAULT_DB, help="Path to financials.db")
    parser.add_argument("--no-persist", action="store_true", help="Compute but do not write to the DB")
    args = parser.parse_args()
    out = compute_market_pe_aggregate(args.db, persist=not args.no_persist)
    print(out)
