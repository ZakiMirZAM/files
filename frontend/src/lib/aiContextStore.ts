// Holds the AI context for the page currently in view (subject + its computed
// figures), so the GLOBAL "Explain using AI" selection button can send the
// company's data even though it is mounted in the app shell, not in a page.
// Each data page sets this when its data loads and clears it on unmount.
import type { SectionKey } from "./types";

export interface PageAiContext {
  section?: SectionKey;
  /** Human label of the subject in view, e.g. "NVDA", "the US economy". */
  subject?: string;
  /** Compact summary of the subject's live computed figures (undefined if mock/absent). */
  dataContext?: string;
}

let current: PageAiContext = {};

export function setPageAiContext(ctx: PageAiContext): void {
  current = ctx;
}

export function clearPageAiContext(): void {
  current = {};
}

export function getPageAiContext(): PageAiContext {
  return current;
}
