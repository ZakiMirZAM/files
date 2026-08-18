import { describe, expect, test } from "vitest";
import {
  CONVICTION_HIGH,
  CONVICTION_LOW,
  METRICS,
  SECTORS,
  attainableMax,
  convictionFor,
  scoreMatrix,
  scoreMatrixNormalized,
  type Reading,
} from "./sectorRotation";

const SOME_READINGS: Record<string, Reading> = {
  spread_10y3m: "up",
  hy_oas: "down",
  m2: "up",
  gdp: "up",
  sentiment: "up",
};

describe("attainableMax", () => {
  test("every sector has a positive attainable maximum", () => {
    const max = attainableMax();
    for (const s of SECTORS) expect(max.get(s)!).toBeGreaterThan(0);
  });

  test("broad-coverage sectors have higher maxima than narrow ones", () => {
    const max = attainableMax();
    expect(max.get("Consumer Cyclical")!).toBeGreaterThan(max.get("Real Estate")!);
    expect(max.get("Industrials")!).toBeGreaterThan(max.get("Communication Services")!);
  });

  test("honors weight overrides", () => {
    const base = attainableMax();
    const boosted = attainableMax({ hy_oas: 0 });
    // hy_oas mentions several sectors; zeroing it lowers their maxima only.
    const hyRow = METRICS.find((m) => m.id === "hy_oas")!;
    for (const s of SECTORS) {
      const mentioned = (hyRow.impact[s] ?? hyRow.neutral?.[s]) != null;
      if (mentioned) expect(boosted.get(s)!).toBeLessThan(base.get(s)!);
      else expect(boosted.get(s)!).toBe(base.get(s)!);
    }
  });
});

describe("scoreMatrixNormalized", () => {
  test("normalized total is the raw total as a percent of the attainable max", () => {
    const raw = new Map(scoreMatrix(SOME_READINGS).map((r) => [r.sector, r.total]));
    const max = attainableMax();
    for (const r of scoreMatrixNormalized(SOME_READINGS)) {
      const expected = Math.round(((raw.get(r.sector) as number) / (max.get(r.sector) as number)) * 1000) / 10;
      expect(r.total).toBe(expected);
    }
  });

  test("preserves sign and returns every sector", () => {
    const raw = new Map(scoreMatrix(SOME_READINGS).map((r) => [r.sector, r.total]));
    const norm = scoreMatrixNormalized(SOME_READINGS);
    expect(norm).toHaveLength(SECTORS.length);
    for (const r of norm) {
      expect(Math.sign(r.total)).toBe(Math.sign(raw.get(r.sector) as number));
    }
  });

  test("no readings set gives all zeros", () => {
    for (const r of scoreMatrixNormalized({})) expect(r.total).toBe(0);
  });
});

describe("convictionFor", () => {
  test("tiers split on the documented thresholds", () => {
    expect(convictionFor(CONVICTION_HIGH)).toBe("high");
    expect(convictionFor(CONVICTION_HIGH + 10)).toBe("high");
    expect(convictionFor(CONVICTION_LOW)).toBe("moderate");
    expect(convictionFor(CONVICTION_HIGH - 1)).toBe("moderate");
    expect(convictionFor(CONVICTION_LOW - 1)).toBe("low");
    expect(convictionFor(0)).toBe("low");
  });
});
