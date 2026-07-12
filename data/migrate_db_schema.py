"""One-shot migration to the 207-column schema.

Backs up financials.db, drops the `financials` table, extends `tickers` with
`exchange` and `country`, and re-initialises `financials` from the updated
EXCEL_COLUMNS via FinancialDB._init_db().

Run AFTER financial_db.py has been edited with the new EXCEL_COLUMNS and
tickers schema.
"""

import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

_HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(_HERE))

from financial_db import FinancialDB, EXCEL_COLUMNS  # noqa: E402

DB_PATH = _HERE.parent / "financials.db"


def main() -> None:
    if not DB_PATH.exists():
        print(f"No DB found at {DB_PATH}; creating fresh.")
        FinancialDB(str(DB_PATH))
        return

    backup = DB_PATH.with_name(
        f"{DB_PATH.name}.backup-{datetime.now():%Y%m%d-%H%M%S}"
    )
    shutil.copy2(DB_PATH, backup)
    print(f"Backup: {backup}")

    with sqlite3.connect(DB_PATH) as conn:
        fin_before = conn.execute("SELECT COUNT(*) FROM financials").fetchone()[0]
        tic_before = conn.execute("SELECT COUNT(*) FROM tickers").fetchone()[0]
        print(f"Before: financials={fin_before:,}  tickers={tic_before:,}")

        conn.execute("DROP TABLE IF EXISTS financials")

        existing = {r[1] for r in conn.execute("PRAGMA table_info(tickers)")}
        if "exchange" not in existing:
            conn.execute("ALTER TABLE tickers ADD COLUMN exchange TEXT")
            print("  + tickers.exchange")
        if "country" not in existing:
            conn.execute("ALTER TABLE tickers ADD COLUMN country TEXT")
            print("  + tickers.country")

        conn.commit()

    FinancialDB(str(DB_PATH))

    with sqlite3.connect(DB_PATH) as conn:
        cols = [r[1] for r in conn.execute("PRAGMA table_info(financials)")]
        tic_cols = [r[1] for r in conn.execute("PRAGMA table_info(tickers)")]
        fin_after = conn.execute("SELECT COUNT(*) FROM financials").fetchone()[0]
        tic_after = conn.execute("SELECT COUNT(*) FROM tickers").fetchone()[0]

    print(f"After:  financials={fin_after:,}  tickers={tic_after:,}")
    print(f"financials columns: {len(cols)} "
          f"(expected {len(EXCEL_COLUMNS) + 1} = EXCEL_COLUMNS + last_updated)")
    print(f"tickers columns: {tic_cols}")

    expected = set(EXCEL_COLUMNS) | {"last_updated"}
    actual = set(cols)
    missing = expected - actual
    extra = actual - expected
    if missing:
        print(f"  MISSING from financials: {sorted(missing)}")
    if extra:
        print(f"  UNEXPECTED in financials: {sorted(extra)}")
    if not missing and not extra and "exchange" in tic_cols and "country" in tic_cols:
        print("Migration OK.")
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
