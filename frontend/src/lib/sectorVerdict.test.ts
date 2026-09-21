// The Sector Verdict deck: the synthesis group exists, and its enriched AI
// context assembles (and omits) its blocks correctly.

import { describe, expect, it } from "vitest";
import { ECON_VERDICT_TITLE, QUALITATIVE_QUESTIONS } from "./questions";
import { buildSectorVerdictContext } from "./aiDataContext";
import type { SectorMetricsData } from "./types";
import { scoreMatrix } from "./sectorRotation";

describe("Sector Verdict question deck", () => {
  const group = QUALITATIVE_QUESTIONS.economic.find((g) => g.title === ECON_VERDICT_TITLE);

  it("exists as the first economic group with ten questions", () => {
    expect(QUALITATIVE_QUESTIONS.economic[0]?.title).toBe(ECON_VERDICT_TITLE);
    expect(group?.questions).toHaveLength(11);
  });

  it("uses stable econ.verdict.* ids ending in the final verdict", () => {
    const ids = group?.questions.map((q) => q.id) ?? [];
    expect(ids.every((id) => id.startsWith("econ.verdict."))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[ids.length - 1]).toBe("econ.verdict.final");
  });
});

describe("buildSectorVerdictContext", () => {
  const metrics: SectorMetricsData = {
    asOf: "2026-08-16",
    universe: "test",
    metrics: [],
    sectors: ["Technology", "Utilities"],
    data: {
      Technology: { valueScore: 78.3, roicWaccSpread: 24.0 },
      Utilities: { valueScore: 32.9, roicWaccSpread: -1.2 },
    },
  };
  const ranking = scoreMatrix({ hy_oas: "down", copper_gold: "up" });

  it("assembles all three blocks when every source is present", () => {
    const out = buildSectorVerdictContext("Econ figures here", metrics, ranking);
    expect(out).toContain("Econ figures here");
    expect(out).toContain("Technology: value score 78.3/100, ROIC-WACC spread 24.0pp");
    expect(out).toContain("Sector Rotation matrix");
  });

  it("omits absent sources and returns undefined when everything is missing", () => {
    const noExtras = buildSectorVerdictContext("Econ", null, null);
    expect(noExtras).toBe("Econ");
    expect(buildSectorVerdictContext(undefined, null, null)).toBeUndefined();
  });

  it("skips sectors whose scorecard columns carry no figures", () => {
    const sparse: SectorMetricsData = {
      ...metrics,
      data: { Technology: { valueScore: null, roicWaccSpread: null }, Utilities: {} },
    };
    expect(buildSectorVerdictContext(undefined, sparse, null)).toBeUndefined();
  });
});
