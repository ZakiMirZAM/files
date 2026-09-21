// The credit rules, checked four ways.
//
//  1. One hand-built sample per reading, plus a sample sitting exactly on each
//     threshold, asserting that the one reading and no other matches.
//  2. A sweep across each metric's plausible range crossed with every
//     direction, asserting that two rules never match at once and that no
//     level in the range falls through.
//  3. Every reading label matches the owner's Part 3 cell word for word.
//  4. Rules plus undetermined together account for every Part 3 reading.

import { describe, expect, it } from "vitest";

import { EM_DASH } from "../copyHygiene.test-helper";
import { CREDIT_METRIC_DEFS } from "../creditDefinitions";
import { METRIC_SECTOR_MAP } from "../generated/metricSectorMap";
import { CREDIT_RULES } from "./credit";
import { makeFacts } from "./testFacts";
import type { SeriesFacts } from "./types";

const BY_NUMBER = new Map(CREDIT_RULES.map((m) => [m.defNumber, m]));

/** Which rules of one metric hold for a level, with the direction varied. */
function matches(defNumber: number, facts: SeriesFacts): string[] {
  const metric = BY_NUMBER.get(defNumber);
  if (!metric) throw new Error(`no rules for credit ${defNumber}`);
  return metric.rules.filter((r) => r.when(facts)).map((r) => r.reading);
}

/**
 * Hand-written samples: the level, then the reading it must produce. Each
 * metric carries one sample per reading followed by one sample sitting exactly
 * on each of its thresholds, which is where a half-open band is decided.
 */
const SAMPLES: Record<number, [number, string][]> = {
  1: [
    [2.7, "Very tight (below 3 percentage points)"],
    [4.1, "Normal (3 to 5 percentage points)"],
    [6.5, "Elevated (5 to 8 percentage points)"],
    [11, "Extreme (above 8 percentage points)"],
    [3, "Normal (3 to 5 percentage points)"],
    [5, "Elevated (5 to 8 percentage points)"],
    [8, "Extreme (above 8 percentage points)"],
  ],
  2: [
    [0.78, "Very tight (below 1 percentage point)"],
    [1.2, "Normal (1 to 1.5 percentage points)"],
    [2, "Elevated (1.5 to 2.5 percentage points)"],
    [3.4, "Extreme (above 2.5 percentage points)"],
    [1, "Normal (1 to 1.5 percentage points)"],
    [1.5, "Elevated (1.5 to 2.5 percentage points)"],
    [2.5, "Extreme (above 2.5 percentage points)"],
  ],
  3: [
    [1.44, "Very narrow (below 1.5 percentage points)"],
    [2, "Normal (1.5 to 2.5 percentage points)"],
    [3, "Elevated (2.5 to 3.5 percentage points)"],
    [5.2, "Extreme (above 3.5 percentage points)"],
    [1.5, "Normal (1.5 to 2.5 percentage points)"],
    [2.5, "Elevated (2.5 to 3.5 percentage points)"],
    [3.5, "Extreme (above 3.5 percentage points)"],
  ],
  4: [
    [-12, "Net easing (below 0, banks loosening)"],
    [7, "Broadly steady (0 to 15 percent)"],
    [25, "Elevated tightening (15 to 40 percent)"],
    [64, "Extreme tightening (above 40 percent, credit crunch)"],
    [0, "Broadly steady (0 to 15 percent)"],
    [15, "Elevated tightening (15 to 40 percent)"],
    [40, "Extreme tightening (above 40 percent, credit crunch)"],
  ],
  5: [
    [-3.5, "Contracting (negative year over year)"],
    [1.2, "Slowing or flat (near zero growth)"],
    [6.097444904877909, "Moderate growth (3 to 8 percent year over year)"],
    [11, "Strong growth (above 8 percent year over year)"],
    [0, "Slowing or flat (near zero growth)"],
    [3, "Moderate growth (3 to 8 percent year over year)"],
    [8, "Strong growth (above 8 percent year over year)"],
  ],
  6: [
    [-4, "Contracting (negative year over year)"],
    [1, "Slowing or flat (near zero growth)"],
    [5, "Moderate growth (2 to 8 percent year over year)"],
    [9.803065947252849, "Strong growth (above 8 percent year over year)"],
    [0, "Slowing or flat (near zero growth)"],
    [2, "Moderate growth (2 to 8 percent year over year)"],
    [8, "Strong growth (above 8 percent year over year)"],
  ],
  7: [
    [-2, "Contracting (negative year over year)"],
    [0.9, "Slowing toward flat (near zero growth)"],
    [3.4566900056243828, "Moderate growth (2 to 8% year over year)"],
    [12, "Rapid growth (above 8% year over year)"],
    [0, "Slowing toward flat (near zero growth)"],
    [2, "Moderate growth (2 to 8% year over year)"],
    [8, "Rapid growth (above 8% year over year)"],
  ],
  8: [
    [-1.5, "Contracting (negative year over year)"],
    [1.1, "Slowing toward flat (near zero growth)"],
    [3.9515976789227185, "Moderate growth (2 to 7% year over year)"],
    [9, "Rapid growth (above 7% year over year)"],
    [0, "Slowing toward flat (near zero growth)"],
    [2, "Moderate growth (2 to 7% year over year)"],
    [7, "Rapid growth (above 7% year over year)"],
  ],
  9: [
    [-2.5, "Contracting (negative year over year)"],
    [0.4, "Slowing toward flat (near zero growth)"],
    [4, "Moderate growth (2 to 6% year over year)"],
    [6.908083555458937, "Strong growth (above 6% year over year)"],
    [0, "Slowing toward flat (near zero growth)"],
    [2, "Moderate growth (2 to 6% year over year)"],
    [6, "Strong growth (above 6% year over year)"],
  ],
  10: [
    [1.38, "Very low (below 1.5 percent)"],
    [2, "Normal and stable (1.5 to 2.5 percent)"],
    [3.2, "Rising or elevated (2.5 to 4 percent and climbing)"],
    [7.4, "Extreme (above 4 percent)"],
    [1.5, "Normal and stable (1.5 to 2.5 percent)"],
    [2.5, "Rising or elevated (2.5 to 4 percent and climbing)"],
    [4, "Extreme (above 4 percent)"],
  ],
  11: [
    [0.3, "Very low (below 0.5 percent)"],
    [0.55, "Normal (0.5 to 1 percent)"],
    [1.6, "Rising or elevated (1 to 2 percent and climbing)"],
    [2.9, "Extreme (above 2 percent)"],
    [0.5, "Normal (0.5 to 1 percent)"],
    [1, "Rising or elevated (1 to 2 percent and climbing)"],
    [2, "Extreme (above 2 percent)"],
  ],
  12: [
    [0.7, "Very low (below 1 percent)"],
    [1.27, "Normal and stable (1 to 1.75 percent)"],
    [2.2, "Rising or elevated (1.75 to 3 percent and climbing)"],
    [4.5, "Extreme (above 3 percent)"],
    [1, "Normal and stable (1 to 1.75 percent)"],
    [1.75, "Rising or elevated (1.75 to 3 percent and climbing)"],
    [3, "Extreme (above 3 percent)"],
  ],
  13: [
    [1.86, "Very low (below 2 percent)"],
    [3, "Normal and stable (2 to 4 percent)"],
    [5.5, "Rising or elevated (4 to 7 percent and climbing)"],
    [10.4, "Extreme (above 7 percent)"],
    [2, "Normal and stable (2 to 4 percent)"],
    [4, "Rising or elevated (4 to 7 percent and climbing)"],
    [7, "Extreme (above 7 percent)"],
  ],
  14: [
    [6.5, "Stretched cushion (below roughly 8 percent)"],
    [9.1, "Thinning cushion (roughly 8 to 10 percent)"],
    [10.3, "Adequate cushion (roughly 10 to 12 percent)"],
    [13.2, "Strong cushion (above roughly 12 percent)"],
    [8, "Thinning cushion (roughly 8 to 10 percent)"],
    [10, "Adequate cushion (roughly 10 to 12 percent)"],
    [12, "Strong cushion (above roughly 12 percent)"],
  ],
  15: [
    [2.1, "Squeezed margin (below roughly 2.5 percent)"],
    [2.8, "Compressed margin (roughly 2.5 to 3.0 percent)"],
    [3.2, "Healthy margin (roughly 3.0 to 3.5 percent)"],
    [4.1, "Wide margin (above roughly 3.5 percent)"],
    [2.5, "Compressed margin (roughly 2.5 to 3.0 percent)"],
    [3, "Healthy margin (roughly 3.0 to 3.5 percent)"],
    [3.5, "Wide margin (above roughly 3.5 percent)"],
  ],
  16: [
    [900, "Scarce reserves (below roughly 1.5 trillion dollars)"],
    [2100, "Draining toward scarce (roughly 1.5 to 2.5 trillion dollars)"],
    [3051.5, "Ample reserves (roughly 2.5 to 3.5 trillion dollars)"],
    [4200, "Abundant reserves (above roughly 3.5 trillion dollars)"],
    [1500, "Draining toward scarce (roughly 1.5 to 2.5 trillion dollars)"],
    [2500, "Ample reserves (roughly 2.5 to 3.5 trillion dollars)"],
    [3500, "Abundant reserves (above roughly 3.5 trillion dollars)"],
  ],
  17: [
    [-0.8477, "Calm (below zero, negative readings)"],
    [1.1, "Elevated (above zero, roughly 0 to 2)"],
    [4.3, "Crisis (well above zero, roughly 2 or higher)"],
    [0, "Elevated (above zero, roughly 0 to 2)"],
    [2, "Crisis (well above zero, roughly 2 or higher)"],
  ],
};

/** The plausible range of each metric's series, for the sweep. */
const SWEEP: Record<number, { from: number; to: number; step: number }> = {
  1: { from: 0, to: 25, step: 0.1 },
  2: { from: 0, to: 8, step: 0.05 },
  3: { from: 0, to: 10, step: 0.05 },
  4: { from: -100, to: 100, step: 1 },
  5: { from: -20, to: 25, step: 0.1 },
  6: { from: -30, to: 30, step: 0.1 },
  7: { from: -20, to: 25, step: 0.1 },
  8: { from: -20, to: 25, step: 0.1 },
  9: { from: -20, to: 25, step: 0.1 },
  10: { from: 0, to: 12, step: 0.05 },
  11: { from: 0, to: 8, step: 0.05 },
  12: { from: 0, to: 10, step: 0.05 },
  13: { from: 0, to: 14, step: 0.05 },
  14: { from: 0, to: 25, step: 0.1 },
  15: { from: 0, to: 8, step: 0.05 },
  16: { from: 0, to: 6000, step: 10 },
  17: { from: -3, to: 10, step: 0.05 },
};

const DIRECTIONS: (SeriesFacts["trend"])[] = ["rising", "falling", "neutral", null];

/**
 * The bands whose label claims a movement, so the rule refuses one direction.
 * A level inside one of these with the refused direction has NO reading, which
 * is the only way a level in the swept range is allowed to fall through.
 */
const GATED: Record<
  number,
  { from: number; to: number; refuses: "rising" | "falling"; reading: string }[]
> = {
  5: [{ from: 0, to: 3, refuses: "rising", reading: "Slowing or flat (near zero growth)" }],
  6: [{ from: 0, to: 2, refuses: "rising", reading: "Slowing or flat (near zero growth)" }],
  7: [{ from: 0, to: 2, refuses: "rising", reading: "Slowing toward flat (near zero growth)" }],
  8: [{ from: 0, to: 2, refuses: "rising", reading: "Slowing toward flat (near zero growth)" }],
  9: [{ from: 0, to: 2, refuses: "rising", reading: "Slowing toward flat (near zero growth)" }],
  10: [
    {
      from: 2.5,
      to: 4,
      refuses: "falling",
      reading: "Rising or elevated (2.5 to 4 percent and climbing)",
    },
  ],
  11: [
    { from: 1, to: 2, refuses: "falling", reading: "Rising or elevated (1 to 2 percent and climbing)" },
  ],
  12: [
    {
      from: 1.75,
      to: 3,
      refuses: "falling",
      reading: "Rising or elevated (1.75 to 3 percent and climbing)",
    },
  ],
  13: [
    { from: 4, to: 7, refuses: "falling", reading: "Rising or elevated (4 to 7 percent and climbing)" },
  ],
  16: [
    {
      from: 1500,
      to: 2500,
      refuses: "rising",
      reading: "Draining toward scarce (roughly 1.5 to 2.5 trillion dollars)",
    },
  ],
};

/** The gated band a level and direction fall into, when there is one. */
function gatedAt(defNumber: number, latest: number, trend: SeriesFacts["trend"]) {
  return (GATED[defNumber] ?? []).find(
    (g) => latest >= g.from && latest < g.to && trend === g.refuses,
  );
}

describe("the credit rule set", () => {
  it("covers all seventeen credit definitions exactly once", () => {
    expect(CREDIT_RULES).toHaveLength(17);
    expect(CREDIT_RULES.map((m) => m.defNumber)).toEqual(
      Array.from({ length: 17 }, (_, i) => i + 1),
    );
    for (const metric of CREDIT_RULES) expect(metric.surface).toBe("credit");
  });

  it("names the payload series the app already attaches to each definition", () => {
    for (const metric of CREDIT_RULES) {
      const def = CREDIT_METRIC_DEFS.find((d) => d.number === metric.defNumber);
      expect(def?.chartMetricName, `credit ${metric.defNumber}`).toBe(metric.metricName);
    }
  });

  it("carries no em dash and no curly quote", () => {
    for (const metric of CREDIT_RULES) {
      const strings = [
        ...metric.rules.flatMap((r) => [r.reading, r.rule, r.source, r.gapNote ?? ""]),
        ...metric.undetermined.flatMap((u) => [u.reading, u.why]),
      ];
      for (const s of strings) {
        expect(s.includes(EM_DASH), `${metric.defNumber}: ${s}`).toBe(false);
        expect(s, `${metric.defNumber}`).not.toMatch(/[“”‘’]/);
      }
    }
  });
});

describe("every reading is the owner's own label", () => {
  for (const metric of CREDIT_RULES) {
    const entry = METRIC_SECTOR_MAP.credit[String(metric.defNumber)];

    it(`credit ${metric.defNumber} quotes its Part 3 labels word for word`, () => {
      expect(entry, `credit ${metric.defNumber} has no parsed definition`).toBeTruthy();
      const labels = entry.part3.map((r) => r.readingLabel);
      for (const rule of metric.rules) expect(labels).toContain(rule.reading);
      for (const u of metric.undetermined) expect(labels).toContain(u.reading);
    });

    it(`credit ${metric.defNumber} accounts for every Part 3 reading once`, () => {
      const covered = [
        ...metric.rules.map((r) => r.reading),
        ...metric.undetermined.map((u) => u.reading),
      ];
      expect(new Set(covered).size, "a reading is listed twice").toBe(covered.length);
      expect([...covered].sort()).toEqual([...entry.part3.map((r) => r.readingLabel)].sort());
    });

    it(`credit ${metric.defNumber} takes its source from the owner's text`, () => {
      const text = `${entry.part3.map((r) => `${r.readingLabel} ${r.meaning}`).join(" ")}`;
      for (const rule of metric.rules) {
        expect(text, `credit ${metric.defNumber}: ${rule.source}`).toContain(rule.source);
      }
    });
  }
});

describe("hand-built samples pick exactly one reading", () => {
  for (const [key, samples] of Object.entries(SAMPLES)) {
    const defNumber = Number(key);
    it(`credit ${defNumber}`, () => {
      for (const [latest, expected] of samples) {
        const hit = matches(defNumber, makeFacts({ latest }));
        expect(hit, `latest ${latest}`).toEqual([expected]);
      }
    });

    it(`credit ${defNumber} samples one level per reading`, () => {
      const metric = BY_NUMBER.get(defNumber);
      const sampled = new Set(samples.map(([, reading]) => reading));
      for (const rule of metric?.rules ?? []) expect(sampled).toContain(rule.reading);
    });
  }
});

describe("the sweep never lets two readings hold at once", () => {
  for (const [key, range] of Object.entries(SWEEP)) {
    const defNumber = Number(key);
    it(`credit ${defNumber} from ${range.from} to ${range.to}`, () => {
      const overlaps: string[] = [];
      const holes: string[] = [];
      const steps = Math.round((range.to - range.from) / range.step);
      for (let i = 0; i <= steps; i++) {
        const latest = Number((range.from + i * range.step).toFixed(4));
        for (const trend of DIRECTIONS) {
          const hit = matches(defNumber, makeFacts({ latest, trend, trendChange: 0.1 }));
          if (hit.length > 1) overlaps.push(`${latest} (${trend}): ${hit.join(", ")}`);
          if (hit.length === 0 && !gatedAt(defNumber, latest, trend)) {
            holes.push(`${latest} (${trend})`);
          }
        }
      }
      expect(overlaps.slice(0, 5), "two readings match at once").toEqual([]);
      expect(holes.slice(0, 5), "no reading covers this level and direction").toEqual([]);
    });
  }
});

describe("a rule refuses the direction its label rules out", () => {
  for (const [key, bands] of Object.entries(GATED)) {
    const defNumber = Number(key);
    for (const band of bands) {
      const inside = Number(((band.from + band.to) / 2).toFixed(4));
      const opposite = band.refuses === "rising" ? "falling" : "rising";

      it(`credit ${defNumber} refuses ${band.refuses} inside ${band.from} to ${band.to}`, () => {
        // The contradicting direction leaves the level with no reading at all,
        // which the review sheet records as uncovered on purpose.
        expect(matches(defNumber, makeFacts({ latest: inside, trend: band.refuses }))).toEqual([]);
      });

      it(`credit ${defNumber} still reads ${band.refuses === "rising" ? "falling" : "rising"}, stable and underivable`, () => {
        for (const trend of [opposite, "neutral", null] as SeriesFacts["trend"][]) {
          expect(matches(defNumber, makeFacts({ latest: inside, trend })), `${trend}`).toEqual([
            band.reading,
          ]);
        }
      });

      it(`credit ${defNumber} records the uncovered combination for the owner`, () => {
        const rule = BY_NUMBER.get(defNumber)?.rules.find((r) => r.reading === band.reading);
        expect(rule?.gapNote, band.reading).toContain("Uncovered on purpose:");
      });
    }
  }
});
