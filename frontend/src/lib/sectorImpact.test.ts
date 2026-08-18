import { describe, expect, test } from "vitest";
import { ECON_LINK, METRICS, SECTORS, sectorsHurtByEconMetric } from "./sectorRotation";

describe("sectorsHurtByEconMetric", () => {
  test("every linked economic definition resolves to a summary or null without throwing", () => {
    const numbers = new Set(Object.values(ECON_LINK));
    for (const n of numbers) {
      const summary = sectorsHurtByEconMetric(n);
      if (summary) {
        expect(summary.risingHurts.length + summary.fallingHurts.length).toBeGreaterThan(0);
        for (const s of [...summary.risingHurts, ...summary.fallingHurts]) {
          expect(SECTORS).toContain(s);
        }
      }
    }
  });

  test("unlinked definition numbers return null", () => {
    expect(sectorsHurtByEconMetric(999)).toBeNull();
    expect(sectorsHurtByEconMetric(0)).toBeNull();
  });

  test("shared definitions union their rows (both curve spreads point at #6)", () => {
    const rows = METRICS.filter((m) => ECON_LINK[m.id] === 6);
    expect(rows.length).toBeGreaterThan(1);
    const summary = sectorsHurtByEconMetric(6);
    expect(summary).not.toBeNull();
    // Every sector any linked row hurts when rising must appear in the union.
    for (const row of rows) {
      for (const s of SECTORS) {
        if (row.impact[s] === -1) expect(summary!.risingHurts).toContain(s);
        if (row.impact[s] === 1) expect(summary!.fallingHurts).toContain(s);
      }
    }
  });

  test("PPI (#4) reports the inflation casualties both ways", () => {
    const summary = sectorsHurtByEconMetric(4);
    expect(summary).not.toBeNull();
    // Rising inflation hurts the long-duration and consumer sectors.
    expect(summary!.risingHurts).toContain("Technology");
    expect(summary!.risingHurts).toContain("Consumer Cyclical");
    // Falling inflation hurts the inflation beneficiaries.
    expect(summary!.fallingHurts).toContain("Energy");
    expect(summary!.fallingHurts).toContain("Basic Materials");
  });

  test("a metric with an empty impact vector returns null (population #49)", () => {
    expect(sectorsHurtByEconMetric(49)).toBeNull();
  });
});
