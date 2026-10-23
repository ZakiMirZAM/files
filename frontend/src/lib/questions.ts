import type { QualitativeGroup, RuntimeGroup, SectionKey } from "./types";

/** Title of the economic synthesis deck, rendered as its own block above the
 *  full question bank on the Economic page (and excluded from the bank). */
export const ECON_VERDICT_TITLE = "Sector Verdict: The Questions That Decide";

/** Titles of the two understanding-first decks rendered at the TOP of the
 *  Economic page, before any metric. The user builds a working model of the
 *  economy before analyzing it metric by metric. Both are excluded from the
 *  page-bottom bank. */
export const ECON_UNDERSTAND_TITLES = [
  "Understand the Economy First",
  "How the Big-Player Economies Work",
];

/** Title of the exclusion synthesis deck, rendered inside the Verdict section
 *  below the sector verdict deck (and excluded from the bank). */
export const ECON_EXCLUSION_TITLE = "Exclusion Verdict: Sectors That Are Out";

/** Title of the sector understanding-first deck, rendered at the top of every
 *  sector page with answers saved per sector. Excluded from the bottom bank. */
export const SECTOR_DEFINE_TITLE = "Define This Sector First";

/** Title of the industry understanding-first deck, rendered at the top of every
 *  industry page with answers saved per industry. Excluded from the bottom bank. */
export const INDUSTRY_DEFINE_TITLE = "Define This Industry First";

export const QUALITATIVE_QUESTIONS: Record<SectionKey, QualitativeGroup[]> = {
  economic: [
    {
      title: ECON_VERDICT_TITLE,
      questions: [
        { id: "econ.verdict.phase", text: "Which phase of the business cycle is the economy in right now: early recovery, mid cycle, late cycle, or contraction? Read the 10Y-3M and 10Y-2Y spreads, the high-yield credit spread, industrial production, heavy truck sales, and payrolls together. Early recovery favors Consumer Cyclical, Financial Services, and Industrials; mid cycle favors Technology and Communication Services; late cycle favors Energy, Basic Materials, Healthcare, and Consumer Defensive; contraction favors Utilities, Consumer Defensive, and Healthcare." },
        { id: "econ.verdict.rates", text: "Are interest rates and liquidity moving toward easier or tighter conditions? Read the 10-year yield, the 30-year mortgage rate, the Fed balance sheet, net liquidity, and M2 growth. Falling rates and expanding liquidity favor the long-duration sectors (Technology, Real Estate, Utilities); rising rates favor Financial Services and punish bond-proxy sectors." },
        { id: "econ.verdict.inflation", text: "Is inflation rising in a way that is durable, meaning the rise holds over a full 12 months AND the 5-year breakeven is rising with it? A spike the market already prices as temporary is not a reason to favor Energy or Basic Materials. Even when inflation is durable, the companies worth owning in those sectors are the ones with pricing power, not the price takers." },
        { id: "econ.verdict.consumer", text: "Is the consumer strengthening or weakening? Read real hourly earnings, retail sales, consumer sentiment, the savings rate, and unemployment together. A strengthening consumer favors Consumer Cyclical over Consumer Defensive; a weakening one reverses that trade." },
        { id: "econ.verdict.dollar", text: "Which way is the trade-weighted dollar trending, and what does that mean for sector earnings? A strengthening dollar pressures Technology, Basic Materials, and Energy (foreign revenue and dollar-priced commodities); a weakening dollar is a tailwind for the same sectors." },
        { id: "econ.verdict.valuation", text: "Is the market priced for high or low forward returns? Read the Shiller CAPE against its own history, the Fed model spread, and the implied equity risk premium. A richly valued market argues for sectors whose earnings justify their price (check the P/E rows on the Sector Financial Averages) over the most expensive growth sectors; a cheap market widens what you can own." },
        { id: "econ.verdict.matrix", text: "Which three sectors top your Sector Rotation matrix right now, and which sit at the bottom? Where your answers to the six questions above disagree with the matrix, name the disagreement and decide which reading is wrong before moving on. The matrix is the weighted sum of the same data you just read." },
        { id: "econ.verdict.fundamentals", text: "Which sectors are actually creating value regardless of the cycle? Open the Sector Financial Averages and read the Value Score row and the ROIC minus WACC spread. A macro-favored sector that earns less than its cost of capital is a trade, not an investment; a value-creating sector the macro dislikes this quarter may still be the better multi-year home." },
        { id: "econ.verdict.psychology_debt", text: "Where are market psychology and the debt cycle right now? For psychology: is fear of missing out, a new-era mentality, or pessimism dominating, and are amateur investors euphoric or absent? For the debt cycle: is credit expanding faster than incomes, is the borrowed money funding productive assets or consumption and speculation, and are debt service burdens rising? Euphoric psychology on top of unproductive credit growth marks a late cycle where the favored trade is crowded and defensive sectors deserve more weight; washed-out psychology with deleveraging behind it marks the base where cyclical sectors are cheapest." },
        { id: "econ.verdict.asset_class", text: "Which type of investment does the data favor right now: stocks, bonds, or cash? Settle this before you rank sectors, because the best sector in a market that pays too little is still a poor place for new money. Read the 10-year Treasury yield, the 10-Year Real Yield (TIPS), the Earnings Yield vs 1Y Treasury chart, the implied equity risk premium, the Expected Return building blocks, and the high-yield credit spread together. When a Treasury bond pays a real yield close to the return stocks are expected to earn, bonds offer a similar reward for far less risk, and stocks have to be cheap to compete; a wide equity risk premium on top of low real yields favors stocks; an inverted yield curve means cash and short-term bills pay more than long bonds while you wait. State roughly how you would split new money between the three, and name the one reading that would have to change for you to move it." },
        { id: "econ.verdict.final", text: "Combining everything above: rank the two or three sectors you would concentrate research on and the one or two you would avoid, and give the single most important reason for each. State whether each favored sector is favored for a temporary reason or a durable one; a temporary reason is a rotation, not an investment." },
      ],
    },
    {
      title: ECON_UNDERSTAND_TITLES[0],
      questions: [
        { id: "econ.understand.growth_engine", text: "In your own words, how does the economy generate growth right now? Who is spending, who is borrowing, and what are they borrowing for?" },
        { id: "econ.understand.regime", text: "What regime are we in: where are policy rates, is liquidity expanding or contracting, and is inflation above or below target and heading which way?" },
        { id: "econ.understand.debt_cycles", text: "Where are we in the short-term debt cycle (easing versus tightening) and in the long-term debt cycle (how much debt relative to income, and how much room policy has left)?" },
        { id: "econ.understand.growth_source", text: "What is doing the heavy lifting in growth today: productivity, credit expansion, fiscal deficits, or population growth? What happens to growth if the credit component stalls?" },
        { id: "econ.understand.imbalances", text: "Which imbalances worry professional analysts most right now (deficits, valuations, concentration, housing, bank balance sheets), and what would trigger each one to matter?" },
        { id: "econ.understand.summary", text: "Write the summary a professional economic analyst would give of the current economy, as complete as you can make it: pull together growth drivers, the policy and liquidity regime, the debt cycle position, and the imbalances into one coherent account. There is no length limit; the goal is the best possible synthesis of everything above. If you cannot write it yet, list what you still need to learn before analyzing any single metric below." },
      ],
    },
    {
      title: ECON_UNDERSTAND_TITLES[1],
      questions: [
        { id: "econ.understand.us", text: "United States: what drives its growth (consumption share, services versus goods), how do the Fed and fiscal policy transmit into markets, and what is its key fragility today?" },
        { id: "econ.understand.china", text: "China: how does its investment-and-export model work, what shape are property and local-government debt in, and how do its slowdowns transmit into US sectors such as materials, industrials, and technology?" },
        { id: "econ.understand.europe", text: "Europe: what does the euro area depend on (exports, imported energy), how does the ECB's job differ from the Fed's, and which US sectors feel a European slowdown first?" },
        { id: "econ.understand.japan", text: "Japan: why do its interest rates matter globally (carry trade funding, large holdings of Treasuries), and what happens to global yields when the Bank of Japan tightens?" },
        { id: "econ.understand.synthesis", text: "Synthesis: which foreign economy poses the biggest risk to your sector rankings right now, and through which channel: demand, currency, rates, or supply chains?" },
      ],
    },
    {
      title: ECON_EXCLUSION_TITLE,
      questions: [
        { id: "econ.exclude.converging", text: "Across all the metrics above, which sectors are definitively excluded, and which two or more converging readings exclude each one? A single metric is never enough." },
        { id: "econ.exclude.flip", text: "For each sector you almost excluded, name the single metric that would flip your decision if it changed." },
        { id: "econ.exclude.horizon", text: "Which of your exclusions are cyclical (bad for the next year) and which are structural (bad for a decade)? How does that change the price at which you would reconsider?" },
        { id: "econ.exclude.final", text: "Write the final exclusion list with one decisive reason per sector. Check it against your rotation matrix ranking: if an excluded sector sits in the top three there, work out which of the two is wrong." },
      ],
    },
    {
      title: "Market Psychology",
      questions: [
        { id: "econ.fomo", text: "Is a fear-of-missing-out mentality present in the broader market right now?" },
        { id: "econ.amateur_sentiment", text: "How would you describe amateur investor sentiment?" },
        { id: "econ.new_era", text: "Is there a 'new era economy' mentality at play, and what's driving it?" },
        { id: "econ.psych_spectrum", text: "Overconfidence, pessimism, optimism, new-era mindset, which dominates and where?" },
        { id: "econ.risk_perception", text: "How does the general public perceive risk today?" },
        { id: "econ.news_psych", text: "Is news reporting psychology skewing positive or negative? Where?" },
        { id: "econ.recovery_euphoria", text: "Is today's optimism rooted in a long recovery from war, a past recession, or a prior crash, and is that history being read as proof the good times will keep going?" },
        { id: "econ.visible_winners", text: "Are a handful of highly visible winners (star stocks, sectors, or founders) held up as proof the whole market will keep rising?" },
        { id: "econ.permanent_prosperity", text: "Is there a belief in permanent prosperity, that recessions and bear markets are a thing of the past?" },
        { id: "econ.herd", text: "How strong is herd behavior right now, with buyers piling in mainly because everyone else is buying?" },
        { id: "econ.valuation_vs_fundamentals", text: "Are prices being set by story and momentum rather than fundamentals like earnings, cash flow, and reasonable valuations?" },
        { id: "econ.greed_to_fear", text: "If a first real market decline hit, how fast could the mood flip from greed to fear, and what would signal that the turn has begun?" },
      ],
    },
    {
      title: "Credit & Debt",
      questions: [
        { id: "econ.debt_quality", text: "What's the quality of debt currently being financed?" },
        { id: "econ.leverage_personal", text: "Overall leverage, Personal credit: how stretched is the consumer?" },
        { id: "econ.leverage_private", text: "Overall leverage, Private credit: where are the bubbles?" },
        { id: "econ.leverage_government", text: "Overall leverage, Government credit: which sovereigns are at risk?" },
        { id: "econ.leverage_corporate", text: "Overall leverage, Company / industrial credit: who's over-levered?" },
        { id: "econ.tightening_into_debt", text: "Is the central bank raising interest rates into an economy already carrying heavy debt across companies (especially the bubble's hot names), households, and bank loans written (often at record highs or rising quickly), partly to fight inflation that the boom itself helped create?" },
        { id: "econ.bank_loans_health", text: "If bank loans are high or increasing quickly, are the loans being written healthy (sound credit standards, solid borrowers and collateral) or is weak credit being extended on easy terms? Weigh the evidence, staying skeptical without assuming the worst." },
      ],
    },
    {
      title: "Innovation & Capital Formation",
      questions: [
        { id: "econ.innovation_news", text: "Which new innovations are emerging now, how early are you spotting them, and how likely is each to disrupt existing businesses? The best investors identify important innovations before the crowd, so gauge each new technology's potential to replace what people use today." },
        { id: "econ.ipo_vc", text: "What's the state of new IPOs and venture capital funding?" },
        { id: "econ.acquisitions", text: "How elevated is acquisition activity?" },
        { id: "econ.business_progress", text: "How much emphasis is the market putting on actual business progress vs. narrative?" },
        { id: "econ.demographics", text: "What are the demographics of current investors driving flows?" },
      ],
    },
    {
      title: "Macro Drivers",
      questions: [
        { id: "econ.gdp_inflation_debt", text: "What's actually driving GDP growth, inflation, and increasing debt?" },
        { id: "econ.geography", text: "What geographic constraints and benefits are shaping individual economies and industries?" },
        { id: "econ.political_tradeoffs", text: "What are the tradeoffs of recent political and economic decisions?" },
      ],
    },
    {
      title: "Long-Term Growth, Productivity & Demographics",
      questions: [
        { id: "econ.growth.productivity", text: "Is productivity rising in this economy, meaning the amount each worker produces, and how does that trend compare with the past and with other countries? Long-run gains in a nation's wealth, living standards, and power come mostly from rising productivity, so this is the single most important force to judge." },
        { id: "econ.growth.position", text: "Are the businesses you favor based in industries and regions of the world that are actually growing, rather than shrinking or standing still? Owning companies inside expanding industries and expanding economic regions gives a natural tailwind that a strong company in a declining area does not have." },
        { id: "econ.growth.industry_rates", text: "When you compare the growth rates of different industries, which ones are expanding fastest and which are falling behind? Ranking industries by how quickly they grow helps point money toward the parts of the economy with the most room to expand." },
        { id: "econ.growth.demographics", text: "Is this country's birth rate high enough to grow its workforce, and if not, is it making up for that through immigration, policies that encourage having children, higher exports, or better productivity? A country with falling birth rates and none of these offsets will eventually struggle to grow its economy." },
        { id: "econ.growth.real_longterm", text: "Is your analysis centered on each region's real, long-term growth, meaning growth in actual output after the effect of rising prices is removed? Real long-term growth is the main thing global investors should focus on, because growth that is only higher prices or only short-lived does not build lasting value." },
        { id: "econ.growth.capex_offset", text: "Does growing this economy require heavy spending on new factories, equipment, and infrastructure? Faster economic growth does not automatically raise company earnings, because the investment needed to grow uses up cash that would otherwise reach owners. Capital spending here means money put into long-lived assets such as plants and machines." },
        { id: "econ.growth.earnings_need_growth", text: "Is the broader economy growing, and if it is barely growing, how would the companies you follow still increase their earnings? When the overall economy is flat, earnings growth is much harder to achieve, because a company must take sales from rivals or cut costs instead of riding a rising tide." },
      ],
    },
    {
      title: "Trade, Competition & Global Supply Chains",
      questions: [
        { id: "econ.trade.foreign_competition", text: "If a bigger company from another country entered this market, could it threaten the survival of the local companies you are looking at, or do government regulations block new entrants from coming in? Unless rules keep new entrants out, larger foreign businesses can move in and put local companies' existence at risk." },
        { id: "econ.trade.profit_attracts_entry", text: "How profitable is this business or market, and could that profitability itself invite new competitors in? The more profitable a business is, the easier and more tempting it becomes for others to enter the market, especially competitors that benefit from a lower cost structure, meaning they can make the same thing for less." },
        { id: "econ.trade.container_ports", text: "How much access does this economy have to large container ports, the big sea shipping hubs where goods move in and out by the containerload? Access to large container ports tends to mean a stronger economy, because it lets a country trade goods at scale." },
        { id: "econ.trade.china_ports", text: "How dependent is the situation you are analyzing on China's ports, and what would happen to it if those ports were disrupted? Chinese ports are a critical part of the global supply chain, the worldwide network that moves goods from raw materials to finished products, so anything that affects these ports affects the entire economy." },
        { id: "econ.trade.global_trade_threats", text: "What could disrupt global trade, and which of these threats is most relevant right now: economic shutdowns, wars, pandemics or growing viruses that could force a shutdown, tariffs (taxes a government places on imported goods), economic panics, the balance of supply and demand, intellectual property rights, free trade agreements, natural disasters, labor shortages, raw material scarcity, overproduction of products, and underproduction of products? Also weigh the actions of intergovernmental organizations such as the WTO (World Trade Organization), the OECD (Organisation for Economic Co-operation and Development), UNCTAD (UN Conference on Trade and Development), and the Bank for International Settlements, and ask whether current global events, incidents, or growing viruses could trigger a shutdown." },
        { id: "econ.trade.shipping_bottlenecks", text: "Which major shipping bottlenecks does the trade you are analyzing rely on, and what would happen if one of them were blocked: the Danish Straits, the English Channel, the Strait of Malacca, the Panama Canal, the Suez Canal, the Strait of Hormuz, or the Turkish Straits? A bottleneck is a narrow stretch of sea that a large share of global shipping has to pass through, so a closure at any one of them can choke trade and ripple across the whole economy." },
        { id: "econ.trade.baltic_dry_index", text: "What is the Baltic Dry Index doing, and what could be moving it? This index tracks the average price paid for shipping dry bulk goods (loose, unpackaged commodities such as grain, coal, and iron ore) by sea, so it rises and falls with the cost of ocean freight and the balance between how many goods need moving and how many ships are available, which makes it an early read on global trade activity." },
        { id: "econ.trade.shipping_cost_cycle", text: "When demand for goods rises, are shipping costs rising with it, and how is that flowing through to shipping company profits and then to the prices consumers pay? Higher demand for goods drives up shipping costs, which increases profits for shipping companies but also raises the price of goods, and dearer goods can cause consumers to buy less, which starts a cycle." },
      ],
    },
    {
      title: "Productive vs unproductive credit",
      questions: [
        { id: "econ.dalio_credit.1_1", text: "Of the credit currently being extended in this economy or sector, what proportion is financing assets that will themselves generate enough future income to repay the loan, versus assets that produce no income stream and can only be repaid by selling the asset or borrowing again? This is the central test, and it matters because credit financing income-producing capacity allocates resources well and benefits both lender and borrower, while credit financing non-income-producing assets means repayment depends entirely on rising asset prices or fresh borrowing, which is the structural setup for a bust." },
        { id: "econ.dalio_credit.1_2", text: "When you trace the specific use of the borrowed money, is it funding something whose lifetime economic benefit exceeds its full cost even if part of the loan is eventually written down, or is it funding consumption and speculation with no durable return? Ask this because a project can have its debt written down 50% and still be a good use of credit if the asset delivers utility worth more than the loss spread over its life. The structural question is not \"will every loan be repaid\" but \"does the underlying asset create real economic value per dollar of cost.\"" },
        { id: "econ.dalio_credit.1_3", text: "Is total debt growing faster than the income available to service it, meaning borrowing is lifting spending and incomes above the economy's consistent productivity growth rate? This matters because the gap between debt-fueled spending and underlying productivity growth is the mechanism that eventually forces income below the cost of the loans. The structural cause to identify is whether the current level of activity is self-funded by earned income or is being borrowed forward from the future." },
        { id: "econ.dalio_credit.1_4", text: "How tight or loose are current lending standards: do lenders require near-certainty of repayment, or are they extending credit on the assumption that above-trend growth continues indefinitely? Ask this because tight standards produce too little development while loose standards produce development plus future debt problems that erase the benefits, and because policymakers and lenders systematically drift loose late in the cycle when near-term growth seems to justify it. Lending standards are the leading structural cause of whether credit stays productive." },
        { id: "econ.dalio_credit.1_5", text: "What share of the economy's or sector's growth is being driven by debt-financed building of fixed investment, real estate, and infrastructure, as opposed to recurring demand? This matters because the rate of building long-lived assets is not sustainable: when the office building or housing stock is finished, the spending and the jobs attached to it fall toward zero, and growth then depends on other demand. The structural vulnerability is a sector whose apparent productivity is really a one-time construction surge pulling demand forward." },
        { id: "econ.dalio_credit.1_6", text: "Is the debt denominated in a currency that local policymakers control, and do those policymakers have enough influence over how creditors and debtors behave to spread any losses over many years? Ask this because the downside risk of a large debt load depends heavily on whether losses can be socialized and stretched (a 16%-of-GDP loss spread over 15 years is about 1% a year and tolerable, but intolerable if not spread). The structural determinant of severity is currency denomination plus policy control, not the debt level alone." },
      ],
    },
    {
      title: "Credit analysis of the economy",
      questions: [
        { id: "econ.credit_analysis.2_1", text: "(Macro context) Before analyzing any individual credit, what is the broad macro and market backdrop: which financing themes are currently in vogue (for example a business type suddenly favored for leveraged buyouts), and what is the supply-and-demand technical picture of how much uninvested cash sits with portfolio managers versus how many new financings are coming to market? Establish this first so you are reading each credit against the cycle rather than trying to be a global economist and a credit analyst at once, because the same credit metrics mean different things depending on liquidity conditions and issuance volume." },
        { id: "econ.credit_analysis.2_2", text: "(The borrower) What business lines is the entity in, where is it in its life cycle, which industry dynamics (price cutting, acquisition activity) are most influencing it, and what operating trends and ownership or management issues are present? Answer this because the qualitative position of the borrower determines how to interpret the financial metrics that follow, and because life-cycle stage and industry dynamics are structural causes of whether current cash flows are durable or about to turn." },
        { id: "econ.credit_analysis.2_3", text: "(Liquidity, the first component) Does the entity generate enough cash flow from operations to service its debt, and if not, what other sources of liquidity (cash on hand, asset sales, undrawn facilities) exist and how sensitive are these to an operational decline? This is the foundational question of leveraged credit analysis because liquidity failure is the proximate trigger of default, and stress-testing the sensitivity of the key metrics exposes the structural fragility hidden by a benign base case." },
        { id: "econ.credit_analysis.2_4", text: "(Asset value, the second component) If liquidity is insufficient, what is the underlying asset value available to repay the debt through a sale of the company or of selected assets, how long would realizing that value take, and how much equity cushion sits beneath your claim? Ask this because asset value is the second line of repayment when cash flow fails, and the size and sellability of that cushion (a valuable brand or patent can outweigh idle hard assets) is the structural backstop that separates recoverable from impaired credit." },
        { id: "econ.credit_analysis.2_5", text: "(Coverage and leverage ratios) What do the key ratios read and, more importantly, what trend and trajectory do they show: EBITDA/total interest and EBITDA/cash interest for the ability to cover interest, (EBITDA minus capital expenditures)/interest for the more honest coverage after necessary investment, and Debt/EBITDA for asset protection? Compute these knowing a ratio near 1x means cash generation only just covers the obligation, and read them as a moving trend rather than a single static snapshot, because the direction of the ratios is the structural signal while the level is only the starting point." },
        { id: "econ.credit_analysis.2_6", text: "(Structure and ranking) Which entities actually issued the debt and hold the assets, where does your instrument rank (secured, unsecured, subordinated), and do covenants permit materially more debt to be placed senior to your position? This matters because two claims on the same enterprise can have very different recovery, and the structural subordination and covenant package is what determines your real position regardless of how strong the headline credit looks." },
        { id: "econ.credit_analysis.2_7", text: "(Event analysis) What upcoming events could change the credit (refinancing, maintenance covenant violation, sale, acquisition, IPO, dividend, or buyback), and for each, what is its probability, its likely impact on the security, who else would be involved, and the time frame? Lay these out as a decision tree because credit prices move on discrete events, and identifying the structural triggers in advance is what lets you react to breaking news rather than be surprised by it." },
        { id: "econ.credit_analysis.2_8", text: "(Relative value and decision) How do this credit's financial and operating metrics, pricing, and yield compare to relevant comparables and benchmarks, do the potential returns look attractive relative to the risks, and what would trigger a review of the decision (for example a 15% or greater move in the underlying or peer equity, or the passing of a thesis event)? Keep the credit-quality judgment and the relative-value judgment separate, because the central trap is letting a high yield or a low price substitute for the conclusion that the credit can fundamentally survive." },
        { id: "econ.credit_analysis.2_9", text: " Given everything above, which phase of the long-term debt cycle is the whole system in (early cycle, bubble, top, depression, beautiful deleveraging, pushing on a string, or normalization), is the aggregate debt in a currency policymakers control, and can losses be spread? Answer this last because the cycle phase is the structural context that tells you whether identical credit metrics are benign or dangerous, and because currency denomination and policy flexibility determine how a system-wide deleveraging actually resolves." },
      ],
    },
    {
      title: "Sector-wide qualitative analysis",
      questions: [
        { id: "econ.sector_qual.3_1", text: "(Industry structure first) Under the five competitive forces (rivalry, threat of entry, supplier power, buyer power, substitutes), how much profit does this industry's structure actually permit, and where specifically are the forces concentrated? Determine the competitive structure of the industry before looking at any single firm, because the forces set the profit ceiling for the entire sector: high entry barriers with weak buyer and supplier power allow returns above the cost of capital, while low barriers and strong buyer power compete returns away even when demand is growing." },
        { id: "econ.sector_qual.3_2", text: "(Strategy identification) What specific competitive strategy is each major firm employing, is it defensive (positioning to deflect the forces, for example investing in assets to lower cost or building a brand) or offensive (using strengths to reshape the forces, as Walmart used buying power on suppliers), and is that strategy reasonable for this industry? Ask this because the same industry rewards different strategies, and the structural question is whether each firm's chosen posture is matched to the competitive environment it actually faces." },
        { id: "econ.sector_qual.3_3", text: "(Generic strategy and its durability) Is the firm pursuing low-cost leadership or differentiation, and for a differentiator, is the differentiating factor truly unique, is it sustainable, what does it cost, and does the price premium it commands exceed that cost so the firm earns above-average returns? This matters because differentiation only creates value when the premium beats the extra cost of being unique, and the structural cause of durable sector returns is whether the advantage can be defended rather than merely claimed." },
        { id: "econ.sector_qual.3_4", text: "(Life-cycle fit) Does each firm's strategy fit the industry's current life-cycle stage, given that differentiation tends to work during early growth while cost leadership tends to win as the industry matures and firms shift to lowering cost? Evaluate the strategy over time rather than at a single point, because a differentiator in a maturing, cost-driven sector is structurally exposed, and the mismatch between strategy and life-cycle stage is a leading cause of deteriorating returns." },
        { id: "econ.sector_qual.3_5", text: "(Capital allocation discipline) Across the firms in this sector, how does management deploy excess capital, and does the pattern match the sub-optimal average (buying back stock at the highs and stopping at the lows, raising capital expenditure in the mid-to-late expansion right before demand declines, and pursuing acquisitions that return below the cost of capital)? Ask this because organic growth rarely exceeds nominal GDP for long, so capital deployment becomes the dominant driver of long-run shareholder returns, and the structural separator within a sector is the disciplined allocator versus the serial value destroyer that repeats the same process mistakes." },
        { id: "econ.sector_qual.3_6", text: "(Cash-return policy matched to cyclicality) Is each firm's mix of buybacks and dividends matched to the cyclicality of its cash flows: are secularly challenged or heavily cyclical firms avoiding buybacks in favor of special dividends, and is the ordinary dividend set at a level that will not need to be cut in the next downturn? This matters because a payout that looks fine at the top of a cycle becomes a forced cut when volatile cash flow falls, and the structural test is whether the capital-return policy survives a full cycle rather than only the good years." },
        { id: "econ.sector_qual.3_7", text: "(Hurdle rate) Does the firm apply a clear hurdle rate, set by the CEO and exceeding the blended cost of equity and debt, against which every use of cash (organic reinvestment, acquisitions, buybacks, dividends, debt paydown) must compete, and is the projected return high enough to compensate for the uncertainty of the estimates and the cost of raising the capital? Ask this because the hurdle rate is the structural mechanism that forces capital toward its highest-return use, and its presence or absence is what distinguishes value-creating allocation from cash sprayed into empire-building." },
      ],
    },
    {
      title: "Conflicts, trade imbalances, economic geography, Erickson, Global Investing (Parts II, III, Conclusion)",
      questions: [
        { id: "econ.geo_conflict.4_1", text: "(Sovereign quality screen) Does the country in which a business is domiciled clear a strict minimum sovereign credit rating set as a hard investment criterion, and does it carry high levels of sovereign or consumer debt or high or rapidly rising inflation? Use the sovereign rating as the single cleanest proxy for accumulated geopolitical, fiscal, and trade-imbalance risk, because a country's external and fiscal fragility shows up first in its sovereign debt and inflation profile, which is the structural cause of the currency and funding shocks that damage even good companies." },
        { id: "econ.geo_conflict.4_2", text: "(Concentration and conflict exposure) Is any business overly exposed to or reliant on a single region or country whose economy is at risk of war or other geopolitical events, and is the portfolio diversified enough that no one such event is decisive? Ask this because the book's response to conflict risk is portfolio construction rather than forecasting, given that no one predicts these events reliably, so the structural defense is removing single-point dependence rather than trying to time the shock." },
        { id: "econ.geo_conflict.4_3", text: "(Real versus inflationary growth) Of a region's measured economic growth, how much is genuine increase in production and how much is simply rising prices, given that of the roughly $67 trillion rise in world GDP over two decades about $44 trillion was inflation and only about $23 trillion was real growth? Separate these because only real, productivity-driven growth sustainably supports earnings, and confusing price-level growth for real expansion is a structural error that overstates a region's true opportunity." },
        { id: "econ.geo_conflict.4_4", text: "(Where productivity is migrating) Where is productivity and economic transformation actually shifting, and is an innovation or a policy or regulatory change making a particular industry or an entire country more competitive and attractive for foreign investment, or less? Ask this with deliberate skepticism toward distinguishing genuine, durable shifts from fads, because the structural cause of long-run regional outperformance is rising workforce productivity (the China case), and identifying it early is where the generational opportunity sits." },
        { id: "econ.geo_conflict.4_5", text: "(Trade imbalance and supply chains) Does a persistent trade imbalance or a contested supply chain expose this country or sector, for example through dependence on a critical component that policymakers are now pushing to produce domestically? Analyze this because trade imbalances and conflict drive reshoring and supply-chain redrawing that reprice whole sectors, and the structural fragility lies with deficit countries dependent on external funding and businesses reliant on a single contested chokepoint, while the beneficiaries are domestic producers and critical-supply industries." },
        { id: "econ.geo_conflict.4_6", text: "(Cycle position) Where does the country sit in its economic and market cycle (early, mid, late, slowdown, or repair, and bull versus bear), recognizing that stock markets usually peak and trough six to nine months before the economy and that the corporate sector almost always overinvests when times are good and cuts too much when times are bad? Ask this because the cycle position is the structural context that sets whether current valuations and earnings are near a peak about to reverse or a trough about to recover." },
      ],
    },
    {
      title: "Valuation Inputs, Liquidity & Reflexivity",
      questions: [
        { id: "econ.implied_erp", text: "Is the forward (implied) equity risk premium above or below its long-run history, and does that make equities cheap or expensive versus bonds right now?" },
        { id: "econ.terminal_ceiling", text: "What is nominal GDP growth this cycle, and therefore the hard ceiling on any company's perpetual-growth assumption?" },
        { id: "econ.real_rates", text: "Are real (inflation-adjusted) yields positive or negative, and what does that do to long-duration equity valuations?" },
        { id: "econ.cb_liquidity", text: "Is the central bank expanding or draining liquidity (QE/QT, reserves, RRP, TGA), and how close are funding markets to stress?" },
        { id: "econ.fiscal_dominance", text: "Is monetary policy becoming subordinate to financing government deficits (fiscal dominance), and what does that imply for inflation and the currency?" },
        { id: "econ.reflexivity", text: "Where are price trends actively changing the fundamentals they reflect (credit-fuelled asset booms, momentum financing), setting up a self-reinforcing loop that later reverses? (Soros, Alchemy of Finance)" },
        { id: "econ.big_market_macro", text: "Which 'everyone wins' themes (AI, EV, GLP-1) are attracting aggregate capital that cannot collectively earn its cost of capital?" },
        { id: "econ.anchoring_macro", text: "Is the market anchored to a recent index level or narrative such that incremental news is being misframed?" },
      ],
    },
    {
      title: "Supply Chains",
      questions: [
        { id: "econ.supply.supplier-and-business-health", text: "How do the supply chains a company depends on hold up, given that many companies rely on foreign sources for the components used in their products? The point claims that what could affect those supply chains comes down to two things, supplier health and business health: if supplier health declines it creates inflationary pressure (meaning prices rise), and if business health declines it creates deflationary pressure from overproduction (meaning prices fall)." },
        { id: "econ.supply.shortages-consumer-confidence", text: "How might supply chain shortages affect prices and how people feel about spending? The point claims that supply chain shortages have the potential to cause inflationary pressure (rising prices), and as a result consumer confidence (how willing people are to spend) declines until inflation lowers to a point where consumers start purchasing again." },
        { id: "econ.supply.supplier-health-in-quality-industry", text: "How healthy are the suppliers in a high quality industry? The point asks you to assess the financial and operational health of the suppliers that this industry depends on." },
        { id: "econ.supply.inventory-management", text: "How well does the business manage the amount of product it keeps on hand, and what is the trade off involved? The point claims the best businesses generally minimize product kept on hand (measured by the cash conversion cycle, days sales outstanding, days inventory outstanding, and days payables outstanding), that this also matters at the industry level especially for industries whose products rapidly lose value such as technology, that holding little inventory makes a business dependent on the prompt arrival of components, and that excess inventory is highly unproductive while most capital intensive industries carry high inventory within their asset base." },
        { id: "econ.supply.shortages-in-other-industries", text: "How could supply shortages in other industries affect this industry, in the way a shortage of semiconductor chips (the tiny electronic parts inside modern cars) caused car prices to explode and delayed car deliveries? The point asks you to trace how a shortage somewhere else in the supply chain can ripple into this industry's prices and delivery times." },
      ],
    },
    {
      title: "Global Financial Markets",
      questions: [
        { id: "econ.gfm.markets-as-math-model", text: "How can you think of financial markets as a mathematical version of the real world? The idea is that prices, rates, and trading activity are essentially numbers that translate everyday economic life (companies, jobs, spending, fear, and greed) into measurable values you can study and compare." },
        { id: "econ.gfm.capital-to-productive-use", text: "How might markets fail to send money (capital, meaning the funds available to invest) to where it would be used most productively, and how often is the cause investor psychology? In a healthy system money should flow easily toward the best uses, but human emotions like fear and greed often push it toward the wrong places instead." },
        { id: "econ.gfm.trust-in-financial-system", text: "What could damage public trust in a country's financial system and in how business is done, and in what ways could business be carried out incorrectly or inefficiently (consider studying the Great Depression and other past bubbles)? Trust that the system is fair and that companies behave honestly is essential for steady, lasting economic growth, so its breakdown can stall an entire economy." },
      ],
    },
    {
      title: "Credit Spreads",
      questions: [
        { id: "econ.creditspread.spreads-measure-psychology", text: "What does the credit spread (the extra interest a riskier borrower pays over a safe government bond) tell you about investor psychology, and what does it mean when that spread falls? Falling spreads mean investors feel confident enough to lend to riskier companies because they expect to be paid back, and you can track this using the US Corporate Baa-rated Bond Spread (Baa is a middle credit-quality rating)." },
        { id: "econ.creditspread.higher-spreads-higher-cost", text: "How do higher credit spreads raise a company's financing costs and cause it to cancel projects? When spreads are high it becomes more expensive for companies to borrow, so they skip projects that would have been profitable if borrowing had stayed cheaper." },
        { id: "econ.creditspread.falling-from-high-signals-bottom", text: "Why might credit spreads falling from a high point signal that the market has reached a bottom? When spreads start dropping after spiking, it suggests fear is fading and investors are regaining confidence, which often lines up with the low point of a market downturn." },
      ],
    },
    {
      title: "Currency Markets",
      questions: [
        { id: "econ.fxmarket.declining-currency-hurts-equities", text: "How could a rapidly falling currency hurt the stock market (equity markets, meaning the markets where company shares are traded)? When a currency drops quickly it can shake confidence, raise the cost of imports, and pull money out of local stocks, dragging share prices down." },
        { id: "econ.fxmarket.avoid-excessive-debt-inflation", text: "Why should you avoid investing in countries whose external and domestic debt is too large compared with their ability to repay it, while still asking why a particular economy can handle high debt? High debt gives a country an incentive to create inflation (a general rise in prices), which lowers the real value of the debt but also lowers the value of the currency." },
        { id: "econ.fxmarket.diversify-beyond-dollar", text: "Instead of holding only US dollars, what other stores of value could you consider holding? Options include the Swiss Franc (backed by a very low risk government structure), G10 and G6 currency funds (baskets of major world currencies), real assets such as RAXX or a leveraged real asset fund, and gold and other commodities." },
      ],
    },
    {
      title: "Managing Market Cycle Risk",
      questions: [
        { id: "econ.cycle.game-plan-before-panic", text: "Do you have a clear plan ready before the next market panic hits? Having a game plan decided in advance, meaning your buy, sell, and hold rules set before prices crash, is a critical ingredient of investment success." },
        { id: "econ.cycle.sentiment-peak-extreme", text: "When investor sentiment (the overall mood of optimism or fear among investors) feels its most upbeat, what does that signal about prices? Investor sentiment reaches an extreme high at the peak of market valuations, which is when prices are most stretched." },
        { id: "econ.cycle.growth-to-inflation-chain", text: "Can you trace how a growing economy gradually builds inflationary pressure (a broad rise in prices across the economy)? During growth a chain plays out: consumers spend more on goods and services, businesses respond by increasing supply, that leads to more jobs which accelerates wealth creation, eventually there are not enough people to fill job vacancies, so companies must raise wages to attract employees, and all of these factors together create inflationary pressure." },
        { id: "econ.cycle.central-bank-rate-hikes", text: "What do central banks (the institutions that manage a country's money supply and interest rates) do when growth runs too hot? Central banks intervene to slow growth by raising interest rates, which makes borrowing more expensive and cools spending." },
      ],
    },
    {
      title: "Currency Risk",
      questions: [
        { id: "econ.fxrisk.fiat-currency", text: "Why is a currency called a fiat currency? The point claims that a fiat currency (meaning money whose value comes from government decree rather than from a physical commodity such as gold) has value because the government declares it to." },
        { id: "econ.fxrisk.supply-demand", text: "How is the exchange rate between two countries determined? The point claims that the exchange rate (the price of one country's currency expressed in another's) is set by supply and demand for those currencies." },
        { id: "econ.fxrisk.real-interest-rate", text: "What is the most important factor driving currency movements, and why? The point claims it is the real interest rate (meaning the interest rate minus inflation), so the inflation-adjusted return offered by a currency matters more than the headline interest rate alone." },
        { id: "econ.fxrisk.self-correcting", text: "How does the self correcting mechanism in exchange rates push prices back toward normal? The point claims that when a country's currency rises (usually because of low rates) its goods become expensive for foreign buyers, so they import less, demand for the currency drops, and it falls; and when a currency weakens, foreign demand for its exports rises, which increases demand for the currency." },
        { id: "econ.fxrisk.measure-real-rates", text: "How do you measure real interest rates against currency value, and which countries are safer to analyze? The point claims you should compare real interest rates against currency value across countries, and that it is safer to study developed, high GDP countries (those with a large gross domestic product, the total value of goods and services a country produces)." },
        { id: "econ.fxrisk.trade-commodity-index", text: "How do you measure the trade index against currency value and against real commodity price indices? The point claims you should also track a country's trade index (a measure of its trade activity) against its currency value, and against real commodity price indices (commodity prices adjusted for inflation)." },
        { id: "econ.fxrisk.safe-haven-currencies", text: "How do safe haven currencies behave when global equity markets fall, and what happens to commodities after looser policy? The point claims that safe haven currencies (currencies investors flee to in turbulent times, namely the G7 currencies, the Yen, the US dollar, and the Franc) tend to strengthen as global stock markets fall and act as a shock absorber, and that once looser policy (lower real interest rates) is implemented and credit is infused into the economy, commodities like gold and silver appreciate in price." },
        { id: "econ.fxrisk.commodity-exporters", text: "Why are higher commodity prices positive for commodity exporters such as Australia, Canada, and even China? The point claims that rising commodity prices benefit the currencies and economies of countries that export commodities, including Australia, Canada, and even China." },
        { id: "econ.fxrisk.usd-emerging-markets", text: "Why is a stronger US dollar harmful for emerging market economies while a weaker US dollar supports them, and what are risk assets? The point claims that because most emerging market debt is denominated in US dollars, a rising USD makes that debt more expensive to service, and it defines risk assets (such as equity markets, commodity-linked currencies, and emerging markets) as assets that do well when investors accept more risk, while bonds and safe haven currencies appreciate when investors want to avoid risk." },
        { id: "econ.fxrisk.cash-diversification", text: "Why should you avoid holding all of your remaining cash in a single currency, and what are the alternatives? The point claims you should not keep all your cash in one currency, and instead invest it in safe bonds, or in a diversified currency portfolio (cash spread across several currencies) if rates are favorable." },
        { id: "econ.fxrisk.multi-year-returns", text: "Looking at a table of multi-year currency returns, why and how did some currencies deliver greater returns than the US dollar in certain years? The point asks you to explain what made certain currencies outperform the USD across particular years in the data." },
      ],
    },
    {
      title: "Currency Debasement & Crashes",
      questions: [
        { id: "econ.debasement.deliberate-devaluation", text: "How can you figure out why, how, and when a country might deliberately devalue or prop up its currency? Countries can make their currency appreciate or depreciate against foreign currencies, and those wanting to help their exporters often weaken their currency because a weaker currency makes their goods cheaper for foreign buyers." },
        { id: "econ.debasement.productivity-inflation-crisis", text: "Are you watching for declining productivity (output produced per worker or per hour) and rampant inflation (broad, fast rising prices)? Over the long term these can cause a currency crisis, and holding a basket (a mix) of different currencies and commodities helps you resist such problems." },
        { id: "econ.debasement.currency-peg", text: "Has the country pegged its currency to a major currency such as the US dollar? Countries do this to create exchange rate stability, and a peg means fixing the currency's value to another currency so the two trade at a set rate." },
        { id: "econ.debasement.bank-crisis-causes", text: "Do you understand what really fuels a bank crisis? Bank crises are preceded by rising prices of assets like homes and equities (shares of companies), but they are actually fueled by unhealthy lending standards that come from overly optimistic investor sentiment, which is itself powered by high liquidity (lots of money and credit easily available in the system)." },
        { id: "econ.debasement.liquidity-precedes-debt-crisis", text: "Are you tracking liquidity as an early warning? Declining liquidity, meaning money and credit becoming harder to get, tends to come before debt crises." },
        { id: "econ.debasement.credit-contraction-loop", text: "Do you see how falling liquidity can trigger a credit contraction feedback loop? Declining liquidity also reduces the value of homes, and because the loan-to-value ratio (the size of the loan compared with the value of the asset backing it) rises, the chance of delinquency (borrowers failing to make payments) increases, which feeds further contraction." },
        { id: "econ.debasement.inflation-refinance-crash", text: "Are inflation and an inability to refinance debt present? Inflation and the inability to refinance debt (replace maturing debt with new borrowing) have preceded currency crashes, especially in countries that suffered frequent bouts of inflation in the past." },
        { id: "econ.debasement.inflate-away-debt", text: "Does the country have high external debt (money owed to foreign lenders) and sometimes high domestic debt (money owed inside the country)? Such countries have a history of deliberately stimulating inflation to inflate away their debt burden, meaning rising prices make the fixed amount they owe worth less in real terms." },
        { id: "econ.debasement.four-debt-options", text: "When a country cannot repay its debt, which of the four options is it using: reduce spending and increase taxes, renegotiate the terms of the debt, default (stop paying), or devalue the debt through inflation? These four are also the main levers used to manage debt problems." },
        { id: "econ.debasement.impending-crisis-signs", text: "Which signs of an impending debt crisis can you check for: are prices high relative to traditional measures, are prices already pricing in future rapid price appreciation, are purchases being financed by high leverage (lots of borrowed money), are buyers or companies making forward purchases (buying now to lock in future supply), would tightening (raising interest rates or reducing credit) risk popping the bubble, have new participants entered the market, is there broad bullish (optimistic) sentiment, are there new era mindsets (beliefs that old rules no longer apply), is there emphasis on business success based on price appreciation and the visibility of winners, is there a myth of permanent prosperity, is there overconfidence in investor sentiment, is there fear of missing out, and are valuations based on something other than fundamentals (real earnings, cash flow, and assets)?" },
        { id: "econ.debasement.bubble-top-forces", text: "Which forces seen near the top of bubbles and market cycles can you spot: a large number of IPOs (initial public offerings, companies first selling shares to the public), rapidly rising prices, high merger and acquisition activity (companies buying or combining with each other), easy availability of credit, optimistic covers of newspapers and magazines, higher than average trading volumes, historically high valuation multiples (price compared with earnings or other fundamentals), booming art and luxury markets, soaring financial media viewership, declarations that this time is different, amateur investors moving into the equities (stocks) asset class, spiking speculative asset prices, and record venture capital funding (money invested in young, unproven companies)?" },
        { id: "econ.debasement.bubble-pop-forces", text: "What are the main forces that cause a bubble to pop? Rising real rates (interest rates after subtracting inflation) and falling real liquidity, smaller initial market declines that change investor mentality, and high initial volatility (sharp up and down or flat moves in the market)." },
        { id: "econ.debasement.market-bottom-conditions", text: "Which conditions commonly seen near market cycle bottoms can you identify: no mergers and acquisitions, no IPOs, low venture capital funding, historically low price-to-earnings and EV/EBITDA multiples (low valuations relative to earnings and to operating profit before interest, taxes, depreciation, and amortization), many companies trading below book value (priced under their accounting net worth), speculative asset prices down hugely, central banks easing (cutting rates or adding money) for six or more months with rising liquidity, a recession officially declared, previously favorite sectors now hated, credit available only to high quality borrowers, amateur investors filled with caution, negative covers of newspapers and magazines, and negative, depressed consumer sentiment?" },
        { id: "econ.debasement.policy-debasement-response", text: "Are you taking seriously any government policies that appear to promote price inflation and currency debasement (the loss of a currency's value)? If you are very skeptical about where the situation is headed, you should sell the shares of companies in that country." },
      ],
    },
    {
      title: "Geopolitical Risks",
      questions: [
        { id: "econ.geopol.diplomacy", text: "How is diplomacy being used here? Diplomacy means convincing foreign citizens that your policies are the most desirable path for them to follow, and it includes using propaganda (information spread to promote a particular political cause). When relations break down, withdrawing embassy and consular staff (the officials a country keeps in another country) is one of the first actions taken." },
        { id: "econ.geopol.economic-incentives", text: "Are economic incentives being used to entice an opposing country toward a desired settlement, given that wealthier countries are better positioned to use them when diplomacy alone does not work? A country can offer trade concessions (easier trading terms) and economic aid, for example reducing or increasing trade tariffs (taxes on imported goods), helping a foreign country develop infrastructure, supplying goods and loans, and forgiving loans." },
        { id: "econ.geopol.trade-wars-sanctions", text: "Are trade wars or sanctions in play now that economic incentives have proven ineffective? Tit-for-tat tariffs (taxes on imports each side raises in retaliation) make the target country's exports more expensive for domestic buyers, reducing demand and hurting that country economically, and they usually hurt both economies, especially when the two indirectly rely on each other; economic sanctions (official penalties one country places on another) include freezing the assets of politically influential individuals, blocking the import of certain goods, and preventing the export of certain goods such as oil." },
        { id: "econ.geopol.military-coercion", text: "Is military coercion (threatening to use military force to make weaker countries concede) involved, and how would it affect your holdings? The world's top military powers have large economies because wealth is needed to supply and support a military; large cap stocks (shares of the biggest companies) tend to perform better in wartime, but inflation (the general rise in prices) rises during wartime which makes bonds less profitable, initial reactions to a war drive the stock market down and the market tends to recover quickly once investors understand the war's scope and magnitude, and war mainly affects the economies where the war is actually located." },
      ],
    },
    {
      title: "Managing Geopolitical Risk",
      questions: [
        { id: "econ.geopolmgmt.escalation-recognition", text: "Can you recognize when a disagreement between two or more countries is likely to escalate to the point where economic or military coercion (pressure applied through trade penalties or the threat of force) is used? Spotting escalation early helps you act before the risk is priced in." },
        { id: "econ.geopolmgmt.minimum-credit-rating", text: "Have you set a minimum credit rating for each country you plan to invest in as an investment constraint (a rule you set for yourself before investing)? A sovereign credit rating, meaning a grade for how safely a country can repay its debts, reflects how safe it is to invest in that country." },
        { id: "econ.geopolmgmt.watching-statements", text: "Are you watching for political statements from countries whose actions could affect the businesses you have invested in? Use social media posts and a diversified set of news outlets (a mix of different news sources) so you do not rely on a single viewpoint." },
        { id: "econ.geopolmgmt.conflict-likelihood", text: "When analyzing propaganda, political statements, and disputes between countries, is a military conflict likely, and are you avoiding investment in those countries until investors understand the consequences? This matters especially when a confrontation is likely to inflict considerable damage on a country's economy, while recognizing that most modern conflicts do not massively damage economies." },
      ],
    },
    // Bubble / recession / fraud / debt-crisis framework, points 1-10 and
    // 19-32 (owner framework, RAG-verified 2026-09-22). Sources, code comment
    // only: Kindleberger & Aliber, Manias, Panics and Crashes Ch.1-11; Dalio,
    // Big Debt Crises Parts 1 and 3 (bubble gauge, deflationary vs inflationary
    // depressions); Shiller, Irrational Exuberance; Marks, Mastering the Market
    // Cycle; Sornette, Why Stock Markets Crash Ch.6; Soros, The Alchemy of
    // Finance; Calverley; Handbook of Macroeconomics Vol.2 Ch.7, 16, 17, 21, 32,
    // 33; Geithner, Stress Test Ch.4; Schwed; Porter Ch.15; Giroux Ch.5.
    {
      title: "Bubble Forces: Price, Story and Money",
      questions: [
        { id: "econ.bubble.valuation_history", text: "How far do today's valuations (Shiller CAPE, market value to GDP, sector price to earnings and price to sales) sit above their own long-run history?" },
        { id: "econ.bubble.valuation_reason", text: "Has anything permanent changed, such as lower interest rates or structurally higher profit margins, that justifies paying more than in the past, and how much of the premium does it explain?" },
        { id: "econ.bubble.concentration", text: "Does the market's overall valuation depend on a handful of very large companies?" },
        { id: "econ.bubble.narrative_attention", text: "Is attention to the theme in media, earnings calls and filings rising faster than the revenue the theme actually produces?" },
        { id: "econ.bubble.renaming", text: "Are companies renaming themselves or rewriting their strategy to attach to the theme, and are their share prices jumping when they do?" },
        { id: "econ.bubble.cycle_stage", text: "Where does the market sit in the familiar sequence of a boom: early recognition, growing belief, conviction that ignores setbacks, or excessive expectations?" },
        { id: "econ.bubble.borrowed_buying", text: "How much stock buying is being done with borrowed money, such as margin loans and leveraged funds, compared with past peaks?" },
        { id: "econ.bubble.new_buyers", text: "Are new and inexperienced buyers a growing share of trading, including short-term options bets?" },
        { id: "econ.bubble.optimism", text: "Is investor optimism at an extreme compared with its own history?" },
        { id: "econ.bubble.cheap_money", text: "After inflation, how cheap is money today compared with history, and how easy are overall financial conditions?" },
        { id: "econ.bubble.easy_policy", text: "Is the central bank still easing or holding rates low while asset prices are already high?" },
      ],
    },
    {
      title: "Bubble Forces: Earnings, Funding and Revenue",
      questions: [
        { id: "econ.bubble.profits_vs_national", text: "Are the profits companies report to shareholders rising faster than corporate profits measured in the national accounts?" },
        { id: "econ.bubble.adjusted_gap", text: "Is the gap between \"adjusted\" and standard accounting earnings wider than in past cycles, and are more companies relying on adjusted figures?" },
        { id: "econ.bubble.peak_margins", text: "Are today's profit margins at a cyclical peak that overstates what companies will earn in a normal year?" },
        { id: "econ.bubble.inventory_build", text: "Are inventories building faster than sales, and are customers ordering from several suppliers at once because of shortages?" },
        { id: "econ.bubble.orders_vs_demand", text: "Do supplier orders match what end customers are actually buying, or are orders running ahead of final demand?" },
        { id: "econ.bubble.young_issuers", text: "Are young, loss-making companies selling new stock to the public at a pace seen only near past market peaks?" },
        { id: "econ.bubble.stock_deals", text: "Are more acquisitions being paid for with expensive stock instead of cash?" },
        { id: "econ.bubble.outside_funding", text: "Is the sector spending more on investment than it generates in operating cash, and who is funding the difference?" },
        { id: "econ.bubble.loss_makers", text: "Is the share of money-losing companies rising even while their share prices rise?" },
        { id: "econ.bubble.deal_premiums", text: "Are acquisition premiums and deal volumes near record levels, and how much of that premium could be written off if the boom fades?" },
        { id: "econ.bubble.circular_money", text: "Does money flow in a circle, with suppliers lending to or investing in the same customers who then buy from them?" },
        { id: "econ.bubble.few_buyers", text: "How much of the sector's revenue depends on a few large buyers who are themselves funded by the same boom?" },
        { id: "econ.bubble.synthesis", text: "Which marks of past bubbles does today's market show, which are missing, and which past boom does it most resemble?" },
      ],
    },
    {
      title: "Debt Crisis Forces",
      questions: [
        { id: "econ.debtcrisis.debt_growth", text: "Has total debt risen much faster than national income over the last three years, and in which sector is it rising fastest?" },
        { id: "econ.debtcrisis.concentration", text: "Is the new debt spread across the whole economy, or concentrated in a few borrowers the financial system depends on?" },
        { id: "econ.debtcrisis.credit_trend", text: "How far above its long-term trend has lending grown relative to the size of the economy?" },
        { id: "econ.debtcrisis.credit_and_prices", text: "Are credit and asset prices, such as house and stock prices, both rising unusually fast at the same time?" },
        { id: "econ.debtcrisis.service_share", text: "Is a rising share of household and business income going to interest and principal payments?" },
        { id: "econ.debtcrisis.borrow_to_pay", text: "Are borrowers taking on new debt just to keep up with payments on existing debt?" },
        { id: "econ.debtcrisis.standards", text: "Are banks loosening or tightening their lending standards, and how fast is that changing?" },
        { id: "econ.debtcrisis.weak_borrowers", text: "Is a growing share of new lending going to the weakest borrowers?" },
        { id: "econ.debtcrisis.bank_run_risk", text: "Could losses on banks' bond holdings, combined with large uninsured deposits, trigger a run on any major bank?" },
        { id: "econ.debtcrisis.nonbank_funding", text: "Are hedge funds and other non-banks using short-term borrowing to hold long-term or hard-to-sell assets?" },
        { id: "econ.debtcrisis.tightening_pace", text: "Is the central bank tightening faster than at any point in the current cycle?" },
        { id: "econ.debtcrisis.yield_curve", text: "Is the yield curve inverted, returning to normal after an inversion, or normal, and what has that stage meant in past cycles?" },
        { id: "econ.debtcrisis.foreign_money", text: "Does the country rely on short-term foreign money that could leave quickly, and do its reserves cover the foreign debt due within a year?" },
        { id: "econ.debtcrisis.foreign_currency_debt", text: "How much of the country's debt is owed in a currency it cannot print?" },
        { id: "econ.debtcrisis.crisis_type", text: "Is most of the problem debt owed at home in the country's own currency, pointing to defaults and falling prices, or owed abroad in foreign currency, pointing to a currency collapse and inflation?" },
        { id: "econ.debtcrisis.cushion_room", text: "How much room do the central bank and the government have to cushion a bust by cutting rates, printing money or borrowing?" },
        { id: "econ.debtcrisis.synthesis", text: "How close is the economy to a debt crisis, which sector would it start in, and would it be deflationary or inflationary?" },
      ],
    },
    {
      title: "Housing, Recession, Fraud and Contagion",
      questions: [
        { id: "econ.fragility.house_prices", text: "Are house prices far above what incomes and rents can support?" },
        { id: "econ.fragility.mortgage_risk", text: "Has mortgage and property lending shifted toward riskier loans, such as adjustable-rate or interest-only mortgages, or toward heavy commercial property exposure at smaller banks?" },
        { id: "econ.fragility.overbuilding", text: "Is new building running ahead of the number of new households?" },
        { id: "econ.fragility.job_market", text: "Are jobless claims and temporary-job cuts rising in a way that has preceded past recessions?" },
        { id: "econ.fragility.orders_margins", text: "Are new orders and corporate profit margins turning down?" },
        { id: "econ.fragility.sovereign_path", text: "Is the interest rate on government debt higher than the economy's growth rate, so that debt keeps rising faster than income even without new spending?" },
        { id: "econ.fragility.sovereign_buyers", text: "How much government debt must be refinanced soon, and how much is held by foreign investors who could stop buying?" },
        { id: "econ.fragility.doom_loop", text: "Could a fall in government bond prices damage the banks that hold those bonds, and could a banking rescue damage the government?" },
        { id: "econ.fragility.unregulated_money", text: "Is money pouring into new products or markets that regulators do not yet cover, and are first-time investors driving it?" },
        { id: "econ.fragility.ignored_warnings", text: "Are restatements, auditor resignations and short-seller reports rising, and are critics being attacked instead of answered?" },
        { id: "econ.fragility.steady_returns", text: "Is any fund, product or company promising steady returns regardless of market conditions?" },
        { id: "econ.fragility.shared_bets", text: "Do many investors and lenders hold the same bets, so that a loss in one place would force widespread selling?" },
        { id: "econ.fragility.foreign_links", text: "Which foreign borrower, bank or market failure would hurt the domestic financial system most?" },
        { id: "econ.fragility.central_bank_room", text: "How much room does the central bank have to cut rates and lend freely in a crisis?" },
        { id: "econ.fragility.government_room", text: "Does the government have the money, the legal authority and the political support to act quickly in a crisis?" },
        { id: "econ.fragility.synthesis", text: "Where would the damage start, how would it spread, and how well could the authorities contain it?" },
      ],
    },
    {
      title: "Market Judgment: The Story Against the Data",
      questions: [
        { id: "econ.judgment.story", text: "What story is the market telling itself about the future, and how strongly does it believe it?" },
        { id: "econ.judgment.data", text: "What do valuations, earnings, credit, debt and the real economy actually show?" },
        { id: "econ.judgment.gap", text: "Where do the story and the data disagree most: stocks, corporate credit, housing, one sector, the government or the whole system?" },
        { id: "econ.judgment.trigger", text: "What event would most likely close that gap, and has it already started?" },
        { id: "econ.judgment.episode", text: "Is this a contained stock bubble, a credit-driven crisis, both at once, a currency crisis or a government debt crisis?" },
        { id: "econ.judgment.fragile_or_breaking", text: "Are conditions fragile but stable, or have triggers such as tightening policy, widening spreads or rising jobless claims already begun?" },
        { id: "econ.judgment.precedent", text: "Which past episode does today most resemble, and what one difference could make this time better or worse?" },
      ],
    },
  ],

  credit: [
    {
      title: "The Credit Cycle & Condition",
      questions: [
        { id: "credit.cycle_stage", text: "Where in the credit cycle are we: early expansion (standards easing, spreads narrowing), late boom (record loan growth, thin spreads, lax underwriting), turn (standards tightening, spreads widening), or crunch (credit contracting, defaults rising)? Easy credit late in a boom funds the very assets that later default." },
        { id: "credit.underwriting_quality", text: "Is loan growth being driven by healthy demand and sound underwriting, or by loosening credit standards? A record or fast-rising loan level is not proof of trouble by itself; the quality and the rate of change matter more than the level. Stay skeptical without assuming the worst." },
        { id: "credit.standards_direction", text: "What is the Senior Loan Officer survey saying about the direction of lending standards, and does that lead the loan-growth and delinquency data by the several quarters the credit cycle implies?" },
        { id: "credit.condition_for_obligors", text: "Given the macro 'Condition' (the third of the five C's), how does the current credit environment expand or constrain the debt capacity of the average corporate obligor you might analyze?" },
      ],
    },
    {
      title: "Spreads, Default Risk & Confidence",
      questions: [
        { id: "credit.spread_signal", text: "What are high-yield and investment-grade spreads pricing in: complacency (very tight), normal compensation, or fear (blowing out)? The spread is the market's real-time risk rating; where is it in its historical range?" },
        { id: "credit.spread_migration", text: "Is stress confined to high-yield, or is it migrating up the quality ladder toward investment grade and the BBB-/Baa3 borderline that marks the investment-grade cutoff?" },
        { id: "credit.spread_vs_realised", text: "Do market-priced risk (spreads) and realised deterioration (delinquencies, charge-offs) agree, or is one leading the other, and which do you trust more right now?" },
        { id: "credit.confidence_liquidity", text: "Is there any sign of the confidence/liquidity channel that is the dominant bank risk (deposit outflows, funding-market stress, a rising financial-stress index) that could turn a solvency worry into a run?" },
      ],
    },
    {
      title: "Banking-System Health & Concentration",
      questions: [
        { id: "credit.asset_quality", text: "Are delinquencies and net charge-offs still low, or beginning to rise even while loan totals keep growing? Rising losses beneath a still-growing book is an early warning that the cycle is about to turn down." },
        { id: "credit.capital_adequacy", text: "Is bank capital (equity-to-assets, Tier-1) adequate for the risk in the book? Reserves cover expected loss; capital covers unexpected loss (the Basel distinction); is the cushion sized for a downturn?" },
        { id: "credit.concentration", text: "Where is concentration building: a single sector (CRE, as in the 1990s failures), geography, or borrower type? Concentration is 'perhaps the single most significant issue in credit-risk management.'" },
        { id: "credit.margin_and_funding", text: "Is the net interest margin healthy enough to absorb loan losses and fund the equity return, and is the deposit funding base stable rather than flighty?" },
        { id: "credit.shadow_and_nonbank", text: "Is credit migrating from banks to non-bank lenders (private credit, securitization/'originate-and-distribute'), so the bank data understates true system leverage, the shadow-banking blind spot behind 2008?" },
      ],
    },
    // Framework points 11-18 (corporate credit forces). Sources, code comment
    // only: Marks, Mastering the Market Cycle Ch.10, 12; Kricheff, A
    // Pragmatist's Guide to Leveraged Finance Ch.3, 8, 13, 14, 16, 17; Ilmanen,
    // Expected Returns Ch.10; Wilson Ch.18; Hull Ch.8; Hepp, Private Capital
    // Ch.10; Kindleberger & Aliber Ch.2-4 (Minsky hedge/speculative/Ponzi).
    {
      title: "Corporate Credit Forces",
      questions: [
        { id: "credit.forces.typical_coverage", text: "Can the typical company, not just the largest ones, comfortably cover its interest from profits?" },
        { id: "credit.forces.addbacks", text: "Are the debt ratios reported on new loans flattered by earnings adjustments for savings that have not happened yet?" },
        { id: "credit.forces.maturity_wall", text: "In which years does the most corporate debt come due, and was that debt borrowed at much lower interest rates than today's?" },
        { id: "credit.forces.refi_window", text: "Are weaker companies still able to refinance, or is the market for new risky debt starting to close?" },
        { id: "credit.forces.floating_share", text: "How much corporate and household debt resets automatically when interest rates rise?" },
        { id: "credit.forces.rate_passthrough", text: "How much of past rate increases has still to reach borrowers as their older, cheaper fixed-rate debt matures?" },
        { id: "credit.forces.cash_cushions", text: "Do the typical company and the typical lower-income household have thinner cash cushions than at the start of past downturns?" },
        { id: "credit.forces.bank_liquidity", text: "Are banks holding enough cash and easy-to-sell assets to survive a month of heavy withdrawals?" },
        { id: "credit.forces.nonbank_growth", text: "How fast is lending by private credit funds and other non-banks growing compared with bank lending, and who is watching it?" },
        { id: "credit.forces.hidden_borrowing", text: "Which forms of borrowing, such as supply-chain finance, buy-now-pay-later loans or derivatives like total return swaps, are growing without showing up in official debt figures?" },
        { id: "credit.forces.weaker_terms", text: "Are lenders giving up regular financial tests, accepting interest paid in more debt, or taking lower-ranking claims in order to win deals?" },
        { id: "credit.forces.rewriting_terms", text: "Are borrowers increasingly asking lenders to waive or rewrite loan terms, or shifting assets away from some lenders to others?" },
        { id: "credit.forces.spread_level", text: "Are credit spreads unusually tight given the risks building up, or have they started to widen quickly?" },
        { id: "credit.forces.defaults_downgrades", text: "Are defaults, downgrades and the share of the weakest-rated new debt starting to rise?" },
        { id: "credit.forces.zombies", text: "Is the share of long-established companies that have failed to cover their interest for years growing?" },
        { id: "credit.forces.refi_share", text: "Is a rising share of new corporate borrowing being used just to pay off old debt while the economy is still growing?" },
        { id: "credit.forces.synthesis", text: "Where does the corporate credit cycle stand today: cautious lending, careless lending, or the start of defaults?" },
      ],
    },
  ],

  sector: [
    {
      title: SECTOR_DEFINE_TITLE,
      questions: [
        { id: "sec.define.sells", text: "What does this sector actually sell, and who are the end buyers? Describe the products in plain words, as if you ran one of these companies." },
        { id: "sec.define.players", text: "Name the main players and roughly rank them by size. What separates the leaders from the rest of the pack?" },
        { id: "sec.define.growth_driver", text: "What drives revenue growth here: volume, price, mix, or something structural? What specifically is driving growth right now?" },
        { id: "sec.define.value_chain", text: "Follow one dollar of customer spending through the value chain. Which layer keeps the most profit, and why is it able to?" },
        { id: "sec.define.models", text: "What are the dominant business models in this sector, and how does each one make its money?" },
        { id: "sec.define.killers", text: "What kills companies in this sector: leverage, technology shifts, regulation, commodity swings, or competition? Name a real casualty if you can." },
        { id: "sec.define.insider", text: "Write the full account an insider who works in this sector would give of its current state: what is selling, who is winning and losing, what the mood is on pricing and capacity, and what everyone in the sector is worried about. No length limit; summarize everything you established in the questions above into the best complete picture you can." },
      ],
    },
    {
      title: "Capital Flows",
      questions: [
        { id: "sec.capital_flow", text: "Where is capital flowing into / out of this sector right now, and why?" },
        { id: "sec.share_of_sp500", text: "What share of the S&P 500 (or relevant benchmark) does the sector represent, and is that share rising or falling?" },
        { id: "sec.fund_positioning", text: "How are large institutional funds positioned in this sector, overweight, underweight, or neutral?" },
      ],
    },
    {
      title: "Macro Sensitivity",
      questions: [
        { id: "sec.rate_sensitivity", text: "How sensitive is the sector to interest rates? Which direction helps it?" },
        { id: "sec.cycle_position", text: "Where is the sector in the business cycle (early, mid, late, recession)?" },
        { id: "sec.commodity_dependence", text: "Which commodities or input costs materially move the sector's earnings?" },
        { id: "sec.fx_exposure", text: "How exposed is the sector to FX moves and international demand?" },
      ],
    },
    {
      title: "Structural Position",
      questions: [
        { id: "sec.secular_tailwinds", text: "What are the secular tailwinds (demographics, technology, regulation) supporting the sector long-term?" },
        { id: "sec.secular_headwinds", text: "What secular headwinds are working against it?" },
        { id: "sec.regulation_risk", text: "How exposed is the sector to regulatory change? Which agencies matter?" },
        { id: "sec.disruption_risk", text: "What technologies or business models could disrupt incumbents?" },
      ],
    },
    {
      title: "Profitability & Quality",
      questions: [
        { id: "sec.aggregate_roic", text: "Does the sector earn its cost of capital in aggregate? Which industries inside the sector drag the average?" },
        { id: "sec.margin_trend", text: "Are aggregate margins expanding, compressing, or holding flat, and what's driving the trend?" },
        { id: "sec.dispersion", text: "How wide is the dispersion between best and worst performers within the sector?" },
      ],
    },
    {
      title: "Sentiment & Positioning",
      questions: [
        { id: "sec.sentiment", text: "How does sell-side and retail sentiment toward the sector compare to the fundamentals?" },
        { id: "sec.short_interest", text: "What does short interest look like across the sector?" },
        { id: "sec.contrarian", text: "Is there a contrarian opportunity here, sector hated, but fundamentals improving?" },
      ],
    },
    {
      title: "Capital Cycle & Value Chain",
      questions: [
        { id: "sec.capital_cycle", text: "Is sector capacity and capex growing faster than demand? Rising investment predicts falling future returns, and falling investment predicts rising returns. (Chancellor, Capital Returns)" },
        { id: "sec.profit_pool", text: "Across the chain (suppliers, producers, distributors, retail), who captures the economic profit, and is that capture shifting? (Gadiesh & Gilbert, profit pools)" },
        { id: "sec.pricing_power", text: "Is real pricing power rising or falling (price versus input costs), independent of volume?" },
        { id: "sec.cost_curve", text: "Where do the sector's players sit on the global cost curve, and who is the marginal producer setting the price?" },
        { id: "sec.concentration_trend", text: "Is the sector consolidating toward oligopoly or fragmenting, and is concentration rising?" },
        { id: "sec.channel_inventory", text: "Is there excess inventory in the channel that will depress near-term demand (the bullwhip effect)?" },
      ],
    },
  ],

  industry: [
    {
      title: INDUSTRY_DEFINE_TITLE,
      questions: [
        { id: "ind.define.what", text: "What does this industry do all day? Describe the product or service, the customer, and how the buying decision gets made, as if you worked here." },
        { id: "ind.define.players", text: "Who are the main players, and what strategic groups do they form (premium versus low-cost, integrated versus specialist)? Check your answer against the strategic groups map below." },
        { id: "ind.define.unit_econ", text: "What are the unit economics of one typical sale: price, cost to serve, contribution margin? What scales with volume and what does not?" },
        { id: "ind.define.kpis", text: "Which KPIs do insiders actually watch (utilization, backlog, same-store sales, ARPU, loss ratios), and where do those stand today?" },
        { id: "ind.define.growth", text: "What is driving industry growth right now, and is it volume, price, or share shifting between players?" },
        { id: "ind.define.lifecycle", text: "Where is the industry in its life cycle, and what evidence in the numbers backs that up? Compare with the life-cycle panel below." },
        { id: "ind.define.refuse", text: "What would make you refuse to invest in this industry at any price?" },
        { id: "ind.define.researcher", text: "Write the full account a researcher who specializes in this industry would give of its current state: how the industry works end to end, who the players are and how they are positioned, what is driving or dragging growth, and where the industry is heading. No length limit; summarize everything from the questions above into the best complete picture you can." },
      ],
    },
    // Sits under the strategic-group map. Drawn from how Porter actually
    // interrogates a map in Competitive Strategy Ch.7 and Ch.2: the axes are a
    // hypothesis, mobility barriers are the engine, empty space is not automatically
    // an opportunity, and a profit gap between groups means something different from
    // a profit gap inside one. Each question is multi-part on purpose. A question you
    // can close with yes or no teaches nothing.
    {
      title: "Strategic Groups",
      questions: [
        {
          id: "ind.sg_axes",
          text: "The map splits this industry on operating margin and company size, because those two are available for every listed company. Are they the right two here? The test is whether the axes reflect the barriers that actually stop a company moving between positions. In soft drinks those barriers are brand and distribution. In banking they are regulatory capital and the deposit franchise. Name the two dimensions you think this industry really competes on, say whether margin and size are standing in for them or missing them, and describe what the map would look like if you could redraw it on the dimensions you named.",
        },
        {
          id: "ind.sg_barriers",
          text: "Pick the most profitable group on the map and answer the only question that matters about it: what exactly stops a company in a weaker group from moving into it? Be specific rather than saying the barriers are high. State what it would cost, how many years it would take, and whether the companies already inside could retaliate faster than a newcomer could earn back the cost of the move. Then say whether the barrier is built from assets, which can be bought, or from capability, which can only be accumulated. The second kind lasts.",
        },
        {
          id: "ind.sg_between_vs_within",
          text: "Compare the profit gap BETWEEN groups with the profit gaps INSIDE a single group. They mean different things. A gap between groups that persists for years is structural, and it tells you the barriers are real. A gap between two companies in the SAME group is usually scale, entry timing, or simply better management. Work out which one you are looking at here, and explain why it matters: a structural advantage survives, and an execution advantage can be copied or lost when the person responsible leaves.",
        },
        {
          id: "ind.sg_empty_space",
          text: "Find an empty region of the map, a combination of margin and scale that no company in this industry occupies. Now resist the obvious conclusion. Empty space is a hypothesis, not an opportunity. Ask three things. Has anyone tried this position and failed, which would make it a graveyard rather than a gap? Is the combination internally contradictory, for example demanding the lowest cost base and the highest service level at once? Or is it empty only because the technology or the customer that would make it viable does not exist yet, which would make it a leading indicator rather than a dead end?",
        },
        {
          id: "ind.sg_rivalry",
          text: "Which groups on this map are actually fighting each other, and which are simply coexisting? The test is not how close they sit on the chart, it is whether they sell to the same customer. Two groups aimed at different buyers can look adjacent and barely compete. Two groups aimed at the same buyer while competing in very different ways are the most dangerous pairing there is, because each side misreads the other's moves and the response escalates. Identify where the real fight is in this industry, and say which company is standing closest to it.",
        },
        {
          id: "ind.sg_movement",
          text: "A snapshot cannot show drift, so reconstruct it. Where were these companies five years ago, and which direction are they moving? A company slowly raising its service level, broadening distribution and investing in brand is climbing toward a better protected group and will usually pay for that with a temporary dip in profitability. A company cutting service and competing harder on price is sliding the other way. Name a company here that is moving, say which group it is moving toward, and judge whether it can actually reach the destination or is simply leaving the position it had.",
        },
        {
          id: "ind.sg_stuck",
          text: "Look for a company with no coherent position: moderate margin, moderate scale, moderate everything, sitting in the middle of the map rather than at an edge. The diagnosis is blunt, that a company failing to commit to either cost leadership or genuine differentiation is stuck in the middle and close to guaranteed poor returns, because it cannot take the price-driven customer from the cost leader and cannot take the premium customer from the differentiator. Ask the deciding question: is there any customer this company serves better than anyone else? If the honest answer is that it serves everyone adequately, you have found the trap.",
        },
        {
          id: "ind.sg_convergence",
          text: "Are the groups in this industry pulling apart or collapsing into each other? Convergence is the dangerous case. When formerly distinct groups start chasing the same customer with increasingly similar strategies, rivalry intensifies and margins compress across the whole industry. It showed up in the airlines years before it showed up in the earnings, as low-cost carriers added networks and full-service carriers stripped out everything they could. Decide which way this industry is heading, name the evidence you are using, and say what it should do to the terminal growth and terminal margin you would be willing to assume in a valuation.",
        },
        {
          id: "ind.sg_valuation",
          text: "Turn the map into two numbers. A discounted cash flow needs to know how far a company's returns sit above its cost of capital, and how long they stay there. Barrier height sets the duration, and position inside the group sets the size of the spread. So for the company you care about most in this industry: how many years of excess return does its group membership actually justify, and what happens to that number if the barrier you identified earlier turns out to be weaker than you think? A company you cannot defend on this question does not deserve a long competitive advantage period, whatever its current margin looks like.",
        },
        {
          id: "ind.sg_remap",
          text: "Change the company count on the map and watch what moves. The medians that split the quadrants are computed over whichever companies are being shown, so widening the set can push a company from one group into another. Map the same industry more than one way before trusting any of it. Do that here, and report what survived: which companies stayed in the same group no matter how you drew it, and which ones jumped. The ones that stayed put are the real structure. The ones that jumped were an artifact of where you drew the line.",
        },
      ],
    },
    {
      title: "Investor Psychology",
      questions: [
        { id: "ind.investor_psych", text: "Describe the psychology of investors who invest within this industry." },
        { id: "ind.reputability", text: "How reputable and likable is the industry, does it project clear core values?" },
        { id: "ind.management_mindsets", text: "What's the mindset of management at the highest market-cap companies in the industry?" },
      ],
    },
    {
      title: "ESG & Sustainability",
      questions: [
        { id: "ind.esg", text: "ESG analysis (especially relevant for oil & gas, tech), strengths and risks?" },
      ],
    },
    {
      title: "Strategic Position",
      questions: [
        { id: "ind.swot", text: "SWOT analysis of the industry: strengths, weaknesses, opportunities, threats." },
        { id: "ind.why_growth", text: "Who, what, where, when, why, how, and what significance, for why this industry could be the fastest-growing consistently in the future?" },
        { id: "ind.innovations", text: "What innovations could affect the industry?" },
        { id: "ind.cross_industry", text: "How do other industries affect this one? Which industry has the most impact on it?" },
      ],
    },
    {
      title: "Consumer & Resource Dynamics",
      questions: [
        { id: "ind.buyer_incentives", text: "What incentives do people have to buy products / investments / services from this industry over others?" },
        { id: "ind.economy_tradeoffs", text: "What tradeoffs does this industry create for the broader economy?" },
        { id: "ind.resources", text: "How do resource needs affect industry performance?" },
      ],
    },
    {
      title: "Money Flow",
      questions: [
        { id: "ind.growth_leader", text: "Which industry has the highest growth currently, and in the future? What could stop that growth?" },
        { id: "ind.capital_concentration", text: "Which industry has the most money currently, and which will have the most money in the future?" },
      ],
    },
    {
      title: "Industry Mechanics & KPIs",
      questions: [
        { id: "ind.kpi", text: "What single industry-specific operating metric best predicts returns here (same-store sales, ARPU and churn, book-to-bill, RevPAR, FFO, load factor, net interest margin), and what is it doing?" },
        { id: "ind.moat_mechanism", text: "Is the industry protected by scale economies, customer captivity (habit, switching, search costs), or proprietary technology, or merely by incumbency?" },
        { id: "ind.lifecycle_stage", text: "What life-cycle stage is the industry in (emerging, growth, shakeout, mature, decline), and what does that imply for sustainable margins and terminal growth?" },
        { id: "ind.cyclicality", text: "How cyclical is demand, what is current capacity utilization, and are current earnings above or below mid-cycle?" },
        { id: "ind.value_capture", text: "Which segment of the industry captures the most economic profit, and why?" },
        { id: "ind.consolidation", text: "Is the industry consolidating or fragmenting, and who are the acquirers versus the targets?" },
      ],
    },
  ],

  comparative: [
    {
      title: "Business Comparison",
      questions: [
        { id: "comp.descriptions", text: "Comparing what each company actually does based on its description." },
        { id: "comp.products_services", text: "Explanations of the products and services each company provides." },
      ],
    },
    {
      title: "Industry-Specific Success Factors",
      questions: [
        { id: "comp.success_factors", text: "What key factors make a business succeed or fail in this industry?" },
        { id: "comp.optimal_management", text: "What are the optimal qualities management should have within this specific industry?" },
      ],
    },
    {
      title: "Relative Valuation Discipline",
      questions: [
        { id: "comp2.companion_var", text: "After adjusting each multiple for its companion variable (P/E for growth, P/B for ROE, EV/EBITDA for ROIC and reinvestment, P/S for margin), is this name actually cheaper than peers or just lower quality?" },
        { id: "comp2.relative_vs_absolute", text: "Is the whole peer set rich or cheap versus its own history, so that 'cheapest in the group' might still be overvalued?" },
        { id: "comp2.comp_validity", text: "Are these truly comparable in risk, growth, and margin, or just the same industry code? Would size and geography tiering change the set? (Rosenbaum & Pearl)" },
        { id: "comp2.forward_basis", text: "On forward (not just trailing) estimates, does the ranking change?" },
        { id: "comp2.discount_reason", text: "Why does the market assign this name a discount or premium versus peers: fundamentals, or neglect and sentiment? (Tilson & Heins, The Art of Value Investing)" },
        { id: "comp2.acquirer_value", text: "Would a strategic acquirer pay a control premium for any of these, setting a price floor? (precedent transactions)" },
      ],
    },
    {
      title: "Relative Quality, Moat & Resilience",
      questions: [
        { id: "comp2.low_cost", text: "Which company is the low-cost producer, and how durable is that cost gap?" },
        { id: "comp2.relative_moat", text: "Which competitor has the widest moat, and is it widening or narrowing relative to the others?" },
        { id: "comp2.relative_capital", text: "Which management team has the best incremental-ROIC and buyback-at-a-discount record among the peers?" },
        { id: "comp2.relative_eq", text: "Whose earnings are the highest quality among the peers (operating cash flow versus net income, accruals)?" },
        { id: "comp2.relative_balance", text: "Who survives a downturn best (net debt to EBITDA, covenant headroom, maturity wall) among the peers? These ratios only show survival as long as lenders keep trusting the company, so weigh them against how hard its customers cut back in past slumps, whether management paid debt down or borrowed more going into the last one, and whether lenders refinanced it then." },
        { id: "comp2.share_shift", text: "Who is gaining versus losing market share within the peer set, and is the shift accelerating?" },
      ],
    },
  ],

  individual: [
    {
      title: "What This Company Does",
      questions: [
        { id: "ind.biz.what", text: "In plain terms, what does the company sell or do, and who pays it and for what?" },
        { id: "ind.biz.streams", text: "What are the company's main revenue streams, and roughly what share of revenue does each contribute?" },
        { id: "ind.biz.model", text: "What is the business model (one-time sales, recurring subscriptions, usage or transaction fees, licensing, advertising, or interest and fees), and how does that shape how reliable the revenue is?" },
        { id: "ind.biz.customers", text: "Who are the company's customers, and is revenue concentrated in a few large customers or spread across many?" },
        { id: "ind.biz.segments", text: "How is revenue split across the company's business segments and across geographies?" },
        { id: "ind.biz.valuechain", text: "What does the company do in-house versus buy from suppliers, and where does it sit in its industry's value chain?" },
        { id: "ind.biz.competitors", text: "Who are the company's main competitors, and roughly what is its position or market share among them?" },
        { id: "ind.overview.products", text: "List every major product or service and who buys each one. Which single product would hurt the company most if it disappeared tomorrow?" },
        { id: "ind.overview.money", text: "Exactly how does a dollar of revenue get earned? Walk through price, volume, and take-rate for the main business line." },
        { id: "ind.overview.unit_econ", text: "What are the unit economics of one sale: cost to produce and deliver, contribution margin, and what gets cheaper or more profitable as volume grows?" },
        { id: "ind.overview.goals", text: "What are the company's broader goals? Where is management steering it over the next 5 to 10 years, and does the capital allocation actually match those words?" },
      ],
    },
    {
      title: "SWOT",
      questions: [
        { id: "ind.swot.strengths", text: "Strengths: what are the company's durable competitive advantages (brand, scale, low-cost position, switching costs, network effects, patents), and what in the financials confirms them?" },
        { id: "ind.swot.weaknesses", text: "Weaknesses: what structural disadvantages does the company carry versus competitors (high cost position, customer or supplier concentration, capital intensity, a weak balance sheet, weak governance)?" },
        { id: "ind.swot.opportunities", text: "Opportunities: what specific and realistic opportunities could grow earnings over the next several years (new markets, new products, pricing power, secular demand, accretive acquisitions, margin expansion)?" },
        { id: "ind.swot.threats", text: "Threats: what specific threats could impair the business (new or low-cost competition, technological disruption, regulation, rising input costs, cyclicality, loss of a key customer or supplier)?" },
      ],
    },
    {
      title: "Hypothetical Competition Test",
      questions: [
        { id: "ind.compete", text: "If I had ample capital and skilled personnel, how would I compete with this company?" },
      ],
    },
    {
      title: "Product / Service Quality",
      questions: [
        { id: "ind.needed_desired", text: "Does the company's product or service originate from something needed or desired?" },
        { id: "ind.no_substitute", text: "Do customers have no close substitute to its product or service?" },
        { id: "ind.no_price_reg", text: "Is the business free from price regulation?" },
        { id: "ind.no_superstar", text: "Does the business require a 'superstar' to produce great results? (If yes, it isn't great.)" },
      ],
    },
    {
      title: "Customer Orientation",
      questions: [
        { id: "ind.customer_first", text: "Does the company prioritize its customers first? Do consumers favor it?" },
      ],
    },
    {
      title: "Structural Disadvantages to Avoid",
      questions: [
        { id: "ind.not_undiff", text: "Does the company avoid having undifferentiated products?" },
        { id: "ind.not_easy_entry", text: "Is the industry hard to enter?" },
        { id: "ind.not_many_comp", text: "Is competition limited (not many competitors)?" },
        { id: "ind.not_overcap", text: "Is there no over-capacity in the industry?" },
      ],
    },
    {
      title: "Competitive Advantage Durability",
      questions: [
        { id: "ind.moat", text: "Does the company have a sustainable competitive advantage?" },
        { id: "ind.fast_change", text: "Is it in a fast-changing industry? (If so, the moat is harder to defend.)" },
        { id: "ind.copyable", text: "Can competitors easily replicate the company's improvements?" },
        { id: "ind.entry_obstacles", text: "Are there obstacles that make it tough for new companies to enter?" },
        { id: "ind.unique_asset", text: "Does the business have something no one else has, or can copy, take away, or get in the future? Can these advantages be translated into business value?" },
      ],
    },
    {
      title: "Cash Flow Drivers",
      questions: [
        { id: "ind.cashflow_factors", text: "What factors were responsible for generating cash flow? Are they present today? How about in the future?" },
        { id: "ind.cashflow_forces", text: "What forces could change them?" },
        { id: "ind.improvement_room", text: "If there are limited ways to improve the business, is value growth ability at risk?" },
      ],
    },
    // Capital allocation. These sit under the Uses of Cash chart and are drawn from
    // how practitioners actually interrogate a ten-year allocation record: Giroux
    // (Capital Allocation), Thorndike (The Outsiders), Damodaran (Applied Corporate
    // Finance), Fridson (Financial Statement Analysis), Rosenbaum and Pearl
    // (Investment Banking), and Buffett via Cunningham. Each is deliberately
    // multi-part, because a question that can be closed with yes or no teaches
    // nothing. The chart answers "what did they do". These ask "what does it mean".
    {
      title: "Capital Allocation",
      questions: [
        {
          id: "ind.capalloc_drift",
          text: "Read the drift, not the level. Over the years shown, which use of cash grew as a share of operating cash flow and which shrank? Now put that next to the return on invested capital over the same period. The finding is that companies raising capital spending faster than their peers tend to deliver weaker earnings growth and weaker stock returns, so rising investment does not justify itself. State what this company earned on the capital it deployed, and say whether the trend in that return supports or contradicts the trend in the spending.",
        },
        {
          id: "ind.capalloc_lifecycle",
          text: "From the mix alone, where is this company in its life cycle: emerging, growth, mature, or declining? A young company reinvests more than it earns and pays nothing out. A mature one spends roughly its depreciation and returns the rest. A declining one spends less than depreciation and pays out heavily. Now argue against yourself: find the evidence in this chart that contradicts your own answer. Management's narrative is aspirational. The cash flow statement is factual. Where the two disagree, which do you believe, and why?",
        },
        {
          id: "ind.capalloc_capex_split",
          text: "Split the capital expenditure into maintenance and growth. Using depreciation as the rough proxy for what it costs to hold the asset base flat, how much of the spending is simply standing still, and how much is a genuine bet on the future? Where capex has sat persistently below depreciation, is revenue holding up, and how much longer can that continue before the shrinking asset base constrains it? Where capex has run far above depreciation, what did the last comparable burst of spending actually earn three to five years later?",
        },
        {
          id: "ind.capalloc_rnd",
          text: "Is research and development a growth engine here, or the cost of standing still? Test it rather than assume it. Has the cumulative R&D of the last five years produced a measurable gain in revenue growth or gross margin, allowing for a lag of two to four years? If R&D is rising while revenue growth decelerates, you must choose between two very different stories: R&D is failing to produce growth, or R&D is the only thing preventing a faster decline. Say which you believe and what evidence would change your mind, because the two carry opposite implications for value.",
        },
        {
          id: "ind.capalloc_buyback_net",
          text: "Separate gross buybacks from net buybacks. Subtract the stock issued to employees as compensation, then ask the only question that matters: did the share count actually fall, and by how much? The net figure is the honest one. A company repurchasing three billion while issuing two and a half billion in stock compensation has returned almost nothing to long term holders, however aggressive the buyback headline looks. What is the true net repurchase here, and does management's own language acknowledge the difference?",
        },
        {
          id: "ind.capalloc_buyback_timing",
          text: "Did management buy its own stock when it was cheap, or when it was expensive? Compare the years of heaviest repurchase against the share price and against your own estimate of intrinsic value in those same years. The ordinary pattern is to buy most at the peak, when cash is plentiful and confidence is high, and least at the trough, when the stock is cheapest and the board is most afraid. The Outsiders CEOs inverted that. Which pattern does this company show, and what does that tell you about whether management understands what its own business is worth?",
        },
        {
          id: "ind.capalloc_buyback_funding",
          text: "How were the buybacks paid for: out of genuine free cash flow, or out of debt? If leverage rose while the company was repurchasing stock, the earnings yield on the shares it bought must exceed the after tax cost of that new debt for the trade to create value. Does it? Fridson's example is IBM, which spent more repurchasing stock between 1995 and 1999 than it earned in the entire period, raising its financial risk in the process. Ask the asymmetric question: if this business deteriorates, what has the company given up by carrying more debt and fewer options?",
        },
        {
          id: "ind.capalloc_dividend",
          text: "Test the dividend against free cash flow to equity, not against earnings. Would this payout have survived the worst operating year in the record shown? A dividend that rises while organic investment shrinks can make retreat look like discipline. So decide: is this company returning capital because it has genuinely run out of projects that clear its hurdle rate, which is the honest and correct thing to do, or because returning capital is easier than admitting the core business has stopped compounding?",
        },
        {
          id: "ind.capalloc_debt",
          text: "Where debt repayment takes a large share of the cash, ask whether it was chosen or forced. Accelerating repayment in the years after a large acquisition is not allocation, it is servitude to a debt schedule that a previous decision created. Voluntary deleveraging is different, but it is only wise when the business risk warrants it: paying down cheap debt while the stock trades below intrinsic value forgoes both the tax shield and the buyback return. Which of these is happening here, and what does it reveal about management's appetite for risk as opposed to its judgement about value?",
        },
        {
          id: "ind.capalloc_worst",
          text: "Every ten year record contains one significant misallocation. Find this company's. Was it an acquisition that never earned its price, a buyback at the top, a capital programme that never produced the promised return, or a dividend defended past the point of prudence? Then ask the question that actually separates good capital allocators from bad ones: has management recognised the mistake and corrected it, or is it still committing it? The Outsiders were not distinguished by being right every time. They were distinguished by correcting errors quickly and never repeating them across cycles.",
        },
        {
          id: "ind.capalloc_retained",
          text: "Apply the one-dollar test to the whole record. Over the period shown, has the company created at least one dollar of market value for every dollar of earnings it retained rather than paid out? Work it through rather than guess. If the answer is no, then the retained earnings would have been worth more in the hands of shareholders than in the hands of management, and that is the single most damning verdict available in capital allocation. If the answer is yes, say which use of cash did the work.",
        },
      ],
    },
    {
      title: "Management Quality",
      questions: [
        { id: "ind.mgmt_traits", text: "Is management proven, with integrity, talent, passion, hard work, brains, respect, and personal commitment?" },
        { id: "ind.skill_allocation", text: "Is the company allocating workers and leaders based on skill? (Counter-example: Microsoft + Xbox.)" },
        { id: "ind.reinvestment", text: "How is the company reinvesting earnings? Evaluate 'what will they do with the money?' against 'what do we have now?'" },
        { id: "ind.layoffs", text: "Is the company laying off workers, especially engineers and builders, without proven reasons?" },
      ],
    },
    {
      title: "CEO Evaluation",
      questions: [
        { id: "ind.ceo_fit", text: "Does the company have the right CEO? What are people and workers saying about them?" },
        { id: "ind.ceo_comp", text: "Is the CEO overreaching in terms of compensation?" },
        { id: "ind.acquisitions", text: "Are proposed acquisitions likely to create or destroy per-share value?" },
        { id: "ind.capital_required", text: "How much additional capital was required to produce additional earnings?" },
      ],
    },
    {
      title: "Bad Manager Red Flags",
      questions: [
        { id: "ind.bad_mgr", text: "Does management avoid problem-solving, accepting reality, working with workers/customers, creativity, hard work, clarity, learning from mistakes, or growth mindsets?" },
      ],
    },
    {
      title: "Earnings Quality",
      questions: [
        { id: "ind.earning_power", text: "Can this company maintain above average levels of earning power and profitability within its respective industry. How?" },
        { id: "ind.earnings_source", text: "Who, what, where, when, why, how, and what significance, how did earnings actually increase?" },
      ],
    },
    {
      title: "Workforce Quality",
      questions: [
        { id: "ind.workers", text: "Are the workers talented, honest, nice, and trustworthy?" },
        { id: "ind.reputation_risk", text: "How could the company lose its reputation?" },
      ],
    },
    {
      title: "Risk / Reward",
      questions: [
        { id: "ind.loss_gain", text: "Is the loss/gain ratio favorable? Do I gain a lot if I'm right and lose little if I'm wrong?" },
      ],
    },
    {
      title: "ROE Sustainability & Leverage",
      questions: [
        {
          id: "indiv.levroe_attribution",
          text: "How much of this ROE came from ROIC, and how much came from the leverage gain? If the company carried no debt at all, would the return still be attractive?",
          hint: "A return the business earns tends to repeat. A return the balance sheet manufactures reverses when conditions turn.",
        },
        {
          id: "indiv.levroe_cushion",
          text: "How many percentage points could ROIC fall before the spread reaches zero? Compare that cushion against the worst ROIC year in the history table.",
          hint: "Below the break-even, every extra dollar of debt pushes ROE further under ROIC.",
        },
        {
          id: "indiv.levroe_worst_year",
          text: "Did the spread ever turn negative in the years on file? If it did, how far did ROE fall below ROIC that year, and what brought it back?",
          hint: "A structure that inverted once in a downturn will invert again in the next one.",
        },
        {
          id: "indiv.levroe_refinancing",
          text: "Is the book interest rate a fair estimate of what this company would pay to borrow today? How much of the debt matures within three years, and at what rate would it be replaced?",
          hint: "The book rate is an average of old borrowings. It lags a deteriorating credit, so a comfortable spread can already be inverted at market rates.",
        },
        {
          id: "indiv.levroe_tax_durability",
          text: "Is the effective tax rate below the statutory rate? Name the source of the benefit and say when it runs out. What does the spread become once the rate normalizes?",
          hint: "A tax break leaves more after-tax operating profit, so a low rate flatters ROIC, the spread and ROE at the same time. All three fall when the rate normalizes, with no change in the business.",
        },
        {
          id: "indiv.levroe_nonoperating",
          text: "How wide is the gap between the modelled ROE and the reported ROE? Which non-operating items explain it, and would you pay the same multiple for those earnings as for operating earnings?",
          hint: "The identity only sees operating profit. A wide gap means investment income or one-time gains are lifting the reported return.",
        },
        {
          id: "indiv.levroe_direction",
          text: "Is book D/E rising while ROIC stays flat or falls? Is management substituting financial risk for operating improvement?",
          hint: "Check whether the D/E moved because of new borrowing or because buybacks shrank the equity base.",
        },
        {
          id: "indiv.levroe_business_model",
          text: "Does the revenue underneath this debt justify the leverage? Is it regulated, contracted, or cyclical? Compare the D/E against direct competitors rather than against the market as a whole.",
          hint: "A regulated utility can carry a D/E above 100% on a thin spread because its revenue is near certain. A cyclical manufacturer with the same structure is a different proposition.",
        },
        {
          id: "indiv.levroe_risk_adjusted",
          text: "Borrowing raises the cost of equity as well as the ROE. Once the extra risk that leverage creates is priced in, is the shareholder actually better off, or is the higher ROE just payment for danger?",
          hint: "Levered beta rises with D/E, so part of any leverage gain is compensation for risk rather than value created.",
        },
        {
          id: "indiv.levroe_break_it",
          text: "What single event would invert the spread: a refinancing, a tax change, a price war, or a demand cycle? How likely is that event within three years, and is the current price ignoring it?",
        },
      ],
    },
    {
      title: "Earnings Quality & Forensics",
      questions: [
        { id: "indiv.accruals", text: "Does operating cash flow track net income over 5+ years, or has an accruals gap opened (earnings rising while operating cash flow stalls)? (Sloan; Lev & Gu)" },
        { id: "indiv.dso_dio", text: "Are receivables (DSO) or inventory (DIO) growing faster than revenue, signalling channel stuffing or demand weakness? (Schilit, Financial Shenanigans)" },
        { id: "indiv.nongaap", text: "How far do non-GAAP 'adjusted' earnings diverge from GAAP, and what gets added back every quarter (recurring 'one-time' items)? (Fridson)" },
        { id: "indiv.policy_change", text: "Has the company taken a big-bath write-off, lengthened depreciation lives, or changed revenue recognition to flatter a weak period? (Fridson)" },
        { id: "indiv.rev_practices", text: "Any related-party deals, bill-and-hold sales, or sell-in (to distributors) versus sell-through (to end users) revenue? (Schilit)" },
        { id: "indiv.auditor", text: "Has the auditor changed, has there been a restatement, or are internal-control weaknesses disclosed? (Fridson)" },
        { id: "indiv.smoothness", text: "Does it beat estimates by a penny every quarter (suspiciously smooth earnings), and what discretion enables that? (Fridson)" },
        { id: "indiv.fcf_props", text: "Is reported free cash flow propped up by deferring maintenance capex, stretching payables, or factoring receivables?" },
      ],
    },
    {
      title: "Intangibles & Hidden Value",
      questions: [
        { id: "indiv.value_explained", text: "What share of enterprise value is explained by reported book value and earnings? If low, which intangible (brand, network, data, IP) is doing the work? (Lev & Gu, The End of Accounting)" },
        { id: "indiv.organic_vs_acq", text: "How much of revenue growth is organic versus bought through acquisitions, and at what multiples? (Lev & Gu)" },
      ],
    },
    {
      title: "Narrative & Expectations",
      questions: [
        { id: "indiv.story_test", text: "Is the growth story possible (does it exceed its addressable market or beat GDP forever), plausible (consistent with margins, reinvestment, competition), and probable?" },
        { id: "indiv.reverse_dcf", text: "What growth and margin does today's price imply (reverse DCF), and is that more or less optimistic than my own forecast? (Mauboussin & Rappaport, Expectations Investing)" },
        { id: "indiv.narrative_break", text: "What single event or data point would break the narrative, and am I watching for it?" },
        { id: "indiv.big_market", text: "Does the story rely on a big market that many competitors are chasing, so the winners cannot all earn their cost of capital?" },
      ],
    },
    {
      title: "Concentration, Capital Intensity & Solvency",
      questions: [
        { id: "indiv.cust_concentration", text: "What share of revenue and profit is the top customer, and the top five, and what happens if one leaves? (Munger)" },
        { id: "indiv.supplier_dependence", text: "How dependent is the company on a single supplier, input, or contested supply-chain chokepoint? (Munger)" },
        { id: "indiv.maint_capex", text: "Is this a low-reinvestment cash compounder (See's Candies) or a high-return but capital-hungry business (FlightSafety)? What is maintenance capex versus growth capex?" },
        { id: "indiv.refi_wall", text: "What is the debt-maturity wall and covenant headroom, and can the company self-fund through a downturn without dilution?" },
        { id: "indiv.downturn_coverage", text: "In a recession scenario, how far can EBIT fall before interest coverage breaks?" },
      ],
    },
    {
      title: "Process / Edge / Behavioral",
      questions: [
        { id: "indiv.circle", text: "Is this within my circle of competence, or am I leaning on management's claims because I do not understand the business?" },
        { id: "indiv.inefficiency", text: "What specific inefficiency am I exploiting (neglect, forced selling, complexity, time-horizon arbitrage), and why does it persist? (Tilson & Heins)" },
        { id: "indiv.premortem", text: "What would have to be true for this to be worth half the price, and double, and which is more likely?" },
        { id: "indiv.falsification", text: "What evidence would prove the thesis wrong, and have I pre-committed to act on it? (Munger)" },
        { id: "indiv.anchoring", text: "Am I anchoring on the purchase price, a 52-week high, or a prior valuation instead of on intrinsic value?" },
        { id: "indiv.biases", text: "Where might confirmation bias, overconfidence, or recency bias be distorting my read of this company?" },
        { id: "indiv.lollapalooza", text: "Is there a lollapalooza of reinforcing advantages (scale, captivity, brand, switching costs), or of reinforcing risks? (Munger)" },
        { id: "indiv.bubble_overvalued", text: "Explain why this equity is overvalued based on investor behavior and statement trends (price and valuation climbing faster than revenue, earnings, and cash flow). Which of the bubble patterns below are at work?" },
        { id: "indiv.bubble_narrative", text: "Is a 'new era' story driving the price: a belief in permanent prosperity, recovery euphoria after war or past recessions, and a few highly visible winners taken as proof the boom will last?" },
        { id: "indiv.bubble_psychology", text: "Are buyers acting on overconfidence, herd mentality, and fear of missing out (FOMO) so the price is set by the crowd rather than by fundamentals like earnings and cash flow?" },
        { id: "indiv.bubble_turn", text: "What could end the bubble: rising interest rates while companies and households already carry heavy debt, and a first market decline that flips the mood from greed to fear?" },
      ],
    },
    {
      title: "Recent Price Moves",
      questions: [
        { id: "indiv.price_decline", text: "If the company has faced recent stock declines, what is the most probable reason why this equity has declined in value? Is the decline genuine or just based off irrational investor pessimism? Why are investors selling this equity?" },
        { id: "indiv.price_increase", text: "If the company has faced recent stock increases, what is the most probable reason why this equity has increased in value? Is the rate of increase justified or just based off investor hype and speculation? Why are investors buying this equity?" },
      ],
    },
    {
      title: "Strategic Resources",
      questions: [
        { id: "ind.sr.inventory", text: "Much of a modern company's value sits in resources the balance sheet never records, such as brands, patents, data, networks, and talent. What is this company's single most important strategic resource, and does that resource appear in the accounts or stay invisible?" },
        { id: "ind.sr.development", text: "A strategic resource has to be built and refreshed, usually through spending that accounting books as an expense instead of an investment. How much does this company spend to create and expand the key resource through research, marketing, or capital projects, and is that spending rising or falling?" },
        { id: "ind.sr.preservation", text: "A resource that rivals can copy or that fades over time confers no lasting edge. How does this company defend the key resource against imitation, patent expiry, and obsolescence, whether through secrecy, contracts, or steady reinvestment?" },
        { id: "ind.sr.deployment", text: "A valuable resource left idle helps a company no more than a resource the company never owned. Is this company using the key resource fully across products, markets, and channels, or does a large share of the resource sit unused?" },
        { id: "ind.sr.value_creation", text: "The final test of a strategic resource is whether the resource earns money. Does this company's key resource turn into real economic results, such as pricing power, market-share gains, or high returns on capital?" },
        { id: "ind.sr.concentration", text: "Leaning on a single resource creates a single point of failure. How exposed is this company if the key resource weakens, whether a patent lapses, a core team departs, or a platform loses its network?" },
        { id: "ind.sr.reinvestment", text: "A resource compounds only when the company keeps feeding the resource and still has room to grow it. Does this company hold both the opportunities and the discipline to reinvest in the resource for years, or has the resource nearly reached the limit of what the resource can produce?" },
      ],
    },
    {
      title: "The 7 Powers",
      questions: [
        { id: "ind.pw.scale", text: "Scale economies appear when a company's cost per unit drops as the company produces more. Does this company hold the largest volume in a market where size genuinely lowers cost, and would a smaller competitor have to win similar share before the competitor could match that cost?" },
        { id: "ind.pw.network", text: "A network effect means every additional user makes the product more useful to all the other users. Does the value of this company's product grow as more people use the product, and would a rival have to recreate the entire user base at once to compete?" },
        { id: "ind.pw.counter", text: "Counter-positioning is a new business model that established rivals refuse to copy because copying would wreck the profits the rivals already earn. Has this company built such a model, and do the incumbents hold back from imitating the model to protect their existing business?" },
        { id: "ind.pw.switching", text: "Switching costs are the money, time, and risk a customer absorbs to move from one supplier to another. What would a customer actually sacrifice by leaving this company, and does that lock-in show up as high retention or as room to raise prices without losing accounts?" },
        { id: "ind.pw.branding", text: "A branding power lets a company charge more than a functionally identical product because buyers trust the name. Does this company earn a durable price premium on reputation alone, and did that reputation take years of consistent history that a competitor cannot simply buy?" },
        { id: "ind.pw.cornered", text: "A cornered resource is a scarce asset, such as a patent, a critical input, or irreplaceable talent, that a company controls on favorable terms. Does this company control such a resource, and are competitors unable to obtain the same resource at any sensible price?" },
        { id: "ind.pw.process", text: "Process power is an advantage built into how a company operates that rivals cannot copy even after watching closely. Does this company do something in production or logistics that competitors have studied for years and still cannot reproduce?" },
        { id: "ind.pw.synthesis", text: "Naming a power is worthless unless the power is real and lasting. Of the seven powers above, which ones does this company truly hold today, and for each power you claim, state the exact benefit the company gains and the exact barrier that keeps rivals out?" },
      ],
    },
    {
      title: "ESG Analysis",
      questions: [
        { id: "ind.esg.materiality", text: "An ESG issue matters to a valuation only when the issue moves cash flow or the cost of capital. Which specific environmental, social, or governance factors are financially material to this particular company, and which factors are noise that ratings flag but that leave the numbers unchanged?" },
        { id: "ind.esg.environmental", text: "Environmental exposure covers emissions, resource use, regulation, and the risk that a business model ages badly as rules or technology change. What environmental factors could raise this company's future costs or leave part of the company's assets stranded and worthless?" },
        { id: "ind.esg.social", text: "Social capital covers a company's standing with employees, customers, and the communities that grant the company a license to operate. How much does this company rely on attracting skilled workers and holding customer trust, and what event would break those relationships?" },
        { id: "ind.esg.governance", text: "Governance decides whether managers serve shareholders or serve themselves, and research ties governance quality to profitability. Are this company's management incentives aligned with long-term owners, and does the ownership structure protect minority shareholders from being exploited?" },
        { id: "ind.esg.label", text: "A high ESG score can reflect real quality or skilled marketing. Does this company's ESG strength show up in operating results and lower risk, or is the strength a label that the underlying figures fail to support?" },
        { id: "ind.esg.controversy", text: "Past conduct forecasts future risk more reliably than a sustainability brochure. Has this company faced fines, lawsuits, recalls, or labor disputes, and does management treat those events as isolated accidents or as symptoms of how the company operates?" },
        { id: "ind.esg.valuation", text: "ESG analysis earns its place only when the analysis changes a number. If the risks you identified for this company actually came to pass, how would you adjust the company's cash-flow forecast or the discount rate you apply?" },
      ],
    },
    {
      title: "Executive Compensation",
      questions: [
        { id: "ind.comp.level", text: "The first test of executive pay is whether the amount holds up against company size, peers, and real results. Is this company's total chief-executive pay defensible on those grounds, or does the pay read as overreach, such as a bonus guaranteed no matter how the company performs?" },
        { id: "ind.comp.structure", text: "The structure of a pay package decides which behavior the package rewards, and structure matters more than the headline figure. What is the split between salary, cash bonus, and equity at this company, and does the equity vest on several years of performance rather than on time served alone?" },
        { id: "ind.comp.p4p", text: "Compensation should climb when shareholders prosper and shrink when shareholders suffer. Over the past several years, has this company's executive pay followed long-run shareholder value, or has the pay risen even in years when the business stalled or shrank?" },
        { id: "ind.comp.metrics", text: "The targets behind a bonus reveal what the board actually rewards. Are this company's bonus targets tied to figures management can massage, such as adjusted earnings per share, or to durable measures such as return on invested capital and free cash flow?" },
        { id: "ind.comp.dilution", text: "Stock-based compensation is a real cost that hands ownership from existing shareholders to employees. How much does this company's stock compensation dilute current owners each year, and does management treat the compensation as a genuine expense rather than dismissing the compensation as merely non-cash?" },
        { id: "ind.comp.capital", text: "Incentives should steer managers toward disciplined use of capital, not toward growth for the sake of size. Do this company's incentives reward high returns on the capital managers deploy, or do the incentives reward bigger revenue and a bigger empire regardless of the returns?" },
        { id: "ind.comp.redflags", text: "A few pay features reward failure and expose a captured board. Does this company use guaranteed bonuses, repriced options, or golden parachutes that pay executives well even after the executives perform poorly?" },
      ],
    },
    {
      title: "Board & Governance",
      questions: [
        { id: "ind.gov.independence", text: "A board can only supervise a chief executive when the board stands apart from that chief executive. Are this company's directors genuinely independent, or were the directors handpicked by and loyal to the same management the directors are meant to oversee?" },
        { id: "ind.gov.leadership", text: "When one person both chairs the board and runs the company, that person ends up grading that person's own work. Does this company separate the chairman and chief-executive roles, or at least name a strong lead director who can hold the chief executive to account?" },
        { id: "ind.gov.entrenchment", text: "Some corporate structures exist mainly to protect managers from consequences. Does this company use a staggered board, a poison pill, or dual-class shares that let insiders keep control even when outside shareholders want change?" },
        { id: "ind.gov.committees", text: "An audit or compensation committee fails its purpose the moment the members carry conflicts. Are the directors on this company's audit and compensation committees free of business ties to management that would cloud the directors' judgment?" },
        { id: "ind.gov.engagement", text: "Directors who juggle many boards or rarely show up cannot monitor a business closely. Do this company's directors bring the time, expertise, and attendance the job demands, or do the directors look like passive names on a roster?" },
        { id: "ind.gov.voice", text: "The way a board answers its owners shows whether the board answers to anyone at all. How did this company's say-on-pay vote and shareholder proposals turn out, and did the board act on the outcome or brush the outcome aside?" },
        { id: "ind.gov.succession", text: "Boards prove their worth during a crisis and a leadership handoff. Does this company have a credible plan to replace the chief executive, and do the directors own enough stock to feel losses alongside ordinary shareholders?" },
      ],
    },
    {
      title: "Earnings Quality",
      questions: [
        { id: "ind.eq.recurring", text: "A valuation should rest on earnings the company can repeat, not on a single unusual year. After you remove one-time gains and one-time charges, what is this company's sustainable operating earnings across a full business cycle?" },
        { id: "ind.eq.leases", text: "Operating leases are a form of borrowing that older accounting kept off the balance sheet. Does treating this company's operating leases as debt change the company's leverage and returns enough to matter, as the change does for most retailers?" },
        { id: "ind.eq.non_operating", text: "Interest and investment income can flatter a company that is weaker in its core operations. How much of this company's reported profit comes from investments rather than the operating business, and should that income come out before you value the operations?" },
        { id: "ind.eq.serial", text: "A charge labeled non-recurring stops deserving the label once the charge returns year after year. Has this company booked restructuring or one-time charges in most of the past several years, which would make the charges an ordinary cost of doing business?" },
        { id: "ind.eq.gaap", text: "Management picks which figures to feature, and the space between official and adjusted numbers is where optimism hides. Where do this company's non-GAAP earnings drift furthest from the GAAP earnings, and is each adjustment honest or self-serving?" },
        { id: "ind.eq.capitalized", text: "Some companies lift reported profit by capitalizing costs that competitors expense outright. Does this company capitalize spending such as software, content, or customer acquisition, and does that choice inflate current earnings compared with peers?" },
        { id: "ind.eq.true_capital", text: "Once the earnings are cleaned up, the capital behind the earnings has to be cleaned up to match. After all these adjustments, what invested capital and what normalized earning power should this company's valuation actually run on?" },
      ],
    },
    {
      title: "Catalyst & Value Trap",
      questions: [
        { id: "ind.cat.catalyst", text: "A cheap price stays cheap until something forces the market to see the value. What specific event could close the gap between this company's price and the company's worth, such as a spinoff, a restructuring, new management, a return of capital, or a recovery in margins, and roughly when might that event land?" },
        { id: "ind.cat.trap_test", text: "The asset the market treats as worst is often the cheapest, and often cheap for a sound reason. If this company looks cheap, why is the company cheap, and what does the market see that a hopeful buyer might be arguing away?" },
        { id: "ind.cat.decay", text: "A low multiple can hide a business that is quietly dying rather than one that is briefly unloved. Is this company's cheap price masking a permanent decline, such as shrinking volumes, a worsening industry, or assets that lose value every year?" },
        { id: "ind.cat.asset_quality", text: "Buying a company below the worth of its assets works only when the assets are real and salable. If the case for this company rests on the company's assets, are those assets liquid, honestly valued, and worth what the balance sheet claims?" },
        { id: "ind.cat.survival", text: "A thesis needs time to work, and heavy debt steals that time. Can this company survive a long downturn without a forced sale or dilution, and does the balance sheet leave the business enough room for the thesis to play out?" },
        { id: "ind.cat.downside", text: "Avoiding losses matters more than reaching for gains. What is the realistic downside if the case for this company proves wrong, and how much would a buyer lose in that outcome?" },
        { id: "ind.cat.falsifier", text: "A disciplined investor names the disproving evidence in advance. What single fact about this company, if you uncovered the fact, would convince you that the situation is a value trap rather than a bargain?" },
      ],
    },
    // Company fragility pillars A-G + pre-revenue + synthesis (owner framework,
    // RAG-verified 2026-09-22). Sources, code comment only: Penman, Accounting
    // for Value Ch.3, 9; Damodaran, Narrative and Numbers Ch.3 and Investment
    // Valuation Ch.23, 30; Schilit, Financial Shenanigans Parts 2-5; Fridson,
    // Financial Statement Analysis Ch.11, Parts 3-4; Giroux, Capital Allocation
    // Ch.8, 11; Kricheff Ch.3, 14, 16, 17, 23; Marks Ch.10, 12; Dalio Part 1;
    // Kindleberger & Aliber Ch.2-4 (Minsky stages); Soros Part 1.
    {
      title: "Valuation and Narrative",
      questions: [
        { id: "indiv.frag.implied_combo", text: "What revenue growth, profit margin and reinvestment does the current share price assume, and has any company of similar size ever sustained that combination for a decade?" },
        { id: "indiv.frag.price_split", text: "How much of the share price is supported by the company's current earnings and assets, and how much depends entirely on growth that has not happened yet?" },
        { id: "indiv.frag.implied_share", text: "If the implied revenue ten years from now were reached, what share of its whole market would the company need to own, and is that share realistic given its competitors?" },
        { id: "indiv.frag.story_to_numbers", text: "Can each claim in the company's story (market size, market share, margins, reinvestment, risk) be turned into a specific number, and which claims are possible but not probable?" },
        { id: "indiv.frag.language", text: "Does the company's language (\"revolutionary\", \"platform\", \"new paradigm\") promise more than its actual revenue and profit growth have delivered?" },
        { id: "indiv.frag.custom_metrics", text: "Why does management promote its own metrics, such as \"adjusted EBITDA\" or \"cash earnings\", and do those metrics ever turn into cash under standard accounting?" },
        { id: "indiv.frag.founder", text: "How much of the strategy, fundraising and customer relationships depend on the founder or CEO, and would the plan survive if that person left?" },
        { id: "indiv.frag.buyers", text: "Are the recent buyers of the stock people who studied the business, or index funds forced to buy, momentum traders and first-time investors afraid of missing out?" },
        { id: "indiv.frag.narrative_synthesis", text: "Taken together, is this price explained by what the business can deliver, or by a story the business has not yet earned?" },
      ],
    },
    {
      title: "Earnings and Growth Quality",
      questions: [
        { id: "indiv.frag.profit_to_cash", text: "Over the last five years, has reported profit turned into operating cash, and if not, where has the difference gone?" },
        { id: "indiv.frag.cash_inflated", text: "Is operating cash flow itself inflated by selling receivables to banks, recording operating costs as capital spending, stretching payments to suppliers, or cash acquired with purchased companies?" },
        { id: "indiv.frag.timing_games", text: "Is the company recording revenue before customers are committed, booking one-time gains as ordinary income, or moving expenses into later periods?" },
        { id: "indiv.frag.balance_growth", text: "Are receivables, inventory or capitalized costs growing faster than sales, and what explains the gap?" },
        { id: "indiv.frag.adjusted_excludes", text: "What does the \"adjusted\" profit leave out, and do any of those \"one-time\" costs, such as stock-based pay or restructuring, appear every year?" },
        { id: "indiv.frag.organic_growth", text: "How fast is the business growing once acquired companies are removed, and is the underlying business growing or shrinking?" },
        { id: "indiv.frag.customers", text: "Are any large customers also investors, suppliers, insiders or borrowers of the company's own money, and could they keep buying without the company's support?" },
        { id: "indiv.frag.real_demand", text: "Is customer demand coming from real end use, or are customers ordering ahead because of shortages and long delivery times?" },
        { id: "indiv.frag.controls", text: "Have auditors flagged weaknesses in internal controls, and have the auditor or CFO changed without a clear reason?" },
        { id: "indiv.frag.earnings_synthesis", text: "Taken together, how much of this company's reported profit can you trust?" },
      ],
    },
    {
      title: "Capital Structure and Dilution",
      questions: [
        { id: "indiv.frag.ownership_given_up", text: "How much of their ownership have existing shareholders given up through stock issued for acquisitions, employee pay and fundraising, after counting buybacks?" },
        { id: "indiv.frag.offset_buybacks", text: "Is the company spending cash on buybacks mainly to offset shares handed to employees, and does that make stock-based pay a hidden cash cost?" },
        { id: "indiv.frag.goodwill_share", text: "How much of the balance sheet is goodwill (the premium paid over the value of acquired assets), and what would remain of shareholders' equity without it?" },
        { id: "indiv.frag.premiums_earned", text: "Have past acquisitions earned back the premiums paid for them, or are write-downs likely?" },
        { id: "indiv.frag.convertibles", text: "If the share price fell below the conversion price of the company's convertible bonds, how much debt would have to be repaid in cash, and how much new stock would be issued?" },
        { id: "indiv.frag.loan_terms", text: "Do the loan terms protect lenders with regular tests, or do loose terms and exceptions let the company borrow more even when its finances weaken?" },
        { id: "indiv.frag.needs_high_price", text: "Which parts of the growth plan depend on the company's own stock staying expensive, and what happens to them if the share price halves?" },
        { id: "indiv.frag.dilution_synthesis", text: "Taken together, who has paid for this company's growth so far, and who pays if the share price falls?" },
      ],
    },
    {
      title: "Debt Capacity and Liquidity",
      questions: [
        { id: "indiv.frag.interest_cover", text: "Do the company's earnings cover its interest payments with room to spare, or does a small fall in profit put those payments at risk?" },
        { id: "indiv.frag.covenant_earnings", text: "Does the company's own definition of earnings for its loan tests include savings and adjustments that have not actually happened?" },
        { id: "indiv.frag.largest_payment", text: "When does each major debt payment fall due, and could the company meet the largest one if lenders refused to refinance it?" },
        { id: "indiv.frag.stress", text: "If interest rates rose by two percentage points, or the high-yield and private credit markets closed for a year, could the company still pay every bill?" },
        { id: "indiv.frag.runway", text: "How long could the company operate on its cash and unused credit lines if it could not borrow or raise equity?" },
        { id: "indiv.frag.self_funding", text: "Can the company fund its own growth from cash flow, or does it need new debt or new shares every year?" },
        { id: "indiv.frag.bonds_vs_stock", text: "Do bond investors and credit rating agencies see more risk in the company than stock investors do, and which side is more likely to be right?" },
        { id: "indiv.frag.debt_synthesis", text: "Taken together, would a careful lender renew this company's loans today?" },
      ],
    },
    {
      title: "Hidden Obligations",
      questions: [
        { id: "indiv.frag.off_balance", text: "What obligations sit outside reported debt, such as guarantees, special-purpose entities, joint ventures, supply-chain finance, pension deficits or long-term purchase commitments, and how much do they add to what the company owes?" },
        { id: "indiv.frag.related_parties", text: "Do executives, directors or major shareholders do business with the company, and would an unrelated party accept the same terms?" },
        { id: "indiv.frag.downgrade_triggers", text: "Would a credit rating downgrade force the company to repay debt or post collateral immediately?" },
        { id: "indiv.frag.plain_words", text: "Can you explain in a few plain sentences how the company makes money, how the group is structured and where the debt sits, and if not, which part resists explanation?" },
        { id: "indiv.frag.auditor_language", text: "Has the auditor's language changed, qualified its opinion, raised doubts about the company's survival, or resigned?" },
        { id: "indiv.frag.cash_real", text: "Is the company's cash held in ordinary bank accounts the auditor can confirm directly, or with third parties, escrow agents or related entities?" },
        { id: "indiv.frag.hidden_synthesis", text: "Taken together, what does this company owe on and off the balance sheet, and what could make all of it come due at once?" },
      ],
    },
    {
      title: "Financing Stage",
      questions: [
        { id: "indiv.frag.stage_now", text: "Does the company's cash from operations, after the spending needed to maintain the business, cover both interest and scheduled debt repayments, interest only, or neither?" },
        { id: "indiv.frag.pik_interest", text: "Is any interest being added to the loan balance instead of paid in cash?" },
        { id: "indiv.frag.stage_direction", text: "Over the last five years, has the company moved toward paying its debts from its own cash, or toward borrowing to meet its debt payments?" },
        { id: "indiv.frag.stage_synthesis", text: "Taken together, what would push this company one stage closer to borrowing just to pay interest?" },
      ],
    },
    {
      title: "Macro Exposure",
      questions: [
        { id: "indiv.frag.borrowed_with_crowd", text: "Did the company add debt fastest when credit was cheapest and everyone else was borrowing too?" },
        { id: "indiv.frag.timing_gap", text: "Does the company borrow short-term to pay for long-lived assets, or hold hard-to-sell assets with money that can be withdrawn quickly?" },
        { id: "indiv.frag.past_hikes", text: "How did the company, or its closest peers, cope in past periods of rising interest rates such as 1994, 2000, 2006 and 2022?" },
        { id: "indiv.frag.currency_exposure", text: "Does the company owe money in a currency it does not earn, and would a currency collapse or a demand collapse hurt it more?" },
        { id: "indiv.frag.customer_credit", text: "Do the company's customers buy with borrowed money, and how much of its revenue would disappear if their credit dried up?" },
        { id: "indiv.frag.macro_synthesis", text: "Taken together, how would this company fare in the next credit tightening?" },
      ],
    },
    {
      title: "Pre-Revenue Credibility Test",
      questions: [
        { id: "indiv.frag.promises_kept", text: "Which of management's past promises (launch dates, production targets, orders, approvals) were delivered on time, and which were missed or quietly dropped?" },
        { id: "indiv.frag.binding_partners", text: "Are the announced partnerships binding contracts with purchase commitments, deposits or penalties, or press releases and non-binding agreements?" },
        { id: "indiv.frag.listing_route", text: "Did the company go public in a way, such as a SPAC merger, that let it publish long-range projections, and how have results compared with those projections?" },
        { id: "indiv.frag.insider_selling", text: "Are founders, executives and early investors selling shares, and did they sell before or after major announcements?" },
        { id: "indiv.frag.outside_concerns", text: "Have short sellers, journalists or regulators raised specific concerns, and did management answer with evidence or with attacks on the critics?" },
        { id: "indiv.frag.product_proof", text: "Is there any evidence the product works that does not come from the company itself, such as independent tests, regulatory approvals or paying customers?" },
        { id: "indiv.frag.easy_market", text: "Is the market rewarding promises in this sector so easily that weak or fraudulent companies can raise money?" },
        { id: "indiv.frag.credibility_synthesis", text: "Taken together, is there enough independent evidence to believe this company can deliver its plan?" },
      ],
    },
    {
      title: "Story Against Statements: The Judgment",
      questions: [
        { id: "indiv.frag.market_story", text: "What story does the market believe about this company's growth, margins and durability?" },
        { id: "indiv.frag.statements_story", text: "What story do the cash flows, balance sheet and footnotes tell about the same company?" },
        { id: "indiv.frag.story_gap", text: "Where do the two stories disagree, and how large is each gap?" },
        { id: "indiv.frag.break_point", text: "What event would most likely force the market's story to meet the financial statements' story: a credit tightening, a lost customer, a write-down, an auditor qualification or a short-seller report?" },
        { id: "indiv.frag.risk_type", text: "Is this an equity bubble, an accounting or fraud problem, a story with no business behind it, a debt crisis, hidden obligations, or a funding problem, and could it be more than one?" },
        { id: "indiv.frag.fragile_or_breaking", text: "Is the company fragile but stable for now, or has a trigger already started?" },
      ],
    },
  ],

  // Final review, the exact self-assessment questions from the commentary on
  // Chapter 20 of The Intelligent Investor, grouped by Kahneman's
  // two factors of a good decision. Verbatim; the wording is the author's.
  final_review: [
    {
      title: "Well-calibrated confidence: what is the likelihood that my analysis is right?",
      questions: [
        { id: "final.conf.experience", text: "How much experience do I have? What is my track record with similar decisions in the past?" },
        { id: "final.conf.others_record", text: "What is the typical track record of other people who have tried this in the past?" },
        { id: "final.conf.buying", text: "If I am buying, someone else is selling. How likely is it that I know something that this other person (or company) does not know?" },
        { id: "final.conf.selling", text: "If I am selling, someone else is buying. How likely is it that I know something that this other person (or company) does not know?" },
        { id: "final.conf.breakeven", text: "Have I calculated how much this investment needs to go up for me to break even after my taxes and costs of trading?" },
      ],
    },
    {
      title: "Correctly-anticipated regret: do I fully understand the consequences if my analysis turns out to be wrong?",
      questions: [
        { id: "final.regret.loss", text: "If I'm right, I could make a lot of money. But what if I'm wrong? Based on the historical performance of similar investments, how much could I lose?" },
        { id: "final.regret.offsets", text: "Do I have other investments that will tide me over if this decision turns out to be wrong? Do I already hold stocks, bonds, or funds with a proven record of going up when the kind of investment I'm considering goes down? Am I putting too much of my capital at risk with this new investment?" },
        { id: "final.regret.tolerance", text: "When I tell myself, \"You have a high tolerance for risk,\" how do I know? Have I ever lost a lot of money on an investment? How did it feel? Did I buy more, or did I bail out?" },
        { id: "final.regret.willpower", text: "Am I relying on my willpower alone to prevent me from panicking at the wrong time? Or have I controlled my own behavior in advance by diversifying, signing an investment contract, and dollar-cost averaging?" },
      ],
    },
  ],
};

/** Selling With a Motive (Final Review, plan item 12). Rendered per company
 *  after the synthesis review and saved under section "final_review" with the
 *  ticker as scope, so no Convex change is needed. Question text is the
 *  owner's, verbatim, with the owner-approved additions. `{company}` is filled
 *  by `withCompany`. The guidance is hidden tutor instruction, never rendered.
 *  Sources (code comment only): The Little Book That Builds Wealth Ch.14 (four
 *  reasons to sell, none about the price); One Up on Wall Street Part III (when
 *  to sell each kind of stock); The Intelligent Investor, commentary on Ch.8
 *  (selling for a tax loss, the 31-day wait). */
export const sellWithMotive: RuntimeGroup[] = [
  {
    title: "Selling With a Motive",
    questions: [
      {
        id: "final.sell.motive",
        text: "Name the main reason you would sell {company}, and say whether you would sell all of it or part: the price has reached your estimate of value, the business has changed for the worse and the change looks permanent, the business was never what you thought when you bought it, you have found a clearly better use for the money, or the position has grown too large a part of your portfolio. Each of these reasons is about the value of the business or the shape of your portfolio, not about where the price has moved.",
        guidance: "Use the intrinsic value and market price in the data block to test the first reason, and the reader's earlier answer on permanent decline to test the second. Say which reason the evidence supports and whether a partial sale fits better than a full one.",
      },
      {
        id: "final.sell.value_vs_price",
        text: "If the price has fallen since you bought, has your estimate of value fallen with it, and by how much? If the price has risen, has the value risen in step? Selling because the price dropped makes sense only when the value dropped too. If you held cash today instead, would you buy {company} at this price?",
        guidance: "Compare the price with the intrinsic value in the data block. A cut of more than 15 percent to the earnings or value estimate is a common threshold for treating the thesis as broken. The reader's purchase price is irrelevant to whether to own the stock today.",
      },
      {
        id: "final.sell.kind",
        text: "Decide what kind of company {company} is today: a fast grower, a stalwart, a slow grower, a cyclical, a turnaround, or an asset play. Each kind has its own time to sell: a stalwart or slow grower after a 30 to 50% gain, or when its P/E climbs above its usual range or its dividend is cut; a cyclical near its peak earnings, when its P/E looks lowest; a turnaround once the recovery is finished and everyone knows it; an asset play once a buyer pays for the assets or management starts spending them away; a fast grower when growth slows or its P/E runs far ahead of any growth it can deliver. Has {company} moved from one kind to another since you bought it?",
        guidance: "Start from the lifecycle stage in the data block (emerging or growth points toward a fast grower, mature toward a stalwart or slow grower, declining toward a turnaround or asset play) and its confidence. The stage cannot detect a cyclical; judge that from how revenue and margins moved through past downturns.",
      },
      {
        id: "final.sell.switch",
        text: "Compare {company} with the best alternative you have valued. Work out how far each one could rise to your value (value divided by price, minus one), then take off the cost of switching: trading costs, the tax on any gain (which you would mostly pay later anyway, but at a higher rate if you have held {company} for less than a year), and how wrong your value for the alternative could be, since you know it less well. Is the switch still worth making? If {company} trades below your purchase price, selling turns the decline into a tax loss. You can buy a comparable company straight away, but under US rules, buying {company} back within 30 days before or after the sale cancels the loss for now. Selling a modestly undervalued holding to buy a deeply undervalued one is a trade in your favor; a small gap eaten by tax is not.",
        guidance: "Upside = value / price - 1, not the discount. Compare 1 + upside of the holding with (1 - switching cost) x (1 + upside of the alternative), and show the arithmetic. Example: holding worth 100 at 90 has 11.1% upside; an alternative worth 50 at 30 has 66.7%; with a 3% cost, 0.97 x 1.667 = 1.62 beats 1.11. In a close case, cut the alternative's value by 10% to show how an error there reverses the answer. The wash-sale rule is US law (a loss is disallowed if the same or a substantially identical security is bought within 30 days before or after the sale, and the loss is added to the new shares' cost); a different company is not substantially identical. Read the tax notes in the Investment Policy line.",
      },
      {
        id: "final.sell.size",
        text: "Read your Investment Policy Statement's position limit and {company}'s current weight in your portfolio. If a rising price has pushed the position past that limit, how much would you trim to get back to your target weight? If your policy names no limit, write one now. Trimming for size is a risk decision, separate from whether the company is still cheap.",
        guidance: "Read the constraints in the Investment Policy line for a position limit. If none is written, say so; many investors cap a single stock near 5 to 10 percent, and above 15 to 20 percent is widely treated as too concentrated. The app does not compute the weight; use the one the reader gives or the simulator position with the price in the data block.",
      },
      {
        id: "final.sell.note",
        text: "Write the sell note you would want to read in two years. Start from the sell sentence in your synthesis above and the fact you named that would make {company} a value trap. Include the motive that would make you sell {company}, the figure and level that would trigger it, how long you will give the thesis, what you would do with the money, and what you would refuse to sell on. No length limit; pull together everything from the questions above.",
        guidance: "Build on the reader's earlier answers in the data block (their full account of the company and the value-trap fact) rather than re-deriving them. Each trigger should name a figure from the data block and the level at which it fires. Keep the time given to the thesis within the horizon in the Investment Policy line.",
      },
    ],
  },
];

/** Head to Head (comparative page). Q1 text is the owner's, verbatim; Q2, Q3,
 *  Q4 and Q8 were sharpened at the owner's request (2026-10-02) so each asks a
 *  different decision from the overlapping questions lower on the page
 *  (comp2.low_cost, comp2.relative_moat, comp2.relative_balance,
 *  comp2.discount_reason, comp.connect.synthesis). Order: customer, structure,
 *  behavior under stress, the other four forces, durability, then price last (form the view before
 *  seeing the price). Ids keep their original numbers so saved answers survive.
 *  `{company}` is the reader's chosen base company; the rendering component
 *  substitutes it (same pattern as projectionsDeck.ts). Hints are separate
 *  teaching text. Sources (code comment only):
 *  Q1 hint: Mauboussin and Callahan, Measuring the Moat (2024), customer captivity.
 *  Q2: Porter, Competitive Strategy ch.7 (structural vs implementation strengths);
 *      Helmer, 7 Powers (counter-positioning).
 *  Q3: Porter ch.3 (goals and response profile), ch.1 and ch.12 (exit barriers).
 *  Q8: Helmer Part II (power fades when growth slows); Greenwald, Value Investing
 *      ch.7 (new generations of customers); Klein pre-mortem.
 *  Q4: Damodaran, Narrative and Numbers ch.7 (plausible alone, implausible in
 *      aggregate); Penman, Accounting for Value ch.3 (challenge the price).
 *  Q5-Q7 text is the owner's, verbatim. Hints: Q5 Porter ch.6 (buyers are not
 *      uniform, unused power); Q6 Porter ch.1 (substitutes to watch); Q7 Helmer
 *      (counter-positioning).
 *  comp2.relative_balance add-on: Ziegel, Fundamentals of Credit ch.4 and ch.6;
 *      S&P corporate methodology, financial policy. */
export const HEAD_TO_HEAD_TITLE = "Head to Head";

/** Asked before the comparison table is shown. */
export const headToHeadBefore: QualitativeGroup[] = [
  {
    title: HEAD_TO_HEAD_TITLE,
    questions: [
      {
        id: "comp.h2h.q1",
        text: "Why do customers choose {company} over its competitors, or the reverse? Describe the decision a real customer faces: price, quality, switching costs, relationships, habit. Then open the table: does it show the pattern your explanation predicts? If not, what did you miss?",
        hint: "Customers held by habit, search costs or switching costs accept price rises later; customers held only by price leave at the first cheaper offer.",
      },
    ],
  },
];

/** Asked under the comparison table. */
export const headToHeadAfter: QualitativeGroup[] = [
  {
    title: HEAD_TO_HEAD_TITLE,
    questions: [
      {
        id: "comp.h2h.q2",
        text: "The companies in this group earn their returns by different routes. What about how each one is built (its products, customers, operations, financing) makes its route possible, and does each route rest on something rivals cannot buy or build, or on how well today's managers run it? Whose route is hardest for the others to copy?",
        hint: "A route built on scale, captive customers or a model rivals would hurt themselves copying lasts; one built on better execution is easier to learn.",
      },
      {
        id: "comp.h2h.q3",
        text: "If the industry had two bad years, what would each company in this group actually do: cut prices, cut research, close sites, keep losing sites open, or buy a weaker rival? What in each company's history, owners, and management's past behavior tells you that, and whose move would hurt {company}'s margins most in those years?",
        hint: "A weak rival that cannot leave the industry fights hardest, and its price cuts set everyone's margins in a slump.",
      },
      {
        id: "comp.h2h.q5",
        text: "Taking {company}'s suppliers and customers as groups, who holds the power in the chain? Consider how many alternatives each side has, how costly switching is, and who needs whom more. Does the way profit is split along the chain match your answer, and is that balance shifting?",
        hint: "Customers inside one group rarely hold equal power, and power they do not use today can be used once their own margins are squeezed.",
      },
      {
        id: "comp.h2h.q6",
        text: "List the categories of substitutes that meet the same customer need as {company}. As a group, how serious is the threat: how does their price-performance compare, how easy is switching, and how willing are customers to switch? Which category is closest to pulling customers away, and what is {company} doing about it?",
        hint: "The substitutes to watch are the ones whose price-performance keeps improving or whose makers earn high profits and can afford to cut prices.",
      },
      {
        id: "comp.h2h.q7",
        text: "What stops a new company from entering {company}'s market: scale, brand, regulation, capital needed, access to customers or suppliers? Which of those barriers is weakening, and who is best placed to get through?",
        hint: "The most dangerous entrant often uses a business model the leaders will not copy, because copying it would hurt their existing business.",
      },
      {
        id: "comp.h2h.q8",
        text: "Five years from now, will {company} stand ahead of or behind the rivals in this group, and why? Which of {company}'s advantages are built into how the business works, and which will fade once growth slows or the next generation of products and customers arrives? Suppose it is five years later and your answer was wrong: name the one piece of evidence most likely to have shown it first.",
        hint: "Strong results during fast growth often fade once growth slows; an advantage lasts only if it also wins the next generation of customers.",
      },
      {
        id: "comp.h2h.q4",
        text: "The market values some of these companies more richly than others. What is it paying for that the numbers don't yet show, and can those beliefs all come true at once when these companies compete for the same customers? What would have to happen in the next two years to prove each belief right or wrong, and would you own {company} at today's price?",
        hint: "Rich prices across rivals often assume each one wins the same customers; added together, those hopes can exceed the market they share.",
      },
    ],
  },
];
