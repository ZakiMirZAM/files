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

## Small (S): quick wins, existing data

| Item | What exists | Minimal scope |
|---|---|---|
| Story-based DCF | "Narrative & Expectations" deck; valuation/engines.py | 3 questions → growth, margin, reinvestment overrides → recompute existing DCF (needs 1 small override endpoint, so S/M) |
| Price / EVA per share, MV / EVA | EVA + MVA in individualanalysis.py | Two ratios added to EVAValuationSection |
| Two-company head-to-head | rivals endpoint, PeerRankingTable | Pick 2 tickers → side-by-side table + one "why does this differ" deck |
| Show company vs industry spread + supplier questions | /api/individual/{t}/spreads (only feeds AI today) | Render the spread table; add supplier questions to connect deck |
| ESG through SASB | EsgSection.tsx, ind.esg questions | Static SASB material-topics map per industry + "what drives the rating" questions (Yahoo ESG feed is dead) |
| Earnings-call transcript links | EventsSection "Latest Filings" | Add transcript link rows to the documents list |
| Matrix: EV/EBITDA, SG&A/Sales, metric picker | peRatio in matrices; EV/EBITDA only in some sector lenses | Add both columns everywhere + a column picker |
| Capex split + R&D capitalization view | owner earnings split; `_rnd_capitalization` computed | Render both as tables with existing maint_capex questions |
| China imports/exports y/y | FRED pipeline | Two FRED series on Economic page (OECD source, lags) |
| 200-month SMA | none | Overlay on price and P/E charts |
| Moat grow/decline + growth sustainability questions | ind.moat, comp2.relative_moat | 2-3 company-level questions |
| Sell-with-a-motive deck | indiv.sell_discipline, Graham Ch.20 | Dedicated short deck on the final report |
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
