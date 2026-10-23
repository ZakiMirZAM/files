# "How {company} differs": Step 1 discovery report

Read-only discovery. No code was changed. Paths are relative to the repo root.

## Summary

1. **The comparison table exists and is complete for what it covers.**
   - It is built in `backend/company_profile/spreads.py#build_spread_table` and served at `GET /api/individual/{ticker}/spreads`.
   - It has 26 metric rows. Each row holds the company value, the industry median, the strategic-group median, the gap to each, and the rank and count.
   - No page renders it. Only the Ask AI data block reads it. `docs/BACKLOG.md:31` already lists "Render the spread table", so this is **PARTIAL** work (extend it) rather than new work.
2. **The Step 5 instruction is already live, word for word.**
   - Commit `e90d75f` (today) placed it in `ASK_SYSTEM` (`rag/server.py:318-325`).
   - Every "Explain using AI" question on every page already receives it. Nothing more needs to change. See section 4.
3. **The questions ask for more rows than the table has.** 8 of the 16 concepts the questions ask for are missing from the table (section 6). Under your hiding rule, the whole Working capital group, several Pricing and Risk questions, and most of Deck B would be hidden.
4. **There is no tutor today.** "Explain using AI" is a single call. It never sends the user's answer, counts no attempts, and writes its own full answer at once. The Step 4 tutor behaviour is new work (section 3).
5. **The table returns results only, not inputs.** To show "the company's own input values" (Step 2), the backend has to return the numerator and denominator it already reads. That adds fields to the payload but no new metric. It needs your OK (section 2).
6. **Today's plan file has an earlier version of this feature.** Item 9 of `docs/plans/2026-09-27-feature-plan.md` describes a top-8 "How {company} Compares" table and a 5-question "Suppliers" deck. It was never built. This spec replaces it.

---

## 1. The comparison table

**Where it is computed**
- The route is `GET /api/individual/{ticker}/spreads` (`backend/api.py:6849-6857`).
  - Rate limit 10/minute. The ticker is resolved to its primary listing.
  - The body is `_spreads_payload` (`api.py:6775-6846`), cached 30 minutes.
  - Any failure returns `{applicable: false, reason}` instead of an error.
- `build_spread_table` has one production caller (`api.py:6837`) and tests at `backend/company_profile/test_company_profile.py:646,709`.
- Every value, for the company and for every peer, comes from one function, `api.py#_company_metrics` (`api.py:4144-4271`). That function also feeds the scorecard matrices and the `/benchmarks` sidebar.

**Metric list: all 26 rows** (`_BENCHMARK_KEY_MAP`, `api.py:6120-6148`; labels, units and groups from `_SECTOR_METRIC_DEFS`, `api.py:3788-3852`)

| Key | Label | Unit | Formula in `_company_metrics` |
|---|---|---|---|
| revenue_growth | Revenue Growth | % | stored "Revenue Growth" column ×100 (4250) |
| net_income_growth | Net Income Growth | % | stored "Net Income Growth" ×100 (4251) |
| operating_margin | Operating Margin | % | Operating Income ÷ Revenue (4246) |
| dupont_ebit_margin | DuPont · EBIT Margin (EBIT/Rev) | % | Operating Income ÷ Revenue, **the same formula as operating_margin** (4242) |
| net_margin | Net Margin | % | Net Income ÷ Revenue (4247) |
| roic | ROIC | % | NOPAT ÷ (Equity + Total Debt), no cash subtracted; NOPAT = OI × (1 − tax rate) (4161-4162, 4220) |
| wacc | WACC | % | Ke·E/V + Kd·(1−t)·D/V; E = Market Cap (4164-4169) |
| roic_wacc_spread | ROIC − WACC Spread | % | roic − wacc (4230) |
| eva_margin | EVA Margin | % | (NOPAT − WACC × IC) ÷ Revenue (4170, 4224) |
| roe | ROE | % | Net Income ÷ Equity (4195) |
| cost_of_equity | Cost of Equity (Ke) | % | sector CAPM on beta (4165) |
| excess_return | Excess Return (ROE − Ke) | % | roe − ke (4196) |
| justified_pb | Justified P/B | x | (ROE − g) ÷ (Ke − g), only when ROE > 0 (4197-4205) |
| pb | Actual P/B | x | Market Cap ÷ Equity (4199) |
| pe | P/E Ratio | x | Market Cap ÷ Net Income (4238) |
| net_interest_margin | Net Interest Margin | % | (Interest Income − Interest Expense) ÷ Assets; banks only (4209-4218) |
| dupont_tax_burden | DuPont · Tax Burden (NI/EBT) | x | NI ÷ EBT (4240) |
| dupont_interest_burden | DuPont · Interest Burden (EBT/EBIT) | x | EBT ÷ EBIT (4241) |
| asset_turnover | DuPont · Asset Turnover | x | Revenue ÷ Total Assets (4244) |
| equity_multiplier | DuPont · Equity Multiplier | x | Total Assets ÷ Equity, year end (4245) |
| sales_invested_capital | Sales / Invested Capital | x | Revenue ÷ (Equity + Total Debt) (4254) |
| capex_depreciation | Capex / Depreciation | x | abs(Capex) ÷ D&A (4253) |
| operating_leverage | Operating Leverage (DOL) | x | % change OI ÷ % change Revenue (4177-4187) |
| fcf_net_income | FCF / Net Income | x | FCF ÷ Net Income (4255) |
| net_debt_ocf | Net Debt / OCF | x | Net Debt ÷ Operating Cash Flow (4256) |
| liabilities_equity | Liabilities / Equity | x | Total Liabilities ÷ Equity (4257) |

A ratio is null when either side is missing or when the denominator is zero or negative (`api.py:4172-4175`). For example, P/E is null for a loss-maker.

**Columns in each row** (display units: a 25% margin is `25.0`; see `backend/company_profile/UNITS.md:122-147`)
- `company`, `industryMedian`, `groupMedian`
- `industryWeighted` and `sectorWeighted`: the market-cap-weighted matrix columns, carried so this table matches the benchmarks sidebar
- `gapIndustry`, `gapGroup`, `gapSector`: each is the company value minus that benchmark, exact
- `rank` and `count`: highest value first, ties share the lower rank, nulls excluded

**How "industry" is defined**
- The ranked set is the top 20 companies in the industry by market cap (`SPREADS_PEER_LIMIT = 20`, `api.py:6756`; query at `api.py:5120-5136`).
- It takes **primary listings only, US-dollar filers only**, no preferred shares, and only firms with a filing in the last 5 years.
- The company itself is always added (`api.py:6789-6793`). A foreign filer such as TSM is therefore ranked against US-dollar filers only.
- It is not the whole industry, and `peerCount` includes the company. Fixtures: NVDA 20, TSM 21, JPM 16, RIVN 16.

**How the strategic group is defined**
- The code runs a median split on two axes over the whole industry peer set (`company_profile/common.py:65-86`; `industry_structure/dimensions.py:245-295`).
- The axes depend on the sector (`dimensions.py:156-172`):

| Sector | Axis 1 | Axis 2 |
|---|---|---|
| Technology, Healthcare | R&D intensity | value-added share |
| Consumer | SG&A intensity | cost position |
| Industrials, Energy, Materials | capital intensity | cost position |
| All others | SG&A intensity | capital intensity |

- The group label reads like "High R&D intensity, high value-added share".
- `groupMedian` is taken over group members **inside the ranked top-20 set**. `groupFirmCount` is that overlap, not the full group (`spreads.py:84-86, 112`).

**Output shape** (`spreads.py:114-129`; TypeScript mirror `frontend/src/lib/stageContext/types.ts:105-139`)
```
{ applicable, ticker, industry, sector,
  metrics: { <key>: { label, unit, company, industryMedian, groupMedian,
                      industryWeighted, sectorWeighted, gapIndustry, gapGroup,
                      gapSector, rank, count } },
  groupLabel, groupFirmCount, peerCount, fiscalYear, dataNote, unitsNote }
```
The Step 2 header "Industry, N={n} · Group, N={n}" maps to `peerCount` and `groupFirmCount`.

**How it reaches Ask AI today**
1. "Explain using AI" (`QuestionField.tsx:153-206`) calls `pageGatherFor` (company stage).
2. That calls `loadStageContext`, which calls `buildStageContext`.
3. `bundle.ts:121` calls `load.spreads(ticker)`, with cache key `individual-spreads|T`.
4. `companySection.ts:370` calls `spreadLines` (`companySpreads.ts:21-76`), which writes one text line per metric.
5. The text is sent as `data` to `/ask`.

No component or page renders the table.

**Caveats found in existing code** (reported only; nothing was fixed)
- **Market cap source differs.** Peers use a live market cap; the company uses the stored "Market Cap" (`api.py:5175-5177` vs `6185-6210`). This affects WACC, ROIC − WACC, EVA margin, P/E and P/B.
- **The year shown may not be the year used.** `fiscalYear` is the peer set's year, but each company's values come from its own latest row (`api.py:5167-5168`). The payload does not say which year each company is on.
- **One fixture has a gap.** In the NVDA fixture the company's own `revenue_growth` is null (rank null, count 17). I have not checked why.

## 2. Metric definitions

**How a definition opens**
1. `<MetricTerm>` (`components/individual/DefinitionsBlock.tsx:103-149`) resolves the label to a definition number.
2. `openDefinition(n)` then sets `DefinitionPanel` (`components/individual/DefinitionPanel.tsx:90`).
3. The panel renders the markdown file, which follows the 9-part template: Part 1 "Definition" is the plain words, Part 2 "How it is calculated" holds the formula line (gold file `content/individual/011-Interest-Coverage.md`).
4. The Company page mounts the panel at `pages/IndividualPage.tsx:497-500`.

**Coverage**
- **Every one of the 26 metrics has a definition file with both a formula and a plain meaning.** No definition needs to be written from code.
- **7 labels fail to resolve with the Company page's default lookup** (`resolveDefNumber`) because the table's label text differs from the file's: Actual P/B, P/E Ratio, DuPont · Tax Burden, DuPont · Interest Burden, DuPont · EBIT Margin, DuPont · Asset Turnover, DuPont · Equity Multiplier.
- All 26 resolve when either:
  - the comparative lookup is used (`resolveComparativeDef`, the `content/comparative/2NN` files); or
  - each row is labelled with its individual-page label (`individualanalysis.py:2537-2612`, as `lib/individualSeries.ts:199-221` already does).

**Mismatches between definition text and backend formula**
- **Net Margin opens the wrong definition.** `lib/individualDefinitions.ts:235` points "Net Margin" at #5 Return On Sales, whose formula is Operating Income ÷ Revenue. The table's Net Margin is Net Income ÷ Revenue (`api.py:4247`). The correct file is `content/comparative/204-Net-Income-Ratio.md`.
- **Equity Multiplier averages differently.** #40 Financial Leverage uses average assets ÷ average equity; the table uses year-end balances. `comparative/216` matches the table.
- **Two rows share one formula.** Operating Margin and DuPont · EBIT Margin compute the same number, so the table shows the same figure twice.

**The company's own inputs**
- The table returns only results, no numerators or denominators (`spreads.py:97-110`).
- No existing route returns raw statement lines (revenue, operating income, equity and so on) for the company. `/api/individual/{ticker}` has ratios, common-size percentages and year-over-year changes, not the levels `_company_metrics` reads.
- Showing inputs therefore needs `_spreads_payload` to also return the company's input lines it already reads (`_SECTOR_NEEDED_COLS`, `api.py:3889-3898`).
- That adds fields, not metrics or columns. **Decision needed.**

## 3. Question decks

**Storage**
- Static decks: `QUALITATIVE_QUESTIONS` in `lib/questions.ts:28`, typed `QualitativeGroup {title, questions: {id, text, hint?}[]}` (`lib/types.ts:1-32`).
- Runtime decks: builders that return `RuntimeGroup[]`, where each question can carry `dataContext` and a hidden `guidance` (`lib/types.ts:20-26`).
  - Only the connect deck (`lib/connectQuestions.ts`) uses `guidance`.
  - Its words live in `docs/connect-questions.final.md` and are synced by a conformance test.
  - `{company}` placeholders are filled by `fill()` (`connectQuestions.ts:353-362`).

**Rendering**
- Decks render through `QualitativeBlock` (the `groups` prop, for runtime decks) and then `QuestionField`.
  - The textarea has no length limit.
  - Autosave runs through `useDebouncedSave` (650 ms).
- **Gotcha:** every new `individual` group title must be added to `excludeTitles` in `IndividualPage.tsx:465-487`, or it renders twice.

**Tutor: none exists**
- "Explain using AI" (`QuestionField.tsx:153-207`) sends the question, plus any hidden guidance, to `/ask`.
- **It never sends the user's answer.** It even removes this question's saved answer from the context on purpose (`excludeQuestionId`, `readerNotes.ts:168-179`).
- **It counts no attempts and holds nothing back.** "Copy to my answer" pastes the AI text into the user's box.
- **An empty box is not checked.** No "write an answer first" exists anywhere.
- **The promise already sits in shipped copy.** Definitions 567 and 522 and sector 436 say "a tutor that helps only after a try". That describes nothing in the code.

**So Step 4 needs new behaviour:**
- block empty submissions;
- send the user's answer;
- ask for one follow-up aimed at the weakest point, from the listed follow-ups when one fits;
- count attempts, and give the tutor's own reading only after two attempts or on request.

`ASK_SYSTEM` tells the AI to answer first and give the full analysis. A per-request instruction sent in the question slot ranks below it, so the "one follow-up only, no own reading" rule may not hold reliably. Making it hold properly means a separate tutor prompt in `rag/server.py`, which is protected and needs your explicit approval. **Decision needed.**

**How answers are stored**
- Convex `qualitativeAnswers {userId, section, scopeKey, questionId, answer, updatedAt}`, through `qualitative.saveAnswer` / `getAnswersForScope` (`frontend/convex/schema.ts:7-24`, `frontend/convex/qualitative.ts`).
- The Company page's scope key is the route ticker.
- AI answers are cached per question in `aiAnswers`.
- Keys are free-form, so a new deck needs no schema change.
- An attempt counter would also need a place to live. A new free-form questionId per question in `qualitativeAnswers` would do it with no schema change.

## 4. Ask AI

**How a question is sent**
- `QuestionField` → `openAi` → `AiPanel` → `askQuestion` (`lib/aiApi.ts:243-281`).
- `POST /ask` with `{question, context, section, data}`.
- Budget of 3 per minute (`lib/askBudget.ts:19`).

**How context is attached**
- Page figures come from `setPageAiContext` (`IndividualPage.tsx:150-160`).
- A cross-stage text block is gathered only on click: `lib/stageContext/*`, capped at 120 KiB (`assemble.ts:57`).
- For the company stage the block already contains:
  - the full spread table;
  - Key Players (`structureSection.ts:101-114`);
  - the Value System, including the user's saved supplier and buyer picks (`industrySection.ts:155-212`);
  - rivals and group rivals, business summary and segments, valuation, and 5 years of metric history.
- Instructions travel in the question slot: hidden `guidance` goes before the question (`lib/questionPrompt.ts:3-14`).

**Where the instructions live**
- `rag/server.py`: `ASK_SYSTEM` (125-419, used by `/ask`), `EXPLAIN_SYSTEM` (`/explain`, the highlight button) and `DEFINE_SYSTEM` (`/define`).
- They are hash-pinned in `rag/test_prompts.py:85-89`.
- **The Step 5 paragraph is already in `ASK_SYSTEM` at lines 318-325, word for word**, from commit `e90d75f`. Every "Ask AI" / "Explain using AI" call from this section and its decks goes through `/ask` and so already receives it.
- Proposal: change nothing. The spec's own rule ("Don't change any other part of Ask AI's instructions") rules out adding it a second time. `/explain` (the highlight-to-explain button) does not receive it.

## 5. Available context on the Company page

| Item | Status | Detail |
|---|---|---|
| Key Players (revenue share) | Fetchable; already in the AI block | `useIndustryStructure(analysis.industry)`, key `structure|I`; `concentration.top10[] {rank, ticker, name, revenueUsd, share, relativeShare}`. **No per-peer gross margin.** |
| Value System | Fetchable; in the AI block | `useValueSystem(industry, supplier, buyer)`. The supplier and buyer industries are **picked by the user** on the Industry page and saved as `ind.chain.supplier` / `ind.chain.buyer`. The payload has HHI, median operating margin and 5-year growth per side, plus 5 years of median days payable and days receivable for the focal industry. No gross margin. |
| Latest Filings | On the page; not in the AI block | `EventsSection` shows at most 2 filings (latest 10-K/20-F and latest 10-Q) with SEC URLs. The proxy (DEF 14A) link is also on the page. Neither reaches the AI today. |
| 10-K text | In the payload, unused | `businessProfile.tenKExtract` is the first 4,000 characters of the 10-K. That is probably the cover page, not the Business section. It is not typed or sent to the AI. |
| Segment note | In the payload; in the AI block; not rendered | `businessProfile.segments[] {name, revenue, share, fiscalYear}` from EDGAR. |
| Customers >10% of revenue, supplier finance, purchase commitments, hedging | **Not available** | No field anywhere. Only the AI, reading the filing, could supply them. |
| Peer list / group members | Fetchable | `/api/individual/{T}/rivals` (key `individual-rivals|T`) gives group rivals with revenue share. The PeerRankingTable on the Company page loads the full ranking when opened. |
| History of the comparison metrics | Partial | The table itself has **no history**. **Company:** every year on file for all 26 keys, in `analysis.metricHistory` (on the page; decimal units; some formulas differ from `_company_metrics`, e.g. ROIC). **Industry:** per-year **market-cap-weighted averages, not medians**, from 2016 (`/api/industry/{i}/scorecard`, `_history`). **Group:** per-year medians **do not exist**. They could only be derived from the ranking's per-company `_history`. |

## 6. Row mapping

| Concept used by the questions | Mapping |
|---|---|
| revenue growth | mapped: `revenue_growth` |
| gross margin | **missing** (computed elsewhere: `generic_strategy.py:33`, `ratios.GrossMargin`) |
| operating margin | mapped: `operating_margin` |
| operating expenses (SG&A, R&D) | **missing** (computed elsewhere: `cost_structure.py:36-37`, `sga_revenue`) |
| capital intensity (sales to capital or asset turnover) | mapped: `sales_invested_capital` and `asset_turnover` |
| days to collect | **missing** (`dso` exists in company metricHistory only) |
| days of inventory | **missing** (`dio`, company metricHistory only) |
| days to pay suppliers | **missing** (`dpo`, company metricHistory only) |
| cash conversion cycle | **missing** (`ccc`, company metricHistory only) |
| return on invested capital | mapped: `roic` |
| return minus cost of capital | mapped: `roic_wacc_spread` |
| margin volatility | **missing** (nearest: `earnings_volatility`, coefficient of variation of EBIT, individual only) |
| leverage (net debt ÷ EBITDA or similar) | mapped, **"similar" needs your OK**: `net_debt_ocf` (Net Debt ÷ OCF). Balance-sheet alternatives: `liabilities_equity`, `equity_multiplier`. |
| cash conversion (operating cash flow ÷ profit) | **missing as specified.** Near miss: `fcf_net_income` uses free cash flow, not operating cash flow. **Your call** whether it counts. |
| market-implied expectations metric | **missing** from the table (reverse DCF and P/E-implied years exist elsewhere: `individualanalysis.py:1705`, `valuation/pe_growth.py:133`) |
| peer-level gross margin (Deck B #1) | **missing** (the ranking has it for Technology, Consumer Cyclical, Consumer Defensive and Healthcare only) |
| all rows / group members / largest gap / top or bottom fifth | mapped (table plus `groupLabel`; rank and count give the fifth) |
| history | **missing** in the table (see section 5) |
| segment note | available (`businessProfile.segments`) |
| filings | links available (`analysis.events`) |
| Key Players | available (`/structure`) |
| Value System supplier industry | available only if the user picked one on the Industry page |

**What the hiding rule does, taking the mapping above literally**
- **Hidden (no mapped rows):**
  - Overhead question (SG&A, R&D)
  - Switching-cost question (gross margin)
  - All three Working capital questions
  - Margin volatility
  - Cash conversion, if `fcf_net_income` does not count
  - Deck A #7 (no market-implied metric in the table)
  - Deck B #1 (no peer margins outside 4 sectors)
  - Deck B #2 (days rows)
  - Deck B #5 (customers, days to collect, volatility)
- **Shown with fewer rows:**
  - Pricing Q1 (operating margin only)
  - Deck A #2 (no working-capital rows)
  - Deck B #4 (gross margin history missing)
- **Depends on the history decision:** "When" and Deck A #3.
- The Working capital heading would have no rows or questions.

## Things that look missing (listed, not built)

1. Gross margin, SG&A/revenue and R&D/revenue rows.
2. Days to collect, days of inventory, days to pay suppliers and cash conversion cycle rows.
3. A margin volatility row.
4. Net debt ÷ EBITDA and operating cash flow ÷ net income rows.
5. A market-implied expectations row (such as years of excess return implied by the price).
6. Per-year group and industry medians (history).
7. The company's input values for each metric (see section 2).
8. Customers above 10%, supplier finance, purchase commitments and hedging data.
9. Filing links in the AI context (see section 5).

## Decisions for Zak

1. **Inputs in the definition panel.** Let `_spreads_payload` also return the company's input lines it already reads (fields only, no new metric)? Without this, Step 2's "company's own input values" cannot be shown.
2. **History.** No per-year group medians exist. Options:
   - (a) treat history as missing, so "When" and Deck A #3 are hidden;
   - (b) show the company's own history plus the weighted industry history;
   - (c) derive group medians in the browser from the ranking payload.
3. **Leverage and cash conversion.** Does `net_debt_ocf` count as "net debt ÷ EBITDA or similar"? Does `fcf_net_income` count as cash conversion?
4. **"Largest gap to the group, by rank."** The table ranks within the industry, not the group, and gaps are in different units, so they cannot be compared across rows. Options:
   - (a) the row whose industry rank is furthest from the middle;
   - (b) the gap as a percent of the group median.
5. **Two-row direction.** Pricing Q1 lists gross margin and operating margin. With gross margin missing, direction comes from operating margin. For the capital question, "less capital per dollar of sales" = higher sales ÷ invested capital. OK?
6. **Tutor.** A reliable "one follow-up, no own reading until two attempts" tutor needs its own prompt in `rag/server.py` (protected), or it can ride in the question slot under `ASK_SYSTEM` (simpler, less reliable). Which one?
7. **Filings to the AI.** The spec says Ask AI gets "the latest filings attached". Today the 2 filing links do not reach the AI. Adding them to the AI context is a small frontend change. OK?
8. **Definitions.** Use the comparative definitions (all 26 resolve). Also fix the Net Margin alias to point at #204 Net Income Ratio. That is one line in `individualDefinitions.ts`, outside this section. OK?
9. **Peer set caveat.** The industry is the top 20 US-dollar filers plus the company. Show that in the header note, or leave it as is?
10. **Plan item 9** in `docs/plans/2026-09-27-feature-plan.md`: mark it as replaced by this spec?
11. **Three test companies** for Step 6. Suggestion: NVDA (large group), JPM (bank, different rows), TSM (foreign filer).
