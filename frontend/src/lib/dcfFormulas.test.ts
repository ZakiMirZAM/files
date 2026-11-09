import { describe, expect, it } from "vitest";
import { dcfCostOfEquityTree, dcfRoicTree, dcfWaccTree } from "./dcfFormulas";
import type { RoicBuild, WaccBuild } from "./types";

const money = (v: number | null | undefined) => (v == null ? "n/a" : `$${(v / 1e9).toFixed(2)}B`);

const build: WaccBuild = {
  wacc: 0.0812, costOfEquity: 0.0827, costOfDebtPretax: 0.0574, costOfDebtAfterTax: 0.04535,
  interestCoverage: 30.1, weightEquity: 0.96, weightDebt: 0.04, marketValueEquity: 4.9e12,
  bookValueDebt: 2.0e11, conventionalDebt: 1.12e11, leaseDebt: 0.88e11, beta: 0.944,
  riskFreeRate: 0.0484, equityRiskPremium: 0.0363, marginalTaxRate: 0.21,
};

describe("dcfWaccTree", () => {
  it("shows the valuation's own parts, debt including leases", () => {
    const t = dcfWaccTree(build, money);
    expect(t.value).toBe(build.wacc);
    expect(t.children.map((c) => c.key)).toEqual(["costOfEquity", "costOfDebtAfterTax", "E", "D"]);
    const d = t.children[3];
    expect(d.formula).toBe("Total Debt + Operating-lease debt");
    expect(d.children.map((c) => c.value)).toEqual([1.12e11, 0.88e11]);
  });

  it("explains a zero debt weight by its real cause", () => {
    const noCap = dcfWaccTree({ ...build, weightDebt: 0, weightEquity: 1, marketValueEquity: null }, money);
    expect(noCap.substituted).toContain("no market cap");
    const tiny = dcfWaccTree({ ...build, weightDebt: 0, weightEquity: 1, bookValueDebt: 1e6 }, money);
    expect(tiny.substituted).toContain("debt too small to weigh");
    const noDebt = dcfWaccTree({ ...build, weightDebt: 0, weightEquity: 1, bookValueDebt: 0 }, money);
    expect(noDebt.substituted).toContain("no debt");
  });
});

describe("dcfCostOfEquityTree", () => {
  const bu = { betaMethod: "bottom_up_industry", betaUnlevered: 0.8, betaDeRatio: 0.5 };

  it("shows the bottom-up build only when it is the beta the valuation used", () => {
    const used = dcfCostOfEquityTree({ ...build, ...bu, beta: 0.8 * (1 + 0.79 * 0.5) });
    expect(used.children[1].formula).toContain("βu");
    // Shadow mode: metadata present, regression beta used instead.
    const shadow = dcfCostOfEquityTree({ ...build, ...bu, beta: 1.15 });
    expect(shadow.children[1].formula).toBeNull();
  });

  it("shows the clamp when the relevered beta is limited", () => {
    const t = dcfCostOfEquityTree({ ...build, betaMethod: "bottom_up_industry", betaUnlevered: 1.6, betaDeRatio: 2, beta: 3.0 });
    expect(t.children[1].substituted).toMatch(/^max\(0\.2, min\(3\.0,/);
    expect(t.children[1].rule).toContain("0.2 to 3.0");
  });

  it("shows the flat default rate when there is no beta", () => {
    const t = dcfCostOfEquityTree({ ...build, beta: null, costOfEquity: 0.1 });
    expect(t.substituted).toBe("10.00% default rate (no beta)");
  });
});

describe("dcfRoicTree", () => {
  it("adds capitalized R&D to income and capital when the valuation did", () => {
    const r: RoicBuild = {
      operatingIncome: 133.05e9, equity: 73.7e9, debt: 112.4e9, cash: 54.7e9, capitalBase: 131.4e9,
      cashSubtracted: true, rdAdded: 34.55e9, rdAmortization: 26.0e9, researchAsset: 92.5e9,
      taxRate: 0.156, adjustedOperatingIncome: 141.6e9, capital: 223.9e9, roic: 0.5338,
    };
    const t = dcfRoicTree(r, money);
    expect(t.value).toBe(0.5338);
    expect(t.children[0].formula).toContain("R&D");
    expect(t.children[2].formula).toBe("Capital + Research asset");
    const base = t.children[2].children[0];
    expect(base.children.map((c) => c.key)).toEqual(["eq", "debt", "cash"]);
  });
});
