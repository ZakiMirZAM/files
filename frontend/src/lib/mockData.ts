import type { Metric, SectionData, IndustryEntry } from "./types";

const NOW = new Date();
const CURRENT_YEAR = NOW.getFullYear();
const FIRST_YEAR = 2012;

const ANNUAL_PERIODS: string[] = [];
for (let y = FIRST_YEAR; y <= CURRENT_YEAR; y++) ANNUAL_PERIODS.push(String(y));

function quarterEndDates(): string[] {
  const out: string[] = [];
  for (let y = FIRST_YEAR; y <= CURRENT_YEAR; y++) {
    for (const md of ["03-31", "06-30", "09-30", "12-31"]) {
      const d = `${y}-${md}`;
      if (new Date(d) <= NOW) out.push(d);
    }
  }
  return out;
}

function monthEndDates(): string[] {
  const out: string[] = [];
  for (let y = FIRST_YEAR; y <= CURRENT_YEAR; y++) {
    for (let m = 1; m <= 12; m++) {
      const lastDay = new Date(y, m, 0).getDate();
      const d = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      if (new Date(d) <= NOW) out.push(d);
    }
  }
  return out;
}

function tradingDates(): string[] {
  // Roughly weekly cadence for mock-data tractability (~700 points vs ~3500)
  const out: string[] = [];
  const start = new Date(`${FIRST_YEAR}-01-02`);
  for (let d = new Date(start); d <= NOW; d.setDate(d.getDate() + 5)) {
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function hash01(input: string, salt = ""): number {
  let h = 5381;
  const s = input + ":" + salt;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (Math.abs(h) % 10000) / 10000;
}

interface SeriesOpts {
  base: number;
  drift: number;        // value change per "unit time" (per year by default)
  noiseAmp: number;     // amplitude of seasonal/cyclic noise
  cycleYears?: number;  // cycle length in years
  jitter?: number;      // phase shift
  recessionShock?: { date: string; magnitude: number }; // depress values around date
}

function buildSeries(periods: string[], opts: SeriesOpts): { period: string; value: number }[] {
  const { base, drift, noiseAmp, cycleYears = 4, jitter = 0, recessionShock } = opts;
  return periods.map((p) => {
    const dt = parseDate(p);
    const yearsFromStart = (dt.getTime() - new Date(`${FIRST_YEAR}-01-01`).getTime()) / (365.25 * 86400_000);
    let v = base + drift * yearsFromStart;
    const phase = (yearsFromStart / cycleYears) * 2 * Math.PI + jitter;
    v += noiseAmp * (Math.sin(phase) + 0.4 * Math.cos(phase * 2.3));
    if (recessionShock) {
      const shockTime = new Date(recessionShock.date).getTime();
      const yearsFromShock = (dt.getTime() - shockTime) / (365.25 * 86400_000);
      // Gaussian-ish dip around shock
      v -= recessionShock.magnitude * Math.exp(-Math.pow(yearsFromShock / 0.6, 2));
    }
    return { period: p, value: +v.toFixed(3) };
  });
}

function parseDate(p: string): Date {
  // "2024" or "2024-03-31"
  if (p.length === 4) return new Date(`${p}-12-31`);
  return new Date(p);
}

function metric(
  number: number,
  name: string,
  unit: Metric["unit"],
  trend: { period: string; value: number }[],
  definition: string,
  analysis: string,
  vertical: Metric["vertical"],
  opts: Partial<
    Pick<
      Metric,
      | "frequency"
      | "displayType"
      | "isRateOfChange"
      | "altTrend"
      | "altUnit"
      | "baseVariantLabel"
      | "altVariantLabel"
    >
  > = {},
): Metric {
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    number,
    name,
    unit,
    latestValue: trend[trend.length - 1]?.value ?? 0,
    trend,
    definition,
    analysis,
    vertical,
    frequency: opts.frequency ?? "annual",
    displayType: opts.displayType ?? "bar",
    isRateOfChange: opts.isRateOfChange ?? false,
    ...(opts.altTrend ? { altTrend: opts.altTrend } : {}),
    ...(opts.altUnit != null ? { altUnit: opts.altUnit } : {}),
    ...(opts.baseVariantLabel ? { baseVariantLabel: opts.baseVariantLabel } : {}),
    ...(opts.altVariantLabel ? { altVariantLabel: opts.altVariantLabel } : {}),
  };
}

const MOCK_BANNER =
  "⚠ MOCK DATA, FastAPI server is offline. Run `uvicorn backend.api:app --reload --port 8000` to see real FRED + financials.db data.";

// COVID recession band (the only NBER recession since 2012)
const RECESSION_BANDS = [
  { start: "2020-02-01", end: "2020-05-01", label: "COVID-19 recession", range: "Feb 2020 – Apr 2020" },
];

export const ECONOMIC_DATA: SectionData = {
  section: "economic",
  scopeKey: "global",
  title: "Economic Analysis",
  subtitle: MOCK_BANNER,
  recessionBands: RECESSION_BANDS,
  metrics: [
    metric(1, "Real GDP Growth", "%",
      buildSeries(quarterEndDates(), {
        base: 2.4, drift: 0.0, noiseAmp: 1.5,
        cycleYears: 3, recessionShock: { date: "2020-04-01", magnitude: 12 },
      }),
      "Annualised inflation-adjusted change in total US economic output (FRED: A191RL1Q225SBEA, quarterly).",
      "Above ~2.5% historically supports rising equity multiples. Two consecutive negative quarters marks technical recession.",
      [],
      { frequency: "quarterly", displayType: "line", isRateOfChange: true }),
    metric(2, "Unemployment Rate", "%",
      buildSeries(monthEndDates(), {
        base: 7.8, drift: -0.4, noiseAmp: 0.4,
        cycleYears: 5, recessionShock: { date: "2020-04-01", magnitude: -7 },
      }),
      "Headline U-3 unemployment rate (FRED: UNRATE, monthly).",
      "Sub-4% = tight labor market. Sahm Rule (≥0.5pp rise over 3mo avg) has triggered every US recession since 1970.",
      [],
      { frequency: "monthly", displayType: "line" }),
    metric(3, "CPI Level", "",
      buildSeries(monthEndDates(), {
        base: 229, drift: 5.2, noiseAmp: 1.5, cycleYears: 5,
      }),
      "Consumer Price Index level (CPIAUCSL, monthly, 1982-84=100).",
      "The underlying price level. Rising slope = inflation; flat = price stability; declining = deflation.",
      [],
      { frequency: "monthly", displayType: "line" }),
    metric(4, "CPI YoY Inflation", "%",
      buildSeries(monthEndDates(), {
        base: 1.8, drift: 0.05, noiseAmp: 1.8, cycleYears: 3,
        recessionShock: { date: "2022-06-01", magnitude: -5 }, // negative shock = inverted; gives the 2022 inflation spike
      }),
      "Year-over-year change in the Consumer Price Index.",
      "Persistently above 3% pressures central banks to keep rates restrictive. Below 1.5% signals deflation risk.",
      [],
      { frequency: "monthly", displayType: "line", isRateOfChange: true }),
    metric(5, "10Y - 2Y Treasury Spread", "%",
      buildSeries(tradingDates(), {
        base: 1.4, drift: -0.05, noiseAmp: 0.7, cycleYears: 4, jitter: 0.5,
      }),
      "Spread between 10-year and 2-year US Treasury yields (T10Y2Y).",
      "Inversions (negative spread) have preceded every US recession since 1955.",
      [],
      { frequency: "daily", displayType: "line" }),
    metric(6, "10Y - 3M Treasury Spread", "%",
      buildSeries(tradingDates(), {
        base: 1.9, drift: -0.06, noiseAmp: 0.9, cycleYears: 4, jitter: 1.1,
      }),
      "Spread between 10-year and 3-month US Treasury yields (T10Y3M).",
      "More reliable than 10Y-2Y per NY Fed research. Persistent inversion (>3 months) raises recession probability above 30%.",
      [],
      { frequency: "daily", displayType: "line" }),
    metric(7, "Federal Debt as % of GDP", "%",
      buildSeries(ANNUAL_PERIODS, {
        base: 95, drift: 2.5, noiseAmp: 1.5,
      }),
      "Gross US federal debt as a share of GDP (GFDGDPA188S, annual).",
      "Above ~90% historically associated with slower growth.",
      []),
    metric(8, "S&P 500 Level", "",
      buildSeries(tradingDates(), {
        base: 1400, drift: 230, noiseAmp: 180, cycleYears: 3,
        recessionShock: { date: "2020-03-23", magnitude: 400 },
      }),
      "S&P 500 daily close (FRED: SP500).",
      "The reference benchmark. Compare slope vs M2 growth, if SP500 outpaces M2, multiple expansion is doing the heavy lifting.",
      [],
      { frequency: "daily", displayType: "line" }),
    metric(9, "M2 Money Supply ($B)", "$",
      buildSeries(monthEndDates(), {
        base: 10500, drift: 850, noiseAmp: 150, cycleYears: 4,
      }),
      "M2 money supply level in billions (M2SL, monthly). Toggle to Real for the inflation-adjusted series (M2REAL).",
      "Rapid expansions historically precede asset-price inflation; rare contractions coincide with risk-off moves. The Real view strips out inflation, when Real M2 contracts, money is losing ground to prices even if nominal M2 is flat.",
      [],
      {
        frequency: "monthly", displayType: "line",
        altTrend: buildSeries(monthEndDates(), {
          base: 9800, drift: 280, noiseAmp: 160, cycleYears: 4,
          recessionShock: { date: "2022-06-01", magnitude: 600 },
        }),
        altUnit: "$", baseVariantLabel: "Nominal", altVariantLabel: "Real",
      }),
  ],
};

function makeGroupMetrics(scopeKey: string, label: string): Metric[] {
  const j = hash01(scopeKey, label);
  return [
    metric(1, "Revenue Growth", "%",
      buildSeries(ANNUAL_PERIODS, {
        base: 4 + j * 16, drift: 0.3, noiseAmp: 3, cycleYears: 3, jitter: j,
        recessionShock: { date: "2020-12-31", magnitude: 8 },
      }),
      `Mean YoY revenue growth across all public companies in ${scopeKey}, market-cap weighted.`,
      "Compare against broader US growth (~5-7%). Sustained outperformance signals structural expansion.",
      [{ label: "vs market avg", value: +(j * 4 - 1).toFixed(1), unit: "%" }],
      { isRateOfChange: true }),
    metric(2, "Gross Profit Ratio", "%",
      buildSeries(ANNUAL_PERIODS, {
        base: 25 + j * 45, drift: 0.4, noiseAmp: 1.5, jitter: j + 0.3,
      }),
      "Average gross margin across the group.",
      "Industries with consistently rising gross margins are consolidating or developing moats.",
      [{ label: "Top quartile", value: 40 + j * 30, unit: "%" }]),
    metric(3, "ROE", "%",
      buildSeries(ANNUAL_PERIODS, {
        base: 5 + j * 25, drift: 0.5, noiseAmp: 1.8, jitter: j + 0.7,
      }),
      "Mean Return on Equity across the group.",
      "Sustained ROE > 15% historically correlates with above-market returns.",
      []),
    metric(4, "Debt to Equity", "x",
      buildSeries(ANNUAL_PERIODS, {
        base: 0.3 + j * 1.5, drift: 0.02, noiseAmp: 0.08, jitter: j + 1.1,
      }),
      "Average financial leverage in the group.",
      "Above 1.5x raises concerns when interest coverage falls below 4x.",
      [{ label: "Interest coverage", value: +(2 + j * 8).toFixed(1), unit: "x" }]),
  ];
}

export function makeIndustryData(industry: string): SectionData {
  return {
    section: "industry",
    scopeKey: industry,
    title: `${industry}, Industry Analysis`,
    subtitle: MOCK_BANNER,
    metrics: makeGroupMetrics(industry, "industry"),
  };
}

export function makeSectorData(sector: string): SectionData {
  return {
    section: "sector",
    scopeKey: sector,
    title: `${sector}, Sector Analysis`,
    subtitle: MOCK_BANNER,
    metrics: makeGroupMetrics(sector, "sector"),
  };
}

export function makeComparativeData(industry: string): SectionData {
  const j = hash01(industry, "comp");
  return {
    section: "comparative",
    scopeKey: industry,
    title: `${industry}, Comparative Stock Analysis`,
    subtitle: MOCK_BANNER,
    metrics: [
      metric(1, "Top 5, Revenue CAGR (5yr)", "%",
        buildSeries(ANNUAL_PERIODS, {
          base: 5 + j * 18, drift: 0.3, noiseAmp: 2, jitter: j,
          recessionShock: { date: "2020-12-31", magnitude: 6 },
        }),
        `5-year compound revenue growth for the top five in ${industry}.`,
        "Spread between leader and laggard signals winner-take-most dynamics.",
        [{ label: "Leader vs avg", value: +(j * 8).toFixed(1), unit: "%" }],
        { isRateOfChange: true }),
      metric(2, "Top 5, Gross Margin", "%",
        buildSeries(ANNUAL_PERIODS, {
          base: 30 + j * 45, drift: 0.25, noiseAmp: 1.1, jitter: j + 0.3,
        }),
        "Gross margin across the top five public companies.",
        "Margin dispersion is predictive of future stock performance.",
        []),
      metric(3, "Top 5, FCF Margin", "%",
        buildSeries(ANNUAL_PERIODS, {
          base: 8 + j * 25, drift: 0.4, noiseAmp: 1.3, jitter: j + 0.7,
        }),
        "FCF as a % of revenue for the top five.",
        "Companies converting 20%+ of revenue to FCF tend to dominate long-term returns.",
        []),
    ],
  };
}

export function makeIndividualData(ticker: string): SectionData {
  const t = ticker.toUpperCase();
  const j = hash01(t, "ticker");
  const scale = 1 + j * 9; // 1x to 10x, different company sizes
  return {
    section: "individual",
    scopeKey: t,
    title: `${t}, Individual Stock Analysis`,
    subtitle: MOCK_BANNER,
    metrics: [
      metric(1, "Revenue", "$",
        buildSeries(ANNUAL_PERIODS, {
          base: 20e9 * scale, drift: 2e9 * scale, noiseAmp: 800e6 * scale, jitter: j,
        }),
        "Total reported revenue for the fiscal year.",
        `${t}'s revenue trajectory vs industry.`,
        [{ label: "% growth YoY", value: +(5 + j * 25).toFixed(1), unit: "%" }]),
      metric(2, "Operating Income", "$",
        buildSeries(ANNUAL_PERIODS, {
          base: 6e9 * scale, drift: 700e6 * scale, noiseAmp: 300e6 * scale, jitter: j + 0.5,
        }),
        "Earnings from core operations before interest and tax.",
        "Faster ops growth than revenue = real operating leverage.",
        [{ label: "% of Revenue", value: +(8 + j * 25).toFixed(1), unit: "%" }]),
      metric(3, "Return on Equity (ROE)", "%",
        buildSeries(ANNUAL_PERIODS, {
          base: 5 + j * 30, drift: 0.5, noiseAmp: 2.5, jitter: j + 1.1,
        }),
        "Net income / shareholders' equity.",
        "DuPont: ROE = Net Margin × Asset Turnover × Leverage.",
        [{ label: "Leverage (Assets/Equity)", value: +(1.2 + j * 2).toFixed(2), unit: "x" }]),
    ],
  };
}

export const INDUSTRIES: IndustryEntry[] = [
  { name: "Aerospace & Defense", companies: 28, sector: "Industrials" },
  { name: "Banks - Diversified", companies: 31, sector: "Financial Services" },
  { name: "Biotechnology", companies: 142, sector: "Healthcare" },
  { name: "Consumer Electronics", companies: 18, sector: "Technology" },
  { name: "Internet Content & Information", companies: 41, sector: "Communication Services" },
  { name: "Oil & Gas Energy", companies: 56, sector: "Energy" },
  { name: "Semiconductors", companies: 39, sector: "Technology" },
  { name: "Software - Application", companies: 84, sector: "Technology" },
];

export const SECTORS: IndustryEntry[] = [
  { name: "Financial Services", companies: 1391 },
  { name: "Healthcare", companies: 868 },
  { name: "Technology", companies: 591 },
  { name: "Industrials", companies: 550 },
  { name: "Consumer Cyclical", companies: 400 },
  { name: "Real Estate", companies: 387 },
  { name: "Energy", companies: 204 },
  { name: "Consumer Defensive", companies: 175 },
  { name: "Communication Services", companies: 170 },
  { name: "Basic Materials", companies: 133 },
  { name: "Utilities", companies: 124 },
];
