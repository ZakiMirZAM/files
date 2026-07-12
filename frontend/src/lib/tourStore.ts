// Tiny module-level store for the single guided-tour overlay. Mirrors
// definitionPanelStore.ts / aiPanelStore.ts: a module-level state object, a Set
// of listeners, and emit(), consumed via React useSyncExternalStore. A page or
// the help menu calls startTour(tour); the TourOverlay mounted once in AppShell
// subscribes and renders the current step. Completing or skipping marks the tour
// done (tourStorage) so the first-run auto-start never repeats.

import { markTourDone } from "./tourStorage";

export type TourPlacement = "top" | "bottom" | "left" | "right" | "auto" | "center";

export interface TourStep {
  /** Stable id for the step (used as a React key). */
  id: string;
  /** CSS selector for the highlighted element. Omit for a centered step. */
  target?: string;
  /** Short callout heading. */
  title: string;
  /** One or two plain sentences. */
  body: string;
  /** Preferred popover side relative to the target. Default "auto". */
  placement?: TourPlacement;
  /** Navigate here first if the current path differs, then wait for the target. */
  route?: string;
  /** Max ms to wait for the target element to appear. Default 4000. */
  waitTimeout?: number;
  /** When the target never appears: skip the step, or show it centered. Default "center". */
  onMissing?: "skip" | "center";
  /** Extra px around the spotlight cutout. Default 8. */
  padding?: number;
  /** Runs when the step becomes active (for example, open a panel). */
  onEnter?: () => void;
  /** Cleanup paired with onEnter, runs when the step is left. */
  onLeave?: () => void;
}

export interface Tour {
  /** Used for the done-flag key, for example "welcome". */
  id: string;
  /** Bump to re-trigger the first-run after a major change. */
  version: number;
  steps: TourStep[];
}

export interface TourState {
  tour: Tour | null;
  index: number;
}

let state: TourState = { tour: null, index: -1 };
let previousFocus: HTMLElement | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function setState(next: TourState): void {
  state = next;
  emit();
}

/** Begin a tour at step 0. Remembers focus so it can be restored on exit. */
export function startTour(tour: Tour): void {
  if (tour.steps.length === 0) return;
  if (typeof document !== "undefined") {
    previousFocus = (document.activeElement as HTMLElement | null) ?? null;
  }
  setState({ tour, index: 0 });
}

/** Advance to the next step, or end the tour after the last step. */
export function next(): void {
  if (!state.tour) return;
  const last = state.tour.steps.length - 1;
  if (state.index >= last) {
    endTour();
    return;
  }
  setState({ tour: state.tour, index: state.index + 1 });
}

/** Go back one step (clamped at the first step). */
export function prev(): void {
  if (!state.tour) return;
  setState({ tour: state.tour, index: Math.max(0, state.index - 1) });
}

/** Jump to a specific step (clamped to range). */
export function goToStep(index: number): void {
  if (!state.tour) return;
  const clamped = Math.max(0, Math.min(index, state.tour.steps.length - 1));
  setState({ tour: state.tour, index: clamped });
}

/**
 * End the tour, mark it done, and restore focus to where the user was. Both
 * finishing the last step and skipping route here, so an accidental start never
 * nags the user again.
 */
export function endTour(): void {
  const tour = state.tour;
  setState({ tour: null, index: -1 });
  if (tour) markTourDone(tour.id, tour.version);
  const toFocus = previousFocus;
  previousFocus = null;
  if (toFocus && toFocus.isConnected) {
    try {
      toFocus.focus();
    } catch {
      // element may no longer be focusable; ignore
    }
  }
}

/** Skip is the same as ending: it still marks the tour done. */
export function skipTour(): void {
  endTour();
}

/** Snapshot for useSyncExternalStore (returns the cached object). */
export function getTourState(): TourState {
  return state;
}

export function subscribeTour(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
