// Module-level store for the single unified AI sidebar, modeled on
// definitionPanelStore.ts. Three callers open it: the "Explain using AI" button
// next to a qualitative question (answer mode), the floating button that
// appears on a text selection (explain mode), and the chat button in the app
// header (chat mode, where the reader types any question). The AiPanel mounted
// once in the AppShell subscribes and renders. Each openAi() bumps `id` so the
// panel re-fetches even when reopened on the same mode.
import type { SectionKey } from "./types";

export type AiMode = "answer" | "explain" | "chat";

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
  /**
   * Gathers the figures this question should carry, run ONLY when the panel is
   * about to call the model.
   *
   * The cross-stage block is a dozen network calls and takes tens of seconds.
   * Gathering it before the panel opened meant a question whose answer was
   * already in the Convex cache spent that wait and that bandwidth for
   * nothing, because the cached row is resolved before any fetch. Resolving to
   * null means the reader left the page while it ran, and the question is not
   * sent at all.
   */
  gatherData?: (signal: AbortSignal) => Promise<string | null>;
  /** Subject label in view (used by explain mode for interactive valuation). */
  subject?: string;
  // explain mode
  selection?: string;
  /** Optional: write the answer into the user's editable box ("Copy to my answer"). */
  onCopy?: (text: string) => void;
  // chat mode, local site only: a book for the AI to read, the page in view,
  // and text to place in the chat box (never sent until the reader sends it).
  book?: { id: string; name: string; pages?: string };
  page?: number;
  draft?: string;
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

/** The header chat button: opens the chat, or closes it when it is already open. */
export function toggleChat(): void {
  if (current?.mode === "chat") {
    closeAi();
    return;
  }
  openAi({ mode: "chat", title: "Ask AI" });
}

export function getOpenAi(): AiRequest | null {
  return current;
}

export function subscribeAi(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Width of the open panel on large screens (0 when closed), so a full-screen
// overlay such as the PDF viewer can leave room for it.
let panelWidth = 0;

export function setAiPanelWidth(width: number): void {
  if (width === panelWidth) return;
  panelWidth = width;
  emit();
}

export function getAiPanelWidth(): number {
  return panelWidth;
}

/** Opens the chat on a book from the Books folder, at the page in view (local site). */
export function askAboutBook(book: { id: string; name: string }, page?: number): void {
  openAi({ mode: "chat", title: "Ask AI", book, page });
}
