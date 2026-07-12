import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { BookOpen, Maximize2, Minimize2, X } from "lucide-react";
import { anyDefByNumber } from "../../lib/allDefinitions";
import type { DefinitionSeries } from "../../lib/individualSeries";
import type { Metric, RecessionBand } from "../../lib/types";
import { formatPercent } from "../../lib/format";
import {
  closeDefinition,
  getOpenDefinition,
  subscribeDefinition,
} from "../../lib/definitionPanelStore";
import { Markdown } from "../Markdown";
import { MetricBlock } from "../MetricBlock";
import { MetricTrendQuestion } from "../MetricTrendQuestion";
import { getPageAiContext } from "../../lib/aiContextStore";
import { cn } from "../../lib/cn";
import { DefinitionChart } from "./DefinitionChart";
import { HelpBadge } from "../onboarding/HelpBadge";

interface DefinitionPanelProps {
  /** definition number -> its live series, drawn as the lean bar chart. */
  seriesIndex?: Map<number, DefinitionSeries>;
  /**
   * definition number -> a full economic Metric, drawn with the same MetricBlock
   * line chart the Economic page uses (line, recession bands, Level/YoY toggle).
   * Takes precedence over seriesIndex for the same number.
   */
  metricBlocks?: Map<number, Metric>;
  recessionBands?: RecessionBand[];
}

/**
 * The single definition sidebar. Subscribes to the module store, so clicking any
 * metric label opens the matching definition here. On desktop the panel is an
 * in-flow sticky column that animates its width; on mobile it slides in as a
 * full-height overlay. Below the definition text it shows the metric's history:
 * an override series (one company's trend, opened from the comparative matrix),
 * else a full economic MetricBlock, else the lean per-metric DefinitionChart.
 */
export function DefinitionPanel({ seriesIndex, metricBlocks, recessionBands = [] }: DefinitionPanelProps) {
  const openState = useSyncExternalStore(subscribeDefinition, getOpenDefinition);
  const open = openState != null;
  const openNumber = openState?.number ?? null;
  const overrideSeries = openState?.series;
  const overrideTitle = openState?.title;
  const overrideDescription = openState?.description;

  const def = openNumber != null && openNumber > 0 ? anyDefByNumber(openNumber) : undefined;
  const block = !overrideSeries && openNumber != null ? metricBlocks?.get(openNumber) : undefined;
  const series =
    overrideSeries ?? (openNumber != null && !block ? seriesIndex?.get(openNumber) : undefined);

  const title = overrideTitle ?? def?.title ?? "Definition";
  const hasContent = open && (def != null || overrideDescription != null || overrideSeries != null);

  const [markdown, setMarkdown] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // Widen the panel for long, table-heavy definitions (e.g. the economic
  // metrics). Off by default so every other page keeps the 440px column.
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLElement>(null);

  // When the panel opens, force a synchronous layout read. The desktop panel is a
  // position:sticky flex child whose width animates 0 → 440; several browsers don't
  // repaint a sticky element on a width change until the next reflow, so the panel
  // stayed invisible until something else (e.g. switching tabs) triggered one.
  // Reading getBoundingClientRect in a layout effect forces that reflow on open.
  useLayoutEffect(() => {
    if (open && asideRef.current) void asideRef.current.getBoundingClientRect();
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDefinition();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Load the markdown chunk for a numbered definition (skipped when a plain-text
  // description override is supplied, e.g. a comparative-matrix cell).
  useEffect(() => {
    if (!def || overrideDescription != null) {
      setMarkdown(null);
      setFailed(false);
      return;
    }
    let active = true;
    setMarkdown(null);
    setFailed(false);
    def.load().then(
      (md) => {
        if (active) setMarkdown(md);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [def, overrideDescription]);

  // Reset scroll to the top each time the open target changes.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [openNumber, overrideTitle]);

  return (
    <>
      {open && (
        <button
          aria-label="Close definition"
          onClick={closeDefinition}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        />
      )}
      <aside
        ref={asideRef}
        aria-label="Metric definition"
        aria-hidden={!open}
        className={cn(
          "bg-ink-900/95 backdrop-blur-md",
          // mobile / tablet: fixed overlay sliding from the right
          "fixed inset-y-0 right-0 z-50 w-full",
          expanded ? "sm:w-[640px]" : "sm:w-[440px]",
          "transform transition-[width,transform] duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full",
          // desktop: in-flow sticky column, width animates 0 <-> 440 (or 720 when
          // expanded). Sticks BELOW the 64px (h-16) AppShell navbar so the header +
          // close button stay visible when the whole page scrolls (top-20 clears it).
          "lg:sticky lg:top-20 lg:h-[calc(100vh-6rem)] lg:self-start lg:z-auto",
          "lg:transform-none lg:overflow-hidden",
          open ? (expanded ? "lg:w-[720px]" : "lg:w-[440px]") : "lg:w-0",
        )}
      >
        <div
          className={cn(
            "h-full w-full flex flex-col border-l border-gold/15",
            expanded ? "sm:w-[640px] lg:w-[720px]" : "sm:w-[440px] lg:w-[440px]",
          )}
        >
          {hasContent ? (
            <>
              <header className="flex items-center gap-3 px-4 py-3 border-b border-gold/15 shrink-0">
                {def && (
                  <span className="font-display text-lg font-semibold text-gold/25 leading-none select-none tabular-nums">
                    {String(def.number).padStart(3, "0")}
                  </span>
                )}
                <BookOpen className="w-4 h-4 text-gold/60 shrink-0" />
                <h3 className="flex-1 min-w-0 font-display text-base font-semibold text-white leading-tight truncate">
                  {title}
                </h3>
                <HelpBadge topic="definitions" />
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  aria-label={expanded ? "Collapse panel" : "Expand panel"}
                  aria-pressed={expanded}
                  title={expanded ? "Narrow the panel" : "Widen the panel for long definitions"}
                  className="btn-ghost p-1.5 shrink-0 hidden sm:inline-flex"
                >
                  {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={closeDefinition}
                  aria-label="Close"
                  className="btn-ghost p-1.5 shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </header>

              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
                {block && (
                  <div className="mb-5 pb-5 border-b border-gold/10">
                    <MetricBlock metric={block} recessionBands={recessionBands} embedded hideHeader />
                    {/* Economic metrics already carry this question in their dropdown; add it
                        here for the individual/sector/industry surfaces that open the sidebar. */}
                    {getPageAiContext().section !== "economic" && (
                      <MetricTrendQuestion metric={block} />
                    )}
                  </div>
                )}
                {series && (
                  <div className="mb-5 pb-5 border-b border-gold/10 space-y-5">
                    <DefinitionChart
                      series={series}
                      title={series.percentOfBase ? "History" : undefined}
                    />
                    {series.percentOfBase && (
                      <DefinitionChart
                        title={`% of ${series.percentOfBase.baseLabel}`}
                        series={{
                          label: `% of ${series.percentOfBase.baseLabel}`,
                          points: series.percentOfBase.points,
                          format: (v) => formatPercent(v * 100),
                          isRateOfChange: true,
                        }}
                      />
                    )}
                  </div>
                )}
                {overrideDescription != null ? (
                  <p className="text-sm leading-relaxed text-white/80">{overrideDescription}</p>
                ) : failed ? (
                  <p className="text-sm text-loss py-3">
                    Could not load this definition. Check your connection and reopen to retry.
                  </p>
                ) : def && markdown === null ? (
                  <p className="text-sm text-white/40 font-mono py-3">loading definition…</p>
                ) : markdown !== null ? (
                  <Markdown content={markdown} />
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </aside>
    </>
  );
}
