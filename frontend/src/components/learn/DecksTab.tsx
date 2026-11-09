// The Decks tab (Learn slice A4): list, create, rename, delete and import decks,
// open a deck to manage its cards, and make a deck with AI.
// Renders <AiDeckGenerator /> (owned by another slice) in the "Make a deck with AI" panel.

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ChevronDown, FileUp, GraduationCap, Layers, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { cn } from "../../lib/cn";
import { AiDeckGenerator } from "./AiDeckGenerator";
import { countText } from "../../lib/learnApi";
import { DeckDetail } from "./DeckDetail";
import { ImportPanel } from "./ImportPanel";
import { setStudyDeck } from "./StudyDeckChoice";

export interface DecksTabProps {
  /** Switch to the Study tab (e.g. after choosing a deck to study). */
  onStudy: () => void;
}

const DELETE_ARM_MS = 3000;
const SOURCE_LABEL: Record<Doc<"learnDecks">["source"], string> = {
  import: "Imported",
  ai: "Made with AI",
  manual: "Made by you",
};

export function DecksTab({ onStudy }: DecksTabProps) {
  const decks = useQuery(api.learn.listDecks);
  const createDeck = useMutation(api.learn.createDeckWithCards);
  const [openDeck, setOpenDeck] = useState<Id<"learnDecks"> | null>(null);
  const [panel, setPanel] = useState<"none" | "new" | "import">("none");
  const [aiOpen, setAiOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const study = (deckId: Id<"learnDecks"> | null) => {
    setStudyDeck(deckId);
    onStudy();
  };

  if (openDeck) {
    return <DeckDetail deckId={openDeck} onBack={() => setOpenDeck(null)} onStudy={() => study(openDeck)} />;
  }

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const id = await createDeck({ name, source: "manual", cards: [] });
      setNewName("");
      setPanel("none");
      setOpenDeck(id);
    } catch {
      toast.error("Could not create the deck");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-outline min-h-[44px]"
          onClick={() => setPanel((p) => (p === "new" ? "none" : "new"))}
        >
          <Plus className="w-4 h-4" /> New deck
        </button>
        <button
          type="button"
          className="btn-outline min-h-[44px]"
          onClick={() => setPanel((p) => (p === "import" ? "none" : "import"))}
        >
          <FileUp className="w-4 h-4" /> Import
        </button>
      </div>

      {panel === "new" && (
        <form
          className="panel-soft p-3 flex flex-col sm:flex-row gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreate();
          }}
        >
          <input
            className="field flex-1"
            autoFocus
            maxLength={200}
            placeholder="Deck name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button type="submit" className="btn-gold min-h-[44px]" disabled={!newName.trim()}>
            Create
          </button>
        </form>
      )}

      {panel === "import" && (
        <ImportPanel
          onClose={() => setPanel("none")}
          onImported={(id) => {
            setPanel("none");
            setOpenDeck(id);
          }}
        />
      )}

      <section className="panel-soft">
        <button
          type="button"
          aria-expanded={aiOpen}
          onClick={() => setAiOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 min-h-[44px] text-left"
        >
          <span className="inline-flex items-center gap-2 text-sm font-medium text-white">
            <Sparkles className="w-4 h-4 text-gold" /> Make a deck with AI
          </span>
          <ChevronDown className={cn("w-4 h-4 text-white/45 transition-transform", aiOpen && "rotate-180")} />
        </button>
        {aiOpen && (
          <div className="px-4 pb-4">
            <AiDeckGenerator onCreated={(id) => setOpenDeck(id)} />
          </div>
        )}
      </section>

      <section className="space-y-2" aria-label="Your decks">
        <p className="label">Your decks</p>

        {decks === undefined && (
          <div className="space-y-2" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 panel-soft shimmer" />
            ))}
          </div>
        )}

        {decks !== undefined && decks.length === 0 && (
          <div className="panel-soft py-10 text-center">
            <Layers className="w-8 h-8 mx-auto text-white/15 mb-3" strokeWidth={1.5} />
            <p className="text-sm text-white/45">No decks yet. Create one, import a file, or make one with AI.</p>
          </div>
        )}

        {decks?.map((deck) => (
          <DeckRow key={deck._id} deck={deck} onOpen={() => setOpenDeck(deck._id)} onStudy={() => study(deck._id)} />
        ))}
      </section>
    </div>
  );
}

function DeckRow({ deck, onOpen, onStudy }: { deck: Doc<"learnDecks">; onOpen: () => void; onStudy: () => void }) {
  const stats = useQuery(api.learn.deckStats, { deckId: deck._id });
  const renameDeck = useMutation(api.learn.renameDeck);
  const deleteDeck = useMutation(api.learn.deleteDeck);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(deck.name);
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    if (!renaming) setDraft(deck.name);
  }, [deck.name, renaming]);

  const commitRename = async () => {
    setRenaming(false);
    const name = draft.trim();
    if (!name || name === deck.name) {
      setDraft(deck.name);
      return;
    }
    try {
      await renameDeck({ deckId: deck._id, name });
    } catch {
      toast.error("Could not rename the deck");
      setDraft(deck.name);
    }
  };

  const handleDelete = async () => {
    if (!armed) {
      setArmed(true);
      timer.current = window.setTimeout(() => setArmed(false), DELETE_ARM_MS);
      return;
    }
    try {
      await deleteDeck({ deckId: deck._id });
      toast.success(`Deleted "${deck.name}"`);
    } catch {
      toast.error("Could not delete the deck");
    }
  };

  return (
    <div className="panel-soft p-3 flex flex-wrap sm:flex-nowrap items-center gap-3">
      <div className="min-w-0 flex-1">
        {renaming ? (
          <input
            className="field py-2"
            autoFocus
            maxLength={200}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void commitRename()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitRename();
              if (e.key === "Escape") {
                setDraft(deck.name);
                setRenaming(false);
              }
            }}
          />
        ) : (
          <button type="button" onClick={onOpen} className="text-left w-full min-h-[44px]">
            <span className="block text-white font-medium break-words hover:text-gold transition-colors">{deck.name}</span>
            <span className="block text-xs text-white/45 mt-0.5">
              {stats ? `${countText(stats.cards, stats.cardsCapped)} cards · ` : ""}
              {stats && stats.due > 0 ? (
                <span className="text-gold">{countText(stats.due, stats.dueCapped)} due</span>
              ) : stats ? (
                "nothing due"
              ) : (
                ""
              )}
              {` · ${SOURCE_LABEL[deck.source]}`}
            </span>
          </button>
        )}
      </div>
      <div className="flex items-center shrink-0">
        <button
          type="button"
          className="btn-ghost min-h-[44px]"
          onClick={onStudy}
          disabled={!stats || stats.cards === 0}
        >
          <GraduationCap className="w-4 h-4" /> Study
        </button>
        <button
          type="button"
          className="btn-ghost min-h-[44px] min-w-[44px]"
          aria-label="Rename deck"
          onClick={() => setRenaming(true)}
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          type="button"
          className={cn("btn-ghost min-h-[44px] min-w-[44px]", armed && "text-loss hover:text-loss")}
          aria-label={armed ? "Tap again to delete the deck and its cards" : "Delete deck"}
          onClick={() => void handleDelete()}
        >
          <Trash2 className="w-4 h-4" />
          {armed && <span className="text-xs">Delete?</span>}
        </button>
      </div>
    </div>
  );
}
