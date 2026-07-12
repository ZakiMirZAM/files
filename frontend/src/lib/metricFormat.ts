// Formatting for the fundamental display metrics (shared by the individual
// trends grid and the comparative leaderboard). Unit drives the format:
//   "%" → value is a decimal, shown as a percent;  "x" → shown as <n>x.

export type MetricUnit = "%" | "x" | "d" | "$";

export function formatMetricValue(v: number | null | undefined, unit: MetricUnit): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (unit === "%") {
    const p = v * 100;
    return `${p.toFixed(Math.abs(p) < 1 ? 2 : 1)}%`;
  }
  if (unit === "d") return `${Math.round(v)}d`;
  if (unit === "$") {
    const a = Math.abs(v);
    const s = v < 0 ? "−" : "";
    if (a >= 1e12) return `${s}$${(a / 1e12).toFixed(2)}T`;
    if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)}M`;
    if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(0)}K`;
    // Keep cents for per-share / small-dollar values instead of rounding to $0.
    if (a >= 100) return `${s}$${a.toFixed(0)}`;
    if (a >= 1) return `${s}$${a.toFixed(2)}`;
    if (a > 0) return `${s}$${a.toFixed(a < 0.01 ? 4 : 2)}`;
    return "$0";
  }
  return `${v.toFixed(2)}x`;
}

/** Change since the first point — percentage-points for %, days for d, % change for x. */
export function metricDelta(
  values: number[],
  unit: MetricUnit,
): { text: string; positive: boolean } | null {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return null;
  const first = clean[0];
  const last = clean[clean.length - 1];
  if (unit === "%") {
    const pp = (last - first) * 100;
    return { text: `${pp >= 0 ? "+" : ""}${pp.toFixed(1)}pp`, positive: pp >= 0 };
  }
  if (unit === "d") {
    const dd = last - first;
    return { text: `${dd >= 0 ? "+" : ""}${Math.round(dd)}d`, positive: dd >= 0 };
  }
  if (first === 0) return null;
  const pct = ((last - first) / Math.abs(first)) * 100;
  return { text: `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`, positive: pct >= 0 };
}

/** Sorted-by-year level series from a {yearStr: value} history map. */
export function seriesFromHistory(history: Record<string, number> | undefined): number[] {
  if (!history) return [];
  return Object.keys(history)
    .map(Number)
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => a - b)
    .map((y) => history[String(y)])
    .filter((v) => Number.isFinite(v));
}
