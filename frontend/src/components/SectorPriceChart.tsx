import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDown } from "lucide-react";
import { fetchSectorEtf } from "../lib/api";
import type { SectorEtfData } from "../lib/types";
import { cn } from "../lib/cn";
import { ChartSkeleton } from "./Skeletons";

interface SectorPriceChartProps {
  sector: string;
}

const GOLD = "#c9a84c";
const yr = (period: string): string => (period.length >= 4 ? period.slice(0, 4) : period);
const usd = (v: number): string =>
  `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

/**
 * Collapsible price graph of the sector's SPDR index fund (XLK, XLF, ...). Closed
 * by default — the price line is supporting context, not the focus of the page —
 * and styled to match the rest of the app's charts. Data comes from
 * /api/sector-etf/{sector}, server-cached for 15 minutes.
 */
export function SectorPriceChart({ sector }: SectorPriceChartProps) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<SectorEtfData | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Lazy-load on first expand so closed dropdowns don't fetch.
  useEffect(() => {
    if (!open || loaded) return;
    let active = true;
    fetchSectorEtf(sector).then((d) => {
      if (active) {
        setData(d);
        setLoaded(true);
      }
    });
    return () => {
      active = false;
    };
  }, [open, loaded, sector]);

  // Reset when the sector changes so the chart refetches for the new sector.
  useEffect(() => {
    setData(null);
    setLoaded(false);
    setOpen(false);
  }, [sector]);

  const hasChart = data && data.history.length > 0;

  return (
    <article className="panel overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="eyebrow">Index fund</span>
          <span className="font-display text-base text-white truncate">
            {sector} price chart
            {data?.ticker ? <span className="text-gold font-mono text-sm ml-2">{data.ticker}</span> : null}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {data?.latest != null && (
            <span className="font-mono text-sm text-white/80">{usd(data.latest)}</span>
          )}
          <ChevronDown
            className={cn("w-4 h-4 text-white/40 transition-transform", open && "rotate-180")}
          />
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5">
          {!loaded ? (
            <div className="pt-4">
              <ChartSkeleton heightClass="h-80" bars={16} label="Loading price history…" />
            </div>
          ) : hasChart ? (
            <>
              <div className="h-80 -mx-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data!.history} margin={{ top: 12, right: 24, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 4" vertical={false} />
                    <XAxis
                      dataKey="period"
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={yr}
                      minTickGap={40}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      width={56}
                      tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                      domain={["auto", "auto"]}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#15161a",
                        border: "1px solid rgba(201,168,76,0.25)",
                        borderRadius: 4,
                        fontSize: 12,
                      }}
                      formatter={(value) => [usd(Number(value)), data!.ticker ?? "Price"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      name={data!.ticker ?? "Price"}
                      stroke={GOLD}
                      strokeWidth={1.8}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[0.72rem] text-white/35 mt-2 font-mono">
                {data!.label ?? `${data!.ticker} adjusted close`} · Yahoo Finance · refreshed every 15 min
                {data!.asOf ? ` · as of ${data!.asOf}` : ""}
              </p>
            </>
          ) : (
            <p className="text-sm text-white/40 py-8 text-center">
              Price history for this sector's index fund is unavailable right now.
            </p>
          )}
        </div>
      )}
    </article>
  );
}
