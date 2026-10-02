import { describe, expect, it } from "vitest";
import type { ConsensusYear, ForecastRow, NextTwoYearsRow } from "./types";
import {
  answerScope,
  buildProjectionsDeck,
  buildProjectionsOpening,
  consensusNotes,
  projectionsVisible,
  PROJECTIONS_COPY,
  PROJECTIONS_DECK_TITLE,
  PROJECTIONS_QUESTIONS,
  withVariantModel,
  YOUR_ESTIMATE_ID,
  yourEstimateSave,
} from "./projectionsDeck";

// The owner's wording, pasted, with {company} filled in as "Acme".
const Q1 = "Where will Acme's growth over the next two years come from? Name the customers, products or markets, and explain why they will spend more with Acme rather than a competitor or not at all. You can't use a forecast, guidance or past growth rate as your reason.";
const Q2 = "Management's guidance and analyst consensus each tell a story about Acme's next two years. What is that story, what has to happen in the real world for it to come true, and what have customers, suppliers or competitors done recently that supports or contradicts it? How reliably has management delivered on past guidance, and what do their incentives push them to promise?";
const Q3 = "Does Acme's recent growth show up everywhere it should (cash collected, customer numbers, hiring, supplier orders, industry data), or only in reported revenue and earnings? If earnings are expected to grow faster than the business itself, what is making up the difference and can it last? Where the evidence doesn't line up, give the most innocent explanation and the least innocent one.";
const Q4 = "If Acme grows the way you expect, how will competitors, customers and new entrants respond, and how does that change your view? Only then write your forecast for the next two years, and name one event in the next two to four quarters that would prove you wrong.";

describe("projections deck", () => {
  it("asks Q1 alone, before the tables", () => {
    const [g] = buildProjectionsOpening({ company: "Acme", dataContext: '{"a":1}' });
    expect(g.title).toBe(PROJECTIONS_DECK_TITLE);
    expect(g.title).toBe("Projections");
    expect(g.questions.map((q) => q.id)).toEqual(["indiv.projections.growth_source"]);
    expect(g.questions[0].text).toBe(Q1);
    expect(g.questions[0].dataContext).toBe('{"a":1}');
  });

  it("asks Q2 to Q4 in order under the table, word for word", () => {
    const [g] = buildProjectionsDeck({ company: "Acme", dataContext: "{}" });
    expect(g.title).toBe("Projections");
    expect(g.questions.map((q) => q.id)).toEqual([
      "indiv.projections.story",
      "indiv.projections.evidence",
      "indiv.projections.response",
    ]);
    expect(g.questions.map((q) => q.text)).toEqual([Q2, Q3, Q4]);
    for (const q of g.questions) expect(q.text).not.toContain("{company}");
  });

  it("has no em dash anywhere in the questions or the copy", () => {
    const copy = [
      ...PROJECTIONS_QUESTIONS.map((q) => q.text),
      PROJECTIONS_COPY.gate,
      PROJECTIONS_COPY.showAnyway,
      PROJECTIONS_COPY.doesNotTie("revenue", 2024),
      PROJECTIONS_COPY.databaseBehind,
      PROJECTIONS_COPY.noCoverage("revenue"),
    ];
    for (const s of copy) expect(s).not.toContain(String.fromCharCode(0x2014));
  });
});

describe("consensusNotes", () => {
  const year = (r: ConsensusYear["revenueHiddenReason"], e: ConsensusYear["epsHiddenReason"]): ConsensusYear => ({
    label: "current", fiscalYear: 2025, fiscalYearEnd: "2025-12",
    revenue: null, revenueHiddenReason: r, eps: null, epsHiddenReason: e,
  });

  it("writes one sentence per distinct reason and metric", () => {
    expect(consensusNotes([year("does_not_tie", "database_behind"), year("does_not_tie", "database_behind")], 2024)).toEqual([
      "Consensus revenue is not shown because Yahoo's figure for FY2024 does not match the reported accounts, which usually means a different share basis, a different currency, or earnings adjusted for one-off items.",
      "Consensus is not shown because the site's accounts are a year behind Yahoo's, so the years would not line up.",
    ]);
    expect(consensusNotes([year("no_coverage", "no_coverage")], 2024)).toEqual([
      "No analyst consensus is available for revenue.",
      "No analyst consensus is available for earnings per share.",
    ]);
    expect(consensusNotes([year(null, null)], 2024)).toEqual([]);
  });
});

describe("the gate and the save key", () => {
  it("saves under the page's route ticker, falling back to the resolved one", () => {
    expect(answerScope("GOOG", "GOOGL")).toBe("GOOG");
    expect(answerScope("BRK-A", "BRK.B")).toBe("BRK-A");
    expect(answerScope(undefined, "GOOGL")).toBe("GOOGL");
    expect(answerScope("", "GOOGL")).toBe("GOOGL");
    expect(yourEstimateSave(answerScope("GOOG", "GOOGL"), '{"revenue":{"y1":"12"}}')).toEqual({
      section: "individual",
      scopeKey: "GOOG",
      questionId: YOUR_ESTIMATE_ID,
      answer: '{"revenue":{"y1":"12"}}',
    });
  });

  it("shows the gate line until Q1 has a saved answer", () => {
    expect(projectionsVisible("", null, "GOOG")).toBe(false);
    expect(projectionsVisible("   \n", null, "GOOG")).toBe(false);
    expect(projectionsVisible("Cloud customers moving off rivals.", null, "GOOG")).toBe(true);
  });

  it("shows the tables anyway only for the scope the button was clicked on", () => {
    expect(projectionsVisible("", "GOOG", "GOOG")).toBe(true);
    expect(projectionsVisible("", "MSFT", "GOOG")).toBe(false);
  });
});

describe("withVariantModel", () => {
  const rows: NextTwoYearsRow[] = [
    { key: "revenue", lastReported: 100, model1: 110, model2: 120 },
    { key: "operatingMargin", lastReported: 0.2, model1: 0.21, model2: 0.22 },
    { key: "nopat", lastReported: 16, model1: 18, model2: 20 },
    { key: "reinvestment", lastReported: 5, model1: 6, model2: 7 },
    { key: "fcff", lastReported: 11, model1: 12, model2: 13 },
    { key: "roic", lastReported: 0.15, model1: 0.16, model2: 0.17 },
    { key: "eva", lastReported: 4, model1: 5, model2: 6 },
    { key: "eps", lastReported: 2, model1: null, model2: null },
  ];
  const row = (revenue: number, roic: number | null): ForecastRow => ({
    year: 1, growth: 0.1, revenue, operatingMargin: 0.3, ebit: 40, ebitAfterTax: 30, reinvestment: 8, fcff: 22, pvFcff: 20, roic,
  });

  it("keeps the block's own columns when the recommended structure is on screen", () => {
    expect(withVariantModel(rows, null)).toBe(rows);
  });

  it("reads the model columns from the structure's first two years, EVA n/a", () => {
    const out = withVariantModel(rows, [row(900, 0.4), row(950, null), row(999, 0.5)]);
    const by = Object.fromEntries(out.map((r) => [r.key, [r.lastReported, r.model1, r.model2]]));
    expect(by).toEqual({
      revenue: [100, 900, 950],
      operatingMargin: [0.2, 0.3, 0.3],
      nopat: [16, 30, 30],
      reinvestment: [5, 8, 8],
      fcff: [11, 22, 22],
      roic: [0.15, 0.4, null],
      eva: [4, null, null],
      eps: [2, null, null],
    });
  });

  it("shows every model cell as n/a when the structure has fewer than two years", () => {
    for (const v of [[], [row(900, 0.4)]]) {
      const out = withVariantModel(rows, v);
      expect(out.every((r) => r.model1 === null && r.model2 === null)).toBe(true);
      expect(out.map((r) => r.lastReported)).toEqual(rows.map((r) => r.lastReported));
    }
  });
});
