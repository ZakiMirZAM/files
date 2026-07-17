/**
 * Types for the Returns Quality section (backend/returns_quality.py).
 *
 * Kept in their own file rather than in `lib/types.ts` so the section is
 * self-contained. The wiring in `types.ts` re-exports from here; nothing in this
 * section depends on any other section's types.
 *
 * All rates are DECIMALS (0.52 = 52%), matching the backend. Gaps are decimal
 * differences and render as percentage points.
 */

/** A block that did not apply to this company, with the reason to show instead. */
export interface NotApplicable {
  applicable: false;
  reason: string;
}

/** Current value against the mean and median of its own five-year window. */
export interface HistoryComparison {
  current: number;
  avg5: number | null;
  median5: number | null;
  gap: number | null;
  isDeparture: boolean;
  yearsUsed: number;
  series: Record<string, number>;
}

export interface RoeHistory extends HistoryComparison {
  applicable: true;
  latestYear: number;
  leverage: Record<string, number>;
  leverageCurrent: number | null;
}

export interface RoicAttributionComponent {
  current: number;
  avg5: number | null;
}

export interface RoicAttribution {
  marginEffect: number;
  taxEffect: number;
  turnoverEffect: number;
  total: number;
  productNow: number;
  productAvg: number;
  reportedRoic: number;
  /** False when the headline and the components rest on different bases. */
  reconciles: boolean;
  reconcileNote: string | null;
  components: {
    operatingMargin: RoicAttributionComponent;
    retentionAfterTax: RoicAttributionComponent;
    capitalTurnover: RoicAttributionComponent;
  };
}

export interface RoicHistory extends HistoryComparison {
  applicable: true;
  latestYear: number;
  attribution: RoicAttribution | null;
}

export interface RoicIndustrySide {
  roic: number | null;
  wacc: number | null;
  spread: number | null;
  roe: number | null;
}

export interface RoicIndustry {
  applicable: true;
  latestYear: number;
  industryName: string | null;
  universe: string | null;
  company: RoicIndustrySide;
  industry: RoicIndustrySide;
  roicGap: number | null;
  spreadGap: number | null;
  roeGap: number | null;
  /** Set when the ROE gap dwarfs the ROIC gap, which is leverage not advantage. */
  leverageTell: string | null;
  benchmarkCaveat: string;
}

export interface GrowthComparison {
  applicable: true;
  latestYear: number;
  /** Reinvestment rate x ROIC on the current year. Never floored. */
  expectedCurrent: number;
  /** The same expression on five-year averages. A comparison, not a fallback. */
  expectedFiveYearAverage: number | null;
  actual: number | null;
  divergence: number | null;
  inputs: {
    reinvestmentCurrent: number;
    reinvestmentFiveYearAverage: number | null;
    roicCurrent: number;
    roicFiveYearAverage: number | null;
  };
  equityLens: {
    retention: number | null;
    roe: number | null;
    expected: number | null;
  };
  reinvestmentRequiredForActual: number | null;
  note: string;
}

export interface ReinvestmentHistory extends HistoryComparison {
  applicable: true;
  latestYear: number;
  capexToDepreciation: Record<string, number>;
  capexToDepreciationCurrent: number | null;
  isConsumingAssetBase: boolean;
  isBelowRenewal: boolean;
  salesToInvestedCapital: number | null;
  industrySalesToInvestedCapital: number | null;
  industryReinvestmentRate: number | null;
  benchmarkNote: string | null;
}

export interface ReturnsQuality {
  applicable: true;
  window: number;
  roeHistory: RoeHistory | NotApplicable;
  roicHistory: RoicHistory | NotApplicable;
  roicIndustry: RoicIndustry | NotApplicable;
  growth: GrowthComparison | NotApplicable;
  reinvestment: ReinvestmentHistory | NotApplicable;
}

/** Narrows a block to its applicable form. */
export function isApplicable<T extends { applicable: boolean }>(
  block: T | NotApplicable | null | undefined,
): block is T {
  return !!block && block.applicable === true;
}
