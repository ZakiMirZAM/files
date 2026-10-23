export type SectionKey = "economic" | "credit" | "sector" | "industry" | "comparative" | "individual" | "final_review";

export interface QualitativeQuestion {
  id: string;
  text: string;
  hint?: string;
  /** Numbered steps shown under "Work it out in steps:" and sent to the tutor. */
  steps?: string[];
  /** The closing teaching sentence after the steps. */
  close?: string;
}

export interface QualitativeGroup {
  title: string;
  questions: QualitativeQuestion[];
}

/** A qualitative question built at runtime (e.g. from the integrity checks):
 *  the static shape plus an optional per-question AI data context and a
 *  severity used only for a small visual flag. */
export interface RuntimeQuestion extends QualitativeQuestion {
  dataContext?: string;
  severity?: IntegritySeverity;
  /**
   * Hidden tutor guidance. It is NEVER rendered. QuestionField sends it ahead
   * of the question text in the AI request, because the server's contract has
   * no instruction slot: `data` is treated as figures to be checked
   * numerically, so instructions have to travel in the question slot.
   */
  guidance?: string;
}

export interface RuntimeGroup {
  title: string;
  questions: RuntimeQuestion[];
}

export type Frequency = "annual" | "quarterly" | "monthly" | "daily";
export type DisplayType = "bar" | "line";

export interface TrendPoint {
  period: string;
  value: number;
}

export interface VerticalAnalysisRow {
  label: string;
  value: number;
  unit: "%" | "$" | "x" | "";
}

export interface Metric {
  id: string;
  number: number;
  name: string;
  unit: "%" | "$" | "x" | "";
  latestValue: number;
  trend: TrendPoint[];
  definition: string;
  analysis: string;
  vertical: VerticalAnalysisRow[];
  frequency: Frequency;
  displayType: DisplayType;
  isRateOfChange: boolean;
  secondaryLabel?: string | null;
  // Underlying LEVEL series for a YoY-default metric, so the chart can toggle
  // between "% change from a year ago" and "regular output".
  levelTrend?: TrendPoint[];
  levelUnit?: "%" | "$" | "x" | "";
  // Alternate base series (e.g. an inflation-adjusted "Real" variant). When
  // present, MetricBlock renders a {baseVariantLabel}/{altVariantLabel} switch
  // that swaps the main series; the Level/YoY toggle then operates on whichever
  // variant is active. `altLevelTrend` is the alternate of `levelTrend` for
  // YoY-default metrics; omit it for level-default metrics.
  altTrend?: TrendPoint[];
  altLevelTrend?: TrendPoint[];
  altUnit?: "%" | "$" | "x" | "";
  baseVariantLabel?: string;
  altVariantLabel?: string;
}

export interface RecessionBand {
  start: string;            // ISO date, shading start (first day of the peak month)
  end: string;              // ISO date, shading end (first day after the trough month)
  label?: string;          // episode name, e.g. "Great Recession", "COVID-19 recession"
  range?: string;          // exact published month range, e.g. "Dec 2007 – Jun 2009"
}

// ── Individual analysis (full IndividualSnapshot) ────────────────────────────

/**
 * Whether the market quote and the model's per-share value are the same kind
 * of number.
 *
 * Every per-share figure the backend produces is per ORDINARY share in the
 * filer's reporting currency. The quote is in whatever the LISTING trades in.
 * For a foreign filer's US depositary receipt those differ twice over, in the
 * currency and in the unit, and compared raw TSM read a margin of safety of
 * +357.95 percent: 1990.55 TWD per ordinary share against a 434.67 dollar
 * receipt. `applicable: false` means the comparison was refused, and every
 * price-against-value figure on the page is empty by design.
 */
export interface PriceComparison {
  applicable: boolean;
  /** Why the two could not be compared. Null when they could. */
  reason: string | null;
  /** The quote per ORDINARY share in the reporting currency, when reconciled.
   *  Null when there was no quote, or when the comparison was refused. */
  price: number | null;
  /** The quote exactly as it arrived, in its own currency. */
  quotePrice: number | null;
  quoteCurrency: string | null;
  reportingCurrency: string | null;
  /** The deposit ratio used, when one was on file. 1 for an interlisted
   *  ordinary share, where one for one is how the listing works rather than an
   *  assumption about the company. */
  ordinarySharesPerReceipt: number | null;
  /** noQuote | unverified | sameCurrency | fxOnly | interlistedOrdinary |
   *  adrRatio | receiptNoRatio | noRate | storedMarketValue |
   *  storedReceiptNoRatio */
  method: string;
  /** Which rule ran, in plain words, e.g. "interlisted ordinary share,
   *  converted by exchange rate only". */
  basis?: string;
}

export interface IndividualValuation {
  dcfIntrinsicPerShare: number | null;
  impliedPrice: number | null;
  marginOfSafety: number | null;  // decimal: 0.20 = 20% upside
  /** Present on every payload. When `applied: false` the two figures above are
   *  null on purpose and `reason` says which units could not be reconciled. */
  priceComparison?: PriceComparison | null;
  fcfGrowthUsed: number | null;   // decimal: 0.08 = 8% measured growth
  // Under the damodaran engine these are the CHOSEN MODEL's actual values
  // (null when no model is solvable); legacy echoes its old constants.
  wacc: number | null;
  terminalGrowth: number | null;
  projectionYears: number | null;
  model?: "fcff" | "nstage" | "ddm" | null;
  modelLabel?: string | null;
  stageCount?: number | null;
  highGrowthYears?: number | null;
  archetype?: string | null;
  rationale?: string[] | null;
  discountRate?: number | null;
  notApplicableReason?: string | null;
}

// ── Stage variants (the user-switchable 1/2/3-stage structures) ──────────────

export interface StageVariant {
  applicable: boolean;
  reason?: string;
  intrinsicPerShare?: number;
  marginOfSafety?: number | null;
  stageCount?: number;
  nHigh?: number;
  nTransition?: number;
  growthInitial?: number;
  growthTerminal?: number;
  waccStable?: number;
  reinvestmentStable?: number | null;
  roicStableSource?: string;
  payoutStable?: number;
  costOfEquityStable?: number;
  terminalValue?: number;
  pvExplicit?: number;
  pvTerminal?: number;
  pvDividends?: number;
  accuracyNote?: string;
  /** Per-year projection rows for this structure (ForecastRow-shaped on the
   *  firm track, DividendDiscountRow-shaped on the dividend track). */
  rows?: ForecastRow[] | DividendDiscountRow[];
}

export interface ValuationSelection {
  track: "fcff" | "nstage" | "ddm";
  recommendedStages: number;
  selectorStages?: number;
  highGrowthYears: number;
  archetype: string;               // "con-ed" | "pg" | "amgen"
  rationale: string[];
  hModelApplicable?: boolean;
  roicStable?: number | null;
  roicStableSource?: string;
  diagnostics?: ValuationDiagnostic[];
  stageVariants: Record<string, StageVariant>;
}

export interface ValuationDiagnostic {
  id: string;
  severity?: string;
  detail: string;
  value?: number | null;
  [key: string]: unknown;
}

export interface HModelCrossCheck {
  stableComponent: number;
  extraordinaryComponent: number;
  value: number;
  hYears: number;
}

export interface IndividualVerdict {
  qualityScore: number;
  label: string;
  strengths: string[];
  weaknesses: string[];
}

export interface CashGenerationRow {
  year: number;
  nopat: number | null;
  ocf: number | null;
  fcf: number | null;
}

export type HorizontalTable = Record<string, Record<string, number>>;
export type VerticalTable = Record<string, Record<string, number>>;

// ── Forward FCFF forecast ─────────────────────────

export interface ForecastAssumptions {
  horizonYears: number;
  baseRevenue: number | null;
  revenueGrowthInitial: number;
  revenueGrowthTerminal: number;
  operatingMarginCurrent: number | null;
  operatingMarginTarget: number | null;
  taxRate: number;
  roic: number | null;
  wacc: number;
  growthMethod?: string;
  cash?: number | null;
  grossDebt?: number | null;
  minorityInterest?: number | null;
  netDebt: number | null;
  dilutedShares: number | null;
  exitPfcfMultiple: number | null;
  evEbitdaMultiple?: number | null;
  /** Set on a story forecast (POST story-dcf) only. */
  salesToCapital?: number | null;
  stableRoic?: number | null;
}

export interface ForecastRow {
  year: number;            // 1..horizon (relative); absolute label via IndividualForecast.years[i]
  growth: number;
  revenue: number;
  operatingMargin: number;
  taxRate?: number;
  ebit: number;
  ebitAfterTax: number;
  reinvestment: number;
  fcff: number;
  pvFcff: number;
  // Damodaran engine stage metadata (absent under legacy).
  phase?: "high" | "transition";
  roic?: number | null;
  reinvestmentRate?: number | null;
  wacc?: number;
  discountFactor?: number;
}

export interface ForecastSensitivity {
  waccAxis: number[];
  growthAxis: number[];
  matrix: Array<Array<number | null>>;   // matrix[waccIdx][growthIdx] = intrinsic/share
}

// ── EVA (economic value added) valuation, derived from the FCFF path ─────────
export interface EvaProjectionRow {
  year: number;
  nopat: number;
  investedCapital: number;
  capitalCharge: number;
  eva: number;
  pvEva: number;
}

export interface EvaValuation {
  wacc: number;
  investedCapital0: number;
  eva1: number | null;
  projected: EvaProjectionRow[];
  pvExplicit: number;
  terminalEva: number;
  pvTerminalEva: number;
  mva: number;
  perpetuityMva: number | null;
  constantGrowthMva: number | null;
  firmValue: number;
  equityValue: number;
  intrinsicPerShare: number | null;
  /** Actual EV/NOPAT against the multiple ROIC, WACC and g justify. */
  evNopat?: EvNopat | null;
}

/** Mirrors individualanalysis._ev_nopat. Multiples are times, rates decimals. */
export interface EvNopat {
  enterpriseValue: number | null;
  nopat: number | null;
  actual: number | null;
  justified: number | null;
  actualToJustified: number | null;
  roic: number | null;
  wacc: number | null;
  growth: number | null;
}

export interface BetaProvenanceComponent {
  segment: string;
  industry: string;
  weight: number;
  unleveredBeta: number;
  mapSource: string;
}

export interface WaccBuild {
  wacc: number;
  costOfEquity: number;
  costOfDebtPretax: number | null;
  costOfDebtAfterTax: number | null;
  interestCoverage: number | null;
  weightEquity: number;
  weightDebt: number;
  marketValueEquity: number | null;
  bookValueDebt: number;
  /** Total debt before the operating-lease present value is added. */
  conventionalDebt?: number | null;
  /** The present value of operating leases folded into the debt weight. */
  leaseDebt?: number | null;
  beta: number | null;
  riskFreeRate: number;
  equityRiskPremium: number;
  // Marginal rate used for the debt tax shield and the firm's
  // own effective rate (used for NOPAT/FCFF), surfaced for transparency.
  marginalTaxRate?: number;
  effectiveTaxRate?: number;
  // How the equity risk premium was sourced: "implied_two_stage" (live Damodaran
  // implied ERP), "damodaran", or "fixed_fallback" (the 4.5% anchor).
  erpMethod?: string;
  // Bottom-up beta provenance (backend/betas, BETA_RESOLVER flag). Absent when
  // the resolver is off or the betas package is unavailable.
  betaMethod?: string;
  betaConfidence?: "high" | "medium" | "low";
  betaCoverage?: number | null;
  betaUnlevered?: number | null;
  betaDeRatio?: number | null;
  betaDeSource?: string | null;
  betaComponents?: BetaProvenanceComponent[];
  betaWarnings?: string[];
  betaRegression?: number | null;
  betaShadowValue?: number;
}

// ── Life-cycle-aware growth estimation ────────

/** Where the company sits in its life, classified from its own history. */
export interface CompanyLifecycle {
  applicable?: boolean;
  reason?: string;
  stage?: "emerging" | "growth" | "mature" | "declining";
  confidence?: "low" | "normal";
  cyclicalSwings?: boolean;
  medianGrowth5y?: number | null;
  marginSlopePpYr?: number | null;
  yearsUsed?: number;
}

/** The historical trend, the rate the fundamentals support, and which one drove
 *  the model. `mode` is the GROWTH_MODEL flag the backend ran under. */
export interface GrowthReconciliation {
  historical: number | null;
  fundamental: number | null;
  reinvestmentRate: number | null;
  efficiencyTerm: number | null;
  reconciled: number | null;
  growthUsed: number;
  methodUsed: string;
  divergence: number | null;
  divergenceFlag: boolean;
  reinvestmentMethod: "earnings" | "salesToCapital";
  salesToCapitalUsed: number | null;
  ownSalesToCapital: number | null;
  industrySalesToCapital: number | null;
  // Under "damodaran" these are the ADVISORY life-cycle band, not clamps.
  growthCap: number;
  growthFloor: number;
  marginTarget: number | null;
  marginTargetSource: string;
  mode: "regression" | "shadow" | "fundamental" | "damodaran";
}

/** One growth-viability due-diligence question with the figures behind it. */
export interface GrowthCheck {
  id: string;
  tier: string;
  question: string;
  severity: IntegritySeverity;
  value: number | null;
  threshold: number | null;
  detail: string;
}

export interface GrowthViability {
  applicable: boolean;
  reason?: string;
  checks?: GrowthCheck[];
  method?: string;
}

export interface IndividualForecast {
  // false for Financials/REITs (FCFF is the wrong model); the rest is absent then.
  applicable?: boolean;
  notApplicableReason?: string | null;
  reason?: string | null;
  assumptions: ForecastAssumptions;
  waccBuild?: WaccBuild | null;
  // Damodaran engine: model selection + every stage-count variant.
  valuationSelection?: ValuationSelection | null;
  // Damodaran Ch.11: historical vs fundamental growth, and the reinvestment bridge.
  growthReconciliation?: GrowthReconciliation | null;
  lifecycle?: CompanyLifecycle | null;
  // Reverse DCF (Penman): the growth today's price implies, same engine inverted.
  reverseDcf?: ReverseDcf | null;
  /** Set only when the quote could not be compared with a per-ordinary-share
   *  value, which is why `currentPrice` and `marginOfSafety` are null. */
  priceComparison?: { applicable: false; reason: string | null } | null;
  baseYear: number;
  years: number[];
  rows: ForecastRow[];
  pvExplicit: number;
  terminalValue: number;
  pvTerminal: number;
  firmValue: number;
  cash?: number | null;
  grossDebt?: number | null;
  minorityInterest?: number | null;
  netDebt: number | null;
  equityValue: number;
  intrinsicPerShare: number;
  currentPrice: number | null;
  marginOfSafety: number | null;
  exitCrossCheckPerShare: number | null;
  evEbitdaCrossCheckPerShare?: number | null;
  evEbitdaImpliedGrowth?: number | null;
  betaOneIntrinsicPerShare?: number | null;
  eva?: EvaValuation | null;
  sensitivity: ForecastSensitivity;
}

// ── Story-based DCF (POST /api/individual/{t}/story-dcf, GET .../story-context) ──

export type StoryInputName =
  | "totalMarket"
  | "marketGrowth10y"
  | "shareYear10"
  | "targetMargin"
  | "salesToCapital"
  | "failureProbability"
  | "distressProceeds"
  | "stableRoic"
  | "stages";

/** The story-dcf request body: null keeps the model's number (and, for `stages`, runs 3). */
export type StoryDcfInputs = Record<StoryInputName, number | null>;

export interface StoryInputCheck {
  status: "applied" | "kept";
  /** The site rule that kept the model's number, when status is "kept". */
  rule: string | null;
}

/** The valuation's stage count: 1, 2 or 3. */
export type StoryStageCount = 1 | 2 | 3;

export interface StoryChecks {
  /** Every input but `stages`, whose story and used counts are in `stages`. */
  inputs: Partial<Record<StoryInputName, StoryInputCheck>>;
  revenueGrowth: { story: number | null; model: number; used: number };
  stages: { story: StoryStageCount | null; used: StoryStageCount };
  marketYear10: number | null;
  revenueYear10: number;
  impliedShareYear10: number | null;
  stableGrowth: number;
  riskFreeRate: number;
  ironTriangleReturn: number | null;
  wacc: number;
  valueIfStoryWorksPerShare: number;
  failureProbability: number;
  distressPerShare: number;
  failureAdjustedPerShare: number;
}

export type StoryForecast = IndividualForecast & { storyChecks: StoryChecks };

export type StoryDcfResult = StoryForecast | { applicable: false; reason: string };

/** The factual bundle the story conversion reads. Only the fields the page
 *  uses are typed; the rest is passed through untouched. */
export interface StoryContext {
  applicable: boolean;
  reason?: string;
  companyName?: string;
  currency?: string | null;
  dataBlock?: string;
  [key: string]: unknown;
}

// Metadata for a fundamental display metric (from the backend registry).
export interface MetricMeta {
  key: string;
  label: string;
  group: string;
  unit: "%" | "x" | "d" | "$";
}

// ── Deep-value anchors / forensic shenanigans / residual income / R&D cap ────

export interface ValuationAnchors {
  price: number | null;
  grahamNumber: number | null;
  grahamNumberUpside: number | null;
  ncavTotal: number | null;
  ncavPerShare: number | null;
  ncavPerShareUpside: number | null;
  grahamNetNetPerShare: number | null;
  passesNetNetTest: boolean | null;
  note: string;
}

export type ShenaniganSeverity = "high" | "medium" | "ok" | "na";

export interface ShenaniganFlag {
  key: string;
  label: string;
  category: string;
  severity: ShenaniganSeverity;
  value: number | null;
  threshold: number | null;
  detail: string;
}

export interface ShenaniganQuestionGroup {
  category: string;
  items: string[];
}

export interface ScoreComponent {
  key: string;
  label: string;
  value: number | null;
  weight: number;
  contribution: number;
  note?: string;
  imputed?: boolean;
}

export type ForensicScoreBand =
  | "safe" | "grey" | "distress"            // Altman
  | "unlikely" | "flagged"                   // Beneish
  | "na";

export interface ForensicScore {
  key: "altman_z" | "beneish_m" | string;
  label: string;
  applicable: boolean;
  value: number | null;
  band: ForensicScoreBand;
  severity: ShenaniganSeverity;
  headline: string;
  interpretation?: string;
  threshold_note?: string;
  confidence?: string;
  low_confidence?: boolean;
  reason?: string;
  source: string;
  components: ScoreComponent[];
}

export interface Shenanigans {
  applicable: boolean;
  flags: ShenaniganFlag[];
  counts?: Record<ShenaniganSeverity, number>;
  scores?: ForensicScore[];
  summary?: string;
  questions: ShenaniganQuestionGroup[];
  method?: string;
}

export interface ResidualIncomeRow {
  year: number;
  bvpsBegin: number;
  roe: number;
  equityCharge: number;
  residualIncome: number;
  pv: number;
}

export interface ResidualIncome {
  applicable: boolean;
  recommended?: boolean;
  reason?: string;
  costOfEquity: number | null;
  bvps0?: number | null;
  roeCurrent?: number | null;
  roeUsed?: number | null;
  payout?: number | null;
  retention?: number | null;
  growthTerminal?: number | null;
  justifiedPB?: number | null;
  actualPB: number | null;
  fairValueSingleStage?: number | null;
  intrinsicPerShare?: number | null;
  currentPrice: number | null;
  marginOfSafety?: number | null;
  horizonYears?: number;
  rows?: ResidualIncomeRow[];
  terminalValue?: number | null;
  pvTerminal?: number | null;
  pbVsRoe?: {
    actualPB: number | null;
    justifiedPB: number | null;
    roe: number | null;
    costOfEquity: number | null;
    verdict: string | null;
  };
  note?: string;
}

export interface DividendDiscountRow {
  year: number;
  growth: number;
  eps: number;
  dps: number;
  pv: number;
  phase?: "high" | "transition";
  payout?: number;
  costOfEquity?: number;
  discountFactor?: number;
}

export interface DividendDiscount {
  applicable: boolean;
  recommended?: boolean;
  reason?: string;
  costOfEquity: number | null;
  eps0?: number | null;
  dps0?: number | null;
  payout?: number | null;
  retention?: number | null;
  roeUsed?: number | null;
  growthInitial?: number | null;
  growthTerminal?: number | null;
  terminalPayout?: number | null;
  horizonYears?: number;
  rows?: DividendDiscountRow[];
  pvDividends?: number | null;
  terminalValue?: number | null;
  pvTerminal?: number | null;
  intrinsicPerShare?: number | null;
  currentPrice: number | null;
  marginOfSafety?: number | null;
  note?: string;
  // Damodaran engine additions.
  stageVariants?: Record<string, StageVariant> | null;
  recommendedStages?: number | null;
  selectorStages?: number | null;
  archetype?: string | null;
  rationale?: string[] | null;
  augmentedPayout?: number | null;
  conventionalPayout?: number | null;
  buybacksIncluded?: boolean | null;
  roeStableSource?: string | null;
  hModel?: HModelCrossCheck | null;
}

export interface FcfeRegulatoryRow {
  year: number;
  growth: number;
  bvpsBegin: number;
  eps: number;
  equityReinvested: number;
  fcfe: number;
  pv: number;
}

export interface FcfeRegulatory {
  applicable: boolean;
  recommended?: boolean;
  reason?: string;
  costOfEquity: number | null;
  bvps0?: number | null;
  roeUsed?: number | null;
  payout?: number | null;
  retention?: number | null;
  equityAssetRatio?: number | null;
  equityReinvestmentRate?: number | null;
  growthInitial?: number | null;
  growthTerminal?: number | null;
  growthSource?: string | null;
  horizonYears?: number;
  rows?: FcfeRegulatoryRow[];
  pvFcfe?: number | null;
  terminalValue?: number | null;
  pvTerminal?: number | null;
  intrinsicPerShare?: number | null;
  currentPrice: number | null;
  marginOfSafety?: number | null;
  note?: string;
}

export interface BankProfitabilityRow {
  year: number;
  nim: number;
  assetYield: number;
  fundingCost: number;
}

export interface BankProfitability {
  applicable: boolean;
  reason?: string;
  sector?: string | null;
  netInterestMargin?: number | null;
  netInterestIncome?: number | null;
  interestIncome?: number | null;
  interestExpense?: number | null;
  assetYield?: number | null;
  fundingCost?: number | null;
  interestIncomeToRevenue?: number | null;
  nimTrend?: BankProfitabilityRow[];
  note?: string;
}

export interface RndAdjusted {
  applicable: boolean;
  reason?: string;
  life?: number;
  yearsOfHistoryUsed?: number;
  rdIntensity?: number | null;
  currentRD?: number | null;
  researchAsset?: number | null;
  amortizationThisYear?: number | null;
  ebitReported?: number | null;
  ebitAdjusted?: number | null;
  nopatReported?: number | null;
  nopatAdjusted?: number | null;
  investedCapitalReported?: number | null;
  investedCapitalAdjusted?: number | null;
  roicReported?: number | null;
  roicAdjusted?: number | null;
  note?: string;
  // Reinvestment and Value extension. investedCapital* and roic* above are on a
  // beginning-of-year basis (prior year-end capital, plus last year's research
  // asset on the adjusted side).
  lifeSource?: "industry" | "default";
  lifeIndustry?: string | null;
  materiality?: "revenue" | "operatingProfit";
  rdToOperatingProfit?: number | null;
  capitalBasis?: "beginning_of_year";
  researchAssetPriorYear?: number | null;
  wacc?: number | null;
  roicMinusWaccReported?: number | null;
  roicMinusWaccAdjusted?: number | null;
  taxMethod?: RndTaxMethod;
  taxFiscalYear?: number | null;
  taxRate?: number | null;
}

export type RndTaxMethod =
  | "footnote_capitalized"
  | "footnote_expensed"
  | "footnote_us_2025_expensed"
  | "rule_us_capitalized"
  | "rule_us_expensed"
  | "rule_non_us_expensed";

// ── Capex split (upkeep vs growth spending, five fiscal years) ─────────
// Mirrors individualanalysis._capex_split. Money in the reporting currency,
// ratios are decimals, a null is "not meaningful here", never a zero.

export type CapexSplitMethod =
  | "greenwald"
  | "dda_proxy_floor"
  | "dda_proxy_insufficient"
  | "unavailable";

export interface CapexSplitFigures {
  capitalSpending: number | null;
  ppeToSales: number | null;
  revenueChange: number | null;
  growthSpending: number | null;
  upkeepSpending: number | null;
  depreciation: number | null;
  upkeepToDepreciation: number | null;
  profitOverstatement: number | null;
}

export interface CapexSplitYear extends CapexSplitFigures {
  year: number;
  revenueChangeNominal: number | null;
  inflation: number | null;
  acquiredRevenue: number | null;
  method: CapexSplitMethod;
}

export interface CapexSplitBlock {
  applicable: boolean;
  reason?: string;
  currency?: string | null;
  inflationAdjusted?: boolean;
  acquisitionsAdjusted?: boolean;
  capitalLight?: boolean;
  ppeToRevenueLatest?: number | null;
  years?: CapexSplitYear[];
  average?: CapexSplitFigures;
}

// ── Next two years (model vs consensus vs the reader) ─────────
// Mirrors backend/next_two_years.py. Money and EPS in the reporting currency.

export type NextTwoYearsKey =
  | "revenue"
  | "operatingMargin"
  | "nopat"
  | "reinvestment"
  | "fcff"
  | "roic"
  | "eva"
  | "eps";

export interface NextTwoYearsRow {
  key: NextTwoYearsKey;
  lastReported: number | null;
  model1: number | null;
  model2: number | null;
}

export interface ConsensusFigure {
  avg: number;
  low: number | null;
  high: number | null;
  analysts: number | null;
  growth: number | null;
}

export type ConsensusHiddenReason = "no_coverage" | "does_not_tie" | "database_behind";

export interface ConsensusYear {
  label: "current" | "next";
  fiscalYear: number | null;
  fiscalYearEnd: string | null;
  revenue: ConsensusFigure | null;
  revenueHiddenReason: ConsensusHiddenReason | null;
  eps: ConsensusFigure | null;
  epsHiddenReason: ConsensusHiddenReason | null;
}

export interface NextTwoYearsBlock {
  applicable: boolean;
  reason?: string;
  currency?: string | null;
  lastFiscalYear?: number;
  modelYears?: [number, number];
  rows?: NextTwoYearsRow[];
  consensus?: { source: "Yahoo Finance"; years: ConsensusYear[] } | null;
  history?: { year: number; revenue: number | null; operatingMargin: number | null; eps: number | null }[];
}

// ── Normalized-earnings bridge ─────────

export interface NormalizedLeases {
  applicable: boolean;
  reason?: string;
  leaseSource?: string; // "xbrl_footnote" | "balance_sheet_capital"
  leaseDebt?: number | null;
  pretaxCostOfDebt?: number | null;
  imputedInterest?: number | null;
  reportedEbit?: number | null;
  adjustedEbit?: number | null;
  conventionalDebt?: number | null;
  totalDebtWithLeases?: number | null;
  additiveDebtForWacc?: number | null;
  waccImpact?: boolean;
  note?: string;
}

export interface NormalizedInvestmentIncome {
  applicable: boolean;
  reason?: string;
  interestIncome?: number | null;
  afterTaxInvestmentIncome?: number | null;
  reportedNetIncome?: number | null;
  coreNetIncome?: number | null;
  pctFromInvestments?: number | null;
  marketableSecuritiesHeldAside?: number | null;
  note?: string;
}

export interface GoodwillImpairment {
  year: number;
  impairment: number;
  pctOfAssets: number;
}

export interface NormalizedOneTime {
  applicable: boolean;
  reason?: string;
  medianOperatingMargin?: number | null;
  reportedMargin?: number | null;
  reportedEbit?: number | null;
  normalizedEbit?: number | null;
  flaggedYears?: { year: number; margin: number; deviation: number }[];
  inferredGoodwillImpairment?: GoodwillImpairment | null;
  note?: string;
}

export interface NormalizedGoodwillSbc {
  sbc?: number | null;
  sbcToRevenue?: number | null;
  sbcToOperatingCashFlow?: number | null;
  goodwill?: number | null;
  goodwillToAssets?: number | null;
  inferredImpairment?: GoodwillImpairment | null;
  note?: string;
}

export interface NormalizedEarnings {
  leases: NormalizedLeases;
  investmentIncome: NormalizedInvestmentIncome;
  oneTime: NormalizedOneTime;
  goodwillSbc: NormalizedGoodwillSbc;
  additiveDebtForWacc: number;
  excludesFinancials: boolean;
}

// ── Earnings bridge, reported income walk from the 10-K XBRL (Ch.9) ──────────

export interface EarningsBridgeStep {
  key: string;
  label: string;
  kind: string; // "total" | "subtract"
  value: number;
}

export interface EarningsBridge {
  source: string;
  periodEnd?: string | null;
  fiscalYear?: number | null;
  income: Record<string, number>;
  leases: Record<string, number>;
  operatingLeasePV?: number | null;
  steps: EarningsBridgeStep[];
  note?: string;
}

// ── ESG block (numeric scores when available, else AI qualitative) ────────────

export interface EsgBlock {
  scores: Record<string, number> | null;
  hasNumericScores: boolean;
  source: string;
  note?: string;
}

// ── Reverse DCF (Penman Ch.4): growth the current price implies ───────────────

export interface ReverseDcf {
  applicable: boolean;
  /** Why the inversion was refused. Present only when applicable is false. */
  reason?: string | null;
  status?: "solved" | "below_band" | "above_band";
  impliedGrowth?: number | null;
  multipleRoots?: boolean;
  roots?: number[] | null;
  baseGrowth?: number;
  historicalGrowth?: number | null;
  /** Absent when the inversion was refused: there was no usable price. */
  priceUsed?: number;
  beyondModelCap?: boolean;
  beyondDiagnosticBand?: boolean;
  diagnosticBandHigh?: number;
  note?: string;
}

// ── Reverse breakeven: what each driver must be for value to equal price ──────
// GET /api/individual/{ticker}/reverse-dcf. Rates are decimals; per-share values
// are in the price's currency.

export type BreakevenDriverName = "revenueGrowth" | "targetMargin" | "stableRoic" | "salesToCapital";
export type BreakevenStatus = "solved" | "above_range" | "below_range";

export interface BreakevenDriver {
  driver: BreakevenDriverName;
  model: number | null;
  /** Makes value per share equal the price. Null unless status is "solved". */
  implied: number | null;
  low: number;
  high: number;
  /** Null only when no value in the range could be computed at all. */
  status: BreakevenStatus | null;
  /** Unsolved only: the value per share nearest the price over the range (the highest
   *  when above_range, the lowest when below_range) and the driver value giving it. */
  bestValue: number | null;
  bestAt: number | null;
  firm: number | null;
  firmBasis: "fiveYearMedian" | "latest";
  peerMedian: number | null;
  peerTopDecile: number | null;
  /** The driver value the valuation below runs at: implied when solved, else the
   *  end of the range nearest the price. Null when status is null. */
  valuationAt: number | null;
  valuation: DcfBreakdown | null;
}

/** One engine run laid out from the projection to the value per share. Money in the
 *  reporting currency, per-share in the price's currency, rates as decimals. */
export interface DcfBreakdown {
  rows: Array<{
    year: number;
    revenue: number;
    operatingMargin: number;
    ebitAfterTax: number;
    reinvestment: number;
    fcff: number;
    discountFactor: number;
    pvFcff: number;
  }>;
  stableGrowth: number;
  stableReturn: number | null;
  costOfCapital: number;
  terminal: {
    ebitAfterTaxNext: number;
    reinvestmentRate: number | null;
    fcffNext: number;
    waccMinusGrowth: number;
    value: number;
  };
  pvTerminal: number;
  pvExplicit: number;
  enterpriseValue: number;
  cash: number;
  grossDebt: number;
  minorityInterest: number;
  equityValue: number;
  dilutedShares: number;
  valuePerShare: number;
  /** valuePerShare - priceUsed; negative is a shortfall. */
  gapToPrice: number;
}

export interface BreakevenCell {
  value: number | null;
  atOrAbovePrice: boolean;
}

export interface BreakevenGrid {
  rowDriver: BreakevenDriverName;
  colDriver: BreakevenDriverName;
  rowAxis: number[];
  /** Ascending and unrounded; the model's own number sits at rowModelIndex / colModelIndex. */
  colAxis: number[];
  rowModelIndex: 0 | 6;
  colModelIndex: 0 | 6;
  /** cells[rowIndex][colIndex]; cells[rowModelIndex][colModelIndex] is the model's numbers. */
  cells: BreakevenCell[][];
  /** True when any cell is at or above the price. */
  reachesPrice: boolean;
}

export interface ReverseBreakevenApplicable {
  applicable: true;
  priceUsed: number;
  valueAtModel: number | null;
  /** The model's own run, for the side-by-side with a driver's run. */
  modelValuation: DcfBreakdown | null;
  wacc: number | null;
  stableGrowth: number | null;
  drivers: BreakevenDriver[];
  grids: { growthMargin: BreakevenGrid; growthRoic: BreakevenGrid };
  plausibility: {
    impliedRevenueYear10: number | null;
    peerTotalRevenue: number | null;
    impliedShareOfPeerRevenue: number | null;
    impliedStableRoic: number | null;
    currentRoic: number | null;
    wacc: number | null;
  };
}

export type ReverseBreakeven = ReverseBreakevenApplicable | { applicable: false; reason: string };

// ── EPV / Tobin's Q / owner earnings (value lenses beside the DCF) ────────────

export interface EpvBlock {
  applicable: boolean;
  reason?: string;
  sustainableEbit?: number;
  sustainableNopat?: number;
  wacc?: number;
  firmValue?: number;
  equityValue?: number;
  epvPerShare?: number;
  priceToEpv?: number | null;
  dcfIntrinsicPerShare?: number | null;
  growthPremiumPerShare?: number | null;
  note?: string;
}

export interface TobinsQBlock {
  applicable: boolean;
  reason?: string;
  latest?: number;
  trend?: { year: number; q: number }[];
  note?: string;
}

export interface OwnerEarningsBlock {
  applicable: boolean;
  reason?: string;
  netIncome?: number;
  depreciationAmortization?: number;
  maintenanceCapexProxy?: number;
  workingCapitalChange?: number | null;
  ownerEarnings?: number;
  ownerEarningsPerShare?: number | null;
  freeCashFlow?: number | null;
  growthCapex?: number | null;
  lookThroughFlag?: boolean;
  history?: { year: number; ownerEarnings: number }[];
  assumption?: string;
  note?: string;
}

/** Goodwill's share of invested capital + ROIC/EVA on tangible operating capital
 *  only (Investment Valuation Ch.25). Dollar figures are in the reporting
 *  currency; rates are decimals (0.24 = 24%). */
export interface CapitalBaseBlock {
  applicable: boolean;
  reason?: string;
  year?: number;
  goodwill?: number | null;
  intangibleAssets?: number | null;
  goodwillAndIntangibles?: number | null;
  investedCapital?: number | null;
  tangibleInvestedCapital?: number | null;
  goodwillPctInvestedCapital?: number | null;
  goodwillAndIntangiblesPctInvestedCapital?: number | null;
  nopat?: number | null;
  wacc?: number | null;
  roic?: number | null;
  roicTangible?: number | null;
  eva?: number | null;
  evaTangible?: number | null;
}

// ── Industry life-cycle stage ─────────────

export interface IndustryLifecycle {
  applicable: boolean;
  reason?: string;
  stage?: "emerging" | "growth" | "mature" | "declining";
  confidence?: "normal" | "low";
  cyclicalSwings?: boolean;
  medianGrowth5y?: number | null;
  marginSlopePpYr?: number | null;
  negativeGrowthYearsOf3?: number;
  yearsUsed?: number;
  reading?: string;
  note?: string;
}

// ── Business-events feed (Lev & Gu Ch.4): recent 8-K / 6-K filings ────────────

export interface CompanyEvent {
  accession: string;
  form: string;
  filingDate: string;
  reportDate?: string | null;
  items: string[];
  itemLabels: string[];
  url: string | null;
}

// ── Management compensation (DEF 14A proxy + SBC pay proxy) ───────────────────

export interface ProxyFilingRef {
  url: string;
  filedDate?: string | null;
  accession?: string | null;
}

export interface ManagementComp {
  proxy: ProxyFilingRef | null;
  sbc?: number | null;
  sbcToRevenue?: number | null;
  sbcToNetIncome?: number | null;
  note?: string;
}

// Company credit analysis. Mirrors the backend _credit_analysis dict.
export type CreditSeverity = "good" | "warn" | "bad" | "na";

export interface CreditRating {
  letter: string | null;
  spread: number;
  investmentGrade: boolean | null;
  interestCoverage: number | null;
  headline: string;
  reason: string;
}

export interface CreditMetricItem {
  label: string;
  value: number | null;
  unit: string;
  threshold: number;
  higherIsBetter: boolean;
  pass: boolean | null;
  severity: CreditSeverity;
  note: string;
}

export interface CreditDebtCapacity {
  totalDebt: number | null;
  fcfLatest: number | null;
  fcf3yrAvg: number | null;
  debtToFcf: number | null;
  band: string;
  headline: string;
  reason: string;
}

export interface CreditCapitalStructure {
  revenueGrowthVolatility: number | null;
  operatingRiskHigh: boolean;
  leverageHigh: boolean;
  mismatch: boolean;
  headline: string;
  reason: string;
}

export interface CreditBankView {
  equityToAssets: number | null;
  leverageMultiple: number | null;
  returnOnAssets: number | null;
  returnOnEquity: number | null;
  netInterestMargin: number | null;
  metrics: CreditMetricItem[];
  note: string;
}

export interface CreditAnalysis {
  applicable: boolean;
  kind: "corporate" | "bank";
  notApplicableReason: string | null;
  rating: CreditRating;
  summary: { score: number; band: string; headline: string };
  metrics: CreditMetricItem[];
  debtCapacity: CreditDebtCapacity | null;
  capitalStructure: CreditCapitalStructure | null;
  bank: CreditBankView | null;
  forensic: { altmanZ: ForensicScore | null; beneishM: ForensicScore | null };
  source: string;
  /** True for a lender or insurer. The synthetic rating is read off an
   *  interest-coverage table calibrated on non-financial firms, so it is
   *  withdrawn rather than printed. Real estate keeps its rating. */
  isFinancial?: boolean;
  /** {field: reason} for every figure the financial-sector guard withdrew. */
  notApplicable?: Record<string, string>;
}

export interface IndividualAnalysis {
  ticker: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  latestYear: number;
  years: number[];
  ratios: Record<string, number | null>;
  perShare: Record<string, number | null>;
  perShareGrowth: Record<string, number | null>;
  cashGeneration: CashGenerationRow[];
  valuation: IndividualValuation;
  /** Whether the market quote and the model's per-ordinary-share value are the
   *  same kind of number, and in which currencies. The page reads this rather
   *  than fetching /api/quote for the currency alone. */
  priceComparison?: PriceComparison | null;
  horizontal: {
    income: HorizontalTable;
    balance: HorizontalTable;
    cashflow: HorizontalTable;
    perShare: HorizontalTable;
  };
  vertical: {
    income: VerticalTable;
    balance: VerticalTable;
    cashflow?: VerticalTable;
  };
  verdict: IndividualVerdict;
  // Optional (absent in the mock fallback): per-share level history + FCFF forecast.
  perShareHistory?: Record<string, Record<string, number>>;
  forecast?: IndividualForecast | null;
  // Growth-viability due-diligence deck.
  growthViability?: GrowthViability | null;
  // Fundamental metric history ({key: {year: value}}) + the column metadata.
  metricHistory?: Record<string, Record<string, number>>;
  metricMeta?: MetricMeta[];
  // Deep-value anchors, forensic shenanigans, residual-income valuation, R&D cap.
  valuationAnchors?: ValuationAnchors | null;
  shenanigans?: Shenanigans | null;
  residualIncome?: ResidualIncome | null;
  dividendDiscount?: DividendDiscount | null;
  fcfeRegulatory?: FcfeRegulatory | null;
  bankProfitability?: BankProfitability | null;
  creditAnalysis?: CreditAnalysis | null;
  rndAdjusted?: RndAdjusted | null;
  normalizedEarnings?: NormalizedEarnings | null;
  earningsBridge?: EarningsBridge | null;
  esg?: EsgBlock | null;
  managementComp?: ManagementComp | null;
  epv?: EpvBlock | null;
  tobinsQ?: TobinsQBlock | null;
  ownerEarnings?: OwnerEarningsBlock | null;
  capitalBase?: CapitalBaseBlock | null;
  events?: CompanyEvent[] | null;
  dupont?: Dupont | null;
  leverageRoe?: LeverageRoe | null;
  usesOfCash?: UsesOfCash | null;
  moatDirection?: MoatDirection | null;
  capexSplit?: CapexSplitBlock | null;
  nextTwoYears?: NextTwoYearsBlock | null;
  peGrowth?: PeGrowth | null;
}

// ── P/E vs growth and returns ─────────────────────────────────────────────
// Mirrors individualanalysis._pe_growth. Rates are decimals (0.05 = 5%),
// multiples are times. A null is "not meaningful here", never a zero.

/** A solver that can fall off either end: a value, or the side it misses on. */
export type SolverBound = "above" | "below" | null;

export interface PeGrowthScenario {
  case: "bear" | "base" | "bull";
  source: "historical" | "sustainable" | "consensus";
  growth: number;
  fairPe: number | null;
  actualToFairPe: number | null;
}

export interface PeGrowthPeer {
  ticker: string;
  name: string;
  isSubject: boolean;
  pe: number;
  fairPe: number | null;
  gap: number | null;
  spread: number;
}

export interface PeGrowth {
  applicable: boolean;
  consensusSource: string | null;
  consensusAnalysts: number | null;
  forwardPe: number | null;
  trailingPe: number | null;
  earningsYield: number | null;
  treasury10y: number | null;
  costOfEquity: number | null;
  earningsYieldMinusKe: number | null;
  epsGrowth5y: number | null;
  epsGrowthTrend5y: number | null;
  consensusGrowth: number | null;
  peg: number | null;
  roe: number | null;
  retention: number | null;
  sustainableGrowth: number | null;
  reinvestmentRate: number | null;
  marginalRoic: number | null;
  roeMinusKe: number | null;
  roic: number | null;
  wacc: number | null;
  roicMinusWacc: number | null;
  spreadHistory: { year: number; roeMinusKe: number | null; roicMinusWacc: number | null }[];
  stableGrowth: number | null;
  fairPe: number | null;
  actualToFairPe: number | null;
  noGrowthPe: number | null;
  growthPremiumShare: number | null;
  impliedGrowth: number | null;
  impliedGrowthTwoStage: { growth: number | null; bound: SolverBound } | null;
  highGrowthYears: { growth: number; years: number | null; bound: SolverBound } | null;
  impliedReturnAtConsensus: number | null;
  impliedMinusSustainable: number | null;
  impliedMinusConsensus: number | null;
  grid: { keAxis: number[]; growthAxis: number[]; matrix: (number | null)[][] } | null;
  rateShock: { up: number | null; down: number | null } | null;
  scenarios: PeGrowthScenario[];
  highGrowthYearsWindow: number;
  epsHistory: { year: number; eps: number | null }[];
  peers: {
    fiscalYear: number | null;
    peers: PeGrowthPeer[];
    regression: { slope: number; intercept: number; r2: number | null; n: number } | null;
    subject: { predictedPe: number; residual: number } | null;
    peerCount: number;
    minPeersForFit: number;
  } | null;
}

// ── Uses of cash: what each year's operating cash flow was spent on ───────────
// Mirrors backend/uses_of_cash.py exactly. Two shapes matter here:
//   * `uses` values are null when the company did not REPORT the line. A null is
//     not a zero, and `reported` says which is which.
//   * `sources` carries net borrowing and net divestitures. Those are cash coming
//     IN. They are never stacked as uses, because borrowing is not spending.

export type UseOfCashKey =
  | "capex" | "rnd" | "acquisitions" | "buybacks" | "dividends" | "debtRepaid";

export interface UsesOfCashYear {
  year: number;
  operatingCashFlow: number | null;
  ocfPositive: boolean;
  uses: Record<UseOfCashKey, number | null>;
  reported: Record<UseOfCashKey, boolean>;
  sources: {
    netDebtRaised: number | null;
    netDivestitures: number | null;
  };
  /** null when operating cash flow was not positive; `shareReason` says why. */
  shareOfOcf: Record<UseOfCashKey, number | null> | null;
  shareReason: string | null;
  totalUses: number | null;
  totalUsesShareOfOcf: number | null;
}

export interface UsesOfCash {
  applicable: boolean;
  reason?: string;
  years?: UsesOfCashYear[];
  totals?: Record<UseOfCashKey, number>;
  totalOperatingCashFlow?: number | null;
  totalUses?: number;
  totalShareOfOcf?: Record<UseOfCashKey, number> | null;
  anyPositiveOcf?: boolean;
  note?: string;
}

// ── Extended (5-factor) DuPont decomposition ─────────────────────────────────

export interface DupontFactors {
  taxBurden: number | null;
  interestBurden: number | null;
  ebitMargin: number | null;
  assetTurnover: number | null;
  financialLeverage: number | null;
}

export interface DupontRow {
  year: number;
  taxBurden: number | null;
  interestBurden: number | null;
  ebitMargin: number | null;
  assetTurnover: number | null;
  financialLeverage: number | null;
  roe: number | null;
}

export interface Dupont {
  applicable: boolean;
  latestYear: number;
  factors: DupontFactors;
  netMargin: number | null;
  product: number | null;
  roe: number | null;
  roeReported: number | null;
  reconciles: boolean;
  rows: DupontRow[];
  note: string;
}

// ── Leverage decomposition of ROE: ROE = ROIC + D/E × [ROIC − i(1−t)] ────────
// Every value is a DECIMAL (0.0666 = 6.66%), matching the backend's convention
// for ratio metrics. `debtEquity` is a ratio, not a percent.

export interface LeverageRoeTerms {
  roic: number | null;
  debtEquity: number | null;
  bookInterestRate: number | null;
  taxRate: number | null;
  afterTaxDebtCost: number | null;
  spread: number | null;
  leverageGain: number | null;
}

export interface LeverageRoeRow extends LeverageRoeTerms {
  year: number;
  roeModel: number | null;
}

export interface LeverageRoe extends Record<string, unknown> {
  applicable: boolean;
  /** Fiscal year the headline terms describe: the latest year that computes. */
  latestYear: number;
  /** Latest fiscal year on file. Ahead of latestYear when recent rows lack inputs. */
  dataThroughYear: number;
  /** True when latestYear is not the newest year on file. */
  staleLatest: boolean;
  terms: LeverageRoeTerms;
  /** ROE rebuilt from the identity's operating terms. */
  roeModel: number | null;
  /** ROE as reported (net income / book equity). */
  roeReported: number | null;
  reconciles: boolean;
  /** reported − modelled. A wide gap means non-operating profit lifts the ROE. */
  nonOperatingGap: number | null;
  /** Share of the modelled ROE produced by leverage; null when not meaningful. */
  leverageShare: number | null;
  spreadPositive: boolean | null;
  rows: LeverageRoeRow[];
  note: string;
}

// ── Group (sector/industry) valuation ────────────────────────────────────────

export interface GroupValuation {
  cape: number | null;
  dcfIntrinsic: number | null;
  marginOfSafety: number | null;
  fcfGrowthUsed: number | null;
  valueScore: number | null;
}

// ── Comparative leaderboard ─────────────────────────────────────────────────

export interface LeaderboardRow {
  rank: number;
  ticker: string;
  name: string | null;
  latestYear: number;
  score: number;
  dcfIntrinsic: number | null;
  evaIntrinsic?: number | null;
  impliedPrice: number | null;
  marginOfSafety: number | null;
  fcfGrowthUsed: number | null;
  metrics: Record<string, number | null>;
  // Per-company fundamental metric history (levels) for the row-expand trends.
  metricHistory?: Record<string, Record<string, number>>;
}

// ── Commodity ───────────────────────────────────────────────────────────────

export interface Commodity {
  label: string;
  ticker: string;
  source: "fred" | "yahoo";
  unit: string;
  price: TrendPoint[];
  volatility12m: TrendPoint[];
}

// ── Section data envelope ───────────────────────────────────────────────────

export interface SectionData {
  section: SectionKey;
  scopeKey: string;
  title: string;
  subtitle?: string;
  metrics: Metric[];
  recessionBands?: RecessionBand[];
  // Extended payloads (only populated by some endpoints)
  analysis?: IndividualAnalysis | null;        // /api/individual
  valuation?: GroupValuation | null;           // /api/sector, /api/industry
  leaderboard?: LeaderboardRow[] | null;       // /api/comparative
  rankedMetricColumns?: string[] | null;       // /api/comparative
  displayMetricColumns?: MetricMeta[] | null;  // /api/comparative, fundamental metric columns
  commodities?: Commodity[] | null;            // /api/economic
  treasuryYields?: Metric[] | null;            // /api/economic, 3M/1Y/2Y/10Y level yields (maturity switcher)
  fedModel?: FedModel | null;                  // /api/economic, earnings yield vs 1Y Treasury
  sp500Valuation?: Sp500Valuation | null;      // /api/economic, Damodaran S&P-500 DCF / fair value
  lifecycle?: IndustryLifecycle | null;        // /api/industry, /api/sector, Porter life-cycle stage
  scorecard?: GroupScorecard | null;           // /api/sector, /api/industry, value score + fired integrity questions
}

// ── Scorecard value score + integrity questions (group_scoring.py) ──────────

export type IntegritySeverity = "ok" | "medium" | "high" | "na";

/** One scorecard integrity question with the numbers that tripped (or cleared) it. */
export interface IntegrityCheck {
  id: string;
  question: string;
  /** Theme the question belongs to (drives the two answerable-deck groups). */
  tier?: string;
  severity: IntegritySeverity;
  value: number | null;
  threshold: number | null;
  detail?: string;
}

/** SectionData.scorecard, the group's value score plus FIRED questions only. */
export interface GroupScorecard {
  valueScore: number | null;
  rank: number | null;
  peers: number | null;
  integrity: IntegrityCheck[];
}

// ── Fed model: earnings yield vs 1-Year Treasury (DGS1) ───────────────────────

export interface FedModelSnapshot {
  earningsYield: number | null;        // %
  treasuryYield: number | null;        // %
  spread: number | null;               // trailing earnings yield − treasury, in pp
  marketPe: number | null;             // implied index PE (price ÷ trailing EPS)
  asOf: string | null;                 // ISO date of the snapshot
  nConstituents: number | null;
  sp500Eps?: number | null;            // Damodaran trailing S&P-500 earnings (index points)
  sp500Price?: number | null;          // current yfinance S&P-500 price (^GSPC)
  sp500ForwardEps?: number | null;     // Damodaran projected (forward) earnings = trailing × (1+growth)
  forwardEarningsYield?: number | null; // %  (projected EPS ÷ price)
  forwardSpread?: number | null;       // forward earnings yield − treasury, in pp
  analystGrowth?: number | null;       // Damodaran analyst earnings-growth estimate (decimal)
}

export interface FedModel {
  earningsYieldTrend: TrendPoint[];          // daily (TTM Shiller EPS ÷ daily S&P 500 close)
  forwardEarningsYieldTrend?: TrendPoint[];  // daily (TTM EPS × analyst growth ÷ daily close)
  treasuryYieldTrend: TrendPoint[];          // DGS1 daily history
  treasurySeries: string;
  snapshot: FedModelSnapshot | null;         // null until marketdata sources are available
}

// ── S&P-500 valuation ─────────────────

export interface Sp500ProjectionRow {
  year: number;
  projectedEarnings?: number;   // trailing earnings grown at the DCF growth rate
  cashFlow: number;             // cash to shareholders = projectedEarnings × payout
  pvAtImpliedReturn?: number;
}

export interface Sp500Valuation {
  price: number;
  earnings: number;
  payout: number;
  growth: number;                       // decimal
  riskFree: number;                     // decimal
  terminalGrowth: number;               // decimal
  impliedReturn: number | null;         // decimal
  impliedERP: number | null;            // decimal
  projection: Sp500ProjectionRow[];
  terminalCashFlow: number;
  baselineERP: number;                  // decimal
  baselineRequiredReturn: number;       // decimal
  fairValueAtBaseline: number | null;
  overUnderValuationPct: number | null; // % (fair value vs price)
  projectedEarnings?: number | null;    // Damodaran forward earnings = trailing × (1+growth)
  analystGrowth?: number | null;        // Damodaran analyst earnings-growth estimate (decimal)
}

// ── Sector ETF price history (/api/sector-etf/{sector}) ───────────────────────

export interface SectorEtfData {
  ticker: string | null;
  label: string | null;
  history: TrendPoint[];
  latest: number | null;
  asOf: string | null;
}

export interface IndustryEntry {
  name: string;
  companies: number;
  /** Parent sector (industries only). Absent for sector entries / legacy data. */
  sector?: string | null;
}

// ── Sector current-year fundamentals matrix ─────────────────────────────────

/** "pts" is percentage POINTS, a difference between two percentages, and is
 *  client-side only: no backend payload sends it. It exists so a column whose
 *  definition says "in percentage points" does not print a percent sign. */
export type SectorMetricUnit = "$" | "%" | "x" | "d" | "yrs" | "b" | "n" | "#" | "pts";

/** One point in a comparative-matrix cell's history (company × metric × year). */
export interface SectorCellPoint {
  period: string;
  value: number;
}

export interface SectorMetricDef {
  key: string;
  label: string;
  unit: SectorMetricUnit;
  group: string;
  definition: string;
}

/** Per-sector values keyed by metric key, plus `_companies`/`_year`/`_marketCap`. */
export type SectorColumn = Record<string, number | null>;

export interface SectorMetricsData {
  asOf: string;
  universe: string;
  metrics: SectorMetricDef[];
  /** Column names, sectors in the 11-sector matrix, industry names in the
   *  industries-within-a-sector matrix (same shape, reused renderer). */
  sectors: string[];
  data: Record<string, SectorColumn>;
  /** Industry matrix only: the parent sector. */
  sector?: string;
  /** Industry matrix only: industries excluded for having <3 companies. */
  dropped?: string[];
  /** Single-industry scorecard only: sibling count behind the score rank. */
  scorePeers?: number | null;
}

// ── Individual benchmarks: company vs industry vs sector ───────────────────
// /api/individual/{ticker}/benchmarks. Values are in the scorecard matrices'
// display units (percents already ×100), keyed by the individual page's
// metric keys (metricMeta.key).

export interface BenchmarkMetric {
  label: string;
  unit: SectorMetricUnit;
  company: number | null;
  industry: number | null;
  sector: number | null;
}

export interface IndividualBenchmarks {
  ticker: string;
  sector: string | null;
  industry: string | null;
  metrics: Record<string, BenchmarkMetric>;
}

// ── Moat direction and growth sustainability ──────────────────────────────
// Figures only, no verdict. All rates are fractions (0.05 = 5%).

export interface MoatSpread {
  /** "capital": ROIC − WACC; "equity": ROE − cost of equity (banks, insurers, REITs). */
  basis: "capital" | "equity";
  year: number;
  yearThen: number | null;
  spreadNow: number | null;
  spreadThen: number | null;
  /** OLS slope of the spread on the year across the window. */
  slopePerYear: number | null;
  yearsInSlope: number;
  returnNow: number | null;
  costNow: number | null;
  /** Exact split: spreadChange = returnChange − costChange. */
  returnChange: number | null;
  costChange: number | null;
  spreadChange: number | null;
  returnFadePerYear: number | null;
  yearsToZeroAtThisPace: number | null;
}

export interface MoatShareAndMargins {
  year: number;
  yearThen: number;
  grossMarginNow: number | null;
  grossMarginThen: number | null;
  operatingMarginNow: number | null;
  operatingMarginThen: number | null;
  shareNow: number | null;
  shareThen: number | null;
  shareYear: number | null;
  shareYearThen: number | null;
}

export interface SustainableGrowthRow {
  year: number;
  margin: number | null;
  assetTurnover: number | null;
  assetsOverEquity: number | null;
  retention: number | null;
  sustainableGrowth: number | null;
}

export interface MoatDirection {
  windowYears: number;
  spread: MoatSpread | null;
  incrementalRoic: { value: number | null; fromYear: number; toYear: number } | null;
  shareAndMargins: MoatShareAndMargins | null;
  sustainableGrowth: {
    rows: SustainableGrowthRow[];
    averageSustainableGrowth: number | null;
    yearsAveraged: number;
    revenueCagr: number | null;
    revenueFromYear: number | null;
    revenueToYear: number;
    buybacksIncluded: boolean;
  } | null;
}
