// Local bookshelf AI: the AI reads the owner's own books (rag/book_tools.py).
// Only the LOCAL AI server answers these routes (started with LOCAL_BOOKS=1);
// the live site answers 404, so localAiAvailable() resolves false there and no
// book feature shows.

const AI_BASE = (import.meta.env.VITE_AI_BASE as string | undefined) ?? "http://localhost:3001";
const ASK_TIMEOUT_MS = 600_000;

/** A book the AI should read: its id in the Books folder, its name, and optional pages or chapter. */
export interface BookSource {
  id: string;
  name: string;
  pages?: string;
}

let status: Promise<boolean> | null = null;

/** True when the local AI server can read the Books folder. Checked once per page load. */
export function localAiAvailable(): Promise<boolean> {
  if (!status) {
    status = fetch(`${AI_BASE}/local/status`, { signal: AbortSignal.timeout(5000) })
      .then(async (r) => r.ok && ((await r.json()) as { ok?: unknown }).ok === true)
      .catch(() => false);
  }
  return status;
}

export interface LocalAskTurn {
  question: string;
  answer: string;
}

/** Ask the AI a question; when `book` is given it reads that book first. */
export async function askLocal(p: {
  question: string;
  book?: BookSource | null;
  /** Books @-mentioned in the question. */
  books?: BookSource[];
  page?: number | null;
  history?: LocalAskTurn[];
  model?: string;
}): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${AI_BASE}/local/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        question: p.question,
        ...(p.book ? { book: p.book } : {}),
        ...(p.books?.length ? { books: p.books } : {}),
        ...(p.page ? { page: p.page } : {}),
        history: (p.history ?? []).slice(-4),
        ...(p.model ? { model: p.model } : {}),
      }),
      signal: AbortSignal.timeout(ASK_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof DOMException && (err.name === "AbortError" || err.name === "TimeoutError")) {
      throw new Error("The AI took too long and the page stopped waiting. Try again.");
    }
    throw new Error("Could not reach the local AI server.");
  }
  const raw = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = raw.trim() ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    data = {};
  }
  if (typeof data.error === "string" && data.error) throw new Error(data.error);
  if (!res.ok) throw new Error(`The local AI server returned ${res.status}. Try again.`);
  const answer = typeof data.answer === "string" ? data.answer.trim() : "";
  if (!answer) throw new Error("The AI answer came back empty. Try again.");
  return answer;
}

/** The text placed in the chat box to review a test's wrong answers. */
export function wrongAnswersPrompt(
  testTitle: string,
  wrong: { prompt: string; choices?: string[]; yourAnswer: string; correctAnswer: string }[],
): string {
  const lines = wrong.map((w, i) => {
    const choices = w.choices?.length ? `\nChoices: ${w.choices.map((c, k) => `${"ABCD"[k] ?? k + 1}. ${c}`).join(" | ")}` : "";
    return `${i + 1}. ${w.prompt}${choices}\nMy answer: ${w.yourAnswer || "(none)"}\nCorrect answer: ${w.correctAnswer}`;
  });
  return `I got these questions wrong on the test "${testTitle}". Help me review each one.\n\n${lines.join("\n\n")}`;
}
