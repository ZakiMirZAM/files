import { useState } from "react";
import { BookOpen, ChevronDown, Database } from "lucide-react";
import type { Metric, RecessionBand, SectionKey } from "../lib/types";
import { ECON_PANEL_OFFSET, type EconomicMetricDef } from "../lib/economicDefinitions";
import { openDefinition } from "../lib/definitionPanelStore";
import { MetricBlock } from "./MetricBlock";
import { MetricQuestions } from "./MetricQuestions";
import { ChartSkeleton } from "./Skeletons";
import { formatCurrency, formatNumber, formatPercent } from "../lib/format";
import { cn } from "../lib/cn";

interface MetricDropdownProps {
  def: EconomicMetricDef;
  metric?: Metric;
  recessionBands?: RecessionBand[];
  defaultOpen?: boolean;
  /** The page's live data is still being fetched — show a chart placeholder
   *  instead of the "source pending" note for metrics that may yet have a chart. */
  loading?: boolean;
  /** The page's computed figures, forwarded to each question's AI-answer helper. */
  dataContext?: string;
  /** Which surface owns this metric. Drives both the definition-panel namespace
   *  (via `panelOffset`) and the question-answer scope. Defaults to economic. */
  section?: SectionKey;
  /** Definition-panel number offset for this surface (economic 600, credit 700).
   *  The Define button opens `panelOffset + def.number`. Defaults to economic. */
  panelOffset?: number;
}

function formatValue(v: number, unit: Metric["unit"]): string {
  if (unit === "$") return formatCurrency(v);
  if (unit === "%") return formatPercent(v);
  if (unit === "x") return `${v.toFixed(2)}x`;
  return formatNumber(v);
}

export function MetricDropdown({
  def,
  metric,
  recessionBands = [],
  defaultOpen = false,
  loading = false,
  dataContext,
  section = "economic",
  panelOffset = ECON_PANEL_OFFSET,
}: MetricDropdownProps) {
  const [open, setOpen] = useState(defaultOpen);
  const hasChart = !!metric && metric.trend.length > 0;
  const isLoading = loading && !hasChart;
  const bodyId = `metric-body-${def.number}`;

  return (
    <article className="panel overflow-hidden transition-colors hover:border-gold/20">
      <div className="w-full flex items-center gap-3 sm:gap-4 px-5 md:px-6 py-4">
        {/* Toggle the chart. The definition itself now lives in the sidebar. */}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
          className="flex-1 min-w-0 flex items-center gap-4 text-left group"
        >
          <span className="font-display text-2xl md:text-3xl font-semibold text-gold/20 leading-none select-none tabular-nums">
            {String(def.number).padStart(2, "0")}
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-lg md:text-xl font-semibold text-white leading-tight truncate group-hover:text-gold/90 transition-colors">
              {def.title}
            </h3>
            <p className="text-[0.7rem] uppercase tracking-wider font-mono mt-0.5">
              {hasChart ? (
                <span className="text-white/40">
                  {metric!.frequency} · as of {metric!.trend[metric!.trend.length - 1].period.slice(0, 7)}
                </span>
              ) : isLoading ? (
                <span className="text-gold/60 inline-flex items-center gap-1.5">
                  <span className="inline-flex w-2.5 h-2.5 border border-gold/40 border-t-gold rounded-full animate-spin" />
                  loading market data…
                </span>
              ) : (
                <span className="text-white/30 inline-flex items-center gap-1.5">
                  <Database className="w-3 h-3" /> chart data source pending
                </span>
              )}
            </p>
          </div>
          {hasChart && (
            <span className="hidden sm:block text-right shrink-0">
              <span className="block font-mono text-base text-gold">
                {formatValue(metric!.latestValue, metric!.unit)}
              </span>
            </span>
          )}
          <ChevronDown
            className={cn(
              "w-5 h-5 text-white/40 shrink-0 transition-transform duration-200 group-hover:text-gold",
              open && "rotate-180",
            )}
          />
        </button>

        {/* Open the full definition in the shared sidebar. */}
        <button
          type="button"
          onClick={() => openDefinition(panelOffset + def.number)}
          aria-label={`Read the ${def.title} definition`}
          title="Definition"
          className="btn-ghost shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[0.7rem] font-mono uppercase tracking-wider text-white/45 hover:text-gold"
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Define</span>
        </button>
      </div>

      {open && (
        <div id={bodyId} className="px-5 md:px-6 pb-6 pt-1 border-t border-gold/10">
          {hasChart ? (
            <MetricBlock metric={metric!} recessionBands={recessionBands} embedded hideHeader />
          ) : isLoading ? (
            <div className="my-5">
              <ChartSkeleton heightClass="h-44" label={`Loading ${def.title} chart…`} />
            </div>
          ) : (
            <div className="my-5 panel-soft p-5 flex items-start gap-3">
              <Database className="w-4 h-4 text-white/30 mt-0.5 shrink-0" />
              <p className="text-sm text-white/50 leading-6">
                Chart data source pending. This metric is not available as a free FRED series.
                Open the definition for the full explanation.
              </p>
            </div>
          )}

          <MetricQuestions metricNumber={def.number} questions={def.questions} dataContext={dataContext} metric={metric} section={section} />
        </div>
      )}
    </article>
  );
}
