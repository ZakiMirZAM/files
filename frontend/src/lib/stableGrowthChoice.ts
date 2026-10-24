import { useState } from "react";
import type { StableGrowthAlternative, ValuationSelection } from "./types";

/** Which stable-growth basis the reader is viewing. `min` (the lower of the
 *  risk-free rate and long-run economy growth) is what the engine uses; `rf`
 *  is a lens and never feeds a score. */
export type StableGrowthBasis = "min" | "rf";

type Alternatives = ValuationSelection["stableGrowthAlternatives"];

const storageKey = (ticker: string) => `ifed.valuation.stableGrowth.${ticker.toUpperCase()}`;

/** The alternative to display: the chosen one when it exists, else `min`. */
export function resolveStableGrowth(
  alternatives: Alternatives | undefined,
  choice: StableGrowthBasis,
): (StableGrowthAlternative & { basis: StableGrowthBasis }) | null {
  if (!alternatives?.min) return null;
  if (choice === "rf" && alternatives.rf) return { ...alternatives.rf, basis: "rf" };
  return { ...alternatives.min, basis: "min" };
}

/** Intrinsic over price, less one; null when either side is missing. */
export function marginOfSafetyFor(intrinsic: number | null | undefined, price: number | null | undefined): number | null {
  if (intrinsic == null || price == null || price <= 0) return null;
  return intrinsic / price - 1;
}

export function readStableGrowthChoice(ticker: string): StableGrowthBasis {
  try {
    return localStorage.getItem(storageKey(ticker)) === "rf" ? "rf" : "min";
  } catch {
    return "min"; // storage unavailable (private mode)
  }
}

export function writeStableGrowthChoice(ticker: string, choice: StableGrowthBasis): void {
  try {
    localStorage.setItem(storageKey(ticker), choice);
  } catch {
    // Persisting is a nicety; the in-memory choice still works.
  }
}

/** The per-ticker choice, persisted in localStorage. */
export function useStableGrowthChoice(ticker: string): [StableGrowthBasis, (c: StableGrowthBasis) => void] {
  const [state, setState] = useState(() => ({ ticker, choice: readStableGrowthChoice(ticker) }));
  const choice = state.ticker === ticker ? state.choice : readStableGrowthChoice(ticker);
  const set = (c: StableGrowthBasis) => {
    writeStableGrowthChoice(ticker, c);
    setState({ ticker, choice: c });
  };
  return [choice, set];
}
