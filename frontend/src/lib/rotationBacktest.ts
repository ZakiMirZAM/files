// Historical replay of the Sector Rotation matrix against realized SPDR sector
// ETF returns. Pure functions only: the fixture JSON (full-history /api/economic
// payload + monthly ETF closes) is built offline by
// scripts/rotation_backtest/build_fixture.py and read by the vitest harness
// (rotationBacktest.harness.test.ts), which skips silently when absent.
//
// Method per month T: truncate every series to T, run the REAL autoFillReadings
// with now=T, score with the REAL scoreMatrix (and scoreMatrixWithVeto for the
// candidate variants), and compare the ranking to forward ETF returns.
//
// Look-ahead caveats, documented so the numbers are read honestly:
//  - FRED serves latest-vintage values. Revised series (payrolls, GDP, IP,
//    retail sales) are cleaner here than a real-time investor saw them. The
//    lagMonths option (shift the data cutoff one month earlier than the return
//    window) is the robustness check; a true ALFRED vintage rebuild is out of
//    scope.
//  - Month-end observations are assumed available at month-end; real
//    publication lags run 2-6 weeks.
//  - sofr_ois has no history before 2018 and is legitimately skipped early.
//  - There is enough data to VALIDATE a hand-set veto rule, nowhere near
//    enough to fit 47 weights. Do not tune weights against this fixture.

import type { Metric, SectionData } from "./types";
import { autoFillReadings, parsePeriod } from "./rotationAutoFill";
import {
  scoreMatrix,
  scoreMatrixWithVeto,
  type Reading,
  type Sector,
  type SectorTotal,
  type VetoConfig,
} from "./sectorRotation";

export interface MonthlyClose {
  /** "YYYY-MM". */
  period: string;
  close: number;
}

export type FixtureReturns = Record<string, MonthlyClose[]>;

// ── Truncation ───────────────────────────────────────────────────────────────

function cutPoints<T extends { period: string }>(points: T[] | undefined, asOf: Date): T[] {
  if (!points) return [];
  return points.filter((p) => {
    const d = parsePeriod(p.period);
    return d != null && d.getTime() <= asOf.getTime();
  });
}

function cutMetric(m: Metric, asOf: Date): Metric {
  return { ...m, trend: cutPoints(m.trend, asOf) };
}

/** A SectionData whose every series ends at `asOf`, so autoFillReadings sees
 *  exactly what the page would have seen on that date. */
export function truncateSectionData(data: SectionData, asOf: Date): SectionData {
  return {
    ...data,
    metrics: (data.metrics ?? []).map((m) => cutMetric(m, asOf)),
    treasuryYields: data.treasuryYields?.map((m) => cutMetric(m, asOf)),
    fedModel: data.fedModel
      ? {
          ...data.fedModel,
          earningsYieldTrend: cutPoints(data.fedModel.earningsYieldTrend, asOf),
          treasuryYieldTrend: cutPoints(data.fedModel.treasuryYieldTrend, asOf),
        }
      : data.fedModel,
    commodities: data.commodities?.map((c) => ({ ...c, price: cutPoints(c.price, asOf) })),
  };
}

// ── Returns ──────────────────────────────────────────────────────────────────

/** "YYYY-MM" `months` after `period`. */
export function addMonths(period: string, months: number): string {
  const y = Number(period.slice(0, 4));
  const m = Number(period.slice(5, 7)) - 1 + months;
  const ny = y + Math.floor(m / 12);
  const nm = (m % 12 + 12) % 12;
  return `${ny}-${String(nm + 1).padStart(2, "0")}`;
}

/** Forward simple return from the close at `period` to the close `horizon`
 *  months later, or null when either month is missing. */
export function forwardReturn(
  closes: MonthlyClose[],
  period: string,
  horizonMonths: number,
): number | null {
  const byPeriod = new Map(closes.map((c) => [c.period, c.close]));
  const p0 = byPeriod.get(period);
  const p1 = byPeriod.get(addMonths(period, horizonMonths));
  if (p0 == null || p1 == null || p0 <= 0) return null;
  return p1 / p0 - 1;
}

// ── Statistics ───────────────────────────────────────────────────────────────

/** Midrank ranks (ties share the average rank), 1-based. */
function ranks(xs: number[]): number[] {
  const idx = xs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array<number>(xs.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1].v === idx[i].v) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[idx[k].i] = avg;
    i = j + 1;
  }
  return out;
}

/** Spearman rank correlation with midrank ties. NaN-safe: requires n >= 3. */
export function spearman(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length < 3) return null;
  const ra = ranks(a);
  const rb = ranks(b);
  const n = a.length;
  const meanA = ra.reduce((s, x) => s + x, 0) / n;
  const meanB = rb.reduce((s, x) => s + x, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const xa = ra[i] - meanA;
    const xb = rb[i] - meanB;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  if (da === 0 || db === 0) return null;
  return num / Math.sqrt(da * db);
}

// ── Replay ───────────────────────────────────────────────────────────────────

export type Variant =
  | { kind: "baseline" }
  | { kind: "veto"; label: string; config: VetoConfig }
  /** Experimental scorer for backtest-only candidate rules. */
  | { kind: "custom"; label: string; score: (readings: Record<string, Reading>) => SectorTotal[] };

export interface MonthRecord {
  period: string;
  /** Sector -> matrix score for this variant. */
  scores: Record<string, number>;
  /** Sector -> forward return over the run's horizon. */
  forward: Record<string, number>;
  ic: number | null;
  top3MinusBottom3: number | null;
  /** Whether the #1-ranked sector landed in the bottom half of realized returns. */
  top1BottomHalf: boolean | null;
  filledRows: number;
}

export interface BacktestSummary {
  months: number;
  icMonths: number;
  meanIC: number | null;
  /** Naive t-stat: meanIC / (sd / sqrt(n)). No autocorrelation correction. */
  tStat: number | null;
  meanTop3MinusBottom3: number | null;
  top1BottomHalfFreq: number | null;
  records: MonthRecord[];
}

export interface BacktestOptions {
  /** First and last "YYYY-MM" month whose forward return is measured. */
  startMonth: string;
  endMonth: string;
  /** Sectors included in this window (ETF inception limits). */
  sectors: Sector[];
  horizonMonths: number;
  /** All variants score the SAME monthly readings, so one replay serves all. */
  variants: Variant[];
  /** Shift the DATA cutoff this many months before the return month (the
   *  publication-lag robustness run). 0 = same month. */
  lagMonths?: number;
}

function monthEnd(period: string): Date {
  return new Date(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0);
}

function variantLabel(v: Variant): string {
  return v.kind === "baseline" ? "baseline" : v.label;
}

function summarize(records: MonthRecord[]): BacktestSummary {
  const ics = records.map((r) => r.ic).filter((x): x is number => x != null);
  const meanIC = ics.length > 0 ? ics.reduce((s, x) => s + x, 0) / ics.length : null;
  let tStat: number | null = null;
  if (meanIC != null && ics.length > 2) {
    const sd = Math.sqrt(ics.reduce((s, x) => s + (x - meanIC) ** 2, 0) / (ics.length - 1));
    tStat = sd > 0 ? meanIC / (sd / Math.sqrt(ics.length)) : null;
  }
  const spreads = records
    .map((r) => r.top3MinusBottom3)
    .filter((x): x is number => x != null);
  const flags = records
    .map((r) => r.top1BottomHalf)
    .filter((x): x is boolean => x != null);
  return {
    months: records.length,
    icMonths: ics.length,
    meanIC,
    tStat,
    meanTop3MinusBottom3:
      spreads.length > 0 ? spreads.reduce((s, x) => s + x, 0) / spreads.length : null,
    top1BottomHalfFreq:
      flags.length > 0 ? flags.filter(Boolean).length / flags.length : null,
    records,
  };
}

/** One replay over the window, every variant scored per month. */
export function runBacktest(
  data: SectionData,
  returns: FixtureReturns,
  opts: BacktestOptions,
): Record<string, BacktestSummary> {
  const perVariant = new Map<string, MonthRecord[]>(
    opts.variants.map((v) => [variantLabel(v), []]),
  );
  const lag = opts.lagMonths ?? 0;

  for (let p = opts.startMonth; p <= opts.endMonth; p = addMonths(p, 1)) {
    const asOf = monthEnd(lag > 0 ? addMonths(p, -lag) : p);
    const truncated = truncateSectionData(data, asOf);
    const fill = autoFillReadings(truncated, { now: asOf });
    if (fill.filled.length === 0) continue;

    const forward: Record<string, number> = {};
    for (const s of opts.sectors) {
      const r = forwardReturn(returns[s] ?? [], p, opts.horizonMonths);
      if (r != null) forward[s] = r;
    }
    const usable = opts.sectors.filter((s) => forward[s] != null);
    if (usable.length < Math.min(6, opts.sectors.length)) continue;

    const byReturn = [...usable].sort((a, b) => forward[b] - forward[a]);
    const half = Math.ceil(usable.length / 2);

    for (const variant of opts.variants) {
      const totals =
        variant.kind === "baseline"
          ? scoreMatrix(fill.readings)
          : variant.kind === "custom"
            ? variant.score(fill.readings)
            : scoreMatrixWithVeto(fill.readings, {}, variant.config);
      const scores: Record<string, number> = {};
      for (const t of totals) scores[t.sector] = t.total;

      const sVec = usable.map((s) => scores[s]);
      const rVec = usable.map((s) => forward[s]);
      const ic = spearman(sVec, rVec);

      const byScore = [...usable].sort((a, b) => scores[b] - scores[a]);
      const k = Math.min(3, Math.floor(usable.length / 2));
      const avg = (xs: string[]) => xs.reduce((s, x) => s + forward[x], 0) / xs.length;
      const spreadRet = k > 0 ? avg(byScore.slice(0, k)) - avg(byScore.slice(-k)) : null;
      const top1BottomHalf = byReturn.indexOf(byScore[0]) >= half;

      (perVariant.get(variantLabel(variant)) as MonthRecord[]).push({
        period: p,
        scores,
        forward,
        ic,
        top3MinusBottom3: spreadRet,
        top1BottomHalf,
        filledRows: fill.filled.length,
      });
    }
  }

  const out: Record<string, BacktestSummary> = {};
  for (const [label, records] of perVariant) out[label] = summarize(records);
  return out;
}
