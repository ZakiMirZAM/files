import { describe, expect, it } from "vitest";
import {
  HEAD_TO_HEAD_ROWS,
  ROE_TEACHING,
  defaultRivals,
  formatFigure,
  formatGap,
  gapToBase,
  roeBreakdown,
  sharesForYear,
  withCompany,
} from "./headToHead";
import { headToHeadAfter, headToHeadBefore } from "./questions";

describe("gapToBase", () => {
  it("is rival minus base", () => {
    expect(gapToBase(0.25, 0.2)).toBeCloseTo(0.05, 12);
    expect(gapToBase(1.0, 2.0)).toBe(-1);
  });
  it("is null when either side is missing", () => {
    expect(gapToBase(null, 0.2)).toBeNull();
    expect(gapToBase(0.2, undefined)).toBeNull();
    expect(gapToBase(Number.NaN, 0.2)).toBeNull();
  });
});

describe("formatting", () => {
  it("prints percents, multiples and months", () => {
    expect(formatFigure(0.1, "pct")).toBe("10.0%");
    expect(formatFigure(2, "times")).toBe("2.00x");
    expect(formatFigure(4.25, "months")).toBe("4.3 months");
    expect(formatFigure(null, "pct")).toBe("not available");
  });
  it("prints gaps with a sign, percents as percentage points", () => {
    expect(formatGap(gapToBase(0.25, 0.2), "pct")).toBe("+5.0 pts");
    expect(formatGap(-0.031, "pct")).toBe("-3.1 pts");
    expect(formatGap(1, "times")).toBe("+1.00x");
    expect(formatGap(0, "months")).toBe("0.0 months");
    expect(formatGap(null, "pct")).toBe("not available");
  });
});

describe("roeBreakdown", () => {
  it("shows the owner's worked examples", () => {
    expect(roeBreakdown({ ticker: "A", netMargin: 0.1, assetTurnover: 1, equityMultiplier: 2 })).toBe(
      "10.0% × 1.00 × 2.00",
    );
    expect(roeBreakdown({ ticker: "B", netMargin: 0.05, assetTurnover: 2, equityMultiplier: 2 })).toBe(
      "5.0% × 2.00 × 2.00",
    );
  });
  it("is null when a factor is missing", () => {
    expect(roeBreakdown({ ticker: "A", netMargin: 0.1, assetTurnover: null, equityMultiplier: 2 })).toBeNull();
  });
});

describe("defaultRivals", () => {
  it("takes the first three group rivals, never the base", () => {
    expect(
      defaultRivals({
        applicable: true,
        ticker: "nvda",
        groupRivals: [{ ticker: "AMD" }, { ticker: "NVDA" }, { ticker: "avgo" }, { ticker: "TSM" }, { ticker: "INTC" }],
      }),
    ).toEqual(["AMD", "AVGO", "TSM"]);
    expect(defaultRivals({ applicable: false })).toEqual([]);
    expect(defaultRivals(null)).toEqual([]);
  });
});

describe("sharesForYear", () => {
  const gs = {
    years: [2024, 2019, 2014],
    rows: [
      { ticker: "A", shares: [0.6, 0.55, null] },
      { ticker: "B", shares: [0.4, 0.45, null] },
    ],
    complete: [true, true, false],
    basis: "total company revenue, not product-line revenue",
  };
  it("aligns shares to the column order", () => {
    expect(sharesForYear(gs, 0, ["B", "A"])).toEqual([0.4, 0.6]);
  });
  it("is null for an incomplete year", () => {
    expect(sharesForYear(gs, 2, ["A", "B"])).toBeNull();
  });
});

describe("withCompany", () => {
  it("fills every {company} in text and hint, leaving ids alone", () => {
    const out = withCompany(
      [{ title: "Head to Head", questions: [{ id: "q1", text: "Why {company} over rivals? Ask {company}.", hint: "{company} hint" }, { id: "q2", text: "No token." }] }],
      "Apple",
    );
    expect(out[0].questions[0]).toEqual({ id: "q1", text: "Why Apple over rivals? Ask Apple.", hint: "Apple hint" });
    expect(out[0].questions[1]).toEqual({ id: "q2", text: "No token." });
  });
  it("leaves no {company} in the real decks", () => {
    const all = [...withCompany(headToHeadBefore, "X"), ...withCompany(headToHeadAfter, "X")]
      .flatMap((g) => g.questions)
      .map((q) => `${q.text} ${q.hint ?? ""}`)
      .join(" ");
    expect(all).not.toContain("{company}");
  });
});

describe("copy", () => {
  it("has no em dash in any new text", () => {
    const all = [ROE_TEACHING, ...HEAD_TO_HEAD_ROWS.map((r) => r.label)].join(" ");
    expect(all).not.toContain(String.fromCharCode(0x2014));
  });
});
