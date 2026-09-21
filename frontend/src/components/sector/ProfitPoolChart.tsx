import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { ProfitPoolData, ProfitPoolIndustry } from "../../lib/groupMapApi";
import type { RuntimeGroup } from "../../lib/types";
import { MetricTerm } from "../individual/DefinitionsBlock";
import { QualitativeBlock } from "../QualitativeBlock";
import { PROFIT_POOL_COPY } from "../../lib/industryDecksB";
import { PieChart } from "lucide-react";
import { moneySign } from "../../lib/format";

interface ProfitPoolChartProps {
  data: ProfitPoolData;
  sector: string;
  deck: RuntimeGroup[];
}

// Categorical palette, not the red/green good/bad pair used for margin signal
// elsewhere: these bars represent DIFFERENT industries, not a verdict.
const PALETTE = [
  "#c9a84c", // gold
  "#8fa8c9", // steel blue
  "#7fb87c", // sage
  "#c87672", // clay
  "#a892c9", // violet
  "#c9b48f", // sand
  "#72a8a0", // teal
  "#c98fae", // rose
];

const NOT_MEANINGFUL = "Not meaningful";
const SMALL_SLICE_THRESHOLD = 0.05;
const CHART_HEIGHT = 260;
const CHART_WIDTH = 100; // percent-based viewBox, scaled by the SVG's viewBox

const money = (v: number): string => {
  const a = Math.abs(v);
  const s = moneySign(v);
  if (a >= 1e12) return `${s}$${(a / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`;
  return `${s}$${(a / 1e6).toFixed(0)}M`;
};

const pct = (v: number | null | undefined, digits = 1): string =>
  v == null || !Number.isFinite(v) ? NOT_MEANINGFUL : `${(v * 100).toFixed(digits)}%`;

interface Bar {
  industry: ProfitPoolIndustry;
  x0: number;
  x1: number;
  color: string;
}

function layoutBars(industries: ProfitPoolIndustry[]): Bar[] {
  let cursor = 0;
  return industries.map((industry, i) => {
    const width = Math.max(0, industry.revenueShare) * 100;
    const bar: Bar = { industry, x0: cursor, x1: cursor + width, color: PALETTE[i % PALETTE.length] };
    cursor += width;
    return bar;
  });
}

/**
 * Marimekko-style variable-width bar chart: bar width is revenue share, bar
 * height is operating margin, so the AREA of every bar is that industry's
 * share of the sector's operating profit (Ch.4 profit-pool mapping). Built as
 * plain SVG because recharts has no native variable-width bar primitive.
 */
function ProfitPoolSvg({ industries }: { industries: ProfitPoolIndustry[] }) {
  const bars = useMemo(() => layoutBars(industries), [industries]);
  const [hovered, setHovered] = useState<string | null>(null);

  const maxMargin = Math.max(0.02, ...bars.map((b) => Math.max(0, b.industry.operatingMargin)));
  const minMargin = Math.min(-0.02, ...bars.map((b) => Math.min(0, b.industry.operatingMargin)));
  const range = maxMargin - minMargin;
  const zeroY = (maxMargin / range) * CHART_HEIGHT;

  const yFor = (margin: number): number => zeroY - (margin / range) * CHART_HEIGHT;

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: CHART_HEIGHT + 40 }}
        role="img"
        aria-label={`Profit pool for the sector, bars sized by revenue share and operating margin`}
      >
        {/* Zero line */}
        <line
          x1={0}
          x2={CHART_WIDTH}
          y1={zeroY}
          y2={zeroY}
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={0.15}
          vectorEffect="non-scaling-stroke"
        />
        {bars.map((bar) => {
          const isSmall = bar.industry.revenueShare < SMALL_SLICE_THRESHOLD;
          const barY = bar.industry.operatingMargin >= 0 ? yFor(bar.industry.operatingMargin) : zeroY;
          const barHeight = Math.abs(yFor(bar.industry.operatingMargin) - zeroY);
          const isHovered = hovered === bar.industry.industry;
          return (
            <g key={bar.industry.industry}>
              <rect
                x={bar.x0}
                y={barY}
                width={Math.max(0, bar.x1 - bar.x0 - 0.15)}
                height={Math.max(0.5, barHeight)}
                fill={bar.color}
                opacity={isHovered ? 1 : 0.85}
                tabIndex={0}
                role="img"
                aria-label={`${bar.industry.industry}: revenue share ${pct(bar.industry.revenueShare)}, operating margin ${pct(bar.industry.operatingMargin)}, profit share ${bar.industry.profitShare == null ? "not meaningful" : pct(bar.industry.profitShare)}`}
                onMouseEnter={() => setHovered(bar.industry.industry)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(bar.industry.industry)}
                onBlur={() => setHovered(null)}
                className="cursor-pointer transition-opacity outline-none focus-visible:stroke-white focus-visible:stroke-[0.3]"
              >
                <title>
                  {`${bar.industry.industry}: revenue ${money(bar.industry.revenueUsd)} (${pct(bar.industry.revenueShare)} of sector), operating margin ${pct(bar.industry.operatingMargin)}, profit share ${bar.industry.profitShare == null ? NOT_MEANINGFUL : pct(bar.industry.profitShare)}`}
                </title>
              </rect>
              {!isSmall && (
                <text
                  x={(bar.x0 + bar.x1) / 2}
                  y={barY + (bar.industry.operatingMargin >= 0 ? -2 : barHeight + 6)}
                  textAnchor="middle"
                  fontSize={2.6}
                  fill="rgba(255,255,255,0.75)"
                  className="pointer-events-none select-none"
                >
                  {bar.industry.industry.length > 18 ? `${bar.industry.industry.slice(0, 16)}…` : bar.industry.industry}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function SmallSliceLegend({ industries }: { industries: ProfitPoolIndustry[] }) {
  const small = industries.filter((i) => i.revenueShare < SMALL_SLICE_THRESHOLD);
  if (small.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
      {small.map((i) => (
        <span key={i.industry} className="inline-flex items-center gap-1.5 text-[0.72rem] text-white/50">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: PALETTE[industries.indexOf(i) % PALETTE.length] }}
          />
          {i.industry} ({pct(i.revenueShare)})
        </span>
      ))}
    </div>
  );
}

function ProfitPoolTable({ industries }: { industries: ProfitPoolIndustry[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th scope="col" className="text-left py-2 pr-3 text-[0.68rem] uppercase tracking-wider text-white/40">
              Industry
            </th>
            <th scope="col" className="text-right py-2 px-3 text-[0.68rem] uppercase tracking-wider text-white/40">
              <MetricTerm metric="Revenue share" asSpan>
                Revenue share
              </MetricTerm>
            </th>
            <th scope="col" className="text-right py-2 px-3 text-[0.68rem] uppercase tracking-wider text-white/40">
              <MetricTerm metric="Operating margin" asSpan>
                Operating margin
              </MetricTerm>
            </th>
            <th scope="col" className="text-right py-2 px-3 text-[0.68rem] uppercase tracking-wider text-white/40">
              Profit share now
            </th>
            <th scope="col" className="text-right py-2 px-3 text-[0.68rem] uppercase tracking-wider text-white/40">
              Profit share 5y ago
            </th>
          </tr>
        </thead>
        <tbody>
          {industries.map((i) => (
            <tr key={i.industry} className="border-t border-gold/10">
              <th scope="row" className="text-left py-2 pr-3 font-normal">
                <Link
                  to={`/app/industry/${encodeURIComponent(i.industry)}`}
                  className="text-gold hover:underline"
                >
                  {i.industry}
                </Link>
              </th>
              <td className="py-2 px-3 text-right font-mono text-white/80">{pct(i.revenueShare)}</td>
              <td className="py-2 px-3 text-right font-mono text-white/80">{pct(i.operatingMargin)}</td>
              <td className="py-2 px-3 text-right font-mono text-white/80">
                {i.profitShare == null ? NOT_MEANINGFUL : pct(i.profitShare)}
              </td>
              <td className="py-2 px-3 text-right font-mono text-white/60">
                {i.profitShareFiveYearsAgo == null ? NOT_MEANINGFUL : pct(i.profitShareFiveYearsAgo)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Sector profit pool: a variable-width bar chart where bar width is revenue
 * share and bar height is operating margin, so bar area reads as profit
 * share (Ch.4). A table underneath carries the same figures for screen
 * readers and for anyone who prefers exact numbers over the visual.
 */
export function ProfitPoolChart({ data, sector, deck }: ProfitPoolChartProps) {
  const industries = useMemo(
    () => [...data.industries].sort((a, b) => b.revenueShare - a.revenueShare),
    [data.industries],
  );

  if (industries.length === 0) return null;

  return (
    <section className="panel-soft p-5 space-y-4" data-tour="profit-pool">
      <div className="flex items-center gap-2">
        <PieChart className="w-4 h-4 text-gold" />
        <p className="eyebrow">{PROFIT_POOL_COPY.title}</p>
      </div>
      <p className="text-sm text-white/55 max-w-3xl leading-6">{PROFIT_POOL_COPY.note}</p>

      {data.negativeSectorProfit && (
        <p className="text-sm text-white/70 rounded-sm border border-white/15 bg-white/[0.03] px-3 py-2">
          {PROFIT_POOL_COPY.negative}
        </p>
      )}

      <ProfitPoolSvg industries={industries} />
      <SmallSliceLegend industries={industries} />

      <div className="pt-2">
        <ProfitPoolTable industries={industries} />
      </div>

      {deck.length > 0 && (
        <div className="pt-4 border-t border-gold/10">
          <QualitativeBlock
            section="sector"
            scopeKey={sector}
            groups={deck}
            storageSuffix="profitpool"
            hideHeader
          />
        </div>
      )}
    </section>
  );
}
