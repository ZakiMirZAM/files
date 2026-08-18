import type {
  IntegrityCheck,
  RuntimeGroup,
  RuntimeQuestion,
  SectorCellPoint,
  SectorColumn,
  SectorMetricDef,
  SectorMetricsData,
  SectorMetricUnit,
} from "./types";
import { openDefinitionSeries } from "./definitionPanelStore";
import type { DefinitionQuestionScope } from "./definitionPanelStore";
import type { SectionKey } from "./types";
import type { DefinitionSeries } from "./individualSeries";

/** Whether a higher or lower value is "better", drives the heatmap tint. */
export const METRIC_DIRECTION: Record<string, "higher" | "lower" | "neutral"> = {
  // Group value score, shown as a comparison ROW in the scorecard matrix, a
  // higher score is a stronger value creator, so it gets the green/red heatmap
  // that ranks the columns at a glance.
  valueScore: "higher",
  // Per-ticker ranking leading columns
  score: "higher",
  marginOfSafety: "higher",
  eva: "higher",
  evaMargin: "higher",
  roic: "higher",
  wacc: "lower",
  roicWaccSpread: "higher",
  roeEquity: "higher",
  costOfEquity: "lower",
  excessReturnEquity: "higher",
  justifiedPB: "neutral",
  actualPB: "neutral",
  peRatio: "neutral",
  marketCap: "neutral",
  beta: "neutral",
  netInterestMargin: "higher",
  dupontTaxBurden: "higher",
  dupontInterestBurden: "higher",
  dupontEbitMargin: "higher",
  dupontNetMargin: "higher",
  dupontAssetTurnover: "higher",
  dupontEquityMultiplier: "lower",
  operatingMargin: "higher",
  netMargin: "higher",
  revenueGrowth: "higher",
  netIncomeGrowth: "higher",
  operatingLeverage: "neutral",
  capexToDepreciation: "neutral",
  salesToInvestedCapital: "higher",
  fcfToNetIncome: "higher",
  netDebtToOcf: "lower",
  liabilitiesToEquity: "lower",
  // Sector-lens metrics (industries-within-a-sector matrix)
  grossMargin: "higher",
  ebitdaMargin: "higher",
  normEbitdaMargin: "higher",
  fcfYield: "higher",
  fcfMargin: "higher",
  ruleOf40: "higher",
  incomeQuality: "higher",
  inventoryTurnover: "higher",
  sustainableGrowth: "higher",
  impliedCapRate: "higher",
  interestCoverage: "higher",
  divYield: "higher",
  cashRunway: "higher",
  netDebtToEbitda: "lower",
  cashConversionCycle: "lower",
  daysInventory: "lower",
  evToEbitda: "lower",
  evToSales: "lower",
  priceToFfo: "lower",
  peg: "lower",
  sbcToRevenue: "lower",
  financialLeverage: "lower",
  payoutRatio: "neutral",
  capexToRevenue: "neutral",
  rdToRevenue: "neutral",
  priceToTangibleBook: "neutral",
};

export function formatSectorValue(value: number | null | undefined, unit: SectorMetricUnit): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  if (unit === "$") {
    const a = Math.abs(value);
    const sign = value < 0 ? "−" : "";
    const f = (n: number, s: string) => `${sign}$${n.toFixed(n >= 100 ? 0 : 1)}${s}`;
    if (a >= 1e12) return f(a / 1e12, "T");
    if (a >= 1e9) return f(a / 1e9, "B");
    if (a >= 1e6) return f(a / 1e6, "M");
    // Sub-million: keep cents for per-share / small-dollar values instead of
    // rounding to whole dollars (so $13.67 stays $13.67 and $0.45 stays $0.45,
    // not $14 and $0).
    if (a >= 100) return `${sign}$${a.toFixed(3)}`;
    if (a >= 1) return `${sign}$${a.toFixed(3)}`;
    if (a > 0) return `${sign}$${a.toFixed(a < 0.01 ? 4 : 3)}`;
    return "$0";
  }
  // Small percentages and ratios keep more precision (e.g. 0.45% not 0.5%).
  if (unit === "%") return `${value < 0 ? "−" : ""}${Math.abs(value).toFixed(3)}%`;
  if (unit === "d") return `${value < 0 ? "−" : ""}${Math.abs(value).toFixed(0)}d`;
  if (unit === "yrs") return `${value < 0 ? "−" : ""}${Math.abs(value).toFixed(1)} yrs`;
  if (unit === "b") return value.toFixed(3); // beta, a plain coefficient, ~1.0
  if (unit === "#") return value.toFixed(0); // rank, a whole number
  if (unit === "n") return value.toFixed(3); // plain number, e.g. the value score
  return `${value < 0 ? "−" : ""}${Math.abs(value).toFixed(3)}×`;
}

/** A column's per-metric 5-year history, if the API attached one (smuggled
 *  field convention shared with the comparative matrix). */
export function colHistory(col: SectorColumn | undefined, key: string): SectorCellPoint[] | undefined {
  const hist = (col as unknown as { _history?: Record<string, SectorCellPoint[]> } | undefined)?._history;
  return hist?.[key];
}

/** A column's scorecard integrity checklist, if the API attached one. */
export function colIntegrity(col: SectorColumn | undefined): IntegrityCheck[] | undefined {
  return (col as unknown as { _integrity?: IntegrityCheck[] } | undefined)?._integrity;
}

/**
 * Turn the scorecard's integrity checks into a standing, answerable question
 * deck grouped by theme. Every check becomes a question with a text box (via
 * QualitativeBlock's `groups` prop): the humanized question, the check's own
 * figures as the hint, a stable per-scope id so the answer persists, and a
 * per-question AI data context so "Explain using AI" sees the specific numbers.
 */
export function buildIntegrityDeck(
  checks: IntegrityCheck[] | undefined,
  scopeKey: string,
  pageContext?: string,
): RuntimeGroup[] {
  if (!checks || checks.length === 0) return [];
  const byTier = new Map<string, RuntimeQuestion[]>();
  for (const c of checks) {
    const tier = c.tier ?? "Scorecard checks";
    const figures =
      `Integrity check "${c.id}" for ${scopeKey}: severity ${c.severity}` +
      (c.value != null ? `, value ${c.value}` : "") +
      (c.threshold != null ? `, threshold ${c.threshold}` : "") +
      (c.detail ? `. ${c.detail}` : "");
    const q: RuntimeQuestion = {
      id: `integrity-${scopeKey}-${c.id}`,
      text: c.question,
      hint: c.detail,
      severity: c.severity,
      dataContext: [pageContext, figures].filter(Boolean).join("\n"),
    };
    const list = byTier.get(tier);
    if (list) list.push(q);
    else byTier.set(tier, [q]);
  }
  return [...byTier.entries()].map(([title, questions]) => ({ title, questions }));
}

/**
 * Open the definition sidebar on one scorecard cell: the metric's full
 * markdown definition (via the surface resolver) with the group's 5-year
 * history charted above it, the same UX as the comparative matrix cells.
 */
export function openMetricHistory(
  columnName: string,
  met: SectorMetricDef,
  col: SectorColumn | undefined,
  resolveDef?: (label: string) => number | undefined,
  questionScope?: { section: SectionKey; dataContext?: string },
): void {
  const points = colHistory(col, met.key);
  const series: DefinitionSeries | undefined =
    points && points.length >= 2
      ? {
          label: `${columnName} · ${met.label}`,
          points,
          format: (v) => formatSectorValue(v, met.unit),
          isRateOfChange: false,
        }
      : undefined;
  const num = resolveDef?.(met.label) ?? 0;
  // The Part 9 deck's answer scope: one answer set per (group, definition), so
  // Technology's ROIC-WACC answers never mix with Energy's. Only built when the
  // page supplied a section; other DefinitionPanel mounts stay deck-free.
  let scope: DefinitionQuestionScope | undefined;
  if (questionScope && num > 0) {
    const latest = col?.[met.key];
    const figures =
      `${columnName} ${met.label}: latest ${formatSectorValue(latest ?? null, met.unit)}` +
      (points && points.length >= 2
        ? `; history ${points.map((p) => `${p.period}: ${formatSectorValue(p.value, met.unit)}`).join(", ")}`
        : "");
    scope = {
      section: questionScope.section,
      scopeKey: `${columnName}-def-${num}`,
      dataContext: [questionScope.dataContext, figures].filter(Boolean).join("\n"),
    };
  }
  openDefinitionSeries({
    number: num,
    series,
    title: `${columnName} · ${met.label}`,
    description: num > 0 ? undefined : met.definition,
    scope,
  });
}

export interface RowStats {
  min: number;
  max: number;
}

export function rowStats(data: SectorMetricsData, key: string): RowStats | null {
  const vals: number[] = [];
  for (const s of data.sectors) {
    const v = data.data[s]?.[key];
    if (v !== null && v !== undefined && Number.isFinite(v)) vals.push(v as number);
  }
  if (vals.length < 2) return null;
  return { min: Math.min(...vals), max: Math.max(...vals) };
}

/**
 * Heatmap background for a cell, supplements, never replaces, the printed value.
 * Green = better for the metric's direction, red = worse, neutral metrics untinted.
 */
export function cellTint(
  value: number | null | undefined,
  key: string,
  stats: RowStats | null,
): string | undefined {
  const dir = METRIC_DIRECTION[key] ?? "neutral";
  if (dir === "neutral" || !stats || value == null || !Number.isFinite(value)) return undefined;
  const { min, max } = stats;
  if (max === min) return undefined;
  let t = (value - min) / (max - min); // 0..1 (1 = highest raw value)
  if (dir === "lower") t = 1 - t; // flip so 1 = best
  if (t >= 0.5) return `rgba(127,184,124,${((t - 0.5) * 2 * 0.22).toFixed(3)})`;
  return `rgba(200,118,114,${((0.5 - t) * 2 * 0.16).toFixed(3)})`;
}

const SPREAD_KEY = "roicWaccSpread";

/**
 * Add a derived "ROIC − WACC Spread" column to a comparative scorecard, computed
 * per company from the existing `roic`/`wacc` columns and inserted right after
 * WACC. Its per-year history is paired from the roic/wacc cell histories, so a
 * cell still opens a real trend chart in the sidebar. Pure, returns a new
 * object and mutates nothing. No-op when the spread is already present or the
 * roic/wacc columns are missing (so it is safe to apply to any matrix).
 */
export function withRoicWaccSpread(data: SectorMetricsData): SectorMetricsData {
  if (data.metrics.some((m) => m.key === SPREAD_KEY)) return data;
  const waccIdx = data.metrics.findIndex((m) => m.key === "wacc");
  const roicDef = data.metrics.find((m) => m.key === "roic");
  if (waccIdx < 0 || !roicDef) return data;

  const spreadDef: SectorMetricDef = {
    key: SPREAD_KEY,
    label: "ROIC − WACC Spread",
    unit: "%",
    // Same group as the WACC column it sits beside, so the group header stays contiguous.
    group: data.metrics[waccIdx].group,
    definition:
      "ROIC minus WACC, the firm-level value-creation spread. Positive: invested capital earns " +
      "above its cost (EVA positive, value created). Negative: returns sit below the cost of " +
      "capital (value destroyed).",
  };
  const metrics = [
    ...data.metrics.slice(0, waccIdx + 1),
    spreadDef,
    ...data.metrics.slice(waccIdx + 1),
  ];

  const nextData: Record<string, SectorColumn> = {};
  for (const ticker of Object.keys(data.data)) {
    const col = data.data[ticker];
    const roic = col["roic"];
    const wacc = col["wacc"];
    const spread =
      roic != null && wacc != null && Number.isFinite(roic) && Number.isFinite(wacc)
        ? roic - wacc
        : null;

    const nextCol: SectorColumn = { ...col, [SPREAD_KEY]: spread };

    // Pair roic & wacc histories on matching years to derive a spread history.
    const hist = (col as unknown as { _history?: Record<string, SectorCellPoint[]> })._history;
    if (hist?.roic && hist?.wacc) {
      const waccByPeriod = new Map(hist.wacc.map((p) => [p.period, p.value]));
      const spreadHist: SectorCellPoint[] = hist.roic.flatMap((rp) => {
        const w = waccByPeriod.get(rp.period);
        return w != null ? [{ period: rp.period, value: rp.value - w }] : [];
      });
      if (spreadHist.length > 0) {
        (nextCol as unknown as { _history: Record<string, SectorCellPoint[]> })._history = {
          ...hist,
          [SPREAD_KEY]: spreadHist,
        };
      }
    }

    nextData[ticker] = nextCol;
  }

  return { ...data, metrics, data: nextData };
}

// ── Ranking ──────────────────────────────────────────────────────────────────

export interface MatrixSort {
  /** The metric key driving the order. */
  key: string;
  dir: "desc" | "asc";
}

/**
 * Reorder a matrix's variable axis (`data.sectors`: the columns of the
 * sector/industry matrix, the company rows of the transposed scorecard) by one
 * metric's value. Pure: returns a new object with only the `sectors` array
 * reordered, so every column payload (values, `_history`, `_integrity`, the
 * smuggled underscore fields) rides along untouched and the definitions +
 * clickable cells behave exactly as before. Missing / non-finite values sort
 * last in either direction; ties keep the API's original order (stable).
 */
export function sortMatrixData(data: SectorMetricsData, sort: MatrixSort | null): SectorMetricsData {
  if (!sort) return data;
  const indexed = data.sectors.map((name, i) => ({
    name,
    i,
    v: data.data[name]?.[sort.key],
  }));
  indexed.sort((a, b) => {
    const aOk = a.v != null && Number.isFinite(a.v);
    const bOk = b.v != null && Number.isFinite(b.v);
    if (aOk && bOk) {
      const diff = sort.dir === "desc" ? (b.v as number) - (a.v as number) : (a.v as number) - (b.v as number);
      return diff !== 0 ? diff : a.i - b.i;
    }
    if (aOk) return -1;
    if (bOk) return 1;
    return a.i - b.i;
  });
  return { ...data, sectors: indexed.map((x) => x.name) };
}

/** The next sort state when the user clicks a metric's rank control:
 *  high to low, then low to high, then back to the source order. */
export function cycleMatrixSort(current: MatrixSort | null, key: string): MatrixSort | null {
  if (current?.key !== key) return { key, dir: "desc" };
  return current.dir === "desc" ? { key, dir: "asc" } : null;
}
