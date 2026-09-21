// The review sheet is generated, so it cannot drift from the rules.
//
// This test rebuilds the first two tables from the registry and compares them
// with lib/readingRules.draft.md. It fails the moment a rule is added, removed
// or reworded without the sheet being regenerated, and the message says how.
//
// The dated snapshot at the foot of the sheet is preserved word for word: it
// records what the engine decided against the live backend on one day, which
// no offline run can reproduce.
//
// Regenerate (from frontend/):
//   bash        WRITE_READING_RULES_SHEET=1 npx vitest run src/lib/readingRulesSheet.test.ts
//   PowerShell  $env:WRITE_READING_RULES_SHEET="1"; npx vitest run src/lib/readingRulesSheet.test.ts

import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { EM_DASH } from "./copyHygiene.test-helper";
import { ALL_RULES } from "./readingRules";
import { SNAPSHOT_MARKER, buildReadingRulesSheet } from "./readingRulesSheet";

const HERE = dirname(fileURLToPath(import.meta.url));
const SHEET = join(HERE, "readingRules.draft.md");

const WRITE = process.env.WRITE_READING_RULES_SHEET === "1";

const REGENERATE =
  "the sheet is out of date. Regenerate it with " +
  "WRITE_READING_RULES_SHEET=1 npx vitest run src/lib/readingRulesSheet.test.ts " +
  '(PowerShell: $env:WRITE_READING_RULES_SHEET="1"; npx vitest run src/lib/readingRulesSheet.test.ts)';

/** The dated snapshot section of the sheet on disk, or "" when there is none. */
function snapshotTail(disk: string): string {
  const at = disk.indexOf(SNAPSHOT_MARKER);
  return at < 0 ? "" : disk.slice(at);
}

describe("the reading-rules review sheet", () => {
  // Line endings are normalised before comparing: with core.autocrlf on, a git
  // checkout rewrites this file with CRLF, which is not a change to the sheet.
  const disk = readFileSync(SHEET, "utf8").replace(/\r\n/g, "\n");
  const fresh = buildReadingRulesSheet(ALL_RULES) + snapshotTail(disk);

  it.skipIf(!WRITE)("rewrites the generated tables and keeps the snapshot", () => {
    writeFileSync(SHEET, fresh, "utf8");
    expect(readFileSync(SHEET, "utf8")).toBe(fresh);
  });

  it.skipIf(WRITE)("matches the rules on disk", () => {
    expect(disk, REGENERATE).toBe(fresh);
  });

  it("keeps the dated snapshot, which no offline run can rebuild", () => {
    expect(disk).toContain(SNAPSHOT_MARKER);
  });

  it("carries no em dash and no curly quote", () => {
    expect(disk.includes(EM_DASH)).toBe(false);
    expect(disk).not.toMatch(/[“”‘’]/);
  });

  it("builds the tables even while a rule file is still empty", () => {
    const sheet = buildReadingRulesSheet([]);
    expect(sheet).toContain("## Table 1: every rule");
    expect(sheet).toContain("## Table 2: readings with no rule");
    expect(sheet).toContain("Metrics with rules: 0 credit, 0 economic.");
  });

  it("escapes a pipe rather than breaking the table", () => {
    const sheet = buildReadingRulesSheet([
      {
        surface: "economic",
        defNumber: 1,
        metricName: "Test | metric",
        rules: [
          {
            reading: "A reading",
            when: () => true,
            rule: "a rule\nover two lines",
            source: "a source",
          },
        ],
        undetermined: [],
      },
    ]);
    expect(sheet).toContain("Test \\| metric");
    expect(sheet).toContain("a rule over two lines");
  });

  it("names the figure each rule's line prints", () => {
    const sheet = buildReadingRulesSheet([
      {
        surface: "economic",
        defNumber: 9,
        metricName: "Import Price Index",
        reads: "yoyChangePct",
        rules: [
          {
            reading: "Rising sharply (above 4% year over year)",
            when: () => true,
            rule: "up more than 4 percent on the year",
            source: "above 4% year over year",
          },
          {
            reading: "A rung read off the level instead",
            when: () => false,
            rule: "a level band",
            source: "a source",
            reads: "latest",
          },
        ],
        undetermined: [],
      },
    ]);
    expect(sheet).toContain("Figure the line prints");
    expect(sheet).toContain("the year-over-year percent change");
    expect(sheet).toContain("the latest observation");
  });
});
