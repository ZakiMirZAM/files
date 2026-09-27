import { describe, expect, it } from "vitest";
import { BREAKEVEN_DRIVERS, cellTint, firmFigure, formatDriver, gridNote, plausibilityLines, statusSentence } from "./reverseBreakeven";
import { anyDefByNumber } from "./allDefinitions";
import { EM_DASH } from "./copyHygiene.test-helper";
import type { BreakevenDriver, BreakevenGrid, ReverseBreakevenApplicable } from "./types";

const driver = (over: Partial<BreakevenDriver>): BreakevenDriver => ({
  driver: "revenueGrowth", model: 0.062, implied: null, low: -0.1, high: 0.6, status: "above_range",
  firm: 0.021, firmBasis: "fiveYearMedian", peerMedian: 0.05, peerTopDecile: 0.21, ...over,
});

const payload = (p: Partial<ReverseBreakevenApplicable["plausibility"]>): ReverseBreakevenApplicable => ({
  applicable: true, priceUsed: 341, valueAtModel: 98.4, wacc: 0.0824, stableGrowth: 0.041, drivers: [],
  grids: {} as ReverseBreakevenApplicable["grids"],
  plausibility: { impliedRevenueYear10: null, peerTotalRevenue: 1.2e12, impliedShareOfPeerRevenue: null,
    impliedStableRoic: null, currentRoic: 0.55, wacc: 0.0824, ...p },
});

describe("reverse breakeven helpers", () => {
  it("opens a definition from every driver label", () => {
    for (const { def } of Object.values(BREAKEVEN_DRIVERS)) expect(anyDefByNumber(def), String(def)).toBeDefined();
  });
  it("formats each driver in its own unit", () => {
    expect(formatDriver("revenueGrowth", 0.062)).toBe("6.20%");
    expect(formatDriver("salesToCapital", 1.8)).toBe("1.80x");
    expect(formatDriver("stableRoic", null)).toBe("n/a");
  });
  it("says why a driver cannot reach the price, and nothing when it solved", () => {
    expect(statusSentence(driver({}))).toBe(
      "No value from -10.00% to 60.00% reaches today's price: every one leaves the company worth less than the price.");
    expect(statusSentence(driver({ driver: "salesToCapital", low: 0.2, high: 20, status: "below_range" }))).toBe(
      "No value from 0.20x to 20.00x comes down to today's price: every one leaves the company worth more than the price.");
    expect(statusSentence(driver({ status: null }))).toBe("The model could not value the company anywhere from -10.00% to 60.00%.");
    expect(statusSentence(driver({ status: "solved", implied: 0.3 }))).toBeNull();
  });
  it("names the period behind the firm's figure", () => {
    expect(firmFigure(driver({}))).toBe("2.10% (5-year median)");
    expect(firmFigure(driver({ driver: "stableRoic", firm: 0.55, firmBasis: "latest" }))).toBe("55.00% (latest)");
    expect(firmFigure(driver({ firm: null }))).toBe("n/a");
  });
  it("tints only cells worth at least the price", () => {
    expect(cellTint({ value: 400, atOrAbovePrice: true })).toBeDefined();
    expect(cellTint({ value: 90, atOrAbovePrice: false })).toBeUndefined();
    expect(cellTint({ value: null, atOrAbovePrice: true })).toBeUndefined();
  });
  it("says so under a grid no cell of which reaches the price", () => {
    const grid = (reachesPrice: boolean): BreakevenGrid => ({ rowDriver: "revenueGrowth", colDriver: "targetMargin",
      rowAxis: [], colAxis: [], rowModelIndex: 6, colModelIndex: 0, cells: [], reachesPrice });
    expect(gridNote(grid(false))).toBe("No combination in this grid reaches today's price");
    expect(gridNote(grid(true))).toBeNull();
  });
  it("writes the plausibility lines for a solved and an unsolved price", () => {
    expect(plausibilityLines(payload({ impliedStableRoic: 0.41 }))).toEqual([
      "Revenue growth alone does not reach today's price, so there is no implied year-10 revenue.",
      "The price needs a return on capital after growth ends of 41.00%, against a current return on capital of 55.00% and a cost of capital of 8.24%.",
    ]);
    const solved = plausibilityLines(payload({ impliedRevenueYear10: 9e11, impliedShareOfPeerRevenue: 0.75, currentRoic: null, wacc: null }));
    expect(solved[0]).toBe("At the growth the price needs, revenue in year 10 is $900.00B.");
    expect(solved[1]).toBe("That is 75.00% of the $1.20T the whole peer group sells today.");
    expect(solved[2]).toBe("No return on capital after growth ends reaches today's price on its own.");
    expect(JSON.stringify(solved).includes(EM_DASH)).toBe(false);
  });
});
