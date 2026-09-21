// Porter's five forces diagram (figure 1-1): centre box with four
// surrounding boxes connected by arrows. Responsive CSS grid layout;
// narrow screens stack in a sensible reading order.

import { cn } from "../../../lib/cn";
import {
  DIAGRAM_CENTER,
  DIAGRAM_LABELS,
  FORCE_TITLES,
} from "../../../lib/industryForcesCopy";

type ForceKey = "entry" | "rivalry" | "substitutes" | "buyers" | "suppliers";

interface ForcesDiagramProps {
  activeForce: ForceKey | null;
  onSelectForce: (force: ForceKey) => void;
  ratings: Partial<Record<ForceKey, number>>;
}

function DiagramBox({
  label,
  force,
  active,
  onClick,
  className,
  rating,
}: {
  label: string;
  force: ForceKey;
  active: boolean;
  onClick: () => void;
  className?: string;
  rating?: number | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-md border px-3 py-2 text-xs leading-tight text-center transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold/60",
        active
          ? "border-gold/50 bg-gold/10 text-gold"
          : "border-white/15 bg-ink-900 text-white/70 hover:border-gold/30 hover:text-white",
        className,
      )}
    >
      <span className="block font-medium">{label}</span>
      {rating != null && (
        <span className="block text-[0.65rem] text-white/40 mt-0.5 font-mono">
          {rating}
        </span>
      )}
    </button>
  );
}

/** Inline SVG arrow pointing in one direction. */
function Arrow({ direction, className }: { direction: "down" | "up" | "left" | "right"; className?: string }) {
  const rotate = { down: 0, up: 180, right: -90, left: 90 }[direction];
  return (
    <svg
      className={cn("text-white/25", className)}
      width="20"
      height="28"
      viewBox="0 0 20 28"
      fill="none"
      aria-hidden="true"
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      <line x1="10" y1="0" x2="10" y2="22" stroke="currentColor" strokeWidth="1.5" />
      <polyline points="5,17 10,24 15,17" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

export function ForcesDiagram({ activeForce, onSelectForce, ratings }: ForcesDiagramProps) {
  return (
    <div className="w-full max-w-xl mx-auto">
      {/* Desktop: CSS grid with 3 columns, 5 rows */}
      <div
        className="hidden sm:grid gap-2"
        style={{
          gridTemplateColumns: "1fr auto 1fr",
          gridTemplateRows: "auto auto auto auto auto",
        }}
      >
        {/* Row 1: Entrants centered */}
        <div className="col-start-2 flex justify-center">
          <DiagramBox
            label={DIAGRAM_LABELS.top}
            force="entry"
            active={activeForce === "entry"}
            onClick={() => onSelectForce("entry")}
            rating={ratings.entry}
          />
        </div>
        {/* Row 2: Arrow down */}
        <div className="col-start-2 flex justify-center">
          <Arrow direction="down" />
        </div>
        {/* Row 3: Suppliers - arrow - Centre - arrow - Buyers */}
        <div className="flex items-center justify-end gap-2">
          <DiagramBox
            label={DIAGRAM_LABELS.left}
            force="suppliers"
            active={activeForce === "suppliers"}
            onClick={() => onSelectForce("suppliers")}
            rating={ratings.suppliers}
          />
          <Arrow direction="right" />
        </div>
        <div className="flex items-center justify-center">
          <DiagramBox
            label={DIAGRAM_CENTER}
            force="rivalry"
            active={activeForce === "rivalry"}
            onClick={() => onSelectForce("rivalry")}
            className="min-h-[4rem] font-semibold"
            rating={ratings.rivalry}
          />
        </div>
        <div className="flex items-center gap-2">
          <Arrow direction="right" />
          <DiagramBox
            label={DIAGRAM_LABELS.right}
            force="buyers"
            active={activeForce === "buyers"}
            onClick={() => onSelectForce("buyers")}
            rating={ratings.buyers}
          />
        </div>
        {/* Row 4: Arrow down */}
        <div className="col-start-2 flex justify-center">
          <Arrow direction="down" />
        </div>
        {/* Row 5: Substitutes */}
        <div className="col-start-2 flex justify-center">
          <DiagramBox
            label={DIAGRAM_LABELS.bottom}
            force="substitutes"
            active={activeForce === "substitutes"}
            onClick={() => onSelectForce("substitutes")}
            rating={ratings.substitutes}
          />
        </div>
      </div>

      {/* Mobile: vertical stack in a sensible reading order */}
      <div className="sm:hidden flex flex-col items-center gap-2">
        {(["entry", "rivalry", "suppliers", "buyers", "substitutes"] as const).map((f) => (
          <DiagramBox
            key={f}
            label={f === "rivalry" ? DIAGRAM_CENTER : FORCE_TITLES[f]}
            force={f}
            active={activeForce === f}
            onClick={() => onSelectForce(f)}
            className="w-full max-w-xs"
            rating={ratings[f]}
          />
        ))}
      </div>
    </div>
  );
}
