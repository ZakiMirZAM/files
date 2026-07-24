// Tests for the matrix ranking transform. sortMatrixData reorders only the
// `sectors` axis, so every matrix surface (sector columns, industry columns,
// company rows) ranks the same way while cells and definitions stay untouched.

import { describe, expect, it } from "vitest";
import type { SectorMetricsData } from "./types";
import { cycleMatrixSort, sortMatrixData } from "./sectorMetrics";

function matrix(values: Record<string, number | null>): SectorMetricsData {
  return {
    asOf: "2026-07-24",
    universe: "test",
    metrics: [{ key: "roe", label: "ROE", unit: "%", group: "Value creation", definition: "" }],
    sectors: Object.keys(values),
    data: Object.fromEntries(Object.entries(values).map(([name, v]) => [name, { roe: v }])),
  };
}

describe("sortMatrixData", () => {
  it("ranks high to low on desc", () => {
    const out = sortMatrixData(matrix({ A: 5, B: 12, C: 8 }), { key: "roe", dir: "desc" });
    expect(out.sectors).toEqual(["B", "C", "A"]);
  });

  it("ranks low to high on asc", () => {
    const out = sortMatrixData(matrix({ A: 5, B: 12, C: 8 }), { key: "roe", dir: "asc" });
    expect(out.sectors).toEqual(["A", "C", "B"]);
  });

  it("puts missing and non-finite values last in either direction", () => {
    const data = matrix({ A: null, B: 12, C: Number.NaN, D: 3 });
    expect(sortMatrixData(data, { key: "roe", dir: "desc" }).sectors).toEqual(["B", "D", "A", "C"]);
    expect(sortMatrixData(data, { key: "roe", dir: "asc" }).sectors).toEqual(["D", "B", "A", "C"]);
  });

  it("keeps source order for ties and for an unknown key", () => {
    const tied = sortMatrixData(matrix({ A: 7, B: 7, C: 7 }), { key: "roe", dir: "desc" });
    expect(tied.sectors).toEqual(["A", "B", "C"]);
    const unknown = sortMatrixData(matrix({ A: 5, B: 12 }), { key: "nope", dir: "desc" });
    expect(unknown.sectors).toEqual(["A", "B"]);
  });

  it("is a no-op returning the same object when sort is null", () => {
    const data = matrix({ A: 5, B: 12 });
    expect(sortMatrixData(data, null)).toBe(data);
  });

  it("does not touch the column payloads", () => {
    const data = matrix({ A: 5, B: 12 });
    const out = sortMatrixData(data, { key: "roe", dir: "desc" });
    expect(out.data).toBe(data.data);
    expect(out.metrics).toBe(data.metrics);
  });
});

describe("cycleMatrixSort", () => {
  it("cycles desc, asc, off for one key", () => {
    const first = cycleMatrixSort(null, "roe");
    expect(first).toEqual({ key: "roe", dir: "desc" });
    const second = cycleMatrixSort(first, "roe");
    expect(second).toEqual({ key: "roe", dir: "asc" });
    expect(cycleMatrixSort(second, "roe")).toBeNull();
  });

  it("switching to another key starts at desc", () => {
    expect(cycleMatrixSort({ key: "roe", dir: "asc" }, "wacc")).toEqual({ key: "wacc", dir: "desc" });
  });
});
