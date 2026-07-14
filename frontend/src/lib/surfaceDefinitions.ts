// Definition library for the three GROUP surfaces: comparative (companies within
// one industry), industry (one industry aggregate), and sector (one sector
// aggregate). Mirrors individualDefinitions.ts: each markdown body is code-split
// (src/content/<surface>/NNN-*.md -> its own lazy chunk) and the collapsed title
// comes from the filename or a TITLE_OVERRIDES entry.
//
// Numbering is the surface: 201-299 comparative, 301-399 industry, 401-499 sector.
// The same metric label (e.g. "ROE") maps to a DIFFERENT number per surface, so
// label resolution is surface-scoped (resolveComparativeDef / resolveIndustryDef
// / resolveSectorDef). Lookup-by-number (surfaceDefByNumber) is global because
// numbers never collide across surfaces.

import { resolveDefNumber as resolveIndividualDef } from "./individualDefinitions";

export type SurfaceKey = "comparative" | "industry" | "sector";

const LOADERS = import.meta.glob(
  [
    "../content/comparative/*.md",
    "../content/industry/*.md",
    "../content/sector/*.md",
    "!**/000-INDEX.md",
  ],
  { query: "?raw", import: "default" },
) as Record<string, () => Promise<string>>;

const SURFACE_RANGES: ReadonlyArray<readonly [SurfaceKey, number, number]> = [
  ["comparative", 201, 299],
  ["industry", 301, 399],
  ["sector", 401, 499],
];

function surfaceFor(n: number): SurfaceKey | undefined {
  return SURFACE_RANGES.find(([, lo, hi]) => n >= lo && n <= hi)?.[0];
}

/** Titles a filename cannot express (slashes, parentheses, minus signs). */
const TITLE_OVERRIDES: Partial<Record<number, string>> = {
  // comparative
  216: "Financial Leverage (Equity Multiplier)",
  230: "Excess Return (ROE − Ke)",
  231: "Justified P/B",
  232: "Actual P/B",
  237: "Operating Leverage (DOL)",
  // industry
  311: "R&D Intensity",
  315: "Financial Leverage",
  325: "Excess Return (ROE − Ke)",
  326: "Justified P/B",
  // sector
  411: "R&D Intensity",
  415: "Financial Leverage (Equity Multiplier)",
  424: "Excess Return (ROE − Ke)",
  425: "Justified P/B",
  426: "Actual P/B",
  428: "Operating Leverage (DOL)",
  434: "ROIC − WACC Spread",
};

export interface SurfaceMetricDef {
  number: number;
  title: string;
  surface: SurfaceKey;
  /** Lazily fetch this definition's verbatim markdown (separate Vite chunk). */
  load: () => Promise<string>;
}

export const SURFACE_METRIC_DEFS: SurfaceMetricDef[] = Object.entries(LOADERS)
  .flatMap(([path, load]): SurfaceMetricDef[] => {
    const m = /\/(\d+)-([^/]+)\.md$/.exec(path);
    if (!m) return [];
    const number = parseInt(m[1], 10);
    if (number === 0) return [];
    const surface = surfaceFor(number);
    if (!surface) {
      if (import.meta.env.DEV) {
        console.warn(`surfaceDefinitions: ${path} (#${number}) matches no surface range, ignored`);
      }
      return [];
    }
    const title = TITLE_OVERRIDES[number] ?? m[2].replace(/-/g, " ").trim();
    return [{ number, title, surface, load }];
  })
  .sort((a, b) => a.number - b.number);

const DEF_BY_NUMBER = new Map(SURFACE_METRIC_DEFS.map((d) => [d.number, d]));

/** Look up a surface definition by its catalog number (global; numbers never collide). */
export function surfaceDefByNumber(number: number): SurfaceMetricDef | undefined {
  return DEF_BY_NUMBER.get(number);
}

// ---------------------------------------------------------------------------
// Surface-scoped label resolution. Each surface's UI shows the same metric
// labels (the backend names), so a label must resolve to the number that lives
// in that surface's range. Aliases below cover labels that differ from the
// filename stems (shorthand, slashes, DuPont prefixes, leaderboard columns).
// ---------------------------------------------------------------------------

const normLabel = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

const COMPARATIVE_ALIASES: Array<[string, number]> = [
  ["ROE", 205], ["ROIC", 206],
  ["PE Ratio", 208], ["P/E", 208], ["P/E (Trailing)", 208],
  ["Asset Turnover", 209], ["DuPont · Asset Turnover", 209],
  ["Net Income Growth", 212], ["Free Cash Flow Growth", 213], ["Operating Cash Flow Growth", 214],
  ["Debt To Equity", 215],
  ["Financial Leverage", 216], ["Equity Multiplier", 216], ["DuPont · Equity Multiplier", 216],
  ["Debt Service Coverage", 217],
  ["PFCF Ratio", 218], ["P/FCF", 218],
  ["Graham Number Ratio", 219],
  ["Margin Of Safety", 220], ["Margin of Safety", 220],
  ["Score", 221], ["Value Score", 221],
  ["DCF Intrinsic", 222], ["DCF / share", 222], ["EVA Intrinsic", 223], ["Implied Price", 224], ["FCF Growth Used", 225],
  ["EVA", 226], ["EVA (Economic Value Added)", 226], ["EVA Margin", 227],
  ["WACC", 228], ["Cost of Equity", 229], ["Cost of Equity (Ke)", 229],
  // The ROIC − WACC spread shares one definition file (sector #434) across surfaces.
  ["ROIC − WACC Spread", 434], ["ROIC-WACC Spread", 434],
  ["Excess Return", 230], ["Excess Return (ROE − Ke)", 230],
  ["Justified P/B", 231], ["Actual P/B", 232], ["Net Interest Margin", 233],
  ["DuPont · Tax Burden", 234], ["Tax Burden", 234],
  ["DuPont · Interest Burden", 235], ["Interest Burden", 235],
  ["DuPont · EBIT Margin", 236],
  ["Operating Margin", 203], ["DuPont · Net Profit Margin", 204], ["Net Margin", 204],
  ["Operating Leverage", 237], ["Operating Leverage (DOL)", 237],
  ["Capex / Depreciation", 238], ["Sales / Invested Capital", 239],
  ["FCF / Net Income", 240], ["Net Debt / OCF", 241], ["Liabilities / Equity", 242],
];

const INDUSTRY_ALIASES: Array<[string, number]> = [
  ["ROE", 305], ["ROIC", 306], ["Debt To Equity", 307], ["Current Ratio", 308],
  ["Asset Turnover", 309], ["ROA", 310],
  ["R&D Intensity", 311], ["Capital Intensity Ratio", 312], ["Cash Conversion Cycle", 313],
  ["Quick Ratio", 314],
  ["Financial Leverage", 315], ["Financial Leverage (Assets/Equity)", 315],
  ["FCF To Revenue", 316], ["FCF to Revenue", 316],
  ["DuPont · Tax Burden", 317], ["Tax Burden", 317],
  ["DuPont · Interest Burden", 318], ["Interest Burden", 318],
  ["CAPE", 319], ["CAPE (approx)", 319],
  ["DCF Intrinsic", 320], ["Margin of Safety", 321], ["Margin Of Safety", 321],
  ["FCF Growth Used", 322], ["Score", 323], ["Value Score", 323],
  ["Cost of Equity", 324], ["Cost of Equity (Ke)", 324],
  ["Excess Return", 325], ["Excess Return (ROE − Ke)", 325],
  ["Justified P/B", 326],
  ["ROIC − WACC Spread", 434], ["ROIC-WACC Spread", 434],
];

const SECTOR_ALIASES: Array<[string, number]> = [
  ["ROE", 405], ["ROIC", 406], ["Debt To Equity", 407], ["Current Ratio", 408],
  ["Asset Turnover", 409], ["DuPont · Asset Turnover", 409], ["ROA", 410],
  ["R&D Intensity", 411], ["Capital Intensity Ratio", 412], ["Cash Conversion Cycle", 413],
  ["Quick Ratio", 414],
  ["Financial Leverage", 415], ["Equity Multiplier", 415], ["DuPont · Equity Multiplier", 415],
  ["FCF To Revenue", 416], ["FCF to Revenue", 416],
  ["DuPont · Tax Burden", 417], ["Tax Burden", 417],
  ["DuPont · Interest Burden", 418], ["Interest Burden", 418],
  ["DuPont · EBIT Margin", 419],
  ["EVA", 420], ["EVA (Economic Value Added)", 420], ["EVA Margin", 421],
  ["WACC", 422], ["Cost of Equity", 423], ["Cost of Equity (Ke)", 423],
  ["ROIC − WACC Spread", 434], ["ROIC-WACC Spread", 434],
  ["Excess Return", 424], ["Excess Return (ROE − Ke)", 424],
  ["Justified P/B", 425], ["Actual P/B", 426], ["Net Interest Margin", 427],
  ["Operating Margin", 403], ["DuPont · Net Profit Margin", 404], ["Net Margin", 404],
  ["Operating Leverage", 428], ["Operating Leverage (DOL)", 428],
  ["Capex / Depreciation", 429], ["Sales / Invested Capital", 430],
  ["FCF / Net Income", 431], ["Net Debt / OCF", 432], ["Liabilities / Equity", 433],
  ["Value Score", 435], ["Scorecard Verdict", 435],
];

/** Build a label->number resolver scoped to one surface's defs + aliases. */
function makeResolver(surface: SurfaceKey, aliases: Array<[string, number]>) {
  const map = new Map<string, number>();
  for (const [path] of Object.entries(LOADERS)) {
    const m = /\/(\d+)-([^/]+)\.md$/.exec(path);
    if (!m) continue;
    const number = parseInt(m[1], 10);
    if (surfaceFor(number) !== surface || !DEF_BY_NUMBER.has(number)) continue;
    map.set(normLabel(m[2]), number); // filename stem
  }
  for (const d of SURFACE_METRIC_DEFS) {
    if (d.surface === surface) map.set(normLabel(d.title), d.number); // display title
  }
  for (const [label, number] of aliases) map.set(normLabel(label), number); // aliases win

  return (label: string): number | undefined => {
    const direct = map.get(normLabel(label));
    if (direct != null) return direct;
    const stripped = label.replace(/\s*\([^)]*\)\s*$/, "");
    if (stripped !== label) {
      const viaStrip = map.get(normLabel(stripped));
      if (viaStrip != null) return viaStrip;
    }
    // Fallback: labels with no surface-specific definition (e.g. the full
    // fundamental registry shown in the comparative leaderboard's expanded
    // trends) open the company-level individual definition rather than a dead
    // label. Surface definitions always win when one exists.
    return resolveIndividualDef(label);
  };
}

export const resolveComparativeDef = makeResolver("comparative", COMPARATIVE_ALIASES);
export const resolveIndustryDef = makeResolver("industry", INDUSTRY_ALIASES);
export const resolveSectorDef = makeResolver("sector", SECTOR_ALIASES);

/** The resolver for a surface key, for components that take the key as a prop. */
export function resolverFor(surface: SurfaceKey): (label: string) => number | undefined {
  if (surface === "comparative") return resolveComparativeDef;
  if (surface === "industry") return resolveIndustryDef;
  return resolveSectorDef;
}
