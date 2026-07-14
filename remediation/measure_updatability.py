"""Measure how many tickers are actually refreshable by our two pipelines.

  EDGAR path (filings_watch, daily, authoritative)  -> needs a CIK
  yfinance path (backfill / market_weekly)          -> needs Yahoo to resolve
                                                       the symbol

The yfinance figure is MEASURED by probing a stratified random sample, not
assumed. Read-only against the DB.

Usage:
    python remediation/measure_updatability.py [sample_per_group]
"""

import random
import sqlite3
import sys
import time
import warnings

warnings.filterwarnings("ignore")

DB = "financials.db"
N = int(sys.argv[1]) if len(sys.argv) > 1 else 40
random.seed(7)

con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
cur = con.cursor()

# ── Structural counts ────────────────────────────────────────────────────────
total_fin = cur.execute(
    "SELECT COUNT(DISTINCT Ticker) FROM financials").fetchone()[0]
with_cik = cur.execute(
    "SELECT COUNT(DISTINCT Ticker) FROM financials WHERE Cik IS NOT NULL "
    "AND Cik != '' AND Cik != '0000000000'").fetchone()[0]
delisted = cur.execute(
    "SELECT COUNT(*) FROM security_map WHERE status='delisted'").fetchone()[0]

print("=" * 66)
print("  STRUCTURAL UPDATABILITY")
print("=" * 66)
print(f"  companies with financial data          {total_fin:>7,}")
print(f"  -> have a CIK (EDGAR/filings_watch)    {with_cik:>7,}"
      f"  ({with_cik / total_fin:.0%})")
print(f"  -> delisted (frozen BY DESIGN)         {delisted:>7,}")

# Did today's sweep actually write new data?
swept = cur.execute(
    "SELECT COUNT(DISTINCT Ticker) FROM financials "
    "WHERE last_updated >= '2026-07-13T17:50'").fetchone()[0]
print(f"  refreshed by today's live sweep so far {swept:>7,}")

# ── Stratified yfinance probe ────────────────────────────────────────────────
groups: dict[str, list[str]] = {}
for (t,) in cur.execute("SELECT DISTINCT Ticker FROM financials"):
    if "." in t:
        sfx = t.rsplit(".", 1)[1]
        key = f".{sfx}" if sfx in ("T", "HK", "L", "NS", "SZ", "SS", "AX",
                                   "TW", "KS", "TO") else ".other"
    else:
        key = "US (no suffix)"
    groups.setdefault(key, []).append(t)
con.close()

print()
print("=" * 66)
print(f"  YFINANCE PROBE  (random sample, n={N} per group)")
print("=" * 66)

import yfinance as yf  # noqa: E402

tot_ok = tot_n = 0
rows: list[tuple[str, int, int, int]] = []
for key in sorted(groups, key=lambda k: -len(groups[k])):
    pop = groups[key]
    sample = random.sample(pop, min(N, len(pop)))
    ok = fund = 0
    for t in sample:
        try:
            yt = yf.Ticker(t)
            # FastInfo is attribute-accessed; .get() silently returns None.
            if getattr(yt.fast_info, "last_price", None) is not None:
                ok += 1
            inc = yt.income_stmt
            if inc is not None and not inc.empty:
                fund += 1
        except Exception:  # noqa: BLE001 -- an unresolvable symbol is the signal
            pass
        time.sleep(0.05)
    rate = ok / len(sample)
    frate = fund / len(sample)
    rows.append((key, len(pop), fund, len(sample)))
    tot_ok += fund
    tot_n += len(sample)
    print(f"  {key:16s} pop {len(pop):>6,}   quote {rate:>4.0%}   "
          f"statements {fund:>2}/{len(sample):<2} = {frate:>4.0%}   "
          f"-> ~{int(len(pop) * frate):,} refreshable")

print()
print(f"  overall: {tot_ok}/{tot_n} = {tot_ok / tot_n:.0%} have refreshable STATEMENTS on Yahoo")

# Weighted estimate across the real population
est_total = 0
for key, pop_n, ok, n in rows:
    est_total += int(pop_n * (ok / n))
print(f"  weighted estimate: ~{est_total:,} of {total_fin:,} "
      f"({est_total / total_fin:.0%}) refreshable via yfinance")
print("=" * 66)
