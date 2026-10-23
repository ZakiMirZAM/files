// Tiny module-level store for the single definition sidebar panel. Any metric
// label anywhere calls openDefinition(number); the DefinitionPanel mounted once
// per page subscribes and shows it. The comparative matrix also uses
// openDefinitionSeries(...) to open the panel on a specific company's historical
// trend (a pre-built series + the metric's plain-text description), since those
// per-(company, metric) series are not part of the numbered definition system.

import type { DefinitionSeries } from "./individualSeries";
import type { SectionKey } from "./types";

/** Where a definition's Part 9 questions should save their answers. Supplied by
 *  the opener (a sector/industry matrix cell); absent = the panel renders the
 *  full markdown exactly as before, questions inert. */
export interface DefinitionQuestionScope {
  section: SectionKey;
  /** e.g. "Technology-def-434": one answer set per (group, definition). */
  scopeKey: string;
  /** Page + clicked-series figures for the per-question AI tutor. */
  dataContext?: string;
}

export interface OpenDefinition {
  /** Numbered definition to load markdown for (0 when only a series is shown). */
  number: number;
  /** Pre-built series to chart (e.g. one company's history from the matrix). */
  series?: DefinitionSeries;
  /** Title override (e.g. "NVDA · EVA"). Falls back to the definition title. */
  title?: string;
  /** Plain-text description shown instead of the numbered markdown. */
  description?: string;
  /** When present, the panel renders the definition's Part 9 questions as an
   *  answerable deck saved under this scope. */
  scope?: DefinitionQuestionScope;
  /** The company's own input values and result for this metric, shown above
   *  the definition (the Company page comparison table). */
  calculation?: DefinitionCalculation;
}

export interface DefinitionCalculation {
  heading: string;
  rows: { label: string; value: string }[];
  result: { label: string; value: string };
  note?: string;
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

/**
 * Where a definition's Part 9 questions save their answers when the opener
 * supplied no scope, which is every click on a metric LABEL.
 *
 * The key is the one `openMetricHistory` builds for a clicked CELL of the
 * page's own column, so a label click and a cell click of that column land on
 * the same saved answer. A cell of another column keeps that column's key.
 *
 * Economic and credit metrics already render their questions inside the metric
 * dropdown, so those two pages get nothing here and keep their old behaviour.
 */
export function derivePanelScope(
  openNumber: number | null,
  page: { section?: SectionKey; subjectKey?: string; dataContext?: string },
): DefinitionQuestionScope | undefined {
  if (openNumber == null || openNumber <= 0) return undefined;
  const { section, subjectKey, dataContext } = page;
  if (!section || !subjectKey) return undefined;
  if (section === "economic" || section === "credit") return undefined;
  return { section, scopeKey: `${subjectKey}-def-${openNumber}`, dataContext };
}
