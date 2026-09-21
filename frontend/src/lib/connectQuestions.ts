// The connect deck: one short question deck per stage, sitting directly under
// the stage goal line on the Credit, Sector, Industry, Comparative and Company
// pages.
//
// Every question names whole families of metrics rather than two or three
// figures, because the figures themselves reach the AI through the data block
// that lib/stageContext.ts assembles when the reader clicks "Explain using AI".
// Each question carries its OWN hidden prompt, written for the families that
// question asks about. The prompt travels in the question slot of the request
// and is never rendered.
//
// The wording is the writer's, transferred word for word from
// docs/connect-questions.final.md. A later polish edits the strings here and
// the matching rows in connectQuestions.draft.md; the ids and the keys stay as
// they are, so a reader's saved answer survives any rewording.

import type { RuntimeGroup, RuntimeQuestion } from "./types";
import { q } from "./deckBuilders";

export type ConnectStage = "credit" | "sector" | "industry" | "comparative" | "company";

/** The names a deck fills into its questions and their hidden prompts. Which
 *  ones matter depends on the stage: the sector deck needs `sector`, the
 *  industry and comparative decks need `industry` and `parentSector`, the
 *  company deck needs all four. */
export interface ConnectNames {
  sector?: string;
  industry?: string;
  parentSector?: string;
  company?: string;
}

// ── Deck titles ───────────────────────────────────────────────────────

export const CONNECT_DECK_TITLE: Record<ConnectStage, string> = {
  credit: "Connect the Economy to Credit Conditions",
  sector: "Connect the Earlier Stages to This Sector",
  industry: "Connect the Earlier Stages to This Industry",
  comparative: "Connect the Earlier Stages to This Peer Group",
  company: "Connect the Earlier Stages to This Company",
};

// ── The questions and their hidden prompts ──────────────────────────

interface ConnectQuestion {
  id: string;
  text: string;
  /** The hidden prompt this one question carries. Sent ahead of the question
   *  text in the AI request and never shown on the page. */
  guidance: string;
}

export const CONNECT_QUESTIONS: Record<ConnectStage, ConnectQuestion[]> = {
  credit: [
    {
      id: "credit.connect.rates",
      text:
        "Read every rate and inflation reading from the Economic page together with every reading on this page: the credit spreads, the lending standards and loan growth, the delinquency and charge-off rates, and the banks' capital, margins, reserves and the financial stress index. Is credit getting easier or harder to obtain, which readings say so, and which readings disagree?",
      guidance:
        "Work through every metric in the ECONOMY section of the data block (every economic series, then every credit and banking series, in the counts the block states). Start with the rate and inflation families (Treasury yields, yield curve spreads, mortgage rate, breakevens, CPI, PPI), then read every credit series: the three credit spreads, the lending standards, each loan growth series, the delinquency and charge-off rates, bank equity to assets, net interest margin, reserves, and the financial stress index. For each metric, state whether it points toward easier or tighter credit and through which channel: the cost of borrowing, the willingness of lenders to extend credit, or the quality of existing loans. Where two families conflict (for example, rates falling while delinquencies are rising), state which side carries more weight and why. Show the arithmetic when comparing levels to their ten-year percentiles. When a series line carries no recorded reading, the app could not determine one. Say so for that series, and do not infer a reading or a favored or not favored label for it. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Finish by stating whether credit overall is easing or tightening and which single reading would need to change to reverse that call. Aim for roughly 1,200 words.",
    },
    {
      id: "credit.connect.sectors",
      text:
        "Given all of those credit readings, which of the eleven sectors depend most on borrowed money and would be hurt first if credit tightened, and which are least exposed? Use each sector's interest coverage, net debt and the share of its companies that barely cover their interest.",
      guidance:
        "Work through the ECONOMY section's credit and banking series together with the SECTOR FINANCING section of the data block, which carries one line per sector with median interest coverage, median net debt to EBITDA, the share of companies covering interest below two times, the count of firms with an interest expense, and median operating margins now and five years ago. For each sector, read these financing figures and compare all eleven sectors side by side. State through which channel tighter credit reaches each sector: higher interest expense, restricted access to new lending, or a rising discount rate on its equity. When a sector's financing line shows not available for coverage metrics (lenders report no standard interest coverage), explain why and assess that sector's credit exposure using its own capital and liquidity measures from the ECONOMY section instead. Show the arithmetic wherever you rank sectors by their coverage or debt ratios. When a series line carries no recorded reading, the app could not determine one. Say so for that series, and do not infer a reading or a favored or not favored label for it. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Finish by naming the three most exposed and three least exposed sectors. Aim for roughly 1,200 words.",
    },
    {
      id: "credit.connect.cycle",
      text:
        "Read the credit readings in the order a credit cycle usually moves: lending standards first, then loan growth, then delinquencies and charge-offs, then bank capital and reserves. Which of these has already turned and which has not? What does that order say about the next year for companies that borrow and for the banks that lend to them?",
      guidance:
        "Work through the credit and banking series in the ECONOMY section of the data block in the order a credit cycle usually moves. First the lending standards survey, which leads because it shows willingness to lend before the volume responds. Then the loan growth series (bank credit, C&I, CRE, consumer, deposits), the volume response to those standards. Then the delinquency and charge-off rates (all loans, C&I, mortgages, net charge-offs), the lagging quality signal. Then bank equity to assets, net interest margin, reserves and the financial stress index, the capital cushion. For each family, state its current level and its ten-year percentile, whether it is rising or falling, and whether it points to loosening or tightening. State which of these families has already turned and which has not. If the leading series has turned but the lagging series has not yet followed, state what that gap implies. Show the arithmetic when comparing levels to their ten-year percentiles. When a series line carries no recorded reading, the app could not determine one. Say so for that series, and do not infer a reading or a favored or not favored label for it. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Finish by stating what the order implies over the next year for companies that borrow, and separately for the banks that lend to them. Aim for roughly 1,200 words.",
    },
  ],
  sector: [
    {
      id: "sec.connect.readings",
      text:
        "Take every economic reading together: rates and the yield curve, inflation and commodities, growth and activity, labor and the consumer, liquidity and money, the dollar and trade, market valuation, and sentiment, policy uncertainty and geopolitical risk. What is the economy doing to {sector} right now, through which channels, and how does that compare with what it is doing to the other ten sectors?",
      guidance:
        "Work through every metric in the ECONOMY section of the data block, family by family: rates and the yield curve, inflation and commodities, growth and activity, labor and the consumer, liquidity and money, the dollar and trade, market valuation, and the sentiment, policy uncertainty and geopolitical risk indicators. For each family, state what it is doing to {sector} and through which channel: the volume {sector}'s companies sell, the prices they charge, their input costs, their financing costs, or the discount rate applied to their profits. Then read the SECTOR section's eleven-sector matrix and compare {sector}'s position with the other ten sectors under each family. Where families of evidence conflict (for example, rates favor the sector but growth does not), state which side carries more weight and why. Separate what is temporary from what is durable. Show the arithmetic wherever you use figures, especially when you cite a reading's ten-year percentile or compare the sectors' figures. When a series line carries no recorded reading, the app could not determine one. Say so for that series, and do not infer a reading or a favored or not favored label for it. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Finish by ranking the eleven sectors under this evidence. Aim for roughly 1,200 words.",
    },
    {
      id: "sec.connect.credit",
      text:
        "Take every credit and banking reading together (spreads, lending standards, loan growth, delinquencies and charge-offs, bank capital and liquidity, financial stress) with how {sector}'s companies are financed (interest coverage, net debt, the share that barely covers its interest). How exposed is {sector} to tighter credit compared with the other sectors?",
      guidance:
        "Work through every credit and banking series in the ECONOMY section (the three credit spreads, lending standards, each loan growth series, delinquencies, charge-offs, bank equity to assets, net interest margin, reserves, financial stress index) and then read {sector}'s financing metrics from the SECTOR section of the data block (interest coverage, net debt, leverage, the share of companies covering interest below two times). Compare {sector}'s credit exposure with the other ten sectors using the same financing figures from the SECTOR section. State through which channel tighter or easier credit reaches {sector}: higher borrowing costs, restricted loan access, asset quality pressure, or a changing discount rate. Where the credit series disagree (for example, spreads tightening while loan growth is still strong), state which side carries more weight and why. Show the arithmetic when comparing coverage and debt ratios across sectors. When a series line carries no recorded reading, the app could not determine one. Say so for that series, and do not infer a reading or a favored or not favored label for it. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. When a figure is not applicable (for example, standard interest coverage is not defined for banks), note why and use the bank-specific measures instead. Finish by ranking the eleven sectors under this evidence. Aim for roughly 1,200 words.",
    },
    {
      id: "sec.connect.score_vs_matrix",
      text:
        "Set every one of {sector}'s financial averages against the other ten sectors: economic value added and its margin, return on invested capital against the cost of capital, return on equity against the cost of equity, justified against actual price to book, price to earnings, net interest margin for lenders, the DuPont parts, operating and net margins, revenue and earnings growth, operating leverage, capital spending against depreciation, sales to invested capital, free cash flow against net income, debt, and the value score with the checks on how the average was built. Where do these fundamentals agree with what the economy favors, and where do they conflict?",
      guidance:
        "Work through every row of the SECTOR section's eleven-sector matrix in the data block: value creation (EVA, EVA margin, ROIC, WACC, the ROIC minus WACC spread), equity returns (ROE, cost of equity, excess return, justified versus actual price to book), valuation (P/E), net interest margin for lenders, the six DuPont levers (tax burden, interest burden, EBIT margin, net margin, asset turnover, equity multiplier), operating and net margins, revenue and earnings growth, operating leverage, capex to depreciation, sales to invested capital, free cash flow to net income, net debt to operating cash flow, liabilities to equity, and the value score with any integrity checks that fired. For each row, state where {sector} sits against the other ten sectors and whether that position agrees or conflicts with the economic readings from the ECONOMY section. Name the channel through which each agreement or conflict operates: volume, price, input costs, financing, or the discount rate. Where the fundamentals and the economy point in opposite directions, state which side carries more weight and why. Show the arithmetic wherever you compare a ratio or a spread. When a series line carries no recorded reading, the app could not determine one. Say so for that series, and do not infer a reading or a favored or not favored label for it. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Net interest margin is not applicable for non-lending sectors. Finish by ranking the eleven sectors under this evidence. Aim for roughly 1,200 words.",
    },
    {
      id: "sec.connect.industries",
      text:
        "Look across every industry inside {sector}: each one's share of the sector's revenue and operating profit now and five years ago, and each one's own financial averages. Where does the sector's profit sit, which industries do the economic and credit readings reach hardest, and which deserve a closer look?",
      guidance:
        "Work through the SECTOR section's profit pool and industry matrix in the data block. The profit pool gives each industry's share of the sector's revenue and operating profit for the current year and five years ago. The industry matrix sets every industry side by side on their financial averages. Compare every industry in {sector} side by side on their value creation, margins, growth, efficiency and leverage. For each industry, state how the economic and credit readings from the ECONOMY section reach it: through volume, price, input costs, financing, or the discount rate. Identify where the sector's profit collects, whether that concentration is rising or falling, and which industries are most and least exposed to the current economic and credit conditions. Show the arithmetic when comparing profit shares and their changes over time. When a series line carries no recorded reading, the app could not determine one. Say so for that series, and do not infer a reading or a favored or not favored label for it. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Finish by naming the industries that deserve a closer look and which the economic and credit readings reach hardest. Aim for roughly 1,200 words.",
    },
    {
      id: "sec.connect.temporary",
      text:
        "Of everything working for {sector} right now across the economy, credit conditions and its own fundamentals, which parts are temporary and which are durable? A temporary tailwind is a rotation, not a reason to own the sector for years.",
      guidance:
        "Work through every family of evidence in the ECONOMY and SECTOR sections of the data block. For each family, classify the current reading as temporary (likely to reverse within a business cycle) or durable (likely to persist for years). A reading that sits near an extreme percentile and has recently changed direction is more likely temporary; a reading driven by structural forces (demographics, industry maturity, long-term debt levels) is more likely durable. State which of {sector}'s advantages and disadvantages against the other ten sectors rest on temporary readings and which rest on durable ones. Show the arithmetic when comparing percentiles and directions. When a series line carries no recorded reading, the app could not determine one. Say so for that series, and do not infer a reading or a favored or not favored label for it. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Finish by stating which of {sector}'s current advantages are most likely to reverse and which single reading would signal the turn. Aim for roughly 1,200 words.",
    },
    {
      id: "sec.connect.triggers",
      text:
        "Of all the economic and credit readings, name the three that matter most to {sector}'s earnings and say why each one does. For each, give today's reading, the reading that would change your view of the sector, and how far today's value is from that point.",
      guidance:
        "Work through the section of the data block titled 'How each reading classifies {sector}.' It lists every economic and credit metric, its current named reading (for example 'Above 4% and rising'), and whether that reading classifies {sector} as favored, not favored or not affected. Each line also carries an earnings link sentence that names the channel (volume, price, input costs, financing or discount rate) through which that metric reaches {sector}'s earnings. Read every line. Then pick the three metrics that matter most to {sector}'s earnings, chosen by the size and directness of the earnings channel each one acts through. For each of the three, state today's named reading and its classification. Then identify the named reading on that same line that would flip the classification (for example, from favored to not favored). That is the reading that would change the view. To state how far today's value is from that point, read the metric's latest value from its ECONOMY series line and compare it with the numeric bound stated inside the flipping reading's label (for example, if the label says 'Above 4% and rising' and today's value is 3.35%, the distance is 0.65 percentage points). When the flipping label carries no numeric bound, or when the metric has no determined reading, say that the distance cannot be stated in the series' own units. Show the arithmetic for each distance. When a series line carries no recorded reading, the app could not determine one. Say so for that series, and do not infer a reading or a favored or not favored label for it. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Aim for roughly 1,200 words.",
    },
    {
      id: "sec.connect.synthesis",
      text:
        "Write the full account of {sector} as an investment right now: what the economy and credit conditions are doing to it, how its fundamentals rank against the other ten sectors, which industries carry it, what is temporary and what is durable, and what would change the call. No length limit; pull together everything from the questions above into the best complete picture you can.",
      guidance:
        "If the block carries a READER'S EARLIER CONCLUSIONS section, read it and build on those findings rather than re-deriving them. Work through every section of the data block (ECONOMY and SECTOR) and synthesize the findings from all of the questions above. Cover the economic and credit environment bearing on {sector}, its fundamentals ranked against the other ten sectors on every matrix row, which industries carry its profit and which are most exposed, what is temporary and what is durable, and what would have to change to reverse the call. Compare {sector} with the other ten sectors on every dimension where the block carries data. Name the channel (volume, price, input costs, financing, discount rate) through which each major force operates. Where families of evidence conflict, state which side carries more weight and why. Show the arithmetic wherever you use figures. When a series line carries no recorded reading, the app could not determine one. Say so for that series, and do not infer a reading or a favored or not favored label for it. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so.",
    },
  ],
  industry: [
    {
      id: "ind.connect.channels",
      text:
        "Take every economic and credit reading and bring it down through {parentSector} to {industry}. Which readings actually reach this industry, and through what: the volume it sells, the price it charges, its input costs, its financing, or the discount rate applied to its profits? Which readings that move the sector do not reach this industry at all?",
      guidance:
        "Work through every metric in the ECONOMY section of the data block, then through the SECTOR section's matrix for {parentSector}, and then through the INDUSTRY section's data for {industry}. For each economic and credit reading, trace whether it reaches {industry} and through which channel: the volume its companies sell, the prices they charge, their input costs, their financing costs, or the discount rate. Where a reading moves {parentSector} but does not reach {industry} (because of the industry's product mix, customer base, cost structure, or geographic exposure), say so and explain why. Compare {industry}'s exposure with the other industries in {parentSector} using the INDUSTRY section's side-by-side data. Show the arithmetic wherever you compare levels or percentiles. When a series line carries no recorded reading, the app could not determine one. Say so for that series, and do not infer a reading or a favored or not favored label for it. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Do not re-decide the economic reading; apply it. Aim for roughly 1,200 words.",
    },
    {
      id: "ind.connect.profit_share",
      text:
        "Set {industry} against every other industry in {parentSector}, and against comparable industries in other sectors, on every financial average: value creation, returns against the cost of capital, margins, growth, efficiency, cash quality, debt and the value score, together with its share of the sector's revenue and operating profit now and five years ago. Is this where the sector's profit collects, and is that share rising or falling?",
      guidance:
        "Work through the INDUSTRY section of the data block, which sets {industry} beside every other industry in {parentSector}. Compare each industry on value creation (EVA, EVA margin, ROIC minus WACC spread), returns against the cost of capital, margins, growth, efficiency, cash quality, leverage and the value score. Read {industry}'s share of the sector's revenue and operating profit for the current year and five years ago, and state whether that share is rising or falling. Then compare {industry} with comparable industries in other sectors if the block carries them. Show the arithmetic when computing profit shares and changes over time. When a series line carries no recorded reading, the app could not determine one. Say so for that series, and do not infer a reading or a favored or not favored label for it. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Do not re-decide the economic reading; apply it. Aim for roughly 1,200 words.",
    },
    {
      id: "ind.connect.structure",
      text:
        "Take all of the structure evidence together: concentration (the four and eight largest companies' shares and the HHI, which is the sum of squared percentage shares), the entry evidence (plant, capital spending, research and selling costs against revenue, the scale slope, gross margins and their spread, incumbents' cash, net entry), the exit evidence, the rivalry evidence, how stable the leaders' shares have been, the ten-year evolution, and your own five forces answers. When the economy and the sector favor {industry}, who keeps the gain: its companies, their suppliers, their customers, or new entrants?",
      guidance:
        "Work through the INDUSTRY section's structure evidence in the data block: concentration (CR4, CR8, HHI with percentile ranks), the entry evidence (PP&E to revenue, capex to revenue, R&D to revenue, SG&A to revenue, the scale slope, gross margin median and spread, incumbent cash to assets, net entry), the exit evidence (PP&E to assets, intangibles to assets, share of firms with capex below depreciation), the rivalry evidence (revenue CAGR, D&A to revenue, revenue spread among the top ten), share stability (top-five share change, rank correlation), the ten-year evolution series, and the reader's own five forces answers and ratings. For each piece of evidence, state whether it means the gain from favorable economic and sector conditions stays with the industry's companies, leaks to suppliers, leaks to customers, or is competed away by new entrants. Compare {industry}'s structure with the other industries in {parentSector} where the block carries percentile ranks. Show the arithmetic wherever you compare concentrations, shares or percentiles. When a series line carries no recorded reading, the app could not determine one. Say so for that series, and do not infer a reading or a favored or not favored label for it. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Gross margin is not applicable for bank industries. Do not re-decide the economic reading; apply it. Aim for roughly 1,200 words.",
    },
    {
      id: "ind.connect.groups",
      text:
        "Read the strategic groups in {industry}: which companies are similarly structured, what each group earns, and what keeps other companies out of the best group. Which group do today's economic, credit and sector conditions favor, and which group do they hurt?",
      guidance:
        "Work through the INDUSTRY section's strategic groups in the data block: the number of groups, each group's member companies, its combined revenue share, its median pre-tax ROIC and ROIC range, and what separates the groups structurally. For each group, state whether today's economic and credit conditions from the ECONOMY section and the sector conditions from the SECTOR section favor or hurt it, and through which channel: volume, price, input costs, financing, or the discount rate. Compare the best-performing group with the others on profitability and explain what keeps other companies from entering it. Show the arithmetic when comparing group returns and shares. When a series line carries no recorded reading, the app could not determine one. Say so for that series, and do not infer a reading or a favored or not favored label for it. Use only the figures in the data block and do not invent a score or a grade. If the industry has no strategic groups in the block, say so and explain what the overall industry data shows instead. Do not re-decide the economic reading; apply it. Aim for roughly 1,200 words.",
    },
    {
      id: "ind.connect.stress_test",
      text:
        "Look at how {industry} came through the 2020 downturn and the 2021 to 2022 inflation against its sector: revenue, gross margin, and the capital spending cycle. What does that record say about how it would handle the conditions the economic readings point to now?",
      guidance:
        "Work through the INDUSTRY section's evolution and trend series in the data block, focusing on the 2020 and 2021 to 2022 periods. Read {industry}'s revenue, gross margin spread, and capex-to-depreciation series for those years and compare them with {parentSector}'s figures from the SECTOR section. State whether {industry} held up better or worse than its sector through the downturn and the inflation shock, and by how much. Then read the current economic readings from the ECONOMY section and state which of those historical stress conditions (demand contraction, margin compression from rising input costs, capital spending freeze) the readings point toward now. Show the arithmetic when comparing year-over-year changes in revenue and margins. When a series line carries no recorded reading, the app could not determine one. Say so for that series, and do not infer a reading or a favored or not favored label for it. Use only the figures in the data block and do not invent a score or a grade. If a series does not cover 2020, say so and explain the limitation. Do not re-decide the economic reading; apply it. Aim for roughly 1,200 words.",
    },
    {
      id: "ind.connect.cost_passthrough",
      text:
        "Set today's inflation, producer price, wage and commodity readings against {industry}'s cost evidence: its gross margin, how widely gross margins differ across its companies, and what its gross margin did from 2020 to 2022 when input costs rose. Does this industry pass higher costs to its customers or absorb them? Which of today's cost readings would it feel first?",
      guidance:
        "Start from the ECONOMY section of the data block. Read the cost readings: CPI YoY Inflation, PPI YoY Inflation, Import Price Index YoY %, Real Avg Hourly Earnings YoY %, PPI All Commodities (Index), and the Commodities tiles (Copper, Gold, Silver, Wheat, WTI Crude, Brent Crude, Henry Hub NatGas, Heavy Trucks). For each, state its latest value, its direction and its automatic reading. Then work through the INDUSTRY section. Read the gross margin line (2020 through 2023) and state whether gross margin expanded, contracted or held flat through the 2021 to 2022 inflation period. Read the entry barriers subsection's gross margin median and gross margin spread: a wide spread means some companies pass costs through while others absorb them, so the industry does not move as one. Read the leader cost of goods lines for the top four companies (if available) and compare each company's cost of goods with the industry's median gross margin. Compare {industry}'s gross margin path with {parentSector}'s from the SECTOR section. Now connect the two halves: which of today's cost readings reaches {industry} first and through which cost line (materials, labor, energy, imported components), and whether the 2021 to 2022 record says the cost is passed on to customers or absorbed. Show the arithmetic when comparing margins, spreads and cost levels. When a series line carries no recorded reading, the app could not determine one. Say so for that series, and do not infer a reading or a favored or not favored label for it. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Finish by stating whether this industry passes higher costs to its customers or absorbs them, and which of today's cost readings it would feel first. Do not re-decide the economic reading; apply it. Aim for roughly 1,200 words.",
    },
    {
      id: "ind.connect.cost_of_money",
      text:
        "Set today's rate and credit readings (Treasury yields, credit spreads, lending standards, loan growth) against how {industry} is financed and how much capital it needs: its median interest coverage and net debt, the share of its companies covering interest less than two times, and its capital spending against revenue and against depreciation. If borrowing stays at today's cost, what gives way first: new capacity, the weaker companies, or payouts to shareholders?",
      guidance:
        "Start from the ECONOMY section of the data block. Read the rate and credit readings the question names: the Treasury yields (3-month, 1-year, 2-year, 10-year), the credit spreads (high-yield OAS, investment-grade OAS), the lending standards survey, and the loan growth series (bank credit, C&I). For each, state its latest value, direction and automatic reading. Then work through the INDUSTRY section. Read the financing line: median interest coverage, median net debt to EBITDA, and the share of companies covering interest below two times. A negative net debt to EBITDA means the median company holds more cash than debt. Read the entry barriers subsection for capital spending to revenue and the evolution series for capital spending to depreciation: a ratio above one means the industry is investing faster than it depreciates, so it is capital-hungry and more sensitive to the cost of that capital. Read the incumbent cash to assets figure if available. Compare {industry}'s financing line with {parentSector}'s from the SECTOR section: state whether {industry} is more or less levered than its sector and by how much. Now connect the two halves: given the direction of rates, credit spreads and lending standards, state what gives way first if borrowing stays at today's cost: new capacity (compare capex against depreciation and the capital spending to revenue ratio), the weaker companies (the share covering interest below two times), or payouts to shareholders (use the incumbent cash to assets figure if available as a buffer indicator). Show all arithmetic. When a series line carries no recorded reading, the app could not determine one. Say so for that series, and do not infer a reading or a favored or not favored label for it. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Do not re-decide the economic reading; apply it. Aim for roughly 1,200 words.",
    },
    {
      id: "ind.connect.synthesis",
      text:
        "Write the full account of {industry} as a place to look for investments right now: how the economy, credit conditions and {parentSector} bear on it, how it ranks against the other industries in its sector, what its structure does with a favorable or unfavorable environment, which strategic group is best placed, and what would change the call. No length limit; pull together everything from the questions above into the best complete picture you can.",
      guidance:
        "If the block carries a READER'S EARLIER CONCLUSIONS section, read it and build on those findings rather than re-deriving them. Work through every section of the data block (ECONOMY, SECTOR, INDUSTRY) and synthesize the findings from all of the questions above. Cover how the economy and credit conditions bear on {industry} through {parentSector}, how {industry} ranks against the other industries on every financial average, what its structure does with favorable or unfavorable conditions (who keeps the gain), which strategic group is best placed, what the stress-test record shows, and what would change the call. Name the channel (volume, price, input costs, financing, discount rate) through which each major force operates. Where families of evidence conflict, state which side carries more weight and why. Show the arithmetic wherever you use figures. When a series line carries no recorded reading, the app could not determine one. Say so for that series, and do not infer a reading or a favored or not favored label for it. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Do not re-decide the economic reading; apply it.",
    },
  ],
  comparative: [
    {
      id: "comp.connect.exposure",
      text:
        "Read across the whole ranking table, every column, for every company. Given what the economy, credit conditions, {parentSector} and {industry} are doing right now, which companies are reached hardest, which least, and which columns show it?",
      guidance:
        "Work through the PEERS section of the data block: read the full ranking table, every column, for every company. For each column (value score, margin of safety, DCF per share, every financial metric, and the per-share figures), identify which companies sit at the extremes. Then read the ECONOMY, SECTOR and INDUSTRY sections and state which economic, credit and sector conditions reach each company hardest and which reach it least, naming the channel: volume, price, input costs, financing, or the discount rate. Compare companies within the same strategic group and across groups. Show the arithmetic wherever you compare a company's metric against the industry average or the group average. When a series line carries no recorded reading, the app could not determine one. Say so for that series, and do not infer a reading or a favored or not favored label for it. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Finish by naming the companies that deserve a full analysis. Aim for roughly 1,200 words.",
    },
    {
      id: "comp.connect.structure",
      text:
        "Sort the companies into their strategic groups, the sets of similarly structured companies. Which group do the conditions from the earlier stages favor, what protects that group from the others copying it, and which companies inside it earn more than their group?",
      guidance:
        "Work through the INDUSTRY section's strategic groups in the data block: each group's member companies, their combined revenue share, their median pre-tax return on capital and return range, and what separates the groups structurally. Then read the ECONOMY, SECTOR and INDUSTRY sections to identify which conditions from the earlier stages favor which group. State what protects the best-performing group from imitation: structural barriers (scale, capital requirements, regulation) versus execution advantages (management quality, timing). For each company inside the favored group, compare its returns on capital with its group's median to identify who earns above or below the group level. Show the arithmetic when comparing group-level and company-level returns. When a series line carries no recorded reading, the app could not determine one. Say so for that series, and do not infer a reading or a favored or not favored label for it. Use only the figures in the data block and do not invent a score or a grade. If a company lacks data for a metric, skip it and say so. Finish by naming the companies that deserve a full analysis. Aim for roughly 1,200 words.",
    },
    {
      id: "comp.connect.share_change",
      text:
        "Over five years, which companies grew because {industry} grew and which grew by taking share? Set that against their returns on capital against the cost of capital, their margins and their debt. Who is gaining ground profitably and who is buying growth?",
      guidance:
        "Work through the PEERS section of the data block and read each company's Revenue Growth from the ranking table and its five-year share change from the exposure rows, alongside the industry's five-year revenue growth from the INDUSTRY section's connections line. Separate each company's growth into the part that came from the industry expanding and the part that came from the company gaining or losing share. Set that against each company's returns on capital versus the cost of capital (ROIC minus WACC spread), its margins and its leverage from the ranking table. Identify which companies are gaining share profitably (growing share while earning above their cost of capital) and which are buying growth (growing share but destroying value). Show the arithmetic when decomposing growth into industry and share components. When a series line carries no recorded reading, the app could not determine one. Say so for that series, and do not infer a reading or a favored or not favored label for it. Use only the figures in the data block and do not invent a score or a grade. If a company's history does not cover five years, say so. Finish by naming the companies that deserve a full analysis. Aim for roughly 1,200 words.",
    },
    {
      id: "comp.connect.valuation",
      text:
        "Set the value score, the margin of safety, the DCF (discounted cash flow) value per share and every valuation multiple against each company's exposure and its returns on capital. Is the company best placed for today's conditions also the most expensive? A favorable condition that everybody can see is usually in the price already.",
      guidance:
        "Work through the PEERS section's ranking table in the data block and read each company's value score, margin of safety, DCF intrinsic value per share and every valuation column in the ranking table (P/E, justified P/B against actual P/B, and any further valuation column this industry's table carries, such as EV to sales or PEG). Set each company's valuation against its exposure to the current economic and credit conditions from the ECONOMY section and its returns on capital from the ranking table. Identify whether the company best placed for today's conditions is also the most expensive, and whether any mispriced company combines favorable exposure with a low valuation. State where the market appears to have already priced in a favorable condition visible to everyone. Show the arithmetic when comparing multiples and margins of safety. When a series line carries no recorded reading, the app could not determine one. Say so for that series, and do not infer a reading or a favored or not favored label for it. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Finish by naming the companies that deserve a full analysis. Aim for roughly 1,200 words.",
    },
    {
      id: "comp.connect.demand_leverage",
      text:
        "Take the growth and activity readings that drive {industry}'s sales and set them against each company's operating leverage, its 2020 revenue change and its margins. If industry sales rise or fall a few points from here, whose operating profit moves most and whose least? Show the arithmetic for the two extremes.",
      guidance:
        "Start from the ECONOMY section of the data block. Read the growth and activity families that drive {industry}'s sales: Real GDP Growth, Industrial Production Index, Capacity Utilization, Retail Sales YoY %, and any other series whose classification line names {industry}'s demand channel. State each one's latest value, direction and automatic reading, and say why it matters to {industry}'s volume. Then work through the PEERS section. Read the ranking table's Operating Leverage DOL column and the Revenue Growth column for every company. Then read the exposure rows for the twenty largest companies: find each company's 2020 revenue change and its operating leverage figure. A high DOL means a small change in revenue produces a large change in operating income. The 2020 revenue change shows whether each company actually felt the last demand swing. Now state an assumed change in industry sales (for example plus three points and minus three points from the current revenue growth rate). For the company with the highest DOL, multiply that change by its DOL to estimate the change in operating profit, and use its operating margin to show what the new margin would be. Do the same for the company with the lowest DOL. Show the full arithmetic for both extremes. When a series line carries no recorded reading, the app could not determine one. Say so for that series, and do not infer a reading or a favored or not favored label for it. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Aim for roughly 1,200 words.",
    },
    {
      id: "comp.connect.above_industry",
      text:
        "Set each company's return on capital against its cost of capital, beside the same figure for {industry} as a whole and for {parentSector}. Which companies earn more than their industry, by how much, and has that gap widened or narrowed over five years? Do today's sector and economic conditions help the leaders keep the gap or help the others close it?",
      guidance:
        "Work through the PEERS section's ranking table in the data block. Read the ROIC, WACC and Spread (ROIC minus WACC) columns for every company. Then read the INDUSTRY section's industry matrix row for {industry} and the SECTOR section's sector matrix row for {parentSector} to find the industry and sector average ROIC, WACC and spread. For each company, state whether its spread is above the industry average, between the industry and sector averages, or below both. Count how many companies earn a positive spread and how many earn a negative spread. The ranking table does not carry per-company five-year history, so the five-year direction comes from the INDUSTRY section's trend metrics for ROIC and WACC and the SECTOR section's trend metrics: state whether the industry-level gap has been widening or narrowing. Then read the ECONOMY section's Treasury yields, implied equity risk premium and the SECTOR section's current conditions to state whether today's environment helps the leaders keep the gap (for example, rising rates punish the levered laggards more) or helps the others close it (for example, strong demand lifts returns for everyone). Show the arithmetic when comparing each company's spread with the industry and sector benchmarks. When a series line carries no recorded reading, the app could not determine one. Say so for that series, and do not infer a reading or a favored or not favored label for it. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Finish by naming the companies whose spread is most durable and the companies whose spread is most at risk. Aim for roughly 1,200 words.",
    },
    {
      id: "comp.connect.synthesis",
      text:
        "Write the full account of this peer group: which companies the economy, credit conditions, sector and industry favor and hurt, which strategic group is best placed and why, how valuation lines up against that, and which two or three companies deserve a full individual analysis. No length limit; pull together everything from the questions above into the best complete picture you can.",
      guidance:
        "If the block carries a READER'S EARLIER CONCLUSIONS section, read it and build on those findings rather than re-deriving them. Work through every section of the data block (ECONOMY, SECTOR, INDUSTRY, PEERS) and synthesize the findings from all of the questions above. Cover which companies the economy, credit conditions, sector and industry favor and hurt, which strategic group is best placed and why, how each company's growth decomposition and valuation line up against its position, and which two or three companies deserve a full individual analysis. Compare companies within and across strategic groups. Name the channel (volume, price, input costs, financing, discount rate) through which each major force operates. Show the arithmetic wherever you use figures. When a series line carries no recorded reading, the app could not determine one. Say so for that series, and do not infer a reading or a favored or not favored label for it. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Finish by naming the companies that deserve a full analysis.",
    },
  ],
  company: [
    {
      id: "indiv.connect.channels",
      text:
        "Take every economic and credit reading and trace it through {sector} and {industry} to {company}. Where does each one land: in its revenue, its gross margin, its operating costs, its interest expense, or the discount rate in its valuation? Which readings do not reach this company at all?",
      guidance:
        "Work through the ECONOMY section of the data block, then the SECTOR and INDUSTRY sections, and trace each economic and credit reading to {company} using the COMPANY section's own metric histories. For each reading that reaches {company}, state where it lands: in its revenue, its gross margin, its operating costs, its interest expense, or the discount rate used in its valuation. Where a reading moves the sector or the industry but does not reach {company} (because of its business mix, pricing power, balance sheet or geographic exposure), say so and explain why. Show the arithmetic when comparing {company}'s margin, growth or cost-of-capital figures with the industry average from the INDUSTRY section. When a series line carries no recorded reading, the app could not determine one. Say so for that series, and do not infer a reading or a favored or not favored label for it. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Do not re-teach macro or sector calls; apply the ones in the block to this company. Aim for roughly 1,200 words.",
    },
    {
      id: "indiv.connect.industry",
      text:
        "Given {industry}'s structure (concentration, entry and exit barriers, rivalry, how stable the leaders' shares are, where the industry is in its evolution) and its place in {sector}'s profit pool, what does the industry allow {company} to earn, and for how long?",
      guidance:
        "Work through the INDUSTRY section's structure evidence in the data block: concentration, entry and exit barriers, rivalry evidence, share stability, the evolution series and the strategic groups. Then read {industry}'s position in {sector}'s profit pool from the SECTOR section. State what {industry}'s structure allows {company} to earn, using the COMPANY section's returns on capital and margins as evidence of whether the company earns at, above or below the structural ceiling. State how long the structural conditions are likely to last, based on the evolution trend and the entry evidence. Show the arithmetic when comparing {company}'s returns with the industry median and its strategic group's median. When a series line carries no recorded reading, the app could not determine one. Say so for that series, and do not infer a reading or a favored or not favored label for it. Use only the figures in the data block and do not invent a score or a grade. If a piece of structure evidence is marked not available, not applicable or not loaded, skip it and say so. Do not re-teach macro or sector calls; apply the ones in the block to this company. Aim for roughly 1,200 words.",
    },
    {
      id: "indiv.connect.peers",
      text:
        "Set {company} against its strategic group of similarly structured companies, against its whole industry and against its sector on every metric family: profitability and economic value added, leverage and coverage, valuation multiples, capital efficiency, the DuPont parts, working capital and cash conversion, earnings quality, growth and risk. Where is it ahead, where is it behind, and what explains each gap?",
      guidance:
        "Work through the PEERS section of the data block: read {company}'s row in the ranking table and its strategic group's members. Read the COMPANY section's benchmarks table. It compares the company with four reference points (industry median, group median, industry weighted average and sector weighted average) and prints the gap to each. Then work through the COMPANY section's full metric histories: profitability and economic value added (operating margin, EVA margin, ROIC minus WACC spread, ROE, ROIC, WACC, cost of equity, excess return), leverage and coverage (interest coverage, net debt, liabilities to equity, debt to equity, current and quick ratios), valuation multiples (P/E, justified P/B against actual P/B, and any further valuation column this industry's table carries, such as EV to sales or PEG), capital efficiency (sales to invested capital, capex to depreciation, reinvestment rate, marginal ROIC, FCF to net income, operating leverage), the DuPont parts, working capital and cash conversion (CCC, DSO, DIO, DPO), earnings quality (income quality, Sloan accruals ratio, SBC to revenue), growth (revenue and net income growth) and risk (beta). Compare {company} with its strategic group, with the full industry and with the sector on every family that each level carries. Working capital, cash conversion and earnings quality are available only in the COMPANY section and should be assessed against the company's own trend. For each gap, state what explains it: a structural advantage, a balance-sheet choice, a temporary condition, or a different product mix. Show the arithmetic when computing gaps. When a series line carries no recorded reading, the app could not determine one. Say so for that series, and do not infer a reading or a favored or not favored label for it. Use only the figures in the data block and do not invent a score or a grade. If a metric is marked not available, not applicable or not loaded, skip it and say so. Do not re-teach macro or sector calls; apply the ones in the block to this company. Aim for roughly 1,200 words.",
    },
    {
      id: "indiv.connect.growth_split",
      text:
        "{company}'s growth comes partly from {industry} growing and partly from its share changing, and its margin comes partly from the industry, partly from its strategic group and partly from the company itself. Which parts should continue, and which depend on conditions the earlier stages say are changing?",
      guidance:
        "Work through the COMPANY section's growth and revenue history, the INDUSTRY section's overall revenue growth, and the INDUSTRY section's strategic group data. Decompose {company}'s growth into the part driven by {industry} expanding and the part driven by its market share changing. Then decompose {company}'s margin into the part set by the industry, the part set by its strategic group and the part unique to the company itself. For each component, state whether the ECONOMY and SECTOR sections suggest it will continue (because it rests on durable structural forces) or is at risk of changing (because it rests on cyclical or temporary conditions). Show the arithmetic when splitting growth and margin into their components. When a series line carries no recorded reading, the app could not determine one. Say so for that series, and do not infer a reading or a favored or not favored label for it. Use only the figures in the data block and do not invent a score or a grade. If growth history is too short or the strategic group data is incomplete, say so and explain the limitation. Do not re-teach macro or sector calls; apply the ones in the block to this company. Aim for roughly 1,200 words.",
    },
    {
      id: "indiv.connect.valuation",
      text:
        "Look at the valuation: the starting and terminal growth rates, the current and target margins, the number of years of above-normal returns, the cost of capital, and the growth that today's price already implies. Are those assumptions consistent with everything the economy, the sector, the industry and the peer group say? Name the assumption that fits least.",
      guidance:
        "Work through the COMPANY section's valuation assumptions in the data block: the starting revenue growth rate, the terminal growth rate, the current and target operating margins, the number of years of convergence, the cost of capital build (the block prints each input, weight and beta component), and the reverse-DCF implied growth rate. When the model value and the market quote are in different currencies, the block carries a valuation currency note and the margin of safety is not reconciled; flag that and do not read the figure as like-for-like. For each assumption, test it against the evidence from the ECONOMY, SECTOR, INDUSTRY and PEERS sections. Name the one assumption that fits the earlier-stage evidence least. When the reverse-DCF implied growth exceeds the industry's structural growth or the economy's nominal GDP growth, flag it. Show the arithmetic when comparing each assumption with the relevant benchmark. When a series line carries no recorded reading, the app could not determine one. Say so for that series, and do not infer a reading or a favored or not favored label for it. Use only the figures in the data block and do not invent a score or a grade. If the valuation model is not loaded, say so and work with the available multiples instead. If any other figure is marked not available, not applicable or not loaded, skip it and say so. Do not re-teach macro or sector calls; apply the ones in the block to this company. Aim for roughly 1,200 words.",
    },
    {
      id: "indiv.connect.rates_to_value",
      text:
        "Follow the rate readings into {company}'s valuation. Its cost of capital is built from the risk-free rate, the equity risk premium, its beta and its cost of debt. Set each against today's Treasury yield, the implied equity risk premium and the credit spread readings. If the ten-year yield moved one point, what happens to its cost of capital, and what does the extra interest on its debt do to operating income? Show the arithmetic.",
      guidance:
        "Work through the COMPANY section's cost of capital build in the data block. Read the weighted average cost of capital, the cost of equity, the risk-free rate, the equity risk premium, the beta, the pre-tax cost of debt, the equity weight and the debt weight. Then read the ECONOMY section's Treasury yields (the 10-year yield is the risk-free rate proxy), the implied equity risk premium, and the credit spreads (high-yield OAS, investment-grade OAS). Compare the risk-free rate in the build with the latest 10-year Treasury yield. Compare the equity risk premium in the build with the implied equity risk premium line and state whether the build uses a higher or lower premium. Compare {company}'s pre-tax cost of debt with the credit spread readings; if the block prints a synthetic rating spread, compare it with the market spread for that rating tier. Now model a one-point rise in the 10-year yield. The cost of equity moves by beta times the change. The after-tax cost of debt rises by one point times (1 minus the tax rate). Recompute the weighted average using the existing equity and debt weights. Then read the interest stress line: {company}'s total debt, the extra annual interest from a one-point rise, and that extra interest as a share of operating income. If the interest stress line says not applicable (as it does for banks and insurers), explain why: a rate rise passes through a lender's asset side as well as its funding side, so the net effect depends on the duration mismatch, not on a simple coverage ratio. If the block marks the margin of safety or the market quote as not applicable or not currency reconciled, do not use that figure. Show all arithmetic step by step. When a series line carries no recorded reading, the app could not determine one. Say so for that series, and do not infer a reading or a favored or not favored label for it. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Finish by stating whether {company}'s valuation is more sensitive to a rate move through its cost of capital or through its interest expense. Do not re-teach macro or sector calls; apply the ones in the block to this company. Aim for roughly 1,200 words.",
    },
    {
      id: "indiv.connect.drivers",
      text:
        "Take what {company} sells and who buys it (its business description, its segments and its cost structure) and match each part to the economic readings that drive it. Which readings drive demand for its largest segment, and which drive its largest cost? What did its revenue and gross margin do in 2020 and through the 2021 to 2022 inflation, when those readings last moved sharply?",
      guidance:
        "Work through the COMPANY section of the data block. Read the business profile line and the segments line. If segments are available, name each segment, its revenue and its share of total revenue; identify the segment that contributes the most. If segments are marked not available, say so and work from the business profile instead. Read the cost structure line: cost of goods as a share of revenue, research and development as a share, and the operating margin. If cost of goods is marked not applicable (as it is for banks and insurers that report no cost of revenue), explain why and assess the cost structure from the operating margin alone. Now match each part to the ECONOMY section. For the largest segment (or the business profile if no segments), identify the economic readings that drive its customers' spending: the growth and activity series, the consumer series, or the trade series, whichever fits the segment's market. For the largest cost line, identify the cost readings that drive it: CPI, PPI, Import Price Index, Real Avg Hourly Earnings, commodity prices, or interest rates for a lender. Say which named readings those series show today. Then read the 2020 revenue change percentage and the gross margin line from 2020 through 2023: these are the record of what happened when those same readings last moved sharply. If gross margin is marked not available for all years (as it is for banks), say so and assess from the operating margin trend instead. Compare {company}'s cost of goods and margin path with the industry median from the INDUSTRY section's connections line. Show the arithmetic when comparing margins and cost shares. When a series line carries no recorded reading, the app could not determine one. Say so for that series, and do not infer a reading or a favored or not favored label for it. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Finish by stating which economic readings drive demand for {company}'s largest segment and which drive its largest cost, and what the 2020 and 2021 to 2022 record says about how it handles those readings when they move sharply. Do not re-teach macro or sector calls; apply the ones in the block to this company. Aim for roughly 1,200 words.",
    },
    {
      id: "indiv.connect.synthesis",
      text:
        "Write the full account of {company} as an investment right now: how the economy, credit conditions, {sector} and {industry} bear on it, how it stands against similarly structured companies, whether its valuation assumptions fit that picture, what would make you buy it, and what would make you sell it. No length limit; pull together everything from the questions above into the best complete picture you can.",
      guidance:
        "If the block carries a READER'S EARLIER CONCLUSIONS section, read it and build on those findings rather than re-deriving them. Work through every section of the data block (ECONOMY, SECTOR, INDUSTRY, PEERS, COMPANY) and synthesize the findings from all of the questions above. Cover how the economy and credit conditions bear on {company} through {sector} and {industry}, how {company} stands against its strategic group and its industry, whether its valuation assumptions fit the earlier-stage evidence, what would make it a buy and what would make it a sell. Name the channel (volume, price, input costs, financing, discount rate) through which each major force operates. Where families of evidence conflict, state which side carries more weight and why. Show the arithmetic wherever you use figures. When a series line carries no recorded reading, the app could not determine one. Say so for that series, and do not infer a reading or a favored or not favored label for it. Use only the figures in the data block and do not invent a score or a grade. If a figure is marked not available, not applicable or not loaded, skip it and say so. Do not re-teach macro or sector calls; apply the ones in the block to this company.",
    },
  ],
};

// ── The button copy while the figures are gathered ─────────────────────

export const CONNECT_AI = {
  /** Replaces "Explain using AI" while the cross-stage figures are loading. */
  gathering: "Gathering the figures",
  /** One small line under the button when the figures could not be gathered. */
  gatherFailed:
    "The cross-stage figures did not load, so the answer uses this page's figures only.",
  /** What the panel says when the reader left the page before the figures were
   *  in, so the question was never sent. */
  abandoned:
    "You moved to another page before the figures were gathered, so this question was not sent. Ask it again from the page it is about.",
};

// ── Builders ──────────────────────────────────────────────────────

/** U+2014 EM DASH, built at runtime so no literal em dash lives in this file,
 *  the same way lib/stageContext/units.ts builds it. */
const EM_DASH = String.fromCharCode(0x2014);

/**
 * A name made safe to drop into a question.
 *
 * The company name reaching this deck has come from a payload, and the
 * backend's own company title is "TICKER {em dash} Company Name". Interpolated
 * as it stands, that puts an em dash into rendered question text, which the
 * app's copy rules forbid outright. The app's substitution for a spaced em dash
 * is the punctuation the sentence calls for, which here is a comma.
 */
export function plainName(name: string | null | undefined): string {
  if (name == null) return "";
  return String(name)
    .split(` ${EM_DASH} `).join(", ")
    .split(EM_DASH).join(", ")
    .trim();
}

/** The four placeholders a connect question can carry, and the name each one
 *  reads from. */
const SLOTS: [string, keyof ConnectNames][] = [
  ["{sector}", "sector"],
  ["{industry}", "industry"],
  ["{parentSector}", "parentSector"],
  ["{company}", "company"],
];

/**
 * One question or hidden prompt with its names filled in, or null when a name
 * the text needs is missing.
 *
 * A missing name used to be substituted as the empty string, which turned
 * "trace it through {sector} and {industry} to {company}" into "trace it
 * through  to ." and asked the reader a question about nothing. The caller
 * builds no deck at all instead, so the page shows no connect questions until
 * it knows what they are about.
 */
export function fill(text: string, names: ConnectNames): string | null {
  let out = text;
  for (const [slot, key] of SLOTS) {
    if (!out.includes(slot)) continue;
    const name = plainName(names[key]);
    if (name.length === 0) return null;
    out = out.split(slot).join(name);
  }
  return out;
}

/**
 * The connect deck for one stage: a single group, its questions filled with the
 * page's own names, each carrying its own hidden prompt filled the same way.
 *
 * Returns an empty deck when any question of the stage needs a name the caller
 * did not supply. Every question of a stage names the same subjects, so a deck
 * missing one of them is a deck of half-written questions.
 */
export function buildConnectDeck(stage: ConnectStage, names: ConnectNames): RuntimeGroup[] {
  const questions: RuntimeQuestion[] = [];
  for (const item of CONNECT_QUESTIONS[stage]) {
    const text = fill(item.text, names);
    const guidance = fill(item.guidance, names);
    if (text == null || guidance == null) return [];
    questions.push({ ...q(item.id, text), guidance });
  }
  return [{ title: CONNECT_DECK_TITLE[stage], questions }];
}

// ── Registry for the copy-conformance test ─────────────────────────

/**
 * The static strings in this module that the writer's document does NOT hold:
 * the deck titles and the panel's own three sentences. They are keyed as
 * connectQuestions.draft.md keys them, and the conformance test diffs the two
 * in both directions.
 *
 * The 33 questions and their hidden prompts are not here. They are diffed
 * against docs/connect-questions.final.md itself, which is the writer's source
 * for them, so they are checked against the file they were written in rather
 * than against a second copy of that file.
 */
export const CONNECT_COPY_REGISTRY: Record<string, string> = (() => {
  const r: Record<string, string> = {};
  for (const [stage, title] of Object.entries(CONNECT_DECK_TITLE)) {
    r[`title.${stage}`] = title;
  }
  r["ai.gathering"] = CONNECT_AI.gathering;
  r["ai.gatherFailed"] = CONNECT_AI.gatherFailed;
  r["ai.abandoned"] = CONNECT_AI.abandoned;
  return r;
})();
