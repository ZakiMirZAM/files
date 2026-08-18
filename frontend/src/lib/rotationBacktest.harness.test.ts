// The full historical replay. Runs ONLY when the offline fixture exists
// (scripts/rotation_backtest/data/, built by build_fixture.py); `npm test`
// skips it silently otherwise, so CI and fixture-less checkouts stay green.
//
// This is a REPORTING harness: it prints the baseline-vs-veto comparison the
// acceptance decision reads. Its assertions are sanity checks (the replay
// produced months and finite statistics), not acceptance criteria; shipping
// the veto stays a human decision.
import { describe, expect, test } from "vitest";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SectionData } from "./types";
import { DEFAULT_VETO_CONFIG, SECTORS, type Sector } from "./sectorRotation";
import {
  addMonths,
  runBacktest,
  type BacktestSummary,
  type FixtureReturns,
  type Variant,
} from "./rotationBacktest";

const FIXTURE_DIR = resolve(__dirname, "../../../scripts/rotation_backtest/data");
/** The comparison report the acceptance decision reads. Overwritten per run. */
const REPORT_PATH = resolve(FIXTURE_DIR, "report.txt");
const SERIES_PATH = resolve(FIXTURE_DIR, "fixture_series.json");
const RETURNS_PATH = resolve(FIXTURE_DIR, "fixture_returns.json");
// Opt-in: the replay takes minutes, so it needs BOTH the fixture on disk AND
// ROTATION_BACKTEST=1 in the environment; a plain `npm test` stays fast.
const hasFixture =
  process.env.ROTATION_BACKTEST === "1" &&
  existsSync(SERIES_PATH) &&
  existsSync(RETURNS_PATH);

const VARIANTS: Variant[] = [
  { kind: "baseline" },
  { kind: "veto", label: "veto arm2 cap35", config: DEFAULT_VETO_CONFIG },
  {
    kind: "veto",
    label: "veto arm2 cap25",
    config: { ...DEFAULT_VETO_CONFIG, groupCapPct: 0.25 },
  },
  {
    kind: "veto",
    label: "veto arm3 cap35",
    config: { ...DEFAULT_VETO_CONFIG, armThreshold: 3 },
  },
];

const EXCLUDE_9: Sector[] = ["Real Estate", "Communication Services"];

interface Window {
  name: string;
  startMonth: string;
  sectors: Sector[];
}

const WINDOWS: Window[] = [
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

describe.skipIf(!hasFixture)("rotation backtest harness", () => {
  // Loaded lazily so fixture-less runs never touch the filesystem beyond existsSync.
  const data = hasFixture
    ? (JSON.parse(readFileSync(SERIES_PATH, "utf8")) as SectionData)
    : (null as unknown as SectionData);
  const returns = hasFixture
    ? (JSON.parse(readFileSync(RETURNS_PATH, "utf8")) as FixtureReturns)
    : ({} as FixtureReturns);

  // Last month with a 6-month forward return available.
  const lastClose = hasFixture
    ? (returns["Technology"] ?? []).map((c) => c.period).sort().at(-1) ?? "2010-01"
    : "2010-01";

  test("replays every window and prints the baseline vs veto report", () => {
    const report: string[] = [];
    for (const w of WINDOWS) {
      for (const horizon of [1, 3, 6]) {
        const results = runBacktest(data, returns, {
          startMonth: w.startMonth,
          endMonth: addMonths(lastClose, -horizon),
          sectors: w.sectors,
          horizonMonths: horizon,
          variants: horizon === 3 ? VARIANTS : [{ kind: "baseline" }],
        });
        report.push(`── window ${w.name} · horizon ${horizon}m`);
        for (const [label, s] of Object.entries(results)) {
          report.push(`   ${line(label, s)}`);
          expect(s.months).toBeGreaterThan(12);
          if (s.meanIC != null) expect(Number.isFinite(s.meanIC)).toBe(true);
        }
      }
    }
    writeFileSync(REPORT_PATH, `${report.join("\n")}\n`, "utf8");
  }, 1_800_000);

  test("lag-1 robustness run (3-month horizon, primary window)", () => {
    const w = WINDOWS[0];
    const results = runBacktest(data, returns, {
      startMonth: w.startMonth,
      endMonth: addMonths(lastClose, -3),
      sectors: w.sectors,
      horizonMonths: 3,
      variants: VARIANTS,
      lagMonths: 1,
    });
    const report = Object.entries(results).map(([label, s]) => `   ${line(label, s)}`);
    appendFileSync(
      REPORT_PATH,
      `── lag-1 robustness · ${w.name} · 3m\n${report.join("\n")}\n`,
      "utf8",
    );
    expect(results["baseline"].months).toBeGreaterThan(12);
  }, 1_800_000);
});
