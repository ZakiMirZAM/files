import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Metric, RecessionBand } from "../../lib/types";
import { formatUnitValue } from "../../lib/format";
import { cn } from "../../lib/cn";
import { MetricBlock } from "../MetricBlock";
import { MetricTrendQuestion } from "../MetricTrendQuestion";
import { Sparkline } from "./Sparkline";
import { DefinitionsBlock, MetricTerm } from "./DefinitionsBlock";

// The statement-trend tiles' definitions live in other sections' files (each
// trend is covered by its ratio or line-item entry); this explicit list gives
// the section its own dropdown group over the same definitions.
const STATEMENT_TREND_DEF_NUMBERS = [82, 84, 94, 100, 93, 24, 25, 127, 140, 148, 2, 3, 6, 39, 12, 8];

interface HistoricalFinancialsSectionProps {
  metrics: Metric[];
  recessionBands?: RecessionBand[];
}

/** Change since the first point, % for $/x metrics, percentage-points for % metrics. */
function deltaSinceStart(m: Metric): { text: string; positive: boolean } | null {
  if (m.trend.length < 2) return null;
  const first = m.trend[0].value;
  const last = m.trend[m.trend.length - 1].value;
  if (m.unit === "%") {
    const pp = last - first;
    return { text: `${pp >= 0 ? "+" : ""}${pp.toFixed(3)}pp`, positive: pp >= 0 };
  }
  if (first === 0) return null;
  const pct = ((last - first) / Math.abs(first)) * 100;
  return { text: `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`, positive: pct >= 0 };
}

/**
 * Compact historical view of the company's financials. Renders the same metrics
 * the page used to show as full-size charts, but as a dense sparkline bento grid,
 * each appearing exactly once. Clicking a tile reveals its full chart + commentary,
 * so nothing is lost and the page stops being an endless scroll.
 */
export function HistoricalFinancialsSection({ metrics, recessionBands = [] }: HistoricalFinancialsSectionProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (metrics.length === 0) return null;
  const openMetric = metrics.find((m) => m.id === openId) ?? null;

  return (
    <section className="animate-fade-up">
      <header className="mb-5">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">
          Statement Trends
        </h2>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {metrics.map((m) => {
          const delta = deltaSinceStart(m);
          const isOpen = m.id === openId;
          return (
            <button
              key={m.id}
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpenId(isOpen ? null : m.id)}
              className={cn(
                "panel-soft p-3.5 text-left transition-colors hover:border-gold/30 group",
                isOpen && "border-gold/40 bg-gold/[0.04]",
              )}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <MetricTerm
                  metric={m.name}
                  scope="statementTrends"
                  asSpan
                  className="text-[0.8rem] text-white/75 leading-tight font-medium line-clamp-2"
                />
                <ChevronDown
                  className={cn(
                    "w-3.5 h-3.5 text-white/30 shrink-0 transition-transform group-hover:text-gold",
                    isOpen && "rotate-180 text-gold",
                  )}
                />
              </div>
              <Sparkline values={m.trend.map((t) => t.value)} variant="bar" />
              <div className="flex items-baseline justify-between gap-2 mt-2">
                <span className="font-mono text-sm text-gold tabular-nums">{formatUnitValue(m.latestValue, m.unit)}</span>
                {delta && (
                  <span className={cn("font-mono text-[0.7rem]", delta.positive ? "text-gain-strong" : "text-loss-strong")}>
                    {delta.text}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {openMetric && (
        <div className="mt-4 panel p-1 animate-fade-up">
          <MetricBlock metric={openMetric} recessionBands={recessionBands} embedded />
          <div className="px-4 pb-4">
            <MetricTrendQuestion
              metric={openMetric}
              section="individual"
              scopeKey={`stmt-${openMetric.id}`}
            />
          </div>
        </div>
      )}

      <DefinitionsBlock
        numbers={STATEMENT_TREND_DEF_NUMBERS}
        scope="statementTrends"
        title="Statement trend definitions"
        className="mt-5"
      />
    </section>
  );
}
