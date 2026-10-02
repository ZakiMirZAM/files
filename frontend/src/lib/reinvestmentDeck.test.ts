import { describe, expect, it } from "vitest";
import type { CapexSplitBlock, CapexSplitYear, RndAdjusted } from "./types";
import {
  REINVESTMENT_COPY,
  REINVESTMENT_DECK_TITLE,
  REINVESTMENT_QUESTIONS,
  buildReinvestmentDeck,
  capexSplitNotes,
  joinFiscalYears,
  rndNotes,
} from "./reinvestmentDeck";

// The owner's questions, pasted word for word.
const VERBATIM: Array<[string, string]> = [
  [
    "indiv.reinvest.upkeep_burden",
    "What does {company} have to keep spending on, whether equipment, research, people or marketing, just to stay where it is? What forces (competition, technology change, regulation, customer expectations) drive that burden, is it getting heavier or lighter, and how does that change what its reported profits are actually worth?",
  ],
  [
    "indiv.reinvest.rd_building",
    "What is {company}'s research spending actually building: new products, defending existing ones, or catching up to competitors? Using management's statements, the product history and how rivals spend, argue whether it deserves to be treated as an investment at all.",
  ],
  [
    "indiv.reinvest.return_source",
    "Where do {company}'s returns on capital really come from: a durable advantage (brand, switching costs, scale, network effects, patents), leverage and accounting choices, or a favorable point in the industry cycle? What evidence supports each explanation, and which one would you bet on?",
  ],
  [
    "indiv.reinvest.allocation",
    "How has management chosen between upkeep, growth, research, acquisitions and returning cash to shareholders? What does that pattern say about their priorities and discipline, and do their stated strategy and actual spending agree?",
  ],
  [
    "indiv.reinvest.market_future",
    "The market price assumes a certain future for {company}. What would have to be true about its industry, competitors and management's reinvestment choices for that future to happen, and what is the most likely reason it won't?",
  ],
  [
    "indiv.reinvest.disconfirm",
    "Pick the conclusion from this analysis you are most confident in. What evidence outside the financial statements would change your mind, and have you looked for it?",
  ],
  [
    "indiv.reinvest.verdict",
    "Weighing the spending breakdown, the research treatment, returns, valuation and your qualitative judgment together: will {company}'s investment today earn more than it costs, and is that already reflected in the price? Which factor weighed most in your verdict, and why that one over the others?",
  ],
];

const allCopy = (): string[] => {
  const { tax, ...rest } = REINVESTMENT_COPY;
  return [...Object.values(rest), ...Object.values(tax)];
};

describe("reinvestment deck", () => {
  it("has unique ids in the owner's order", () => {
    const ids = REINVESTMENT_QUESTIONS.map((q) => q.id);
    expect(ids).toEqual(VERBATIM.map(([id]) => id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("places every question word for word", () => {
    REINVESTMENT_QUESTIONS.forEach((q, i) => expect(q.text).toBe(VERBATIM[i][1]));
  });

  it("fills {company} everywhere and nothing else", () => {
    const [group] = buildReinvestmentDeck({ company: "Acme Corp", dataContext: "{}" });
    expect(group.title).toBe(REINVESTMENT_DECK_TITLE);
    expect(group.title).toBe("Reinvestment and Value");
    group.questions.forEach((q, i) => {
      expect(q.text).not.toContain("{company}");
      expect(q.text).toBe(VERBATIM[i][1].split("{company}").join("Acme Corp"));
      expect(q.dataContext).toBe("{}");
    });
  });

  it("has no em dash in any deck or copy string", () => {
    for (const s of [REINVESTMENT_DECK_TITLE, ...REINVESTMENT_QUESTIONS.map((q) => q.text), ...allCopy()]) {
      expect(s).not.toContain(String.fromCharCode(0x2014));
    }
  });
});

describe("joinFiscalYears", () => {
  it("joins one, two and three years", () => {
    expect(joinFiscalYears([2021])).toBe("FY2021");
    expect(joinFiscalYears([2021, 2022])).toBe("FY2021 and FY2022");
    expect(joinFiscalYears([2020, 2021, 2022])).toBe("FY2020, FY2021 and FY2022");
  });
});

describe("section notes", () => {
  const year = (y: number, method: CapexSplitYear["method"]): CapexSplitYear => ({
    year: y,
    method,
    capitalSpending: null,
    ppeToSales: null,
    revenueChange: null,
    revenueChangeNominal: null,
    inflation: null,
    acquiredRevenue: null,
    growthSpending: null,
    upkeepSpending: null,
    depreciation: null,
    upkeepToDepreciation: null,
    profitOverstatement: null,
  });

  it("picks the capex notes that apply", () => {
    const c: CapexSplitBlock = {
      applicable: true,
      currency: "EUR",
      inflationAdjusted: false,
      acquisitionsAdjusted: true,
      capitalLight: true,
      years: [year(2020, "dda_proxy_insufficient"), year(2021, "dda_proxy_insufficient"), year(2022, "greenwald"), year(2023, "dda_proxy_floor")],
    };
    expect(capexSplitNotes(c, "Acme")).toEqual([
      "Net property, plant and equipment is under 5% of revenue, so the split between upkeep and growth spending means little for a capital-light company like Acme.",
      "Revenue change is not adjusted for inflation here, because the site holds US inflation only and Acme reports in EUR.",
      "Revenue change also removes an estimate of the revenue bought through acquisitions, since that capacity was paid for as an acquisition rather than as capital spending.",
      "In FY2020 and FY2021 upkeep is set to depreciation, because the history was too short to measure the equipment needed per $1 of sales.",
      "In FY2023 upkeep is set to depreciation, because the estimate came out below a quarter of depreciation, which is not credible.",
    ]);
    expect(capexSplitNotes({ applicable: true, currency: "USD", inflationAdjusted: false }, "Acme")).toEqual([]);
  });

  it("picks the R&D notes that apply", () => {
    const r: RndAdjusted = {
      applicable: true,
      life: 5,
      yearsOfHistoryUsed: 4,
      lifeSource: "industry",
      lifeIndustry: "software",
      taxMethod: "footnote_capitalized",
      taxFiscalYear: 2024,
    };
    expect(rndNotes(r)).toEqual([
      "Research is written off over 5 years, the usual life for software.",
      "Only 4 years of research spending are on file, so the research asset is understated.",
      "Tax treatment: capitalized for tax. The FY2024 income-tax footnote reports a deferred tax asset for capitalized research.",
    ]);
    expect(rndNotes({ applicable: true, life: 3, yearsOfHistoryUsed: 4, lifeSource: "default" })).toEqual([
      "Research is written off over 3 years, the default when the industry has no standard life.",
    ]);
  });
});
