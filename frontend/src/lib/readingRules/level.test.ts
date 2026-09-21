// One rule for every rule file: a reading never claims a LEVEL the series
// contradicts.
//
// The sister of direction.test.ts. That one holds a label's movement word to
// the direction the reader measured; this one holds a label's level word to
// where the latest figure actually sits inside its own trailing ten years.
//
// Two real readings were found this way and neither was a near miss:
//
//   economic 24  "Elevated and stable (notable slack)" fired with U-6 at the
//                46th percentile of its own ten years, which is the middle.
//   economic 15  "Rising strongly (sales accelerating to high levels)" fired
//                with heavy truck sales at the 26th percentile.
//
// The check is generic. For each rule whose LABEL claims a high or a low level,
// a broad grid of facts is tried with the percentile forced to the other half.
// A rule that fires there is claiming a level the figures deny.
//
// It can only under-report, never false-fail: a rule the grid cannot satisfy at
// all is simply not exercised, and a label whose level word is defined by the
// label's OWN number band ("Very tight (below 3 percentage points)", where the
// number is the condition and the word is its name) is excused by saying so in
// gapNote, which the review sheet prints for the owner. Most labels are of that
// kind, so most of the rules here carry the excuse.
//
// Unlike the direction check, the WHOLE label is read. A level claim lives in
// the parenthetical as often as in the head: "sales accelerating to high
// levels" is the claim, and the head says only how fast.

import { describe, expect, it } from "vitest";

import { ALL_RULES } from "./index";
import { LEVEL_NOT_TESTED } from "./types";
import type { ReadingRule, SeriesFacts } from "./types";

/** Words that can only mean the latest figure is high for this series. */
const HIGH = /\b(high|highs|elevated|ample|abundant|overheating|overextended|extended|rich|extreme)\b/i;

/** Words that can only mean the latest figure is low for this series. */
const LOW = /\b(low|lows|depressed|scarce|squeezed)\b/i;

/** The phrase a rule uses to say the word was read and is not tested. */
const NOT_TESTED = LEVEL_NOT_TESTED;

/** The middle of a series' own ten years. A high claim below it, or a low claim
 *  above it, is contradicted by the series itself. */
const MIDDLE = 50;

const BELOW_MIDDLE = [0, 5, 15, 25, 35, 45, 49.9];
const ABOVE_MIDDLE = [50.1, 55, 65, 75, 85, 95, 100];

const LEVELS = [
  -1e12, -1e6, -500, -100, -40, -12, -5, -3, -2, -1, -0.5, -0.1, 0, 0.1, 0.5, 1, 1.5, 2, 2.5, 3,
  3.5, 4, 5, 6, 7, 8, 10, 12, 15, 20, 25, 30, 40, 52, 57, 62, 67, 72, 100, 500, 1500, 2000, 2500,
  3000, 3500, 5000, 1e6, 1e12,
];
const TRENDS: SeriesFacts["trend"][] = ["rising", "neutral", "falling", null];
const YOY: (number | null)[] = [-30, -5, 0, 5, 30, null];

/** Does this rule fire anywhere on the grid with the percentile forced into
 *  the half its own label rules out? */
function firesAt(rule: ReadingRule, percentiles: number[]): boolean {
  for (const latest of LEVELS) {
    for (const percentile10y of percentiles) {
      for (const trend of TRENDS) {
        for (const yoyChangePct of YOY) {
          const yearAgo = yoyChangePct === null ? null : latest - yoyChangePct / 10;
          const trendChange = trend === "rising" ? 1.5 : trend === "falling" ? -1.5 : 0;
          const facts: SeriesFacts = {
            latest,
            latestPeriod: "2026-08-01",
            previous: latest - trendChange,
            yearAgo,
            yoyChangeAbs: yearAgo === null ? null : latest - yearAgo,
            yoyChangePct,
            trend,
            trendChange,
            percentile10y,
            consecutiveNegative: latest < 0 ? 3 : 0,
            points: [
              { period: "2026-06-01", value: latest - 2 * trendChange },
              { period: "2026-07-01", value: latest - trendChange },
              { period: "2026-08-01", value: latest },
            ],
          };
          let fired = false;
          try {
            fired = rule.when(facts);
          } catch {
            fired = false;
          }
          if (fired) return true;
        }
      }
    }
  }
  return false;
}

interface Violation {
  where: string;
  reading: string;
  claim: string;
}

function violations(): Violation[] {
  const out: Violation[] = [];
  for (const metric of ALL_RULES) {
    for (const rule of metric.rules) {
      if ((rule.gapNote ?? "").includes(NOT_TESTED)) continue;
      const where = `${metric.surface} ${metric.defNumber}`;
      if (HIGH.test(rule.reading) && firesAt(rule, BELOW_MIDDLE)) {
        out.push({ where, reading: rule.reading, claim: `a high level below the ${MIDDLE}th percentile` });
      }
      if (LOW.test(rule.reading) && firesAt(rule, ABOVE_MIDDLE)) {
        out.push({ where, reading: rule.reading, claim: `a low level above the ${MIDDLE}th percentile` });
      }
    }
  }
  return out;
}

describe("a reading never contradicts the level its label claims", () => {
  it("the word lists actually match the labels in use", () => {
    const labels = ALL_RULES.flatMap((m) => m.rules.map((r) => r.reading));
    expect(labels.filter((l) => HIGH.test(l)).length).toBeGreaterThan(0);
    expect(labels.filter((l) => LOW.test(l)).length).toBeGreaterThan(0);
  });

  it("no rule on any surface claims a level its own percentile denies", () => {
    expect(
      violations().map((v) => `${v.where}: "${v.reading}" claims ${v.claim}`),
      'gate the rule on facts.percentile10y, or say why the word is not a level claim about this ' +
        'series with a gapNote beginning "Level word not tested:"',
    ).toEqual([]);
  });

  it("every excused label says so where the owner can read it", () => {
    for (const metric of ALL_RULES) {
      for (const rule of metric.rules) {
        const note = rule.gapNote ?? "";
        if (!note.includes(NOT_TESTED)) continue;
        // The excuse must give a reason, not just the marker.
        expect(note.length, `${metric.surface} ${metric.defNumber}`).toBeGreaterThan(
          NOT_TESTED.length + 20,
        );
      }
    }
  });
});
