// Every economic and credit definition placed in exactly one group.
//
// The nine groups are the ones the Sector Rotation matrix already uses
// (`GROUPS` in sectorRotation.ts), reused by their own labels so a reader sees
// the same nine words on both surfaces. A tenth, "Credit & banks", holds all
// seventeen credit metrics, because credit is an input to the sector analysis
// rather than one of the nine macro themes.
//
// How a metric gets its group:
//   1. A metric with a Sector Rotation row inherits that row's group. That is
//      forty one of the sixty nine economic definitions, and it is a lookup,
//      not a judgement.
//   2. The remaining twenty eight are placed by subject, using the same group
//      meanings the matrix uses. Every one of those placements is listed in
//      metricGroups.draft.md for the owner to correct.
//   3. Every credit definition goes to "Credit & banks".
//
// 70-How-The-Economy-Works.md is excluded: it is a concept explainer in the
// concept format, not a metric, and it carries none of the three tables.
//
// Nothing here scores, ranks or weighs anything. A group is a filing label.

import { ECON_LINK, GROUPS, METRICS } from "./sectorRotation";

/** The tenth group, added for the credit surface. */
export const CREDIT_GROUP = "Credit & banks";

export const METRIC_GROUPS = [...GROUPS, CREDIT_GROUP] as const;

export type MetricGroup = (typeof METRIC_GROUPS)[number];

/** The one economic definition that is a concept explainer, not a metric. */
export const EXCLUDED_ECONOMIC_NUMBERS = [70] as const;

/** Highest economic definition number in the content folder. */
const HIGHEST_ECONOMIC = 70;

/** Highest credit definition number in the content folder. */
const HIGHEST_CREDIT = 17;

/**
 * Economic definitions with no Sector Rotation row, placed by subject.
 * Listed here rather than derived, so the owner can read the whole judgement
 * in one table. See metricGroups.draft.md.
 */
export const UNLINKED_ECONOMIC_GROUPS: Record<number, MetricGroup> = {
  14: "Growth & activity", // ISM Manufacturing Index
  24: "Labor & consumer", // U-6 Unemployment Rate
  31: "External & dollar", // Current Account, percent of GDP
  36: "Market & context", // Bull-Bear Spread (AAII)
  38: "Market & context", // Fund manager survey cash allocation
  42: "Valuation", // Equity Risk Premium
  43: "Credit & risk", // Sovereign Credit Rating
  44: "Credit & risk", // Bank Net Interest Margin
  46: "Inflation & commodities", // US Crude Oil Inventory
  47: "Growth & activity", // China Monthly Steel Production
  52: "Market & context", // Global Economic Policy Uncertainty
  53: "Market & context", // US Economic Policy Uncertainty
  54: "Market & context", // Geopolitical Risk Index
  55: "Valuation", // S&P 500 to Real M2
  56: "Credit & risk", // Bank Loans and Leases
  57: "Inflation & commodities", // Copper
  58: "Inflation & commodities", // Gold
  59: "Inflation & commodities", // Silver
  60: "Inflation & commodities", // Wheat
  61: "Inflation & commodities", // WTI Crude Oil
  62: "Inflation & commodities", // Brent Crude Oil
  63: "Inflation & commodities", // Henry Hub Natural Gas
  64: "Valuation", // Earnings Yield vs 1-Year Treasury
  65: "Valuation", // S&P 500 Fair Value and Implied Return
  66: "Rates & yield curve", // 10-Year Real Yield (TIPS)
  67: "Liquidity & money", // Net Liquidity
  68: "Valuation", // Expected Return Building Blocks
  69: "Market & context", // AAII Asset Allocation Survey
};

/** Economic definition number -> the group of its Sector Rotation row. */
function linkedEconomicGroups(): Map<number, MetricGroup> {
  const out = new Map<number, MetricGroup>();
  for (const row of METRICS) {
    const econ = ECON_LINK[row.id];
    if (econ == null) continue;
    // Two matrix rows share definition 6 and both sit in the same group, so
    // the first writer wins and a later disagreement would be a data error.
    if (!out.has(econ)) out.set(econ, row.group as MetricGroup);
  }
  return out;
}

export interface MetricGroupEntry {
  surface: "economic" | "credit";
  number: number;
  group: MetricGroup;
  /** How the group was decided, so the draft file and the tests can say so. */
  source: "rotation-row" | "by-subject" | "credit-surface";
}

/** Every placed definition, economic first, each surface in number order. */
export function metricGroupEntries(): MetricGroupEntry[] {
  const linked = linkedEconomicGroups();
  const out: MetricGroupEntry[] = [];
  const excluded = new Set<number>(EXCLUDED_ECONOMIC_NUMBERS);
  for (let n = 1; n <= HIGHEST_ECONOMIC; n++) {
    if (excluded.has(n)) continue;
    const fromRow = linked.get(n);
    if (fromRow) {
      out.push({ surface: "economic", number: n, group: fromRow, source: "rotation-row" });
      continue;
    }
    const bySubject = UNLINKED_ECONOMIC_GROUPS[n];
    if (!bySubject) {
      throw new Error(
        `Economic definition ${n} has no Sector Rotation row and no entry in ` +
          "UNLINKED_ECONOMIC_GROUPS. Add one and list it in metricGroups.draft.md.",
      );
    }
    out.push({ surface: "economic", number: n, group: bySubject, source: "by-subject" });
  }
  for (let n = 1; n <= HIGHEST_CREDIT; n++) {
    out.push({ surface: "credit", number: n, group: CREDIT_GROUP, source: "credit-surface" });
  }
  return out;
}

/** The group for one definition, or undefined when it is not placed. */
export function groupFor(surface: "economic" | "credit", n: number): MetricGroup | undefined {
  if (surface === "credit") return n >= 1 && n <= HIGHEST_CREDIT ? CREDIT_GROUP : undefined;
  return metricGroupEntries().find((e) => e.surface === "economic" && e.number === n)?.group;
}
