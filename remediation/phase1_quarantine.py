"""Phase 1: move junk placeholder rows out of `financials` into
`financials_quarantine`, and flag tickers left with no data.

Junk = rows whose "Calendar Year" is not a 4-digit year (Wisesheets error
strings such as 'Unavailable' and '2025 data not available yet.'). Every
query in the request path already filters these out with a GLOB, so the
move must not change any displayed number — verified by phase1_verify.py.

Usage:
    python remediation/phase1_quarantine.py <db_path>
"""

import sqlite3
import sys

YEAR_GLOB = '"Calendar Year" GLOB \'[0-9][0-9][0-9][0-9]\''


def run(db_path: str) -> None:
    con = sqlite3.connect(db_path)
    cur = con.cursor()
    try:
        cur.execute("BEGIN")

        n_junk = cur.execute(
            f"SELECT COUNT(*) FROM financials WHERE NOT {YEAR_GLOB}"
        ).fetchone()[0]
        print(f"junk rows to quarantine: {n_junk}")

        # Tickers whose ONLY rows are junk (they become zero-data afterwards)
        placeholder_only = [r[0] for r in cur.execute(f"""
            SELECT DISTINCT Ticker FROM financials f1
            WHERE NOT {YEAR_GLOB}
              AND NOT EXISTS (
                SELECT 1 FROM financials f2
                WHERE f2.Ticker = f1.Ticker AND {YEAR_GLOB.replace('"Calendar Year"', 'f2."Calendar Year"')}
              )
        """)]
        print(f"placeholder-only tickers: {len(placeholder_only)}")

        exists = cur.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' "
            "AND name='financials_quarantine'").fetchone()
        if exists:
            raise SystemExit("financials_quarantine already exists; aborting "
                             "(migration is one-shot)")

        cur.execute(f"""
            CREATE TABLE financials_quarantine AS
            SELECT *, 'junk_year_period' AS quarantine_reason,
                   datetime('now') AS quarantined_at
            FROM financials WHERE NOT {YEAR_GLOB}
        """)
        cur.execute(f"DELETE FROM financials WHERE NOT {YEAR_GLOB}")

        # Flag tickers that now have zero data because everything they had
        # was placeholder junk.
        cols = [r[1] for r in cur.execute("PRAGMA table_info(tickers)")]
        if "status" not in cols:
            cur.execute("ALTER TABLE tickers ADD COLUMN status TEXT")
        cur.executemany(
            "UPDATE tickers SET status='placeholder_only' WHERE ticker=?",
            [(t,) for t in placeholder_only])

        con.commit()
    except Exception:
        con.rollback()
        raise

    q = cur.execute("SELECT COUNT(*) FROM financials_quarantine").fetchone()[0]
    f = cur.execute("SELECT COUNT(*) FROM financials").fetchone()[0]
    periods = cur.execute(
        "SELECT DISTINCT Period FROM financials").fetchall()
    flagged = cur.execute(
        "SELECT COUNT(*) FROM tickers WHERE status='placeholder_only'"
    ).fetchone()[0]
    con.close()
    print(f"quarantined: {q}  remaining financials: {f}")
    print(f"distinct Period now: {[p[0] for p in periods]}")
    print(f"tickers flagged placeholder_only: {flagged}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    run(sys.argv[1])
