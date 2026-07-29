// Resolve a definition number to the live historical series shown for that
// metric on the individual page, so the sidebar panel can draw a graph beside
// the definition. Four sources feed the index, each keyed differently:
//   - data.metrics[]            statement-trend metrics (Revenue, Net Income...)
//   - analysis.perShareHistory  per-share dollar figures (Revenue Per Share...)
//   - analysis.metricHistory    fundamental ratios (ROE, ROIC...) via metricMeta
//   - analysis.vertical.*       every statement line item, as a decimal fraction
//                               of its base per year. The raw dollar series is
//                               derived as fraction x base (Revenue / Total
//                               Assets trends from data.metrics[]), and the
//                               fraction itself becomes the percent-of-base
//                               companion graph.
// Each is mapped to a definition number through resolveDefNumber, and the value
// formatting convention differs by source, so each entry carries its own
// formatter. Definitions with no matching series (valuation models, abstract
// scores) simply get no entry, and the panel shows the text alone.

import type { IndividualBenchmarks, Metric, MetricMeta, SectionData, SectorMetricUnit, VerticalTable } from "./types";
import { formatCurrency, formatNumber, formatPercent } from "./format";
import { formatMetricValue } from "./metricFormat";
import { resolveDefNumber } from "./individualDefinitions";

export interface SeriesPoint {
  period: string;
  value: number;
}

export interface DefinitionSeries {
  label: string;
  points: SeriesPoint[];
  /** Format one raw value for the axis and labels (units differ by source). */
  format: (value: number) => string;
  /** When true the value is already a rate, so a year-over-year view is hidden. */
  isRateOfChange: boolean;
  /** Common-size companion: the item as a share of its statement's base. */
  percentOfBase?: {
    /** Decimal fractions per year (0.42 = 42% of the base). */
    points: SeriesPoint[];
    /** "Revenue" for income/cash-flow items, "Total Assets" for balance items. */
    baseLabel: string;
  };
}

function metricFormatter(unit: Metric["unit"]): (v: number) => string {
  if (unit === "$") return (v) => formatCurrency(v);
  if (unit === "%") return (v) => formatPercent(v);
  if (unit === "x") return (v) => `${v.toFixed(3)}x`;
  return (v) => formatNumber(v);
}

function orderedPoints(history: Record<string, number>): SeriesPoint[] {
  return Object.keys(history)
    .map((y) => ({ y: Number(y), raw: y }))
    .filter((e) => Number.isFinite(e.y))
    .sort((a, b) => a.y - b.y)
    .map((e) => ({ period: e.raw, value: history[e.raw] }))
    .filter((p) => Number.isFinite(p.value));
}

const yearOf = (period: string) => period.slice(0, 4);

/** Build the definition-number -> series map for the current ticker's data. */
export function buildSeriesIndex(data: SectionData | null | undefined): Map<number, DefinitionSeries> {
  const index = new Map<number, DefinitionSeries>();
  if (!data) return index;

  const add = (number: number | undefined, entry: DefinitionSeries) => {
    if (number == null || entry.points.length < 2) return;
    if (!index.has(number)) index.set(number, entry); // first source wins
  };

  // 1. Statement-trend metrics carry their own unit and rate flag.
  for (const m of data.metrics ?? []) {
    add(resolveDefNumber(m.name), {
      label: m.name,
      points: m.trend,
      format: metricFormatter(m.unit),
      isRateOfChange: m.isRateOfChange,
    });
  }

  const analysis = data.analysis;
  if (!analysis) return index;

  // 2. Per-share history is always a dollar figure.
  for (const [key, history] of Object.entries(analysis.perShareHistory ?? {})) {
    add(resolveDefNumber(key), {
      label: key,
      points: orderedPoints(history),
      format: (v) => formatCurrency(v, { compact: false }),
      isRateOfChange: false,
    });
  }

  // 3. Fundamental ratios: metricMeta gives the unit; values are decimals for %.
  const metaByKey = new Map<string, MetricMeta>((analysis.metricMeta ?? []).map((m) => [m.key, m]));
  for (const [key, history] of Object.entries(analysis.metricHistory ?? {})) {
    const meta = metaByKey.get(key);
    const unit = meta?.unit ?? "x";
    add(resolveDefNumber(meta?.label ?? key) ?? resolveDefNumber(key), {
      label: meta?.label ?? key,
      points: orderedPoints(history),
      format: (v) => formatMetricValue(v, unit),
      isRateOfChange: false,
    });
  }

  // 4. Vertical (common-size) tables: every statement line item. The fraction
  //    series is the percent-of-base graph; multiplying by the base's raw trend
  //    reconstructs the item's dollar history.
  const baseTrends = new Map<string, Map<string, number>>();
  for (const m of data.metrics ?? []) {
    if (m.name === "Revenue" || m.name === "Total Assets") {
      baseTrends.set(m.name, new Map(m.trend.map((p) => [yearOf(p.period), p.value])));
    }
  }

  const addVertical = (table: VerticalTable | undefined, baseLabel: string) => {
    const base = baseTrends.get(baseLabel);
    for (const [item, history] of Object.entries(table ?? {})) {
      const number = resolveDefNumber(item);
      if (number == null) {
        if (import.meta.env.DEV) {
          console.warn(`individualSeries: vertical line "${item}" resolves to no definition`);
        }
        continue;
      }
      const fractions = orderedPoints(history);
      if (fractions.length < 2) continue;

      // The base item itself is a flat 100% of the base; no percent graph.
      const isBase = item === baseLabel;
      const percentOfBase = isBase ? undefined : { points: fractions, baseLabel };

      const existing = index.get(number);
      if (existing) {
        // Keep the richer raw series, attach the common-size companion.
        if (!existing.percentOfBase && percentOfBase) {
          index.set(number, { ...existing, percentOfBase });
        }
        continue;
      }

      // Reconstruct the raw dollar series from fraction x base where possible.
      const raw: SeriesPoint[] = base
        ? fractions.flatMap((p) => {
            const b = base.get(yearOf(p.period));
            return b != null ? [{ period: p.period, value: p.value * b }] : [];
          })
        : [];

      if (raw.length >= 2) {
        add(number, {
          label: item,
          points: raw,
          format: (v) => formatCurrency(v),
          isRateOfChange: false,
          percentOfBase,
        });
      } else if (percentOfBase) {
        // No base trend available: show the common-size series as the main graph.
        add(number, {
          label: `${item} (% of ${baseLabel})`,
          points: fractions,
          format: (v) => formatPercent(v * 100),
          isRateOfChange: true,
        });
      }
    }
  };

  addVertical(analysis.vertical?.income, "Revenue");
  addVertical(analysis.vertical?.balance, "Total Assets");
  addVertical(analysis.vertical?.cashflow, "Revenue");

  return index;
}

// ── Benchmark index: definition number -> company vs industry vs sector ─────

export interface DefinitionBenchmark {
  label: string;
  unit: SectorMetricUnit;
  company: number | null;
  industry: number | null;
  sector: number | null;
  industryName: string | null;
  sectorName: string | null;
}

/**
 * Key the /api/individual/{ticker}/benchmarks payload by definition number,
 * so the sidebar can show "this company vs its industry vs its sector" under
 * the metric the user opened. The benchmark metrics are keyed by the
 * individual page's metricMeta keys; each resolves to its definition number
 * through the SAME label -> number path buildSeriesIndex uses, so the
 * comparison always lands on the definition the label opens. Pure.
 */
export function buildBenchmarkIndex(
  benchmarks: IndividualBenchmarks | null | undefined,
  meta: MetricMeta[] | null | undefined,
): Map<number, DefinitionBenchmark> {
  const index = new Map<number, DefinitionBenchmark>();
  if (!benchmarks || !meta) return index;
  for (const m of meta) {
    const entry = benchmarks.metrics[m.key];
    if (!entry) continue;
    const number = resolveDefNumber(m.label);
    if (number == null || index.has(number)) continue;
    index.set(number, {
      label: entry.label,
      unit: entry.unit,
      company: entry.company,
      industry: entry.industry,
      sector: entry.sector,
      industryName: benchmarks.industry,
      sectorName: benchmarks.sector,
    });
  }
  return index;
}
