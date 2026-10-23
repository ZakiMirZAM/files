import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GrowthReconciliationSection } from "./GrowthReconciliationSection";
import type { GrowthReconciliation } from "../../lib/types";

// forecast.growthReconciliation from /api/individual/V on the feat/dcf-accuracy
// backend (2026-10-23).
const V: GrowthReconciliation = {
  historical: 0.1075, fundamental: 0.1718, reinvestmentRate: 0.6058, efficiencyTerm: 0.0,
  reconciled: 0.1075, growthUsed: 0.104,
  methodUsed: "the organic revenue trend of the last five years drives the projection, pulled 30% toward the growth listed companies sustain; reinvestment x return on capital is shown as a consistency check",
  divergence: 0.0643, divergenceFlag: true, reinvestmentMethod: "earnings", salesToCapitalUsed: null,
  ownSalesToCapital: 0.932, industrySalesToCapital: 0.429, growthCap: 0.35, growthFloor: -0.1,
  marginTargetSource: "5-year median margin", marginTarget: 0.6431, mode: "damodaran",
  organicTrend: 0.1271, baseRate: 0.05, cleanReinvestmentRate: 0.7003, cleanFundamental: 0.339,
  roicUsed: 0.4841, rndCapitalized: false, rndLife: null,
  stableGrowth: { value: 0.0412, basis: "min", source: "long-run nominal growth", longRunNominalGrowth: 0.0412, riskFreeRate: 0.0513 },
  efficiencyExcluded: true, consistencyGap: -0.235, consistencyFlag: true,
};

describe("GrowthReconciliationSection with the damodaran fields", () => {
  const html = renderToStaticMarkup(<GrowthReconciliationSection data={V} />);

  it("shows the organic trend, what reinvestment supports and the gap", () => {
    expect(html).toContain("Organic revenue trend");
    expect(html).toContain("12.710%");
    expect(html).toContain("What its reinvestment supports");
    expect(html).toContain("33.900%");
    expect(html).toContain("-23.500%");
  });

  it("notes the consistency gap when flagged", () => {
    expect(html).toContain("far");
  });

  it("labels the efficiency term as shown, not projected", () => {
    expect(html).toContain("Efficiency term (shown, not projected)");
  });

  it("drops the old fundamental tile that included the efficiency term", () => {
    expect(html).not.toContain("What its fundamentals fund");
  });
});
