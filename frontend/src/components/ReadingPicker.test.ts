// The picker's two pure helpers: what the rules make of a live series, and the
// one line that prints it. The React part is not exercised here; these are the
// pieces that decide what the reader is told.

import { describe, expect, it } from "vitest";

import type { AutomaticReading } from "./ReadingPicker";
import type { Metric, TrendPoint } from "../lib/types";
import { automaticReading, matrixRowsForMetric, readingLine } from "./ReadingPicker";

function metric(values: TrendPoint[], overrides: Partial<Metric> = {}): Metric {
  const last = values[values.length - 1];
  return {
    id: "test",
    number: 1,
    name: "High-Yield Credit Spread (OAS)",
    unit: "%",
    latestValue: last ? last.value : 0,
    trend: values,
    definition: "",
    analysis: "",
    vertical: [],
    frequency: "daily",
    displayType: "line",
    isRateOfChange: false,
    ...overrides,
  };
}

/** A clock a day after the newest fixture point, so nothing reads as stale. */
const NOW = new Date("2026-08-15T00:00:00Z");

/** One monthly point a month, ending at `end`, so a year-ago figure exists. */
function monthly(end: string, values: number[]): TrendPoint[] {
  const [y, m] = end.split("-").map(Number);
  return values.map((value, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (values.length - 1 - i), 1));
    return { period: d.toISOString().slice(0, 10), value };
  });
}

describe("automaticReading", () => {
  it("decides a credit metric from its own series", () => {
    const out = automaticReading(
      "credit",
      1,
      metric([
        { period: "2026-07-15", value: 2.9 },
        { period: "2026-08-14", value: 2.7 },
      ]),
      NOW,
    );
    expect(out.reading).toBe("Very tight (below 3 percentage points)");
    expect(out.value).toBe("2.700%");
    expect(out.reads).toBe("latest");
    expect(out.period).toBe("2026-08");
  });

  it("moves with the figure, into the owner's next band", () => {
    const out = automaticReading("credit", 1, metric([{ period: "2026-08-14", value: 6.2 }]), NOW);
    expect(out.reading).toBe("Elevated (5 to 8 percentage points)");
  });

  it("decides nothing without a series", () => {
    expect(automaticReading("credit", 1, undefined, NOW).reading).toBeNull();
    expect(automaticReading("credit", 1, undefined, NOW).value).toBeNull();
    expect(automaticReading("credit", 1, metric([]), NOW).value).toBeNull();
  });

  it("still reports the figures for a metric that carries no rules", () => {
    const out = automaticReading("credit", 999, metric([{ period: "2026-08-14", value: 1 }]), NOW);
    expect(out.reading).toBeNull();
    expect(out.value).toBe("1.000%");
  });

  it("prints billions of dollars as money, not as a bare thousand", () => {
    const out = automaticReading(
      "credit",
      16,
      metric([{ period: "2026-07-01", value: 3051.5 }], {
        name: "Reserves of Depository Institutions ($B)",
        unit: "$B" as Metric["unit"],
        frequency: "monthly",
      }),
      NOW,
    );
    expect(out.reading).toBe("Ample reserves (roughly 2.5 to 3.5 trillion dollars)");
    expect(out.value).toBe("$3.05T");
  });

  it("prints the year-over-year change for a level series judged by it", () => {
    // Definition 9 reads the import price INDEX and bands it in percent a
    // year, so the line must print the percent, never the index level.
    const values = Array.from({ length: 25 }, (_, i) => 141 + i * 0.4);
    const out = automaticReading(
      "economic",
      9,
      metric(monthly("2026-08", values), {
        name: "Import Price Index",
        unit: "",
        frequency: "monthly",
      }),
      NOW,
    );
    expect(out.reads).toBe("yoyChangePct");
    expect(out.value).toMatch(/^\+\d+\.\d\d%$/);
    expect(out.value).not.toContain("150");
  });

  it("says a series the feed stopped updating is stale", () => {
    const out = automaticReading(
      "credit",
      14,
      metric(
        [
          { period: "2020-04-01", value: 10.1 },
          { period: "2020-07-01", value: 10.3 },
        ],
        { name: "Bank Equity to Total Assets", frequency: "quarterly" },
      ),
      NOW,
    );
    expect(out.stale).toBe(true);
    expect(out.reading).toBeNull();
    expect(out.period).toBe("2020-07");
  });

  it("ignores an observation stamped for a period that has not started", () => {
    const out = automaticReading(
      "credit",
      1,
      metric([
        { period: "2026-08-14", value: 2.7 },
        { period: "2026-12-01", value: 9.9 },
      ]),
      NOW,
    );
    expect(out.period).toBe("2026-08");
    expect(out.reading).toBe("Very tight (below 3 percentage points)");
  });
});

describe("readingLine", () => {
  const automatic: AutomaticReading = {
    reading: "Very tight (below 3 percentage points)",
    value: "2.700%",
    reads: "latest",
    period: "2026-08",
    direction: "falling",
    stale: false,
  };

  it("states the automatic reading, the figure it came from and its date", () => {
    expect(readingLine(null, automatic)).toBe(
      "Reading now: Very tight (below 3 percentage points), from the latest 2.700%, as of 2026-08",
    );
  });

  it("names the year-over-year change as what it is", () => {
    expect(
      readingLine(null, {
        ...automatic,
        reading: "Rising sharply (above 4% year over year)",
        value: "+6.95%",
        reads: "yoyChangePct",
      }),
    ).toBe(
      "Reading now: Rising sharply (above 4% year over year), from +6.95% year over year, as of 2026-08",
    );
  });

  it("names a change over the year as a change", () => {
    expect(
      readingLine(null, {
        ...automatic,
        reading: "Falling sharply (rapid decline)",
        value: "-0.700%",
        reads: "yoyChangeAbs",
      }),
    ).toBe(
      "Reading now: Falling sharply (rapid decline), from a change of -0.700% over the year, as of 2026-08",
    );
  });

  it("says not determined rather than guessing", () => {
    expect(
      readingLine(null, {
        reading: null,
        value: null,
        reads: "latest",
        period: null,
        direction: null,
        stale: false,
      }),
    ).toBe("Reading now: not determined");
  });

  it("adds the figures behind a reading no rule covered", () => {
    expect(
      readingLine(null, { ...automatic, reading: null, value: "3.200%" }),
    ).toBe("Reading now: not determined. Latest 3.200%, falling, as of 2026-08.");
    expect(
      readingLine(null, { ...automatic, reading: null, value: "3.200%", direction: null }),
    ).toBe("Reading now: not determined. Latest 3.200%, as of 2026-08.");
  });

  it("gives the date rather than a reading for a stale series", () => {
    expect(
      readingLine(null, {
        ...automatic,
        reading: null,
        value: "10.300%",
        period: "2020-07",
        stale: true,
      }),
    ).toBe("Reading now: not determined. The latest figure is from 2020-07.");
  });

  it("never says now about a stale series even when a rule matched", () => {
    expect(readingLine(null, { ...automatic, period: "2020-07", stale: true })).toBe(
      "Reading now: not determined. The latest figure is from 2020-07.",
    );
  });

  it("lets a saved pick win, and marks it as the reader's", () => {
    expect(readingLine("Normal (3 to 5 percentage points)", automatic)).toBe(
      "Reading now: Normal (3 to 5 percentage points), chosen by you",
    );
  });
});

describe("the Sector Rotation rows a reading may set", () => {
  const curve = (name: string) =>
    metric([{ period: "2026-08-14", value: 0.25 }], { name, unit: "%", frequency: "daily" });

  it("offers only the row whose series the picker actually read", () => {
    // Both curve rows map to definition 6, and the rules of 6 read 10Y-2Y.
    const rows = matrixRowsForMetric("economic", 6, curve("10Y - 2Y Treasury Spread"));
    expect(rows.map((r) => r.id)).toEqual(["spread_10y2y"]);
  });

  it("offers the other row when that is the series in hand", () => {
    const rows = matrixRowsForMetric("economic", 6, curve("10Y - 3M Treasury Spread"));
    expect(rows.map((r) => r.id)).toEqual(["spread_10y3m"]);
  });

  it("offers nothing rather than the wrong row when the series is unknown", () => {
    expect(matrixRowsForMetric("economic", 6, undefined)).toEqual([]);
    expect(matrixRowsForMetric("economic", 6, curve("Something else"))).toEqual([]);
  });

  it("leaves a definition with one row alone, series or no series", () => {
    const one = matrixRowsForMetric("economic", 37, curve("VIX"));
    expect(one.map((r) => r.id)).toEqual(["vix"]);
    expect(matrixRowsForMetric("economic", 37, undefined).map((r) => r.id)).toEqual(["vix"]);
  });

  it("offers nothing on the credit surface, which has no matrix", () => {
    expect(matrixRowsForMetric("credit", 1, curve("High-Yield Credit Spread (OAS)"))).toEqual([]);
  });
});
