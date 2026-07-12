"""
Precompute the per-year UNLEVERED bottom-up industry beta.

For each industry and year (2012-2025), average the member firms' stored
regression betas (beta_history), then unlever that average by the industry's
MEDIAN market debt-to-equity and median effective tax rate. This is Damodaran's
bottom-up beta (Investment Valuation, Ch.8): averaging across the industry cuts
single-stock regression noise by ~sqrt(n). The individual page relevers this
value at each company's own D/E.

Validated benefit vs single-firm regression betas (data/validate_beta_methods.py):
implausible betas 8.8% -> 3.8%, year-over-year noise 0.216 -> 0.128.

Run:  python data/compute_industry_beta.py
Use a real Python interpreter (the same database the API reads).
"""

from __future__ import annotations

import os
import sqlite3
import statistics as st
from collections import defaultdict

START, END = 2012, 2025
MIN_N = 5  # below this, the individual page falls back to the single-firm beta


def _db_path() -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.normpath(os.path.join(here, "..", "financials.db"))


def _f(v):
    try:
        x = float(v)
        return x if x == x else None
    except (TypeError, ValueError):
        return None


def _year(v):
    try:
        y = int(v)
        return y if START <= y <= END else None
    except (TypeError, ValueError):
        return None


def main() -> int:
    path = _db_path()
    if not os.path.exists(path):
        print(f"[industry-beta] financials.db not found at {path}")
        return 1
    conn = sqlite3.connect(path)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS industry_beta_history (
            industry TEXT NOT NULL,
            year     INTEGER NOT NULL,
            unlevered_beta REAL,
            n        INTEGER,
            PRIMARY KEY (industry, year)
        )
        """
    )

    industry = dict(conn.execute("SELECT ticker, industry FROM tickers WHERE industry IS NOT NULL"))
    beta: dict[str, dict[int, float]] = defaultdict(dict)
    for t, y, b in conn.execute(
        "SELECT ticker, year, beta FROM beta_history WHERE year BETWEEN ? AND ? AND beta IS NOT NULL",
        (START, END),
    ):
        beta[t][int(y)] = float(b)

    de: dict[str, dict[int, float]] = defaultdict(dict)
    tax: dict[str, dict[int, float]] = defaultdict(dict)
    for tk, cy, td, mc, ibt, txe in conn.execute(
        'SELECT "Ticker","Calendar Year","Total Debt","Market Cap",'
        '"Income Before Tax","Income Tax Expense" FROM financials'
    ):
        y = _year(cy)
        if not tk or y is None:
            continue
        d, m = _f(td), _f(mc)
        if d is not None and m and m > 0 and d >= 0:
            de[tk][y] = d / m
        ibt_f, txe_f = _f(ibt), _f(txe)
        if ibt_f and ibt_f > 0 and txe_f is not None:
            tax[tk][y] = min(max(txe_f / ibt_f, 0.0), 0.5)

    members: dict[tuple[str, int], list[str]] = defaultdict(list)
    for t, ys in beta.items():
        ind = industry.get(t)
        if ind:
            for y in ys:
                members[(ind, y)].append(t)

    rows: list[tuple[str, int, float, int]] = []
    for (ind, y), ts in members.items():
        # Drop implausible member betas (negative or > 3) before averaging: those
        # are nontrading / illiquidity artifacts, not real risk, and they bias the
        # industry average (Damodaran cautions that thin-trading depresses betas).
        clean = [t for t in ts if 0.0 <= beta[t][y] <= 3.0]
        if len(clean) < MIN_N:
            continue
        betas = [beta[t][y] for t in clean]
        des = [de[t][y] for t in clean if y in de.get(t, {})]
        taxes = [tax[t][y] for t in clean if y in tax.get(t, {})]
        if not des:
            continue
        med_tax = st.median(taxes) if taxes else 0.21
        unlev = st.fmean(betas) / (1.0 + (1.0 - med_tax) * st.median(des))
        rows.append((ind, y, round(unlev, 4), len(clean)))

    conn.executemany(
        "INSERT INTO industry_beta_history (industry, year, unlevered_beta, n) VALUES (?, ?, ?, ?) "
        "ON CONFLICT(industry, year) DO UPDATE SET unlevered_beta = excluded.unlevered_beta, n = excluded.n",
        rows,
    )
    conn.commit()
    inds = len({r[0] for r in rows})
    print(f"[industry-beta] wrote {len(rows)} industry-year rows across {inds} industries ({START}-{END})")
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
