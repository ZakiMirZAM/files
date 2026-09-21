// The connections company block and the picker's list of similarly structured
// companies.
//
// Every split here is produced by the tested arithmetic in lib/cfFormatters:
// resolveGrowthSplit, resolveMarginSplit, resolveInterestStress and
// resolveCreditStanding. Nothing is recomputed, so the figure in this block is
// the figure the page printed.
//
// Currency. totalDebt, operatingIncome and interestPerPoint are in the
// company's own reporting currency, and the interest-stress resolver only ever
// prints a dollar sign on a figure it took from a *Usd field or from a company
// that reports in US dollars. The local figure is printed beside it with its
// currency code and no dollar sign.

import {
  resolveCreditStanding,
  resolveGrowthSplit,
  resolveInterestStress,
  resolveMarginSplit,
} from "../cfFormatters";
import type { CompanyBlock } from "../connectionsTypes";
import type { GroupRival, RivalsData } from "./types";
import {
  MISSING,
  NOT_APPLICABLE,
  countOf,
  line,
  localMoney,
  notApplicableLines,
  pctFrac,
  plain,
  shareOf,
  usdOf,
} from "./units";

/** The years the inflation episode is read across, on every connections block. */
const GROSS_MARGIN_YEARS = ["2020", "2021", "2022", "2023"];

/** What every connections block carries at the foot of its own figures: the
 *  2020 shock, the inflation-episode gross margins, the financial guard and
 *  every reason that guard named. */
export interface BlockTail {
  revenueChange2020?: number | null;
  grossMargin?: Record<string, number | null> | null;
  isFinancial?: boolean | null;
  notApplicable?: Record<string, string>;
}

/**
 * That tail, for a sector block, an industry block or a company block alike.
 *
 * `between` is whatever the block prints in the middle of it: an industry's
 * share of its parent sector, and a company's growth, margin and group splits.
 * The sector block prints nothing there.
 */
export function blockTailLines(
  label: string,
  block: BlockTail,
  between: (string | null)[] = [],
): string[] {
  return [
    line(`${label} 2020 revenue change`, pctFrac(block.revenueChange2020)),
    line(
      `${label} gross margin`,
      ...GROSS_MARGIN_YEARS.map((y) => `${y} ${pctFrac(block.grossMargin?.[y])}`),
    ),
    ...between.filter((l): l is string => l != null),
    line(`${label} financial guard`, `isFinancial ${block.isFinancial === true ? "true" : "false"}`),
    ...notApplicableLines(block.notApplicable, label),
  ];
}

/** What one point on the company's borrowing costs would cost it. */
function interestStressLine(t: string, co: CompanyBlock): string {
  const stress = resolveInterestStress(co);
  if (stress.kind === "financial") {
    return line(
      `${t} interest stress`,
      NOT_APPLICABLE,
      "a one point rise passes through a lender's asset side as well as its funding",
    );
  }
  if (stress.kind === "full") {
    return line(
      `${t} interest stress`,
      `debt ${stress.debt}`,
      `extra interest from one point ${stress.extra}`,
      `share of operating income ${stress.pct}%`,
    );
  }
  if (stress.kind === "noShare") {
    return line(
      `${t} interest stress`,
      `debt ${stress.debt}`,
      `extra interest from one point ${stress.extra}`,
      `share of operating income ${MISSING}`,
    );
  }
  if (stress.kind === "shareOnly") {
    return line(`${t} interest stress`, `share of operating income ${stress.pct}%`);
  }
  return line(`${t} interest stress`, MISSING);
}

/** The coverage ratio and the rating read off it, or nothing when the payload
 *  supports neither. */
function creditStandingLine(t: string, co: CompanyBlock): string | null {
  const credit = resolveCreditStanding(co);
  if (credit.kind === "financial") {
    return line(
      `${t} credit standing`,
      NOT_APPLICABLE,
      "interest expense is a bank's cost of funding rather than a fixed charge",
    );
  }
  if (credit.kind === "full") {
    return line(
      `${t} credit standing`,
      `interest coverage ${credit.coverage}x`,
      `synthetic rating ${credit.rating}`,
    );
  }
  if (credit.kind === "negative") {
    return line(
      `${t} credit standing`,
      `operating income is negative, so the coverage ratio reads ${credit.coverage}x`,
      credit.rating ? `synthetic rating ${credit.rating}` : null,
    );
  }
  if (credit.kind === "noRating") {
    return line(`${t} credit standing`, `interest coverage ${credit.coverage}x`, "no synthetic rating");
  }
  if (credit.kind === "noCoverage") {
    return line(`${t} credit standing`, `synthetic rating ${credit.rating}`, "no coverage ratio");
  }
  return null;
}

/** Five years of the company's own growth, split into the industry's part and
 *  the share it took from it. */
function growthSplitLine(t: string, co: CompanyBlock): string {
  const growth = resolveGrowthSplit(co);
  if (growth.kind !== "full") {
    return line(
      `${t} growth split`,
      MISSING,
      "the backend could not measure five years of industry and share movement for this company",
    );
  }
  return line(
    `${t} growth split`,
    `company ${growth.companySigned}% a year compound`,
    `industry ${growth.industrySigned}% a year compound`,
    `share then ${growth.shareThen}%`,
    `share now ${growth.shareNow}%`,
    `log points a year: total ${growth.total} = industry ${growth.industryPart} + share ${growth.sharePart}`,
    `years ${countOf(co.growth?.years)}`,
  );
}

/** The operating margin split into an industry, a group and a company part. */
function marginSplitLine(t: string, co: CompanyBlock): string {
  const margin = resolveMarginSplit(co);
  if (!margin) return line(`${t} operating margin split`, MISSING);
  return line(
    `${t} operating margin split, points of revenue`,
    `company ${margin.total} = industry ${margin.parts[0]} + strategic group ${margin.parts[1]} + company ${margin.parts[2]}`,
    `industry median ${pctFrac(co.margin?.industryMedian)}`,
    `group median ${pctFrac(co.margin?.groupMedian)}`,
    `group ${plain(co.margin?.group)}`,
    `peers ${countOf(co.margin?.firmCount)}`,
  );
}

/** The strategic group the structure engine put the company in. */
function strategicGroupLine(t: string, co: CompanyBlock): string | null {
  const g = co.group;
  if (!g) return null;
  return line(
    `${t} strategic group`,
    plain(g.label),
    `firms across the industry ${countOf(g.firmCount)}`,
    `median pre-tax return on capital ${pctFrac(g.medianPreTaxRoic ?? g.medianRoic)}`,
    `rank by pre-tax return ${countOf(g.rankByPreTaxRoic ?? g.rankByRoic)}`,
    g.axes ? `axes ${g.axes.map((a) => plain(a)).join(", ")}` : null,
  );
}

export function companyConnectionLines(co: CompanyBlock | null | undefined): string[] {
  if (!co) return [];
  const t = plain(co.ticker);
  const currency = co.reportingCurrency ?? null;
  const standing = creditStandingLine(t, co);
  return [
    line(
      `${t} connections`,
      plain(co.name),
      `sector ${plain(co.sector)}`,
      `industry ${plain(co.industry)}`,
      `fiscal year ${countOf(co.fiscalYear)}`,
      `reporting currency ${plain(currency) || "not reported"}`,
    ),
    line(
      `${t} balance`,
      `total debt ${localMoney(co.totalDebt, currency)}`,
      `total debt in US dollars ${usdOf(co.totalDebtUsd)}`,
      `operating income ${localMoney(co.operatingIncome, currency)}`,
      `operating income in US dollars ${usdOf(co.operatingIncomeUsd)}`,
    ),
    interestStressLine(t, co),
    ...(standing ? [standing] : []),
    ...blockTailLines(t, co, [
      growthSplitLine(t, co),
      marginSplitLine(t, co),
      strategicGroupLine(t, co),
    ]),
  ];
}

/** How many rivals survive the size cap's rival rung, largest by revenue. */
export const RIVALS_KEPT = 25;

/**
 * The picker's list: companies the structure engine put in the same group.
 *
 * `nearestOnly` is a rung of the size ladder. Uncapped this printed every firm
 * in the group, which for NVDA and for TSM is 169 rows and about ten kilobytes
 * of a block already over its limit, and the rows past the largest twenty five
 * are companies with a fraction of a percent of the peer set's revenue. The
 * header always states how many the group holds, so a reader can never mistake
 * the printed rows for the whole group.
 */
export function rivalLines(
  rivals: RivalsData | null | undefined,
  nearestOnly = false,
): string[] {
  if (!rivals) return [];
  if (rivals.applicable === false) {
    return [line("Similarly structured companies", NOT_APPLICABLE, plain(rivals.reason))];
  }
  const all: GroupRival[] = rivals.groupRivals ?? [];
  // The payload is already ordered by USD revenue, largest first, so the
  // nearest rivals are simply its leading rows.
  const list = nearestOnly ? all.slice(0, RIVALS_KEPT) : all;
  // Every row in the list normally carries the same group label, so it is
  // stated once in the caption and repeated on a row only when it differs.
  const labels = new Set(list.map((r) => r.groupLabel ?? ""));
  const oneLabel = labels.size === 1 ? [...labels][0] : null;
  const out = [
    line(
      "Similarly structured companies (the picker list, split on Porter's strategic dimensions)",
      `fiscal year ${countOf(rivals.fiscalYear)}`,
      `peers in the panel ${countOf(rivals.peerCount)}`,
      `firms in the group ${countOf(rivals.groupFirmCount ?? all.length)}`,
      `listed ${countOf(list.length)}`,
      list.length < all.length
        ? `the ${countOf(list.length)} largest by revenue of the ${countOf(all.length)} the group holds`
        : null,
      oneLabel ? `every one in the group ${plain(oneLabel)}` : null,
    ),
    // The group column is named only when the rows carry one. With a single
    // label the caption above states it and the rows leave it out, so naming
    // it here left the header one cell wider than every row beneath it.
    line("rival", "ticker", "name", "revenue", "share of the peer set", oneLabel ? null : "group"),
  ];
  for (const r of list) {
    out.push(
      line(
        "rival",
        plain(r.ticker),
        plain(r.name),
        usdOf(r.revenueUsd),
        shareOf(r.revenueShare),
        oneLabel ? null : plain(r.groupLabel),
      ),
    );
  }
  return out;
}

/** Ticker to strategic group label for every firm the rivals payload names,
 *  which is the subject's whole group rather than the twenty the map plots. */
export function groupByRival(rivals: RivalsData | null | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (!rivals || rivals.applicable === false) return out;
  for (const r of rivals.groupRivals ?? []) {
    if (r.groupLabel && r.ticker) out.set(r.ticker.toUpperCase(), r.groupLabel);
  }
  return out;
}
