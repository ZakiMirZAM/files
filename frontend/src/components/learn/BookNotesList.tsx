// One book's notes: a picture of each mark, its kind and page, filterable by
// kind. Tapping a page number opens the book at that page.

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { MARK_KIND_LABEL, MARK_KINDS, normRect, type MarkKind, type Rect } from "../../lib/bookMarks/types";
import { PdfViewer } from "./PdfViewer";

export interface BookNotesListProps {
  bookId: Id<"learnBooks">;
  title: string;
  onBack: () => void;
}

function parseRect(s: string | undefined): Rect | null {
  if (!s) return null;
  try {
    const r = JSON.parse(s) as unknown;
    return Array.isArray(r) && r.length === 4 && r.every((n) => typeof n === "number") ? normRect(r) : null;
  } catch {
    return null;
  }
}

export function BookNotesList({ bookId, title, onBack }: BookNotesListProps) {
  const notes = useQuery(api.books.bookNotes, { bookId });
  const deleteBook = useMutation(api.books.deleteBook);
  const [kind, setKind] = useState<MarkKind | "all">("all");
  const [open, setOpen] = useState<{ page: number; rect: Rect | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const fileUrl = useQuery(api.books.bookFileUrl, open ? { bookId } : "skip");

  const counts = useMemo(() => {
    const c: Partial<Record<MarkKind, number>> = {};
    for (const n of notes ?? []) c[n.kind] = (c[n.kind] ?? 0) + 1;
    return c;
  }, [notes]);
  const shown = useMemo(() => (notes ?? []).filter((n) => kind === "all" || n.kind === kind), [notes, kind]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost min-h-[44px]" onClick={onBack}>
          ‹ All books
        </button>
        <h2 className="mr-auto min-w-0 truncate font-display text-xl text-gold">{title}</h2>
        <button type="button" className="btn-outline min-h-[44px]" onClick={() => setOpen({ page: 1, rect: null })}>
          Open the book
        </button>
        {confirmDelete ? (
          <span className="flex items-center gap-1">
            <button
              type="button"
              className="btn-outline min-h-[44px] border-red-400/40 text-red-300"
              disabled={deleting}
              onClick={() => {
                setDeleteError(null);
                setDeleting(true);
                deleteBook({ bookId })
                  .then(onBack)
                  .catch(() => {
                    setDeleting(false);
                    setDeleteError("The book could not be deleted. Check your connection and try again.");
                  });
              }}
            >
              Delete book and notes
            </button>
            <button type="button" className="btn-ghost min-h-[44px]" onClick={() => setConfirmDelete(false)}>
              Keep
            </button>
          </span>
        ) : (
          <button type="button" className="btn-ghost min-h-[44px]" onClick={() => setConfirmDelete(true)}>
            Delete
          </button>
        )}
      </div>

      {deleteError && (
        <p className="text-sm text-red-300" role="alert">
          {deleteError}
        </p>
      )}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by kind">
        {(["all", ...MARK_KINDS] as const).map((k) => {
          const n = k === "all" ? notes?.length ?? 0 : counts[k] ?? 0;
          if (k !== "all" && n === 0) return null;
          const active = kind === k;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={active}
              onClick={() => setKind(k)}
              className={`min-h-[40px] rounded-sm border px-3 text-sm transition-colors ${
                active ? "border-gold/60 text-gold bg-gold/10" : "border-white/15 text-white/60 hover:text-white"
              }`}
            >
              {k === "all" ? "All" : MARK_KIND_LABEL[k]} <span className="text-white/40">{n}</span>
            </button>
          );
        })}
      </div>

      {notes === undefined ? (
        <p className="text-sm text-white/55">Loading notes…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-white/55">No notes here.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((n) => (
            <li key={n._id} className="panel-soft flex flex-col overflow-hidden">
              {n.imageUrl ? (
                <button
                  type="button"
                  className="block bg-white"
                  onClick={() => setOpen({ page: n.page, rect: parseRect(n.rect) })}
                  aria-label={`Open page ${n.page}`}
                >
                  <img src={n.imageUrl} alt={`${MARK_KIND_LABEL[n.kind]} on page ${n.page}`} loading="lazy" className="mx-auto max-h-56 w-auto object-contain" />
                </button>
              ) : null}
              <div className="flex items-center gap-2 px-3 py-2">
                <span className="text-sm text-white/80">{MARK_KIND_LABEL[n.kind]}</span>
                <button
                  type="button"
                  className="ml-auto min-h-[40px] px-2 text-sm text-gold underline underline-offset-2 decoration-gold/50"
                  onClick={() => setOpen({ page: n.page, rect: parseRect(n.rect) })}
                >
                  Page {n.page}
                </button>
              </div>
              {n.text && <p className="px-3 pb-3 text-sm text-white/65 line-clamp-4 whitespace-pre-line">{n.text}</p>}
            </li>
          ))}
        </ul>
      )}

      {open && (
        <PdfViewer
          url={fileUrl}
          title={title}
          initialPage={open.page}
          focusRect={open.rect}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
