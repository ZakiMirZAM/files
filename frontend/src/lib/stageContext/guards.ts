// Which figures must not be read for this company, and the sentence that says
// why.
//
// The backend guards a lender's figures in two places, and each one ships its
// own `isFinancial` flag with a `{field: reason}` map beside the figures it
// covers: `/api/connections` guards the company block, and `/api/individual`
// guards its own credit block, cost structure block and generic strategy block
// (backend/financial_guard.py). Printed without either, the JPM block said
// "synthetic rating Caa/CCC | default spread 10.00% | interest coverage 0.74x"
// and four lines later said "JPM not applicable | syntheticRating | the
// synthetic rating is read off an interest-coverage table calibrated on
// non-financial firms, so it misreads a bank or insurer". Both cannot be true
// in front of a reader.
//
// A figure's own block is asked first, because that guard travelled with the
// figure; the connections bundle answers for a payload that carries no guard
// of its own. Nothing here invents a replacement figure and nothing here
// writes a reason: the guarded cell prints the not applicable word and the
// backend's own sentence is stated once beside it.

import type { CompanyGuards } from "./types";

/** A guard as the backend ships it, on whichever block carries the figures. */
export interface GuardSource {
  isFinancial?: boolean;
  notApplicable?: Record<string, string> | null;
}

/**
 * The guard field each figure depends on, in its own block's payload and in
 * the connections bundle.
 *
 * The two payloads name the same families differently, which is why both keys
 * are listed: a cost of revenue is `cogsToRevenue` where the cost structure
 * block emits it and `grossMargin` where the connections company block guards
 * it. The default spread and the investment-grade flag are both read straight
 * off the synthetic rating, so the rating's guard covers all three; the spread
 * stays suppressed for a lender even when no reason names it, because the
 * backend substitutes a model fallback spread there rather than leaving it
 * empty.
 */
const COVERED_BY: Record<string, { own: string; shared: string }> = {
  syntheticRating: { own: "syntheticRating", shared: "syntheticRating" },
  defaultSpread: { own: "syntheticRating", shared: "syntheticRating" },
  investmentGrade: { own: "syntheticRating", shared: "syntheticRating" },
  interestCoverage: { own: "interestCoverage", shared: "interestCoverage" },
  cogsToRevenue: { own: "cogsToRevenue", shared: "grossMargin" },
  costOfGoodsPlusSgaToRevenue: { own: "costOfGoodsPlusSgaToRevenue", shared: "grossMargin" },
  grossMarginGap: { own: "grossMarginGap", shared: "grossMargin" },
};

/** What one block's figures may and may not say. */
export interface GuardView {
  /** True when this figure must not be read for this company. */
  hides(figure: string): boolean;
  /** The payload's own sentence saying why, or null when it named none. */
  why(figure: string): string | null;
}

function reasonIn(
  guard: GuardSource | CompanyGuards | null | undefined,
  figure: string,
  key: string,
): string | null {
  const map = guard?.notApplicable;
  if (!map) return null;
  return map[figure] ?? map[key] ?? null;
}

/**
 * The guard for one block: its own, with the connections bundle's behind it.
 *
 * `block` is the payload the figures came in. `connections` is the company
 * block of the connections bundle, which is a different request and names the
 * same families under its own keys.
 */
export function guardView(
  block: GuardSource | null | undefined,
  connections: CompanyGuards | null | undefined,
): GuardView {
  const why = (figure: string): string | null => {
    const keys = COVERED_BY[figure];
    if (!keys) return null;
    return (
      reasonIn(block, figure, keys.own) ?? reasonIn(connections, figure, keys.shared) ?? null
    );
  };
  return {
    why,
    hides: (figure: string) =>
      COVERED_BY[figure] != null &&
      (why(figure) != null || block?.isFinancial === true || connections?.isFinancial === true),
  };
}

/** The one reason line a suppressed group of figures carries, or null when
 *  none of them is suppressed. `what` names the block, `figures` the cells. */
export function guardLine(
  view: GuardView,
  what: string,
  figures: [string, string][],
): string | null {
  const hit = figures.filter(([key]) => view.hides(key));
  if (hit.length === 0) return null;
  const reason = view.why(hit[0][0]) ?? "";
  const names = hit.map(([, label]) => label).join(", ");
  return `${what} not applicable | ${names} | ${reason}`;
}
