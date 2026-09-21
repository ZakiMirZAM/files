// Data layer for GET /api/industry/{industry}/structure
// Types mirror the live JSON payload; unit comments per UNITS.md.
//
// Every field the backend added after the first cut is optional here, so the
// page renders the same before and after that change lands.

import { API_BASE, EndpointError, getJson, useResource, SLOW_ROUTE_TIMEOUT_MS } from "./useResource";
import type { ResourceResult } from "./useResource";

export type { FetchState } from "./useResource";

/** What a failure of this endpoint is called in the sentence a reader sees. */
const WHAT = "industry structure figures";

// ── Scalar wrapper ─────────────────────────────────────────────────────────
/** Most scalars arrive as { value, percentile }. Percentile is null when fewer
 *  than 10 industries are available for ranking. */
export interface ScalarWithPercentile {
  /** The raw figure. Unit depends on the field (see comments below). */
  value: number;
  /** Fraction 0..1 among industries, or null. */
  percentile: number | null;
}

// ── Top-10 company ─────────────────────────────────────────────────────────
export interface Top10Company {
  rank: number;
  ticker: string;
  name: string;
  /** Revenue in USD. */
  revenueUsd: number;
  /** Fraction of total industry revenue. */
  share: number;
  /** Revenue / leader's revenue (leader = 1.0). */
  relativeShare: number;
}

// ── Concentration ──────────────────────────────────────────────────────────
export interface Concentration {
  firmCount: number;
  /** Fraction 0..1. */
  cr4: ScalarWithPercentile;
  /** Fraction 0..1. */
  cr8: ScalarWithPercentile;
  /** Points on a 0..10,000 scale. NOT a fraction. */
  hhi: ScalarWithPercentile;
  /** The ten largest companies by USD revenue. */
  top10: Top10Company[];
  /** Percentage points. NOT a fraction. A value of 2.5 means 2.5 pp. */
  top5ShareChange5y?: number;
  /** Count of second listings of the same company folded out of the peer set. */
  duplicateListingsDropped?: number;
}

// ── Entry evidence ─────────────────────────────────────────────────────────

/** One leader's cost of goods as a share of revenue, year by year. */
export interface LeaderCogsSeries {
  ticker: string;
  name: string;
  /** Fraction: COGS / Revenue, in the company's own currency. */
  years: Array<{ year: number; value: number }>;
}

export interface EntryEvidence {
  /** Fraction: PP&E / Revenue. */
  ppeToRevenue: ScalarWithPercentile;
  /** Fraction: |capex| / Revenue. */
  capexToRevenue: ScalarWithPercentile;
  /** Fraction: R&D / Revenue. */
  rdToRevenue: ScalarWithPercentile;
  /** Fraction: SG&A / Revenue. */
  sgaToRevenue: ScalarWithPercentile;
  /** Fraction: OLS slope of operating margin on ln(USD revenue). */
  scaleSlope: number;
  /** Fraction 0..1: R-squared of the scale regression. */
  scaleR2: number;
  /** Count: firms used in the regression. */
  scaleFirms: number;
  /** Fraction: median gross margin. */
  grossMarginMedian: ScalarWithPercentile;
  /** Fraction: Q3 minus Q1 of gross margin. */
  grossMarginIqr: number;
  /** Fraction: incumbents' median cash / total assets. */
  incumbentCashToAssets: ScalarWithPercentile;
  /** Signed count: entries minus exits over 5 years. */
  netEntry5y: number;
  /** [from, to] fiscal years the net entry figure covers. */
  netEntryWindow?: [number, number];
  /** The four largest firms' COGS-to-revenue series. */
  leaderCogsToRevenue5y?: LeaderCogsSeries[];
}

// ── Exit evidence ──────────────────────────────────────────────────────────
export interface ExitEvidence {
  /** Fraction: PP&E / Total Assets. */
  ppeToAssets: ScalarWithPercentile;
  /** Fraction: Intangibles / Total Assets. */
  intangiblesToAssets: ScalarWithPercentile;
  /** Fraction 0..1: share of firms where |capex| < depreciation. */
  shareOfFirmsWithCapexBelowDepreciation: number;
}

// ── Rivalry evidence ───────────────────────────────────────────────────────
export interface RivalryEvidence {
  /** Fraction: LOG-annual growth rate. Compound = exp(x) - 1. */
  revenueCagr5y: ScalarWithPercentile;
  /** Fraction: D&A / Revenue. */
  daToRevenue: ScalarWithPercentile;
  /** Fraction: coefficient of variation of top-10 USD revenues. */
  revenueSpreadAmongTop10: number;
}

// ── Share stability ────────────────────────────────────────────────────────
export interface ShareStability {
  /** Percentage points. NOT a fraction. */
  top5ShareChange5y: number;
  /** Fraction: Spearman rho, -1 to 1. */
  shareRankCorrelation5y: number;
}

// ── Evolution time series ──────────────────────────────────────────────────
/** One point in an evolution series. `value` is null in a year the series
 *  cannot be computed, which the live payload does emit. */
export interface YearValue {
  year: number;
  value: number | null;
}

export interface EvolutionSeries {
  /** USD: total industry revenue. */
  revenue: YearValue[];
  /** Fraction: YoY revenue growth. An ordinary fraction, NOT a log rate. */
  growth: YearValue[];
  /** Count: companies. */
  firmCount: YearValue[];
  /** Signed count per year. */
  netEntry: YearValue[];
  /** [from, to] fiscal years the net entry series covers. */
  netEntryWindow?: [number, number];
  /** How the backend decides a listing has exited. Nothing renders it; it is
   *  declared so the fixtures type-check against the real payload. */
  netEntryRule?: string;
  /** Points 0..10,000. */
  hhi: YearValue[];
  /** Fraction: IQR of gross margin. */
  grossMarginSpread: YearValue[];
  /** Fraction: IQR of R&D/Revenue. */
  rdIntensitySpread: YearValue[];
  /** Times (ratio). > 1 = investing above replacement. */
  capexToDepreciation: YearValue[];
  /** Times (ratio). Higher = more asset-light. */
  revenueOverPpe: YearValue[];
}

// ── Environment indicators ─────────────────────────────────────────────────
export interface EnvironmentIndicators {
  /** Points 0..10,000. */
  hhi: number | null;
  /** Fraction. */
  cr4: number | null;
  /** Fraction. */
  scaleSlope: number | null;
  /** Fraction. */
  scaleR2: number | null;
  /** Fraction: LOG-annual. */
  revenueCagr5y: number | null;
  /** Years: median of (last_yr - first_yr). */
  medianYearsOfHistory: number | null;
  /** Fraction: LOG-annual, years -10 to -5. */
  growthFirst5y: number | null;
  /** Fraction: LOG-annual, years -5 to now. */
  growthLast5y: number | null;
  /** Times (ratio). */
  capexToDepreciation: number | null;
  /** Fraction, or null when no CPI series is available. */
  inflationAdjusted5yRevenueChange: number | null;
  /** Signed count. */
  netEntry5y: number | null;
  /** Count of countries among the ten largest companies, or null. */
  countries: number | null;
}

// ── Full payload ───────────────────────────────────────────────────────────
export interface IndustryStructure {
  /** False when the industry has no company financial rows at all. */
  applicable?: boolean;
  /** Why the figures are unavailable, when applicable is false. */
  reason?: string | null;
  industry: string;
  fiscalYear: number;
  firmCount: number;
  /** [from, to] fiscal years the net entry figure covers. */
  netEntryWindow?: [number, number];
  /** Second listings of a company already counted, folded out of the peer set. */
  duplicateListingsDropped?: number;
  concentration: Concentration;
  entryEvidence: EntryEvidence;
  exitEvidence: ExitEvidence;
  rivalryEvidence: RivalryEvidence;
  shareStability: ShareStability;
  evolution: EvolutionSeries;
  environmentIndicators: EnvironmentIndicators;
  /** True for banks, insurers, and other financial companies, where several
   *  industrial ratios have no meaning. */
  isFinancial?: boolean;
  /** Field name to the reason that field does not apply to this industry. */
  notApplicable?: Record<string, string>;
  /** Share of the peer set with data behind these figures. */
  coverage?: number;
}

/** The shape the endpoint returns when it has no peer data at all. */
interface StructureErrorBody {
  error: string;
  industry?: string;
}

export type StructureResult = ResourceResult<IndustryStructure>;

// ── Fetch ────────────────────────────────────────────────────────────────

/** Fetch the structure payload for an industry. Rejects on failure. */
export async function fetchIndustryStructure(
  industry: string,
  signal?: AbortSignal,
): Promise<IndustryStructure> {
  const url = `${API_BASE}/api/industry/${encodeURIComponent(industry)}/structure`;
  const body = await getJson<IndustryStructure | StructureErrorBody>(url, WHAT, signal);
  if ("error" in body && typeof body.error === "string") {
    throw new EndpointError(
      "This industry has no company financial rows on file, so its structure figures cannot be built.",
      200,
    );
  }
  return body as IndustryStructure;
}

// ── Hook ─────────────────────────────────────────────────────────────────

/** The cache key this endpoint is shared under. Namespaced like every other
 *  key in the shared cache: the bare industry name sat in the same map as
 *  "economic" and "sector-metrics" and named no endpoint at all.
 *  lib/stageContext/sources.ts KEYS.structure must build the same string. */
export function structureCacheKey(industry: string): string {
  return `structure|${industry}`;
}

/** The structure payload for one industry, shared with every other caller. */
export function useIndustryStructure(industry: string | undefined): StructureResult {
  return useResource<IndustryStructure>(
    industry ? structureCacheKey(industry) : null,
    (signal) => fetchIndustryStructure(industry as string, signal),
    { what: WHAT, timeoutMs: SLOW_ROUTE_TIMEOUT_MS },
  );
}
