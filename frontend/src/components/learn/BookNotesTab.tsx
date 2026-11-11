// Learn slice A7: Book notes. Lists the reader's books; opening one shows the
// marks found in it. Everything runs in the browser (iPad Safari or a PC).
// On the local site, a "Books folder" list also shows every PDF in the owner's
// Books folder (the local bookshelf): open any of them, or find its notes,
// without uploading the book.

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useQuery } from "convex/react";
import { askAboutBook, getAiPanelWidth, subscribeAi } from "../../lib/aiPanelStore";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { fetchLocalBooks, formatSize, localBookUrl, shelfRows, type LocalBook } from "../../lib/localBooks";
import { BookImport } from "./BookImport";
import { BookNotesList } from "./BookNotesList";
import { PdfViewer } from "./PdfViewer";

type Filter = "all" | "unsaved" | "saved";

export function BookNotesTab() {
  const books = useQuery(api.books.listBooks);
  const [adding, setAdding] = useState(false);
  const [scanning, setScanning] = useState<LocalBook | null>(null);
  const [selected, setSelected] = useState<Id<"learnBooks"> | null>(null);
  const [local, setLocal] = useState<LocalBook[] | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    void fetchLocalBooks(ac.signal).then((b) => {
      if (!ac.signal.aborted) setLocal(b);
    });
    return () => ac.abort();
  }, []);

  const book = selected ? books?.find((b) => b._id === selected) : undefined;
  if (selected && book) {
    return (
      <BookNotesList
        bookId={selected}
        title={book.title}
        localPath={book.localPath}
        onBack={() => setSelected(null)}
      />
    );
  }

  const done = (id: Id<"learnBooks">) => {
    setAdding(false);
    setScanning(null);
    setSelected(id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="mr-auto text-sm text-white/60">
          The underlines, highlights and handwriting from your marked books, each with the page it came from.
        </p>
        {!adding && !scanning && (
          <button type="button" className="btn-gold min-h-[44px]" onClick={() => setAdding(true)}>
            Add a book
          </button>
        )}
      </div>

      {adding && <BookImport onClose={() => setAdding(false)} onDone={done} />}
      {scanning && (
        <BookImport key={scanning.id} localBook={scanning} onClose={() => setScanning(null)} onDone={done} />
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
                  {b.localPath ? " · in your Books folder" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {local && local.length > 0 && books !== undefined && (
        <BooksFolder
          local={local}
          saved={books}
          busy={adding || scanning !== null}
          onOpenNotes={setSelected}
          onFindNotes={setScanning}
        />
      )}
    </div>
  );
}

interface BooksFolderProps {
  local: LocalBook[];
  saved: { _id: Id<"learnBooks">; fileName: string; localPath: string | null; noteCount: number }[];
  busy: boolean;
  onOpenNotes: (id: Id<"learnBooks">) => void;
  onFindNotes: (book: LocalBook) => void;
}

function BooksFolder({ local, saved, busy, onOpenNotes, onFindNotes }: BooksFolderProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [viewing, setViewing] = useState<LocalBook | null>(null);
  const panelWidth = useSyncExternalStore(subscribeAi, getAiPanelWidth);

  const rows = useMemo(() => shelfRows(local, saved), [local, saved]);
  const savedCount = rows.filter((r) => r.saved).length;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (filter === "all" || (filter === "saved") === (r.saved !== null)) &&
        (!q || r.book.name.toLowerCase().includes(q)),
    );
  }, [rows, query, filter]);

  return (
    <section className="space-y-3 pt-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-display text-lg text-gold">Books folder</h2>
        <p className="text-sm text-white/55">
          {local.length} {local.length === 1 ? "book" : "books"} on this computer · {savedCount} in your notes ·{" "}
          {local.length - savedCount} not yet
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          className="field max-w-sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title"
          aria-label="Search the Books folder"
        />
        <div className="flex gap-1" role="group" aria-label="Show">
          {(
            [
              ["all", "All"],
              ["unsaved", "Not in notes"],
              ["saved", "In notes"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={filter === k}
              onClick={() => setFilter(k)}
              className={`min-h-[40px] rounded-sm border px-3 text-sm transition-colors ${
                filter === k ? "border-gold/60 text-gold bg-gold/10" : "border-white/15 text-white/60 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-white/55">No books match.</p>
      ) : (
        <ul className="divide-y divide-white/5 rounded-sm border border-white/10">
          {shown.map(({ book, saved: s }) => (
            <li key={book.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <div className="mr-auto min-w-0 flex-1">
                <p className="truncate text-sm text-white/85" title={book.id}>
                  {book.name.replace(/\.pdf$/i, "")}
                </p>
                <p className="text-xs text-white/40">
                  {formatSize(book.size)}
                  {s ? ` · ${s.noteCount} ${s.noteCount === 1 ? "note" : "notes"}` : " · not in your notes yet"}
                </p>
              </div>
              <button type="button" className="btn-ghost min-h-[40px]" onClick={() => setViewing(book)}>
                Open
              </button>
              {s ? (
                <button type="button" className="btn-outline min-h-[40px]" onClick={() => onOpenNotes(s._id as Id<"learnBooks">)}>
                  Notes
                </button>
              ) : (
                <button type="button" className="btn-outline min-h-[40px]" disabled={busy} onClick={() => onFindNotes(book)}>
                  Find my notes
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {viewing && (
        <PdfViewer
          url={localBookUrl(viewing.id)}
          title={viewing.name.replace(/\.pdf$/i, "")}
          initialPage={1}
          onClose={() => setViewing(null)}
          onAsk={(page) => askAboutBook({ id: viewing.id, name: viewing.name }, page)}
          rightInset={panelWidth}
        />
      )}
    </section>
  );
}
