"""
betas/refresh.py — data warm-up CLI + the one scheduler hook.

CLI (run from the repo root or backend/):

    python -m betas.refresh --damodaran            # betas.xls + psdata.xls -> financials.db
    python -m betas.refresh --damodaran-hist 2013 2025   # archived yearly files
    python -m betas.refresh --edgar [--tickers AAPL MSFT]  # 10-K segment revenues
    python -m betas.refresh --classify                   # segment -> industry mapping
    python -m betas.refresh --resolve [--force]          # compute betas for the universe

The marketdata scheduler calls only :func:`refresh_damodaran` (monthly gate);
EDGAR / classification / resolution are deliberately manual — 10-Ks arrive on
an annual cycle and the LLM step should be warmed intentionally, not from a
request thread.
"""

from __future__ import annotations

import argparse
import os
import sqlite3
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DB_PATH = Path(os.environ.get("FINANCIALS_DB", _REPO_ROOT / "financials.db"))


def _connect(db_path: Path | str | None = None) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path or DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def refresh_damodaran(*, force: bool = False, db_path: Path | str | None = None) -> dict[str, int]:
    """Fetch + persist the current Damodaran beta/ps datasets. Scheduler entry."""
    from .damodaran_industry import DamodaranIndustryData  # noqa: PLC0415

    with _connect(db_path) as conn:
        return DamodaranIndustryData().refresh(conn, force=force)


def refresh_damodaran_history(years, *, force: bool = False,
                              db_path: Path | str | None = None) -> dict[int, int]:
    """Fetch + persist the archived yearly Damodaran files (beta/ps)."""
    from .damodaran_industry import DamodaranIndustryData  # noqa: PLC0415

    with _connect(db_path) as conn:
        return DamodaranIndustryData().refresh_history(conn, years=years, force=force)


def damodaran_asof(db_path: Path | str | None = None) -> str | None:
    """Latest snapshot date, for the scheduler's staleness gate."""
    try:
        with _connect(db_path) as conn:
            row = conn.execute("SELECT MAX(asof) FROM damodaran_industry").fetchone()
            return row[0] if row else None
    except sqlite3.OperationalError:
        return None


def _cli() -> int:
    ap = argparse.ArgumentParser(description="Bottom-up beta engine data warm-up")
    ap.add_argument("--damodaran", action="store_true", help="refresh current betas.xls + psdata.xls")
    ap.add_argument("--damodaran-hist", nargs=2, type=int, metavar=("FROM", "TO"),
                    help="refresh archived yearly files for FROM..TO inclusive")
    ap.add_argument("--edgar", action="store_true", help="fetch 10-K segment revenues")
    ap.add_argument("--classify", action="store_true", help="map segments to Damodaran groups")
    ap.add_argument("--resolve", action="store_true", help="compute betas for the universe")
    ap.add_argument("--tickers", nargs="*", default=None, help="limit --edgar/--classify/--resolve")
    ap.add_argument("--force", action="store_true", help="ignore caches / recompute")
    args = ap.parse_args()

    did_anything = False
    if args.damodaran:
        did_anything = True
        results = refresh_damodaran(force=args.force)
        print(f"[damodaran] rows written per dataset: {results}")
    if args.damodaran_hist:
        did_anything = True
        lo, hi = args.damodaran_hist
        results = refresh_damodaran_history(range(lo, hi + 1), force=args.force)
        wrote = {y: n for y, n in results.items() if n}
        print(f"[damodaran-hist] years with rows: {wrote or 'none'}")
    if args.edgar:
        did_anything = True
        from . import edgar_client  # noqa: PLC0415
        with _connect() as conn:
            stats = edgar_client.warm_universe(conn, tickers=args.tickers, force=args.force)
        print(f"[edgar] {stats}")
    if args.classify:
        did_anything = True
        from . import classify  # noqa: PLC0415
        with _connect() as conn:
            stats = classify.warm_universe(conn, tickers=args.tickers, force=args.force)
        print(f"[classify] {stats}")
    if args.resolve:
        did_anything = True
        from . import bottom_up  # noqa: PLC0415
        stats = bottom_up.warm_universe(tickers=args.tickers, force=args.force)
        print(f"[resolve] {stats}")

    if not did_anything:
        ap.print_help()
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(_cli())
