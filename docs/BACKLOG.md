# IntrinsicFinEd backlog (triaged 2026-09-27)

Every item was checked against the code (read-only grep + git log) before sizing.
FactSet integration is excluded by owner decision.

Sizes: **S** = UI, questions or one formula, no new data source (<~150 lines).
**M** = new endpoint or free data feed. **L** = new engine, schema, or no free data.

Before building any item: re-check the "Evidence" files, build only the "Minimal scope", and stop.

## Already built (drop from the list)

| Item | Evidence |
|---|---|
| Understanding-first questions (company/industry/economy) | 6fcad6e; EconomicPage "Understand the Economy First"; IndividualPage "What This Company Does" |
| Inflation lesson: priced-in + durability gates, pricing-power teaching | lib/rotationAutoFill.ts gates; content/help/rotationWeights.md |
| Company share of industry revenue | company_profile/generic_strategy.py `revenueShare`; KeyPlayersPanel Share column |
| Reverse DCF | components/individual/ReverseDcfSection.tsx |
| Beneish M-score | individualanalysis.py `_beneish_m`; ShenanigansSection.tsx |
| Rank matrix by a single metric | 572e1b1; lib/sectorMetrics.ts `sortMatrixData` |
| RARR verification wired into live AI answers | rag/server.py verify tier0 on /ask /explain /define; RAG_VERIFY=on |
| Landing page scroll animations | LandingPage.tsx fade-up + parallax (Scroll World not needed) |
| Sell-with-a-motive deck (shipped 2026-10-02; indiv.sell_discipline retired into it) | lib/questions.ts `sellWithMotive`; ReportPage.tsx per-ticker block; lib/sellMotive.ts (+ test); `gatherContext` on QualitativeBlock, AI click logic in lib/useAskAi.ts |
| ESG: what drives the company's ESG risk (shipped 2026-10-02; SASB map dropped for licensing, replaced by a valuation-input test in hidden AI guidance) | lib/esgRatingDeck.ts (+ test); EsgSection.tsx: dead score tiles removed, MSCI + Sustainalytics public links, 9-question runtime deck "What Drives {company}'s ESG Risk" |
| Moat direction + growth sustainability (shipped 2026-10-02) | individualanalysis.py `_moat_direction`; MoatDirectionSection.tsx; lib/moatDirectionDeck.ts |
| Head to Head, build step 1 (shipped 2026-10-22; competitors still from the industry peer panel, AI relationship map and Q5-Q7 tables not built) | company_profile/rivals.py ROE legs, return on capital, `groupShares`; HeadToHeadSection.tsx on the comparative page; lib/headToHead.ts (+ test); lib/questions.ts `headToHeadBefore` / `headToHeadAfter` |
| Head to Head, build step 2: Ask AI relationship map (shipped 2026-10-23; button-click build, sourced links only, shared per company, map competitors from other industries selectable as rivals; manual add-a-company and follow-up questions not built) | backend/relationship_map/ (prompt, parse, store, build); GET/POST /api/individual/{t}/relationship-map; RelationshipMapPanel.tsx; lib/relationshipMap.ts |
| Bubble / recession / fraud / debt-crisis question framework (shipped 2026-10-22; overlaps with older decks kept on purpose, owner picks; bottom-bank decks only, no new data or panels) | lib/questions.ts: individual `indiv.frag.*` (9 decks: pillars A-G, pre-revenue, judgment); economic `econ.bubble.*` / `econ.debtcrisis.*` / `econ.fragility.*` / `econ.judgment.*` (5 decks); credit `credit.forces.*` (1 deck) |

## Small (S): quick wins, existing data

| Item | What exists | Minimal scope |
|---|---|---|
| Story-based DCF | "Narrative & Expectations" deck; valuation/engines.py | 3 questions → growth, margin, reinvestment overrides → recompute existing DCF (needs 1 small override endpoint, so S/M) |
| Price / EVA per share, MV / EVA | EVA + MVA in individualanalysis.py | Two ratios added to EVAValuationSection |
| Show company vs industry spread + supplier questions | /api/individual/{t}/spreads (only feeds AI today) | Render the spread table; add supplier questions to connect deck |
| Earnings-call transcript links | EventsSection "Latest Filings" | Add transcript link rows to the documents list |
| Matrix: EV/EBITDA, SG&A/Sales, metric picker | peRatio in matrices; EV/EBITDA only in some sector lenses | Add both columns everywhere + a column picker |
| Capex split + R&D capitalization view | owner earnings split; `_rnd_capitalization` computed | Render both as tables with existing maint_capex questions |
| China imports/exports y/y | FRED pipeline | Two FRED series on Economic page (OECD source, lags) |
| 200-month SMA | none | Overlay on price and P/E charts |
| Discretionary + food spending charts | RSAFS retail sales | Split series from FRED |
| "Does growth justify P/E" + ROIC-WACC vs P/E | FedModelSection (market level), roicWaccSpread | Company-level earnings yield vs 10y + question; ratio only, no new score |
| Inflation weight in group scorecard | rotation page handles it; group_scoring.py does not | Lower or remove inflation weight there |
| Company deck strictly first | deck exists, sits after connect deck | Reorder on IndividualPage |
| SEO basics | meta/OG tags in index.html | sitemap.xml, robots.txt, canonical, JSON-LD |

## Medium (M): new endpoint or free feed

| Item | What exists | Note |
|---|---|---|
| Selectable Kd / WACC methods (accounting vs market) | Kd fixed at rf + synthetic spread | Toggle + recompute |
| Agency credit ratings | synthetic rating only | Ratings are licensed; practical version = user-entered rating override |
| 13F + Form 4 feeds (covers insider holdings item) | DEF 14A link only | Reuse betas/edgar_client.py |
| Earnings calendar / corporate actions | none | yfinance |
| Transcripts + in-app filing viewer + AI on metric adjustments | 10-K/10-Q links + "Explain this filing" | Transcripts have no clean free source |
| Geographic revenue + subsidiaries (enables revenue map) | segments on backend, not rendered; geography axis skipped | Parse EDGAR geography axis, then map |
| Industry-specific data on sector pages (oil/gas spot etc.) | commodity grid on Economic page only | Map commodities → sectors |
| Period-over-period delta for every metric | first→last delta, YoY toggle | Apply to matrices + peer tables |
| Treasury issuance / auction analysis | debt % GDP, TGA, yields | Treasury FiscalData API is free |
| Fed move probabilities | none | Derive from fed funds futures (ZQ) |
| Economic events calendar by sector | none | |
| 15-min refresh of yields + multiples | prices refresh every 15 min | Extend to yields and price-based multiples |
| Industry P/E / CAPE from live index pricing | computed from constituents weekly | Use ETF price |
| Forward estimates per metric + projection questions | model projections in ForecastSection | Analyst estimates are mostly paid |
| Monte Carlo | none | On top of existing DCF engine |
| Business classification system | lifecycle, strategic groups, Damodaran mapping | Define taxonomy first |
| Emerging industries list | per-industry lifecycle stage | Cross-industry list of "emerging" stage |
| Global markets matrix (China, US, EU, Japan) | question decks only | Country data feed + country × sector grid (M/L) |
| Scheduled audit of calc code + updaters | 4 IntrinsicFinEd data tasks run | No code audit task; ValuationData tasks point at deleted folder |
| Remaining Damodaran chapters | Ch.2,4-15,17,19-22,25,26,32 referenced | Ch.1,3,16,18,23-24,27-31,33+ uncovered |
| Site-wide AI answers, monthly refresh | per-user Convex cache | Shared cache + 30-day expiry |
| Newsletter | none | Needs mail provider + subscriber table |
| Usage analytics / retention tracking | none; privacy page promises "no analytics" | Must update PrivacyPage first |
| User ratings / feedback | privacy + terms pages exist | Feedback widget |

## Large (L) or no free data

| Item | Why large |
|---|---|
| Story-driven full projected statements (IS/BS/CF) | New projection model |
| Company-specific supplier data | No free source |
| M&A deal analysis | No deal feed |
| Treasury + company CDS | Paid data |
| Multi-agent best-answer selection (Orca) | New orchestration; RARR is sequential today |
| Marketing automation, Meta ads, ad videos, Discord | Outside the codebase |

## Not checked

- Ratio checklist `download.pdf`: need the file.
- Notion timeline page: not read.
