import { describe, expect, it } from "vitest";
import { buildPeGrowthDeck, PE_GROWTH_DECK_TITLE, PE_GROWTH_QUESTIONS } from "./peGrowthDeck";

describe("buildPeGrowthDeck", () => {
  it("fills the company and the implied rate and leaves every other word as written", () => {
    const [group] = buildPeGrowthDeck({ company: "Apple Inc.", impliedGrowth: 0.0643, dataContext: "{}" });
    expect(group.title).toBe(PE_GROWTH_DECK_TITLE);
    expect(group.questions.map((q) => q.id)).toEqual(PE_GROWTH_QUESTIONS.map((q) => q.id));
    expect(group.questions[0].text).toBe(
      "Read the P/E vs growth and returns panel. Today’s P/E implies Apple Inc. can grow earnings at 6.430% a year forever while earning its current return on equity. Compare that rate with the five-year EPS growth and the 10-year Treasury yield, and say whether the company can keep it up. Growth only raises the fair P/E when the return on new investment is above the cost of equity; at a return equal to the cost of equity, the fair P/E is 1 divided by the cost of equity.",
    );
    expect(group.questions[1].text).toBe(
      "Compare Apple Inc.’s earnings yield (earnings divided by price) with the 10-year Treasury yield. If the stock earns less per dollar than the bond pays, work out how much earnings growth has to arrive, and over how many years, to close the gap.",
    );
    expect(group.questions[2].text).toBe(
      "Write the case for or against paying today’s P/E for Apple Inc. in terms of growth and returns on capital. No length limit; pull together the implied growth rate, the ROIC minus WACC spread, and the earnings yield gap above.",
    );
  });

  it("says n/a when the P/E implies no growth rate", () => {
    const [group] = buildPeGrowthDeck({ company: "X", impliedGrowth: null, dataContext: "{}" });
    expect(group.questions[0].text).toContain("grow earnings at n/a a year forever");
  });

  it("hands every question the panel's figures", () => {
    const [group] = buildPeGrowthDeck({ company: "X", impliedGrowth: 0.05, dataContext: '{"a":1}' });
    for (const q of group.questions) expect(q.dataContext).toBe('{"a":1}');
  });
});
