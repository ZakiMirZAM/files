// Learn slice A7: Book notes. Lists the reader's books; opening one shows the
// marks found in it. Everything runs in the browser (iPad Safari or a PC).

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { BookImport } from "./BookImport";
import { BookNotesList } from "./BookNotesList";

export function BookNotesTab() {
  const books = useQuery(api.books.listBooks);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Id<"learnBooks"> | null>(null);

  const book = selected ? books?.find((b) => b._id === selected) : undefined;
  if (selected && book) {
    return <BookNotesList bookId={selected} title={book.title} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="mr-auto text-sm text-white/60">
          The underlines, highlights and handwriting from your marked books, each with the page it came from.
        </p>
        {!adding && (
          <button type="button" className="btn-gold min-h-[44px]" onClick={() => setAdding(true)}>
            Add a book
          </button>
        )}
      </div>

      {adding && (
        <BookImport
          onClose={() => setAdding(false)}
          onDone={(id) => {
            setAdding(false);
            setSelected(id);
          }}
        />
      )}

      {books === undefined ? (
        <p className="text-sm text-white/55">Loading books…</p>
      ) : books.length === 0 ? (
        !adding && <p className="text-sm text-white/55">No books yet.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {books.map((b) => (
            <li key={b._id}>
              <button
                type="button"
                className="panel-soft w-full min-h-[44px] p-4 text-left transition-colors hover:border-gold/40"
                onClick={() => setSelected(b._id)}
              >
                <span className="block truncate text-white/90">{b.title}</span>
                <span className="mt-1 block text-xs text-white/45">
                  {b.noteCount} {b.noteCount === 1 ? "note" : "notes"} · {b.pageCount} pages
                  {b.hasClean ? " · compared with the clean original" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
