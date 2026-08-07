// Individual-stock metric definition library (~150 defs, arriving in numbered
// batches of ~5). Unlike economicDefinitions.ts (49 files, ~0.9 MB, eager),
// this set is ~3x larger when complete, so each markdown body is code-split:
// src/content/individual/NNN-*.md becomes its own lazy chunk, fetched the
// first time its dropdown is expanded. Collapsed headers come from the
// filename so they render before the body loads.
//
// Filenames: NNN-Title-Words.md (e.g. 002-Return-On-Equity.md). The NNN prefix
// is the metric number; the stem (hyphens -> spaces) is the collapsed-header
// title (TITLE_OVERRIDES for punctuation a filename can't carry).
// 000-INDEX.md is the catalog/checklist, not a metric.
//
// Number -> page-section ranges live ONLY in SECTION_RANGES below. The full
// catalog (every number, title and batch) is in content/individual/000-INDEX.md
// and docs/prompts/metric-definitions-master-prompt.md.

const LOADERS = import.meta.glob(
  ["../content/individual/*.md", "!**/000-INDEX.md"],
  {
    query: "?raw",
    import: "default",
  },
) as Record<string, () => Promise<string>>;

export type IndividualSectionKey =
  | "valuation" //        001 quality score + 002-025 ratios -> ValuationCard
  | "perShare" //         026-035 -> PerShareSection
  | "dupont" //           036-042 -> DupontSection
  | "trends" //           043-070 -> MetricsTrendsSection
  | "forecast" //         071 FCFF + WACC -> ForecastSection
  | "eva" //              072 -> EVAValuationSection
  | "residualIncome" //   073 -> ResidualIncomeSection
  | "equityModels" //     074 -> EquityModelsSection
  | "valuationExtras" //  075-076 -> ValuationExtrasSection
  | "shenanigans" //      077-080 -> ShenanigansSection
  | "verticalIncome" //   081-110 -> VerticalAnalysisSection (income statement)
  | "verticalBalance" //  111-150 -> VerticalAnalysisSection (balance sheet)
  | "verticalCashflow" //151-180 -> VerticalAnalysisSection (cash flow)
  | "valueLenses" //      193-196 -> ReverseDcfSection + ValueLensesSection
  // Education-first overhaul: new definition bands in the empty 500-599 block.
  | "valuationMechanics" // 500-518 -> ForecastSection + EVAValuationSection line items
  | "growth" //           519-524 -> GrowthReconciliationSection + the growth-viability deck
  | "epv" //              525-529 -> ValueLensesSection EPV tiles
  | "normalizedEarnings" // 530-544 -> NormalizedEarnings + EarningsBridge + Earnings Volatility
  | "credit" //           545-559 -> CreditAnalysisSection
  | "strategicResources" // 560-566 -> StrategicResourcesSection
  | "sevenPowers" //      567-577 -> PowersSection
  | "esg" //              578-582 -> EsgSection
  | "execComp" //         583-590 -> ManagementCompSection
  | "catalystTrap" //     591-595 -> CatalystTrapSection
  | "filings" //          596-599 -> EventsSection (Latest Filings)
  // Uses of cash. The 500-599 block is fully carved up and 197-200 is only four
  // slots wide, so this lands in the empty 800s. anyDefByNumber tries the
  // individual resolver first and no other surface reaches here (economic is
  // 600+NN, credit 700+NN, and both miss at 800), so the band is free.
  | "capitalAllocation" // 800-849 -> UsesOfCashSection
  // Leverage decomposition of ROE, ROE = ROIC + D/E x [ROIC - i(1-t)]. Follows
  // capitalAllocation into the 800s for the same reason. ROE (002), ROIC (003)
  // and Debt To Equity (012) are reused from their existing bands rather than
  // duplicated; only the terms unique to the identity are numbered here.
  | "leverageRoe" // 850-869 -> LeverageRoeSection
  // The multi-stage intrinsic-valuation engine (model selection, stage counts,
  // per-track fundamental growth, stable-phase discipline, H model). Follows
  // the other post-599 bands into the 800s.
  | "intrinsicModels"; // 870-889 -> ForecastSection / StageToggle / EquityModelsSection

/** Inclusive number ranges per section, the ONE place ranges are defined. */
const SECTION_RANGES: ReadonlyArray<readonly [IndividualSectionKey, number, number]> = [
  ["valuation", 1, 25],
  ["perShare", 26, 35],
  ["dupont", 36, 42],
  ["trends", 43, 70],
  ["forecast", 71, 71],
  ["eva", 72, 72],
  ["residualIncome", 73, 73],
  ["equityModels", 74, 74],
  ["valuationExtras", 75, 76],
  ["shenanigans", 77, 80],
  ["verticalIncome", 81, 110],
  ["verticalBalance", 111, 150],
  ["verticalCashflow", 151, 180],
  // Value-creation, growth and risk metrics shared with the comparative matrix
  // (EVA, NOPAT, WACC, cost of equity, excess return, justified P/B, NIM,
  // revenue/net-income growth, beta). They show in the Fundamental Trends grid.
  ["trends", 181, 190],
  // Composite forensic scores rendered in the Shenanigans section (the 77-80
  // band was already full), Altman Z-Score (191) and Beneish M-Score (192).
  ["shenanigans", 191, 192],
  // Value lenses beside the DCF: Market-Implied Growth (193, reverse DCF),
  // Earnings Power Value (194), Tobin's Q (195), Owner Earnings (196).
  ["valueLenses", 193, 196],
  // Education-first overhaul bands (500-599, previously empty). Files land here
  // as each section is wired; an empty band is harmless (no file, no def).
  ["valuationMechanics", 500, 518],
  // Life-cycle-aware growth estimation: fundamental growth,
  // the sales-to-capital reinvestment bridge, the stage classifier, the
  // growth-viability question deck, and the changing-ROIC efficiency term.
  // 197-200 is free but only four slots wide, and 201 is the comparative
  // surface's first number, so the block lives in the individual 500s instead.
  ["growth", 519, 524],
  ["epv", 525, 529],
  ["normalizedEarnings", 530, 544],
  ["credit", 545, 559],
  ["strategicResources", 560, 566],
  ["sevenPowers", 567, 577],
  ["esg", 578, 582],
  ["execComp", 583, 590],
  ["catalystTrap", 591, 595],
  ["filings", 596, 599],
  // Uses of cash (see the note on IndividualSectionKey above for why the 800s).
  // The six cash-use metrics themselves already have definitions in the vertical
  // bands (capex 159, R&D 085, acquisitions 160, buybacks 167, dividends 168,
  // debt repayment 165, operating cash flow 024), so they are reused rather than
  // duplicated here. Only the section overview and the derived share metric are new.
  ["capitalAllocation", 800, 849],
  ["leverageRoe", 850, 869],
  ["intrinsicModels", 870, 889],
];

/** Per-number exceptions; takes precedence over SECTION_RANGES. */
const SECTION_OVERRIDES: Partial<Record<number, IndividualSectionKey>> = {};

/** Titles a filename can't express (slashes, parentheses, minus signs). */
const TITLE_OVERRIDES: Partial<Record<number, string>> = {
  14: "Net Debt / EBITDA",
  17: "EV / EBIT",
  19: "Income Quality (CFO / NI)",
  20: "FCF / Total Debt",
  22: "SBC / Revenue",
  40: "Financial Leverage (Equity Multiplier)",
  44: "ROIC − WACC Spread",
  50: "Operating Leverage (DOL)",
  53: "(EBITDA − Capex) / Interest",
  76: "R&D Capitalization",
  195: "Tobin's Q",
  508: "Intrinsic Value per Share",
  523: "Efficiency Growth (Changing ROIC)",
  510: "EV / EBITDA Exit Cross-Check per Share",
  511: "P / FCF Exit Cross-Check per Share",
  512: "β = 1 Intrinsic per Share",
  535: "SBC / Operating Cash Flow",
  536: "Goodwill / Assets",
  550: "Equity / Total Assets (Capital Adequacy)",
  854: "ROIC − After-Tax Debt Cost",
};

export interface IndividualMetricDef {
  number: number;
  title: string;
  section: IndividualSectionKey;
  /** Lazily fetch this definition's verbatim markdown (separate Vite chunk). */
  load: () => Promise<string>;
}

function sectionFor(n: number): IndividualSectionKey | undefined {
  const override = SECTION_OVERRIDES[n];
  if (override) return override;
  return SECTION_RANGES.find(([, lo, hi]) => n >= lo && n <= hi)?.[0];
}

/** Ordered list of all known individual metric defs (by file number). */
export const INDIVIDUAL_METRIC_DEFS: IndividualMetricDef[] = Object.entries(LOADERS)
  .flatMap(([path, load]): IndividualMetricDef[] => {
    const m = /\/(\d+)-([^/]+)\.md$/.exec(path);
    if (!m) return [];
    const number = parseInt(m[1], 10);
    if (number === 0) return []; // 000-INDEX.md is the catalog, not a metric
    const section = sectionFor(number);
    if (!section) {
      if (import.meta.env.DEV) {
        console.warn(
          `individualDefinitions: ${path} (#${number}) matches no SECTION_RANGES entry, ignored`,
        );
      }
      return [];
    }
    const title = TITLE_OVERRIDES[number] ?? m[2].replace(/-/g, " ").trim();
    return [{ number, title, section, load }];
  })
  .sort((a, b) => a.number - b.number);

if (import.meta.env.DEV) {
  const seen = new Set<number>();
  for (const d of INDIVIDUAL_METRIC_DEFS) {
    if (seen.has(d.number)) {
      console.warn(`individualDefinitions: duplicate metric number ${d.number}`);
    }
    seen.add(d.number);
  }
}

/** Definitions for one page section, ordered by number. Empty until that batch arrives. */
export function defsForSection(section: IndividualSectionKey): IndividualMetricDef[] {
  return INDIVIDUAL_METRIC_DEFS.filter((d) => d.section === section);
}

const DEF_BY_NUMBER = new Map(INDIVIDUAL_METRIC_DEFS.map((d) => [d.number, d]));

/** Look up a single definition by its catalog number. */
export function defByNumber(number: number): IndividualMetricDef | undefined {
  return DEF_BY_NUMBER.get(number);
}

// ---------------------------------------------------------------------------
// Label -> definition resolver. Lets any metric label shown in the UI (panel
// shorthand like "ROE", FMP line-item names, trends-grid labels) resolve to
// its definition number so the label can be made clickable.
// ---------------------------------------------------------------------------

const normLabel = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** UI labels that differ from the definition titles/filenames. */
const LABEL_ALIASES: Array<[string, number]> = [
  // Ratios panel shorthand
  ["ROE", 2], ["ROIC", 3], ["ROA", 4], ["ROS", 5],
  ["Debt service cov", 10], ["Interest cov", 11],
  ["Debt/Equity", 12], ["Debt/Assets", 13],
  ["Div yield", 15], ["P/B", 16], ["PEG", 18],
  ["Income quality", 19], ["Sloan accruals", 21],
  ["OCF", 24], ["FCF", 25],
  // Per-share tile labels
  ["Revenue / Share", 26], ["EPS", 27], ["Net Income / Share", 27],
  ["OCF / Share", 28], ["FCF / Share", 29], ["Book Value / Share", 30],
  ["Cash / Share", 31], ["Tangible BV / Share", 32], ["Equity / Share", 33],
  ["Capex / Share", 34], ["Interest Debt / Share", 35],
  // Trends-grid labels that differ from titles
  ["Net Margin", 5], ["Operating Margin", 39], ["Equity Multiplier", 40],
  ["Sales / Invested Capital", 45], ["Capex / Depreciation", 46],
  ["FCF / Net Income", 49], ["Operating Leverage", 50],
  ["Liabilities / Equity", 51], ["Net Debt / OCF", 52],
  ["COGS / Inventory", 54], ["P / E", 61], ["EV / EBITDA", 62], ["P / FCF", 63],
  // Statement-trends tiles mapped to their covering definitions
  ["Gross Profit Ratio", 6], ["Operating Income Ratio", 39],
  // FMP cash-flow line names
  ["Net Income Cashflow", 100], ["Depreciation and Amortization Cashflow", 92],
  ["Inventory Cashflow", 156], ["Accounts Receivables", 155], ["Accounts Payables", 157],
  ["Net Cash Provided By Operating Activities", 24],
  ["Investments In Property Plant And Equipment", 159],
  ["Sales Maturities Of Investments", 162],
  ["Net Cash Used Provided By Financing Activities", 170],
  ["Cash At Beginning Of Period", 173], ["Cash At End Of Period", 173],
  // FMP balance-sheet line names
  ["Property Plant Equipment Net", 118],
  ["Accumulated Other Comprehensive Income Loss", 147],
  ["Total Equity", 148],
  // Combined/residual FMP lines mapped to their closest covering definition
  ["Minority Interest Preferred Stock", 143],
  ["Other Assets", 124],
  ["Other Liabilities", 138],
  ["Other Total Stockholders Equity", 148],
  ["Total Liabilities And Stockholders Equity", 127],
  ["Total Liabilities and Total Equity", 127],
  // Value-creation / growth / risk metrics shared with the comparative matrix.
  // ROIC reuses the existing ratio definition (#3).
  ["EVA", 181], ["NOPAT", 182], ["WACC", 183], ["Cost of Equity", 184],
  ["Excess Return", 185], ["Excess Return (ROE − Ke)", 185],
  ["Justified P/B", 186], ["Net Interest Margin", 187],
  ["Revenue Growth", 188], ["Net Income Growth", 189], ["Beta", 190],
  // Credit Analysis section (545-559). Card headings that differ from filename stems.
  ["Synthetic rating", 546], ["Synthetic credit rating", 546],
  ["Debt capacity", 547],
  ["Natural capital structure", 548],
  ["Composite credit score", 549], ["Credit score", 549], ["Credit Analysis", 545],
  ["Equity / Total Assets", 550], ["Equity / Total Assets (capital adequacy)", 550],
  // FCFF / DCF valuation mechanics (§2, ForecastSection). Reuse existing defs where a
  // concept already has one; new DCF-mechanics defs live in 500-513.
  ["EBIT", 94], ["EBIT × (1 − tax)", 23], ["Reinvestment", 47], ["FCFF", 25],
  ["Cash & investments", 113], ["Cash and investments", 113], ["Gross debt", 141],
  ["EV/EBITDA implied growth", 193], ["Exit P/FCF", 63], ["Exit EV/EBITDA", 62],
  ["Risk-free", 500],
  ["Weights", 503], ["Weights (E / D)", 503], ["Capital weights", 503],
  ["PV of terminal value", 505], ["Terminal Value", 505],
  ["Intrinsic / share", 508], ["Intrinsic per share", 508], ["Intrinsic value per share", 508],
  ["DCF intrinsic", 508], ["DCF intrinsic value per share", 508],
  ["EV/EBITDA exit cross-check / share", 510], ["EV/EBITDA exit cross-check", 510],
  ["P/FCF exit cross-check / share", 511], ["P/FCF exit cross-check", 511],
  ["β = 1 intrinsic / share", 512],
  // Growth reconciliation + the growth-viability deck. 519-523.
  ["Fundamental growth", 519], ["Fundamental growth rate", 519],
  ["Growth reconciliation", 519], ["What its fundamentals fund", 519],
  ["Sales-to-capital", 520], ["Sales-to-capital ratio", 520],
  ["Life-cycle stage", 521], ["Life cycle", 521],
  ["Growth viability", 522], ["Is this growth real?", 522],
  ["Efficiency growth", 523], ["Changing ROIC", 523],
  // EVA valuation mechanics (§3, EVAValuationSection). New defs live in 514-518.
  ["ROIC − WACC", 44],
  ["MVA", 515], ["Market Value Added", 515],
  ["EVA intrinsic / share", 508],
  // EPV / value lenses (§4, ValueLensesSection). New EPV defs live in 525-528.
  ["EPV per share", 525], ["Price / EPV", 526], ["Growth premium /sh", 527],
  ["Capitalized at WACC", 183], ["Q today", 195],
  // Earnings volatility flag (§8, ShenanigansSection). New def 540.
  ["Earnings volatility (CV of EBIT)", 540], ["Earnings volatility", 540],
  ["Revenue-growth volatility", 540],
  // Strategic Resources chips (§5) reuse the R&D Capitalization def (076).
  ["Research asset on file", 76], ["R&D / revenue", 76],
  // 7 Powers chips (§9) each open the 7 Powers overview (567).
  ["Scale Economies", 567], ["Network Economies", 567], ["Counter-Positioning", 567],
  ["Switching Costs", 567], ["Branding", 567], ["Cornered Resource", 567], ["Process Power", 567],
  // Executive compensation SBC tiles (§11). SBC -> Stock Based Compensation (151).
  ["SBC", 151], ["SBC / net income", 151],
  // Normalized Earnings cards (§6). New defs live in 530-537.
  ["Debt value of leases", 531], ["Debt (+ leases)", 531],
  ["Investment income (after tax)", 534], ["Investment income", 534], ["Share of net income", 534],
  ["Margin (reported vs median)", 533],
  ["Goodwill & Stock Comp", 536], ["Goodwill / assets", 536],
  ["SBC / operating cash flow", 535],
  ["Securities held aside", 112],
];

const LABEL_TO_NUMBER: Map<string, number> = (() => {
  const map = new Map<string, number>();
  for (const [path] of Object.entries(LOADERS)) {
    const m = /\/(\d+)-([^/]+)\.md$/.exec(path);
    if (!m) continue;
    const number = parseInt(m[1], 10);
    if (number === 0 || !DEF_BY_NUMBER.has(number)) continue;
    map.set(normLabel(m[2]), number); // filename stem, e.g. "Net Debt To EBITDA"
  }
  for (const d of INDIVIDUAL_METRIC_DEFS) map.set(normLabel(d.title), d.number); // display titles
  for (const [label, number] of LABEL_ALIASES) map.set(normLabel(label), number); // explicit aliases win
  return map;
})();

/**
 * Resolve a UI metric label to its definition number, if one exists. Falls back
 * to retrying with a trailing parenthetical stripped, so labels like
 * "Tax Burden (NI/EBT)" or "Gross-margin swing (YoY)" resolve to their base metric.
 */
export function resolveDefNumber(label: string): number | undefined {
  const direct = LABEL_TO_NUMBER.get(normLabel(label));
  if (direct != null) return direct;
  const stripped = label.replace(/\s*\([^)]*\)\s*$/, "");
  if (stripped !== label) return LABEL_TO_NUMBER.get(normLabel(stripped));
  return undefined;
}
