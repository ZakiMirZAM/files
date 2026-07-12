import { EditorContent, useEditor } from "@tiptap/react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Check, ChevronLeft, CircleDashed, FileDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "../../lib/cn";
import { buildNotebookExtensions } from "./extensions";
import { exportNoteToPdf } from "./exportNotePdf";
import { NoteToolbar } from "./NoteToolbar";
import { useDebouncedSave, type SaveStatus } from "./useDebouncedSave";
import { useImageUpload } from "./useImageUpload";

const TITLE_SAVE_DELAY_MS = 800;

interface NoteEditorProps {
  noteId: Id<"notes">;
  /** Also invoked when the note turns out to be deleted/stale. */
  onBack: () => void;
}

// Parent renders this with key={noteId}: every note gets a fresh editor and
// unmount flushes any pending autosave before the next note hydrates.
export function NoteEditor({ noteId, onBack }: NoteEditorProps) {
  const note = useQuery(api.notes.getNote, { noteId });
  const updateNote = useMutation(api.notes.updateNote);
  const renameNote = useMutation(api.notes.renameNote);
  const getImageBase64 = useAction(api.notes.getImageBase64);

  const [title, setTitle] = useState("");
  const [exporting, setExporting] = useState(false);
  const initializedRef = useRef(false);
  const titleTimer = useRef<number | null>(null);
  const pendingTitleRef = useRef<string | null>(null);

  const { editorRef, handlePaste, handleDrop } = useImageUpload();

  const editor = useEditor({
    extensions: buildNotebookExtensions(),
    content: "",
    editorProps: {
      attributes: {
        class: "tiptap-editor notebook-editor min-h-[280px] focus:outline-none px-1 py-2",
      },
      handlePaste,
      handleDrop,
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor, editorRef]);

  // Hydrate from server once
  useEffect(() => {
    if (initializedRef.current || !note || !editor) return;
    try {
      editor.commands.setContent(JSON.parse(note.content));
    } catch {
      editor.commands.setContent(note.content);
    }
    setTitle(note.title);
    initializedRef.current = true;
  }, [note, editor]);

  // Stale localStorage id / deleted in another tab → back to the list
  useEffect(() => {
    if (note === null) onBack();
  }, [note, onBack]);

  const status = useDebouncedSave(editor, async (json) => {
    await updateNote({ noteId, content: json });
  });

  const onTitleChange = (value: string) => {
    setTitle(value);
    if (!initializedRef.current) return;
    pendingTitleRef.current = value;
    if (titleTimer.current) window.clearTimeout(titleTimer.current);
    titleTimer.current = window.setTimeout(() => {
      const pending = pendingTitleRef.current;
      pendingTitleRef.current = null;
      if (pending === null) return;
      void renameNote({ noteId, title: pending.trim() || "Untitled" }).catch(() =>
        toast.error("Could not rename note"),
      );
    }, TITLE_SAVE_DELAY_MS);
  };

  // Flush a pending title rename on unmount (note switch / panel close)
  useEffect(() => {
    return () => {
      if (titleTimer.current) window.clearTimeout(titleTimer.current);
      const pending = pendingTitleRef.current;
      pendingTitleRef.current = null;
      if (pending !== null) {
        void renameNote({ noteId, title: pending.trim() || "Untitled" }).catch(() => undefined);
      }
    };
  }, [noteId, renameNote]);

  const handleExport = async () => {
    if (!editor || exporting) return;
    setExporting(true);
    const toastId = toast.loading("Generating PDF…");
    try {
      await exportNoteToPdf(title.trim() || "Untitled", editor.getHTML(), {
        resolveImage: async (storageId) => {
          const { mime, base64 } = await getImageBase64({
            storageId: storageId as Id<"_storage">,
          });
          return `data:${mime};base64,${base64}`;
        },
      });
      toast.success("PDF downloaded", { id: toastId });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "PDF export failed";
      toast.error(message, { id: toastId });
    } finally {
      setExporting(false);
    }
  };

  // undefined = loading; null = deleted/stale (the effect above fires onBack())
  if (note === undefined || note === null) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/30">
        <CircleDashed className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-3 pt-3 pb-2 flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="p-1 rounded-sm text-white/50 hover:text-white transition-colors shrink-0"
          aria-label="Back to notes"
          title="Back to notes"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Untitled"
          aria-label="Note title"
          className="flex-1 min-w-0 bg-transparent border-0 outline-none font-display text-lg font-semibold text-white placeholder-white/20"
        />
        <SaveBadge status={status} />
        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={exporting}
          className={cn(
            "p-1.5 rounded-sm text-white/50 hover:text-gold transition-colors shrink-0",
            exporting && "opacity-40 pointer-events-none",
          )}
          aria-label="Export as PDF"
          title="Export as PDF"
        >
          <FileDown className="w-4 h-4" strokeWidth={1.75} />
        </button>
      </div>

      <div className="px-3 shrink-0">{editor && <NoteToolbar editor={editor} />}</div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
        <EditorContent editor={editor} />
      </div>

      <div className="px-4 py-2 border-t border-gold/10 shrink-0">
        <span className="font-mono text-[0.65rem] text-white/30">
          Last saved {new Date(note.updatedAt).toLocaleString()}
        </span>
      </div>
    </div>
  );
}

function SaveBadge({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;
  return (
    <span className="text-[0.65rem] font-mono inline-flex items-center gap-1 text-white/45 shrink-0">
      {status === "saving" && (
        <>
          <CircleDashed className="w-3 h-3 animate-spin" />
          Saving
        </>
      )}
      {status === "saved" && (
        <>
          <Check className="w-3 h-3 text-gain-strong" />
          Saved
        </>
      )}
      {status === "error" && <span className="text-loss">Save failed</span>}
    </span>
  );
}
