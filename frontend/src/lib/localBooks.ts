// Local bookshelf: the PDFs in the owner's Books folder, served by the LOCAL
// backend only (GET /api/learn/local-books; production answers 404). The live
// site keeps the upload flow, so every function here fails soft to "no shelf".

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:8000";

export interface LocalBook {
  /** Path inside the Books folder, forward slashes. Also the key the backend takes. */
  id: string;
  name: string;
  size: number;
}

/** A Convex book, as listBooks returns it (only the fields matching needs). */
export interface ShelfBookRef {
  _id: string;
  fileName: string;
  localPath: string | null;
  noteCount: number;
}

export interface ShelfRow {
  book: LocalBook;
  /** The Convex book for this PDF, when it was scanned or uploaded before. */
  saved: ShelfBookRef | null;
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

export function localBookUrl(id: string): string {
  return `${API_BASE}/api/learn/local-books/file?id=${encodeURIComponent(id)}`;
}

/**
 * Pairs each folder book with the Convex book made from it. A shelf book is
 * matched by its path; a book uploaded earlier is matched by its file name
 * (case-insensitive), so a PDF imported by hand also counts as saved.
 */
export function shelfRows(local: LocalBook[], saved: ShelfBookRef[]): ShelfRow[] {
  const byPath = new Map<string, ShelfBookRef>();
  const byName = new Map<string, ShelfBookRef>();
  for (const b of saved) {
    if (b.localPath) byPath.set(b.localPath, b);
    else if (!byName.has(b.fileName.toLowerCase())) byName.set(b.fileName.toLowerCase(), b);
  }
  return local.map((book) => ({
    book,
    saved: byPath.get(book.id) ?? byName.get(book.name.toLowerCase()) ?? null,
  }));
}

export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
