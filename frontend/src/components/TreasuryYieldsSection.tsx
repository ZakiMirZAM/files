import { useState } from "react";
import { BookOpen, ChevronDown } from "lucide-react";
import type { Metric, RecessionBand } from "../lib/types";
import { MetricBlock } from "./MetricBlock";
import { MetricQuestions } from "./MetricQuestions";
import { formatPercent } from "../lib/format";
import { cn } from "../lib/cn";
import { openDefinition } from "../lib/definitionPanelStore";
import { ECON_PANEL_OFFSET, ECONOMIC_METRIC_DEFS } from "../lib/economicDefinitions";

interface TreasuryYieldsSectionProps {
  treasuryYields?: Metric[] | null;
  recessionBands?: RecessionBand[];
  /** Slot number shown in the badge; also the definition this section opens (#13). */
  number?: number;
  defaultOpen?: boolean;
  /** The page's computed figures, forwarded to each question's AI-answer helper. */
  dataContext?: string;
}

// Short labels for the maturity selector, keyed by the backend metric name.
const MATURITY_LABEL: Record<string, string> = {
  "3-Month Treasury Yield": "3M",
  "1-Year Treasury Yield": "1Y",
  "2-Year Treasury Yield": "2Y",
  "10-Year Treasury Yield": "10Y",
};

/**
 * Treasury yields as a single collapsible dropdown, styled exactly like the other
 * economic metric dropdowns for uniformity. Expanding it reveals a maturity
 * selector (3M | 1Y | 2Y | 10Y); the chosen maturity renders through the shared
 * MetricBlock, inheriting the Level/YoY toggle, time-window selector, and
 * recession shading.
 */
export function TreasuryYieldsSection({
  treasuryYields,
  recessionBands = [],
  number = 13,
  defaultOpen = false,
  dataContext,
}: TreasuryYieldsSectionProps) {
  const list = (treasuryYields ?? []).filter((m) => m.trend && m.trend.length > 0);
  const tenYearIdx = list.findIndex((m) => m.name === "10-Year Treasury Yield");
  const [idx, setIdx] = useState(tenYearIdx >= 0 ? tenYearIdx : Math.max(0, list.length - 1));
  const [open, setOpen] = useState(defaultOpen);

  const questions = ECONOMIC_METRIC_DEFS.find((d) => d.number === number)?.questions ?? [];

  if (list.length === 0) return null;
  const active = Math.min(idx, list.length - 1);
  const selected = list[active];
  const bodyId = "metric-body-treasury-yields";

  return (
    <article className="panel overflow-hidden transition-colors hover:border-gold/20">
      <div className="w-full flex items-center gap-3 sm:gap-4 px-5 md:px-6 py-4">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
          className="flex-1 min-w-0 flex items-center gap-4 text-left group"
        >
          <span className="font-display text-2xl md:text-3xl font-semibold text-gold/20 leading-none select-none tabular-nums">
            {String(number).padStart(2, "0")}
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-lg md:text-xl font-semibold text-white leading-tight truncate group-hover:text-gold/90 transition-colors">
              Treasury Yields
            </h3>
            <p className="text-[0.7rem] uppercase tracking-wider font-mono mt-0.5 text-white/40">
              {selected.frequency} · {list.length} maturities · as of{" "}
              {selected.trend[selected.trend.length - 1].period.slice(0, 7)}
            </p>
          </div>
          <span className="hidden sm:block text-right shrink-0">
            <span className="block font-mono text-base text-gold">
              {MATURITY_LABEL[selected.name] ?? ""} {formatPercent(selected.latestValue)}
            </span>
          </span>
          <ChevronDown
            className={cn(
              "w-5 h-5 text-white/40 shrink-0 transition-transform duration-200 group-hover:text-gold",
              open && "rotate-180",
            )}
          />
        </button>

        <button
          type="button"
          onClick={() => openDefinition(ECON_PANEL_OFFSET + number)}
          aria-label="Read the Treasury Yields definition"
          title="Definition"
          className="btn-ghost shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[0.7rem] font-mono uppercase tracking-wider text-white/45 hover:text-gold"
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Define</span>
        </button>
      </div>

      {open && (
        <div id={bodyId} className="px-5 md:px-6 pb-6 pt-1 border-t border-gold/10">
          <div
            role="group"
            aria-label="Treasury maturity"
            className="inline-flex rounded-sm border border-gold/15 overflow-hidden shrink-0 mb-4"
          >
            {list.map((m, i) => {
              const isActive = i === active;
              return (
                <button
                  key={m.name}
                  type="button"
                  onClick={() => setIdx(i)}
                  aria-pressed={isActive}
                  title={m.name}
                  className={cn(
                    "px-3 py-1.5 text-[0.7rem] font-mono uppercase tracking-wider transition-colors border-l border-gold/15 first:border-l-0",
                    isActive ? "bg-gold/15 text-gold" : "text-white/40 hover:text-white/70",
                  )}
                >
                  {MATURITY_LABEL[m.name] ?? m.name}
                </button>
              );
            })}
          </div>
          <MetricBlock metric={selected} recessionBands={recessionBands} embedded hideHeader />

          <MetricQuestions metricNumber={number} questions={questions} dataContext={dataContext} metric={selected} />
        </div>
      )}
    </article>
  );
}
