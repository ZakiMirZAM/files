"""filings_watch (daily): refresh fundamentals for companies that just filed.

Pulls the EDGAR daily index for the previous business day(s)

    https://www.sec.gov/Archives/edgar/daily-index/<yyyy>/QTR<q>/form.<yyyymmdd>.idx

(plain fixed-width text), keeps only periodic reports (10-K/10-Q/20-F and their
/A amendments), maps each filer's CIK to its ``security_map`` primary symbol,
and for every mapped hit runs the additive refresh:

    FinancialDB.update_ticker(sym, fill_gaps=True)
    FinancialDB.save_quarters(sym)
    FinancialDB.derive_q4(sym)
    FinancialDB.save_ttm(sym)

A filer whose security_map status is ``awaiting_first_financials`` flips to
``active`` once its refresh runs. Per-symbol failures are logged and counted,
never fatal. ``--date YYYY-MM-DD`` overrides the day; ``--dry-run`` lists the
mapped hits and writes nothing.

Usage:
    python remediation/jobs/filings_watch.py <db_path> [--date 2026-07-10] [--dry-run]
"""

from __future__ import annotations

import argparse
import os
import sqlite3
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _jobslib as jobs  # noqa: E402

jobs.ensure_sys_path()

from identity_lib import pad_cik  # noqa: E402

JOB_NAME = "filings_watch"

# Periodic reports an investor actually reads (annual + quarterly + amendments).
TARGET_FORMS = frozenset({"10-K", "10-Q", "20-F", "10-K/A", "10-Q/A", "40-F"})
_HEADER_COLS = ("Form Type", "Company Name", "CIK", "Date Filed", "File Name")
_MAX_CATCHUP_DAYS = 5  # cap the look-back window when the job missed some days
_NEW_STATUS = "awaiting_first_financials"


@dataclass(frozen=True)
class Filing:
    form: str
    cik: str          # raw (unpadded) CIK string from the index
    date_filed: str
    file_name: str


# ── form.idx parsing (pure) ─────────────────────────────────────────────────────
def parse_form_idx(text: str) -> list[Filing]:
    """Parse a ``form.<date>.idx`` body into :class:`Filing` records.

    The index is fixed-width. Column boundaries are read from the header row
    (the line that names Form Type / CIK / Date Filed / File Name), which is the
    robust way to slice a file whose company-name column contains spaces.
    Returns [] when the header cannot be located.
    """
    lines = text.splitlines()
    header_idx = next(
        (i for i, ln in enumerate(lines)
         if ln.lstrip().startswith("Form Type") and "CIK" in ln
         and "Date Filed" in ln),
        None)
    if header_idx is None:
        return []
    header = lines[header_idx]
    offsets = [header.find(col) for col in _HEADER_COLS]
    if any(o < 0 for o in offsets):
        return []
    f0, f1, f2, f3, f4 = offsets

    out: list[Filing] = []
    for ln in lines[header_idx + 1:]:
        stripped = ln.strip()
        if not stripped or set(stripped) <= set("-"):
            continue  # blank line or the dashed separator
        form = ln[f0:f1].strip()
        cik = ln[f2:f3].strip()
        date_filed = ln[f3:f4].strip()
        file_name = ln[f4:].strip()
        if not form or not cik:
            continue
        out.append(Filing(form, cik, date_filed, file_name))
    return out


def filter_target_filings(filings: list[Filing]) -> list[Filing]:
    """Keep only the periodic-report forms we care about."""
    return [f for f in filings if f.form.upper() in TARGET_FORMS]


# ── date selection ──────────────────────────────────────────────────────────────
def _is_business_day(d: date) -> bool:
    return d.weekday() < 5  # Mon-Fri (holidays yield an empty index, handled)


def previous_business_day(d: date) -> date:
    d -= timedelta(days=1)
    while not _is_business_day(d):
        d -= timedelta(days=1)
    return d


def dates_to_process(today: date, last_run: date | None,
                     override: date | None = None,
                     cap: int = _MAX_CATCHUP_DAYS) -> list[date]:
    """Business days to fetch, ascending.

    ``override`` -> exactly that day. Otherwise the business days strictly after
    ``last_run`` up to and including the previous business day, capped at
    ``cap`` (most recent kept). No ``last_run`` -> just the previous business day.
    """
    if override is not None:
        return [override]
    end = previous_business_day(today)
    if last_run is None:
        return [end]
    days: list[date] = []
    cursor = end
    while cursor > last_run and len(days) < cap:
        if _is_business_day(cursor):
            days.append(cursor)
        cursor -= timedelta(days=1)
    return sorted(days)


def daily_index_url(d: date) -> str:
    quarter = (d.month - 1) // 3 + 1
    return (f"https://www.sec.gov/Archives/edgar/daily-index/{d.year}/"
            f"QTR{quarter}/form.{d.strftime('%Y%m%d')}.idx")


# ── CIK -> primary symbol map ────────────────────────────────────────────────────
def load_primary_by_cik(conn: sqlite3.Connection) -> dict[str, str]:
    """{padded_cik: primary_symbol} from security_map (is_primary=1)."""
    out: dict[str, str] = {}
    for cik, symbol in conn.execute(
            "SELECT cik, symbol FROM security_map "
            "WHERE is_primary = 1 AND cik IS NOT NULL"):
        padded = pad_cik(cik)
        if padded is not None:
            out.setdefault(padded, symbol)
    return out


def map_hits_to_symbols(filings: list[Filing],
                        primary_by_cik: dict[str, str]) -> dict[str, str]:
    """{symbol: form} for filings whose CIK maps to a primary symbol.

    De-duplicated by symbol (a filer that filed several forms is refreshed once);
    an annual form label wins over a quarterly one for the log line.
    """
    hits: dict[str, str] = {}
    for f in filings:
        padded = pad_cik(f.cik)
        if padded is None:
            continue
        symbol = primary_by_cik.get(padded)
        if not symbol:
            continue
        prior = hits.get(symbol)
        if prior is None or (f.form.upper().startswith("10-K")
                             or f.form.upper() == "20-F"):
            hits[symbol] = f.form
    return hits


# ── per-symbol refresh ───────────────────────────────────────────────────────────
def _refresh_symbol(db, symbol: str) -> None:
    """Run the additive refresh chain for one symbol. Raises on failure so the
    caller can count it (each call is isolated by the caller's try/except)."""
    db.update_ticker(symbol, verbose=False, fill_gaps=True)
    db.save_quarters(symbol, verbose=False)
    db.derive_q4(symbol, verbose=False)
    db.save_ttm(symbol, verbose=False)


def _activate_filer(db_path: str, symbol: str) -> None:
    """Flip an awaiting_first_financials filer to active. Best-effort."""
    try:
        with sqlite3.connect(db_path) as conn:
            conn.execute(
                "UPDATE security_map SET status = 'active' "
                "WHERE symbol = ? AND status = ?",
                [symbol, _NEW_STATUS])
            conn.commit()
    except sqlite3.Error as exc:
        print(f"  WARN: could not activate {symbol}: {exc}", file=sys.stderr)


def run(db_path: str, *, override: date | None = None, dry_run: bool = False,
        db_factory=None, http_get=jobs.http_get) -> dict[str, int]:
    """Fetch the target daily indexes, map filers, and refresh each. Returns a
    counts dict. Network + FinancialDB are injectable for offline tests."""
    if not os.path.exists(db_path):
        print(f"DB not found: {db_path}", file=sys.stderr)
        return {"error": 1}

    last_run = _last_run_date(db_path)
    days = dates_to_process(date.today(), last_run, override=override)

    with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True) as ro:
        primary_by_cik = load_primary_by_cik(ro)

    all_hits: dict[str, str] = {}
    for d in days:
        data = http_get(daily_index_url(d))
        if not data:
            print(f"  {d.isoformat()}: no index (holiday or not yet posted)")
            continue
        filings = filter_target_filings(
            parse_form_idx(data.decode("latin-1", "replace")))
        hits = map_hits_to_symbols(filings, primary_by_cik)
        print(f"  {d.isoformat()}: {len(filings)} target filings -> "
              f"{len(hits)} mapped symbols")
        for sym, form in hits.items():
            all_hits.setdefault(sym, form)

    counts = {"days": len(days), "hits": len(all_hits),
              "refreshed": 0, "failed": 0, "activated": 0}

    if dry_run:
        for sym, form in sorted(all_hits.items()):
            print(f"    [dry-run] would refresh {sym} ({form})")
        print(f"filings_watch (dry-run): {counts}")
        return counts

    if not all_hits:
        jobs.write_job_run(db_path, JOB_NAME)
        print(f"filings_watch: {counts}")
        return counts

    if db_factory is None:
        from financial_db import FinancialDB  # lazy: keeps parsing tests light
        db_factory = FinancialDB
    db = db_factory(db_path)
    statuses = _status_by_symbol(db_path, list(all_hits))

    for sym in sorted(all_hits):
        try:
            _refresh_symbol(db, sym)
            counts["refreshed"] += 1
        except Exception as exc:  # noqa: BLE001 — one bad filer must not stop the run
            counts["failed"] += 1
            print(f"  FAIL {sym}: {type(exc).__name__}: {exc}", file=sys.stderr)
            continue
        if statuses.get(sym) == _NEW_STATUS:
            _activate_filer(db_path, sym)
            counts["activated"] += 1

    jobs.write_job_run(db_path, JOB_NAME)
    print(f"filings_watch: {counts}")
    return counts


def _last_run_date(db_path: str) -> date | None:
    try:
        with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True) as conn:
            row = conn.execute(
                "SELECT MAX(last_run) FROM job_runs WHERE job = ?",
                [JOB_NAME]).fetchone()
    except sqlite3.Error:
        return None
    if not row or not row[0]:
        return None
    try:
        return datetime.fromisoformat(str(row[0])).date()
    except ValueError:
        return None


def _status_by_symbol(db_path: str, symbols: list[str]) -> dict[str, str | None]:
    if not symbols:
        return {}
    placeholders = ",".join("?" for _ in symbols)
    try:
        with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True) as conn:
            return {r[0]: r[1] for r in conn.execute(
                f"SELECT symbol, status FROM security_map "
                f"WHERE symbol IN ({placeholders})", symbols)}
    except sqlite3.Error:
        return {}


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Daily EDGAR filings refresh.")
    p.add_argument("db_path", help="Path to the working financials DB (read-write).")
    p.add_argument("--date", default=None,
                   help="Process this single date (YYYY-MM-DD) instead of the "
                        "previous business day(s).")
    p.add_argument("--dry-run", action="store_true",
                   help="List mapped hits without writing anything.")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    override = None
    if args.date:
        try:
            override = date.fromisoformat(args.date)
        except ValueError:
            print(f"bad --date: {args.date!r} (want YYYY-MM-DD)", file=sys.stderr)
            return 2
    counts = run(args.db_path, override=override, dry_run=args.dry_run)
    return 1 if counts.get("error") else 0


if __name__ == "__main__":
    raise SystemExit(main())
