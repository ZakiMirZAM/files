import { useState } from "react";
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
import { askQuestion } from "../../lib/aiApi";
import { Markdown } from "../Markdown";
import { Grid2x2, Sparkles, Loader2 } from "lucide-react";

interface StrategicGroupsSectionProps {
  data?: StrategicGroups | null;
  industry: string;
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
 * Porter's strategic-group map (Competitive Strategy Ch.7): the industry's
 * largest companies placed by profitability and scale, split at peer medians.
 * Persistent profit gaps BETWEEN groups point at mobility barriers. The AI
 * button adds Porter's Ch.3 competitor-response read for each group.
 */
export function StrategicGroupsSection({ data, industry }: StrategicGroupsSectionProps) {
  const [aiText, setAiText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!data) return null;
  if (!data.applicable) {
    return (
      <section className="animate-fade-up">
        <div className="panel-soft p-5">
          <p className="eyebrow mb-2 inline-flex items-center gap-2">
            <Grid2x2 className="w-4 h-4" /> Strategic Groups
          </p>
          <p className="text-sm text-white/55">{data.reason}</p>
        </div>
      </section>
    );
  }

  const points = data.points ?? [];
  const axes = data.axes;

  const profile = async () => {
    setLoading(true);
    setError(null);
    try {
      const dataContext = JSON.stringify({
        industry,
        strategicGroups: data.groups,
        peers: points.map((p) => ({
          ticker: p.ticker, group: p.group, operatingMarginPct: p.operatingMargin,
          marketCapUsd: p.marketCapUsd, badges: p.badges,
        })),
        axesMedians: axes,
      });
      const res = await askQuestion({
        section: "industry",
        question:
          `Using the strategic-group map in the data block for the ${industry} industry, write a Porter-style ` +
          `competitor analysis (Competitive Strategy, Ch.3 and Ch.7). For each group: what its members' goals and ` +
          `assumptions likely are, what strategy the position implies, how members would probably respond to a price ` +
          `attack or a new entrant, and what mobility barriers keep others out of the group. Close with which group ` +
          `holds the strongest position and which single company looks most exposed. Keep it concrete and grounded ` +
          `in the tickers given.`,
        dataContext,
      });
      setAiText(res.text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI competitor analysis failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="animate-fade-up" data-tour="strategic-groups">
      <div className="panel-soft p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
          <p className="eyebrow inline-flex items-center gap-2">
            <Grid2x2 className="w-4 h-4" /> Strategic Groups · Porter
          </p>
          <button
            onClick={profile}
            disabled={loading}
            className={cn(
              "text-xs font-medium px-3 py-1.5 rounded-sm border transition-colors inline-flex items-center gap-1.5",
              loading ? "border-white/10 text-white/40" : "border-gold/40 text-gold hover:bg-gold/10",
            )}
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {loading ? "Analyzing…" : aiText ? "Regenerate" : "Profile competitor responses"}
          </button>
        </div>
        <p className="text-sm text-white/50 mb-4 max-w-3xl">
          The industry's largest companies placed by profitability and scale. Companies in the same
          quadrant compete on similar terms; profit gaps between quadrants point at barriers.
        </p>

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
                dataKey="operatingMargin"
                name="Margin"
                tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }}
                tickFormatter={(v: number) => `${v}%`}
                width={48}
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
                  data={points.filter((p) => p.group === g.key)}
                  fill={GROUP_COLORS[g.key] ?? "#c9a84c"}
                  fillOpacity={0.85}
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-3">
          {(data.groups ?? []).map((g) => (
            <div key={g.key} className="rounded-sm px-2.5 py-2 border border-gold/10 bg-white/[0.015]">
              <p className="text-[0.68rem] uppercase tracking-wider font-semibold" style={{ color: GROUP_COLORS[g.key] }}>
                {g.label}
              </p>
              <p className="font-mono text-[0.75rem] text-white/70 mt-1 break-words">{g.members.join(" · ")}</p>
            </div>
          ))}
        </div>
        {data.unclassified && data.unclassified.length > 0 && (
          <p className="text-[0.72rem] text-white/40 mt-2">
            Not mapped (missing margin or market value): {data.unclassified.join(", ")}
          </p>
        )}
        <p className="text-[0.72rem] leading-6 text-white/40 mt-3 pt-3 border-t border-gold/10">{data.note}</p>

        {error && <p className="text-sm text-loss-strong mt-3">{error}</p>}
        {aiText && (
          <div className="text-sm text-white/80 leading-relaxed max-h-[26rem] overflow-y-auto pr-1 mt-4 pt-4 border-t border-gold/10">
            <Markdown content={aiText} />
          </div>
        )}
      </div>
    </section>
  );
}
