export type SectionKey = "economic" | "credit" | "sector" | "industry" | "comparative" | "individual" | "final_review";

export interface QualitativeQuestion {
  id: string;
  text: string;
  hint?: string;
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
  start: string;            // ISO date — shading start (first day of the peak month)
  end: string;              // ISO date — shading end (first day after the trough month)
  label?: string;          // episode name, e.g. "Great Recession", "COVID-19 recession"
  range?: string;          // exact published month range, e.g. "Dec 2007 – Jun 2009"
}

// ── Individual analysis (full IndividualSnapshot) ────────────────────────────

export interface IndividualValuation {
  dcfIntrinsicPerShare: number | null;
  impliedPrice: number | null;
  marginOfSafety: number | null;  // decimal: 0.20 = 20% upside
  fcfGrowthUsed: number | null;   // decimal: 0.08 = 8% growth assumed
  wacc: number;
  terminalGrowth: number;
  projectionYears: number;
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

// ── Forward FCFF forecast (Damodaran firm valuation) ─────────────────────────

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
  beta: number | null;
  riskFreeRate: number;
  equityRiskPremium: number;
  // Marginal rate used for the debt tax shield (Damodaran Ch.8) and the firm's
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

// ── Life-cycle-aware growth estimation (Damodaran Ch.11, Figure 11.6) ────────

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
  growthCap: number;
  growthFloor: number;
  marginTarget: number | null;
  marginTargetSource: string;
  mode: "regression" | "shadow" | "fundamental";
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
  assumptions: ForecastAssumptions;
  waccBuild?: WaccBuild | null;
  // Damodaran Ch.11: historical vs fundamental growth, and the reinvestment bridge.
  growthReconciliation?: GrowthReconciliation | null;
  lifecycle?: CompanyLifecycle | null;
  // Reverse DCF (Penman): the growth today's price implies, same engine inverted.
  reverseDcf?: ReverseDcf | null;
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
}

// ── Normalized-earnings bridge (Damodaran, Investment Valuation Ch.9) ─────────

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

// ── Earnings bridge — reported income walk from the 10-K XBRL (Ch.9) ──────────

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
  status: "solved" | "below_band" | "above_band";
  impliedGrowth: number | null;
  multipleRoots?: boolean;
  roots?: number[] | null;
  baseGrowth: number;
  historicalGrowth?: number | null;
  priceUsed: number;
  beyondModelCap?: boolean;
  note?: string;
}

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

// ── Industry life-cycle stage (Porter, Competitive Strategy Ch.8) ─────────────

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

// ── Strategic groups (Porter, Competitive Strategy Ch.7) ──────────────────────

export interface StrategicGroupPoint {
  ticker: string;
  operatingMargin: number;
  marketCapUsd: number;
  logMcap: number;
  leverage?: number | null;
  revenueGrowth?: number | null;
  group?: string;
  badges?: string[];
}

export interface StrategicGroups {
  applicable: boolean;
  reason?: string;
  industry?: string;
  asOf?: string | null;
  axes?: {
    marginMedian: number;
    mcapMedianUsd: number;
    logMcapMedian: number | null;
  };
  points?: StrategicGroupPoint[];
  groups?: { key: string; label: string; members: string[] }[];
  unclassified?: string[];
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

// Company credit analysis (Ziegel). Mirrors the backend _credit_analysis dict.
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
  // Growth-viability due-diligence deck (Damodaran Ch.11 + quality-of-growth work).
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
  events?: CompanyEvent[] | null;
  dupont?: Dupont | null;
  usesOfCash?: UsesOfCash | null;
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
  displayMetricColumns?: MetricMeta[] | null;  // /api/comparative — fundamental metric columns
  commodities?: Commodity[] | null;            // /api/economic
  treasuryYields?: Metric[] | null;            // /api/economic — 3M/1Y/2Y/10Y level yields (maturity switcher)
  fedModel?: FedModel | null;                  // /api/economic — earnings yield vs 1Y Treasury
  sp500Valuation?: Sp500Valuation | null;      // /api/economic — Damodaran S&P-500 DCF / fair value
  lifecycle?: IndustryLifecycle | null;        // /api/industry, /api/sector — Porter life-cycle stage
  scorecard?: GroupScorecard | null;           // /api/sector, /api/industry — value score + fired integrity questions
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

/** SectionData.scorecard — the group's value score plus FIRED questions only. */
export interface GroupScorecard {
  valueScore: number | null;
  rank: number | null;
  peers: number | null;
  integrity: IntegrityCheck[];
}

// ── Fed model: earnings yield vs 1-Year Treasury (DGS1) ───────────────────────

export interface FedModelSnapshot {
  earningsYield: number | null;        // %  (Damodaran trailing S&P-500 EPS ÷ yfinance price)
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

// ── S&P-500 valuation (Damodaran two-stage DCF / implied ERP) ─────────────────

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

export type SectorMetricUnit = "$" | "%" | "x" | "d" | "yrs" | "b" | "n" | "#";

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
  /** Column names — sectors in the 11-sector matrix, industry names in the
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
