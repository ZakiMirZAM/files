"""End-to-end verification of the live backend across every analysis stage.

Hits each route the frontend calls and asserts on real CONTENT (non-empty
series, non-null figures, correct company identity), not just HTTP 200.

Usage:
    python remediation/verify_stages.py [base_url]
"""

import json
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
TIMEOUT = 180

results: list[tuple[str, str, str]] = []   # (status, stage, detail)


def get(path: str) -> dict | list | None:
    url = f"{BASE}{path}"
    try:
        with urllib.request.urlopen(url, timeout=TIMEOUT) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}") from e


def post(path: str, body: dict) -> dict | list | None:
    req = urllib.request.Request(
        f"{BASE}{path}", data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.load(r)


def check(stage: str, detail: str, cond: bool) -> None:
    results.append(("PASS" if cond else "FAIL", stage, detail))
    print(f"  [{'PASS' if cond else 'FAIL'}] {stage:22s} {detail}")


def nonnull_metrics(payload: dict) -> int:
    """Count metrics carrying at least one real value (latestValue or trend)."""
    n = 0
    for m in payload.get("metrics") or []:
        if m.get("latestValue") is not None or (m.get("trend") or []):
            n += 1
    return n


print(f"Verifying {BASE}\n")

# ── Stage 0: health ──────────────────────────────────────────────────────────
h = get("/api/health")
check("health", f"ok={h.get('ok')} years {h.get('min_year')}-{h.get('max_year')}",
      bool(h.get("ok")) and h.get("db_exists") is True)

# ── Stage 1: Economic ────────────────────────────────────────────────────────
eco = get("/api/economic")
eco_metrics = eco.get("metrics") or []
with_series = [m for m in eco_metrics if (m.get("trend") or [])]
check("Economic", f"{len(eco_metrics)} metrics, {len(with_series)} with series",
      len(eco_metrics) >= 20 and len(with_series) >= 15)
check("Economic", f"recessionBands={len(eco.get('recessionBands') or [])}",
      len(eco.get("recessionBands") or []) > 0)

# ── Stage 2: Sector ──────────────────────────────────────────────────────────
sectors = get("/api/sectors")
slist = sectors.get("sectors") if isinstance(sectors, dict) else sectors
names = [s if isinstance(s, str) else s.get("name") or s.get("sector")
         for s in (slist or [])]
check("Sector list", f"{len(names)} sectors: {names[:4]}", len(names) >= 8)

sec = "Technology"
sd = get(f"/api/sector/{urllib.parse.quote(sec)}")
check("Sector detail", f"{sec}: {nonnull_metrics(sd)} metrics with data",
      nonnull_metrics(sd) >= 5)

sm = get("/api/sector-metrics")
sm_rows = sm.get("metrics") or []
sm_data = sm.get("data") or {}
check("Sector matrix", f"{len(sm_rows)} metric rows x {len(sm_data)} sectors",
      len(sm_rows) >= 20 and len(sm_data) >= 8)
vs = [m for m in sm_rows if m.get("key") == "valueScore"]
check("Sector matrix", "valueScore row present", len(vs) == 1)
sm_int = {g: v.get("_integrity") for g, v in sm_data.items() if v.get("_integrity")}
sm_hist = {g: v.get("_history") for g, v in sm_data.items() if v.get("_history")}
check("Sector matrix", f"integrity: {len(sm_int)} sectors x "
      f"{len(next(iter(sm_int.values()), []))} checks", len(sm_int) >= 8)
check("Sector matrix", f"history: {len(sm_hist)} sectors x "
      f"{len(next(iter(sm_hist.values()), {}))} series", len(sm_hist) >= 8)

im = get(f"/api/sector/{urllib.parse.quote(sec)}/industry-metrics")
im_data = im.get("data") or {}
check("Sector>Industry", f"{sec}: {len(im_data)} industries in matrix",
      len(im_data) >= 3)

etf = get(f"/api/sector-etf/{urllib.parse.quote(sec)}")
etf_pts = etf.get("history") or []
check("Sector ETF", f"{etf.get('ticker')} {len(etf_pts)} points, latest={etf.get('latest')}",
      len(etf_pts) > 100)

# ── Stage 3: Industry ────────────────────────────────────────────────────────
inds = get("/api/industries")
ilist = inds.get("industries") if isinstance(inds, dict) else inds
inames = [i if isinstance(i, str) else i.get("name") or i.get("industry")
          for i in (ilist or [])]
check("Industry list", f"{len(inames)} industries", len(inames) >= 50)

ind = "Semiconductors"
idet = get(f"/api/industry/{urllib.parse.quote(ind)}")
check("Industry detail", f"{ind}: {nonnull_metrics(idet)} metrics with data",
      nonnull_metrics(idet) >= 5)
check("Industry detail", f"lifecycle={(idet.get('lifecycle') or {}).get('stage')}",
      bool(idet.get("lifecycle")))

sc = get(f"/api/industry/{urllib.parse.quote(ind)}/scorecard")
sc_rows = sc.get("metrics") or []
check("Industry scorecard", f"{len(sc_rows)} metrics", len(sc_rows) >= 20)
sc_col = (sc.get("data") or {}).get(ind) or {}
sc_hist = sc_col.get("_history") or {}
sc_int = sc_col.get("_integrity") or []
check("Industry scorecard", f"{len(sc_hist)} metrics carry 5y history", len(sc_hist) >= 10)
check("Industry scorecard", f"{len(sc_int)} integrity questions", len(sc_int) == 16)
check("Industry scorecard", f"valueScore={sc_col.get('valueScore')}",
      sc_col.get("valueScore") is not None)

sg = get(f"/api/industry/{urllib.parse.quote(ind)}/strategic-groups")
check("Strategic groups", f"{ind}: payload present", bool(sg))

# ── Stage 4: Comparative ─────────────────────────────────────────────────────
comp = get(f"/api/comparative/{urllib.parse.quote(ind)}")
cmetrics = comp.get("metrics") or []
cseries = [m for m in cmetrics if (m.get("trend") or [])]
check("Comparative", f"{ind}: {len(cmetrics)} metrics, {len(cseries)} with trend",
      len(cseries) >= 3)

rank = get(f"/api/comparative/{urllib.parse.quote(ind)}/ranking?limit=10")
rdata = rank.get("data") or {}
scored = {t: v for t, v in rdata.items() if v.get("score") is not None}
check("Comparative rank", f"{len(rdata)} companies, {len(scored)} scored",
      len(scored) >= 20)
best = sorted(scored.items(), key=lambda kv: -(kv[1].get("score") or 0))[:3]
check("Comparative rank", f"top3={[(t, round(v['score'],1)) for t, v in best]}",
      bool(best))

cm = get(f"/api/comparative/{urllib.parse.quote(ind)}/company-metrics?limit=6")
cm_data = cm.get("data") or {}
check("Comparative panel", f"{len(cm_data)} companies side by side",
      len(cm_data) >= 3)

# ── Stage 5: Individual (incl. the repaired tickers) ─────────────────────────
INDIV = [
    ("GS",    "Goldman", 2012),   # was EMPTY pre-remediation
    ("MS",    "Morgan",  2012),   # re-keyed from MS-PO
    ("BAC",   "Bank of America", 2012),
    ("ABBV",  "AbbVie",  None),   # sentinel-CIK bug victim
    ("AAPL",  "Apple",   2012),
    ("BRK-A", "Berkshire", 2012),
]
for tk, expect_name, expect_first_year in INDIV:
    d = get(f"/api/individual/{tk}")
    a = d.get("analysis") or {}
    years = a.get("years") or []
    name_ok = expect_name.lower() in (d.get("title") or "").lower()
    err = d.get("analysis_error")
    yr_ok = (not expect_first_year) or (years and years[0] == expect_first_year)
    check("Individual", f"{tk}: {d.get('title','?')[:34]} years={len(years)} err={err}",
          name_ok and err is None and len(years) >= 5 and yr_ok)

# alias resolution
al = get("/api/individual/GS-PA")
check("Individual alias", f"GS-PA -> {al.get('title','?')[:30]}",
      "goldman" in (al.get("title") or "").lower())

# valuation blocks actually computed on a repaired ticker
gs = get("/api/individual/GS")
ga = gs.get("analysis") or {}
blocks = [k for k in ("dcf", "verdict", "waccBuild", "creditAnalysis", "eva",
                      "ratios", "forecast")
          if ga.get(k) not in (None, {}, [])]
check("Individual blocks", f"GS computed: {blocks}", len(blocks) >= 4)

q = get("/api/quote/AAPL")
check("Quote", f"AAPL price={q.get('price') or q.get('regularMarketPrice')}",
      bool(q))

b = get("/api/beta/AAPL")
check("Beta engine", f"AAPL beta={b.get('value')} method={b.get('method')} "
      f"conf={b.get('confidence')}", b.get("value") is not None)

# ── Stage 6: Credit ──────────────────────────────────────────────────────────
cb = get("/api/credit-banks")
cbm = cb.get("metrics") or []
cbs = [m for m in cbm if (m.get("trend") or [])]
check("Credit", f"{len(cbm)} metrics, {len(cbs)} with trend", len(cbs) >= 10)

# ── Stage 7: Simulator ───────────────────────────────────────────────────────
fx = get("/api/fx-rates")
fxd = fx.get("rates") or fx
check("Simulator FX", f"{len(fxd)} currencies", len(fxd) >= 20)

qs = get("/api/quotes?tickers=AAPL,MSFT,GS")
check("Simulator quotes", f"batch returned {len(qs)} quotes "
      f"{[(q.get('ticker'), q.get('price')) for q in qs][:3]}", len(qs) >= 2)

# ── Search (every stage's entry point) ───────────────────────────────────────
for q_, want in [("GS", "GS"), ("BRK.B", "BRK-A"), ("Goldman", "GS")]:
    r = get(f"/api/tickers/search?q={urllib.parse.quote(q_)}&limit=5")
    tickers = [x["ticker"] for x in r]
    check("Search", f"'{q_}' -> {tickers[:3]}", want in tickers)

# ── Summary ──────────────────────────────────────────────────────────────────
fails = [r for r in results if r[0] == "FAIL"]
print(f"\n{'=' * 60}")
print(f"  {len(results) - len(fails)}/{len(results)} checks passed")
if fails:
    print("  FAILURES:")
    for _, stage, detail in fails:
        print(f"    - {stage}: {detail}")
print(f"{'=' * 60}")
sys.exit(1 if fails else 0)
