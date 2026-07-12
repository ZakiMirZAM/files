import type { CSSProperties } from "react";
import { cn } from "../lib/cn";

/**
 * Loading skeletons for the analysis surfaces — datasets, matrices, and charts.
 *
 * Every placeholder reserves the real element's footprint so swapping in live
 * data does not shift the layout (no CLS), and announces itself with
 * role="status" + aria-busy for assistive tech. The shimmer sweep (.shimmer) is
 * automatically stilled under prefers-reduced-motion; the faint base still reads
 * as "loading". Decorative inner blocks are hidden from the a11y tree.
 */

/** A single shimmering placeholder block. */
export function Shimmer({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={cn("shimmer rounded-sm", className)} style={style} aria-hidden="true" />;
}

// Fixed, varied heights/widths so the skeleton looks like real data without
// reflowing between renders (no Math.random — keeps SSR/hydration stable too).
const BAR_HEIGHTS = [54, 70, 42, 82, 60, 74, 48, 66, 88, 56, 72, 62, 80, 46, 68, 58];
const LABEL_WIDTHS = ["72%", "55%", "84%", "61%", "76%", "50%", "67%", "58%"];

interface ChartSkeletonProps {
  /** Tailwind height class for the plot area (default h-44 — matches DefinitionChart). */
  heightClass?: string;
  /** Number of faux columns to draw. */
  bars?: number;
  /** Screen-reader status text. */
  label?: string;
}

/**
 * Placeholder for a graph (recharts line or bar). Draws a faux y-axis, a
 * baseline, and shimmering columns so the region reads as "a chart is loading"
 * rather than an empty axis frame.
 */
export function ChartSkeleton({
  heightClass = "h-44",
  bars = 12,
  label = "Loading chart…",
}: ChartSkeletonProps) {
  const cols = BAR_HEIGHTS.slice(0, Math.max(4, bars));
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="w-full">
      <span className="sr-only">{label}</span>
      <div className={cn("relative flex items-end gap-1.5 pl-10", heightClass)} aria-hidden="true">
        {/* y-axis tick labels */}
        <div className="absolute left-0 inset-y-0 w-7 flex flex-col justify-between py-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Shimmer key={i} className="h-1.5 w-6" />
          ))}
        </div>
        {/* plotted columns */}
        {cols.map((h, i) => (
          <Shimmer
            key={i}
            className="flex-1 min-w-0 rounded-b-none rounded-t-sm"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      {/* x-axis baseline + tick labels */}
      <div className="ml-10 mt-1 h-px bg-white/10" aria-hidden="true" />
      <div className="ml-10 mt-1.5 flex justify-between" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <Shimmer key={i} className="h-1.5 w-7" />
        ))}
      </div>
    </div>
  );
}

interface MatrixSkeletonProps {
  rows?: number;
  cols?: number;
  label?: string;
}

/**
 * Placeholder for a data table / metric matrix (SectorMetricsTable,
 * CompanyScorecardTable). Mirrors the framed, sticky-header table shell with a
 * grid of shimmer cells.
 */
export function MatrixSkeleton({ rows = 8, cols = 6, label = "Loading data table…" }: MatrixSkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="rounded-md border border-gold/20 bg-ink-800 overflow-hidden"
    >
      <span className="sr-only">{label}</span>
      <div className="overflow-hidden" aria-hidden="true">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="text-left px-4 py-3.5 border-b border-r border-gold/20 min-w-[200px]">
                <Shimmer className="h-3 w-20" />
              </th>
              {Array.from({ length: cols }).map((_, i) => (
                <th key={i} className="px-3 py-3.5 border-b border-gold/15">
                  <Shimmer className="h-3 w-14 mx-auto" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, r) => (
              <tr key={r}>
                <th className="text-left px-4 py-3 border-b border-r border-white/[0.06]">
                  <Shimmer className="h-3" style={{ width: LABEL_WIDTHS[r % LABEL_WIDTHS.length] }} />
                </th>
                {Array.from({ length: cols }).map((_, c) => (
                  <td key={c} className="px-3 py-3 border-b border-white/[0.05]">
                    <Shimmer className="h-3 w-12 mx-auto" style={{ opacity: 0.55 + ((r + c) % 3) * 0.18 }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface ScorecardSkeletonProps {
  /** Number of metric cards to draw. */
  cards?: number;
  label?: string;
}

/**
 * Placeholder for a single-column fundamentals scorecard (SectorMetricsPanel):
 * a header row plus a grid of mini metric cards.
 */
export function ScorecardSkeleton({ cards = 8, label = "Loading scorecard…" }: ScorecardSkeletonProps) {
  return (
    <section role="status" aria-busy="true" aria-live="polite" className="space-y-5">
      <span className="sr-only">{label}</span>
      <div className="flex items-end justify-between border-b border-gold/15 pb-3" aria-hidden="true">
        <div className="space-y-2">
          <Shimmer className="h-2.5 w-32" />
          <Shimmer className="h-5 w-44" />
        </div>
        <Shimmer className="h-3 w-28" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" aria-hidden="true">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="panel-soft px-4 py-3.5 flex items-center justify-between gap-3">
            <Shimmer className="h-3" style={{ width: LABEL_WIDTHS[i % LABEL_WIDTHS.length] }} />
            <Shimmer className="h-3 w-10 shrink-0" />
          </div>
        ))}
      </div>
    </section>
  );
}

interface PanelSkeletonProps {
  /** Draw a chart placeholder under the header (for graph-bearing panels). */
  withChart?: boolean;
  chartHeightClass?: string;
  /** Number of text lines under the header (for text/dataset panels). */
  lines?: number;
  label?: string;
}

/**
 * Placeholder for a collapsible panel (FedModelSection, Sp500ValuationPanel):
 * an icon + title/subtitle header row, optionally followed by a chart or a few
 * text lines.
 */
export function PanelSkeleton({
  withChart = false,
  chartHeightClass = "h-44",
  lines = 0,
  label = "Loading…",
}: PanelSkeletonProps) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="panel p-5 md:p-6">
      <span className="sr-only">{label}</span>
      <div className="flex items-center gap-4" aria-hidden="true">
        <Shimmer className="h-9 w-9 rounded-md shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          <Shimmer className="h-2.5 w-28" />
          <Shimmer className="h-4 w-1/2" />
        </div>
        <Shimmer className="h-4 w-4 rounded-full shrink-0" />
      </div>
      {withChart && (
        <div className="mt-5">
          <ChartSkeleton heightClass={chartHeightClass} label={`${label} chart`} />
        </div>
      )}
      {lines > 0 && (
        <div className="mt-5 space-y-2.5" aria-hidden="true">
          {Array.from({ length: lines }).map((_, i) => (
            <Shimmer key={i} className="h-3" style={{ width: `${92 - i * 13}%` }} />
          ))}
        </div>
      )}
    </div>
  );
}
