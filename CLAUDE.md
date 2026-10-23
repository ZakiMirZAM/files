# CLAUDE.md

Guidance for Claude Code in this repo. Full subsystem detail lives in `docs/architecture.md`;
dated change history in `docs/history.md`. This file keeps the rules, invariants, and gotchas.

## Project

**IntrinsicFinEd / IntrinsicEd**: a non-speculative, valuation-based investing-education platform. Staged workflow Economic → Sector → Industry → Comparative → Individual → Final Review, plus a paper-trading Simulator and a Guide. LLMs explain *why* each metric matters instead of showing walls of data.

Three processes: **React/Vite frontend**, **FastAPI backend** (:8000), **local RAG server** (:3001). Convex = auth + user data. When a backend is offline the frontend falls back to mock data and shows `DataStatusBanner`, so fabricated figures are never shown silently. **Live in production** at `https://intrinsicfined.org`.

## Before building anything
1. Check `docs/BACKLOG.md` and grep the code for the feature.
2. Report **EXISTS** (stop, show the owner), **PARTIAL** (extend it, never a parallel version), or **NEW**.
3. After shipping, update `docs/BACKLOG.md`.

## Running the system
```bash
pip install -r backend/requirements.txt && uvicorn backend.api:app --reload --port 8000   # or start_backend.bat
cd frontend && npm install && npm run dev        # vite 5173 + convex dev
cd rag && pip install -r requirements.txt && python server.py
```
RAG needs **Ollama** (`ollama serve`, `ollama pull nomic-embed-text`) and a Claude Code **Max login**. **No `ANTHROPIC_API_KEY`** in the shell: the SDK prefers a key and that breaks the Max-login path.

**Dev backend caveat:** `uvicorn --reload` does not reliably pick up analysis-module edits. Restart uvicorn manually; comparative endpoints are `@cached` 30 min (`POST /api/cache/clear` or restart).

## Lint / build / test
```bash
cd frontend && npx tsc -p tsconfig.app.json --noEmit   # the REAL typecheck of src/
cd frontend && npm run lint     # does NOT reliably typecheck src/ (root tsconfig is references-only)
cd frontend && npm run build    # vite build only, no typecheck
cd frontend && npm test         # vitest
cd backend && python -m pytest test_*.py betas/test_betas.py marketdata/test_marketdata.py -q   # network-free, ~3s
python remediation/verify_stages.py   # live end-to-end check (server on :8000), asserts real content
```
Much of the valuation engine is otherwise untested: add a characterization test when you touch scoring, DCF, or a normalization. Test catalogue: `docs/architecture.md`.

## Production & deployment
```
Cloudflare Pages (frontend/dist)                 intrinsicfined.org, www
Cloudflare Tunnel → nginx :8080 → backend :8000   api.intrinsicfined.org
                               → RAG :3001        ai.intrinsicfined.org
Convex Cloud (prod upbeat-rooster-226)            auth + user data
```
- Five local processes: ollama, backend (`start_backend_prod.bat`), RAG, nginx (`deploy/nginx.conf`), cloudflared. `START_WEBSITE.bat` → `start_all.ps1` starts them (Startup-folder shortcut at login). Runbooks: `deploy/DEPLOY.md`, `deploy/WALKTHROUGH.md`.
- Prod hardening in `backend/api.py` (`ENV=production`): admin routes need `X-Admin-Token` == `ADMIN_TOKEN`, **fail-closed**; `daily-update` regex-allowlists tickers; slowapi rate limits; `ALLOWED_ORIGINS` CORS; `/docs` off.
- Prod env vars: `ENV=production`, `ADMIN_TOKEN`, `ALLOWED_ORIGINS=https://intrinsicfined.org,https://www.intrinsicfined.org`, `FRED_API_KEY` (env-only; missing ⇒ FRED series empty, app still runs).
- **Build gotcha:** `VITE_*` URLs are baked in at build time and `.env.local` (dev Convex) beats `.env.production`. Use **`frontend/build-prod.ps1 -ConvexUrl https://upbeat-rooster-226.convex.cloud`** (guards against a `localhost` leak). Deploy: `npx wrangler pages deploy dist --project-name intrinsicfined`.
- **Ship order** when Convex schema changes: `npx convex deploy --yes` (from `frontend/`; codegen/dev only touch dev) → `build-prod.ps1` → `wrangler pages deploy`. Backend-only: uvicorn restart.
- **Convex prod auth gotcha:** `@convex-dev/auth` masks every failure as "Server Error". Prod MUST have `JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL` (`npx convex env list --prod`). Dev accounts don't exist on prod.
- **Rollback:** `files_local/` (sibling of repo) is a pristine pre-hardening copy.

### rag/server.py is protected
RAG protection (origin pinning, rate limits, CORS strip, body caps) is at **nginx**. Never change `rag/server.py`'s prompt, model, or Claude SDK logic without explicit owner approval. Prompts are **hash-pinned**: any prompt edit must update `EXPECTED` in `rag/test_prompts.py` in the same commit; runtime prompt mutation is banned. `options_for` must keep `setting_sources=[]` + `strict_mcp_config=True` (`None` loads this CLAUDE.md, skills and hooks; `rag/eval/verify_isolation.py` asserts it). History of approved changes: `docs/history.md`.

## Data updates
Four scheduled tasks under `\IntrinsicFinEd\` (`remediation/jobs/`, `register_tasks.ps1`): FilingsWatch (daily), UniverseSync (weekly Mon), MarketWeekly (Sat), BulkSweep (quarterly). Details in `docs/architecture.md`.
- `FinancialDB.update_ticker` is **additive-only** (`INSERT OR IGNORE`); `fill_gaps=True` fills **NULL columns only**, never overwrites.
- Full-universe sweeps: `remediation/phase3_backfill.py <db> --missing --frozen` (resumable), not `update_all`.
- After any manual write: `POST /api/cache/clear` or restart.

## Architecture (short)
- **`financials.db`** (repo root, git-ignored): `financials` (annual, PK Ticker+Calendar Year, `Period`='FY'), `financials_quarterly` (Q1..Q4|TTM, separate **by design**), `security_map`, `tickers` (no `Cik` column), `financials_quarantine`, `rekey_audit`, `damodaran_benchmark`, beta tables, `fx_rates`, `job_runs`. **`financials.db.backup-*` / `.pre-swap-*` are not the live DB.**
- **`backend/market_data.db`**: macro series, written only by the marketdata scheduler.
- **Convex**: per-user state (answers, `aiAnswers`, notes, watchlist, `sim*`, `policy`). `reports` table + `convex/reports.ts` are **orphaned**; don't build on them.
- `backend/api.py` (~4800 lines, single app) → `individualanalysis.py`, `earnings_normalization.py`, `comparitivestockanalysis.py` (`score_industry`, per COMPANY), `group_scoring.py` (per GROUP), `industry_averages.py`, `marketdata/`, `betas/`. Every endpoint returns `SectionData` (`frontend/src/lib/types.ts`).
- Flags: `GROWTH_MODEL` regression|shadow|fundamental (default shadow), `TTM_MODE` off|shadow|on (default off), `BETA_RESOLVER` on|shadow|off (default on), `EARNINGS_XBRL`, `RAG_RESEARCH`, `RAG_CALC`, `VALUATION_ENGINE=legacy`.

## Invariants (each has caused silent, plausible-but-wrong output)
- **Rows ascending by fiscal year.** "Latest" = `rows[-1]`. Keep the internal `sorted(rows, key=Calendar Year)` guard on any function that indexes rows positionally.
- **Market Cap is stored in the reporting currency** (TSM in TWD). Cross-currency size goes through `fx_rates` / `_mc_to_usd`. **Never FX-convert a ratio or a metric VALUE.**
- **Three currency policies coexist:** (a) by-year aggregates weight by `_FX_WEIGHT_SQL` (unknown currency ⇒ NULL weight ⇒ row drops; caps bounded `>0` and `<1e14`); (b) scorecard matrices + ranking convert via `_mc_to_usd` / `LEFT JOIN fx_rates` with a $100M floor; (c) a few helpers hard-filter `Reported Currency='USD'`. Know which one you're in.
- **Comparative score** = `0.70·level + 0.30·peer`, `WEIGHTS_BY_SECTOR`, hard cap `NEG_PROFIT_CAP=30`. **Two engines, don't confuse:** `score_industry` (companies) vs `group_scoring.score_groups` (groups, economic-profit-dominant, equity lens for Financials/Real Estate).
- **DISPLAY-UNIT trap:** `group_scoring` runs on ×100 matrix columns; `GROUP_METRIC_CURVES` are display units. Never reuse `METRIC_CURVES` (decimals) there. Value Score is a matrix ROW, not in `_SECTOR_METRIC_DEFS`.
- **Integrity questions are answerable, not verdicts.** `_integrity_inputs` feeds integrity ONLY, never the clicked-cell history.
- **Displayed spreads are derived:** `excessReturnEquity` is recomputed from clipped `roeEquity − costOfEquity`.
- **Individual-page block contract:** compute in `build_individual_snapshot` in its own try/except → `None`; return `{"applicable": False, "reason": …}` instead of raising (`_FCFF_GUARD_SECTORS`); dataclass field + camelCase key in `_snapshot_to_dict`; render as `components/individual/*Section.tsx`.
- **Mixed-rate WACC is deliberate:** effective tax for NOPAT/FCFF, marginal `0.21` for after-tax cost of debt; don't "fix" it. ERP = live implied premium (`market_inputs`, 7-day window), `0.045` fallback. Operating-lease PV is added to debt; capital leases are already in Total Debt, never re-add.
- **Two ROE decompositions:** `_dupont_5factor` (exact product) vs `_leverage_roe` (sum form). `_leverage_roe` needs ROIC on book equity + debt with **no cash subtracted**; the modelled-vs-reported gap is a signal; a stored 0 interest expense against real debt is missing data (rate → `None`). `test_leverage_roe.py` locks it.
- **Growth:** `sales_to_capital()` uses cash-subtracted invested capital; `_invested_capital` does not. A never-profitable firm's margin target anchors to the industry margin.
- **Ticker identity:** `_resolve_symbol` folds aliases onto the CIK primary before any lookup (cache refreshes only on restart). **CIK `'0000000000'` is a placeholder, never an identity**; keep it NULL and excluded (removing the guard made 637 tickers resolve to one company). **Never DELETE a company**; delisted keep rows.
- **`derive_q4` only for December FYE.**
- **Ingest:** every write path calls `data/financial_db.py#is_valid_year_period`.
- **`job_runs`: always upsert** (`ON CONFLICT(job) DO UPDATE`).
- `FINANCIALS_DB` env overrides the DB path; test migrations against a copy.
- Marketdata scheduler excludes industry Damodaran data except the beta/EV-Sales sets used by `betas/`.
- `make_excel_db.py`, `adr_mapping.json`, `data/migrate_db_schema.py` are one-off tooling, not request path.

## Frontend rules
React 19 + Vite + Tailwind + Recharts. `lib/api.ts` → FastAPI (mock fallback); `lib/aiApi.ts` → RAG.
- **Verbatim content:** metric definitions and reference copy are placed verbatim from the owner's source. Formatting-only changes; never paraphrase the financial substance.
- **AI calls:** `askQuestion` on a button click only, never on page load, always with a JSON `dataContext`. One-click AI features are allowed (owner removed the old ban 2026-09-27); question decks still keep their per-question "Explain using AI" tutor.
- **Education-first contract** (every surface):
  1. Every metric label is clickable: `<MetricTerm metric={label} asSpan />`. A graph only if the metric is in `DISPLAY_METRICS` → `metric_history`.
  2. Every section has a "How this works" `<DefinitionLink number={N}>`.
  3. Interpretive sections use a user-first question deck (`QualitativeBlock` + `QUALITATIVE_QUESTIONS.individual` in `lib/questions.ts`); AI-written answers are shown beside the user's own, never saved over them.
  4. **GOTCHA: every new `individual` question group MUST be added to the bottom deck's `excludeTitles` in `IndividualPage.tsx`**, or it renders twice. No Convex schema change needed (free-form keys).
  5. Teaching lives in the sidebar; section intros are one or two plain sentences.
- **Definition sidebar:** every page with clickable metrics must mount its own `<DefinitionPanel />`. `anyDefByNumber` number ranges: individual 1–196 **and 500–599 / 800s**, comparative 201–299, industry 301–399, sector 401–499, economic 600+NN, credit 700+NN. **1–196 is full; never use 197–201** (a def at 201 shadows `comparative/201-Revenue.md`). New individual defs go in a registered `SECTION_RANGES` band (500s full; `capitalAllocation` 800-849, `leverageRoe` 850-869); an unbanded number is silently dropped. Label → number via `resolveDefNumber`; add `LABEL_ALIASES` only when normalization still misses.
- **Definition formats:** numeric metrics follow the 9-part template (`docs/prompts/metric-definitions-master-prompt-v2.md`, gold `content/individual/011-Interest-Coverage.md`); qualitative overviews use the lighter concept format; group surfaces use `metric-definitions-v3-group-surfaces.md`; economic uses `economic/00-INDEX.md`. Keep each surface's `000-INDEX.md` updated.
- **Sector Rotation is computed client-side** (`lib/sectorRotation.ts`, `scoreMatrix()` pure).
- **UI copy rules (hard):**
  - **Zero em dashes:** `grep -rn '—' frontend/src` must return nothing. Use the punctuation the sentence needs or `·`. **Never substitute a hyphen** (only hyphen: tab title `IntrinsicFinEd - <Section>`).
  - **`−` (U+2212 minus) is load-bearing** (~234 places, routes definitions). A "dash" regex sweep that catches it breaks the sidebar. Leave en dashes alone.
  - **No author names** in user-facing copy, **except eponymous metric names** (`Altman Z-Score`, `Beneish M-Score`, `Shiller CAPE (PE10)`, `Graham Number`), which are also filename stems.
  - `lib/quotes.ts` keeps `author`/`source` (real quotations).
  - **Removed chrome, do not reinstate:** header date + API badge, sidebar "Analysis" label, Dashboard Final Review/Practice buttons, `N / M answered` counter, `UNIT_TAG` sublabels + matrix footers, Lead/Coin/Lag sublabel, `GroupScorePanel` "N flagged" badge + subheading.

## Gotchas
- **Tailwind purges theme keyframes.** Keyframes used by hand-written CSS go in `src/index.css`. Skeletons (`Skeletons.tsx`) stay reduced-motion-safe.
- **Recession bands are NBER-published dates**, USREC only as fallback.
- **Restarting the live backend** (WMI is dead; bare `python.exe` in WindowsApps is the broken alias; the `PythonSoftwareFoundation.*` subpath is real):
  ```powershell
  $c = Get-NetTCPConnection -LocalPort 8000 -State Listen | Select-Object -First 1
  Stop-Process -Id $c.OwningProcess -Force
  $exe = "C:\Users\Zaki_Mir\AppData\Local\Microsoft\WindowsApps\PythonSoftwareFoundation.Python.3.11_qbz5n2kfra8p0\python.exe"
  Start-Process -FilePath $exe -ArgumentList '-m','uvicorn','backend.api:app','--host','127.0.0.1','--port','8000','--workers','1','--proxy-headers','--forwarded-allow-ips=127.0.0.1' -WorkingDirectory '<repo>' -WindowStyle Hidden
  ```
  A restart zeroes the cache and rebuilds the alias map.
- **SQLite has one writer.** Don't query hard during a backfill; `phase3_backfill.py` exits 4 after 15 lock failures and resumes from checkpoint.
- **yfinance `FastInfo` is attribute-accessed:** `getattr(fi, "last_price", None)`, never `.get()`.
- **Never call a FastAPI route function from another route.** Extract a helper (`_quote_for`); `test_quote_batch.py` guards it.
- **Never pipe a native build through `2>&1` in PowerShell 5.1** (fake `NativeCommandError`). Check `dist/` instead.
- **PowerShell `Set-Content` corrupts UTF-8** in this repo; write files with Python or the editor.
- After upgrading any RAG research MCP package, run `python rag/probe_mcp_tools.py` (tool names are exact-matched).
