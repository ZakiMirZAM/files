// Module-level store for the single unified AI sidebar, modeled on
// definitionPanelStore.ts. Two callers open it: the "Explain using AI" button
// next to a qualitative question (answer mode), and the floating button that
// appears on a text selection (explain mode). The AiPanel mounted once in the
// AppShell subscribes and renders. Each openAi() bumps `id` so the panel
// re-fetches even when reopened on the same mode.
import type { SectionKey } from "./types";

export type AiMode = "answer" | "explain";

export interface AiRequest {
  id: number;
  mode: AiMode;
  /** Header text for the panel. */
  title: string;
  // answer mode
  question?: string;
  /** Stable question id, used to cache/reuse the answer (Convex aiAnswers). */
  questionId?: string;
  section?: SectionKey;
  /** Subject in view (ticker / sector / industry), passed as the answer context. */
  context?: string;
  /** Compact summary of the page's computed figures for this subject (optional). */
  dataContext?: string;
  /** Subject label in view (used by explain mode for interactive valuation). */
  subject?: string;
  // explain mode
  selection?: string;
  /** Optional: write the answer into the user's editable box ("Copy to my answer"). */
  onCopy?: (text: string) => void;
}

export type OpenAiInput = Omit<AiRequest, "id">;

let current: AiRequest | null = null;
let counter = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function openAi(input: OpenAiInput): void {
  counter += 1;
  current = { ...input, id: counter };
  emit();
}

export function closeAi(): void {
  if (current === null) return;
  current = null;
  emit();
}

export function getOpenAi(): AiRequest | null {
  return current;
}

export function subscribeAi(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
