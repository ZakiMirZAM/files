// Tests for the economic reading rules, definition files 01 to 35.
//
// Five things are checked:
//   1. one sample per reading, asserting that exactly that one rule fires;
//   2. boundary samples either side of every threshold a rule names;
//   3. samples that must match nothing, including the combinations the rules
//      leave uncovered on purpose because the owner's label would contradict
//      the chart;
//   4. a shared sweep over latest x trend x one auxiliary field at a time,
//      asserting that no sample ever matches two rules, and that no rule fires
//      against its own label's direction word (a small word list applied to
//      the label text);
//   5. a shared label check against the parsed definition dataset, so every
//      `reading` string is a Part 3 label of that file word for word and the
//      rules plus the undetermined list cover every reading of the metric.
//
// Expected readings are addressed by their INDEX in the dataset's Part 3 rows
// rather than retyped, so a sample can never agree with a typo in the rule file.

import { describe, expect, it } from "vitest";
import { ECONOMIC_RULES_A } from "./economicA";
import { makeFacts } from "./testFacts";
import type { MetricRules, SeriesFacts } from "./types";
import { METRIC_SECTOR_MAP } from "../generated/metricSectorMap";

type Trend = SeriesFacts["trend"];
type FactInput = Partial<SeriesFacts> & { latest: number };

const BY_DEF = new Map(ECONOMIC_RULES_A.map((m) => [m.defNumber, m]));

/** The Part 3 rows of one economic metric, as readingTables#readingsFor looks them up. */
function readingsFor(defNumber: number): { readingLabel: string }[] {
  const entry = METRIC_SECTOR_MAP.economic[String(defNumber)];
  if (!entry || !entry.conforming) return [];
  return entry.part3;
}

function metricFor(defNumber: number): MetricRules {
  const m = BY_DEF.get(defNumber);
  if (!m) throw new Error(`no rules for definition ${defNumber}`);
  return m;
}

function labelAt(defNumber: number, index: number): string {
  const rows = readingsFor(defNumber);
  const row = rows[index];
  if (!row) throw new Error(`definition ${defNumber} has no reading at index ${index}`);
  return row.readingLabel;
}

function matching(defNumber: number, input: FactInput): string[] {
  const facts = makeFacts(input);
  return metricFor(defNumber)
    .rules.filter((r) => r.when(facts))
    .map((r) => r.reading);
}

/** One sample: the definition, the Part 3 row index it must read as, the facts. */
type Sample = [defNumber: number, readingIndex: number, facts: FactInput];

const SAMPLES: Sample[] = [
  // 01 GDP Growth. Thresholds: 3, 2, 0, two negative quarters, plus direction.
  [1, 0, { latest: 4.2, trend: "rising" }],
  [1, 0, { latest: 3.01 }],
  [1, 0, { latest: 3.5, trend: "neutral" }],
  [1, 1, { latest: 3 }],
  [1, 1, { latest: 2 }],
  [1, 1, { latest: 2.4, trend: "falling" }],
  [1, 2, { latest: 1.99 }],
  [1, 2, { latest: 1.2, trend: "falling" }],
  [1, 2, { latest: 0, trend: "neutral" }],
  [1, 3, { latest: -0.4, consecutiveNegative: 2 }],
  [1, 3, { latest: -3.1, consecutiveNegative: 4 }],

  // 03 CPI Inflation. Thresholds: 4, 1, plus the stable and falling split.
  [3, 0, { latest: 5.2, trend: "rising" }],
  [3, 0, { latest: 4.01, trend: "neutral" }],
  [3, 0, { latest: 4.01 }],
  [3, 1, { latest: 4, trend: "neutral" }],
  [3, 1, { latest: 2.5, trend: null }],
  [3, 1, { latest: 1, trend: "neutral" }],
  [3, 2, { latest: 2.5, trend: "falling" }],
  [3, 2, { latest: 1, trend: "falling" }],
  [3, 2, { latest: 4, trend: "falling" }],
  [3, 3, { latest: 0.99, trend: "falling" }],
  [3, 3, { latest: 0.99, trend: "rising" }],
  [3, 3, { latest: -0.3 }],

  // 04 PPI Inflation. Thresholds: 5, 1, three negative months, plus direction.
  [4, 0, { latest: 9.9, trend: "rising" }],
  [4, 0, { latest: 5.01 }],
  [4, 0, { latest: 5.01, trend: "neutral" }],
  [4, 1, { latest: 5 }],
  [4, 1, { latest: 5, trend: "neutral" }],
  [4, 1, { latest: 1 }],
  [4, 2, { latest: 0.99 }],
  [4, 2, { latest: 0.99, trend: "rising" }],
  [4, 2, { latest: 7, trend: "falling" }],
  [4, 2, { latest: 3, trend: "falling" }],
  [4, 2, { latest: -1.2, consecutiveNegative: 2 }],
  [4, 3, { latest: -1.2, consecutiveNegative: 3 }],

  // 05 M2 Money Supply. Year over year percent. Thresholds: 10, 4, 0.
  [5, 0, { latest: 23000, yoyChangePct: 12 }],
  [5, 0, { latest: 23000, yoyChangePct: 10.01 }],
  [5, 1, { latest: 23000, yoyChangePct: 10 }],
  [5, 1, { latest: 23000, yoyChangePct: 4 }],
  [5, 2, { latest: 23000, yoyChangePct: 3.99 }],
  [5, 2, { latest: 23000, yoyChangePct: 0 }],
  [5, 3, { latest: 23000, yoyChangePct: -0.01 }],
  [5, 3, { latest: 23000, yoyChangePct: -3 }],

  // 06 Yield Curve. Percentage points. Thresholds: 1.5, 0.25, 0.
  [6, 0, { latest: 2 }],
  [6, 0, { latest: 1.51 }],
  [6, 1, { latest: 1.5 }],
  [6, 1, { latest: 0.26 }],
  [6, 2, { latest: 0.25 }],
  [6, 2, { latest: 0.25, trend: "falling" }],
  [6, 2, { latest: 0 }],
  [6, 3, { latest: -0.01 }],
  [6, 3, { latest: -0.9 }],

  // 07 Trade Weighted Index. Sharp is more than 5 percent over six months.
  [7, 0, { latest: 105, trendChange: 5.01, trend: "rising" }],
  [7, 0, { latest: 105, trendChange: 5.01, trend: "neutral" }],
  [7, 1, { latest: 105, trendChange: 5, trend: "rising" }],
  [7, 1, { latest: 118, trendChange: 1.2, trend: "rising" }],
  [7, 2, { latest: 118, trendChange: 0.4, trend: "neutral" }],
  [7, 2, { latest: 118, trend: null }],
  [7, 3, { latest: 110, trendChange: -4, trend: "falling" }],

  // 08 Real Exports. Already year over year percent. Thresholds: 4, 1, 0.
  [8, 0, { latest: 5.3 }],
  [8, 0, { latest: 4.01 }],
  [8, 1, { latest: 4 }],
  [8, 1, { latest: 1 }],
  [8, 2, { latest: 0.99 }],
  [8, 2, { latest: 0 }],
  [8, 3, { latest: -0.01 }],
  [8, 3, { latest: -6 }],

  // 09 Import Price Index. Level series, so the tests are on the year change.
  [9, 0, { latest: 150, yoyChangePct: -2 }],
  [9, 0, { latest: 150, yoyChangePct: -0.01 }],
  [9, 1, { latest: 150, yoyChangePct: 0 }],
  [9, 1, { latest: 150, yoyChangePct: 0.99 }],
  [9, 2, { latest: 150, yoyChangePct: 1 }],
  [9, 2, { latest: 150, yoyChangePct: 4 }],
  [9, 3, { latest: 150, yoyChangePct: 4.01 }],
  [9, 3, { latest: 150, yoyChangePct: 6.95 }],

  // 10 Residential Housing Investment. Level series. Thresholds: 5, 1, 0.
  [10, 0, { latest: 1.2e12, yoyChangePct: 7 }],
  [10, 0, { latest: 1.2e12, yoyChangePct: 5.01 }],
  [10, 1, { latest: 1.2e12, yoyChangePct: 5 }],
  [10, 1, { latest: 1.2e12, yoyChangePct: 1 }],
  [10, 2, { latest: 1.2e12, yoyChangePct: 0.99 }],
  [10, 2, { latest: 1.2e12, yoyChangePct: 0 }],
  [10, 3, { latest: 1.2e12, yoyChangePct: -0.94 }],

  // 11 Wages vs CPI. Thresholds: 1.5, 0, -1.5.
  [11, 0, { latest: 2.1 }],
  [11, 0, { latest: 1.51 }],
  [11, 1, { latest: 1.5 }],
  [11, 1, { latest: 0 }],
  [11, 2, { latest: -0.01 }],
  [11, 2, { latest: -1.5 }],
  [11, 3, { latest: -1.51 }],
  [11, 3, { latest: -3.2 }],

  // 12 Consumer Sentiment. Level percentile 20 and 80 plus direction.
  [12, 0, { latest: 98, trend: "rising", percentile10y: 90 }],
  [12, 0, { latest: 98, trend: "rising", percentile10y: 80 }],
  [12, 1, { latest: 78, trend: "neutral", percentile10y: 50 }],
  [12, 1, { latest: 78, trend: null, percentile10y: null }],
  [12, 1, { latest: 90, trend: "neutral", percentile10y: 79 }],
  [12, 1, { latest: 60, trend: "neutral", percentile10y: 21 }],
  [12, 2, { latest: 70, trend: "falling", percentile10y: 40 }],
  [12, 2, { latest: 70, trend: "falling", percentile10y: 21 }],
  [12, 3, { latest: 55, trend: "falling", percentile10y: 20 }],
  [12, 3, { latest: 50, trend: "rising", percentile10y: 10 }],

  // 13 Treasury Yields. Direction of the 10-year alone.
  [13, 1, { latest: 4.2, trend: "rising" }],
  [13, 2, { latest: 3.4, trend: "falling" }],
  [13, 3, { latest: 4, trend: "neutral" }],
  [13, 3, { latest: 4, trend: null }],

  // 14 ISM Manufacturing. Thresholds: 55, 50, 45, plus direction above 55.
  [14, 0, { latest: 58, trend: "rising" }],
  [14, 0, { latest: 58 }],
  [14, 0, { latest: 55.01 }],
  [14, 1, { latest: 55 }],
  [14, 1, { latest: 50 }],
  [14, 1, { latest: 52, trend: "falling" }],
  [14, 2, { latest: 49.99 }],
  [14, 2, { latest: 45 }],
  [14, 3, { latest: 44.99 }],
  [14, 3, { latest: 38 }],

  // 15 Heavy Truck Sales. Direction plus the bottom fifth for a deep decline.
  [15, 0, { latest: 0.5, trend: "rising", percentile10y: 90 }],
  [15, 0, { latest: 0.6, trend: "rising", percentile10y: 50 }],
  [15, 1, { latest: 0.46, trend: "neutral" }],
  [15, 1, { latest: 0.46, trend: null }],
  [15, 2, { latest: 0.45, trend: "falling", percentile10y: 50 }],
  [15, 2, { latest: 0.45, trend: "falling", percentile10y: 21 }],
  [15, 2, { latest: 0.45, trend: "falling", percentile10y: null }],
  [15, 3, { latest: 0.31, trend: "falling", percentile10y: 20 }],

  // 18 US Dollar Index. Same 5 percent over six months split as definition 7.
  [18, 0, { latest: 105, trendChange: 5.01, trend: "rising" }],
  [18, 0, { latest: 105, trendChange: 5.01, trend: "neutral" }],
  [18, 1, { latest: 105, trendChange: 5, trend: "rising" }],
  [18, 2, { latest: 111, trendChange: 1.6, trend: "neutral" }],
  [18, 2, { latest: 111, trend: null }],
  [18, 3, { latest: 104, trendChange: -5, trend: "falling" }],

  // 19 Capacity Utilization. Thresholds: 80, 76, plus the rising split below 76.
  [19, 0, { latest: 82, trend: "rising" }],
  [19, 0, { latest: 82 }],
  [19, 0, { latest: 80.01 }],
  [19, 1, { latest: 80 }],
  [19, 1, { latest: 76 }],
  [19, 1, { latest: 78, trend: "falling" }],
  [19, 2, { latest: 75.99, trend: "rising" }],
  [19, 3, { latest: 75.99, trend: "falling" }],
  [19, 3, { latest: 74, trend: "neutral" }],
  [19, 3, { latest: 74, trend: null }],

  // 20 Industrial Production. Level series. Thresholds: 3, 1, 0.
  [20, 0, { latest: 103, yoyChangePct: 4 }],
  [20, 0, { latest: 103, yoyChangePct: 3.01 }],
  [20, 1, { latest: 103, yoyChangePct: 3 }],
  [20, 1, { latest: 103, yoyChangePct: 1 }],
  [20, 2, { latest: 103, yoyChangePct: 0.99 }],
  [20, 2, { latest: 103, yoyChangePct: 0 }],
  [20, 3, { latest: 103, yoyChangePct: -0.01 }],

  // 21 GDP Output Gap. Near zero is -0.5 to 0.5, plus the closing split.
  [21, 0, { latest: -3, trend: "falling" }],
  [21, 0, { latest: -0.51, trend: "neutral" }],
  [21, 0, { latest: -0.51, trend: null }],
  [21, 1, { latest: -3, trend: "rising" }],
  [21, 1, { latest: -0.51, trend: "rising" }],
  [21, 2, { latest: -0.5, trend: "rising" }],
  [21, 2, { latest: 0.5, trend: "falling" }],
  [21, 3, { latest: 0.51 }],
  [21, 3, { latest: 0.83, trend: "neutral" }],

  // 22 5-Year Breakeven. Thresholds: 2.5, 2, 1, plus direction.
  [22, 0, { latest: 2.8 }],
  [22, 0, { latest: 2.8, trend: "rising" }],
  [22, 0, { latest: 2.51 }],
  [22, 1, { latest: 2.5 }],
  [22, 1, { latest: 2 }],
  [22, 1, { latest: 2.3, trend: "neutral" }],
  [22, 2, { latest: 1.99 }],
  [22, 2, { latest: 1 }],
  [22, 2, { latest: 1.5, trend: "falling" }],
  [22, 3, { latest: 0.99 }],
  [22, 3, { latest: 0.99, trend: "rising" }],
  [22, 3, { latest: -0.2 }],

  // 24 U-6 Unemployment. Bottom fifth plus direction.
  [24, 0, { latest: 6.7, trend: "falling", percentile10y: 10 }],
  [24, 0, { latest: 6.7, trend: "neutral", percentile10y: 20 }],
  [24, 1, { latest: 7.7, trend: "falling", percentile10y: 21 }],
  [24, 1, { latest: 8.5, trend: "falling", percentile10y: 60 }],
  [24, 2, { latest: 7.7, trend: "neutral", percentile10y: 55 }],
  [24, 2, { latest: 7.7, trend: null, percentile10y: 50 }],
  [24, 3, { latest: 9, trend: "rising", percentile10y: 70 }],
  [24, 3, { latest: 6.7, trend: "rising", percentile10y: 5 }],

  // 25 Labor Force Participation. Rapid is a fall of 0.5 points on the year.
  [25, 0, { latest: 62.5, trend: "rising" }],
  [25, 1, { latest: 62.5, trend: "neutral" }],
  [25, 1, { latest: 62.5, trend: null }],
  [25, 2, { latest: 62.3, trend: "falling", yoyChangeAbs: -0.49 }],
  [25, 2, { latest: 62.3, trend: "falling", yoyChangeAbs: null }],
  [25, 3, { latest: 61.6, trend: "falling", yoyChangeAbs: -0.5 }],
  [25, 3, { latest: 61.6, trend: "falling", yoyChangeAbs: -0.7 }],

  // 26 Retail Sales. Thresholds: 5, 2, 0.
  [26, 0, { latest: 6 }],
  [26, 0, { latest: 5.01 }],
  [26, 1, { latest: 5 }],
  [26, 1, { latest: 2 }],
  [26, 2, { latest: 1.99 }],
  [26, 2, { latest: 0 }],
  [26, 3, { latest: -0.01 }],
  [26, 3, { latest: -4 }],

  // 27 Personal Savings Rate. Thresholds: 4, 8, plus the rising reading.
  [27, 0, { latest: 3, trend: "neutral" }],
  [27, 0, { latest: 3.99, trend: "falling" }],
  [27, 0, { latest: 3, trend: null }],
  [27, 1, { latest: 4, trend: "neutral" }],
  [27, 1, { latest: 8, trend: "falling" }],
  [27, 2, { latest: 3, trend: "rising" }],
  [27, 2, { latest: 8, trend: "rising" }],
  [27, 3, { latest: 8.01, trend: "rising" }],
  [27, 3, { latest: 12, trend: "neutral" }],

  // 28 Credit Spreads. Bottom and top fifth plus direction.
  [28, 0, { latest: 2.7, trend: "falling", percentile10y: 7 }],
  [28, 0, { latest: 2.7, trend: "neutral", percentile10y: 20 }],
  [28, 1, { latest: 3.4, trend: "falling", percentile10y: 21 }],
  [28, 1, { latest: 3.4, trend: null, percentile10y: null }],
  [28, 2, { latest: 4.2, trend: "rising", percentile10y: 79 }],
  [28, 2, { latest: 2.9, trend: "rising", percentile10y: 10 }],
  [28, 3, { latest: 9, trend: "rising", percentile10y: 80 }],

  // 29 C&I Loans. Thresholds: 8, 3, 0.
  [29, 0, { latest: 9.8 }],
  [29, 0, { latest: 8.01 }],
  [29, 1, { latest: 8 }],
  [29, 1, { latest: 3 }],
  [29, 2, { latest: 2.99 }],
  [29, 2, { latest: 0 }],
  [29, 3, { latest: -0.01 }],
  [29, 3, { latest: -5 }],

  // 31 Current Account. Threshold: -4 percent of GDP.
  [31, 0, { latest: -4.01 }],
  [31, 0, { latest: -5.8 }],
  [31, 1, { latest: -4 }],
  [31, 1, { latest: -2.85 }],
  [31, 1, { latest: 0.5 }],

  // 32 Total Non-Financial Debt. Threshold: 250 percent plus direction.
  [32, 0, { latest: 258.9, trend: "rising" }],
  [32, 0, { latest: 250.01, trend: "rising" }],
  [32, 1, { latest: 258.9, trend: "neutral" }],
  [32, 1, { latest: 258.9, trend: null }],
  [32, 2, { latest: 250, trend: "neutral" }],
  [32, 2, { latest: 245, trend: "rising" }],
  [32, 2, { latest: 250, trend: null }],
  [32, 3, { latest: 258.9, trend: "falling" }],
  [32, 3, { latest: 240, trend: "falling" }],

  // 33 Central Bank Balance Sheet. Rapid is more than 10 percent on the year.
  [33, 0, { latest: 8e12, yoyChangePct: 40, trend: "rising" }],
  [33, 0, { latest: 8e12, yoyChangePct: 10.01, trend: "rising" }],
  [33, 1, { latest: 6.7e12, yoyChangePct: 10, trend: "rising" }],
  [33, 1, { latest: 6.7e12, yoyChangePct: 2.1, trend: "rising" }],
  [33, 2, { latest: 6.7e12, yoyChangePct: 2.1, trend: "neutral" }],
  [33, 2, { latest: 6.7e12, trend: null }],
  [33, 3, { latest: 6e12, yoyChangePct: -8, trend: "falling" }],

  // 34 SOFR-OIS Spread. Top fifth plus direction.
  [34, 0, { latest: -0.03, trend: "falling", percentile10y: 17 }],
  [34, 0, { latest: 0.02, trend: "neutral", percentile10y: 79 }],
  [34, 0, { latest: 0.02, trend: null, percentile10y: null }],
  [34, 1, { latest: 0.3, trend: "neutral", percentile10y: 80 }],
  [34, 1, { latest: 0.3, trend: "falling", percentile10y: 95 }],
  [34, 2, { latest: 0.05, trend: "rising", percentile10y: 79 }],
  [34, 3, { latest: 1.2, trend: "rising", percentile10y: 80 }],

  // 35 Treasury General Account. Top fifth plus direction.
  [35, 0, { latest: 8e11, trend: "falling" }],
  [35, 1, { latest: 8.7e11, trend: "neutral" }],
  [35, 1, { latest: 8.7e11, trend: null }],
  [35, 2, { latest: 8.7e11, trend: "rising", percentile10y: 79 }],
  [35, 2, { latest: 8.7e11, trend: "rising", percentile10y: null }],
  [35, 3, { latest: 1.5e12, trend: "rising", percentile10y: 80 }],
];

/**
 * Facts that must match nothing: a metric with no rules, a missing input, or a
 * combination the owner's labels leave uncovered on purpose because firing
 * would put a claim on the page that the chart contradicts.
 */
const NO_MATCH: [number, FactInput][] = [
  // Missing inputs.
  [5, { latest: 23000 }],
  [9, { latest: 150 }],
  [10, { latest: 1.2e12 }],
  [20, { latest: 103 }],
  // Metrics with no rule at all.
  [2, { latest: 159075, previous: 158913 }],
  [2, { latest: 158800, previous: 159000 }],
  [2, { latest: 159500, previous: 159000, trend: "rising" }],
  [16, { latest: 13000, trend: "rising", percentile10y: 90 }],
  [17, { latest: 107, trend: "rising", percentile10y: 97 }],
  [23, { latest: 3.97, trend: "falling", percentile10y: 14 }],
  [30, { latest: -8.8e10, trend: "falling", percentile10y: 5 }],
  // Uncovered on purpose: the direction contradicts the only label at that level.
  [1, { latest: 3.5, trend: "falling" }],
  [1, { latest: 1.2, trend: "rising" }],
  [1, { latest: -0.4, consecutiveNegative: 1 }],
  [3, { latest: 3.353, trend: "rising" }],
  [3, { latest: 1.5, trend: "rising" }],
  [3, { latest: 4.5, trend: "falling" }],
  [4, { latest: 3, trend: "rising" }],
  [12, { latest: 95, trend: "rising", percentile10y: 79 }],
  [12, { latest: 98, trend: "neutral", percentile10y: 90 }],
  [14, { latest: 58, trend: "falling" }],
  [19, { latest: 82, trend: "falling" }],
  [22, { latest: 2.31, trend: "falling" }],
  [22, { latest: 2.31, trend: "rising" }],
  [22, { latest: 2.8, trend: "falling" }],
  [22, { latest: 1.5, trend: "rising" }],
  [33, { latest: 8e12, yoyChangePct: 40, trend: "neutral" }],
  // A label that claims a HIGH level must not fire from the bottom half of the
  // series own trailing ten years, and no percentile at all places nothing.
  [15, { latest: 0.35, trend: "rising", percentile10y: 10 }],
  [15, { latest: 0.5, trend: "rising", percentile10y: null }],
  [24, { latest: 7.7, trend: "neutral", percentile10y: 45 }],
  [24, { latest: 7.7, trend: null, percentile10y: null }],
];

describe("economic reading rules, one sample per reading and its boundaries", () => {
  for (const [defNumber, readingIndex, facts] of SAMPLES) {
    const expected = labelAt(defNumber, readingIndex);
    it(`definition ${defNumber} reads "${expected}" at ${JSON.stringify(facts)}`, () => {
      expect(matching(defNumber, facts)).toEqual([expected]);
    });
  }
});

describe("economic reading rules, samples that must match nothing", () => {
  for (const [defNumber, facts] of NO_MATCH) {
    it(`definition ${defNumber} matches nothing at ${JSON.stringify(facts)}`, () => {
      expect(matching(defNumber, facts)).toEqual([]);
    });
  }
});

// ── The shared sweep ───────────────────────────────────────────────────────
// A plausible range per metric, in that metric's own payload units.
const RANGE: Record<number, [number, number]> = {
  1: [-10, 8],
  2: [130000, 165000],
  3: [-2, 10],
  4: [-12, 25],
  5: [10000, 25000],
  6: [-1.5, 2],
  7: [100, 135],
  8: [-25, 22],
  9: [115, 155],
  10: [6e11, 1.3e12],
  11: [-4, 8],
  12: [40, 105],
  13: [0, 7],
  14: [30, 70],
  15: [0.25, 0.65],
  16: [4000, 14000],
  17: [-40, 130],
  18: [98, 128],
  19: [60, 85],
  20: [80, 110],
  21: [-10, 3],
  22: [0, 4],
  23: [3, 7],
  24: [6, 25],
  25: [59, 64],
  26: [-20, 55],
  27: [1, 35],
  28: [2, 12],
  29: [-20, 32],
  30: [-1.4e11, -3e10],
  31: [-7, 2],
  32: [240, 310],
  33: [3e12, 9e12],
  34: [-0.2, 3],
  35: [3e10, 2e12],
};

const SWEEP_STEPS = 21;
const TRENDS: Trend[] = ["rising", "neutral", "falling", null];

/** One auxiliary field varied at a time, so latest x trend x aux is complete. */
function auxCases(latest: number): Partial<SeriesFacts>[] {
  const cases: Partial<SeriesFacts>[] = [{}];
  for (const p of [0, 5, 19, 20, 21, 50, 79, 80, 81, 100]) cases.push({ percentile10y: p });
  for (const c of [1, 2, 3, 4]) cases.push({ consecutiveNegative: c });
  for (const y of [-10, -1, -0.01, 0, 0.5, 0.99, 1, 3, 3.99, 4, 5, 9.99, 10, 11, 15]) {
    cases.push({ yoyChangePct: y });
  }
  for (const y of [-2, -1, -0.51, -0.5, -0.49, 0, 0.5]) cases.push({ yoyChangeAbs: y });
  for (const d of [-300, -201, -200, -199, -1, 0, 1, 200]) cases.push({ previous: latest - d });
  for (const f of [-0.1, -0.05, 0, 0.02, 1 / 21, 0.05, 0.06, 0.1]) {
    cases.push({ trendChange: latest * f });
  }
  return cases;
}

/** Every combination the sweep visits for one metric. */
function sweepFacts(defNumber: number): SeriesFacts[] {
  const range = RANGE[defNumber];
  if (!range) throw new Error(`no sweep range for definition ${defNumber}`);
  const [lo, hi] = range;
  const step = (hi - lo) / (SWEEP_STEPS - 1);
  const out: SeriesFacts[] = [];
  for (let i = 0; i < SWEEP_STEPS; i++) {
    const latest = lo + step * i;
    for (const aux of auxCases(latest)) {
      for (const trend of TRENDS) out.push(makeFacts({ latest, trend, ...aux }));
    }
  }
  return out;
}

describe("economic reading rules never overlap", () => {
  for (const metric of ECONOMIC_RULES_A) {
    it(`definition ${metric.defNumber} matches at most one reading across the sweep`, () => {
      for (const facts of sweepFacts(metric.defNumber)) {
        const hits = metric.rules.filter((r) => r.when(facts)).map((r) => r.reading);
        if (hits.length > 1) {
          throw new Error(
            `definition ${metric.defNumber} matched ${hits.length} readings ` +
              `(${hits.join(" | ")}) at ${JSON.stringify({
                latest: facts.latest,
                trend: facts.trend,
                percentile10y: facts.percentile10y,
                yoyChangePct: facts.yoyChangePct,
                yoyChangeAbs: facts.yoyChangeAbs,
                previous: facts.previous,
                trendChange: facts.trendChange,
                consecutiveNegative: facts.consecutiveNegative,
              })}`,
          );
        }
      }
    });
  }
});

// ── No rule fires against its own label's direction word ───────────────────
// The owner's twelve direction words. "Closing" and "shrinking" are left out
// on purpose: on the output gap a closing gap is the series RISING toward
// zero, so a naive word list would demand the opposite sign.
const RISING_WORDS = ["rising", "accelerating", "climbing", "widening", "building"];
const FALLING_WORDS = ["falling", "decelerating", "declining", "drawing down"];
const STABLE_WORDS = ["stable", "flat", "steady"];

/**
 * Readings whose direction word is defined by the label's own band, so the
 * series' direction cannot contradict it. Keyed as `definition:Part 3 index`.
 *   - 4:2 and 22:3 are the owner's own either-or labels, whose other half is a
 *     level and carries no direction claim;
 *   - 6:2 reads "flat" as the SHAPE of the curve, which its parenthetical
 *     defines as short and long rates nearly equal;
 *   - 8, 9, 10, 20 and 26:2, 26:3 are year over year series where rising,
 *     falling and flat ARE the band, the owner's own "Flat (near zero growth)";
 *   - 11:0 and 11:1 spell their band out as "rising above 1.5%" and "flat to
 *     slightly up, 0 to 1.5%";
 *   - 29:2 is "Slowing or flat (near zero growth)", the same band shape.
 */
const BAND_DEFINED_DIRECTION = new Set([
  "4:2",
  "6:2",
  "8:0",
  "8:1",
  "8:2",
  "8:3",
  "9:0",
  "9:1",
  "9:2",
  "9:3",
  "10:0",
  "10:1",
  "10:2",
  "10:3",
  "11:0",
  "11:1",
  "20:0",
  "20:1",
  "20:2",
  "20:3",
  "22:3",
  "26:2",
  "26:3",
  "29:2",
]);

/** Whole words only: "deflation" is not the word "flat". */
function hasWord(label: string, words: string[]): boolean {
  const lower = label.toLowerCase();
  return words.some((w) => new RegExp(`\\b${w}\\b`).test(lower));
}

describe("no rule fires against its own label's direction word", () => {
  for (const metric of ECONOMIC_RULES_A) {
    if (metric.rules.length === 0) continue;
    const labels = readingsFor(metric.defNumber).map((r) => r.readingLabel);
    it(`definition ${metric.defNumber} respects every direction word it names`, () => {
      const facts = sweepFacts(metric.defNumber);
      for (const rule of metric.rules) {
        const index = labels.indexOf(rule.reading);
        if (BAND_DEFINED_DIRECTION.has(`${metric.defNumber}:${index}`)) continue;
        const forbidden: Trend[] = [];
        if (hasWord(rule.reading, RISING_WORDS)) forbidden.push("falling");
        if (hasWord(rule.reading, FALLING_WORDS)) forbidden.push("rising");
        if (hasWord(rule.reading, STABLE_WORDS)) forbidden.push("rising", "falling");
        if (forbidden.length === 0) continue;
        for (const facts_ of facts) {
          if (!forbidden.includes(facts_.trend)) continue;
          if (rule.when(facts_)) {
            throw new Error(
              `definition ${metric.defNumber} rule "${rule.reading}" fired on a ` +
                `${facts_.trend} series at latest=${facts_.latest}`,
            );
          }
        }
      }
    });
  }
});

// ── The shared label check ─────────────────────────────────────────────────
describe("economic reading rules against the parsed definition dataset", () => {
  it("covers definitions 1 to 35, once each", () => {
    expect(ECONOMIC_RULES_A.map((m) => m.defNumber)).toEqual(
      Array.from({ length: 35 }, (_, i) => i + 1),
    );
  });

  it("is all on the economic surface", () => {
    for (const metric of ECONOMIC_RULES_A) {
      expect(metric.surface).toBe("economic");
    }
  });

  it("names a payload metric for every definition", () => {
    for (const metric of ECONOMIC_RULES_A) {
      expect(metric.metricName.length, `definition ${metric.defNumber}`).toBeGreaterThan(0);
    }
  });

  it("only exempts readings that actually carry a direction word", () => {
    for (const key of BAND_DEFINED_DIRECTION) {
      const [defNumber, index] = key.split(":").map((s) => parseInt(s, 10));
      const label = labelAt(defNumber, index);
      const carries =
        hasWord(label, RISING_WORDS) ||
        hasWord(label, FALLING_WORDS) ||
        hasWord(label, STABLE_WORDS);
      expect(carries, `stale exemption for "${label}"`).toBe(true);
    }
  });

  for (const metric of ECONOMIC_RULES_A) {
    const labels = readingsFor(metric.defNumber).map((r) => r.readingLabel);

    it(`definition ${metric.defNumber} quotes its Part 3 labels word for word`, () => {
      expect(labels.length).toBeGreaterThan(0);
      for (const rule of metric.rules) {
        expect(labels, `rule reading "${rule.reading}"`).toContain(rule.reading);
      }
      for (const open of metric.undetermined) {
        expect(labels, `undetermined reading "${open.reading}"`).toContain(open.reading);
      }
    });

    it(`definition ${metric.defNumber} covers every Part 3 reading exactly once`, () => {
      const covered = [
        ...metric.rules.map((r) => r.reading),
        ...metric.undetermined.map((u) => u.reading),
      ];
      expect(new Set(covered).size, "a reading is listed twice").toBe(covered.length);
      expect([...covered].sort()).toEqual([...labels].sort());
    });

    it(`definition ${metric.defNumber} states a rule and a source for every rule`, () => {
      for (const rule of metric.rules) {
        expect(rule.rule.length, `rule text for "${rule.reading}"`).toBeGreaterThan(0);
        expect(rule.source.length, `source for "${rule.reading}"`).toBeGreaterThan(0);
      }
      for (const open of metric.undetermined) {
        expect(open.why.length, `reason for "${open.reading}"`).toBeGreaterThan(0);
      }
    });
  }

  it("has a sample for every rule of every metric", () => {
    const sampled = new Set(
      SAMPLES.map(([defNumber, index]) => `${defNumber}:${labelAt(defNumber, index)}`),
    );
    for (const metric of ECONOMIC_RULES_A) {
      for (const rule of metric.rules) {
        expect(sampled, `definition ${metric.defNumber} rule "${rule.reading}"`).toContain(
          `${metric.defNumber}:${rule.reading}`,
        );
      }
    }
  });
});
