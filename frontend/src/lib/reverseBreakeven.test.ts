import { describe, expect, it } from "vitest";
import {
  BREAKEVEN_DRIVERS, assumptionRows, cellTint, firmFigure, formatDriver, gridNote,
  plausibilityLines, priceVerdict, statusSentence, terminalFormula, valuationDrivers,
} from "./reverseBreakeven";
import { anyDefByNumber } from "./allDefinitions";
import { EM_DASH } from "./copyHygiene.test-helper";
import type { BreakevenDriver, BreakevenGrid, DcfBreakdown, ReverseBreakevenApplicable } from "./types";

const driver = (over: Partial<BreakevenDriver>): BreakevenDriver => ({
  driver: "revenueGrowth", model: 0.062, implied: null, low: -0.1, high: 0.6, status: "above_range",
  firm: 0.021, firmBasis: "fiveYearMedian", peerMedian: 0.05, peerTopDecile: 0.21,
  bestValue: null, bestAt: null, valuationAt: null, valuation: null, ...over,
});

const payload = (p: Partial<ReverseBreakevenApplicable["plausibility"]>): ReverseBreakevenApplicable => ({
  applicable: true, priceUsed: 341, valueAtModel: 98.4, modelValuation: null, wacc: 0.0824, stableGrowth: 0.041, drivers: [],
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
    expect(statusSentence(driver({ bestValue: 98.4, bestAt: -0.1 }))).toBe(
      "No revenue growth between -10.00% and 60.00% reaches today's price; the highest value it reaches is $98.400 a share at -10.00%.");
    expect(statusSentence(driver({ driver: "salesToCapital", low: 0.2, high: 20, status: "below_range", bestValue: 512, bestAt: 20 }))).toBe(
      "No sales to capital between 0.20x and 20.00x comes down to today's price; the lowest value it reaches is $512.000 a share at 20.00x.");
    expect(statusSentence(driver({}))).toBe("No revenue growth between -10.00% and 60.00% reaches today's price.");
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

const breakdown = (over: Partial<DcfBreakdown>): DcfBreakdown => ({
  rows: [], stableGrowth: 0.0518, stableReturn: 0.0805, costOfCapital: 0.0842,
  terminal: { ebitAfterTaxNext: 773.96e9, reinvestmentRate: 0.6435, fcffNext: 275.94e9, waccMinusGrowth: 0.0324, value: 8.51e12 },
  pvTerminal: 0, pvExplicit: 0, enterpriseValue: 0, cash: 0, grossDebt: 0, minorityInterest: 0,
  equityValue: 0, dilutedShares: 1, valuePerShare: 341.22, gapToPrice: 0.15, ...over,
});

describe("the valuation that justifies today's price", () => {
  const run = breakdown({});
  it("offers only solved drivers for the calculation, never an unsolved run", () => {
    const drivers = [
      driver({ driver: "revenueGrowth", valuation: run, valuationAt: -0.1 }),
      driver({ driver: "targetMargin", status: "solved", implied: 0.4, valuation: run }),
      driver({ driver: "stableRoic", status: "solved", implied: 0.08, valuation: run }),
      driver({ driver: "salesToCapital", status: "below_range", valuation: run }),
    ];
    expect(valuationDrivers(drivers).map((d) => d.driver)).toEqual(["targetMargin", "stableRoic"]);
    expect(valuationDrivers([driver({ driver: "salesToCapital", valuation: run })])).toEqual([]);
  });
  it("moves only the selected driver on the price's side", () => {
    const rows = assumptionRows([
      driver({ driver: "revenueGrowth", model: 0.29 }),
      driver({ driver: "stableRoic", model: 0.0504, valuationAt: 0.0805 }),
    ], "stableRoic");
    expect(rows).toEqual([
      { driver: "revenueGrowth", model: 0.29, atPrice: 0.29, changed: false },
      { driver: "stableRoic", model: 0.0504, atPrice: 0.0805, changed: true },
    ]);
  });
  it("substitutes the numbers into the terminal value formula", () => {
    expect(terminalFormula(run.terminal)).toBe("$773.96B × (1 − 64.35%) / 3.24% = $8.51T");
    expect(terminalFormula({ ...run.terminal, reinvestmentRate: null })).toContain("(1 − n/a)");
  });
  it("reads the value per share against the price, with the shortfall when unsolved", () => {
    expect(priceVerdict(run, 341.07, true)).toBe("$341.220 a share against today's price of $341.070: the two are equal.");
    expect(priceVerdict(breakdown({ valuePerShare: 95.96, gapToPrice: -245.11 }), 341.07, false))
      .toBe("$95.960 a share against today's price of $341.070: $245.110 short.");
    expect(priceVerdict(breakdown({ valuePerShare: 400, gapToPrice: 58.93 }), 341.07, false))
      .toBe("$400.000 a share against today's price of $341.070: $58.930 above.");
  });
  it("opens a definition from every label of the side-by-side", () => {
    for (const n of [82, 39, 23, 47, 25, 513, 505, 504, 506, 113, 141, 143, 507, 508, 183, 880, 893]) {
      expect(anyDefByNumber(n), String(n)).toBeDefined();
    }
  });
});
