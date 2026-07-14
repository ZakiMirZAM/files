"""Phase 3 BACKFILL RUNNER for the financials-DB remediation.

Sweeps yfinance (through :class:`data.financial_db.FinancialDB`) for two cohorts:

  (a) MISSING  — canonical primary tickers (``security_map.is_primary = 1``,
                 status not ``placeholder_only``) that have ZERO rows in
                 ``financials``. These companies were never ingested.
  (b) FROZEN   — tickers already in ``financials`` whose newest ``Calendar Year``
                 is <= a cutoff (``--max-year``, default 2024). Their fundamentals
                 stalled and need the missing recent years back-filled.

Both cohorts are fed to ``FinancialDB.update_ticker(sym, fill_gaps=True)``, which
is additive (``INSERT OR IGNORE`` new years) and COALESCE-gap-fills NULL columns
on existing rows — it never restates a stored non-NULL value.

The runner is resumable (a JSON checkpoint of done/failed tickers), rate-limit
tolerant (per-ticker exception isolation, adaptive pacing, clean abort), and
writes a ``job_runs`` marker at the end.

yfinance writes rows under the SYMBOL PASSED to ``update_ticker``. For US
primaries ``security_map.symbol_yf`` equals the canonical symbol, so rows land
under the canonical ticker. On the rare row where ``symbol_yf`` differs from the
canonical symbol, fetching would strand the rows under the wrong key, so the
ticker is SKIPPED and logged (never guessed).

Run by the orchestrator (which supplies a read-write DB path):

    python -m remediation.phase3_backfill /path/financials_remediation.db --frozen
    python remediation/phase3_backfill.py DB --missing --frozen --limit 500
    python remediation/phase3_backfill.py DB --tickers AAPL,MSFT --reset
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

# Import from data/ and remediation/ only (standalone; no backend deps).
_HERE = Path(__file__).resolve().parent
_REPO = _HERE.parent
for _p in (str(_REPO / "data"), str(_HERE)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from financial_db import FinancialDB  # noqa: E402  (data/financial_db.py)

CHECKPOINT_PATH = _HERE / "phase3_checkpoint.json"
JOB_NAME = "phase3_backfill"
DEFAULT_MAX_YEAR = 2024
DEFAULT_SLEEP = 0.6

# Adaptive-pacing thresholds.
COOLDOWN_AFTER = 5      # consecutive failures -> long sleep + halve pace
COOLDOWN_SECS = 60.0
ABORT_AFTER = 15         # consecutive failures -> clean abort


@dataclass(frozen=True)
class Target:
    """One backfill target: the canonical DB ticker and its yfinance symbol.

    ``symbol_yf`` is ``None`` when ``security_map`` has no mapping (the caller
    then falls back to the canonical ticker itself).
    """

    canonical: str
    symbol_yf: str | None
    cohort: str  # "missing" | "frozen" | "explicit"


@dataclass
class RunStats:
    """Mutable tally for one run, rendered by :meth:`summary`."""

    attempted: int = 0
    added_years: int = 0
    gap_filled: int = 0
    failed: int = 0
    skipped_mismatch: int = 0
    aborted: bool = False
    resume_note: str = ""
    failures: dict[str, str] = field(default_factory=dict)

    def summary(self) -> str:
        lines = [
            "Phase 3 backfill summary",
            f"  attempted:              {self.attempted}",
            f"  added-years:            {self.added_years}",
            f"  gap-filled (rows):      {self.gap_filled}",
            f"  failed:                 {self.failed}",
            f"  skipped-symbol-mismatch:{self.skipped_mismatch}",
        ]
        if self.aborted:
            lines.append(f"  ABORTED: {self.resume_note}")
        return "\n".join(lines)


# ── target selection (pure SQL over a read connection; network-free) ──────────

def select_missing(conn: sqlite3.Connection) -> list[Target]:
    """Canonical primaries with ZERO ``financials`` rows (skips aliases and
    ``placeholder_only`` securities). Deterministic order for stable ``--limit``.
    """
    rows = conn.execute(
        """
        SELECT sm.symbol, sm.symbol_yf
          FROM security_map sm
         WHERE sm.is_primary = 1
           AND (sm.status IS NULL OR sm.status != 'placeholder_only')
           AND NOT EXISTS (
                 SELECT 1 FROM financials f WHERE f.Ticker = sm.symbol)
         ORDER BY sm.symbol
        """
    ).fetchall()
    return [Target(r[0], r[1], "missing") for r in rows]


def select_frozen(conn: sqlite3.Connection, max_year: int) -> list[Target]:
    """Tickers whose newest ``Calendar Year`` is <= ``max_year`` (the frozen
    cohort). Left-joins the canonical primary to resolve ``symbol_yf``; a ticker
    absent from ``security_map`` falls back to itself.
    """
    rows = conn.execute(
        """
        SELECT fr.Ticker, sm.symbol_yf
          FROM (
                SELECT Ticker, MAX("Calendar Year") AS my
                  FROM financials
                 GROUP BY Ticker
                HAVING my <= ?
               ) fr
          LEFT JOIN security_map sm
                 ON sm.symbol = fr.Ticker AND sm.is_primary = 1
         ORDER BY fr.Ticker
        """,
        [max_year],
    ).fetchall()
    return [Target(r[0], r[1], "frozen") for r in rows]


def select_explicit(conn: sqlite3.Connection, tickers: list[str]) -> list[Target]:
    """Resolve an explicit ticker list to targets, looking up ``symbol_yf`` from
    the canonical primary (fallback: the ticker itself)."""
    out: list[Target] = []
    for raw in tickers:
        t = raw.strip().upper()
        if not t:
            continue
        row = conn.execute(
            "SELECT symbol_yf FROM security_map "
            "WHERE symbol = ? AND is_primary = 1 LIMIT 1",
            [t],
        ).fetchone()
        out.append(Target(t, row[0] if row else None, "explicit"))
    return out


def build_targets(conn: sqlite3.Connection, *, missing: bool, frozen: bool,
                  max_year: int) -> list[Target]:
    """Union of the requested cohorts, de-duplicated by canonical ticker
    (missing takes precedence; the two cohorts are disjoint in practice)."""
    seen: set[str] = set()
    out: list[Target] = []
    for group in ((select_missing(conn) if missing else []),
                  (select_frozen(conn, max_year) if frozen else [])):
        for tgt in group:
            if tgt.canonical in seen:
                continue
            seen.add(tgt.canonical)
            out.append(tgt)
    return out


def resolve_symbol(target: Target) -> tuple[str | None, bool]:
    """Decide which symbol to fetch under.

    Returns ``(symbol_to_use, is_mismatch)``. When ``symbol_yf`` is absent or
    equals the canonical ticker, the canonical ticker is used and rows land
    correctly. When it differs, rows would strand under the wrong key, so the
    symbol is ``None`` and ``is_mismatch`` is ``True`` (caller skips + logs).
    """
    yf = target.symbol_yf
    if yf is None or yf.strip() == "" or yf.upper() == target.canonical.upper():
        return target.canonical, False
    return None, True


# ── checkpoint ────────────────────────────────────────────────────────────────

def load_checkpoint(path: Path) -> dict:
    """Load the resume checkpoint, or a fresh one if missing/corrupt."""
    if not path.exists():
        return {"done": [], "failed": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        print(f"  checkpoint unreadable ({exc}); starting fresh", file=sys.stderr)
        return {"done": [], "failed": {}}
    data.setdefault("done", [])
    data.setdefault("failed", {})
    return data


def save_checkpoint(path: Path, checkpoint: dict) -> None:
    """Persist the checkpoint atomically (write-temp-then-replace)."""
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(checkpoint, indent=2), encoding="utf-8")
    tmp.replace(path)


def reset_checkpoint(path: Path) -> None:
    """Delete the checkpoint file if present."""
    if path.exists():
        path.unlink()


# ── per-ticker work ───────────────────────────────────────────────────────────

def _rows_touched_since(db_path: str, ticker: str, since_iso: str) -> int:
    """Count ``financials`` rows for ``ticker`` whose ``last_updated`` is at or
    after ``since_iso``. update_ticker stamps last_updated on both new inserts
    and gap-fills, so (touched - new_years) is the gap-filled row count."""
    try:
        with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True) as conn:
            row = conn.execute(
                'SELECT COUNT(*) FROM financials '
                'WHERE Ticker = ? AND last_updated >= ?',
                [ticker.upper(), since_iso],
            ).fetchone()
        return int(row[0]) if row else 0
    except sqlite3.Error:
        return 0


def process_target(db: FinancialDB, db_path: str, target: Target,
                   since_iso: str) -> tuple[str, int, int]:
    """Backfill one target. Returns ``(status, added_years, gap_filled)`` where
    status is ``"ok"`` | ``"mismatch"`` | ``"error:<reason>"``. Never raises."""
    symbol, mismatch = resolve_symbol(target)
    if mismatch:
        return f"mismatch:{target.symbol_yf}", 0, 0
    assert symbol is not None
    try:
        added = db.update_ticker(symbol, verbose=False, fill_gaps=True)
    except Exception as exc:  # noqa: BLE001 — one bad ticker must not stop the sweep
        return f"error:{type(exc).__name__}:{exc}", 0, 0
    touched = _rows_touched_since(db_path, target.canonical, since_iso)
    gap_filled = max(touched - added, 0)
    return "ok", added, gap_filled


# ── main sweep ─────────────────────────────────────────────────────────────────

def run_backfill(db_path: str, *, missing: bool = False, frozen: bool = False,
                 max_year: int = DEFAULT_MAX_YEAR, limit: int | None = None,
                 tickers: list[str] | None = None, sleep: float = DEFAULT_SLEEP,
                 reset: bool = False, checkpoint_path: Path = CHECKPOINT_PATH,
                 db_factory=FinancialDB) -> RunStats:
    """Execute the backfill sweep. Returns a :class:`RunStats` tally.

    Selection is network-free; only ``update_ticker`` touches yfinance. Adaptive
    pacing: after ``COOLDOWN_AFTER`` consecutive failures it sleeps
    ``COOLDOWN_SECS`` and doubles the inter-call delay; after ``ABORT_AFTER`` it
    aborts cleanly, leaving the checkpoint so a rerun resumes.
    """
    if reset:
        reset_checkpoint(checkpoint_path)
    checkpoint = load_checkpoint(checkpoint_path)
    done: set[str] = set(checkpoint["done"])

    with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True) as ro:
        targets = (select_explicit(ro, tickers) if tickers
                   else build_targets(ro, missing=missing, frozen=frozen,
                                      max_year=max_year))

    pending = [t for t in targets if t.canonical not in done]
    if limit is not None:
        pending = pending[:limit]

    stats = RunStats()
    db = db_factory(db_path)
    pace = sleep
    consecutive = 0

    for idx, target in enumerate(pending):
        since_iso = datetime.now().isoformat()
        status, added, gap = process_target(db, db_path, target, since_iso)
        stats.attempted += 1

        consecutive = _record(stats, checkpoint, done, target, status, added, gap,
                              consecutive)
        save_checkpoint(checkpoint_path, checkpoint)

        if consecutive >= ABORT_AFTER:
            stats.aborted = True
            remaining = len(pending) - idx - 1
            stats.resume_note = (
                f"{ABORT_AFTER} consecutive failures at {target.canonical}; "
                f"{remaining} target(s) left. Rerun the same command to resume.")
            break
        if consecutive and consecutive % COOLDOWN_AFTER == 0:
            print(f"  cooldown: {consecutive} consecutive failures, "
                  f"sleeping {COOLDOWN_SECS}s and halving pace", file=sys.stderr)
            time.sleep(COOLDOWN_SECS)
            pace *= 2
        if idx < len(pending) - 1:
            time.sleep(pace)

    _log_job(db_path)
    return stats


def _record(stats: RunStats, checkpoint: dict, done: set[str], target: Target,
            status: str, added: int, gap: int, consecutive: int) -> int:
    """Fold one target's result into stats + checkpoint. Returns the updated
    consecutive-failure count."""
    if status == "ok":
        stats.added_years += added
        stats.gap_filled += gap
        done.add(target.canonical)
        checkpoint["done"] = sorted(done)
        checkpoint["failed"].pop(target.canonical, None)
        return 0
    if status.startswith("mismatch"):
        stats.skipped_mismatch += 1
        reason = f"symbol_mismatch:{target.symbol_yf}"
        checkpoint["failed"][target.canonical] = reason
        stats.failures[target.canonical] = reason
        print(f"  SKIP {target.canonical}: {reason} (rows would strand under "
              f"the wrong key)", file=sys.stderr)
        return consecutive  # a mismatch is not a network failure
    # error:<reason>
    stats.failed += 1
    reason = status[len("error:"):]
    checkpoint["failed"][target.canonical] = reason
    stats.failures[target.canonical] = reason
    print(f"  FAIL {target.canonical}: {reason}", file=sys.stderr)
    return consecutive + 1


def _log_job(db_path: str) -> None:
    """Insert the ``job_runs`` completion marker. Best-effort (logs on failure)."""
    try:
        with sqlite3.connect(db_path) as conn:
            conn.execute(
                "INSERT INTO job_runs(job, last_run) VALUES(?, datetime('now')) "
                "ON CONFLICT(job) DO UPDATE SET last_run=excluded.last_run",
                [JOB_NAME],
            )
            conn.commit()
    except sqlite3.Error as exc:
        print(f"  WARN: could not write job_runs marker: {exc}", file=sys.stderr)


# ── CLI ─────────────────────────────────────────────────────────────────────────

def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Phase 3 yfinance backfill runner.")
    p.add_argument("db_path", help="Path to the working financials DB (read-write).")
    p.add_argument("--missing", action="store_true",
                   help="Backfill primaries with zero financials rows.")
    p.add_argument("--frozen", action="store_true",
                   help="Backfill tickers whose newest year <= --max-year.")
    p.add_argument("--max-year", type=int, default=DEFAULT_MAX_YEAR,
                   help=f"Frozen-cohort cutoff (default {DEFAULT_MAX_YEAR}).")
    p.add_argument("--limit", type=int, default=None,
                   help="Cap the number of targets processed this run.")
    p.add_argument("--tickers", default=None,
                   help="Explicit comma-separated ticker list (bypasses cohorts).")
    p.add_argument("--sleep", type=float, default=DEFAULT_SLEEP,
                   help=f"Seconds between yfinance calls (default {DEFAULT_SLEEP}).")
    p.add_argument("--reset", action="store_true",
                   help="Clear the checkpoint before running.")
    args = p.parse_args(argv)

    explicit = [t for t in (args.tickers.split(",") if args.tickers else []) if t.strip()]
    if not explicit and not (args.missing or args.frozen):
        p.error("choose at least one of --missing / --frozen (or pass --tickers).")
    args.explicit = explicit
    return args


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    if not Path(args.db_path).exists():
        print(f"DB not found: {args.db_path}", file=sys.stderr)
        return 2
    stats = run_backfill(
        args.db_path, missing=args.missing, frozen=args.frozen,
        max_year=args.max_year, limit=args.limit,
        tickers=args.explicit or None, sleep=args.sleep, reset=args.reset,
    )
    print(stats.summary())
    return 1 if stats.aborted else 0


if __name__ == "__main__":
    raise SystemExit(main())
