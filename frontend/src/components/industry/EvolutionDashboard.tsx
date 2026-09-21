// Six small charts built from the industry's decade-plus evolution series,
// rendered beside the LifecyclePanel. Each card pairs one chart with the plain
// sentence buildEvolutionSentences computes from the same series, so the
// number in the chart and the number in the prose always agree, and the copy
// lives in the copy module rather than here.

import { useMemo } from "react";
import type { ReactNode } from "react";
import type { EvolutionSeries, EnvironmentIndicators, YearValue } from "../../lib/industryStructureApi";
import { pctFromFraction, num, times, pointsValue } from "../../lib/industryStructureFormat";
import { buildEvolutionSentences, EVOLUTION_COPY } from "../../lib/industryDecksB";
import { MiniChart } from "./evolution/MiniChart";

interface EvolutionDashboardProps {
  evolution: EvolutionSeries;
  /** environmentIndicators, the only source of the two growth rates. */
  indicators?: EnvironmentIndicators | null;
}

function sortedAsc(series: YearValue[] | undefined): YearValue[] {
  if (!series) return [];
  return series
    .filter((d): d is { year: number; value: number } => d != null && Number.isFinite(d.value) && Number.isFinite(d.year))
    .slice()
    .sort((a, b) => a.year - b.year);
}

interface ChartCardProps {
  title: ReactNode;
  chart: ReactNode;
  sentence: ReactNode;
  unavailable?: boolean;
}

function ChartCard({ title, chart, sentence, unavailable }: ChartCardProps) {
  return (
    <div className="panel-soft p-4 flex flex-col gap-3">
      <p className="eyebrow">{title}</p>
      {chart}
      <p className={unavailable ? "text-sm text-white/40 italic" : "text-sm text-white/75"}>
        {sentence}
      </p>
    </div>
  );
}

/**
 * Six small charts drawn from the industry's evolution time series, each
 * paired with a plain-language sentence computed from the same numbers and
 * naming the years it covers. Rendered next to (not instead of) the life
 * cycle read.
 */
export function EvolutionDashboard({ evolution, indicators }: EvolutionDashboardProps) {
  const revenue = sortedAsc(evolution?.revenue);
  const firmCount = sortedAsc(evolution?.firmCount);
  const hhi = sortedAsc(evolution?.hhi);
  const grossMarginSpread = sortedAsc(evolution?.grossMarginSpread);
  const rdIntensitySpread = sortedAsc(evolution?.rdIntensitySpread);
  const revenueOverPpe = sortedAsc(evolution?.revenueOverPpe);

  const sentences = useMemo(
    () => buildEvolutionSentences(evolution, indicators),
    [evolution, indicators],
  );
  const charts: Record<string, ReactNode> = {
    revenue: <MiniChart data={revenue} kind="area" formatValue={(v) => `${num(v / 1e9, 0)}B`} />,
    companies: <MiniChart data={firmCount} kind="line" formatValue={(v) => num(v, 0)} />,
    hhi: <MiniChart data={hhi} kind="line" formatValue={(v) => pointsValue(v)} />,
    marginSpread: (
      <MiniChart data={grossMarginSpread} kind="line" formatValue={(v) => `${pctFromFraction(v)}pt`} />
    ),
    rdSpread: (
      <MiniChart data={rdIntensitySpread} kind="line" formatValue={(v) => `${pctFromFraction(v)}pt`} />
    ),
    capacity: <MiniChart data={revenueOverPpe} kind="line" formatValue={(v) => `${times(v)}x`} />,
  };

  return (
    <div className="panel-soft p-5" data-tour="industry-evolution">
      <p className="eyebrow mb-3">{EVOLUTION_COPY.title}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {sentences.map((s) => (
          <ChartCard
            key={s.key}
            title={s.title}
            chart={charts[s.key]}
            sentence={s.text}
            unavailable={!s.available}
          />
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-gold/10">
        <p className="text-[0.72rem] leading-6 text-white/40">{EVOLUTION_COPY.lifeCycleNote}</p>
      </div>
    </div>
  );
}
