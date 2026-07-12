# Data-Loading / Display Audit — 2026-06-28

## ✅ FIXES APPLIED (verified: 27/27 tests pass, app imports, endpoints reconcile live)
- **§0 Excess-return reconciliation** — `_aggregate_weighted_columns` (api.py) now DERIVES
  `excessReturnEquity = roeEquity − costOfEquity` from the clipped components, so the three
  displayed numbers always reconcile (independent winsorising of a 152% ROE and 142% excess both
  to 100 was the cause). Verified live: AAPL excess == ROE−Ke ✓, spread == ROIC−WACC ✓.
- **§4 Row-order guards** — `compute_forecast`, `build_individual_snapshot`, `metric_history`
  (individualanalysis.py) now sort rows ascending internally, closing the TLA.V bug class on the
  individual page (was safe-by-contract only).
- **§1 ROIC fallback** — `_compute_one_metric` now falls back to NOPAT/IC (positive base) when the
  stored ROIC column is null, so ROIC / ROIC−WACC charts don't go blank (AAPL: 14/14 years populated).
- **§2 TTM** — `ttm_sum` now requires 4 quarters within ~13 months (no misleading partial/gap TTM);
  `Debt To Equity` divided by 100 (yfinance returns a percent); removed the `ROIC→returnOnAssets`
  mis-mapping; fixed the `"Enterprise Value To EBITDA"` → `"Enterprise Value Over EBITDA"` column name.
- **§6 Beta** — daily update uses `COALESCE(beta, excluded.beta)` so it can't clobber the curated
  beta.csv value.

## ❌ REJECTED after verification (NOT a bug — agent over-claimed)
- **§5 Economic scale constants** — `scale=0.4` (Current Account) and `scale=0.1` (Debt/GDP) are
  CORRECT. FRED reports IEABC/TODNS in **millions** and GDP in **billions** (1000× unit gap baked into
  the scale). Verified: 0.4 → −2.86% (real ≈ −3 to −4%); 0.1 → 268% (real ≈ 250-270%). The proposed
  `400`/`100` would have made these charts **1000× too large**. Left unchanged.

## ✅ §3 Currency mixing — FIXED with an FX table (verified live)
Added an `fx_rates` table (currency → USD-per-unit) to financials.db, populated from yfinance
(`{CCY}USD=X`, inverse fallback) via `FinancialDB.refresh_fx_rates()` (45 currencies seeded; hooked
into `update_all` for daily refresh). The two ranking endpoints now select/size peers by
**USD-converted** market cap (`f."Market Cap" * fx.usd_per_unit`), and `_company_metrics` converts the
displayed/weight market cap to USD (`_mc_to_usd`) while keeping ratios in local currency. Unconvertible
currencies (garbage values, no rate) drop out of size-ranking. Verified live on Semiconductors:
TSM $1,262B (from 40.2T TWD), SK Hynix $293B (from 449T KRW), ASML $408B (EUR) — all correctly sized;
NVDA/AVGO/TSM are now the genuine top-3 by size instead of raw-number-inflated foreign caps.

## ⏸ DEFERRED (careful per-item verification)
- **Macro (build_yoy_series early-exit, DGS10 unsorted, market_pe currency/scale, ERP mid-year,
  macro cache prefix)** — lower priority; deferred pending per-item runtime verification (the macro
  agent already produced one false positive above, so these are not applied blind).

---

# Original findings (read-only audit that produced the above)

Five parallel review agents + direct runtime verification. Findings are de-duplicated and
prioritized. `[VERIFIED]` = confirmed by running code/queries against the live DB; `[inspection]`
= confirmed by reading the code; `[suspected]` = needs a runtime check.

---

## 0. Your excess-return issue — ROOT CAUSE FOUND  [VERIFIED]

The **math is correct**: at the metric layer, `excess_return == roe − cost_of_equity` and
`roic_wacc_spread == roic − wacc` hold *exactly* (AAPL 2025: 1.4198 = 1.4198; MSFT: 0.1963 = 0.1963).

The mismatch you see is a **display-definition inconsistency** — the page shows ROE and Ke from
*different definitions in different sections*, so "the ROE I see − the Ke I see ≠ the Excess Return I
see":

- **Excess-Return trend tile** uses the **latest-year** ROE and the **per-year** Ke.
- **Residual-Income panel "ROE (used)"** uses the **MEDIAN ROE across all years**
  (`individualanalysis.py:2350`), and "Cost of equity" there is the **current/live** Ke
  (`:2414`) — one number, not per-year.
- **DuPont section** computes ROE on **average equity** (`:2932`), a third different number.

Verified on AAPL: latest-year ROE = **1.519 (152%)** vs MEDIAN ROE = **0.583 (58%)**. So the RI panel
shows ROE≈58%, Ke≈9.9% (→ you'd expect ~48% excess return), while the Excess-Return tile shows
**142%** (152% − 9.9%). Both are internally consistent; they just use different ROE/Ke definitions.

Secondary contributor: historical **Ke can be a flat line** across all years if
`get_historical_wacc_params()` / `get_beta_history()` come back empty (silent `except` →
`api.py:647-651`), making every past year use today's rf/erp/beta. Then `excess_return = roe − constant`.
*(My test forced fixed rf/erp so Ke was flat there; confirm in the live app whether the cost-of-equity
chart varies by year — if it's flat, this fallback is firing.)*

**Fix direction (not applied):** show ROE/Ke from ONE consistent definition next to excess_return (or
label which each uses), and surface a warning when the historical-WACC fallback fires instead of
silently flat-lining Ke. This is the **same bug family as TLA.V**: a metric computed one way, displayed
next to a number computed another way.

---

## 1. Other "displayed ≠ computed" inconsistencies (same family)  [inspection]

- **ROIC: two code paths, different fallbacks.** `metric_history` reads raw `ROIC` column with NO
  fallback (`individualanalysis.py:1463`), so the ROIC / ROIC-WACC sparklines go *blank* in years the
  column is null; the verdict/EVA headline uses `_compute_return_ratios` which DOES fall back to
  NOPAT/IC (`:530`). Same metric, two values / gaps.
- **DuPont ROE (avg equity) ≠ metric_history ROE (period-end / stored).** The DuPont 5-factor
  "reconciles" flag is unreliable as a cross-check whenever equity grew materially.
- **Frontend dead key:** `sectorMetrics.ts:134 SPREAD_KEY="roicWaccSpread"` — backend never emits that
  key (only `roic` + `wacc` separately), so the sector-rotation spread is always null. `[suspected]`

---

## 2. Data-loading / unit bugs  [mostly inspection]

- **[CRITICAL] TTM Debt-To-Equity is ~100× too large.** `financial_db.py:1255` maps
  `"Debt To Equity" → yfinance "debtToEquity"`, which yfinance returns as a **percent** (152.3 = 1.52×),
  but the DB stores a ratio. The TTM row shows D/E ~100× the annual rows → forensic/Altman/leverage reads
  treat every levered firm as hyper-leveraged.
- **[CRITICAL] TTM ROIC fallback = ROA.** `financial_db.py:1257` maps `"ROIC" → "returnOnAssets"`. Only
  affects the **live TTM row** when the quarterly ROIC is null (stored annual ROIC is fine — verified
  AAPL/MSFT/NVDA annual ROIC are real). Still: the TTM ROIC silently shows ROA.
- **[CRITICAL] TTM period can silently be wrong.** `ttm_sum` (`financial_db.py:1209-1217`) does
  `dropna().iloc[:4]` with no newest-first sort and no gap/length check → a missing quarter yields a
  15-month "TTM", and a 2–3-quarter company returns a partial sum as if full. Understates TTM revenue /
  margins / FCF with no signal.
- **[MEDIUM] Wrong column name** `"Enterprise Value To EBITDA"` (`individualanalysis.py:1279`) — the DB
  column is `"Enterprise Value Over EBITDA"`, so the EV/EBITDA exit cross-check always uses the computed
  fallback, never the stored value.
- **[HIGH] Annual update overwrites curated CSV betas** with yfinance `.info["beta"]`
  (`financial_db.py:1118-1141`) — if `update_all()` runs after `import_betas_from_csv`, every WACC/Ke
  silently shifts to yfinance's beta.
- **[HIGH] Non-December fiscal years can be stored under the wrong `Calendar Year`**
  (`financial_db.py:989-997`) → `INSERT OR IGNORE` can silently drop the latest year for MSFT/AAPL-type
  fiscal calendars, leaving that ticker a year stale.

---

## 3. Currency mixing  [VERIFIED present]

Comparative panels are **dominated by non-USD reporters**: Semiconductors 82% non-USD (TWD/CNY/JPY/KRW),
Banks-Regional 61%, Industrial-Machinery 92% (CNY/JPY/TWD/INR). Neither `load_industry_panel`
(`comparitivestockanalysis.py:297`) nor the sector/industry averages (`industry_averages.py:247-289`)
filter by `Reported Currency`.

Impact (precise): the **dimensionless ratio scores** (ROE, margins, ROIC−WACC, P/FCF) are
currency-neutral and basically OK. The damage is in **(a) peer SELECTION by market cap** — "top-N by
size" compares a ¥1T cap to a $50B cap numerically, so foreign firms look ~100× bigger and the wrong
companies enter the panel; and **(b) the market-cap-WEIGHTED averages** on the Industry/Sector pages,
which sum mixed-currency caps and absolute Revenue/NI directly → invalid averages for any global
industry. Fix: a currency filter (USD-only) or FX-normalization before size ranking / averaging.

---

## 4. Row-order fragility (latent — same class as the TLA.V bug)  [inspection]

`build_snapshot` is now fixed (defensive sort). But the **individual page** path
(`build_individual_snapshot`, `compute_forecast`, `_revenue_growth_regression`, `_shenanigans`,
`_rnd_capitalization`, `_residual_income`, `_dupont_5factor`, `metric_history`) all assume rows are
ASCENDING and use `rows[-1]` / sequential YoY with **no defensive sort** — safe *only* because
`load_ticker_rows` happens to `ORDER BY year`. Any new caller, test, or query that passes rows in a
different order silently mis-scores the whole individual page (wrong "latest" year + reversed growth) —
exactly the TLA.V failure. Fix: add the same `sorted(rows, key=year)` guard at `build_individual_snapshot`
and `compute_forecast`, or route all "latest row" access through one helper.

---

## 5. Macro / Economic page  [inspection]

- **[HIGH] Two Economic charts are ~1000× too small (wrong scale constant):**
  - "Current Account % of GDP" `api.py:1290` uses `scale=0.4` → shows ~0% instead of ~−3% to −4%.
  - "Total Non-Financial Debt % of GDP" `api.py:1297` uses `scale=0.1` → shows ~0.25% instead of ~250%.
- **[HIGH] YoY series early-exit is backwards** (`api.py:335 elif dates[j] > prior: break`) — the inner
  scan can break before the best prior-year match, shifting/dropping the YoY value for ~14 series
  (CPI, PPI, M2, SP500, retail sales, …). (Also a dead `by_date` dict at `:311` and O(n²) scan.)
- **[HIGH] Live risk-free rate taken from unsorted FRED result** — `get_live_wacc_params`
  (`api.py:628-633`) and `FredClient.latest` (`market_inputs.py:136`) do `obs[-1]` without sorting;
  trusts FRED's implicit order. Feeds every WACC/Ke.
- **[MEDIUM] `market_pe.py:145` currency/scale mix** — yfinance `marketCap` (absolute $) vs DB
  `Market Cap` (millions) in the same weighted sum → a fallback ticker's weight off by ~1e6, corrupting
  the index PE / Fed-model earnings yield.
- **[MEDIUM] Implied-ERP latest point uses a mid-year Shiller price** for the current year instead of
  year-end (`market_inputs.py:331`), mis-stating the most recent ERP.
- **[MEDIUM] `get_live_wacc_params` cached under `"macro"`** but the scheduler invalidates `"econ"`
  (`api.py:618` vs `refresh.py:186`) → rf can lag up to 6h on yield-move days.
- **[MEDIUM] Damodaran latest earnings row may be a partial/preliminary year** (`damodaran_market.py:247`)
  used as final trailing earnings in the Fed model.

---

## 6. Cleared (NOT bugs — don't chase these)
- `industry_averages.py:468-474` `growth_vals.append` — control flow is correct (the `continue` guards it).
- `metric_history` excess_return / roic_wacc_spread arithmetic — verified exact.
- `ERP_IMPLIED` decimal→percent ×100 — correct (single writer).
- Lens functions receiving descending `rows_desc` — order-agnostic (averages / use `latest` only).

---

## Priority order to fix
1. Excess-return / ROE-Ke display consistency (§0) — your reported symptom.
2. TTM unit bugs: D/E ×100, ROIC→ROA, partial-TTM period (§2).
3. Currency: peer-selection + averages (§3).
4. Economic scale constants 0.4 / 0.1 (§5).
5. Row-order defensive guard on the individual page (§4) — latent but catastrophic class.
6. The rest (betas overwrite, YoY early-exit, fiscal-year, macro cache).
