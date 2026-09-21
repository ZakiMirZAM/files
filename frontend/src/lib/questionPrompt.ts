// How a question and its hidden guidance are joined for the AI request.
//
// The server accepts exactly {question, context, section, data} and treats
// `data` as figures it checks numerically, so instructions have to ride in the
// question slot. QuestionField renders `question` and sends `askPrompt(...)`.
//
// Pure and tiny on purpose: this is the thing the test asserts, so a change to
// the joining cannot slip past without the test seeing it.

/** The guidance, a blank line, then the question. No guidance, just the question. */
export function askPrompt(question: string, guidance?: string): string {
  const trimmed = guidance?.trim();
  return trimmed ? `${trimmed}\n\n${question}` : question;
}

/**
 * The `data` block of the AI request: the page's own figures FIRST, a blank
 * line, then whatever extra block was gathered for the click (the cross-stage
 * one). The order is the point: the figures the reader can see on the screen
 * lead, and the wider block follows them.
 *
 * Returns undefined when neither side has anything, so the request omits the
 * field rather than sending an empty string.
 */
export function askDataContext(
  pageContext?: string,
  extraContext?: string,
): string | undefined {
  const page = pageContext?.trim();
  const extra = extraContext?.trim();
  if (page && extra) return `${page}\n\n${extra}`;
  return page || extra || undefined;
}
