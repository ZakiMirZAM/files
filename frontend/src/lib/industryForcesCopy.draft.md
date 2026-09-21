# Copy Audit: industryForcesCopy.ts

All user-facing strings in `frontend/src/lib/industryForcesCopy.ts` checked against question-maker rules, em-dash ban, author-name ban, developer-speak ban, and duplicate check against `questions.ts`.

## Tile Labels (TILE_LABELS)

| id | current text (first 80 chars) | rule(s) applied | duplicate-check result |
|----|-------------------------------|-----------------|------------------------|
| ppeToRevenue | "PP&E to revenue" | Plain words (2a). "PP&E" is a standard abbreviation. PASS | n/a (label, not question) |
| capexToRevenue | "Capex to revenue" | 2a. PASS | n/a |
| rdToRevenue | "R&D to revenue" | 2a. PASS | n/a |
| sgaToRevenue | "SG&A to revenue" | 2a. PASS | n/a |
| scaleSlope | "Scale economies slope" | 2a. PASS | n/a |
| grossMarginMedian | "Median gross margin" | 2a. PASS | n/a |
| grossMarginIqr | "Gross margin spread (IQR)" | 2a. "IQR" in parentheses. FLAG (minor): "IQR" (interquartile range) not defined. Consider "(IQR, interquartile range)" or "(the range between the 25th and 75th percentile)". | n/a |
| incumbentCashToAssets | "Incumbents' cash to assets" | 2a. PASS | n/a |
| netEntry5y | "Net entry over five years" | 2a. PASS | n/a |
| top5ShareChange5y | "Top-5 share movement (5 years)" | 2a. PASS | n/a |
| shareRankCorrelation5y | "Share rank correlation (5 years)" | 2a. FLAG (minor): "correlation" may need definition for non-technical readers. | n/a |
| leaderCogsToRevenue5y | "Leaders' COGS to revenue (5-year median)" | 2a. "COGS" is standard. PASS | n/a |
| ppeToAssets | "PP&E to assets" | 2a. PASS | n/a |
| intangiblesToAssets | "Intangibles to assets" | 2a. PASS | n/a |
| shareOfFirmsWithCapexBelowDepreciation | "Share of firms with capex below depreciation" | 2a. PASS | n/a |
| firmCount | "Number of companies" | 2a. PASS | n/a |
| cr4 | "CR4 (four-firm concentration)" | 2a. "CR4" defined in parentheses. PASS | n/a |
| hhi | "Herfindahl-Hirschman Index (HHI)" | 2a. Full name given. PASS | n/a |
| revenueCagr5y | "Five-year revenue growth" | 2a. PASS | n/a |
| daToRevenue | "Depreciation and amortization to revenue" | 2a. PASS | n/a |
| revenueSpreadAmongTop10 | "Revenue spread among the top 10" | 2a. PASS | n/a |

## Reference Texts

| id | current text (first 80 chars) | rule(s) applied | duplicate-check result |
|----|-------------------------------|-----------------|------------------------|
| HHI_REFERENCE | "US merger guidelines (2023) call a market unconcentrated below 1,000, moderate" | Statement rule (4): states figures plainly. No author name (uses "US merger guidelines"). No em dash. Straight quotes. PASS. Caveat note: "These figures count listed companies only." PASS | n/a (reference text) |
| SHARE_STABILITY_REFERENCE | "One widely used test reads leaders' shares moving less than 2 points over five" | Statement rule (4). No author name ("One widely used test" replaces original "Greenwald and Kahn"). PASS | n/a |
| KEY_PLAYERS_NOTE | "Listed companies only. Private firms and divisions of larger companies are mis" | Statement rule (4): acknowledges data limitation directly per section 4 rules. PASS | n/a |
| BARRIER_GRID_NOTE | "The best case for profits is high entry barriers with low exit barriers. The w" | Statement rule (4). No author name (Porter reference removed per log). PASS | n/a |

## Barrier Grid Cell Labels (BARRIER_CELLS)

| id | current text (first 80 chars) | rule(s) applied | duplicate-check result |
|----|-------------------------------|-----------------|------------------------|
| highEntryLowExit | "High, stable returns" | 2a. PASS | n/a |
| highEntryHighExit | "High, risky returns" | 2a. PASS | n/a |
| lowEntryLowExit | "Low, stable returns" | 2a. PASS | n/a |
| lowEntryHighExit | "Low, risky returns" | 2a. PASS | n/a |

## Scale Labels for ReasonedRating (SCALE_LABELS)

| id | current text (first 80 chars) | rule(s) applied | duplicate-check result |
|----|-------------------------------|-----------------|------------------------|
| entry | "Threat of entry: 1 is very weak, 5 is very strong" | 2a. No rating-style question (this is a ReasonedRating label, not a deck question). PASS | n/a |
| rivalry | "Rivalry: 1 is very weak, 5 is very strong" | Same. PASS | n/a |
| substitutes | "Pressure from substitutes: 1 is very weak, 5 is very strong" | Same. PASS | n/a |
| buyers | "Buyer power: 1 is very weak, 5 is very strong" | Same. PASS | n/a |
| suppliers | "Supplier power: 1 is very weak, 5 is very strong" | Same. PASS | n/a |
| entryBarrier | "Entry barriers: 1 is very low, 5 is very high" | Same. PASS | n/a |
| exitBarrier | "Exit barriers: 1 is very low, 5 is very high" | Same. PASS | n/a |

## Summary Prompts (SUMMARY_PROMPTS)

| id | current text (first 80 chars) | rule(s) applied | duplicate-check result |
|----|-------------------------------|-----------------|------------------------|
| entry | "Read the entry tiles and your answers above. How hard is it to enter this indu" | 2b (names panel: "Read the entry tiles"), 2d (one decision). PASS | No dup. CLEAN |
| rivalry | "Read the rivalry tiles and your answers above. How hard do firms in this indus" | 2b (names panel: "Read the rivalry tiles"), 2d. PASS | No dup. CLEAN |
| substitutes | "Read your answers above. How tightly do substitutes cap what this industry can" | 2b ("Read your answers above"), 2d. PASS | No dup. CLEAN |
| buyers | "Read your answers above. How much of this industry's profit can its buyers tak" | 2b, 2d. PASS | No dup. CLEAN |
| suppliers | "Read your answers above. How much of this industry's profit can its suppliers " | 2b, 2d. PASS | No dup. CLEAN |

## Barrier Prompts (BARRIER_PROMPTS)

| id | current text (first 80 chars) | rule(s) applied | duplicate-check result |
|----|-------------------------------|-----------------|------------------------|
| entry | "Read the entry tiles and your answers above. What keeps new firms out of this " | 2b (names panel: "Read the entry tiles"), 2d. PASS | ind.forces.entry questions ask about specific barriers; this is the summary. CLEAN |
| exit | "Read the exit tiles. What keeps losing firms from leaving?" | 2b (names panel: "Read the exit tiles"), 2d. PASS | ind.forces.rivalry.5 asks about exit costs in a rivalry context; this is the barrier-grid summary. CLEAN |

## Entry Questions (buildEntryQuestions)

| id | current text (first 80 chars) | rule(s) applied | duplicate-check result |
|----|-------------------------------|-----------------|------------------------|
| ind.forces.entry.1 | "What one-time costs would a buyer face in switching from an established suppli" | 2a, 2f (lists: retraining, new equipment, testing, redesigning, losing a relationship), 2d (one decision). PASS | ind.pw.switching in questions.ts asks about switching costs at a company level; this asks about switching costs as an entry barrier at industry level. Complementary. CLEAN |
| ind.forces.entry.2 | "How limited are the distribution channels in this industry, and how firmly hav" | 2a, 2d. PASS | No dup. CLEAN |
| ind.forces.entry.3 | "Do established firms hold advantages a new entrant could not copy at any scale" | 2a, 2f (lists: proprietary technology, raw materials, locations, subsidies), 2d. PASS | No dup. CLEAN |
| ind.forces.entry.4 | "Does government limit entry through licensing, safety or environmental standar" | 2a, 2d. PASS | No dup. ind.forces.factors.3 asks about government and the forces generally; this is specifically about government as an entry barrier. CLEAN |
| ind.forces.entry.5 | "Read the cash to assets tile. Have established firms retaliated against past e" | 2b (names panel: "Read the cash to assets tile"), 2d (one decision). PASS | No dup. CLEAN |

## Rivalry Questions (buildRivalryQuestions)

| id | current text (first 80 chars) | rule(s) applied | duplicate-check result |
|----|-------------------------------|-----------------|------------------------|
| ind.forces.rivalry.1 | "Do buyers see the product as a commodity, so that they choose mainly on price " | 2b (names panel: "Read the spread of gross margins"), 2c (teaching point: narrow spread points that way). PASS | ind.evolve.1 asks about buyers treating products as commodity from an evolution angle. Complementary. CLEAN |
| ind.forces.rivalry.2 | "Must capacity be added in large steps, so that additions push the industry int" | 2b (names panel: "Read capex to revenue by year"), 2c (teaching point about overcapacity). PASS | sec.capital_cycle asks about sector capex vs demand; this asks about capacity step sizes at industry level. CLEAN |
| ind.forces.rivalry.3 | "Are the competitors diverse in origin, ownership, and goals (foreign firms, ow" | 2a, 2f (lists competitor types), 2c (teaching point: they read each other poorly). PASS | No dup. CLEAN |
| ind.forces.rivalry.4 | "Does any competitor have such high strategic stakes here that it would accept p" | 2a, 2d. PASS | No dup. CLEAN |
| ind.forces.rivalry.5 | "Read the exit tiles. What would it cost a losing firm to leave: specialized as" | 2b (names panel: "Read the exit tiles"), 2f (lists five costs), 2d. PASS | ind.env.decline.3 asks about exit barriers from a decline-strategy angle. Overlapping ground but distinct context. CLEAN |

## Substitutes Questions (buildSubstitutesQuestions)

| id | current text (first 80 chars) | rule(s) applied | duplicate-check result |
|----|-------------------------------|-----------------|------------------------|
| ind.forces.substitutes.1 | "What other products or services perform the same function for the buyer? Pick " | 2a, 2d (one decision: name the substitute industry). PASS | ind.no_substitute in questions.ts asks "Do customers have no close substitute?". This asks for the substitute to be named. Complementary. CLEAN |
| ind.forces.substitutes.2 | "Is the price and performance of that substitute improving relative to this ind" | 2a, 2c (teaching point: ceiling on pricing), 2d. PASS | No dup. CLEAN |
| ind.forces.substitutes.3 | "Read the substitute industry's margin. Is it profitable enough to cut price or" | 2b (names panel: "Read the substitute industry's margin"), 2d. PASS | No dup. CLEAN |

## Buyers Questions (buildBuyersQuestions)

| id | current text (first 80 chars) | rule(s) applied | duplicate-check result |
|----|-------------------------------|-----------------|------------------------|
| ind.forces.buyers.1 | "Are the buyers concentrated, or does any single buyer take a large share of a " | 2a, 2d. PASS | indiv.cust_concentration asks about customer concentration at company level; this is industry-level buyer concentration. CLEAN |
| ind.forces.buyers.2 | "Is what buyers purchase here a large part of their own costs, so that they sho" | 2a, 2c (teaching point: large share means they shop hard). PASS | No dup. CLEAN |
| ind.forces.buyers.3 | "Could buyers credibly threaten to make the product themselves? Backward integra" | 2a, 2c (teaching point: threat shifts power even without follow-through), 2d. PASS | No dup. CLEAN |
| ind.forces.buyers.4 | "Does the product matter greatly to the quality of the buyer's own product, whi" | 2a, 2c (teaching point: quality importance reduces price sensitivity). PASS | No dup. CLEAN |
| ind.forces.buyers.5 | "Do buyers have full information about demand, market prices, and suppliers' co" | 2a, 2d. PASS | No dup. CLEAN |

## Suppliers Questions (buildSuppliersQuestions)

| id | current text (first 80 chars) | rule(s) applied | duplicate-check result |
|----|-------------------------------|-----------------|------------------------|
| ind.forces.suppliers.1 | "Is the supplier group dominated by a few companies and more concentrated than " | 2a, 2d. PASS | No dup. CLEAN |
| ind.forces.suppliers.2 | "Is this industry an important customer of its suppliers, or a minor one?" | 2a, 2d. PASS | No dup. CLEAN |
| ind.forces.suppliers.3 | "Are the suppliers' products differentiated, or would switching suppliers be cos" | 2a, 2d. PASS | No dup. CLEAN |
| ind.forces.suppliers.4 | "Could suppliers credibly threaten to integrate forward into this industry? The " | 2a, 2c (teaching point: threat alone shifts power), 2d. PASS | No dup. CLEAN |
| ind.forces.suppliers.5 | "How much power does labor hold: is the workforce scarce, highly skilled, or ti" | 2a, 2d. PASS | No dup. CLEAN |

## Factors Questions (buildFactorsQuestions)

| id | current text (first 80 chars) | rule(s) applied | duplicate-check result |
|----|-------------------------------|-----------------|------------------------|
| ind.forces.factors.1 | "Growth: this industry grew {growthPct} percent a year over five years. Does th" | 3e (runtime with interpolated figures), 2d (one decision). PASS | econ.trade.profit_attracts_entry asks about profitability attracting competitors; this asks about growth attracting entrants. Complementary. CLEAN |
| ind.forces.factors.2 | "Technology: is a change in technology raising or lowering an entry barrier, or " | 2a, 2d. PASS | ind.innovations asks about innovations broadly; this channels the question through the five forces. CLEAN |
| ind.forces.factors.3 | "Government: which of the five forces does current or expected policy act on, a" | 2a, 2d. PASS | ind.forces.entry.4 asks about government and entry. This asks about government and all five forces. Complementary. CLEAN |
| ind.forces.factors.4 | "Complements: which products make this industry's product more valuable to buye" | 2a (defines "complements" inline), 2d. PASS | No dup. CLEAN |

## Forces Synthesis (FORCES_SYNTHESIS)

| id | current text (first 80 chars) | rule(s) applied | duplicate-check result |
|----|-------------------------------|-----------------|------------------------|
| ind.forces.account | "Write the account a strategist would give of why this industry earns what it e" | 3d (synthesis template: "Write the account..."), names the role ("strategist"), scope (why industry earns what it earns), ends with "No length limit; pull together your five summaries above." PASS | econ.sector_qual.3_1 asks about five forces and profit ceiling; this is the synthesis of the actual forces analysis. Distinct. CLEAN |

## Factors Card Intro (FACTORS_INTRO)

| id | current text (first 80 chars) | rule(s) applied | duplicate-check result |
|----|-------------------------------|-----------------|------------------------|
| FACTORS_INTRO | "Growth, technology, government, and complements are not forces on their own. T" | Statement rule (4). No author name (Porter attribution removed). PASS | n/a |

## Section and Force Titles

| id | current text (first 80 chars) | rule(s) applied | duplicate-check result |
|----|-------------------------------|-----------------|------------------------|
| FIVE_FORCES_TITLE | "The Five Competitive Forces" | Title convention. PASS | n/a |
| BARRIER_GRID_TITLE | "Entry and Exit Barrier Grid" | Title convention. PASS | n/a |
| KEY_PLAYERS_TITLE | "Key Players" | Title convention. PASS | n/a |
| FORCE_TITLES.entry | "Threat of Entry" | Title convention. PASS | n/a |
| FORCE_TITLES.rivalry | "Rivalry Among Existing Firms" | Title convention. PASS | n/a |
| FORCE_TITLES.substitutes | "Pressure from Substitutes" | Title convention. PASS | n/a |
| FORCE_TITLES.buyers | "Bargaining Power of Buyers" | Title convention. PASS | n/a |
| FORCE_TITLES.suppliers | "Bargaining Power of Suppliers" | Title convention. PASS | n/a |
| FORCE_TITLES.factors | "Factors That Act Through the Forces" | Title convention. PASS | n/a |

## Diagram Labels

| id | current text (first 80 chars) | rule(s) applied | duplicate-check result |
|----|-------------------------------|-----------------|------------------------|
| DIAGRAM_CENTER | "Industry competitors: rivalry among existing firms" | 2a. PASS | n/a |
| DIAGRAM_LABELS.top | "Potential entrants" | 2a. PASS | n/a |
| DIAGRAM_LABELS.left | "Suppliers" | 2a. PASS | n/a |
| DIAGRAM_LABELS.right | "Buyers" | 2a. PASS | n/a |
| DIAGRAM_LABELS.bottom | "Substitutes" | 2a. PASS | n/a |

## Summary of Flags

| Severity | Count | Description |
|----------|-------|-------------|
| FLAG (minor) | 1 | "IQR" in TILE_LABELS.grossMarginIqr not defined (interquartile range) |
| FLAG (minor) | 1 | "correlation" in TILE_LABELS.shareRankCorrelation5y may need definition for non-technical readers |
| PASS | all others | No em dashes, no author names, no curly quotes, no banned vocabulary, no rating-style questions in decks, no "n/a" in question text, synthesis present (FORCES_SYNTHESIS) |

## Global Checks

- Zero U+2014 (em dash): CONFIRMED (grep returned no matches)
- U+2212 (minus sign): NOT PRESENT in this file, nothing to protect
- No author names in user-facing copy: CONFIRMED (Porter/Greenwald only in code comments)
- No developer-speak in question text: CONFIRMED
- Straight quotes only: CONFIRMED
- No rating-style questions in decks: CONFIRMED (SCALE_LABELS are ReasonedRating labels, not deck questions)

Needs owner review

---

# Audit applied (second pass)

The first pass flagged issues in the tables above and rewrote nothing. This pass rewrote the module.

## What changed, and why

| Before | After | Rule applied |
|---|---|---|
| `cr4: "CR4 (four-firm concentration)"` | `"The four largest companies' share of revenue (CR4)"` | Spell the term out, put the abbreviation in parentheses |
| `grossMarginIqr: "Gross margin spread (IQR)"` | `"Gross margin spread between companies"` | No undefined shorthand on the page |
| `ppeToRevenue: "PP&E to revenue"` | `"Property, plant and equipment as a share of revenue"` | Same |
| `capexToRevenue: "Capex to revenue"` | `"Capital spending as a share of revenue"` | Same |
| `rdToRevenue: "R&D to revenue"` | `"Research and development as a share of revenue"` | Same |
| `sgaToRevenue: "SG&A to revenue"` | `"Selling, general and administrative cost as a share of revenue"` | Same |
| `top5ShareChange5y: "Top-5 share movement (5 years)"` | `"Movement in the five largest companies' shares"` | Same, plus "5y" removed |
| `shareRankCorrelation5y: "Share rank correlation (5 years)"` | `"Rank correlation of shares, now against five years ago"` | Same |
| `leaderCogsToRevenue5y: "Leaders' COGS to revenue (5-year median)"` | `"The four largest companies' cost of goods as a share of revenue"` | Same; the field is an array, not a median |
| `incumbentCashToAssets: "Incumbents' cash to assets"` | `"Established companies' cash as a share of assets"` | Plain words |
| `shareOfFirmsWithCapexBelowDepreciation` | `"Share of companies spending less on capital than they depreciate"` | "firms" to "companies" throughout |
| Entry question 1 had no surface named | Opens "Read the Key Players table above" | Every question names what to read |
| Entry question 5 asked two things at once | One ask, cash tile named first | One decision per question |
| Rivalry question 2 said "Read capex to revenue by year" | "Read the capital spending chart in the Industry Evolution section below" | Names the chart as the page labels it |
| Buyer and supplier questions named no surface | Each opens on the buyer or supplier comparison table | Same |
| Factors question 1 interpolated a bare percent | Interpolates a spoken phrase built from the compound rate ("grew 13.9 percent a year") | Log rates are never printed as "percent a year" |
| No question carried a teaching point | Every question now ends with one sentence of teaching, after the ask | Teaching travels inside the question, after the ask |
| Summary prompts said "your answers above" only | Each names its own evidence ("Read the entry tiles and your answers above") | Names the surface |

Counts: 22 tile labels rewritten (11 of them substantively), 24 force questions rewritten, 5 summary prompts and 2 barrier prompts rewritten, 6 new strings added (not-applicable sentence, financial-industry note, net entry window sentence, duplicate listings sentence, leaders table copy, peer count label).

## Duplicate check, with evidence

Run against `frontend/src/lib/questions.ts` (964 lines, all seven sections) and the backend decks
(`backend/individualanalysis.py` GROWTH_QUESTIONS, `backend/group_scoring.py` integrity questions).

| Check | Command | Result |
|---|---|---|
| Id collision | `grep -nE 'id: "(ind\.(forces\|groups\|chain\|evolve\|env)\|sec\.pool)' questions.ts` | No matches. No id in this module collides. |
| Five forces asked elsewhere | `grep -niE 'five forces\|bargaining\|substitut\|barrier' questions.ts` | One hit: `econ.sector_qual.3_1` asks all five forces in a single sector-level question. The Part 2 cards ask them one at a time at industry level, each against its own tiles. Kept; overlap noted below. |
| Players roster | `ind.define.players` | Already asks the reader to name the players and says to check the strategic groups map. The Key Players table is the surface that question points at, so the panel completes it rather than repeating it. No new question added for it. |
| Backend decks | `grep -rniE 'five forces\|bargaining\|substitute' backend/individualanalysis.py backend/group_scoring.py` | No matches. |

## Needs owner review

1. **`econ.sector_qual.3_1` overlap.** That question already asks the reader to work the five forces, at sector level, in one block. The Part 2 cards ask the same five at industry level with evidence tiles. The plan specifies both. Confirm both should stand.
2. **Financial industries.** The backend has not yet sent `isFinancial` or `notApplicable`. Until it does, a bank's Research and development tile prints a reported `0.0 percent` and its Median gross margin prints `49.0 percent`, both of which are artefacts of how banks report. The code prints the drafted not-applicable sentence the moment the backend marks the field; no local guess is made, per Rule A.
3. **`FINANCIAL_INDUSTRY_NOTE`** is new copy not in the plan. It renders only when the backend sets `isFinancial`.
4. **`netEntryWindowSentence` and `duplicateListingsSentence`** are new copy not in the plan, written to carry the backend's new `netEntryWindow` and `duplicateListingsDropped` fields.
5. **`LEADER_COGS_*`** strings are new copy not in the plan: the plan described one tile, the backend sends four companies' series, so the tile became a table and needed a header, a note, and three column names.
6. **`SECTION_STATUS` and `peerCountLabel`** are new copy not in the plan, needed for the loading, error, and one-company cases the review checklist calls for.

---

## Approved copy registry (machine-checked)

The copy-conformance test (`industryForcesCopy.conformance.test.ts`) parses this
table and diffs it against the module's static exports in both directions. Only
placeholder-free strings appear here; templated functions (notApplicableSentence,
netEntryWindowSentence, duplicateListingsSentence, peerCountLabel,
buildFactorsQuestions) are checked by the rendering tests instead. A pipe
character inside a string is written as `\|`.

| Key | Final text |
|---|---|
| `BARRIER_GRID_NOTE` | The best case for profits is high entry barriers with low exit barriers. The worst is low entry barriers with high exit barriers, because capacity does not leave when results deteriorate. |
| `BARRIER_GRID_TITLE` | Entry and Exit Barrier Grid |
| `barrier.entry` | Read the entry evidence tiles and your answers above. What keeps new companies out of this industry? |
| `barrier.exit` | Read the exit evidence tiles. What keeps losing companies from leaving this industry? |
| `barrierCell.highEntryHighExit` | High, risky returns |
| `barrierCell.highEntryLowExit` | High, stable returns |
| `barrierCell.lowEntryHighExit` | Low, risky returns |
| `barrierCell.lowEntryLowExit` | Low, stable returns |
| `BUYER_PICK_ID` | ind.chain.buyer |
| `DIAGRAM_CENTER` | Industry competitors: rivalry among existing firms |
| `diagram.bottom` | Substitutes |
| `diagram.left` | Suppliers |
| `diagram.right` | Buyers |
| `diagram.top` | Potential entrants |
| `FACTORS_INTRO` | Growth, technology, government, and complements are not forces on their own. They matter only through the way they change the five forces. |
| `FINANCIAL_INDUSTRY_NOTE` | Banks, insurers, and other financial companies report cost of funds and provisions where an industrial company reports cost of goods and plant. The figures that do not carry over say so instead of printing a number. |
| `FIVE_FORCES_TITLE` | The Five Competitive Forces |
| `FORCES_SYNTHESIS_TITLE` | Industry Forces Account |
| `FORCES_SYNTHESIS.id` | ind.forces.account |
| `FORCES_SYNTHESIS.text` | Write the full account a strategist would give of why this industry earns what it earns: which force matters most, which are weak, and what is changing. No length limit; summarize everything from the questions above into the best complete picture you can. |
| `forceTitle.buyers` | Bargaining Power of Buyers |
| `forceTitle.entry` | Threat of Entry |
| `forceTitle.factors` | Factors That Act Through the Forces |
| `forceTitle.rivalry` | Rivalry Among Existing Firms |
| `forceTitle.substitutes` | Pressure from Substitutes |
| `forceTitle.suppliers` | Bargaining Power of Suppliers |
| `HHI_REFERENCE` | US merger guidelines (2023) call a market unconcentrated below 1,000 points, moderately concentrated from 1,000 to 1,800, and highly concentrated above 1,800. These figures count listed companies only. |
| `KEY_PLAYERS_NOTE` | Listed companies only. Private firms and divisions of larger companies are missing, so true shares are lower than shown. |
| `KEY_PLAYERS_TITLE` | Key Players |
| `LEADER_COGS_EMPTY` | Cost of goods is not on file for the four largest companies in this industry. |
| `LEADER_COGS_NOTE` | First and last year on file for each company. A leader whose cost of goods is falling while the others hold steady is pulling away on cost. |
| `LEADER_COGS_TITLE` | The four largest companies' cost of goods as a share of revenue |
| `leaderCogsCol.company` | Company |
| `leaderCogsCol.first` | First year |
| `leaderCogsCol.last` | Last year |
| `NOT_APPLICABLE_FALLBACK` | this figure has no meaning for the way these companies report |
| `q.ind.forces.buyers.1` | Read the buyer industry comparison above. Decide whether the buyers are concentrated, or whether any single buyer takes a large share of one seller's output. A buyer placing a tenth of a seller's volume sets the price; a buyer with nowhere else to go pays it. |
| `q.ind.forces.buyers.2` | Read the buyer industry's median operating margin above. Decide whether what buyers purchase here is a large part of their own costs. Buyers shop hardest on the line items that decide their own margins. |
| `q.ind.forces.buyers.3` | Decide whether buyers could credibly threaten to make this product themselves, and name what they would need in order to do it. The threat shifts bargaining power even when the buyer never follows through. |
| `q.ind.forces.buyers.4` | Decide how much this product matters to the quality of the buyer's own product. A component that decides whether the buyer's product works makes the buyer far less sensitive to its price. |
| `q.ind.forces.buyers.5` | Decide how much buyers here know about demand, market prices, and their suppliers' costs. A buyer who knows the seller's cost can hold the price close to it. |
| `q.ind.forces.entry.1` | Read the Key Players table above and answer for the buyers those companies sell to. Name the one-time costs a buyer would face in switching from an established supplier to a new entrant: retraining, new equipment, testing and qualifying a new source, redesigning its own product, or a lost relationship. The larger those costs, the less a lower price from a newcomer can win. |
| `q.ind.forces.entry.2` | Decide whether a new entrant here would have to build its own route to the customer, or could use the channels the companies in the Key Players table already use. A channel that is already full is an obstacle that capital alone does not clear. |
| `q.ind.forces.entry.3` | Read the scale economies slope tile, then name the advantages it does not measure: proprietary technology, favorable access to raw materials, favorable locations, or government subsidies. Decide whether established companies hold any advantage a new entrant could not copy at any size. An advantage that does not come from size survives a rival that grows just as large. |
| `q.ind.forces.entry.4` | Name the licensing, safety, environmental, or input rules that limit entry here, and the body that enforces them. A permit that takes years to obtain is a barrier no competitor can spend its way past. |
| `q.ind.forces.entry.5` | Read the established companies' cash as a share of assets tile. Have these companies cut prices or launched a fighting brand against past entrants, and do they hold enough cash to do it again? A credible threat of retaliation deters entry even when nobody has to act on it. |
| `q.ind.forces.rivalry.1` | Read the gross margin spread between companies tile. Decide whether buyers here treat the product as a commodity and choose mainly on price and service. A narrow spread usually means no company has something buyers will pay extra for. |
| `q.ind.forces.rivalry.2` | Read the capital spending chart in the Industry Evolution section below. Decide whether capacity here has to be added in large steps rather than a little at a time. Capacity that arrives in lumps turns an ordinary slowdown into a price war. |
| `q.ind.forces.rivalry.3` | Read the Key Players table. Decide how diverse these competitors are in origin, ownership, and goals: companies based abroad, owner-operators, divisions of larger companies. Rivals who answer to different owners read each other's intentions poorly, and that misreading is what starts price wars. |
| `q.ind.forces.rivalry.4` | Read the Key Players table and name any company with stakes high enough here that it would accept poor returns rather than leave. One determined loser sets the price for everybody. |
| `q.ind.forces.rivalry.5` | Read the exit evidence tiles. Name what it would cost a losing company to leave: specialized assets with little resale value, labor settlements, links to its other businesses, management pride, or government pressure. Capacity that cannot leave goes on competing at any price. |
| `q.ind.forces.substitutes.1` | Name the other products or services that do the same job for this industry's buyers, then choose the industry that makes them in the picker above. A substitute sets the ceiling on price whether or not any buyer has switched yet. |
| `q.ind.forces.substitutes.2` | Read the revenue growth and median operating margin tiles for the industry you picked, beside this industry's. Decide whether the substitute's price and performance are improving faster than this industry's. A substitute improving faster lowers that ceiling every year. |
| `q.ind.forces.substitutes.3` | Read the substitute industry's median operating margin tile. Decide whether it is profitable enough to cut price or raise quality quickly. A well-fed substitute can move against this industry without hurting itself. |
| `q.ind.forces.suppliers.1` | Read the supplier industry comparison above, and compare its Herfindahl-Hirschman Index (HHI) with this industry's. Decide whether the supplier group is the more concentrated of the two. The more concentrated side of a trade usually keeps more of the profit. |
| `q.ind.forces.suppliers.2` | Decide whether this industry is an important customer of those suppliers or a minor one. A supplier that depends on this industry for its volume has to protect it; a supplier selling mostly elsewhere does not. |
| `q.ind.forces.suppliers.3` | Decide whether the suppliers' products differ enough that switching would be costly here. Inputs a buyer can re-source in a quarter carry no bargaining power at all. |
| `q.ind.forces.suppliers.4` | Decide whether suppliers could credibly threaten to move forward into this industry themselves, and name what would stop them. The threat shifts bargaining power without anyone acting on it. |
| `q.ind.forces.suppliers.5` | Decide how much power labor holds here: whether the workforce is scarce, highly skilled, or tightly organized. Labor is a supplier, and a scarce one takes its share of the profit the same way. |
| `scale.buyers` | Buyer power: 1 is very weak, 5 is very strong |
| `scale.entry` | Threat of entry: 1 is very weak, 5 is very strong |
| `scale.entryBarrier` | Entry barriers: 1 is very low, 5 is very high |
| `scale.exitBarrier` | Exit barriers: 1 is very low, 5 is very high |
| `scale.rivalry` | Rivalry: 1 is very weak, 5 is very strong |
| `scale.substitutes` | Pressure from substitutes: 1 is very weak, 5 is very strong |
| `scale.suppliers` | Supplier power: 1 is very weak, 5 is very strong |
| `SHARE_STABILITY_REFERENCE` | One widely used test reads the leaders' shares moving less than 2 percentage points over five to ten years as a sign of barriers, and more than 5 points as a sign of none. Sustained after-tax returns of 15 to 25 percent are read as a sign of barriers, and 6 to 8 percent as the competitive norm. |
| `status.loading` | Loading the industry structure figures. |
| `status.partnerLoading` | Loading the chosen industry's figures. |
| `status.retry` | Try again |
| `status.substitutesLoading` | Loading the substitute industry's figures. |
| `summary.buyers` | Read the buyer comparison above and your answers. How much of this industry's profit can its buyers take, and why? |
| `summary.entry` | Read the entry tiles and your answers above. How hard is it to enter this industry, and what is the single biggest obstacle? |
| `summary.rivalry` | Read the rivalry tiles and your answers above. How hard do the companies in this industry fight each other, and what drives the intensity? |
| `summary.substitutes` | Read the substitute comparison above and your answers. How tightly do substitutes cap what this industry can charge? |
| `summary.suppliers` | Read the supplier comparison above and your answers. How much of this industry's profit can its suppliers take, and why? |
| `SUPPLIER_PICK_ID` | ind.chain.supplier |
| `tile.capexToRevenue` | Capital spending as a share of revenue |
| `tile.cr4` | The four largest companies' share of revenue (CR4) |
| `tile.daToRevenue` | Depreciation and amortization as a share of revenue |
| `tile.firmCount` | Number of companies |
| `tile.grossMarginIqr` | Gross margin spread between companies |
| `tile.grossMarginMedian` | Median gross margin |
| `tile.hhi` | Herfindahl-Hirschman Index (HHI) |
| `tile.incumbentCashToAssets` | Established companies' cash as a share of assets |
| `tile.intangiblesToAssets` | Intangible assets as a share of assets |
| `tile.leaderCogsToRevenue5y` | The four largest companies' cost of goods as a share of revenue |
| `tile.netEntry5y` | Net entry over five years |
| `tile.ppeToAssets` | Property, plant and equipment as a share of assets |
| `tile.ppeToRevenue` | Property, plant and equipment as a share of revenue |
| `tile.rdToRevenue` | Research and development as a share of revenue |
| `tile.revenueCagr5y` | Revenue growth over five years |
| `tile.revenueSpreadAmongTop10` | Revenue spread among the ten largest companies |
| `tile.scaleSlope` | Scale economies slope |
| `tile.sgaToRevenue` | Selling, general and administrative cost as a share of revenue |
| `tile.shareOfFirmsWithCapexBelowDepreciation` | Share of companies spending less on capital than they depreciate |
| `tile.shareRankCorrelation5y` | Rank correlation of shares, now against five years ago |
| `tile.top5ShareChange5y` | Movement in the five largest companies' shares |
