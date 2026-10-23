import type { GrowthUsedKind } from "./types";

const LABELS: Record<GrowthUsedKind, string | null> = {
  revenueGrowth: "Revenue growth used",
  fcfPerShareHistory: "Historical FCF per share growth",
  dividendGrowth: "Dividend growth used",
  legacyFcfPerShare: null,
};

/** The label for the `fcfGrowthUsed` number, by what the number actually is.
 *  The legacy engine and an unknown kind keep the surface's existing label. */
export function growthUsedLabel(kind: GrowthUsedKind | null | undefined, fallback: string): string {
  return (kind && LABELS[kind]) || fallback;
}

const WORDS: Record<GrowthUsedKind, string> = {
  revenueGrowth: "revenue growth that drives the forecast",
  fcfPerShareHistory: "historical free cash flow per share growth",
  dividendGrowth: "dividend growth",
  legacyFcfPerShare: "free cash flow per share growth (legacy model)",
};

/** The same, in words, for the AI data context. */
export function growthUsedWords(kind: GrowthUsedKind | null | undefined): string {
  return (kind && WORDS[kind]) || "FCF growth";
}
