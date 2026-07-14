"""Phase 2: execute the fold plan against `financials`.

Consumes `phase2_fold_plan.json` and applies its three action types inside a
single transaction:
  - rekey     : move a sibling's year onto the primary Ticker. If the target
                (to, year) already has a row the rekey is skipped and logged as
                'skipped_conflict' (that year should have been a quarantine).
  - quarantine: copy the loser row into `financials_quarantine` (reason
                'duplicate_sibling') then delete it from `financials`.
  - alias     : no change to `financials` (security_map already carries it);
                logged for the audit trail only.

Every action is written to `rekey_audit`. The run is one-shot: it aborts if
`rekey_audit` already contains rows.

Usage:
    python remediation/phase2_rekey.py <db_path>
"""

import json
import os
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
FOLD_PLAN = os.path.join(HERE, "phase2_fold_plan.json")

AUDIT_SQL = """
CREATE TABLE IF NOT EXISTS rekey_audit (
    cik         TEXT,
    action      TEXT,
    sym_from    TEXT,
    sym_to      TEXT,
    year        TEXT,
    executed_at TEXT
)
"""


def _log(cur: sqlite3.Cursor, cik: str, action: str, sym_from: str | None,
         sym_to: str | None, year: object) -> None:
    cur.execute(
        "INSERT INTO rekey_audit VALUES (?,?,?,?,?,datetime('now'))",
        (cik, action, sym_from, sym_to,
         None if year is None else str(year)))


def _rekey(cur: sqlite3.Cursor, cik: str, act: dict) -> tuple[int, int]:
    """UPDATE Ticker per year; skip+log years already present on the target."""
    done = skipped = 0
    for year in act["years"]:
        yr = str(year)
        clash = cur.execute(
            'SELECT 1 FROM financials WHERE Ticker=? AND "Calendar Year"=?',
            (act["to"], yr)).fetchone()
        if clash:
            _log(cur, cik, "skipped_conflict", act["from"], act["to"], yr)
            skipped += 1
            continue
        cur.execute(
            'UPDATE financials SET Ticker=? WHERE Ticker=? '
            'AND "Calendar Year"=?', (act["to"], act["from"], yr))
        _log(cur, cik, "rekey", act["from"], act["to"], yr)
        done += 1
    return done, skipped


def _quarantine(cur: sqlite3.Cursor, cik: str, act: dict) -> int:
    """Copy each loser year into the quarantine table, then delete it."""
    moved = 0
    for year in act["years"]:
        yr = str(year)
        cur.execute(
            "INSERT INTO financials_quarantine "
            "SELECT *, 'duplicate_sibling', datetime('now') FROM financials "
            'WHERE Ticker=? AND "Calendar Year"=?', (act["from"], yr))
        cur.execute(
            'DELETE FROM financials WHERE Ticker=? AND "Calendar Year"=?',
            (act["from"], yr))
        _log(cur, cik, "quarantine", act["from"], None, yr)
        moved += 1
    return moved


def run(db_path: str) -> None:
    if not os.path.exists(FOLD_PLAN):
        raise SystemExit(f"fold plan not found: {FOLD_PLAN}")
    with open(FOLD_PLAN, encoding="utf-8") as fh:
        plan = json.load(fh)

    con = sqlite3.connect(db_path)
    cur = con.cursor()
    counts = {"rekey": 0, "skipped_conflict": 0, "quarantine": 0, "alias": 0}
    try:
        cur.execute("BEGIN")
        cur.execute(AUDIT_SQL)
        if cur.execute("SELECT COUNT(*) FROM rekey_audit").fetchone()[0]:
            raise SystemExit("rekey_audit already populated; aborting "
                             "(rekey is one-shot).")

        # Quarantines must run BEFORE rekeys within a fold: a fold may retire
        # the primary's own inferior rows (e.g. JPM's sparse 2021-2025) to
        # make room for a sibling's fuller years. Rekey-first would hit the
        # (to, year) conflict guard and strand the better rows; quarantine-
        # after-rekey would delete the rows just moved in.
        _ORDER = {"quarantine": 0, "rekey": 1, "alias": 2}
        for fold in plan.get("folds", []):
            cik = fold["cik"]
            ordered = sorted(fold.get("actions", []),
                             key=lambda a: _ORDER.get(a.get("type"), 99))
            for act in ordered:
                kind = act.get("type")
                if kind == "rekey":
                    done, skipped = _rekey(cur, cik, act)
                    counts["rekey"] += done
                    counts["skipped_conflict"] += skipped
                elif kind == "quarantine":
                    counts["quarantine"] += _quarantine(cur, cik, act)
                elif kind == "alias":
                    _log(cur, cik, "alias", act["symbol"], act.get("to"), None)
                    counts["alias"] += 1
                else:
                    raise SystemExit(f"unknown action type: {kind!r}")
        con.commit()
    except Exception:
        con.rollback()
        raise

    remaining = cur.execute("SELECT COUNT(*) FROM financials").fetchone()[0]
    con.close()
    print(f"rekeyed years:      {counts['rekey']}")
    print(f"skipped conflicts:  {counts['skipped_conflict']}")
    print(f"quarantined years:  {counts['quarantine']}")
    print(f"aliases logged:     {counts['alias']}")
    print(f"remaining financials rows: {remaining}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    run(sys.argv[1])
