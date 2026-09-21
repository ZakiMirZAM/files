// Types for the GET /api/connections endpoint response.
//
// EVERY field the backend can omit or null is typed nullable here. The live
// payloads for NVDA, JPM, TSM, AAPL, RIVN, BYND, LULU, Semiconductors and
// Energy were diffed against this file: TSM and AAPL carry a null
// interestCoverage and syntheticRating, RIVN carries a null growth block and a
// null revenueChange2020, RIVN and BYND carry a null
// interestPerPointPctOfOperatingIncome, RIVN carries a null gross margin year,
// and the Energy sector carries a null medianInterestCoverage,
// shareCoverageBelow2, firmsWithInterest and medianOperatingMargin with a null
// industry, company and exposures.
//
// UNIT LEGEND:
//   percent-already  = value is already in percent (4.94 = 4.94%)
//   points-already   = value is already in points (0.54 = 0.54 points)
//   fraction         = value is a fraction (0.13 = 13%), multiply by 100 for display
//   log-fraction     = natural-log growth rate per year; compound rate is exp(x) - 1
//   times            = ratio (4.11x), display as-is
//   index            = index value (HHI 403.7), display as-is
//   usd              = US dollars, display as-is or abbreviate
//   local-currency   = the company's reporting currency, NOT dollars
//   count            = integer count

export interface TimestampedValue {
  value: number | null;    // percent-already
  change12m: number | null; // percent-already (signed: positive = up)
  asOf: string | null;
  /** The reading change12m was measured against. */
  priorDate?: string | null;
  priorValue?: number | null; // percent-already
  /** True when the series has not updated inside its freshness window. */
  stale?: boolean | null;
  /** Why the reading is stale, when it is. */
  reason?: string | null;
}

export interface TimestampedSpread {
  value: number | null;    // percent-already
  asOf: string | null;
  change12m?: number | null; // percent-already (signed: positive = up)
  priorDate?: string | null;
  priorValue?: number | null; // percent-already
  stale?: boolean | null;
  reason?: string | null;
}

export interface EconomyBlock {
  tenYearYield: TimestampedValue | null;   // percent-already (4.94 = 4.94%)
  oneYearYield: TimestampedValue | null;   // percent-already
  curveSlope: number | null;               // points-already (0.54 = 0.54 points)
  breakeven10y: TimestampedValue | null;   // percent-already (2.33 = 2.33%)
}

export interface CreditBlock {
  highYieldSpread: TimestampedSpread | null;        // percent-already (2.7 = 2.7%)
  investmentGradeSpread: TimestampedSpread | null;  // percent-already
  baaSpread: TimestampedSpread | null;              // percent-already
}

export interface SectorBlock {
  name: string;
  /** The fiscal year the sector figures come from. */
  fiscalYear?: number | null;                       // year
  /** Share of the peer set with data behind these figures. */
  coverage?: number | null;                         // fraction
  firmCount?: number | null;                        // count
  /** Second listings of a company already counted, folded out of the peer set. */
  duplicateListingsDropped?: number | null;         // count
  /** Companies with no industry label, dropped from the industry rollup. */
  nullIndustryRowsDropped?: number | null;          // count
  medianNetDebtToEbitda?: number | null;            // times
  medianOperatingMargin5yAgo?: number | null;       // fraction
  /** Field name to the reason that field does not apply to this sector. */
  notApplicable?: Record<string, string>;
  /** True for Financial Services, where gross margin and interest coverage do
   *  not mean what they mean elsewhere. Optional until the backend ships it. */
  isFinancial?: boolean | null;
  valueScore: number | null;            // 0-100 score, display as-is
  valueRank: number | null;             // 1-based rank
  sectorCount: number | null;           // count
  medianInterestCoverage: number | null; // times (4.11 = 4.11x)
  shareCoverageBelow2: number | null;    // fraction (0.4243 = 42.43%)
  firmsWithInterest: number | null;      // count
  revenueChange2020: number | null;      // fraction (-0.03 = -3%)
  grossMargin: Record<string, number | null> | null;  // fraction per year
  medianOperatingMargin: number | null;  // fraction (0.0394 = 3.94%)
}

export interface IndustryBlock {
  name: string;
  sector: string;
  isFinancial?: boolean | null;
  fiscalYear: number | null;                       // year
  firmCount: number | null;                        // count
  cr4: number | null;                              // fraction (0.3264 = 32.64%)
  hhi: number | null;                              // index (403.7)
  top5ShareChange5y: number | null;                // points-already (backend * 100)
  revenueCagr5y: number | null;                    // log-fraction per year
  medianInterestCoverage: number | null;           // times
  medianNetDebtToEbitda: number | null;            // times
  shareCoverageBelow2: number | null;              // fraction
  firmsWithInterest: number | null;                // count
  revenueChange2020: number | null;                // fraction
  grossMargin: Record<string, number | null> | null; // fraction per year
  shareOfSectorRevenue: number | null;             // fraction
  shareOfSectorProfit: number | null;              // fraction
  shareOfSectorRevenue5yAgo: number | null;        // fraction
  shareOfSectorProfit5yAgo: number | null;         // fraction
  /** The INDUSTRY median, not the sector's. */
  medianOperatingMargin: number | null;            // fraction
  medianOperatingMargin5yAgo?: number | null;      // fraction
  /** Share of the peer set with data behind these figures. */
  coverage?: number | null;                        // fraction
  /** Second listings of a company already counted, folded out of the peer set. */
  duplicateListingsDropped?: number | null;        // count
  /** How many of the five largest were on file in both years. */
  top5ShareChangeFirmsCompared?: number | null;    // count
  /** The sector's fiscal year, which can lag the industry's. */
  sectorFiscalYear?: number | null;                // year
  /** Field name to the reason that field does not apply to this industry. */
  notApplicable?: Record<string, string>;
}

export interface GrowthSplit {
  companyCagr5y: number | null;   // log-fraction per year (0.496 = 64.3% compound)
  industryCagr5y: number | null;  // log-fraction per year
  industryPoints: number | null;  // log-fraction contribution per year
  sharePoints: number | null;     // log-fraction contribution per year
  shareNow: number | null;        // fraction
  shareThen: number | null;       // fraction
  /** The same rate before the backend rounded it. Nothing on the page reads
   *  this; it is declared so the fixtures type-check against the real JSON. */
  companyCagrUnrounded?: number | null; // log-fraction per year
  /** How many years the split covers. */
  years?: number | null;          // count
}

export interface MarginSplit {
  company: number | null;         // fraction (0.624 = 62.4%)
  /** The same margin before the backend rounded it. */
  companyUnrounded?: number | null; // fraction
  /** The strategic group the group part came from, and its size. */
  group?: string | null;
  firmCount?: number | null;      // count
  industryMedian: number | null;  // fraction
  groupMedian: number | null;     // fraction
  industryPart: number | null;    // fraction (decomposition part)
  groupPart: number | null;       // fraction
  companyPart: number | null;     // fraction
}

export interface StrategicGroup {
  label: string | null;
  firmCount: number | null;       // count
  /** PRE-TAX return on capital. The live payload uses the explicit pre-tax
   *  names; the older pair is kept so an older backend still renders. */
  medianPreTaxRoic?: number | null; // fraction
  rankByPreTaxRoic?: number | null; // 1-based rank
  medianRoic?: number | null;     // fraction
  rankByRoic?: number | null;     // 1-based rank
  axes: string[] | null;
}

export interface CompanyBlock {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  /** The fiscal year these company figures come from. */
  fiscalYear?: number | null;                        // year
  isFinancial?: boolean | null;
  /** Field name to the reason that field does not apply to this company. */
  notApplicable?: Record<string, string>;
  /** Reporting currency code, e.g. "USD", "TWD". Optional until the backend
   *  ships it; when it is absent or not "USD" the local-currency debt figures
   *  below must never be printed with a dollar sign. */
  reportingCurrency?: string | null;
  totalDebt: number | null;                          // local-currency
  operatingIncome: number | null;                    // local-currency
  interestPerPoint: number | null;                   // local-currency
  /** FX-converted figures. Null when the currency is unknown. Optional until
   *  the backend ships them. */
  totalDebtUsd?: number | null;                      // usd
  operatingIncomeUsd?: number | null;                // usd
  interestPerPointUsd?: number | null;               // usd
  interestPerPointPctOfOperatingIncome: number | null; // fraction
  interestCoverage: number | null;                   // times
  syntheticRating: string | null;
  revenueChange2020: number | null;                  // fraction
  grossMargin: Record<string, number | null> | null; // fraction per year
  growth: GrowthSplit | null;
  margin: MarginSplit | null;
  group: StrategicGroup | null;
}

export interface ExposureRow {
  ticker: string;
  name: string;
  revenueUsd: number | null;                          // usd
  interestCoverage: number | null;                    // times
  netDebtToEbitda: number | null;                     // times
  interestPerPointPctOfOperatingIncome: number | null; // fraction
  revenueChange2020: number | null;                   // fraction
  grossMarginChange2020to2022: number | null;         // points-already (backend * 100)
  operatingLeverage: number | null;                   // times
  shareChange5y: number | null;                       // points-already (backend * 100)
  roicMinusWacc: number | null;                       // fraction
  isFinancial?: boolean | null;
  /** Field name to the reason that field does not apply to this company. */
  notApplicable?: Record<string, string>;
}

export interface ConnectionsData {
  economy: EconomyBlock | null;
  credit: CreditBlock | null;
  /** Absent when the request asked for scope=economy. */
  sector: SectorBlock | null;
  industry: IndustryBlock | null;
  company: CompanyBlock | null;
  exposures: ExposureRow[] | null;
}
