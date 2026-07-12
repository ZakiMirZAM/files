import { useState } from "react";
import { NotebookPen, X } from "lucide-react";
import { cn } from "../../lib/cn";
import type { Id } from "../../../convex/_generated/dataModel";
import { NoteEditor } from "./NoteEditor";
import { NoteList } from "./NoteList";
import { loadActiveNoteId, saveActiveNoteId } from "./notebookStorage";

interface NotebookPanelProps {
  open: boolean;
  onClose: () => void;
}

// Right-side notebook. Mobile/tablet: fixed overlay sliding in from the right.
// Desktop (lg+): in-flow sticky flex column that pushes content, animating
// width 0 ↔ 400px — mirrors the left sidebar's collapse pattern. Kept mounted
// while closed (inert) so editor state and pending autosaves survive toggling.
export function NotebookPanel({ open, onClose }: NotebookPanelProps) {
  const [activeNoteId, setActiveNoteId] = useState<Id<"notes"> | null>(
    () => loadActiveNoteId() as Id<"notes"> | null,
  );

  const openNote = (id: Id<"notes"> | null) => {
    setActiveNoteId(id);
    saveActiveNoteId(id);
  };

  return (
    <>
      {open && (
        <button
          aria-label="Close notebook"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        />
      )}
      <aside
        inert={!open}
        aria-label="Notebook"
        className={cn(
          "notebook-panel bg-ink-900/95 backdrop-blur-md",
          // mobile/tablet: fixed overlay sliding from the right
          "fixed inset-y-0 right-0 z-50 w-full sm:w-[420px]",
          "transform transition-[width,transform] duration-300",
          open ? "translate-x-0" : "translate-x-full",
          // desktop: in-flow sticky column, width animation
          "lg:sticky lg:top-0 lg:h-screen lg:self-start lg:z-auto",
          "lg:transform-none lg:overflow-clip",
          open ? "lg:w-[400px]" : "lg:w-0",
        )}
      >
        <div className="h-full w-full sm:w-[420px] lg:w-[400px] flex flex-col border-l border-gold/10">
          <div className="px-4 py-3.5 flex items-center justify-between border-b border-gold/10 shrink-0">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-white/80">
              <NotebookPen className="w-4 h-4 text-gold" strokeWidth={1.75} />
              Notebook
            </span>
            <button
              type="button"
              onClick={onClose}
              className="text-white/50 hover:text-white transition-colors"
              aria-label="Close notebook"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {activeNoteId ? (
            <NoteEditor key={activeNoteId} noteId={activeNoteId} onBack={() => openNote(null)} />
          ) : (
            <NoteList onOpenNote={openNote} />
          )}
        </div>
      </aside>
    </>
  );
}
