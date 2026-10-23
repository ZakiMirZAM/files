# DCF accuracy plan (2026-09-27): review, evidence, stress test, fix design

Status: PLAN ONLY. No code changed. Waiting for owner approval.
Size: LARGE (money math used site-wide). Process: plan, characterization tests, phased build, code review, security review, `/graphify . --update`.
Graphify pre-query run (compute_forecast / stable_return / fcff_applicable touchpoints). Stress-test scripts live in this session's scratchpad `stress/` folder (harness.py, analyze.py, stress2.py, preview_now.py); Phase 0 moves them into `remediation/backtest/`.

Note: `dcf-accuracy-fixes.patch` was not found on disk or in the conversation. Its five fixes are covered below; share the path and it will be diffed against this design before building.

---

## 0. Evidence base

**Vault (rag/vault.db, 131k chunks, plus the Obsidian vault): 29 works, 23 authors.** Key: Damodaran Investment Valuation (3rd and University ed.), Applied Corporate Finance, Narrative and Numbers; Greenwald Value Investing; Penman Accounting for Value; Stewart Best-Practice EVA; Madden/HOLT (Valuation Handbook); Wilson Value and Capital Management; Besanko Economics of Strategy (Mueller data); Helmer 7 Powers; Lev and Gu End of Accounting; Graham and Dodd; Rosenbaum and Pearl; Ilmanen; Dorsey. Not in the vault: McKinsey Valuation, Mauboussin's books, CFA curriculum.

**Web (30+ URLs, quotes verified from source text):** Damodaran returnmeasures.pdf (2007), R&D.pdf, finfirm09.pdf, IV ch10-13 PDFs, blog 2016/2021/2025, session slides; McKinsey Quarterly 2006 "A long-term look at ROIC"; McKinsey on Finance 19 "Balancing ROIC and growth"; Wessels/Koller Valuation ch.10 slides (RONIC); Mauboussin "Competitive Advantage Period" (Apr 2026), "Measuring the Moat" (2024), "Return on Invested Capital" (2022), Base Rate Book; Fama-French 2000; Chan-Karceski-Lakonishok 2003; Kaplan-Ruback 1995; Lev-Sougiannis 1996; GICS 2023 reclassification; US Treasury 10y 5.17% (2026-09-25); CBO long-run real GDP about 1.7-1.8%.

**Historical stress test (this repo's data, production engine vs prototypes):** 81 companies in 9 sector groups, as-of FY2015/2018/2020, outcomes over the next 5 years. 234 firm-years; 207 valued by production; 27 (V, MA, SPGI, MCO, MSCI, ICE, CME, AXP, PYPL) blocked by the bank routing. Betas fixed at 1.0 to isolate structure; rf = December DGS10 average; ERP = stored implied ERP for that year. Returns are price-only (no dividends) and the last window ends at the latest stored market cap.

### 0.1 Stress-test findings

**A. Production failure modes**
- Terminal value share of intrinsic value: median 84% (p25 74%, p75 96%).
- Stable ROIC below WACC in 24 of 207 firm-years (12%).
- Negative terminal value: 0/207 at historical rates; 1/195 (NKE 2020) when the same years are re-run at today's 5.18% rf; AAPL today. The failure is rate-regime dependent: it fires when the equal-weight industry median ROIC falls below the risk-free rate.
- Value/price median 0.86; 25% of firm-years below 0.5x.

**B. Growth estimators vs realized next-5-year revenue CAGR (n about 207)**

| Estimator | Median abs error | Median bias | Rank corr. |
|---|---|---|---|
| Production growth used (RR x ROIC + efficiency) | 7.2% | -4.1% | +0.03 |
| Clean fundamental (3y aggregate RR incl. R&D and acquisitions, no efficiency term) | 5.9% | -2.0% | +0.13 |
| 5-year revenue log trend | 5.4% | -1.8% | +0.40 |
| Full-history regression | 5.6% | -2.2% | +0.39 |
| 50/50 trend + clean fundamental | 4.8% | -2.3% | +0.28 |
| **Trend shrunk 30% toward a 5% base rate** | **4.3%** | **-1.7%** | **+0.40** |

The best estimator differs by sector: health = clean fundamental or the blend (R&D drives growth); utilities/telecom = fundamental (regulated capex drives growth; the trend has rank corr -0.56); energy/materials = nothing works (8-12% errors, commodity prices); media/internet, tech, discretionary = trend (rank corr +0.44 to +0.70). This is the empirical case for business-type archetypes (section 4).

**C. Margin target vs realized median margin over the next 5 years**

| Target rule | Median abs error | Bias |
|---|---|---|
| Production (full-history median) | 3.19% | -1.11% |
| 5-year median | 3.28% | -1.13% |
| Current | 2.86% | -1.00% |
| **Current if margin rising, else 5-year median** | **2.52%** | **-0.06%** |

For rising-margin firms (n=97) the production target was 2.28 pts too low (median).

**D. ROIC persistence (predicting ROIC at t+5)**

| Anchor | Median abs error | Bias |
|---|---|---|
| Equal-weight industry median (production) | 6.62% | -4.43% |
| Cap-weighted industry median | 5.52% | -0.95% |
| WACC | 8.74% | -8.10% |
| Own 5-year median | 5.42% | -0.48% |

Firms with excess ROIC of 8 pts or more at t (n=102): median 91% of the excess still present 5 years later; 90% still above WACC. Pooled OLS slope of excess(t+5) on excess(t) = 0.24 (outlier-driven). CAVEAT: the sample is today's surviving large caps (survivorship bias). Mauboussin (Apr 2026, all US firms 1970-2024) gives a 5-year persistence coefficient of 0.33 for IT, and aggregate IT ROIC 19.0% vs median 10.8%. Defaults use the conservative number.

**E. Valuation level and ranking (same 193 earnings-track firm-years)**

| Variant | V/P median | Below 0.5x | Rank corr (V/P vs next-5y return) | Top third minus bottom third, 5y return |
|---|---|---|---|---|
| Production | 0.90 | 20% | -0.06 | +5% |
| P1 stable-ROIC fix | 0.90 | 19% | +0.00 | +20% |
| P2 + revenue trend | 1.12 | 19% | +0.04 | +22% |
| P3 + margin rule | 1.22 | 18% | +0.04 | +20% |
| P4 + decoupled stable growth | 1.25 | 18% | +0.02 | +17% |
| P5 + R&D capitalized | 1.27 | 16% | +0.03 | +16% |

The fixes remove the structural failures and the downward bias. They do not create a return-timing signal: no DCF variant ranks 5-year returns well, consistent with Kaplan-Ruback and the Valuation Handbook ("the best of the models... but not by a wide margin").

**F. Rate shock (same 195 firm-years re-valued at a fixed rf)**

| rf | Production median V/P | Proposed median V/P | Production negative TV |
|---|---|---|---|
| 2.00% | 0.85 | 1.23 | 0 |
| 3.50% | 0.59 | 0.99 | 0 |
| 5.18% | 0.41 | 0.73 | 1 (NKE 2020) |
| 5.18%, ERP +1 pt | 0.35 | 0.56 | 1 |

**G. Payment networks, data firms, exchanges on the FCFF path (prototype rules):** V, MA, SPGI, MCO 5-year revenue trends matched realized growth within about 2 pts in most windows; V/P 0.7-2.5. AXP ROIC 5-8% (a lender: stays on the equity path). ICE 2015 trend +57.7% (NYSE acquisition: growth must be organic). CME/ICE ROIC distorted by clearing balances and goodwill.

**H. Today (rf 5.18%, ERP 3.32%, live betas; payments beta 1.0) under the full prototype**

| Ticker | Price | Production | Prototype | Prototype reverse-DCF implied growth |
|---|---|---|---|---|
| AAPL | 341 | 55 (TV -$663B) | 233 | +13.4% |
| MSFT | 516 | 196 | 498 | +14.7% |
| ADBE | 235 | 142 | 612 | +0.0% |
| COST | 923 | 255 | 503 | +22.7% |
| MCD | 237 | 89 | 327 | +1.1% |
| KO | 88 | 42 | 46 | +21.4% |
| JNJ | 271 | 84 | 132 | +18.4% |
| V | 367 | (DDM 145) | 404 | +11.4% |
| MA | 568 | (DDM 222) | 872 | +8.2% |
| SPGI | 403 | n/a | 253 | +30.0% |
| MCO | 469 | n/a | 350 | +12.1% |

Open problems visible here: KO and SPGI stay low because average ROIC (goodwill-heavy, cash-inclusive) understates the return on NEW capital, and nominal growth at a 5.18% stable rate is charged full reinvestment. ADBE overshoots: the model cannot see the AI-disruption risk the market is pricing (a story input, not a formula fix). The KO/COST acceptance criterion is NOT met by the prototype; see 1.5, 1.7 and section 6.

---

## 1. Phase 1 design, point by point (changes from the proposal marked CHANGED)

### 1.1 Stable return (stages.stable_return + guard)
- Treat the terminal return as the return on NEW capital (RONIC), as McKinsey and Stewart do. The existing spread stays inside the NOPAT base; only new capital converges. The current formula already uses ROIC_stable as RONIC (reinvestment = g / ROIC_stable), so the change is to the anchor, not the formula.
- RONIC_stable = WACC_stable + s x (own normalized ROIC - WACC_stable), s in {0, 0.25, 0.5} from the selector's advantage score (ROIC above WACC in at least 4 of 5 years, size of the excess, life-cycle stage), later from the Advantage Durability deck.
- CHANGED: cap the perpetual excess at +3 pts over WACC for mature firms by default (Damodaran 2007: "At best, mature firms have earned 2-3% over their cost of capital over long periods and this should represent a cap on excess returns in perpetuity"). The cap lifts only with a documented moat (patents, brand, network; his Eli Lilly example: 15% vs 8.54%).
- CHANGED: floor at WACC only when the firm's own normalized ROIC is at or above WACC. Chronic value destroyers keep RONIC = own ROIC (Damodaran 2016 allows negative excess returns for badly managed firms).
- CHANGED: industry anchor = capital-weighted AGGREGATE (sum of NOPAT in USD / sum of invested capital in USD, via fx_rates), not market-cap weights and not the equal-weight median. Damodaran's datasets and Mauboussin both use aggregates; market-cap weights move with price. The anchor is a sanity band, not the target.
- Guard (engine level): if RONIC_stable <= g_stable, or stable reinvestment >= 90%, raise RONIC to WACC and emit a diagnostic; if still unsolvable, return {"applicable": False, reason}. terminal_value_firm never returns a negative value.
- Pros: removes the Apple/Nike failure class; bias vs realized ROIC falls from -4.4 to about -1 pt. Cons: s and the cap are judgment parameters; survivorship inflates the measured persistence.

### 1.2 Growth consistency
- Choose option A: project revenue from a 5-year log trend of ORGANIC revenue, shrunk 30% toward a size-bucketed base rate, faded to stable over the transition. Reinvestment x RONIC becomes a consistency check with a diagnostic when the two diverge by more than 5 pts.
- Why A over converting profit growth into revenue growth: conversion keeps the noisy one-year reinvestment signal in charge (rank corr +0.03). A has the best error and ranking in the backtest, and revenue is the more persistent series (Damodaran IV-U Ch.11; Mauboussin Base Rate Book; McKinsey growth decay 7% to 2% in ten years; Chan-Karceski-Lakonishok 2003).
- Business-type override (section 4): utilities/telecom use fundamental growth (regulated rate base); R&D-heavy firms use the 50/50 blend; commodity firms use a normalized mid-cycle base with the trend capped at long-run industry growth.
- Acquisition jumps: strip acquired revenue where Acquisitions Net and disclosures allow; otherwise flag any year whose growth exceeds 3x the trend.

### 1.3 Reinvestment
- Reinvestment = net capex + change in NWC + R&D (capitalized, net of amortization) + acquisitions (5-year normalized), aggregated over 3-5 years (Damodaran Ch.10; Mauboussin 2022; reuse rndAdjusted).
- R&D life by business type: pharma/biotech 10, semis/industrial 5, software/internet 3 (Damodaran IV-U Ch.9; Stewart App.B). Advertising capitalization for brand staples is optional later.
- Consistency rule (Penman): if R&D is capitalized in ROIC it is capitalized in reinvestment and margin, and vice versa.
- Efficiency term: out of projected growth; shown as a diagnostic; when a ROIC change is documented it applies once, spread over the years of the change (Damodaran's Motorola example), never in the terminal.

### 1.4 Margin target
- Default: current margin when it rose over the last 5 years and sits at or above its 5-year median; otherwise the 5-year median. Backtest error 2.52% with near-zero bias vs 3.19% / -1.11% today.
- Cyclicals and commodity firms: 7-10 year cycle-average margin (Graham and Dodd's seven-year normal; Damodaran IV-U Ch.9).
- Industry best-quartile margin is a ceiling diagnostic, not a target.

### 1.5 Stable growth
- Decoupled from the high-growth rate for non-declining firms; declining firms may carry negative stable growth (-2% to -5%).
- DECISION: default = rf (Damodaran's consistency rule; 5.17% today) or min(rf, long-run nominal GDP about 4.0%: CBO about 1.8% real plus about 2.2% inflation). Recommendation: min(rf, nominal GDP proxy) with a visible toggle. rf today sits above plausible nominal growth; at RONIC = WACC the choice changes nothing (Alloy Mills), and at RONIC > WACC the higher rate adds value the economy cannot deliver.
- Inflation split (further idea 3): inflation-driven growth for pricing-power firms needs less new capital than real growth (McKinsey value-driver inflation critique, Bodmer). This is the lever for KO-type undervaluation.

### 1.6 Financials routing
- Route on industry, not sector. Equity path: banks, thrifts, card and consumer lenders (AXP, COF, SYF), insurers, mortgage finance, balance-sheet broker-dealers. FCFF path: payment networks and processors (V, MA, FIS, FI, GPN; PYPL flagged for customer balances), ratings and data (SPGI, MCO, MSCI, FDS), exchanges (ICE, CME, NDAQ, CBOE) with clearing margin deposits removed from both cash and debt.
- Evidence: Damodaran finfirm09 ("debt is to a bank what steel is to a manufacturing company"), IV-U Ch.21 on non-bank payment firms, GICS 2023 (only the label moved), backtest G.
- Buybacks consistent across models: DDM uses the 5-year debt-adjusted augmented payout ((dividends + buybacks - net debt issued) / net income); residual income uses clean-surplus book value with buyback-adjusted ROE; FCFE uses the same equity reinvestment rate.

### 1.7 One ROIC definition inside valuation
- NOPAT = operating income x (1 - effective tax, clamped), the same NOPAT used for reinvestment.
- DECISION: invested capital = equity + debt (proposal) or equity + debt + lease liabilities - cash and short-term investments (recommended: matches sales_to_capital and Mauboussin/McKinsey practice, removes the cash distortion: MA 49% vs 95%, COST 19% vs 35%). The industry anchor uses the same definition.
- Goodwill stays in capital (acquisitions cost money; Stewart adds impairments back). ROIC ex-goodwill is reported as the organic diagnostic that feeds RONIC for serial acquirers (SPGI, ICE).
- Vendor ROIC column: fallback only, flagged.

### 1.8 Comparative score gate
- Loss cap on net margin < 0, NOPAT < 0, ROIC < 0 or EVA margin < 0. ROE is ignored when book equity <= 0 (None, as group_scoring already does). Ten profitable firms (MCD, ORLY, AZO, PM, MO, BKNG, LOW, SBUX, YUM, DPZ) leave the cap.

VALUATION_ENGINE=legacy stays byte-identical: every change sits on the damodaran path; legacy characterization snapshots must pass unchanged.

---

## 2. Integration risks found in the repo today

1. Uncommitted work on main: a P/E-vs-growth feature (+299 lines in individualanalysis.py plus api.py, types.ts, EVAValuationSection.tsx, new valuation/pe_growth.py and tests) that reads roic, wacc and g_term; plus the uncommitted market-cap currency fix. Commit or stash before Phase 1.
2. feat/story-dcf is unmerged and reads assumptions.revenueGrowthInitial, valuationSelection.roicStable and growthReconciliation.salesToCapitalUsed, which all change meaning. Order: Phase 1 on main, rebase story-dcf, then Phase 3.
3. test_damodaran_models.py pins the book replications and `test_stable_return_anchors_toward_industry_then_cost_of_capital`. Keep the pure engines unchanged and add a new stable-return policy function so the book tests stay green; the one pinned policy test changes deliberately.
4. Reverse DCF, growth viability (sentiment_gap, capex_quality, reinvestment_sufficiency), EVA/EPV growth premium, the comparative EVA column and the Excel export consume the forecast; thresholds need re-reading after values move.
5. RARR goldens (rag/eval/goldens.jsonl, 530 items) carry oracle numbers from today's engine: run build_set --refresh and review the diff.
6. Definitions 071/193/519/523 are owner-verbatim text: substance changes need owner wording or an approved draft.
7. Caches: comparative endpoints are cached 30 minutes; clear after deploy. Passing industry norms to the comparative page adds one cached industry lookup per company.
8. Data gaps: latest-row diluted shares missing (NVDA 2026), Acquisitions Net and R&D missing for many foreign filers. Every new input needs a fallback and a provenance flag.
9. Currency: the industry aggregate sums in USD via fx_rates; never FX-convert a ratio.
10. Rate regime: at rf 5.17% and ERP 3.32% values drop under every method; the UI should say so.

---

## 3. Phase 2 and Phase 3 review

Phase 2 is sound as written. Additions: relabel "Revenue growth" with its source; split "FCF Growth Used" into typed fields (revenueGrowthUsed, fcfPerShareGrowth, dividendGrowth); remove `_revenue_cagr`, `_forward_reinvestment_rate`, returns_quality.py (ReturnsQualitySection is unmounted) after owner OK, and the stale GROWTH_MODEL text in CLAUDE.md.

Phase 3 changes:
- Lever map: 7 Powers maps to margin AND the RONIC share (Helmer defines power as persistent differential returns); Advantage Durability to high-growth years and stable-return share; Capital Allocation to incremental sales-to-capital AND acquisition policy; Catalyst and Value Trap to failure probability (Damodaran's survival adjustment), not a WACC bump.
- Waterfall: dollar-per-share steps depend on the order levers apply. Use a fixed canonical order and say so, or Shapley averaging (8 levers = 256 runs, cheap).
- Scale validation: per-field ranges plus a "looks like a percent" rule (a rate above 1 is divided by 100 only after the user confirms), enforced in the API; rag/story_inputs.py prompts stay hash-pinned.
- Years: user-chosen 0-15, default = model recommendation, so an empty story equals the model headline (fixes the fixed 5+5 mismatch).
- Security review: POST /api/individual/{t}/dcf takes numeric overrides; strict schema, bounds, rate limit, ticker allowlist.

---

## 4. Further ideas: business-type archetypes

The backtest shows the best growth estimator changes by sector. Proposed `valuation/archetypes.py` mapping industry to model, growth estimator, margin rule, reinvestment basis, RONIC default, R&D life and special adjustments:

| Archetype | Model | Growth | Margin | Special |
|---|---|---|---|---|
| Asset-light compounder (software, networks, data) | FCFF | trend + base-rate shrink | rising rule | R&D life 3; excess cash out |
| Brand staples | FCFF | trend | rising rule | inflation-split stable growth; optional advertising capitalization |
| R&D-intensive (pharma, biotech, semis) | FCFF | 50/50 trend + clean fundamental | rising rule | R&D life 10 (pharma) / 5 (semis); patent-cliff fade |
| Cyclical industrial, autos | FCFF | mid-cycle base, trend capped | 7-10y cycle average | captive finance separated (F, GM, CAT, DE) |
| Commodity producers | FCFF | normalized price, long-run industry growth | cycle average | no trend extrapolation |
| Regulated utilities | 1-stage FCFF / DDM | rate-base (fundamental) growth | allowed return | beta band 0.8 |
| Telecom, capex-heavy | FCFF | fundamental | 5y median | capex normalization |
| Retail | FCFF | trend | rising rule | leases as debt (already) |
| Banks, lenders | Excess return or FCFE on regulatory capital | retention x buyback-adjusted ROE | n/a | debt-adjusted augmented payout |
| Insurers | Excess return | book value growth | combined ratio | float |
| REITs | AFFO / NAV | AFFO trend | n/a | not FCFF |
| Exchanges | FCFF | organic trend | rising rule | clearing balances out of cash and debt |
| Young, loss-making | n-stage revenue path | industry base rates | converge to industry | survival probability |
| Declining | 1-2 stage | negative stable growth | 5y median | liquidation floor |
| Conglomerates | Sum of parts | per segment | per segment | segment WACC |

Other ideas, ranked by accuracy gain per effort:
1. Captive-finance separation (F valued at -$36 and XOM negative in the backtest).
2. Organic-growth adjustment for acquisitions.
3. Inflation-split stable growth (KO-type undervaluation).
4. Base-rate shrinkage by size cohort (best growth error in the backtest).
5. Value decomposition on the page: assets in place, value of growth, value of the moat.
6. Scenario ranges (bear/base/bull) instead of one number; forecast intervals are usually too narrow (Silver).
7. Permanent backtest regression in CI (frozen fixtures, KPIs from section 0.1).
8. Multi-lever reverse DCF (market-implied growth, margin and RONIC beside the user's story).

---

## 5. Build sequence

- Phase 0 (prep): owner decisions; commit or stash in-flight work; freeze fixtures for AAPL, MSFT, ADBE, COST, MCD, KO, V, MA (plus NKE, F, XOM, SPGI, ICE, AXP edge cases) with frozen rf/ERP/beta; characterization tests of today's outputs; backtest moved into the repo.
- Phase 1a (safety, small blast radius): RONIC anchor and guard, financials routing, comparative gate. Before/after table and backtest.
- Phase 1b (inputs): single ROIC definition, reinvestment (R&D, acquisitions, normalization), efficiency term out, margin rule, stable growth policy.
- Phase 1c (growth): revenue trend, base-rate shrink, archetype overrides, organic adjustment.
- Phase 2, then Phase 3 after rebasing feat/story-dcf.
- Every phase: full suite, book replications, legacy snapshots, backtest KPIs, before/after table, code review; security review on Phase 3; graphify update at the end. No push or deploy without explicit OK.

## 6. Acceptance criteria (revised)

- Kept: no negative terminal value; stable reinvestment below 90%; payment networks off the bank path; full suite, book replications and legacy snapshots green.
- Made measurable: "no single-year swing drives growth" = tripling any one year's change in NWC, capex or acquisitions moves growth used by less than 1 pt.
- Added backtest KPIs: growth median abs error at most 5.0%; margin target abs error at most 2.6% with |bias| at most 0.5 pt; stable anchor bias vs realized ROIC within 2 pts; V/P median 0.8-1.3 at historical rates.
- Reworded: KO/COST reverse-DCF implied growth at most max(15%, 1.5 x 5-year trend), or the gap is explained by a named diagnostic. The prototype does not yet meet this (KO 21.4%, COST 22.7%). The model must not be tuned to match the market; COST at about 50x earnings may simply be expensive.

## 7. Decisions needed from the owner

1. Stable growth default: rf, or min(rf, about 4.0% nominal GDP proxy).
2. Stable-return share s and the +3 pt perpetual cap.
3. Invested capital: subtract cash (recommended) or equity + debt.
4. Industry anchor: capital-weighted aggregate (recommended) or market-cap weighted.
5. Growth driver: trend shrunk to base rate (recommended) or profit-growth conversion.
6. In-flight P/E-growth work and the market-cap currency fix: commit first?
7. Wording for definitions 071, 193, 519, 523.
8. Path to dcf-accuracy-fixes.patch.
9. The revised KO/COST acceptance wording.
