// The two helpers every deck builder starts from.
//
// Each deck-building module used to declare its own copy of these, and two of
// them wrote the same filter in different words, which invited the next one to
// drift. This module deliberately imports nothing from any deck module, so it
// belongs to none of them: connectQuestions.ts, industryDecksB.ts and the rest
// import it, never the other way round.

import type { RuntimeQuestion } from "./types";

/** One question: what is asked, and the figures the tutor is handed with it.
 *  Omit `dataContext` when the question carries no figures of its own, so the
 *  block's page-level context is the one that reaches the tutor. */
export function q(id: string, text: string, dataContext?: string): RuntimeQuestion {
  return { id, text, dataContext };
}

/** Join the parts of an AI data context, dropping the ones with nothing in them. */
export function ctx(...parts: (string | undefined | null)[]): string {
  return parts.filter(Boolean).join("\n");
}
