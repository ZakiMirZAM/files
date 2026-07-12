// Build the definition-number -> historical series map for a group surface
// (comparative / industry / sector), so the sidebar panel can draw a graph
// beside each definition. The series source is data.metrics[], whose trends are
// already in display units (percent metrics are pre-scaled by the backend). Each
// metric name is resolved to its surface definition number; metrics with no
// matching definition, or with fewer than two points, get no graph.

import type { Metric, SectionData } from "./types";
import type { DefinitionSeries } from "./individualSeries";
import { formatCurrency, formatNumber } from "./format";

function metricFormatter(unit: Metric["unit"]): (v: number) => string {
  if (unit === "$") return (v) => formatCurrency(v);
  if (unit === "%") return (v) => `${v.toFixed(1)}%`;
  if (unit === "x") return (v) => `${v.toFixed(2)}×`;
  return (v) => formatNumber(v);
}

/** definition-number -> live series for a group surface. */
export function buildSurfaceSeriesIndex(
  data: SectionData | null | undefined,
  resolve: (label: string) => number | undefined,
): Map<number, DefinitionSeries> {
  const index = new Map<number, DefinitionSeries>();
  if (!data) return index;

  for (const m of data.metrics ?? []) {
    const number = resolve(m.name);
    if (number == null || m.trend.length < 2 || index.has(number)) continue;
    index.set(number, {
      label: m.name,
      points: m.trend,
      format: metricFormatter(m.unit),
      isRateOfChange: m.isRateOfChange,
    });
  }

  return index;
}
