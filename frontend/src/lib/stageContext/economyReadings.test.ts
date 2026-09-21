// The readings that used to be computed and then dropped on the floor.
//
// economyFigures looked a reading up only for `economic.metrics` entries, so
// the 10-year Treasury yield (definition 13, which the payload delivers under
// treasuryYields) and the commodity tiles (58 to 63) printed no reading at all
// even though the engine had decided one. This holds them on the line.

import { describe, expect, it } from "vitest";

import { commodityLines, economyFigures } from "./economySection";
import type { Commodity, Metric, SectionData } from "../types";

const NOW = new Date("2026-09-20T12:00:00Z");

function metric(name: string, value: number): Metric {
  return {
    id: name,
    number: 0,
    name,
    unit: "%",
    latestValue: value,
    trend: [
      { period: "2026-08-01", value: value - 0.1 },
      { period: "2026-09-01", value },
    ],
    definition: "",
    analysis: "",
    vertical: [],
    frequency: "daily",
    displayType: "line",
    isRateOfChange: false,
  };
}

function tile(label: string, price: number): Commodity {
  return {
    label,
    unit: "$ / metric ton",
    price: [
      { period: "2026-08-01", value: price - 1 },
      { period: "2026-09-01", value: price },
    ],
    volatility12m: [{ period: "2026-09-01", value: 18 }],
  } as Commodity;
}

function payload(over: Partial<SectionData>): SectionData {
  return {
    section: "economic",
    scopeKey: "global",
    title: "Economic",
    subtitle: "test payload",
    metrics: [],
    recessionBands: [],
    ...over,
  };
}

describe("the treasury curve carries its reading", () => {
  it("prints the reading recorded for definition 13", () => {
    const lines = economyFigures(
      payload({ treasuryYields: [metric("10-Year Treasury Yield", 4.94)] }),
      null,
      {
        readings: { 13: "10-year rate rising" },
        economicDefByName: new Map([["10-Year Treasury Yield", 13]]),
        now: NOW,
      },
    );
    const line = lines.find((l) => l.startsWith("10-Year Treasury Yield"));
    expect(line).toBeDefined();
    expect(line).toContain("reading 10-year rate rising");
  });

  it("prints no reading when none was recorded", () => {
    const lines = economyFigures(
      payload({ treasuryYields: [metric("10-Year Treasury Yield", 4.94)] }),
      null,
      { economicDefByName: new Map([["10-Year Treasury Yield", 13]]), now: NOW },
    );
    expect(lines.find((l) => l.startsWith("10-Year Treasury Yield"))).not.toContain("reading ");
  });
});

describe("a commodity tile carries its reading", () => {
  it("prints the reading recorded for the tile's own definition", () => {
    const lines = commodityLines([tile("Wheat", 228.7)], {
      60: "Stable within a normal range",
    });
    expect(lines[0]).toContain("reading Stable within a normal range");
  });

  it("never files a reading against a tile whose definition reads another series", () => {
    // Copper and WTI Crude are definitions 57 and 61, and both read the
    // `metrics[]` series of that name rather than the tile, so a reading filed
    // under them was decided on different numbers.
    const lines = commodityLines([tile("Copper", 13542), tile("WTI Crude", 107)], {
      57: "Rising on strong demand (above prior range, demand-driven)",
      61: "Rising on strong demand (above prior range, demand-driven)",
    });
    for (const line of lines) expect(line).not.toContain("reading ");
  });

  it("leaves the line alone when no reading was recorded", () => {
    expect(commodityLines([tile("Gold", 4424)], {})[0]).not.toContain("reading ");
    expect(commodityLines([tile("Gold", 4424)])[0]).not.toContain("reading ");
  });
});
