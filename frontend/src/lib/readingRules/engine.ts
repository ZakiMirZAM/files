// Automatic readings: the engine.
//
// Three jobs, all pure and all free of React:
//
//   factsFromSeries              one payload series  -> the figures a rule reads
//   decideReading                one metric's rules  -> the reading that holds
//   automaticReadingsFromPayloads the two macro payloads -> reading per metric
//
// Nothing here scores, ranks or guesses. A rule is the owner's own threshold
// written as a condition; when no rule matches, or two match at once, the
// answer is that the reading is not determined and the reader still picks by
// hand.
//
// Two choices worth stating, because they decide what a rule sees.
//
//  * The direction and the ten-year percentile come from classifySeries in
//    lib/rotationAutoFill.ts, the reader that already ships on this page, so
//    the line under the chart and the Sector Rotation matrix cannot disagree
//    about which way a series is going. Its skip (an empty, too short or stale
//    series) leaves trend, trendChange and percentile10y null rather than
//    inventing a direction; the level facts are still computed, so a level
//    rule can still decide.
//  * A DAILY series is read at month ends. classifySeries downsamples a daily
//    series to the last observation of each calendar month before it measures
//    anything, so every fact here is computed on that same month-end series:
//    `previous` on a daily series is the prior MONTH's last observation, not
//    yesterday, and `points` carries the month-end series the other facts came
//    from. Every other frequency is read observation by observation.
//
// Two things the engine refuses to read.
//
//  * A point stamped for a period that has not begun is not an observation.
//    The implied equity risk premium arrives with a point dated for the coming
//    December; taken as the latest it would date the reading in the future.
//  * A series whose newest observation is older than the shipped reader's own
//    staleness limit gets no reading at all. Two credit series stop in 2020,
//    and "Reading now: Adequate cushion" would be a claim about 2020 printed
//    as a claim about today. The line says the date instead.
//
// Every date here is UTC, because the reading a reader sees must not depend on
// the time zone their machine is set to.

// The three date helpers come from the classifier rather than being written
// again here: this engine reads the same payload series against the same
// calendar, and the two must agree on what "six months earlier" means.
import {
  classifySeries,
  isFuturePeriod,
  monthsBefore,
  nearestIndex,
  parsePeriod,
  staleDaysFor,
  toMonthly,
} from "../rotationAutoFill";
import { CREDIT_DEF_BY_NAME, ECONOMIC_DEF_BY_NAME } from "../metricDefByName";
import type { Frequency, Metric, SectionData, TrendPoint } from "../types";
import { ALL_RULES, rulesFor } from "./index";
import { DEFAULT_READS, factValue } from "./types";
import type { MetricRules, ReadingDecision, ReadsFact, SeriesFacts, SeriesPoint } from "./types";

const MS_PER_DAY = 86_400_000;

/**
 * How far from exactly twelve months back an observation may sit and still
 * count as the year-ago one. A month-spaced series lands within days of the
 * target, a quarterly series within six weeks, and an annual series only ever
 * has one candidate. Anything further away is reported as no year-ago figure
 * rather than compared against the wrong period.
 */
export function yearAgoToleranceDays(frequency: Frequency): number {
  if (frequency === "annual") return 200;
  if (frequency === "quarterly") return 60;
  return 45;
}

interface DatedPoint {
  period: string;
  value: number;
  time: number;
}

/**
 * Finite values with a parseable period, oldest first, and nothing stamped for
 * a period that has not started. A point whose `period` is not a non-empty
 * string is dropped rather than parsed: `new Date(null)` is the epoch, and a
 * point silently dated 1970 dragged the ten-year window with it.
 */
function toDated(points: readonly SeriesPoint[], now: Date): DatedPoint[] {
  const out: DatedPoint[] = [];
  for (const p of points) {
    if (!Number.isFinite(p.value)) continue;
    const date = parsePeriod(p.period);
    if (!date) continue;
    if (isFuturePeriod(p.period, now)) continue;
    out.push({ period: p.period, value: p.value, time: date.getTime() });
  }
  return out.sort((a, b) => a.time - b.time);
}

/**
 * How small a year-ago base may be, as a share of the series' own typical size,
 * before a percentage change off it stops meaning anything. A base a hundredth
 * of the series' usual magnitude turns a rounding-sized move into a percent in
 * the thousands, so the year-over-year percent is reported as missing instead.
 * The absolute change is still reported: it is the figure that survives.
 */
export const YEAR_AGO_MIN_SHARE = 0.01;

/** The median of the absolute values, the series' own sense of scale. */
function typicalMagnitude(points: DatedPoint[]): number {
  const sizes = points.map((p) => Math.abs(p.value)).sort((a, b) => a - b);
  if (sizes.length === 0) return 0;
  return sizes[Math.floor(sizes.length / 2)];
}

/** How many of the newest observations in a row sit below zero. */
function consecutiveNegative(points: DatedPoint[]): number {
  let n = 0;
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].value >= 0) break;
    n++;
  }
  return n;
}

const TREND_WORD = {
  up: "rising",
  neutral: "neutral",
  down: "falling",
} as const;

/**
 * Every figure a rule may read, from one payload series. Null when the series
 * carries no usable observation at all, which is the only case with no latest
 * value to report.
 *
 * `now` is injectable so a fixture reads the same on every run; it reaches
 * classifySeries, whose staleness check is the only clock in the arithmetic.
 */
export function factsFromSeries(
  points: readonly SeriesPoint[],
  frequency: Frequency,
  now?: Date,
): SeriesFacts | null {
  const clock = now ?? new Date();
  const dated = toDated(points, clock);
  if (dated.length === 0) return null;

  const series = frequency === "daily" ? toMonthly(dated) : dated;
  const lastIndex = series.length - 1;
  const last = series[lastIndex];

  const previous = lastIndex > 0 ? series[lastIndex - 1].value : null;

  const tolMs = yearAgoToleranceDays(frequency) * MS_PER_DAY;
  const yearAgoIndex = nearestIndex(series, monthsBefore(last.time, 12), tolMs, lastIndex);
  const yearAgo = yearAgoIndex >= 0 ? series[yearAgoIndex].value : null;

  const yoyChangeAbs = yearAgo === null ? null : last.value - yearAgo;
  const floor = typicalMagnitude(series) * YEAR_AGO_MIN_SHARE;
  const yoyChangePct =
    yearAgo === null || yearAgo <= 0 || yearAgo < floor ? null : (last.value / yearAgo - 1) * 100;

  const classified = classifySeries(points as TrendPoint[], frequency, { now: clock });
  const read = "skip" in classified ? null : classified;
  let pointsCopy: SeriesPoint[] | undefined;

  const stale =
    ("skip" in classified && classified.skip === "stale-series") ||
    clock.getTime() - last.time > staleDaysFor(frequency) * MS_PER_DAY;

  return {
    latest: last.value,
    latestPeriod: last.period,
    previous,
    yearAgo,
    yoyChangeAbs,
    yoyChangePct,
    trend: read ? TREND_WORD[read.reading] : null,
    trendChange: read ? read.change : null,
    percentile10y: read && read.levelPercentile !== null ? read.levelPercentile * 100 : null,
    consecutiveNegative: consecutiveNegative(series),
    // The month-end series in the shape a rule reads. Exactly one helper in
    // all eighty five rule sets looks at it, and this copied every observation
    // of every metric on every click, so it is built on the first read and
    // never at all for the metrics that do not ask.
    get points(): readonly SeriesPoint[] {
      pointsCopy ??= series.map((p) => ({ period: p.period, value: p.value }));
      return pointsCopy;
    },
    stale,
  };
}

/**
 * The reading that holds for one metric. Exactly one matching rule decides.
 * Zero is no match and two or more is an overlap, which names the readings
 * involved rather than picking the first: an overlap is a defect in the rules,
 * and silently preferring one would hide it.
 */
export function decideReading(metric: MetricRules, facts: SeriesFacts | null): ReadingDecision {
  if (metric.rules.length === 0) {
    return {
      determined: false,
      why: "no-rules",
      detail: `No rule is written for ${metric.metricName}.`,
    };
  }
  if (!facts) {
    return {
      determined: false,
      why: "no-series",
      detail: `No usable series for ${metric.metricName}.`,
    };
  }
  // A series the feed stopped updating still has a latest figure, and a rule
  // still matches it, but the reading would describe a year that is over. The
  // reader is told the date instead.
  if (facts.stale) {
    return {
      determined: false,
      why: "stale-series",
      detail: `The latest figure for ${metric.metricName} is from ${facts.latestPeriod}.`,
      latestPeriod: facts.latestPeriod,
    };
  }
  const matched = metric.rules.filter((rule) => rule.when(facts));
  if (matched.length === 1) {
    const reads: ReadsFact = matched[0].reads ?? metric.reads ?? DEFAULT_READS;
    return {
      determined: true,
      reading: matched[0].reading,
      rule: matched[0].rule,
      facts,
      reads,
      value: factValue(facts, reads),
    };
  }
  if (matched.length === 0) {
    return {
      determined: false,
      why: "no-match",
      detail: `No rule of ${metric.metricName} covers ${facts.latest} as of ${facts.latestPeriod}.`,
      latestPeriod: facts.latestPeriod,
    };
  }
  return {
    determined: false,
    why: "overlap",
    detail: `${matched.length} readings of ${metric.metricName} match at once: ${matched
      .map((rule) => rule.reading)
      .join("; ")}.`,
    latestPeriod: facts.latestPeriod,
  };
}

/** The decision for one payload metric, or null when it carries no rules. */
export function decideForMetric(
  surface: MetricRules["surface"],
  defNumber: number,
  metric: Pick<Metric, "trend" | "frequency">,
  now?: Date,
): ReadingDecision | null {
  const rules = rulesFor(surface, defNumber);
  if (!rules) return null;
  return decideReading(rules, factsFromSeries(metric.trend, metric.frequency, now));
}

/**
 * What a rule needs of a payload series. A `Metric` satisfies it as it is; a
 * commodity tile is adapted to it.
 */
export interface PayloadSeries {
  name: string;
  unit: Metric["unit"];
  frequency: Frequency;
  trend: TrendPoint[];
}

/**
 * A commodity tile's price history needs at least two observations to be a
 * history at all. One point is a latest price, which no rule can read a
 * direction or a year-over-year change from.
 */
const MIN_COMMODITY_POINTS = 2;

/**
 * Every series the payload carries, by its own name, looked up in three
 * places. Six definitions have no row in `metrics[]`:
 *
 *   13                  the 10-year yield, in the top-level treasuryYields key
 *   58, 59, 60, 62, 63  Gold, Silver, Wheat, Brent Crude, Henry Hub NatGas,
 *                       which are commodity tiles keyed by `label`
 *
 * `metrics[]` is searched first and always wins, so nothing already resolved
 * can be displaced by a tile of the same name. A commodity tile joins only
 * when its price really is a history; the tiles deliver month-end points
 * whether the source is FRED or Yahoo, so each is read as a monthly series.
 * Its `unit` is a free string ("$ / troy oz") rather than one of the four a
 * metric uses, so the adapted series carries no unit; no rule reads one.
 */
export function payloadSeriesByName(data: SectionData | null): Map<string, PayloadSeries> {
  const out = new Map<string, PayloadSeries>();
  if (!data) return out;
  for (const metric of data.metrics ?? []) {
    if (!out.has(metric.name)) out.set(metric.name, metric);
  }
  for (const tile of data.commodities ?? []) {
    const price = tile.price ?? [];
    if (out.has(tile.label) || price.length < MIN_COMMODITY_POINTS) continue;
    out.set(tile.label, { name: tile.label, unit: "", frequency: "monthly", trend: price });
  }
  for (const metric of data.treasuryYields ?? []) {
    if (!out.has(metric.name)) out.set(metric.name, metric);
  }
  return out;
}

/**
 * The payload series one rule set reads.
 *
 * By NAME first, because a rule file states the exact payload series name and
 * the payload's own `number` field is NOT the definition file number (payload
 * metric 2 is the unemployment rate while definition 2 is total nonfarm
 * payrolls). The app's chartMetricName map is the fallback, so a rule set whose
 * metricName is stale still finds the series the sidebar chart would show.
 */
function seriesFor(
  rules: MetricRules,
  byPayloadName: Map<string, PayloadSeries>,
  defByName: Map<string, number>,
): PayloadSeries | null {
  const byName = byPayloadName.get(rules.metricName);
  if (byName) return byName;
  for (const [name, n] of defByName) {
    if (n !== rules.defNumber) continue;
    const metric = byPayloadName.get(name);
    if (metric) return metric;
  }
  return null;
}

function readingsForSurface(
  surface: MetricRules["surface"],
  data: SectionData | null,
  defByName: Map<string, number>,
  now?: Date,
): Record<number, string> {
  const byPayloadName = payloadSeriesByName(data);
  const out: Record<number, string> = {};
  for (const rules of ALL_RULES) {
    if (rules.surface !== surface) continue;
    const metric = seriesFor(rules, byPayloadName, defByName);
    if (!metric) continue;
    const decision = decideReading(rules, factsFromSeries(metric.trend, metric.frequency, now));
    if (decision.determined) out[rules.defNumber] = decision.reading;
  }
  return out;
}

/**
 * Every automatic reading the two macro payloads decide, keyed by definition
 * number, which is the shape `StageReadings` in lib/stageContext/types.ts
 * takes. A metric reaches its definition number through the app's own
 * chartMetricName lookup, the same map the sidebar chart and the cross-stage
 * block use, so a series can never be filed under the wrong definition here.
 *
 * Only determined readings appear. A metric with no rules, no series or an
 * overlap is simply absent, and the block prints no reading for it.
 */
export function automaticReadingsFromPayloads(
  economic: SectionData | null,
  credit: SectionData | null,
  now?: Date,
): { economic: Record<number, string>; credit: Record<number, string> } {
  return {
    economic: readingsForSurface("economic", economic, ECONOMIC_DEF_BY_NAME, now),
    credit: readingsForSurface("credit", credit, CREDIT_DEF_BY_NAME, now),
  };
}
