"""
import_betas.py

Import point-in-time stock betas from a CSV (header: ``Ticker,beta``) into the
financials.db ``tickers.beta`` column, REPLACING any existing value. This CSV is
the source of truth for betas used by the comparative leaderboard and per-company
WACC — betas are no longer computed from yfinance.

Usage:
    python data/import_betas.py                          # default CSV (~/Downloads/beta.csv)
    python data/import_betas.py --csv path/to/beta.csv
    python data/import_betas.py --db path/to/custom.db

Re-run whenever beta.csv is updated.
"""
from __future__ import annotations

import argparse
import os
import sys

# Make ``financial_db`` importable regardless of the working directory.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from financial_db import FinancialDB  # type: ignore  # noqa: E402


def _default_db_path() -> str:
    """financials.db lives at the repo root, one level above data/."""
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(os.path.normpath(os.path.join(here, "..")), "financials.db")


def _default_csv_path() -> str:
    """beta.csv lives in the user's Downloads folder by default."""
    return os.path.join(os.path.expanduser("~"), "Downloads", "beta.csv")


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Import betas from CSV into tickers.beta (replaces existing values)."
    )
    ap.add_argument("--csv", default=_default_csv_path(), help="CSV with Ticker,beta columns")
    ap.add_argument("--db", default=_default_db_path(), help="Path to financials.db")
    ap.add_argument("--quiet", action="store_true", help="Suppress progress output")
    args = ap.parse_args()

    if not os.path.exists(args.csv):
        print(f"[beta-import] CSV not found at {args.csv}", file=sys.stderr)
        return 1
    if not os.path.exists(args.db):
        print(f"[beta-import] database not found at {args.db}", file=sys.stderr)
        return 1

    db = FinancialDB(args.db)
    print(f"[beta-import] importing {args.csv} -> {args.db}")
    res = db.import_betas_from_csv(args.csv, verbose=not args.quiet)
    print(f"[beta-import] {res['updated']} betas replaced, {res['skipped']} rows skipped/unmatched.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
