// Head to Head: the payload of GET /api/individual/{t}/rivals?rivals=A,B,C and
// the pure arithmetic the comparison table prints. Raw figures and exact
// differences only: no scores, no labels, no thresholds.

import { pctFromFraction, times } from "./cfFormatters";
import type { QualitativeGroup } from "./types";

/** Fill `{company}` in a deck's question and hint text with the base company's
 *  name (same pattern as projectionsDeck.ts). QualitativeBlock does not
 *  substitute it. */
export function withCompany(groups: QualitativeGroup[], company: string): QualitativeGroup[] {
  const fill = (s: string) => s.split("{company}").join(company);
  return groups.map((g) => ({
    ...g,
    questions: g.questions.map((q) => ({
      ...q,
      text: fill(q.text),
      ...(q.hint != null ? { hint: fill(q.hint) } : {}),
    })),
  }));
}

/** "Check my reasons": the question sent with the reader's own saved answer.
 *  It points out reasons that are only numbers; it never grades. */
export function reasonsCheckQuestion(question: string, answer: string): string {
  return (
    "Read the reader's answer below to this Head to Head question. Point out any reason that is only another number, " +
    "forecast or guidance figure rather than something about customers, products, competitors, management or the " +
    "industry, and for each one suggest the business reason the reader could look for instead. Do not grade the " +
    `answer or say whether it is right. Question: ${question}. Answer: ${answer}`
  );
}

/** One firm's figures, base company first. All ratios are decimals; a null is
 *  a missing input or a denominator at or below zero. */
export interface HeadToHeadFirm {
  ticker: string;
  name?: string | null;
  reportedCurrency?: string | null;
  netMargin?: number | null;
  assetTurnover?: number | null;
  equityMultiplier?: number | null;
  roe?: number | null;
  returnOnCapital?: number | null;
  cogsAndSgaToRevenue?: number | null;
  cashToAssets?: number | null;
  debtToEquity?: number | null;
  cashMonthsOfOpCosts?: number | null;
  capexToDepreciation?: number | null;
  fcfToRevenue?: number | null;
  sustainableGrowth?: number | null;
  revenueUsd?: number | null;
  /** The firm's own fiscal year and industry for its figures. */
  fiscalYear?: number | null;
  industry?: string | null;
  /** True for a rival accepted from the base company's relationship map. */
  fromRelationshipMap?: boolean;
}

export interface GroupShares {
  years: number[];
  rows: { ticker: string; shares: (number | null)[] }[];
  complete: boolean[];
  basis: string;
}

export interface HeadToHeadPayload {
  applicable: boolean;
  reason?: string;
  ticker?: string;
  fiscalYear?: number | null;
  dataNote?: string | null;
  groupRivals?: { ticker: string; groupLabel?: string | null }[] | null;
  capabilities?: HeadToHeadFirm[];
  groupShares?: GroupShares | null;
  /** True when any rival came from the relationship map. */
  crossIndustry?: boolean;
}

/** How a figure is printed: a percent (gap in percentage points), a multiple
 *  (gap in x), or months (gap in months). */
export type FigureKind = "pct" | "times" | "months";

export type FigureKey =
  | "roe"
  | "netMargin"
  | "assetTurnover"
  | "equityMultiplier"
  | "returnOnCapital"
  | "cogsAndSgaToRevenue"
  | "cashToAssets"
  | "debtToEquity"
  | "cashMonthsOfOpCosts"
  | "capexToDepreciation"
  | "fcfToRevenue"
  | "sustainableGrowth";

export interface FigureRow {
  key: FigureKey;
  label: string;
  kind: FigureKind;
}

/** Table order. The first four are the ROE rows the teaching line sits under. */
export const HEAD_TO_HEAD_ROWS: FigureRow[] = [
  { key: "roe", label: "Return on equity (ROE)", kind: "pct" },
  { key: "netMargin", label: "Net margin", kind: "pct" },
  { key: "assetTurnover", label: "Asset turnover", kind: "times" },
  { key: "equityMultiplier", label: "Equity multiplier", kind: "times" },
  { key: "returnOnCapital", label: "Return on capital", kind: "pct" },
  { key: "cogsAndSgaToRevenue", label: "Costs (COGS + selling) as share of sales", kind: "pct" },
  { key: "cashToAssets", label: "Cash to assets", kind: "pct" },
  { key: "debtToEquity", label: "Debt to equity", kind: "times" },
  { key: "cashMonthsOfOpCosts", label: "Months of costs covered by cash", kind: "months" },
  { key: "capexToDepreciation", label: "Spending vs depreciation", kind: "times" },
  { key: "fcfToRevenue", label: "FCF to revenue", kind: "pct" },
  { key: "sustainableGrowth", label: "Sustainable growth", kind: "pct" },
];

export const ROE_ROW_COUNT = 4;

/** Owner's worked example, word for word. */
export const ROE_TEACHING =
  "Company A earns 20% as a 10% profit margin × 1.0 sales per dollar of assets × 2.0 assets per dollar of equity. Company B also earns 20%, but as a 5% margin × 2.0 × 2.0. The result is the same, but it is earned two different ways, and each way breaks differently.";

export const NOT_COMPARABLE = "not comparable, a firm has no data that year";

const isNum = (v: number | null | undefined): v is number =>
  v != null && Number.isFinite(v);

/** Rival figure minus base figure, or null when either is missing. */
export function gapToBase(
  rival: number | null | undefined,
  base: number | null | undefined,
): number | null {
  return isNum(rival) && isNum(base) ? rival - base : null;
}

/** A figure as the table prints it. */
export function formatFigure(v: number | null | undefined, kind: FigureKind): string {
  if (!isNum(v)) return "not available";
  if (kind === "pct") return `${pctFromFraction(v)}%`;
  if (kind === "times") return `${times(v, 2)}x`;
  return `${times(v, 1)} months`;
}

function signed(text: string, v: number): string {
  return v > 0 && !/^0(\.0*)?$/.test(text) ? `+${text}` : text;
}

/** A gap as the table prints it: percentage points for percents, x for
 *  multiples, months for months. */
export function formatGap(gap: number | null, kind: FigureKind): string {
  if (gap == null) return "not available";
  if (kind === "pct") return `${signed(pctFromFraction(gap), gap)} pts`;
  if (kind === "times") return `${signed(times(gap, 2), gap)}x`;
  return `${signed(times(gap, 1), gap)} months`;
}

/** The three ROE factors side by side, "10.0% × 1.00 × 2.00", or null when any
 *  factor is missing. Display only: the product is not checked against ROE. */
export function roeBreakdown(firm: HeadToHeadFirm): string | null {
  const { netMargin, assetTurnover, equityMultiplier } = firm;
  if (!isNum(netMargin) || !isNum(assetTurnover) || !isNum(equityMultiplier)) return null;
  return `${pctFromFraction(netMargin)}% × ${times(assetTurnover, 2)} × ${times(equityMultiplier, 2)}`;
}

/** The first `n` tickers of the base company's strategic group, used as the
 *  default rivals. */
export function defaultRivals(payload: HeadToHeadPayload | null | undefined, n = 3): string[] {
  if (!payload || payload.applicable === false) return [];
  const base = (payload.ticker ?? "").toUpperCase();
  const out: string[] = [];
  for (const r of payload.groupRivals ?? []) {
    const t = r?.ticker?.toUpperCase();
    if (t && t !== base && !out.includes(t)) out.push(t);
    if (out.length >= n) break;
  }
  return out;
}

/** Each firm's share for one year column, aligned to `tickers`, or null for the
 *  whole year when the backend marked it incomplete. */
export function sharesForYear(
  gs: GroupShares,
  yearIndex: number,
  tickers: string[],
): (number | null)[] | null {
  if (!gs.complete[yearIndex]) return null;
  return tickers.map((t) => {
    const row = gs.rows.find((r) => r.ticker.toUpperCase() === t.toUpperCase());
    const v = row?.shares[yearIndex];
    return isNum(v) ? v : null;
  });
}
