// The contract and the shared helpers behind economicA1.ts and economicA2.ts.
//
// This module holds nothing but the rule of the file and the small functions
// the two halves both call. The rules themselves are in the halves, and
// economicA.ts joins them under the one name every importer uses.
//
// Automatic readings for economic definition files 01 to 35.
//
// One MetricRules entry per definition file. Each ReadingRule is the owner's
// own threshold, taken from the Part 3 reading label or from a sentence of its
// "What it means" cell, written as a condition over SeriesFacts. Nothing is
// scored and nothing is guessed.
//
// THE LIMIT EVERY RULE OBEYS: a rule never fires when the measured facts
// contradict a word in the owner's label. Concretely:
//   - a label whose own word is rising, accelerating, climbing, widening or
//     building never fires on a falling series;
//   - a label whose own word is falling, decelerating, declining or drawing
//     down never fires on a rising series;
//   - a label whose own word is stable, flat or steady never fires on a rising
//     or a falling series, UNLESS the label's own number band is what defines
//     being stable (for example "Flat (near zero growth)" read off yoy percent,
//     where flat IS the band);
//   - a neutral direction, or one the reader could not call, satisfies a rising
//     or falling label only where the level sits inside the label's own stated
//     band, and every such allowance is written into gapNote;
//   - a level band is widened only into territory no other label names.
// Where that leaves a combination with no reading, nothing fires and the
// nearest rule's gapNote records it as "Uncovered on purpose: ...", so the
// review sheet shows the owner exactly which states have no label. An honest
// "not determined" beats a reading the chart contradicts.
//
// Where a label cannot be tested from this metric's own series at all it is
// listed under undetermined instead.
//
// Units, per the live /api/economic payload:
//   - a "%" series already carries percent (3.4 means 3.4 percent), so a
//     percent threshold reads facts.latest directly;
//   - an index or dollar LEVEL series carries a level, so a "year over year"
//     threshold reads facts.yoyChangePct;
//   - a spread series carries percentage points.
//
// The payload metric number is NOT the definition file number. Each entry's
// metricName is the exact payload series name that economicDefinitions.ts
// CHART_METRIC_NAME already attaches to that definition.
//
// WHICH FIGURE THE LINE PRINTS. A metric or a single rule may set `reads` to
// name the fact it decided on, and the line under the chart prints that fact.
// It is set wherever a LEVEL series is judged by its year-over-year change
// (definitions 5, 9, 10 and 20, plus the one rule of 33 whose band is the year
// change, and the two rungs of 25 that are separated by it), because printing
// the level of an index beside a band written in percent a year would put two
// numbers on the page that cannot both be what the rule read. Everything else
// prints the latest observation.

import { HIGH_PCT, LOW_PCT, MIDDLE_PCT, atOrAbove, atOrBelow } from "./percentiles";
import type { MetricRules, SeriesFacts } from "./types";

// The cuts and the comparisons live in ./percentiles, which is where both
// economic halves take them from. This half names them after the level rather
// than after the number, so they are re-exported under those names.
export {
  LOW_PCT as LOW_PERCENTILE,
  HIGH_PCT as HIGH_PERCENTILE,
  MIDDLE_PCT as MIDDLE_PERCENTILE,
};

/** The latest level is in the upper half of its trailing ten years. */
export const inUpperHalf = (f: SeriesFacts): boolean => atOrAbove(f.percentile10y, MIDDLE_PCT);

/** The owner's pace for a sharp dollar move: "more than 5% over six months". */
export const SHARP_DOLLAR_MOVE_PCT = 5;

/** The latest level sits in the bottom fifth of its trailing ten years. */
export const atLow = (f: SeriesFacts): boolean => atOrBelow(f.percentile10y, LOW_PCT);

/** The latest level sits in the top fifth of its trailing ten years. */
export const atHigh = (f: SeriesFacts): boolean => atOrAbove(f.percentile10y, HIGH_PCT);

/** No direction, or a direction the reader could not call. */
export const flat = (f: SeriesFacts): boolean => f.trend === "neutral" || f.trend === null;

/**
 * Percent change over the direction reader's own lookback, which is six months
 * for every series here that uses it. trendChange is the change in the series'
 * units, so the base is the level that many months ago.
 */
export function sixMonthChangePct(f: SeriesFacts): number | null {
  if (f.trendChange === null) return null;
  const base = f.latest - f.trendChange;
  if (!(base > 0)) return null;
  return (f.trendChange / base) * 100;
}

/** The dollar strengthened more than 5 percent over six months. */
export const dollarSharpRise = (f: SeriesFacts): boolean =>
  (sixMonthChangePct(f) ?? 0) > SHARP_DOLLAR_MOVE_PCT;

/** The balance sheet grew more than 10 percent over the year. */
export const rapidYearGrowth = (f: SeriesFacts): boolean =>
  f.yoyChangePct !== null && f.yoyChangePct > 10;
