import { describe, expect, it } from "vitest";
import { buildMoatDirectionDeck, MOAT_DIRECTION_QUESTIONS } from "./moatDirectionDeck";
import { resolveDefNumber } from "./individualDefinitions";

describe("Moat Direction deck", () => {
  it("fills every {company} and keeps five unique ids", () => {
    const [group] = buildMoatDirectionDeck({ company: "Acme", dataContext: "{}" });
    expect(group.questions).toHaveLength(5);
    expect(new Set(group.questions.map((q) => q.id)).size).toBe(5);
    for (const q of group.questions) expect(q.text).not.toContain("{company}");
    expect(group.questions[1].text).toContain("Acme’s share of industry revenue");
  });

  it("uses no em dashes", () => {
    for (const q of MOAT_DIRECTION_QUESTIONS) expect(q.text).not.toContain(String.fromCharCode(0x2014));
  });

  it("every metric label on the section opens an existing definition", () => {
    const labels = [
      "ROIC − WACC Spread", "Excess Return", "ROIC", "WACC", "Return On Equity", "Cost Of Equity",
      "Marginal ROIC", "Gross Margin", "Operating Margin", "Net Margin", "Asset Turnover",
      "Equity Multiplier", "Augmented Payout Ratio", "Fundamental Growth", "Revenue Growth",
    ];
    const missing = labels.filter((l) => resolveDefNumber(l) == null);
    expect(missing).toEqual([]);
    expect(resolveDefNumber("ROIC − WACC Spread")).toBe(44);
  });
});
