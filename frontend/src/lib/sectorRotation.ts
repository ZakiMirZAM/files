// Sector Rotation Matrix, a metric x sector sensitivity grid.
//
// Rows are individual economic metrics (every metric the app tracks), grouped by
// theme and weighted by predictive power. Columns are the 11 sectors. Each metric
// has up to three readings:
//   up     , the metric is rising  -> uses `impact`
//   down   , the metric is falling -> uses `impact` negated
//   neutral, the metric is stable / in-range -> uses `neutral` (its own tilt),
//             because a steady reading is itself a regime signal (a flat yield
//             curve is late-cycle, calm credit is risk-on, stable inflation is
//             benign for growth). Metrics where a stable reading carries no real
//             signal have no `neutral` vector and contribute 0 when set neutral.
// A metric the user has not set at all is "unset" and contributes 0.
//
// scoreMatrix() is pure and data-free, so a future automated reader can derive
// the readings from the live payload and call it unchanged.
//
// Source: docs/analysis/sector-rotation-matrix.md.

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
  /** 0 = informational row: reading fills and renders but scores nothing by
   *  default. Single-commodity price rows sit here, a commodity's price level
   *  does not directly drive sector stock returns. User overrides still win. */
  weight: 0 | 1 | 2 | 3 | 4 | 5;
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

  // Inflation & commodities. Deliberately light: an inflation print only helps
  // a sector when the trend is durable AND not already priced by the market
  // (the auto-fill gates test both), and a single commodity's price level does
  // not directly drive sector stock returns, so the commodity price rows are
  // informational (weight 0) by default. Breakeven stays the one high-weight
  // inflation row because it is the market's own forward pricing of inflation.
  { id: "breakeven5y", name: "5-Year Breakeven Inflation", group: "Inflation & commodities", weight: 4, leadLag: "Lead", impact: V_INFL, neutral: N_INFL_BENIGN },
  { id: "ppi", name: "PPI YoY", group: "Inflation & commodities", weight: 2, leadLag: "Lead", impact: V_INFL, neutral: N_INFL_BENIGN },
  { id: "cpi", name: "CPI YoY", group: "Inflation & commodities", weight: 2, leadLag: "Coin", impact: V_INFL, neutral: N_INFL_BENIGN },
  { id: "import_prices", name: "Import Price Index YoY", group: "Inflation & commodities", weight: 0, leadLag: "Lead", impact: V_INFL, neutral: N_INFL_BENIGN },
  { id: "oil", name: "WTI / Brent / NatGas", group: "Inflation & commodities", weight: 0, leadLag: "Coin", impact: { Energy: 1, "Basic Materials": 1, "Real Estate": 1, "Consumer Cyclical": -1, Industrials: -1, Utilities: -1 } },
  { id: "copper", name: "Copper Price", group: "Inflation & commodities", weight: 0, leadLag: "Lead", impact: { "Basic Materials": 1, Industrials: 1, Energy: 1 } },
  { id: "iron_ore", name: "Iron Ore Price", group: "Inflation & commodities", weight: 0, leadLag: "Lead", impact: { "Basic Materials": 1, Industrials: 1 } },
  { id: "wheat", name: "Wheat Price", group: "Inflation & commodities", weight: 0, leadLag: "Coin", impact: { "Basic Materials": 1, "Consumer Defensive": -1 } },

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

  // Valuation, rising market multiples. P/E captures short-run multiple
  // expansion (risk-on momentum that favors high-beta growth & cyclicals and
  // pressures bond-proxy defensives); CAPE is the long-horizon mean-reversion
  // signal (a richly valued market predicts weaker forward returns concentrated
  // in expensive growth, so an elevated reading tilts toward cheaper value &
  // defensive sectors). Falling negates each; weight 2, weak short-term timing,
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

export interface SectorImpactSummary {
  /** Sectors this metric hurts when it is RISING (impact -1). */
  risingHurts: Sector[];
  /** Sectors this metric hurts when it is FALLING (impact +1 negated). */
  fallingHurts: Sector[];
}

/**
 * Which sectors an economic definition's metric hurts, read straight off the
 * rotation matrix impact vectors. Several matrix rows can share one economic
 * definition (both curve spreads point at #6), so the rows are unioned. Returns
 * null when no matrix row links to the definition, or when the linked rows
 * carry no negative tilt in either direction. Feeds the generated per-metric
 * exclusion question's hint on the Economic page.
 */
export function sectorsHurtByEconMetric(econNumber: number): SectorImpactSummary | null {
  const rising = new Set<Sector>();
  const falling = new Set<Sector>();
  let linked = false;
  for (const m of METRICS) {
    if (ECON_LINK[m.id] !== econNumber) continue;
    linked = true;
    for (const s of SECTORS) {
      const sign = m.impact[s];
      if (sign === -1) rising.add(s);
      else if (sign === 1) falling.add(s);
    }
  }
  if (!linked) return null;
  const risingHurts = SECTORS.filter((s) => rising.has(s));
  const fallingHurts = SECTORS.filter((s) => falling.has(s));
  if (risingHurts.length === 0 && fallingHurts.length === 0) return null;
  return { risingHurts, fallingHurts };
}

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

// ── Definitive (veto) weighting ──────────────────────────────────────────────
// A sector must not rank first off low-weight inflation votes while the
// high-weight risk metrics are adverse (the Basic-Materials-off-PPI failure).
// When enough risk rows read adverse, each capped group's POSITIVE contribution
// to a sector is limited to a share of that sector's total positive score.
// scoreMatrix stays untouched; this wrapper is opt-in and fully transparent
// (rawTotal, points removed, and rule tags are all returned for the UI).
//
// GATE: scoreMatrixWithVeto ships to the Sector Rotation page only after the
// historical backtest (lib/rotationBacktest.ts + scripts/rotation_backtest/)
// passes its pre-registered acceptance criteria and the owner signs off.

export interface VetoRiskRow {
  id: string;
  /** The reading that counts as adverse for this row. */
  adverse: Reading;
}

export interface VetoConfig {
  /** High-weight risk rows whose adverse readings arm the veto. */
  riskRows: VetoRiskRow[];
  /** Number of adverse risk readings required to arm the cap. */
  armThreshold: number;
  /** Groups whose positive contribution is capped while armed. */
  cappedGroups: string[];
  /** Max share of a sector's total positive score a capped group may supply. */
  groupCapPct: number;
  /** Sectors whose TOTAL positive score is scaled down while armed (the
   *  duration guard: long-duration sectors whose vectors underweight rates).
   *  Empty = no sector cap. */
  cappedSectors?: Sector[];
  /** Multiplier on a capped sector's positive score while armed (e.g. 0.6). */
  sectorCapPct?: number;
}

export const DEFAULT_VETO_CONFIG: VetoConfig = {
  riskRows: [
    { id: "hy_oas", adverse: "up" },
    { id: "spread_10y3m", adverse: "down" },
    { id: "spread_10y2y", adverse: "down" },
    { id: "vix", adverse: "up" },
    { id: "m2", adverse: "down" },
    { id: "fed_bs", adverse: "down" },
  ],
  armThreshold: 2,
  cappedGroups: ["Inflation & commodities"],
  groupCapPct: 0.35,
};

export interface VetoedSectorTotal extends SectorTotal {
  /** The plain scoreMatrix total before any cap. */
  rawTotal: number;
  /** Points removed by the cap (0 when unarmed or nothing to cap). */
  capped: number;
  /** Plain-language tags explaining what fired, empty when nothing did. */
  rules: string[];
}

/**
 * scoreMatrix with the definitive-weighting cap applied. Pure, same inputs as
 * scoreMatrix plus a config. Unarmed (fewer than armThreshold adverse risk
 * readings), the totals equal scoreMatrix exactly.
 */
export function scoreMatrixWithVeto(
  directions: Record<string, Reading>,
  weightOverrides: Record<string, number> = {},
  cfg: VetoConfig = DEFAULT_VETO_CONFIG,
): VetoedSectorTotal[] {
  // Per-sector totals plus per-sector positive contributions split by group.
  const totals = new Map<Sector, number>(SECTORS.map((s) => [s, 0]));
  const posByGroup = new Map<Sector, Map<string, number>>(SECTORS.map((s) => [s, new Map()]));
  const posTotal = new Map<Sector, number>(SECTORS.map((s) => [s, 0]));
  for (const m of METRICS) {
    const reading = directions[m.id];
    if (!reading) continue;
    const weight = weightOverrides[m.id] ?? m.weight;
    for (const s of SECTORS) {
      const contrib = weight * readingSign(m, s, reading);
      if (contrib === 0) continue;
      totals.set(s, (totals.get(s) as number) + contrib);
      if (contrib > 0) {
        posTotal.set(s, (posTotal.get(s) as number) + contrib);
        const g = posByGroup.get(s) as Map<string, number>;
        g.set(m.group, (g.get(m.group) ?? 0) + contrib);
      }
    }
  }

  const adverse = cfg.riskRows.filter((r) => directions[r.id] === r.adverse);
  const armed = adverse.length >= cfg.armThreshold;
  const armTag = armed
    ? `risk-armed: ${adverse.map((r) => `${r.id} ${r.adverse}`).join(", ")}`
    : null;

  return SECTORS.map((sector) => {
    const rawTotal = totals.get(sector) as number;
    let capped = 0;
    const rules: string[] = [];
    if (armed) {
      rules.push(armTag as string);
      const tp = posTotal.get(sector) as number;
      const groups = posByGroup.get(sector) as Map<string, number>;
      for (const g of cfg.cappedGroups) {
        const pos = groups.get(g) ?? 0;
        const allowed = cfg.groupCapPct * tp;
        if (pos > allowed) {
          const cut = pos - allowed;
          capped += cut;
          rules.push(`${g} capped: -${cut.toFixed(1)} pts`);
        }
      }
      if (cfg.cappedSectors?.includes(sector) && cfg.sectorCapPct != null && tp > 0) {
        const cut = (1 - cfg.sectorCapPct) * tp;
        if (cut > 0) {
          capped += cut;
          rules.push(`duration guard: -${cut.toFixed(1)} pts`);
        }
      }
    }
    return { sector, total: rawTotal - capped, rawTotal, capped, rules };
  }).sort((a, b) => b.total - a.total || a.sector.localeCompare(b.sector));
}

// ── Coverage normalization ───────────────────────────────────────────────────
// Sectors appear in different numbers of impact vectors, so their attainable
// maximum scores differ: broad-coverage sectors (Cyclicals, Industrials, Tech)
// can reach the +30s while narrow ones (Real Estate, Consumer Defensive) top
// out far lower, which biases the raw ranking toward coverage rather than
// favorability. Normalizing each total by the sector's attainable maximum
// removes that bias with zero fitted parameters. Backtested 2010-2026
// (scripts/rotation_backtest/): in the two windows containing all traded
// sectors it improved rank IC (0.073->0.081 and 0.106->0.121) AND cut the
// #1-in-bottom-half failure rate (41.4->35.2% and 40.0->35.8%), degrading
// nothing in the third.

/** Each sector's attainable maximum: the sum of weights over every row whose
 *  impact or neutral vector mentions it (best case = all in its favor). */
export function attainableMax(weightOverrides: Record<string, number> = {}): Map<Sector, number> {
  const max = new Map<Sector, number>(SECTORS.map((s) => [s, 0]));
  for (const m of METRICS) {
    const weight = weightOverrides[m.id] ?? m.weight;
    for (const s of SECTORS) {
      if ((m.impact[s] ?? m.neutral?.[s]) != null) {
        max.set(s, (max.get(s) as number) + weight);
      }
    }
  }
  return max;
}

/** scoreMatrix expressed as a percent of each sector's attainable maximum
 *  (one decimal), so narrow-coverage sectors compete on favorability. */
export function scoreMatrixNormalized(
  directions: Record<string, Reading>,
  weightOverrides: Record<string, number> = {},
): SectorTotal[] {
  const max = attainableMax(weightOverrides);
  return scoreMatrix(directions, weightOverrides)
    .map(({ sector, total }) => ({
      sector,
      total: (max.get(sector) as number) > 0
        ? Math.round((total / (max.get(sector) as number)) * 1000) / 10
        : 0,
    }))
    .sort((a, b) => b.total - a.total || a.sector.localeCompare(b.sector));
}

// ── Conviction ───────────────────────────────────────────────────────────────
// The backtest's conviction buckets (raw top score, 3-month horizon): months
// with a top score >= 24 were the matrix at its most reliable (IC 0.045, the
// widest top3-bottom3 spread, #1 in the bottom half only 28% of the time);
// months at 12-23 were the LEAST reliable (IC 0.005, failure 44%). A weak
// top score is a weak regime signal and the UI should say so.

export type Conviction = "low" | "moderate" | "high";
export const CONVICTION_HIGH = 24;
export const CONVICTION_LOW = 12;

/** Conviction tier from the RAW (unnormalized) top score. */
export function convictionFor(topRawScore: number): Conviction {
  if (topRawScore >= CONVICTION_HIGH) return "high";
  if (topRawScore >= CONVICTION_LOW) return "moderate";
  return "low";
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

/** Clamp a user-entered weight to the documented 0..5 integer scale.
 *  0 keeps a row visible and fillable while contributing nothing to the score. */
export function clampWeight(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(5, Math.round(n)));
}
