// Tiny module-level store for the single definition sidebar panel. Any metric
// label anywhere calls openDefinition(number); the DefinitionPanel mounted once
// per page subscribes and shows it. The comparative matrix also uses
// openDefinitionSeries(...) to open the panel on a specific company's historical
// trend (a pre-built series + the metric's plain-text description), since those
// per-(company, metric) series are not part of the numbered definition system.

import type { DefinitionSeries } from "./individualSeries";

export interface OpenDefinition {
  /** Numbered definition to load markdown for (0 when only a series is shown). */
  number: number;
  /** Pre-built series to chart (e.g. one company's history from the matrix). */
  series?: DefinitionSeries;
  /** Title override (e.g. "NVDA · EVA"). Falls back to the definition title. */
  title?: string;
  /** Plain-text description shown instead of the numbered markdown. */
  description?: string;
}

let open: OpenDefinition | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Open the sidebar on a numbered definition (no-op if already open on it). */
export function openDefinition(number: number): void {
  if (open && open.number === number && !open.series && !open.description) return;
  open = { number };
  emit();
}

/** Open the sidebar on a pre-built series (with optional title/description). */
export function openDefinitionSeries(def: OpenDefinition): void {
  open = def;
  emit();
}

/** Close the sidebar panel. */
export function closeDefinition(): void {
  if (open === null) return;
  open = null;
  emit();
}

/** Current open definition (object) or null. For useSyncExternalStore. */
export function getOpenDefinition(): OpenDefinition | null {
  return open;
}

/** Subscribe to open/close changes. Returns an unsubscribe function. */
export function subscribeDefinition(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
