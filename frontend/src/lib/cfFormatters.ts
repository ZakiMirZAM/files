// The connection layer's number formatters, and the four resolvers that turn a
// connections company block into the figures a line prints.
//
// One set of formatters for the whole layer, so a figure reads the same
// wherever it appears: lib/stageContext/units.ts wraps them for the
// cross-stage data block and lib/stageContext/companyConnections.ts prints the
// resolvers' output. Each formatter returns a bare number string (no trailing
// "%"), because the copy that uses one already says "percent", "times",
// "points", and so on.
//
// It was also the home of the Carried Forward panel's phrase builders and
// rotation links. That panel is gone, and so are they.

import type { CompanyBlock } from "./connectionsTypes";
import { UNAVAILABLE } from "./connectionsCopy";

// ── Basic formatters ──────────────────────────────────────────────────────

/**
 * `toFixed` with no negative zero.
 *
 * A figure of -0.004 at two decimals prints "-0.00", which reads as a small
 * loss where the rounded figure is nothing at all. Every formatter below goes
 * through here so the sign is dropped when the rounded figure is zero.
 */
function fixed(v: number, digits: number): string {
  const text = Number(v).toFixed(digits);
  return /^-0(\.0*)?$/.test(text) ? text.slice(1) : text;
}

/** Fraction (0.13) -> display percent string "13.0". */
export function pctFromFraction(
  v: number | null | undefined,
  digits = 1,
): string {
  if (v == null || !Number.isFinite(v)) return UNAVAILABLE.figure;
  return fixed(v * 100, digits);
}

/** Value already in percent or points (4.94 -> "4.9"). */
export function pctAlreadyPercent(
  v: number | null | undefined,
  digits = 1,
): string {
  if (v == null || !Number.isFinite(v)) return UNAVAILABLE.figure;
  return fixed(v, digits);
}

/** Points (0.54 -> "0.5"). */
export function points(
  v: number | null | undefined,
  digits = 1,
): string {
  if (v == null || !Number.isFinite(v)) return UNAVAILABLE.figure;
  return fixed(v, digits);
}

/** Times multiplier (329.77 -> "329.8"). */
export function times(
  v: number | null | undefined,
  digits = 1,
): string {
  if (v == null || !Number.isFinite(v)) return UNAVAILABLE.figure;
  return fixed(v, digits);
}

/** Plain number with fixed decimals (for HHI, counts, and so on). */
export function num(
  v: number | null | undefined,
  digits = 0,
): string {
  if (v == null || !Number.isFinite(v)) return UNAVAILABLE.figure;
  return fixed(v, digits);
}

/**
 * US dollars, abbreviated with sensible decimals. Unlike the app's generic
 * formatCurrency this never prints three decimal places on a small value
 * ("$507.972"); sub-thousand amounts round to whole dollars.
 *
 * A negative amount carries the sign in front of the currency, "-$126.6M", the
 * way every accounting convention writes one. "$-126.6M" reads as a dollar
 * sign followed by a separate figure.
 */
export function usd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return UNAVAILABLE.figure;
  const n = Number(v);
  const abs = Math.abs(n);
  const scaled = (divisor: number, digits: number): string => fixed(abs / divisor, digits);
  const sign = fixed(n, 0) === "0" || n >= 0 ? "" : "-";
  if (abs >= 1e12) return `${sign}$${scaled(1e12, 1)}T`;
  if (abs >= 1e9) return `${sign}$${scaled(1e9, 1)}B`;
  if (abs >= 1e6) return `${sign}$${scaled(1e6, 1)}M`;
  if (abs >= 1e3) return `${sign}$${scaled(1e3, 1)}K`;
  return `${sign}$${scaled(1, 0)}`;
}

/**
 * A share of a total, in display percent. A share under one percent keeps two
 * decimals so a small company's move reads as 0.05 to 0.03 rather than as
 * 0.1 to 0.0.
 */
export function sharePct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return UNAVAILABLE.figure;
  const pct = Number(v) * 100;
  return Math.abs(pct) < 1 ? fixed(pct, 2) : fixed(pct, 1);
}

// ── Log growth rates ──────────────────────────────────────────────────────

/**
 * The backend's five-year growth figures are natural-log rates per year, which
 * add exactly but are not the rate a reader means by "percent a year". This
 * converts one to the compound rate: exp(x) - 1, in display percent.
 *
 *   compoundFromLog(0.496187)  -> "64.3"
 *   compoundFromLog(-0.078)    -> "-7.5"
 */
export function compoundFromLog(
  v: number | null | undefined,
  digits = 1,
): string {
  if (v == null || !Number.isFinite(v)) return UNAVAILABLE.figure;
  return fixed((Math.exp(Number(v)) - 1) * 100, digits);
}

/** The numeric compound rate in display percent, or null. */
export function compoundFromLogValue(
  v: number | null | undefined,
): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return (Math.exp(Number(v)) - 1) * 100;
}

// ── Displayed reconciliation ──────────────────────────────────────────────

export interface Reconciled {
  total: string;
  parts: string[];
}

/**
 * Round a total and its parts so the printed parts add to the printed total to
 * the last printed digit. The total and every part but the last are rounded
 * normally; the last part takes whatever is left. Without this, AAPL prints a
 * total of 8.3 beside parts of 8.6 and -0.3, and JPM prints 26.0 beside
 * 20.4, 5.4 and 0.1.
 *
 * Returns null when the total or any part is missing.
 */
export function reconcileParts(
  total: number | null | undefined,
  parts: (number | null | undefined)[],
  digits = 1,
): Reconciled | null {
  if (total == null || !Number.isFinite(total)) return null;
  if (parts.length === 0) return null;
  const nums: number[] = [];
  for (const p of parts) {
    if (p == null || !Number.isFinite(p)) return null;
    nums.push(Number(p));
  }
  const roundedTotal = Number(Number(total).toFixed(digits));
  const head = nums.slice(0, -1).map((p) => Number(Number(p).toFixed(digits)));
  const headSum = head.reduce((a, b) => a + b, 0);
  // Re-round the subtraction so floating point cannot leak a 13th decimal in.
  const last = Number((roundedTotal - headSum).toFixed(digits));
  return {
    total: fixed(roundedTotal, digits),
    parts: [...head, last].map((p) => fixed(p, digits)),
  };
}

/** reconcileParts on fraction inputs, returning display-percent strings. */
export function reconcilePartsFromFractions(
  total: number | null | undefined,
  parts: (number | null | undefined)[],
  digits = 1,
): Reconciled | null {
  const scale = (v: number | null | undefined) =>
    v == null || !Number.isFinite(v) ? null : Number(v) * 100;
  return reconcileParts(scale(total), parts.map(scale), digits);
}

// ── Financial-sector test ─────────────────────────────────────────────────

/**
 * Whether the subject is a bank or other financial company, for which gross
 * margin, interest coverage and the synthetic rating do not mean what they
 * mean elsewhere. Reads the backend's `isFinancial` flag when it is present
 * and falls back to the sector name until it ships.
 */
export function isFinancialSubject(
  flag: boolean | null | undefined,
  sectorName: string | null | undefined,
): boolean {
  if (flag != null) return flag === true;
  return sectorName === "Financial Services";
}

// ── Company facts, resolved once for the panel, the deck and the context ──

/**
 * Which of the one-point interest stress variants this company can support.
 * The dollar amounts are only ever taken from the FX-converted fields, or from
 * the local fields when the company is known to report in US dollars; a New
 * Taiwan dollar figure printed behind a dollar sign overstated TSM's debt by a
 * factor of about thirty.
 */
export type InterestStress =
  | { kind: "financial" }
  | { kind: "full"; debt: string; extra: string; pct: string }
  | { kind: "noShare"; debt: string; extra: string }
  | { kind: "shareOnly"; pct: string }
  | { kind: "none" };

export function resolveInterestStress(
  co: CompanyBlock | null | undefined,
): InterestStress {
  if (!co) return { kind: "none" };
  if (isFinancialSubject(co.isFinancial, co.sector)) return { kind: "financial" };

  const usdKnown =
    co.totalDebtUsd != null || co.reportingCurrency === "USD";
  const debtUsd =
    co.totalDebtUsd ?? (co.reportingCurrency === "USD" ? co.totalDebt : null);
  const extraUsd =
    co.interestPerPointUsd ??
    (co.reportingCurrency === "USD" ? co.interestPerPoint : null);

  const pct = co.interestPerPointPctOfOperatingIncome;
  const pctStr = pct != null && Number.isFinite(pct) ? pctFromFraction(pct) : null;

  if (usdKnown && debtUsd != null && extraUsd != null) {
    if (pctStr != null) {
      return { kind: "full", debt: usd(debtUsd), extra: usd(extraUsd), pct: pctStr };
    }
    return { kind: "noShare", debt: usd(debtUsd), extra: usd(extraUsd) };
  }
  // The currency is unknown or not US dollars: print the ratio only, which is
  // currency neutral.
  if (pctStr != null) return { kind: "shareOnly", pct: pctStr };
  return { kind: "none" };
}

/**
 * The five-year growth split: how much of the company's own growth came from
 * the industry and how much from share.
 *
 * The panel line and the deck question both print these figures. They used to
 * compute them separately from the same fields, so a change to the rounding in
 * one place could make the two disagree about the same company.
 */
export type ResolvedGrowthSplit =
  | { kind: "none" }
  | {
      kind: "full";
      /** True when the company's own compound rate is negative. */
      shrank: boolean;
      /** Unsigned compound rates, for the copy that supplies its own verb. */
      companyAbs: string;
      industryAbs: string;
      /** Signed compound rates, for the AI context. */
      companySigned: string;
      industrySigned: string;
      shareThen: string;
      shareNow: string;
      /** Log points a year: the total and its two parts, reconciled so the
       *  printed parts add to the printed total. */
      total: string;
      industryPart: string;
      sharePart: string;
    };

export function resolveGrowthSplit(
  co: CompanyBlock | null | undefined,
): ResolvedGrowthSplit {
  const g = co?.growth;
  if (!g) return { kind: "none" };
  const split = reconcilePartsFromFractions(g.companyCagr5y, [
    g.industryPoints,
    g.sharePoints,
  ]);
  const companyCompound = compoundFromLogValue(g.companyCagr5y);
  const industryCompound = compoundFromLogValue(g.industryCagr5y);
  if (
    split == null ||
    companyCompound == null ||
    industryCompound == null ||
    g.shareThen == null ||
    g.shareNow == null
  ) {
    return { kind: "none" };
  }
  return {
    kind: "full",
    shrank: companyCompound < 0,
    companyAbs: fixed(Math.abs(companyCompound), 1),
    industryAbs: fixed(Math.abs(industryCompound), 1),
    companySigned: fixed(companyCompound, 1),
    industrySigned: fixed(industryCompound, 1),
    shareThen: sharePct(g.shareThen),
    shareNow: sharePct(g.shareNow),
    total: split.total,
    industryPart: split.parts[0],
    sharePart: split.parts[1],
  };
}

/**
 * The operating-margin split into an industry part, a strategic-group part and
 * a company part, rounded so the printed parts add to the printed total.
 * Returns null when any of the four figures is missing.
 */
export function resolveMarginSplit(
  co: CompanyBlock | null | undefined,
): Reconciled | null {
  const m = co?.margin;
  if (!m) return null;
  return reconcilePartsFromFractions(m.company, [
    m.industryPart,
    m.groupPart,
    m.companyPart,
  ]);
}

/** Which of the credit coverage and rating variants this company supports. */
export type CreditStanding =
  | { kind: "financial" }
  | { kind: "full"; coverage: string; rating: string }
  | { kind: "negative"; coverage: string; rating: string | null }
  | { kind: "noRating"; coverage: string }
  | { kind: "noCoverage"; rating: string }
  | { kind: "neither" };

export function resolveCreditStanding(
  co: CompanyBlock | null | undefined,
): CreditStanding {
  if (!co) return { kind: "neither" };
  if (isFinancialSubject(co.isFinancial, co.sector)) return { kind: "financial" };
  const hasCov =
    co.interestCoverage != null && Number.isFinite(co.interestCoverage);
  const rating =
    typeof co.syntheticRating === "string" && co.syntheticRating.length > 0
      ? co.syntheticRating
      : null;
  // A negative ratio does not mean the company covered its interest a negative
  // number of times: it means operating income was negative. Saying "covers
  // interest -13.1 times" reads as nonsense, so it gets its own sentence.
  if (hasCov && (co.interestCoverage as number) < 0) {
    return { kind: "negative", coverage: times(co.interestCoverage), rating };
  }
  if (hasCov && rating) {
    return { kind: "full", coverage: times(co.interestCoverage), rating };
  }
  if (hasCov) return { kind: "noRating", coverage: times(co.interestCoverage) };
  if (rating) return { kind: "noCoverage", rating };
  return { kind: "neither" };
}
