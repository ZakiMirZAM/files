"""
Validation harness for the beta / discount-rate accuracy upgrade (read-only).

Gates three proposed changes BEFORE any production code adopts them, so we never
ship a change that helps a few tickers and hurts the rest:

  ARM 1  Bottom-up (industry) beta vs the current single-firm regression beta.
         Uses the stored beta_history + financials D/E (no network). Reports
         noise, outliers, and the cost-of-equity change distribution across the
         whole universe.
  ARM 2  Total-return market index (^SP500TR) vs price-only (^GSPC). Recomputes
         betas for a sample via yfinance and reports the systematic difference.
  ARM 3  Country risk premium coverage: how many tickers would actually receive a
         non-zero CRP (the ADR / foreign subset), confirming US-domestic is
         untouched.

Run:  python data/validate_beta_methods.py            # arms 1 and 3 (fast)
      python data/validate_beta_methods.py --total-return --sample 80   # + arm 2
Use a real Python interpreter (not the Windows Store alias) so yfinance works.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sqlite3
import statistics as st
from collections import defaultdict

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
DB = os.path.join(ROOT, "financials.db")
HISTIMPL = os.path.join(ROOT, "backend", "data_cache", "damodaran_histimpl.xls")
ADR_MAP = os.path.join(ROOT, "adr_mapping.json")
OUT_DIR = os.path.join(ROOT, "tmp")
START, END = 2012, 2025
MIN_INDUSTRY_N = 5          # below this, fall back to the single-firm beta
PLAUSIBLE = (0.0, 3.0)      # a levered equity beta outside this is almost surely noise


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


# ── per-year Damodaran rf + implied ERP (from the cached histimpl.xls) ──────────
def load_rf_erp() -> dict[int, tuple[float, float]]:
    try:
        import pandas as pd
        df = pd.read_excel(HISTIMPL, header=None, engine="xlrd")
    except Exception as e:
        print(f"[warn] could not read histimpl ({e}); using flat rf=4.0% erp=4.5%")
        return {y: (0.04, 0.045) for y in range(START, END + 1)}
    hdr = next(i for i in range(15) if any(str(x).strip().lower().startswith("year") for x in df.iloc[i]))
    H = [str(x).strip().lower() for x in df.iloc[hdr].tolist()]
    yc, rc = H.index("year"), H.index("t.bond rate")
    ec = next(j for j, h in enumerate(H) if "implied erp" in h and "fcfe" in h and "risk adjusted" not in h)
    out = {}
    for i in range(hdr + 1, len(df)):
        y = _year(df.iloc[i, yc])
        rf, erp = _f(df.iloc[i, rc]), _f(df.iloc[i, ec])
        if y and rf is not None and erp is not None:
            out[y] = (rf, erp)
    return out


# ── load stored single-firm betas, industries, and per-year market D/E + tax ───
def load_data():
    c = sqlite3.connect(DB)
    cur = c.cursor()
    industry = dict(cur.execute("SELECT ticker, industry FROM tickers WHERE industry IS NOT NULL"))
    beta = defaultdict(dict)  # ticker -> {year: single-firm beta}
    for t, y, b in cur.execute(
        "SELECT ticker, year, beta FROM beta_history WHERE year BETWEEN ? AND ? AND beta IS NOT NULL",
        (START, END),
    ):
        beta[t][int(y)] = float(b)
    de = defaultdict(dict)   # ticker -> {year: market D/E}
    tax = defaultdict(dict)  # ticker -> {year: effective tax}
    rows = cur.execute(
        'SELECT "Ticker","Calendar Year","Total Debt","Market Cap","Income Before Tax","Income Tax Expense" '
        'FROM financials'
    )
    for tk, cy, td, mc, ibt, txe in rows:
        y = _year(cy)
        if not tk or y is None:
            continue
        debt, mcap = _f(td), _f(mc)
        if debt is not None and mcap is not None and mcap > 0 and debt >= 0:
            de[tk][y] = debt / mcap
        ibt_f, txe_f = _f(ibt), _f(txe)
        if ibt_f and ibt_f > 0 and txe_f is not None:
            tax[tk][y] = min(max(txe_f / ibt_f, 0.0), 0.5)
    c.close()
    return industry, beta, de, tax


def firm_tax(tax, t, y):
    return tax.get(t, {}).get(y, 0.21)


# ── ARM 1: bottom-up industry beta ─────────────────────────────────────────────
def arm1(industry, beta, de, tax, rf_erp):
    # members per (industry, year)
    members = defaultdict(list)
    for t, ys in beta.items():
        ind = industry.get(t)
        if not ind:
            continue
        for y, b in ys.items():
            members[(ind, y)].append(t)

    # industry unlevered business beta per (industry, year): unlever the AVERAGE
    # beta by the industry MEDIAN market D/E and median tax (Damodaran Ch 8).
    unlev = {}
    for (ind, y), ts in members.items():
        clean = [t for t in ts if PLAUSIBLE[0] <= beta[t][y] <= PLAUSIBLE[1]]
        if len(clean) < MIN_INDUSTRY_N:
            continue
        betas = [beta[t][y] for t in clean]
        des = [de[t][y] for t in clean if y in de.get(t, {})]
        taxes = [tax[t][y] for t in clean if y in tax.get(t, {})]
        if not des:
            continue
        avg_b = st.fmean(betas)
        med_de = st.median(des)
        med_tax = st.median(taxes) if taxes else 0.21
        unlev[(ind, y)] = avg_b / (1.0 + (1.0 - med_tax) * med_de)

    # per ticker-year: bottom-up levered beta (relever at the firm's own D/E),
    # else fall back to the single-firm beta.
    bu = defaultdict(dict)
    n_bu = n_fallback = 0
    for t, ys in beta.items():
        ind = industry.get(t)
        for y, b in ys.items():
            u = unlev.get((ind, y))
            d = de.get(t, {}).get(y)
            if u is not None and d is not None:
                bu[t][y] = u * (1.0 + (1.0 - firm_tax(tax, t, y)) * d)
                n_bu += 1
            else:
                bu[t][y] = b  # fallback
                n_fallback += 1

    # metric: outliers
    single_all = [b for ys in beta.values() for b in ys.values()]
    bu_all = [b for ys in bu.values() for b in ys.values()]

    def pct_outlier(xs):
        return 100 * sum(1 for b in xs if b < PLAUSIBLE[0] or b > PLAUSIBLE[1]) / len(xs)

    # metric: year-over-year noise per ticker (>=6 yrs)
    def yoy(d):
        ys = sorted(d)
        ch = [abs(d[ys[i]] - d[ys[i - 1]]) for i in range(1, len(ys))]
        return st.fmean(ch) if ch else None

    noise_single, noise_bu, less_noisy = [], [], 0
    for t, ys in beta.items():
        if len(ys) < 6:
            continue
        o = yoy(ys)
        bb = yoy(bu[t])
        if o is not None and bb is not None:
            noise_single.append(o)
            noise_bu.append(bb)
            if bb < o:
                less_noisy += 1

    # metric: cost-of-equity change (no CRP here)
    coe_old, coe_new, dcoe, big = [], [], [], 0
    for t, ys in beta.items():
        ind = industry.get(t)
        for y, b in ys.items():
            rf, erp = rf_erp.get(y, (0.04, 0.045))
            old = rf + b * erp
            new = rf + bu[t][y] * erp
            coe_old.append(old)
            coe_new.append(new)
            dcoe.append(abs(new - old))
            if abs(new - old) > 0.01:
                big += 1

    return {
        "n_ticker_years": len(single_all),
        "n_bottom_up": n_bu,
        "n_fallback": n_fallback,
        "outlier_single_%": round(pct_outlier(single_all), 2),
        "outlier_bottomup_%": round(pct_outlier(bu_all), 2),
        "noise_single_median": round(st.median(noise_single), 3),
        "noise_bottomup_median": round(st.median(noise_bu), 3),
        "less_noisy_%": round(100 * less_noisy / len(noise_single), 1),
        "tickers_compared": len(noise_single),
        "coe_median_old_%": round(100 * st.median(coe_old), 2),
        "coe_median_new_%": round(100 * st.median(coe_new), 2),
        "coe_median_abs_change_%": round(100 * st.median(dcoe), 2),
        "coe_change_gt_1pp_%": round(100 * big / len(dcoe), 1),
    }, bu


# ── ARM 2: total-return vs price-only market index (yfinance sample) ────────────
def arm2(industry, beta, sample_n):
    import numpy as np
    import pandas as pd
    import yfinance as yf

    def monthly(tkr):
        try:
            d = yf.download(tkr, period="max", interval="1mo", progress=False, auto_adjust=True)
        except Exception:
            return None
        if d is None or len(d) == 0 or "Close" not in d:
            return None
        cl = d["Close"]
        if hasattr(cl, "columns"):
            cl = cl.iloc[:, 0]
        r = cl.pct_change().dropna()
        return r if len(r) >= 36 else None

    gspc = monthly("^GSPC")
    sptr = monthly("^SP500TR")
    if gspc is None or sptr is None:
        return {"error": f"market series unavailable (^GSPC={gspc is not None}, ^SP500TR={sptr is not None})"}

    def beta_vs(stock, mkt):
        df = pd.concat([stock, mkt], axis=1, join="inner").dropna().tail(60)
        if len(df) < 36:
            return None
        s = df.iloc[:, 0].to_numpy(float)
        m = df.iloc[:, 1].to_numpy(float)
        v = float(np.var(m, ddof=1))
        return float(np.cov(s, m, ddof=1)[0, 1] / v) if v else None

    # stratified-ish sample: tickers that have stored betas, spread across industries
    cands = [t for t in beta if industry.get(t)]
    cands.sort()
    step = max(1, len(cands) // sample_n)
    sample = cands[::step][:sample_n]
    diffs = []
    got = 0
    for t in sample:
        r = monthly(t)
        if r is None:
            continue
        bp = beta_vs(r, gspc)
        bt = beta_vs(r, sptr)
        if bp is not None and bt is not None:
            diffs.append(bt - bp)
            got += 1
    if not diffs:
        return {"error": "no betas computed"}
    return {
        "sample_requested": len(sample),
        "sample_computed": got,
        "median_delta_beta(TR-price)": round(st.median(diffs), 4),
        "mean_delta_beta": round(st.fmean(diffs), 4),
        "p95_abs_delta": round(sorted(abs(d) for d in diffs)[int(0.95 * len(diffs)) - 1], 4),
        "max_abs_delta": round(max(abs(d) for d in diffs), 4),
    }


# ── ARM 3: country-risk-premium coverage ───────────────────────────────────────
SUFFIX_COUNTRY = {
    ".TW": "Taiwan", ".KS": "South Korea", ".KQ": "South Korea", ".T": "Japan",
    ".HK": "Hong Kong", ".JK": "Indonesia", ".SS": "China", ".SZ": "China",
    ".L": "United Kingdom", ".PA": "France", ".DE": "Germany", ".F": "Germany",
    ".HM": "Germany", ".BK": "Thailand", ".IS": "Turkey", ".SA": "Brazil",
    ".MX": "Mexico", ".TO": "Canada", ".AX": "Australia", ".MI": "Italy",
    ".AS": "Netherlands", ".SW": "Switzerland", ".MC": "Spain",
}
EXCHANGE_COUNTRY = {"SHZ": "China", "SHA": "China", "HKG": "Hong Kong", "KSC": "South Korea"}
# Illustrative Damodaran melded country risk premiums (decimals), pending the live
# ctryprem fetch in production. Mature markets carry CRP 0.
ILLUSTRATIVE_CRP = {
    "Taiwan": 0.0073, "South Korea": 0.0087, "Japan": 0.0087, "Hong Kong": 0.0073,
    "Indonesia": 0.0233, "China": 0.0087, "United Kingdom": 0.0, "France": 0.0073,
    "Germany": 0.0, "Thailand": 0.0204, "Turkey": 0.0671, "Brazil": 0.0399,
    "Mexico": 0.0204, "Canada": 0.0, "Australia": 0.0, "Italy": 0.0204,
    "Netherlands": 0.0, "Switzerland": 0.0, "Spain": 0.0146,
}


def arm3(industry):
    c = sqlite3.connect(DB)
    cur = c.cursor()
    universe = {t for (t,) in cur.execute("SELECT ticker FROM tickers")}
    country = {}
    for t, ctry, exch in cur.execute("SELECT ticker, country, exchange FROM tickers"):
        if ctry:
            country[t] = ctry
        elif exch in EXCHANGE_COUNTRY:
            country[t] = EXCHANGE_COUNTRY[exch]
    c.close()
    # ADR map: foreign suffix -> home country, tag the US ADR ticker if in our universe
    adr_tagged = {}
    try:
        m = json.load(open(ADR_MAP)).get("matches", {})
        for foreign, info in m.items():
            us = info.get("us")
            if not us or us not in universe:
                continue
            for suf, ctry in SUFFIX_COUNTRY.items():
                if foreign.upper().endswith(suf):
                    adr_tagged[us] = ctry
                    break
    except Exception as e:
        print(f"[warn] adr_mapping read failed: {e}")
    tagged = dict(country)
    tagged.update(adr_tagged)
    nonzero = {t: ILLUSTRATIVE_CRP.get(ctry, 0.0) for t, ctry in tagged.items()}
    nonzero = {t: v for t, v in nonzero.items() if v > 0}
    by_country = defaultdict(int)
    for t, ctry in tagged.items():
        if ILLUSTRATIVE_CRP.get(ctry, 0.0) > 0:
            by_country[ctry] += 1
    return {
        "universe": len(universe),
        "tagged_with_country": len(tagged),
        "from_country_col_or_exchange": len(country),
        "from_adr_map": len(adr_tagged),
        "receive_nonzero_crp": len(nonzero),
        "by_country": dict(sorted(by_country.items(), key=lambda kv: -kv[1])),
        "sample": dict(list(nonzero.items())[:12]),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--total-return", action="store_true", help="run the yfinance ARM 2 (slow)")
    ap.add_argument("--sample", type=int, default=80)
    args = ap.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    industry, beta, de, tax = load_data()
    rf_erp = load_rf_erp()

    print("=" * 72)
    print("ARM 1  Bottom-up (industry) beta vs single-firm regression beta")
    print("=" * 72)
    a1, bu = arm1(industry, beta, de, tax, rf_erp)
    for k, v in a1.items():
        print(f"  {k:28} {v}")

    print()
    print("=" * 72)
    print("ARM 3  Country-risk-premium coverage")
    print("=" * 72)
    a3 = arm3(industry)
    for k, v in a3.items():
        print(f"  {k:28} {v}")

    a2 = None
    if args.total_return:
        print()
        print("=" * 72)
        print(f"ARM 2  Total-return (^SP500TR) vs price-only (^GSPC), sample={args.sample}")
        print("=" * 72)
        a2 = arm2(industry, beta, args.sample)
        for k, v in a2.items():
            print(f"  {k:28} {v}")

    # write per-ticker-year CoE-change CSV for review
    csv_path = os.path.join(OUT_DIR, "beta_validation_coe_change.csv")
    with open(csv_path, "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["ticker", "industry", "year", "beta_single", "beta_bottomup", "rf", "erp",
                    "coe_single", "coe_bottomup", "coe_delta"])
        for t, ys in beta.items():
            for y, b in sorted(ys.items()):
                rf, erp = rf_erp.get(y, (0.04, 0.045))
                bb = bu[t][y]
                w.writerow([t, industry.get(t, ""), y, round(b, 4), round(bb, 4), rf, erp,
                            round(rf + b * erp, 4), round(rf + bb * erp, 4), round((bb - b) * erp, 4)])
    print(f"\n[csv] per-ticker-year detail -> {csv_path}")

    # ── gate verdicts ──
    print("\n" + "=" * 72)
    print("GATES")
    print("=" * 72)
    g1 = (a1["less_noisy_%"] >= 70 and a1["outlier_bottomup_%"] < a1["outlier_single_%"]
          and a1["coe_median_abs_change_%"] <= 1.5)
    print(f"  ARM1 bottom-up beta : {'PASS' if g1 else 'REVIEW'} "
          f"(less-noisy {a1['less_noisy_%']}%, outliers {a1['outlier_single_%']}->{a1['outlier_bottomup_%']}%, "
          f"median |dCoE| {a1['coe_median_abs_change_%']}pp)")
    if a2 and "error" not in a2:
        g2 = a2["p95_abs_delta"] <= 0.10
        print(f"  ARM2 total-return   : {'PASS' if g2 else 'REVIEW'} "
              f"(median dBeta {a2['median_delta_beta(TR-price)']}, p95 |dBeta| {a2['p95_abs_delta']})")
    elif a2:
        print(f"  ARM2 total-return   : SKIP ({a2['error']})")
    g3 = a3["receive_nonzero_crp"] > 0
    print(f"  ARM3 CRP coverage   : {'APPLIES' if g3 else 'NONE'} "
          f"({a3['receive_nonzero_crp']} tickers get CRP; US-domestic untouched)")


if __name__ == "__main__":
    main()
