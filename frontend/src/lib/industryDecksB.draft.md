# Copy Audit: industryDecksB.ts

All user-facing strings in `frontend/src/lib/industryDecksB.ts` checked against question-maker rules, em-dash ban, author-name ban, developer-speak ban, and duplicate check against `questions.ts`.

## Deck Title Constants

| id | current text (first 80 chars) | rule(s) applied | duplicate-check result |
|----|-------------------------------|-----------------|------------------------|
| GROUP_MAP_DECK_TITLE | "Reading the Strategic Group Map" | Title convention (8): noun phrase, sentence case, no period. PASS | No dup. "Strategic Groups" exists in questions.ts but is the bottom-bank deck, not this title. |
| SHARE_RETURN_DECK_TITLE | "Return Against Market Share" | Title convention. PASS | No dup. |
| VALUE_SYSTEM_DECK_TITLE | "The Value System Around This Industry" | Title convention. PASS | No dup. |
| EVOLUTION_DECK_TITLE | "Industry Evolution" | Title convention. PASS | No dup. |
| FRAGMENTED_DECK_TITLE | "Competing in a Fragmented Industry" | Title convention. PASS | No dup. |
| EMERGING_DECK_TITLE | "Competing in an Emerging Industry" | Title convention. PASS | No dup. |
| MATURITY_DECK_TITLE | "The Transition to Maturity" | Title convention. PASS | No dup. |
| DECLINE_DECK_TITLE | "Competing in a Declining Industry" | Title convention. PASS | No dup. |
| GLOBAL_DECK_TITLE | "Competing in a Global Industry" | Title convention. PASS | No dup. |
| PROFIT_POOL_DECK_TITLE | "Where the Sector's Profit Actually Sits" | Title convention. PASS | No dup. |

## Helper Formatting Functions (user-facing fallback text)

| id | current text (first 80 chars) | rule(s) applied | duplicate-check result |
|----|-------------------------------|-----------------|------------------------|
| fmtPoints fallback | `"n/a"` | Developer-speak ban (5.4): "n/a" surfaces in question text. FLAG | n/a |
| fmtTimes fallback | `"n/a"` | Same. FLAG | n/a |
| fmtDays fallback | `"n/a"` | Same. FLAG | n/a |
| cnt fallback | `"n/a"` | Same. FLAG | n/a |

**Note on "n/a":** These appear in dataContext strings interpolated into question text and in header-note text. The question-maker rules ban developer-speak including "n/a". Consider "not available" or omitting the clause when the value is null.

## 1. Strategic Group Map Deck (buildGroupMapDeck)

| id | current text (first 80 chars) | rule(s) applied | duplicate-check result |
|----|-------------------------------|-----------------|------------------------|
| ind.groups.1 (two-group) | "Read the map. {gA.label} holds {pct} percent of revenue and earns a median {p" | 2b (names panel: "Read the map"), 2c (teaching point about barriers), 2f (lists: scale, brand, technology, distribution, capital, or government), 3a (evidence-directed). No em dash. No author name. Straight quotes. PASS | No dup. ind.define.players asks about players/groups but not barriers between groups. CLEAN |
| ind.groups.1 (one-group) | "Read the map. {gA.label} holds {pct} percent of revenue and earns a median {p" | Same rules. Reduced variant. PASS | CLEAN |
| ind.groups.2 | "Which group looks marginal, with low pre-tax returns on capital and little pro" | 2a (plain words), 2d (one decision: exit or move). No panel reference. FLAG (minor): could say "Read the map". | No dup. CLEAN |
| ind.groups.3 | "Switch on five-year movement. Are the groups moving apart, which tends to calm" | 2b (names panel action: "Switch on five-year movement"), 2c (teaching point: apart calms rivalry, converging intensifies). PASS | No dup. ind.sg_movement asks about drift of individual companies, not groups. CLEAN |
| ind.groups.4 | "Which trend in this industry is closing off a group's viability, and which is " | 2a, 2d (one decision). No panel reference. FLAG (minor): pure reasoning after evidence questions; acceptable per checklist. | No dup. CLEAN |
| ind.groups.5 | "If demand fell or a new entrant appeared, how would each group react? Firms in" | 2c (teaching point: firms in a group tend to react alike), 2d (one decision). PASS | No dup. CLEAN |
| ind.groups.6 | "Do the groups sell to the same customers? The more their customers overlap, th" | 2c (teaching point about overlap driving competition). Closes with "Putting all the above together" rather than 3d synthesis template. FLAG (medium): not formal synthesis. | No dup. sec.define.value_chain asks who keeps profit, not about customer overlap between groups. CLEAN |

**Synthesis check (rule 8):** ind.groups.6 acts as informal synthesis but does not follow 3d template ("Write the account..."). FLAG (medium).

## 2. Share-Return Curve Deck (buildShareReturnDeck)

| id | current text (first 80 chars) | rule(s) applied | duplicate-check result |
|----|-------------------------------|-----------------|------------------------|
| ind.groups.curve | "Read the curve. Do small focused companies and large companies both earn well " | 2b (names panel: "Read the curve"), 2c (teaching point: the U-shape idea has been contested), 2d (one decision: scale vs focus). No em dash. No author name. Straight quotes. PASS | No dup. ind.moat_mechanism mentions scale economies but not the share-return curve. CLEAN |

**Note:** fitNote in dataContext uses "R-squared" without definition. This is dataContext only, not question text. FLAG (minor).

## 3. Value System Deck (buildValueSystemDeck)

| id | current text (first 80 chars) | rule(s) applied | duplicate-check result |
|----|-------------------------------|-----------------|------------------------|
| ind.chain.1 | "Read the table. The supplier industry ({supplierLabel}) has an HHI of {fmtPoi" | 2b (names panel: "Read the table"), 3c (comparison: supplier vs focal), 2d (one decision: who holds bargaining power). HHI defined in TILE_LABELS. PASS | No dup. sec.define.value_chain asks who keeps profit in the value chain, not supplier vs focal bargaining. CLEAN |
| ind.chain.2 | "Companies here take {fmtDays} days to pay suppliers and wait {fmtDays} days to" | 3e (runtime with figures), 2d (one decision: who is financing whom). PASS | No dup. CLEAN |
| ind.chain.3 | "Is either adjacent industry consolidating? If buyers are consolidating, what h" | 2a, 2d. No panel reference. FLAG (minor): pure reasoning question after evidence ones; acceptable. | ind.consolidation asks about focal industry consolidation; this asks about adjacent industries. CLEAN |

**Synthesis check (rule 8):** No formal synthesis in this 3-question deck. FLAG (medium).

## 4. Evolution Deck (buildEvolutionDeck)

| id | current text (first 80 chars) | rule(s) applied | duplicate-check result |
|----|-------------------------------|-----------------|------------------------|
| ind.evolve.1 | "Are buyers becoming more experienced and better informed, so that they treat t" | 2b (names panel: "Check the spread of gross margins chart"), 2c (teaching point: commodity treatment). PASS | ind.forces.rivalry.1 asks about commodity perception from a rivalry angle; distinct. CLEAN |
| ind.evolve.2 | "Is the know-how that once protected the leaders spreading, through staff movin" | 2b (names panel: "Check the spread of R&D chart"), 2f (lists channels). PASS | No dup. CLEAN |
| ind.evolve.3 | "Have established firms from other industries entered recently or signaled that" | 2a, 2c (teaching point: new entrants from adjacent industries change the rules). PASS | ind.forces.entry questions ask about barriers, not cross-industry entry events. CLEAN |
| ind.evolve.4 | "Is a change in government policy likely to raise capital needs or minimum scal" | 2a, 2d. PASS | ind.forces.factors.3 asks about government and the five forces; this asks about government and evolution. CLEAN |
| ind.evolve.5 | "Putting the six charts and your answers together, are the barriers that protec" | 2b ("the six charts"), 2d (rising, holding, or falling), 2c (teaching point: objections to life-cycle labels). Serves as deck synthesis. PASS | ind.lifecycle_stage asks about life-cycle stage; this asks about barrier direction across evolution charts. CLEAN |

**Synthesis check (rule 8):** ind.evolve.5 functions as synthesis ("Putting the six charts and your answers together") but not in formal 3d template. FLAG (minor).

## 5. Environment Header Notes (buildEnvironmentHeaderNotes)

| id | current text (first 80 chars) | rule(s) applied | duplicate-check result |
|----|-------------------------------|-----------------|------------------------|
| FRAGMENTED header | "HHI {v}; the four largest hold {v} percent; scale slope {v} points of margin " | Statement rule (4): states figures. "R-squared" used without definition on first user-facing use. FLAG | n/a (header note) |
| EMERGING header | "Five-year growth {v} percent; the median company has {v} years of reported his" | Statement rule (4). PASS | n/a |
| MATURITY header | "Growth {v} percent in the first five years, {v} percent in the last five; cape" | Statement rule (4). PASS | n/a |
| DECLINE header | "{inflPart}; net entry {v}." | Statement rule (4). PASS | n/a |
| GLOBAL header | "The ten largest companies are based in {v} countries." | Statement rule (4). PASS | n/a |

## 5b. Environment Decks dataContext

| id | current text (first 80 chars) | rule(s) applied | duplicate-check result |
|----|-------------------------------|-----------------|------------------------|
| dataContext line 1 | "HHI: {v}, CR4: {v} percent, scale slope: {v} points per tenfold, R-squared: {" | "CR4" without meaning on first use. FLAG. "R-squared" without definition. FLAG. "n/a" fallback values. FLAG. | n/a (dataContext) |

## 5c. Fragmented Industry Questions

| id | current text (first 80 chars) | rule(s) applied | duplicate-check result |
|----|-------------------------------|-----------------|------------------------|
| ind.env.frag.1 | "Why is this industry fragmented? Consider low entry barriers, no economies of " | 2a, 2f (lists options), 2d. PASS | No dup. CLEAN |
| ind.env.frag.2 | "Can the main cause be overcome, for example by standardizing diverse needs, by" | 2a, 2f. PASS | No dup. CLEAN |
| ind.env.frag.3 | "Has any firm tried to consolidate this industry, and what happened to it?" | 2a. PASS | ind.consolidation asks current state; this asks about past attempts. CLEAN |
| ind.env.frag.4 | "If fragmentation cannot be overcome, which coping strategy do the strongest fi" | 2f (lists six strategies). PASS | No dup. CLEAN |
| ind.env.frag.5 | "Is any leading firm seeking dominance in an industry whose structure will not a" | 2c (teaching point: common strategic trap). PASS | No dup. CLEAN |
| ind.env.frag.6 | "Do the leading firms show strategic discipline, or do they chase every opportu" | 2a, 2d. PASS | No dup. CLEAN |

**Synthesis check (rule 8):** No formal synthesis. FLAG (minor).

## 5d. Emerging Industry Questions

| id | current text (first 80 chars) | rule(s) applied | duplicate-check result |
|----|-------------------------------|-----------------|------------------------|
| ind.env.emerg.1 | "Which technology or product design will win here, and how certain is that?" | 2a, 2d. PASS | No dup. CLEAN |
| ind.env.emerg.2 | "Is there an agreed right way to compete yet, or is every firm trying a differe" | 2a, 2d. PASS | No dup. CLEAN |
| ind.env.emerg.3 | "How fast are costs falling as volume grows, and who is furthest down that curv" | 2a, 2d. PASS | No dup. CLEAN |
| ind.env.emerg.4 | "Who are the first buyers, and what would convince the next group to switch fro" | 2a, 2d. PASS | No dup. CLEAN |
| ind.env.emerg.5 | "What holds back the industry's development: missing infrastructure, no product" | 2f (lists options), 2d. PASS | No dup. CLEAN |
| ind.env.emerg.6 | "Which early barriers protect today's leaders: proprietary technology, access t" | 2f (lists), 2d. PASS | No dup. CLEAN |
| ind.env.emerg.7 | "Is it better to be early or late here? Early entry pays when reputation and ex" | 2c (teaching point: when early pays vs when late pays). PASS | No dup. CLEAN |

**Synthesis check (rule 8):** No formal synthesis. FLAG (minor).

## 5e. Transition to Maturity Questions

| id | current text (first 80 chars) | rule(s) applied | duplicate-check result |
|----|-------------------------------|-----------------|------------------------|
| ind.env.mature.1 | "Growth is slowing. Are firms now fighting for market share rather than sharing" | 2a, 2d. PASS | No dup. CLEAN |
| ind.env.mature.2 | "Are buyers now experienced repeat purchasers who choose between brands rather " | 2a, 2d. PASS | No dup. CLEAN |
| ind.env.mature.3 | "Has competition shifted toward cost and service?" | 2a, 2d. Short. PASS | No dup. CLEAN |
| ind.env.mature.4 | "Is the industry adding capacity faster than demand is growing? Check the capac" | 2b (names panel: "Check the capacity chart above"). PASS | sec.capital_cycle asks about sector capex vs demand; this is industry-level. CLEAN |
| ind.env.mature.5 | "Are foreign competitors gaining share?" | 2a, 2d. Very short. PASS | No dup. CLEAN |
| ind.env.mature.6 | "Which firms have made a clear choice between low cost, differentiation, and fo" | 2a, 2f, 2d. PASS | ind.sg_stuck asks about "stuck in the middle" for one company; this asks industry-wide. CLEAN |
| ind.env.mature.7 | "Is any firm in the cash trap, investing heavily to build share in a market tha" | 2a, 2d. "Cash trap" used but defined inline by the rest of the sentence. PASS | No dup. CLEAN |
| ind.env.mature.8 | "Is any firm clinging to a claim of higher quality as a reason not to meet comp" | 2a, 2d. PASS | No dup. CLEAN |

**Synthesis check (rule 8):** No formal synthesis. FLAG (minor).

## 5f. Declining Industry Questions

| id | current text (first 80 chars) | rule(s) applied | duplicate-check result |
|----|-------------------------------|-----------------|------------------------|
| ind.env.decline.1 | "Why is demand falling: technological substitution, demographics, or changing n" | 2f, 2d. PASS | No dup. CLEAN |
| ind.env.decline.2 | "Are there pockets of demand that will stay stable or decline slowly, and who s" | 2a, 2d. PASS | No dup. CLEAN |
| ind.env.decline.3 | "How high are exit barriers: durable specialized assets, fixed costs of exit su" | 2b (names panel: "Read the exit tiles above"), 2f. PASS | ind.forces.rivalry.5 asks about exit costs from rivalry angle; this from decline-strategy angle. Overlapping but distinct. CLEAN |
| ind.env.decline.4 | "Are the remaining competitors likely to fight a war of attrition, each investi" | 2a, 2d. PASS | No dup. CLEAN |
| ind.env.decline.5 | "Consider this grid: when structure is favorable for decline and the firm has s" | 2c (teaching point: the decline strategy grid), 2d (one decision). Long but drives one ask. PASS | No dup. CLEAN |
| ind.env.decline.6 | "Is any firm harvesting without a clear end point, or failing to recognize the " | 2a, 2d. PASS | No dup. CLEAN |

**Synthesis check (rule 8):** No formal synthesis. FLAG (minor).

## 5g. Global Industry Questions

| id | current text (first 80 chars) | rule(s) applied | duplicate-check result |
|----|-------------------------------|-----------------|------------------------|
| ind.env.global.1 | "Does a firm's position in one country depend on its position worldwide? If so," | 2c (teaching point: definition of a global industry). PASS | No dup. CLEAN |
| ind.env.global.2 | "Which sources of global advantage apply: comparative advantage in costs, produ" | 2f (lists nine sources). PASS | No dup. CLEAN |
| ind.env.global.3 | "What holds back global competition here: transport costs, different product ne" | 2f (lists five impediments). PASS | No dup. CLEAN |
| ind.env.global.4 | "Which leading firms compete with a broad line worldwide, which focus on one se" | 2a, 2d. PASS | No dup. CLEAN |
| ind.env.global.5 | "Are the peers on this page the right comparison set, or are important competit" | 2a, 2d. Good meta-question. PASS | No dup. CLEAN |

**Synthesis check (rule 8):** No formal synthesis. FLAG (minor).

## 6. Profit Pool Deck (buildProfitPoolDeck)

| id | current text (first 80 chars) | rule(s) applied | duplicate-check result |
|----|-------------------------------|-----------------|------------------------|
| sec.pool.1 | "Read the profit pool chart. Which industry is wide but short (large revenue, t" | 2b (names panel: "Read the profit pool chart"), 2d. PASS | sec.profit_pool asks "who captures the economic profit" across the chain. This asks about chart shape. Related but distinct. CLEAN |
| sec.pool.2 (with top) | "The chart shows each industry's share of the sector's profit now and five year" | 2b (names panel: "The chart shows"), 3e (runtime with top industry name), 2d. PASS | sec.profit_pool asks about profit capture shifting; this asks which industry gained share and what changed. Overlapping theme. FLAG (low) |
| sec.pool.2 (no top) | "The chart shows each industry's share of the sector's profit now and five year" | Same without interpolated top industry. PASS | Same note. FLAG (low) |
| sec.pool.3 | "Are the sector's most profitable industries winning on margin, on scale (reven" | 2a ("scale (revenue share)" defines term inline), 2d. PASS | No dup. CLEAN |

**Synthesis check (rule 8):** No formal synthesis in this 3-question deck. FLAG (minor).

## dataContext strings (profit pool)

| id | current text (first 80 chars) | rule(s) applied | duplicate-check result |
|----|-------------------------------|-----------------|------------------------|
| profit pool dataContext | "Sector: {sector}, fiscal year {v}, total revenue {v}B, total operating profit" | Statement rule (4). PASS | n/a |
| per-industry dataContext | "{i.industry}: revenue share {v} percent, operating margin {v} percent, profit " | "n/a" used when profitShare is null. FLAG | n/a |

## Summary of Flags

| Severity | Count | Description |
|----------|-------|-------------|
| FLAG | 4 | "n/a" in helper fallbacks reaches user-facing text (fmtPoints, fmtTimes, fmtDays, cnt) |
| FLAG | 1 | "n/a" in profit pool per-industry dataContext when profitShare is null |
| FLAG | 2 | "R-squared" used without definition in dataContext and header note |
| FLAG | 1 | "CR4" used without meaning in dataContext string (line 362) |
| FLAG (medium) | 2 | Missing formal synthesis question (ind.groups deck, ind.chain deck) |
| FLAG (minor) | 8 | Missing formal synthesis in 5 environment sub-decks + profit pool; ind.groups.2 lacks panel ref; R-squared in fitNote |
| FLAG (low) | 1 | sec.pool.2 overlaps thematically with sec.profit_pool in questions.ts |
| PASS | all others | No em dashes, no author names, no curly quotes, no banned vocabulary, no rating-style questions |

Needs owner review

---

# Audit applied (second pass)

The first pass flagged the issues in the table above and rewrote nothing. This pass rewrote the module.

## What changed, and why

| Before | After | Rule applied |
|---|---|---|
| `fmtPoints`, `fmtTimes`, `fmtDays`, `cnt` all returned `"n/a"` | Removed. Every figure now comes from `industryStructureFormat`, and a missing figure is either left out of the sentence or printed as a full sentence | No developer shorthand in page copy or in `dataContext` |
| Profit pool context printed `"n/a"` for a null profit share | "share of sector profit not meaningful" | Same |
| `fit.r2.toFixed(3)` in the deck, `.toFixed(3)` on the page, `.toFixed(2)` in the environment header | One `formatR2`, two decimals everywhere | One formatter per idea |
| Growth printed with `pct()` on a log rate: "13.0 percent a year" | `ratePhrase` on the compound rate: "grew 13.9 percent a year" | Log rates compound before they are spoken |
| Group labels interpolated bare: `High R&D intensity, high value-added share holds ...` | Quoted: `"High R&D intensity, high value-added share" holds ...` | An interpolated label has to read as a name |
| Evolution deck averaged year-over-year growth when the backend CAGR was missing | Fallback removed; the not-available sentence prints instead | One definition per idea |
| Six evolution sentences lived in the component with no years | `buildEvolutionSentences` builds all six, each naming its years, and the component renders them | Copy lives in the copy module |
| Company-count sentence carried one caveat | Carries both drafted caveats, and names the actual coverage jump when the series shows one | Plan 2.8 card 2 |
| Group map said "Mapping 20 of 512 companies with data for both axes" | "The map plots the 20 largest of 512 companies; each group's figures cover every company in the group." | The backend now computes groups over the whole industry |
| Share-return question asked the reader to read a U shape off a line with R-squared 0.05 | Sends the reader to the scatter, not the line, and states plainly that at that level the line explains almost nothing | Do not imply a pattern the data does not carry |
| `ind.groups.2` to `.6` named no surface | Each names the map, the group cards, or the Industry Evolution charts | Every question names what to read |
| No synthesis in the group map deck | `ind.groups.6` ends in the house form | Deck ends with a synthesis |
| Environment questions named no surface | Each of the 32 names the header figures, the Key Players table, the group map, or an evolution chart | Same |
| Profit pool deck had 3 questions with no teaching point | Same 3, each with a teaching sentence after the ask | Teaching after the ask |

Counts: 6 deck builders rewritten, 55 questions rewritten (6 group map, 1 share and return, 3 value system, 5 evolution, 32 environment, 3 profit pool, plus 5 evolution sentences promoted out of the component), 5 copy constants added (`GROUP_MAP_COPY`, `SHARE_RETURN_COPY`, `VALUE_SYSTEM_COPY`, `EVOLUTION_COPY`, `PROFIT_POOL_COPY`), 4 sentence builders added (`plottedSentence`, `correlationSentence`, `shareReturnFitSentence`, `shareReturnQuartileSentence`).

## Duplicate check, with evidence

| Check | Command | Result |
|---|---|---|
| Id collision | `grep -nE 'id: "(ind\.(groups\|chain\|evolve\|env)\|sec\.pool)' questions.ts` | No matches. |
| Profit pool | `grep -n 'sec.profit_pool' questions.ts` | `sec.profit_pool` already asks who captures economic profit across the chain, without a chart. `sec.pool.1` points back at the answer to `sec.define.value_chain` rather than asking it again, and `sec.pool.2` and `.3` read figures off the new chart. Kept. |
| Strategic groups | `grep -n 'ind.sg_' questions.ts` | `ind.sg_axes`, `ind.sg_barriers`, `ind.sg_profit_gap`, `ind.sg_dcf` belong to the LEGACY margin-against-size map, which still renders. `ind.sg_barriers` and `ind.groups.1` both ask what stops a company copying the leading group. Flagged below. |
| Consolidation | `grep -n 'ind.consolidation' questions.ts` | Asks whether THIS industry is consolidating. `ind.chain.3` asks about the two ADJACENT industries. Distinct. |
| Backend decks | `grep -rniE 'profit pool\|strategic group\|bargaining' backend/individualanalysis.py backend/group_scoring.py` | No matches. |

## Needs owner review

1. **`ind.sg_barriers` against `ind.groups.1`.** Both ask what stops a company moving into the most profitable group. They sit on two different maps on the same page: the legacy margin-against-size map and the new strategic-group map. Either retire the legacy Strategic Groups section, or accept the pair.
2. **The share-return caveat is now longer than the plan's draft.** With R-squared at 0.05 on Semiconductors the fitted line carries no information, so the question and the fit sentence both say so. The plan's draft would have let the curve imply a shape.
3. **`coverageJumpNote`** is new copy not in the plan: it names the largest year-over-year jump in the company count when that jump is 15 percent or more, so the Semiconductors step from 414 in 2018 to 508 in 2019 is explained where the reader sees it.
4. **`industryLine`** (the value-system AI context builder) is new: for an industry with tickers but no financial rows it prints "No company in this industry has financial rows on file." rather than a line of gaps.
5. **`VALUE_SYSTEM_COPY.rows.companies`** adds a company-count row to the three-column table, which the plan did not list. It is what makes a one-company partner visible beside its figures.
6. **`GROUP_MAP_COPY.preTaxNote`** restates on the page that every return on the map is before tax. The plan says returns are pre-tax everywhere; this is where a reader is told.
7. **`inflationAdjusted5yRevenueChange` and `countries` are still null from the backend**, so the Declining and Global headers say so rather than showing a figure. Nothing to fix on this side.

---

## Approved copy registry (machine-checked)

The copy-conformance test (`industryDecksB.conformance.test.ts`) parses this
table and diffs it against the module's static exports in both directions.
Only placeholder-free strings appear here; templated builder functions
(buildGroupMapDeck, buildShareReturnDeck, buildValueSystemDeck,
buildEvolutionDeck, buildEvolutionSentences, buildEnvironmentDecks,
buildEnvironmentHeaderNotes, buildProfitPoolDeck, plottedSentence,
correlationSentence, shareReturnFitSentence, shareReturnQuartileSentence,
peerCountCell, valueSystemIntro) are checked by the rendering tests instead.
A pipe character inside a string is written as `\|`.

| Key | Final text |
|---|---|
| `DECLINE_DECK_TITLE` | Competing in a Declining Industry |
| `EMERGING_DECK_TITLE` | Competing in an Emerging Industry |
| `envSection.eyebrow` | Structural Fit |
| `envSection.heading` | Which Environment Is This? |
| `EVOLUTION_DECK_TITLE` | Industry Evolution |
| `evolution.cards.capacity` | Capital spending against depreciation |
| `evolution.cards.companies` | Companies and net entry |
| `evolution.cards.hhi` | Concentration (HHI) |
| `evolution.cards.marginSpread` | Gross margin spread between companies |
| `evolution.cards.rdSpread` | Research and development spread between companies |
| `evolution.cards.revenue` | Revenue and growth |
| `evolution.countCaveat` | These are listings, not firm births. A jump in the count can be the data vendor widening coverage rather than companies being founded, and the most recent year can look low because some companies have not reported yet. |
| `evolution.lifeCycleNote` | Why not just use the life cycle? The main objections: stage lengths vary widely; industries skip or reverse stages; companies can change the curve through innovation; and the nature of competition at each stage differs by industry. |
| `evolution.title` | Industry Evolution |
| `FRAGMENTED_DECK_TITLE` | Competing in a Fragmented Industry |
| `GLOBAL_DECK_TITLE` | Competing in a Global Industry |
| `GROUP_MAP_DECK_TITLE` | Reading the Strategic Group Map |
| `groupMap.bubbleNote` | Bubble area is each company's share of industry revenue. |
| `groupMap.correlationRule` | A common rule for these maps: choose dimensions that do not move together. |
| `groupMap.fiveYearToggle` | Show five-year movement |
| `groupMap.loading` | Loading the strategic group map. |
| `groupMap.noMap` | This industry does not have enough companies with usable data to plot a group map. |
| `groupMap.overviewLink` | How the strategic-group map works |
| `groupMap.preTaxNote` | Every return shown on this map is before tax, so it does not match the after-tax return on capital on a company page. |
| `groupMap.title` | Strategic Group Map |
| `MATURITY_DECK_TITLE` | The Transition to Maturity |
| `PROFIT_POOL_DECK_TITLE` | Where the Sector's Profit Actually Sits |
| `profitPool.empty` | No industry in this sector has both revenue and operating profit on file. |
| `profitPool.negative` | This sector's combined operating profit is negative, so shares of it are not meaningful and are left blank. |
| `profitPool.note` | Bar width is each industry's share of sector revenue and bar height is its operating margin, so the area of a bar is its share of the sector's operating profit. |
| `profitPool.title` | Profit Pool |
| `SHARE_RETURN_DECK_TITLE` | Return Against Market Share |
| `shareReturn.caveat` | The idea that companies caught between low cost and differentiation earn the least has been contested. Later studies disagree, and a high share may be a result of good management rather than a cause of high returns. |
| `shareReturn.empty` | Not enough companies here carry both a revenue share and a return on capital to draw this curve. |
| `shareReturn.title` | Share and Return |
| `STRATEGIC_GROUPS_DECK_TITLE` | Strategic Groups |
| `VALUE_SYSTEM_DECK_TITLE` | The Value System Around This Industry |
| `valueSystem.buyerPicker` | Which industry buys the output? |
| `valueSystem.focalTag` | focal |
| `valueSystem.placeholder` | Select an industry |
| `valueSystem.rows.companies` | Companies behind these figures |
| `valueSystem.rows.growth` | Revenue growth over five years |
| `valueSystem.rows.hhiNow` | Herfindahl-Hirschman Index (HHI) now |
| `valueSystem.rows.hhiThen` | Herfindahl-Hirschman Index (HHI) five years ago |
| `valueSystem.rows.margin` | Median operating margin |
| `valueSystem.supplierPicker` | Which industry supplies the most important input? |
| `valueSystem.title` | Value System |
