"""Historical FX rates, so a 2016 market cap is weighted at 2016 exchange rates.

`fx_rates` holds ONE spot rate per currency. Using it for every year means a
2016 Japanese cap is converted at the 2026 rate: measured, that understates a
JPY filer's size by ~28% and a KRW filer's by ~19% while inflating EUR/GBP by
~8%. The weighted averages then mis-rank whole currency blocs against each
other, and the error grows the further back the chart goes.

This builds `fx_rates_hist(currency, year, usd_per_unit)` from each currency's
fiscal-year-END close, which is the date the stored market cap is as of.

Usage:
    python remediation/fx_history.py <db_path> [--from 2012] [--to 2026]
"""

import argparse
import sqlite3
import sys
import warnings

warnings.filterwarnings("ignore")

DDL = """
CREATE TABLE IF NOT EXISTS fx_rates_hist (
    currency     TEXT    NOT NULL,
    year         INTEGER NOT NULL,
    usd_per_unit REAL    NOT NULL,
    asof         TEXT,
    PRIMARY KEY (currency, year)
)
"""


def _year_end_rates(ccy: str, y0: int, y1: int) -> dict[int, float]:
    """{year: USD per 1 unit of ccy} at each year's last trading day."""
    import yfinance as yf

    for pair, invert in ((f"{ccy}USD=X", False), (f"USD{ccy}=X", True)):
        try:
            h = yf.Ticker(pair).history(start=f"{y0}-01-01", end=f"{y1}-12-31")
        except Exception:  # noqa: BLE001 -- try the inverse pair
            continue
        if h is None or h.empty:
            continue
        out: dict[int, float] = {}
        for ts, row in h.iterrows():
            v = float(row["Close"])
            if v <= 0:
                continue
            rate = (1.0 / v) if invert else v
            out[ts.year] = rate  # later dates overwrite -> year-end close
        if out:
            return out
    return {}


def run(db_path: str, y0: int, y1: int) -> None:
    con = sqlite3.connect(db_path, timeout=60)
    cur = con.cursor()
    cur.execute(DDL)

    currencies = [
        r[0] for r in cur.execute(
            "SELECT DISTINCT currency FROM fx_rates WHERE currency != 'USD'")
    ]
    spot = dict(cur.execute(
        "SELECT currency, usd_per_unit FROM fx_rates").fetchall())
    print(f"currencies: {len(currencies)}   years: {y0}-{y1}")

    written = filled_spot = 0
    for i, ccy in enumerate(currencies, 1):
        rates = _year_end_rates(ccy, y0, y1)
        for yr in range(y0, y1 + 1):
            rate = rates.get(yr)
            if rate is None:
                # No history for that year (currency too illiquid / too new):
                # fall back to the spot rate rather than dropping the row from
                # every average. Marked so the provenance is visible.
                rate = spot.get(ccy)
                if rate is None:
                    continue
                filled_spot += 1
                asof = "spot_fallback"
            else:
                asof = f"{yr}-12-31"
            cur.execute(
                "INSERT INTO fx_rates_hist (currency, year, usd_per_unit, asof) "
                "VALUES (?,?,?,?) ON CONFLICT(currency, year) DO UPDATE SET "
                "usd_per_unit=excluded.usd_per_unit, asof=excluded.asof",
                (ccy, yr, rate, asof))
            written += 1
        if i % 10 == 0:
            print(f"  {i}/{len(currencies)}")
            con.commit()

    # USD is the numeraire: 1.0 in every year.
    for yr in range(y0, y1 + 1):
        cur.execute(
            "INSERT INTO fx_rates_hist (currency, year, usd_per_unit, asof) "
            "VALUES ('USD', ?, 1.0, 'numeraire') "
            "ON CONFLICT(currency, year) DO UPDATE SET usd_per_unit=1.0",
            (yr,))

    cur.execute(
        "INSERT INTO job_runs(job, last_run) VALUES('fx_history', datetime('now')) "
        "ON CONFLICT(job) DO UPDATE SET last_run=excluded.last_run")
    con.commit()

    n = cur.execute("SELECT COUNT(*) FROM fx_rates_hist").fetchone()[0]
    con.close()
    print(f"rows written: {written} ({filled_spot} spot-fallback)   table total: {n}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("db_path")
    ap.add_argument("--from", dest="y0", type=int, default=2012)
    ap.add_argument("--to", dest="y1", type=int, default=2026)
    a = ap.parse_args()
    run(a.db_path, a.y0, a.y1)
    sys.exit(0)
