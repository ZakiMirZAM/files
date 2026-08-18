import { describe, expect, test } from "vitest";
import {
  DEFAULT_VETO_CONFIG,
  METRICS,
  scoreMatrix,
  scoreMatrixWithVeto,
  type Reading,
} from "./sectorRotation";

/** Readings that arm the veto (two adverse risk rows) plus hot inflation. */
const ARMED: Record<string, Reading> = {
  hy_oas: "up",
  m2: "down",
  ppi: "up",
  cpi: "up",
  breakeven5y: "up",
};

/** Same inflation votes but calm risk metrics: the veto must stay unarmed. */
const UNARMED: Record<string, Reading> = {
  hy_oas: "down",
  m2: "up",
  ppi: "up",
  cpi: "up",
  breakeven5y: "up",
};

describe("scoreMatrixWithVeto", () => {
  test("unarmed totals equal scoreMatrix exactly", () => {
    const base = scoreMatrix(UNARMED);
    const veto = scoreMatrixWithVeto(UNARMED);
    expect(veto.map((v) => [v.sector, v.total])).toEqual(base.map((b) => [b.sector, b.total]));
    for (const v of veto) {
      expect(v.capped).toBe(0);
      expect(v.rules).toEqual([]);
      expect(v.total).toBe(v.rawTotal);
    }
  });

  test("armed run caps the inflation group's positive contribution", () => {
    const base = new Map(scoreMatrix(ARMED).map((b) => [b.sector, b.total]));
    const veto = scoreMatrixWithVeto(ARMED);
    const energy = veto.find((v) => v.sector === "Energy");
    expect(energy).toBeDefined();
    // Energy's positives under ARMED come mostly from the inflation rows, so
    // the cap must remove points.
    expect(energy!.capped).toBeGreaterThan(0);
    expect(energy!.rawTotal).toBe(base.get("Energy"));
    expect(energy!.total).toBeCloseTo(energy!.rawTotal - energy!.capped, 10);
    expect(energy!.rules.some((r) => r.startsWith("risk-armed"))).toBe(true);
    expect(energy!.rules.some((r) => r.includes("capped"))).toBe(true);
  });

  test("armed run never changes a sector's negative contributions", () => {
    const base = new Map(scoreMatrix(ARMED).map((b) => [b.sector, b.total]));
    for (const v of scoreMatrixWithVeto(ARMED)) {
      expect(v.rawTotal).toBe(base.get(v.sector));
      expect(v.capped).toBeGreaterThanOrEqual(0);
      expect(v.total).toBeLessThanOrEqual(v.rawTotal);
    }
  });

  test("purity: inputs are not mutated and repeat calls agree", () => {
    const dirs = { ...ARMED };
    const a = scoreMatrixWithVeto(dirs);
    const b = scoreMatrixWithVeto(dirs);
    expect(a).toEqual(b);
    expect(dirs).toEqual(ARMED);
  });

  test("ordering is stable: sorted by capped total, ties by name", () => {
    const out = scoreMatrixWithVeto(ARMED);
    for (let i = 1; i < out.length; i++) {
      const prev = out[i - 1];
      const cur = out[i];
      expect(
        prev.total > cur.total ||
          (prev.total === cur.total && prev.sector.localeCompare(cur.sector) < 0),
      ).toBe(true);
    }
  });

  test("armThreshold gates: one adverse row is not enough by default", () => {
    const oneAdverse: Record<string, Reading> = { hy_oas: "up", ppi: "up", breakeven5y: "up" };
    const veto = scoreMatrixWithVeto(oneAdverse);
    for (const v of veto) expect(v.capped).toBe(0);
    expect(DEFAULT_VETO_CONFIG.armThreshold).toBe(2);
  });

  test("every default risk row exists in METRICS", () => {
    const ids = new Set(METRICS.map((m) => m.id));
    for (const r of DEFAULT_VETO_CONFIG.riskRows) expect(ids.has(r.id)).toBe(true);
    for (const g of DEFAULT_VETO_CONFIG.cappedGroups) {
      expect(METRICS.some((m) => m.group === g)).toBe(true);
    }
  });
});
