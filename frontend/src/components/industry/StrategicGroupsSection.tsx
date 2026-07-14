import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { StrategicGroups, StrategicGroupPoint } from "../../lib/types";
import { cn } from "../../lib/cn";
import { DefinitionLink } from "../individual/DefinitionsBlock";
import { QualitativeBlock } from "../QualitativeBlock";
import { Grid2x2, Loader2 } from "lucide-react";

/** Must match the group title in QUALITATIVE_QUESTIONS.industry, and must also be
 *  listed in the page-bottom deck's excludeTitles in IndustryDetail, or the deck
 *  renders twice. */
export const STRATEGIC_GROUPS_DECK_TITLE =
  "Strategic Groups";

interface StrategicGroupsSectionProps {
  data?: StrategicGroups | null;
  industry: string;
  /** How many companies the map is plotting. */
  limit: number;
  onLimitChange: (limit: number) => void;
  loading?: boolean;
}

const GROUP_COLORS: Record<string, string> = {
  scale_leaders: "#c9a84c",     // gold
  premium_niche: "#7fb87c",     // gain
  volume_incumbents: "#8fa8c9", // steel blue
  challengers: "#c87672",       // loss/clay
};

const money = (v: number): string =>
  v >= 1e12 ? `$${(v / 1e12).toFixed(1)}T` : v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${(v / 1e6).toFixed(0)}M`;

function PointTooltip({ active, payload }: { active?: boolean; payload?: { payload: StrategicGroupPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-gold/25 bg-[#10131f] px-3 py-2 text-xs shadow-lg">
      <p className="font-mono font-semibold text-white/90">{p.ticker}</p>
      <p className="text-white/60 mt-0.5">Operating margin {p.operatingMargin.toFixed(1)}%</p>
      <p className="text-white/60">Market value {money(p.marketCapUsd)}</p>
      {p.badges && p.badges.length > 0 && (
        <p className="text-gold/80 mt-0.5">{p.badges.join(" · ")}</p>
      )}
    </div>
  );
}

/**
 * Porter's strategic-group map (Competitive Strategy Ch.7). Companies plotted by
 * profitability and scale, split at the medians of whichever peers are on the map.
 *
 * The company-count control is not a cosmetic filter. The medians move with the
 * peer set, so widening it can push a company from one quadrant into another, and
 * Porter's own instruction is to map an industry more than one way before trusting
 * any single picture. The last question in the deck asks the reader to do exactly
 * that and report which companies held their group and which jumped.
 */
export function StrategicGroupsSection({
  data,
  industry,
  limit,
  onLimitChange,
  loading,
}: StrategicGroupsSectionProps) {
  if (!data) return null;

  const options = data.limitOptions ?? [20, 40, 60, 100];

  // No option is ever disabled. An industry with fewer companies than the option
  // asks for simply returns everything it has, and the caption under the chart says
  // how many were actually plotted. Greying an option out would require knowing the
  // industry's true company count, which the endpoint cannot report without a
  // separate query, and guessing it from the capped result set is what broke this
  // control the first time.
  const countControl = (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[0.7rem] uppercase tracking-wider text-white/35">Companies</span>
      <div className="flex items-center rounded-sm border border-gold/20 overflow-hidden">
        {options.map((n) => (
          <button
            key={n}
            onClick={() => onLimitChange(n)}
            disabled={loading}
            className={cn(
              "px-2.5 py-1 text-xs font-mono transition-colors",
              n === limit
                ? "bg-gold/15 text-gold"
                : "text-white/50 hover:text-white/80 hover:bg-white/[0.04] disabled:opacity-40",
            )}
            title={`Map the largest ${n} companies in this industry`}
          >
            {n}
          </button>
        ))}
      </div>
      {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-white/40" />}
    </div>
  );

  const deck = (
    <QualitativeBlock
      section="industry"
      scopeKey={industry}
      onlyTitles={[STRATEGIC_GROUPS_DECK_TITLE]}
      storageSuffix="stratgroups"
      dataContext={JSON.stringify({
        industry,
        companiesMapped: limit,
        strategicGroups: data.groups,
        peers: (data.points ?? []).map((p) => ({
          ticker: p.ticker,
          group: p.group,
          operatingMarginPct: p.operatingMargin,
          marketCapUsd: p.marketCapUsd,
          badges: p.badges,
        })),
        axesMedians: data.axes,
        unclassified: data.unclassified,
      })}
      hideHeader
    />
  );

  if (!data.applicable) {
    return (
      <section className="animate-fade-up" data-tour="strategic-groups">
        <div className="panel-soft p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
            <p className="eyebrow inline-flex items-center gap-2">
              <Grid2x2 className="w-4 h-4" /> Strategic Groups
            </p>
            {countControl}
          </div>
          <p className="text-sm text-white/55">{data.reason}</p>
          <DefinitionLink number={328} prominent className="mt-3">
            How the strategic-group map works
          </DefinitionLink>
          <div className="mt-6">{deck}</div>
        </div>
      </section>
    );
  }

  const points = data.points ?? [];
  const axes = data.axes;

  // Bounded margin axis, with outliers clamped to the edge rather than dropped.
  //
  // Widening the map pulls in companies whose revenue is near zero, and a loss over
  // almost no revenue produces an operating margin of minus thousands of percent.
  // Biotechnology at 100 companies bottoms out around -28,500%. One of those stretches
  // the axis so far that all the other companies collapse onto a single line.
  //
  // For a strategic-group map the distinction between a -200% margin and a -6,000% one
  // carries no information: both mean the company is burning cash and selling almost
  // nothing. So the window is bounded, and anything past the edge is PLOTTED AT the
  // edge instead of vanishing, with a count under the chart saying how many. The group
  // assignment is untouched, because the quadrants split at the median and an outlier
  // cannot move a median.
  const MARGIN_FLOOR = -100;   // losing more than all of revenue; beyond this is noise
  const MARGIN_CEIL = 100;
  const sorted = points.map((p) => p.operatingMargin).sort((a, b) => a - b);
  const pct = (f: number): number =>
    sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(f * (sorted.length - 1))))] ?? 0;
  const pad = 6;
  const yMin = Math.max(MARGIN_FLOOR, Math.floor(pct(0.1) - pad));
  const yMax = Math.min(MARGIN_CEIL, Math.ceil(pct(0.9) + pad));

  const clamp = (v: number): number => Math.min(yMax, Math.max(yMin, v));
  const plotted = points.map((p) => ({ ...p, yPlot: clamp(p.operatingMargin) }));
  const offScale = points.filter(
    (p) => p.operatingMargin < yMin || p.operatingMargin > yMax,
  );

  return (
    <section className="animate-fade-up" data-tour="strategic-groups">
      <div className="panel-soft p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <p className="eyebrow inline-flex items-center gap-2">
            <Grid2x2 className="w-4 h-4" /> Strategic Groups
          </p>
          {countControl}
        </div>

        <DefinitionLink number={328} prominent className="mb-4">
          How the strategic-group map works
        </DefinitionLink>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                type="number"
                dataKey="logMcap"
                name="Size"
                domain={["dataMin - 0.3", "dataMax + 0.3"]}
                tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }}
                tickFormatter={(v: number) => money(10 ** v)}
                label={{ value: "Company size (market value, log scale)", position: "insideBottom", dy: 10, fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
              />
              <YAxis
                type="number"
                dataKey="yPlot"
                name="Margin"
                domain={[yMin, yMax]}
                allowDataOverflow
                tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }}
                tickFormatter={(v: number) =>
                  v <= yMin ? `≤${yMin}%` : v >= yMax ? `≥${yMax}%` : `${v}%`
                }
                width={52}
              />
              <Tooltip content={<PointTooltip />} cursor={{ strokeDasharray: "3 3" }} />
              {axes?.logMcapMedian != null && (
                <ReferenceLine x={axes.logMcapMedian} stroke="rgba(201,168,76,0.35)" strokeDasharray="4 4" />
              )}
              {axes?.marginMedian != null && (
                <ReferenceLine y={axes.marginMedian} stroke="rgba(201,168,76,0.35)" strokeDasharray="4 4" />
              )}
              {(data.groups ?? []).map((g) => (
                <Scatter
                  key={g.key}
                  name={g.label}
                  data={plotted.filter((p) => p.group === g.key)}
                  fill={GROUP_COLORS[g.key] ?? "#c9a84c"}
                  fillOpacity={0.85}
                  isAnimationActive={false}
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-3">
          {(data.groups ?? []).map((g) => (
            <div key={g.key} className="rounded-sm px-2.5 py-2 border border-gold/10 bg-white/[0.015]">
              <p className="text-[0.68rem] uppercase tracking-wider font-semibold" style={{ color: GROUP_COLORS[g.key] }}>
                {g.label} <span className="text-white/30 font-normal">({g.members.length})</span>
              </p>
              <p className="font-mono text-[0.75rem] text-white/70 mt-1 break-words">{g.members.join(" · ")}</p>
            </div>
          ))}
        </div>

        <div className="mt-2 space-y-1">
          <p className="text-[0.72rem] text-white/40">
            Mapping {points.length} of the industry's largest companies. The dashed lines are the
            medians of these peers, so changing the count can move a company between groups.
          </p>
          {offScale.length > 0 && (
            <p className="text-[0.72rem] text-white/40">
              {offScale.length} {offScale.length === 1 ? "company sits" : "companies sit"} beyond the
              visible margin range and {offScale.length === 1 ? "is" : "are"} drawn at the edge:{" "}
              <span className="font-mono text-white/55">
                {offScale.slice(0, 8).map((p) => p.ticker).join(", ")}
                {offScale.length > 8 ? ` and ${offScale.length - 8} more` : ""}
              </span>
              . They earn almost no revenue, so the margin runs to thousands of percent and would
              flatten the chart. Their group is unaffected, because the split is made at the median.
            </p>
          )}
          {data.unclassified && data.unclassified.length > 0 && (
            <p className="text-[0.72rem] text-white/40">
              Not mapped (no margin or market value): {data.unclassified.join(", ")}
            </p>
          )}
        </div>

        <div className="mt-6 pt-5 border-t border-gold/10">{deck}</div>
      </div>
    </section>
  );
}
