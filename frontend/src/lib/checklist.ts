// Company checklist (Erickson, Global Investing, "Own the Best and Leave the Rest").
// Text is placed VERBATIM from the source request: category titles, item wording,
// and the explanatory notes are unmodified (formatting only). Persisted per ticker
// via the existing Convex qualitativeAnswers table (section="individual",
// scopeKey=<ticker>, questionId=<item id>, answer="done" | "").

export interface ChecklistItem {
  id: string;
  text: string;
}

export interface ChecklistCategory {
  title: string;
  items: ChecklistItem[];
  /** Optional source note rendered (verbatim) under the category's items. */
  note?: string;
}

export const COMPANY_CHECKLIST: ChecklistCategory[] = [
  {
    title: "1. Earnings power & sustainability",
    items: [
      { id: "chk.earnings.revenue-sustainable", text: "Is the company's revenue stream sustainable? Will it grow or shrink?" },
      { id: "chk.earnings.profits-vs-competitors", text: "Does it generate similar or higher profits than its competitors?" },
    ],
  },
  {
    title: "2. Competitive advantage (the moat)",
    items: [
      { id: "chk.moat.driver", text: "What competitive advantage is driving the higher growth and profitability?" },
      { id: "chk.moat.sustainable", text: "Is that competitive advantage sustainable?" },
      { id: "chk.moat.rnd-leader", text: "Is the company an industry leader or a laggard in R&D?" },
      { id: "chk.moat.expansion", text: "Can it successfully expand into new regions or closely related markets?" },
    ],
    note: `Dorsey's framing makes this the central question: "What prevents a smart, well-financed competitor from competing away the company's profits?" A wide moat is what lets a firm keep earning high returns on capital for years, and analyzing the moat before a stock gets cheap tells you whether future trouble would be temporary or terminal.`,
  },
  {
    title: "3. Balance-sheet strength / risk",
    items: [
      { id: "chk.balance.debt-service", text: "Will the company be able to service its debt if the economy weakens?" },
    ],
  },
  {
    title: "4. Management quality & capital allocation",
    items: [
      { id: "chk.mgmt.experienced", text: "Is the management team experienced and focused, or untested/distracted?" },
      { id: "chk.mgmt.acquisition-record", text: "Will management grow by acquiring? If so, how good is their acquisition track record?" },
      { id: "chk.mgmt.comp-alignment", text: "Does the compensation structure align management with shareholder interests?" },
      { id: "chk.mgmt.returns-cash", text: "Is management committed to returning excess cash to shareholders?" },
    ],
    note: `Strategic Value Investing adds the "how to vet" step: read the proxy statement, 10-K/SEC filings, and earnings releases, and listen to analyst conference calls where professionals grill management, these reveal both hard facts and the quality of the management team. For acquirers specifically, judge whether a deal is accretive vs. dilutive to EPS, whether there are real strategic benefits/cost savings, and whether the price paid is reasonable.`,
  },
  {
    title: "5. Governance & conduct",
    items: [
      { id: "chk.governance.esg", text: "Does the company have sound economic, social, and governance (ESG) policies?" },
    ],
  },
  {
    title: "6. Valuation",
    items: [
      { id: "chk.valuation.attractive-price", text: "Is the company attractively priced versus competitors and in relation to its earnings power?" },
    ],
  },
];

// "Two usage notes from the source", rendered verbatim beneath the checklist.
export const CHECKLIST_USAGE_NOTES: string[] = [
  `Re-run it regularly. Erickson stresses it is not enough to answer these once, revisit the questions for each holding and its primary competitors on a recurring basis, so you catch a business about to decline or one showing emerging strength.`,
  `The summary signature of a good business (per the chapter): defensible, leading market positions in growing industries, astute management, strong balance sheets, and a strong social conscience. For deeper company analysis the author points you to Graham & Dodd's Security Analysis.`,
];

export const CHECKLIST_ITEM_COUNT = COMPANY_CHECKLIST.reduce((n, c) => n + c.items.length, 0);
