"""Phase 3b: ingest staged delisted-company rows into `financials`.

Repairs two staging gaps while ingesting:
  1. Ticker is NULL on staged rows -> joined back from phase3b_targets.json
     via Cik.
  2. Market Cap is NULL (Stooq had no prices for dead tickers) -> filled from
     SEC dei:EntityPublicFloat (the filed dollar value of public float, the
     closest SEC-sourced proxy for market cap; documented as such). Shares
     outstanding filled from dei:EntityCommonStockSharesOutstanding.

Safety: INSERT OR IGNORE only (never clobbers an existing ticker-year); a
staged ticker whose symbol already belongs to a DIFFERENT CIK in security_map
is skipped and logged (ticker recycling guard). Also registers the dead
companies in `tickers` (status='delisted') and `security_map` (valid_to =
index-removal date).

Usage:
    python remediation/phase3b_ingest.py <db_path> [--skip-float-fetch]
"""

import json
import os
import sqlite3
import sys
import time
import urllib.request
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
UA = {"User-Agent": "IntrinsicFinEd admin@intrinsicfined.org"}
CONCEPT_URL = ("https://data.sec.gov/api/xbrl/companyconcept/"
               "CIK{cik}/dei/{concept}.json")


# Sanity bounds for a float-based Market Cap proxy (USD): below $1M or above
# $10T is a mis-scaled or corrupt fact, not a real public float.
FLOAT_MIN, FLOAT_MAX = 1e6, 1e13


def _fetch_concept(cik: str, concept: str) -> dict[int, float]:
    """{fiscal year -> value} for a dei concept.

    Keyed by the fact's own `fy` (the fiscal year its 10-K covers) — NOT the
    calendar year of the `end` date, which is off by one for Jan-Jun fiscal
    year-ends because EntityPublicFloat is stated as of the SECOND fiscal
    quarter (Phase 7 finding REM-4). Among competing facts for a year the
    latest `filed` wins (restatement-aware)."""
    url = CONCEPT_URL.format(cik=cik, concept=concept)
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.load(resp)
    except Exception:  # noqa: BLE001 -- absent concept is normal for old filers
        return {}
    best: dict[int, tuple[str, float]] = {}
    for unit_rows in (data.get("units") or {}).values():
        for f in unit_rows:
            val = f.get("val")
            fy = f.get("fy")
            filed = f.get("filed") or ""
            if val is None or fy is None:
                continue
            try:
                yr, v = int(fy), float(val)
            except (TypeError, ValueError):
                continue
            if concept == "EntityPublicFloat" and not (FLOAT_MIN <= v <= FLOAT_MAX):
                continue
            if yr not in best or filed > best[yr][0]:
                best[yr] = (filed, v)
    return {yr: v for yr, (_, v) in best.items()}


def run(db_path: str, skip_float: bool = False) -> None:
    targets = json.load(open(os.path.join(HERE, "phase3b_targets.json"),
                             encoding="utf-8"))
    cik_to_ticker = {t["cik"]: t["ticker"].upper().replace(".", "-")
                     for t in targets["targets"]}
    cik_meta = {t["cik"]: t for t in targets["targets"]}

    rows = [json.loads(l) for l in
            open(os.path.join(HERE, "phase3b_staged.jsonl"), encoding="utf-8")]

    # Group by CIK for the float/shares fill
    ciks = sorted({r["Cik"] for r in rows if r.get("Cik")})
    float_by_cik: dict[str, dict[int, float]] = {}
    shares_by_cik: dict[str, dict[int, float]] = {}
    if not skip_float:
        for i, cik in enumerate(ciks):
            float_by_cik[cik] = _fetch_concept(cik, "EntityPublicFloat")
            time.sleep(0.13)
            shares_by_cik[cik] = _fetch_concept(
                cik, "EntityCommonStockSharesOutstanding")
            time.sleep(0.13)
            if (i + 1) % 40 == 0:
                print(f"  dei facts {i + 1}/{len(ciks)}")

    con = sqlite3.connect(db_path, timeout=60)
    cur = con.cursor()
    fin_cols = [r[1] for r in cur.execute("PRAGMA table_info(financials)")]
    fin_col_set = set(fin_cols)

    # Ticker-recycling guard: symbol already mapped to a different CIK
    sm_cik = {r[0]: r[1] for r in cur.execute(
        "SELECT symbol, cik FROM security_map")}

    inserted = skipped_existing = skipped_recycled = no_ticker = 0
    caps_filled = shares_filled = 0
    recycled: list[str] = []

    cur.execute("BEGIN")
    for r in rows:
        cik = r.get("Cik")
        ticker = cik_to_ticker.get(cik)
        if not ticker:
            no_ticker += 1
            continue
        mapped = sm_cik.get(ticker)
        if mapped and mapped != cik:
            skipped_recycled += 1
            if ticker not in recycled:
                recycled.append(ticker)
            continue

        yr = r.get("Calendar Year")
        r["Ticker"] = ticker
        if r.get("Market Cap") is None:
            v = (float_by_cik.get(cik) or {}).get(yr)
            if v:
                r["Market Cap"] = v
                caps_filled += 1
        if r.get("Weighted Average Shs Out Dil") is None:
            v = (shares_by_cik.get(cik) or {}).get(yr)
            if v:
                r["Weighted Average Shs Out Dil"] = v
                shares_filled += 1
        r["last_updated"] = datetime.now().isoformat()

        cols = [c for c in r.keys()
                if c in fin_col_set and r[c] is not None]
        col_sql = ", ".join(f'"{c}"' for c in cols)
        ph = ", ".join("?" for _ in cols)
        cur2 = cur.execute(
            f"INSERT OR IGNORE INTO financials ({col_sql}) VALUES ({ph})",
            [r[c] for c in cols])
        if cur2.rowcount:
            inserted += 1
        else:
            skipped_existing += 1

    # Register dead companies in tickers + security_map. A dead ticker is
    # primary ONLY if its CIK has no existing primary (Phase 7 finding REM-2:
    # unconditional is_primary=1 created dual-primary CIKs, which makes the
    # alias-map resolution nondeterministic).
    reg_t = reg_sm = 0
    for cik, meta in cik_meta.items():
        ticker = cik_to_ticker[cik]
        if sm_cik.get(ticker) and sm_cik[ticker] != cik:
            continue
        c1 = cur.execute(
            "INSERT OR IGNORE INTO tickers (ticker, name, status, last_updated)"
            " VALUES (?, ?, 'delisted', datetime('now'))",
            (ticker, meta["name"]))
        reg_t += c1.rowcount
        has_primary = cur.execute(
            "SELECT 1 FROM security_map WHERE cik=? AND is_primary=1 LIMIT 1",
            (cik,)).fetchone() is not None
        c2 = cur.execute(
            "INSERT OR IGNORE INTO security_map "
            "(cik, symbol, symbol_sec, symbol_yf, symbol_fmp, kind, "
            " is_primary, exchange, status, valid_from, valid_to) "
            "VALUES (?, ?, NULL, NULL, NULL, 'common', ?, NULL, 'delisted', "
            "NULL, ?)",
            (cik, ticker, 0 if has_primary else 1, meta.get("removed")))
        reg_sm += c2.rowcount

    cur.execute("INSERT INTO job_runs (job, last_run) "
                "VALUES ('phase3b_ingest', datetime('now')) "
                "ON CONFLICT(job) DO UPDATE SET last_run=excluded.last_run")
    con.commit()
    con.close()

    print(f"inserted rows:        {inserted}")
    print(f"skipped (yr existed): {skipped_existing}")
    print(f"skipped (recycled):   {skipped_recycled}  {recycled[:10]}")
    print(f"no ticker for cik:    {no_ticker}")
    print(f"caps filled (float):  {caps_filled}")
    print(f"shares filled:        {shares_filled}")
    print(f"tickers registered:   {reg_t}   security_map: {reg_sm}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    run(sys.argv[1], skip_float="--skip-float-fetch" in sys.argv)
