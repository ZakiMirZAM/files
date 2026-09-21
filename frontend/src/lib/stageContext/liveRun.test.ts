// A real end-to-end run of buildStageContext against a running backend.
//
// It is skipped unless STAGE_CONTEXT_LIVE is set, so an ordinary `npm test`
// never touches the network:
//
//   STAGE_CONTEXT_LIVE=1 VITE_API_BASE=http://127.0.0.1:8001 \
//     npx vitest run src/lib/stageContext/liveRun
//
// VITE_API_BASE picks the backend; with it unset the module default
// (http://localhost:8000) is used. Node's global fetch does the work, and
// every base in lib/useResource.ts is absolute, so nothing here needs a
// browser or a document.
//
// It walks all five stages for one subject and reports the size of each, so a
// change to the block can be compared against the measured numbers rather
// than against a guess. STAGE_CONTEXT_TICKER, _SECTOR and _INDUSTRY pick the
// subject; the defaults are the ones the size figures in the tests were taken
// on.

import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { API_BASE } from "../useResource";
import { buildStageContextDetailed, SIZE_CAP_BYTES } from "../stageContext";
import type { StageKind, StageSubject } from "./types";

const LIVE = process.env.STAGE_CONTEXT_LIVE === "1";
const TICKER = process.env.STAGE_CONTEXT_TICKER ?? "NVDA";
const SECTOR = process.env.STAGE_CONTEXT_SECTOR ?? "Technology";
const INDUSTRY = process.env.STAGE_CONTEXT_INDUSTRY ?? "Semiconductors";

/** The other companies the fixtures are built on, walked on the same run: a
 *  bank, a loss-making manufacturer and a foreign filer quoted in dollars. */
const EXTRA_TICKERS = (process.env.STAGE_CONTEXT_TICKERS ?? "TSM,JPM,RIVN")
  .split(",")
  .map((t) => t.trim())
  .filter((t) => t.length > 0 && t !== TICKER);

/** Where to write each finished block, when the caller asks for them. */
const DUMP = process.env.STAGE_CONTEXT_DUMP ?? "";
if (DUMP) mkdirSync(DUMP, { recursive: true });

/** What each stage is asked about, the way the page that owns it asks. */
const SUBJECT_FOR: Record<StageKind, StageSubject> = {
  credit: {},
  sector: { sector: SECTOR },
  industry: { sector: SECTOR, industry: INDUSTRY },
  comparative: { sector: SECTOR, industry: INDUSTRY },
  company: { ticker: TICKER },
};

const STAGES: StageKind[] = ["credit", "sector", "industry", "comparative", "company"];

/** Bytes per UPPERCASE section header, so the run reports where the size went. */
function sectionSizes(text: string): [string, number][] {
  const headers = new Set([
    "SUBJECT",
    "ECONOMY",
    "SECTOR FINANCING",
    "SECTOR",
    "INDUSTRY",
    "PEERS",
    "COMPANY",
    "READER'S EARLIER CONCLUSIONS",
  ]);
  const sizes = new Map<string, number>();
  let current = "HEAD";
  for (const l of text.split("\n")) {
    if (headers.has(l)) current = l;
    sizes.set(current, (sizes.get(current) ?? 0) + Buffer.byteLength(l, "utf8") + 1);
  }
  return [...sizes.entries()];
}

/** Every matrix and ranking header, with the widths of the rows beneath it. */
function headerWidthMismatches(text: string): string[] {
  const lines = text.split("\n");
  const bad: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const isMatrix = l.startsWith("metric | unit |");
    const isRanking = l.startsWith("company | strategic group |");
    if (!isMatrix && !isRanking) continue;
    const width = l.split(" | ").length;
    for (let j = i + 1; j < lines.length; j++) {
      const row = lines[j];
      if (row.startsWith("column ")) continue;
      // A matrix row is a metric name, a unit and one cell per column; the
      // table ends at the first line that is not one of them.
      const cells = row.split(" | ").length;
      if (cells !== width) break;
      if (row.trim().length === 0) break;
      if (cells !== width) bad.push(`${l.slice(0, 40)} -> ${row.slice(0, 60)}`);
    }
  }
  return bad;
}

describe.skipIf(!LIVE)("buildStageContext against a live backend", () => {
  it(
    "builds every stage and reports its size per section",
    async () => {
      // eslint-disable-next-line no-console
      console.log(`API_BASE = ${API_BASE}, cap ${SIZE_CAP_BYTES} bytes`);
      const report: string[] = [];

      for (const stage of STAGES) {
        const started = Date.now();
        const built = await buildStageContextDetailed(stage, SUBJECT_FOR[stage]);
        const seconds = ((Date.now() - started) / 1000).toFixed(1);
        const lines = built.text.split("\n");
        const ranking = lines.find((l) => l.startsWith("Peer ranking for")) ?? "";

        report.push(
          `${stage}: ${built.bytes} bytes` +
            ` ${built.bytes <= SIZE_CAP_BYTES ? "under the cap" : "OVER the cap"}` +
            `, ${lines.length} lines, built in ${seconds}s`,
        );
        for (const d of built.dropped) report.push(`    dropped: ${d}`);
        for (const [name, bytes] of sectionSizes(built.text)) {
          report.push(`    ${name}: ${bytes} bytes`);
        }
        if (ranking) report.push(`    ${ranking.split(" | ").slice(0, 4).join(" | ")}`);

        expect(built.text, stage).toContain("CROSS-STAGE DATA BLOCK");
        // The legend at the top names the words, so only a LINE that opens
        // with one is a source that did not answer.
        expect(
          lines.filter((l) => l.startsWith("Not loaded:")),
          `${stage} did not load every source`,
        ).toHaveLength(0);
        // A nameless column would put a value under no header.
        const blanks = lines.filter((l) => l.includes("|") && /\|\s*(\||$)/.test(l));
        expect(blanks.slice(0, 3), `${stage} has an empty cell`).toHaveLength(0);
        expect(headerWidthMismatches(built.text), `${stage} header width`).toHaveLength(0);
        expect(built.bytes, `${stage} is ${built.bytes} bytes`).toBeLessThanOrEqual(SIZE_CAP_BYTES);
        expect(built.text, `${stage} is still over`).not.toContain("Still over the size limit");
        if (DUMP) writeFileSync(`${DUMP}/final_${stage}.txt`, built.text);
      }

      // eslint-disable-next-line no-console
      console.log(report.join("\n"));

      for (const ticker of EXTRA_TICKERS) {
        const started = Date.now();
        const built = await buildStageContextDetailed("company", { ticker });
        const seconds = ((Date.now() - started) / 1000).toFixed(1);
        report.push(
          `company ${ticker}: ${built.bytes} bytes` +
            ` ${built.bytes <= SIZE_CAP_BYTES ? "under the cap" : "OVER the cap"}` +
            `, built in ${seconds}s`,
        );
        for (const d of built.dropped) report.push(`    dropped: ${d}`);
        expect(built.text, ticker).toContain("COMPANY");
        expect(
          built.text.split("\n").filter((l) => l.startsWith("Not loaded:")),
          `${ticker} did not load every source`,
        ).toHaveLength(0);
        expect(built.bytes, `${ticker} is ${built.bytes} bytes`).toBeLessThanOrEqual(
          SIZE_CAP_BYTES,
        );
        expect(built.text, `${ticker} is still over`).not.toContain("Still over the size limit");
        if (DUMP) writeFileSync(`${DUMP}/final_company_${ticker}.txt`, built.text);
      }

      const company = await buildStageContextDetailed("company", SUBJECT_FOR.company);
      expect(company.bytes).toBeGreaterThan(20_000);
      expect(company.text).toContain("COMPANY");
    },
    900_000,
  );
});
