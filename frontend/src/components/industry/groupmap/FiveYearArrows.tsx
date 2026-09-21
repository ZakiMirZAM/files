import { useCartesianScale } from "recharts";
import type { GroupMapFirm } from "../../../lib/groupMapApi";

interface FiveYearArrowsProps {
  firms: GroupMapFirm[];
  colorFor: (group: string | null) => string;
}

const ARROW_MARKER_ID = "groupmap-five-year-arrowhead";
// Below this pixel length the segment reads as a dot, not a direction; skip
// the arrowhead so it does not render as a stray triangle on a still firm.
const MIN_VISIBLE_LENGTH_PX = 2;

function Arrow({ firm, colorFor }: { firm: GroupMapFirm; colorFor: (group: string | null) => string }) {
  // xFiveYearsAgo/yFiveYearsAgo are only read here after the caller has
  // already filtered to firms where both are non-null.
  const from = useCartesianScale({ x: firm.xFiveYearsAgo as number, y: firm.yFiveYearsAgo as number });
  const to = useCartesianScale({ x: firm.x, y: firm.y });
  if (!from || !to) return null;
  if (Math.hypot(to.x - from.x, to.y - from.y) < MIN_VISIBLE_LENGTH_PX) return null;

  return (
    <line
      x1={from.x}
      y1={from.y}
      x2={to.x}
      y2={to.y}
      stroke={colorFor(firm.group)}
      strokeOpacity={0.55}
      strokeWidth={1.25}
      markerEnd={`url(#${ARROW_MARKER_ID})`}
    />
  );
}

/**
 * Five-year movement overlay for the strategic-group map: one arrow per firm
 * from its position five years ago to its current position. Rendered as a
 * direct child of the map's ScatterChart (Recharts 3 lets arbitrary elements
 * sit anywhere in a chart's tree); `useCartesianScale` reads the chart's own
 * live axis scales so the arrows land in the same pixel space as the bubbles,
 * including after an axis is switched.
 *
 * Only firms carrying both `xFiveYearsAgo` and `yFiveYearsAgo` draw an arrow;
 * everyone else is left as a bubble only.
 */
export function FiveYearArrows({ firms, colorFor }: FiveYearArrowsProps) {
  const movers = firms.filter((f) => f.xFiveYearsAgo != null && f.yFiveYearsAgo != null);
  if (movers.length === 0) return null;

  return (
    <g aria-hidden="true">
      <defs>
        <marker id={ARROW_MARKER_ID} markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="rgba(255,255,255,0.6)" />
        </marker>
      </defs>
      {movers.map((f) => (
        <Arrow key={f.ticker} firm={f} colorFor={colorFor} />
      ))}
    </g>
  );
}
