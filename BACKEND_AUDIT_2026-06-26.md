# Backend Audit — IntrinsicFinEd (2026-06-26)

Multi-agent backend deep-dive (8 specialist reviewers). Scope: Python backend only.
Bug policy: **safe/clear bugs auto-fixed; everything behavior-changing is proposed for your approval.**

**Validation of applied fixes:** `py_compile` clean · `pytest marketdata/test_marketdata.py` → 11/11 pass ·
full `import api` OK (23 routes). A live uvicorn boot was intentionally skipped (would spawn the refresh
daemons + network); import + tests cover the edited paths.

---

## 0. 🔴 URGENT — exposed live secret (do this first, not code)

- **`data/notegenerator.py:19`** — a **live API key is hardcoded in plaintext**
  (`api_key="sk-...2MSc44Sz"`, a Moonshot/Kimi key). This file is your book-notes tool, unrelated to the app.
  **Action: rotate that key now**, then move it to an env var. I did **not** delete the file (it's yours) and
  did **not** print the full key here.
- **FRED API key hardcoded in 3 places** — `data/economicmetrics.py:12` (no env fallback at all),
  `backend/api.py:275`, `backend/marketdata/fred_client.py:28-29`. Free/public key, lower urgency, but it's a
  credential in source. Consolidate to a single `os.environ["FRED_API_KEY"]` and rotate.

---

## 1. ✅ Auto-fixed this pass (safe — visibility only, no behavior change)

All 9 are added logging at silent-failure sites + one idiom fix. None alter analysis output.

| File:line | Change |
|---|---|
| `backend/api.py:633` | `rf` anchor: log FRED DGS10 fetch failure instead of silent `pass` (was hiding wrong-key → every DCF using stale 4.5% rf) |
| `backend/api.py:571` | `yahoo_monthly`: log when yfinance import missing |
| `backend/api.py:743` | `_market_pe_is_stale`: log staleness-check failure |
| `backend/api.py:801,809` | `_shiller_monthly_eps`: log DB connect + query failures (was blanking the Fed-model EPS chart silently) |
| `backend/api.py:963` | `_marketdata_metrics`: log Damodaran earnings-history failure (metric 23) |
| `backend/api.py:1024` | `_sp500_valuation`: log Damodaran forward-earnings augment failure |
| `backend/marketdata/refresh.py:95,103` | staleness lookups: log failure at DEBUG |
| `backend/marketdata/refresh.py:186` | scheduler: log cache-invalidation-callback failure (was `pass` → stale `/api/economic` for 6h) |
| `backend/api.py:704` | `trigger_daily_update`: mutable default `Query(default=[])` → `Query(default=None)` |

---

## 2. ⭐ PRIMARY — Comparative per-ticker value scoring (needs approval)

These change scoring output, so per your choice they are **proposed, not applied.** Highest-impact first.

### Scoring-correctness bugs that mis-rank companies
- **CRITICAL — negative-equity / negative-denominator not guarded.** `_safe_div` only blocks `den == 0`,
  not `den < 0`. So `Financial Leverage` (`comparitivestockanalysis.py:257`) and `Quick`/`Current Ratio`
  (`:248-252`) produce garbage for firms with negative equity or negative current liabilities.
  *Fix:* guard `> 0` before dividing.
- **HIGH — loss-making firms scored as "cheap" (metric inversion).**
  - `PFCF Ratio` (`:259`): negative FCF → negative P/FCF → ranked as cheapest (best) under "lower is better".
  - `debt_service` (`:241,258`): a negative stored interest expense makes the denominator negative, nullifying
    DSCR. **Same bug in the engine** at `individualanalysis.py:548`.
  *Fix:* `abs()` the components / null out non-positive ratios before scoring.
- **HIGH — peer set built from wrong/stale market caps.** `comparative_endpoint` uses `MAX("Market Cap")`
  **across all years** (`api.py:3827-3836`), and `_ranking_for_industry` uses SQLite's bare-column-with-`MAX`
  anti-pattern (`api.py:3559-3570`) — both can select a company's peak historical cap or a wrong-year cap,
  corrupting who's even *in* the peer panel. *Fix:* join to each ticker's latest year explicitly (subquery).
- **HIGH — data-sparse tickers score 0.0 and rank as if valid** (`:435-436,452`). A ticker missing all 20
  scored metrics gets 0.0 (indistinguishable from genuinely-worst) and still appears ranked.
  *Fix:* require a minimum data-coverage (e.g. ≥50% of total weight) else return `None`/flag.

### Lower-severity scoring issues (MEDIUM)
- Window mismatch: peer **selection** uses last 5 years, but the data **pull** goes back to 2012
  (`api.py:3540` vs `3590`) — multi-year growth averages use 14 years.
- Non-determinism: no tie-break for equal-score tickers (`api.py:3593-3597`) — order depends on DB row order.
- Outlier-sensitive growth: arithmetic mean of YoY FCF/share (`:295-309`) — one turnaround year dominates; use median/CAGR.
- `n==2` peer panels give binary 0/100 per metric; `"asset_turnover"` vs `"Asset Turnover"` computed twice;
  `x or fallback` discards exact-zero equity (`:231`).

---

## 3. Analysis engine — `individualanalysis.py` / `industry_averages.py` (needs approval)

- **HIGH — DCF growth uses arithmetic mean of YoY rates** (`individualanalysis.py:654`), upward-biased vs CAGR;
  inflates intrinsic values for volatile FCF. (This function is **duplicated verbatim** in the comparative module.)
- **HIGH — false-positive ROIC when NOPAT<0 and invested capital<0** (`:519-520,1018`) — negative/negative = +ROIC
  bypasses the `roic<=0` guard, so the FCFF model runs on exactly the distressed firms it should skip.
- **HIGH — exit cross-check discounts an equity cash flow at WACC not Ke** (`:1237`) — ~10-20% overstatement.
- **HIGH — FCFF growth fade starts already-faded in year 1** (`:1029-1030`) — inconsistent with the DDM/FCFE fade;
  understates year-1 revenue.
- **HIGH (dead code) — CAPE never scores** (`industry_averages.py:557`): the `'CAPE (approx)'` branch isn't in
  `SCORE_METRICS`, so CAPE silently has zero effect on rankings.
- MEDIUM: historical EVA uses latest-year WACC for all past years; `growth_vals` includes tickers excluded from the
  valuation (`industry_averages.py:465`); `makedirs("")` crash on bare filename; `wacc` variable is actually Ke.

---

## 4. Data layer — `financial_db.py` / `market_pe.py` (needs approval)

- **CRITICAL — TTM can silently span the wrong/too-many quarters** (`financial_db.py:1188-1193`): `iloc[:4]` after
  `dropna()` with no newest-first sort and no gap check → a missing quarter yields a 15-month "TTM", or a partial
  2-quarter sum returned as a valid figure. Flows into Revenue, margins, EV/Rev, DCF. *Fix:* sort desc, require 4
  contiguous quarters, else `None`.
- **HIGH — thread-unsafe `_PRICE_CACHE` / `_MARKETCAP_CACHE`** (`:292-299,335,374`): check-then-write race under the
  comparative fan-out → cache stampede. *Fix:* add a lock.
- **HIGH — SQLite concurrency**: no WAL mode anywhere; the refresh daemon writes while API threads read → possible
  `database is locked`. Ingest methods commit mid-`with` so a later sheet failure can't roll back the first.
- MEDIUM: `economicmetrics.py` FRED fetch has **no timeout** (`:39`) and uses string-concat URLs; module-level
  `TODAY` goes stale in a long-running process; CIK dedup misses dual-class shares without a CIK.

---

## 5. marketdata package (mostly needs approval)

- **HIGH — Shiller XLS parsed by positional column index** (`shiller_data.py:278-294`) — a column reorder upstream
  silently corrupts CAPE/earnings. *Fix:* match by header name.
- **HIGH — `_pv_two_stage` divide-by-zero** when `r == g_term` (`market_inputs.py:93`) — guard fragile at rf=0.
- MEDIUM: multpl.com scrape has no value-range sanity checks; `_norm_date` clamps invalid months instead of
  rejecting; `read_cached_params` truncates sub-day freshness; a `KeyboardInterrupt`/`BaseException` can silently
  kill the scheduler thread with no log.
- The remaining ~13 silent-failure sites (market_inputs, damodaran_market, fred_client, geopolitical_data,
  financial_db) **also need logging** — I did not auto-fix these because those modules have **no logger set up**;
  adding logging there is safe but touches more (see §8 recommendation).

---

## 6. api.py routing / concurrency (needs approval)

- **HIGH — unauthenticated admin endpoints** `POST /api/cache/clear` and `POST /api/daily-update` (`:657,703`).
  The latter **spawns a subprocess**, passes the `ticker` query param straight into the argv (argument injection),
  and **echoes the subprocess stdout/stderr back in the HTTP response** (info disclosure). Localhost-only today;
  CRITICAL if ever deployed. *Fix:* shared-secret header dependency + regex-validate tickers + don't echo stdout.
- **HIGH — `get_db()` lazy singleton race** (`:98-106`): concurrent first requests build two `FinancialDB`
  instances (each loads the 600 MB DB). *Fix:* double-checked lock.
- **HIGH — daemon threads write SQLite on shutdown with no graceful drain** (`:781,1807`): SIGTERM mid-write →
  abandoned transaction, DB flagged stale → re-triggers. *Fix:* `threading.Event` stop flag + shutdown join.
- **HIGH — blocking `yf.download` on the `/api/economic` cold path** (`:567-593`): 5 sequential yfinance calls,
  no timeout → 10-50s first response. *Fix:* add timeout; pre-warm via scheduler.
- **HIGH — duplicate metric `number=42`** (`:978` ERP vs `:1203` Breakeven Inflation) — the frontend resolves
  definitions by number, so one shadows the other. *Fix:* renumber Breakeven Inflation.
- MEDIUM: `economic()` is 419 lines / `_extended_economic_metrics` 269 lines (split for testability); `@app.on_event`
  is deprecated (use `lifespan`); no Pydantic `response_model`s; `_beta_history` IN-clause can exceed SQLite's
  999-variable limit and is swallowed → empty betas.

---

## 7. Security (beyond the secrets in §0)

- **SQL built with f-strings** — `group_col` interpolation (`api.py:1925,2015`), `ALTER TABLE {col}`
  (`financial_db.py:667`), dynamic column lists (`api.py:4148`). All currently fed by **internal allowlists**
  (not user input), so not exploitable today — but add explicit `assert col in {...}` guards before they drift.
- **CORS** allows any localhost port (`api.py:141`) and the RAG server sets `Access-Control-Allow-Origin: *`
  (`rag/server.py:311`) — fine on localhost, must gate behind an env flag before any deploy.
- **Shiller XLS over `http://`** (`shiller_data.py:41`) — MITM can tamper CAPE/ERP. *Fix:* switch to `https://`
  (Yale serves it; multi-source fallback exists, low risk).
- **RAG prompt-injection surface** (`rag/server.py:318-404`): request fields are templated verbatim into an
  "authoritative" block; `WebFetch` has no URL allowlist. Tighten CORS + cap field length + allowlist fetch domains.
- Confirm `frontend/.env.local` is gitignored; `/api/health` leaks the absolute DB path (`:645-654`).

---

## 8. Redundancy / dead code (proposed)

- **SAFE to remove (already gone or pure scratch):** `data/dd.py`, `eraqwer.py`, `sdxffvsddf.py`, `workfool.py`
  (already deleted from disk — only the git index references them); `data/injester.py` (4-line hardcoded stub);
  `data/examples.py` (demo); `backend/financials.db` (0-byte stub; real DB is at repo root).
- **NEEDS APPROVAL:** consolidate the 3 FRED clients → `fred_client.py` (canonical); the duplicate
  `_historical_fcf_growth` / `_compute_dcf` / DCF constants / `_safe_div` / `_yoy_pct` / `PER_SHARE_METRICS` shared
  between `individualanalysis.py` and `comparitivestockanalysis.py` → a `valuation_utils.py`; collapse the 4
  copy-pasted refresh-task blocks (`refresh.py:136-162`) into a dispatch loop; a shared `_swallow` context manager
  for the ~70 `except…BLE001` sites.
- **Silent value divergence:** `_SECTOR_ERP=0.055` (`api.py:2437`) vs `EQUITY_RISK_PREMIUM=0.045` everywhere else —
  sector WACC uses a different ERP than individual DCF. Decide if intentional; document/unify.

---

## 9. Cross-cutting

- **Near-zero test coverage** — only `marketdata/test_marketdata.py` (11 tests). The entire valuation engine,
  comparative scoring, and data layer (~8k LOC) are untested. The scoring/DCF bugs above are exactly what a small
  unit-test suite would catch and lock down.
- **No lint/type config** (no `ruff`/`mypy`/`pyproject.toml`); `print()` used instead of `logging` in `financial_db.py`
  and `economicmetrics.py`.
- **`backend/` is untracked by git** — there's no version-control safety net for the largest part of the app.
  Recommend committing it before larger refactors.

---

---

## ✅ FIXES APPLIED (RAG-verified against Damodaran, *Investment Valuation*)

Each valuation fix was verified against the Damodaran book in the local vault RAG before
implementation. A new network-free test suite locks them down: `backend/test_valuation_fixes.py`
(11 tests). Validation: **22/22 pass** (11 new + 11 marketdata), full `import api` OK (23 routes).

**Comparative scoring** (`comparitivestockanalysis.py`)
- Added `_pos_div` (rejects non-positive denominators) + `_first_not_none` (preserves genuine 0.0).
- `Financial Leverage`, `Quick`/`Current Ratio` now null out on negative equity / negative current
  liabilities (Damodaran Ch.19 — negative book equity → meaningless ratio).
- `PFCF Ratio` nulls on negative FCF (Ch.17 — a negative multiple is "not meaningful").
- `debt_service` uses `abs()` of interest expense + short-term debt (sign-robust DSCR).
- `_historical_fcf_growth` → **geometric (compounded) mean** (Ch.11 — "much more accurate measure of
  true growth"; arithmetic overstates for volatile FCF).
- `score_industry` now requires ≥50% metric-weight coverage (`MIN_SCORE_COVERAGE`) or the ticker is
  sunk to 0.0 — stops one-metric tickers phantom-outranking covered peers.

**Engine** (`individualanalysis.py`)
- ROIC computed only on **positive** invested capital (blocks the neg/neg → spurious +ROIC, Ch.19).
- `_run_fcff_projection` growth/margin fade now starts year 1 at the current value (matches
  `_fade_growth`); previous `t/horizon` started already-faded.
- Exit cross-check (P/FCF × FCF-per-share) now discounts at the **cost of equity (Ke)**, not WACC
  (Ch.2 "Error 1" — discounting an equity cash flow at WACC overstates value).
- `_historical_fcf_growth` → geometric mean; `debt_service_den` uses `abs()`.

**Industry averages** (`industry_averages.py`)
- `growth_vals` now appended only after the discount-rate gate, so tickers excluded from the
  intrinsic no longer skew the reported `avg_fcf_growth`.

**API peer set** (`api.py`)
- `comparative_endpoint` ranks the peer panel by **latest-year** market cap (was `MAX(Market Cap)`
  across all years → peak historical cap). *Note:* `_ranking_for_industry`/`_company_metrics`
  already used the correct SQLite "bare column + single MAX(year)" form — that finding was a false
  positive for SQLite.
- Comparative ranking sort now has a deterministic tie-break (`-score, ticker`).

**Verified-but-not-changed (design choices):** terminal-growth `max(0.0, …)` floor is a conservative
deviation (Damodaran Ch.12 permits negative stable growth); CAPE not in `SCORE_METRICS` left as a
display-only decision; the engine/comparative DCF duplication left for the consolidation pass.

---

## Suggested approval order
1. **Rotate the `notegenerator.py` key** (and FRED keys). (§0)
2. Approve the **comparative scoring** correctness fixes (§2) — they directly affect rankings.
3. Approve the **engine + TTM** fixes (§3, §4-CRITICAL) — they affect every valuation number.
4. Then redundancy consolidation + adding logging to the marketdata modules (§5, §8).
5. Stand up a minimal pytest suite around scoring + DCF before/while applying §2-§4.
