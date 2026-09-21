// Data layer for three industry-structure endpoints:
//   GET /api/industry/{industry}/group-map
//   GET /api/industry/{industry}/value-system
//   GET /api/sector/{sector}/profit-pool
// Types mirror the live JSON payloads; unit comments per UNITS.md.
// Conventions follow industryStructureApi.ts (API_BASE, fetch pattern, hooks).
//
// Fields the backend added after the first cut are optional here, so the page
// renders the same before and after that change lands.

import type { IndustryEntry } from "./types";
import { fetchIndustries } from "./api";
import { API_BASE, getJson, useResource, SLOW_ROUTE_TIMEOUT_MS } from "./useResource";
import type { ResourceResult } from "./useResource";

// ── Group map ────────────────────────────────────────────────────────────

/** One firm plotted on the strategic-group map. */
export interface GroupMapFirm {
  ticker: string;
  name: string;
  /** Fraction: active x-axis value (meaning varies by xKey). */
  x: number;
  /** Fraction: active y-axis value (meaning varies by yKey). */
  y: number;
  /** Fraction, or null if no data 5 years ago. */
  xFiveYearsAgo: number | null;
  /** Fraction, or null if no data 5 years ago. */
  yFiveYearsAgo: number | null;
  /** Quadrant label, or null if missing axis data. */
  group: string | null;
  /** Fraction of industry revenue. */
  revenueShare: number;
  /** Fraction: pre-tax Operating Income / (Equity + Debt). NOT the
   *  after-tax ROIC used on individual company pages. */
  preTaxRoic: number;
}

/** One strategic-group summary. Groups are computed over the WHOLE industry
 *  even though only the largest firms are plotted, so these figures describe
 *  every company in the group. */
export interface GroupMapGroup {
  /** e.g. "High R&D intensity, low value-added share". */
  label: string;
  /** Fraction: combined revenue share of firms in this group. */
  combinedShare: number;
  /** Fraction: pre-tax. */
  medianPreTaxRoic: number | null;
  /** [min, max] fractions, pre-tax. */
  preTaxRoicRange: [number, number] | null;
  firmCount: number;
}

/** One available axis definition for the group map. */
export interface GroupMapAxis {
  key: string;
  label: string;
  meaning: string;
  /** Fraction 0..1 of peers with this dimension on file, when the backend
   *  reports it. An axis with no coverage is not offered. */
  coverage?: number | null;
}

/** One point on the share-vs-return scatter. */
export interface ShareReturnPoint {
  ticker: string;
  /** Fraction of industry revenue. */
  revenueShare: number;
  /** Fraction, pre-tax. Null for a company with no usable return on file. */
  preTaxRoic: number | null;
}

/** Quadratic fit y = ax^2 + bx + c over the share-return points. The fit is
 *  solved in the same x units the points carry (revenue share as a fraction),
 *  so it must be evaluated on fractions, never on percentages. */
export interface ShareReturnFit {
  /** [a, b, c] coefficients, highest power first. */
  coefficients: [number, number, number];
  /** Fraction 0..1: R-squared, or null when the points carry no variation. */
  r2: number | null;
  /** Count of points used in the fit. */
  n: number;
}

/** Revenue-share vs return-on-capital curve for an industry. */
export interface ShareReturn {
  /** False when the industry has too few companies to draw the curve. */
  applicable?: boolean;
  /** Why the curve is unavailable, when applicable is false. */
  reason?: string;
  industry?: string;
  fiscalYear?: number;
  points: ShareReturnPoint[];
  fit: ShareReturnFit | null;
  /** Fraction, pre-tax, or null if too few points. */
  topQuarterMedianPreTaxRoic: number | null;
  /** Fraction, pre-tax, or null if too few points. */
  restMedianPreTaxRoic: number | null;
}

/** Full payload for GET /api/industry/{industry}/group-map. */
export interface GroupMapData {
  applicable: boolean;
  /** Why the map is unavailable, when applicable is false. */
  reason?: string;
  industry: string;
  /** Year. */
  fiscalYear: number;
  firms: GroupMapFirm[];
  groups: GroupMapGroup[];
  axes: GroupMapAxis[];
  defaultAxes: { x: string; y: string };
  /** Active x axis key. */
  xKey: string;
  /** Active y axis key. */
  yKey: string;
  /** Pearson r, -1 to 1. */
  axisCorrelation: number | null;
  /** Count. */
  limit: number;
  /** Count of companies actually drawn on the map. */
  plotted?: number;
  /** Count: total peers in the industry, before the plotting limit. */
  available: number;
  /** Count of second listings of the same company folded out of the peer set. */
  duplicateListingsDropped?: number;
  /** The distinct quadrant labels, interned. `groupByTicker` indexes this. */
  groupLabels?: string[];
  /** FULL membership: uppercase ticker to an index into `groupLabels`, for
   *  every firm the median split ran over, not only the `limit` firms in
   *  `firms[]`. A firm outside the split (a missing axis value) is absent, so
   *  absence still means "not in a group" rather than "not on the chart". */
  groupByTicker?: Record<string, number>;
  limitOptions?: number[];
  shareReturn: ShareReturn | null;
}

// ── Value system ─────────────────────────────────────────────────────────

/** One year's value for a days-outstanding series. */
export interface DaysYearValue {
  year: number;
  /** Days (DPO or DSO median). */
  value: number;
}

/** Structural summary for one industry within the value system. */
export interface ValueSystemIndustry {
  industry: string;
  /** False when this industry has no company financial rows at all. */
  applicable?: boolean;
  /** Why the figures are unavailable, when applicable is false. */
  reason?: string | null;
  /** Count of second listings of the same company folded out of the peer set. */
  duplicateListingsDropped?: number;
  /** Points 0..10,000. NOT a fraction. */
  hhi: number | null;
  /** Points 0..10,000. NOT a fraction. */
  hhiFiveYearsAgo: number | null;
  /** Fraction. */
  medianOperatingMargin: number | null;
  /** Fraction: LOG-annual growth rate. Compound = exp(x) - 1. */
  revenueCagr5y: number | null;
  /** Count of companies behind these figures. */
  firmCount?: number | null;
  /** The fiscal year the figures come from. */
  fiscalYear?: number | null;
  /** True when so few companies report that the medians rest on a handful. */
  thinPeerSet?: boolean;
  /** Days: median Days Payable Outstanding, by year. May be absent for non-focal industries. */
  daysPayableByYear?: DaysYearValue[];
  /** Days: median Days Sales Outstanding, by year. May be absent for non-focal industries. */
  daysReceivableByYear?: DaysYearValue[];
}

/** Full payload for GET /api/industry/{industry}/value-system. */
export interface ValueSystemData {
  focal: ValueSystemIndustry;
  supplier: ValueSystemIndustry | null;
  buyer: ValueSystemIndustry | null;
}

// ── Profit pool ──────────────────────────────────────────────────────────

/** One industry's slice of a sector's revenue/profit pool. */
export interface ProfitPoolIndustry {
  industry: string;
  /** Count of companies behind this industry's figures. */
  firmCount?: number;
  /** USD. */
  revenueUsd: number;
  /** Fraction: sums to 1.0 across the sector. */
  revenueShare: number;
  /** Fraction: operating profit / revenue. */
  operatingMargin: number;
  /** USD. */
  operatingProfitUsd: number;
  /** Fraction: sums to 1.0 when sector profit > 0. Null when negative. */
  profitShare: number | null;
  /** Fraction, or null. */
  profitShareFiveYearsAgo: number | null;
}

/** Full payload for GET /api/sector/{sector}/profit-pool. */
export interface ProfitPoolData {
  /** False when the sector has no industry with both figures on file. */
  applicable?: boolean;
  /** Why the pool is unavailable, when applicable is false. */
  reason?: string | null;
  sector: string;
  /** Year. */
  fiscalYear: number;
  /** The year the "five years ago" shares come from. */
  fiscalYear5yAgo?: number | null;
  /** Fraction of the sector's companies with data behind these figures. */
  coverage?: number | null;
  industries: ProfitPoolIndustry[];
  /** When true, profitShare fields are null across industries. */
  negativeSectorProfit: boolean;
  /** USD. */
  totalRevenueUsd: number;
  /** USD. */
  totalOperatingProfitUsd: number;
  /** Companies with no industry label, dropped from the rollup. */
  nullIndustryRowsDropped?: number | null;          // count
  /** Second listings of a company already counted, folded out of the peer set. */
  duplicateListingsDropped?: number | null;         // count
  /** Companies across the whole sector behind these figures. */
  firmCount?: number | null;                        // count
}

// ── Shared fetch plumbing ────────────────────────────────────────
//
// The request plumbing, the cache and the failure sentences live in
// useResource.ts, shared with every other read-only endpoint. What these three
// hooks own is the URL each one builds and the name it goes by in an error.

/** What a failure of each endpoint is called in the sentence a reader sees. */
export const WHAT = {
  groupMap: "strategic group map",
  valueSystem: "value system figures",
  profitPool: "sector profit pool",
  industries: "industry list",
} as const;

export type EndpointResult<T> = ResourceResult<T>;

// ── Group map: fetch + hook ────────────────────────────────────

/** Fetch the group-map payload for an industry. Rejects on failure. */
export function fetchGroupMap(
  industry: string,
  options?: { x?: string; y?: string; limit?: number; signal?: AbortSignal },
): Promise<GroupMapData> {
  const params = new URLSearchParams();
  if (options?.x) params.set("x", options.x);
  if (options?.y) params.set("y", options.y);
  if (options?.limit != null) params.set("limit", String(options.limit));
  const qs = params.toString();
  const url = `${API_BASE}/api/industry/${encodeURIComponent(industry)}/group-map${qs ? `?${qs}` : ""}`;
  return getJson<GroupMapData>(url, WHAT.groupMap, options?.signal);
}

/** The shared-cache key one industry's group map is loaded under. Called by
 *  `lib/stageContext/sources.ts` KEYS.groupMap rather than spelled again there,
 *  so the Industry page's own fetch and the AI gather are one request. */
export function groupMapCacheKey(
  industry: string,
  x?: string,
  y?: string,
  limit?: number,
): string {
  return `group-map|${industry}|${x ?? ""}|${y ?? ""}|${limit ?? ""}`;
}

/** Group-map hook. Re-fetches when industry, x, y, or limit change. */
export function useGroupMap(
  industry: string | undefined,
  x?: string,
  y?: string,
  limit?: number,
): EndpointResult<GroupMapData> {
  const key = industry ? groupMapCacheKey(industry, x, y, limit) : null;
  return useResource<GroupMapData>(
    key,
    (signal) => fetchGroupMap(industry as string, { x, y, limit, signal }),
    { what: WHAT.groupMap, timeoutMs: SLOW_ROUTE_TIMEOUT_MS },
  );
}

// ── Value system: fetch + hook ────────────────────────────────

/** Fetch the value-system payload for an industry. Rejects on failure. */
export function fetchValueSystem(
  industry: string,
  options?: { supplier?: string; buyer?: string; signal?: AbortSignal },
): Promise<ValueSystemData> {
  const params = new URLSearchParams();
  if (options?.supplier) params.set("supplier", options.supplier);
  if (options?.buyer) params.set("buyer", options.buyer);
  const qs = params.toString();
  const url = `${API_BASE}/api/industry/${encodeURIComponent(industry)}/value-system${qs ? `?${qs}` : ""}`;
  return getJson<ValueSystemData>(url, WHAT.valueSystem, options?.signal);
}

/** The shared-cache key one industry's value system is loaded under. Called by
 *  `lib/stageContext/sources.ts` KEYS.valueSystem, for the same reason
 *  `groupMapCacheKey` is. */
export function valueSystemCacheKey(
  industry: string,
  supplier?: string,
  buyer?: string,
): string {
  return `value-system|${industry}|${supplier ?? ""}|${buyer ?? ""}`;
}

/** Value-system hook. Re-fetches when industry, supplier, or buyer change.
 *  The focal call (no supplier, no buyer) is fired by four separate sections
 *  of the Industry page; they all share one request through the cache key. */
export function useValueSystem(
  industry: string | undefined,
  supplier?: string,
  buyer?: string,
): EndpointResult<ValueSystemData> {
  const key = industry ? valueSystemCacheKey(industry, supplier, buyer) : null;
  return useResource<ValueSystemData>(
    key,
    (signal) => fetchValueSystem(industry as string, { supplier, buyer, signal }),
    { what: WHAT.valueSystem, timeoutMs: SLOW_ROUTE_TIMEOUT_MS },
  );
}

// ── Profit pool: fetch + hook ─────────────────────────────────

/** Fetch the profit-pool payload for a sector. Rejects on failure. */
export function fetchProfitPool(sector: string, signal?: AbortSignal): Promise<ProfitPoolData> {
  const url = `${API_BASE}/api/sector/${encodeURIComponent(sector)}/profit-pool`;
  return getJson<ProfitPoolData>(url, WHAT.profitPool, signal);
}

/** Profit-pool hook. */
export function useProfitPool(sector: string | undefined): EndpointResult<ProfitPoolData> {
  return useResource<ProfitPoolData>(
    sector ? `profit-pool|${sector}` : null,
    (signal) => fetchProfitPool(sector as string, signal),
    { what: WHAT.profitPool, timeoutMs: SLOW_ROUTE_TIMEOUT_MS },
  );
}

// ── Industry list: hook ───────────────────────────────────────

/** The searchable industry list. Two pickers on the Industry page ask for it;
 *  the shared cache turns that into one request. */
export function useIndustries(): EndpointResult<IndustryEntry[]> {
  return useResource<IndustryEntry[]>("industries", () => fetchIndustries(), {
    what: WHAT.industries,
  });
}
