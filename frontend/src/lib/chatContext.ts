// The `data` block for a question typed in the chat sidebar. The chat sends
// each question through the same /ask route as every "Explain using AI"
// button, so the only chat-specific part is this block: which page the reader
// is on, and the last few exchanges, so a follow-up question ("why is it above
// WACC?") can lean on the answer before it.
import type { PageAiContext } from "./aiContextStore";
import { askDataContext } from "./questionPrompt";

/** One finished exchange in the chat. */
export interface ChatTurn {
  question: string;
  answer: string;
}

/** How many earlier exchanges travel with a new question. */
export const CHAT_MEMORY_TURNS = 3;

/** An earlier answer is cut to this many characters, so a long chat cannot
 *  push the page's own figures out of the request. */
export const CHAT_ANSWER_CHARS = 1200;

function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/**
 * JSON describing where the question was asked and the last
 * CHAT_MEMORY_TURNS exchanges (oldest first). Undefined when there is
 * nothing to say, so the request carries only the page's figures.
 */
export function chatBlock(pageName: string | undefined, turns: ChatTurn[]): string | undefined {
  const page = pageName?.trim();
  const earlier = turns.slice(-CHAT_MEMORY_TURNS).map((t) => ({
    question: clip(t.question, CHAT_ANSWER_CHARS),
    answer: clip(t.answer, CHAT_ANSWER_CHARS),
  }));
  if (!page && earlier.length === 0) return undefined;
  const block: Record<string, unknown> = {};
  if (page) block.askedOnPage = page;
  if (earlier.length > 0) block.earlierInThisChat = earlier;
  return JSON.stringify({ chat: block });
}

/** The full `data` field: the page's own figures first, then the chat block. */
export function chatDataContext(
  page: PageAiContext,
  pageName: string | undefined,
  turns: ChatTurn[],
): string | undefined {
  return askDataContext(page.dataContext, chatBlock(pageName, turns));
}

/** The page name from the tab title the app shell sets ("IntrinsicFinEd - Economic"). */
export function pageNameFromTitle(title: string): string | undefined {
  const m = /^IntrinsicFinEd - (.+)$/.exec(title.trim());
  return m ? m[1] : undefined;
}
