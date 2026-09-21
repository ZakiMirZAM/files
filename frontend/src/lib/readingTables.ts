// The owner's own named readings for one metric, and the resolution of a saved
// pick against them.
//
// A pick is stored exactly like every other qualitative answer: section
// "economic" or "credit", scopeKey `metric-N`, questionId "reading", answer the
// reading label word for word. No schema change, no new table.
//
// This module reaches into the generated metric-sector dataset, which is about
// a megabyte, so it is imported dynamically by the one component that needs it
// (components/ReadingPicker.tsx) and only when the reader opens the list of
// readings or already has a pick to resolve. Keep it that way: a static import
// of this module from a page puts the whole dataset in that page's bundle.
//
// It was called useReadingPicks.ts while it also held a hook that read every
// pick a reader had ever saved. Nothing consumed that hook, and the query
// behind it scanned the whole answer table, so the hook, the query and the
// switch between them are gone. What is left is two pure functions.

import type { DefinitionSurface, Part3Row } from "./definitionTables";
import { readingKeyOf } from "./definitionTables";
import { METRIC_SECTOR_MAP } from "./generated/metricSectorMap";

/** The two surfaces that carry reading tables. The same two everywhere; named
 *  once in definitionTables, which is where the parser defines them. */
export type ReadingSurface = DefinitionSurface;

export interface ResolvedReading {
  surface: ReadingSurface;
  /** The definition number the pick was stored under. */
  defNumber: number;
  /** The answer as saved, word for word. */
  saved: string;
  /** The matching Part 3 row, when the saved answer still names one. */
  row: Part3Row | null;
  /** True when the saved answer matches no current reading of this metric. */
  orphaned: boolean;
}

/** `metric-6` -> 6. Returns null for any other scope. */
export function defNumberFromScopeKey(scopeKey: string): number | null {
  const m = /^metric-(\d+)$/.exec(scopeKey);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

/** The Part 3 rows for one metric, or an empty list when it has no table. */
export function readingsFor(surface: ReadingSurface, defNumber: number): Part3Row[] {
  const entry = METRIC_SECTOR_MAP[surface][String(defNumber)];
  if (!entry || !entry.conforming) return [];
  return entry.part3;
}

/**
 * Resolve one saved answer against a metric's readings: exact label first, then
 * the reading key, so a reworded label with the same key still matches. Neither
 * matching, the pick is orphaned and nothing is guessed.
 */
export function resolveReading(
  surface: ReadingSurface,
  defNumber: number,
  saved: string,
): ResolvedReading {
  const rows = readingsFor(surface, defNumber);
  const trimmed = saved.trim();
  const byLabel = rows.find((r) => r.readingLabel === trimmed) ?? null;
  const byKey =
    byLabel ??
    rows.find((r) => r.readingKey === trimmed) ??
    // readingKeyOf is the function that GENERATED the keys being compared
    // against, so a saved label is slugged by exactly the same rule.
    rows.find((r) => r.readingKey === readingKeyOf(trimmed)) ??
    null;
  return {
    surface,
    defNumber,
    saved: trimmed,
    row: byKey,
    orphaned: trimmed.length > 0 && byKey === null,
  };
}
