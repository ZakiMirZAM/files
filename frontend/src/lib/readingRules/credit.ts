// Automatic readings for the 17 credit and banking definitions.
//
// Every threshold below is the owner's own number, taken from the Part 3
// reading label or from a sentence of its "What it means" cell, and the words
// it came from sit beside it in `source`. Nothing is invented and nothing is
// scored: a rule states the condition, and the review sheet
// (lib/readingRules.draft.md) prints the condition next to the sentence.
//
// UNITS. Every condition is written in the unit the live payload delivers,
// checked against GET /api/credit-banks:
//
//   1 to 3     spreads, percent, so 2.7 means 2.7 percentage points
//   4          the net percent of banks tightening, which can be negative
//   5 to 9     already a year-over-year percent, so the label's "year over
//              year" is the level of the series, not a change of it
//   10 to 15   percent
//   16         BILLIONS of dollars, so the owner's "3.5 trillion dollars"
//              is 3500 here. The only unit conversion in this file.
//   17         index points, zero centred, negative when conditions are calm
//
// BANDS. The owner's bands share their endpoints ("3 to 5" then "5 to 8"), so
// each band is read as lower bound inclusive, upper bound exclusive. Five
// belongs to "5 to 8". That convention is applied everywhere in this file and
// is what keeps the rules of one metric from ever matching at once.
//
// Where the owner's labels leave a level with no reading, the nearest reading
// by LEVEL is widened to cover it and `gapNote` says so. Where a reading
// carries no usable number at all, it is listed in `undetermined` with the
// reason, and the metric simply reports that no reading is determined when the
// figures fall there.
//
// DIRECTION. A rule never fires when the direction reader contradicts a
// movement the owner's own label claims. Three labels on this surface claim
// one:
//
//   "Rising or elevated (... and climbing)"   10, 11, 12, 13
//   "Slowing or flat (near zero growth)"      5, 6, 7, 8, 9
//   "Draining toward scarce (...)"            16
//
// Each of those refuses its reading against the opposite direction, and says
// in `gapNote` which combination is then left with no reading at all. A stable
// or underivable direction still satisfies them, because each sits inside a
// band the owner stated himself.
//
// The other adjectives on this surface are NOT movements and are not gated.
// "Net easing (below 0, banks loosening)", "Elevated tightening (15 to 40
// percent)" and "Contracting (negative year over year)" all describe what the
// LEVEL of the series means: a net percent below zero is banks loosening, and
// a year-over-year percent below zero is credit contracting, whichever way
// that percent is itself moving. "Normal and stable", "Broadly steady",
// "Thinning cushion" and "Compressed margin" are states the owner defined with
// his own numbers, and the number is the definition. Each of those carries a
// note saying the word was read and why it is not tested.
//
// No rule here reads a month-to-month change, so none needs smoothing: every
// condition is either a level or the direction reader's own six-month verdict,
// which already compares the move against a band of the series' own history.

import { LEVEL_BY_BAND } from "./types";
import type { MetricRules, ReadingRule, SeriesFacts } from "./types";

/** The phrase the review sheet prints for a combination with no reading. */
const UNCOVERED = "Uncovered on purpose:";

/** The phrase that marks a direction word read and deliberately not tested. */
const NOT_TESTED = "Direction word not tested:";

interface LevelBand {
  reading: string;
  /** Inclusive lower bound. Omitted for the lowest band. */
  atLeast?: number;
  /** Exclusive upper bound. Omitted for the highest band. */
  below?: number;
  /** The unit the two bounds are written in, for the review sheet. */
  unit: string;
  source: string;
  /** The direction that contradicts the owner's label, when one does. */
  notWhenTrend?: NonNullable<SeriesFacts["trend"]>;
  gapNote?: string;
}

/**
 * One band of the latest level, with its condition written out in words.
 *
 * Every rule on this surface is built here, and every one of them is a band of
 * the owner's own numbers on the latest level. That is exactly the reason a
 * level word in one of these labels ("Elevated", "Very low", "Ample reserves")
 * is not tested against where the figure sits in its trailing ten years: the
 * number IS the condition and the word is its name. The note saying so is
 * added to every rule here rather than typed out sixty-seven times, and
 * level.test.ts reads it.
 */
function level(band: LevelBand): ReadingRule {
  const { atLeast, below, unit, notWhenTrend } = band;
  const bounds =
    atLeast !== undefined && below !== undefined
      ? `the latest level is at least ${atLeast} and below ${below} ${unit}`
      : below !== undefined
        ? `the latest level is below ${below} ${unit}`
        : `the latest level is at least ${atLeast} ${unit}`;
  const words = notWhenTrend
    ? `${bounds}, and the direction reader does not call the series ${notWhenTrend}`
    : bounds;
  return {
    reading: band.reading,
    when: (facts) =>
      (atLeast === undefined || facts.latest >= atLeast) &&
      (below === undefined || facts.latest < below) &&
      (notWhenTrend === undefined || facts.trend !== notWhenTrend),
    rule: words,
    source: band.source,
    gapNote: band.gapNote ? `${band.gapNote} ${LEVEL_BY_BAND}` : LEVEL_BY_BAND,
  };
}

/** The note every band widened to cover a "near zero growth" label carries. */
function nearZeroNote(contracting: string, next: string, top: number): string {
  return (
    `The owner gives no number for "near zero growth". The band between ` +
    `"${contracting}" and "${next}" is read into this reading, so growth from ` +
    `0 up to ${top} percent is slowing or flat. "Slowing" is a movement, so ` +
    `the reading is refused when the direction reader calls the series rising; ` +
    `a stable or underivable direction satisfies the "or flat" half. ` +
    `${UNCOVERED} growth from 0 up to ${top} percent while the series is rising.`
  );
}

/** The note a band whose label adds "and climbing" carries. */
function climbingNote(label: string, from: number, to: number): string {
  return (
    `The owner's label reads "${label}", so the rule tests his band and ` +
    `refuses the reading when the direction reader calls the series falling. ` +
    `A stable or underivable direction still satisfies it, because the level ` +
    `is inside the band he wrote himself. ${UNCOVERED} a level from ${from} ` +
    `up to ${to} percent while the series is falling.`
  );
}

/** The note the one draining band carries. */
function drainingNote(): string {
  return (
    `The owner's label reads "Draining toward scarce", a movement on top of ` +
    `his own band, so the rule tests the band and refuses the reading when the ` +
    `direction reader calls reserves rising. A stable or underivable direction ` +
    `still satisfies it. ${UNCOVERED} reserves between 1.5 and 2.5 trillion ` +
    `while they are rising.`
  );
}

/** The note a state adjective carries, so no direction word goes unexplained. */
function stateNote(word: string, what: string): string {
  return `${NOT_TESTED} "${word}" ${what}`;
}

const LEVEL_MEANS_STATE =
  "describes what the level of this series means, not the way the series is " +
  "moving, so the owner's own band is the whole condition.";

const BAND_IS_THE_STATE =
  "names the state the owner's own band defines, so the band is the whole " +
  "condition and no movement is claimed.";

const PCT_POINTS = "percentage points";
const PCT = "percent";
const PCT_YOY = "percent year over year";

export const CREDIT_RULES: MetricRules[] = [
  {
    surface: "credit",
    defNumber: 1,
    metricName: "High-Yield Credit Spread (OAS)",
    rules: [
      level({
        reading: "Very tight (below 3 percentage points)",
        below: 3,
        unit: PCT_POINTS,
        source: "Very tight (below 3 percentage points)",
      }),
      level({
        reading: "Normal (3 to 5 percentage points)",
        atLeast: 3,
        below: 5,
        unit: PCT_POINTS,
        source: "Normal (3 to 5 percentage points)",
      }),
      level({
        reading: "Elevated (5 to 8 percentage points)",
        atLeast: 5,
        below: 8,
        unit: PCT_POINTS,
        source: "Elevated (5 to 8 percentage points)",
      }),
      level({
        reading: "Extreme (above 8 percentage points)",
        atLeast: 8,
        unit: PCT_POINTS,
        source: "Extreme (above 8 percentage points)",
      }),
    ],
    undetermined: [],
  },
  {
    surface: "credit",
    defNumber: 2,
    metricName: "Investment-Grade Credit Spread (OAS)",
    rules: [
      level({
        reading: "Very tight (below 1 percentage point)",
        below: 1,
        unit: PCT_POINTS,
        source: "Very tight (below 1 percentage point)",
      }),
      level({
        reading: "Normal (1 to 1.5 percentage points)",
        atLeast: 1,
        below: 1.5,
        unit: PCT_POINTS,
        source: "Normal (1 to 1.5 percentage points)",
      }),
      level({
        reading: "Elevated (1.5 to 2.5 percentage points)",
        atLeast: 1.5,
        below: 2.5,
        unit: PCT_POINTS,
        source: "Elevated (1.5 to 2.5 percentage points)",
      }),
      level({
        reading: "Extreme (above 2.5 percentage points)",
        atLeast: 2.5,
        unit: PCT_POINTS,
        source: "Extreme (above 2.5 percentage points)",
      }),
    ],
    undetermined: [],
  },
  {
    surface: "credit",
    defNumber: 3,
    metricName: "Baa Corporate Spread over 10Y",
    rules: [
      level({
        reading: "Very narrow (below 1.5 percentage points)",
        below: 1.5,
        unit: PCT_POINTS,
        source: "Very narrow (below 1.5 percentage points)",
      }),
      level({
        reading: "Normal (1.5 to 2.5 percentage points)",
        atLeast: 1.5,
        below: 2.5,
        unit: PCT_POINTS,
        source: "Normal (1.5 to 2.5 percentage points)",
      }),
      level({
        reading: "Elevated (2.5 to 3.5 percentage points)",
        atLeast: 2.5,
        below: 3.5,
        unit: PCT_POINTS,
        source: "Elevated (2.5 to 3.5 percentage points)",
      }),
      level({
        reading: "Extreme (above 3.5 percentage points)",
        atLeast: 3.5,
        unit: PCT_POINTS,
        source: "Extreme (above 3.5 percentage points)",
      }),
    ],
    undetermined: [],
  },
  {
    surface: "credit",
    defNumber: 4,
    metricName: "Net % of Banks Tightening C&I Standards",
    rules: [
      level({
        reading: "Net easing (below 0, banks loosening)",
        below: 0,
        unit: PCT,
        source: "Net easing (below 0, banks loosening)",
        gapNote: stateNote("easing", LEVEL_MEANS_STATE),
      }),
      level({
        reading: "Broadly steady (0 to 15 percent)",
        atLeast: 0,
        below: 15,
        unit: PCT,
        source: "Broadly steady (0 to 15 percent)",
        gapNote: stateNote("steady", BAND_IS_THE_STATE),
      }),
      level({
        reading: "Elevated tightening (15 to 40 percent)",
        atLeast: 15,
        below: 40,
        unit: PCT,
        source: "Elevated tightening (15 to 40 percent)",
        gapNote: stateNote("tightening", LEVEL_MEANS_STATE),
      }),
      level({
        reading: "Extreme tightening (above 40 percent, credit crunch)",
        atLeast: 40,
        unit: PCT,
        source: "Extreme tightening (above 40 percent, credit crunch)",
        gapNote: stateNote("tightening", LEVEL_MEANS_STATE),
      }),
    ],
    undetermined: [],
  },
  {
    surface: "credit",
    defNumber: 5,
    metricName: "Bank Credit (YoY %)",
    rules: [
      level({
        reading: "Contracting (negative year over year)",
        below: 0,
        unit: PCT_YOY,
        source: "Contracting (negative year over year)",
        gapNote: stateNote("Contracting", LEVEL_MEANS_STATE),
      }),
      level({
        reading: "Slowing or flat (near zero growth)",
        atLeast: 0,
        below: 3,
        unit: PCT_YOY,
        source: "Slowing or flat (near zero growth)",
        notWhenTrend: "rising",
        gapNote: nearZeroNote(
          "Contracting (negative year over year)",
          "Moderate growth (3 to 8 percent year over year)",
          3,
        ),
      }),
      level({
        reading: "Moderate growth (3 to 8 percent year over year)",
        atLeast: 3,
        below: 8,
        unit: PCT_YOY,
        source: "Moderate growth (3 to 8 percent year over year)",
      }),
      level({
        reading: "Strong growth (above 8 percent year over year)",
        atLeast: 8,
        unit: PCT_YOY,
        source: "Strong growth (above 8 percent year over year)",
      }),
    ],
    undetermined: [],
  },
  {
    surface: "credit",
    defNumber: 6,
    metricName: "C&I Loans (YoY %)",
    rules: [
      level({
        reading: "Contracting (negative year over year)",
        below: 0,
        unit: PCT_YOY,
        source: "Contracting (negative year over year)",
        gapNote: stateNote("Contracting", LEVEL_MEANS_STATE),
      }),
      level({
        reading: "Slowing or flat (near zero growth)",
        atLeast: 0,
        below: 2,
        unit: PCT_YOY,
        source: "Slowing or flat (near zero growth)",
        notWhenTrend: "rising",
        gapNote: nearZeroNote(
          "Contracting (negative year over year)",
          "Moderate growth (2 to 8 percent year over year)",
          2,
        ),
      }),
      level({
        reading: "Moderate growth (2 to 8 percent year over year)",
        atLeast: 2,
        below: 8,
        unit: PCT_YOY,
        source: "Moderate growth (2 to 8 percent year over year)",
      }),
      level({
        reading: "Strong growth (above 8 percent year over year)",
        atLeast: 8,
        unit: PCT_YOY,
        source: "Strong growth (above 8 percent year over year)",
      }),
    ],
    undetermined: [],
  },
  {
    surface: "credit",
    defNumber: 7,
    metricName: "Commercial Real Estate Loans (YoY %)",
    rules: [
      level({
        reading: "Contracting (negative year over year)",
        below: 0,
        unit: PCT_YOY,
        source: "Contracting (negative year over year)",
        gapNote: stateNote("Contracting", LEVEL_MEANS_STATE),
      }),
      level({
        reading: "Slowing toward flat (near zero growth)",
        atLeast: 0,
        below: 2,
        unit: PCT_YOY,
        source: "Slowing toward flat (near zero growth)",
        notWhenTrend: "rising",
        gapNote: nearZeroNote(
          "Contracting (negative year over year)",
          "Moderate growth (2 to 8% year over year)",
          2,
        ),
      }),
      level({
        reading: "Moderate growth (2 to 8% year over year)",
        atLeast: 2,
        below: 8,
        unit: PCT_YOY,
        source: "Moderate growth (2 to 8% year over year)",
      }),
      level({
        reading: "Rapid growth (above 8% year over year)",
        atLeast: 8,
        unit: PCT_YOY,
        source: "Rapid growth (above 8% year over year)",
      }),
    ],
    undetermined: [],
  },
  {
    surface: "credit",
    defNumber: 8,
    metricName: "Consumer Loans (YoY %)",
    rules: [
      level({
        reading: "Contracting (negative year over year)",
        below: 0,
        unit: PCT_YOY,
        source: "Contracting (negative year over year)",
        gapNote: stateNote("Contracting", LEVEL_MEANS_STATE),
      }),
      level({
        reading: "Slowing toward flat (near zero growth)",
        atLeast: 0,
        below: 2,
        unit: PCT_YOY,
        source: "Slowing toward flat (near zero growth)",
        notWhenTrend: "rising",
        gapNote: nearZeroNote(
          "Contracting (negative year over year)",
          "Moderate growth (2 to 7% year over year)",
          2,
        ),
      }),
      level({
        reading: "Moderate growth (2 to 7% year over year)",
        atLeast: 2,
        below: 7,
        unit: PCT_YOY,
        source: "Moderate growth (2 to 7% year over year)",
      }),
      level({
        reading: "Rapid growth (above 7% year over year)",
        atLeast: 7,
        unit: PCT_YOY,
        source: "Rapid growth (above 7% year over year)",
      }),
    ],
    undetermined: [],
  },
  {
    surface: "credit",
    defNumber: 9,
    metricName: "Bank Deposits (YoY %)",
    rules: [
      level({
        reading: "Contracting (negative year over year)",
        below: 0,
        unit: PCT_YOY,
        source: "Contracting (negative year over year)",
        gapNote: stateNote("Contracting", LEVEL_MEANS_STATE),
      }),
      level({
        reading: "Slowing toward flat (near zero growth)",
        atLeast: 0,
        below: 2,
        unit: PCT_YOY,
        source: "Slowing toward flat (near zero growth)",
        notWhenTrend: "rising",
        gapNote: nearZeroNote(
          "Contracting (negative year over year)",
          "Moderate growth (2 to 6% year over year)",
          2,
        ),
      }),
      level({
        reading: "Moderate growth (2 to 6% year over year)",
        atLeast: 2,
        below: 6,
        unit: PCT_YOY,
        source: "Moderate growth (2 to 6% year over year)",
      }),
      level({
        reading: "Strong growth (above 6% year over year)",
        atLeast: 6,
        unit: PCT_YOY,
        source: "Strong growth (above 6% year over year)",
      }),
    ],
    undetermined: [],
  },
  {
    surface: "credit",
    defNumber: 10,
    metricName: "Delinquency Rate, All Bank Loans",
    rules: [
      level({
        reading: "Very low (below 1.5 percent)",
        below: 1.5,
        unit: PCT,
        source: "Very low (below 1.5 percent)",
      }),
      level({
        reading: "Normal and stable (1.5 to 2.5 percent)",
        atLeast: 1.5,
        below: 2.5,
        unit: PCT,
        source: "Normal and stable (1.5 to 2.5 percent)",
        gapNote: stateNote("stable", BAND_IS_THE_STATE),
      }),
      level({
        reading: "Rising or elevated (2.5 to 4 percent and climbing)",
        atLeast: 2.5,
        below: 4,
        unit: PCT,
        source: "Rising or elevated (2.5 to 4 percent and climbing)",
        notWhenTrend: "falling",
        gapNote: climbingNote("Rising or elevated (2.5 to 4 percent and climbing)", 2.5, 4),
      }),
      level({
        reading: "Extreme (above 4 percent)",
        atLeast: 4,
        unit: PCT,
        source: "Extreme (above 4 percent)",
      }),
    ],
    undetermined: [],
  },
  {
    surface: "credit",
    defNumber: 11,
    metricName: "Net Charge-Off Rate, All Loans",
    rules: [
      level({
        reading: "Very low (below 0.5 percent)",
        below: 0.5,
        unit: PCT,
        source: "Very low (below 0.5 percent)",
      }),
      level({
        reading: "Normal (0.5 to 1 percent)",
        atLeast: 0.5,
        below: 1,
        unit: PCT,
        source: "Normal (0.5 to 1 percent)",
      }),
      level({
        reading: "Rising or elevated (1 to 2 percent and climbing)",
        atLeast: 1,
        below: 2,
        unit: PCT,
        source: "Rising or elevated (1 to 2 percent and climbing)",
        notWhenTrend: "falling",
        gapNote: climbingNote("Rising or elevated (1 to 2 percent and climbing)", 1, 2),
      }),
      level({
        reading: "Extreme (above 2 percent)",
        atLeast: 2,
        unit: PCT,
        source: "Extreme (above 2 percent)",
      }),
    ],
    undetermined: [],
  },
  {
    surface: "credit",
    defNumber: 12,
    metricName: "Delinquency Rate, C&I Loans",
    rules: [
      level({
        reading: "Very low (below 1 percent)",
        below: 1,
        unit: PCT,
        source: "Very low (below 1 percent)",
      }),
      level({
        reading: "Normal and stable (1 to 1.75 percent)",
        atLeast: 1,
        below: 1.75,
        unit: PCT,
        source: "Normal and stable (1 to 1.75 percent)",
        gapNote: stateNote("stable", BAND_IS_THE_STATE),
      }),
      level({
        reading: "Rising or elevated (1.75 to 3 percent and climbing)",
        atLeast: 1.75,
        below: 3,
        unit: PCT,
        source: "Rising or elevated (1.75 to 3 percent and climbing)",
        notWhenTrend: "falling",
        gapNote: climbingNote("Rising or elevated (1.75 to 3 percent and climbing)", 1.75, 3),
      }),
      level({
        reading: "Extreme (above 3 percent)",
        atLeast: 3,
        unit: PCT,
        source: "Extreme (above 3 percent)",
      }),
    ],
    undetermined: [],
  },
  {
    surface: "credit",
    defNumber: 13,
    metricName: "Delinquency Rate, Single-Family Mortgages",
    rules: [
      level({
        reading: "Very low (below 2 percent)",
        below: 2,
        unit: PCT,
        source: "Very low (below 2 percent)",
      }),
      level({
        reading: "Normal and stable (2 to 4 percent)",
        atLeast: 2,
        below: 4,
        unit: PCT,
        source: "Normal and stable (2 to 4 percent)",
        gapNote: stateNote("stable", BAND_IS_THE_STATE),
      }),
      level({
        reading: "Rising or elevated (4 to 7 percent and climbing)",
        atLeast: 4,
        below: 7,
        unit: PCT,
        source: "Rising or elevated (4 to 7 percent and climbing)",
        notWhenTrend: "falling",
        gapNote: climbingNote("Rising or elevated (4 to 7 percent and climbing)", 4, 7),
      }),
      level({
        reading: "Extreme (above 7 percent)",
        atLeast: 7,
        unit: PCT,
        source: "Extreme (above 7 percent)",
      }),
    ],
    undetermined: [],
  },
  {
    surface: "credit",
    defNumber: 14,
    metricName: "Bank Equity to Total Assets",
    rules: [
      level({
        reading: "Stretched cushion (below roughly 8 percent)",
        below: 8,
        unit: PCT,
        source: "Stretched cushion (below roughly 8 percent)",
      }),
      level({
        reading: "Thinning cushion (roughly 8 to 10 percent)",
        atLeast: 8,
        below: 10,
        unit: PCT,
        source: "Thinning cushion (roughly 8 to 10 percent)",
        gapNote: stateNote("Thinning", BAND_IS_THE_STATE),
      }),
      level({
        reading: "Adequate cushion (roughly 10 to 12 percent)",
        atLeast: 10,
        below: 12,
        unit: PCT,
        source: "Adequate cushion (roughly 10 to 12 percent)",
      }),
      level({
        reading: "Strong cushion (above roughly 12 percent)",
        atLeast: 12,
        unit: PCT,
        source: "Strong cushion (above roughly 12 percent)",
      }),
    ],
    undetermined: [],
  },
  {
    surface: "credit",
    defNumber: 15,
    metricName: "Net Interest Margin, US Banks",
    rules: [
      level({
        reading: "Squeezed margin (below roughly 2.5 percent)",
        below: 2.5,
        unit: PCT,
        source: "Squeezed margin (below roughly 2.5 percent)",
        gapNote: stateNote("Squeezed", BAND_IS_THE_STATE),
      }),
      level({
        reading: "Compressed margin (roughly 2.5 to 3.0 percent)",
        atLeast: 2.5,
        below: 3,
        unit: PCT,
        source: "Compressed margin (roughly 2.5 to 3.0 percent)",
        gapNote: stateNote("Compressed", BAND_IS_THE_STATE),
      }),
      level({
        reading: "Healthy margin (roughly 3.0 to 3.5 percent)",
        atLeast: 3,
        below: 3.5,
        unit: PCT,
        source: "Healthy margin (roughly 3.0 to 3.5 percent)",
      }),
      level({
        reading: "Wide margin (above roughly 3.5 percent)",
        atLeast: 3.5,
        unit: PCT,
        source: "Wide margin (above roughly 3.5 percent)",
      }),
    ],
    undetermined: [],
  },
  {
    surface: "credit",
    defNumber: 16,
    metricName: "Reserves of Depository Institutions ($B)",
    rules: [
      level({
        reading: "Scarce reserves (below roughly 1.5 trillion dollars)",
        below: 1500,
        unit: "billion dollars, the payload's unit, which is 1.5 trillion",
        source: "Scarce reserves (below roughly 1.5 trillion dollars)",
      }),
      level({
        reading: "Draining toward scarce (roughly 1.5 to 2.5 trillion dollars)",
        atLeast: 1500,
        below: 2500,
        unit: "billion dollars, the payload's unit, which is 1.5 to 2.5 trillion",
        source: "Draining toward scarce (roughly 1.5 to 2.5 trillion dollars)",
        notWhenTrend: "rising",
        gapNote: drainingNote(),
      }),
      level({
        reading: "Ample reserves (roughly 2.5 to 3.5 trillion dollars)",
        atLeast: 2500,
        below: 3500,
        unit: "billion dollars, the payload's unit, which is 2.5 to 3.5 trillion",
        source: "Ample reserves (roughly 2.5 to 3.5 trillion dollars)",
      }),
      level({
        reading: "Abundant reserves (above roughly 3.5 trillion dollars)",
        atLeast: 3500,
        unit: "billion dollars, the payload's unit, which is 3.5 trillion",
        source: "Abundant reserves (above roughly 3.5 trillion dollars)",
      }),
    ],
    undetermined: [],
  },
  {
    surface: "credit",
    defNumber: 17,
    metricName: "Financial Stress Index (St. Louis Fed)",
    rules: [
      level({
        reading: "Calm (below zero, negative readings)",
        below: 0,
        unit: "index points",
        source: "Calm (below zero, negative readings)",
      }),
      level({
        reading: "Elevated (above zero, roughly 0 to 2)",
        atLeast: 0,
        below: 2,
        unit: "index points",
        source: "Elevated (above zero, roughly 0 to 2)",
      }),
      level({
        reading: "Crisis (well above zero, roughly 2 or higher)",
        atLeast: 2,
        unit: "index points",
        source: "Crisis (well above zero, roughly 2 or higher)",
      }),
    ],
    undetermined: [
      {
        reading: "Normal (around zero)",
        why:
          'The owner gives no width for "around zero". Its neighbours already ' +
          'cover the whole line, "Calm (below zero, negative readings)" below ' +
          'zero and "Elevated (above zero, roughly 0 to 2)" above it, so any ' +
          "band for this reading would be a width invented here and would " +
          "overlap both. The owner would have to say how far from zero counts " +
          "as around zero.",
      },
    ],
  },
];
