# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**IntrinsicFinEd / IntrinsicEd** — a non-speculative, valuation-based investing-education platform. It walks a user through a staged intrinsic-value workflow (Economic → Sector → Industry → Comparative → Individual company → Final Review), with a paper-trading Simulator and a Guide alongside, and uses LLMs to explain *why* each metric matters in plain language, instead of presenting walls of data.

It is a three-process system: a **React/Vite frontend**, a **FastAPI analysis backend** (port 8000), and a **local RAG server** (port 3001). Convex is the auth + user-data store. The pieces are loosely coupled over HTTP — the frontend falls back to synthetic mock data when a backend is offline, and surfaces a persistent `DataStatusBanner` ("Live data unavailable — showing simulated placeholder data") so users are never shown fabricated figures silently.

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

# Backend tests (network-free)
cd backend && python -m pytest test_valuation_fixes.py test_group_scoring.py test_growth_estimation.py betas/test_betas.py marketdata/test_marketdata.py -q
cd backend && python -m pytest test_valuation_fixes.py -q -k negative_profit   # a single test
```

The backend tests are `backend/test_valuation_fixes.py` (valuation/scoring/FX/normalization/
value-lens regression — dict rows stand in for sqlite3.Row), `backend/test_group_scoring.py`
(sector/industry scorecard value score + the 16 integrity questions — display-unit curves,
profile-aware caps, one fire/non-fire/na test per check), `backend/test_growth_estimation.py`
(fundamental growth, the sales-to-capital reinvestment bridge, the life-cycle clamps, and the
17-question growth-viability deck), `backend/betas/test_betas.py`
(bottom-up beta worked examples), and `backend/marketdata/test_marketdata.py` (marketdata layer
incl. the expected-return decomposition). Much of the valuation engine is otherwise untested;
add a characterization test when you touch scoring, DCF, or a normalization.

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

`data/daily_update.py` (via `FinancialDB.update_ticker`/`update_all`, triggered by the admin
`POST /api/daily-update`) pulls new fiscal years from yfinance into `financials.db`. It is
**additive-only** (`INSERT OR IGNORE` — adds genuinely-new years, never restates existing rows)
and **manual** — unlike the macro/marketdata scheduler, nothing auto-refreshes per-ticker
fundamentals. `update_all` isolates each ticker (`try/except` → `-1`), but there are **~31k
tickers** at ~1s each, so a full-universe refresh is an ~8h+ yfinance-rate-limited job — refresh
on-demand per ticker, not all at once. After a manual update, `POST /api/cache/clear` (admin) so
the 30-min-cached endpoints re-read. The `/api/individual/{ticker}` response carries an additive
`analysis_error` field (null on success) so the frontend distinguishes a crashed valuation
pipeline from a ticker with no data.

## Architecture

### Three data stores, three roles
- **`financials.db`** (repo root, ~600 MB, git-ignored) — the company fundamentals warehouse. Per-ticker, per-year financial metrics ingested from Excel and updated via yfinance. Owned by `data/financial_db.py`. **Backups are committed as `financials.db.backup-*` — do not treat those as the live DB.**
- **`backend/market_data.db`** — macro/market series (CAPE, implied ERP, EPU, GPR, Fed-model inputs, sector-ETF history) populated *only* by the marketdata refresh scheduler. The `/api/economic` and sector-ETF endpoints read from here; an empty series renders as a blank chart rather than erroring.
- **Convex** (`frontend/convex/`) — per-user application state: qualitative answers, cached AI explanations (`aiAnswers`), notebook notes (Tiptap), the watchlist, the simulator tables (`sim*`), and the Investment Policy Statement (`policy`, singleton per user). Auth via `@convex-dev/auth`. This is the only store the frontend writes to directly. The `reports` table + `convex/reports.ts` are **orphaned** (the old Tiptap final report was replaced by Final Review questions) — don't build on them.

### Backend (`backend/api.py` + `data/`)
`backend/api.py` (~4800 lines) is the single FastAPI app. At startup it imports the heavy analysis modules **once** (~10s, pulls in pandas/yfinance) and reuses them per-request:
- `data/financial_db.py` — `FinancialDB`, the core ingest/query/TTM engine over `financials.db`.
- `backend/individualanalysis.py` — single-ticker snapshot: DCF (+ reverse DCF solved off the same FCFF engine), EVA/residual-income/DDM models, value scoring, full ratio decomposition, shenanigans/forensics, credit analysis, R&D capitalization, EPV / Tobin's Q / owner earnings, verdicts.
- `backend/earnings_normalization.py` — Damodaran Ch.9 restatements (operating leases → debt, investment-income removal ex-financials, one-time normalization, goodwill/SBC); its normalized EBIT also feeds EPV, and its lease PV feeds the WACC debt weight.
- `backend/comparitivestockanalysis.py` — industry panel + cross-company ranking/scoring (the per-COMPANY value score `score_industry`).
- `backend/group_scoring.py` — the per-GROUP scorecard: a sector/industry 0–100 Value Score plus the 16 answerable "integrity questions". Distinct engine from `score_industry` — see the scorecard subsection below.
- `backend/industry_averages.py` — sector/industry averages by year, CAPE, DCF, ranking. **Note:** in-house sector/industry averages are survivorship/look-ahead biased — Damodaran (via `backend/marketdata/`) is the authoritative unbiased benchmark. The industry life-cycle classifier and Porter strategic-group map live in `api.py` (`_lifecycle_from_series`, `_strategic_groups_from_metrics`) on top of these aggregates.
- `backend/esg_data.py` — ESG scores cache. Yahoo's free ESG feed is dead (404s), so the block returns an `ai_qualitative` marker and the numeric tiles simply do not render; the ESG section is a **user-answered question deck** (it no longer auto-generates an AI assessment). The numeric hook self-heals if the feed ever returns.

Routes are grouped: `/api/economic`, `/api/sectors` + `/api/sector/{sector}`, `/api/industries` + `/api/industry/{industry}` (+ `/scorecard`, `/strategic-groups`), `/api/comparative/{industry}` (+ `/ranking`, `/company-metrics`), `/api/individual/{ticker}`, `/api/quote/{ticker}`, `/api/tickers/search`. Every endpoint returns the `SectionData` shape consumed by `frontend/src/lib/types.ts`; the industry/sector payloads also carry a `lifecycle` key.

### Valuation, scoring & currency invariants (read before editing the engines)
These cross-cut `individualanalysis.py`, `comparitivestockanalysis.py`, `industry_averages.py`, and `api.py`, and have each caused silent, plausible-but-wrong output:

- **Rows must be ascending by fiscal year.** Snapshot/metric builders take "latest" as `rows[-1]` and compute YoY/growth oldest→newest. `build_snapshot`, `build_individual_snapshot`, `compute_forecast`, and `metric_history` now defensively `sorted(rows, key=Calendar Year)` internally — keep that guard on any new function that indexes rows positionally. (A caller once passed DESC-sorted rows and every company was scored on its *oldest* year.)
- **Comparative value score** (`comparitivestockanalysis.score_industry`) is **magnitude-aware and sector-weighted**, not a pure peer percentile: `metric_score = 0.70·level + 0.30·peer_percentile`, where `level` comes from absolute calibration curves (`METRIC_CURVES`, anchored on `individualanalysis.QUALITY_THRESHOLDS`), weighted by `WEIGHTS_BY_SECTOR` (per-GICS-sector profiles + `DEFAULT_WEIGHTS`, RAG-grounded), then a **hard cap (`NEG_PROFIT_CAP=30`)** so negative profitability / negative EVA can never rank high. It mirrors the individual page's `_build_verdict` quality score. Tied values share the average percentile.
- **Market Cap is stored in the company's reporting currency** (e.g. TSM in TWD, SK Hynix in KRW), not USD. Cross-currency size ranking/weighting goes through the `fx_rates` table (`FinancialDB.refresh_fx_rates()` from yfinance, `get_fx_rates()`); the comparative ranking queries `LEFT JOIN fx_rates` and rank on `Market Cap * usd_per_unit`, and `api.py:_mc_to_usd` converts the displayed/weight cap. **Ratios stay in local currency** (currency-neutral — never FX-convert a ratio). The DB's `Reported Currency` column contains some garbage values; unconvertible currencies drop out of size ranking.
- **Displayed spreads are derived, not re-aggregated.** Sector/industry averages winsorize each metric independently, which breaks `excess = ROE − Ke`; `_aggregate_weighted_columns` therefore recomputes `excessReturnEquity` from the clipped `roeEquity − costOfEquity` so the three displayed numbers reconcile.
- **Most sector/industry average queries filter `Reported Currency = 'USD'`**; the two per-ticker *ranking* endpoints (`_ranking_for_industry`, `comparative_endpoint`) are the ones that include foreign names (via FX).
- **Every individual-page analysis block follows one contract.** Compute inside `build_individual_snapshot` in its own try/except that logs and falls back to `None` (a crashed block must never break the snapshot); return `{"applicable": False, "reason": …}` markers instead of raising for companies the method doesn't fit (the financial-sector guard `fcff_applicable`/`_FCFF_GUARD_SECTORS` gates FCFF-family methods); add a dataclass field + a camelCase key in `api.py#_snapshot_to_dict`; render as a `components/individual/*Section.tsx` mounted in `IndividualPage.tsx`. Follow this shape for any new method.
- **Cost of capital is deliberately mixed-rate.** `compute_wacc` uses the company's own *effective* tax rate for NOPAT/FCFF but the *marginal* rate (`MARGINAL_TAX_RATE = 0.21`, matching `betas/`) for the after-tax cost of debt — Damodaran Ch.8; don't "fix" the mismatch. The ERP is the **live implied two-stage premium** read from the `market_inputs` table (7-day freshness window) with `FIXED_EQUITY_RISK_PREMIUM = 0.045` only as fallback; `waccBuild.erpMethod` records which path ran. The PV of operating leases (XBRL `OperatingLeaseLiability`, absent from yfinance Total Debt) is added to the debt weight via `compute_wacc(lease_debt=…)`; on-balance-sheet *capital* leases are already inside Total Debt and must never be re-added.

- **Forward growth is life-cycle-aware and flag-gated (Damodaran Ch.11).** `individualanalysis.compute_forecast` computes growth two ways: the historical revenue regression, and **fundamental growth** = `reinvestment rate × ROIC` plus a changing-ROIC efficiency term (capped at 0.10). `lifecycle_from_series` classifies the company (emerging/growth/mature/declining) from its own revenue-growth and margin series, and the stage sets the growth clamp (60/35/25/15%) and decides whether the revenue trend leads or blends 0.60 toward fundamental. **`GROWTH_MODEL` ∈ `regression|shadow|fundamental` (default `shadow`)**: `shadow` surfaces the whole reconciliation but keeps the regression driving the DCF, so no existing valuation moves; `fundamental` lets the reconciled rate drive it; `regression` is the rollback. **When ROIC ≤ 0** (and only then) reinvestment switches to the **sales-to-capital bridge** (`ΔRevenue ÷ sales-to-capital`), which is what gives young/loss-making companies a DCF at all. Two gotchas: `sales_to_capital()` uses Damodaran's **cash-subtracted** invested capital (`equity + debt − cash`) while the older `_invested_capital` (feeding ROIC/EVA) does not, and a never-profitable firm's margin target is anchored to the **industry** operating margin, because fading toward its own loss-making history projects losses forever and values it below zero. Both were real bugs. Surfaced as `forecast.growthReconciliation` / `forecast.lifecycle` / `analysis.growthViability`.

### Sector/industry scorecard: value score + integrity questions (`group_scoring.py` + matrix augmentation)
The three scorecard-matrix endpoints (`/api/sector-metrics`, `/api/sector/{s}/industry-metrics`, `/api/industry/{i}/scorecard`) carry a **Value Score** row and a bank of **integrity questions** that `_augment_matrix_scoring` (`api.py`) layers on top of the market-cap-weighted columns. Reading this feature means reading `group_scoring.py`, the three matrix builders in `api.py`, `lib/sectorMetrics.ts`, `GroupScorePanel.tsx`, and `QualitativeBlock.tsx` together.

- **Two scoring engines — do not confuse them.** `comparitivestockanalysis.score_industry` scores single COMPANIES; `group_scoring.score_groups` scores whole GROUPS (a sector against the other sectors, or industries within one sector under that sector's weight profile). `group_scoring` mirrors `score_industry`'s method (`0.70·level + 0.30·peer`, `NEG_PROFIT_CAP`, coverage floor) but is **economic-profit-dominant** (ROIC−WACC spread weighted highest, then EVA margin + direct WACC) and swaps to the equity lens (ROE − Ke) for Financial Services / Real Estate; those two are never capped on a metric their profile excludes.
- **DISPLAY-UNIT trap.** `group_scoring` runs on the *aggregated matrix columns*, whose percents are already ×100 (a 5-point spread arrives as `5.0`, not `0.05`). Its `GROUP_METRIC_CURVES` are anchored in display units — never reuse `comparitivestockanalysis.METRIC_CURVES` (decimals) here. A magnitude test guards it.
- **The Value Score is a matrix ROW, not a per-company metric.** `_base_metric_dicts_with_score()` splices a `valueScore` def into the emitted `metrics[]` right after the Valuation group. It is deliberately NOT in `_SECTOR_METRIC_DEFS`/`metric_keys` (those drive per-company aggregation, clipping, and history, and would null the score). `METRIC_DIRECTION.valueScore = "higher"` gives the row its heatmap; the cell opens definition 435 (sector) / 323 (industry).
- **Integrity questions are ANSWERABLE, not auto-verdicts.** `build_group_integrity` always returns all 16 checks (each with an interpolated `{group}` question — no em dashes, no unclear pronouns — plus a `tier`, a severity, and figures). The frontend `buildIntegrityDeck` (`lib/sectorMetrics.ts`) turns them into a standing question deck rendered through `QualitativeBlock`'s optional `groups` prop: text box + autosave + Explain-AI, persisted under `(section, scopeKey=group, questionId="integrity-…")` with **no Convex schema change** (the keys are free-form). `ScoreExplainer.tsx` (sector/industry variants) is the on-page explanation.
- `_integrity_inputs` feeds the checks from the `industry_averages` by-year aggregates (DECIMAL units, a different methodology than the matrix), so it feeds integrity ONLY — never the clicked-cell 5-year history (which re-runs `_company_metrics` per year through the same matrix pipeline).

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

Three cross-cutting frontend systems that span several files:
- **Shared definition sidebar + global number namespace.** A clicked metric label (`MetricTerm`) calls `openDefinition(n)` on a module store (`lib/definitionPanelStore.ts`); the `DefinitionPanel` subscribes via `useSyncExternalStore` and renders it. **Every page that shows clickable metrics must mount its own `<DefinitionPanel />`** — the store is global but the panel is not; a page that opens definitions without a mounted panel sets the store with nothing to show, and the sidebar only appears after navigating to a page that has one. `lib/allDefinitions.ts#anyDefByNumber` resolves a definition by a single integer whose *range encodes the surface*: individual 1–196 **and 500–599** (section bands in `individualDefinitions.ts#SECTION_RANGES`), comparative 201–299, industry 301–399, sector 401–499, economic panel 600+NN and credit 700+NN (their files are named `NN-*.md`; the offset is only the panel namespace). `anyDefByNumber` tries the individual resolver **first**, so a 5xx individual file wins. Prose lives as number-prefixed markdown under `src/content/{individual,comparative,industry,sector,economic,credit}/`, bundled via Vite `import.meta.glob(..., { as: "raw" })` and keyed off the leading number; the loaders pick new files up with no code change **provided the number falls inside a registered `SECTION_RANGES` band** (an unbanded number is silently dropped with a dev warning). `TITLE_OVERRIDES` carries punctuation a filename can't (`/`, `=`, `−`), and `CHART_METRIC_NAME` attaches an economic chart.
  - **The 1–196 space is full** (197–200 is a four-slot gap and 201 is the comparative surface's first number, so a def at 201 would silently shadow `comparative/201-Revenue.md` — `anyDefByNumber` tries the individual resolver first). New individual definitions go in the **500–599 block**, which is carved into per-section bands: `valuationMechanics` 500-518, `growth` 519-524, `epv` 525-529, `normalizedEarnings` 530-544, `credit` 545-559, `strategicResources` 560-566, `sevenPowers` 567-577, `esg` 578-582, `execComp` 583-590, `catalystTrap` 591-595, `filings` 596-599.
  - **Label → number** goes through `resolveDefNumber`, whose `normLabel` strips every non-alphanumeric char and retries once with a trailing parenthetical removed. So `"= Enterprise value"`, `"− Gross debt"`, and `"Cost of debt (pre→after)"` all resolve without special-casing; add a `LABEL_ALIASES` entry only when the normalized label still misses the filename stem.
  - **Two definition formats.** Numeric metrics follow the strict 9-part template (`docs/prompts/metric-definitions-master-prompt-v2.md`, gold example `content/individual/011-Interest-Coverage.md`: no em dashes, no analogies, no ambiguous pronouns, ≤2 commas per sentence, tables not bullets). Qualitative section overviews (7 Powers, ESG, exec comp, value trap, strategic resources, earnings normalization) use a lighter **concept format** (What it is / table / How this section works / Why it matters / Common traps) — do **not** force the formula parts onto a concept. Group surfaces use `metric-definitions-v3-group-surfaces.md`; economic uses the 6-part template in `economic/00-INDEX.md`. The `/metric-definitions` skill generates individual-page files; each surface has a `000-INDEX.md` checklist to keep updated.
- **Education-first contract (the individual page, and the model for every other surface).** This is a teaching product, not a data terminal, and the individual page enforces one contract that any new section must follow:
  1. **Every rendered metric label is clickable.** Wrap it in `<MetricTerm metric={label} asSpan />` (from `components/individual/DefinitionsBlock.tsx`) so it opens its sidebar definition, plus a chart when `buildSeriesIndex` (`lib/individualSeries.ts`) has a series for that number. An unresolvable label degrades silently to plain text, so wrapping is always safe. A metric only gets a **graph** if it is in `DISPLAY_METRICS` (`backend/individualanalysis.py`) → `metric_history`; point estimates (a terminal value, an intrinsic per share) correctly show text only.
  2. **Every section has a "How this works" overview**, a `<DefinitionLink number={N}>` backed by a numbered markdown explainer. Reference: FCFF #71, EVA #72, Credit #545, Earnings Normalization #530.
  3. **Interpretive sections use a user-first question deck, never a one-click AI dump.** The user answers each question in their own words (autosaved to Convex); the per-question "Explain using AI" button is a tutor that helps *after* they try. Render `<QualitativeBlock section="individual" scopeKey={ticker} onlyTitles={["<Group Title>"]} storageSuffix="..." dataContext={...} hideHeader />` and add the group to `QUALITATIVE_QUESTIONS.individual` in `lib/questions.ts`. Current decks: Strategic Resources, The 7 Powers, ESG Analysis, Executive Compensation, Board & Governance, Earnings Quality, Catalyst & Value Trap.
  4. **GOTCHA: any new `individual` question group MUST be added to the bottom deck's `excludeTitles` in `IndividualPage.tsx`**, or it renders twice (once in its section, once in the page-bottom bank, which shows every group except the excluded ones). No Convex schema change is ever needed: `questionId`/`scopeKey` are free-form `v.string()`.
  5. **Teaching lives in the sidebar, not in inline subheads.** Section intros are one or two plain sentences that point at the definition. Copy follows the house style (no em dashes, no ambiguous pronouns).
- **Sector Rotation is computed entirely client-side.** Unlike every other page, `SectorRotation` does not fetch its matrix from the backend. `lib/sectorRotation.ts` holds a static weighted metric×sector table; `scoreMatrix()` is a pure function of the user's per-metric direction/weight inputs (persisted to `localStorage`). The backend is hit only for the sidebar definition charts.

### RAG server (`rag/`)
`index_vault.py` chunks an Obsidian "Financial Texts" vault into `vault.db` (sqlite-vec, nomic-embed-text 768-d, incremental on mtime). `server.py` exposes three answer routes plus `GET /health`: `POST /ask` (full qualitative-question answers, Sonnet), `POST /explain` (explain a highlighted selection, Haiku), and `POST /define` (term definition, Haiku, glossary-cached). Each route has its own system prompt, `max_turns` cap, and `max_budget_usd` guard. The local KNN `search_vault` tool is the vault source; `WebSearch`/`WebFetch` are also allowed. Answer priority is **vault → web → general knowledge**, and it never refuses. `/ask`, `/explain`, and `/define` accept an optional `data`/page-context block of figures already computed for the subject (company, sector, yield curve); when present, those page figures are **authoritative** and override anything a web search returns, so explanations stay tied to the app's own valuation rather than generic definitions.

## Conventions specific to this repo
- **DB path is overridable** via the `FINANCIALS_DB` env var; defaults to repo-root `financials.db`. `backend/api.py` injects `backend/` and `data/` onto `sys.path` so analysis modules import by bare name.
- The marketdata scheduler **excludes** sector/industry Damodaran data **except** the beta/EV-Sales datasets consumed by `backend/betas/` (see that package's section) — wacc/margin/pe industry files remain in `valuation_debug` tooling.
- `make_excel_db.py`, `adr_mapping.json`, and `data/migrate_db_schema.py` are one-off / migration tooling for the fundamentals DB — not part of the request path.

## Gotchas
- **Tailwind purges theme keyframes.** A `@keyframes` declared in `tailwind.config.js` is only emitted when its `animate-*` utility actually appears in scanned markup. Hand-written CSS that references such a keyframe by name (e.g. the loading-skeleton `.shimmer` sweep) renders **frozen** in a production build with no error. Declare any keyframe used by hand-authored CSS directly in `src/index.css`. Loading skeletons (`ChartSkeleton`/`MatrixSkeleton`/`ScorecardSkeleton`/`PanelSkeleton`) live in `src/components/Skeletons.tsx` and must stay reduced-motion-safe (the `.shimmer` sweep falls back to an opacity pulse, never a static bar).
- **Recession bands are NBER-published dates, not raw USREC.** `backend/api.py#fetch_recession_bands` returns each recession with its exact published peak→trough `range` + `label` from an authoritative table; USREC is only a fallback for a future recession not yet tabulated. The shared `RecessionOverlay` renders these on every economic chart.
- **Restarting the live backend.** `Invoke-CimMethod Win32_Process Create` now returns **returnValue=2 (access denied)**, so the old WMI launch trick is dead. Use `Stop-Process -Id <pid> -Force`, then `Start-Process` (detached, survives the shell) with the **real** interpreter, not the WindowsApps alias:
  `Start-Process -FilePath "C:\Program Files\WindowsApps\PythonSoftwareFoundation.Python.3.11_*\python3.11.exe" -ArgumentList '-m','uvicorn','backend.api:app','--host','127.0.0.1','--port','8000','--workers','1','--proxy-headers','--forwarded-allow-ips=127.0.0.1' -WorkingDirectory '<repo>' -WindowStyle Hidden`
  A restart **zeroes the in-process cache**, so the admin-token-gated `POST /api/cache/clear` is unnecessary after one.
- **Never pipe a native build through `2>&1` in PowerShell 5.1.** `.\build-prod.ps1 ... 2>&1` wraps Vite's yellow chunk-size warning in a `NativeCommandError` and reports a failure on a build that actually succeeded. Run it without the redirect and check `dist/` (and grep the bundle for a `localhost:8000` leak, which `build-prod.ps1` also guards).
