import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BookOpen, ChevronDown } from "lucide-react";
import type { FedModel, RecessionBand } from "../lib/types";
import { cn } from "../lib/cn";
import { openDefinition } from "../lib/definitionPanelStore";
import { ECON_PANEL_OFFSET } from "../lib/economicDefinitions";
import { buildRecessionAreas, visibleRecessions, RecessionLegend } from "./RecessionOverlay";

interface FedModelSectionProps {
  fedModel?: FedModel | null;
  recessionBands?: RecessionBand[];
}

const GOLD = "#c9a84c";
const GOLD_SOFT = "#d9b85c";
const TREASURY = "#7c9fd6";

const pct = (v: number | null | undefined, d = 2): string =>
  v == null || !Number.isFinite(v) ? "n/a" : `${v.toFixed(d)}%`;
const yr = (period: string): string => (period.length >= 4 ? period.slice(0, 4) : period);

/**
 * "Fed model" comparison: the S&P 500's earnings yield against the
 * 1-Year Treasury yield (FRED DGS1). A positive spread means equities are cheap
 * relative to short-term bonds.
 */
export function FedModelSection({ fedModel, recessionBands = [] }: FedModelSectionProps) {
  const [open, setOpen] = useState(false);

  // Merge the (sparse) earnings-yield series and the (dense, daily) Treasury
  // series onto a single date axis so both can be drawn together.
  const merged = useMemo(() => {
    if (!fedModel) return [];
    const byDate = new Map<string, { period: string; ey?: number; fey?: number; treasury?: number }>();
    for (const p of fedModel.treasuryYieldTrend) {
      byDate.set(p.period, { ...(byDate.get(p.period) ?? { period: p.period }), treasury: p.value });
    }
    for (const p of fedModel.earningsYieldTrend) {
      byDate.set(p.period, { ...(byDate.get(p.period) ?? { period: p.period }), ey: p.value });
    }
    for (const p of fedModel.forwardEarningsYieldTrend ?? []) {
      byDate.set(p.period, { ...(byDate.get(p.period) ?? { period: p.period }), fey: p.value });
    }
    return [...byDate.values()].sort((a, b) => (a.period < b.period ? -1 : 1));
  }, [fedModel]);

  // Must run before any early return, keeping every hook above the
  // `!fedModel` guard so the hook count is identical on every render.
  const recessionWindow = useMemo<[string, string] | null>(() => {
    if (recessionBands.length === 0 || merged.length === 0) return null;
    return [merged[0].period, merged[merged.length - 1].period];
  }, [recessionBands, merged]);

  const recessionEls = useMemo(
    () =>
      recessionWindow
        ? buildRecessionAreas(recessionBands, recessionWindow[0], recessionWindow[1], { labels: true })
        : null,
    [recessionBands, recessionWindow],
  );

  const visibleRecBands = useMemo(
    () => (recessionWindow ? visibleRecessions(recessionBands, recessionWindow[0], recessionWindow[1]) : []),
    [recessionBands, recessionWindow],
  );

  if (!fedModel) return null;

  const snap = fedModel.snapshot;
  const spread = snap?.spread ?? null;
  const spreadColor =
    spread == null ? "text-white/50" : spread >= 0 ? "text-gain-strong" : "text-loss-strong";

  const spreadSummary =
    spread == null ? null : `${spread >= 0 ? "+" : ""}${spread.toFixed(2)}pp spread`;

  return (
    <article className="panel overflow-hidden animate-fade-up">
      <div className="w-full flex items-center gap-3 px-6 md:px-8 py-4">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex-1 min-w-0 flex items-center gap-4 text-left group"
        >
          <div className="flex-1 min-w-0">
            <p className="eyebrow mb-1">Equities vs bonds · Fed model</p>
            <h2 className="font-display text-xl md:text-2xl font-semibold text-white leading-tight">
              Earnings Yield vs 1-Year Treasury
            </h2>
          </div>
          {spreadSummary && (
            <span className={cn("hidden sm:block font-mono text-sm shrink-0", spreadColor)}>
              {spreadSummary}
            </span>
          )}
          <ChevronDown
            className={cn(
              "w-5 h-5 text-white/40 shrink-0 transition-transform duration-200 group-hover:text-gold",
              open && "rotate-180",
            )}
          />
        </button>
        <button
          type="button"
          onClick={() => openDefinition(ECON_PANEL_OFFSET + 64)}
          aria-label="Read the Earnings Yield vs 1-Year Treasury definition"
          title="Definition"
          className="btn-ghost shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[0.7rem] font-mono uppercase tracking-wider text-white/45 hover:text-gold"
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Define</span>
        </button>
      </div>

      {open && (
      <div className="px-6 md:px-8 pb-8 pt-1 border-t border-gold/10">
      {snap ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2 mb-6">
          <Stat label="Earnings yield (trailing)" value={pct(snap.earningsYield)} accent />
          <Stat label="Earnings yield (forward)" value={pct(snap.forwardEarningsYield)} accent />
          <Stat label="1Y Treasury (DGS1)" value={pct(snap.treasuryYield)} />
          <Stat
            label="Spread (trailing)"
            value={spread == null ? "n/a" : `${spread >= 0 ? "+" : ""}${spread.toFixed(2)}pp`}
            className={spreadColor}
          />
          <Stat label="S&P 500 PE (price/EPS)" value={snap.marketPe != null ? `${snap.marketPe.toFixed(1)}×` : "n/a"} />
          <Stat
            label={`S&P 500 EPS (trailing)${snap.asOf ? ` · ${snap.asOf}` : ""}`}
            value={snap.sp500Eps != null ? snap.sp500Eps.toLocaleString() : "n/a"}
          />
          <Stat
            label={`S&P 500 EPS (projected${snap.analystGrowth != null ? ` · +${(snap.analystGrowth * 100).toFixed(1)}%` : ""})`}
            value={snap.sp500ForwardEps != null ? snap.sp500ForwardEps.toLocaleString() : "n/a"}
          />
        </div>
      ) : (
        <div className="rounded-sm border border-gold/20 bg-gold/[0.06] px-4 py-3 mb-6 text-sm text-white/55">
          The earnings-yield snapshot draws on published S&P 500 earnings and the live Yahoo
          Finance price; it populates once the market-data sources have loaded. The 1-Year Treasury
          history is shown below in the meantime.
        </div>
      )}

      <div className="h-80 -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={merged} margin={{ top: 12, right: 24, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="period" axisLine={false} tickLine={false} tickFormatter={yr} minTickGap={32} />
            <YAxis
              axisLine={false}
              tickLine={false}
              width={48}
              tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            />
            <Tooltip
              contentStyle={{ background: "#15161a", border: "1px solid rgba(201,168,76,0.25)", borderRadius: 4, fontSize: 12 }}
              formatter={(value, name) => [`${Number(value).toFixed(2)}%`, String(name)]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {recessionEls}
            <Line
              type="monotone"
              dataKey="treasury"
              name="1Y Treasury"
              stroke={TREASURY}
              strokeWidth={1.6}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="ey"
              name="Earnings yield (trailing)"
              stroke={GOLD}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: GOLD }}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="fey"
              name="Earnings yield (forward)"
              stroke={GOLD_SOFT}
              strokeWidth={1.6}
              strokeDasharray="5 3"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {visibleRecBands.length > 0 && <RecessionLegend bands={visibleRecBands} />}
      </div>
      )}
    </article>
  );
}

function Stat({
  label,
  value,
  accent,
  className,
}: {
  label: string;
  value: string;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div className="panel-soft px-3 py-2.5">
      <p className="text-[0.65rem] uppercase tracking-wider text-white/40 leading-tight">{label}</p>
      <p className={cn("font-mono text-[0.95rem] mt-1", accent ? "text-gold" : "text-white/85", className)}>{value}</p>
    </div>
  );
}
