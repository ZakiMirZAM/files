// The tour callout card: step counter, title, body, a progress bar, and the
// Back / Next / Skip controls. Presentational only; the overlay computes its
// position and passes it as `style`. A soft Tab wrap keeps keyboard focus inside
// the card (Escape and the always-visible Skip button are the escape hatches).

import { X } from "lucide-react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import type { TourStep } from "../../lib/tourStore";

interface TourPopoverProps {
  step: TourStep;
  index: number;
  total: number;
  isLast: boolean;
  reduced: boolean;
  style: CSSProperties;
  cardRef: RefObject<HTMLDivElement | null>;
  titleId: string;
  bodyId: string;
  onPrev: () => void;
  onNext: () => void;
  onSkip: () => void;
}

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

export function TourPopover({
  step,
  index,
  total,
  isLast,
  reduced,
  style,
  cardRef,
  titleId,
  bodyId,
  onPrev,
  onNext,
  onSkip,
}: TourPopoverProps) {
  const progress = (index + 1) / total;

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const card = cardRef.current;
    if (!card) return;
    const items = Array.from(
      card.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      style={style}
      className="fixed z-[80] w-[min(360px,calc(100vw-24px))] max-h-[calc(100dvh-24px)] overflow-y-auto panel p-4 outline-none"
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-white/40">
          Step {index + 1} of {total}
        </span>
        <button
          type="button"
          onClick={onSkip}
          aria-label="Close tour"
          className="-mr-1.5 p-1.5 rounded-sm text-white/45 hover:text-gold transition-colors"
        >
          <X className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      <h2 id={titleId} className="font-display text-base font-semibold text-white text-balance">
        {step.title}
      </h2>
      <p id={bodyId} className="mt-1.5 text-sm leading-relaxed text-white/80">
        {step.body}
      </p>

      <div className="mt-3 h-1 rounded-full bg-white/10 overflow-hidden" aria-hidden="true">
        <div
          className="h-full bg-gold origin-left"
          style={{
            transform: `scaleX(${progress})`,
            transition: reduced ? "none" : `transform 320ms ${EASE}`,
          }}
        />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-white/45 hover:text-white/80 transition-colors"
        >
          Skip tour
        </button>
        <div className="flex items-center gap-2">
          {index > 0 && (
            <button type="button" onClick={onPrev} className="btn-outline text-xs px-3 py-1.5">
              Back
            </button>
          )}
          <button type="button" onClick={onNext} className="btn-gold text-xs px-3 py-1.5">
            {isLast ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
