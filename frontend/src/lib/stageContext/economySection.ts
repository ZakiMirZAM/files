// ECONOMY: every economic and credit series with its latest figure, the
// direction the app's own classifier reads off it, and its ten-year level
// percentile, followed by the treasury curve, the Fed model, the S&P 500
// valuation and the commodity tiles.
//
// Pure: it takes payloads and returns lines. Nothing here fetches.
//
// Units. A /api/economic or /api/credit-banks metric is printed by the same
// formatter the metric header on the page uses, so a yield that arrives as
// 4.94 prints 4.940% and is never multiplied again. The Fed model's spreads
// are percentage points; its analyst growth and every rate inside
// sp500Valuation are decimals, so they go through the fraction formatter.

import { classifySeries } from "../rotationAutoFill";
import type { Commodity, FedModel, Metric, SectionData, Sp500Valuation } from "../types";
import {
  MISSING,
  asOfTrend,
  line,
  metricValue,
  percentileOf,
  pctFrac,
  plain,
  plainNumber,
  pointsOf,
  withUnit,
} from "./units";

/** What a direction reading is called in the block. */
const DIRECTION: Record<string, string> = {
  up: "rising",
  neutral: "stable",
  down: "falling",
};

export interface SeriesLineOptions {
  /** The owner's reading for this metric, when one is recorded. */
  reading?: string;
  /** Injectable clock, so a fixture reads the same on every run. */
  now?: Date;
}

/**
 * One series line: name, latest value in its own unit, the date of the latest
 * observation, the six-month direction (twelve months for an annual series)
 * with the change in the series' own unit, the level's percentile inside its
 * trailing ten years, and the reading when one is recorded.
 */
function seriesLine(metric: Metric, opts: SeriesLineOptions = {}): string {
  const latest = metric.trend.length > 0
    ? metric.trend[metric.trend.length - 1].value
    : metric.latestValue;
  // The payload's own name travels with the figure: five dollar series are
  // DELIVERED in billions and lib/format.ts keys that scale off the name.
  const cells = [
    plain(metric.name),
    metricValue(latest, metric.unit, metric.name),
    asOfTrend(metric.trend),
  ];

  const cls = classifySeries(metric.trend, metric.frequency, opts.now ? { now: opts.now } : undefined);
  if ("skip" in cls) {
    cells.push(`direction not derivable (${cls.skip})`);
    cells.push(MISSING);
  } else {
    const word = DIRECTION[cls.reading] ?? cls.reading;
    // The change is in the series' own unit, so a dollar series states it in
    // dollars rather than as a bare eleven-digit number.
    const moved =
      metric.unit === "$"
        ? metricValue(Math.abs(cls.change), "$", metric.name)
        : plainNumber(Math.abs(cls.change), 2);
    cells.push(cls.reading === "neutral" ? `stable, moved ${moved}` : `${word} by ${moved}`);
    cells.push(cls.levelPercentile == null ? MISSING : percentileOf(cls.levelPercentile));
  }
  if (opts.reading) cells.push(`reading ${plain(opts.reading)}`);
  return line(...cells);
}

/** The Fed model snapshot, as two lines. Spreads are percentage points and the
 *  analyst growth estimate is a decimal. */
function fedModelLines(fed: FedModel | null | undefined): string[] {
  const snap = fed?.snapshot;
  if (!snap) return [];
  const out = [
    line(
      "Fed model",
      `earnings yield ${metricValue(snap.earningsYield, "%")}`,
      `${plain(fed?.treasurySeries) || "treasury"} yield ${metricValue(snap.treasuryYield, "%")}`,
      `spread ${pointsOf(snap.spread, 3)}`,
      `index PE ${plainNumber(snap.marketPe, 2)}`,
      `as of ${plain(snap.asOf) || MISSING}`,
    ),
  ];
  out.push(
    line(
      "Fed model, forward",
      `forward earnings yield ${metricValue(snap.forwardEarningsYield, "%")}`,
      `forward spread ${pointsOf(snap.forwardSpread, 3)}`,
      `trailing S&P 500 earnings ${withUnit(plainNumber(snap.sp500Eps, 2), " index points")}`,
      `forward earnings ${withUnit(plainNumber(snap.sp500ForwardEps, 2), " index points")}`,
      `price ${plainNumber(snap.sp500Price, 2)}`,
      `analyst growth ${pctFrac(snap.analystGrowth)}`,
    ),
  );
  return out;
}

/** The S&P 500 DCF block. Every rate in it is a decimal except the
 *  over/under figure, which the backend already states in percent. */
function sp500Lines(v: Sp500Valuation | null | undefined): string[] {
  if (!v) return [];
  return [
    line(
      "S&P 500 valuation",
      `price ${plainNumber(v.price, 2)}`,
      `trailing earnings ${plainNumber(v.earnings, 2)}`,
      `payout ${pctFrac(v.payout)}`,
      `growth ${pctFrac(v.growth, 2)}`,
      `risk-free ${pctFrac(v.riskFree, 2)}`,
      `terminal growth ${pctFrac(v.terminalGrowth, 2)}`,
    ),
    line(
      "S&P 500 valuation, returns",
      `implied return ${pctFrac(v.impliedReturn, 2)}`,
      `implied equity risk premium ${pctFrac(v.impliedERP, 2)}`,
      `baseline equity risk premium ${pctFrac(v.baselineERP, 2)}`,
      `baseline required return ${pctFrac(v.baselineRequiredReturn, 2)}`,
      `fair value at baseline ${plainNumber(v.fairValueAtBaseline, 2)}`,
      `over or under valuation ${metricValue(v.overUnderValuationPct, "%")}`,
    ),
  ];
}

/**
 * The five commodity tiles whose definition file the reading engine resolves
 * FROM THE TILE, taken from the engine's own list (readingRules/engine.ts,
 * payloadSeriesByName). Copper and WTI Crude are deliberately absent: their
 * definitions read the `metrics[]` series of the same name, so a reading filed
 * under them was decided on a different series and must not be printed here.
 *
 * These are definition-file numbers, never the 600+ panel numbers.
 */
const COMMODITY_DEF_BY_LABEL: Record<string, number> = {
  Gold: 58,
  Silver: 59,
  Wheat: 60,
  "Brent Crude": 62,
  "Henry Hub NatGas": 63,
};

/** One line per commodity tile: the latest price in the tile's own unit, its
 *  latest twelve-month volatility, and the reading when one is recorded. */
export function commodityLines(
  list: Commodity[] | null | undefined,
  readings?: Record<number, string>,
): string[] {
  if (!list || list.length === 0) return [];
  return list.map((c) => {
    const price = c.price.length > 0 ? c.price[c.price.length - 1].value : null;
    const vol = c.volatility12m.length > 0
      ? c.volatility12m[c.volatility12m.length - 1].value
      : null;
    const n = COMMODITY_DEF_BY_LABEL[c.label];
    const reading = n === undefined ? undefined : readings?.[n];
    const cells = [
      plain(c.label),
      `${plainNumber(price, 2)} ${plain(c.unit)}`,
      `as of ${asOfTrend(c.price)}`,
      `twelve-month volatility ${metricValue(vol, "%")}`,
    ];
    if (reading) cells.push(`reading ${plain(reading)}`);
    return line(...cells);
  });
}

export interface EconomyFiguresOptions {
  readings?: Record<number, string>;
  creditReadings?: Record<number, string>;
  /** Payload metric name to its definition number, for the reading lookup. */
  economicDefByName?: Map<string, number>;
  creditDefByName?: Map<string, number>;
  now?: Date;
}

/** One line per series, each with the reading recorded against its definition
 *  number. The three lists in the block are the same loop. */
function seriesLines(
  metrics: Metric[],
  defByName: Map<string, number> | undefined,
  readings: Record<number, string> | undefined,
  now: Date | undefined,
): string[] {
  return metrics.map((m) => {
    const n = defByName?.get(m.name);
    return seriesLine(m, { reading: n != null ? readings?.[n] : undefined, now });
  });
}

/**
 * The whole ECONOMY figure list. `economic` and `credit` are the two payloads;
 * either can be null, which prints a single "Not loaded" line for that half
 * and leaves the other intact.
 */
export function economyFigures(
  economic: SectionData | null,
  credit: SectionData | null,
  opts: EconomyFiguresOptions = {},
): string[] {
  const out: string[] = [];
  out.push(
    "Series columns: name | latest | as of | six-month direction, twelve months on an annual series, " +
      "change in the series' own unit | level percentile inside its trailing ten years | the recorded reading.",
  );

  if (!economic) {
    out.push("Not loaded: the economic series");
  } else {
    out.push(`Economic series (${economic.metrics.length})`);
    out.push(...seriesLines(economic.metrics, opts.economicDefByName, opts.readings, opts.now));
    // The 10-year yield is definition 13 and carries rules, but it lives in
    // the payload's own treasuryYields key rather than in metrics[], so its
    // reading used to be decided and then dropped on the floor here.
    const yields = economic.treasuryYields ?? [];
    if (yields.length > 0) {
      out.push(`Treasury yields (${yields.length})`);
      out.push(...seriesLines(yields, opts.economicDefByName, opts.readings, opts.now));
    }
    const fed = fedModelLines(economic.fedModel);
    const sp = sp500Lines(economic.sp500Valuation);
    if (fed.length > 0 || sp.length > 0) {
      out.push("Market valuation");
      out.push(...fed, ...sp);
    }
    const commodities = commodityLines(economic.commodities, opts.readings);
    if (commodities.length > 0) {
      out.push(`Commodities (${commodities.length})`);
      out.push(...commodities);
    }
  }

  if (!credit) {
    out.push("Not loaded: the credit and banking series");
  } else {
    out.push(`Credit and banking series (${credit.metrics.length})`);
    out.push(...seriesLines(credit.metrics, opts.creditDefByName, opts.creditReadings, opts.now));
  }
  return out;
}
