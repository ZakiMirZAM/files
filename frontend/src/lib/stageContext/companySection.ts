// COMPANY: everything /api/individual/{ticker} carries that an analysis can be
// built on.
//
// Two unit rules run through this whole file.
//
// 1. metricHistory is in DECIMALS, not display units: a 65.75 percent return
//    on capital arrives as 0.6575. Every one of those goes through
//    formatMetricValue, the app's own formatter for this surface. Every rate
//    inside forecast, valuation, growthReconciliation and reverseDcf is a
//    decimal too.
// 2. Money is in the filer's reporting currency, which /api/individual does
//    not state. The caller passes the code from the connections company block.
//    A per-share figure is printed with that code and never with a dollar
//    sign, because the page's own "$1990.550" for TSM is New Taiwan dollars.

import { formatMetricValue, type MetricUnit } from "../metricFormat";
import type {
  CreditAnalysis,
  Dupont,
  IndividualAnalysis,
  IndividualForecast,
  IndividualVerdict,
  LeverageRoe,
  MetricMeta,
  NormalizedEarnings,
  UsesOfCash,
} from "../types";
import {
  businessProfileLines,
  costStructureLines,
  genericStrategyLines,
} from "./companyProfile";
import {
  forecastAssumptionLines,
  growthReconciliationLines,
  reverseDcfLines,
  valuationLines,
  valuationSelectionLines,
  waccBuildLines,
} from "./companyValuation";
import { spreadLines } from "./companySpreads";
import { lifecycleLine } from "./groupDetail";
import type {
  BusinessProfile,
  CompanyGuards,
  CostStructure,
  GenericStrategy,
  SpreadsData,
} from "./types";
import { guardLine, guardView } from "./guards";
import {
  MISSING,
  NOT_APPLICABLE,
  absent,
  countOf,
  figureText,
  line,
  moneyAmount,
  pctFrac,
  plain,
  plainNumber,
  pointsFromFraction,
  shareOf,
  timesOf,
} from "./units";

/** One metricHistory row: the latest value and the same metric five years back. */
function metricHistoryLines(
  meta: MetricMeta[] | null | undefined,
  history: Record<string, Record<string, number>> | null | undefined,
  currency: string | null,
): string[] {
  if (!meta || !history) return [];
  const out = [
    line("metric", "group", "latest", "as of", "five years earlier", "as of"),
  ];
  for (const m of meta) {
    const byYear = history[m.key];
    if (!byYear) continue;
    const years = Object.keys(byYear)
      .map(Number)
      .filter((y) => Number.isFinite(y))
      .sort((a, b) => a - b);
    if (years.length === 0) continue;
    const latestYear = years[years.length - 1];
    const backYear = years.includes(latestYear - 5) ? latestYear - 5 : null;
    const show = (v: number | null | undefined) =>
      m.unit === "$" ? moneyAmount(v, currency) : figureText(formatMetricValue(v, m.unit as MetricUnit));
    out.push(
      line(
        plain(m.label),
        plain(m.group),
        show(byYear[String(latestYear)]),
        String(latestYear),
        // Never an empty cell: `line` drops one, which would leave the row a
        // cell short of the header above it. Both cells carry the block's one
        // missing word rather than two sentences of their own.
        backYear == null ? MISSING : show(byYear[String(backYear)]),
        backYear == null ? MISSING : String(backYear),
      ),
    );
  }
  return out;
}

function verdictLines(v: IndividualVerdict | null | undefined): string[] {
  if (!v) return [];
  const out = [line("Verdict quality score", plainNumber(v.qualityScore, 2))];
  for (const s of v.strengths ?? []) out.push(line("Verdict strength", plain(s)));
  for (const w of v.weaknesses ?? []) out.push(line("Verdict weakness", plain(w)));
  return out;
}

/**
 * The credit block, with the four figures a lender's guard map covers taken
 * out.
 *
 * The rating, the default spread read off it, the investment-grade flag read
 * off it and the interest coverage it was computed from all come from a table
 * calibrated on non-financial firms. The block's own payload says so, and the
 * connections bundle says so for a payload captured before it did; this block
 * used to print the figures anyway.
 */
export function creditLines(
  c: CreditAnalysis | null | undefined,
  guards?: CompanyGuards | null,
): string[] {
  if (!c) return [];
  if (!c.applicable) {
    return [line("Credit analysis", NOT_APPLICABLE, plain(c.notApplicableReason))];
  }
  const view = guardView(c, guards);
  const cell = (figure: string, text: string): string =>
    view.hides(figure) ? NOT_APPLICABLE : text;
  const guardNote = guardLine(view, "Credit analysis", [
    ["syntheticRating", "synthetic rating"],
    ["defaultSpread", "default spread"],
    ["investmentGrade", "investment grade"],
    ["interestCoverage", "interest coverage"],
  ]);
  return [
    line(
      "Credit analysis",
      `kind ${plain(c.kind)}`,
      `synthetic rating ${cell("syntheticRating", plain(c.rating?.letter) || MISSING)}`,
      `default spread ${cell("defaultSpread", pctFrac(c.rating?.spread, 2))}`,
      `investment grade ${cell(
        "investmentGrade",
        c.rating?.investmentGrade === true
          ? "yes"
          : c.rating?.investmentGrade === false
            ? "no"
            : MISSING,
      )}`,
      `interest coverage ${cell("interestCoverage", timesOf(c.rating?.interestCoverage, 2))}`,
      `score ${plainNumber(c.summary?.score, 1)}`,
      `band ${plain(c.summary?.band)}`,
      plain(c.summary?.headline),
    ),
    ...(guardNote ? [guardNote] : []),
    ...(c.debtCapacity
      ? [
          line(
            "Credit debt capacity",
            `debt to free cash flow ${timesOf(c.debtCapacity.debtToFcf, 2)}`,
            `band ${plain(c.debtCapacity.band)}`,
            plain(c.debtCapacity.headline),
          ),
        ]
      : []),
    ...(c.capitalStructure
      ? [
          line(
            "Credit capital structure",
            `revenue growth volatility ${pctFrac(c.capitalStructure.revenueGrowthVolatility, 2)}`,
            c.capitalStructure.mismatch ? "operating risk and leverage mismatch" : "no mismatch",
            plain(c.capitalStructure.headline),
          ),
        ]
      : []),
  ];
}

function normalizedEarningsLines(
  n: NormalizedEarnings | null | undefined,
  currency: string | null,
): string[] {
  if (!n) return [];
  return [
    line(
      "Normalized earnings",
      `lease debt ${moneyAmount(n.leases?.leaseDebt, currency)}`,
      `reported operating income ${moneyAmount(n.leases?.reportedEbit, currency)}`,
      `lease-adjusted operating income ${moneyAmount(n.leases?.adjustedEbit, currency)}`,
      `debt added to the cost of capital ${moneyAmount(n.additiveDebtForWacc, currency)}`,
      `share of profit from investments ${pctFrac(n.investmentIncome?.pctFromInvestments, 2)}`,
      `one-time normalized operating income ${moneyAmount(n.oneTime?.normalizedEbit, currency)}`,
      `share-based pay to revenue ${pctFrac(n.goodwillSbc?.sbcToRevenue, 2)}`,
      `goodwill to assets ${pctFrac(n.goodwillSbc?.goodwillToAssets, 2)}`,
    ),
  ];
}

/** The payload's own field names, and what each one is called in the block.
 *  Printing the raw key put "rnd" and "debtRepaid" in front of a reader. */
const USE_OF_CASH_LABELS = [
  ["capex", "capital spending"],
  ["rnd", "research and development"],
  ["acquisitions", "acquisitions"],
  ["buybacks", "buybacks"],
  ["dividends", "dividends"],
  ["debtRepaid", "debt repaid"],
] as const;

/**
 * The latest year's uses of cash.
 *
 * `shareOfOcf` is null as a whole when operating cash flow was not positive,
 * because a negative denominator turns every use into a negative percentage.
 * The line used to attach "(not available of operating cash flow)" to all six
 * uses, which said the same nothing six times and never said why; the payload's
 * own `shareReason` says it once.
 */
function usesOfCashLines(u: UsesOfCash | null | undefined, currency: string | null): string[] {
  if (!u || u.applicable === false) return [];
  const years = u.years ?? [];
  if (years.length === 0) return [];
  const y = years[years.length - 1];
  const sharesDefined = y.shareOfOcf != null;
  const out = [
    line(
      `Uses of cash, fiscal ${countOf(y.year)}`,
      `operating cash flow ${moneyAmount(y.operatingCashFlow, currency)}`,
      ...USE_OF_CASH_LABELS.map(([k, label]) => {
        if (!y.reported[k]) return `${label} not reported`;
        const amount = `${label} ${moneyAmount(y.uses[k], currency)}`;
        const share = sharesDefined ? shareOf(y.shareOfOcf?.[k]) : MISSING;
        // The parenthesis is attached to a figure or to nothing: "(not
        // available of operating cash flow)" is the missing word wearing a
        // unit.
        return absent(share) ? amount : `${amount} (${share} of operating cash flow)`;
      }),
      `total uses ${moneyAmount(y.totalUses, currency)}`,
      sharesDefined
        ? `total share of operating cash flow ${shareOf(y.totalUsesShareOfOcf)}`
        : "shares of operating cash flow are not defined this year",
    ),
  ];
  if (!sharesDefined && y.shareReason) {
    out.push(line("Uses of cash note", plain(y.shareReason)));
  }
  if (u.note) out.push(line("Uses of cash note", plain(u.note)));
  return out;
}

function dupontLines(d: Dupont | null | undefined): string[] {
  if (!d || !d.applicable) return [];
  return [
    line(
      `DuPont, fiscal ${countOf(d.latestYear)}`,
      `tax burden ${timesOf(d.factors.taxBurden, 3)}`,
      `interest burden ${timesOf(d.factors.interestBurden, 3)}`,
      `EBIT margin ${pctFrac(d.factors.ebitMargin, 2)}`,
      `asset turnover ${timesOf(d.factors.assetTurnover, 3)}`,
      `financial leverage ${timesOf(d.factors.financialLeverage, 3)}`,
      `modelled return on equity ${pctFrac(d.roe, 2)}`,
      `reported return on equity ${pctFrac(d.roeReported, 2)}`,
      // The backend's flag compares the product of the five factors against
      // the MODELLED return, not against the reported one: the modelled figure
      // uses average balance-sheet terms and the reported one uses ending
      // equity, so the two legitimately differ. A bare "reconciles" printed
      // straight after the reported figure reads as a claim that the two
      // agree, which is not what the flag says.
      d.reconciles
        ? "the five factors multiply to the modelled figure"
        : "the five factors do not multiply to the modelled figure",
    ),
  ];
}

function leverageRoeLines(l: LeverageRoe | null | undefined): string[] {
  if (!l || !l.applicable) return [];
  return [
    line(
      `Leverage decomposition of return on equity, fiscal ${countOf(l.latestYear)}`,
      l.staleLatest ? `data through ${countOf(l.dataThroughYear)}` : null,
      `return on invested capital ${pctFrac(l.terms.roic, 2)}`,
      `debt to equity ${timesOf(l.terms.debtEquity, 3)}`,
      `book interest rate ${pctFrac(l.terms.bookInterestRate, 2)}`,
      `after-tax cost of debt ${pctFrac(l.terms.afterTaxDebtCost, 2)}`,
      `spread ${pointsFromFraction(l.terms.spread, 2)}`,
      `leverage gain ${pointsFromFraction(l.terms.leverageGain, 2)}`,
      `modelled return on equity ${pctFrac(l.roeModel, 2)}`,
      `reported return on equity ${pctFrac(l.roeReported, 2)}`,
      `non-operating gap ${pointsFromFraction(l.nonOperatingGap, 2)}`,
      l.reconciles ? "reconciles" : "does not reconcile",
    ),
  ];
}

export interface CompanySectionInput {
  analysis: IndividualAnalysis | null;
  extras: { businessProfile?: BusinessProfile | null; costStructure?: CostStructure | null; genericStrategy?: GenericStrategy | null };
  /** The filer's reporting currency, from the connections company block. */
  currency: string | null;
  /**
   * The currency the market quote is denominated in, from /api/quote. For a
   * foreign filer's American depositary receipt this is US dollars while the
   * statements above are not, and the valuation lines say so.
   */
  quoteCurrency?: string | null;
  /** The connections bundle's guard map, so a lender's block does not print a
   *  synthetic rating beside the sentence that says it misreads one. */
  guards?: CompanyGuards | null;
  /** The company against its industry median and its strategic group's median,
   *  in display units, from /api/individual/{ticker}/spreads. */
  spreads?: SpreadsData | null;
  missingSources: string[];
}

export function companySection(input: CompanySectionInput): string[] {
  const out: string[] = [];
  for (const what of input.missingSources) out.push(`Not loaded: ${what}`);
  const an = input.analysis;
  if (!an) return out;
  const f: IndividualForecast | null | undefined = an.forecast;
  const currency = input.currency;
  const quoteCurrency = input.quoteCurrency ?? null;
  const guards = input.guards ?? null;

  out.push(
    line(
      "Company",
      plain(an.ticker),
      plain(an.name),
      `sector ${plain(an.sector)}`,
      `industry ${plain(an.industry)}`,
      `latest fiscal year ${countOf(an.latestYear)}`,
      `years on file ${
        an.years.length > 0
          ? `${countOf(an.years[0])} to ${countOf(an.years[an.years.length - 1])}`
          : MISSING
      }`,
      `reporting currency ${plain(currency) || "not resolved"}`,
      `market quote currency ${plain(quoteCurrency) || "not resolved"}`,
    ),
  );
  out.push(
    "Metric history is in decimals on this surface, so a return of 0.6575 is 65.75 percent. " +
      "Money is in the reporting currency named above.",
  );
  out.push(...metricHistoryLines(an.metricMeta, an.metricHistory, currency));
  out.push(...valuationLines(an.valuation, currency, quoteCurrency));
  out.push(...forecastAssumptionLines(f?.assumptions));
  out.push(...waccBuildLines(f?.waccBuild, currency));
  out.push(...valuationSelectionLines(f?.valuationSelection));
  out.push(...growthReconciliationLines(f?.growthReconciliation));
  const lc = lifecycleLine(plain(an.ticker), f?.lifecycle);
  if (lc) out.push(lc);
  out.push(...reverseDcfLines(f?.reverseDcf, currency, quoteCurrency));
  out.push(...verdictLines(an.verdict));
  out.push(...creditLines(an.creditAnalysis, guards));
  out.push(...normalizedEarningsLines(an.normalizedEarnings, currency));
  out.push(...usesOfCashLines(an.usesOfCash, currency));
  out.push(...dupontLines(an.dupont));
  out.push(...leverageRoeLines(an.leverageRoe));
  out.push(...businessProfileLines(input.extras.businessProfile, currency));
  out.push(...costStructureLines(input.extras.costStructure, guards));
  out.push(...genericStrategyLines(input.extras.genericStrategy, guards));
  out.push(...spreadLines(input.spreads));
  return out;
}
