// The reading engine: facts off a hand-made series with hand-computed numbers,
// the three ways a decision can fail, and the two captured macro payloads.

import { describe, expect, it } from "vitest";

import { stageFixture } from "../__fixtures__/stage";
import type { SectionData } from "../types";
import {
  automaticReadingsFromPayloads,
  decideForMetric,
  decideReading,
  factsFromSeries,
  payloadSeriesByName,
  yearAgoToleranceDays,
} from "./engine";
import { ALL_RULES, rulesFor } from "./index";
import { makeFacts } from "./testFacts";
import type { MetricRules, SeriesPoint } from "./types";

/** The day the stage fixtures were captured, so staleness reads the same. */
const NOW = new Date("2026-09-20T12:00:00Z");

/** 24 monthly points, 100 at 2024-09 rising by one a month to 123 at 2026-08. */
function risingMonthly(): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (let i = 0; i < 24; i++) {
    const month = 9 + i;
    const year = 2024 + Math.floor((month - 1) / 12);
    const m = ((month - 1) % 12) + 1;
    out.push({ period: `${year}-${String(m).padStart(2, "0")}-01`, value: 100 + i });
  }
  return out;
}

describe("factsFromSeries", () => {
  it("reads every figure off a monthly series", () => {
    const facts = factsFromSeries(risingMonthly(), "monthly", NOW);
    expect(facts).not.toBeNull();
    if (!facts) return;

    expect(facts.latest).toBe(123);
    expect(facts.latestPeriod).toBe("2026-08-01");
    expect(facts.previous).toBe(122);
    // Twelve months before 2026-08 is 2025-08, the twelfth point, worth 111.
    expect(facts.yearAgo).toBe(111);
    expect(facts.yoyChangeAbs).toBe(12);
    // 123 / 111 - 1 = 0.108108..., which is 10.8108... percent.
    expect(facts.yoyChangePct).toBeCloseTo(10.810811, 5);
    expect(facts.consecutiveNegative).toBe(0);
    expect(facts.points).toHaveLength(24);
    expect(facts.points[0]).toEqual({ period: "2024-09-01", value: 100 });
  });

  it("takes the direction and the percentile from the shipped reader", () => {
    const facts = factsFromSeries(risingMonthly(), "monthly", NOW);
    if (!facts) throw new Error("no facts");

    // Six months of one a month is a change of six; every historical change is
    // also six, so the neutral half-band is 0.5 x 6 = 3 and six clears it.
    expect(facts.trend).toBe("rising");
    expect(facts.trendChange).toBeCloseTo(6, 10);
    // The latest is the highest of all 24 points: 23 below it, 24 at or below,
    // so the midrank percentile is (23 + 24) / 48 = 0.979166..., in percent.
    expect(facts.percentile10y).toBeCloseTo(97.9167, 3);
  });

  it("states the percentile on a 0 to 100 scale, not a fraction", () => {
    // classifySeries returns a fraction; every rule reads percentile10y as a
    // percentage, so the scale is pinned here rather than left to a comment.
    const high = factsFromSeries(risingMonthly(), "monthly", NOW);
    expect(high?.percentile10y).toBeGreaterThan(90);
    expect(high?.percentile10y).toBeLessThanOrEqual(100);

    // The same series read backwards puts the latest at the bottom.
    const falling = risingMonthly()
      .map((p, i, all) => ({ period: p.period, value: all[all.length - 1 - i].value }));
    const low = factsFromSeries(falling, "monthly", NOW);
    expect(low?.percentile10y).toBeLessThan(10);
    expect(low?.percentile10y).toBeGreaterThanOrEqual(0);
  });

  it("leaves the direction facts null when the shipped reader skips", () => {
    const short: SeriesPoint[] = [
      { period: "2026-06-01", value: 4 },
      { period: "2026-07-01", value: 5 },
      { period: "2026-08-01", value: 6 },
    ];
    const facts = factsFromSeries(short, "monthly", NOW);
    if (!facts) throw new Error("no facts");
    expect(facts.trend).toBeNull();
    expect(facts.trendChange).toBeNull();
    expect(facts.percentile10y).toBeNull();
    // The level facts still hold, so a level rule can still decide.
    expect(facts.latest).toBe(6);
    expect(facts.previous).toBe(5);
  });

  it("reports no year-ago figure when nothing lands near twelve months back", () => {
    const gapped: SeriesPoint[] = [
      { period: "2025-05-01", value: 10 },
      { period: "2025-06-01", value: 11 },
      { period: "2026-08-01", value: 20 },
    ];
    const facts = factsFromSeries(gapped, "monthly", NOW);
    if (!facts) throw new Error("no facts");
    // The nearest point to 2025-08 is 2025-06, about 61 days away, past the
    // 45 day tolerance a monthly series allows.
    expect(facts.yearAgo).toBeNull();
    expect(facts.yoyChangeAbs).toBeNull();
    expect(facts.yoyChangePct).toBeNull();
  });

  it("refuses a year-over-year percent against a zero or negative base", () => {
    const crossing: SeriesPoint[] = [
      { period: "2025-08-01", value: -2 },
      { period: "2026-07-01", value: 3 },
      { period: "2026-08-01", value: 4 },
    ];
    const facts = factsFromSeries(crossing, "monthly", NOW);
    if (!facts) throw new Error("no facts");
    expect(facts.yearAgo).toBe(-2);
    expect(facts.yoyChangeAbs).toBe(6);
    expect(facts.yoyChangePct).toBeNull();
  });

  it("refuses a year-over-year percent against a base too small to be one", () => {
    // A base a hundredth of the series' own size turns a rounding-sized move
    // into a percent in the thousands. The absolute change still stands.
    const tiny: SeriesPoint[] = [
      ...Array.from({ length: 11 }, (_, i) => i + 1)
        .filter((month) => month !== 8)
        .map((month) => ({
          period: `2025-${String(month).padStart(2, "0")}-01`,
          value: 100 + month,
        })),
      { period: "2025-08-01", value: 0.004 },
      { period: "2026-08-01", value: 120 },
    ];
    const facts = factsFromSeries(tiny, "monthly", NOW);
    if (!facts) throw new Error("no facts");
    expect(facts.yearAgo).toBe(0.004);
    expect(facts.yoyChangeAbs).toBeCloseTo(119.996, 3);
    expect(facts.yoyChangePct).toBeNull();
  });

  it("drops a point whose period is not a period", () => {
    // `new Date(null)` is the epoch, so an unguarded parse put a point in 1970
    // and dragged the percentile window back with it.
    const dirty = [
      { period: null as unknown as string, value: 999 },
      { period: "", value: 998 },
      ...risingMonthly(),
    ];
    const facts = factsFromSeries(dirty, "monthly", NOW);
    if (!facts) throw new Error("no facts");
    expect(facts.points).toHaveLength(24);
    expect(facts.points[0]).toEqual({ period: "2024-09-01", value: 100 });
  });

  it("ignores an observation stamped for a period that has not started", () => {
    // The implied equity risk premium arrives with a point dated for the
    // December still ahead; read as the latest it dates the reading in the
    // future and reports a level nobody has observed.
    const ahead = [...risingMonthly(), { period: "2026-12-01", value: 500 }];
    const facts = factsFromSeries(ahead, "monthly", NOW);
    if (!facts) throw new Error("no facts");
    expect(facts.latest).toBe(123);
    expect(facts.latestPeriod).toBe("2026-08-01");
    expect(facts.points.some((p) => p.value === 500)).toBe(false);
  });

  it("marks a series the feed stopped updating as stale", () => {
    const stopped: SeriesPoint[] = Array.from({ length: 24 }, (_, i) => ({
      period: `${2018 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-01`,
      value: 10 + i,
    }));
    const facts = factsFromSeries(stopped, "quarterly", NOW);
    if (!facts) throw new Error("no facts");
    expect(facts.stale).toBe(true);
    // The figures are still computed; only the verdict is withheld.
    expect(facts.latest).toBe(33);
  });

  it("does not call a current series stale", () => {
    expect(factsFromSeries(risingMonthly(), "monthly", NOW)?.stale).toBe(false);
  });

  it("reads a daily series at month ends", () => {
    // Mid-month dates only: an ISO date parses at UTC midnight and the month is
    // then read in local time, so a day at either end of a month would land in
    // a different month depending on the machine's offset.
    const daily: SeriesPoint[] = [
      { period: "2026-06-08", value: 1 },
      { period: "2026-06-15", value: 2 },
      { period: "2026-06-22", value: 3 },
      { period: "2026-07-14", value: 4 },
      { period: "2026-07-20", value: 5 },
      { period: "2026-08-12", value: 6 },
    ];
    const facts = factsFromSeries(daily, "daily", NOW);
    if (!facts) throw new Error("no facts");
    expect(facts.points).toHaveLength(3);
    expect(facts.latest).toBe(6);
    // The previous observation is June's last, not the day before.
    expect(facts.previous).toBe(5);
  });

  it("counts the run of negative observations at the end", () => {
    const dipping: SeriesPoint[] = [
      { period: "2026-04-01", value: 2 },
      { period: "2026-05-01", value: -1 },
      { period: "2026-06-01", value: -2 },
      { period: "2026-07-01", value: -3 },
    ];
    const facts = factsFromSeries(dipping, "monthly", NOW);
    expect(facts?.consecutiveNegative).toBe(3);
  });

  it("returns null when no observation is usable", () => {
    expect(factsFromSeries([], "monthly", NOW)).toBeNull();
    expect(
      factsFromSeries([{ period: "not a date", value: 1 }], "monthly", NOW),
    ).toBeNull();
    expect(factsFromSeries([{ period: "2026-08-01", value: NaN }], "monthly", NOW)).toBeNull();
  });

  it("sorts an out-of-order series before reading it", () => {
    const shuffled: SeriesPoint[] = [
      { period: "2026-08-01", value: 30 },
      { period: "2026-06-01", value: 10 },
      { period: "2026-07-01", value: 20 },
    ];
    const facts = factsFromSeries(shuffled, "monthly", NOW);
    expect(facts?.latest).toBe(30);
    expect(facts?.previous).toBe(20);
  });

  it("widens the year-ago tolerance for the coarser frequencies", () => {
    expect(yearAgoToleranceDays("monthly")).toBe(45);
    expect(yearAgoToleranceDays("daily")).toBe(45);
    expect(yearAgoToleranceDays("quarterly")).toBe(60);
    expect(yearAgoToleranceDays("annual")).toBe(200);
  });
});

// ── decideReading ──────────────────────────────────────────────────────────

function metricWith(rules: { reading: string; when: (latest: number) => boolean }[]): MetricRules {
  return {
    surface: "credit",
    defNumber: 999,
    metricName: "Test metric",
    rules: rules.map((r) => ({
      reading: r.reading,
      when: (facts) => r.when(facts.latest),
      rule: `test rule for ${r.reading}`,
      source: `test source for ${r.reading}`,
    })),
    undetermined: [],
  };
}

describe("decideReading", () => {
  const facts = makeFacts({ latest: 5 });

  it("names the reading when exactly one rule matches", () => {
    const metric = metricWith([
      { reading: "Low", when: (v) => v < 3 },
      { reading: "High", when: (v) => v >= 3 },
    ]);
    const decision = decideReading(metric, facts);
    expect(decision.determined).toBe(true);
    if (!decision.determined) return;
    expect(decision.reading).toBe("High");
    expect(decision.rule).toBe("test rule for High");
    expect(decision.facts.latest).toBe(5);
  });

  it("reports no match rather than guessing", () => {
    const metric = metricWith([{ reading: "Low", when: (v) => v < 3 }]);
    const decision = decideReading(metric, facts);
    expect(decision).toMatchObject({ determined: false, why: "no-match" });
    if (decision.determined) return;
    expect(decision.detail).toContain("5");
  });

  it("reports an overlap and names the readings, never the first", () => {
    const metric = metricWith([
      { reading: "Wide", when: (v) => v >= 3 },
      { reading: "Also wide", when: (v) => v >= 4 },
      { reading: "Narrow", when: (v) => v < 1 },
    ]);
    const decision = decideReading(metric, facts);
    expect(decision).toMatchObject({ determined: false, why: "overlap" });
    if (decision.determined) return;
    expect(decision.detail).toContain("Wide");
    expect(decision.detail).toContain("Also wide");
    expect(decision.detail).not.toContain("Narrow");
  });

  it("reports no rules and no series separately", () => {
    const none: MetricRules = {
      surface: "credit",
      defNumber: 998,
      metricName: "Ruleless metric",
      rules: [],
      undetermined: [],
    };
    expect(decideReading(none, facts)).toMatchObject({ determined: false, why: "no-rules" });

    const metric = metricWith([{ reading: "Low", when: (v) => v < 3 }]);
    expect(decideReading(metric, null)).toMatchObject({ determined: false, why: "no-series" });
  });
});

describe("decideForMetric", () => {
  it("returns null for a definition that carries no rules", () => {
    expect(
      decideForMetric("credit", 99, { trend: [{ period: "2026-08-01", value: 1 }], frequency: "monthly" }),
    ).toBeNull();
  });

  it("decides a credit metric from its own series", () => {
    const decision = decideForMetric(
      "credit",
      1,
      { trend: [{ period: "2026-08-01", value: 2.7 }], frequency: "daily" },
      NOW,
    );
    expect(decision).toMatchObject({
      determined: true,
      reading: "Very tight (below 3 percentage points)",
    });
  });
});

// ── The captured payloads ──────────────────────────────────────────────────

describe("automaticReadingsFromPayloads", () => {
  const economic = stageFixture<SectionData>("economic");
  const credit = stageFixture<SectionData>("creditBanks");
  const out = automaticReadingsFromPayloads(economic, credit, NOW);

  it("decides every credit metric whose feed is still running", () => {
    // 15 of 17. Definitions 14 and 15 are the two the data source stopped
    // updating in 2020, and a reading of a 2020 figure is not a reading of now.
    expect(Object.keys(out.credit)).toHaveLength(15);
    expect(out.credit[14]).toBeUndefined();
    expect(out.credit[15]).toBeUndefined();
  });

  it("refuses a stale series rather than dating a 2020 figure today", () => {
    const rules = rulesFor("credit", 14);
    if (!rules) throw new Error("no rules for credit 14");
    const series = payloadSeriesByName(credit).get(rules.metricName);
    if (!series) throw new Error("no series for credit 14");
    const decision = decideReading(rules, factsFromSeries(series.trend, series.frequency, NOW));
    expect(decision).toMatchObject({ determined: false, why: "stale-series" });
  });

  it("matches the readings the captured figures imply", () => {
    // High-yield OAS 2.7, IG OAS 0.78, Baa 1.44, reserves 3051.5 billion,
    // stress index -0.8477.
    expect(out.credit[1]).toBe("Very tight (below 3 percentage points)");
    expect(out.credit[2]).toBe("Very tight (below 1 percentage point)");
    expect(out.credit[3]).toBe("Very narrow (below 1.5 percentage points)");
    expect(out.credit[16]).toBe("Ample reserves (roughly 2.5 to 3.5 trillion dollars)");
    expect(out.credit[17]).toBe("Calm (below zero, negative readings)");
  });

  it("pairs a rule set with its series by NAME, never by the payload's number", () => {
    // The payload's own `number` is not the definition file number on the
    // economic surface, so a run keyed on it would mis-pair nearly every
    // metric. Every series named by a rule set resolves to the payload metric
    // of that exact name.
    const names = new Map((economic.metrics ?? []).map((m) => [m.name, m.number]));
    const unemployment = (economic.metrics ?? []).find((m) => m.name === "Unemployment Rate");
    expect(unemployment, "the fixture should carry the unemployment rate").toBeTruthy();
    expect(names.get("Unemployment Rate")).not.toBe(50);

    const series = payloadSeriesByName(economic);
    for (const rules of ALL_RULES) {
      if (rules.surface !== "economic") continue;
      const metric = series.get(rules.metricName);
      if (!metric) continue;
      expect(metric.name, `economic ${rules.defNumber}`).toBe(rules.metricName);
    }
  });

  it("reads the treasury curve, which arrives outside metrics[]", () => {
    const series = payloadSeriesByName(economic);
    const tenYear = series.get("10-Year Treasury Yield");
    expect(tenYear, "the 10-year yield is a top-level treasuryYields entry").toBeTruthy();
    expect((economic.metrics ?? []).some((m) => m.name === "10-Year Treasury Yield")).toBe(false);
    // Definition 13 has no row in metrics[] and is decided off that series.
    expect(out.economic[13]).toBeTypeOf("string");
  });

  it("reads the commodity tiles, which also arrive outside metrics[]", () => {
    const series = payloadSeriesByName(economic);
    for (const label of ["Gold", "Silver", "Wheat", "Brent Crude", "Henry Hub NatGas"]) {
      const tile = series.get(label);
      expect(tile, `${label} is a commodity tile`).toBeTruthy();
      expect((economic.metrics ?? []).some((m) => m.name === label), label).toBe(false);
      expect(tile?.trend.length ?? 0, label).toBeGreaterThan(1);
      expect(tile?.frequency, label).toBe("monthly");
    }
  });

  it("never lets a commodity tile displace a metrics[] series of the same name", () => {
    const named: SectionData = {
      ...economic,
      metrics: [
        {
          id: "x",
          number: 1,
          name: "Gold",
          unit: "$",
          latestValue: 1,
          trend: [{ period: "2026-08-01", value: 1 }],
          definition: "",
          analysis: "",
          vertical: [],
          frequency: "monthly",
          displayType: "line",
          isRateOfChange: false,
        },
      ],
    };
    expect(payloadSeriesByName(named).get("Gold")?.unit).toBe("$");
  });

  it("refuses a commodity tile that carries only a latest price", () => {
    const thin: SectionData = {
      ...economic,
      metrics: [],
      treasuryYields: [],
      commodities: [
        {
          label: "Thin tile",
          ticker: "T",
          source: "fred",
          unit: "$ / unit",
          price: [{ period: "2026-08-01", value: 3 }],
          volatility12m: [],
        },
      ],
    };
    expect(payloadSeriesByName(thin).has("Thin tile")).toBe(false);
  });

  it("files every reading under a definition number that carries rules", () => {
    for (const surface of ["economic", "credit"] as const) {
      for (const key of Object.keys(out[surface])) {
        expect(rulesFor(surface, Number(key)), `${surface} ${key}`).not.toBeNull();
      }
    }
  });

  it("returns empty maps when neither payload loaded", () => {
    expect(automaticReadingsFromPayloads(null, null, NOW)).toEqual({ economic: {}, credit: {} });
  });
});
