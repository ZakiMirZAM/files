// Sector Rotation Matrix — a metric x sector sensitivity grid.
//
// Rows are individual economic metrics (every metric the app tracks), grouped by
// theme and weighted by predictive power. Columns are the 11 sectors. Each metric
// has up to three readings:
//   up      — the metric is rising  -> uses `impact`
//   down    — the metric is falling -> uses `impact` negated
//   neutral — the metric is stable / in-range -> uses `neutral` (its own tilt),
//             because a steady reading is itself a regime signal (a flat yield
//             curve is late-cycle, calm credit is risk-on, stable inflation is
//             benign for growth). Metrics where a stable reading carries no real
//             signal have no `neutral` vector and contribute 0 when set neutral.
// A metric the user has not set at all is "unset" and contributes 0.
//
// scoreMatrix() is pure and data-free, so a future automated reader can derive
// the readings from the live payload and call it unchanged.
//
// Source: docs/analysis/sector-rotation-matrix.md (Ilmanen, Expected Returns
// Ch.26/10 — equities excel in stable/disinflationary regimes, credit spreads
// track growth; Fidelity business-cycle sector framework; general finance).

export const SECTORS = [
  "Consumer Cyclical",
  "Financial Services",
  "Industrials",
  "Technology",
  "Basic Materials",
  "Energy",
  "Real Estate",
  "Communication Services",
  "Healthcare",
  "Consumer Defensive",
  "Utilities",
] as const;

export type Sector = (typeof SECTORS)[number];

/** Short column codes for the matrix header (title shows the full name). */
export const SECTOR_COLS: { sector: Sector; code: string }[] = [
  { sector: "Consumer Cyclical", code: "CYC" },
  { sector: "Financial Services", code: "FIN" },
  { sector: "Industrials", code: "IND" },
  { sector: "Technology", code: "TEC" },
  { sector: "Basic Materials", code: "MAT" },
  { sector: "Energy", code: "ENE" },
  { sector: "Real Estate", code: "RE" },
  { sector: "Communication Services", code: "COM" },
  { sector: "Healthcare", code: "HC" },
  { sector: "Consumer Defensive", code: "STPL" },
  { sector: "Utilities", code: "UTL" },
];

/** A metric's current reading. Absent from the map = unset (contributes 0). */
export type Reading = "up" | "neutral" | "down";
export type Impact = Partial<Record<Sector, 1 | -1>>;

export interface MetricRow {
  id: string;
  name: string;
  group: string;
  weight: 1 | 2 | 3 | 4 | 5;
  leadLag: "Lead" | "Coin" | "Lag" | "Struct";
  /** Effect on each sector when this metric RISES (down negates this). */
  impact: Impact;
  /** Effect when this metric is STABLE / in-range. Omitted = no neutral signal. */
  neutral?: Impact;
}

export const GROUPS = [
  "Rates & yield curve",
  "Credit & risk",
  "Inflation & commodities",
  "Growth & activity",
  "Labor & consumer",
  "Liquidity & money",
  "External & dollar",
  "Valuation",
  "Market & context",
] as const;

// Rising-reading vectors.
const V_INFL: Impact = { Energy: 1, "Basic Materials": 1, "Real Estate": 1, Technology: -1, "Consumer Cyclical": -1, Utilities: -1 };
const V_GROW: Impact = { "Consumer Cyclical": 1, Industrials: 1, "Basic Materials": 1, Energy: 1, "Financial Services": 1, Utilities: -1, "Consumer Defensive": -1, Healthcare: -1 };
const V_STRESS: Impact = { "Financial Services": -1, "Consumer Cyclical": -1, "Real Estate": -1, Utilities: 1, "Consumer Defensive": 1, Healthcare: 1 };
const V_LIQ: Impact = { Technology: 1, "Consumer Cyclical": 1, Utilities: -1, "Consumer Defensive": -1, Healthcare: -1 };
const V_USD: Impact = { "Basic Materials": -1, Energy: -1, Technology: -1 };
const V_STEEP: Impact = { "Financial Services": 1, "Consumer Cyclical": 1, Industrials: 1 };
const V_RATES: Impact = { "Financial Services": 1, Utilities: -1, "Real Estate": -1, Technology: -1 };

// Neutral / stable-reading vectors (each is its own regime signal).
const N_CURVE: Impact = { Energy: 1, "Basic Materials": 1, Healthcare: 1, "Consumer Defensive": 1, Utilities: 1, "Consumer Cyclical": -1 }; // flat curve = late cycle
const N_RISKON: Impact = { "Consumer Cyclical": 1, Industrials: 1, "Financial Services": 1, Utilities: -1, "Consumer Defensive": -1 }; // calm credit / vol = risk-on
const N_INFL_BENIGN: Impact = { Technology: 1, "Communication Services": 1, "Consumer Cyclical": 1, Energy: -1, "Basic Materials": -1 }; // stable inflation favors growth
const N_MIDCYCLE: Impact = { Technology: 1, "Communication Services": 1, Industrials: 1, "Consumer Defensive": -1, Utilities: -1 }; // steady growth = mid cycle
const N_RATES_BENIGN: Impact = { "Real Estate": 1, Utilities: 1, Technology: 1, "Financial Services": -1 }; // stable rates ease duration pressure
const N_LIQ_STEADY: Impact = { Technology: 1, "Consumer Cyclical": 1, "Consumer Defensive": -1 }; // steady liquidity = mild risk-on

export const METRICS: MetricRow[] = [
  // Rates & yield curve
  { id: "spread_10y3m", name: "10Y-3M Treasury Spread", group: "Rates & yield curve", weight: 5, leadLag: "Lead", impact: V_STEEP, neutral: N_CURVE },
  { id: "spread_10y2y", name: "10Y-2Y Treasury Spread", group: "Rates & yield curve", weight: 5, leadLag: "Lead", impact: V_STEEP, neutral: N_CURVE },
  { id: "yields", name: "Treasury Yields (3M/1Y/2Y/10Y)", group: "Rates & yield curve", weight: 3, leadLag: "Coin", impact: V_RATES, neutral: N_RATES_BENIGN },
  { id: "mortgage30", name: "30-Year Mortgage Rate", group: "Rates & yield curve", weight: 4, leadLag: "Lead", impact: { "Real Estate": -1, "Consumer Cyclical": -1, Utilities: -1 }, neutral: { "Real Estate": 1, "Consumer Cyclical": 1 } },
  { id: "fed_model", name: "Fed Model (earnings yield vs Treasury)", group: "Rates & yield curve", weight: 3, leadLag: "Coin", impact: { "Consumer Cyclical": 1, Technology: 1, Industrials: 1 } },

  // Credit & risk
  { id: "hy_oas", name: "High-Yield Credit Spread (OAS)", group: "Credit & risk", weight: 5, leadLag: "Lead", impact: V_STRESS, neutral: N_RISKON },
  { id: "sofr_ois", name: "SOFR-OIS Spread", group: "Credit & risk", weight: 3, leadLag: "Lead", impact: V_STRESS },
  { id: "vix", name: "VIX", group: "Credit & risk", weight: 4, leadLag: "Coin", impact: { Technology: -1, "Consumer Cyclical": -1, Utilities: 1, "Consumer Defensive": 1, Healthcare: 1 }, neutral: N_RISKON },
  { id: "gold_silver", name: "Gold/Silver Ratio", group: "Credit & risk", weight: 3, leadLag: "Lead", impact: { "Consumer Cyclical": -1, Technology: -1, Utilities: 1, "Consumer Defensive": 1, Healthcare: 1 } },
  { id: "ci_loans", name: "C&I Loans YoY", group: "Credit & risk", weight: 3, leadLag: "Coin", impact: { "Financial Services": 1, "Consumer Cyclical": 1, Industrials: 1 } },

  // Inflation & commodities
  { id: "breakeven5y", name: "5-Year Breakeven Inflation", group: "Inflation & commodities", weight: 4, leadLag: "Lead", impact: V_INFL, neutral: N_INFL_BENIGN },
  { id: "ppi", name: "PPI YoY", group: "Inflation & commodities", weight: 4, leadLag: "Lead", impact: V_INFL, neutral: N_INFL_BENIGN },
  { id: "cpi", name: "CPI YoY", group: "Inflation & commodities", weight: 3, leadLag: "Coin", impact: V_INFL, neutral: N_INFL_BENIGN },
  { id: "import_prices", name: "Import Price Index YoY", group: "Inflation & commodities", weight: 3, leadLag: "Lead", impact: V_INFL, neutral: N_INFL_BENIGN },
  { id: "oil", name: "WTI / Brent / NatGas", group: "Inflation & commodities", weight: 3, leadLag: "Coin", impact: { Energy: 1, "Basic Materials": 1, "Real Estate": 1, "Consumer Cyclical": -1, Industrials: -1, Utilities: -1 } },
  { id: "copper", name: "Copper Price", group: "Inflation & commodities", weight: 3, leadLag: "Lead", impact: { "Basic Materials": 1, Industrials: 1, Energy: 1 } },
  { id: "iron_ore", name: "Iron Ore Price", group: "Inflation & commodities", weight: 3, leadLag: "Lead", impact: { "Basic Materials": 1, Industrials: 1 } },
  { id: "wheat", name: "Wheat Price", group: "Inflation & commodities", weight: 2, leadLag: "Coin", impact: { "Basic Materials": 1, "Consumer Defensive": -1 } },

  // Growth & activity
  { id: "copper_gold", name: "Copper/Gold Ratio", group: "Growth & activity", weight: 4, leadLag: "Lead", impact: V_GROW, neutral: N_MIDCYCLE },
  { id: "resi_fixed_inv", name: "Residential Fixed Investment", group: "Growth & activity", weight: 4, leadLag: "Lead", impact: { "Consumer Cyclical": 1, "Financial Services": 1, "Real Estate": 1, Industrials: 1, "Consumer Defensive": -1, Healthcare: -1, Utilities: -1 } },
  { id: "heavy_trucks", name: "Heavy Truck Sales", group: "Growth & activity", weight: 4, leadLag: "Lead", impact: { Industrials: 1, "Basic Materials": 1, Energy: 1, "Consumer Cyclical": 1 } },
  { id: "indpro", name: "Industrial Production", group: "Growth & activity", weight: 3, leadLag: "Coin", impact: { Industrials: 1, "Basic Materials": 1, Energy: 1 }, neutral: N_MIDCYCLE },
  { id: "capacity", name: "Capacity Utilization", group: "Growth & activity", weight: 3, leadLag: "Coin", impact: { Industrials: 1, "Basic Materials": 1, Energy: 1 }, neutral: N_MIDCYCLE },
  { id: "gdp", name: "Real GDP Growth", group: "Growth & activity", weight: 3, leadLag: "Coin", impact: V_GROW, neutral: N_MIDCYCLE },
  { id: "output_gap", name: "GDP Output Gap", group: "Growth & activity", weight: 3, leadLag: "Coin", impact: { Energy: 1, "Basic Materials": 1, Industrials: 1 } },
  { id: "aud_jpy", name: "AUD/JPY Exchange Rate", group: "Growth & activity", weight: 3, leadLag: "Lead", impact: { "Consumer Cyclical": 1, "Basic Materials": 1, Energy: 1, Industrials: 1, "Consumer Defensive": -1, Healthcare: -1, Utilities: -1 } },

  // Labor & consumer
  { id: "sentiment", name: "Consumer Sentiment (UMich)", group: "Labor & consumer", weight: 4, leadLag: "Lead", impact: { "Consumer Cyclical": 1, "Financial Services": 1, "Consumer Defensive": -1 } },
  { id: "retail", name: "Retail Sales YoY", group: "Labor & consumer", weight: 3, leadLag: "Coin", impact: { "Consumer Cyclical": 1, "Consumer Defensive": -1 } },
  { id: "payrolls", name: "Total Nonfarm Payrolls", group: "Labor & consumer", weight: 3, leadLag: "Coin", impact: { "Consumer Cyclical": 1, "Financial Services": 1, Industrials: 1, "Consumer Defensive": -1, Healthcare: -1 } },
  { id: "real_wages", name: "Real Avg Hourly Earnings YoY", group: "Labor & consumer", weight: 3, leadLag: "Coin", impact: { "Consumer Cyclical": 1, "Consumer Defensive": -1 } },
  { id: "unemployment", name: "Unemployment Rate / U-6", group: "Labor & consumer", weight: 2, leadLag: "Lag", impact: { "Consumer Cyclical": -1, "Financial Services": -1, Industrials: -1, "Consumer Defensive": 1, Healthcare: 1, Utilities: 1 } },
  { id: "participation", name: "Labor Force Participation Rate", group: "Labor & consumer", weight: 2, leadLag: "Lag", impact: { "Consumer Cyclical": 1 } },
  { id: "savings", name: "Personal Savings Rate", group: "Labor & consumer", weight: 2, leadLag: "Coin", impact: { "Consumer Cyclical": -1, "Consumer Defensive": 1 } },

  // Liquidity & money
  { id: "m2", name: "M2 / Real M2 YoY", group: "Liquidity & money", weight: 4, leadLag: "Lead", impact: V_LIQ, neutral: N_LIQ_STEADY },
  { id: "fed_bs", name: "Fed Balance Sheet", group: "Liquidity & money", weight: 4, leadLag: "Lead", impact: V_LIQ, neutral: N_LIQ_STEADY },
  { id: "m1", name: "M1 / Real M1 YoY", group: "Liquidity & money", weight: 2, leadLag: "Lead", impact: V_LIQ },
  { id: "tga", name: "Treasury General Account", group: "Liquidity & money", weight: 2, leadLag: "Lead", impact: { Technology: -1, "Consumer Cyclical": -1, Utilities: 1, "Consumer Defensive": 1, Healthcare: 1 } },
  { id: "sp_m2", name: "S&P 500 / M2 (and / M1)", group: "Liquidity & money", weight: 2, leadLag: "Coin", impact: { "Consumer Cyclical": -1, Technology: -1 } },

  // External & dollar
  { id: "usd_twi", name: "Trade-Weighted USD Index", group: "External & dollar", weight: 4, leadLag: "Lead", impact: V_USD },
  { id: "usd_afe", name: "Broad USD Index (Adv. Economies)", group: "External & dollar", weight: 4, leadLag: "Lead", impact: V_USD },
  { id: "trade_bal", name: "Trade Balance / Current Account", group: "External & dollar", weight: 2, leadLag: "Coin", impact: { Industrials: 1, "Basic Materials": 1 } },
  { id: "exports", name: "Real Exports / Imports YoY", group: "External & dollar", weight: 2, leadLag: "Coin", impact: { "Basic Materials": 1, Industrials: 1, Energy: 1 } },

  // Valuation — rising market multiples. P/E captures short-run multiple
  // expansion (risk-on momentum that favors high-beta growth & cyclicals and
  // pressures bond-proxy defensives); CAPE is the long-horizon mean-reversion
  // signal (a richly valued market predicts weaker forward returns concentrated
  // in expensive growth, so an elevated reading tilts toward cheaper value &
  // defensive sectors). Falling negates each; weight 2 — weak short-term timing,
  // strong long-term context.
  { id: "sp500_pe", name: "S&P 500 P/E Ratio", group: "Valuation", weight: 2, leadLag: "Coin",
    impact: { Technology: 1, "Consumer Cyclical": 1, "Communication Services": 1, Industrials: 1, Utilities: -1, "Consumer Defensive": -1, Healthcare: -1 },
    neutral: { "Consumer Defensive": 1, Healthcare: 1, Utilities: 1 } },
  { id: "cape", name: "Shiller CAPE (PE10)", group: "Valuation", weight: 2, leadLag: "Struct",
    impact: { Utilities: 1, "Consumer Defensive": 1, Healthcare: 1, "Financial Services": 1, Energy: 1, "Basic Materials": 1, Technology: -1, "Consumer Cyclical": -1, "Communication Services": -1 } },

  // Market & context
  { id: "sp500", name: "S&P 500 YoY / Quarterly Return", group: "Market & context", weight: 2, leadLag: "Coin", impact: { "Consumer Cyclical": 1, Technology: 1 } },
  { id: "nonfin_debt", name: "Total Non-Financial Debt % of GDP", group: "Market & context", weight: 1, leadLag: "Lag", impact: {} },
  { id: "population", name: "US Population YoY", group: "Market & context", weight: 1, leadLag: "Struct", impact: {} },
];

// Matrix metric id -> economic definition number (1-50, see economicDefinitions
// CHART_METRIC_NAME). The Sector Rotation page opens these in the shared sidebar
// panel via ECON_PANEL_OFFSET + number. Metrics with no economic definition
// (wheat, M1, S&P/M2, S&P return) are omitted and render as plain
// text. Some matrix metrics share one economic definition (both curve spreads ->
// the yield-curve spread definition; the consolidated commodities row -> WTI).
export const ECON_LINK: Record<string, number> = {
  spread_10y3m: 6, spread_10y2y: 6, yields: 13, mortgage30: 45, fed_model: 23,
  hy_oas: 28, sofr_ois: 34, vix: 37, gold_silver: 41, ci_loans: 29,
  breakeven5y: 22, ppi: 4, cpi: 3, import_prices: 9, oil: 17, copper: 16, iron_ore: 48,
  copper_gold: 39, resi_fixed_inv: 10, heavy_trucks: 15, indpro: 20, capacity: 19,
  gdp: 1, output_gap: 21, aud_jpy: 40, sentiment: 12, retail: 26, payrolls: 2,
  real_wages: 11, unemployment: 50, participation: 25, savings: 27,
  m2: 5, fed_bs: 33, tga: 35, usd_twi: 7, usd_afe: 18, trade_bal: 30, exports: 8,
  nonfin_debt: 32, population: 49, cape: 51,
};

/** Whether a metric carries a distinct neutral (stable-reading) signal. */
export function hasNeutral(m: MetricRow): boolean {
  return m.neutral != null && Object.keys(m.neutral).length > 0;
}

/** The signed effect of a reading on one sector, used for the cell and the score. */
export function readingSign(m: MetricRow, sector: Sector, reading: Reading): number {
  if (reading === "neutral") return m.neutral?.[sector] ?? 0;
  const base = m.impact[sector] ?? 0;
  return reading === "down" ? -base : base;
}

export interface SectorTotal {
  sector: Sector;
  total: number;
}

/**
 * Pure weighted column sum. Each set metric contributes weight x readingSign for
 * its current reading (up, neutral, or down). Unset metrics contribute nothing.
 * `weightOverrides` replaces a metric's default weight by id. Sorted highest
 * first (ties: sector name for stability).
 */
export function scoreMatrix(
  directions: Record<string, Reading>,
  weightOverrides: Record<string, number> = {},
): SectorTotal[] {
  const totals = new Map<Sector, number>(SECTORS.map((s) => [s, 0]));
  for (const m of METRICS) {
    const reading = directions[m.id];
    if (!reading) continue; // unset
    const weight = weightOverrides[m.id] ?? m.weight;
    for (const s of SECTORS) {
      const sign = readingSign(m, s, reading);
      if (sign !== 0) totals.set(s, (totals.get(s) as number) + weight * sign);
    }
  }
  return [...totals.entries()]
    .map(([sector, total]) => ({ sector, total }))
    .sort((a, b) => b.total - a.total || a.sector.localeCompare(b.sector));
}

export interface GroupShare {
  group: string;
  weightSum: number;
  count: number;
  pct: number;
}

/**
 * Each broad group's share of the matrix's total weight (effective weights,
 * honoring overrides). This is the structural balance of the score: how much say
 * each topic has before any reading is set. Sorted highest share first.
 */
export function groupWeightShares(weightOverrides: Record<string, number> = {}): GroupShare[] {
  const sum = new Map<string, number>();
  const cnt = new Map<string, number>();
  let total = 0;
  for (const m of METRICS) {
    const w = weightOverrides[m.id] ?? m.weight;
    sum.set(m.group, (sum.get(m.group) ?? 0) + w);
    cnt.set(m.group, (cnt.get(m.group) ?? 0) + 1);
    total += w;
  }
  return [...sum.entries()]
    .map(([group, weightSum]) => ({
      group,
      weightSum,
      count: cnt.get(group) ?? 0,
      pct: total > 0 ? (weightSum / total) * 100 : 0,
    }))
    .sort((a, b) => b.weightSum - a.weightSum || a.group.localeCompare(b.group));
}

/** Clamp a user-entered weight to the documented 1..5 integer scale. */
export function clampWeight(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(5, Math.round(n)));
}
