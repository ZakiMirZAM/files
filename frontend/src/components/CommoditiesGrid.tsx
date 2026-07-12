import { useState } from "react";
import {
  Area,
  AreaChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BookOpen } from "lucide-react";
import type { Commodity } from "../lib/types";
import { cn } from "../lib/cn";
import { openDefinition } from "../lib/definitionPanelStore";
import { ECON_PANEL_OFFSET } from "../lib/economicDefinitions";

const GOLD = "#c9a84c";
const VOL_STROKE = "#df8884";

// Commodity tile label -> economic definition number (resolved in the shared
// sidebar at ECON_PANEL_OFFSET + number). Heavy Trucks reuses its macro def (#15).
const COMMODITY_DEF: Record<string, number> = {
  Copper: 57,
  Gold: 58,
  Silver: 59,
  Wheat: 60,
  "WTI Crude": 61,
  "Brent Crude": 62,
  "Henry Hub NatGas": 63,
  "Heavy Trucks": 15,
};

interface CommoditiesGridProps {
  commodities: Commodity[];
}

export function CommoditiesGrid({ commodities }: CommoditiesGridProps) {
  if (commodities.length === 0) return null;

  return (
    <section className="mt-12 animate-fade-up">
      <header className="mb-6 pb-3 border-b border-gold/15">
        <p className="eyebrow mb-1">Commodities · {commodities.length} series</p>
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">
          Commodity Prices + 12-Month Rolling Volatility
        </h2>
        <p className="text-sm text-white/45 mt-1">
          Monthly prices from FRED + Yahoo Finance · dashed red line shows annualised
          log-return volatility on a trailing 12-month window
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {commodities.map((c) => (
          <CommodityCard key={c.label} commodity={c} />
        ))}
      </div>
    </section>
  );
}

function CommodityCard({ commodity }: { commodity: Commodity }) {
  const [showVol, setShowVol] = useState(true);

  const merged = commodity.price.map((p) => {
    const volPoint = commodity.volatility12m.find((v) => v.period === p.period);
    return { period: p.period, price: p.value, vol: volPoint?.value ?? null };
  });

  const latest = commodity.price[commodity.price.length - 1];
  const first = commodity.price[0];
  const change = first && latest && first.value > 0
    ? ((latest.value - first.value) / first.value) * 100
    : 0;
  const latestVol = commodity.volatility12m[commodity.volatility12m.length - 1];
  const defNumber = COMMODITY_DEF[commodity.label];

  return (
    <article className="panel-soft p-4 hover:border-gold/30 transition-colors">
      <header className="flex items-baseline justify-between mb-2">
        <div>
          {defNumber != null ? (
            <button
              type="button"
              onClick={() => openDefinition(ECON_PANEL_OFFSET + defNumber)}
              aria-label={`Read the ${commodity.label} definition`}
              className="group inline-flex items-center gap-1.5 text-left"
            >
              <h3 className="font-display text-base font-semibold text-white group-hover:text-gold transition-colors">
                {commodity.label}
              </h3>
              <BookOpen className="w-3 h-3 text-gold/40 group-hover:text-gold transition-colors" />
            </button>
          ) : (
            <h3 className="font-display text-base font-semibold text-white">{commodity.label}</h3>
          )}
          <p className="text-[0.65rem] uppercase tracking-wider text-white/35 font-mono">
            {commodity.ticker} · {commodity.unit}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-sm text-gold">{latest ? fmt(latest.value) : "—"}</p>
          <p className={cn(
            "text-[0.65rem] font-mono",
            change >= 0 ? "text-gain" : "text-loss",
          )}>
            {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)}%
          </p>
        </div>
      </header>

      <div className="h-32 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          {showVol ? (
            <LineChart data={merged} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
              <XAxis dataKey="period" hide />
              <YAxis yAxisId="price" hide domain={["dataMin", "dataMax"]} />
              <YAxis yAxisId="vol" hide orientation="right" domain={[0, "dataMax"]} />
              <Tooltip
                formatter={(v, name) => [
                  name === "price" ? fmt(Number(v)) : `${Number(v).toFixed(1)}% vol`,
                  name === "price" ? commodity.label : "12M Vol",
                ]}
                labelFormatter={(p) => String(p ?? "").slice(0, 7)}
              />
              <Line yAxisId="price" type="monotone" dataKey="price" stroke={GOLD} strokeWidth={1.6} dot={false} isAnimationActive={false} />
              <Line yAxisId="vol" type="monotone" dataKey="vol" stroke={VOL_STROKE} strokeWidth={1.2} strokeDasharray="3 3" dot={false} isAnimationActive={false} />
            </LineChart>
          ) : (
            <AreaChart data={commodity.price} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`grad-${commodity.label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={GOLD} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="period" hide />
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Tooltip
                formatter={(v) => [fmt(Number(v)), commodity.label]}
                labelFormatter={(p) => String(p ?? "").slice(0, 7)}
              />
              <Area type="monotone" dataKey="value" stroke={GOLD} strokeWidth={1.6} fill={`url(#grad-${commodity.label})`} isAnimationActive={false} />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>

      <footer className="flex items-center justify-between mt-2 pt-2 border-t border-gold/5">
        <span className="text-[0.65rem] font-mono text-white/40">
          {latestVol ? `vol₁₂ₘ ${latestVol.value.toFixed(1)}%` : ""}
        </span>
        <button
          onClick={() => setShowVol(!showVol)}
          className="text-[0.65rem] text-white/40 hover:text-gold transition-colors"
        >
          {showVol ? "hide vol" : "show vol"}
        </button>
      </footer>
    </article>
  );
}

function fmt(v: number): string {
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(2);
  return v.toFixed(2);
}
