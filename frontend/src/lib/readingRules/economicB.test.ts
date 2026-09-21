// Tests for the economic reading rules, definition files 36 to 69.
//
// Four things are checked:
//   1. one sample per rule, asserting that exactly that one rule matches, and a
//      completeness check so no rule can be added without a sample;
//   2. boundary samples on both sides of every threshold in the file;
//   3. one shared sweep over each metric's plausible range crossed with every
//      trend and percentile state, asserting that two rules never match at once;
//   4. a label check against the parsed definition dataset, so every `reading`
//      is the owner's Part 3 label word for word and rules plus undetermined
//      account for every reading of every metric.

import { describe, expect, it } from "vitest";
import { ECONOMIC_RULES_B, RATE_BAND_DEFINED } from "./economicB";
import { makeFacts } from "./testFacts";
import type { SeriesFacts, SeriesPoint } from "./types";
import { METRIC_SECTOR_MAP } from "../generated/metricSectorMap";

// ---------------------------------------------------------------------------
// Harness

type Trend = SeriesFacts["trend"];

function metric(defNumber: number) {
  const m = ECONOMIC_RULES_B.find((x) => x.defNumber === defNumber);
  if (!m) throw new Error(`no MetricRules entry for definition ${defNumber}`);
  return m;
}

/** Every reading of `defNumber` whose rule holds for these facts. */
function matching(defNumber: number, facts: SeriesFacts): string[] {
  return metric(defNumber)
    .rules.filter((r) => r.when(facts))
    .map((r) => r.reading);
}

/** The reading of the rule at `index`, so a shared shape can be asserted by position. */
function labelAt(defNumber: number, index: number): string {
  const r = metric(defNumber).rules[index];
  if (!r) throw new Error(`definition ${defNumber} has no rule at index ${index}`);
  return r.reading;
}

const facts = (o: Partial<SeriesFacts> & { latest: number }): SeriesFacts => makeFacts(o);
/** Level-only facts: the latest value is irrelevant to the rule under test. */
const lvl = (percentile10y: number | null, latest = 50): SeriesFacts =>
  facts({ latest, percentile10y });
/** Direction plus level facts. */
const dir = (trend: Trend, percentile10y: number | null, latest = 50): SeriesFacts =>
  facts({ latest, trend, percentile10y });

/** Nine evenly spaced points, so a midrank percentile lands on a known rung. */
const NINE: SeriesPoint[] = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((v, i) => ({
  period: `20${10 + i}-01-01`,
  value: v,
}));

interface Sample {
  def: number;
  expect: string;
  facts: SeriesFacts;
  note: string;
}

const s = (def: number, index: number, f: SeriesFacts, note: string): Sample => ({
  def,
  expect: labelAt(def, index),
  facts: f,
  note,
});

// ---------------------------------------------------------------------------
// 1 and 2: one sample per rule, plus both sides of every threshold

/** Metrics built by the shared low / moderate / high / spiking level ladder. */
const LEVEL_LADDER = [37, 52, 53, 54];
/** Metrics built by the shared rising / stable high / falling / falling harder ladder. */
const DIRECTION_LADDER = [39, 40, 47, 48];

const SAMPLES: Sample[] = [
  // 36 Bull-Bear Spread. Sign from the owner, extremes from the level.
  s(36, 0, facts({ latest: 25, percentile10y: 95 }), "clearly positive at a ten year high"),
  s(36, 1, facts({ latest: 8, percentile10y: 55 }), "positive, middling level"),
  s(36, 2, facts({ latest: -8, percentile10y: 45 }), "negative, middling level"),
  s(36, 3, facts({ latest: -25, percentile10y: 5 }), "negative at a ten year low"),
  s(36, 0, facts({ latest: 0.0001, percentile10y: 80 }), "boundary: percentile exactly 80"),
  s(36, 1, facts({ latest: 0.0001, percentile10y: 79.99 }), "boundary: just under 80"),
  s(36, 1, facts({ latest: 0.0001, percentile10y: null }), "no percentile is never extreme"),
  s(36, 2, facts({ latest: 0, percentile10y: 50 }), "boundary: a spread of exactly zero"),
  s(36, 3, facts({ latest: 0, percentile10y: 20 }), "boundary: percentile exactly 20"),
  s(36, 2, facts({ latest: 0, percentile10y: 20.01 }), "boundary: just over 20"),

  // 38 Fund manager cash allocation. Four bands around the median.
  s(38, 0, lvl(90), "well above average"),
  s(38, 1, lvl(60), "above average"),
  s(38, 2, lvl(35), "below average"),
  s(38, 3, lvl(10), "well below average"),
  s(38, 0, lvl(80), "boundary: exactly 80"),
  s(38, 1, lvl(79.99), "boundary: just under 80"),
  s(38, 1, lvl(50), "boundary: exactly the median"),
  s(38, 2, lvl(49.99), "boundary: just under the median"),
  s(38, 2, lvl(20), "boundary: exactly 20"),
  s(38, 3, lvl(19.99), "boundary: just under 20"),

  // 41 Gold to silver ratio. Direction decides first, the level rungs take the
  // ratio the reader calls stable, so no label is shown against its own move.
  s(41, 0, dir("neutral", 90), "stable at an extreme high"),
  s(41, 0, dir(null, 90), "no readable direction, extreme high"),
  s(41, 1, dir("rising", 50), "rising"),
  s(41, 1, dir("rising", 95), "rising outranks the level rung"),
  s(41, 2, dir("falling", 50), "falling"),
  s(41, 2, dir("falling", 5), "falling outranks the level rung"),
  s(41, 3, dir("neutral", 5), "stable at an extreme low"),
  s(41, 0, dir("neutral", 80), "boundary: exactly 80"),
  s(41, 3, dir("neutral", 20), "boundary: exactly 20"),

  // 42 Equity risk premium. Zero is the owner's only number.
  s(42, 0, facts({ latest: 6, percentile10y: 90 }), "generous premium"),
  s(42, 1, facts({ latest: 4, percentile10y: 50 }), "normal premium"),
  s(42, 2, facts({ latest: 2.5, percentile10y: 10 }), "thin premium"),
  s(42, 3, facts({ latest: -1, percentile10y: 0 }), "below zero"),
  s(42, 1, facts({ latest: 0, percentile10y: 50 }), "boundary: exactly zero"),
  s(42, 3, facts({ latest: -0.0001, percentile10y: 50 }), "boundary: just below zero"),
  s(42, 0, facts({ latest: 5, percentile10y: 80 }), "boundary: exactly 80"),
  s(42, 1, facts({ latest: 5, percentile10y: 79.99 }), "boundary: just under 80"),
  s(42, 2, facts({ latest: 5, percentile10y: 20 }), "boundary: exactly 20"),
  s(42, 1, facts({ latest: 5, percentile10y: 20.01 }), "boundary: just over 20"),

  // 44 Bank net interest margin.
  s(44, 0, dir("rising", 50), "widening"),
  s(44, 1, dir("neutral", 50), "stable above the bottom fifth"),
  s(44, 2, dir("falling", 50), "compressing"),
  s(44, 3, dir("falling", 10), "compressing at a ten year low"),
  s(44, 1, dir("neutral", 20.01), "boundary: just over 20"),
  s(44, 3, dir("falling", 20), "boundary: exactly 20"),
  s(44, 2, dir("falling", 20.01), "boundary: just over 20"),
  s(44, 2, dir("falling", null), "no percentile is never extreme"),

  // 45 Mortgage rate.
  s(45, 0, dir("falling", 50), "falling"),
  s(45, 1, dir("neutral", 10), "stable at a low level"),
  s(45, 2, dir("rising", 50), "rising"),
  s(45, 3, dir("rising", 90), "rising at a ten year high"),
  s(45, 1, dir("neutral", 20), "boundary: exactly 20"),
  s(45, 3, dir("rising", 80), "boundary: exactly 80"),
  s(45, 2, dir("rising", 79.99), "boundary: just under 80"),
  s(45, 2, dir("rising", null), "no percentile is never extreme"),

  // 46 Crude oil inventory.
  s(46, 0, dir("falling", 10), "drawing down at a ten year low"),
  s(46, 1, dir("falling", 50), "drawing down"),
  s(46, 2, dir("rising", 50), "building"),
  s(46, 3, dir("rising", 90), "building to a ten year high"),
  s(46, 0, dir("falling", 20), "boundary: exactly 20"),
  s(46, 1, dir("falling", 20.01), "boundary: just over 20"),
  s(46, 3, dir("rising", 80), "boundary: exactly 80"),
  s(46, 2, dir("rising", 79.99), "boundary: just under 80"),

  // 49 Population growth. Every cut is the owner's own.
  s(49, 0, facts({ latest: 1.5 }), "above 1 percent"),
  s(49, 1, facts({ latest: 0.7 }), "between 0.5 and 1 percent"),
  s(49, 2, facts({ latest: 0.25 }), "between zero and 0.5 percent"),
  s(49, 3, facts({ latest: -0.3 }), "shrinking"),
  s(49, 0, facts({ latest: 1.0001 }), "boundary: just above 1"),
  s(49, 1, facts({ latest: 1 }), "boundary: exactly 1"),
  s(49, 1, facts({ latest: 0.5 }), "boundary: exactly 0.5"),
  s(49, 2, facts({ latest: 0.4999 }), "boundary: just under 0.5"),
  s(49, 2, facts({ latest: 0 }), "boundary: exactly zero"),
  s(49, 3, facts({ latest: -0.0001 }), "boundary: just below zero"),

  // 55 S&P 500 to real M2. The level reading outranks the three direction readings.
  s(55, 0, dir("rising", 50), "rising below the extreme"),
  s(55, 1, dir("neutral", 50), "flat below the extreme"),
  s(55, 2, dir("falling", 50), "falling below the extreme"),
  s(55, 3, dir("rising", 97), "extended far above its range"),
  s(55, 3, dir("rising", 95), "boundary: exactly 95"),
  s(55, 0, dir("rising", 94.99), "boundary: just under 95"),
  s(55, 3, dir(null, 97), "the level reading needs no direction"),

  // 56 Bank loans and leases. Every cut is the owner's own.
  s(56, 0, facts({ latest: 10 }), "above 8 percent"),
  s(56, 1, facts({ latest: 5 }), "between 3 and 8 percent"),
  s(56, 2, facts({ latest: 1 }), "between zero and 3 percent"),
  s(56, 3, facts({ latest: -2 }), "contracting"),
  s(56, 0, facts({ latest: 8.0001 }), "boundary: just above 8"),
  s(56, 1, facts({ latest: 8 }), "boundary: exactly 8"),
  s(56, 1, facts({ latest: 3 }), "boundary: exactly 3"),
  s(56, 2, facts({ latest: 2.9999 }), "boundary: just under 3"),
  s(56, 2, facts({ latest: 0 }), "boundary: exactly zero"),
  s(56, 3, facts({ latest: -0.0001 }), "boundary: just below zero"),

  // 60 Wheat and 63 natural gas: one testable reading each.
  s(60, 0, dir("neutral", 50), "stable inside the normal band"),
  s(63, 0, dir("neutral", 50), "stable inside the normal band"),

  // 66 Ten year real yield. Zero is the owner's number.
  s(66, 0, facts({ latest: -0.5, trend: "neutral", percentile10y: 5 }), "below zero"),
  s(66, 1, facts({ latest: 1, trend: "neutral", percentile10y: 50 }), "low but positive"),
  s(66, 2, facts({ latest: -1, trend: "rising", percentile10y: 5 }), "rising outranks the level"),
  s(66, 3, facts({ latest: 2.6, trend: "neutral", percentile10y: 90 }), "high and steady"),
  s(66, 1, facts({ latest: 0, trend: "neutral", percentile10y: 50 }), "boundary: exactly zero"),
  s(66, 0, facts({ latest: -0.0001, trend: "falling", percentile10y: 50 }), "boundary: just below zero"),
  s(66, 3, facts({ latest: 2, trend: "neutral", percentile10y: 80 }), "boundary: exactly 80"),
  s(66, 1, facts({ latest: 2, trend: "neutral", percentile10y: 79.99 }), "boundary: just under 80"),
  s(66, 1, facts({ latest: 2, trend: "falling", percentile10y: null }), "no percentile, not rising"),

  // 67 Net liquidity, five rungs.
  s(67, 0, dir("rising", 90), "rising at a ten year high"),
  s(67, 1, dir("rising", 50), "rising"),
  s(67, 2, dir("neutral", 50), "flat"),
  s(67, 3, dir("falling", 50), "falling"),
  s(67, 4, dir("falling", 10), "falling to a ten year low"),
  s(67, 0, dir("rising", 80), "boundary: exactly 80"),
  s(67, 1, dir("rising", 79.99), "boundary: just under 80"),
  s(67, 4, dir("falling", 20), "boundary: exactly 20"),
  s(67, 3, dir("falling", 20.01), "boundary: just over 20"),

  // 68 Expected return, read off the whole delivered record in even thirds.
  s(68, 0, facts({ latest: 8, points: NINE }), "top of the record"),
  s(68, 1, facts({ latest: 4, points: NINE }), "middle of the record"),
  s(68, 2, facts({ latest: 0, points: NINE }), "bottom of the record"),
  s(68, 0, facts({ latest: 6, points: NINE }), "boundary: midrank 72.2, just over two thirds"),
  s(68, 1, facts({ latest: 5, points: NINE }), "boundary: midrank 61.1, just under two thirds"),
  s(68, 1, facts({ latest: 3, points: NINE }), "boundary: midrank 38.9, just over one third"),
  s(68, 2, facts({ latest: 2, points: NINE }), "boundary: midrank 27.8, just under one third"),

  // 69 AAII allocation. 72 and 52 are the owner's cuts, 62 his stated average.
  s(69, 0, facts({ latest: 75 }), "far above average"),
  s(69, 1, facts({ latest: 69 }), "modestly above average"),
  s(69, 2, facts({ latest: 62 }), "at the long-run average"),
  s(69, 3, facts({ latest: 54 }), "below average"),
  s(69, 4, facts({ latest: 45 }), "far below average"),
  s(69, 0, facts({ latest: 72 }), "boundary: exactly 72"),
  s(69, 1, facts({ latest: 71.99 }), "boundary: just under 72"),
  s(69, 1, facts({ latest: 67.01 }), "boundary: just over 67"),
  s(69, 2, facts({ latest: 67 }), "boundary: exactly 67"),
  s(69, 2, facts({ latest: 57 }), "boundary: exactly 57"),
  s(69, 3, facts({ latest: 56.99 }), "boundary: just under 57"),
  s(69, 3, facts({ latest: 52.01 }), "boundary: just over 52"),
  s(69, 4, facts({ latest: 52 }), "boundary: exactly 52"),
];

describe("one sample per reading", () => {
  for (const sample of SAMPLES) {
    it(`${sample.def}: ${sample.expect} (${sample.note})`, () => {
      expect(matching(sample.def, sample.facts)).toEqual([sample.expect]);
    });
  }

  for (const def of LEVEL_LADDER) {
    it(`${def}: the shared level ladder picks one rung at every cut`, () => {
      const cases: [number | null, number | null][] = [
        [10, 0],
        [19.99, 0],
        [20, 1],
        [50, 1],
        [79.99, 1],
        [80, 2],
        [85, 2],
        [94.99, 2],
        [95, 3],
        [100, 3],
        [null, null],
      ];
      for (const [percentile, index] of cases) {
        const got = matching(def, lvl(percentile));
        expect(got, `percentile ${percentile}`).toEqual(
          index === null ? [] : [labelAt(def, index)],
        );
      }
    });
  }

  for (const def of DIRECTION_LADDER) {
    it(`${def}: the shared direction ladder picks one rung at every cut`, () => {
      const cases: [Trend, number | null, number | null][] = [
        ["rising", 5, 0],
        ["rising", 99, 0],
        ["rising", null, 0],
        ["neutral", 90, 1],
        ["neutral", 80, 1],
        ["neutral", 79.99, null],
        ["neutral", null, null],
        ["falling", 50, 2],
        ["falling", 20.01, 2],
        ["falling", null, 2],
        ["falling", 20, 3],
        ["falling", 5, 3],
        [null, 90, null],
      ];
      for (const [trend, percentile, index] of cases) {
        const got = matching(def, dir(trend, percentile));
        expect(got, `${trend} at percentile ${percentile}`).toEqual(
          index === null ? [] : [labelAt(def, index)],
        );
      }
    });
  }

  it("every rule of every metric has at least one sample", () => {
    const covered = new Set(SAMPLES.map((x) => `${x.def}|${x.expect}`));
    const ladderCovered = new Set<string>();
    for (const def of [...LEVEL_LADDER, ...DIRECTION_LADDER]) {
      for (const r of metric(def).rules) ladderCovered.add(`${def}|${r.reading}`);
    }
    const missing: string[] = [];
    for (const m of ECONOMIC_RULES_B) {
      for (const r of m.rules) {
        const key = `${m.defNumber}|${r.reading}`;
        if (!covered.has(key) && !ladderCovered.has(key)) missing.push(key);
      }
    }
    expect(missing).toEqual([]);
  });

  it("a metric with no rules has undetermined readings instead", () => {
    for (const m of ECONOMIC_RULES_B) {
      if (m.rules.length === 0) expect(m.undetermined.length, `${m.defNumber}`).toBeGreaterThan(0);
    }
  });

  it("68 falls silent when the delivered record is too short to rank against", () => {
    expect(matching(68, facts({ latest: 4, points: NINE.slice(0, 7) }))).toEqual([]);
    expect(matching(68, facts({ latest: 4 }))).toEqual([]);
  });

  it("41 leaves a stable ratio in the middle of its range uncovered", () => {
    for (const p of [25, 50, 79.99]) expect(matching(41, dir("neutral", p)), `${p}`).toEqual([]);
    expect(matching(41, dir(null, 50))).toEqual([]);
  });

  it("66 leaves a falling real yield in the top fifth uncovered", () => {
    expect(matching(66, facts({ latest: 2.6, trend: "falling", percentile10y: 90 }))).toEqual([]);
    expect(matching(66, facts({ latest: 2.6, trend: null, percentile10y: 90 }))).toEqual([]);
  });

  for (const def of [45, 46, ...DIRECTION_LADDER]) {
    it(`${def} leaves the combinations its gapNotes call uncovered uncovered`, () => {
      expect(matching(def, dir(null, 90)), "no readable direction").toEqual([]);
      expect(matching(def, dir(null, 10)), "no readable direction").toEqual([]);
    });
  }

  it("46 leaves stable inventories uncovered", () => {
    for (const p of [10, 50, 90]) expect(matching(46, dir("neutral", p)), `${p}`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The two rate of change metrics read the newest print
//
// They used to be decided on the mean of the last three months while the line
// beside the reading printed the newest print, so on 106 of the 764 dates in
// these two records the figure on the page sat outside the band the line had
// just named it by. The band is now read on the same figure the line prints.

describe("a rate of change band reads the print the line shows", () => {
  /** Three monthly points ending on the default latest period. */
  const quarter = (values: [number, number, number]) =>
    ["2025-11-01", "2025-12-01", "2026-01-01"].map((period, i) => ({
      period,
      value: values[i],
    }));

  it("56: the newest print decides, whatever the quarter behind it did", () => {
    // Newest print 9.0 is above the owner is 8 percent cut; the quarter is 7.0.
    const f = facts({ latest: 9, points: quarter([5.5, 6.5, 9]) });
    expect(matching(56, f)).toEqual(["Strong growth (above 8% year over year)"]);
  });

  it("49: the newest print decides there too", () => {
    const f = facts({ latest: 0.4, points: quarter([0.65, 0.6, 0.4]) });
    expect(matching(49, f)).toEqual(["Slow growth (0 to 0.5% annually)"]);
  });

  it("neither reads the points list at all", () => {
    // Same latest, wildly different history: the verdict cannot move.
    const a = facts({ latest: 9, points: quarter([5.5, 6.5, 9]) });
    const b = facts({ latest: 9, points: NINE });
    expect(matching(56, a)).toEqual(matching(56, b));
    expect(matching(49, facts({ latest: 0.4 }))).toEqual(["Slow growth (0 to 0.5% annually)"]);
  });
});

// ---------------------------------------------------------------------------
// 3: the shared sweep. Two rules of one metric must never hold at once.

/** Each metric's plausible range, from the live /api/economic payload. */
const SWEEP_LATEST: Record<number, number[]> = {
  36: [-60, -40, -25, -10, -0.5, 0, 0.5, 10, 25, 40, 60],
  37: [9, 12, 15, 20, 30, 50, 83],
  38: [1, 2, 3, 4, 5, 6, 7],
  39: [2, 2.5, 3, 3.3, 4, 5, 6],
  40: [63, 80, 95, 110, 115],
  41: [49, 60, 66, 80, 95, 113],
  42: [-2, -0.5, 0, 1, 2.4, 3.8, 5, 6.3],
  43: [0],
  44: [1, 2, 3, 4, 5],
  45: [2.5, 4, 5.5, 6.95, 7.8],
  46: [350, 400, 450, 500],
  47: [60, 80, 90, 100],
  48: [40, 70, 100, 150, 216],
  49: [-0.5, -0.1, 0, 0.1, 0.25, 0.4999, 0.5, 0.7, 1, 1.0001, 1.5],
  51: [15, 20.55, 25, 30, 35, 41.13],
  52: [90, 150, 241, 400, 621],
  53: [3, 50, 150, 342, 600, 1049],
  54: [58, 100, 184, 250, 330],
  55: [91, 150, 200, 277, 283],
  56: [-5, -0.1, 0, 1, 2.9999, 3, 5, 8, 8.0001, 10, 12.4],
  57: [4471, 8000, 11000, 13543],
  58: [1060, 2000, 3000, 4425, 5248],
  59: [13.7, 25, 45, 67.1, 92.7],
  60: [122, 200, 228, 350, 444],
  61: [-37, 20, 60, 84, 107, 124],
  62: [26, 60, 84, 100, 125],
  63: [1.49, 2.78, 5, 8.81],
  64: [-3, -0.5, 0, 0.5, 2, 5],
  65: [-40, -10, 0, 10, 40],
  66: [-1.2, -0.5, -0.0001, 0, 0.5, 1, 2, 2.61, 2.7],
  67: [2.7e12, 4e12, 5.87e12, 7e12],
  68: [-4.9, 0, 2, 3, 4.09, 5, 6, 8, 24.77],
  69: [40, 45, 52, 52.01, 54, 56.99, 57, 62, 67, 67.01, 69, 71.99, 72, 75, 77],
};

const SWEEP_TRENDS: Trend[] = ["rising", "falling", "neutral", null];
const SWEEP_PERCENTILES: (number | null)[] = [
  null, 0, 5, 19.99, 20, 20.01, 33, 50, 66, 79.99, 80, 80.01, 90, 94.99, 95, 100,
];
/** Only definition 68 reads `points`; sweeping both states covers its null path. */
const SWEEP_POINTS: SeriesPoint[][] = [[], NINE];

describe("no two rules of one metric ever match at once", () => {
  for (const m of ECONOMIC_RULES_B) {
    it(`${m.defNumber} ${m.metricName}`, () => {
      const values = SWEEP_LATEST[m.defNumber];
      expect(values, `no sweep range for definition ${m.defNumber}`).toBeDefined();
      const overlaps: string[] = [];
      for (const latest of values) {
        for (const trend of SWEEP_TRENDS) {
          for (const percentile10y of SWEEP_PERCENTILES) {
            for (const points of SWEEP_POINTS) {
              const got = matching(m.defNumber, facts({ latest, trend, percentile10y, points }));
              if (got.length > 1) {
                overlaps.push(
                  `latest ${latest}, trend ${trend}, percentile ${percentile10y}, ${points.length} points -> ${got.join(" AND ")}`,
                );
              }
            }
          }
        }
      }
      expect(overlaps).toEqual([]);
    });
  }

  it("covers every metric in the file", () => {
    const missing = ECONOMIC_RULES_B.filter((m) => SWEEP_LATEST[m.defNumber] === undefined);
    expect(missing.map((m) => m.defNumber)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// No rule ever fires against a direction word in its own label.
//
// The word list is deliberately held here as well as in the rule file, so the
// assertion is an independent statement of the policy rather than a restatement
// of the guard it checks. Definitions 49 and 56 are exempt for the reason
// RATE_BAND_DEFINED gives: their series already IS a rate of change, so
// "Contracting (negative year over year)" is a band, not a slope.

const RISING_WORDS = [
  "rising",
  "accelerating",
  "climbing",
  "widening",
  "building",
  "spiking",
  "expanding",
  "surging",
];
const FALLING_WORDS = [
  "falling",
  "decelerating",
  "declining",
  "drawing down",
  "contracting",
  "compressing",
  "collapsing",
  "shrinking",
  "draining",
  "narrowing",
];
const STEADY_WORDS = ["stable", "flat", "steady"];

/**
 * The direction the label's HEAD claims, which is the text before the owner's
 * parenthetical. The head is where he states what the series is doing; the
 * parenthetical glosses what it means, and its words can point the other way
 * ("Falling sharply (acute risk-off, yen surging)" is a falling AUD to JPY) or
 * at something other than the series ("Low (stable global policy)" is a low
 * uncertainty index, not a flat line). A head with no direction word is a level
 * claim and nothing about the trend can contradict it. Rules may be stricter
 * than this floor, and definition 37's "Elevated (rising fear)" is.
 */
function headDirection(label: string): "up" | "down" | "steady" | null {
  const head = label.split("(")[0].toLowerCase();
  const found = [
    ...RISING_WORDS.map((w) => [head.indexOf(w), "up"] as const),
    ...FALLING_WORDS.map((w) => [head.indexOf(w), "down"] as const),
    ...STEADY_WORDS.map((w) => [head.indexOf(w), "steady"] as const),
  ].filter(([i]) => i >= 0);
  if (found.length === 0) return null;
  return found.sort((a, b) => a[0] - b[0])[0][1];
}

describe("no rule fires against the direction word in its own label", () => {
  it("reads the head of each label the way the owner wrote it", () => {
    expect(headDirection("Falling sharply (acute risk-off, yen surging)")).toBe("down");
    expect(headDirection("Rising sharply (rates spiking, affordability collapsing)")).toBe("up");
    expect(headDirection("Flat or gently rising (market tracking real money)")).toBe("steady");
    expect(headDirection("Low (stable global policy)")).toBe(null);
    expect(headDirection("Spiking (policy shock)")).toBe("up");
    expect(headDirection("Extended far above historical range (rich valuation)")).toBe(null);
  });

  for (const m of ECONOMIC_RULES_B) {
    if (m.rules.length === 0) continue;
    it(`${m.defNumber} ${m.metricName}`, () => {
      if (RATE_BAND_DEFINED.has(m.defNumber)) {
        // The band, not the slope, defines these labels. Assert only that the
        // exemption is doing work, so it cannot be left on a metric that
        // stopped needing it.
        expect(m.rules.some((r) => headDirection(r.reading) !== null)).toBe(true);
        return;
      }
      const wrong: string[] = [];
      for (const r of m.rules) {
        const claims = headDirection(r.reading);
        if (claims === null) continue;
        for (const latest of SWEEP_LATEST[m.defNumber]) {
          for (const percentile10y of SWEEP_PERCENTILES) {
            for (const points of SWEEP_POINTS) {
              const at = (trend: Trend) => r.when(facts({ latest, trend, percentile10y, points }));
              const where = `latest ${latest}, percentile ${percentile10y}`;
              if (claims === "up" && at("falling")) {
                wrong.push(`"${r.reading}" fired on a falling series, ${where}`);
              }
              if (claims === "down" && at("rising")) {
                wrong.push(`"${r.reading}" fired on a rising series, ${where}`);
              }
              if (claims === "steady" && (at("rising") || at("falling"))) {
                wrong.push(`"${r.reading}" fired on a moving series, ${where}`);
              }
            }
          }
        }
      }
      expect([...new Set(wrong)]).toEqual([]);
    });
  }

  it("the low / moderate / high / spiking ladder honours a rise word in the gloss too", () => {
    // 37's "Elevated (rising fear)" and every "Spiking" rung are stricter than
    // the head rule above, because on those series the gloss IS the series.
    expect(matching(37, dir("falling", 85))).toEqual([]);
    expect(matching(37, dir("falling", 97))).toEqual([]);
    expect(matching(37, dir("neutral", 85))).toEqual(["Elevated (rising fear)"]);
    for (const def of [52, 53, 54]) {
      expect(matching(def, dir("falling", 97)), `${def} spiking`).toEqual([]);
      // Their high rung carries no rise word, so a falling index still reads it.
      expect(matching(def, dir("falling", 85)), `${def} high`).toEqual([labelAt(def, 2)]);
    }
  });
});

// ---------------------------------------------------------------------------
// 4: the label check, against the parsed definition dataset

/** The Part 3 rows of one economic metric, the same lookup readingsFor makes. */
function part3Labels(defNumber: number): string[] {
  const entry = METRIC_SECTOR_MAP.economic[String(defNumber)];
  if (!entry || !entry.conforming) return [];
  return entry.part3.map((r) => r.readingLabel);
}

describe("readings match the owner's Part 3 labels", () => {
  it("covers every definition file from 36 to 69 that parses", () => {
    const present = ECONOMIC_RULES_B.map((m) => m.defNumber).sort((a, b) => a - b);
    const expected: number[] = [];
    for (let n = 36; n <= 69; n++) {
      if (part3Labels(n).length > 0) expected.push(n);
    }
    expect(present).toEqual(expected);
    // 50 is the one file in the range the shared parser rejects, and 70 is a
    // concept file with no Part 3 table. Neither may appear.
    expect(present).not.toContain(50);
    expect(part3Labels(50)).toEqual([]);
  });

  it("every entry is on the economic surface", () => {
    for (const m of ECONOMIC_RULES_B) expect(m.surface).toBe("economic");
  });

  for (const m of ECONOMIC_RULES_B) {
    it(`${m.defNumber}: every reading is a Part 3 label word for word`, () => {
      const labels = part3Labels(m.defNumber);
      expect(labels.length).toBeGreaterThan(0);
      for (const r of m.rules) expect(labels, `rule "${r.reading}"`).toContain(r.reading);
      for (const u of m.undetermined) {
        expect(labels, `undetermined "${u.reading}"`).toContain(u.reading);
      }
    });

    it(`${m.defNumber}: rules plus undetermined account for every Part 3 reading`, () => {
      const labels = part3Labels(m.defNumber);
      const claimed = [...m.rules.map((r) => r.reading), ...m.undetermined.map((u) => u.reading)];
      expect(new Set(claimed).size, "a reading is claimed twice").toBe(claimed.length);
      expect([...claimed].sort()).toEqual([...labels].sort());
    });
  }

  it("every rule carries a plain-words rule and an owner sentence", () => {
    for (const m of ECONOMIC_RULES_B) {
      for (const r of m.rules) {
        expect(r.rule.trim().length, `${m.defNumber} ${r.reading}`).toBeGreaterThan(0);
        expect(r.source.trim().length, `${m.defNumber} ${r.reading}`).toBeGreaterThan(0);
      }
      for (const u of m.undetermined) {
        expect(u.why.trim().length, `${m.defNumber} ${u.reading}`).toBeGreaterThan(0);
      }
    }
  });

  it("no em dash reaches the review sheet", () => {
    for (const m of ECONOMIC_RULES_B) {
      const text = [
        m.metricName,
        ...m.rules.flatMap((r) => [r.reading, r.rule, r.source, r.gapNote ?? ""]),
        ...m.undetermined.flatMap((u) => [u.reading, u.why]),
      ].join(" ");
      expect(text.includes(String.fromCharCode(0x2014)), `definition ${m.defNumber}`).toBe(false);
    }
  });
});
