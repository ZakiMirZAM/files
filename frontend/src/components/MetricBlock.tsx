import { useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Label,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Metric, RecessionBand, TrendPoint } from "../lib/types";
import { buildRecessionAreas, visibleRecessions, RecessionLegend } from "./RecessionOverlay";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  isMaterialChange,
  pctChange,
  toYoYSeries,
} from "../lib/format";
import { cn } from "../lib/cn";
import { MetricTerm } from "./individual/DefinitionsBlock";

const GOLD = "#c9a84c";
const GOLD_SOFT = "#d9b85c";
const GAIN_FILL = "rgba(127,184,124,0.32)";
const GAIN_STROKE = "#7fb87c";
const LOSS_FILL = "rgba(200,118,114,0.32)";
const LOSS_STROKE = "#c87672";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatValue(v: number, unit: Metric["unit"]): string {
  if (unit === "$") return formatCurrency(v);
  if (unit === "%") return formatPercent(v);
  if (unit === "x") return `${v.toFixed(2)}x`;
  return formatNumber(v);
}

function formatAxisValue(v: number, unit: Metric["unit"]): string {
  if (unit === "$") {
    if (Math.abs(v) >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
    if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(0)}B`;
    if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
    if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
    return `$${v.toFixed(0)}`;
  }
  if (unit === "%") return `${v.toFixed(0)}%`;
  if (unit === "x") return `${v.toFixed(1)}x`;
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toFixed(0);
}

/** Pretty period: "2024" for annual, "Mar 2024" for monthly/quarterly, "Mar 15, 2024" for daily. */
function formatPeriodLabel(period: string, frequency: Metric["frequency"]): string {
  if (frequency === "annual" || period.length === 4) return period;
  const [y, m, d] = period.split("-");
  const mi = parseInt(m, 10) - 1;
  if (frequency === "daily") return `${MONTH_SHORT[mi]} ${parseInt(d, 10)}, ${y}`;
  return `${MONTH_SHORT[mi]} ${y}`;
}

function formatTick(period: string, _frequency: Metric["frequency"]): string {
  // Always show just the year on X-axis ticks. Tooltips/labels use formatPeriodLabel for fuller dates.
  return period.length >= 4 ? period.slice(0, 4) : period;
}

/** Reduce to roughly 6-8 evenly-spaced ticks. */
function buildAxisTicks(trend: { period: string }[], frequency: Metric["frequency"]): string[] | undefined {
  if (frequency === "annual" || trend.length <= 12) return undefined;
  const years = new Set<string>();
  const out: string[] = [];
  for (const p of trend) {
    const y = p.period.slice(0, 4);
    if (!years.has(y)) {
      years.add(y);
      out.push(p.period);
    }
  }
  const step = Math.max(1, Math.floor(out.length / 7));
  return out.filter((_, i) => i % step === 0);
}

function lookbackValue(trend: { period: string; value: number }[], yearsBack: number): number | null {
  if (trend.length === 0) return null;
  const latestYear = parseInt(trend[trend.length - 1].period.slice(0, 4), 10);
  const targetPrefix = String(latestYear - yearsBack);
  for (let i = trend.length - 1; i >= 0; i--) {
    if (trend[i].period.startsWith(targetPrefix)) return trend[i].value;
  }
  return null;
}

/** Split a series into positive/negative arrays so we can fill them separately. */
function splitPosNeg(trend: { period: string; value: number }[]) {
  return trend.map((p) => ({
    period: p.period,
    value: p.value,
    pos: p.value > 0 ? p.value : 0,
    neg: p.value < 0 ? p.value : 0,
  }));
}

// ── Time-period windowing ────────────────────────────────────────────────────
type ChartPeriod = "1Y" | "5Y" | "10Y" | "20Y" | "ALL";

const PERIOD_OPTIONS: { key: ChartPeriod; label: string; years: number | null }[] = [
  { key: "1Y", label: "1Y", years: 1 },
  { key: "5Y", label: "5Y", years: 5 },
  { key: "10Y", label: "10Y", years: 10 },
  { key: "20Y", label: "20Y", years: 20 },
  { key: "ALL", label: "All", years: null },
];

function periodToDate(period: string): Date {
  const [y, m, d] = period.split("-");
  return new Date(Number(y), m ? Number(m) - 1 : 0, d ? Number(d) : 1);
}

/** Keep only the trailing `years` of a chronologically-sorted series (null = all). */
function sliceByYears<T extends { period: string }>(rows: T[], years: number | null): T[] {
  if (years === null || rows.length === 0) return rows;
  const last = periodToDate(rows[rows.length - 1].period);
  const cutoff = new Date(last.getFullYear() - years, last.getMonth(), last.getDate());
  const sliced = rows.filter((r) => periodToDate(r.period) >= cutoff);
  return sliced.length >= 2 ? sliced : rows; // never collapse to a single point
}

interface MetricBlockProps {
  metric: Metric;
  recessionBands?: RecessionBand[];
  /** Drop the outer panel chrome (for rendering inside a dropdown card). */
  embedded?: boolean;
  /** Hide the built-in header (when an enclosing dropdown already shows it). */
  hideHeader?: boolean;
  /** Surface-scoped resolver to make the title open its definition (group pages). */
  resolveDef?: (label: string) => number | undefined;
}

export function MetricBlock({ metric, recessionBands = [], embedded = false, hideHeader = false, resolveDef }: MetricBlockProps) {
  const {
    trend: baseTrend,
    vertical,
    frequency,
    displayType,
    isRateOfChange,
    levelTrend: baseLevelTrend,
    levelUnit: baseLevelUnit,
    unit: baseUnit,
    altTrend,
    altLevelTrend,
    altUnit,
    baseVariantLabel,
    altVariantLabel,
  } = metric;

  // ── Variant toggle: base series ↔ alternate series (e.g. Nominal ↔ Real) ──
  // When a metric carries an `altTrend`, swap the entire working series set to
  // the chosen variant; everything downstream (Level/YoY toggle, snapshots,
  // historical chart, latest value) then operates on the active variant.
  const hasVariant = !!altTrend && altTrend.length >= 2;
  const [variant, setVariant] = useState<"base" | "alt">("base");
  const activeVariant = hasVariant ? variant : "base";
  const useAlt = activeVariant === "alt";

  const trend: TrendPoint[] = useAlt ? (altTrend as TrendPoint[]) : baseTrend;
  const levelTrend = useAlt ? (altLevelTrend ?? baseLevelTrend) : baseLevelTrend;
  const levelUnit = baseLevelUnit;
  const unit: Metric["unit"] = useAlt && altUnit != null ? altUnit : baseUnit;
  const latestValue = trend.length ? trend[trend.length - 1].value : metric.latestValue;

  // ── Units toggle: Level ("regular output") ↔ Percent Change from Year Ago ──
  // Works in BOTH directions on any line metric with both views available:
  //  • level-default metric → Level is the server `trend`; YoY is computed here
  //    (only when values stay positive — a YoY % of a zero-crossing series like a
  //    spread explodes into nonsense, exactly as on FRED).
  //  • YoY-default metric → YoY is the server `trend`; Level is the server
  //    `levelTrend` shipped alongside it. Bar metrics keep their single view.
  const computedYoY = useMemo(
    () => (displayType === "line" && !isRateOfChange ? toYoYSeries(trend) : []),
    [trend, displayType, isRateOfChange],
  );
  const serverLevel = levelTrend ?? [];
  const levelSeries = isRateOfChange ? serverLevel : trend;
  const levelSeriesUnit: Metric["unit"] = isRateOfChange ? (levelUnit ?? "") : unit;
  const yoySeries = isRateOfChange ? trend : computedYoY;

  const canToggle =
    displayType === "line" &&
    (isRateOfChange
      ? serverLevel.length >= 2
      : computedYoY.length >= 2 && trend.every((p) => p.value > 0));

  const defaultView: "level" | "yoy" = isRateOfChange ? "yoy" : "level";
  const [view, setView] = useState<"level" | "yoy">(defaultView);
  const effView = canToggle ? view : defaultView;
  const showYoY = effView === "yoy";

  const chartTrend = showYoY ? yoySeries : levelSeries;

  // ── Adjustable time window (1Y / 5Y / 10Y / 20Y / All) for the main chart ──
  const [period, setPeriod] = useState<ChartPeriod>("ALL");
  const years = PERIOD_OPTIONS.find((p) => p.key === period)?.years ?? null;
  const viewTrend = useMemo(() => sliceByYears(chartTrend, years), [chartTrend, years]);
  const chartUnit: Metric["unit"] = showYoY ? "%" : levelSeriesUnit;
  const chartIsRoc = showYoY;
  const chartSeriesName = showYoY ? `${metric.name} — YoY %` : metric.name;
  const chartLatestLabel = chartTrend.length
    ? formatValue(chartTrend[chartTrend.length - 1].value, chartUnit)
    : "—";
  const topLabel =
    displayType === "bar"
      ? frequency === "annual"
        ? "Annual Trend (end-of-year)"
        : "Trend"
      : showYoY
        ? "% Change from Year Ago"
        : "Level Over Time";

  const annualChanges = useMemo(() => {
    if (frequency !== "annual" || isRateOfChange) return [];
    return trend.map((point, idx) => {
      if (idx === 0) return { period: point.period, change: null as number | null };
      return { period: point.period, change: pctChange(point.value, trend[idx - 1].value) };
    });
  }, [trend, frequency, isRateOfChange]);

  const snapshots = useMemo(() => {
    if (frequency === "annual" || trend.length === 0) return [];
    const latest = trend[trend.length - 1].value;
    return [1, 3, 5, 10]
      .map((years) => {
        const prev = lookbackValue(trend, years);
        if (prev === null) return null;
        // For rate-of-change metrics, show absolute pp change (since the value is already a %)
        if (isRateOfChange) return { years, change: latest - prev, isPp: true };
        if (prev === 0) return null;
        return { years, change: ((latest - prev) / Math.abs(prev)) * 100, isPp: false };
      })
      .filter((s): s is { years: number; change: number; isPp: boolean } => s !== null);
  }, [trend, frequency, isRateOfChange]);

  const overallChange =
    trend.length > 1 ? pctChange(trend[trend.length - 1].value, trend[0].value) : 0;
  const latestPeriod = trend.length > 0 ? trend[trend.length - 1].period : "—";
  const latestPeriodLabel = formatPeriodLabel(latestPeriod, frequency);
  const startPeriodLabel = trend.length > 0 ? formatPeriodLabel(trend[0].period, frequency) : "—";

  // Recession bands shaded + labelled with their exact NBER dates — clipped to
  // the displayed series' date range. Shared with every other economic chart.
  const recessionWindow = useMemo<[string, string] | null>(() => {
    if (frequency === "annual" || recessionBands.length === 0 || viewTrend.length === 0) return null;
    return [viewTrend[0].period, viewTrend[viewTrend.length - 1].period];
  }, [recessionBands, viewTrend, frequency]);

  const recessionElements = useMemo(
    () =>
      recessionWindow
        ? buildRecessionAreas(recessionBands, recessionWindow[0], recessionWindow[1], {
            labels: true,
            bordered: true,
          })
        : null,
    [recessionBands, recessionWindow],
  );

  const visibleRecBands = useMemo(
    () => (recessionWindow ? visibleRecessions(recessionBands, recessionWindow[0], recessionWindow[1]) : []),
    [recessionBands, recessionWindow],
  );

  const showRecessionLegend = visibleRecBands.length > 0;

  // Latest-value annotation positioned at the right edge
  const latestValueLabel = formatValue(latestValue, unit);

  return (
    <article className={cn("animate-fade-up", !embedded && "panel p-6 md:p-8")}>
      {/* Header */}
      {!hideHeader && (
      <header className="flex flex-wrap items-end justify-between gap-4 mb-6 pb-5 border-b border-gold/10">
        <div className="flex items-baseline gap-4">
          <span className="font-display text-5xl md:text-6xl font-semibold text-gold/15 leading-none select-none">
            {String(metric.number).padStart(2, "0")}
          </span>
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <p className="eyebrow">Metric</p>
              <span className="text-[0.65rem] uppercase tracking-wider text-white/35 font-mono">
                {frequency}
              </span>
              {isRateOfChange && (
                <span className="text-[0.65rem] uppercase tracking-wider text-gold/70 font-mono">
                  rate of change
                </span>
              )}
              {showRecessionLegend && (
                <span className="text-[0.65rem] uppercase tracking-wider text-white/55 font-mono inline-flex items-center gap-1.5">
                  <span className="inline-block w-3 h-2 bg-white/10 border border-white/30" />
                  NBER recession
                </span>
              )}
            </div>
            <h3 className="font-display text-2xl md:text-3xl font-semibold text-white leading-tight">
              {resolveDef ? (
                <MetricTerm metric={metric.name} resolve={resolveDef}>
                  {metric.name}
                </MetricTerm>
              ) : (
                metric.name
              )}
            </h3>
          </div>
        </div>
        <div className="text-right">
          <p className="label mb-1">As of · {latestPeriodLabel}</p>
          <p className="stat-num">{latestValueLabel}</p>
          {trend.length > 1 && !isRateOfChange && (
            <p
              className={cn(
                "mt-1 text-xs font-mono tracking-wide",
                overallChange >= 0 ? "text-gain-strong" : "text-loss-strong",
              )}
            >
              {overallChange >= 0 ? "▲" : "▼"} {Math.abs(overallChange).toFixed(1)}% since {startPeriodLabel}
            </p>
          )}
        </div>
      </header>
      )}

      {/* Top chart */}
      <section className="mb-3">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <p className="label">{topLabel}</p>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Time-window selector */}
            <div
              role="group"
              aria-label="Time period"
              className="inline-flex rounded-sm border border-gold/15 overflow-hidden shrink-0"
            >
              {PERIOD_OPTIONS.map((opt) => {
                const active = period === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setPeriod(opt.key)}
                    aria-pressed={active}
                    title={opt.years ? `Last ${opt.years} years` : "Full history"}
                    className={cn(
                      "px-2.5 py-1 text-[0.65rem] font-mono uppercase tracking-wider transition-colors border-l border-gold/15 first:border-l-0",
                      active ? "bg-gold/15 text-gold" : "text-white/40 hover:text-white/70",
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {hasVariant && (
              <div
                role="group"
                aria-label="Series variant"
                className="inline-flex rounded-sm border border-gold/15 overflow-hidden shrink-0"
              >
                <button
                  type="button"
                  onClick={() => setVariant("base")}
                  aria-pressed={!useAlt}
                  className={cn(
                    "px-2.5 py-1 text-[0.65rem] font-mono uppercase tracking-wider transition-colors",
                    !useAlt ? "bg-gold/15 text-gold" : "text-white/40 hover:text-white/70",
                  )}
                >
                  {baseVariantLabel ?? "Nominal"}
                </button>
                <button
                  type="button"
                  onClick={() => setVariant("alt")}
                  aria-pressed={useAlt}
                  className={cn(
                    "px-2.5 py-1 text-[0.65rem] font-mono uppercase tracking-wider transition-colors border-l border-gold/15",
                    useAlt ? "bg-gold/15 text-gold" : "text-white/40 hover:text-white/70",
                  )}
                >
                  {altVariantLabel ?? "Real"}
                </button>
              </div>
            )}
            {canToggle && (
              <div
                role="group"
                aria-label="Chart units"
                className="inline-flex rounded-sm border border-gold/15 overflow-hidden shrink-0"
              >
                <button
                  type="button"
                  onClick={() => setView("level")}
                  aria-pressed={!showYoY}
                  className={cn(
                    "px-2.5 py-1 text-[0.65rem] font-mono uppercase tracking-wider transition-colors",
                    !showYoY ? "bg-gold/15 text-gold" : "text-white/40 hover:text-white/70",
                  )}
                >
                  Level
                </button>
                <button
                  type="button"
                  onClick={() => setView("yoy")}
                  aria-pressed={showYoY}
                  title="Percent change from a year ago"
                  className={cn(
                    "px-2.5 py-1 text-[0.65rem] font-mono uppercase tracking-wider transition-colors border-l border-gold/15",
                    showYoY ? "bg-gold/15 text-gold" : "text-white/40 hover:text-white/70",
                  )}
                >
                  YoY %
                </button>
              </div>
            )}
            <p className="text-[0.7rem] text-white/30 font-mono whitespace-nowrap">
              {viewTrend.length} pts ·{" "}
              {viewTrend.length ? formatPeriodLabel(viewTrend[0].period, frequency) : "—"} →{" "}
              {viewTrend.length ? formatPeriodLabel(viewTrend[viewTrend.length - 1].period, frequency) : "—"}
            </p>
          </div>
        </div>
        <div className="h-80 md:h-96 -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            {displayType === "bar" ? (
              <BarChart data={viewTrend} margin={{ top: 18, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="period"
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => formatTick(v, frequency)}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => formatAxisValue(v, unit)}
                  width={60}
                />
                <Tooltip
                  cursor={{ fill: "rgba(201,168,76,0.06)" }}
                  formatter={(v) => [formatValue(Number(v), unit), metric.name]}
                  labelFormatter={(p) => formatPeriodLabel(String(p ?? ""), frequency)}
                />
                {isRateOfChange && <ReferenceLine y={0} stroke="rgba(255,255,255,0.5)" strokeWidth={1} />}
                <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                  {viewTrend.map((p, i) => {
                    const isLast = i === viewTrend.length - 1;
                    const fill = isRateOfChange
                      ? p.value >= 0
                        ? isLast ? GAIN_STROKE : GAIN_FILL
                        : isLast ? LOSS_STROKE : LOSS_FILL
                      : isLast ? GOLD : "rgba(201,168,76,0.45)";
                    return <Cell key={i} fill={fill} />;
                  })}
                </Bar>
              </BarChart>
            ) : chartIsRoc ? (
              // Split-area chart for YoY % series — green when positive, red when negative.
              // Mirrors the matplotlib fill_between pattern from economicmetrics.py.
              <ComposedChart
                data={splitPosNeg(viewTrend)}
                margin={{ top: 18, right: 40, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="period"
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => formatTick(v, frequency)}
                  ticks={buildAxisTicks(viewTrend, frequency)}
                  interval={0}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => formatAxisValue(v, chartUnit)}
                  width={60}
                />
                <Tooltip
                  formatter={(_v, _n, p: any) => [formatValue(p.payload.value, chartUnit), chartSeriesName]}
                  labelFormatter={(label) => formatPeriodLabel(String(label ?? ""), frequency)}
                />
                {recessionElements}
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.5)" strokeWidth={1} />
                <Area
                  type="monotone"
                  dataKey="pos"
                  stroke={GAIN_STROKE}
                  strokeWidth={0}
                  fill={GAIN_FILL}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="neg"
                  stroke={LOSS_STROKE}
                  strokeWidth={0}
                  fill={LOSS_FILL}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#e5e7eb"
                  strokeWidth={1.4}
                  dot={false}
                  activeDot={{ r: 4, fill: GOLD_SOFT }}
                  isAnimationActive={false}
                >
                  <Label
                    value={chartLatestLabel}
                    position="right"
                    fill={GOLD}
                    fontSize={13}
                    fontFamily="JetBrains Mono"
                  />
                </Line>
              </ComposedChart>
            ) : (
              <ComposedChart data={viewTrend} margin={{ top: 18, right: 40, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id={`g-${metric.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={GOLD} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="period"
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => formatTick(v, frequency)}
                  ticks={buildAxisTicks(viewTrend, frequency)}
                  interval={0}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => formatAxisValue(v, chartUnit)}
                  width={60}
                />
                <Tooltip
                  formatter={(v) => [formatValue(Number(v), chartUnit), chartSeriesName]}
                  labelFormatter={(p) => formatPeriodLabel(String(p ?? ""), frequency)}
                />
                {recessionElements}
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={GOLD}
                  strokeWidth={2}
                  fill={`url(#g-${metric.id})`}
                  dot={false}
                  activeDot={{ r: 4, fill: GOLD_SOFT }}
                  isAnimationActive={false}
                >
                  <Label
                    value={chartLatestLabel}
                    position="right"
                    fill={GOLD}
                    fontSize={13}
                    fontFamily="JetBrains Mono"
                  />
                </Area>
              </ComposedChart>
            )}
          </ResponsiveContainer>
        </div>
        {showRecessionLegend && <RecessionLegend bands={visibleRecBands} />}
      </section>

      {/* Period-over-period strip (annual data only, not rate-of-change) */}
      {annualChanges.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <p className="label">Period-over-Period % Change</p>
            <p className="text-[0.7rem] text-white/30 font-mono">
              highlighted when |Δ| ≥ <span className="text-gold">20%</span>
            </p>
          </div>
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: `repeat(auto-fit, minmax(${annualChanges.length > 8 ? 80 : 110}px, 1fr))`,
            }}
          >
            {annualChanges.map(({ period, change }) => {
              if (change === null) {
                return (
                  <div key={period} className="rounded-sm px-3 py-2.5 border border-white/[0.05] text-center">
                    <p className="text-[0.65rem] uppercase tracking-wider text-white/30">{period}</p>
                    <p className="font-mono text-sm text-white/30 mt-1">—</p>
                  </div>
                );
              }
              const material = isMaterialChange(change, 20);
              const positive = change >= 0;
              return (
                <div
                  key={period}
                  className={cn(
                    "rounded-sm px-3 py-2.5 text-center border transition-colors",
                    !material && "border-gold/10 bg-white/[0.02]",
                    material && positive && "border-gain/40 bg-gain-ghost shadow-[0_0_24px_-12px_rgba(127,184,124,0.6)]",
                    material && !positive && "border-loss/40 bg-loss-ghost shadow-[0_0_24px_-12px_rgba(200,118,114,0.6)]",
                  )}
                >
                  <p className="text-[0.65rem] uppercase tracking-wider text-white/40">{period}</p>
                  <p
                    className={cn(
                      "font-mono text-sm mt-1 font-medium",
                      material && positive && "text-gain-strong",
                      material && !positive && "text-loss-strong",
                      !material && "text-white/65",
                    )}
                  >
                    {positive ? "+" : ""}{change.toFixed(1)}%
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Snapshot pills — sub-annual data (works for both level and rate-of-change) */}
      {snapshots.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <p className="label">Lookback Snapshots</p>
            <p className="text-[0.7rem] text-white/30 font-mono">
              {isRateOfChange ? "absolute pp Δ vs that point" : "% change vs same-period-of-year"}
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {snapshots.map(({ years, change, isPp }) => {
              const material = isPp ? Math.abs(change) >= 2 : isMaterialChange(change, 20);
              const positive = change >= 0;
              return (
                <div
                  key={years}
                  className={cn(
                    "rounded-sm px-3 py-3 text-center border",
                    !material && "border-gold/10 bg-white/[0.02]",
                    material && positive && "border-gain/40 bg-gain-ghost",
                    material && !positive && "border-loss/40 bg-loss-ghost",
                  )}
                >
                  <p className="text-[0.65rem] uppercase tracking-wider text-white/40">{years}y Δ</p>
                  <p
                    className={cn(
                      "font-mono text-base mt-1 font-medium",
                      material && positive && "text-gain-strong",
                      material && !positive && "text-loss-strong",
                      !material && "text-white/80",
                    )}
                  >
                    {positive ? "+" : ""}{change.toFixed(1)}{isPp ? "pp" : "%"}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Bottom: historical line + definition/vertical */}
      <section className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 panel-soft p-5">
          <p className="label mb-3">
            Historical {frequency !== "annual" && <span className="text-white/30">({frequency})</span>}
          </p>
          <div className="h-72 -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="period"
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => formatTick(v, frequency)}
                  ticks={buildAxisTicks(trend, frequency)}
                  interval={0}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => formatAxisValue(v, unit)}
                  width={56}
                />
                <Tooltip
                  formatter={(v) => [formatValue(Number(v), unit), metric.name]}
                  labelFormatter={(p) => formatPeriodLabel(String(p ?? ""), frequency)}
                />
                {recessionElements}
                {isRateOfChange && <ReferenceLine y={0} stroke="rgba(255,255,255,0.4)" />}
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={GOLD}
                  strokeWidth={2}
                  dot={frequency === "annual" ? { r: 3, fill: GOLD, strokeWidth: 0 } : false}
                  activeDot={{ r: 5, fill: GOLD_SOFT }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <dl className="mt-4 grid grid-cols-3 gap-3 text-center pt-4 border-t border-gold/10">
            <div>
              <dt className="label">Start</dt>
              <dd className="font-mono text-sm text-white/80 mt-1">
                {formatValue(trend[0]?.value ?? 0, unit)}
              </dd>
            </div>
            <div>
              <dt className="label">Latest</dt>
              <dd className="font-mono text-sm text-gold mt-1">{latestValueLabel}</dd>
            </div>
            <div>
              <dt className="label">{isRateOfChange ? "Δ pp" : "Δ %"}</dt>
              <dd
                className={cn(
                  "font-mono text-sm mt-1",
                  (isRateOfChange ? (trend.at(-1)!.value - trend[0]!.value) : overallChange) >= 0
                    ? "text-gain-strong"
                    : "text-loss-strong",
                )}
              >
                {isRateOfChange
                  ? `${trend.length > 1 ? (trend.at(-1)!.value - trend[0]!.value >= 0 ? "+" : "") + (trend.at(-1)!.value - trend[0]!.value).toFixed(1) + "pp" : "—"}`
                  : `${overallChange >= 0 ? "+" : ""}${overallChange.toFixed(1)}%`}
              </dd>
            </div>
          </dl>
        </div>

        <div className="lg:col-span-3 space-y-5">
          <div>
            <p className="label mb-2">Definition</p>
            <p className="text-base leading-relaxed text-white/80">{metric.definition}</p>
          </div>
          <div>
            <p className="label mb-2">Analysis</p>
            <p className="text-base leading-relaxed text-white/80">{metric.analysis}</p>
          </div>
          {vertical.length > 0 && (
            <div>
              <p className="label mb-2">Vertical Analysis</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {vertical.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-3 panel-soft px-4 py-3"
                  >
                    <span className="text-sm text-white/65 leading-snug">{row.label}</span>
                    <span className="font-mono text-sm text-gold whitespace-nowrap">
                      {row.unit === "%"
                        ? `${row.value > 0 ? "+" : ""}${row.value.toFixed(1)}%`
                        : row.unit === "$"
                        ? formatCurrency(row.value)
                        : row.unit === "x"
                        ? `${row.value.toFixed(2)}x`
                        : row.value.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </article>
  );
}
