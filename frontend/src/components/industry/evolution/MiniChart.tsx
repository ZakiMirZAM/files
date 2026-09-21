// Small reusable chart used inside each Evolution Dashboard card. Kept
// deliberately lean: no legend, no axis labels, a tooltip on hover, and no
// animation (either because there is nothing meaningfully to animate at this
// size, or because the viewer asked for reduced motion).

import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { YearValue } from "../../../lib/industryStructureApi";

const GOLD = "#c9a84c";

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
}

export interface MiniChartProps {
  data: YearValue[];
  /** "area" for a filled series (revenue, firm count), "line" for a ratio/spread. */
  kind?: "area" | "line";
  /** Formats the raw series value for the tooltip and Y axis. */
  formatValue?: (v: number) => string;
}

/** A one-line text alternative for a reader who cannot see the chart. The
 *  sentence under every card carries the full reading; this names the span. */
function altTextFor(rows: Array<{ year: string; value: number }>, fmt: (v: number) => string): string {
  const first = rows[0];
  const last = rows[rows.length - 1];
  return `Line chart, ${first.year} to ${last.year}: ${fmt(first.value)} at the start and ${fmt(last.value)} at the end.`;
}

/** A small line or area chart over a year/value series, styled for a tight card. */
/** Every evolution card draws its chart at the same height. */
const CHART_HEIGHT = 120;

export function MiniChart({ data, kind = "line", formatValue }: MiniChartProps) {
  const height = CHART_HEIGHT;
  const rows = data
    .filter((d) => Number.isFinite(d.value))
    .map((d) => ({ year: String(d.year), value: d.value as number }));

  if (rows.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-[0.7rem] text-white/35 border border-dashed border-white/10 rounded-sm"
        style={{ height }}
      >
        Not available for this industry
      </div>
    );
  }

  const animate = !prefersReducedMotion();
  const fmt = formatValue ?? ((v: number) => v.toFixed(1));

  const commonAxes = (
    <>
      <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
      <XAxis
        dataKey="year"
        tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 9, fontFamily: "monospace" }}
        tickLine={false}
        axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
        interval="preserveStartEnd"
        minTickGap={20}
      />
      <YAxis
        width={40}
        tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 9, fontFamily: "monospace" }}
        tickLine={false}
        axisLine={false}
        tickFormatter={(v: number) => fmt(v)}
      />
      <Tooltip
        cursor={{ stroke: "rgba(201,168,76,0.3)" }}
        contentStyle={{
          background: "#0a0f1e",
          border: "1px solid rgba(201,168,76,0.3)",
          borderRadius: 2,
          fontSize: 11,
        }}
        labelStyle={{ color: "rgba(255,255,255,0.6)", fontFamily: "monospace" }}
        formatter={(v) => [fmt(Number(v)), ""]}
      />
    </>
  );

  return (
    <div style={{ height }} className="overflow-x-auto" role="img" aria-label={altTextFor(rows, fmt)}>
      <div style={{ minWidth: rows.length > 8 ? rows.length * 26 : "100%", height: "100%" }}>
        <ResponsiveContainer width="100%" height="100%">
          {kind === "area" ? (
            <AreaChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              {commonAxes}
              <defs>
                <linearGradient id="miniChartFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={GOLD} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={GOLD} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke={GOLD}
                strokeWidth={1.5}
                fill="url(#miniChartFill)"
                isAnimationActive={animate}
              />
            </AreaChart>
          ) : (
            <LineChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              {commonAxes}
              <Line
                type="monotone"
                dataKey="value"
                stroke={GOLD}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={animate}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
