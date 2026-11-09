// Add a book: upload the marked PDF (and, optionally, the clean original),
// then walk it page by page in the browser and save every mark found.

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { closePdf, openPdf, type PdfDoc } from "../../lib/bookMarks/pdfjs";
import { scanBook, ScanCancelled, type MarkWithPicture, type ScanResult } from "../../lib/bookMarks/scan";

const NOTES_PER_SAVE = 25;
const PARALLEL_UPLOADS = 4;
/** Extra tries after a failed save, and the wait before each one. */
const RETRY_DELAYS_MS = [800, 2500];

type Phase =
  | { kind: "idle" }
  | { kind: "running"; status: string; page: number; pageCount: number; found: number }
  | { kind: "done"; result: ScanResult; bookId: Id<"learnBooks"> }
  | { kind: "stopped"; message: string; bookId: Id<"learnBooks"> }
  | { kind: "error"; message: string };

function titleFromFile(name: string): string {
  return name.replace(/\.pdf$/i, "").replace(/[_]+/g, " ").trim();
}

function errorText(err: unknown): string {
  const msg = err instanceof Error && err.message ? err.message : "Unknown error";
  return msg.trim().replace(/\.+$/, "");
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Runs a save, trying again after a short wait when it fails. Never retries a cancel. */
async function withRetry<T>(run: () => Promise<T>, signal: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    if (signal.aborted) throw new ScanCancelled();
    try {
      return await run();
    } catch (err) {
      if (attempt >= RETRY_DELAYS_MS.length || signal.aborted) throw err;
      await wait(RETRY_DELAYS_MS[attempt]);
    }
  }
}

function pageList(pages: number[]): string {
  if (pages.length <= 12) return pages.join(", ");
  return `${pages.slice(0, 12).join(", ")} and ${pages.length - 12} more`;
}

export interface BookImportProps {
  onDone: (bookId: Id<"learnBooks">) => void;
  onClose: () => void;
}

export function BookImport({ onDone, onClose }: BookImportProps) {
  const generateUploadUrl = useMutation(api.books.generateUploadUrl);
  const createBook = useMutation(api.books.createBook);
  const addNotes = useMutation(api.books.addNotes);
  const deleteBook = useMutation(api.books.deleteBook);
  const claimFile = useMutation(api.books.claimFile);
  const discardFile = useMutation(api.books.discardFile);

  const [marked, setMarked] = useState<File | null>(null);
  const [clean, setClean] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  /** Uploads a file and claims it for the signed-in user. */
  async function upload(blob: Blob, type: string, signal: AbortSignal): Promise<Id<"_storage">> {
    return withRetry(async () => {
      const url = await generateUploadUrl();
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": type }, body: blob });
      if (!res.ok) throw new Error("A file could not be saved. Check your connection and try again.");
      const json = (await res.json()) as { storageId: Id<"_storage"> };
      await claimFile({ storageId: json.storageId });
      return json.storageId;
    }, signal);
  }

  /** Best effort: removes uploads that never reached a book or a note. */
  async function discard(ids: (Id<"_storage"> | undefined)[]) {
    await Promise.all(
      ids.map((storageId) =>
        storageId ? discardFile({ storageId }).catch(() => undefined) : Promise.resolve(undefined),
      ),
    );
  }

  async function saveMarks(bookId: Id<"learnBooks">, marks: MarkWithPicture[], signal: AbortSignal) {
    const ids: (Id<"_storage"> | undefined)[] = new Array(marks.length);
    let saved = 0;
    try {
      for (let i = 0; i < marks.length; i += PARALLEL_UPLOADS) {
        const slice = marks.slice(i, i + PARALLEL_UPLOADS);
        const got = await Promise.allSettled(
          slice.map((m) => (m.picture ? upload(m.picture, "image/png", signal) : Promise.resolve(undefined))),
        );
        got.forEach((g, k) => {
          if (g.status === "fulfilled") ids[i + k] = g.value;
        });
        const failed = got.find((g): g is PromiseRejectedResult => g.status === "rejected");
        if (failed) throw failed.reason;
      }
      for (let i = 0; i < marks.length; i += NOTES_PER_SAVE) {
        const notes = marks.slice(i, i + NOTES_PER_SAVE).map((m, k) => ({
          page: m.page,
          kind: m.kind,
          method: m.method,
          rect: JSON.stringify(m.rect.map((n) => Math.round(n * 100) / 100)),
          ...(ids[i + k] ? { imageStorageId: ids[i + k] } : {}),
          ...(m.text ? { text: m.text } : {}),
        }));
        await withRetry(() => addNotes({ bookId, notes }), signal);
        saved = i + notes.length;
      }
    } catch (err) {
      // Pictures of notes that were not saved would be left with no owner.
      await discard(ids.slice(saved));
      throw err;
    }
  }

  async function start() {
    if (!marked) return;
    const ac = new AbortController();
    abortRef.current = ac;
    let bookId: Id<"learnBooks"> | null = null;
    let markedDoc: PdfDoc | null = null;
    let cleanDoc: PdfDoc | null = null;
    let page = 0;
    const status = (s: string) => setPhase({ kind: "running", status: s, page: 0, pageCount: 0, found: 0 });
    try {
      status("Opening the PDF");
      markedDoc = await openPdf({ data: new Uint8Array(await marked.arrayBuffer()) });
      if (clean) cleanDoc = await openPdf({ data: new Uint8Array(await clean.arrayBuffer()) });
      if (ac.signal.aborted) throw new ScanCancelled();

      status("Saving a private copy");
      const pdfIds: Id<"_storage">[] = [];
      try {
        pdfIds.push(await upload(marked, "application/pdf", ac.signal));
        if (clean) pdfIds.push(await upload(clean, "application/pdf", ac.signal));
        const [storageId, cleanStorageId] = pdfIds;
        const pageCount = markedDoc.numPages;
        bookId = await withRetry(
          () =>
            createBook({
              title: title.trim() || titleFromFile(marked.name),
              fileName: marked.name,
              storageId,
              ...(cleanStorageId ? { cleanStorageId } : {}),
              pageCount,
            }),
          ac.signal,
        );
      } catch (err) {
        await discard(pdfIds);
        throw err;
      }
      const savedBookId = bookId;

      const result = await scanBook({
        marked: markedDoc,
        clean: cleanDoc,
        signal: ac.signal,
        onProgress: (p) => {
          page = p.page;
          setPhase({ kind: "running", status: "Reading pages", ...p });
        },
        onPageMarks: (marks) => saveMarks(savedBookId, marks, ac.signal),
      });
      setPhase({ kind: "done", result, bookId: savedBookId });
    } catch (err) {
      const cancelled = err instanceof ScanCancelled || ac.signal.aborted;
      if (cancelled) {
        // Only an explicit Stop throws the book away.
        if (bookId) {
          try {
            await deleteBook({ bookId });
          } catch {
            // The book stays listed; the reader can delete it by hand.
          }
        }
        setPhase({ kind: "error", message: "Stopped. Nothing was saved." });
      } else if (bookId) {
        setPhase({
          kind: "stopped",
          bookId,
          message: `Stopped at page ${Math.max(1, page)}: ${errorText(err)}. The notes found so far are saved.`,
        });
      } else {
        setPhase({ kind: "error", message: `Something went wrong, so nothing was saved. ${errorText(err)}.` });
      }
    } finally {
      abortRef.current = null;
      await closePdf(markedDoc);
      await closePdf(cleanDoc);
    }
  }

  const running = phase.kind === "running";

  if (phase.kind === "stopped") {
    return (
      <div className="panel p-4 space-y-3">
        <p className="text-sm text-red-300">{phase.message}</p>
        <button type="button" className="btn-gold" onClick={() => onDone(phase.bookId)}>
          Open the notes
        </button>
      </div>
    );
  }

  if (phase.kind === "done") {
    const r = phase.result;
    return (
      <div className="panel p-4 space-y-3">
        <p className="text-sm text-white/80">
          {r.found === 0
            ? "No marks were found in this book."
            : `Found ${r.found} ${r.found === 1 ? "mark" : "marks"}.`}
        </p>
        {r.found === 0 && !clean && (
          <p className="text-sm text-white/55">
            If your app flattens marks into the page, add the book again with the clean original too.
          </p>
        )}
        {r.sizeMismatchPages.length > 0 && (
          <p className="text-sm text-white/55">
            Pages not compared because their size differs from the clean PDF: {pageList(r.sizeMismatchPages)}.
          </p>
        )}
        {r.misalignedPages.length > 0 && (
          <p className="text-sm text-white/55">
            Pages not compared because they did not line up with the clean PDF: {pageList(r.misalignedPages)}.
          </p>
        )}
        {r.missingCleanPages.length > 0 && (
          <p className="text-sm text-white/55">
            Pages the clean PDF does not have: {pageList(r.missingCleanPages)}.
          </p>
        )}
        <button type="button" className="btn-gold" onClick={() => onDone(phase.bookId)}>
          Open the notes
        </button>
      </div>
    );
  }

  return (
    <div className="panel p-4 space-y-4">
      <p className="text-sm text-white/70">Add the marked PDF. If your app flattens marks, also add the clean original.</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="panel-soft p-3 block cursor-pointer min-h-[44px]">
          <span className="label block mb-1">Marked PDF</span>
          <span className="text-sm text-white/80 break-all">{marked ? marked.name : "Choose a file"}</span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            disabled={running}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setMarked(f);
              if (f && !title) setTitle(titleFromFile(f.name));
            }}
          />
        </label>
        <label className="panel-soft p-3 block cursor-pointer min-h-[44px]">
          <span className="label block mb-1">Clean original (optional)</span>
          <span className="text-sm text-white/80 break-all">{clean ? clean.name : "Choose a file"}</span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            disabled={running}
            onChange={(e) => setClean(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      <div>
        <label className="label block mb-1" htmlFor="book-title">
          Title
        </label>
        <input
          id="book-title"
          className="field"
          value={title}
          disabled={running}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Book title"
        />
      </div>

      {running && (
        <div className="space-y-2" aria-live="polite">
          <p className="text-sm text-white/70">
            {phase.pageCount > 0
              ? `Reading page ${phase.page} of ${phase.pageCount} · ${phase.found} ${phase.found === 1 ? "mark" : "marks"} so far`
              : phase.status}
          </p>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-gold transition-[width] duration-200"
              style={{ width: phase.pageCount ? `${Math.round((phase.page / phase.pageCount) * 100)}%` : "4%" }}
            />
          </div>
          <p className="text-xs text-white/40">Keep this page open until it finishes.</p>
        </div>
      )}

      {phase.kind === "error" && <p className="text-sm text-red-300">{phase.message}</p>}

      <div className="flex flex-wrap gap-2">
        {running ? (
          <button type="button" className="btn-outline" onClick={() => abortRef.current?.abort()}>
            Stop
          </button>
        ) : (
          <>
            <button type="button" className="btn-gold" disabled={!marked} onClick={() => void start()}>
              Find my notes
            </button>
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
