// The three company-profile blocks /api/individual carries that lib/types.ts
// does not declare: the business profile and its segments, the cost structure
// against the strategic group, and the generic-strategy position.
//
// Units, from backend/company_profile/UNITS.md: every ratio in these three
// blocks is a DECIMAL, and `differences` and `grossMarginGap` are points
// between two decimals. Segment revenue is "as filed", so it is money in the
// filer's own reporting currency. Ranks are direction free and sorted by the
// size of the figure, never by which value is better.

import { guardLine, guardView } from "./guards";
import type {
  BusinessProfile,
  CompanyGuards,
  CostStructure,
  GenericStrategy,
  RankedFraction,
} from "./types";
import {
  MISSING,
  NOT_APPLICABLE,
  countOf,
  line,
  moneyAmount,
  pctFrac,
  plain,
  plainCapped,
  pointsFromFraction,
  shareOf,
} from "./units";

export function businessProfileLines(
  p: BusinessProfile | null | undefined,
  currency: string | null,
): string[] {
  if (!p) return [];
  const out = [
    line(
      "Business profile",
      `country ${plain(p.country) || MISSING}`,
      `employees ${countOf(p.employees)}`,
      `website ${plain(p.website) || MISSING}`,
    ),
  ];
  if (p.summary) out.push(line("Business summary", plainCapped(p.summary, 600)));
  for (const s of p.segments ?? []) {
    out.push(
      line(
        "Business segment",
        plain(s.name),
        `revenue ${moneyAmount(s.revenue, currency)}`,
        `share ${shareOf(s.share)}`,
        `fiscal year ${countOf(s.fiscalYear)}`,
      ),
    );
  }
  return out;
}

/**
 * The cost structure against the strategic group.
 *
 * The cost of goods share is suppressed for a lender or insurer: the guard
 * says the stored gross margin is 1.0 by construction because there is no cost
 * of revenue, so a 40.09 percent cost of goods printed here contradicted that
 * sentence four lines further down.
 */
export function costStructureLines(
  c: CostStructure | null | undefined,
  guards?: CompanyGuards | null,
): string[] {
  if (!c || c.applicable === false) return [];
  const view = guardView(c, guards);
  const cogsGuarded = view.hides("cogsToRevenue");
  const row = (label: string, side: "company" | "group" | "differences") => {
    const v = c[side];
    if (!v) return null;
    const asPoints = side === "differences";
    const f = (n: number | null | undefined) => (asPoints ? pointsFromFraction(n, 2) : pctFrac(n, 2));
    return line(
      `Cost structure ${label}`,
      `cost of goods ${cogsGuarded ? NOT_APPLICABLE : f(v.cogsToRevenue)}`,
      `selling and admin ${f(v.sgaToRevenue)}`,
      `research ${f(v.rdToRevenue)}`,
      `depreciation ${f(v.daToRevenue)}`,
      `operating margin ${f(v.operatingMargin)}`,
    );
  };
  const out = [
    line(
      "Cost structure basis",
      plain(c.groupLabel),
      `basis ${plain(c.groupBasis)}`,
      `firms in the group ${countOf(c.groupFirmCount)}`,
      `peers ${countOf(c.peerCount)}`,
      `fiscal year ${countOf(c.fiscalYear)}`,
    ),
  ];
  for (const [label, side] of [
    ["company", "company"],
    ["group median", "group"],
    ["company minus group", "differences"],
  ] as const) {
    const l = row(label, side);
    if (l) out.push(l);
  }
  const note = guardLine(view, "Cost structure", [["cogsToRevenue", "cost of goods"]]);
  if (note) out.push(note);
  return out;
}

/**
 * The generic-strategy position.
 *
 * Two of its five rows need a cost of revenue: the cost of goods plus selling
 * and admin share, and the gross margin gap. Both are dropped for a lender or
 * insurer, for the reason the guard states.
 */
export function genericStrategyLines(
  g: GenericStrategy | null | undefined,
  guards?: CompanyGuards | null,
): string[] {
  if (!g || g.applicable === false) return [];
  const view = guardView(g, guards);
  const cogsGuarded = view.hides("costOfGoodsPlusSgaToRevenue");
  const marginGuarded = view.hides("grossMarginGap");
  const ranked = (label: string, r: RankedFraction | null | undefined, asPoints = false) =>
    r
      ? line(
          `Generic strategy ${label}`,
          asPoints ? pointsFromFraction(r.value, 2) : pctFrac(r.value, 2),
          `rank ${countOf(r.rank)} of ${countOf(r.count)} by size of the figure`,
        )
      : null;
  const out = [
    line(
      "Generic strategy basis",
      `peers ${countOf(g.peerCount)}`,
      `fiscal year ${countOf(g.fiscalYear)}`,
      `segments ${countOf(g.segmentCount)}`,
    ),
  ];
  for (const l of [
    cogsGuarded
      ? null
      : ranked("cost of goods plus selling and admin to revenue", g.costOfGoodsPlusSgaToRevenue),
    g.grossMarginGap && !marginGuarded
      ? line(
          "Generic strategy gross margin gap",
          pointsFromFraction(g.grossMarginGap.value, 2),
          `company ${pctFrac(g.grossMarginGap.companyGrossMargin, 2)}`,
          `industry median ${pctFrac(g.grossMarginGap.industryMedianGrossMargin, 2)}`,
          `rank ${countOf(g.grossMarginGap.rank)} of ${countOf(g.grossMarginGap.count)}`,
        )
      : null,
    ranked("research to revenue", g.rdToRevenue),
    ranked("selling and admin to revenue", g.sgaToRevenue),
    ranked("revenue share of the peer set", g.revenueShare),
  ]) {
    if (l) out.push(l);
  }
  const note = guardLine(view, "Generic strategy", [
    ["costOfGoodsPlusSgaToRevenue", "cost of goods plus selling and admin to revenue"],
    ["grossMarginGap", "gross margin gap"],
  ]);
  if (note) out.push(note);
  return out;
}
