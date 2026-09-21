// The number formatters.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  compactLadder,
  formatCurrency,
  formatNumber,
  formatPerShare,
  formatSignedPercent,
  formatSignedUnitValue,
  formatUnitValue,
  moneySign,
  type CompactTier,
} from "./format";

// ---------------------------------------------------------------------------
// The compact ladder, once, against the four digit tables that used to be four
// hand-written copies of it.
//
// Every string below was recorded from those copies BEFORE they were replaced,
// so this is a pin on the rendered output, not a restatement of the new code.
// The two component ladders are declared beside their component; their tables
// are repeated here because the pin is on what a reader sees.

/** MetricBlock.tsx formatAxisValue, the "$" branch. */
const AXIS_MONEY_TIERS: readonly CompactTier[] = [
  { at: 1e12, digits: 1, suffix: "T" },
  { at: 1e9, digits: 0, suffix: "B" },
  { at: 1e6, digits: 0, suffix: "M" },
  { at: 1e3, digits: 0, suffix: "K" },
];

/** MetricBlock.tsx formatAxisValue, the plain branch. No trillions step. */
const AXIS_PLAIN_TIERS: readonly CompactTier[] = [
  { at: 1e9, digits: 1, suffix: "B" },
  { at: 1e6, digits: 0, suffix: "M" },
  { at: 1e3, digits: 0, suffix: "K" },
];

/** UsesOfCashSection.tsx usd. No thousands step. */
const USES_OF_CASH_TIERS: readonly CompactTier[] = [
  { at: 1e12, digits: 2, suffix: "T" },
  { at: 1e9, digits: 1, suffix: "B" },
  { at: 1e6, digits: 0, suffix: "M" },
];

const plainDollars = (v: number) => `${moneySign(v)}$${Math.abs(v).toFixed(0)}`;
const axisMoney = (v: number) => compactLadder(v, AXIS_MONEY_TIERS, "$", plainDollars);
const axisPlain = (v: number) => compactLadder(v, AXIS_PLAIN_TIERS, "", (x) => x.toFixed(0));
const usesOfCashUsd = (v: number) => compactLadder(v, USES_OF_CASH_TIERS, "$", plainDollars);

/** value, formatCurrency, formatNumber, axis "$", axis plain, uses-of-cash. */
const LADDER_GRID: ReadonlyArray<[number, string, string, string, string, string]> = [
  [0, "$0.000", "0.000", "$0", "0", "$0"],
  [-0, "-$0.000", "0.000", "$0", "0", "$0"],
  [1e-9, "$0.000", "0.0000", "$0", "0", "$0"],
  [-1e-9, "-$0.000", "-0.0000", "-$0", "-0", "-$0"],
  [0.0005, "$0.001", "0.0005", "$0", "0", "$0"],
  [-0.0005, "-$0.001", "-0.0005", "-$0", "-0", "-$0"],
  [0.08, "$0.080", "0.080", "$0", "0", "$0"],
  [-0.08, "-$0.080", "-0.080", "-$0", "-0", "-$0"],
  [999, "$999.000", "999.000", "$999", "999", "$999"],
  [-999, "-$999.000", "-999.000", "-$999", "-999", "-$999"],
  [1e3, "$1.0K", "1.0K", "$1K", "1K", "$1000"],
  [-1e3, "-$1.0K", "-1.0K", "-$1K", "-1K", "-$1000"],
  [1.5e3, "$1.5K", "1.5K", "$2K", "2K", "$1500"],
  [-1.5e3, "-$1.5K", "-1.5K", "-$2K", "-2K", "-$1500"],
  [1e6, "$1.00M", "1.00M", "$1M", "1M", "$1M"],
  [-1e6, "-$1.00M", "-1.00M", "-$1M", "-1M", "-$1M"],
  [2.5e9, "$2.50B", "2.50B", "$3B", "2.5B", "$2.5B"],
  [-2.5e9, "-$2.50B", "-2.50B", "-$3B", "-2.5B", "-$2.5B"],
  [3.2e12, "$3.20T", "3.20T", "$3.2T", "3200.0B", "$3.20T"],
  [-3.2e12, "-$3.20T", "-3.20T", "-$3.2T", "-3200.0B", "-$3.20T"],
];

describe("the compact ladder prints what its four copies printed", () => {
  it.each(LADDER_GRID)(
    "%p",
    (value, currency, plain, axisDollars, axisNumber, cashFlowDollars) => {
      expect(formatCurrency(value)).toBe(currency);
      expect(formatNumber(value)).toBe(plain);
      expect(axisMoney(value)).toBe(axisDollars);
      expect(axisPlain(value)).toBe(axisNumber);
      expect(usesOfCashUsd(value)).toBe(cashFlowDollars);
    },
  );

  it("prints NaN the way each copy did", () => {
    expect(formatCurrency(NaN)).toBe("$NaN");
    expect(formatNumber(NaN)).toBe("NaN");
    expect(axisMoney(NaN)).toBe("$NaN");
    expect(axisPlain(NaN)).toBe("NaN");
    expect(usesOfCashUsd(NaN)).toBe("$NaN");
  });

  it("still spells the whole amount when compact is switched off", () => {
    expect(formatCurrency(2.5e9, { compact: false })).toBe("$2,500,000,000.000");
    expect(formatCurrency(-1.5e3, { compact: false })).toBe("-$1,500.000");
  });

  it("is the one ladder in the app", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const read = (p: string) => readFileSync(join(root, "..", p), "utf8");
    for (const file of [
      "components/MetricBlock.tsx",
      "components/individual/UsesOfCashSection.tsx",
    ]) {
      const src = read(file);
      expect(src, `${file} still divides by a tier itself`).not.toMatch(/\/ 1e(12|9|6|3)\)\.toFixed/);
      expect(src).toContain("compactLadder(");
    }
  });
});

// ---------------------------------------------------------------------------
// Every unit the two macro payloads actually deliver.
//
// Checked against GET /api/economic and GET /api/credit-banks on 2026-09-20:
// the economic payload delivers "%", "", "$" and "x"; the credit payload
// delivers "%", "$B" and "index". The last two had no branch at all, so
// reserves of 3051.5 billion dollars printed as "3.1K".

describe("formatUnitValue, one branch per delivered unit", () => {
  it("prints a percent, a multiple and a plain level", () => {
    expect(formatUnitValue(2.7, "%")).toBe("2.700%");
    expect(formatUnitValue(40.94, "x")).toBe("40.940x");
    expect(formatUnitValue(334.131, "")).toBe("334.131");
  });

  it("prints a dollar figure delivered in whole dollars", () => {
    expect(formatUnitValue(6746548000000, "$", "Fed Balance Sheet ($M)")).toBe("$6.75T");
    expect(formatUnitValue(877028000000, "$", "Treasury General Account ($M)")).toBe("$877.03B");
    // The sign sits BEFORE the dollar mark. "$-88.58B" read as a dollar mark
    // followed by a separate figure; the minus belongs to the amount.
    expect(formatUnitValue(-88576000000, "$", "Trade Balance ($M)")).toBe("-$88.58B");
    expect(formatUnitValue(1185684000000, "$", "Residential Fixed Investment ($B)")).toBe("$1.19T");
    expect(formatUnitValue(5868944000000, "$", "Net Liquidity ($)")).toBe("$5.87T");
  });

  it("prints a $B figure as the money it is", () => {
    expect(formatUnitValue(3051.5, "$B")).toBe("$3.05T");
    expect(formatUnitValue(1400, "$B")).toBe("$1.40T");
    expect(formatUnitValue(750, "$B")).toBe("$750.00B");
  });

  it("prints an index level as a level", () => {
    expect(formatUnitValue(-0.8477, "index")).toBe("-0.848");
  });

  it("upgrades the five $ series that are delivered in billions", () => {
    // Verified against the live payload: the name is not a guide, so these are
    // named one by one. M2 at 23218 is $23.22T, not $23.22K.
    expect(formatUnitValue(23218, "$", "M2 Money Supply ($B)")).toBe("$23.22T");
    expect(formatUnitValue(19886.4, "$", "M1 Money Supply ($B)")).toBe("$19.89T");
    expect(formatUnitValue(6976.3, "$", "Real M2 ($B, inflation-adjusted)")).toBe("$6.98T");
    expect(formatUnitValue(2787.519, "$", "Real Exports ($B)")).toBe("$2.79T");
    expect(formatUnitValue(3871.231, "$", "Real Imports ($B)")).toBe("$3.87T");
  });

  it("leaves a dollar series that is not on the list alone", () => {
    expect(formatUnitValue(107.02, "$", "WTI Crude Oil")).toBe("$107.020");
    expect(formatUnitValue(13542.82, "$", "Copper Price")).toBe("$13.5K");
  });

  it("falls through to a plain number for a unit it does not know", () => {
    expect(formatUnitValue(12.5, "$ / troy oz")).toBe("12.500");
  });
});

describe("a change printed as a change", () => {
  it("carries a plus sign so it cannot be read as a level", () => {
    expect(formatSignedPercent(6.9504)).toBe("+6.95%");
    expect(formatSignedPercent(-4.3211)).toBe("-4.32%");
    expect(formatSignedPercent(0)).toBe("0.00%");
  });

  it("does the same in the series' own unit", () => {
    expect(formatSignedUnitValue(0.7, "%")).toBe("+0.700%");
    expect(formatSignedUnitValue(-0.7, "%")).toBe("-0.700%");
  });
});

// ---------------------------------------------------------------------------
// The minus sits in front of the currency mark.
//
// formatCurrency used to build the compact branch off the signed value, which
// put the sign between the mark and the digits: "$-88.58B". A reader scanning
// a column sees the mark first and the sign second, which reads as a dollar
// figure of 88.58B rather than a negative one.

describe("formatCurrency puts the sign before the currency mark", () => {
  it("prints a negative at every compact magnitude", () => {
    expect(formatCurrency(-88576000000)).toBe("-$88.58B");
    expect(formatCurrency(-2.5e12)).toBe("-$2.50T");
    expect(formatCurrency(-4_300_000)).toBe("-$4.30M");
    expect(formatCurrency(-2_500)).toBe("-$2.5K");
  });

  it("leaves a positive exactly as it was", () => {
    expect(formatCurrency(88576000000)).toBe("$88.58B");
    expect(formatCurrency(2.5e12)).toBe("$2.50T");
    expect(formatCurrency(4_300_000)).toBe("$4.30M");
    expect(formatCurrency(2_500)).toBe("$2.5K");
    expect(formatCurrency(0)).toBe("$0.000");
  });

  it("agrees with Intl below the compact floor, which already signs this way", () => {
    expect(formatCurrency(-12.5)).toBe("-$12.500");
    expect(formatCurrency(-12.5, { compact: false })).toBe("-$12.500");
  });

  it("uses the ASCII hyphen-minus, never U+2212", () => {
    expect(formatCurrency(-88576000000).charCodeAt(0)).toBe(45);
    expect(formatPerShare(-4.5).charCodeAt(0)).toBe(45);
  });
});

describe("formatPerShare", () => {
  it("prints a per-share figure with the sign in front of the mark", () => {
    expect(formatPerShare(4.5)).toBe("$4.500");
    expect(formatPerShare(-4.5)).toBe("-$4.500");
    expect(formatPerShare(0)).toBe("$0.000");
  });

  it("prints n/a for a figure that is not there", () => {
    expect(formatPerShare(null)).toBe("n/a");
    expect(formatPerShare(undefined)).toBe("n/a");
  });
});
