# Connect Questions: Final Wording and Hidden Prompts

25 questions across 5 decks, polished into the house voice. Each question carries its own hidden prompt for the AI tutor.

Metric family lists verified against: `sectorRotation.ts` GROUPS (economic groups), `api.py` `_SECTOR_METRIC_DEFS` (sector/industry matrix rows), `industry_structure/UNITS.md` (structure evidence), `api.py` `_RANKING_COLS` / `_PER_SHARE_DEFS` (ranking columns), `individualanalysis.py` `DISPLAY_METRICS` (company metric families), `content/credit/00-INDEX.md` (credit metrics).

**Edits applied (3 total):**
- `sec.connect.score_vs_matrix`: added "net interest margin for lenders" (the metric `netInterestMargin` exists in `_SECTOR_METRIC_DEFS` under group "Bank profitability" but was missing from the draft's family list).
- `ind.connect.structure`: added HHI definition "(which is the sum of squared percentage shares)" per question-maker rule 2a and examples.md: "HHI is not mentioned without 'the sum of squared percentage shares'."
- `comp.connect.valuation`: added DCF definition "(discounted cash flow)" on first use in the deck, per question-maker rule 2a.

---

## Connect the Economy to Credit Conditions

### credit.connect.rates

**Status:** kept verbatim

**Question:** "Read every rate and inflation reading from the Economic page together with every reading on this page: the credit spreads, the lending standards and loan growth, the delinquency and charge-off rates, and the banks' capital, margins, reserves and the financial stress index. Is credit getting easier or harder to obtain, which readings say so, and which readings disagree?"

**Hidden prompt:** "Work through every metric in the ECONOMY section of the data block (every economic series, then every credit and banking series, in the counts the block states). Start with the rate and inflation families (Treasury yields, yield curve spreads, mortgage rate, breakevens, CPI, PPI), then read every credit series: the three credit spreads, the lending standards, each loan growth series, the delinquency and charge-off rates, bank equity to assets, net interest margin, reserves, and the financial stress index. For each metric, state whether it points toward easier or tighter credit and through which channel: the cost of borrowing, the willingness of lenders to extend credit, or the quality of existing loans. Where two families conflict (for example, rates falling while delinquencies are rising), state which side carries more weight and why. Show the arithmetic when comparing levels to their ten-year percentiles. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Finish by stating whether credit overall is easing or tightening and which single reading would need to change to reverse that call. Aim for roughly 1,200 words."

**Families covered:**
- [x] Rate and inflation readings from the Economic page (all groups)
- [x] Credit spreads (high-yield, investment-grade, Baa)
- [x] Lending standards and loan growth (bank lending standards, bank credit, C&I, CRE, consumer, deposits)
- [x] Delinquency and charge-off rates (all loans, C&I, mortgages, net charge-offs)
- [x] Bank capital, margins, reserves, financial stress index
- [x] Comparison: easier vs harder, which readings agree, which disagree

---

### credit.connect.sectors

**Status:** kept verbatim

**Question:** "Given all of those credit readings, which of the eleven sectors depend most on borrowed money and would be hurt first if credit tightened, and which are least exposed? Use each sector's interest coverage, net debt and the share of its companies that barely cover their interest."

**Hidden prompt:** "Work through the ECONOMY section's credit and banking series together with the SECTOR FINANCING section of the data block, which carries one line per sector with median interest coverage, median net debt to EBITDA, the share of companies covering interest below two times, the count of firms with an interest expense, and median operating margins now and five years ago. For each sector, read these financing figures and compare all eleven sectors side by side. State through which channel tighter credit reaches each sector: higher interest expense, restricted access to new lending, or a rising discount rate on its equity. When a sector's financing line shows not available for coverage metrics (lenders report no standard interest coverage), explain why and assess that sector's credit exposure using its own capital and liquidity measures from the ECONOMY section instead. Show the arithmetic wherever you rank sectors by their coverage or debt ratios. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Finish by naming the three most exposed and three least exposed sectors. Aim for roughly 1,200 words."

**Families covered:**
- [x] All credit and banking readings (from previous question's families)
- [x] Sector matrix: interest coverage, net debt, leverage
- [x] Share of companies that barely cover interest
- [x] Comparison: all eleven sectors ranked by credit exposure

---

## Connect the Earlier Stages to This Sector

### sec.connect.readings

**Status:** kept verbatim

**Question:** "Take every economic reading together: rates and the yield curve, inflation and commodities, growth and activity, labor and the consumer, liquidity and money, the dollar and trade, market valuation, and sentiment, policy uncertainty and geopolitical risk. What is the economy doing to {sector} right now, through which channels, and how does that compare with what it is doing to the other ten sectors?"

**Hidden prompt:** "Work through every metric in the ECONOMY section of the data block, family by family: rates and the yield curve, inflation and commodities, growth and activity, labor and the consumer, liquidity and money, the dollar and trade, market valuation, and the sentiment, policy uncertainty and geopolitical risk indicators. For each family, state what it is doing to {sector} and through which channel: the volume {sector}'s companies sell, the prices they charge, their input costs, their financing costs, or the discount rate applied to their profits. Then read the SECTOR section's eleven-sector matrix and compare {sector}'s position with the other ten sectors under each family. Where families of evidence conflict (for example, rates favor the sector but growth does not), state which side carries more weight and why. Separate what is temporary from what is durable. Show the arithmetic wherever you use figures, especially when you cite a reading's ten-year percentile or compare the sectors' figures. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Finish by ranking the eleven sectors under this evidence. Aim for roughly 1,200 words."

**Families covered:**
- [x] Rates and the yield curve
- [x] Inflation and commodities
- [x] Growth and activity
- [x] Labor and the consumer
- [x] Liquidity and money
- [x] The dollar and trade
- [x] Market valuation
- [x] Sentiment, policy uncertainty and geopolitical risk
- [x] Comparison: {sector} against the other ten sectors
- [x] Channels: volume, price, input costs, financing, discount rate

---

### sec.connect.credit

**Status:** kept verbatim

**Question:** "Take every credit and banking reading together (spreads, lending standards, loan growth, delinquencies and charge-offs, bank capital and liquidity, financial stress) with how {sector}'s companies are financed (interest coverage, net debt, the share that barely covers its interest). How exposed is {sector} to tighter credit compared with the other sectors?"

**Hidden prompt:** "Work through every credit and banking series in the ECONOMY section (the three credit spreads, lending standards, each loan growth series, delinquencies, charge-offs, bank equity to assets, net interest margin, reserves, financial stress index) and then read {sector}'s financing metrics from the SECTOR section of the data block (interest coverage, net debt, leverage, the share of companies covering interest below two times). Compare {sector}'s credit exposure with the other ten sectors using the same financing figures from the SECTOR section. State through which channel tighter or easier credit reaches {sector}: higher borrowing costs, restricted loan access, asset quality pressure, or a changing discount rate. Where the credit series disagree (for example, spreads tightening while loan growth is still strong), state which side carries more weight and why. Show the arithmetic when comparing coverage and debt ratios across sectors. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. When a figure is not applicable (for example, standard interest coverage is not defined for banks), note why and use the bank-specific measures instead. Finish by ranking the eleven sectors under this evidence. Aim for roughly 1,200 words."

**Families covered:**
- [x] Spreads (high-yield, investment-grade, Baa)
- [x] Lending standards
- [x] Loan growth (bank credit, C&I, CRE, consumer, deposits)
- [x] Delinquencies and charge-offs
- [x] Bank capital and liquidity (equity to assets, reserves)
- [x] Financial stress index
- [x] Sector financing: interest coverage, net debt, share that barely covers interest
- [x] Comparison: {sector} against the other sectors

---

### sec.connect.score_vs_matrix

**Status:** minimally edited (added "net interest margin for lenders" to the family list; `netInterestMargin` exists in `_SECTOR_METRIC_DEFS` under group "Bank profitability" but was absent from the draft)

**Question:** "Set every one of {sector}'s financial averages against the other ten sectors: economic value added and its margin, return on invested capital against the cost of capital, return on equity against the cost of equity, justified against actual price to book, price to earnings, net interest margin for lenders, the DuPont parts, operating and net margins, revenue and earnings growth, operating leverage, capital spending against depreciation, sales to invested capital, free cash flow against net income, debt, and the value score with the checks on how the average was built. Where do these fundamentals agree with what the economy favors, and where do they conflict?"

**Hidden prompt:** "Work through every row of the SECTOR section's eleven-sector matrix in the data block: value creation (EVA, EVA margin, ROIC, WACC, the ROIC minus WACC spread), equity returns (ROE, cost of equity, excess return, justified versus actual price to book), valuation (P/E), net interest margin for lenders, the six DuPont levers (tax burden, interest burden, EBIT margin, net margin, asset turnover, equity multiplier), operating and net margins, revenue and earnings growth, operating leverage, capex to depreciation, sales to invested capital, free cash flow to net income, net debt to operating cash flow, liabilities to equity, and the value score with any integrity checks that fired. For each row, state where {sector} sits against the other ten sectors and whether that position agrees or conflicts with the economic readings from the ECONOMY section. Name the channel through which each agreement or conflict operates: volume, price, input costs, financing, or the discount rate. Where the fundamentals and the economy point in opposite directions, state which side carries more weight and why. Show the arithmetic wherever you compare a ratio or a spread. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Net interest margin is not applicable for non-lending sectors. Finish by ranking the eleven sectors under this evidence. Aim for roughly 1,200 words."

**Families covered:**
- [x] Value creation: EVA, EVA margin
- [x] Value creation: ROIC against WACC (the spread)
- [x] Equity value creation: ROE against cost of equity (excess return)
- [x] Equity value creation: justified against actual price to book
- [x] Valuation: price to earnings
- [x] Bank profitability: net interest margin for lenders (ADDED)
- [x] DuPont parts (tax burden, interest burden, EBIT margin, net margin, asset turnover, equity multiplier)
- [x] Margins: operating and net
- [x] Growth: revenue and earnings
- [x] Efficiency: operating leverage, capex to depreciation, sales to invested capital
- [x] Cash quality: free cash flow against net income
- [x] Leverage: debt (net debt to OCF, liabilities to equity)
- [x] Value score with integrity checks
- [x] Comparison: {sector} against the other ten sectors

---

### sec.connect.industries

**Status:** kept verbatim

**Question:** "Look across every industry inside {sector}: each one's share of the sector's revenue and operating profit now and five years ago, and each one's own financial averages. Where does the sector's profit sit, which industries do the economic and credit readings reach hardest, and which deserve a closer look?"

**Hidden prompt:** "Work through the SECTOR section's profit pool and industry matrix in the data block. The profit pool gives each industry's share of the sector's revenue and operating profit for the current year and five years ago. The industry matrix sets every industry side by side on their financial averages. Compare every industry in {sector} side by side on their value creation, margins, growth, efficiency and leverage. For each industry, state how the economic and credit readings from the ECONOMY section reach it: through volume, price, input costs, financing, or the discount rate. Identify where the sector's profit collects, whether that concentration is rising or falling, and which industries are most and least exposed to the current economic and credit conditions. Show the arithmetic when comparing profit shares and their changes over time. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Finish by naming the industries that deserve a closer look and which the economic and credit readings reach hardest. Aim for roughly 1,200 words."

**Families covered:**
- [x] Industry profit shares: revenue and operating profit, current and five years ago
- [x] Industry financial averages (value creation, margins, growth, efficiency, leverage)
- [x] Economic and credit readings applied to each industry
- [x] Channels: volume, price, input costs, financing, discount rate
- [x] Comparison: every industry in {sector} side by side

---

### sec.connect.temporary

**Status:** kept verbatim

**Question:** "Of everything working for {sector} right now across the economy, credit conditions and its own fundamentals, which parts are temporary and which are durable? A temporary tailwind is a rotation, not a reason to own the sector for years."

**Hidden prompt:** "Work through every family of evidence in the ECONOMY and SECTOR sections of the data block. For each family, classify the current reading as temporary (likely to reverse within a business cycle) or durable (likely to persist for years). A reading that sits near an extreme percentile and has recently changed direction is more likely temporary; a reading driven by structural forces (demographics, industry maturity, long-term debt levels) is more likely durable. State which of {sector}'s advantages and disadvantages against the other ten sectors rest on temporary readings and which rest on durable ones. Show the arithmetic when comparing percentiles and directions. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Finish by stating which of {sector}'s current advantages are most likely to reverse and which single reading would signal the turn. Aim for roughly 1,200 words."

**Families covered:**
- [x] Economy: all reading families
- [x] Credit conditions
- [x] Sector fundamentals (all matrix families)
- [x] Classification: temporary vs durable for each
- [x] Comparison: {sector}'s advantages and disadvantages against the other ten sectors

---

### sec.connect.synthesis

**Status:** kept verbatim

**Question:** "Write the full account of {sector} as an investment right now: what the economy and credit conditions are doing to it, how its fundamentals rank against the other ten sectors, which industries carry it, what is temporary and what is durable, and what would change the call. No length limit; pull together everything from the questions above into the best complete picture you can."

**Hidden prompt:** "If the block carries a READER'S EARLIER CONCLUSIONS section, read it and build on those findings rather than re-deriving them. Work through every section of the data block (ECONOMY and SECTOR) and synthesize the findings from all of the questions above. Cover the economic and credit environment bearing on {sector}, its fundamentals ranked against the other ten sectors on every matrix row, which industries carry its profit and which are most exposed, what is temporary and what is durable, and what would have to change to reverse the call. Compare {sector} with the other ten sectors on every dimension where the block carries data. Name the channel (volume, price, input costs, financing, discount rate) through which each major force operates. Where families of evidence conflict, state which side carries more weight and why. Show the arithmetic wherever you use figures. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so."

**Families covered:**
- [x] Economy: all reading families
- [x] Credit conditions
- [x] Sector fundamentals: all matrix families ranked against the other ten sectors
- [x] Industry breakdown: profit shares and exposure
- [x] Temporary vs durable classification
- [x] Channels: volume, price, input costs, financing, discount rate
- [x] What would change the call

---

## Connect the Earlier Stages to This Industry

### ind.connect.channels

**Status:** kept verbatim

**Question:** "Take every economic and credit reading and bring it down through {parentSector} to {industry}. Which readings actually reach this industry, and through what: the volume it sells, the price it charges, its input costs, its financing, or the discount rate applied to its profits? Which readings that move the sector do not reach this industry at all?"

**Hidden prompt:** "Work through every metric in the ECONOMY section of the data block, then through the SECTOR section's matrix for {parentSector}, and then through the INDUSTRY section's data for {industry}. For each economic and credit reading, trace whether it reaches {industry} and through which channel: the volume its companies sell, the prices they charge, their input costs, their financing costs, or the discount rate. Where a reading moves {parentSector} but does not reach {industry} (because of the industry's product mix, customer base, cost structure, or geographic exposure), say so and explain why. Compare {industry}'s exposure with the other industries in {parentSector} using the INDUSTRY section's side-by-side data. Show the arithmetic wherever you compare levels or percentiles. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Do not re-decide the economic reading; apply it. Aim for roughly 1,200 words."

**Families covered:**
- [x] Every economic reading family (rates, inflation, growth, labor, liquidity, dollar, valuation, sentiment/EPU/GPR)
- [x] Every credit and banking reading
- [x] {parentSector}'s matrix position
- [x] Channels: volume, price, input costs, financing, discount rate
- [x] Comparison: {industry} against other industries in {parentSector}
- [x] Readings that move the sector but do not reach this industry

---

### ind.connect.profit_share

**Status:** kept verbatim

**Question:** "Set {industry} against every other industry in {parentSector}, and against comparable industries in other sectors, on every financial average: value creation, returns against the cost of capital, margins, growth, efficiency, cash quality, debt and the value score, together with its share of the sector's revenue and operating profit now and five years ago. Is this where the sector's profit collects, and is that share rising or falling?"

**Hidden prompt:** "Work through the INDUSTRY section of the data block, which sets {industry} beside every other industry in {parentSector}. Compare each industry on value creation (EVA, EVA margin, ROIC minus WACC spread), returns against the cost of capital, margins, growth, efficiency, cash quality, leverage and the value score. Read {industry}'s share of the sector's revenue and operating profit for the current year and five years ago, and state whether that share is rising or falling. Then compare {industry} with comparable industries in other sectors if the block carries them. Show the arithmetic when computing profit shares and changes over time. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Do not re-decide the economic reading; apply it. Aim for roughly 1,200 words."

**Families covered:**
- [x] Value creation (EVA, EVA margin, ROIC minus WACC)
- [x] Returns against the cost of capital
- [x] Margins
- [x] Growth
- [x] Efficiency
- [x] Cash quality
- [x] Debt (leverage)
- [x] Value score
- [x] Profit share: revenue and operating profit, current and five years ago
- [x] Comparison: every other industry in {parentSector}, comparable industries in other sectors

---

### ind.connect.structure

**Status:** minimally edited (added HHI definition "which is the sum of squared percentage shares" per question-maker rule: "HHI is not mentioned without 'the sum of squared percentage shares'")

**Question:** "Take all of the structure evidence together: concentration (the four and eight largest companies' shares and the HHI, which is the sum of squared percentage shares), the entry evidence (plant, capital spending, research and selling costs against revenue, the scale slope, gross margins and their spread, incumbents' cash, net entry), the exit evidence, the rivalry evidence, how stable the leaders' shares have been, the ten-year evolution, and your own five forces answers. When the economy and the sector favor {industry}, who keeps the gain: its companies, their suppliers, their customers, or new entrants?"

**Hidden prompt:** "Work through the INDUSTRY section's structure evidence in the data block: concentration (CR4, CR8, HHI with percentile ranks), the entry evidence (PP&E to revenue, capex to revenue, R&D to revenue, SG&A to revenue, the scale slope, gross margin median and spread, incumbent cash to assets, net entry), the exit evidence (PP&E to assets, intangibles to assets, share of firms with capex below depreciation), the rivalry evidence (revenue CAGR, D&A to revenue, revenue spread among the top ten), share stability (top-five share change, rank correlation), the ten-year evolution series, and the reader's own five forces answers and ratings. For each piece of evidence, state whether it means the gain from favorable economic and sector conditions stays with the industry's companies, leaks to suppliers, leaks to customers, or is competed away by new entrants. Compare {industry}'s structure with the other industries in {parentSector} where the block carries percentile ranks. Show the arithmetic wherever you compare concentrations, shares or percentiles. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Gross margin is not applicable for bank industries. Do not re-decide the economic reading; apply it. Aim for roughly 1,200 words."

**Families covered:**
- [x] Concentration: CR4, CR8, HHI (sum of squared percentage shares)
- [x] Entry evidence: plant (PP&E/revenue), capital spending (capex/revenue), research (R&D/revenue), selling costs (SG&A/revenue), scale slope, gross margins and their spread, incumbents' cash, net entry
- [x] Exit evidence (PP&E/assets, intangibles/assets, share of firms with capex below depreciation)
- [x] Rivalry evidence (revenue CAGR, D&A/revenue, revenue spread)
- [x] Share stability (top-five share change, rank correlation)
- [x] Ten-year evolution
- [x] Five forces answers (reader's own)
- [x] Comparison: who keeps the gain (companies, suppliers, customers, new entrants)

---

### ind.connect.groups

**Status:** kept verbatim

**Question:** "Read the strategic groups in {industry}: which companies are similarly structured, what each group earns, and what keeps other companies out of the best group. Which group do today's economic, credit and sector conditions favor, and which group do they hurt?"

**Hidden prompt:** "Work through the INDUSTRY section's strategic groups in the data block: the number of groups, each group's member companies, its combined revenue share, its median pre-tax ROIC and ROIC range, and what separates the groups structurally. For each group, state whether today's economic and credit conditions from the ECONOMY section and the sector conditions from the SECTOR section favor or hurt it, and through which channel: volume, price, input costs, financing, or the discount rate. Compare the best-performing group with the others on profitability and explain what keeps other companies from entering it. Show the arithmetic when comparing group returns and shares. Use only the figures in the data block and do not invent a score or a grade. If the industry has no strategic groups in the block, say so and explain what the overall industry data shows instead. Do not re-decide the economic reading; apply it. Aim for roughly 1,200 words."

**Families covered:**
- [x] Strategic groups: member companies, structure
- [x] Group earnings: combined revenue share, median pre-tax ROIC, ROIC range
- [x] Barriers between groups
- [x] Economic, credit and sector conditions applied to each group
- [x] Channels: volume, price, input costs, financing, discount rate
- [x] Comparison: best group against the others

---

### ind.connect.stress_test

**Status:** kept verbatim

**Question:** "Look at how {industry} came through the 2020 downturn and the 2021 to 2022 inflation against its sector: revenue, gross margin, and the capital spending cycle. What does that record say about how it would handle the conditions the economic readings point to now?"

**Hidden prompt:** "Work through the INDUSTRY section's evolution and trend series in the data block, focusing on the 2020 and 2021 to 2022 periods. Read {industry}'s revenue, gross margin spread, and capex-to-depreciation series for those years and compare them with {parentSector}'s figures from the SECTOR section. State whether {industry} held up better or worse than its sector through the downturn and the inflation shock, and by how much. Then read the current economic readings from the ECONOMY section and state which of those historical stress conditions (demand contraction, margin compression from rising input costs, capital spending freeze) the readings point toward now. Show the arithmetic when comparing year-over-year changes in revenue and margins. Use only the figures in the data block and do not invent a score or a grade. If a series does not cover 2020, say so and explain the limitation. Do not re-decide the economic reading; apply it. Aim for roughly 1,200 words."

**Families covered:**
- [x] 2020 downturn record: revenue, gross margin, capex cycle
- [x] 2021 to 2022 inflation record: same metrics
- [x] {industry} against {parentSector} in both periods
- [x] Current economic readings pointing to similar or different conditions
- [x] Comparison: industry vs sector through historical stress

---

### ind.connect.synthesis

**Status:** kept verbatim

**Question:** "Write the full account of {industry} as a place to look for investments right now: how the economy, credit conditions and {parentSector} bear on it, how it ranks against the other industries in its sector, what its structure does with a favorable or unfavorable environment, which strategic group is best placed, and what would change the call. No length limit; pull together everything from the questions above into the best complete picture you can."

**Hidden prompt:** "If the block carries a READER'S EARLIER CONCLUSIONS section, read it and build on those findings rather than re-deriving them. Work through every section of the data block (ECONOMY, SECTOR, INDUSTRY) and synthesize the findings from all of the questions above. Cover how the economy and credit conditions bear on {industry} through {parentSector}, how {industry} ranks against the other industries on every financial average, what its structure does with favorable or unfavorable conditions (who keeps the gain), which strategic group is best placed, what the stress-test record shows, and what would change the call. Name the channel (volume, price, input costs, financing, discount rate) through which each major force operates. Where families of evidence conflict, state which side carries more weight and why. Show the arithmetic wherever you use figures. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Do not re-decide the economic reading; apply it."

**Families covered:**
- [x] Economy and credit conditions bearing on {industry}
- [x] {parentSector} as the transmission path
- [x] Financial averages ranked against other industries in the sector
- [x] Structure: who keeps the gain (concentration, entry, exit, rivalry, share stability)
- [x] Strategic groups: which is best placed
- [x] Stress-test record (2020 downturn, 2021-2022 inflation)
- [x] Channels: volume, price, input costs, financing, discount rate
- [x] What would change the call

---

## Connect the Earlier Stages to This Peer Group

### comp.connect.exposure

**Status:** kept verbatim

**Question:** "Read across the whole ranking table, every column, for every company. Given what the economy, credit conditions, {parentSector} and {industry} are doing right now, which companies are reached hardest, which least, and which columns show it?"

**Hidden prompt:** "Work through the PEERS section of the data block: read the full ranking table, every column, for every company. For each column (value score, margin of safety, DCF per share, every financial metric, and the per-share figures), identify which companies sit at the extremes. Then read the ECONOMY, SECTOR and INDUSTRY sections and state which economic, credit and sector conditions reach each company hardest and which reach it least, naming the channel: volume, price, input costs, financing, or the discount rate. Compare companies within the same strategic group and across groups. Show the arithmetic wherever you compare a company's metric against the industry average or the group average. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Finish by naming the companies that deserve a full analysis. Aim for roughly 1,200 words."

**Families covered:**
- [x] Ranking table: every column (value score, margin of safety, DCF/share, all financial metrics, per-share figures)
- [x] Economy, credit conditions, {parentSector}, {industry}: current conditions
- [x] Channels: volume, price, input costs, financing, discount rate
- [x] Comparison: which companies reached hardest, which least, which columns show it

---

### comp.connect.structure

**Status:** kept verbatim

**Question:** "Sort the companies into their strategic groups, the sets of similarly structured companies. Which group do the conditions from the earlier stages favor, what protects that group from the others copying it, and which companies inside it earn more than their group?"

**Hidden prompt:** "Work through the INDUSTRY section's strategic groups in the data block: each group's member companies, their combined revenue share, their median pre-tax return on capital and return range, and what separates the groups structurally. Then read the ECONOMY, SECTOR and INDUSTRY sections to identify which conditions from the earlier stages favor which group. State what protects the best-performing group from imitation: structural barriers (scale, capital requirements, regulation) versus execution advantages (management quality, timing). For each company inside the favored group, compare its returns on capital with its group's median to identify who earns above or below the group level. Show the arithmetic when comparing group-level and company-level returns. Use only the figures in the data block and do not invent a score or a grade. If a company lacks data for a metric, skip it and say so. Finish by naming the companies that deserve a full analysis. Aim for roughly 1,200 words."

**Families covered:**
- [x] Strategic groups: similarly structured companies
- [x] Group earnings: revenue share, median returns on capital
- [x] Structural barriers protecting the best group
- [x] Earlier-stage conditions (economy, credit, sector, industry) applied to each group
- [x] Comparison: companies within the favored group against their group median

---

### comp.connect.share_change

**Status:** kept verbatim

**Question:** "Over five years, which companies grew because {industry} grew and which grew by taking share? Set that against their returns on capital against the cost of capital, their margins and their debt. Who is gaining ground profitably and who is buying growth?"

**Hidden prompt:** "Work through the PEERS section of the data block and read each company's Revenue Growth from the ranking table and its five-year share change from the exposure rows, alongside the industry's five-year revenue growth from the INDUSTRY section's connections line. Separate each company's growth into the part that came from the industry expanding and the part that came from the company gaining or losing share. Set that against each company's returns on capital versus the cost of capital (ROIC minus WACC spread), its margins and its leverage from the ranking table. Identify which companies are gaining share profitably (growing share while earning above their cost of capital) and which are buying growth (growing share but destroying value). Show the arithmetic when decomposing growth into industry and share components. Use only the figures in the data block and do not invent a score or a grade. If a company's history does not cover five years, say so. Finish by naming the companies that deserve a full analysis. Aim for roughly 1,200 words."

**Families covered:**
- [x] Five-year revenue change per company
- [x] Industry overall revenue growth
- [x] Growth decomposition: industry growth vs share change
- [x] Returns on capital against the cost of capital (ROIC minus WACC)
- [x] Margins
- [x] Debt (leverage)
- [x] Comparison: gaining ground profitably vs buying growth

---

### comp.connect.valuation

**Status:** minimally edited (added DCF definition "discounted cash flow" on first use in the deck per question-maker rule 2a)

**Question:** "Set the value score, the margin of safety, the DCF (discounted cash flow) value per share and every valuation multiple against each company's exposure and its returns on capital. Is the company best placed for today's conditions also the most expensive? A favorable condition that everybody can see is usually in the price already."

**Hidden prompt:** "Work through the PEERS section's ranking table in the data block and read each company's value score, margin of safety, DCF intrinsic value per share and every valuation column in the ranking table (P/E, justified P/B against actual P/B, and any further valuation column this industry's table carries, such as EV to sales or PEG). Set each company's valuation against its exposure to the current economic and credit conditions from the ECONOMY section and its returns on capital from the ranking table. Identify whether the company best placed for today's conditions is also the most expensive, and whether any mispriced company combines favorable exposure with a low valuation. State where the market appears to have already priced in a favorable condition visible to everyone. Show the arithmetic when comparing multiples and margins of safety. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Finish by naming the companies that deserve a full analysis. Aim for roughly 1,200 words."

**Families covered:**
- [x] Value score
- [x] Margin of safety
- [x] DCF (discounted cash flow) value per share
- [x] Valuation multiples: P/E, EV/EBITDA, EV/EBIT, P/FCF, P/B, P/Sales, P/OCF
- [x] Each company's exposure to current conditions
- [x] Returns on capital
- [x] Comparison: best-placed vs most expensive; favorable conditions already in the price

---

### comp.connect.synthesis

**Status:** kept verbatim

**Question:** "Write the full account of this peer group: which companies the economy, credit conditions, sector and industry favor and hurt, which strategic group is best placed and why, how valuation lines up against that, and which two or three companies deserve a full individual analysis. No length limit; pull together everything from the questions above into the best complete picture you can."

**Hidden prompt:** "If the block carries a READER'S EARLIER CONCLUSIONS section, read it and build on those findings rather than re-deriving them. Work through every section of the data block (ECONOMY, SECTOR, INDUSTRY, PEERS) and synthesize the findings from all of the questions above. Cover which companies the economy, credit conditions, sector and industry favor and hurt, which strategic group is best placed and why, how each company's growth decomposition and valuation line up against its position, and which two or three companies deserve a full individual analysis. Compare companies within and across strategic groups. Name the channel (volume, price, input costs, financing, discount rate) through which each major force operates. Show the arithmetic wherever you use figures. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Finish by naming the companies that deserve a full analysis."

**Families covered:**
- [x] Economy, credit conditions, sector and industry: which companies favored and hurt
- [x] Strategic groups: which is best placed and why
- [x] Growth decomposition: industry growth vs share change
- [x] Valuation: value score, margin of safety, DCF, multiples lined up against position
- [x] Comparison: within and across strategic groups
- [x] Which two or three companies deserve full individual analysis

---

## Connect the Earlier Stages to This Company

### indiv.connect.channels

**Status:** kept verbatim

**Question:** "Take every economic and credit reading and trace it through {sector} and {industry} to {company}. Where does each one land: in its revenue, its gross margin, its operating costs, its interest expense, or the discount rate in its valuation? Which readings do not reach this company at all?"

**Hidden prompt:** "Work through the ECONOMY section of the data block, then the SECTOR and INDUSTRY sections, and trace each economic and credit reading to {company} using the COMPANY section's own metric histories. For each reading that reaches {company}, state where it lands: in its revenue, its gross margin, its operating costs, its interest expense, or the discount rate used in its valuation. Where a reading moves the sector or the industry but does not reach {company} (because of its business mix, pricing power, balance sheet or geographic exposure), say so and explain why. Show the arithmetic when comparing {company}'s margin, growth or cost-of-capital figures with the industry average from the INDUSTRY section. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Do not re-teach macro or sector calls; apply the ones in the block to this company. Aim for roughly 1,200 words."

**Families covered:**
- [x] Every economic and credit reading (all families)
- [x] Traced through {sector} and {industry}
- [x] Company-level channels: revenue, gross margin, operating costs, interest expense, discount rate
- [x] Readings that do not reach this company
- [x] Comparison: {company} against industry averages

---

### indiv.connect.industry

**Status:** kept verbatim

**Question:** "Given {industry}'s structure (concentration, entry and exit barriers, rivalry, how stable the leaders' shares are, where the industry is in its evolution) and its place in {sector}'s profit pool, what does the industry allow {company} to earn, and for how long?"

**Hidden prompt:** "Work through the INDUSTRY section's structure evidence in the data block: concentration, entry and exit barriers, rivalry evidence, share stability, the evolution series and the strategic groups. Then read {industry}'s position in {sector}'s profit pool from the SECTOR section. State what {industry}'s structure allows {company} to earn, using the COMPANY section's returns on capital and margins as evidence of whether the company earns at, above or below the structural ceiling. State how long the structural conditions are likely to last, based on the evolution trend and the entry evidence. Show the arithmetic when comparing {company}'s returns with the industry median and its strategic group's median. Use only the figures in the data block and do not invent a score or a grade. If a piece of structure evidence is marked not available, not applicable or not loaded, skip it and say so. Do not re-teach macro or sector calls; apply the ones in the block to this company. Aim for roughly 1,200 words."

**Families covered:**
- [x] Concentration
- [x] Entry and exit barriers
- [x] Rivalry
- [x] Share stability (leaders' shares)
- [x] Industry evolution stage
- [x] {sector}'s profit pool: {industry}'s place in it
- [x] What {company} earns relative to the structural ceiling
- [x] How long the structural conditions last

---

### indiv.connect.peers

**Status:** kept verbatim

**Question:** "Set {company} against its strategic group of similarly structured companies, against its whole industry and against its sector on every metric family: profitability and economic value added, leverage and coverage, valuation multiples, capital efficiency, the DuPont parts, working capital and cash conversion, earnings quality, growth and risk. Where is it ahead, where is it behind, and what explains each gap?"

**Hidden prompt:** "Work through the PEERS section of the data block: read {company}'s row in the ranking table and its strategic group's members. Read the COMPANY section's benchmarks table. It compares the company with four reference points (industry median, group median, industry weighted average and sector weighted average) and prints the gap to each. Then work through the COMPANY section's full metric histories: profitability and economic value added (operating margin, EVA margin, ROIC minus WACC spread, ROE, ROIC, WACC, cost of equity, excess return), leverage and coverage (interest coverage, net debt, liabilities to equity, debt to equity, current and quick ratios), valuation multiples (P/E, justified P/B against actual P/B, and any further valuation column this industry's table carries, such as EV to sales or PEG), capital efficiency (sales to invested capital, capex to depreciation, reinvestment rate, marginal ROIC, FCF to net income, operating leverage), the DuPont parts, working capital and cash conversion (CCC, DSO, DIO, DPO), earnings quality (income quality, Sloan accruals ratio, SBC to revenue), growth (revenue and net income growth) and risk (beta). Compare {company} with its strategic group, with the full industry and with the sector on every family that each level carries. Working capital, cash conversion and earnings quality are available only in the COMPANY section and should be assessed against the company's own trend. For each gap, state what explains it: a structural advantage, a balance-sheet choice, a temporary condition, or a different product mix. Show the arithmetic when computing gaps. Use only the figures in the data block and do not invent a score or a grade. If a metric is marked not available, not applicable or not loaded, skip it and say so. Do not re-teach macro or sector calls; apply the ones in the block to this company. Aim for roughly 1,200 words."

**Families covered:**
- [x] Profitability and economic value added (operating margin, EVA margin, ROIC minus WACC, ROE, ROIC, WACC, cost of equity, excess return, net interest margin)
- [x] Leverage and coverage (interest coverage, net debt, liabilities/equity, debt/equity, current ratio, quick ratio, debt service coverage)
- [x] Valuation multiples (P/E, EV/EBITDA, EV/EBIT, P/FCF, P/B, P/Sales, P/OCF, justified P/B)
- [x] Capital efficiency (sales/invested capital, capex/depreciation, reinvestment rate, marginal ROIC, FCF/net income, operating leverage)
- [x] DuPont parts (tax burden, interest burden, EBIT margin, net margin, asset turnover, equity multiplier)
- [x] Working capital and cash conversion (CCC, DSO, DIO, DPO, receivables turnover, payables turnover)
- [x] Earnings quality (income quality, Sloan accruals, SBC/revenue)
- [x] Growth (revenue, net income)
- [x] Risk (beta)
- [x] Comparison: strategic group, whole industry, sector (three levels)

---

### indiv.connect.growth_split

**Status:** kept verbatim

**Question:** "{company}'s growth comes partly from {industry} growing and partly from its share changing, and its margin comes partly from the industry, partly from its strategic group and partly from the company itself. Which parts should continue, and which depend on conditions the earlier stages say are changing?"

**Hidden prompt:** "Work through the COMPANY section's growth and revenue history, the INDUSTRY section's overall revenue growth, and the INDUSTRY section's strategic group data. Decompose {company}'s growth into the part driven by {industry} expanding and the part driven by its market share changing. Then decompose {company}'s margin into the part set by the industry, the part set by its strategic group and the part unique to the company itself. For each component, state whether the ECONOMY and SECTOR sections suggest it will continue (because it rests on durable structural forces) or is at risk of changing (because it rests on cyclical or temporary conditions). Show the arithmetic when splitting growth and margin into their components. Use only the figures in the data block and do not invent a score or a grade. If growth history is too short or the strategic group data is incomplete, say so and explain the limitation. Do not re-teach macro or sector calls; apply the ones in the block to this company. Aim for roughly 1,200 words."

**Families covered:**
- [x] Growth decomposition: industry growth vs share change
- [x] Margin decomposition: industry part, strategic group part, company part
- [x] Earlier-stage conditions: which are durable, which are changing
- [x] Comparison: {company}'s growth sources against industry and group

---

### indiv.connect.valuation

**Status:** kept verbatim

**Question:** "Look at the valuation: the starting and terminal growth rates, the current and target margins, the number of years of above-normal returns, the cost of capital, and the growth that today's price already implies. Are those assumptions consistent with everything the economy, the sector, the industry and the peer group say? Name the assumption that fits least."

**Hidden prompt:** "Work through the COMPANY section's valuation assumptions in the data block: the starting revenue growth rate, the terminal growth rate, the current and target operating margins, the number of years of convergence, the cost of capital build (the block prints each input, weight and beta component), and the reverse-DCF implied growth rate. When the model value and the market quote are in different currencies, the block carries a valuation currency note and the margin of safety is not reconciled; flag that and do not read the figure as like-for-like. For each assumption, test it against the evidence from the ECONOMY, SECTOR, INDUSTRY and PEERS sections. Name the one assumption that fits the earlier-stage evidence least. When the reverse-DCF implied growth exceeds the industry's structural growth or the economy's nominal GDP growth, flag it. Show the arithmetic when comparing each assumption with the relevant benchmark. Use only the figures in the data block and do not invent a score or a grade. If the valuation model is not loaded, say so and work with the available multiples instead. If any other figure is marked not available, not applicable or not loaded, skip it and say so. Do not re-teach macro or sector calls; apply the ones in the block to this company. Aim for roughly 1,200 words."

**Families covered:**
- [x] Starting and terminal growth rates
- [x] Current and target margins
- [x] Number of years of above-normal returns (convergence period)
- [x] Cost of capital (components and build)
- [x] Reverse-DCF implied growth (what today's price implies)
- [x] Consistency test: each assumption against economy, sector, industry and peer group evidence
- [x] The assumption that fits least

---

### indiv.connect.synthesis

**Status:** kept verbatim

**Question:** "Write the full account of {company} as an investment right now: how the economy, credit conditions, {sector} and {industry} bear on it, how it stands against similarly structured companies, whether its valuation assumptions fit that picture, what would make you buy it, and what would make you sell it. No length limit; pull together everything from the questions above into the best complete picture you can."

**Hidden prompt:** "If the block carries a READER'S EARLIER CONCLUSIONS section, read it and build on those findings rather than re-deriving them. Work through every section of the data block (ECONOMY, SECTOR, INDUSTRY, PEERS, COMPANY) and synthesize the findings from all of the questions above. Cover how the economy and credit conditions bear on {company} through {sector} and {industry}, how {company} stands against its strategic group and its industry, whether its valuation assumptions fit the earlier-stage evidence, what would make it a buy and what would make it a sell. Name the channel (volume, price, input costs, financing, discount rate) through which each major force operates. Where families of evidence conflict, state which side carries more weight and why. Show the arithmetic wherever you use figures. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Do not re-teach macro or sector calls; apply the ones in the block to this company."

**Families covered:**
- [x] Economy and credit conditions bearing on {company}
- [x] Transmission through {sector} and {industry}
- [x] Strategic group and industry comparison
- [x] Valuation assumptions tested against earlier-stage evidence
- [x] Channels: volume, price, input costs, financing, discount rate
- [x] What would make it a buy, what would make it a sell

---

## Self-check

All 25 ids present:
1. credit.connect.rates
2. credit.connect.sectors
3. sec.connect.readings
4. sec.connect.credit
5. sec.connect.score_vs_matrix
6. sec.connect.industries
7. sec.connect.temporary
8. sec.connect.synthesis
9. ind.connect.channels
10. ind.connect.profit_share
11. ind.connect.structure
12. ind.connect.groups
13. ind.connect.stress_test
14. ind.connect.synthesis
15. comp.connect.exposure
16. comp.connect.structure
17. comp.connect.share_change
18. comp.connect.valuation
19. comp.connect.synthesis
20. indiv.connect.channels
21. indiv.connect.industry
22. indiv.connect.peers
23. indiv.connect.growth_split
24. indiv.connect.valuation
25. indiv.connect.synthesis

None missing.

No occurrences of "accept", "grade the", or "ask the reader" in any question or hidden prompt.

No em dashes (U+2014) anywhere in the file.

No curly quotes. No author names. No analogies. No banned vocabulary.

Needs owner review.

---

## Revision log

### 2026-09-20

**Hidden prompt fixes (7 total):**

1. **credit.connect.sectors** -- replaced references to a "SECTOR section's full eleven-sector matrix" with the actual SECTOR FINANCING section; changed "interest coverage barely exceeds one" to "share covering interest below two times"; changed "not applicable on matrix row" to "not available" (matching lender rows).
2. **comp.connect.valuation** -- replaced valuation multiples list "P/E, EV/EBITDA, EV/EBIT, P/FCF, P/B, P/Sales, P/OCF" with "P/E, justified P/B against actual P/B, EV to sales, PEG where loaded" (matching the ranking table columns).
3. **comp.connect.share_change** -- changed "five-year revenue change" to "Revenue Growth from the ranking table and its five-year share change from the exposure rows, alongside the industry's five-year revenue growth from the INDUSTRY section's connections line."
4. **comp.connect.structure** -- changed "PEERS section's strategic groups" to "INDUSTRY section's strategic groups"; added "median pre-tax return on capital and return range."
5. **indiv.connect.peers** -- replaced same wrong valuation multiples list (as in fix 2); added note that working capital, cash conversion and earnings quality are available only in the COMPANY section and should be assessed against the company's own trend.
6. **sec.connect.credit** -- changed "barely cover their interest" to "covering interest below two times"; changed "same metrics from the matrix" to "same financing figures from the SECTOR section."
7. **indiv.connect.growth_split** -- changed "PEERS section's strategic group data" to "INDUSTRY section's strategic group data."

**Length rule added:**

Added "Aim for roughly 1,200 words." to the hidden prompt of all 21 non-synthesis questions. The 4 synthesis questions (sec, ind, comp, indiv) were left without a length cap.

**Question text not edited** (owner-approved, immutable). Three Question texts promise data the block does not hold exactly as described:

- credit.connect.sectors (line 38): says "barely cover their interest" but the block threshold is "below two times."
- sec.connect.credit (line 78): says "barely covers its interest" -- same mismatch.
- indiv.connect.peers (line 424): lists "working capital and cash conversion, earnings quality" as families to compare "against its sector" but these families exist only in the COMPANY section, not in the sector or industry matrices.

### 2026-09-20 (block alignment pass)

**Five known slips fixed:**

1. **credit.connect.rates** -- removed hardcoded series counts "(all 75 economic series, then all 17 credit and banking series)" and replaced with "(every economic series, then every credit and banking series, in the counts the block states)."
2. **sec.connect.industries** -- replaced wrong tail "Finish by ranking the eleven sectors under this evidence" with "Finish by naming the industries that deserve a closer look and which the economic and credit readings reach hardest." Also changed "industry breakdown" to "profit pool and industry matrix" to name the two subsections the block now carries.
3. **sec.connect.temporary** -- replaced same wrong tail "Finish by ranking the eleven sectors under this evidence" with "Finish by stating which of {sector}'s current advantages are most likely to reverse and which single reading would signal the turn."
4. **comp.connect.share_change** -- fixed stray capital "Read" to lowercase "read."
5. All 20 prompts that carry an absence-handling sentence now name the full three-token legend: "not available, not applicable or not loaded." Prompts previously missing one or two tokens: credit.connect.rates, credit.connect.sectors (added), sec.connect.readings, sec.connect.credit, sec.connect.score_vs_matrix, sec.connect.industries, sec.connect.temporary, sec.connect.synthesis, ind.connect.channels, ind.connect.profit_share, ind.connect.structure, ind.connect.synthesis, comp.connect.exposure, comp.connect.valuation, comp.connect.synthesis, indiv.connect.channels, indiv.connect.industry, indiv.connect.peers, indiv.connect.valuation, indiv.connect.synthesis.

**New block content (smallest clauses):**

6. **sec.connect.industries** -- "profit pool and industry matrix" named explicitly (see fix 2 above).
7. **indiv.connect.valuation** -- "the cost of capital build (the block prints each input, weight and beta component)" replaced the vague "its components and how they were built." Added currency-mismatch clause: "When the model value and the market quote are in different currencies, the block carries a valuation currency note and the margin of safety is not reconciled; flag that and do not read the figure as like-for-like."
8. **indiv.connect.peers** -- added "Read the COMPANY section's benchmarks table. It compares the company with four reference points (industry median, group median, industry weighted average and sector weighted average) and prints the gap to each."
9. **sec.connect.synthesis, ind.connect.synthesis, comp.connect.synthesis, indiv.connect.synthesis** -- added "If the block carries a READER'S EARLIER CONCLUSIONS section, read it and build on those findings rather than re-deriving them."

**Question text not edited** (owner-approved, immutable). No new mismatches introduced.
