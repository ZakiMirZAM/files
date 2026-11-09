// A4 AI-made decks: the user types a request and a card count; the AI builds the
// cards (the book library first, then the web) in batches; the user previews them
// and saves them as a new deck through api.learn.createDeckWithCards, then
// api.learn.appendCards for the rest in chunks (Convex arrays hold at most 8,192 items).

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { RefreshCw, Sparkles, X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { buildDeckCards, type LearnCard } from "../../lib/learnApi";

export interface AiDeckGeneratorProps {
  onCreated: (deckId: Id<"learnDecks">) => void;
}

const DEFAULT_COUNT = 20;
/** Cards sent per Convex call when saving. */
const SAVE_CHUNK = 300;

function defaultName(request: string): string {
  const line = request.trim().split("\n")[0] ?? "";
  return line.length > 80 ? `${line.slice(0, 77)}...` : line || "AI deck";
}

export function AiDeckGenerator({ onCreated }: AiDeckGeneratorProps) {
  const createDeck = useMutation(api.learn.createDeckWithCards);
  const appendCards = useMutation(api.learn.appendCards);
  const [request, setRequest] = useState("");
  const [countText, setCountText] = useState(String(DEFAULT_COUNT));
  const [name, setName] = useState("");
  const [cards, setCards] = useState<LearnCard[]>([]);
  const [target, setTarget] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  /** A save that stopped part way: the deck made and how many cards it already has. */
  const [partial, setPartial] = useState<{ deckId: Id<"learnDecks">; sent: number } | null>(null);
  const [saved, setSaved] = useState(0);
  const stopRef = useRef(false);

  const count = Math.floor(Number(countText));
  const countOk = Number.isFinite(count) && count >= 1;
  const canMake = !busy && !saving && request.trim().length > 0 && countOk;

  async function make() {
    if (!canMake) return;
    stopRef.current = false;
    setBusy(true);
    setError("");
    setNote("");
    setCards([]);
    setPartial(null);
    setTarget(count);
    if (!name.trim()) setName(defaultName(request));
    let made: LearnCard[] = [];
    try {
      made = await buildDeckCards(request.trim(), count, {
        onProgress: (so) => setCards(so),
        shouldStop: () => stopRef.current,
      });
      setCards(made);
      if (made.length < count && !stopRef.current) {
        setNote(`The AI made ${made.length} cards before it ran out of new ones for this request.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The AI could not make the cards. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (cards.length === 0 || saving || busy) return;
    setSaving(true);
    setError("");
    const toInput = (c: LearnCard) => ({ front: c.front, back: c.back, tags: c.tags });
    let deckId = partial?.deckId ?? null;
    let sent = partial?.sent ?? 0;
    setSaved(sent);
    try {
      if (!deckId) {
        const first = cards.slice(0, SAVE_CHUNK);
        deckId = await createDeck({
          name: name.trim() || defaultName(request),
          source: "ai",
          prompt: request.trim(),
          cards: first.map(toInput),
        });
        sent = first.length;
        setSaved(sent);
      }
      while (sent < cards.length) {
        const chunk = cards.slice(sent, sent + SAVE_CHUNK);
        await appendCards({ deckId, cards: chunk.map(toInput) });
        sent += chunk.length;
        setSaved(sent);
      }
      setCards([]);
      setRequest("");
      setName("");
      setTarget(0);
      setPartial(null);
      onCreated(deckId);
    } catch (e) {
      if (deckId) setPartial({ deckId, sent });
      const why = e instanceof Error ? e.message : "";
      setError(
        deckId
          ? `Saved ${sent.toLocaleString()} of ${cards.length.toLocaleString()} cards. Press Save again to send the rest.${why ? ` ${why}` : ""}`
          : why || "The deck could not be saved. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  const remove = (i: number) => setCards((cs) => cs.filter((_, j) => j !== i));

  return (
    <section className="panel p-4 sm:p-5 space-y-4">
      <div>
        <p className="eyebrow">Make a deck with AI</p>
        <p className="text-sm text-white/55 mt-1">
          Say what to study and how many cards you want. The AI uses the book library first, then the web.
        </p>
      </div>

      <label className="block space-y-1.5">
        <span className="label">What to study</span>
        <textarea
          className="textarea"
          rows={3}
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          placeholder="For example: CFA Level 1 Volume 1 topics"
          disabled={busy}
        />
      </label>

      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1.5">
          <span className="label block">Number of cards</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            className="field w-32"
            value={countText}
            onChange={(e) => setCountText(e.target.value)}
            disabled={busy}
          />
        </label>
        <label className="space-y-1.5 flex-1 min-w-[12rem]">
          <span className="label block">Deck name</span>
          <input
            type="text"
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Named after your request if left blank"
            disabled={busy}
          />
        </label>
      </div>
      {countOk && count > 100 && (
        <p className="text-xs text-white/45">
          Large decks are made 25 cards at a time and take about a minute per batch. Keep this page open.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-gold" onClick={make} disabled={!canMake}>
          {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {busy ? "Making cards" : "Make cards"}
        </button>
        {busy && (
          <button type="button" className="btn-ghost" onClick={() => (stopRef.current = true)}>
            Stop after this batch
          </button>
        )}
        {(busy || cards.length > 0) && target > 0 && (
          <span className="text-sm text-white/55" aria-live="polite">
            {cards.length} of {target} cards
          </span>
        )}
      </div>
      {busy && target > 0 && (
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden" aria-hidden="true">
          <div className="h-full bg-gold transition-all" style={{ width: `${Math.min(100, (cards.length / target) * 100)}%` }} />
        </div>
      )}

      {error && <p className="text-sm text-loss">{error}</p>}
      {note && <p className="text-sm text-white/55">{note}</p>}

      {cards.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="label">Preview</p>
            <button type="button" className="btn-gold" onClick={save} disabled={busy || saving}>
              {saving
                ? `Saving ${saved.toLocaleString()} of ${cards.length.toLocaleString()}`
                : partial
                  ? `Save the other ${(cards.length - partial.sent).toLocaleString()} cards`
                  : `Save ${cards.length.toLocaleString()} cards as a deck`}
            </button>
          </div>
          <ol className="space-y-2">
            {cards.map((c, i) => (
              <li key={`${i}-${c.front}`} className="panel-soft p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <p className="flex-1 text-sm font-medium text-white">
                    <span className="text-gold mr-2">{i + 1}.</span>
                    {c.front}
                  </p>
                  {!busy && !saving && !partial && (
                    <button
                      type="button"
                      className="btn-ghost p-1.5 shrink-0"
                      onClick={() => remove(i)}
                      aria-label={`Remove card ${i + 1}`}
                      title="Remove this card"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <p className="text-sm text-white/70 whitespace-pre-wrap leading-relaxed">{c.back}</p>
                {c.tags.length > 0 && <p className="text-xs text-white/40">{c.tags.join(", ")}</p>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
