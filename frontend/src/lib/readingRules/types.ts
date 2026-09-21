// Automatic readings: the shared contract.
//
// Every economic and credit metric carries a table of named readings in the
// owner's definition file ("Above 3% and accelerating", "Inverted", ...). A
// rule decides, from the live series alone, which named reading holds now.
// Nothing here is a score: a rule is only the owner's own threshold, written
// as a condition, with the sentence it came from kept beside it for review.
//
// Rule files (credit.ts, economicA.ts, economicB.ts) depend on this file only.
// The engine (engine.ts) turns a payload series into SeriesFacts and picks the
// reading. Keep this file free of imports from either side. The one import
// below is a TYPE from the definition parser, which is erased at build time and
// pulls nothing in.

import type { DefinitionSurface } from "../definitionTables";

/** The two surfaces that carry reading tables. The same two the definition
 *  parser names, aliased here rather than written out a second time. */
export type ReadingRuleSurface = DefinitionSurface;

export interface SeriesPoint {
  period: string;
  value: number;
}

/**
 * What a rule may look at. Every figure is in the unit the payload delivers
 * (check the live payload per metric: a "%" series is already in percent, an
 * index series is a level). `null` means the series was too short to say.
 */
export interface SeriesFacts {
  /** The newest observation and its period. */
  latest: number;
  latestPeriod: string;
  /** The observation immediately before the newest one. */
  previous: number | null;
  /** The observation about twelve months before the newest one. */
  yearAgo: number | null;
  /** latest minus yearAgo, in the series' own unit. */
  yoyChangeAbs: number | null;
  /** (latest / yearAgo - 1) x 100. Null when yearAgo is missing, zero or negative. */
  yoyChangePct: number | null;
  /** The shipped direction reader (classifySeries): its verdict and the change it measured. */
  trend: "rising" | "falling" | "neutral" | null;
  trendChange: number | null;
  /** Where the latest level sits inside its trailing ten years, 0 to 100. */
  percentile10y: number | null;
  /** How many of the newest observations in a row are below zero. */
  consecutiveNegative: number;
  /** The whole series, oldest first, for the rare rule that needs more. */
  points: readonly SeriesPoint[];
  /**
   * True when the newest observation is older than the shipped reader's own
   * staleness limit for this frequency. Engine metadata, not a fact about the
   * economy: no rule reads it. The engine refuses to name a reading "now" from
   * a series that stopped years ago, so a stale metric is not determined.
   */
  stale?: boolean;
}

/**
 * Which figure a rule decides on, and therefore the figure the line prints
 * beside the reading it chose.
 *
 * The page must never print a number the rule did not read. A level series
 * judged by its year-over-year change ("Rising sharply (above 4% year over
 * year)" on the import price INDEX) has to print that change, not the index
 * level, or the printed figure contradicts the label it sits beside.
 *
 *   latest        the newest observation, in the series' own unit. The default.
 *   yoyChangePct  (latest / yearAgo - 1) x 100, printed as a percent a year.
 *   yoyChangeAbs  latest minus yearAgo, in the series' own unit, a year apart.
 */
export type ReadsFact = "latest" | "yoyChangePct" | "yoyChangeAbs";

export interface ReadingRule {
  /** The owner's reading label, word for word, exactly as the definition file's Part 3 cell has it. */
  reading: string;
  /** True when this reading holds. Rules of one metric must not overlap. */
  when: (facts: SeriesFacts) => boolean;
  /** The condition in plain words with its numbers, for the review sheet. */
  rule: string;
  /** The owner's words the threshold was taken from (label or a sentence of "What it means"), word for word. */
  source: string;
  /** Set when the owner's labels left a gap and this rule was widened to cover it; say what was assumed. */
  gapNote?: string;
  /** The fact THIS rule decides on, when it differs from the metric's own. */
  reads?: ReadsFact;
}

export interface UndeterminedReading {
  reading: string;
  /** Why no condition could be written from the owner's text alone. */
  why: string;
}

export interface MetricRules {
  surface: ReadingRuleSurface;
  /** The definition file's number (economic NN or credit NN, not the 600+/700+ panel number). */
  defNumber: number;
  /** The payload metric name this series arrives under. */
  metricName: string;
  rules: ReadingRule[];
  /** Readings of this metric that no rule covers. Empty when every reading has a rule. */
  undetermined: UndeterminedReading[];
  /** The fact this metric's rules decide on, and so the figure the line prints. Defaults to "latest". */
  reads?: ReadsFact;
}

/** The fact a decision was made on, when neither rule nor metric names one. */
export const DEFAULT_READS: ReadsFact = "latest";

/**
 * The phrase a rule's gapNote uses to say that a LEVEL word in its own label
 * was read and deliberately not tested against the series' ten-year percentile.
 * level.test.ts reads it, and the review sheet prints it, so it must stay word
 * for word.
 */
export const LEVEL_NOT_TESTED = "Level word not tested:";

/**
 * The commonest reason, and the one most of the owner's labels have: the level
 * word is the NAME of a band the owner defined with his own number, so the
 * number is the condition and where the figure sits in its ten years is beside
 * the point. A spread below three points is tight whether or not three points
 * is unusual for the last decade.
 */
export const LEVEL_BY_BAND = `${LEVEL_NOT_TESTED} the word names the owner's own number band on this series, so the band is the condition and the word is only its name.`;

/** The same marker with a reason of this rule's own. */
export function levelNote(reason: string): string {
  return `${LEVEL_NOT_TESTED} ${reason}`;
}

/** The figure a decision read, and so the figure the line prints beside it. */
export function factValue(facts: SeriesFacts, reads: ReadsFact): number | null {
  if (reads === "yoyChangePct") return facts.yoyChangePct;
  if (reads === "yoyChangeAbs") return facts.yoyChangeAbs;
  return facts.latest;
}

/** The engine's verdict for one metric. */
export type ReadingDecision =
  | {
      determined: true;
      reading: string;
      rule: string;
      facts: SeriesFacts;
      /** The fact the matching rule decided on. */
      reads: ReadsFact;
      /** That fact's figure, null when the series could not supply it. */
      value: number | null;
    }
  | {
      determined: false;
      why: "no-rules" | "no-series" | "no-match" | "overlap" | "stale-series";
      detail: string;
      /** The period of the newest usable observation, when there is one. */
      latestPeriod?: string;
    };
