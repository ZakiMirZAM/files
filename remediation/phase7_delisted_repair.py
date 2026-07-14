"""Phase 7: repair the delisted-company rows (findings VAL-01, REM-3, REM-4,
DELISTED-FLOAT-CAP-MISSCALE).

Three repairs over the ~213 delisted CIKs:
  1. caps    — re-fetch dei:EntityPublicFloat with fiscal-year (`fy`) keying,
               latest-`filed`-wins, and sanity bounds, then OVERWRITE the
               previously filled float-based Market Cap (the old fill was
               end-date keyed: off by one year for Jan-Jun fiscal year-ends,
               and unbounded). A year the corrected fetch cannot support is
               set back to NULL rather than keeping a wrong weight.
  2. cogs    — fill Cost Of Revenue from the legacy us-gaap tags
               (CostOfGoodsSold / CostOfGoodsAndServicesSold / CostOfRevenue),
               then Gross Profit = Revenue - Cost Of Revenue where NULL.
  3. sector  — classify tickers.sector from the SEC submissions SIC code so
               delisted companies actually enter the sector averages (they
               were silently excluded by `WHERE t.sector IS NOT NULL`).
               Industry is left NULL (documented partial fix).

Usage:
    python remediation/phase7_delisted_repair.py <db_path>
"""

import json
import sqlite3
import sys
import time
import urllib.request

sys.path.insert(0, "remediation")
from phase3b_ingest import _fetch_concept  # corrected fy-keyed fetcher

UA = {"User-Agent": "IntrinsicFinEd admin@intrinsicfined.org"}


def _submissions_sic(cik: str) -> tuple[str | None, str | None]:
    url = f"https://data.sec.gov/submissions/CIK{cik}.json"
    try:
        with urllib.request.urlopen(
                urllib.request.Request(url, headers=UA), timeout=30) as r:
            d = json.load(r)
        return d.get("sic"), d.get("sicDescription")
    except Exception:  # noqa: BLE001 -- classified best-effort
        return None, None


def sic_to_sector(sic: str | None, desc: str | None) -> str | None:
    """Map an SEC SIC code (+description keywords) to the app's sector labels."""
    if not sic:
        return None
    try:
        c = int(sic)
    except ValueError:
        return None
    d = (desc or "").lower()

    if c in (1311,) or 1380 <= c <= 1389 or 2900 <= c <= 2999 or c in (4922, 4923, 4924):
        return "Energy"
    if 6500 <= c <= 6599 or c == 6798:
        return "Real Estate"
    if 6000 <= c <= 6799:
        return "Financial Services"
    if 2833 <= c <= 2836 or 3841 <= c <= 3851 or 8000 <= c <= 8099 or "pharma" in d or "biological" in d:
        return "Healthcare"
    if c == 3674 or 3570 <= c <= 3579 or 3600 <= c <= 3699 or 7370 <= c <= 7379 or "computer" in d or "software" in d or "semiconductor" in d:
        return "Technology"
    if c == 4813 or 4800 <= c <= 4899 or 7800 <= c <= 7899 or "broadcast" in d or "telecommunications" in d:
        return "Communication Services"
    if 4900 <= c <= 4991:
        return "Utilities"
    if 2000 <= c <= 2199 or c == 5411 or "food" in d or "tobacco" in d:
        return "Consumer Defensive"
    if c == 3711 or 5200 <= c <= 5999 or 5000 <= c <= 5199 or c == 7011 or "retail" in d or "apparel" in d:
        return "Consumer Cyclical"
    if 1000 <= c <= 1499 or 2600 <= c <= 2699 or 2800 <= c <= 2899 or 3300 <= c <= 3399 or "chemical" in d or "mining" in d or "steel" in d or "gold" in d:
        return "Basic Materials"
    if 100 <= c <= 999:
        return "Basic Materials"
    if 1500 <= c <= 3999 or 4000 <= c <= 4799 or 7000 <= c <= 8999:
        return "Industrials"
    return None


def run(db_path: str) -> None:
    con = sqlite3.connect(db_path, timeout=60)
    cur = con.cursor()

    dead = cur.execute(
        "SELECT DISTINCT f.Cik, s.symbol FROM financials f "
        "JOIN security_map s ON s.symbol = f.Ticker "
        "WHERE s.status = 'delisted' AND f.Cik IS NOT NULL").fetchall()
    print(f"delisted CIKs to repair: {len(dead)}")

    caps_set = caps_nulled = cogs_filled = gp_filled = sectors_set = 0

    for i, (cik, sym) in enumerate(dead):
        floats = _fetch_concept(cik, "EntityPublicFloat")
        time.sleep(0.13)

        # 1. corrected float caps (overwrite the earlier end-date-keyed fill)
        years = [r[0] for r in cur.execute(
            'SELECT "Calendar Year" FROM financials WHERE Ticker=?', (sym,))]
        for yr in years:
            v = floats.get(int(yr))
            if v is not None:
                cur.execute(
                    'UPDATE financials SET "Market Cap"=? '
                    'WHERE Ticker=? AND "Calendar Year"=?', (v, sym, yr))
                caps_set += 1
            else:
                n = cur.execute(
                    'UPDATE financials SET "Market Cap"=NULL '
                    'WHERE Ticker=? AND "Calendar Year"=? '
                    'AND "Market Cap" IS NOT NULL', (sym, yr)).rowcount
                caps_nulled += n

        # 2. legacy COGS tags -> Cost Of Revenue (only fills NULL)
        need_cogs = cur.execute(
            'SELECT COUNT(*) FROM financials WHERE Ticker=? '
            'AND "Cost Of Revenue" IS NULL', (sym,)).fetchone()[0]
        if need_cogs:
            merged: dict[int, float] = {}
            for concept in ("CostOfGoodsSold", "CostOfGoodsAndServicesSold",
                            "CostOfRevenue"):
                url = ("https://data.sec.gov/api/xbrl/companyconcept/"
                       f"CIK{cik}/us-gaap/{concept}.json")
                try:
                    with urllib.request.urlopen(
                            urllib.request.Request(url, headers=UA),
                            timeout=30) as r:
                        data = json.load(r)
                    for f in (data.get("units") or {}).get("USD", []):
                        if f.get("form") == "10-K" and f.get("fp") == "FY" \
                                and f.get("fy") and f.get("val") is not None:
                            merged.setdefault(int(f["fy"]), float(f["val"]))
                except Exception:  # noqa: BLE001 -- tag absent is normal
                    pass
                time.sleep(0.13)
            for yr, v in merged.items():
                cogs_filled += cur.execute(
                    'UPDATE financials SET "Cost Of Revenue"='
                    'COALESCE("Cost Of Revenue", ?) '
                    'WHERE Ticker=? AND "Calendar Year"=? '
                    'AND "Cost Of Revenue" IS NULL', (v, sym, yr)).rowcount

        # 3. SIC sector classification
        cur_sector = cur.execute(
            "SELECT sector FROM tickers WHERE ticker=?", (sym,)).fetchone()
        if cur_sector and cur_sector[0] is None:
            sic, desc = _submissions_sic(cik)
            time.sleep(0.13)
            sector = sic_to_sector(sic, desc)
            if sector:
                cur.execute("UPDATE tickers SET sector=? WHERE ticker=?",
                            (sector, sym))
                cur.execute(
                    'UPDATE financials SET Sector=? WHERE Ticker=?',
                    (sector, sym))
                sectors_set += 1

        if (i + 1) % 40 == 0:
            print(f"  {i + 1}/{len(dead)}")
            con.commit()

    # Gross Profit from Revenue - COGS (set-based, delisted rows, NULL only)
    gp_filled = cur.execute(
        'UPDATE financials SET "Gross Profit" = Revenue - "Cost Of Revenue" '
        'WHERE "Gross Profit" IS NULL AND Revenue IS NOT NULL '
        'AND "Cost Of Revenue" IS NOT NULL AND Ticker IN '
        "(SELECT symbol FROM security_map WHERE status='delisted')").rowcount

    cur.execute(
        "INSERT INTO job_runs(job, last_run) VALUES('phase7_delisted_repair', "
        "datetime('now')) ON CONFLICT(job) DO UPDATE SET "
        "last_run=excluded.last_run")
    con.commit()
    con.close()
    print(f"caps set (corrected): {caps_set}   caps nulled: {caps_nulled}")
    print(f"cogs filled: {cogs_filled}   gross profit derived: {gp_filled}")
    print(f"sectors classified: {sectors_set}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    run(sys.argv[1])
