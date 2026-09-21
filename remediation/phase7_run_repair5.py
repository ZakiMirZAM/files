"""Apply ONLY repair 5 of phase7_secmap_repair (CIK-less singleton listings
are primary) to an existing database, then print the invariants.

Repairs 1-4 already ran on 2026-07-13; this runner exists so repair 5 can be
applied to that database without re-touching them. Idempotent.

Usage:
    python remediation/phase7_run_repair5.py <db_path>
"""
import sqlite3
import sys
import time

from phase7_secmap_repair import _promote_cikless_singletons

_INDEXES = (
    "CREATE INDEX IF NOT EXISTS idx_secmap_symbol_yf ON security_map(symbol_yf)",
    "CREATE INDEX IF NOT EXISTS idx_secmap_symbol_fmp ON security_map(symbol_fmp)",
)


def run(db_path: str) -> None:
    con = sqlite3.connect(db_path, timeout=60)
    cur = con.cursor()
    for ddl in _INDEXES:          # sibling lookup is O(n^2) without these
        cur.execute(ddl)
    con.commit()

    t0 = time.time()
    cur.execute("BEGIN")
    n = _promote_cikless_singletons(cur)
    con.commit()
    print(f"cik-less singleton listings promoted: {n} ({time.time() - t0:.1f}s)")

    print("primary counts:", cur.execute(
        "SELECT is_primary, COUNT(*) FROM security_map GROUP BY is_primary").fetchall())
    print("audit rows:", cur.execute(
        "SELECT COUNT(*) FROM rekey_audit WHERE action='no_cik_singleton_promoted'"
    ).fetchone()[0])
    print("dual-primary CIKs (must be 0):", cur.execute(
        "SELECT COUNT(*) FROM (SELECT cik FROM security_map WHERE is_primary=1 "
        "AND cik IS NOT NULL GROUP BY cik HAVING COUNT(*) > 1)").fetchone()[0])
    print("Consumer Electronics primaries with financials:", cur.execute(
        "SELECT COUNT(DISTINCT f.Ticker) FROM financials f "
        "JOIN tickers t ON t.ticker = f.Ticker "
        "LEFT JOIN security_map s ON s.symbol = f.Ticker "
        "WHERE t.industry = 'Consumer Electronics' AND COALESCE(s.is_primary, 1) = 1"
    ).fetchone()[0])
    con.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    run(sys.argv[1])
