// The AI sidebar's model switch: Opus (the default, deeper) or Haiku (faster).
// The server accepts only "haiku" and falls back to its own default for
// anything else, so this choice can never name an arbitrary model.
// Remembered per browser; a blocked localStorage just means it resets to Opus.

export type AiModelChoice = "opus" | "haiku";

const KEY = "ifed.ai.model";

function load(): AiModelChoice {
  try {
    return localStorage.getItem(KEY) === "haiku" ? "haiku" : "opus";
  } catch {
    return "opus";
  }
}

let current: AiModelChoice = load();
const listeners = new Set<() => void>();

export function getAiModel(): AiModelChoice {
  return current;
}

export function setAiModel(next: AiModelChoice): void {
  if (next === current) return;
  current = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // storage unavailable: the choice still holds for this visit
  }
  for (const listener of listeners) listener();
}

export function subscribeAiModel(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The model id saved with a cached answer, for the record. */
export function modelIdFor(choice: AiModelChoice): string {
  return choice === "haiku" ? "claude-haiku-5-5" : "claude-opus-5-5";
}
