// One deck's cards: add, edit and delete (Learn slice A4).

import { useEffect, useRef, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { ArrowLeft, GraduationCap, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { countText } from "../../lib/learnApi";
import { formatWait } from "../../lib/learnSchedule";

const PAGE = 50;
const DELETE_ARM_MS = 3000;

interface DeckDetailProps {
  deckId: Id<"learnDecks">;
  onBack: () => void;
  onStudy: () => void;
}

export function DeckDetail({ deckId, onBack, onStudy }: DeckDetailProps) {
  const deck = useQuery(api.learn.getDeck, { deckId });
  const stats = useQuery(api.learn.deckStats, { deckId });
  const { results, status, loadMore } = usePaginatedQuery(api.learn.deckCards, { deckId }, { initialNumItems: PAGE });
  const [adding, setAdding] = useState(false);

  if (deck === null) {
    return (
      <div className="space-y-3">
        <BackButton onBack={onBack} />
        <p className="text-sm text-white/55">This deck no longer exists.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <BackButton onBack={onBack} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-semibold text-white break-words">{deck?.name ?? " "}</h2>
          {stats && (
            <p className="text-sm text-white/55 mt-1">
              {countText(stats.cards, stats.cardsCapped)} {stats.cards === 1 && !stats.cardsCapped ? "card" : "cards"} ·{countText(stats.due, stats.dueCapped)} due
              {stats.new !== null && ` · ${stats.new.toLocaleString()} new`}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-outline min-h-[44px]" onClick={() => setAdding((a) => !a)}>
            <Plus className="w-4 h-4" /> Add card
          </button>
          <button type="button" className="btn-gold min-h-[44px]" onClick={onStudy} disabled={!stats || stats.cards === 0}>
            <GraduationCap className="w-4 h-4" /> Study
          </button>
        </div>
      </div>

      {adding && <CardForm deckId={deckId} onDone={() => setAdding(false)} />}

      {status === "LoadingFirstPage" && (
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 panel-soft shimmer" />
          ))}
        </div>
      )}

      {status !== "LoadingFirstPage" && results.length === 0 && (
        <p className="text-sm text-white/45 py-6 text-center">No cards yet. Add one above.</p>
      )}

      <ul className="space-y-2">
        {results.map((card) => (
          <CardRow key={card._id} card={card} />
        ))}
      </ul>

      {status === "CanLoadMore" && (
        <button type="button" className="btn-ghost min-h-[44px] w-full" onClick={() => loadMore(PAGE)}>
          Show more cards
        </button>
      )}
      {status === "LoadingMore" && <p className="text-xs text-white/40 text-center">Loading...</p>}
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="btn-ghost min-h-[44px] -ml-3" onClick={onBack}>
      <ArrowLeft className="w-4 h-4" /> All decks
    </button>
  );
}

function parseTags(s: string): string[] {
  return s.split(/\s+/).filter(Boolean);
}

/** Add a card (no `card`) or edit one. */
function CardForm({
  deckId,
  card,
  onDone,
}: {
  deckId: Id<"learnDecks">;
  card?: Doc<"learnCards">;
  onDone: () => void;
}) {
  const addCard = useMutation(api.learn.addCard);
  const updateCard = useMutation(api.learn.updateCard);
  const [front, setFront] = useState(card?.front ?? "");
  const [back, setBack] = useState(card?.back ?? "");
  const [tags, setTags] = useState(card?.tags?.join(" ") ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!front.trim() && !back.trim()) return;
    setSaving(true);
    try {
      if (card) {
        await updateCard({ cardId: card._id, front, back, tags: parseTags(tags) });
        onDone();
      } else {
        await addCard({ deckId, front, back, tags: parseTags(tags) });
        setFront("");
        setBack("");
        toast.success("Card added");
      }
    } catch {
      toast.error("Could not save the card");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="panel-soft p-3 space-y-3">
      <label className="block space-y-1.5">
        <span className="label">Front</span>
        <textarea className="textarea" rows={2} value={front} onChange={(e) => setFront(e.target.value)} />
      </label>
      <label className="block space-y-1.5">
        <span className="label">Back</span>
        <textarea className="textarea" rows={3} value={back} onChange={(e) => setBack(e.target.value)} />
      </label>
      <label className="block space-y-1.5">
        <span className="label">Tags (separated by spaces)</span>
        <input className="field" value={tags} onChange={(e) => setTags(e.target.value)} />
      </label>
      <div className="flex gap-2 justify-end">
        <button type="button" className="btn-ghost min-h-[44px]" onClick={onDone}>
          {card ? "Cancel" : "Close"}
        </button>
        <button
          type="button"
          className="btn-gold min-h-[44px]"
          disabled={saving || (!front.trim() && !back.trim())}
          onClick={() => void submit()}
        >
          {card ? "Save" : "Add card"}
        </button>
      </div>
    </div>
  );
}

function CardRow({ card }: { card: Doc<"learnCards"> }) {
  const deleteCard = useMutation(api.learn.deleteCard);
  const [editing, setEditing] = useState(false);
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const handleDelete = async () => {
    if (!armed) {
      setArmed(true);
      timer.current = window.setTimeout(() => setArmed(false), DELETE_ARM_MS);
      return;
    }
    try {
      await deleteCard({ cardId: card._id });
    } catch {
      toast.error("Could not delete the card");
    }
  };

  if (editing) {
    return (
      <li>
        <CardForm deckId={card.deckId} card={card} onDone={() => setEditing(false)} />
      </li>
    );
  }

  const wait = formatWait(card.due);
  return (
    <li className="panel-soft p-3 flex gap-3 items-start">
      <div className="min-w-0 flex-1 grid gap-2 md:grid-cols-2">
        <p className="text-sm text-white/90 whitespace-pre-wrap break-words line-clamp-4">{card.front}</p>
        <p className="text-sm text-white/55 whitespace-pre-wrap break-words line-clamp-4">{card.back}</p>
        <p className="text-[0.7rem] text-white/35 md:col-span-2">
          {card.srs ? (wait === "now" ? "Due now" : `Due in ${wait}`) : "New"}
          {card.tags && card.tags.length > 0 && ` · ${card.tags.join(" ")}`}
        </p>
      </div>
      <div className="flex shrink-0">
        <button type="button" className="btn-ghost min-h-[44px] min-w-[44px]" aria-label="Edit card" onClick={() => setEditing(true)}>
          <Pencil className="w-4 h-4" />
        </button>
        <button
          type="button"
          className={armed ? "btn-ghost min-h-[44px] text-loss hover:text-loss" : "btn-ghost min-h-[44px] min-w-[44px]"}
          aria-label={armed ? "Tap again to delete" : "Delete card"}
          onClick={() => void handleDelete()}
        >
          <Trash2 className="w-4 h-4" />
          {armed && <span className="text-xs">Delete?</span>}
        </button>
      </div>
    </li>
  );
}
