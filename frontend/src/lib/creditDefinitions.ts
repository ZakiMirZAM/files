// Credit & Banking definition library (metrics 1-17), grounded in Arnold
// Ziegel's "Fundamentals of Credit and Credit Analysis". Mirrors
// economicDefinitions.ts: the verbatim markdown for each metric is bundled from
// src/content/credit/ via Vite's `?raw` import, nothing is retyped or
// paraphrased. Each entry maps to a backend metric by its exact `name`
// (chartMetricName) so the live chart attaches inside the dropdown; when no
// series is available the chart area shows a "data source pending" note and the
// full definition still renders.

const RAW = import.meta.glob("../content/credit/*.md", {
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
 * Questions" as a list. The questions render in the metric dropdown with answer
 * boxes, so the sidebar shows the body only.
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

/** number -> exact backend metric `name`. Must match backend/api.py credit_banks. */
const CHART_METRIC_NAME: Record<number, string | undefined> = {
  1: "High-Yield Credit Spread (OAS)",
  2: "Investment-Grade Credit Spread (OAS)",
  3: "Baa Corporate Spread over 10Y",
  4: "Net % of Banks Tightening C&I Standards",
  5: "Bank Credit (YoY %)",
  6: "C&I Loans (YoY %)",
  7: "Commercial Real Estate Loans (YoY %)",
  8: "Consumer Loans (YoY %)",
  9: "Bank Deposits (YoY %)",
  10: "Delinquency Rate, All Bank Loans",
  11: "Net Charge-Off Rate, All Loans",
  12: "Delinquency Rate, C&I Loans",
  13: "Delinquency Rate, Single-Family Mortgages",
  14: "Bank Equity to Total Assets",
  15: "Net Interest Margin, US Banks",
  16: "Reserves of Depository Institutions ($B)",
  17: "Financial Stress Index (St. Louis Fed)",
};

export interface CreditMetricDef {
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

/** Ordered list of all defined credit metrics (by file number). */
export const CREDIT_METRIC_DEFS: CreditMetricDef[] = Object.keys(MARKDOWN_BY_NUMBER)
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
// number namespace (individual 1-180, comparative 201-299, industry 301-399,
// sector 401-499, economic 600+). Credit definitions enter under a fresh offset
// of 700 so they never collide: panel number = CREDIT_PANEL_OFFSET + credit number.
// ---------------------------------------------------------------------------

export const CREDIT_PANEL_OFFSET = 700;

const CREDIT_BY_NUMBER = new Map(CREDIT_METRIC_DEFS.map((d) => [d.number, d]));

interface PanelDef {
  number: number;
  title: string;
  load: () => Promise<string>;
}

// Cache the wrapper per panel number so the lookup returns a STABLE reference
// (the panel's markdown-load effect keys on def identity; a fresh object each
// call would re-load and flicker on every render).
const PANEL_DEF_CACHE = new Map<number, PanelDef>();

/** Resolve a panel number (>= CREDIT_PANEL_OFFSET) to its credit definition. */
export function creditDefByPanelNumber(panel: number): PanelDef | undefined {
  if (panel <= CREDIT_PANEL_OFFSET) return undefined;
  const cached = PANEL_DEF_CACHE.get(panel);
  if (cached) return cached;
  const def = CREDIT_BY_NUMBER.get(panel - CREDIT_PANEL_OFFSET);
  if (!def) return undefined;
  const wrapper: PanelDef = { number: panel, title: def.title, load: () => Promise.resolve(def.body) };
  PANEL_DEF_CACHE.set(panel, wrapper);
  return wrapper;
}
