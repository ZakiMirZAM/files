"""Repair 5 of phase7_secmap_repair: CIK-less singleton listings are primary.

Network-free. Run:  python -m pytest remediation/test_phase7_cikless_primary.py -q
"""
import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(__file__))
from phase7_secmap_repair import _promote_cikless_singletons  # noqa: E402


def _db() -> sqlite3.Connection:
    con = sqlite3.connect(":memory:")
    con.execute(
        "CREATE TABLE security_map (cik TEXT, symbol TEXT PRIMARY KEY, symbol_sec TEXT,"
        " symbol_yf TEXT, symbol_fmp TEXT, kind TEXT, is_primary INTEGER, exchange TEXT,"
        " status TEXT, valid_from TEXT, valid_to TEXT)"
    )
    con.execute("CREATE TABLE rekey_audit (cik TEXT, action TEXT, sym_from TEXT,"
                " sym_to TEXT, year TEXT, executed_at TEXT)")
    con.execute("CREATE TABLE financials (Ticker TEXT)")
    rows = [
        # cik, symbol, sec, yf, fmp, kind, is_primary
        (None, "005930.KS", None, "005930.KS", "005930.KS", "common", 0),  # Samsung: promote
        (None, "6971.T",    None, "6971.T",    None,        "common", 0),  # Kyocera: promote
        (None, "XPRF",      None, "XPRF",      "XPRF",      "preferred", 0),  # preferred: leave
        (None, "XWSW",      None, "XWSW",      None,        "warrant",   0),  # warrant: leave
        (None, "DUPA",      None, "SAMEYF",    None,        "common", 0),  # shares yf with DUPB: leave
        (None, "DUPB",      None, "SAMEYF",    None,        "common", 1),
        ("0000860730", "HCA", "HCA", "HCA", "HCA", "common", 1),           # has CIK: untouched
        ("0000860730", "HCA-ALIAS", None, "HCAX", None, "common", 0),      # has CIK: untouched
    ]
    con.executemany(
        "INSERT INTO security_map VALUES (?,?,?,?,?,?,?,NULL,'active',NULL,NULL)", rows
    )
    return con


def test_promotes_only_cikless_common_singletons():
    con = _db()
    n = _promote_cikless_singletons(con.cursor())
    assert n == 2
    prim = dict(con.execute("SELECT symbol, is_primary FROM security_map"))
    assert prim["005930.KS"] == 1 and prim["6971.T"] == 1
    assert prim["XPRF"] == 0 and prim["XWSW"] == 0
    assert prim["DUPA"] == 0 and prim["DUPB"] == 1
    assert prim["HCA"] == 1 and prim["HCA-ALIAS"] == 0
    audited = {r[0] for r in con.execute(
        "SELECT sym_to FROM rekey_audit WHERE action='no_cik_singleton_promoted'")}
    assert audited == {"005930.KS", "6971.T"}


def test_idempotent():
    con = _db()
    cur = con.cursor()
    assert _promote_cikless_singletons(cur) == 2
    assert _promote_cikless_singletons(cur) == 0
