// Round-2 candidate rules, motivated by the monthly favored-history diagnostics:
//  1. Duration guard: 2022's failure was Communication Services holding #1
//     through the rate shock because its vectors underweight rates. When the
//     tightening rows are adverse, scale down the positive score of the
//     long-duration sectors.
//  2. Coverage normalization: sectors appear in different numbers of rows, so
//     their attainable maximums differ (Consumer Defensive can never win a
//     calm regime). Rank by score / attainable maximum instead.
//  3. Conviction floor: is a low top score (weak regime signal) actually less
//     predictive? If yes, the UI should say "low conviction", not fake a call.
// Opt-in like the main harness: fixture on disk AND ROTATION_BACKTEST=1.
// Writes scripts/rotation_backtest/data/report_round2.txt.
import { describe, expect, test } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SectionData } from "./types";
import {
  METRICS,
  SECTORS,
  scoreMatrix,
  scoreMatrixWithVeto,
  type Reading,
  type Sector,
  type SectorTotal,
  type VetoConfig,
} from "./sectorRotation";
import {
  addMonths,
  runBacktest,
  type BacktestSummary,
  type FixtureReturns,
  type Variant,
} from "./rotationBacktest";

const FIXTURE_DIR = resolve(__dirname, "../../../scripts/rotation_backtest/data");
const SERIES_PATH = resolve(FIXTURE_DIR, "fixture_series.json");
const RETURNS_PATH = resolve(FIXTURE_DIR, "fixture_returns.json");
const REPORT_PATH = resolve(FIXTURE_DIR, "report_round2.txt");
const hasFixture =
  process.env.ROTATION_BACKTEST === "1" &&
  existsSync(SERIES_PATH) &&
  existsSync(RETURNS_PATH);

// ── Candidate 1: duration guard ──────────────────────────────────────────────
const LONG_DURATION: Sector[] = ["Technology", "Communication Services", "Real Estate"];
const TIGHTENING_CFG = (capPct: number): VetoConfig => ({
  riskRows: [
    { id: "yields", adverse: "up" },
    { id: "mortgage30", adverse: "up" },
    { id: "m2", adverse: "down" },
    { id: "fed_bs", adverse: "down" },
  ],
  armThreshold: 2,
  cappedGroups: [],
  groupCapPct: 1,
  cappedSectors: LONG_DURATION,
  sectorCapPct: capPct,
});

// ── Candidate 2: coverage normalization ──────────────────────────────────────
// Attainable maximum per sector: sum of weight over rows where the sector
// appears in the impact vector (the best case is every such row read in the
// sector's favor). Neutral-only appearances count too.
const MAX_SCORE = new Map<Sector, number>(
  SECTORS.map((s) => [
    s,
    METRICS.reduce(
      (sum, m) => sum + ((m.impact[s] ?? m.neutral?.[s]) != null ? m.weight : 0),
      0,
    ),
  ]),
);

function normalizedScore(readings: Record<string, Reading>): SectorTotal[] {
  return scoreMatrix(readings)
    .map(({ sector, total }) => ({
      sector,
      // Percent of attainable maximum, so narrow-coverage sectors compete.
      total: (MAX_SCORE.get(sector) as number) > 0
        ? Math.round((total / (MAX_SCORE.get(sector) as number)) * 1000) / 10
        : 0,
    }))
    .sort((a, b) => b.total - a.total || a.sector.localeCompare(b.sector));
}

const VARIANTS: Variant[] = [
  { kind: "baseline" },
  { kind: "veto", label: "duration cap60", config: TIGHTENING_CFG(0.6) },
  { kind: "veto", label: "duration cap40", config: TIGHTENING_CFG(0.4) },
  { kind: "custom", label: "coverage-norm", score: normalizedScore },
];

const EXCLUDE_9: Sector[] = ["Real Estate", "Communication Services"];
const WINDOWS = [
  { name: "2010-01, 9 sectors", startMonth: "2010-01", sectors: SECTORS.filter((s) => !EXCLUDE_9.includes(s)) },
  { name: "2015-10, 10 sectors", startMonth: "2015-10", sectors: SECTORS.filter((s) => s !== "Communication Services") },
  { name: "2018-07, 11 sectors", startMonth: "2018-07", sectors: [...SECTORS] },
];

function fmt(x: number | null, digits = 3): string {
  return x == null ? "n/a" : x.toFixed(digits);
}

function line(label: string, s: BacktestSummary): string {
  return (
    `${label.padEnd(18)} months=${String(s.months).padStart(3)} ` +
    `meanIC=${fmt(s.meanIC)} t=${fmt(s.tStat, 2)} ` +
    `top3-bot3=${fmt(s.meanTop3MinusBottom3 == null ? null : s.meanTop3MinusBottom3 * 100, 2)}% ` +
    `#1-in-bottom-half=${fmt(s.top1BottomHalfFreq == null ? null : s.top1BottomHalfFreq * 100, 1)}%`
  );
}

describe.skipIf(!hasFixture)("rotation backtest round 2", () => {
  const data = hasFixture
    ? (JSON.parse(readFileSync(SERIES_PATH, "utf8")) as SectionData)
    : (null as unknown as SectionData);
  const returns = hasFixture
    ? (JSON.parse(readFileSync(RETURNS_PATH, "utf8")) as FixtureReturns)
    : ({} as FixtureReturns);
  const lastClose = hasFixture
    ? (returns["Technology"] ?? []).map((c) => c.period).sort().at(-1) ?? "2010-01"
    : "2010-01";

  test("duration guard + coverage normalization vs baseline (3m horizon)", () => {
    const report: string[] = [];
    for (const w of WINDOWS) {
      const results = runBacktest(data, returns, {
        startMonth: w.startMonth,
        endMonth: addMonths(lastClose, -3),
        sectors: w.sectors,
        horizonMonths: 3,
        variants: VARIANTS,
      });
      report.push(`── window ${w.name} · horizon 3m`);
      for (const [label, s] of Object.entries(results)) {
        report.push(`   ${line(label, s)}`);
        expect(s.months).toBeGreaterThan(12);
      }
    }
    writeFileSync(REPORT_PATH, `${report.join("\n")}\n`, "utf8");
  }, 1_800_000);

  test("conviction analysis: does a weak top score predict worse?", () => {
    const w = WINDOWS[0];
    const results = runBacktest(data, returns, {
      startMonth: w.startMonth,
      endMonth: addMonths(lastClose, -3),
      sectors: w.sectors,
      horizonMonths: 3,
      variants: [{ kind: "baseline" }],
    });
    const records = results["baseline"].records;
    const buckets: Record<string, { ic: number[]; flags: boolean[]; spread: number[] }> = {
      "top score < 12": { ic: [], flags: [], spread: [] },
      "top score 12-24": { ic: [], flags: [], spread: [] },
      "top score >= 24": { ic: [], flags: [], spread: [] },
    };
    for (const r of records) {
      const top = Math.max(...Object.values(r.scores));
      const key = top < 12 ? "top score < 12" : top < 24 ? "top score 12-24" : "top score >= 24";
      if (r.ic != null) buckets[key].ic.push(r.ic);
      if (r.top1BottomHalf != null) buckets[key].flags.push(r.top1BottomHalf);
      if (r.top3MinusBottom3 != null) buckets[key].spread.push(r.top3MinusBottom3);
    }
    const mean = (xs: number[]) => (xs.length > 0 ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
    const lines = Object.entries(buckets).map(([k, b]) => {
      const freq = b.flags.length > 0 ? b.flags.filter(Boolean).length / b.flags.length : null;
      return (
        `   ${k.padEnd(18)} months=${String(b.ic.length).padStart(3)} ` +
        `meanIC=${fmt(mean(b.ic))} top3-bot3=${fmt(mean(b.spread) == null ? null : (mean(b.spread) as number) * 100, 2)}% ` +
        `#1-in-bottom-half=${fmt(freq == null ? null : freq * 100, 1)}%`
      );
    });
    writeFileSync(
      REPORT_PATH.replace("report_round2", "report_conviction"),
      `── conviction buckets · ${w.name} · 3m\n${lines.join("\n")}\n`,
      "utf8",
    );
    expect(records.length).toBeGreaterThan(50);
  }, 1_800_000);
});
