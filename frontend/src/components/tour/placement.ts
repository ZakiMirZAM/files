// Pure popover placement math for the tour. No React and no DOM mutation: given
// the target rect and the popover size, pick a side that fits and clamp into the
// viewport. Kept pure so it is easy to reason about and test in isolation.

import type { TourPlacement } from "../../lib/tourStore";

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export type ResolvedPlacement = "top" | "bottom" | "left" | "right" | "center";

export interface PopoverPosition {
  top: number;
  left: number;
  placement: ResolvedPlacement;
}

interface ComputeArgs {
  targetRect: Rect | null;
  popoverSize: Size;
  viewport: Size;
  preferred: TourPlacement;
  /** Gap between the target and the popover. */
  gap?: number;
  /** Minimum distance the popover keeps from the viewport edge. */
  margin?: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(value, Math.max(min, max)));

function centered(popoverSize: Size, viewport: Size): PopoverPosition {
  return {
    top: clamp((viewport.height - popoverSize.height) / 2, 12, viewport.height - popoverSize.height - 12),
    left: clamp((viewport.width - popoverSize.width) / 2, 12, viewport.width - popoverSize.width - 12),
    placement: "center",
  };
}

/** Compute the popover's fixed top/left and the side it ended up on. */
export function computePopoverPosition(args: ComputeArgs): PopoverPosition {
  const { targetRect, popoverSize, viewport, preferred } = args;
  const gap = args.gap ?? 12;
  const margin = args.margin ?? 12;

  if (!targetRect || preferred === "center") {
    return centered(popoverSize, viewport);
  }

  const t = targetRect;
  const maxLeft = viewport.width - popoverSize.width - margin;
  const maxTop = viewport.height - popoverSize.height - margin;
  const centerLeft = t.left + t.width / 2 - popoverSize.width / 2;
  const centerTop = t.top + t.height / 2 - popoverSize.height / 2;

  const sides: ResolvedPlacement[] =
    preferred === "auto"
      ? ["bottom", "top", "right", "left"]
      : ([preferred, "bottom", "top", "right", "left"].filter(
          (p, i, arr) => arr.indexOf(p) === i,
        ) as ResolvedPlacement[]);

  for (const side of sides) {
    if (side === "bottom") {
      const top = t.top + t.height + gap;
      if (top + popoverSize.height <= viewport.height - margin) {
        return { top, left: clamp(centerLeft, margin, maxLeft), placement: "bottom" };
      }
    } else if (side === "top") {
      const top = t.top - gap - popoverSize.height;
      if (top >= margin) {
        return { top, left: clamp(centerLeft, margin, maxLeft), placement: "top" };
      }
    } else if (side === "right") {
      const left = t.left + t.width + gap;
      if (left + popoverSize.width <= viewport.width - margin) {
        return { left, top: clamp(centerTop, margin, maxTop), placement: "right" };
      }
    } else if (side === "left") {
      const left = t.left - gap - popoverSize.width;
      if (left >= margin) {
        return { left, top: clamp(centerTop, margin, maxTop), placement: "left" };
      }
    }
  }

  // Nothing fit cleanly: place below the target and clamp fully into view.
  return {
    top: clamp(t.top + t.height + gap, margin, maxTop),
    left: clamp(centerLeft, margin, maxLeft),
    placement: "bottom",
  };
}
