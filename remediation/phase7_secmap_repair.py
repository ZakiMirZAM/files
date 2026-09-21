"""Phase 7: repair security_map defects found by the adversarial debug sweep.

Four repairs, all audited into rekey_audit:
  1. sentinel  — cik '0000000000' is a placeholder, not an identity: set NULL
                 so the alias-map JOIN can never fold through it (CRITICAL:
                 637 real tickers resolved to the wrong company).
  2. dual      — CIKs with 2+ is_primary=1 rows: keep the symbol with the most
                 financials rows (tie: lexicographically first), demote others.
  3. orphan    — CIKs with aliases but 0 primaries: promote the data-carrying
                 symbol (most financials rows; tie: SEC-listed one).
  4. preferred — a preferred-kind symbol flagged primary while a common-kind
                 sibling exists: promote the best common sibling.
  5. no-cik    — a symbol with no CIK and no sibling row (nothing shares its
                 Yahoo or FMP symbol) is the only listing of its company, so
                 it IS the primary. Phase 2 assigned primaries per CIK and left
                 every CIK-less symbol at 0 — which is every foreign-exchange
                 listing (Samsung, Xiaomi, Kyocera, ... 24.7k symbols with
                 financials). Every group query filters COALESCE(is_primary,1)=1,
                 so all industry/sector averages and comparative rankings had
                 silently shrunk to US filers. The daily universe_sync job
                 already treats a CIK-less symbol as primary; this brings the
                 bulk map in line with it.

Usage:
    python remediation/phase7_secmap_repair.py <db_path>
"""

import sqlite3
import sys


def _fin_rows(cur: sqlite3.Cursor, symbol: str) -> int:
    return cur.execute(
        "SELECT COUNT(*) FROM financials WHERE Ticker = ?", (symbol,)
    ).fetchone()[0]


def _audit(cur: sqlite3.Cursor, cik: str | None, action: str,
           sym_from: str | None, sym_to: str | None) -> None:
    cur.execute(
        "INSERT INTO rekey_audit VALUES (?,?,?,?,NULL,datetime('now'))",
        (cik, action, sym_from, sym_to))


def _promote_cikless_singletons(cur: sqlite3.Cursor) -> int:
    """Repair 5. A row is a sibling of another when they share a CIK (handled
    by repairs 2-4) or a non-null Yahoo/FMP symbol. A CIK-less common-kind row
    with no such sibling cannot be a duplicate of anything, so demoting it only
    hides its company. Promote it; audited as no_cik_singleton_promoted.
    Preferred, unit and warrant rows are never a company's primary listing."""
    rows = cur.execute(
        """
        SELECT a.symbol FROM security_map a
        WHERE a.cik IS NULL AND COALESCE(a.is_primary, 0) = 0
          AND COALESCE(a.kind, 'common') = 'common'
          AND NOT EXISTS (
              SELECT 1 FROM security_map b
              WHERE b.symbol <> a.symbol
                AND ((a.symbol_yf IS NOT NULL AND b.symbol_yf = a.symbol_yf)
                  OR (a.symbol_fmp IS NOT NULL AND b.symbol_fmp = a.symbol_fmp)))
        """
    ).fetchall()
    for (sym,) in rows:
        cur.execute("UPDATE security_map SET is_primary=1 WHERE symbol=?", (sym,))
        _audit(cur, None, "no_cik_singleton_promoted", None, sym)
    return len(rows)


def run(db_path: str) -> None:
    con = sqlite3.connect(db_path, timeout=60)
    cur = con.cursor()
    cur.execute("BEGIN")

    # 1. sentinel CIK -> NULL (kills the cartesian fold-through)
    n = cur.execute(
        "UPDATE security_map SET cik = NULL WHERE cik = '0000000000'"
    ).rowcount
    _audit(cur, "0000000000", "sentinel_cik_nulled", None, None)
    print(f"sentinel rows nulled: {n}")

    # 2. dual primaries -> keep the data carrier
    duals = cur.execute(
        "SELECT cik FROM security_map WHERE is_primary=1 AND cik IS NOT NULL "
        "GROUP BY cik HAVING COUNT(*) > 1").fetchall()
    for (cik,) in duals:
        syms = [r[0] for r in cur.execute(
            "SELECT symbol FROM security_map WHERE cik=? AND is_primary=1",
            (cik,))]
        keep = max(sorted(syms), key=lambda s: _fin_rows(cur, s))
        for s in syms:
            if s != keep:
                cur.execute(
                    "UPDATE security_map SET is_primary=0 WHERE symbol=?", (s,))
                _audit(cur, cik, "dual_primary_demoted", s, keep)
    print(f"dual-primary CIKs repaired: {len(duals)}")

    # 3. orphan CIKs (aliases, no primary) -> promote the data carrier
    orphans = cur.execute(
        "SELECT cik FROM security_map WHERE cik IS NOT NULL "
        "GROUP BY cik HAVING SUM(is_primary) = 0").fetchall()
    promoted = 0
    for (cik,) in orphans:
        syms = [r[0] for r in cur.execute(
            "SELECT symbol FROM security_map WHERE cik=?", (cik,))]
        by_rows = sorted(syms, key=lambda s: (-_fin_rows(cur, s), s))
        best = by_rows[0]
        if _fin_rows(cur, best) == 0:
            # no data anywhere: promote the SEC-listed symbol if any, else skip
            sec = [r[0] for r in cur.execute(
                "SELECT symbol FROM security_map WHERE cik=? AND "
                "symbol_sec IS NOT NULL", (cik,))]
            if not sec:
                continue
            best = sorted(sec)[0]
        cur.execute(
            "UPDATE security_map SET is_primary=1 WHERE symbol=?", (best,))
        _audit(cur, cik, "orphan_primary_promoted", None, best)
        promoted += 1
    print(f"orphan CIKs promoted: {promoted} of {len(orphans)}")

    # 4. preferred-kind primary with a common sibling -> promote the common
    pref = cur.execute(
        "SELECT cik, symbol FROM security_map "
        "WHERE is_primary=1 AND kind='preferred' AND cik IS NOT NULL"
    ).fetchall()
    flipped = 0
    for cik, psym in pref:
        commons = [r[0] for r in cur.execute(
            "SELECT symbol FROM security_map WHERE cik=? AND kind='common'",
            (cik,))]
        if not commons:
            continue
        best = sorted(commons, key=lambda s: (-_fin_rows(cur, s), s))[0]
        cur.execute(
            "UPDATE security_map SET is_primary=0 WHERE symbol=?", (psym,))
        cur.execute(
            "UPDATE security_map SET is_primary=1 WHERE symbol=?", (best,))
        _audit(cur, cik, "preferred_primary_flipped", psym, best)
        flipped += 1
    print(f"preferred primaries flipped to common: {flipped} of {len(pref)}")

    # 5. CIK-less symbol with no sibling -> it is its company's only listing
    promoted_nocik = _promote_cikless_singletons(cur)
    print(f"cik-less singleton listings promoted: {promoted_nocik}")

    con.commit()

    # Post-conditions
    bad_dual = cur.execute(
        "SELECT COUNT(*) FROM (SELECT cik FROM security_map WHERE is_primary=1 "
        "AND cik IS NOT NULL GROUP BY cik HAVING COUNT(*) > 1)").fetchone()[0]
    sentinel = cur.execute(
        "SELECT COUNT(*) FROM security_map WHERE cik='0000000000'"
    ).fetchone()[0]
    con.close()
    print(f"post: dual-primary CIKs = {bad_dual}, sentinel rows = {sentinel}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    run(sys.argv[1])
