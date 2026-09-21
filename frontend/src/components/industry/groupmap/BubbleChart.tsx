import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
  type ScatterShapeProps,
} from "recharts";
import type { GroupMapAxis, GroupMapFirm, GroupMapGroup } from "../../../lib/groupMapApi";
import { pctFromFraction } from "../../../lib/industryStructureFormat";
import { colorForGroup, shapeForGroup, UNCLASSIFIED_COLOR, type MarkerShape } from "./palette";
import { FiveYearArrows } from "./FiveYearArrows";

interface BubbleChartProps {
  firms: GroupMapFirm[];
  groups: GroupMapGroup[];
  axes: GroupMapAxis[];
  xKey: string;
  yKey: string;
  highlightTicker?: string;
  showFiveYear: boolean;
  reducedMotion: boolean;
}

// ZAxis range in pixel AREA (not radius) -> bubble size is proportional to
// revenue share, per Porter's convention for these maps.
const MIN_BUBBLE_AREA = 36;
const MAX_BUBBLE_AREA = 1100;
const AXIS_PAD = 0.02; // 2 percentage points of padding around the data range

function drawMarker(
  shape: MarkerShape,
  cx: number,
  cy: number,
  area: number,
  fill: string,
  fillOpacity: number,
  stroke: string,
  strokeWidth: number,
) {
  const common = { fill, fillOpacity, stroke, strokeWidth };
  if (shape === "circle") {
    const r = Math.sqrt(area / Math.PI);
    return <circle cx={cx} cy={cy} r={r} {...common} />;
  }
  if (shape === "square") {
    const side = Math.sqrt(area);
    return <rect x={cx - side / 2} y={cy - side / 2} width={side} height={side} {...common} />;
  }
  if (shape === "diamond") {
    const r = Math.sqrt(area) * 0.72;
    const points = `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
    return <polygon points={points} {...common} />;
  }
  // triangle: equilateral, area = (sqrt(3)/4) * side^2
  const side = Math.sqrt((4 * area) / Math.sqrt(3));
  const h = (side * Math.sqrt(3)) / 2;
  const points = `${cx},${cy - (2 / 3) * h} ${cx - side / 2},${cy + h / 3} ${cx + side / 2},${cy + h / 3}`;
  return <polygon points={points} {...common} />;
}

function makeShape(shape: MarkerShape, color: string, highlightTicker: string | undefined) {
  return (props: ScatterShapeProps) => {
    const { cx, cy, size, payload } = props;
    if (cx == null || cy == null) return <g />;
    const firm = payload as GroupMapFirm | undefined;
    const isHighlighted = highlightTicker != null && firm?.ticker === highlightTicker;
    return (
      <g>
        {drawMarker(
          shape,
          cx,
          cy,
          Math.max(size, MIN_BUBBLE_AREA),
          color,
          isHighlighted ? 0.95 : 0.72,
          isHighlighted ? "#ffffff" : color,
          isHighlighted ? 2 : 1,
        )}
      </g>
    );
  };
}

interface TooltipContentProps {
  active?: boolean;
  payload?: { payload: GroupMapFirm }[];
  xLabel: string;
  yLabel: string;
}

function GroupMapTooltip({ active, payload, xLabel, yLabel }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-gold/25 bg-[#10131f] px-3 py-2 text-xs shadow-lg space-y-0.5 max-w-[220px]">
      <p className="font-mono font-semibold text-white/90">
        {p.ticker} <span className="text-white/40 font-normal">{p.name}</span>
      </p>
      <p className="text-white/60">
        {xLabel}: {pctFromFraction(p.x)}%
      </p>
      <p className="text-white/60">
        {yLabel}: {pctFromFraction(p.y)}%
      </p>
      <p className="text-white/60">Revenue share: {pctFromFraction(p.revenueShare)}%</p>
      <p className="text-white/60">Pre-tax return on capital: {pctFromFraction(p.preTaxRoic)}%</p>
      {p.group && <p className="text-gold/80 pt-0.5">{p.group}</p>}
    </div>
  );
}

/**
 * The bubble scatter: one Scatter series per strategic group (shape + color
 * both encode the group, so the split reads without color alone), bubble
 * area proportional to revenue share, and an optional five-year-movement
 * arrow overlay. Scrolls horizontally in its container below 320px rather
 * than compressing to the point of overlap.
 */
export function BubbleChart({
  firms,
  groups,
  axes,
  xKey,
  yKey,
  highlightTicker,
  showFiveYear,
  reducedMotion,
}: BubbleChartProps) {
  const xLabel = axes.find((a) => a.key === xKey)?.label ?? "Horizontal axis";
  const yLabel = axes.find((a) => a.key === yKey)?.label ?? "Vertical axis";
  const groupLabels = groups.map((g) => g.label);
  const unclassified = firms.filter((f) => f.group == null);

  const colorFor = (label: string | null) => colorForGroup(label, groupLabels);

  return (
    <div className="h-80 w-full min-w-[320px] overflow-x-auto">
      <ResponsiveContainer width="100%" height="100%" minWidth={320}>
        <ScatterChart margin={{ top: 8, right: 24, bottom: 28, left: 8 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            type="number"
            dataKey="x"
            name={xLabel}
            domain={[`dataMin - ${AXIS_PAD}`, `dataMax + ${AXIS_PAD}`]}
            tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }}
            tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
            label={{ value: xLabel, position: "insideBottom", dy: 18, fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name={yLabel}
            domain={[`dataMin - ${AXIS_PAD}`, `dataMax + ${AXIS_PAD}`]}
            tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }}
            tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
            width={54}
            label={{ value: yLabel, angle: -90, position: "insideLeft", fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
          />
          <ZAxis dataKey="revenueShare" range={[MIN_BUBBLE_AREA, MAX_BUBBLE_AREA]} name="Revenue share" />
          <Tooltip content={<GroupMapTooltip xLabel={xLabel} yLabel={yLabel} />} cursor={{ strokeDasharray: "3 3" }} />
          {groups.map((g) => (
            <Scatter
              key={g.label}
              name={g.label}
              data={firms.filter((f) => f.group === g.label)}
              shape={makeShape(shapeForGroup(g.label, groupLabels), colorForGroup(g.label, groupLabels), highlightTicker)}
              isAnimationActive={!reducedMotion}
            />
          ))}
          {unclassified.length > 0 && (
            <Scatter
              key="unclassified"
              name="Unclassified"
              data={unclassified}
              shape={makeShape("circle", UNCLASSIFIED_COLOR, highlightTicker)}
              isAnimationActive={!reducedMotion}
            />
          )}
          {showFiveYear && <FiveYearArrows firms={firms} colorFor={colorFor} />}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
