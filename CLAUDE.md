# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**IntrinsicFinEd / IntrinsicEd** — a non-speculative, valuation-based investing-education platform. It walks a user through a staged intrinsic-value workflow (Economic → Sector → Industry → Comparative → Individual company → Final Review), with a paper-trading Simulator and a Guide alongside, and uses LLMs to explain *why* each metric matters in plain language, instead of presenting walls of data.

It is a three-process system: a **React/Vite frontend**, a **FastAPI analysis backend** (port 8000), and a **local RAG server** (port 3001). Convex is the auth + user-data store. The pieces are loosely coupled over HTTP — the frontend falls back to synthetic mock data when a backend is offline, and surfaces a persistent `DataStatusBanner` ("Live data unavailable - showing simulated placeholder data") so users are never shown fabricated figures silently.

It is **live in production** at `https://intrinsicfined.org` — see "Production & Deployment" below.

## Running the system

Three servers, started independently. The frontend tolerates any of them being down.

```bash
# 1. FastAPI analysis backend (port 8000) — financial data, DCF, CAPE, FRED metrics
pip install -r backend/requirements.txt
uvicorn backend.api:app --reload --port 8000
#   or: ./start_backend.sh  (bash)  |  start_backend.bat  (Windows)
#   health: http://localhost:8000/api/health   docs: http://localhost:8000/docs

# 2. Frontend + Convex (Vite on 5173, convex dev in parallel)
cd frontend && npm install && npm run dev    # runs dev:frontend + dev:backend(convex) together

# 3. RAG server (port 3001) — "Explain using AI" / definitions from the Obsidian vault
cd rag && pip install -r requirements.txt && python server.py
```

The RAG server needs **Ollama** running (`ollama serve` + `ollama pull nomic-embed-text`) for embeddings, and a Claude Code **Max login** (`claude login`) — it uses the Claude Agent SDK through the login session, **no `ANTHROPIC_API_KEY`** (the SDK prefers a key if one is set in the shell, which breaks the Max-login path).

## Lint / build / test

```bash
cd frontend && npm run lint       # tsc -p convex + tsc -p . + convex validate + vite build
cd frontend && npm run build      # vite build only

# IMPORTANT: `npm run lint` does NOT reliably type-check src/ — the root tsconfig is
# references-only and the vite/esbuild build skips type-checking. To actually catch
# type errors in the app code, run:
cd frontend && npx tsc -p tsconfig.app.json --noEmit

# Backend tests — the whole suite is network-free (339 tests, ~3s)
cd backend && python -m pytest test_*.py betas/test_betas.py marketdata/test_marketdata.py -q
cd backend && python -m pytest test_valuation_fixes.py -q -k negative_profit   # a single test

# End-to-end check of the LIVE backend across every analysis stage (needs the
# server up on :8000). Asserts on real CONTENT, not HTTP 200. 39 checks.
python remediation/verify_stages.py
```

Valuation/engine tests: `test_valuation_fixes.py` (valuation/scoring/FX/normalization/value-lens
regression — dict rows stand in for sqlite3.Row), `test_group_scoring.py` (sector/industry
scorecard value score + the 16 integrity questions), `test_growth_estimation.py` (fundamental
growth, sales-to-capital bridge, life-cycle clamps), `betas/test_betas.py` (Damodaran Ch.8 worked
examples), `marketdata/test_marketdata.py`, `test_uses_of_cash.py`.

Data-layer tests (added by the 2026-07-13 DB remediation, see that section): `test_ingest_validation.py`
(junk year/period rejection), `test_update_fill_gaps.py` (COALESCE gap-fill never overwrites),
`test_identity_lib.py` + `test_symbol_resolution.py` (ticker identity / alias folding),
`test_phase3_backfill.py`, `test_phase3_complete.py`, `test_phase3b_mapping.py` (XBRL→column
mapping), `test_phase4_quarterly.py` (quarterly + TTM + Q4 derivation), `test_phase5_jobs.py`
(scheduled jobs), `test_phase6_fx_weights.py`, `test_phase6_benchmark.py`, `test_quote_batch.py`.

Much of the valuation engine is still otherwise untested; add a characterization test when you
touch scoring, DCF, or a normalization.

**Dev backend caveat:** `uvicorn --reload` here does **not** reliably pick up edits to the
analysis modules — after changing backend Python, restart uvicorn manually (and note the
comparative endpoints are `@cached` for 30 min, so also clear via `POST /api/cache/clear` or
just restart). Frontend changes hot-reload fine via vite.

## Production & Deployment

Live at **`https://intrinsicfined.org`**. Self-hosted for zero cost: the frontend is a static
Cloudflare Pages site; the backend + RAG stay on the owner's Windows PC, exposed via a Cloudflare
Tunnel → local nginx, never port-forwarded. Reconstructing this requires reading the whole
`deploy/` dir + the start scripts, so the big picture:

```
Cloudflare Pages (frontend/dist)          ── intrinsicfined.org, www
Cloudflare Tunnel → nginx :8080 → backend :8000   ── api.intrinsicfined.org
                                 → RAG    :3001    ── ai.intrinsicfined.org
Convex Cloud (prod deployment upbeat-rooster-226) ── auth + user data
```

Five always-on local processes: **ollama** (embeddings), **backend** (`start_backend_prod.bat`),
**RAG** (`rag/server.py`), **nginx** (`deploy/nginx.conf`), **cloudflared** (`deploy/cloudflared-config.yml`).

- **Start everything:** double-click `START_WEBSITE.bat` (→ `start_all.ps1`), which starts any
  process not already running, in order, then warms the `/api/economic` cache. A Startup-folder
  shortcut runs it automatically at Windows login — so "turn on the PC and log in" = site up.
  There is no `NSSM` service layer yet; the site is down while the owner is logged out.
- **`deploy/DEPLOY.md`** is the full runbook; **`deploy/WALKTHROUGH.md`** is the click-by-click
  tutorial (Convex deploy, Pages, tunnel, NSSM).

**Production hardening lives in `backend/api.py`, gated by `ENV=production`:**
- Admin routes (`/api/cache/clear`, both `/api/daily-update`) require the `X-Admin-Token` header
  == `ADMIN_TOKEN` env — **fail-closed** (403 if the env is unset). `daily-update` also
  regex-allowlists each ticker before it reaches the subprocess argv.
- `slowapi` per-IP rate limits on the expensive routes; `ALLOWED_ORIGINS` (comma list) drives
  CORS in prod and drops the localhost regex; `/docs` + `/openapi.json` disabled in prod;
  `/api/health` no longer leaks the DB path.
- All RAG protection (origin pinning, per-IP rate limits, wildcard-CORS strip, body caps) is done
  at **nginx** — `rag/server.py` is treated as **untouchable** (do not edit it or the Claude SDK
  prompt logic). Verify with `git diff --stat rag/server.py` (must be empty).

**Required prod env vars** (machine/user level so services inherit them): `ENV=production`,
`ADMIN_TOKEN`, `ALLOWED_ORIGINS=https://intrinsicfined.org,https://www.intrinsicfined.org`,
`FRED_API_KEY` (now env-only — the old hardcoded fallback was removed; missing key ⇒ FRED series
render empty, app still runs).

**Building for prod — two gotchas:** `VITE_API_BASE`/`VITE_AI_BASE`/`VITE_CONVEX_URL` are baked
into the bundle at build time. A local `npm run build` picks up `.env.local` (the **dev** Convex
URL) over `.env.production`, so use **`frontend/build-prod.ps1 -ConvexUrl <prod-url>`** (sets them
inline; guards against a `localhost` leak). Prod Convex URL is `https://upbeat-rooster-226.convex.cloud`.
Deploy: `npx wrangler pages deploy dist --project-name intrinsicfined`.

**Full ship order** when a change touches the Convex schema: `npx convex deploy --yes` (from
`frontend/`, pushes schema+functions to prod — `npx convex codegen`/`npm run dev` only touch the
dev deployment) → `build-prod.ps1` → `wrangler pages deploy`. Backend-only changes just need the
uvicorn restart + cache clear described above.

**Convex prod auth gotcha:** a fresh prod deployment has no auth env, and `@convex-dev/auth`
masks *every* failure (wrong password, unknown account, missing keys) as a generic client-side
**"Server Error"**. The prod deployment MUST have `JWT_PRIVATE_KEY`, `JWKS`, and `SITE_URL` set
(`npx convex env list --prod`); accounts created on dev do **not** exist on prod (separate DB).

**Rollback:** `files_local/` (sibling of the repo) is a pristine full copy taken before the
hardening/debug work — run from there to revert.

## Data updates (individual equities)

Per-ticker fundamentals refresh through **four Windows scheduled tasks** registered under
`\IntrinsicFinEd\` (source in `remediation/jobs/`, registrar `register_tasks.ps1`). They are the
supported path; the old "everything is manual" model is gone.

| Task | Cadence | Does |
|---|---|---|
| `FilingsWatch` | daily 07:30 | EDGAR daily index → CIKs that filed 10-K/10-Q/20-F yesterday → refresh only those tickers (annual + quarters + TTM). A first filing flips an `awaiting_first_financials` registrant to `active`, so **IPOs onboard themselves**. |
| `UniverseSync` | weekly Mon 07:00 | Diff SEC `company_tickers.json` against `security_map`: add new registrants, alias renames, mark vanished CIKs `delisted` (**rows are never deleted** — that is the survivorship fix). |
| `MarketWeekly` | weekly Sat 08:00 | `refresh_market_caps()` + `refresh_fx_rates()`. |
| `BulkSweep` | quarterly (15th Feb/May/Aug/Nov) | Reconciles anything the daily job missed. |

`freshness_monitor.py` (run on demand) reports staleness per store into `remediation/jobs/freshness_report.txt`.

`FinancialDB.update_ticker(ticker, fill_gaps=False)` is still the primitive underneath. It is
**additive-only by default** (`INSERT OR IGNORE` — adds new fiscal years, never restates);
`fill_gaps=True` additionally completes **NULL columns only** on existing rows (COALESCE
semantics — a stored non-NULL value is never overwritten). A yfinance-sourced year fills only
~51 of 206 columns (no market cap, currency, CIK, or ratios), so
`remediation/phase3_complete_rows.py --ratios` recomputes the derived ratio columns set-based
afterwards. A full-universe sweep is ~31k tickers at ~1s each (multi-hour, rate-limited) — use
`remediation/phase3_backfill.py <db> --missing --frozen` (resumable via
`remediation/phase3_checkpoint.json`), not `update_all`.

The admin `POST /api/daily-update` still exists for a one-off ticker. After any manual write,
`POST /api/cache/clear` (admin-token gated) so the 30-min-cached endpoints re-read; a backend
restart does the same for free. The `/api/individual/{ticker}` response carries an additive
`analysis_error` field (null on success) so the frontend distinguishes a crashed valuation
pipeline from a ticker with no data.

## Architecture

### Three data stores, three roles
- **`financials.db`** (repo root, ~640 MB, git-ignored) — the company fundamentals warehouse. Owned by `data/financial_db.py`. **Backups sit beside it as `financials.db.backup-*` / `financials.db.pre-swap-*` — do not treat those as the live DB.** Core tables:
  - `financials` — the annual warehouse. PK `(Ticker, "Calendar Year")`, 206 columns, ~363k rows, one FY row per company-year. `Period` is always `'FY'`.
  - `financials_quarterly` — PK `(Ticker, "Calendar Year", Period)` where Period ∈ `Q1..Q4|TTM`. Same columns. Separate table **by design**: quarterly rows in `financials` would be counted four extra times by every `SUM`-based average. Barely populated (see "Quarterly + TTM").
  - `security_map` — company identity / symbol crosswalk (see "Ticker identity").
  - `tickers` — the searchable universe (+ `status`, `beta`, `peg`). Has **no** `Cik` column; `financials` does.
  - `financials_quarantine` — rows rejected by ingest validation (Wisesheets error strings) and losers of the identity re-key. Never deleted, so any purge is reversible.
  - `rekey_audit` — every identity re-key/fold action, reversible row by row.
  - `damodaran_benchmark` — `(year, dam_industry, metric)`, the survivorship-free EXTERNAL benchmark (2013→now).
  - `computed_betas` / `damodaran_industry*` / `segment_*` — the bottom-up beta engine (see `backend/betas/`).
  - `fx_rates` — currency → USD. Now **load-bearing for the weighted averages**, not just ranking.
  - `job_runs` — `job TEXT PRIMARY KEY`. Scheduled-job completion markers. **Always upsert** (`ON CONFLICT(job) DO UPDATE`); a plain INSERT crashes on the second run.
- **`backend/market_data.db`** — macro/market series (CAPE, implied ERP, EPU, GPR, Fed-model inputs, sector-ETF history) populated *only* by the marketdata refresh scheduler. The `/api/economic` and sector-ETF endpoints read from here; an empty series renders as a blank chart rather than erroring.
- **Convex** (`frontend/convex/`) — per-user application state: qualitative answers, cached AI explanations (`aiAnswers`), notebook notes (Tiptap), the watchlist, the simulator tables (`sim*`), and the Investment Policy Statement (`policy`, singleton per user). Auth via `@convex-dev/auth`. This is the only store the frontend writes to directly. The `reports` table + `convex/reports.ts` are **orphaned** (the old Tiptap final report was replaced by Final Review questions) — don't build on them.

### Backend (`backend/api.py` + `data/`)
`backend/api.py` (~4800 lines) is the single FastAPI app. At startup it imports the heavy analysis modules **once** (~10s, pulls in pandas/yfinance) and reuses them per-request:
- `data/financial_db.py` — `FinancialDB`, the core ingest/query/TTM engine over `financials.db`.
- `backend/individualanalysis.py` — single-ticker snapshot: DCF (+ reverse DCF solved off the same FCFF engine), EVA/residual-income/DDM models, value scoring, full ratio decomposition, shenanigans/forensics, credit analysis, R&D capitalization, EPV / Tobin's Q / owner earnings, verdicts.
- `backend/earnings_normalization.py` — Damodaran Ch.9 restatements (operating leases → debt, investment-income removal ex-financials, one-time normalization, goodwill/SBC); its normalized EBIT also feeds EPV, and its lease PV feeds the WACC debt weight.
- `backend/comparitivestockanalysis.py` — industry panel + cross-company ranking/scoring (the per-COMPANY value score `score_industry`).
- `backend/group_scoring.py` — the per-GROUP scorecard: a sector/industry 0–100 Value Score plus the 16 answerable "integrity questions". Distinct engine from `score_industry` — see the scorecard subsection below.
- `backend/industry_averages.py` — sector/industry averages by year, CAPE, DCF, ranking. The industry life-cycle classifier and Porter strategic-group map live in `api.py` (`_lifecycle_from_series`, `_strategic_groups_from_metrics`) on top of these aggregates. **Weighting invariants (2026-07-13):** every by-year aggregate weights by `_FX_WEIGHT_SQL` — the market cap converted to USD via `LEFT JOIN fx_rates x ON x.currency = f."Reported Currency"` — not the raw local cap (a ¥ cap was being summed against a $ cap at face value). USD/NULL currency weights 1.0/unit; an **unknown currency yields a NULL weight and drops the row from both numerator and denominator**; caps are bounded `> 0` and `< 1e14` (one Wisesheets row claimed 3.2e17 and dominated an entire industry-year). `compute_cape` / `compute_dcf` use the same weight, but their per-share prices stay LOCAL — the ratio must be currency-neutral. **Metric VALUES are never FX-converted.** Survivorship bias is now *partially* corrected (delisted companies are in the warehouse — see the remediation section), but industry labels are still current-day, so Damodaran (`damodaran_benchmark`) remains the authoritative unbiased benchmark.
- `backend/esg_data.py` — ESG scores cache. Yahoo's free ESG feed is dead (404s), so the block returns an `ai_qualitative` marker and the numeric tiles simply do not render; the ESG section is a **user-answered question deck** (it no longer auto-generates an AI assessment). The numeric hook self-heals if the feed ever returns.

Routes are grouped: `/api/economic`, `/api/sectors` + `/api/sector/{sector}`, `/api/industries` + `/api/industry/{industry}` (+ `/scorecard`, `/strategic-groups`), `/api/comparative/{industry}` (+ `/ranking`, `/company-metrics`), `/api/individual/{ticker}`, `/api/quote/{ticker}`, `/api/tickers/search`. Every endpoint returns the `SectionData` shape consumed by `frontend/src/lib/types.ts`; the industry/sector payloads also carry a `lifecycle` key.

### Valuation, scoring & currency invariants (read before editing the engines)
These cross-cut `individualanalysis.py`, `comparitivestockanalysis.py`, `industry_averages.py`, and `api.py`, and have each caused silent, plausible-but-wrong output:

- **Rows must be ascending by fiscal year.** Snapshot/metric builders take "latest" as `rows[-1]` and compute YoY/growth oldest→newest. `build_snapshot`, `build_individual_snapshot`, `compute_forecast`, and `metric_history` now defensively `sorted(rows, key=Calendar Year)` internally — keep that guard on any new function that indexes rows positionally. (A caller once passed DESC-sorted rows and every company was scored on its *oldest* year.)
- **Comparative value score** (`comparitivestockanalysis.score_industry`) is **magnitude-aware and sector-weighted**, not a pure peer percentile: `metric_score = 0.70·level + 0.30·peer_percentile`, where `level` comes from absolute calibration curves (`METRIC_CURVES`, anchored on `individualanalysis.QUALITY_THRESHOLDS`), weighted by `WEIGHTS_BY_SECTOR` (per-GICS-sector profiles + `DEFAULT_WEIGHTS`, RAG-grounded), then a **hard cap (`NEG_PROFIT_CAP=30`)** so negative profitability / negative EVA can never rank high. It mirrors the individual page's `_build_verdict` quality score. Tied values share the average percentile.
- **Market Cap is stored in the company's reporting currency** (e.g. TSM in TWD, SK Hynix in KRW), not USD. Cross-currency size ranking/weighting goes through the `fx_rates` table (`FinancialDB.refresh_fx_rates()` from yfinance, `get_fx_rates()`); the comparative ranking queries `LEFT JOIN fx_rates` and rank on `Market Cap * usd_per_unit`, and `api.py:_mc_to_usd` converts the displayed/weight cap. **Ratios stay in local currency** (currency-neutral — never FX-convert a ratio). The DB's `Reported Currency` column contains some garbage values; unconvertible currencies drop out of size ranking.
- **Displayed spreads are derived, not re-aggregated.** Sector/industry averages winsorize each metric independently, which breaks `excess = ROE − Ke`; `_aggregate_weighted_columns` therefore recomputes `excessReturnEquity` from the clipped `roeEquity − costOfEquity` so the three displayed numbers reconcile.
- **Three different currency policies coexist — know which query you are in.** (a) The **by-year group aggregates** (`_by_year_with_groups`, `industry_averages._compute_averages*`, CAPE/DCF) include every currency and **FX-convert the WEIGHT** via `_FX_WEIGHT_SQL` (unknown currency ⇒ NULL weight ⇒ row drops). (b) The **scorecard matrices** and **ranking endpoints** include every currency and convert through `_mc_to_usd` / `LEFT JOIN fx_rates`, with a $100M USD-equivalent floor. (c) A few helpers (e.g. `_group_excess_return`, `_company_metrics_for_industry`'s top-N pick) still hard-filter `Reported Currency = 'USD'`. Never FX-convert a metric VALUE in any of them.
- **Every individual-page analysis block follows one contract.** Compute inside `build_individual_snapshot` in its own try/except that logs and falls back to `None` (a crashed block must never break the snapshot); return `{"applicable": False, "reason": …}` markers instead of raising for companies the method doesn't fit (the financial-sector guard `fcff_applicable`/`_FCFF_GUARD_SECTORS` gates FCFF-family methods); add a dataclass field + a camelCase key in `api.py#_snapshot_to_dict`; render as a `components/individual/*Section.tsx` mounted in `IndividualPage.tsx`. Follow this shape for any new method.
- **Cost of capital is deliberately mixed-rate.** `compute_wacc` uses the company's own *effective* tax rate for NOPAT/FCFF but the *marginal* rate (`MARGINAL_TAX_RATE = 0.21`, matching `betas/`) for the after-tax cost of debt — Damodaran Ch.8; don't "fix" the mismatch. The ERP is the **live implied two-stage premium** read from the `market_inputs` table (7-day freshness window) with `FIXED_EQUITY_RISK_PREMIUM = 0.045` only as fallback; `waccBuild.erpMethod` records which path ran. The PV of operating leases (XBRL `OperatingLeaseLiability`, absent from yfinance Total Debt) is added to the debt weight via `compute_wacc(lease_debt=…)`; on-balance-sheet *capital* leases are already inside Total Debt and must never be re-added.

- **Two ROE decompositions coexist on the individual page, and they are not interchangeable.** `_dupont_5factor` multiplies five levers (tax × interest × EBIT margin × turnover × leverage) and is an exact algebraic identity off one set of statements, so it reconciles to a rounding error. `_leverage_roe` (Damodaran Ch.11, Illustration 11.7) is the *sum* form: `ROE = ROIC + D/E × [ROIC − i(1−t)]`, splitting ROE into what the business earned and what the balance sheet added. Three things about it are load-bearing: (a) **the identity only telescopes when ROIC's base is book equity + book debt with NO cash subtracted** (the base `_invested_capital`/`_nopat_for_row` already use). Damodaran's ROIC elsewhere subtracts cash and cross-holdings; swapping that base in here silently breaks the reconciliation. (b) The **modelled-vs-reported ROE gap is a signal, not a bug**: NOPAT is operating-only, so a wide gap means non-operating profit is inflating the reported ROE (the third of the three inflation sources, after leverage and a depressed tax rate). Its tolerance band is deliberately looser than DuPont's. (c) **A stored 0 interest expense against real debt is missing data, not a 0% rate** (AAPL FY2024-25 does exactly this on >$100B of debt, because the filer nets interest into "other income"). Taken literally it hands the whole ROIC to the spread and wildly overstates the leverage gain, so the rate comes back `None` and the headline falls back to the latest *computable* year (`latestYear` vs `dataThroughYear`/`staleLatest`). `test_leverage_roe.py` replicates the book's three published companies and locks all of it.
- **Forward growth is life-cycle-aware and flag-gated (Damodaran Ch.11).** `individualanalysis.compute_forecast` computes growth two ways: the historical revenue regression, and **fundamental growth** = `reinvestment rate × ROIC` plus a changing-ROIC efficiency term (capped at 0.10). `lifecycle_from_series` classifies the company (emerging/growth/mature/declining) from its own revenue-growth and margin series, and the stage sets the growth clamp (60/35/25/15%) and decides whether the revenue trend leads or blends 0.60 toward fundamental. **`GROWTH_MODEL` ∈ `regression|shadow|fundamental` (default `shadow`)**: `shadow` surfaces the whole reconciliation but keeps the regression driving the DCF, so no existing valuation moves; `fundamental` lets the reconciled rate drive it; `regression` is the rollback. **When ROIC ≤ 0** (and only then) reinvestment switches to the **sales-to-capital bridge** (`ΔRevenue ÷ sales-to-capital`), which is what gives young/loss-making companies a DCF at all. Two gotchas: `sales_to_capital()` uses Damodaran's **cash-subtracted** invested capital (`equity + debt − cash`) while the older `_invested_capital` (feeding ROIC/EVA) does not, and a never-profitable firm's margin target is anchored to the **industry** operating margin, because fading toward its own loss-making history projects losses forever and values it below zero. Both were real bugs. Surfaced as `forecast.growthReconciliation` / `forecast.lifecycle` / `analysis.growthViability`.

### Sector/industry scorecard: value score + integrity questions (`group_scoring.py` + matrix augmentation)
The three scorecard-matrix endpoints (`/api/sector-metrics`, `/api/sector/{s}/industry-metrics`, `/api/industry/{i}/scorecard`) carry a **Value Score** row and a bank of **integrity questions** that `_augment_matrix_scoring` (`api.py`) layers on top of the market-cap-weighted columns. Reading this feature means reading `group_scoring.py`, the three matrix builders in `api.py`, `lib/sectorMetrics.ts`, `GroupScorePanel.tsx`, and `QualitativeBlock.tsx` together.

- **Two scoring engines — do not confuse them.** `comparitivestockanalysis.score_industry` scores single COMPANIES; `group_scoring.score_groups` scores whole GROUPS (a sector against the other sectors, or industries within one sector under that sector's weight profile). `group_scoring` mirrors `score_industry`'s method (`0.70·level + 0.30·peer`, `NEG_PROFIT_CAP`, coverage floor) but is **economic-profit-dominant** (ROIC−WACC spread weighted highest, then EVA margin + direct WACC) and swaps to the equity lens (ROE − Ke) for Financial Services / Real Estate; those two are never capped on a metric their profile excludes.
- **DISPLAY-UNIT trap.** `group_scoring` runs on the *aggregated matrix columns*, whose percents are already ×100 (a 5-point spread arrives as `5.0`, not `0.05`). Its `GROUP_METRIC_CURVES` are anchored in display units — never reuse `comparitivestockanalysis.METRIC_CURVES` (decimals) here. A magnitude test guards it.
- **The Value Score is a matrix ROW, not a per-company metric.** `_base_metric_dicts_with_score()` splices a `valueScore` def into the emitted `metrics[]` right after the Valuation group. It is deliberately NOT in `_SECTOR_METRIC_DEFS`/`metric_keys` (those drive per-company aggregation, clipping, and history, and would null the score). `METRIC_DIRECTION.valueScore = "higher"` gives the row its heatmap; the cell opens definition 435 (sector) / 323 (industry).
- **Integrity questions are ANSWERABLE, not auto-verdicts.** `build_group_integrity` always returns all 16 checks (each with an interpolated `{group}` question — no em dashes, no unclear pronouns — plus a `tier`, a severity, and figures). The frontend `buildIntegrityDeck` (`lib/sectorMetrics.ts`) turns them into a standing question deck rendered through `QualitativeBlock`'s optional `groups` prop: text box + autosave + Explain-AI, persisted under `(section, scopeKey=group, questionId="integrity-…")` with **no Convex schema change** (the keys are free-form). `ScoreExplainer.tsx` (sector/industry variants) is the on-page explanation.
- `_integrity_inputs` feeds the checks from the `industry_averages` by-year aggregates (DECIMAL units, a different methodology than the matrix), so it feeds integrity ONLY — never the clicked-cell 5-year history (which re-runs `_company_metrics` per year through the same matrix pipeline).

### Ticker identity: `security_map` + `_resolve_symbol` (read before touching any lookup)
The DB's symbology is **FMP/Wisesheets**, where a *listing line* is not a *company*. The original
export attached Goldman Sachs' statements to its PREFERRED tickers (`GS-PA`, `GS-PC`) and left the
common symbol `GS` with zero rows; the same for `MS`→`MS-PO`, `BAC`→`BAC-PP`, `BRK-B`→`BRK-A`,
`GOOGL`→`GOOG`. Search found the name, the page rendered empty. Fixed by making **CIK the identity**:

- **`security_map`** `(cik, symbol PK, symbol_sec, symbol_yf, symbol_fmp, kind, is_primary, exchange, status, valid_from, valid_to)`. Exactly one `is_primary=1` symbol per CIK carries the fundamentals; preferreds/warrants/units/dual-class siblings are aliases. `kind` ∈ `common|preferred|warrant|unit`. `status` ∈ `active|delisted|placeholder_only|awaiting_first_financials`. The three `symbol_*` columns exist because **each source needs its own spelling** (SEC vs yfinance vs the legacy FMP string).
- **`api.py#_resolve_symbol(symbol)`** folds an alias onto its primary before ANY lookup, and normalizes case + dot→dash (`BRK.B` → `BRK-A`). It backs both `/api/tickers/search` and `/api/individual/{ticker}`. The alias map is built once and **cached for the process lifetime — a backend restart is the only thing that refreshes it.** With `security_map` absent it degrades to a plain uppercase normalize, so behaviour is unchanged on a pre-remediation DB.
- **CIK `'0000000000'` is a placeholder, never an identity.** It must stay NULL in `security_map`, and the alias-map JOIN explicitly excludes it. When it was treated as real, its ~24.7k rows joined its 40 "primaries" and **637 real tickers resolved to one arbitrary company** (`/api/individual/ABBV` served Zeo Energy). Guard added; do not remove it.
- Delisted companies keep their rows forever (`status='delisted'`, `valid_to` set). Never DELETE a company.

### Quarterly + TTM store (`financials_quarterly`, `TTM_MODE`)
`data/financial_db.py` gained `save_quarters()` (Q1–Q4 from yfinance), `save_ttm()` (persists the
rolling snapshot `get_ttm()` computes — it used to be thrown away and was called by nothing), and
`derive_q4()` (no company files a Q4 10-Q, so Q4 flows = FY − (Q1+Q2+Q3), balance items copied
from the FY row).

- **`derive_q4` only runs for December fiscal year-ends.** Quarters are keyed by the CALENDAR year of the quarter-end date while the FY row is keyed by FISCAL year; for a Sep-FYE filer like AAPL those label different periods and the subtraction would mix them.
- **`TTM_MODE` ∈ `off|shadow|on`, default `off`** (mirrors the `BETA_RESOLVER` convention). `on` overlays the stored TTM row onto the latest annual row at the five per-company sites (`_company_metrics`, `_sector_current_metrics`, `_industry_scorecard`, `_company_metrics_for_industry`, `_ranking_for_industry`) via the single helper `_latest_or_ttm(rs, ticker)`; `off` is byte-identical to pre-Phase-4. The overlay sets a `_ttm_overlay` marker so `operatingLeverage` (a YoY ratio) skips itself rather than comparing a trailing-twelve-month numerator against a prior FULL year.
- **Coverage is currently ~3 companies.** The table and logic are proven, but a universe-wide quarterly backfill has not been run; `FilingsWatch` populates each company as it files.

### `remediation/` — the 2026-07-13 database remediation
One-off scripts + the standing jobs from the 8-phase repair (junk purge → CIK identity → backfill →
delisted/survivorship → quarterly/TTM → automation → FX weights + benchmark → adversarial debug).
`remediation/jobs/` is **production** (the scheduled tasks); the `phaseN_*.py` scripts are one-shot
migrations kept for auditability and re-runs. Useful entry points: `baseline.py` (before/after DB
census), `verify_stages.py` (end-to-end live check), `measure_updatability.py`,
`phase3_backfill.py` (resumable refresh sweep). `identity_lib.py` + `ttm_lib.py` are pure helpers
imported by BOTH the scripts and `backend/api.py` (`remediation/` is on `sys.path`).

### `backend/marketdata/` package
Self-contained macro-data layer feeding the Economic + Sector pages: `fred_client.py` (FRED), `shiller_data.py` (CAPE — multi-source merge to avoid a stale mirror), `damodaran_market.py`, `sector_etf.py`, `geopolitical_data.py` (EPU/GPR), `market_inputs.py` (Fed model + the implied-ERP solver whose daily snapshot the WACC reads), `expected_returns.py` (Ilmanen 4-term S&P 500 expected return: D/P + 10y real earnings CAGR + T10YIE + CAPE reversion to the 30-year median clamped ±4%/yr — no separate buyback term, index-level real earnings already embed buybacks; surfaces as economic metric 68). `refresh.py` exposes `start_scheduler()`. Two daemon threads start via `@app.on_event("startup")`: a marketdata refresh loop (CAPE/ERP/EPU/GPR ~every 6h, throttled to ≤15 min) and a weekly market-PE aggregate loop. Disable with `DISABLE_WEEKLY_PE`. `http_cache.py` backs caching (`cached_download` takes an optional `user_agent` — SEC EDGAR requires a declared contact UA).

### `backend/betas/` package — bottom-up beta engine (Damodaran Ch. 8)
Replaces the single stored regression beta with a **bottom-up beta**: SEC EDGAR 10-K XBRL supplies each company's business-segment revenues (`edgar_client.py`, ~8 req/s + contact UA), segment names map to Damodaran's 94 industry groups (`classify.py`: alias → keyword → RAG `/ask` LLM, permanently cached in `segment_industry_map`), Damodaran's published industry unlevered betas + EV/Sales multiples (`damodaran_industry.py`, betas.xls + psdata.xls + yearly archives) supply the building blocks, and `bottom_up.py#resolve_beta` walks a **7-level fallback chain** (L1 EV/Sales-weighted segments → L2 revenue weights → L3 single-industry alias → L4 in-house industry average → L5 stored regression → L6 Damodaran sector → L7 market 1.0) with guards (coverage ≥70%, segment-sum sanity, [0.2, 3.0] clamp on bottom-up levels, divergence flag) and full provenance persisted to `computed_betas`. All five engine tables live in **financials.db**.

- **Flag:** `BETA_RESOLVER` ∈ `on|shadow|off` (**default `on`** since the 2026-06-30 verification run): `shadow` computes + surfaces provenance in `waccBuild` (`betaMethod`, `betaConfidence`, `betaShadowValue`, ...) while valuations keep the stored beta; `on` makes the resolver drive **every** beta consumer — the individual/comparative fetch sites, the six SQL `t.beta` reads in api.py/industry_averages (via `_cb_beta`/`_cb_join` COALESCE against `computed_betas`), the ranking gate (resolver-rated tickers join the leaderboard), and the historical per-year WACC/EVA trend (that year's archived Damodaran βu relevered at that year's firm D/E, regression fills gaps). Rollback = `off`.
- **Warm-up:** `python -m betas.refresh --damodaran | --damodaran-hist 2013 2025 | --edgar | --classify | --resolve [--tickers ...]`. The marketdata scheduler refreshes ONLY the Damodaran beta/ps snapshot (30-day gate) — this narrowly amends the old "scheduler excludes industry Damodaran data" rule for those two datasets; wacc/margin/pe stay in valuation_debug. EDGAR/LLM warm-up is manual by design.
- **Verification:** `backend/betas/test_betas.py` replicates the Ch. 8 worked examples (Boeing 0.874, Embraer 0.707, Vans 1.23, Titan 0.85); `python -m betas.verify_betas [--impact|--panel]` writes the cross-sectional accuracy study and the diverse industries+geographies debug panel to `tmp/`. `GET /api/beta/{ticker}` (uncached) returns the full BetaResult for inspection.
- **`edgar_client.py` now serves four EDGAR consumers**, not just segments: (1) 10-K segment revenue for betas; (2) the full income-statement + operating-lease facts (`parse_financial_facts`/`get_financial_facts`, DB-cached in `xbrl_financials`) that feed the earnings bridge and the lease-adjusted WACC; (3) the latest DEF 14A proxy URL (`get_def14a`) behind the management-comp/governance AI sections; (4) the **latest-filings feed** (`recent_events`, cached in `edgar_events`) that returns only the **most recent 10-K and 10-Q** via `_ANNUAL_FORMS`/`_QUARTERLY_FORMS` + `_latest_per_bucket`, with 20-F/40-F as the foreign-filer annual fallback so ADRs are not blank. It deliberately no longer serves 8-K/6-K: the material-event stream is noise for a valuation reader, and the periodic reports are what an investor actually reads. Stale 8-K/6-K rows may linger in the `edgar_events` mirror and are skipped because they belong to no bucket. All are best-effort with DB fallbacks and are gated by `EARNINGS_XBRL` ∈ `on|off` (default on). First visit to a new ticker pays the SEC fetch; everyone after hits the cache.

### Frontend (`frontend/src/`)
React 19 + Vite + Tailwind, React Router. Pages in `src/pages/` map to the workflow steps (`Dashboard`, `EconomicPage`, `SectorDetail`, `SectorRotation`, `IndustryDetail` — one component serving both industry and comparative modes, `IndividualPage`, `ReportPage`, `SimulatorPage`, `GuidePage`). `src/lib/` holds two HTTP clients and a lot of static content:
- `api.ts` → FastAPI (`VITE_API_BASE`, default `http://localhost:8000`), with `mockData.ts` fallback when offline.
- `aiApi.ts` → RAG server (`VITE_AI_BASE`, default `http://localhost:3001`) for AI explanations/definitions. `askQuestion` is called **on a button click, never on page load**, always with a JSON `dataContext` of the page's computed figures. **Do not add a new one-click "AI analyzes this section" button** — that pattern was deliberately removed (see "Education-first contract" below). The only surviving direct `askQuestion` call sites are per-item helpers that answer one specific question, e.g. `EventsSection.tsx` ("Explain this filing").
- `*Definitions.ts` / `*Series.ts` / `questions.ts` — verbatim metric definitions, chart series config, and the qualitative-question sets. **Metric definitions and reference copy are placed verbatim from the user's source content** — make formatting-only changes, do not paraphrase the financial substance.

Charts use Recharts; the AI panel renders Markdown. `ReportPage` is the **Final Review question deck** (section `"final_review"` in the shared qualitative store) with the user's Investment Policy Statement rendered above it; the only Tiptap editor left is the Notebook's `NoteEditor` (PDF export via `jspdf`/`html2canvas`). The IPS itself is `components/PolicyCard.tsx` on the Dashboard, backed by `convex/policy.ts`.

Four cross-cutting frontend systems that span several files:
- **Shared definition sidebar + global number namespace.** A clicked metric label (`MetricTerm`) calls `openDefinition(n)` on a module store (`lib/definitionPanelStore.ts`); the `DefinitionPanel` subscribes via `useSyncExternalStore` and renders it. **Every page that shows clickable metrics must mount its own `<DefinitionPanel />`** — the store is global but the panel is not; a page that opens definitions without a mounted panel sets the store with nothing to show, and the sidebar only appears after navigating to a page that has one. `lib/allDefinitions.ts#anyDefByNumber` resolves a definition by a single integer whose *range encodes the surface*: individual 1–196 **and 500–599** (section bands in `individualDefinitions.ts#SECTION_RANGES`), comparative 201–299, industry 301–399, sector 401–499, economic panel 600+NN and credit 700+NN (their files are named `NN-*.md`; the offset is only the panel namespace). `anyDefByNumber` tries the individual resolver **first**, so a 5xx individual file wins. Prose lives as number-prefixed markdown under `src/content/{individual,comparative,industry,sector,economic,credit}/`, bundled via Vite `import.meta.glob(..., { as: "raw" })` and keyed off the leading number; the loaders pick new files up with no code change **provided the number falls inside a registered `SECTION_RANGES` band** (an unbanded number is silently dropped with a dev warning). `TITLE_OVERRIDES` carries punctuation a filename can't (`/`, `=`, `−`), and `CHART_METRIC_NAME` attaches an economic chart.
  - **The 1–196 space is full** (197–200 is a four-slot gap and 201 is the comparative surface's first number, so a def at 201 would silently shadow `comparative/201-Revenue.md` — `anyDefByNumber` tries the individual resolver first). New individual definitions go in the **500–599 block**, which is carved into per-section bands: `valuationMechanics` 500-518, `growth` 519-524, `epv` 525-529, `normalizedEarnings` 530-544, `credit` 545-559, `strategicResources` 560-566, `sevenPowers` 567-577, `esg` 578-582, `execComp` 583-590, `catalystTrap` 591-595, `filings` 596-599. The 500s are now full, so newer bands continue in the empty 800s (`capitalAllocation` 800-849, `leverageRoe` 850-869); economic is 600+NN and credit 700+NN, so neither reaches 800.
  - **Label → number** goes through `resolveDefNumber`, whose `normLabel` strips every non-alphanumeric char and retries once with a trailing parenthetical removed. So `"= Enterprise value"`, `"− Gross debt"`, and `"Cost of debt (pre→after)"` all resolve without special-casing; add a `LABEL_ALIASES` entry only when the normalized label still misses the filename stem.
  - **Two definition formats.** Numeric metrics follow the strict 9-part template (`docs/prompts/metric-definitions-master-prompt-v2.md`, gold example `content/individual/011-Interest-Coverage.md`: no em dashes, no analogies, no ambiguous pronouns, ≤2 commas per sentence, tables not bullets). Qualitative section overviews (7 Powers, ESG, exec comp, value trap, strategic resources, earnings normalization) use a lighter **concept format** (What it is / table / How this section works / Why it matters / Common traps) — do **not** force the formula parts onto a concept. Group surfaces use `metric-definitions-v3-group-surfaces.md`; economic uses the 6-part template in `economic/00-INDEX.md`. The `/metric-definitions` skill generates individual-page files; each surface has a `000-INDEX.md` checklist to keep updated.
- **Education-first contract (the individual page, and the model for every other surface).** This is a teaching product, not a data terminal, and the individual page enforces one contract that any new section must follow:
  1. **Every rendered metric label is clickable.** Wrap it in `<MetricTerm metric={label} asSpan />` (from `components/individual/DefinitionsBlock.tsx`) so it opens its sidebar definition, plus a chart when `buildSeriesIndex` (`lib/individualSeries.ts`) has a series for that number. An unresolvable label degrades silently to plain text, so wrapping is always safe. A metric only gets a **graph** if it is in `DISPLAY_METRICS` (`backend/individualanalysis.py`) → `metric_history`; point estimates (a terminal value, an intrinsic per share) correctly show text only.
  2. **Every section has a "How this works" overview**, a `<DefinitionLink number={N}>` backed by a numbered markdown explainer. Reference: FCFF #71, EVA #72, Credit #545, Earnings Normalization #530.
  3. **Interpretive sections use a user-first question deck, never a one-click AI dump.** The user answers each question in their own words (autosaved to Convex); the per-question "Explain using AI" button is a tutor that helps *after* they try. Render `<QualitativeBlock section="individual" scopeKey={ticker} onlyTitles={["<Group Title>"]} storageSuffix="..." dataContext={...} hideHeader />` and add the group to `QUALITATIVE_QUESTIONS.individual` in `lib/questions.ts`. Current decks: Strategic Resources, The 7 Powers, ESG Analysis, Executive Compensation, Board & Governance, Earnings Quality, Catalyst & Value Trap, ROE Sustainability & Leverage.
  4. **GOTCHA: any new `individual` question group MUST be added to the bottom deck's `excludeTitles` in `IndividualPage.tsx`**, or it renders twice (once in its section, once in the page-bottom bank, which shows every group except the excluded ones). No Convex schema change is ever needed: `questionId`/`scopeKey` are free-form `v.string()`.
  5. **Teaching lives in the sidebar, not in inline subheads.** Section intros are one or two plain sentences that point at the definition. Copy follows the house style below.
- **Sector Rotation is computed entirely client-side.** Unlike every other page, `SectorRotation` does not fetch its matrix from the backend. `lib/sectorRotation.ts` holds a static weighted metric×sector table; `scoreMatrix()` is a pure function of the user's per-metric direction/weight inputs (persisted to `localStorage`). The backend is hit only for the sidebar definition charts.
- **UI copy rules, enforced across all of `frontend/src` (2026-07-14).** These are hard rules, not preferences, and two of them will break the app if applied carelessly.
  - **Zero em dashes.** `grep -rn '—' frontend/src` must return nothing. When one is needed, use the punctuation the sentence actually calls for (comma, colon, or a full stop between independent clauses) or the app's existing `·` separator for labels and tooltips. **Do not substitute a hyphen.** The single hyphen in the product is the tab title, `IntrinsicFinEd - <Section>`.
  - **`−` (U+2212 MINUS SIGN) is not an em dash and is load-bearing.** It appears in ~234 places, including definition labels (`− Gross debt`, `ROIC − WACC`) that `resolveDefNumber`/`TITLE_OVERRIDES` route on. A regex sweep for "dashes" that catches it will silently break the definition sidebar. En dashes (`–`, 32 occurrences) were likewise left alone.
  - **No author names in user-facing copy.** Book and paper citations were stripped from the question decks (`lib/questions.ts`), `ScoreExplainer`, `GrowthExplainer`, `FedModelSection`, and section headings. Where an author was the subject of a sentence, the claim is now stated directly. This is a website, not a literature review.
  - **EXCEPT eponymous metric names, which must stay.** `Altman Z-Score`, `Beneish M-Score`, `Shiller CAPE (PE10)`, and `Graham Number` are the metrics' actual names *and* the definition filenames (`191-Altman-Z-Score.md`, `192-Beneish-M-Score.md`, `51-Shiller-CAPE.md`, `219-Graham-Number-Ratio.md`). `resolveDefNumber` maps the rendered label onto the filename stem, so renaming the label 404s its sidebar entry.
  - **`lib/quotes.ts` keeps its `author`/`source` fields.** The Quote of the Day renders real quotations; those are attributions, not citations, and stripping them would present someone's words as unattributed.
  - **Chrome deliberately removed (do not reinstate).** The header date and API-status badge (`ApiStatusBadge` is deleted; `useApiHealth` survives only for `PortfolioDashboard`), the sidebar "Analysis" label, the Dashboard's Final Review and Practice buttons, `QualitativeBlock`'s `N / M answered` counter, the `UNIT_TAG` unit sublabels and the universe/legend footers on both matrix tables, `SectorRotation`'s Lead/Coin/Lag sublabel (the `leadLag` field still exists in the `lib/sectorRotation.ts` data but is no longer rendered), and `GroupScorePanel`'s "N flagged" badge and its subheading. `HelpBadge` still exists and is still used on four surfaces; only the AppShell instances were dropped.

### RAG server (`rag/`)
`index_vault.py` chunks an Obsidian "Financial Texts" vault into `vault.db` (sqlite-vec, nomic-embed-text 768-d, incremental on mtime). `server.py` exposes three answer routes plus `GET /health`: `POST /ask` (full qualitative-question answers, Sonnet), `POST /explain` (explain a highlighted selection, Haiku), and `POST /define` (term definition, Haiku, glossary-cached). Each route has its own system prompt, `max_turns` cap, and `max_budget_usd` guard. The local KNN `search_vault` tool is the vault source; `WebSearch`/`WebFetch` are also allowed. Answer priority is **vault → web → general knowledge**, and it never refuses. `/ask`, `/explain`, and `/define` accept an optional `data`/page-context block of figures already computed for the subject (company, sector, yield curve); when present, those page figures are **authoritative** and override anything a web search returns, so explanations stay tied to the app's own valuation rather than generic definitions.

## Conventions specific to this repo
- **DB path is overridable** via the `FINANCIALS_DB` env var; defaults to repo-root `financials.db`. `backend/api.py` injects `backend/`, `data/`, and `remediation/` onto `sys.path` so those modules import by bare name. Use `FINANCIALS_DB` to test a migration against a copy before swapping it in — that is how the remediation shipped.
- **Ingest validation.** `data/financial_db.py#is_valid_year_period(year, period)` gates every write path. The 2026-05 Wisesheets export wrote ~13k rows whose `Calendar Year`/`Period` held error strings ("Unavailable", "2025 data not available yet."); they are now quarantined and the guard keeps them out. Any new ingest path must call it.
- The marketdata scheduler **excludes** sector/industry Damodaran data **except** the beta/EV-Sales datasets consumed by `backend/betas/` (see that package's section) — wacc/margin/pe industry files remain in `valuation_debug` tooling.
- `make_excel_db.py`, `adr_mapping.json`, and `data/migrate_db_schema.py` are one-off / migration tooling for the fundamentals DB — not part of the request path.

## Gotchas
- **Tailwind purges theme keyframes.** A `@keyframes` declared in `tailwind.config.js` is only emitted when its `animate-*` utility actually appears in scanned markup. Hand-written CSS that references such a keyframe by name (e.g. the loading-skeleton `.shimmer` sweep) renders **frozen** in a production build with no error. Declare any keyframe used by hand-authored CSS directly in `src/index.css`. Loading skeletons (`ChartSkeleton`/`MatrixSkeleton`/`ScorecardSkeleton`/`PanelSkeleton`) live in `src/components/Skeletons.tsx` and must stay reduced-motion-safe (the `.shimmer` sweep falls back to an opacity pulse, never a static bar).
- **Recession bands are NBER-published dates, not raw USREC.** `backend/api.py#fetch_recession_bands` returns each recession with its exact published peak→trough `range` + `label` from an authoritative table; USREC is only a fallback for a future recession not yet tabulated. The shared `RecessionOverlay` renders these on every economic chart.
- **Restarting the live backend.** `Invoke-CimMethod Win32_Process Create` returns **returnValue=2 (access denied)**, so the old WMI trick is dead. The `C:\Program Files\WindowsApps\...` glob in earlier docs **no longer resolves either** (that directory is ACL'd). The path that works is the one `sys.executable` reports:
  ```powershell
  $c = Get-NetTCPConnection -LocalPort 8000 -State Listen | Select-Object -First 1
  Stop-Process -Id $c.OwningProcess -Force
  $exe = "C:\Users\Zaki_Mir\AppData\Local\Microsoft\WindowsApps\PythonSoftwareFoundation.Python.3.11_qbz5n2kfra8p0\python.exe"
  Start-Process -FilePath $exe -ArgumentList '-m','uvicorn','backend.api:app','--host','127.0.0.1','--port','8000','--workers','1','--proxy-headers','--forwarded-allow-ips=127.0.0.1' -WorkingDirectory '<repo>' -WindowStyle Hidden
  ```
  (The bare `python.exe` in that same folder IS the broken alias — it is the `PythonSoftwareFoundation.*` subpath that is real.) A restart **zeroes the in-process cache** and **rebuilds the `security_map` alias cache**, so `POST /api/cache/clear` is unnecessary after one.
- **SQLite has one writer.** A long backfill sweep writing to `financials.db` while you run analytic queries against it will hand the sweep `database is locked`; `phase3_backfill.py` aborts by design after 15 consecutive lock failures (exit 4) and resumes cleanly from its checkpoint. Don't interpret that as data loss — and don't hammer the DB while a sweep runs.
- **yfinance `FastInfo` is attribute-accessed.** `fi.get("last_price")` silently returns `None`; `getattr(fi, "last_price", None)` works. A probe built on `.get()` will report a confident, wrong 0%.
- **Never call a FastAPI route function from another route.** `/api/quotes` used to call `quote_endpoint(sym)`, which bound the ticker to the `request` parameter; every symbol threw, a broad `except` swallowed it, and the simulator silently priced nothing while returning HTTP 200. Extract a plain helper (`_quote_for(ticker)`) and have both call it. `test_quote_batch.py` guards this.
- **Never pipe a native build through `2>&1` in PowerShell 5.1.** `.\build-prod.ps1 ... 2>&1` wraps Vite's yellow chunk-size warning in a `NativeCommandError` and reports a failure on a build that actually succeeded. Run it without the redirect and check `dist/` (and grep the bundle for a `localhost:8000` leak, which `build-prod.ps1` also guards).
