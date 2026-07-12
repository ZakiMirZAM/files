import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DefinitionSeries, SeriesPoint } from "../../lib/individualSeries";
import { cn } from "../../lib/cn";

const GOLD = "#c9a84c";
const GAIN = "#9dd093";
const LOSS = "#df8884";

/** Year-over-year percent change of an ordered annual series. */
function toYoY(points: SeriesPoint[]): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1].value;
    if (prev === 0) continue;
    out.push({
      period: points[i].period,
      value: ((points[i].value - prev) / Math.abs(prev)) * 100,
    });
  }
  return out;
}

const yearLabel = (period: string) => (period.length >= 4 ? period.slice(0, 4) : period);

interface DefinitionChartProps {
  series: DefinitionSeries;
  /** Small caption rendered above the chart (e.g. "History", "% of Revenue"). */
  title?: string;
}

/**
 * Lean historical graph for the definition sidebar: one bar chart with a year
 * axis, a Value <-> YoY % toggle (hidden when a year-over-year view does not
 * apply), and latest-value plus total-change labels. Purpose-built to sit in a
 * narrow panel next to the definition text.
 */
export function DefinitionChart({ series, title }: DefinitionChartProps) {
  const [view, setView] = useState<"value" | "yoy">("value");

  const yoyPoints = useMemo(() => toYoY(series.points), [series.points]);
  const canToggle = !series.isRateOfChange && yoyPoints.length >= 1;
  const showYoY = view === "yoy" && canToggle;

  const points = showYoY ? yoyPoints : series.points;
  const fmt = showYoY ? (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : series.format;

  const rows = points.map((p) => ({ year: yearLabel(p.period), value: p.value }));

  const latest = series.points[series.points.length - 1]?.value;
  const first = series.points[0]?.value;
  const totalChange =
    first != null && latest != null && first !== 0
      ? ((latest - first) / Math.abs(first)) * 100
      : null;

  return (
    <div data-definition-chart>
      {title && (
        <p className="text-[0.65rem] uppercase tracking-wider font-mono text-white/40 mb-1.5">{title}</p>
      )}
      <div className="flex items-center justify-between gap-3 mb-2.5 flex-wrap">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-base text-gold tabular-nums">
            {latest != null ? series.format(latest) : "—"}
          </span>
          {totalChange != null && (
            <span
              className={cn(
                "font-mono text-[0.7rem]",
                totalChange >= 0 ? "text-gain-strong" : "text-loss-strong",
              )}
            >
              {totalChange >= 0 ? "+" : ""}
              {totalChange.toFixed(0)}% over {series.points.length} yrs
            </span>
          )}
        </div>
        {canToggle && (
          <div
            role="group"
            aria-label="Chart units"
            className="inline-flex rounded-sm border border-gold/15 overflow-hidden shrink-0"
          >
            <button
              type="button"
              onClick={() => setView("value")}
              aria-pressed={!showYoY}
              className={cn(
                "px-2.5 py-1 text-[0.65rem] font-mono uppercase tracking-wider transition-colors",
                !showYoY ? "bg-gold/15 text-gold" : "text-white/40 hover:text-white/70",
              )}
            >
              Value
            </button>
            <button
              type="button"
              onClick={() => setView("yoy")}
              aria-pressed={showYoY}
              title="Percent change from a year ago"
              className={cn(
                "px-2.5 py-1 text-[0.65rem] font-mono uppercase tracking-wider transition-colors border-l border-gold/15",
                showYoY ? "bg-gold/15 text-gold" : "text-white/40 hover:text-white/70",
              )}
            >
              YoY %
            </button>
          </div>
        )}
      </div>

      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="year"
              tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10, fontFamily: "monospace" }}
              tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
              interval="preserveStartEnd"
              minTickGap={14}
            />
            <YAxis
              width={52}
              tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10, fontFamily: "monospace" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => fmt(v)}
            />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              contentStyle={{
                background: "#0a0f1e",
                border: "1px solid rgba(201,168,76,0.3)",
                borderRadius: 2,
                fontSize: 12,
              }}
              labelStyle={{ color: "rgba(255,255,255,0.6)", fontFamily: "monospace" }}
              formatter={(v) => [fmt(Number(v)), showYoY ? "YoY change" : series.label]}
            />
            <Bar dataKey="value" radius={[1, 1, 0, 0]} isAnimationActive={false}>
              {rows.map((r, i) => (
                <Cell key={i} fill={showYoY ? (r.value >= 0 ? GAIN : LOSS) : GOLD} fillOpacity={showYoY ? 0.85 : 0.7} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
