import type { MetricMeta } from "../../lib/types";
import { formatMetricValue, metricDelta, seriesFromHistory } from "../../lib/metricFormat";
import { cn } from "../../lib/cn";
import { Sparkline } from "./Sparkline";
import { DefinitionsBlock, MetricTerm } from "./DefinitionsBlock";

interface MetricsTrendsSectionProps {
  metricHistory?: Record<string, Record<string, number>>;
  metricMeta?: MetricMeta[];
}

/**
 * Capital-efficiency, DuPont, EVA, leverage and valuation-multiple metrics — each
 * as a compact historical sparkline tile, grouped by the backend registry. Every
 * value traces to a financials.db formula (no fabricated data; missing → "—").
 */
export function MetricsTrendsSection({ metricHistory, metricMeta }: MetricsTrendsSectionProps) {
  if (!metricHistory || !metricMeta || metricMeta.length === 0) return null;

  // Preserve the registry order while grouping.
  const groups: { group: string; metas: MetricMeta[] }[] = [];
  for (const meta of metricMeta) {
    let g = groups.find((x) => x.group === meta.group);
    if (!g) {
      g = { group: meta.group, metas: [] };
      groups.push(g);
    }
    g.metas.push(meta);
  }

  return (
    <section className="animate-fade-up">
      <header className="mb-5">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">Fundamental Trends</h2>
      </header>

      <div className="space-y-6">
        {groups.map(({ group, metas }) => (
          <div key={group}>
            <h3 className="font-display text-base font-semibold text-gold/80 mb-3 flex items-center gap-2.5">
              <span className="block w-4 h-px bg-gold/50" />
              {group}
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {metas.map((meta) => {
                const values = seriesFromHistory(metricHistory[meta.key]);
                const latest = values.length ? values[values.length - 1] : null;
                const delta = metricDelta(values, meta.unit);
                return (
                  <div key={meta.key} className="panel-soft p-3.5">
                    <MetricTerm
                      metric={meta.label}
                      scope="trends"
                      className="block text-[0.8rem] text-white/75 leading-tight font-medium mb-2 line-clamp-2"
                    />
                    <Sparkline values={values} variant="bar" />
                    <div className="flex items-baseline justify-between gap-2 mt-2">
                      <span className="font-mono text-sm text-gold tabular-nums">
                        {formatMetricValue(latest, meta.unit)}
                      </span>
                      {delta && (
                        <span className={cn("font-mono text-[0.7rem]", delta.positive ? "text-gain-strong" : "text-loss-strong")}>
                          {delta.text}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <DefinitionsBlock section="trends" title="Fundamental metric definitions" className="mt-5" />
    </section>
  );
}
