"""
Precompute and store rolling historical beta for every ticker.

Beta is the slope of a stock's monthly returns regressed on the S&P 500's
monthly returns (Cov/Var), the same regression-beta method already used for the
single point-in-time beta in financial_db.compute_beta_yf. This script extends
that to a TIME SERIES: for each calendar year it computes a trailing 60-month
(5-year) rolling beta ending at that year, so the app can show how a company's
market sensitivity has drifted over time.

Why store instead of compute live: the app has no historical price table, and a
rolling-beta computation needs a yfinance price download per ticker. Persisting
{ticker, year, beta} into financials.db lets the comparative matrix and the
individual page read beta history instantly.

Run:  python data/compute_beta_history.py            # all tickers
      python data/compute_beta_history.py --limit 20 # quick sample
      python data/compute_beta_history.py --tickers AAPL MSFT NVDA

Use a real Python interpreter (not the Windows Store alias) so yfinance works.
"""

from __future__ import annotations

import argparse
import os
import sqlite3
import sys

import numpy as np
import pandas as pd

# Reuse the exact monthly-return + cached-market machinery used for point-in-time
# beta, so the rolling series is consistent with the stored tickers.beta value.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from financial_db import _yf_monthly_returns  # type: ignore

WINDOW_MONTHS = 60          # trailing 5-year regression window
MIN_MONTHS = 36             # need at least 3y of overlap to report a beta
# Total-return S&P 500 index: matches Damodaran's return formula, which includes
# dividends on both the stock and the market (Investment Valuation, Ch.8). Falls
# back to the price-only ^GSPC if the total-return series is unavailable. The beta
# effect is tiny (validated median delta ~0.0004), so this is a correctness fix.
MARKET = "^SP500TR"
MARKET_FALLBACK = "^GSPC"

# Constant extraction window: emit a beta for every year in [START_YEAR, END_YEAR]
# (each from its own trailing-60-month regression, which reaches back before
# START_YEAR via the full yfinance price history). Keeping the range fixed makes
# every ticker's beta / cost-of-equity / WACC chart span the same years as the
# financials history, instead of each ticker's idiosyncratic listing span.
START_YEAR = 2012
END_YEAR = 2025

# Full-history market series, fetched once and reused across every ticker so a
# many-ticker batch downloads ^GSPC only one time. (financial_db's cached market
# helper only pulls 5 years, which would cap the rolling history — we want all.)
_MARKET_MAX: "pd.Series | None | bool" = False


def _market_max() -> "pd.Series | None":
    global _MARKET_MAX
    if _MARKET_MAX is False:
        s = _yf_monthly_returns(MARKET, period="max")
        if s is None and MARKET != MARKET_FALLBACK:
            print(f"[beta-history] {MARKET} unavailable; falling back to {MARKET_FALLBACK}")
            s = _yf_monthly_returns(MARKET_FALLBACK, period="max")
        _MARKET_MAX = s
    return _MARKET_MAX  # type: ignore[return-value]


def _db_path() -> str:
    """financials.db lives at the repo root, one level above data/."""
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.normpath(os.path.join(here, ".."))
    return os.path.join(root, "financials.db")


def _ensure_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS beta_history (
            ticker TEXT NOT NULL,
            year   INTEGER NOT NULL,
            beta   REAL,
            PRIMARY KEY (ticker, year)
        )
        """
    )
    conn.commit()


def _all_tickers(conn: sqlite3.Connection) -> list[str]:
    rows = conn.execute(
        "SELECT ticker FROM tickers WHERE ticker IS NOT NULL ORDER BY ticker"
    ).fetchall()
    return [r[0] for r in rows if r[0]]


def _beta(stock: np.ndarray, market: np.ndarray) -> float | None:
    var = float(np.var(market, ddof=1))
    if var == 0:
        return None
    b = float(np.cov(stock, market, ddof=1)[0, 1] / var)
    return round(b, 4) if np.isfinite(b) else None


def rolling_beta_by_year(ticker: str) -> dict[int, float]:
    """Return {year: trailing-60-month beta as of that year's end}."""
    stock = _yf_monthly_returns(ticker, period="max")
    mkt = _market_max()
    if stock is None or mkt is None:
        return {}
    df = pd.concat([stock, mkt], axis=1, join="inner").dropna()
    if len(df) < MIN_MONTHS:
        return {}
    df.columns = ["stock", "market"]
    out: dict[int, float] = {}
    for y in range(START_YEAR, END_YEAR + 1):
        window = df[df.index <= pd.Timestamp(year=y, month=12, day=31)].tail(WINDOW_MONTHS)
        if len(window) < MIN_MONTHS:
            continue
        b = _beta(window["stock"].to_numpy(float), window["market"].to_numpy(float))
        if b is not None:
            out[y] = b
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="Precompute rolling historical beta vs the S&P 500.")
    ap.add_argument("--limit", type=int, default=None, help="process only the first N tickers")
    ap.add_argument("--tickers", nargs="*", help="specific tickers (overrides --limit)")
    args = ap.parse_args()

    path = _db_path()
    if not os.path.exists(path):
        print(f"[beta-history] financials.db not found at {path}", file=sys.stderr)
        return 1

    conn = sqlite3.connect(path)
    _ensure_table(conn)

    if args.tickers:
        tickers = [t.upper() for t in args.tickers]
    else:
        tickers = _all_tickers(conn)
        if args.limit:
            tickers = tickers[: args.limit]

    print(f"[beta-history] {len(tickers)} tickers; trailing {WINDOW_MONTHS}m window vs {MARKET}")
    done = rows = skipped = 0
    for i, tk in enumerate(tickers, 1):
        try:
            series = rolling_beta_by_year(tk)
        except Exception as exc:  # noqa: BLE001 — never let one ticker kill the batch
            print(f"  [{i}/{len(tickers)}] {tk}: error {exc}")
            skipped += 1
            continue
        if not series:
            skipped += 1
            continue
        conn.executemany(
            "INSERT INTO beta_history (ticker, year, beta) VALUES (?, ?, ?) "
            "ON CONFLICT(ticker, year) DO UPDATE SET beta = excluded.beta",
            [(tk, y, b) for y, b in series.items()],
        )
        conn.commit()
        done += 1
        rows += len(series)
        latest = max(series)
        print(f"  [{i}/{len(tickers)}] {tk}: {len(series)} yrs, latest {latest}={series[latest]}")

    conn.close()
    print(f"[beta-history] done: {done} tickers, {rows} rows, {skipped} skipped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
