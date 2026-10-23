import { describe, expect, it } from "vitest";
import type { SpreadsData } from "./stageContext/types";
import { BOX_QUESTIONS, DECK_A, DECK_B } from "./comparisonQuestions";
import {
  bindBoxQuestion,
  bindDeckQuestion,
  comparisonContext,
  directionOf,
  fifthRows,
  groupedRows,
  hasHistory,
  isHidden,
  largestGapRow,
  tutorGuidance,
} from "./comparisonSection";

const m = (label: string, unit: string, company: number | null, ind: number | null, grp: number | null, rank = 5, count = 20) => ({
  label, unit, company, industryMedian: ind, groupMedian: grp,
  gapIndustry: company != null && ind != null ? company - ind : null,
  gapGroup: company != null && grp != null ? company - grp : null,
  rank, count,
});

function payload(over: Partial<SpreadsData> = {}): SpreadsData {
  return {
    applicable: true,
    peerCount: 20,
    groupFirmCount: 8,
    groupLabel: "High R&D intensity, high value-added share",
    fiscalYear: 2025,
    metrics: {
      revenue_growth: m("Revenue Growth", "%", 30, 10, 12, 2),
      operating_margin: m("Operating Margin", "%", 20, 25, 18, 8),
      sales_invested_capital: m("Sales / Invested Capital", "x", 1.5, 1.0, 1.2, 4),
      asset_turnover: m("DuPont · Asset Turnover", "x", 0.8, 0.7, 0.75, 6),
      roic: m("ROIC", "%", 40, 12, 15, 1),
      roic_wacc_spread: m("ROIC − WACC Spread", "%", 30, 3, 5, 1),
      net_debt_ocf: m("Net Debt / OCF", "x", -0.5, 1.0, 0.8, 19),
      fcf_net_income: m("FCF / Net Income", "x", 0.9, 0.9, 0.95, 10),
      pe: m("P/E Ratio", "x", 50, 25, 30, 3),
    },
    ...over,
  };
}

const AVAIL = { segments: true, filings: true, group: true };

function bind(p: SpreadsData) {
  const out: Record<string, ReturnType<typeof bindBoxQuestion>> = {};
  for (const q of BOX_QUESTIONS) out[q.id] = bindBoxQuestion(q, p, "Acme", AVAIL);
  return out;
}

describe("layout", () => {
  it("groups rows under the owner's headings, empty headings dropped, rest under Other", () => {
    const g = groupedRows(payload());
    expect(g.map((x) => x.heading)).toEqual(["Growth", "Pricing and costs", "Capital", "Returns", "Risk and cash", "Other"]);
    expect(g.find((x) => x.heading === "Other")!.keys).toEqual(["pe"]);
  });
});

describe("direction", () => {
  it("reads against the group median when the group has 5 or more firms", () => {
    // operating margin 20: below industry 25, above group 18
    expect(directionOf(payload(), "operating_margin")).toBe("above");
  });
  it("falls back to the industry median below 5 group firms", () => {
    expect(directionOf(payload({ groupFirmCount: 4 }), "operating_margin")).toBe("below");
  });
  it("is null when equal or missing", () => {
    const p = payload({ groupFirmCount: 3 });
    expect(directionOf(p, "fcf_net_income")).toBeNull(); // 0.9 vs industry 0.9
    expect(directionOf(p, "nope")).toBeNull();
  });
});

describe("box binding", () => {
  it("shows the variant that matches the data, with company filled in", () => {
    const b = bind(payload());
    const growth = b["cmp.box.growth.pace"];
    expect(!isHidden(growth) && growth.text).toBe("Acme grows faster than its group. What is it doing that its rivals aren't?");
    const lev = b["cmp.box.risk.leverage"];
    expect(!isHidden(lev) && lev.text).toBe(
      "Acme carries less debt than its rivals. Is that caution, or does its business simply not need to borrow?",
    );
  });

  it("hides questions whose rows the table does not carry", () => {
    const b = bind(payload());
    for (const id of ["cmp.box.pricing.overhead", "cmp.box.pricing.switching", "cmp.box.wc.collect",
      "cmp.box.wc.inventory", "cmp.box.wc.power", "cmp.box.risk.volatility"]) {
      expect(isHidden(b[id])).toBe(true);
    }
  });

  it("lists only the mapped rows when some are missing", () => {
    const markup = bind(payload())["cmp.box.pricing.markup"];
    expect(!isHidden(markup) && markup.rowsLine).toBe("Operating Margin");
  });

  it("capital-light follow-up shows only for less capital per dollar of sales", () => {
    expect(isHidden(bind(payload())["cmp.box.capital.replace"])).toBe(false);
    const heavy = payload();
    heavy.metrics!.sales_invested_capital = m("Sales / Invested Capital", "x", 0.5, 1.0, 1.2);
    expect(isHidden(bind(heavy)["cmp.box.capital.replace"])).toBe(true);
    const cap = bind(heavy)["cmp.box.capital.intensity"];
    expect(!isHidden(cap) && cap.text).toBe("What does Acme's extra capital buy it that its rivals don't have?");
  });

  it("hides the When question with no history and shows it with history", () => {
    expect(isHidden(bind(payload())["cmp.box.when"])).toBe(true);
    const withHist = payload({
      history: {
        roic: [
          { year: 2024, company: 1, industryMedian: 1, groupMedian: 1 },
          { year: 2025, company: 2, industryMedian: 1, groupMedian: 1 },
        ],
      },
    });
    expect(hasHistory(withHist)).toBe(true);
    expect(isHidden(bind(withHist)["cmp.box.when"])).toBe(false);
  });
});

describe("row rules", () => {
  it("top or bottom fifth by rank (count 20: ranks 1-4 and 17-20)", () => {
    expect(fifthRows(payload()).sort()).toEqual(
      ["net_debt_ocf", "pe", "revenue_growth", "roic", "roic_wacc_spread", "sales_invested_capital"],
    );
  });
  it("largest gap in percent of the benchmark, over business rows only", () => {
    // roic_wacc_spread (5.0) and pe are excluded as derived/market rows;
    // net_debt_ocf (-0.5 vs 0.8) is skipped for opposite signs.
    // Left: roic 25/15 = 1.67, revenue_growth 18/12 = 1.5, ...
    expect(largestGapRow(payload())).toBe("roic");
    const p = payload();
    p.metrics!.roic = m("ROIC", "%", 40, 0.5, 0.5); // near-zero benchmark
    expect(largestGapRow(p)).toBe("revenue_growth");
    p.metrics!.revenue_growth = m("Revenue Growth", "%", 3, -1, -1.5); // opposite sign
    expect(largestGapRow(p)).not.toBe("revenue_growth");
  });
});

describe("decks", () => {
  it("hides deck questions with no mapped rows and keeps questions that name no table row", () => {
    const p = payload();
    const a = DECK_A.questions.map((q) => bindDeckQuestion(q, p, "Acme", DECK_A.title));
    expect(a.filter(isHidden).map((q) => q.id)).toEqual(["cmp.a.3", "cmp.a.7"]);
    const b = DECK_B.questions.map((q) => bindDeckQuestion(q, p, "Acme", DECK_B.title));
    expect(b.filter(isHidden).map((q) => q.id)).toEqual(["cmp.b.1", "cmp.b.2", "cmp.b.4", "cmp.b.5"]);
  });

  it("tutor guidance carries the answer and the listed follow-ups, and withholds the reading until asked", () => {
    const g = tutorGuidance({ answer: "Because margins are high.", attempt: 1, followUps: ["Why that one?"], giveReading: false });
    expect(g).toContain("- Why that one?");
    expect(g).toContain("READER'S ANSWER (attempt 1):\nBecause margins are high.");
    expect(g).toContain("Do not give your own answer");
    expect(tutorGuidance({ answer: "x", attempt: 2, followUps: [], giveReading: true })).toContain("give your own reading");
  });
});

describe("AI context", () => {
  it("marks the question's rows and carries the filings", () => {
    const text = comparisonContext(payload(), "Acme", ["roic"], [
      { accession: "1", form: "10-K", filingDate: "2025-02-26", items: [], itemLabels: [], url: "https://www.sec.gov/x" },
    ]);
    expect(text).toContain("[ASKED] ROIC | 40.00%");
    expect(text).not.toContain("[ASKED] Operating Margin");
    expect(text).toContain("10-K filed 2025-02-26: https://www.sec.gov/x");
    expect(text).toContain("Industry peers N=20");
  });
});
