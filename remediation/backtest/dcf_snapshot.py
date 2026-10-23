"""Frozen-input DCF snapshot: the before/after table for the DCF accuracy work.

Values each fixture ticker with FROZEN rf / ERP / beta (so a re-run measures the
engine, not the market) and prints the plan's table columns. With --save PATH it
writes the full forecast dicts as JSON; with --compare PATH it diffs against a
saved run. Run under VALUATION_ENGINE=legacy to prove legacy is byte-identical.

    FINANCIALS_DB=<db> python remediation/backtest/dcf_snapshot.py [--save f.json | --compare f.json]
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(REPO, "backend"))
sys.dont_write_bytecode = True

import individualanalysis as ia  # noqa: E402

RF, ERP = 0.0518, 0.0332
# Live bottom-up betas on 2026-09-27; 1.0 where the page had no FCFF forecast.
FIXTURES = {
    "AAPL": 0.94, "MSFT": 1.29, "ADBE": 1.32, "COST": 0.79, "MCD": 0.99,
    "KO": 0.63, "V": 1.0, "MA": 1.0,
    # edge cases named in the plan
    "NKE": 1.0, "F": 1.0, "XOM": 1.0, "SPGI": 1.0, "ICE": 1.0, "AXP": 1.0,
    "NVDA": 1.51, "JPM": 1.0,
}


def _db() -> str:
    return os.environ.get("FINANCIALS_DB", os.path.join(REPO, "financials.db"))


def _norms(ticker: str) -> dict:
    """Industry norms exactly as the individual page builds them."""
    import api  # heavy import, only for the norms helper
    return api._industry_growth_norms(ticker)


def run() -> dict:
    conn = sqlite3.connect(f"file:{_db()}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    out: dict = {}
    for t, beta in FIXTURES.items():
        rows = conn.execute(
            '''SELECT f.*, t.name AS t_name, t.sector AS t_sector, t.industry AS t_industry
               FROM financials f LEFT JOIN tickers t ON t.ticker = f.Ticker
               WHERE UPPER(f.Ticker) = ? AND f."Calendar Year" GLOB '[0-9][0-9][0-9][0-9]'
               ORDER BY CAST(f."Calendar Year" AS INTEGER)''', (t,)).fetchall()
        mc, sh = rows[-1]["Market Cap"], rows[-1]["Weighted Average Shs Out Dil"]
        if not sh:
            sh = next((r["Weighted Average Shs Out Dil"] for r in reversed(rows)
                       if r["Weighted Average Shs Out Dil"]), None)
        price = (mc / sh) if (mc and sh) else None
        try:
            fc = ia.compute_forecast(rows, beta=beta, rf=RF, erp=ERP, price=price,
                                     industry_norms=_norms(t))
        except Exception as exc:  # noqa: BLE001
            fc = {"error": repr(exc)}
        out[t] = {"price": price, "forecast": fc}
    return out


def table(snap: dict) -> str:
    def p(v):
        return "-" if v is None else f"{v:+.1%}"

    lines = ["| Ticker | Growth used | Stable g | Stable ROIC | Margin now -> target | TV ($B) | Value/share | Price | Reverse-DCF implied g |",
             "|---|---|---|---|---|---|---|---|---|"]
    for t, rec in snap.items():
        fc = rec["forecast"] or {}
        if fc.get("applicable") is False or "error" in fc or "assumptions" not in fc:
            why = fc.get("notApplicableReason") or fc.get("reason") or fc.get("error")
            lines.append(f"| {t} | n/a: {str(why)[:60]} | | | | | | {rec['price'] or 0:.2f} | |")
            continue
        a = fc["assumptions"]
        sel = fc.get("valuationSelection") or {}
        rd = fc.get("reverseDcf") or {}
        tv = fc.get("terminalValue")
        lines.append(
            f"| {t} | {p(a['revenueGrowthInitial'])} | {p(a['revenueGrowthTerminal'])} | "
            f"{p(sel.get('roicStable'))} | {p(a['operatingMarginCurrent'])} -> {p(a['operatingMarginTarget'])} | "
            f"{(tv or 0) / 1e9:,.0f} | {fc['intrinsicPerShare']:.2f} | {rec['price']:.2f} | {p(rd.get('impliedGrowth'))} |")
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--save")
    ap.add_argument("--compare")
    args = ap.parse_args()
    snap = run()
    print(f"engine={ia.valuation_engine()}")
    print(table(snap))
    if args.save:
        with open(args.save, "w", encoding="utf-8") as fh:
            json.dump(snap, fh, sort_keys=True, default=str)
    if args.compare:
        with open(args.compare, encoding="utf-8") as fh:
            old = json.load(fh)
        new = json.loads(json.dumps(snap, sort_keys=True, default=str))
        diffs = [t for t in new if new[t] != old.get(t)]
        print("IDENTICAL" if not diffs else f"DIFFERENT: {diffs}")


if __name__ == "__main__":
    main()
