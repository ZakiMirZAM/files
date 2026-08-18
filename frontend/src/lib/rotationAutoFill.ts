// One-click reader for the Sector Rotation Matrix: derives each metric row's
// up / neutral / down reading from the already-fetched /api/economic payload,
// so the user can start from the data's current read and then edit any row.
//
// Method, per row:
//   1. Resolve the row to a payload series. SERIES_NAME_OVERRIDES picks the
//      exact series where ECON_LINK's shared definition would read the wrong
//      one (both curve rows share definition 6; m2 and import_prices link to
//      LEVEL series while the rows are YoY-semantic). Special providers cover
//      rows whose series live outside data.metrics (treasuryYields, fedModel,
//      commodities). Everything else follows ECON_LINK -> chartMetricName,
//      the same resolution the sidebar chart uses.
//   2. Classify the slope: the change over a ~6 month lookback (12 for annual
//      series) is compared against a band of 0.5 x the RMS of historical
//      same-horizon changes. Inside the band is "stable", outside is rising
//      or falling by sign. Daily series are downsampled to monthly first.
//   3. Level overlay, only for rows that carry a `neutral` vector: a stable
//      slope at an extreme level is a regime, not calm. A flat VIX at 35 must
//      not read as risk-on, so a stable reading whose level sits in the top
//      20% of its trailing 10 years escalates to "up" (the rising-impact
//      vector describes the elevated regime), and the bottom 20% escalates to
//      "down". The curve rows never escalate down: a flat or inverted stable
//      curve is exactly the late-cycle signal their neutral vector encodes.
//
//   4. Inflation gates, PPI and CPI only: a rising reading must be confirmed
//      over 12 months (durability) and echoed by a rising 5-year breakeven
//      (not already priced as transitory), or it downgrades to neutral. See
//      INFLATION_GATED.
//
// autoFillReadings() is pure (inject `now` for determinism); the caller merges
// `readings` into its state and reports `filled` / `skipped` to the user.

import type { Frequency, Metric, SectionData, TrendPoint } from "./types";
import { ECONOMIC_METRIC_DEFS } from "./economicDefinitions";
import { ECON_LINK, METRICS, hasNeutral, type Reading } from "./sectorRotation";

export type SkipReason = "no-series" | "too-few-points" | "stale-series" | "not-derivable";

export interface AutoFillEntry {
  id: string;
  reading: Reading;
  /** Payload series the reading was derived from. */
  source: string;
  latestPeriod: string;
  /** Change over the lookback, in the series' display units. */
  change: number;
  /** Neutral half-band the change was compared against. */
  band: number;
  /** Latest level's percentile in its trailing window, when computable. */
  levelPercentile?: number;
  rule: "slope" | "level-override" | "durability-gate" | "priced-in-gate";
}

export interface AutoFillSkip {
  id: string;
  reason: SkipReason;
  detail?: string;
}

export interface AutoFillResult {
  /** Only the derivable ids; the caller decides merge vs replace semantics. */
  readings: Record<string, Reading>;
  filled: AutoFillEntry[];
  skipped: AutoFillSkip[];
}

export interface AutoFillOptions {
  lookbackMonths: number;
  annualLookbackMonths: number;
  /** Neutral band = bandK x RMS of historical same-horizon changes. */
  bandK: number;
  /** Level-percentile thresholds for the neutral-vector overlay. */
  hiPct: number;
  loPct: number;
  /** Minimum historical changes needed to estimate the band. */
  minChanges: number;
  annualMinChanges: number;
  /** Skip series whose latest point is older than this. */
  staleDays: number;
  annualStaleDays: number;
  /** Injectable clock so tests are deterministic. */
  now?: Date;
}

export const DEFAULT_AUTO_FILL_OPTIONS: AutoFillOptions = {
  lookbackMonths: 6,
  annualLookbackMonths: 12,
  bandK: 0.5,
  hiPct: 0.8,
  loPct: 0.2,
  minChanges: 8,
  annualMinChanges: 5,
  staleDays: 400,
  annualStaleDays: 950,
};

/** Rows whose ECON_LINK definition charts a different series than the row
 *  means. If the named series is absent (offline mock), the row SKIPS rather
 *  than falling back to a wrong-semantics series. */
const SERIES_NAME_OVERRIDES: Record<string, string> = {
  spread_10y3m: "10Y - 3M Treasury Spread",
  spread_10y2y: "10Y - 2Y Treasury Spread",
  m2: "M2 YoY %",
  import_prices: "Import Price Index YoY %",
  m1: "M1 YoY %",
  sp500: "S&P 500 YoY %",
  sp_m2: "S&P 500 / M2 Normalised",
};

/** Realized-inflation rows whose rising reading only helps cyclical sectors
 *  when the trend is durable AND the market has not already priced it. An "up"
 *  here must survive two gates or it downgrades to neutral:
 *    1. durability: the 12-month change must clear its own band in the same
 *       direction (a 6-month spike that a year of data does not confirm is
 *       temporary, and a temporary reading is not a real sector benefit);
 *    2. priced-in: the 5-year breakeven must also read "up". Breakevens are the
 *       market's own forward inflation price, so realized inflation against flat
 *       breakevens is a spike the market already treats as transitory. */
const INFLATION_GATED = new Set(["ppi", "cpi"]);

/** Rows where a LOW stable level stays neutral instead of escalating to
 *  "down": a flat or inverted yield curve IS the late-cycle regime the
 *  neutral vector N_CURVE encodes. */
const NO_LOW_ESCALATION = new Set(["spread_10y3m", "spread_10y2y"]);

const CHART_NAME_BY_DEF: Map<number, string> = new Map(
  ECONOMIC_METRIC_DEFS.filter((d) => d.chartMetricName != null).map((d) => [
    d.number,
    d.chartMetricName as string,
  ]),
);

const MS_PER_DAY = 86_400_000;
const HISTORY_MONTHS = 180;
const PERCENTILE_MONTHS = 120;
const PERCENTILE_MIN_POINTS = 8;

/** Same reading maps, key for key: the fill button is a no-op when this holds. */
export function sameReadings(a: Record<string, Reading>, b: Record<string, Reading>): boolean {
  const ak = Object.keys(a);
  return ak.length === Object.keys(b).length && ak.every((k) => a[k] === b[k]);
}

/** Parse a trend period: "YYYY" (mock annual), "YYYY-MM", or an ISO date. */
export function parsePeriod(p: string): Date | null {
  if (/^\d{4}$/.test(p)) return new Date(Number(p), 11, 31);
  if (/^\d{4}-\d{2}$/.test(p)) return new Date(Number(p.slice(0, 4)), Number(p.slice(5, 7)), 0);
  const d = new Date(p);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The payload series name a matrix row reads, for callers and tests. Null =
 *  the row uses a special provider (yields, fed_model, wheat) or has none. */
export function seriesNameForRow(id: string): string | null {
  const override = SERIES_NAME_OVERRIDES[id];
  if (override) return override;
  const def = ECON_LINK[id];
  if (def == null) return null;
  return CHART_NAME_BY_DEF.get(def) ?? null;
}

interface Pt {
  date: Date;
  value: number;
  period: string;
}

function toPts(points: TrendPoint[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    if (!Number.isFinite(p.value)) continue;
    const date = parsePeriod(p.period);
    if (!date) continue;
    out.push({ date, value: p.value, period: p.period });
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Last point of each calendar month, mirroring economicSeries#toAnnual. */
function toMonthly(pts: Pt[]): Pt[] {
  const byMonth = new Map<string, Pt>();
  for (const p of pts) byMonth.set(`${p.date.getFullYear()}-${p.date.getMonth()}`, p);
  return [...byMonth.values()];
}

function monthsBefore(d: Date, months: number): number {
  const nd = new Date(d.getTime());
  nd.setMonth(nd.getMonth() - months);
  return nd.getTime();
}

/** Index of the point nearest `target`, or -1 when none lands within `tolMs`. */
function nearestIndex(pts: Pt[], target: number, tolMs: number): number {
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const dist = Math.abs(pts[i].date.getTime() - target);
    if (dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  }
  return bestDist <= tolMs ? best : -1;
}

export interface SeriesClassification {
  reading: Reading;
  change: number;
  band: number;
  latestPeriod: string;
  levelPercentile: number | null;
}

export type SeriesSkip = { skip: SkipReason; detail?: string };

/**
 * Classify one series into up / neutral / down. Pure: the verdict depends
 * only on the points, the frequency, and the options.
 */
export function classifySeries(
  points: TrendPoint[],
  frequency: Frequency,
  options?: Partial<AutoFillOptions>,
): SeriesClassification | SeriesSkip {
  const opts = { ...DEFAULT_AUTO_FILL_OPTIONS, ...options };
  const raw = toPts(points);
  if (raw.length === 0) return { skip: "no-series", detail: "empty series" };

  const annual = frequency === "annual";
  const pts = frequency === "daily" ? toMonthly(raw) : raw;
  const latest = pts[pts.length - 1];

  const now = opts.now ?? new Date();
  const staleDays = annual ? opts.annualStaleDays : opts.staleDays;
  if (now.getTime() - latest.date.getTime() > staleDays * MS_PER_DAY) {
    return { skip: "stale-series", detail: `latest point ${latest.period}` };
  }

  const lookback = annual ? opts.annualLookbackMonths : opts.lookbackMonths;
  const tolMs = (lookback / 2) * 30.44 * MS_PER_DAY;
  // A matched pair must span at least 3/4 of the lookback, or a short series
  // would pass off 3-month changes as 6-month ones and underestimate the band.
  const minSpanMs = 0.75 * lookback * 30.44 * MS_PER_DAY;

  const cutoff = monthsBefore(latest.date, HISTORY_MONTHS);
  const hist = pts.filter((p) => p.date.getTime() >= cutoff);

  // Historical same-horizon changes, excluding the latest point's own change
  // so the observation being classified does not feed its own neutral band.
  const changes: number[] = [];
  for (let i = 0; i < hist.length - 1; i++) {
    const j = nearestIndex(hist, monthsBefore(hist[i].date, lookback), tolMs);
    if (j >= 0 && hist[i].date.getTime() - hist[j].date.getTime() >= minSpanMs) {
      changes.push(hist[i].value - hist[j].value);
    }
  }
  const minChanges = annual ? opts.annualMinChanges : opts.minChanges;
  if (changes.length < minChanges) {
    return { skip: "too-few-points", detail: `${changes.length} comparable changes` };
  }

  const thenIdx = nearestIndex(hist, monthsBefore(latest.date, lookback), tolMs);
  if (thenIdx < 0 || latest.date.getTime() - hist[thenIdx].date.getTime() < minSpanMs) {
    return { skip: "too-few-points", detail: "no point near the lookback date" };
  }
  const change = latest.value - hist[thenIdx].value;

  // RMS about zero, not stdev about the mean: the matrix asks "rising or
  // falling", an absolute question, so a persistent drift must not widen the
  // neutral band around its own trend.
  const rms = Math.sqrt(changes.reduce((s, c) => s + c * c, 0) / changes.length);
  const band = opts.bandK * rms;
  const reading: Reading = Math.abs(change) <= band ? "neutral" : change > 0 ? "up" : "down";

  // Midrank percentile: ties count half, so a flat or coarsely quantized
  // series sits at 0.5 instead of being read as an all-time-high regime.
  const winStart = monthsBefore(latest.date, PERCENTILE_MONTHS);
  const win = pts.filter((p) => p.date.getTime() >= winStart);
  let levelPercentile: number | null = null;
  if (win.length >= PERCENTILE_MIN_POINTS) {
    let less = 0;
    let lessOrEqual = 0;
    for (const p of win) {
      if (p.value < latest.value) less++;
      if (p.value <= latest.value) lessOrEqual++;
    }
    levelPercentile = (less + lessOrEqual) / (2 * win.length);
  }

  return { reading, change, band, latestPeriod: latest.period, levelPercentile };
}

interface ResolvedSeries {
  source: string;
  points: TrendPoint[];
  frequency: Frequency;
}

/** Daily fed-model spread: earnings yield minus Treasury, joined on period. */
function fedModelSpread(a: TrendPoint[], b: TrendPoint[]): TrendPoint[] {
  const bByPeriod = new Map(b.map((p) => [p.period, p.value]));
  const out: TrendPoint[] = [];
  for (const p of a) {
    const t = bByPeriod.get(p.period);
    if (t !== undefined && Number.isFinite(p.value) && Number.isFinite(t)) {
      out.push({ period: p.period, value: p.value - t });
    }
  }
  return out;
}

function resolveSeries(
  id: string,
  data: SectionData,
  byName: Map<string, Metric>,
): ResolvedSeries | AutoFillSkip {
  if (id === "yields") {
    const m = (data.treasuryYields ?? []).find((t) => t.name === "10-Year Treasury Yield");
    if (m && m.trend.length > 0) return { source: m.name, points: m.trend, frequency: m.frequency };
    return { id, reason: "no-series", detail: "10-Year Treasury Yield not in payload" };
  }
  if (id === "fed_model") {
    const fm = data.fedModel;
    if (fm && fm.earningsYieldTrend.length > 0 && fm.treasuryYieldTrend.length > 0) {
      const spread = fedModelSpread(fm.earningsYieldTrend, fm.treasuryYieldTrend);
      if (spread.length > 0) {
        return {
          source: "Fed model spread (earnings yield minus Treasury yield)",
          points: spread,
          frequency: "daily",
        };
      }
    }
    return { id, reason: "no-series", detail: "fed model trends not in payload" };
  }
  if (id === "wheat") {
    const c = (data.commodities ?? []).find((x) => x.label === "Wheat");
    if (c && c.price.length > 0) return { source: "Wheat price", points: c.price, frequency: "monthly" };
    return { id, reason: "no-series", detail: "Wheat not in payload" };
  }

  const name = seriesNameForRow(id);
  if (name == null) {
    return { id, reason: "not-derivable", detail: "no data feed for this row" };
  }
  const m = byName.get(name);
  if (m && m.trend.length > 0) return { source: m.name, points: m.trend, frequency: m.frequency };
  return { id, reason: "no-series", detail: `${name} not in payload` };
}

/**
 * Derive a reading for every derivable matrix row from the economic payload.
 * Pure given options.now. Returns only derivable ids in `readings`; skipped
 * rows carry a reason so the UI can report honest coverage.
 */
export function autoFillReadings(
  data: SectionData | null | undefined,
  options?: Partial<AutoFillOptions>,
): AutoFillResult {
  const opts = { ...DEFAULT_AUTO_FILL_OPTIONS, ...options };
  const readings: Record<string, Reading> = {};
  const filled: AutoFillEntry[] = [];
  const skipped: AutoFillSkip[] = [];

  if (!data) {
    return {
      readings,
      filled,
      skipped: METRICS.map((m) => ({
        id: m.id,
        reason: "no-series" as SkipReason,
        detail: "no economic payload",
      })),
    };
  }

  const byName = new Map<string, Metric>((data.metrics ?? []).map((m) => [m.name, m]));

  for (const row of METRICS) {
    const resolved = resolveSeries(row.id, data, byName);
    if ("reason" in resolved) {
      skipped.push(resolved);
      continue;
    }
    const cls = classifySeries(resolved.points, resolved.frequency, opts);
    if ("skip" in cls) {
      skipped.push({ id: row.id, reason: cls.skip, detail: cls.detail });
      continue;
    }

    let reading = cls.reading;
    let rule: AutoFillEntry["rule"] = "slope";
    if (reading === "neutral" && hasNeutral(row) && cls.levelPercentile != null) {
      if (cls.levelPercentile >= opts.hiPct) {
        reading = "up";
        rule = "level-override";
      } else if (cls.levelPercentile <= opts.loPct && !NO_LOW_ESCALATION.has(row.id)) {
        reading = "down";
        rule = "level-override";
      }
    }

    readings[row.id] = reading;
    filled.push({
      id: row.id,
      reading,
      source: resolved.source,
      latestPeriod: cls.latestPeriod,
      change: cls.change,
      band: cls.band,
      levelPercentile: cls.levelPercentile ?? undefined,
      rule,
    });
  }

  // ── Inflation durability + priced-in gates (after the loop, so the breakeven
  // reading used below is its FINAL one regardless of METRICS order). A gated
  // downgrade is final: the level overlay must not re-escalate a reading the
  // gates just called temporary.
  for (const id of INFLATION_GATED) {
    if (readings[id] !== "up") continue;
    const entry = filled.find((f) => f.id === id);
    if (!entry) continue;

    let gate: AutoFillEntry["rule"] | null = null;

    // Gate 1, durability: the same series must also clear its band over 12
    // months. Re-resolve is cheap and pure.
    const resolved = resolveSeries(id, data, byName);
    if (!("reason" in resolved)) {
      const yr = classifySeries(resolved.points, resolved.frequency, {
        ...opts,
        lookbackMonths: 12,
      });
      if ("skip" in yr || yr.reading !== "up") gate = "durability-gate";
    }

    // Gate 2, priced-in: realized inflation against a breakeven that is not
    // rising is a spike the market already prices as transitory. Skipped when
    // the breakeven row itself could not be derived (nothing to test against).
    if (gate === null && "breakeven5y" in readings && readings.breakeven5y !== "up") {
      gate = "priced-in-gate";
    }

    if (gate !== null) {
      readings[id] = "neutral";
      entry.reading = "neutral";
      entry.rule = gate;
    }
  }

  return { readings, filled, skipped };
}
