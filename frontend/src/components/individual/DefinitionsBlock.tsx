import { type ReactNode } from "react";
import { BookOpen } from "lucide-react";
import { resolveDefNumber } from "../../lib/individualDefinitions";
import { openDefinition } from "../../lib/definitionPanelStore";
import { cn } from "../../lib/cn";

// Definitions now open in the single sidebar panel (DefinitionPanel), mounted
// once in IndividualPage. A metric label resolves to its definition number and
// opens the panel. The old per-section browse dropdowns were removed, so
// DefinitionsBlock renders nothing; it is kept as an inert export only so the
// section components that still reference it keep compiling.

/** Open a definition's sidebar panel by catalog number, from anywhere on the page. */
export function requestDefinition(number: number): void {
  openDefinition(number);
}

/** Inert: the per-section browse list was replaced by the sidebar panel. */
export function DefinitionsBlock(_props: {
  section?: string;
  numbers?: number[];
  title?: string;
  scope?: string;
  className?: string;
}): ReactNode {
  return null;
}

/**
 * A single clickable launcher that opens one definition in the sidebar panel.
 * Used to make a model-explainer section's own definition reachable by clicking
 * its title or a labelled cue, now that the browse lists are gone.
 */
export function DefinitionLink({
  number,
  className,
  children,
  prominent = false,
}: {
  number: number;
  className?: string;
  children?: ReactNode;
  /** Render as a large rounded learn-this call-to-action (used at the top of each section). */
  prominent?: boolean;
}) {
  if (prominent) {
    return (
      <button
        type="button"
        onClick={() => openDefinition(number)}
        className={cn(
          "inline-flex items-center gap-2.5 rounded-xl border border-gold/30 bg-gold/[0.06] px-4 py-2.5",
          "text-base md:text-lg font-medium text-gold hover:bg-gold/[0.12] hover:border-gold/50 transition-colors",
          className,
        )}
      >
        <BookOpen className="w-5 h-5 shrink-0" />
        {children ?? "Definition"}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => openDefinition(number)}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-gold/80 hover:text-gold",
        "underline decoration-dotted decoration-gold/40 underline-offset-2 transition-colors",
        className,
      )}
    >
      <BookOpen className="w-3.5 h-3.5" />
      {children ?? "Definition"}
    </button>
  );
}

interface MetricTermProps {
  /** The UI label to resolve to a definition (e.g. "ROE", "Net debt/EBITDA"). */
  metric: string;
  /** Accepted for call-site compatibility; routing is global to the one panel. */
  scope?: string;
  /**
   * Surface-scoped label resolver. Defaults to the individual-page resolver;
   * the comparative/industry/sector pages pass their own so the same label
   * (e.g. "ROE") opens that surface's definition.
   */
  resolve?: (label: string) => number | undefined;
  /**
   * Render as a span (with stopPropagation) instead of a button, required when
   * the label sits inside another interactive element like a tile button.
   */
  asSpan?: boolean;
  className?: string;
  children?: ReactNode;
}

/**
 * A clickable metric label. If the label resolves to a definition, clicking it
 * opens that definition in the sidebar panel. Unresolvable labels render as
 * plain text.
 */
export function MetricTerm({
  metric,
  resolve = resolveDefNumber,
  asSpan = false,
  className,
  children,
}: MetricTermProps) {
  const number = resolve(metric);
  if (number == null) return <span className={className}>{children ?? metric}</span>;

  const interactiveClasses = cn(
    "cursor-pointer text-left underline decoration-dotted decoration-white/25 underline-offset-2",
    "hover:text-gold hover:decoration-gold/60 transition-colors",
    className,
  );
  const tooltip = `What is ${metric}? Click to open the definition`;
  const activate = () => requestDefinition(number);

  if (asSpan) {
    return (
      <span
        role="button"
        tabIndex={0}
        title={tooltip}
        onClick={(e) => {
          e.stopPropagation();
          activate();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            activate();
          }
        }}
        className={interactiveClasses}
      >
        {children ?? metric}
      </span>
    );
  }
  return (
    <button type="button" title={tooltip} onClick={activate} className={interactiveClasses}>
      {children ?? metric}
    </button>
  );
}
