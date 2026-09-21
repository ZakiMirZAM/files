// The contract and the shared helpers behind economicB1.ts and economicB2.ts.
//
// This module holds the rule of the file, the two shared ladders, and every
// sentence quoted in more than one place, so a quotation cannot drift between
// the halves. The rules themselves are in the halves, and economicB.ts joins
// them under the one name every importer uses.
//
// Automatic readings, economic definition files 36 to 69.
//
// One MetricRules entry per definition file under src/content/economic whose
// "## Part 3: What it tells you" table parses. Every `reading` is the owner's
// Part 3 label word for word; every `when` is the owner's own threshold written
// as a condition; every `source` is the owner's sentence the threshold came
// from. Nothing here scores anything, and no threshold is invented: where the
// owner left a band open, `gapNote` states exactly what was assumed, and where
// the owner's label cannot be decided from this one series at all, the reading
// is listed under `undetermined` instead of guessed.
//
// Two files in the range are left out:
//   50-Unemployment-Rate.md   its Part 3 header is missing the "Sectors Not
//                             Affected" column, so the shared parser marks the
//                             file non-conforming and returns no rows.
//   70-How-The-Economy-Works.md   a concept file with no Part 3 table.
//
// Units, checked against the live /api/economic payload per metric: a "%"
// series already arrives in percent (3.4 means 3.4 percent), an index or a
// ratio arrives as a level, and a series whose `isRateOfChange` is true already
// IS the year over year figure, so a band written in "percent a year" reads the
// series itself and not `yoyChangePct`. Those two metrics (49 and 56) read the
// newest print, which is also the figure the line beside the reading prints.

import {
  HIGH_PCT,
  LOW_PCT,
  atOrAbove,
  atOrBelow,
  inBand,
  inHalfOpen,
} from "./percentiles";
import type { MetricRules, ReadingRule, SeriesFacts, UndeterminedReading } from "./types";

// ---------------------------------------------------------------------------
// Level cuts
//
// The 20 and 80 cuts and the four comparisons live in ./percentiles, which is
// where both economic halves now take them from. SPIKE_PCT and the thirds are
// this half's own: neither has an equivalent in the app, and SPIKE_PCT is
// flagged in every gapNote that uses it.

export { HIGH_PCT, LOW_PCT, atOrAbove, atOrBelow, inBand, inHalfOpen };

export const SPIKE_PCT = 95;
/** Even thirds, for a three rung ladder read off the whole delivered record. */
export const LOWER_THIRD_PCT = 100 / 3;
export const UPPER_THIRD_PCT = 200 / 3;

// ---------------------------------------------------------------------------
// Direction words
//
// A rule must never fire when the measured series contradicts a word in the
// owner's own label. These two lists carry the words the labels in this range
// actually use, and `trendFits` is the guard. It is applied wherever a rule
// decides on the LEVEL alone while its label still names a direction, which in
// this file is the top of the low / moderate / high / spiking ladder.

/** Words with which one of the owner's labels says the series is going up. */
export const RISE_WORDS = [
  "rising",
  "accelerating",
  "climbing",
  "widening",
  "building",
  "spiking",
  "expanding",
  "surging",
];
/** Words with which one of the owner's labels says the series is going down. */
export const FALL_WORDS = [
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

export const saysRising = (label: string): boolean =>
  RISE_WORDS.some((w) => label.toLowerCase().includes(w));
export const saysFalling = (label: string): boolean =>
  FALL_WORDS.some((w) => label.toLowerCase().includes(w));

/** False when the measured trend contradicts a direction word in the label. */
export function trendFits(label: string, trend: SeriesFacts["trend"]): boolean {
  if (trend === "falling" && saysRising(label)) return false;
  if (trend === "rising" && saysFalling(label)) return false;
  return true;
}

/**
 * Definition numbers whose labels are defined by their own number band on a
 * series that ALREADY is a rate of change, so a direction word in the label
 * describes the band and not the movement of the delivered line. Bank credit
 * "Contracting (negative year over year)" is true at any second derivative, and
 * a year over year figure that is negative but rising is still a contraction.
 * The direction guard is not applied to these, in the file or in its tests.
 */
export const RATE_BAND_DEFINED = new Set([49, 56]);

/**
 * The phrase the shared direction check (direction.test.ts) reads to know a
 * movement word in a label was considered and deliberately not tested. It must
 * stay word for word, and it appears only on the RATE_BAND_DEFINED metrics.
 */
export const NOT_TESTED_NOTE = `Direction word not tested: this series already IS the rate of change, so the word names the owner's own number band and not the slope of the delivered line.`;

/**
 * The figure a rate of change band reads: the newest print itself.
 *
 * It used to be the mean of the last three months. That was written to keep one
 * noisy release from flipping a band, but the line under the chart prints
 * `facts.latest`, so on 111 of the 931 dates these two series carry in the live
 * payload the printed figure sat outside the band the line had just named it by
 * ("Slowing or flat (near zero growth), from the latest 3.005%"). Both series
 * are already smooth year-over-year percents, so the averaging bought nothing
 * the smoothing had not already bought, and it cost the reader a line that told
 * the truth.
 */
export const rate = (f: SeriesFacts): number => f.latest;

/**
 * Where the latest level sits inside the WHOLE delivered record, 0 to 100, by
 * the same midrank convention the shipped reader uses for its ten year window.
 * Used only where the owner's label says "long-run average" and the delivered
 * record is the long run available.
 */
export function recordPercentile(facts: SeriesFacts): number | null {
  const values = facts.points.map((p) => p.value).filter((v) => Number.isFinite(v));
  if (values.length < 8) return null;
  let less = 0;
  let lessOrEqual = 0;
  for (const v of values) {
    if (v < facts.latest) less++;
    if (v <= facts.latest) lessOrEqual++;
  }
  return ((less + lessOrEqual) / (2 * values.length)) * 100;
}

// ---------------------------------------------------------------------------
// Shared shapes
//
// Two ladders repeat across several metrics. They are built once so the same
// assumption is not restated in four places and cannot drift between them.

export const LADDER_GAP =
  "The owner names four ordered bands and no cut points, so the bands are read off the level's place in its trailing ten years.";
export const SPIKE_GAP = `The top band takes the ${SPIKE_PCT}th percentile and above so that it names the rarest one reading in twenty. That cut is not the owner's number and should be ruled on.`;

/** The direction clause a ladder rung carries when its label names a rise. */
export const upClause = (label: string): string =>
  saysRising(label)
    ? ` The label says the series is going up, so the rule does not fire while the direction reader calls it falling.`
    : "";

export const LADDER_UNCOVERED = `Uncovered on purpose: a series with no computable ten year percentile, and a level in a band whose label names a rise while the direction reader calls the series falling.`;

/** low / moderate / high / spiking, decided by the level, never against the label. */
export function levelLadder(labels: [string, string, string, string]): ReadingRule[] {
  return [
    {
      reading: labels[0],
      when: (f) =>
        f.percentile10y !== null && f.percentile10y < LOW_PCT && trendFits(labels[0], f.trend),
      rule: `The latest level sits below the ${LOW_PCT}th percentile of its trailing ten years.${upClause(labels[0])}`,
      source: labels[0],
      gapNote: `${LADDER_GAP} The low band takes the bottom fifth, the cut the app's own Sector Rotation reader uses for an extreme level. ${LADDER_UNCOVERED}`,
    },
    {
      reading: labels[1],
      when: (f) => inHalfOpen(f.percentile10y, LOW_PCT, HIGH_PCT) && trendFits(labels[1], f.trend),
      rule: `The latest level sits at or above the ${LOW_PCT}th percentile of its trailing ten years and below the ${HIGH_PCT}th.${upClause(labels[1])}`,
      source: labels[1],
      gapNote: `${LADDER_GAP} The middle band takes everything between the bottom and top fifths.`,
    },
    {
      reading: labels[2],
      when: (f) => inHalfOpen(f.percentile10y, HIGH_PCT, SPIKE_PCT) && trendFits(labels[2], f.trend),
      rule: `The latest level sits at or above the ${HIGH_PCT}th percentile of its trailing ten years and below the ${SPIKE_PCT}th.${upClause(labels[2])}`,
      source: labels[2],
      gapNote: `${LADDER_GAP} The high band takes the top fifth up to the ${SPIKE_PCT}th percentile.`,
    },
    {
      reading: labels[3],
      when: (f) => atOrAbove(f.percentile10y, SPIKE_PCT) && trendFits(labels[3], f.trend),
      rule: `The latest level sits at or above the ${SPIKE_PCT}th percentile of its trailing ten years.${upClause(labels[3])}`,
      source: labels[3],
      gapNote: `${LADDER_GAP} ${SPIKE_GAP} ${LADDER_UNCOVERED}`,
    },
  ];
}

export const SHARP_GAP = `The owner separates the two falling readings by the word for their force alone, with no number. The sharper one takes a falling series whose level has reached the bottom fifth of its trailing ten years, the cut the app's own Sector Rotation reader uses for an extreme level. The owner should rule on this split.`;
export const STABLE_HIGH_GAP = `The owner's only stable reading names a high level, so the rule requires the top fifth of the trailing ten years. Uncovered on purpose: a series the direction reader calls stable below that top fifth, and a series whose direction cannot be read at all. Every one of the owner's four labels names a direction, so neither combination has a reading, which is a hole in his table rather than a rule that failed.`;

/** rising / stable at a high level / falling / falling harder. */
export function directionLadder(
  labels: [string, string, string, string],
  risingGap?: string,
): ReadingRule[] {
  return [
    {
      reading: labels[0],
      when: (f) => f.trend === "rising",
      rule: "The shipped direction reader calls the series rising.",
      source: labels[0],
      ...(risingGap ? { gapNote: risingGap } : {}),
    },
    {
      reading: labels[1],
      when: (f) => f.trend === "neutral" && atOrAbove(f.percentile10y, HIGH_PCT),
      rule: `The direction reader calls the series stable and the latest level sits at or above the ${HIGH_PCT}th percentile of its trailing ten years.`,
      source: labels[1],
      gapNote: STABLE_HIGH_GAP,
    },
    {
      reading: labels[2],
      when: (f) => f.trend === "falling" && !atOrBelow(f.percentile10y, LOW_PCT),
      rule: `The direction reader calls the series falling and the latest level has not reached the bottom ${LOW_PCT} percent of its trailing ten years.`,
      source: labels[2],
      gapNote: SHARP_GAP,
    },
    {
      reading: labels[3],
      when: (f) => f.trend === "falling" && atOrBelow(f.percentile10y, LOW_PCT),
      rule: `The direction reader calls the series falling and the latest level sits at or below the ${LOW_PCT}th percentile of its trailing ten years.`,
      source: labels[3],
      gapNote: SHARP_GAP,
    },
  ];
}

/** Every reading of a metric whose labels all name a cause this series cannot see. */
export function allUndetermined(labels: string[], why: string): UndeterminedReading[] {
  return labels.map((reading) => ({ reading, why }));
}

export const CAUSE_WHY =
  "The label names the CAUSE of the move, and the cause is the only thing separating this reading from the other reading in the same direction. A single price series shows the move, never why it happened, so choosing between the two would be a guess.";

/** Sentences quoted more than once, hoisted so the quotation cannot drift. */
export const SPREAD_SIGN =
  "It is expressed in percentage points, where a positive number means optimists outnumber pessimists and a negative number means pessimists outnumber optimists.";
export const AAII_AVERAGES =
  "Across the full record the shares average roughly 62 percent stocks, 16 percent bonds and 22 percent cash, and those averages are the reference points against which any month should be read.";
export const EXTREME_CUTS = `The extreme bands take the top and bottom fifth of the trailing ten years, the cuts the app's own Sector Rotation reader uses for an extreme level.`;
export const SEASONAL_GAP = `The owner measures the extremes against seasonal norms, and the facts carry no seasonal adjustment, so the rule reads the level's place in its own trailing ten years instead.`;
export const RISING_SPLIT_GAP = `The owner separates the two rising readings by the word for their force alone, with no number. The sharper one takes a rising series whose level has reached the top fifth of its trailing ten years. The owner should rule on this split.`;
export const RATE_SPLIT_GAP = `The owner separates the intensity of each direction by the word alone, with no number, and the facts carry no rate band. The rule splits them by the level reached instead, at the top and bottom fifth of the trailing ten years. This is the weakest assumption in the file, because the level of a dollar series that trends up over decades tracks the trend itself. The owner should give a rate.`;
export const AAII_BAND_GAP = `The owner gives 72 and 52 as the outer cuts and 62 as the long-run stock average, but no width for the middle band. The near-average band is taken as 62 plus or minus 5 points, which divides the span between his own two cuts evenly into three.`;
export const AAII_CASH_GAP = `The cash half of the label is not tested: the delivered series is the STOCK share and the cash share arrives separately as altTrend, which the facts do not carry.`;

// ---------------------------------------------------------------------------
