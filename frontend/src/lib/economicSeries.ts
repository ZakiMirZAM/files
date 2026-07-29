// Build the definition-panel series index for economic metrics, so the Sector
// Rotation sidebar can show an economic metric's historical graph next to its
// definition. Keyed by the economic panel number (ECON_PANEL_OFFSET + number),
// matching economicDefByPanelNumber so the panel finds both the markdown and the
// chart for the same key.
//
// Economic series are monthly or daily; the sidebar chart slices periods to year
// labels, so each series is downsampled to one point per year (the latest in
// that year) for a clean, readable mini-chart, consistent with the annual bars
// on the individual page.

import type { Metric, SectionData } from "./types";
import type { DefinitionSeries, SeriesPoint } from "./individualSeries";
import { formatCurrency, formatNumber } from "./format";
import { ECON_PANEL_OFFSET, ECONOMIC_METRIC_DEFS } from "./economicDefinitions";

function formatterFor(unit: Metric["unit"]): (v: number) => string {
  if (unit === "$") return (v) => formatCurrency(v);
  if (unit === "%") return (v) => `${v.toFixed(3)}%`;
  if (unit === "x") return (v) => `${v.toFixed(3)}×`;
  return (v) => formatNumber(v);
}

/** Keep the last point of each calendar year, preserving chronological order. */
function toAnnual(points: SeriesPoint[]): SeriesPoint[] {
  const byYear = new Map<string, SeriesPoint>();
  for (const p of points) byYear.set(p.period.slice(0, 4), p); // later overwrites earlier
  return [...byYear.values()];
}

/**
 * panel number (ECON_PANEL_OFFSET + economic number) -> the full economic Metric,
 * so the sidebar can render the same MetricBlock line chart the Economic page
 * uses (full-resolution line, recession bands, Level/YoY toggle).
 */
export function buildEconomicMetricBlocks(
  data: SectionData | null | undefined,
): Map<number, Metric> {
  const index = new Map<number, Metric>();
  if (!data?.metrics) return index;
  const byName = new Map<string, Metric>(data.metrics.map((m) => [m.name, m]));
  for (const def of ECONOMIC_METRIC_DEFS) {
    if (!def.chartMetricName) continue;
    const metric = byName.get(def.chartMetricName);
    if (metric && metric.trend.length > 0) index.set(ECON_PANEL_OFFSET + def.number, metric);
  }
  return index;
}

/** panel number (ECON_PANEL_OFFSET + economic number) -> economic series. */
export function buildEconomicSeriesIndex(
  data: SectionData | null | undefined,
): Map<number, DefinitionSeries> {
  const index = new Map<number, DefinitionSeries>();
  if (!data?.metrics) return index;

  const byName = new Map<string, Metric>(data.metrics.map((m) => [m.name, m]));
  for (const def of ECONOMIC_METRIC_DEFS) {
    if (!def.chartMetricName) continue;
    const metric = byName.get(def.chartMetricName);
    if (!metric) continue;
    const points = toAnnual(metric.trend);
    if (points.length < 2) continue;
    index.set(ECON_PANEL_OFFSET + def.number, {
      label: metric.name,
      points,
      format: formatterFor(metric.unit),
      isRateOfChange: metric.isRateOfChange,
    });
  }
  return index;
}
