"""Historical stress test of the DCF engine (DCF accuracy plan, section 0.1).

For each company and as-of fiscal year Y: cut the history at Y, value the firm
with the engine of the backend at --repo (as-of risk-free rate, ERP and
breakeven inflation; beta fixed at 1.0 to isolate the structure), optionally
re-value at a shocked --rf, then compare with what happened over Y+1..Y+5.
READ-ONLY. Run once per engine and diff the KPI blocks:

    FINANCIALS_DB=<db> MARKET_DATA_DB=<mdb> python remediation/backtest/dcf_backtest.py \
        --repo C:/.../files      --out before.json      # old engine (main)
    ... --repo C:/.../files-dcf  --out after.json       # new engine

Caveats printed with the KPIs: a survivor sample (today's large caps), price
returns without dividends, and five years cannot prove a perpetuity.
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import statistics as st
import sys

UNIVERSE = {
    "tech": ["AAPL", "MSFT", "ADBE", "NVDA", "ORCL", "INTC", "CSCO", "IBM", "QCOM", "TXN", "CRM", "INTU"],
    "staples": ["KO", "PEP", "PG", "COST", "WMT", "MO", "PM", "CL", "KMB", "GIS"],
    "discretionary": ["MCD", "SBUX", "NKE", "HD", "LOW", "AMZN", "F", "GM", "TSLA", "BKNG", "AZO", "ORLY"],
    "health": ["JNJ", "PFE", "MRK", "ABBV", "UNH", "AMGN", "LLY", "BMY", "MDT", "ABT"],
    "industrial": ["CAT", "GE", "HON", "UNP", "MMM", "DE", "BA", "LMT", "UPS", "ITW"],
    "energy_materials": ["XOM", "CVX", "COP", "NEM", "FCX", "DOW", "LIN", "APD"],
    "utilities_telecom": ["NEE", "DUK", "SO", "T", "VZ"],
    "media_internet": ["META", "NFLX", "DIS", "CMCSA", "GOOG"],
    "payments_data": ["V", "MA", "SPGI", "MCO", "MSCI", "ICE", "CME", "AXP", "PYPL"],
}
ASOF = (2015, 2018, 2020)
HORIZON = 5


def _yearly(mcon, sid):
    out: dict[int, list[float]] = {}
    for d, v in mcon.execute("SELECT date, value FROM macro_series WHERE series_id=? ORDER BY date", (sid,)):
        if v is not None:
            out.setdefault(int(d[:4]), []).append(float(v))
    return out


def _rv(r, c):
    try:
        v = r[c]
    except (IndexError, KeyError):
        return None
    try:
        return None if v is None else float(v)
    except (TypeError, ValueError):
        return None


def _norms(con, industry, y, cache):
    """As-of-year industry anchors in the shape _industry_growth_norms returns."""
    key = (industry, y)
    if key in cache:
        return cache[key]
    q = con.execute('''SELECT f."Operating Income" op, f."Total Stockholders Equity" eq, f."Total Debt" td,
            COALESCE(f."Cash And Short Term Investments", f."Cash And Cash Equivalents") cash,
            f."Cash And Cash Equivalents" cce, f."Revenue" rev, f."Revenue Growth" rg, x.usd_per_unit fx
        FROM financials f JOIN tickers t ON t.ticker=f.Ticker
        LEFT JOIN fx_rates x ON x.currency=f."Reported Currency"
        WHERE t.industry=? AND CAST(f."Calendar Year" AS INTEGER)=? AND f."Revenue">0 AND f."Market Cap">0''',
                    (industry, y)).fetchall()
    roics, margins, growths, s2c = [], [], [], []
    nop = cap = 0.0
    for r in q:
        op, eq, td, rev = r["op"], r["eq"], r["td"] or 0.0, r["rev"]
        if op is not None and rev:
            margins.append(op / rev)
        if r["rg"] is not None and -0.9 < r["rg"] < 3:
            growths.append(r["rg"])
        if eq is not None and rev and (eq + td - (r["cce"] or 0.0)) > 0:
            s = rev / (eq + td - (r["cce"] or 0.0))
            if 0.2 <= s <= 20:
                s2c.append(s)
        if op is None or eq is None:
            continue
        if op > 0 and eq + td > 0 and 0 < op * 0.79 / (eq + td) <= 0.6:
            roics.append(op * 0.79 / (eq + td))
        c = eq + td - (r["cash"] or 0.0)
        if c > 0 and r["fx"]:
            nop += op * 0.79 * r["fx"]
            cap += c * r["fx"]

    def med(x):
        return st.median(x) if len(x) >= 3 else None

    out = {k: v for k, v in {
        "roic": med(roics), "operatingMargin": med([m for m in margins if 0 < m < 1]),
        "revenueGrowth": med(growths), "salesToInvestedCapital": med(s2c),
        "roicAggregate": round(nop / cap, 4) if cap > 0 else None}.items() if v is not None}
    cache[key] = out
    return out


def _roic(r):
    op, eq, td = _rv(r, "Operating Income"), _rv(r, "Total Stockholders Equity"), _rv(r, "Total Debt") or 0.0
    cash = _rv(r, "Cash And Short Term Investments") or _rv(r, "Cash And Cash Equivalents") or 0.0
    if op is None or eq is None:
        return None
    c = eq + td - cash
    if c <= 0:
        c = eq + td
    return op * 0.79 / c if c > 0 else None


def run(repo, rf_shock=None):
    sys.path.insert(0, os.path.join(repo, "backend"))
    sys.dont_write_bytecode = True
    import individualanalysis as ia
    con = sqlite3.connect(f"file:{os.environ['FINANCIALS_DB']}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    mcon = sqlite3.connect(f"file:{os.environ['MARKET_DATA_DB']}?mode=ro", uri=True)
    dgs10, erp_s, infl = _yearly(mcon, "DGS10"), _yearly(mcon, "ERP_IMPLIED"), _yearly(mcon, "T10YIE")
    cache: dict = {}
    out = []
    for grp, tickers in UNIVERSE.items():
        for t in tickers:
            allrows = con.execute('''SELECT f.*, t.name AS t_name, t.sector AS t_sector, t.industry AS t_industry
                FROM financials f LEFT JOIN tickers t ON t.ticker=f.Ticker
                WHERE UPPER(f.Ticker)=? AND f."Calendar Year" GLOB '[0-9][0-9][0-9][0-9]'
                ORDER BY CAST(f."Calendar Year" AS INTEGER)''', (t,)).fetchall()
            by = {int(r["Calendar Year"]): r for r in allrows}
            for y in ASOF:
                if y not in by or (y + HORIZON) not in by:
                    continue
                rows = [r for r in allrows if int(r["Calendar Year"]) <= y]
                if len(rows) < 4:
                    continue
                last, end = rows[-1], by[y + HORIZON]
                sh0, sh5 = _rv(last, "Weighted Average Shs Out Dil"), _rv(end, "Weighted Average Shs Out Dil")
                mc0, mc5 = _rv(last, "Market Cap"), _rv(end, "Market Cap")
                if not (sh0 and sh5 and mc0 and mc5):
                    continue
                price0 = mc0 / sh0
                if rf_shock is not None:
                    rf = rf_shock
                elif dgs10.get(y):
                    rf = sum(dgs10[y][-20:]) / len(dgs10[y][-20:]) / 100
                else:
                    rf = 0.03
                erp = 0.05
                if erp_s.get(y):
                    erp = erp_s[y][-1] / 100 if erp_s[y][-1] > 1 else erp_s[y][-1]
                norms = dict(_norms(con, last["t_industry"], y, cache))
                if infl.get(y):
                    norms["expectedInflation"] = infl[y][-1] / 100
                rec = {"t": t, "grp": grp, "y": y, "price0": price0, "ret5": (mc5 / sh5) / price0 - 1}
                r0, r5 = _rv(last, "Revenue"), _rv(end, "Revenue")
                rec["real_g5"] = (r5 / r0) ** (1 / HORIZON) - 1 if (r0 and r5 and r0 > 0 and r5 > 0) else None
                fm = [m for m in (ia._safe_div(_rv(by[z], "Operating Income"), _rv(by[z], "Revenue"))
                                  for z in range(y + 1, y + HORIZON + 1) if z in by) if m is not None]
                rec["real_margin"] = st.median(fm) if fm else None
                rec["roic5"] = _roic(end)
                try:
                    fc = ia.compute_forecast(rows, beta=1.0, rf=rf, erp=erp, price=price0, industry_norms=norms)
                except Exception as exc:  # noqa: BLE001
                    fc = {"applicable": False, "reason": repr(exc)[:120]}
                if not fc or fc.get("applicable") is False:
                    rec["ok"] = False
                    rec["reason"] = ((fc or {}).get("reason") or (fc or {}).get("notApplicableReason") or "")[:80]
                    out.append(rec)
                    continue
                a = fc["assumptions"]
                sel = fc.get("valuationSelection") or {}
                last_row = (fc.get("rows") or [{}])[-1]
                # Margin target on the REPORTED basis, so it compares with the
                # realized (reported) margin even when R&D was capitalized.
                shift = (fc.get("growthReconciliation") or {}).get("rndMarginShift") or 0.0
                rec.update(ok=True, g=a["revenueGrowthInitial"], gs=a["revenueGrowthTerminal"],
                           mtgt=a["operatingMarginTarget"] - shift, value=fc["intrinsicPerShare"],
                           tv=fc["terminalValue"], roic_st=sel.get("roicStable"),
                           rr_last=last_row.get("reinvestmentRate"), wacc=a["wacc"],
                           pvx=fc.get("pvExplicit"), pvtv=fc.get("pvTerminal"),
                           implied=(fc.get("reverseDcf") or {}).get("impliedGrowth"))
                out.append(rec)
    return out


def _spearman(xs, ys):
    p = [(a, b) for a, b in zip(xs, ys) if a is not None and b is not None]
    if len(p) < 8:
        return float("nan")

    def rank(v):
        o = sorted(range(len(v)), key=lambda i: v[i])
        r = [0] * len(v)
        for k, i in enumerate(o):
            r[i] = k
        return r

    ra, rb = rank([a for a, _ in p]), rank([b for _, b in p])
    ma, mb = st.mean(ra), st.mean(rb)
    cov = sum((a - ma) * (b - mb) for a, b in zip(ra, rb))
    return cov / (sum((a - ma) ** 2 for a in ra) * sum((b - mb) ** 2 for b in rb)) ** 0.5


def kpis(res):
    ok = [r for r in res if r.get("ok")]
    k = {"observations": len(res), "valued": len(ok),
         "notValued": sorted({r["t"] for r in res if not r.get("ok")})}
    k["negativeTerminalValue"] = sum(1 for r in ok if r["tv"] is not None and r["tv"] < 0)
    k["finalReinvestmentAtLeast90pct"] = sum(1 for r in ok if r["rr_last"] is not None and r["rr_last"] >= 0.9)
    k["stableReturnBelowWacc"] = sum(1 for r in ok if r["roic_st"] and r["roic_st"] < r["wacc"] - 1e-9)
    g = [(r["g"], r["real_g5"]) for r in ok if r["real_g5"] is not None and abs(r["g"]) < 2]
    k["growthMedianAbsError"] = st.median(abs(a - b) for a, b in g)
    k["growthMedianBias"] = st.median(a - b for a, b in g)
    k["growthRankCorr"] = _spearman([a for a, _ in g], [b for _, b in g])
    m = [(r["mtgt"], r["real_margin"]) for r in ok if r["mtgt"] is not None and r["real_margin"] is not None]
    k["marginMedianAbsError"] = st.median(abs(a - b) for a, b in m)
    k["marginMedianBias"] = st.median(a - b for a, b in m)
    s = [(r["roic_st"], r["roic5"]) for r in ok if r["roic_st"] and r["roic5"] is not None and abs(r["roic5"]) < 2]
    k["stableReturnBiasVsRoic5"] = st.median(a - b for a, b in s) if s else None
    vp = [r["value"] / r["price0"] for r in ok]
    k["valueToPriceMedian"] = st.median(vp)
    k["valueBelowHalfPrice"] = sum(v < 0.5 for v in vp) / len(vp)
    k["valueWithin0.67to1.5"] = sum(0.67 <= v <= 1.5 for v in vp) / len(vp)
    k["rankCorrValueToPriceVsReturn"] = _spearman(vp, [r["ret5"] for r in ok])
    srt = sorted(ok, key=lambda r: r["value"] / r["price0"])
    n3 = len(srt) // 3
    k["topMinusBottomThird5yReturn"] = (st.median(r["ret5"] for r in srt[-n3:])
                                        - st.median(r["ret5"] for r in srt[:n3]))
    tvs = [r["pvtv"] / (r["pvtv"] + r["pvx"]) for r in ok
           if r.get("pvtv") is not None and r.get("pvx") is not None and (r["pvtv"] + r["pvx"]) > 0]
    k["terminalShareMedian"] = st.median(tvs) if tvs else None
    k["caveats"] = "survivor large caps; price returns only; beta 1.0; 5 years cannot prove a perpetuity"
    return {kk: (round(v, 4) if isinstance(v, float) else v) for kk, v in k.items()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--out")
    ap.add_argument("--rf", type=float, help="value every year at this risk-free rate (rate shock)")
    args = ap.parse_args()
    res = run(args.repo, args.rf)
    print(json.dumps(kpis(res), indent=1))
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            json.dump({"kpis": kpis(res), "results": res}, fh, default=str)


if __name__ == "__main__":
    main()
