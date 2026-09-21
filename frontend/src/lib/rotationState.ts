// Shared access to the Sector Rotation matrix's persisted state. The matrix is
// computed entirely client-side and saved to localStorage by SectorRotation;
// the Economic page's Sector Verdict deck reads the same state to tell the AI
// helper what the user's own matrix currently says.

import {
  ECON_LINK,
  METRICS,
  SECTORS,
  clampWeight,
  scoreMatrix,
  scoreMatrixNormalized,
  type Reading,
  type SectorTotal,
} from "./sectorRotation";

export const ROTATION_DIRECTIONS_KEY = "ifed.rotation.directions";
export const ROTATION_WEIGHTS_KEY = "ifed.rotation.weights";
export const ROTATION_NORMALIZED_KEY = "ifed.rotation.normalized";

/** Whether the ranking adjusts for coverage (default ON, the backtested mode). */
export function loadRotationNormalized(): boolean {
  try {
    return localStorage.getItem(ROTATION_NORMALIZED_KEY) !== "0";
  } catch {
    return true;
  }
}

export function loadRotationDirections(): Record<string, Reading> {
  const out: Record<string, Reading> = {};
  try {
    const raw = localStorage.getItem(ROTATION_DIRECTIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, string>;
      for (const m of METRICS) {
        const v = parsed[m.id];
        if (v === "up" || v === "neutral" || v === "down") out[m.id] = v;
      }
    }
  } catch {
    // ignore
  }
  return out;
}

/** Only weight overrides that differ from the sourced default are stored. */
export function loadRotationWeights(): Record<string, number> {
  const out: Record<string, number> = {};
  try {
    const raw = localStorage.getItem(ROTATION_WEIGHTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, number>;
      for (const m of METRICS) {
        const v = parsed[m.id];
        if (typeof v === "number" && clampWeight(v) !== m.weight) out[m.id] = clampWeight(v);
      }
    }
  } catch {
    // ignore
  }
  return out;
}

/** The user's current matrix ranking, or null when no readings are set.
 *  Follows the user's chosen ranking mode so the AI context and the page agree. */
export function currentRotationRanking(): SectorTotal[] | null {
  const dirs = loadRotationDirections();
  if (Object.keys(dirs).length === 0) return null;
  const weights = loadRotationWeights();
  const totals = loadRotationNormalized()
    ? scoreMatrixNormalized(dirs, weights)
    : scoreMatrix(dirs, weights);
  return totals.length === SECTORS.length ? totals : null;
}

/**
 * Write one metric row's reading into the matrix's persisted state.
 *
 * The Sector Rotation page holds the same map in component state and mirrors it
 * here on every change, so it calls this too: one writer, one shape, one place
 * to look when a reading set somewhere else does not show up on the matrix.
 * Returns the stored map so a caller can hand it straight to setState.
 */
export function setRotationDirection(
  metricId: string,
  reading: Reading,
): Record<string, Reading> {
  const next = { ...loadRotationDirections(), [metricId]: reading };
  saveRotationDirections(next);
  return next;
}

/** Persist the whole directions map. The page's own effect calls this. */
export function saveRotationDirections(directions: Record<string, Reading>): void {
  try {
    localStorage.setItem(ROTATION_DIRECTIONS_KEY, JSON.stringify(directions));
  } catch {
    // A browser with storage blocked keeps the matrix for this visit only.
  }
}

/** The matrix rows that carry a given economic definition number. */
export function rotationRowsForEconomic(econNumber: number): { id: string; name: string }[] {
  return METRICS.filter((m) => ECON_LINK[m.id] === econNumber).map((m) => ({
    id: m.id,
    name: m.name,
  }));
}
