"""universe_sync (weekly): reconcile ``security_map`` against the SEC universe.

Downloads both SEC ticker files (``company_tickers.json`` +
``company_tickers_exchange.json``) with the contact UA, then diffs the SEC
registrant list against ``security_map``:

  - NEW REGISTRANT  (a SEC symbol whose CIK is not yet in security_map): INSERT
    a row with kind via ``classify_kind``, ``is_primary`` per the
    SEC-first-unless-data-carrier rule, status ``awaiting_first_financials``.
  - RENAME / NEW SYMBOL (a SEC symbol whose CIK is already in security_map):
    INSERT an ALIAS row (is_primary=0) and log the rename.
  - DELIST (a CIK that security_map knew from SEC but is absent from this run):
    set status ``delisted`` + ``valid_to`` = today on every symbol of that CIK.
    Rows are NEVER deleted.

The ``tickers`` table is refreshed for each new primary (name from SEC).

The diff itself (``compute_diff``) is a pure function of the SEC snapshot and
the current security_map, so it is unit-tested offline. Only the download and
the apply step touch I/O.

Usage:
    python remediation/jobs/universe_sync.py <db_path> [--no-download]
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from dataclasses import dataclass, field

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _jobslib as jobs  # noqa: E402

jobs.ensure_sys_path()

from identity_lib import classify_kind, pad_cik, yf_symbol_guess  # noqa: E402

JOB_NAME = "universe_sync"

SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
SEC_EXCHANGE_URL = "https://www.sec.gov/files/company_tickers_exchange.json"
SEC_TICKERS_FILE = os.path.join(jobs.REMEDIATION_DIR, "sec_company_tickers.json")
SEC_EXCHANGE_FILE = os.path.join(
    jobs.REMEDIATION_DIR, "sec_company_tickers_exchange.json")

_NEW_STATUS = "awaiting_first_financials"
_DELISTED_STATUS = "delisted"
_ACTIVE_STATUS = "active"

# A weekly job must never mass-delist on a truncated/garbage SEC download. If a
# single run would delist more than this fraction of the map, the delist step is
# skipped and loudly flagged (the adds/renames still apply).
MAX_DELIST_FRACTION = 0.05


def _real_cik(cik: str | None) -> str | None:
    """Normalize a CIK, treating the all-zero placeholder as no identity.

    Many FMP-only ``security_map`` rows carry the sentinel ``'0000000000'``
    instead of NULL; grouping them as one company would (and once did) let a
    single SEC-known symbol drag ~25k unrelated rows into a delist. A CIK is
    real only when it is non-empty and not all zeros.
    """
    if not cik:
        return None
    stripped = cik.strip()
    return stripped if stripped and set(stripped) != {"0"} else None


# ── SEC snapshot ───────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class SecUniverse:
    """Parsed SEC universe. ``ordered_symbols`` preserves SEC ranking so the
    first symbol seen for a CIK is that CIK's SEC-first (primary) symbol."""

    ordered_symbols: tuple[str, ...]
    cik_by_symbol: dict[str, str | None]
    first_by_cik: dict[str, str]
    exchange_by_symbol: dict[str, str | None]
    name_by_symbol: dict[str, str | None]

    @property
    def ciks(self) -> set[str]:
        return {c for c in self.cik_by_symbol.values() if c}


@dataclass(frozen=True)
class ExistingRow:
    symbol: str
    cik: str | None
    symbol_sec: str | None
    is_primary: int
    status: str | None


@dataclass(frozen=True)
class NewRow:
    """A row to INSERT into security_map."""

    cik: str | None
    symbol: str
    symbol_sec: str
    symbol_yf: str
    kind: str
    is_primary: int
    exchange: str | None
    status: str
    valid_from: str
    name: str | None  # SEC title, for the tickers upsert (primaries only)


@dataclass
class Diff:
    registrants: list[NewRow] = field(default_factory=list)
    renames: list[NewRow] = field(default_factory=list)
    delist_symbols: list[str] = field(default_factory=list)

    def summary(self) -> str:
        return (f"registrants={len(self.registrants)} "
                f"renames={len(self.renames)} "
                f"delisted-symbols={len(self.delist_symbols)}")


def parse_sec_universe(tickers_raw: dict, exchange_raw: dict) -> SecUniverse:
    """Build a :class:`SecUniverse` from the two SEC JSON payloads.

    ``tickers_raw`` is the ``company_tickers.json`` mapping (insertion order is
    SEC ranking). ``exchange_raw`` is ``company_tickers_exchange.json`` with its
    ``fields``/``data`` shape.
    """
    ordered: list[str] = []
    cik_by_symbol: dict[str, str | None] = {}
    first_by_cik: dict[str, str] = {}
    name_by_symbol: dict[str, str | None] = {}
    for entry in tickers_raw.values():
        sym = str(entry.get("ticker", "")).upper().strip()
        if not sym or sym in cik_by_symbol:
            continue
        cik = pad_cik(entry.get("cik_str"))
        ordered.append(sym)
        cik_by_symbol[sym] = cik
        name_by_symbol[sym] = entry.get("title")
        if cik is not None:
            first_by_cik.setdefault(cik, sym)

    exchange_by_symbol: dict[str, str | None] = {}
    fields = exchange_raw.get("fields") or []
    if fields:
        idx = {name: i for i, name in enumerate(fields)}
        t_i, e_i = idx.get("ticker"), idx.get("exchange")
        for row in exchange_raw.get("data") or []:
            if t_i is None:
                break
            sym = str(row[t_i]).upper().strip()
            exchange_by_symbol[sym] = row[e_i] if e_i is not None else None

    return SecUniverse(
        ordered_symbols=tuple(ordered),
        cik_by_symbol=cik_by_symbol,
        first_by_cik=first_by_cik,
        exchange_by_symbol=exchange_by_symbol,
        name_by_symbol=name_by_symbol,
    )


def compute_diff(sec: SecUniverse, existing: list[ExistingRow],
                 has_data: set[str], today: str) -> Diff:
    """Pure diff of the SEC snapshot against the current security_map.

    ``has_data`` is the set of symbols that carry ``financials`` rows (used by
    the SEC-first-unless-data-carrier primary rule). ``today`` is the ISO date
    stamped on new rows (valid_from) and delistings (valid_to).
    """
    diff = Diff()
    existing_symbols = {r.symbol for r in existing}
    seen_ciks = {c for c in (_real_cik(r.cik) for r in existing) if c}
    # CIKs security_map learned from SEC (a symbol carries symbol_sec); only
    # these can be "delisted" - purely-domestic FMP-only names are never touched.
    # The placeholder zero CIK is excluded so it can never anchor a delist group.
    sec_known_ciks = {c for c in
                      (_real_cik(r.cik) for r in existing if r.symbol_sec) if c}

    for sym in sec.ordered_symbols:
        if sym in existing_symbols:
            continue
        cik = _real_cik(sec.cik_by_symbol.get(sym))
        exch = sec.exchange_by_symbol.get(sym)
        name = sec.name_by_symbol.get(sym)
        kind = classify_kind(sym)
        yf = yf_symbol_guess(sym, exch)
        is_new_cik = cik is None or cik not in seen_ciks

        if is_new_cik:
            # Brand-new CIK: no data yet, so the SEC-first symbol is primary.
            # (The data-carrier exception cannot apply to a CIK we've never seen.)
            is_primary = 1 if (cik is None or sec.first_by_cik.get(cik) == sym) else 0
            diff.registrants.append(NewRow(
                cik=cik, symbol=sym, symbol_sec=sym, symbol_yf=yf, kind=kind,
                is_primary=is_primary, exchange=exch, status=_NEW_STATUS,
                valid_from=today, name=name if is_primary else None))
            if cik is not None:
                seen_ciks.add(cik)
        else:
            # Same CIK, new spelling: add as an alias, never auto-promote.
            diff.renames.append(NewRow(
                cik=cik, symbol=sym, symbol_sec=sym, symbol_yf=yf, kind=kind,
                is_primary=0, exchange=exch, status=_NEW_STATUS,
                valid_from=today, name=None))

    current_sec_ciks = sec.ciks
    delist_ciks = {c for c in sec_known_ciks if c not in current_sec_ciks}
    diff.delist_symbols = sorted(
        r.symbol for r in existing
        if _real_cik(r.cik) in delist_ciks and r.status != _DELISTED_STATUS)
    return diff


# ── I/O: load, download, apply ─────────────────────────────────────────────────
def load_existing(conn: sqlite3.Connection) -> list[ExistingRow]:
    rows = conn.execute(
        "SELECT symbol, cik, symbol_sec, is_primary, status FROM security_map"
    ).fetchall()
    return [ExistingRow(r[0], r[1], r[2], int(r[3] or 0), r[4]) for r in rows]


def load_has_data(conn: sqlite3.Connection) -> set[str]:
    try:
        return {r[0] for r in conn.execute(
            "SELECT DISTINCT Ticker FROM financials")}
    except sqlite3.OperationalError:
        return set()


def download_sec_files(http_get=jobs.http_get) -> bool:
    """Refresh the two cached SEC JSON files in place. Returns True on success.

    A failed download leaves the existing cached file untouched (better a
    week-old universe than none), and the run continues on the cache.
    """
    ok = True
    for url, dest in ((SEC_TICKERS_URL, SEC_TICKERS_FILE),
                      (SEC_EXCHANGE_URL, SEC_EXCHANGE_FILE)):
        data = http_get(url)
        if not data:
            print(f"  WARN: SEC download failed, using cache: {url}",
                  file=sys.stderr)
            ok = False
            continue
        try:
            json.loads(data)  # validate before overwriting the cache
        except json.JSONDecodeError:
            print(f"  WARN: SEC payload not JSON, using cache: {url}",
                  file=sys.stderr)
            ok = False
            continue
        with open(dest, "wb") as fh:
            fh.write(data)
    return ok


def load_sec_from_cache() -> SecUniverse:
    with open(SEC_TICKERS_FILE, encoding="utf-8") as fh:
        tickers_raw = json.load(fh)
    with open(SEC_EXCHANGE_FILE, encoding="utf-8") as fh:
        exchange_raw = json.load(fh)
    return parse_sec_universe(tickers_raw, exchange_raw)


def guard_delist(diff: Diff, existing_count: int,
                 max_fraction: float = MAX_DELIST_FRACTION) -> bool:
    """Circuit-breaker: if a run would delist more than ``max_fraction`` of the
    map, clear the delist list in place and return True (a likely bad/partial
    SEC download). Adds and renames are unaffected. Returns True when tripped."""
    if existing_count <= 0:
        return False
    proposed = len(diff.delist_symbols)
    if proposed > max_fraction * existing_count:
        print(f"  ALERT: {proposed} proposed delistings exceed "
              f"{max_fraction:.0%} of {existing_count} rows - SKIPPING delist "
              f"(suspect a truncated SEC download); adds/renames still apply.",
              file=sys.stderr)
        diff.delist_symbols = []
        return True
    return False


def apply_diff(conn: sqlite3.Connection, diff: Diff, today: str) -> dict[str, int]:
    """Apply the diff to security_map (+ tickers upserts). Returns counts.

    INSERT OR IGNORE keeps it safe to re-run against a partially-applied state;
    a symbol already present is left as-is (never restated).
    """
    counts = {"registrants": 0, "renames": 0, "delisted": 0, "tickers": 0,
              "reconciled": 0}
    insert_sql = (
        "INSERT OR IGNORE INTO security_map "
        "(cik, symbol, symbol_sec, symbol_yf, symbol_fmp, kind, is_primary, "
        " exchange, status, valid_from, valid_to) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?)")

    def _row_vals(nr: NewRow) -> list:
        return [nr.cik, nr.symbol, nr.symbol_sec, nr.symbol_yf, None, nr.kind,
                nr.is_primary, nr.exchange, nr.status, nr.valid_from, None]

    for nr in diff.registrants:
        cur = conn.execute(insert_sql, _row_vals(nr))
        counts["registrants"] += cur.rowcount if cur.rowcount and cur.rowcount > 0 else 0
        if nr.is_primary:
            counts["tickers"] += _upsert_ticker(conn, nr, today)
    for nr in diff.renames:
        cur = conn.execute(insert_sql, _row_vals(nr))
        counts["renames"] += cur.rowcount if cur.rowcount and cur.rowcount > 0 else 0
        print(f"  RENAME: new symbol {nr.symbol} for CIK {nr.cik} "
              f"(added as alias)")
    for sym in diff.delist_symbols:
        cur = conn.execute(
            "UPDATE security_map SET status = ?, valid_to = ? "
            "WHERE symbol = ? AND status != ?",
            [_DELISTED_STATUS, today, sym, _DELISTED_STATUS])
        counts["delisted"] += cur.rowcount if cur.rowcount and cur.rowcount > 0 else 0
    counts["reconciled"] = _reconcile_primary_tickers(conn, today)
    conn.commit()
    return counts


def _upsert_ticker(conn: sqlite3.Connection, nr: NewRow, today: str) -> int:
    """Refresh the tickers row for a new primary (name from SEC). Best-effort."""
    try:
        conn.execute(
            "INSERT INTO tickers (ticker, name, exchange, last_updated) "
            "VALUES (?,?,?,?) "
            "ON CONFLICT(ticker) DO UPDATE SET "
            "  name = COALESCE(excluded.name, name), "
            "  exchange = COALESCE(excluded.exchange, exchange), "
            "  last_updated = excluded.last_updated",
            [nr.symbol, nr.name, nr.exchange, today])
        return 1
    except sqlite3.Error as exc:
        print(f"  WARN: tickers upsert failed for {nr.symbol}: {exc}",
              file=sys.stderr)
        return 0


def _reconcile_primary_tickers(conn: sqlite3.Connection, today: str) -> int:
    """Backfill a ``tickers`` row for every active ``is_primary=1`` company that
    has fundamentals but no ``tickers`` row (H5).

    New registrants get their ``tickers`` row from ``_upsert_ticker``, but a
    company that became primary outside this job (a re-key, an earlier ingest)
    can carry full ``financials`` yet never appear in ``tickers`` - and every
    sector/industry average / search INNER-JOINs ``tickers``, so it is invisible
    (AXS, RNR, BEP and 7 others). Name/sector/industry are sourced from the
    ``financials`` warehouse (the SEC files carry no sector/industry). After the
    backfill, a WARNING is logged if the active primaries are still not a subset
    of ``tickers``. Best-effort; returns the number of rows inserted.
    """
    try:
        missing = conn.execute(
            "SELECT symbol FROM security_map "
            "WHERE COALESCE(is_primary, 1) = 1 AND status = ? "
            "  AND symbol NOT IN (SELECT ticker FROM tickers)",
            [_ACTIVE_STATUS]).fetchall()
    except sqlite3.Error as exc:
        print(f"  WARN: tickers reconciliation query failed: {exc}",
              file=sys.stderr)
        return 0

    added = 0
    for (sym,) in missing:
        frow = conn.execute(
            'SELECT "Name", "Sector", "Industry" FROM financials '
            'WHERE Ticker = ? '
            'ORDER BY CAST("Calendar Year" AS INTEGER) DESC LIMIT 1',
            [sym]).fetchone()
        if frow is None:
            continue  # no fundamentals to source sector/industry from
        try:
            conn.execute(
                "INSERT OR IGNORE INTO tickers "
                "(ticker, name, sector, industry, last_updated) "
                "VALUES (?,?,?,?,?)",
                [sym, frow[0], frow[1], frow[2], today])
            added += 1
        except sqlite3.Error as exc:
            print(f"  WARN: tickers backfill failed for {sym}: {exc}",
                  file=sys.stderr)

    still_missing = conn.execute(
        "SELECT COUNT(*) FROM security_map "
        "WHERE COALESCE(is_primary, 1) = 1 AND status = ? "
        "  AND symbol NOT IN (SELECT ticker FROM tickers)",
        [_ACTIVE_STATUS]).fetchone()[0]
    if still_missing:
        print(f"  ALERT: {still_missing} active is_primary=1 companies are not "
              f"a subset of tickers (no fundamentals to source sector/industry) "
              f"- reconciliation incomplete.", file=sys.stderr)
    return added


def main(db_path: str, *, download: bool = True) -> int:
    if not os.path.exists(db_path):
        print(f"DB not found: {db_path}", file=sys.stderr)
        return 2
    today = jobs.today_iso()
    if download:
        download_sec_files()
    sec = load_sec_from_cache()

    with sqlite3.connect(db_path) as conn:
        existing = load_existing(conn)
        has_data = load_has_data(conn)
        diff = compute_diff(sec, existing, has_data, today)
        guard_delist(diff, len(existing))
        counts = apply_diff(conn, diff, today)

    print(f"universe_sync: SEC symbols={len(sec.ordered_symbols)} "
          f"existing-map={len(existing)}")
    print(f"  {diff.summary()}")
    print(f"  applied: {counts}")
    jobs.write_job_run(db_path, JOB_NAME)
    return 0


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Weekly SEC universe reconcile.")
    p.add_argument("db_path", help="Path to the working financials DB (read-write).")
    p.add_argument("--no-download", action="store_true",
                   help="Skip the SEC download; diff against the cached files.")
    return p.parse_args(argv)


if __name__ == "__main__":
    args = _parse_args()
    raise SystemExit(main(args.db_path, download=not args.no_download))
