// The rule registry: every metric whose reading can be decided from its series.
//
// Three files feed it, one per author, so the credit and the two economic
// halves can be written independently:
//
//   credit.ts      the 17 credit and banking definitions
//   economicA.ts   economic definitions 01 to 35
//   economicB.ts   economic definitions 36 to 69
//
// Each economic file is itself a thin joiner over two halves and a helpers
// module (economicA1 / economicA2 / economicAHelpers, and the same for B),
// because one file of rules ran past the 800 line limit this repo keeps. The
// two names below are the only ones anything imports.
//
// This module deliberately does NOT re-export engine.ts. The engine imports
// ALL_RULES from here, so a barrel that re-exported it would close a cycle.
// Import the engine from "./readingRules/engine" directly.

import { CREDIT_RULES } from "./credit";
import { ECONOMIC_RULES_A } from "./economicA";
import { ECONOMIC_RULES_B } from "./economicB";
import type { MetricRules, ReadingRuleSurface } from "./types";

export type { MetricRules, ReadingRule, ReadingRuleSurface, SeriesFacts, SeriesPoint } from "./types";

/** Every metric that carries rules, credit first, then economic by file order. */
export const ALL_RULES: MetricRules[] = [
  ...CREDIT_RULES,
  ...ECONOMIC_RULES_A,
  ...ECONOMIC_RULES_B,
];

const BY_KEY: Map<string, MetricRules> = new Map(
  ALL_RULES.map((m) => [`${m.surface}|${m.defNumber}`, m]),
);

/** The rules written for one definition file, or null when none are. */
export function rulesFor(surface: ReadingRuleSurface, defNumber: number): MetricRules | null {
  return BY_KEY.get(`${surface}|${defNumber}`) ?? null;
}
