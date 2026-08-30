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
      body: "Every company works inside the same economy. This first page reads that economy and the market as a whole, so you can tell whether conditions are helping businesses right now or working against them. You do not need to understand every measure here. Two or three is enough to start.",
      placement: "center",
    },
    {
      id: "treasury",
      route: "/app/economic",
      target: '[data-tour="econ-treasury"]',
      title: "What it costs to borrow",
      body: "Treasury yields are the interest the government pays to borrow. Open this and switch between 3 months and 10 years to see how the price of money has moved. When yields rise, borrowing gets more expensive for every company too.",
      onMissing: "center",
      waitTimeout: 6000,
    },
    {
      id: "fed-model",
      route: "/app/economic",
      target: '[data-tour="econ-fed-model"]',
      title: "Stocks or bonds right now",
      body: "This compares what shares earn against what safe government bonds pay. When shares yield more, they look cheap next to bonds. When they yield less, they look expensive. It is one quick read on where money is better off today.",
      onMissing: "center",
      waitTimeout: 6000,
    },
    {
      id: "sp500",
      route: "/app/economic",
      target: '[data-tour="econ-sp500"]',
      title: "Is the market cheap or dear",
      body: "This estimates a fair value for the whole US market and the return that implies from today's price. A price well above fair value is a reason for caution. Well below is a reason to look harder.",
      onMissing: "center",
      waitTimeout: 6000,
    },
    {
      id: "commodities",
      route: "/app/economic",
      target: '[data-tour="econ-commodities"]',
      title: "Raw materials",
      body: "Copper, oil, gold and more. These prices hint at demand, at inflation, and at which industries are about to face higher costs. Rising copper usually points to a busy economy.",
      onMissing: "center",
      waitTimeout: 6000,
    },
    {
      id: "metrics",
      route: "/app/economic",
      target: '[data-tour="econ-metrics"]',
      title: "Open any measure",
      body: "Click any row to open a chart of that measure over time, with its definition underneath. Below the chart are ten short questions and a box for your own answer. Answer what you can. Those answers carry through to your Final Report at the end.",
      onMissing: "center",
      waitTimeout: 6000,
    },
    {
      id: "define",
      route: "/app/economic",
      target: '[data-tour="econ-metrics"]',
      title: "Every measure has a definition",
      body: "We just opened one on the right for you. Every measure in the app has a plain definition like this, one click away. Use the widen button at the top for longer entries, then close it and carry on. Nothing is lost when you close it.",
      placement: "left",
      onMissing: "center",
      waitTimeout: 6000,
      ...demoDef(ECON_PANEL_OFFSET + 1),
    },
    {
      id: "ai",
      route: "/app/economic",
      target: '[data-tour="ai-explain"]',
      title: "Ask when you are stuck",
      body: "If a measure or a question does not make sense, highlight it and use Explain using AI. You get a plain, sourced answer drawn from a library of finance books and the web, written for what is on your screen.",
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
      body: "This page is hands on. You tell it how the economy is leaning and it ranks the eleven sectors for you. If you are new, use the Fill from data button first and adjust from there. All the work happens on your own device.",
      placement: "center",
    },
    {
      id: "matrix",
      route: "/app/rotation",
      target: '[data-tour="rotation-matrix"]',
      title: "Measures down, sectors across",
      body: "Each row is an economic measure and each column is a sector. A plus means the current reading helps that sector and a minus means it hurts it. This grid is what drives the ranking, so changing a row changes the answer.",
      onMissing: "center",
      waitTimeout: 6000,
    },
    {
      id: "define",
      route: "/app/rotation",
      target: '[data-tour="rotation-matrix"]',
      title: "Click a measure to learn it",
      body: "Click any underlined measure name in the first column and its definition opens on the right, as Treasury yields has here. Read the measure first, then set its reading. Guessing on a measure you have not read is the main way this page goes wrong.",
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
      body: "Start here. Fill from data sets most rows to what the latest readings show, which saves you filling in a blank grid. Treat it as a first draft, not an answer. Change any row you read differently, and set the few rows with no data feed yourself.",
      onMissing: "center",
      waitTimeout: 6000,
    },
    {
      id: "weights",
      route: "/app/rotation",
      target: '[data-tour="rotation-weights"]',
      title: "Set the weights",
      body: "Each control sets how much a measure counts and which way it points. Change one and the ranking below updates immediately, so you can see what your own view actually implies.",
      onMissing: "center",
      waitTimeout: 6000,
    },
    {
      id: "ranked",
      route: "/app/rotation",
      target: '[data-tour="rotation-ranked"]',
      title: "Your ranked sectors",
      body: "This strip stays pinned and shows the leaders from your own settings, highest score first. Click any sector to open it and go a level deeper, which is the next stage.",
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
      body: "A sector groups many related businesses, such as all of technology or all of energy. This page shows how the whole group is doing, which is worth knowing before you spend time on any single company inside it.",
      placement: "center",
    },
    {
      id: "scorecard",
      target: '[data-tour="sector-scorecard"]',
      title: "The sector at a glance",
      body: "These are averages for the whole sector, weighted by company size. If you read one line here, read the ROIC minus WACC spread. When it is positive, the group earns more than its money costs, which is what creating value actually means.",
      onMissing: "center",
      waitTimeout: 6000,
    },
    {
      id: "define",
      target: '[data-tour="sector-scorecard"]',
      title: "Read any measure",
      body: "Click any underlined measure and its definition opens on the right, as the ROIC minus WACC spread has here. Use the widen button at the top of the panel for the longer entries.",
      placement: "left",
      onMissing: "center",
      waitTimeout: 6000,
      ...demoDef(434),
    },
    {
      id: "industries",
      target: '[data-tour="sector-industries"]',
      title: "Compare the industries inside",
      body: "This table splits the sector into its industries, which are the columns. Green is stronger and red is weaker on each measure, so scan a row to see which industries lead. Click an industry heading to open it, which is the next stage.",
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
      body: "An industry is a focused group inside a sector, such as software or oil drillers. This page averages every listed company in that group into one scorecard, so you can judge the group before you judge a company.",
      placement: "center",
    },
    {
      id: "scorecard",
      target: '[data-tour="industry-scorecard"]',
      title: "The industry scorecard",
      body: "Read these averages to judge the industry as a whole. Margins and returns that are both strong and steady usually mean the group can set its own prices, which is a good sign for any company in it.",
      onMissing: "center",
      waitTimeout: 6000,
    },
    {
      id: "define",
      target: '[data-tour="industry-scorecard"]',
      title: "Learn a measure as you go",
      body: "Click any underlined measure for a plain definition on the right, as the ROIC one is now. The widen button at the top helps with the longer, table-heavy entries.",
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
      body: "Now you compare the leading companies of one industry against each other. Do not look for a company that wins one measure. Look for one that holds up across several at once.",
      placement: "center",
    },
    {
      id: "scorecard",
      target: '[data-tour="comparative-scorecard"]',
      title: "How to read this table",
      body: "Each row is one company and each column is one measure. Read down a column to see who leads and who lags on that measure, and read across a row to see the whole profile of one company. Click any cell to open that company's history for that measure, and click a company symbol to open its full report.",
      onMissing: "center",
      waitTimeout: 6000,
    },
    {
      id: "define",
      target: '[data-tour="comparative-scorecard"]',
      title: "Open the definitions too",
      body: "Click any underlined measure name to read what it means, as the Return on Equity panel has opened on the right. A column of colored numbers only tells you something once you know what the column is measuring.",
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
      body: "This is the last stage of the analysis. Here you build a full picture of one company and decide whether it is worth its price. Pick a company to begin, and a symbol you already recognize is the easiest place to start.",
      placement: "center",
    },
    {
      id: "search",
      route: "/app/individual",
      target: '[data-tour="ticker-search"]',
      title: "Search by symbol",
      body: "Type a symbol such as AAPL and choose a result, or use one of the quick-pick buttons. The whole report then builds underneath: thirteen years of figures, a value estimate, and a checklist.",
      onMissing: "center",
    },
    {
      id: "valuation",
      target: '[data-tour="individual-valuation"]',
      title: "What is it worth",
      body: "This is the answer the whole app builds toward. Once a company is open, this card estimates what a share is worth and shows the margin of safety, which is the gap between that estimate and today's price. A wide gap gives you room to be wrong and still do all right.",
      onMissing: "center",
      waitTimeout: 6000,
    },
    {
      id: "history",
      target: '[data-tour="individual-history"]',
      title: "Thirteen years of figures",
      body: "Each chart shows one measure over time. Use the Level and YoY toggle to switch between the raw number and its change from the year before. Read the direction of the line first. A single year tells you very little on its own.",
      onMissing: "center",
      waitTimeout: 6000,
    },
    {
      id: "define",
      target: '[data-tour="individual-history"]',
      title: "Click a measure to learn it",
      body: "Any underlined measure opens a definition on the right, as Return on Equity has here. This is the easiest way to learn a new idea, because you are learning it against a real company instead of in the abstract.",
      placement: "left",
      onMissing: "center",
      waitTimeout: 6000,
      ...demoDef(2),
    },
    {
      id: "checklist",
      target: '[data-tour="individual-checklist"]',
      title: "Score the soft stuff",
      body: "Numbers are only half the story. This checklist walks you through the company's lasting advantages and its risks, and puts your judgement on record next to the figures. Your answers here carry into the Final Report.",
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
      body: "This page gathers everything you typed along the way into one document. Nothing needs copying across, it is already here. You can edit the text and export it as a PDF.",
      placement: "center",
    },
    {
      id: "ai",
      route: "/app/report",
      target: '[data-tour="ai-explain"]',
      title: "Get help while you write",
      body: "Stuck on a question here? Use Explain using AI on it for a plain, sourced explanation, then write your own answer in your own words.",
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
      body: "This is a practice account with 100,000 pretend dollars. None of it is real money, so this is the safe place to test what you concluded in your analysis and watch how it plays out.",
      placement: "center",
    },
    {
      id: "trade",
      route: "/app/simulator",
      target: '[data-tour="sim-trade"]',
      title: "Buy and sell",
      body: "Open a trade ticket to search any symbol, including companies listed outside the US, and buy or sell at the latest price. Your portfolio is valued in US dollars throughout.",
      onMissing: "center",
      waitTimeout: 6000,
    },
    {
      id: "lessons",
      route: "/app/simulator",
      title: "Lessons and questions",
      body: "The Lessons tab teaches index-fund and portfolio principles drawn from the book library, and is a good place to start if the trading side feels unfamiliar. The Investor's Questions tab carries the exact questions from every stage of the analysis, so you can put your own holdings through them.",
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
      body: "This page lists your options for the next stage. Each tile gives a quick read on growth, profit margins, and debt, so you can rule things out before you open anything.",
      placement: "center",
    },
    {
      id: "scorecard",
      target: '[data-tour="picker-scorecard"]',
      title: "Compare them first",
      body: "This table lines every option up side by side. Scan it before you start clicking tiles, so you pick a healthy group rather than the first name you recognize.",
      onMissing: "skip",
      waitTimeout: 3000,
    },
    {
      id: "define",
      target: '[data-tour="picker-scorecard"]',
      title: "Read any measure",
      body: "Click any underlined measure to open its definition on the right, as the ROIC panel has here. This same panel works on every page of the app, so this one habit covers everything.",
      placement: "left",
      onMissing: "skip",
      waitTimeout: 3000,
      ...demoDef(406),
    },
    {
      id: "list",
      target: '[data-tour="picker-list"]',
      title: "Browse or search",
      body: "Browse the tiles, or type in the box to filter them by name. Open one to move into the next stage of the analysis.",
      onMissing: "center",
    },
  ],
};
