// One-off dump: which sectors the rotation matrix favored each month since
// 2012, from the same replay the backtest harness uses. Writes favored.txt.
import { describe, expect, test } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SectionData } from "./types";
import { SECTORS } from "./sectorRotation";
import { autoFillReadings } from "./rotationAutoFill";
import { scoreMatrix } from "./sectorRotation";
import { truncateSectionData } from "./rotationBacktest";

const FIXTURE_DIR = resolve(__dirname, "../../../scripts/rotation_backtest/data");
const SERIES_PATH = resolve(FIXTURE_DIR, "fixture_series.json");
// Opt-in like the harness: needs the fixture AND ROTATION_BACKTEST=1.
const hasFixture = process.env.ROTATION_BACKTEST === "1" && existsSync(SERIES_PATH);

describe.skipIf(!hasFixture)("favored-sector history dump", () => {
  test("dump monthly top/bottom and yearly favor table since 2012", () => {
    const data = JSON.parse(readFileSync(SERIES_PATH, "utf8")) as SectionData;
    const lines: string[] = [];
    // sector -> year -> months-in-top3 count; and #1 counts.
    const top3ByYear = new Map<string, Map<number, number>>();
    const top1ByYear = new Map<string, Map<number, number>>();
    const bot3ByYear = new Map<string, Map<number, number>>();
    const monthsByYear = new Map<number, number>();
    for (const s of SECTORS) {
      top3ByYear.set(s, new Map());
      top1ByYear.set(s, new Map());
      bot3ByYear.set(s, new Map());
    }

    for (let year = 2012; year <= 2026; year++) {
      for (let month = 1; month <= 12; month++) {
        const asOf = new Date(year, month, 0); // month end
        if (asOf.getTime() > Date.now()) break;
        const fill = autoFillReadings(truncateSectionData(data, asOf), { now: asOf });
        if (fill.filled.length < 20) continue;
        const ranked = scoreMatrix(fill.readings);
        monthsByYear.set(year, (monthsByYear.get(year) ?? 0) + 1);
        const top3 = ranked.slice(0, 3);
        const bot3 = ranked.slice(-3);
        for (const t of top3) {
          const m = top3ByYear.get(t.sector)!;
          m.set(year, (m.get(year) ?? 0) + 1);
        }
        {
          const m = top1ByYear.get(ranked[0].sector)!;
          m.set(year, (m.get(year) ?? 0) + 1);
        }
        for (const b of bot3) {
          const m = bot3ByYear.get(b.sector)!;
          m.set(year, (m.get(year) ?? 0) + 1);
        }
        // Monthly detail from 2021 onward, quarterly before that.
        if (year >= 2021 || month % 3 === 0) {
          lines.push(
            `${year}-${String(month).padStart(2, "0")}  ` +
              `top: ${top3.map((t) => `${t.sector} (${t.total >= 0 ? "+" : ""}${t.total})`).join(", ")}  ` +
              `| bottom: ${bot3.map((t) => `${t.sector} (${t.total})`).join(", ")}`,
          );
        }
      }
    }

    const years = [...monthsByYear.keys()].sort();
    const fmtRow = (byYear: Map<string, Map<number, number>>, s: string) =>
      years
        .map((y) => {
          const n = byYear.get(s)!.get(y) ?? 0;
          const tot = monthsByYear.get(y) ?? 0;
          return tot > 0 ? String(Math.round((n / tot) * 100)).padStart(4) : "  --";
        })
        .join("");

    const header = `sector                    ${years.map((y) => String(y).slice(2).padStart(4)).join("")}`;
    const table = (title: string, byYear: Map<string, Map<number, number>>) => {
      const rows = SECTORS.map((s) => `${s.padEnd(26)}${fmtRow(byYear, s)}`);
      return [`\n== ${title} (% of scored months per year) ==`, header, ...rows].join("\n");
    };

    const out = [
      table("Share of months in TOP 3", top3ByYear),
      table("Share of months ranked #1", top1ByYear),
      table("Share of months in BOTTOM 3", bot3ByYear),
      "\n== Quarterly snapshots ==",
      ...lines,
    ].join("\n");
    writeFileSync(resolve(FIXTURE_DIR, "favored.txt"), `${out}\n`, "utf8");
    expect(years.length).toBeGreaterThan(5);
  }, 1_800_000);
});
