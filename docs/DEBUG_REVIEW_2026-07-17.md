# IntrinsicFinEd — Multi-Agent Debug Review

**Date:** 2026-07-17
**Scope:** Full read-only review, 9 subsystems, 13 reviewer agents (Opus 4.8, max effort), every non-LOW finding faced a 3-lens adversarial panel (correctness / domain / reachability), survival on 2-of-3.
**Result:** 30 confirmed, 27 killed by the panel, 19 low-severity. Nothing was modified — definitions, databases, equations, and git state are all untouched.

> **Equation freeze held.** No valuation formula is wrong in its algebra. Every "wrong number" finding below is a *data-input* or *sign-convention* defect feeding a correct formula. Fixing them changes outputs for affected tickers because corrected inputs flow in — the DCF/WACC/EPV math itself does not change.

---

## Items that need YOUR decision before any fix

1. **Rotate two live keys — only you can do this.**
   - `data/notegenerator.py:19` — a **live Moonshot/Kimi API key** (`sk-NYQD…`), git-tracked, in HEAD and in the initial commit `8d3e875`. Billable. DEPLOY.md flagged it for rotation; it is still present. Rotate at platform.moonshot.ai. The code fix (env var) does not help until the key is revoked, because it stays in git history.
   - `data/economicmetrics.py:12` — a hardcoded **FRED key** (read-only public data, no billing), contradicting CLAUDE.md's claim that the hardcoded fallback was removed. Lower stakes, still rotate.
   - Both files are also **dead code** (imported by nobody). Rotating then removing them is cleanest, but the key must be revoked regardless — deletion alone leaves it in history.

2. **`rag/server.py` is a protected file.** The /ask-500 root cause and the no-except handler both live there. The fixes are one-liners (below) but I will not touch server.py without your explicit OK.

3. **Number-moving fixes.** Per the policy you chose (fix + before/after diff), I will snapshot valuation outputs for a spread of tickers before editing and trace every changed number to the fix that moved it. The fixes that WILL move displayed numbers are tagged **[moves numbers]** below.

---

## CRITICAL

### C1 — Stale S&P 500 index level biases every DCF  **[moves numbers]**
`backend/marketdata/market_inputs.py:201`
`market_inputs` takes the index level from `ShillerData.latest_complete` (newest month with BOTH price and earnings). Because trailing earnings is the most-lagged series, the price is pinned to that lagged month even though a current level exists in the same rows. Proven live from `market_data.db`: as of 2026-07-16 it stored `sp500_level=6584.02` (the 2025-09 close) while the same table held 2026-07 `sp500=7597.57`, cape=42.0 — a ~13% stale price. That stale price drives the implied-ERP solver and the Fed-model earnings yield, and `api.py:809` feeds the resulting ERP into every company's WACC/cost-of-equity.
**Fix (data selection only, no solver change):** source the index level from the latest row with `sp500>0`, keep earnings from Damodaran/latest-trailing. Pairs today's level with trailing earnings, matching Damodaran's implied-ERP construction.
*Grounding:* Damodaran, Applied Corporate Finance 4e, Ch.4, Table 4.7.

### C2 — Reinvestment-rate working-capital sign is inverted  **[moves numbers]**
`backend/individualanalysis.py:2183` (and `:1179` `_forward_reinvestment_rate`)
Both compute `(abs(capex) - dep + d_nwc)/nopat`, *adding* the cash-flow-signed "Change In Working Capital". Damodaran's reinvestment adds the *increase* in non-cash working capital, which is `-(stored value)` because the column is cash-flow signed. The same file's `_owner_earnings:4790` already treats it correctly, so the two are internally contradictory. AAPL FY2025 stores `-25e9`; correct WC term is `+25e9`, code computes `-25e9` — a $50B numerator swing, ~46pp error in the displayed Reinvestment Rate chart and in fundamental growth (reinvestment × ROIC). Under non-default `GROWTH_MODEL=fundamental` it also drives DCF `g_init`.
**Fix:** change `+ d_nwc` to `- d_nwc` at both sites (one character each). Do not restructure. Same fix belongs in `returns_quality.py:134` (see H-note) which is WIP/unwired today.
*Grounding:* Damodaran, Investment Valuation, Ch.10–11.

### C3 — Duplicate listings double-count in every group aggregate  **[moves numbers]**
`backend/api.py:2548` (+ `_sector_current_metrics`, `_industry_metrics_for_sector`, `_company_metrics_for_industry`, `_ranking_for_industry`, `comparative_endpoint`; `industry_averages.py:272/317/487`)
Group/ranking/comparative/scorecard queries join `tickers` on `f.Ticker` and never collapse a company's multiple listing lines to one CIK/primary. The `NOT GLOB '*-P[A-Z]'` guard catches only dash-P preferreds; it misses dashless preferreds (FITBO, SOJC, WAFDP) and foreign shadow lines. Verified byte-identical duplicates: `0R16.L` mirrors MCD across all 14 years ($218B cap, ROE −4.78, "Restaurants"); `ELC` mirrors ETR. 62 CIK+industry groups affected. The duplicate carries the full company cap, so it doubles that firm's market-cap weight, and users literally see McDonald's twice in the 8-slot peer panel.
**Fix:** `LEFT JOIN security_map s ON s.symbol=f.Ticker` with `WHERE COALESCE(s.is_primary,1)=1` (missing row = primary, preserving current behavior). Reuses the identity built for `_resolve_symbol`. Do not extend the GLOB.
*Grounding:* Damodaran, Investment Valuation, Ch.2.

### C4 — Live Moonshot API key hardcoded (see decision item #1)
`data/notegenerator.py:19` — CRITICAL by exposure; rotation is a user action.

---

## HIGH

### H1 — Shiller merge can silently revert to mid-2023, undetected
`backend/marketdata/shiller_data.py:214`
If multpl.com changes its HTML, `_load_multpl_supplement` returns `{}` (also swallows its own errors), datahub post-2023 is zero-filled to None, the xls is frozen at 2023-09, so `latest_complete`/`latest_cape` walk back to mid-2023. Every consumer (CAPE, implied ERP → WACC, metric 68, Fed model) silently uses 2023 fundamentals. `store()` stamps `fetched_at=now`, so the refresh gate and any fetched-at monitor report "fresh". This is the exact past incident, and nothing would catch a recurrence.
**Fix (adds a signal, moves no number):** after load/store, compare `latest_complete().date` to today and log a WARNING / set a staleness flag when the newest complete month lags > ~2–3 months.

### H2 — Garbage segment classification propagates as a real beta  **[moves numbers]**
`backend/betas/classify.py:283`
When the LLM is unavailable/empty, `classify_segment` maps the segment to the parent company's industry at confidence 0.4 and caches it permanently (no version/asof key). Geographic/residual buckets ("europe middle east africa" → Beverage, "international operated markets" → Restaurant) become real weighted businesses in the bottom-up beta, counted toward the 70% coverage gate, and the result is still reported as `bottom_up_*`.
**Fix:** don't treat an LLM failure as a successful parent mapping — leave it uncached (or mark unmappable/coverage-excluded); add a model/asof/version column so improved rules re-derive stale rows.
*Grounding:* Damodaran, Investment Valuation, Ch.8 Step 4.

### H3 — Synthetic-rating size cutoff compares local currency to a USD $5B line  **[moves numbers]**
`backend/individualanalysis.py:1277` (and `:3977` displayed rating, `:2334` historical WACC trend)
Damodaran's coverage/default-spread tables split at USD $5B; here Market Cap is stored in local currency with no USD conversion in this module. ~9,266 non-USD tickers with debt have local cap > 5e9 but USD-equiv < $5B, so weak-currency filers (JPY/KRW/INR/IDR) get routed to the large-firm table, assigned a lower spread, understating cost of debt → understating WACC → overstating intrinsic value, and the displayed credit rating runs one+ notches too high for every non-USD firm.
**Fix:** convert Market Cap to USD (reuse the `fx_rates` join) before comparing to `_LARGE_CAP_CUTOFF`; have `compute_wacc`/credit/trend callers pass USD-equivalent cap.
*Grounding:* Damodaran, Investment Valuation, Ch.8, Tables 8.1/8.5/8.6.

### H4 — `_mc_to_usd` treats an unrated currency as 1:1 USD  **[moves numbers]**
`backend/api.py:3597`
`mc * _fx_rates().get(ccy, 1.0)` — a currency absent from `fx_rates` becomes 1:1 USD, contradicting the SQL weight path (`_FX_WEIGHT_SQL`) which drops the row as NULL. So the same filer is dropped from by-year charts but KEPT at an inflated USD-face cap in the scorecard weighting. `fx_rates` is missing BGN and ILA. MSVT.TA (ILA, cap 19.3e9) enters "Computer Hardware" as a $19.3B constituent when its true USD cap is ~$54M–$6B.
**Fix:** return `None` when a non-USD currency is absent from both rate tables (matching the NULL-drop rule); separately add BGN and normalize ILA→ILS so those filers convert rather than drop.
*Grounding:* Damodaran, Investment Valuation Ch.15.

### H5 — Ten primary companies missing from `tickers`, invisible everywhere  **[moves numbers]**
`backend/industry_averages.py:272`
AXS ($8.4B), RNR ($12.6B), BEP, CMRE, DSX, GSL, TEN, DLNG, GROY, JENA are `is_primary=1` in `security_map` with full fundamentals but have no `tickers` row. Every INNER JOIN on `tickers` silently drops them, so Reinsurance/Financials averages are computed without RenaissanceRe/Axis, and searching "RNR" returns nothing.
**Fix:** this is a `tickers`-population gap, not a query bug — ensure UniverseSync/ingest inserts every `is_primary=1` company. Add a reconciliation assert that active primaries are a subset of `tickers`.

### H6 — /ask returns 500 under parallel load (ROOT CAUSE)  *(protected file)*
`rag/server.py:270`
`search_vault` (async) calls the synchronous `search()` — `embed_query` → `requests.post` (blocking, 300s) then a brute-force sqlite-vec KNN over ~131k vectors — directly on the aiohttp event-loop thread. With 3+ concurrent requests, each blocking embed freezes the whole loop; a parked request's `query.initialize()` trips the SDK's 60s control-request timeout and the exception becomes a bare 500. Single-request load never triggers it. This is the "only under parallel load" symptom exactly.
**Fix (one line, needs your OK on server.py):** `results = await asyncio.to_thread(search, qtext, category)`. Do NOT "fix" by raising the SDK timeout — that masks the starvation.

### H7 — Heartbeat proxy delivers upstream 500s as HTTP 200
`rag/ai_proxy.py:50`
For `/ask`,`/explain`,`/define` the proxy commits `StreamResponse(status=200)` and `prepare()`s before knowing the upstream status, then writes the upstream body regardless. When server.py 500s, the browser gets a 200 with a non-JSON body → `response.json()` throws → the "Failed to fetch" you see. The real 500 is lost.
**Fix:** make the server.py answer handlers return `web.json_response({...}, status=...)` on failure (see H8) so the concatenated body is always valid JSON; or delay the 200 commit until the first heartbeat actually fires.

*(H-note — same sign bug as C2 at `returns_quality.py:134`: confirmed on correctness+domain but reachability shows the module is imported only by its own test today — WIP, not wired into production. Fix it alongside C2 while it's still WIP so it lands correct.)*

---

## MEDIUM (11)

- `backend/marketdata/sector_etf.py:109` — `fi.get('last_price')` is the documented FastInfo gotcha; always returns None, so the intraday "latest" overlay silently falls back to the last *weekly* close (~5 trading days stale) for every sector ETF and SPY. Fix: `getattr(fi,'last_price',None)`. **[moves a chart point]**
- `backend/marketdata/shiller_data.py:366` — `real_earnings_cagr` keys off `real_earnings`, which no current source supplies (dead post-2023), so the 10y real-earnings CAGR always ends ~2023 and feeds metric 68 / implied ERP as if current. Fix: derive real_earnings from nominal + FRED CPI, or surface the actual window end-date.
- `backend/betas/bottom_up.py:258` — L1/L2 stamps confidence "high" whenever no LLM ran, ignoring per-segment map confidence, so a beta built on 0.4 parent-fallback mappings is reported as high-confidence. Fix: fold min per-segment confidence into the downgrade.
- `backend/betas/bottom_up.py:357` — segment-sum sanity band `[0.6,1.15]` is skipped when consolidated revenue is unknown (7/102 CIKs), leaving only a trivially-satisfiable coverage check. Fix: drop to L3 or record a `no_consolidated_sanity` warning.
- `backend/betas/edgar_client.py:706` — `get_financial_facts` never refreshes after the first cache write, so a new 10-K's operating-lease liability is frozen and feeds a stale WACC. Unlike the segment path, it doesn't compare stored fy to latest. Fix: gate the cached short-circuit on fy/max-age. **[moves numbers for lease-heavy filers with a new 10-K]**
- `backend/betas/classify.py:290` — a transient RAG outage permanently caches a segment "unmappable" (indistinguishable from genuinely unmappable), silently dropping it from coverage forever. Fix: tri-state the unreachable signal; skip the null-cache write on transport failure.
- `backend/betas/edgar_client.py:68` — SEC rate limiter uses an unsynchronized module-global read-modify-write; concurrent first-visits can both hit data.sec.gov and breach the ~8 req/s ceiling. Fix: guard with a `threading.Lock`.
- `backend/betas/classify.py:64` — broad keyword stems shadow specific ones (first-match-wins): "banking" precedes "investment banking", "insurance" precedes "reinsurance", so those segments map to the wrong Damodaran group and get the wrong segment beta. Fix: order stems most-specific-first or match on word boundaries.
- `backend/industry_averages.py:378` — `compute_cape` averages only positive-EPS years, excluding loss years from the cyclically-adjusted earnings, so cyclicals (Semis/Airlines/Energy) show an artificially low CAPE and look cheaper than they are. Fix: include all EPS years inside the inner average; the outer `avg_eps>0` gate still drops chronic losers. **[moves industry CAPE for cyclicals]**
- `backend/api.py:436` — `db_conn()` interpolates the absolute `financials.db` path and OS username into the 503 detail returned to unauthenticated callers (the same leak already scrubbed from /api/health). Fix: static detail, log the path server-side. Relevant during the pending DB swap.
- `frontend/src/lib/simulator.ts:79` — minor-unit currency codes (GBp/GBX pence, ILA, ZAc) are uppercased to the major code and multiplied by the whole-unit FX rate, overstating London-listed paper positions ~100×. Fix: detect sub-currency codes, divide price by 100, map to major code.
- `frontend/convex/simulator.ts:110 / :135 / :242` — `executeTrade` guards `>0` but not finiteness/upper-bound; `v.number()` accepts `Infinity`, so a direct mutation call (bypassing the UI clamp) can mint infinite/NaN paper cash for the caller's own account; `resetPortfolio` uses `.filter` full-table scans instead of the existing `by_user` indexes, so Reset eventually throws for everyone. Fix: server-side finiteness/range checks; switch to `.withIndex`. Self-scoped, no cross-user impact — but becomes serious if a leaderboard is ever built on NAV.

## LOW (19)
Compact list retained in the workflow output; highlights: `expected_returns.py` emits a partial-sum expected return when Ilmanen terms are missing; `api.py:286` `require_admin` 500s on a non-ASCII token; `rag/rag_embed.py:54` indexes a zero-vector on embed failure; `frontend/convex/auth.ts:7` anonymous provider satisfies every `getAuthUserId` gate; `rag/social_tools.py:59` injects external tool content unsanitized. Full text in the run transcript.

---

## What the skeptic panel KILLED (27 — considered and rejected)
Representative: `http_cache.py:127` stale-serve (refuted — TTL is enforced), `refresh.py:146` gate (refuted), `bottom_up.py:97` D/E percent heuristic (refuted — dormant, all stored D/E are decimals), `industry_averages.py:571` (refuted on reachability), `frontend/src/lib/markdown.ts:141` and `format.ts:16` (refuted), `convex/schema.ts:9` union drift (refuted). Two LOW-value marketdata items and several style nits were dropped. The pattern: most killed findings were real code observations whose *failure scenario* didn't survive tracing the live path.

## Dead code (analysis only — nothing removed)
Git-tracked and safe to archive after review: `frontend/src/lib/utils.ts` (byte-dup of `cn.ts`), `frontend/src/components/GroupValuationBadge.tsx` (superseded by `GroupScorePanel`), `frontend/convex/reports.ts` + `reports` table (CLAUDE.md already calls it orphaned), `data/build_sector_averages.py` + `data/sector_averages.csv` (superseded by live `industry_averages.py`). **Keep (WIP, current HEAD):** `returns_quality.py` + `ReturnsQualitySection.tsx` + `returnsQualityTypes.ts` — a feature mid-wiring. **Keep (pending swap):** the two Jul-13 DB backups. The three May DB backups (~1.3 GB) are archivable.

---

## Suggested fix order
1. **You:** rotate the Moonshot key (and FRED key). Everything else can wait behind this.
2. **Moves no numbers, low risk:** H1 staleness warning, edgar rate-lock (M), api.py:436 leak (M), the RAG reliability fixes H6/H7 (pending your OK on server.py), convex validation + index fixes (M), secret code→env-var swaps.
3. **Moves numbers, with before/after diff:** C1 stale price, C2 reinvestment sign, C3 double-count, H3 FX cutoff, H4 unrated-currency, H5 tickers gap, then the beta-classification fixes (H2, M-classify, M-keyword) and CAPE (M). Each snapshotted and traced.
4. Re-run the 335-test suite + `tsc -p tsconfig.app.json` after each batch; confirm every moved number maps to a named fix.
