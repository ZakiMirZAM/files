// The valuation family on /api/individual: the headline model, the forecast
// assumptions, which structure the selector chose and why, how the historical
// and fundamental growth rates were reconciled, the cost of capital and how it
// was built, and the growth the current price implies.
//
// Units. Every rate in these blocks is a DECIMAL (0.3110 is 31.10 percent),
// and every per-share figure worked out by the model is in the filer's own
// reporting currency, which /api/individual does not state, so the caller
// passes it in from the connections company block. A per-share figure never
// carries a dollar sign.
//
// TWO currencies, not one. `valuation.impliedPrice` and `reverseDcf.priceUsed`
// are not model output: they are the MARKET QUOTE, and for a foreign filer
// trading through an American depositary receipt the quote is in US dollars
// while the statements, and so the intrinsic value, are in the filer's own
// currency. TSM's block read "intrinsic per share 1990.550 TWD | price used
// 434.670 TWD", which stamped the wrong currency on a real US dollar price and
// made a 358 percent margin of safety look like a finding.
//
// The backend now reconciles the two before any model sees the quote, and says
// so in `valuation.priceComparison`: both currencies, the deposit ratio when
// one is on file, and a plain reason when the comparison cannot be made at
// all. Where it cannot, the payload's own margin of safety and reverse DCF are
// already empty and these lines print the reason in their place. The block no
// longer fetches /api/quote for the currency alone; it reads the currency off
// the same payload the figures came from, which also removes the case where
// the two disagreed because one of them failed to load.

import type {
  ForecastAssumptions,
  GrowthReconciliation,
  IndividualValuation,
  PriceComparison,
  ReverseDcf,
  ValuationSelection,
  WaccBuild,
} from "../types";
import {
  MISSING,
  NOT_APPLICABLE,
  countOf,
  line,
  moneyAmount,
  moneyPerShare,
  pctFrac,
  plain,
  plainNumber,
  timesOf,
  withUnit,
} from "./units";

/** What the payload's own enum keys are called in plain words. A block that
 *  printed "archetype amgen" and "status below_band" was handing a reader the
 *  backend's identifiers rather than the thing they name. */
const PLAIN_WORDS: Record<string, string> = {
  // valuation.archetype / valuationSelection.archetype: the three Damodaran
  // shapes, named the way the selector's own rationale sentences name them.
  "con-ed": "stable growth throughout",
  pg: "high growth, then a step down to stable growth",
  amgen: "high growth, a transition phase, then stable growth",
  // valuationSelection.track
  fcff: "free cash flow to the firm, discounted at the cost of capital",
  nstage: "an n-stage equity model",
  ddm: "the dividend discount model",
  // growthReconciliation.mode, the GROWTH_MODEL the backend ran under
  damodaran: "growth measured from the fundamentals, with no growth clamp",
  fundamental: "the reconciled fundamental rate drives the model",
  shadow: "the reconciliation is reported, the revenue trend drives the model",
  regression: "the revenue trend drives the model",
  // growthReconciliation.reinvestmentMethod
  earnings: "reinvestment read off earnings retained",
  salesToCapital: "reinvestment read off the sales to capital bridge",
  // reverseDcf.status
  solved: "a growth rate was solved for",
  below_band: "the price sits below every path the model can produce",
  above_band: "the price sits above every path the model can produce",
  // roicStableSource / marginTargetSource
  industryMedian: "the industry median",
  ownHistory: "the company's own history",
  // waccBuild.betaMethod
  bottom_up_single: "a bottom-up beta from one industry",
  bottom_up_segments: "a bottom-up beta weighted across business segments",
  regression_beta: "the stored regression beta",
  // waccBuild.erpMethod
  implied_two_stage: "the live implied two-stage equity risk premium",
  fixed: "the fixed fallback equity risk premium",
};

/** One payload enum, in plain words, with the key kept beside it so a reader
 *  can still find the field. An unmapped key prints as it arrived. */
export function inWords(key: string | null | undefined): string {
  const k = plain(key);
  if (k.length === 0) return MISSING;
  const words = PLAIN_WORDS[k];
  return words ? `${words} (${k})` : k;
}

/** True when the market quote is denominated in something other than the
 *  currency the filer reports in, which is the ADR case. */
function currencyMismatch(
  reporting: string | null,
  quote: string | null,
): boolean {
  return (
    reporting != null &&
    quote != null &&
    reporting.length > 0 &&
    quote.length > 0 &&
    reporting !== quote
  );
}

/** The sentence a mismatched pair carries, once, under the line that printed
 *  both figures. */
function currencyWarning(
  reporting: string | null,
  quote: string | null,
  what: string,
): string {
  return line(
    `${what} currency`,
    `the model value is in ${plain(reporting)} and the market quote is in ${plain(quote)}`,
    "the margin of safety above is the payload's own figure, worked out from those two as they stand",
    "it does not compare like with like and must not be read as one",
  );
}

/** The quote currency the payload itself states, falling back to whatever the
 *  caller resolved. Reading it off the same payload as the figures means the
 *  two can never disagree. */
function quoteCurrencyOf(
  pc: PriceComparison | null | undefined,
  fallback: string | null = null,
): string | null {
  return pc?.quoteCurrency ?? fallback;
}

export function valuationLines(
  v: IndividualValuation | null | undefined,
  currency: string | null,
  quoteCurrency: string | null = null,
): string[] {
  if (!v) return [];
  const pc = v.priceComparison ?? null;
  const refused = pc?.applicable === false;
  const quote = quoteCurrencyOf(pc, quoteCurrency);
  const reporting = pc?.reportingCurrency ?? currency;
  // Only a comparison that WAS made can be unreconciled. A refused one carries
  // no figure at all, so the caveat would have nothing to attach to.
  const mismatch = !refused && currencyMismatch(reporting, quote);
  const priceCurrency = quote ?? reporting;
  const out = [
    line(
      "Valuation",
      `model ${plain(v.modelLabel) || plain(v.model) || MISSING}`,
      `stages ${countOf(v.stageCount)}`,
      `high-growth years ${countOf(v.highGrowthYears)}`,
      `shape ${inWords(v.archetype)}`,
      `intrinsic per share ${moneyPerShare(v.dcfIntrinsicPerShare, reporting)}`,
      refused
        ? `market quote used ${NOT_APPLICABLE}`
        : `market quote used ${moneyPerShare(v.impliedPrice, priceCurrency)}`,
      // The refusal rides on the figure, so it is never attached to the
      // missing word.
      refused
        ? `margin of safety ${NOT_APPLICABLE}`
        : `margin of safety ${withUnit(
            pctFrac(v.marginOfSafety, 2),
            mismatch ? ", not currency reconciled" : "",
          )}`,
      `cost of capital ${pctFrac(v.wacc, 2)}`,
      `terminal growth ${pctFrac(v.terminalGrowth, 2)}`,
      `projection years ${countOf(v.projectionYears)}`,
      v.notApplicableReason ? NOT_APPLICABLE : null,
      v.notApplicableReason ? plain(v.notApplicableReason) : null,
    ),
  ];
  if (refused) {
    out.push(
      pc?.reason
        ? line("Valuation price comparison", NOT_APPLICABLE, plain(pc.reason))
        : line("Valuation price comparison", NOT_APPLICABLE),
    );
  } else if (pc && pc.ordinarySharesPerReceipt != null) {
    // `basis` says WHICH rule ran, so an interlisted Canadian ordinary share
    // (ratio 1 because that is how the listing works) is not described as a
    // depositary receipt that happens to be one for one.
    out.push(
      line(
        "Valuation price comparison",
        `the quote was reconciled from ${plain(pc.quoteCurrency)} to ${plain(pc.reportingCurrency)}`,
        plain(pc.basis) || `ordinary shares per receipt ${countOf(pc.ordinarySharesPerReceipt)}`,
      ),
    );
  }
  if (mismatch) out.push(currencyWarning(reporting, quote, "Valuation"));
  return out;
}

export function forecastAssumptionLines(a: ForecastAssumptions | null | undefined): string[] {
  if (!a) return [];
  return [
    line(
      "Forecast assumptions",
      `revenue growth initial ${pctFrac(a.revenueGrowthInitial, 2)}`,
      `revenue growth terminal ${pctFrac(a.revenueGrowthTerminal, 2)}`,
      `operating margin now ${pctFrac(a.operatingMarginCurrent, 2)}`,
      `operating margin target ${pctFrac(a.operatingMarginTarget, 2)}`,
      `horizon years ${countOf(a.horizonYears)}`,
      `return on invested capital ${pctFrac(a.roic, 2)}`,
      `cost of capital ${pctFrac(a.wacc, 2)}`,
      `tax rate ${pctFrac(a.taxRate, 2)}`,
      a.growthMethod ? `growth method ${plain(a.growthMethod)}` : null,
    ),
  ];
}

/**
 * The cost of capital, component by component.
 *
 * The Company deck asks for "the cost of capital, its components and how they
 * were built", and the block carried only the finished rate. Every figure here
 * is straight out of `forecast.waccBuild`: the rates and weights are decimals,
 * the market value of equity and the two debt figures are money in the filer's
 * reporting currency, and the beta is a plain coefficient.
 */
export function waccBuildLines(w: WaccBuild | null | undefined, currency: string | null): string[] {
  if (!w) return [];
  const out = [
    line(
      "Cost of capital",
      `weighted average ${pctFrac(w.wacc, 2)}`,
      `cost of equity ${pctFrac(w.costOfEquity, 2)}`,
      `pre-tax cost of debt ${pctFrac(w.costOfDebtPretax, 2)}`,
      `after-tax cost of debt ${pctFrac(w.costOfDebtAfterTax, 2)}`,
      `equity weight ${pctFrac(w.weightEquity, 2)}`,
      `debt weight ${pctFrac(w.weightDebt, 2)}`,
      `marginal tax rate ${pctFrac(w.marginalTaxRate, 2)}`,
      `effective tax rate ${pctFrac(w.effectiveTaxRate, 2)}`,
      `interest coverage ${timesOf(w.interestCoverage, 2)}`,
    ),
    line(
      "Cost of capital, inputs",
      `risk-free rate ${pctFrac(w.riskFreeRate, 2)}`,
      `equity risk premium ${pctFrac(w.equityRiskPremium, 2)}`,
      `premium method ${inWords(w.erpMethod)}`,
      `beta ${plainNumber(w.beta, 4)}`,
      `beta method ${inWords(w.betaMethod)}`,
      `beta confidence ${plain(w.betaConfidence) || MISSING}`,
      `unlevered beta ${plainNumber(w.betaUnlevered, 4)}`,
      `debt to equity used to relever ${plainNumber(w.betaDeRatio, 4)}`,
      `regression beta ${plainNumber(w.betaRegression, 4)}`,
    ),
    // Market cap and total debt are stored in the filer's own reporting
    // currency, so these three are local money and never carry a dollar sign
    // unless the filer reports in dollars.
    line(
      "Cost of capital, weights",
      `market value of equity ${moneyAmount(w.marketValueEquity, currency)}`,
      `conventional debt ${moneyAmount(w.conventionalDebt, currency)}`,
      `lease debt added ${moneyAmount(w.leaseDebt, currency)}`,
      `total book debt ${moneyAmount(w.bookValueDebt, currency)}`,
    ),
  ];
  for (const seg of w.betaComponents ?? []) {
    out.push(
      line(
        "Cost of capital, beta component",
        plain(seg.segment),
        `industry ${plain(seg.industry)}`,
        `weight ${pctFrac(seg.weight, 2)}`,
        `unlevered beta ${plainNumber(seg.unleveredBeta, 4)}`,
        `mapped by ${plain(seg.mapSource)}`,
      ),
    );
  }
  for (const warn of w.betaWarnings ?? []) {
    out.push(line("Cost of capital, beta warning", plain(warn)));
  }
  return out;
}

export function valuationSelectionLines(s: ValuationSelection | null | undefined): string[] {
  if (!s) return [];
  const out = [
    line(
      "Valuation selection",
      `track ${inWords(s.track)}`,
      `recommended stages ${countOf(s.recommendedStages)}`,
      `stages shown ${countOf(s.selectorStages)}`,
      `high-growth years ${countOf(s.highGrowthYears)}`,
      `shape ${inWords(s.archetype)}`,
      `stable return on capital ${pctFrac(s.roicStable, 2)}`,
      s.roicStableSource ? `taken from ${inWords(s.roicStableSource)}` : null,
    ),
  ];
  for (const r of s.rationale ?? []) out.push(line("Valuation rationale", plain(r)));
  for (const d of s.diagnostics ?? []) {
    out.push(line("Valuation diagnostic", plain(d.id), plain(d.severity), plain(d.detail)));
  }
  return out;
}

export function growthReconciliationLines(g: GrowthReconciliation | null | undefined): string[] {
  if (!g) return [];
  return [
    line(
      "Growth reconciliation",
      `historical ${pctFrac(g.historical, 2)}`,
      `fundamental ${pctFrac(g.fundamental, 2)}`,
      `reinvestment rate ${pctFrac(g.reinvestmentRate, 2)}`,
      `efficiency term ${pctFrac(g.efficiencyTerm, 2)}`,
      `reconciled ${pctFrac(g.reconciled, 2)}`,
      `growth used ${pctFrac(g.growthUsed, 2)}`,
      `method ${plain(g.methodUsed)}`,
      `divergence ${pctFrac(g.divergence, 2)}`,
      g.divergenceFlag ? "divergence flagged" : null,
      `reinvestment method ${inWords(g.reinvestmentMethod)}`,
      `sales to capital used ${plainNumber(g.salesToCapitalUsed, 2)}`,
      `margin target ${pctFrac(g.marginTarget, 2)} from ${inWords(g.marginTargetSource)}`,
      `life-cycle band ${pctFrac(g.growthFloor, 2)} to ${pctFrac(g.growthCap, 2)}`,
      `mode ${inWords(g.mode)}`,
    ),
  ];
}

export function reverseDcfLines(
  r: ReverseDcf | null | undefined,
  currency: string | null,
  quoteCurrency: string | null = null,
): string[] {
  if (!r) return [];
  if (r.applicable === false) {
    // The inversion solves for growth against a price. With no price there is
    // nothing to solve against, and the reason names the two units that failed
    // to reconcile rather than leaving a bare refusal.
    return r.reason
      ? [line("Reverse DCF", NOT_APPLICABLE, plain(r.reason))]
      : [line("Reverse DCF", NOT_APPLICABLE)];
  }
  const mismatch = currencyMismatch(currency, quoteCurrency);
  const out = [
    line(
      "Reverse DCF",
      `status ${inWords(r.status)}`,
      `growth the price implies ${pctFrac(r.impliedGrowth, 2)}`,
      `base growth ${pctFrac(r.baseGrowth, 2)}`,
      `historical growth ${pctFrac(r.historicalGrowth, 2)}`,
      `market quote used ${moneyPerShare(r.priceUsed, quoteCurrency ?? currency)}`,
      r.beyondDiagnosticBand ? "beyond the diagnostic band" : null,
    ),
  ];
  if (mismatch) {
    out.push(
      line(
        "Reverse DCF currency",
        `the quote is in ${plain(quoteCurrency)} and the model runs in ${plain(currency)}`,
        "the implied growth was solved against the quote as delivered",
      ),
    );
  }
  // The backend writes one sentence saying what the status means for this
  // company. It was being dropped, which left a reader with a bare enum.
  if (r.note) out.push(line("Reverse DCF note", plain(r.note)));
  return out;
}
