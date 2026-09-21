// One rule for every rule file: a reading never fires against the direction
// its own label rules out.
//
// The check is generic. For each rule whose LABEL carries a movement word, a
// broad grid of facts is tried with the contradicting direction set. If the
// rule fires anywhere on that grid, it is claiming a movement the figures deny.
//
// It can only under-report, never false-fail: a rule the grid cannot satisfy at
// all is simply not exercised, and a label whose movement word is really a
// description of the LEVEL (a net percent "tightening", a year-over-year
// percent "contracting") is excused by saying so in gapNote, which the review
// sheet prints for the owner.
//
// The word lists are deliberately short. They hold participles that can only
// describe a series moving. Adjectives that name a state the owner defined with
// his own number ("compressed", "thinning", "stretched", "tight") are not in
// them, because the number is the condition and the word is the name of it.

import { describe, expect, it } from "vitest";

import { ALL_RULES } from "./index";
import type { ReadingRule, SeriesFacts } from "./types";

/** Words that can only mean the series is going up. */
const RISING = /\b(rising|risen|climbing|accelerating|widening|steepening|surging|spiking)\b/i;

/** Words that can only mean the series is going down. */
const FALLING = /\b(falling|fallen|slowing|narrowing|easing|declining|draining|cooling|contracting|shrinking|decelerating|flattening)\b/i;

/** The movement words joined to a condition by "and", inside a parenthetical. */
const JOINED =
  /\band\s+(rising|climbing|accelerating|widening|falling|declining|decelerating|slowing|narrowing|shrinking)\b/gi;

/**
 * The part of a label that describes THIS series moving.
 *
 * The head of the label, plus any "and <movement>" clause inside the
 * parenthetical, because that is the owner adding a direction to his own
 * condition ("above 55 and rising"). The rest of a parenthetical is left out:
 * it often describes something else entirely, as in "Falling sharply (acute
 * risk-off, yen surging)", where the yen rises precisely because the series
 * falls.
 */
export function movementText(label: string): string {
  const open = label.indexOf("(");
  if (open < 0) return label;
  return [label.slice(0, open), ...(label.slice(open).match(JOINED) ?? [])].join(" ");
}

/** The phrase a rule uses to say the word was read and is not tested. */
const NOT_TESTED = "Direction word not tested:";

const LEVELS = [
  -1e12, -1e6, -500, -100, -40, -12, -5, -3, -2, -1, -0.5, -0.1, 0, 0.1, 0.5, 1, 1.5, 2, 2.5, 3,
  3.5, 4, 5, 6, 7, 8, 10, 12, 15, 20, 25, 30, 40, 52, 57, 62, 67, 72, 100, 500, 1500, 2000, 2500,
  3000, 3500, 5000, 1e6, 1e12,
];
const PERCENTILES: (number | null)[] = [0, 10, 25, 50, 75, 90, 100, null];
const YOY: (number | null)[] = [-30, -5, 0, 5, 30, null];

/** Does this rule fire anywhere on the grid with `trend` forced? */
function firesWith(rule: ReadingRule, trend: NonNullable<SeriesFacts["trend"]>): boolean {
  const trendChange = trend === "rising" ? 1.5 : -1.5;
  for (const latest of LEVELS) {
    for (const percentile10y of PERCENTILES) {
      for (const yoyChangePct of YOY) {
        const yearAgo = yoyChangePct === null ? null : latest - yoyChangePct / 10;
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
  return false;
}

interface Violation {
  where: string;
  reading: string;
  fired: string;
}

function violations(): Violation[] {
  const out: Violation[] = [];
  for (const metric of ALL_RULES) {
    for (const rule of metric.rules) {
      const excused = (rule.gapNote ?? "").includes(NOT_TESTED);
      if (excused) continue;
      const where = `${metric.surface} ${metric.defNumber}`;
      const text = movementText(rule.reading);
      if (RISING.test(text) && firesWith(rule, "falling")) {
        out.push({ where, reading: rule.reading, fired: "falling" });
      }
      if (FALLING.test(text) && firesWith(rule, "rising")) {
        out.push({ where, reading: rule.reading, fired: "rising" });
      }
    }
  }
  return out;
}

function describeViolation(v: Violation): string {
  return `${v.where}: "${v.reading}" fires while the series is ${v.fired}`;
}

describe("a reading never contradicts the movement its label claims", () => {
  it("the word lists actually match the labels in use", () => {
    const labels = ALL_RULES.flatMap((m) => m.rules.map((r) => r.reading));
    expect(labels.filter((l) => RISING.test(movementText(l))).length).toBeGreaterThan(0);
    expect(labels.filter((l) => FALLING.test(movementText(l))).length).toBeGreaterThan(0);
  });

  it("no rule on any surface fires against its own direction word", () => {
    // This ran as a ratchet over a recorded list while the three rule files
    // were being written. Every recorded row was fixed on 2026-09-20, so the
    // assertion is now the plain one: no rule anywhere may contradict itself.
    expect(
      violations().map(describeViolation),
      'gate the rule on facts.trend, or say why the word is not a movement with a gapNote beginning "Direction word not tested:"',
    ).toEqual([]);
  });

  it("every excused label says so where the owner can read it", () => {
    for (const metric of ALL_RULES) {
      for (const rule of metric.rules) {
        const note = rule.gapNote ?? "";
        if (!note.includes(NOT_TESTED)) continue;
        // The excuse must name the word and give a reason, not just the marker.
        expect(note.length, `${metric.surface} ${metric.defNumber}`).toBeGreaterThan(
          NOT_TESTED.length + 20,
        );
      }
    }
  });
});
