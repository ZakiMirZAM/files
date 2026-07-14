"""Phase 2: build the `security_map` crosswalk table.

One row per security symbol (union of the DB `tickers` table and the SEC
universe files), carrying the vendor-specific spellings (SEC / yfinance / FMP),
its kind (common/preferred/warrant/unit), CIK, exchange, and a primary flag.

If `phase2_fold_plan.json` exists alongside this script it is applied: each
fold's chosen primary gets is_primary=1, alias rows inherit the fold CIK/kind,
and every non-folded CIK gets its primary flag set on the SEC-first symbol (or,
failing that, the DB symbol that actually carries data). Read-mostly: only the
new `security_map` table is written.

Usage:
    python remediation/phase2_security_map.py <db_path>
"""

import json
import os
import sqlite3
import sys

SENTINEL_CIK = '0000000000'  # placeholder, never a real identity

from identity_lib import classify_kind, pad_cik, yf_symbol_guess

HERE = os.path.dirname(os.path.abspath(__file__))
SEC_TICKERS = os.path.join(HERE, "sec_company_tickers.json")
SEC_EXCHANGE = os.path.join(HERE, "sec_company_tickers_exchange.json")
FOLD_PLAN = os.path.join(HERE, "phase2_fold_plan.json")

CREATE_SQL = """
CREATE TABLE security_map (
    cik         TEXT,
    symbol      TEXT PRIMARY KEY,
    symbol_sec  TEXT,
    symbol_yf   TEXT,
    symbol_fmp  TEXT,
    kind        TEXT,
    is_primary  INTEGER DEFAULT 0,
    exchange    TEXT,
    status      TEXT,
    valid_from  TEXT,
    valid_to    TEXT
)
"""


def load_sec() -> tuple[dict, dict, dict]:
    """Return (sec_cik_by_symbol, sec_exchange_by_symbol, sec_first_by_cik)."""
    with open(SEC_TICKERS, encoding="utf-8") as fh:
        raw = json.load(fh)
    cik_by_symbol: dict[str, str] = {}
    first_by_cik: dict[str, str] = {}
    for entry in raw.values():  # insertion order == SEC ordering
        sym = entry["ticker"].upper()
        cik = pad_cik(entry["cik_str"])
        cik_by_symbol.setdefault(sym, cik)
        if cik is not None:
            first_by_cik.setdefault(cik, sym)

    exchange_by_symbol: dict[str, str] = {}
    with open(SEC_EXCHANGE, encoding="utf-8") as fh:
        ex = json.load(fh)
    idx = {name: i for i, name in enumerate(ex["fields"])}
    for row in ex["data"]:
        sym = str(row[idx["ticker"]]).upper()
        exchange_by_symbol[sym] = row[idx["exchange"]]
    return cik_by_symbol, exchange_by_symbol, first_by_cik


def db_facts(cur: sqlite3.Cursor) -> tuple[dict, dict, dict, dict]:
    """Collect per-symbol facts from the DB in one pass each."""
    ticker_rows = {
        r[0]: {"exchange": r[1], "status": r[2]}
        for r in cur.execute("SELECT ticker, exchange, status FROM tickers")
    }
    mode_cik: dict[str, str] = {}
    best: dict[str, int] = {}
    for tk, cik, n in cur.execute(
        'SELECT Ticker, Cik, COUNT(*) FROM financials '
        "WHERE Cik IS NOT NULL GROUP BY Ticker, Cik"
    ):
        if n > best.get(tk, -1):
            best[tk] = n
            mode_cik[tk] = cik
    data_years: dict[str, dict[str, int]] = {}
    for cik, tk, ny in cur.execute(
        'SELECT Cik, Ticker, COUNT(DISTINCT "Calendar Year") FROM financials '
        "WHERE Cik IS NOT NULL GROUP BY Cik, Ticker"
    ):
        data_years.setdefault(cik, {})[tk] = ny
    has_data = {r[0] for r in cur.execute(
        "SELECT DISTINCT Ticker FROM financials")}
    return ticker_rows, mode_cik, data_years, has_data


def build_rows(sec: tuple, db: tuple) -> list[tuple]:
    """Assemble one security_map row per union symbol."""
    sec_cik, sec_exch, _ = sec
    ticker_rows, mode_cik, _, _ = db
    symbols = set(ticker_rows) | set(sec_cik)
    rows: list[tuple] = []
    for sym in sorted(symbols):
        in_db = sym in ticker_rows
        exchange = sec_exch.get(sym) or (
            ticker_rows[sym]["exchange"] if in_db else None)
        cik = mode_cik.get(sym) or sec_cik.get(sym)
        status = (ticker_rows[sym]["status"] if in_db else None) or "active"
        rows.append((
            cik, sym,
            sym if sym in sec_cik else None,      # symbol_sec
            yf_symbol_guess(sym, exchange),        # symbol_yf
            sym if in_db else None,                # symbol_fmp
            classify_kind(sym), 0, exchange, status, None, None,
        ))
    return rows


def apply_fold_plan(cur: sqlite3.Cursor, sec: tuple, db: tuple) -> int:
    """Set is_primary and alias metadata. Returns count of primaries set."""
    _, _, first_by_cik = sec
    _, _, data_years, has_data = db
    folded_ciks: set[str] = set()

    if os.path.exists(FOLD_PLAN):
        with open(FOLD_PLAN, encoding="utf-8") as fh:
            plan = json.load(fh)
        for fold in plan.get("folds", []):
            folded_ciks.add(fold["cik"])
            cur.execute(
                "UPDATE security_map SET is_primary=1 WHERE symbol=?",
                (fold["primary"],))
            for act in fold.get("actions", []):
                if act.get("type") == "alias":
                    cur.execute(
                        "UPDATE security_map SET cik=?, kind=? WHERE symbol=?",
                        (fold["cik"], act.get("kind", "preferred"),
                         act["symbol"]))

    return _assign_nonfolded(cur, folded_ciks, first_by_cik, data_years,
                             has_data)


def _assign_nonfolded(cur: sqlite3.Cursor, folded: set, first_by_cik: dict,
                      data_years: dict, has_data: set) -> int:
    """Flag one primary per non-folded CIK: SEC-first, else data carrier."""
    ciks = [r[0] for r in cur.execute(
        "SELECT DISTINCT cik FROM security_map WHERE cik IS NOT NULL")]
    known = {r[0] for r in cur.execute("SELECT symbol FROM security_map")}
    primaries = 0
    for cik in ciks:
        if cik in folded:
            continue
        primary = first_by_cik.get(cik) if first_by_cik.get(cik) in known \
            else None
        if primary is None:
            carriers = {t: n for t, n in data_years.get(cik, {}).items()
                        if t in has_data}
            if carriers:
                primary = max(sorted(carriers), key=carriers.get)
        if primary is not None:
            cur.execute(
                "UPDATE security_map SET is_primary=1 WHERE symbol=?",
                (primary,))
            primaries += 1
    return primaries


def run(db_path: str) -> None:
    con = sqlite3.connect(db_path)
    cur = con.cursor()
    try:
        exists = cur.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' "
            "AND name='security_map'").fetchone()
        if exists:
            raise SystemExit("security_map already exists; aborting "
                             "(build is one-shot). Drop it to rebuild.")

        sec = load_sec()
        db = db_facts(cur)
        cur.execute(CREATE_SQL)
        cur.executemany(
            "INSERT INTO security_map VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            build_rows(sec, db))
        primaries = apply_fold_plan(cur, sec, db)
        con.commit()
    except Exception:
        con.rollback()
        raise

    total = cur.execute("SELECT COUNT(*) FROM security_map").fetchone()[0]
    by_kind = dict(cur.execute(
        "SELECT kind, COUNT(*) FROM security_map GROUP BY kind"))
    con.close()
    print(f"security_map rows: {total}")
    print(f"primaries flagged: {primaries}")
    print(f"by kind: {by_kind}")
    print(f"fold plan applied: {os.path.exists(FOLD_PLAN)}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    run(sys.argv[1])
