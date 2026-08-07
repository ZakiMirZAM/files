import { useSyncExternalStore } from "react";

/** Per-ticker selected stage count for the intrinsic-valuation models.
 *
 * A small module store (same pattern as definitionPanelStore) so the
 * ValuationCard, ForecastSection and EquityModelsSection all follow one
 * choice, persisted per ticker in localStorage. The backend's scores and
 * verdicts always use the RECOMMENDED structure; this selection is a lens
 * for the reader, never an input to scoring.
 */

const listeners = new Set<() => void>();
let overrides: Record<string, number> = {};

const storageKey = (ticker: string) => `ifed.valuation.stages.${ticker}`;

function readStored(ticker: string): number | null {
  if (overrides[ticker] != null) return overrides[ticker];
  try {
    const raw = localStorage.getItem(storageKey(ticker));
    if (raw) {
      const n = parseInt(raw, 10);
      if (n >= 1 && n <= 3) return n;
    }
  } catch {
    // Storage unavailable (private mode); session-only behavior is fine.
  }
  return null;
}

export function setSelectedStages(ticker: string, stages: number): void {
  overrides = { ...overrides, [ticker]: stages };
  try {
    localStorage.setItem(storageKey(ticker), String(stages));
  } catch {
    // Persisting is a nicety; the in-memory override still works.
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The stage count to render: the user's stored choice, else the backend's
 *  recommendation. Components re-render when any toggle changes it. */
export function useSelectedStages(
  ticker: string,
  recommended: number | null | undefined,
): number | null {
  const stored = useSyncExternalStore(subscribe, () => readStored(ticker));
  return stored ?? recommended ?? null;
}
