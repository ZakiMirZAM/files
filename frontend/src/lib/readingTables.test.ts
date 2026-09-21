// Scope parsing, label resolution and the orphan rule. The React half is
// exercised on the page.

import { describe, expect, it } from "vitest";

import { defNumberFromScopeKey, readingsFor, resolveReading } from "./readingTables";

describe("scope keys", () => {
  it("reads a definition number back out", () => {
    expect(defNumberFromScopeKey("metric-6")).toBe(6);
    expect(defNumberFromScopeKey("metric-17")).toBe(17);
  });

  it("returns null for any other scope", () => {
    expect(defNumberFromScopeKey("global")).toBeNull();
    expect(defNumberFromScopeKey("NVDA")).toBeNull();
    expect(defNumberFromScopeKey("metric-")).toBeNull();
  });
});

describe("readings for a metric", () => {
  it("returns the owner's own labels for a conforming file", () => {
    const rows = readingsFor("economic", 6);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].readingLabel).toContain("Steeply upward sloping");
  });

  it("returns nothing for a file that does not conform", () => {
    expect(readingsFor("economic", 50)).toEqual([]);
    expect(readingsFor("economic", 70)).toEqual([]);
  });
});

describe("resolving a saved pick", () => {
  const label = readingsFor("economic", 6)[0].readingLabel;
  const key = readingsFor("economic", 6)[0].readingKey;

  it("matches the exact label", () => {
    const r = resolveReading("economic", 6, label);
    expect(r.row?.readingLabel).toBe(label);
    expect(r.orphaned).toBe(false);
  });

  it("tolerates surrounding whitespace", () => {
    expect(resolveReading("economic", 6, `  ${label}  `).orphaned).toBe(false);
  });

  it("falls back to the reading key when the label was reworded", () => {
    const r = resolveReading("economic", 6, key);
    expect(r.row?.readingKey).toBe(key);
    expect(r.orphaned).toBe(false);
  });

  it("marks a pick that matches nothing as orphaned and guesses nothing", () => {
    const r = resolveReading("economic", 6, "Somewhat sideways");
    expect(r.row).toBeNull();
    expect(r.orphaned).toBe(true);
  });

  it("treats an empty answer as undecided, not orphaned", () => {
    const r = resolveReading("economic", 6, "");
    expect(r.row).toBeNull();
    expect(r.orphaned).toBe(false);
  });

  it("never resolves against a metric with no reading table", () => {
    const r = resolveReading("economic", 50, "Low and falling");
    expect(r.row).toBeNull();
    expect(r.orphaned).toBe(true);
  });
});
