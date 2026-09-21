// Types for the cross-stage AI data block.
//
// Everything here is a description of a payload the app already fetches, or of
// the arguments a serializer takes. No figure is computed in this file.
//
// Three payload blocks that `/api/individual/{ticker}` returns are not declared
// in lib/types.ts (businessProfile, costStructure, genericStrategy), so the
// minimum each serializer reads is declared here, with the unit of every field
// taken from backend/company_profile/UNITS.md.

import type { ConnectionsData, SectorBlock } from "../connectionsTypes";
import type { GroupMapData, ProfitPoolData, ValueSystemData } from "../groupMapApi";
import type { IndustryStructure } from "../industryStructureApi";
import type { SectionData, SectorMetricsData } from "../types";

/** The reader's stage, which decides how far down the block reaches. */
export type StageKind = "credit" | "sector" | "industry" | "comparative" | "company";

/** What the block is about. A page knows more than the route does, so every
 *  field it can supply saves a resolving round trip. */
export interface StageSubject {
  sector?: string;
  industry?: string;
  ticker?: string;
}

/**
 * The automatic reading of each economic and credit metric, keyed by its
 * definition number. Part 5 of the owner's plan builds this from the numbers;
 * until it lands the caller passes nothing and no reading is printed. The
 * reader's own saved picks live in Convex, which is not reachable outside
 * React, so a caller that has them may pass them here instead.
 */
export interface StageReadings {
  economic?: Record<number, string>;
  credit?: Record<number, string>;
}

/** The reader's saved value-system picks, when the caller has them. */
export interface ValueSystemPicks {
  supplier?: string;
  buyer?: string;
}

export interface StageContextOptions {
  /** Part 5's automatic reading per definition number, once it ships. */
  automaticReadings?: StageReadings;
  /** Supplier and buyer industries for the value system, when picked. */
  valueSystemPicks?: ValueSystemPicks;
  /** Appended word for word under READER'S EARLIER CONCLUSIONS. */
  readerNotes?: string;
  /** Injectable clock for the direction reader, so a fixture reads the same on
   *  every run. Production leaves it out. */
  now?: Date;
  /** The gatherer's own signal. When the reader navigates away or the gather
   *  gives up, every request it started stops. */
  signal?: AbortSignal;
}

/** A source that either loaded or did not. A failure carries the words the
 *  block prints after "Not loaded: ". */
export type Source<T> = { ok: true; value: T } | { ok: false; what: string };

export function loaded<T>(value: T): Source<T> {
  return { ok: true, value };
}

export function notLoaded<T>(what: string): Source<T> {
  return { ok: false, what };
}

/** The subject after the missing names have been resolved from the backend. */
export interface ResolvedSubject {
  stage: StageKind;
  sector: string | null;
  industry: string | null;
  ticker: string | null;
  companyName: string | null;
}

// ── /api/individual/{ticker}/rivals ────────────────────────────────────────

export interface GroupRival {
  ticker: string;
  name?: string | null;
  /** USD, an amount, so it is FX converted. */
  revenueUsd?: number | null;
  /** Fraction of the peer set's total USD revenue. */
  revenueShare?: number | null;
  groupLabel?: string | null;
}

export interface RivalsData {
  applicable?: boolean;
  reason?: string;
  ticker?: string;
  industry?: string;
  sector?: string;
  fiscalYear?: number | null;
  peerCount?: number | null;
  groupFirmCount?: number | null;
  groupRivals?: GroupRival[] | null;
}

// ── /api/individual/{ticker}/spreads ───────────────────────────────────────
// Every value is in DISPLAY units: a percent arrives already multiplied by a
// hundred, and a gap is the company minus that benchmark in the same unit.

export interface SpreadMetric {
  label: string;
  /** "%" for a display percent, "x" for a ratio. */
  unit: string;
  company?: number | null;
  industryMedian?: number | null;
  groupMedian?: number | null;
  industryWeighted?: number | null;
  sectorWeighted?: number | null;
  gapIndustry?: number | null;
  gapGroup?: number | null;
  gapSector?: number | null;
  /** Direction free, by the size of the figure, as everywhere else. */
  rank?: number | null;
  count?: number | null;
}

export interface SpreadsData {
  applicable?: boolean;
  reason?: string;
  ticker?: string;
  industry?: string;
  sector?: string;
  metrics?: Record<string, SpreadMetric>;
  groupLabel?: string | null;
  groupFirmCount?: number | null;
  peerCount?: number | null;
  fiscalYear?: number | null;
  dataNote?: string | null;
  unitsNote?: string | null;
}

// The market quote is no longer fetched on its own. /api/individual carries
// `analysis.priceComparison`, which states both currencies, the deposit ratio
// when one is on file, and a reason when the quote and the model's
// per-ordinary-share value cannot be compared at all. One payload, one answer:
// the currency and the figures it describes can no longer disagree because one
// of the two requests failed.

// ── Company profile blocks (decimal units, per company_profile/UNITS.md) ────

export interface BusinessSegment {
  name: string;
  /** Reporting currency, as filed. */
  revenue?: number | null;
  /** Fraction of the sum of positive segment revenues. */
  share?: number | null;
  fiscalYear?: number | null;
}

export interface BusinessProfile {
  applicable?: boolean;
  reason?: string;
  summary?: string | null;
  website?: string | null;
  country?: string | null;
  employees?: number | null;
  segments?: BusinessSegment[] | null;
}

/** Every line is a FRACTION of revenue. */
export interface CostStructureLines {
  cogsToRevenue?: number | null;
  sgaToRevenue?: number | null;
  rdToRevenue?: number | null;
  daToRevenue?: number | null;
  operatingMargin?: number | null;
}

export interface CostStructure {
  applicable?: boolean;
  reason?: string;
  company?: CostStructureLines | null;
  group?: CostStructureLines | null;
  /** Company minus group, in points. */
  differences?: CostStructureLines | null;
  groupLabel?: string | null;
  groupBasis?: string | null;
  groupFirmCount?: number | null;
  peerCount?: number | null;
  fiscalYear?: number | null;
  /** The block's own financial-sector guard, keyed `cogsToRevenue`. */
  isFinancial?: boolean;
  notApplicable?: Record<string, string> | null;
}

/** A fraction with its direction-free descending rank in the peer set. */
export interface RankedFraction {
  value?: number | null;
  rank?: number | null;
  count?: number | null;
  companyGrossMargin?: number | null;
  industryMedianGrossMargin?: number | null;
}

export interface GenericStrategy {
  applicable?: boolean;
  reason?: string;
  costOfGoodsPlusSgaToRevenue?: RankedFraction | null;
  grossMarginGap?: RankedFraction | null;
  rdToRevenue?: RankedFraction | null;
  sgaToRevenue?: RankedFraction | null;
  revenueShare?: RankedFraction | null;
  segmentCount?: number | null;
  peerCount?: number | null;
  fiscalYear?: number | null;
  /** The block's own financial-sector guard, keyed `costOfGoodsPlusSgaToRevenue`
   *  and `grossMarginGap`. */
  isFinancial?: boolean;
  notApplicable?: Record<string, string> | null;
}

/**
 * What the connections company block says must not be read for this company.
 *
 * `/api/individual` carries no guard map of its own, so its credit and cost
 * blocks happily compute a synthetic rating and a cost of goods for a bank.
 * These two fields travel with the company section so those figures can be
 * suppressed rather than printed beside the sentence that contradicts them.
 */
export interface CompanyGuards {
  /** The backend's `{field: reason}` map, exactly as it wrote it. */
  notApplicable: Record<string, string> | null;
  isFinancial: boolean;
}

/** The three blocks above, read off `SectionData.analysis` where lib/types.ts
 *  does not declare them. */
export interface CompanyProfileExtras {
  businessProfile?: BusinessProfile | null;
  costStructure?: CostStructure | null;
  genericStrategy?: GenericStrategy | null;
}

// ── One sector's financing figures, for the Credit stage ───────────────────

export interface SectorFinancing {
  sector: string;
  block: SectorBlock;
}

// ── Everything a stage block is built from ─────────────────────────────────

export interface StageBundle {
  subject: ResolvedSubject;
  options: StageContextOptions;

  economic: Source<SectionData>;
  credit: Source<SectionData>;

  /** Credit stage only: the eleven sectors that answered. */
  sectorFinancing: SectorFinancing[];

  sectorMatrix: Source<SectorMetricsData>;
  sectorDetail: Source<SectionData>;
  sectorConnections: Source<ConnectionsData>;
  profitPool: Source<ProfitPoolData>;

  industryMatrix: Source<SectorMetricsData>;
  industryDetail: Source<SectionData>;
  industryScorecard: Source<SectorMetricsData>;
  structure: Source<IndustryStructure>;
  groupMap: Source<GroupMapData>;
  valueSystem: Source<ValueSystemData>;

  ranking: Source<SectorMetricsData>;
  industryConnections: Source<ConnectionsData>;

  individual: Source<SectionData>;
  rivals: Source<RivalsData>;
  /** The company against its industry and group medians, in display units. */
  spreads: Source<SpreadsData>;
  companyConnections: Source<ConnectionsData>;
}

/** Which economies of the block have been given up to fit the size cap. The
 *  order of the fields is the order they are applied in. */
export interface DropLevel {
  /** Evolution series reduced to their first and last values. */
  evolutionEnds: boolean;
  /** Matrix rows whose value is null for the subject's own column. */
  nullMatrixRows: boolean;
  /**
   * The similarly-structured-companies list kept to the subject's nearest
   * rivals, the largest by revenue.
   *
   * It is a rung rather than a permanent cap because on a block that fits,
   * every firm in the group is worth having: the deck asks which companies are
   * structured like this one. On a block that does not, 169 rows of a company
   * with a tenth of a percent of the peer set's revenue are the cheapest
   * ten kilobytes in it.
   */
  rivalsNearest: boolean;
  /**
   * How many of the highest ranked companies the peer ranking keeps, beside
   * the subject, its strategic group and the ten largest by market cap. `null`
   * prints every company in the industry.
   *
   * It is a number rather than a flag because one limit does not suit every
   * industry. Measured on the payloads captured on 2026-09-20, the Comparative
   * stage fits twenty five for Semiconductors and for Auto Manufacturers but
   * only twenty for Banks, and no single value above ten fits every industry,
   * so the cap is met by stepping down a rung at a time rather than by going
   * straight to the smallest set that always works.
   */
  rankingTopRanked: number | null;
  /** Earnings links for metrics that leave this sector unaffected throughout. */
  unaffectedEarningsLinks: boolean;
}

export const NO_DROPS: DropLevel = {
  evolutionEnds: false,
  nullMatrixRows: false,
  rivalsNearest: false,
  rankingTopRanked: null,
  unaffectedEarningsLinks: false,
};
