import type { StageVariant } from "../../lib/types";
import { setSelectedStages, useSelectedStages } from "../../lib/stageStore";
import { DefinitionLink } from "./DefinitionsBlock";
import { cn } from "../../lib/cn";

interface StageToggleProps {
  ticker: string;
  variants: Record<string, StageVariant>;
  recommended: number;
  className?: string;
  /** Render the accuracy note for the selected variant under the pills. */
  showNote?: boolean;
}

const STAGE_LABELS: Record<string, string> = {
  "1": "1-stage",
  "2": "2-stage",
  "3": "3-stage",
};

/**
 * The 1/2/3-stage switch for the intrinsic-valuation models. Every structure
 * is computed by the backend; the recommended one is badged and drives the
 * scores, and the reader can flip between them to see how the number of
 * stages changes the value (definition 883 explains why it does).
 */
export function StageToggle({
  ticker,
  variants,
  recommended,
  className,
  showNote = true,
}: StageToggleProps) {
  const selected = useSelectedStages(ticker, recommended);
  const active = selected != null && variants[String(selected)]?.applicable
    ? selected
    : recommended;
  const activeVariant = variants[String(active)];

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        {(["1", "2", "3"] as const).map((k) => {
          const v = variants[k];
          const isActive = String(active) === k;
          const isRecommended = String(recommended) === k;
          const usable = Boolean(v?.applicable);
          return (
            <button
              key={k}
              type="button"
              disabled={!usable}
              title={!usable ? v?.reason : undefined}
              onClick={() => setSelectedStages(ticker, Number(k))}
              className={cn(
                "px-2.5 py-1 rounded-sm border text-[0.7rem] font-mono transition-colors",
                isActive
                  ? "border-gold/60 bg-gold/15 text-gold"
                  : usable
                    ? "border-white/15 text-white/60 hover:border-gold/40 hover:text-gold/80"
                    : "border-white/10 text-white/25 cursor-not-allowed",
              )}
            >
              {STAGE_LABELS[k]}
              {isRecommended && (
                <span className={cn(
                  "ml-1.5 text-[0.6rem] uppercase tracking-wide",
                  isActive ? "text-gold/80" : "text-white/35",
                )}>
                  Recommended
                </span>
              )}
            </button>
          );
        })}
        <DefinitionLink number={883} className="ml-1">Why stages matter</DefinitionLink>
      </div>
      {showNote && activeVariant?.accuracyNote && (
        <p className="text-xs text-white/50 leading-snug">
          {activeVariant.accuracyNote}
          {active !== recommended && (
            <span className="text-white/35">
              {" "}Scores and the verdict stay on the recommended structure; this
              view is a lens.
            </span>
          )}
        </p>
      )}
    </div>
  );
}

/** The variant the toggle currently points at (falling back to recommended). */
export function useActiveVariant(
  ticker: string,
  variants: Record<string, StageVariant> | null | undefined,
  recommended: number | null | undefined,
): StageVariant | null {
  const selected = useSelectedStages(ticker, recommended ?? null);
  if (!variants) return null;
  const pick = (n: number | null) =>
    n != null && variants[String(n)]?.applicable ? variants[String(n)] : null;
  return pick(selected) ?? pick(recommended ?? null);
}
