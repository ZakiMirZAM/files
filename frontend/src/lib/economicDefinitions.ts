// Canonical Economic Metrics definition library (1-56 plus 66-67 macro metrics
// shown as dropdowns, plus 57-65 for the commodity tiles and the two valuation
// panels, which render their own UI and surface their definition through the sidebar).
//
// The verbatim markdown for each metric is bundled straight from the source
// files under src/content/economic/ via Vite's `?raw` import, nothing is
// retyped or paraphrased. Each entry maps to a backend/mock metric by its exact
// `name` (chartMetricName) so the live chart attaches inside the dropdown; when
// no series is available (not on FRED), the chart area shows a "data source
// pending" note and the full definition still renders.

const RAW = import.meta.glob("../content/economic/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** number -> verbatim markdown, keyed off the `NN-...md` filename prefix. */
const MARKDOWN_BY_NUMBER: Record<number, string> = {};
for (const [path, content] of Object.entries(RAW)) {
  const m = /\/(\d+)-[^/]+\.md$/.exec(path);
  if (!m) continue;
  const n = parseInt(m[1], 10);
  if (n === 0) continue; // 00-INDEX.md is the table of contents, not a metric
  MARKDOWN_BY_NUMBER[n] = content;
}

function titleFrom(markdown: string, fallback: string): string {
  const h1 = /^#\s+(.+)$/m.exec(markdown);
  return h1 ? h1[1].trim() : fallback;
}

/**
 * Split a definition into its body (Parts 1-5) and the "Ten Precise Qualitative
 * Questions" as a list. The questions are rendered in the metric dropdown with
 * answer boxes, so the sidebar shows the body only.
 */
const QUESTIONS_HEADING = /\n#{2,3}\s+Ten\s+Precise\s+Qualitative\s+Questions\s*\n/i;

function splitDefinition(markdown: string): { body: string; questions: string[] } {
  const m = QUESTIONS_HEADING.exec(markdown);
  if (!m) return { body: markdown, questions: [] };
  const body = `${markdown.slice(0, m.index).trimEnd()}\n`;
  const questions = markdown
    .slice(m.index + m[0].length)
    .split(/\n(?=\s*\d+\.\s)/)
    .map((p) => p.trim().replace(/^\d+\.\s*/, "").replace(/\s+/g, " ").trim())
    .filter((q) => q.length > 0);
  return { body, questions };
}

/** number -> exact backend/mock metric `name`. Undefined = no FRED series (stub). */
const CHART_METRIC_NAME: Record<number, string | undefined> = {
  1: "Real GDP Growth",
  2: "Total Nonfarm Payrolls",
  3: "CPI YoY Inflation",
  4: "PPI YoY Inflation",
  5: "M2 Money Supply ($B)",
  6: "10Y - 2Y Treasury Spread",
  7: "Trade-Weighted USD Index",
  8: "Real Exports YoY %",
  9: "Import Price Index",
  10: "Residential Fixed Investment ($B)",
  11: "Real Avg Hourly Earnings YoY %",
  12: "Consumer Sentiment (UMich)",
  13: "10-Year Treasury Yield",
  14: undefined, // ISM Manufacturing PMI, not on FRED
  15: "Heavy Truck Sales (SAAR)",
  16: "Copper Price",
  17: "WTI Crude Oil",
  18: "Broad USD Index (Adv. Economies)",
  19: "Capacity Utilization",
  20: "Industrial Production Index",
  21: "GDP Output Gap",
  22: "5-Year Breakeven Inflation",
  23: "S&P 500 Earnings Yield", // Inverse PE vs interest-rate yields
  24: "U-6 Unemployment Rate",
  25: "Labor Force Participation Rate",
  26: "Retail Sales YoY %",
  27: "Personal Savings Rate",
  28: "High-Yield Credit Spread (OAS)",
  29: "C&I Loans YoY %",
  30: "Trade Balance ($M)",
  31: "Current Account % of GDP",
  32: "Total Non-Financial Debt % of GDP",
  33: "Fed Balance Sheet ($M)",
  34: "SOFR-OIS Spread (proxy)", // SOFR − EFFR proxy (true OIS not on FRED)
  35: "Treasury General Account ($M)",
  36: undefined, // AAII Bull-Bear spread, not on FRED
  37: "VIX",
  38: undefined, // BofA Global Fund Manager Survey, not on FRED
  39: "Copper/Gold Ratio",
  40: "AUD/JPY Exchange Rate",
  41: "Gold/Silver Ratio",
  42: "Equity Risk Premium (implied)", // implied two-stage ERP
  43: undefined, // Sovereign Credit Rating, not on FRED
  44: undefined, // Bank Net Interest Margin, FRED series discontinued (2020)
  45: "30-Year Mortgage Rate",
  46: undefined, // US Crude Oil Inventory, not on FRED
  47: undefined, // China Monthly Steel Production, not on FRED
  48: "Iron Ore Price Index",
  49: "US Population YoY %",
  50: "Unemployment Rate",
  51: "Shiller CAPE (PE10)",
  52: "Global Economic Policy Uncertainty",
  53: "US Economic Policy Uncertainty",
  54: "Geopolitical Risk Index",
  55: "S&P 500 / Real M2 Normalised",
  56: "Bank Loans & Leases (YoY %)",
  66: "10-Year Real Yield (TIPS)",
  67: "Net Liquidity ($)",
  68: "S&P 500 Expected Return (building blocks)",
  69: "AAII Asset Allocation Survey", // monthly since 1987, hand-dropped workbook (aaii.com blocks fetching)
};

export interface EconomicMetricDef {
  number: number;
  title: string;
  /** Verbatim markdown including the qualitative questions. */
  markdown: string;
  /** The definition body (Parts 1-5) with the qualitative questions removed. */
  body: string;
  /** The "Ten Precise Qualitative Questions", one string each. */
  questions: string[];
  /** Exact backend metric name whose chart fills this dropdown, if any. */
  chartMetricName?: string;
}

/** Ordered list of all defined economic metrics (by file number). */
export const ECONOMIC_METRIC_DEFS: EconomicMetricDef[] = Object.keys(MARKDOWN_BY_NUMBER)
  .map((k) => parseInt(k, 10))
  .sort((a, b) => a - b)
  .map((number) => {
    const markdown = MARKDOWN_BY_NUMBER[number];
    const { body, questions } = splitDefinition(markdown);
    return {
      number,
      title: titleFrom(markdown, `Metric ${number}`),
      markdown,
      body,
      questions,
      chartMetricName: CHART_METRIC_NAME[number],
    };
  });

// ---------------------------------------------------------------------------
// Sidebar-panel bridge. The shared DefinitionPanel keys definitions by a single
// number namespace (individual 1-180, comparative 201-299, ...). Economic
// definitions are numbered 1-50 and would collide, so they enter the panel under
// an offset: panel number = ECON_PANEL_OFFSET + economic number. This lets the
// Sector Rotation page open an economic metric's definition in the same sidebar
// the individual page uses, without retyping any definition.
// ---------------------------------------------------------------------------

export const ECON_PANEL_OFFSET = 600;

// Definitions 57-65 (commodity tiles + the two valuation panels) have no metric
// dropdown, so they surface only through the sidebar. Their qualitative questions
// therefore stay in the sidebar text; every dropdown metric moves its questions
// into the dropdown body instead. 70 is the "How the economy works" concept
// overview behind the Understand the Economy First section: sidebar-only, no chart.
export const ECON_PANEL_ONLY = new Set([57, 58, 59, 60, 61, 62, 63, 64, 65, 70]);

const ECON_BY_NUMBER = new Map(ECONOMIC_METRIC_DEFS.map((d) => [d.number, d]));

interface PanelDef {
  number: number;
  title: string;
  load: () => Promise<string>;
}

// Cache the wrapper per panel number so the lookup returns a STABLE reference.
// The panel's markdown-load effect keys on the def object identity; a fresh
// object each call would make it re-load (flicker) on every render.
const PANEL_DEF_CACHE = new Map<number, PanelDef>();

/** Resolve a panel number (>= ECON_PANEL_OFFSET) to its economic definition. */
export function economicDefByPanelNumber(panel: number): PanelDef | undefined {
  if (panel <= ECON_PANEL_OFFSET) return undefined;
  const cached = PANEL_DEF_CACHE.get(panel);
  if (cached) return cached;
  const def = ECON_BY_NUMBER.get(panel - ECON_PANEL_OFFSET);
  if (!def) return undefined;
  // The markdown is already bundled, so "load" just resolves it; this matches
  // the lazy AnyDef shape the panel expects for individual/surface defs. Dropdown
  // metrics show the body only (their questions live in the dropdown); panel-only
  // defs keep the full text since they have nowhere else to show the questions.
  const text = ECON_PANEL_ONLY.has(def.number) ? def.markdown : def.body;
  const wrapper: PanelDef = { number: panel, title: def.title, load: () => Promise.resolve(text) };
  PANEL_DEF_CACHE.set(panel, wrapper);
  return wrapper;
}
