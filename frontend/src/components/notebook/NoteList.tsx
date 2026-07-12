import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { NotebookPen, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "../../lib/cn";

const DELETE_ARM_MS = 3000;

interface NoteListProps {
  onOpenNote: (id: Id<"notes">) => void;
}

export function NoteList({ onOpenNote }: NoteListProps) {
  const notes = useQuery(api.notes.listNotes);
  const createNote = useMutation(api.notes.createNote);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const id = await createNote({});
      onOpenNote(id);
    } catch {
      toast.error("Could not create note");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3">
      <div className="flex items-center justify-between px-1 mb-3">
        <p className="label">Notes</p>
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={creating}
          className="inline-flex items-center gap-1.5 text-xs text-gold hover:text-gold-soft transition-colors disabled:opacity-40"
        >
          <Plus className="w-3.5 h-3.5" />
          New note
        </button>
      </div>

      {notes === undefined && (
        <div className="space-y-2 px-1" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 panel-soft animate-pulse" />
          ))}
        </div>
      )}

      {notes !== undefined && notes.length === 0 && (
        <div className="px-1 py-10 text-center">
          <NotebookPen className="w-8 h-8 mx-auto text-white/15 mb-3" strokeWidth={1.5} />
          <p className="text-sm text-white/45 mb-4">No notes yet</p>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating}
            className="btn-gold text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            Create your first note
          </button>
        </div>
      )}

      {notes !== undefined && notes.length > 0 && (
        <div className="space-y-1">
          {notes.map((note) => (
            <NoteRow key={note._id} note={note} onOpen={() => onOpenNote(note._id)} />
          ))}
        </div>
      )}
    </div>
  );
}

interface NoteRowProps {
  note: { _id: Id<"notes">; title: string; updatedAt: number };
  onOpen: () => void;
}

function NoteRow({ note, onOpen }: NoteRowProps) {
  const renameNote = useMutation(api.notes.renameNote);
  const deleteNote = useMutation(api.notes.deleteNote);
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(note.title);
  const [armedDelete, setArmedDelete] = useState(false);
  const armTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (armTimer.current) window.clearTimeout(armTimer.current);
    };
  }, []);

  // Keep the draft in sync with server renames (e.g. from the open editor)
  // while the row isn't being edited.
  useEffect(() => {
    if (!renaming) setDraftTitle(note.title);
  }, [note.title, renaming]);

  const commitRename = async () => {
    setRenaming(false);
    const title = draftTitle.trim() || "Untitled";
    if (title === note.title) return;
    try {
      await renameNote({ noteId: note._id, title });
    } catch {
      toast.error("Could not rename note");
      setDraftTitle(note.title);
    }
  };

  const handleDelete = async () => {
    if (!armedDelete) {
      setArmedDelete(true);
      armTimer.current = window.setTimeout(() => setArmedDelete(false), DELETE_ARM_MS);
      return;
    }
    if (armTimer.current) window.clearTimeout(armTimer.current);
    try {
      await deleteNote({ noteId: note._id });
      toast.success("Note deleted");
    } catch {
      toast.error("Could not delete note");
    }
  };

  if (renaming) {
    return (
      <div className="px-3 py-2 panel-soft">
        <input
          autoFocus
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onBlur={() => void commitRename()}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commitRename();
            if (e.key === "Escape") {
              setDraftTitle(note.title);
              setRenaming(false);
            }
          }}
          className="w-full bg-transparent border-0 outline-none text-sm text-white placeholder-white/25"
          placeholder="Note title"
          aria-label="Rename note"
        />
      </div>
    );
  }

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onOpen}
        className="w-full text-left px-3 py-2.5 rounded-sm hover:bg-white/[0.03] transition-colors"
      >
        <span className="block text-sm text-white/80 font-medium truncate pr-14 group-hover:text-white">
          {note.title}
        </span>
        <span className="block font-mono text-[0.65rem] text-white/35 mt-0.5">
          {relativeTime(note.updatedAt)}
        </span>
      </button>
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => {
            setDraftTitle(note.title);
            setRenaming(true);
          }}
          title="Rename note"
          aria-label="Rename note"
          className="p-1.5 rounded-sm text-white/40 hover:text-gold transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => void handleDelete()}
          title={armedDelete ? "Click again to delete" : "Delete note"}
          aria-label={armedDelete ? "Confirm delete" : "Delete note"}
          className={cn(
            "p-1.5 rounded-sm transition-colors",
            armedDelete ? "text-loss bg-loss/10" : "text-white/40 hover:text-loss",
          )}
        >
          {armedDelete ? <span className="text-[0.65rem] font-mono px-0.5">Sure?</span> : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
