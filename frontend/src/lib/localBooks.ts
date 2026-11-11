// The PDFs in the owner's Books folder, listed by the LOCAL backend only
// (GET /api/learn/local-books; production answers 404). Used to pick or @-mention
// a book for the local book AI. Fails soft to null ("no shelf").

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:8000";

export interface LocalBook {
  /** Path inside the Books folder, forward slashes. Also the id the book AI takes. */
  id: string;
  name: string;
  size: number;
}

/** The folder's books, or null when there is no local shelf (production, or the backend is down). */
export async function fetchLocalBooks(signal?: AbortSignal): Promise<LocalBook[] | null> {
  try {
    const res = await fetch(`${API_BASE}/api/learn/local-books`, { signal });
    if (!res.ok) return null;
    const json = (await res.json()) as { books?: unknown };
    if (!Array.isArray(json.books)) return null;
    return json.books.filter(
      (b): b is LocalBook =>
        !!b && typeof b === "object" && typeof (b as LocalBook).id === "string" && typeof (b as LocalBook).name === "string",
    );
  } catch {
    return null;
  }
}

/** A book's title as shown: the file name without ".pdf". */
export function bookTitle(name: string): string {
  return name.replace(/\.pdf$/i, "");
}

/**
 * Books whose title contains every word typed after "@", best first (the title
 * starts with the query, then shorter titles). For the chat's @-mention list.
 */
export function matchBooks(books: LocalBook[], query: string, limit = 8): LocalBook[] {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const hits = books.filter((b) => {
    const t = b.name.toLowerCase();
    return words.every((w) => t.includes(w));
  });
  const q = words.join(" ");
  hits.sort((a, b) => {
    const as = bookTitle(a.name).toLowerCase().startsWith(q) ? 0 : 1;
    const bs = bookTitle(b.name).toLowerCase().startsWith(q) ? 0 : 1;
    return as - bs || a.name.length - b.name.length;
  });
  return hits.slice(0, limit);
}

/** The "@word word" being typed at the caret, or null. */
export function mentionAt(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0 || (at > 0 && !/\s/.test(before[at - 1]))) return null;
  const query = before.slice(at + 1);
  if (query.length > 60 || /\n/.test(query)) return null;
  return { start: at, query };
}
