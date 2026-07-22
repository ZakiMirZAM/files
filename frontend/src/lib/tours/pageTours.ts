// Per-page "Show me this page" tours. Each is launched on demand from a page's
// SectionHeader or the header help menu, never auto-started. Every tour walks a
// first-time investor through the matrices on that stage and shows, with a live
// demo, how to open and read a metric's definition in the right-hand sidebar.
//
// Copy follows the app's beginner style: no em dashes, no analogies, short
// sentences, written for someone new to investing.
//
// The "read a definition" step opens a real definition in the sidebar so the user
// sees the panel appear (demoDef below). onEnter runs only when the step's target
// is found, and onLeave always pairs with it (see TourOverlay), so the panel never
// dangles. Definition numbers resolve through the global anyDefByNumber: economy
// metrics sit at ECON_PANEL_OFFSET + n, sector at 4xx, industry at 3xx,
// comparative at 2xx, individual at 1-180.

import type { Tour } from "../tourStore";
import { openDefinition, closeDefinition } from "../definitionPanelStore";
import { ECON_PANEL_OFFSET } from "../economicDefinitions";

/** Open a definition for the live demo step, then close it when the step is left. */
const demoDef = (n: number) => ({
  onEnter: () => openDefinition(n),
  onLeave: () => closeDefinition(),
});

export const ECONOMIC_TOUR: Tour = {
  id: "page-economic",
  version: 2,
  steps: [
    {
      id: "intro",
      route: "/app/economic",
      title: "Start with the whole economy",
      body: "Every company sails on the same tide. This first page reads that tide, the economy and the market, so you can tell whether conditions are helping businesses or working against them.",
      placement: "center",
    },
    {
      id: "treasury",
      route: "/app/economic",
      target: '[data-tour="econ-treasury"]',
      title: "What it costs to borrow",
      body: "Treasury yields are the interest the government pays to borrow. Open this and switch between 3 months and 10 years to see the price of money over time. Higher yields make borrowing dearer for everyone.",
      onMissing: "center",
      waitTimeout: 6000,
    },
    {
      id: "fed-model",
      route: "/app/economic",
      target: '[data-tour="econ-fed-model"]',
      title: "Stocks or bonds right now",
      body: "This sets the earnings yield of the S&P 500 against a safe Treasury yield. When stocks yield more, they look cheap next to bonds. When they yield less, they look expensive.",
      onMissing: "center",
      waitTimeout: 6000,
    },
    {
      id: "sp500",
      route: "/app/economic",
      target: '[data-tour="econ-sp500"]',
      title: "Is the market cheap or dear",
      body: "This estimates a fair value for the whole S&P 500 and the return it implies from today. A price well above fair value is a caution sign. Well below is an opportunity.",
      onMissing: "center",
      waitTimeout: 6000,
    },
    {
      id: "commodities",
      route: "/app/economic",
      target: '[data-tour="econ-commodities"]',
      title: "Raw materials",
      body: "Copper, oil, gold and more. Their prices hint at demand, inflation, and which sectors face higher input costs. Rising copper often signals a busy economy.",
      onMissing: "center",
      waitTimeout: 6000,
    },
    {
      id: "metrics",
      route: "/app/economic",
      target: '[data-tour="econ-metrics"]',
      title: "Open any measure",
      body: "Each row opens a chart over time. Below the chart sit ten short questions with a box to write your own answer, so the page becomes your worksheet and not just a reading.",
      onMissing: "center",
      waitTimeout: 6000,
    },
    {
      id: "define",
      route: "/app/economic",
      target: '[data-tour="econ-metrics"]',
      title: "Read the definition",
      body: "We just opened one on the right. Every measure has a plain definition like this. Use the widen button at the top of the panel for the longer ones, then close it and keep going.",
      placement: "left",
      onMissing: "center",
      waitTimeout: 6000,
      ...demoDef(ECON_PANEL_OFFSET + 1),
    },
    {
      id: "ai",
      route: "/app/economic",
      target: '[data-tour="ai-explain"]',
      title: "Ask for a plain answer",
      body: "Stuck on a measure or a question? Use Explain using AI for a clear, sourced answer drawn from a library of finance books and the web.",
      onMissing: "center",
      waitTimeout: 6000,
    },
  ],
};

export const ROTATION_TOUR: Tour = {
  id: "page-rotation",
  version: 3,
  steps: [
    {
      id: "intro",
      route: "/app/rotation",
      title: "Rank the sectors yourself",
      body: "This page is hands on. You tell it how the economy is leaning and it ranks the eleven sectors for you. All the work happens on your own device.",
      placement: "center",
    },
    {
      id: "matrix",
      route: "/app/rotation",
      target: '[data-tour="rotation-matrix"]',
      title: "Measures down, sectors across",
      body: "Each row is an economic measure and each column is a sector. A plus means the current reading helps that sector, a minus means it hurts. This grid is the engine behind the ranking.",
      onMissing: "center",
      waitTimeout: 6000,
    },
    {
      id: "define",
      route: "/app/rotation",
      target: '[data-tour="rotation-matrix"]',
      title: "Tap a measure to learn it",
      body: "Click an underlined measure name in the first column and its definition opens on the right, like Treasury yields here. Learn the measure, then set its reading with confidence.",
      placement: "left",
      onMissing: "center",
      waitTimeout: 6000,
      ...demoDef(ECON_PANEL_OFFSET + 13),
    },
    {
      id: "autofill",
      route: "/app/rotation",
      target: '[data-tour="rotation-autofill"]',
      title: "Start from the data",
      body: "Fill from data sets most rows to what the latest readings show. It is a starting point, not an answer. Change any row you read differently, and set the few rows that have no data feed yourself.",
      onMissing: "center",
      waitTimeout: 6000,
    },
    {
      id: "weights",
      route: "/app/rotation",
      target: '[data-tour="rotation-weights"]',
      title: "Set the weights",
      body: "Each control says how much a measure counts and which way it points. Change one and the ranking updates the instant you do.",
      onMissing: "center",
      waitTimeout: 6000,
    },
    {
      id: "ranked",
      route: "/app/rotation",
      target: '[data-tour="rotation-ranked"]',
      title: "Your ranked sectors",
      body: "This pinned strip shows the winners from your settings, highest score first. Click any sector to open its detail page and go deeper.",
      onMissing: "center",
      waitTimeout: 6000,
    },
  ],
};

export const SECTOR_TOUR: Tour = {
  id: "page-sector",
  version: 1,
  steps: [
    {
      id: "intro",
      title: "A sector is a big slice of the market",
      body: "A sector groups many related businesses, like all of technology or all of energy. This page shows how the whole slice is doing before you dig into the parts.",
      placement: "center",
    },
    {
      id: "scorecard",
      target: '[data-tour="sector-scorecard"]',
      title: "The sector at a glance",
      body: "These are size-weighted averages for the sector. Look for the ROIC minus WACC spread. When it is positive the sector earns more than its money costs, which is the heart of value creation.",
      onMissing: "center",
      waitTimeout: 6000,
    },
    {
      id: "define",
      target: '[data-tour="sector-scorecard"]',
      title: "Read any measure",
      body: "Click an underlined measure and its definition opens on the right, like the ROIC minus WACC spread we just opened. Widen the panel with the button at its top for the longer ones.",
      placement: "left",
      onMissing: "center",
      waitTimeout: 6000,
      ...demoDef(434),
    },
    {
      id: "industries",
      target: '[data-tour="sector-industries"]',
      title: "Compare the industries inside",
      body: "This table breaks the sector into its industries. Green is stronger and red is weaker for each measure. Click an industry name to go a level deeper.",
      onMissing: "center",
      waitTimeout: 6000,
    },
  ],
};

export const INDUSTRY_TOUR: Tour = {
  id: "page-industry",
  version: 1,
  steps: [
    {
      id: "intro",
      title: "An industry is a narrow slice",
      body: "An industry is a focused group inside a sector, like software or oil drillers. This page averages every listed company in it into one scorecard.",
      placement: "center",
    },
    {
      id: "scorecard",
      target: '[data-tour="industry-scorecard"]',
      title: "The industry scorecard",
      body: "Read these averages to judge the industry as a whole. Strong, steady margins and returns hint at a group with real pricing power.",
      onMissing: "center",
      waitTimeout: 6000,
    },
    {
      id: "define",
      target: '[data-tour="industry-scorecard"]',
      title: "Learn a measure as you go",
      body: "Click any underlined measure for a plain definition on the right, like the ROIC one open now. The widen button helps with the longer, table-heavy ones.",
      placement: "left",
      onMissing: "center",
      waitTimeout: 6000,
      ...demoDef(306),
    },
  ],
};

export const COMPARATIVE_TOUR: Tour = {
  id: "page-comparative",
  version: 1,
  steps: [
    {
      id: "intro",
      title: "Put the companies side by side",
      body: "Now you compare the leading companies in one industry against each other. The strongest names tend to stand out across several measures at once.",
      placement: "center",
    },
    {
      id: "scorecard",
      target: '[data-tour="comparative-scorecard"]',
      title: "Read across the row",
      body: "Each column is a company and each row is a measure. Scan a row to see who leads and who lags. Click any single cell to open that one company's history for that measure.",
      onMissing: "center",
      waitTimeout: 6000,
    },
    {
      id: "define",
      target: '[data-tour="comparative-scorecard"]',
      title: "Open the definition too",
      body: "Click an underlined measure name to read what it means, like the Return on Equity panel we just opened on the right. Knowing the measure is how you read the table with judgement.",
      placement: "left",
      onMissing: "center",
      waitTimeout: 6000,
      ...demoDef(205),
    },
  ],
};

export const INDIVIDUAL_TOUR: Tour = {
  id: "page-individual",
  version: 2,
  steps: [
    {
      id: "intro",
      route: "/app/individual",
      title: "Now zoom in on one company",
      body: "This is the final stage. Here you build a full picture of a single company and decide whether it is worth its price. Pick a company to begin.",
      placement: "center",
    },
    {
      id: "search",
      route: "/app/individual",
      target: '[data-tour="ticker-search"]',
      title: "Search by symbol",
      body: "Type a symbol like AAPL and choose a result. The whole report builds underneath, thirteen years of figures and a checklist.",
      onMissing: "center",
    },
    {
      id: "valuation",
      target: '[data-tour="individual-valuation"]',
      title: "What is it worth",
      body: "Once a company is open, this card estimates a fair value and a margin of safety, the gap between that value and today's price. A wide gap is what a value investor hunts for.",
      onMissing: "center",
      waitTimeout: 6000,
    },
    {
      id: "history",
      target: '[data-tour="individual-history"]',
      title: "Thirteen years of figures",
      body: "Each chart shows one measure over time. Use the Level and YoY toggle to switch between the raw number and its year-over-year change. Trends matter more than any single year.",
      onMissing: "center",
      waitTimeout: 6000,
    },
    {
      id: "define",
      target: '[data-tour="individual-history"]',
      title: "Click a measure to learn it",
      body: "Any underlined measure opens a definition on the right, like the Return on Equity one we just opened. This is how you learn a new idea while you study a real company.",
      placement: "left",
      onMissing: "center",
      waitTimeout: 6000,
      ...demoDef(2),
    },
    {
      id: "checklist",
      target: '[data-tour="individual-checklist"]',
      title: "Score the soft stuff",
      body: "Numbers are only half the story. The checklist walks you through the durable advantages and the risks, so your judgement sits on record next to the figures.",
      onMissing: "center",
      waitTimeout: 6000,
    },
  ],
};

export const REPORT_TOUR: Tour = {
  id: "page-report",
  version: 1,
  steps: [
    {
      id: "intro",
      route: "/app/report",
      title: "Your Final Report",
      body: "This page gathers your written answers and notes into one document. You can edit the text and export it as a PDF.",
      placement: "center",
    },
    {
      id: "ai",
      route: "/app/report",
      target: '[data-tour="ai-explain"]',
      title: "Get help while you write",
      body: "Use Explain using AI on any question to get a plain, sourced explanation.",
      onMissing: "center",
      waitTimeout: 6000,
    },
  ],
};

export const SIMULATOR_TOUR: Tour = {
  id: "page-simulator",
  version: 1,
  steps: [
    {
      id: "intro",
      route: "/app/simulator",
      title: "Practice with virtual money",
      body: "This is a paper-trading account with 100,000 dollars to practice on. Nothing here is real, so you can test ideas freely and learn from the result.",
      placement: "center",
    },
    {
      id: "trade",
      route: "/app/simulator",
      target: '[data-tour="sim-trade"]',
      title: "Buy and sell",
      body: "Open a trade ticket to search any symbol, including international names, and buy or sell at the latest price. Your portfolio values everything in US dollars.",
      onMissing: "center",
      waitTimeout: 6000,
    },
    {
      id: "lessons",
      route: "/app/simulator",
      title: "Lessons and questions",
      body: "The Lessons tab teaches index-fund and portfolio-management principles drawn from the book library. The Investor's Questions tab carries the exact questions from every stage of analysis, so you can run your holdings through them.",
      placement: "center",
    },
  ],
};

export const PICKER_TOUR: Tour = {
  id: "page-picker",
  version: 2,
  steps: [
    {
      id: "intro",
      title: "Choose where to look next",
      body: "This page lists your options for the next stage. Each tile gives a quick read on growth, profit margins, and debt before you open it.",
      placement: "center",
    },
    {
      id: "scorecard",
      target: '[data-tour="picker-scorecard"]',
      title: "Compare them first",
      body: "On the sector page this table lines every sector up side by side. Scan it to see which groups look healthy before you pick one.",
      onMissing: "skip",
      waitTimeout: 3000,
    },
    {
      id: "define",
      target: '[data-tour="picker-scorecard"]',
      title: "Read any measure",
      body: "Click an underlined measure to open its definition on the right, like the ROIC panel here. The same panel appears on every page in the app.",
      placement: "left",
      onMissing: "skip",
      waitTimeout: 3000,
      ...demoDef(406),
    },
    {
      id: "list",
      target: '[data-tour="picker-list"]',
      title: "Browse or search",
      body: "Browse the tiles, or type to filter them. Open one to drop into the next stage of the analysis.",
      onMissing: "center",
    },
  ],
};
