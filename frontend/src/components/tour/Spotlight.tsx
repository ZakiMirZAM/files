// The dimmed spotlight layer. A full-screen backdrop button captures clicks
// (clicking outside the popover skips the tour) and, when there is no target,
// supplies the dim itself. When there is a target, a single fixed element sized
// to the target paints the dim everywhere except a rounded hole, using a large
// box-shadow spread. The cutout is non-interactive so clicks fall through to the
// backdrop, which keeps the user on the guided path.

import type { Rect } from "./placement";

interface SpotlightProps {
  rect: Rect | null;
  padding: number;
  reduced: boolean;
  onSkip: () => void;
}

const DIM = "rgba(6, 9, 26, 0.72)";
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

export function Spotlight({ rect, padding, reduced, onSkip }: SpotlightProps) {
  return (
    <>
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onSkip}
        className="fixed inset-0 z-[70] cursor-default"
        style={{ background: rect ? "transparent" : DIM }}
      />
      {rect && (
        <div
          aria-hidden="true"
          className="fixed z-[70] rounded-lg pointer-events-none"
          style={{
            top: rect.top - padding,
            left: rect.left - padding,
            width: rect.width + padding * 2,
            height: rect.height + padding * 2,
            boxShadow: `0 0 0 9999px ${DIM}`,
            outline: "1px solid rgba(201, 168, 76, 0.5)",
            outlineOffset: "2px",
            transition: reduced
              ? "none"
              : `top 200ms ${EASE}, left 200ms ${EASE}, width 200ms ${EASE}, height 200ms ${EASE}`,
          }}
        />
      )}
    </>
  );
}
