import type { ReactElement } from "react";
import { Label, ReferenceArea } from "recharts";
import type { RecessionBand } from "../lib/types";

/**
 * Shared NBER-recession overlay for every economic chart. The bands carry the
 * official peak→trough dates and labels from the backend (see
 * fetch_recession_bands); this renders the shading + an on-chart name tag, and
 * a caption legend that spells out each recession's exact published month range.
 */

const RECESSION_FILL = "rgba(255, 255, 255, 0.09)";
const RECESSION_STROKE = "rgba(255, 255, 255, 0.26)";

/** Compact on-chart tag (full name + exact range live in the legend below). */
function shortTag(label: string | undefined): string | undefined {
  if (!label) return undefined;
  if (label.startsWith("Great Recession")) return "GFC";
  if (label.startsWith("COVID")) return "COVID-19";
  if (label.startsWith("Dot-com")) return "Dot-com";
  if (label.startsWith("Great Depression")) return "Depression";
  return label.replace(/\s*recession$/i, "");
}

/** Bands that overlap the visible [earliest, latest] window. */
export function visibleRecessions(
  bands: RecessionBand[],
  earliest: string,
  latest: string,
): RecessionBand[] {
  return bands.filter((b) => b.end >= earliest && b.start <= latest);
}

/**
 * Recharts <ReferenceArea> shading for each recession in [earliest, latest],
 * each tagged with a small vertical name label. Returned as an array so it can
 * be dropped straight into a chart's children (recharts needs direct children).
 */
export function buildRecessionAreas(
  bands: RecessionBand[],
  earliest: string,
  latest: string,
  opts: { labels?: boolean; bordered?: boolean } = {},
): ReactElement[] {
  const { labels = true, bordered = false } = opts;
  return visibleRecessions(bands, earliest, latest).map((b, i) => (
    <ReferenceArea
      key={`rec-${i}`}
      x1={b.start < earliest ? earliest : b.start}
      x2={b.end > latest ? latest : b.end}
      fill={RECESSION_FILL}
      stroke={bordered ? RECESSION_STROKE : undefined}
      strokeWidth={bordered ? 1 : undefined}
      strokeDasharray={bordered ? "3 4" : undefined}
      ifOverflow="visible"
    >
      {labels && b.label ? (
        <Label
          value={shortTag(b.label)}
          position="insideTop"
          angle={-90}
          offset={10}
          fill="rgba(255,255,255,0.5)"
          fontSize={9}
          fontFamily="JetBrains Mono"
        />
      ) : null}
    </ReferenceArea>
  ));
}

/** Caption listing each shaded recession with its exact published month range. */
export function RecessionLegend({ bands }: { bands: RecessionBand[] }) {
  if (bands.length === 0) return null;
  const labeled = bands.filter((b) => b.label);
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
      <span className="inline-flex items-center gap-1.5 text-[0.65rem] uppercase tracking-wider font-mono text-white/45">
        <span className="inline-block w-3 h-2 bg-white/10 border border-white/30" />
        NBER recessions
      </span>
      {labeled.map((b, i) => (
        <span key={i} className="text-[0.66rem] font-mono leading-tight">
          <span className="text-white/70">{b.label}</span>
          {b.range ? <span className="text-white/35"> · {b.range}</span> : null}
        </span>
      ))}
    </div>
  );
}
