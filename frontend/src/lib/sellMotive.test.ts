import { describe, expect, it } from "vitest";
import { sellDeckContext } from "./sellMotive";

describe("sellDeckContext", () => {
  it("carries the policy, the matching position and the earlier answers", () => {
    const out = sellDeckContext({
      ticker: "ABC",
      policy: { riskTolerance: "balanced", horizonYears: 10, constraints: "No position\nover 8% | hard cap", taxNotes: "" },
      positions: [
        { ticker: "XYZ", shares: 5, avgCostUsd: 10 },
        { ticker: "ABC", shares: 12, avgCostUsd: 41.5 },
      ],
      answers: [
        { questionId: "ind.cat.falsifier", answer: "Volumes fall two years running." },
        { questionId: "indiv.other", answer: "ignored" },
      ],
    });
    expect(out).toContain("horizon 10 years | constraints: No position over 8% / hard cap | tax notes: none written");
    expect(out).toContain("Simulator position in ABC: 12 shares at an average cost of 41.500 USD");
    expect(out).toContain("fact that would make it a value trap: Volumes fall two years running.");
    expect(out).toContain("full account of the company as an investment: not answered");
    expect(out).not.toContain("ignored");
    expect(out).not.toContain("XYZ");
  });

  it("says plainly when nothing is on file", () => {
    const out = sellDeckContext({ ticker: "ABC", policy: null, positions: [{ ticker: "ABC", shares: 0, avgCostUsd: 3 }], answers: [] });
    expect(out).toContain("Investment Policy: not on file (no position limit on file)");
    expect(out).toContain("Simulator position in ABC: none");
    expect(out).toContain("Portfolio weight: not computed by the app");
  });
});
