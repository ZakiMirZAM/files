"""Baseline / diff snapshot for the financials.db remediation.

Captures every metric from the 2026-07-13 audit so each remediation phase
has a machine-checkable before/after. Read-only.

Usage:
    python remediation/baseline.py <db_path> <output_json>
"""

import json
import sqlite3
import sys
from datetime import datetime, timezone

MAJORS = [
    "GS", "MS", "JPM", "BAC", "WFC", "BRK-A", "BRK-B", "GOOG", "GOOGL",
    "META", "AAPL", "MSFT", "NVDA", "AMZN", "TSLA", "XOM", "JNJ", "UNH",
    "V", "MA",
]

YEAR_GLOB = '"Calendar Year" GLOB \'[0-9][0-9][0-9][0-9]\''


def snapshot(db_path: str) -> dict:
    con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    cur = con.cursor()

    def one(sql: str, params: tuple = ()) -> object:
        return cur.execute(sql, params).fetchone()[0]

    out: dict = {
        "db_path": db_path,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    tables = [r[0] for r in cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
    out["tables"] = tables

    out["financials_rows"] = one("SELECT COUNT(*) FROM financials")
    out["financials_distinct_tickers"] = one(
        "SELECT COUNT(DISTINCT Ticker) FROM financials")
    out["tickers_rows"] = one("SELECT COUNT(*) FROM tickers")

    out["rows_per_year"] = {
        str(r[0]): r[1] for r in cur.execute(
            f'SELECT "Calendar Year", COUNT(*) FROM financials '
            f'WHERE {YEAR_GLOB} GROUP BY "Calendar Year"')
    }
    out["junk_year_rows"] = one(
        f"SELECT COUNT(*) FROM financials WHERE NOT {YEAR_GLOB}")
    out["period_values"] = {
        str(r[0]): r[1] for r in cur.execute(
            "SELECT Period, COUNT(*) FROM financials GROUP BY Period")
    }

    out["zero_data_tickers"] = one(
        "SELECT COUNT(*) FROM tickers t WHERE NOT EXISTS "
        "(SELECT 1 FROM financials f WHERE f.Ticker = t.ticker)")
    out["plain_us_orphans"] = one(
        "SELECT COUNT(*) FROM tickers t WHERE NOT EXISTS "
        "(SELECT 1 FROM financials f WHERE f.Ticker = t.ticker) "
        "AND t.ticker NOT LIKE '%.%' AND t.ticker NOT LIKE '%-%'")
    out["null_market_cap_rows"] = one(
        'SELECT COUNT(*) FROM financials WHERE "Market Cap" IS NULL')

    freshness: dict[str, int] = {}
    for yr, n in cur.execute(
        f'SELECT my, COUNT(*) FROM (SELECT Ticker, '
        f'MAX(CAST("Calendar Year" AS INTEGER)) AS my FROM financials '
        f"GROUP BY Ticker) GROUP BY my"
    ):
        freshness[str(yr)] = n
    out["ticker_newest_year_distribution"] = freshness
    out["tickers_frozen_at_2024"] = freshness.get("2024", 0)

    majors: dict[str, dict] = {}
    for t in MAJORS:
        n = one("SELECT COUNT(*) FROM financials WHERE Ticker = ?", (t,))
        yr_min, yr_max = cur.execute(
            f'SELECT MIN(CAST("Calendar Year" AS INT)), '
            f'MAX(CAST("Calendar Year" AS INT)) FROM financials '
            f"WHERE Ticker = ? AND {YEAR_GLOB}", (t,)).fetchone()
        majors[t] = {"rows": n, "min_year": yr_min, "max_year": yr_max}
    out["majors"] = majors

    if "fx_rates" in tables:
        out["fx_rates_count"] = one("SELECT COUNT(*) FROM fx_rates")
        out["fx_rates_asof"] = cur.execute(
            "SELECT MAX(asof) FROM fx_rates").fetchone()[0]
    if "job_runs" in tables:
        out["job_runs_count"] = one("SELECT COUNT(*) FROM job_runs")
    if "security_map" in tables:
        out["security_map_count"] = one("SELECT COUNT(*) FROM security_map")
    if "financials_quarantine" in tables:
        out["quarantine_rows"] = one(
            "SELECT COUNT(*) FROM financials_quarantine")
    if "financials_quarterly" in tables:
        out["quarterly_rows"] = one(
            "SELECT COUNT(*) FROM financials_quarterly")

    con.close()
    return out


def main() -> None:
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    db_path, out_path = sys.argv[1], sys.argv[2]
    snap = snapshot(db_path)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(snap, fh, indent=2)
    print(f"Baseline written: {out_path}")
    for k in ("financials_rows", "tickers_rows", "zero_data_tickers",
              "plain_us_orphans", "junk_year_rows", "null_market_cap_rows",
              "tickers_frozen_at_2024"):
        print(f"  {k}: {snap.get(k)}")


if __name__ == "__main__":
    main()
