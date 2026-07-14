"""Phase 3 ROW-COMPLETION for the financials-DB remediation.

Completes NULL columns on EXISTING ``financials`` rows *without ever
overwriting a stored non-NULL value*. Three independent fills, each gated by
its own CLI flag:

  --ratios    Recompute derived ratio columns that are NULL but computable
              from the row's own statement columns. Pure, set-based SQL
              (one UPDATE per column, no per-row Python loop) over ~353k rows.
  --caps      Point-in-time "Market Cap" backfill for rows where it is NULL:
              shares (row's diluted WAS, else nearest year) * the yfinance
              daily close nearest the row's fiscal-year-end Date, in the
              LISTING currency. Verified against the row's Reported Currency;
              a mismatch / unknown currency / missing shares is SKIPPED and
              logged, never guessed (never writes USD into a KRW row).
  --currency  Fill NULL "Reported Currency" from yfinance
              ``info.financialCurrency`` (only fills NULLs).

Every write uses only-fill-NULL (COALESCE-style) semantics: the WHERE clause
requires the target column IS NULL, so a stored value is untouchable. The
script takes ``db_path`` as a required positional argument and is intended to
be run by the Phase 3 orchestrator against a writable copy of the DB.

Standalone: imports from data/ and remediation/ only (per repo convention).
"""

from __future__ import annotations

import argparse
import datetime as _dt
import os
import sqlite3
import sys
import time
from dataclasses import dataclass, field

# ── standalone import wiring (data/ + this dir only) ──────────────────────────
_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
for _p in (_HERE, os.path.join(_ROOT, "data")):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import identity_lib  # noqa: E402  (remediation/)
from financial_db import EXCEL_COLUMNS  # noqa: E402  (data/)

JOB_NAME = "phase3_complete_rows"
_VALID_COLUMNS = frozenset(EXCEL_COLUMNS)

# Price-window padding around a fiscal-year-end date (calendar days).
_PRICE_WINDOW_DAYS = 10
# Default politeness pause between yfinance calls.
_DEFAULT_SLEEP = 0.5


# ── derived-ratio specifications ──────────────────────────────────────────────
@dataclass(frozen=True)
class RatioSpec:
    """One NULL-fill for a derived ratio column.

    ``expr`` is the SQL value expression (quoted column names). ``inputs`` are
    the columns that must be NOT NULL for the fill to run. ``denominators`` are
    the subset of columns that must additionally be non-zero (guards division).
    """

    target: str
    expr: str
    inputs: tuple[str, ...]
    denominators: tuple[str, ...] = field(default_factory=tuple)


def _q(col: str) -> str:
    """Quote a column name for SQL, validating it against the known schema."""
    if col not in _VALID_COLUMNS:
        raise ValueError(f"unknown financials column: {col!r}")
    return f'"{col}"'


def _ratio(target: str, num: str, den: str) -> RatioSpec:
    """A num/den ratio with a zero-guarded, float-forced denominator."""
    return RatioSpec(
        target=target,
        expr=f"CAST({_q(num)} AS REAL) / NULLIF({_q(den)}, 0)",
        inputs=(num, den),
        denominators=(den,),
    )


def ratio_specs() -> tuple[RatioSpec, ...]:
    """The derived-ratio fills, in execution order.

    'Free Cash Flow' is computed BEFORE the per-share/yield metrics that read
    it, so a freshly filled FCF flows into those in the same run.
    """
    return (
        _ratio("Gross Profit Ratio", "Gross Profit", "Revenue"),
        _ratio("Operating Income Ratio", "Operating Income", "Revenue"),
        _ratio("Net Income Ratio", "Net Income", "Revenue"),
        _ratio("EBITDA Ratio", "EBITDA", "Revenue"),
        _ratio("ROE", "Net Income", "Total Stockholders Equity"),
        _ratio("Current Ratio", "Total Current Assets", "Total Current Liabilities"),
        _ratio("Debt To Equity", "Total Debt", "Total Stockholders Equity"),
        _ratio("Debt To Assets", "Total Debt", "Total Assets"),
        # Free Cash Flow = Operating Cash Flow + Capital Expenditure (capex < 0).
        RatioSpec(
            target="Free Cash Flow",
            expr=f'{_q("Operating Cash Flow")} + {_q("Capital Expenditure")}',
            inputs=("Operating Cash Flow", "Capital Expenditure"),
        ),
        _ratio("Free Cash Flow Per Share", "Free Cash Flow", "Weighted Average Shs Out Dil"),
        _ratio("Operating Cash Flow Per Share", "Operating Cash Flow", "Weighted Average Shs Out Dil"),
        _ratio("Revenue Per Share", "Revenue", "Weighted Average Shs Out Dil"),
        _ratio("Book Value Per Share", "Total Stockholders Equity", "Weighted Average Shs Out Dil"),
        _ratio("PE Ratio", "Market Cap", "Net Income"),
        _ratio("PB Ratio", "Market Cap", "Total Stockholders Equity"),
        _ratio("Price To Sales Ratio", "Market Cap", "Revenue"),
        _ratio("Earnings Yield", "Net Income", "Market Cap"),
        _ratio("Free Cash Flow Yield", "Free Cash Flow", "Market Cap"),
    )


def _build_ratio_update(spec: RatioSpec) -> str:
    """The only-fill-NULL UPDATE statement for one ratio spec."""
    guards = [f"{_q(spec.target)} IS NULL"]
    guards += [f"{_q(c)} IS NOT NULL" for c in spec.inputs]
    guards += [f"{_q(c)} <> 0" for c in spec.denominators]
    return (
        f"UPDATE financials SET {_q(spec.target)} = {spec.expr} "
        f"WHERE {' AND '.join(guards)}"
    )


def fill_ratios(conn: sqlite3.Connection, *, verbose: bool = True) -> dict[str, int]:
    """Fill every NULL, computable derived ratio. Returns per-column counts.

    Set-based: one UPDATE per column. A row is touched only when the target is
    NULL, all inputs are present, and denominators are non-zero, so no stored
    value is overwritten and a zero-denominator row stays NULL.
    """
    counts: dict[str, int] = {}
    for spec in ratio_specs():
        cur = conn.execute(_build_ratio_update(spec))
        counts[spec.target] = cur.rowcount if cur.rowcount and cur.rowcount > 0 else 0
        if verbose:
            print(f"  ratios: {spec.target:<32} filled {counts[spec.target]}")
    conn.commit()
    return counts


# ── yfinance symbol resolution ────────────────────────────────────────────────
def _yf_symbol(conn: sqlite3.Connection, ticker: str) -> str:
    """Best yfinance symbol for a DB ticker: security_map.symbol_yf first, then
    the pure identity_lib guess."""
    try:
        row = conn.execute(
            "SELECT symbol_yf FROM security_map WHERE symbol = ? "
            "ORDER BY is_primary DESC LIMIT 1",
            [ticker],
        ).fetchone()
    except sqlite3.OperationalError:
        row = None
    if row and row[0]:
        return str(row[0])
    return identity_lib.yf_symbol_guess(ticker)


# ── point-in-time Market Cap backfill ─────────────────────────────────────────
def _target_date(date_str: str | None, calendar_year: int) -> _dt.date | None:
    """Fiscal-year-end date for price lookup. Falls back to Dec-31 of the
    calendar year when the row's Date is missing (logged by the caller)."""
    if date_str:
        try:
            return _dt.date.fromisoformat(str(date_str)[:10])
        except ValueError:
            pass
    if 1900 <= int(calendar_year) <= 2100:
        return _dt.date(int(calendar_year), 12, 31)
    return None


def _nearest_shares(conn: sqlite3.Connection, ticker: str, year: int) -> float | None:
    """Diluted weighted-average shares from the same ticker's nearest year."""
    rows = conn.execute(
        'SELECT "Calendar Year", "Weighted Average Shs Out Dil" FROM financials '
        'WHERE Ticker = ? AND "Weighted Average Shs Out Dil" IS NOT NULL '
        'AND "Weighted Average Shs Out Dil" > 0',
        [ticker],
    ).fetchall()
    if not rows:
        return None
    best = min(rows, key=lambda r: abs(int(r[0]) - int(year)))
    return float(best[1])


def _price_on_or_before(hist, target: _dt.date) -> float | None:
    """Last daily close on/before ``target``; else the calendar-nearest close."""
    if hist is None or getattr(hist, "empty", True):
        return None
    closes = hist["Close"].dropna()
    if closes.empty:
        return None
    dated = [(idx.date(), float(val)) for idx, val in closes.items()]
    on_or_before = [p for d, p in dated if d <= target]
    if on_or_before:
        return on_or_before[-1]
    return min(dated, key=lambda dp: abs((dp[0] - target).days))[1]


def _listing_currency(tk) -> str | None:
    """Trading (listing) currency from yfinance fast_info; None on failure."""
    try:
        fast = tk.fast_info
        cur = fast["currency"] if "currency" in fast else getattr(fast, "currency", None)
        return str(cur).upper() if cur else None
    except Exception as exc:  # noqa: BLE001 — one bad symbol must not stop the sweep
        print(f"  caps: fast_info failed: {exc}")
        return None


def _group_null_cap_rows(conn: sqlite3.Connection) -> dict[str, list[tuple]]:
    """Ticker -> [(calendar_year, date, reported_currency, shares), ...] for
    every row whose Market Cap is NULL."""
    rows = conn.execute(
        'SELECT Ticker, "Calendar Year", Date, "Reported Currency", '
        '"Weighted Average Shs Out Dil" FROM financials '
        'WHERE "Market Cap" IS NULL ORDER BY Ticker, "Calendar Year"'
    ).fetchall()
    grouped: dict[str, list[tuple]] = {}
    for ticker, year, date_str, currency, shares in rows:
        grouped.setdefault(ticker, []).append((year, date_str, currency, shares))
    return grouped


def _backfill_ticker_caps(conn: sqlite3.Connection, yf, ticker: str,
                          entries: list[tuple], counts: dict[str, int]) -> None:
    """Backfill Market Cap for one ticker's NULL rows (mutates ``counts``)."""
    targets = {y: _target_date(d, y) for y, d, _, _ in entries}
    valid_dates = [t for t in targets.values() if t is not None]
    if not valid_dates:
        counts["skip_no_date"] += len(entries)
        return
    symbol = _yf_symbol(conn, ticker)
    tk = yf.Ticker(symbol)
    listing_ccy = _listing_currency(tk)
    hist = tk.history(
        start=(min(valid_dates) - _dt.timedelta(days=_PRICE_WINDOW_DAYS)).isoformat(),
        end=(max(valid_dates) + _dt.timedelta(days=_PRICE_WINDOW_DAYS)).isoformat(),
        auto_adjust=False,
    )
    for year, _date_str, row_ccy, shares in entries:
        target = targets[year]
        if target is None:
            counts["skip_no_date"] += 1
            continue
        shares = float(shares) if shares else _nearest_shares(conn, ticker, year)
        if not shares or shares <= 0:
            counts["skip_no_shares"] += 1
            continue
        if not row_ccy:
            counts["skip_unknown_currency"] += 1
            continue
        if listing_ccy and str(row_ccy).upper() != listing_ccy:
            counts["skip_currency_mismatch"] += 1
            continue
        price = _price_on_or_before(hist, target)
        if price is None:
            counts["skip_no_price"] += 1
            continue
        cur = conn.execute(
            'UPDATE financials SET "Market Cap" = ? '
            'WHERE Ticker = ? AND "Calendar Year" = ? AND "Market Cap" IS NULL',
            [shares * price, ticker, year],
        )
        counts["filled"] += cur.rowcount if cur.rowcount and cur.rowcount > 0 else 0


def backfill_caps(conn: sqlite3.Connection, *, sleep: float = _DEFAULT_SLEEP,
                  limit: int | None = None, verbose: bool = True) -> dict[str, int]:
    """Point-in-time Market Cap backfill for NULL rows. Batches by ticker (one
    yfinance history fetch per ticker); per-ticker try/except so one failure
    never stops the sweep."""
    import yfinance as yf  # lazy: keeps --ratios / imports network-free

    grouped = _group_null_cap_rows(conn)
    tickers = sorted(grouped)
    if limit is not None:
        tickers = tickers[:limit]
    counts = {k: 0 for k in ("filled", "skip_no_date", "skip_no_shares",
                             "skip_unknown_currency", "skip_currency_mismatch",
                             "skip_no_price", "error")}
    for i, ticker in enumerate(tickers, 1):
        try:
            _backfill_ticker_caps(conn, yf, ticker, grouped[ticker], counts)
            conn.commit()
        except Exception as exc:  # noqa: BLE001 — isolate per-ticker failures
            counts["error"] += 1
            print(f"  caps: {ticker} failed: {exc}")
        if verbose and i % 25 == 0:
            print(f"  caps: {i}/{len(tickers)} tickers, filled {counts['filled']}")
        time.sleep(sleep)
    return counts


# ── Reported Currency backfill ────────────────────────────────────────────────
def fill_currency(conn: sqlite3.Connection, *, sleep: float = _DEFAULT_SLEEP,
                  limit: int | None = None, verbose: bool = True) -> dict[str, int]:
    """Fill NULL 'Reported Currency' from yfinance info.financialCurrency
    (only-fill-NULL). Per-ticker try/except."""
    import yfinance as yf  # lazy

    tickers = [r[0] for r in conn.execute(
        'SELECT DISTINCT Ticker FROM financials WHERE "Reported Currency" IS NULL '
        "ORDER BY Ticker"
    ).fetchall()]
    if limit is not None:
        tickers = tickers[:limit]
    counts = {k: 0 for k in ("filled", "tickers_filled", "no_currency", "error")}
    for i, ticker in enumerate(tickers, 1):
        try:
            info = yf.Ticker(_yf_symbol(conn, ticker)).info
            currency = (info or {}).get("financialCurrency")
        except Exception as exc:  # noqa: BLE001
            counts["error"] += 1
            print(f"  currency: {ticker} failed: {exc}")
            time.sleep(sleep)
            continue
        if not currency:
            counts["no_currency"] += 1
            time.sleep(sleep)
            continue
        cur = conn.execute(
            'UPDATE financials SET "Reported Currency" = ? '
            'WHERE Ticker = ? AND "Reported Currency" IS NULL',
            [str(currency).upper(), ticker],
        )
        filled = cur.rowcount if cur.rowcount and cur.rowcount > 0 else 0
        counts["filled"] += filled
        if filled:
            counts["tickers_filled"] += 1
        conn.commit()
        if verbose and i % 25 == 0:
            print(f"  currency: {i}/{len(tickers)} tickers, filled {counts['filled']}")
        time.sleep(sleep)
    return counts


# ── job log + CLI ─────────────────────────────────────────────────────────────
def _log_job(conn: sqlite3.Connection) -> None:
    conn.execute(
        "INSERT INTO job_runs(job, last_run) VALUES(?, datetime('now')) "
        "ON CONFLICT(job) DO UPDATE SET last_run=excluded.last_run",
        [JOB_NAME],
    )
    conn.commit()


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("db_path", help="path to a WRITABLE financials DB copy")
    parser.add_argument("--ratios", action="store_true", help="fill derived ratio NULLs")
    parser.add_argument("--caps", action="store_true", help="point-in-time Market Cap backfill")
    parser.add_argument("--currency", action="store_true", help="fill NULL Reported Currency")
    parser.add_argument("--sleep", type=float, default=_DEFAULT_SLEEP,
                        help="seconds between yfinance calls (caps/currency)")
    parser.add_argument("--limit", type=int, default=None,
                        help="cap the number of tickers processed (caps/currency)")
    parser.add_argument("--quiet", action="store_true", help="suppress per-step logging")
    args = parser.parse_args(argv)
    if not (args.ratios or args.caps or args.currency):
        parser.error("select at least one fill: --ratios / --caps / --currency")
    return args


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(sys.argv[1:] if argv is None else argv)
    verbose = not args.quiet
    conn = sqlite3.connect(args.db_path)
    try:
        if args.ratios:
            print("[ratios]")
            counts = fill_ratios(conn, verbose=verbose)
            print(f"  ratios total filled: {sum(counts.values())}")
        if args.caps:
            print("[caps]")
            counts = backfill_caps(conn, sleep=args.sleep, limit=args.limit, verbose=verbose)
            print(f"  caps: {counts}")
        if args.currency:
            print("[currency]")
            counts = fill_currency(conn, sleep=args.sleep, limit=args.limit, verbose=verbose)
            print(f"  currency: {counts}")
        _log_job(conn)
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
