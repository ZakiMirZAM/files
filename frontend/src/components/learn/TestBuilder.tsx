// A6: make a practice test from a typed request or from one of the user's decks,
// with any number of multiple-choice and short-answer questions. The AI writes
// them in batches; the finished test is saved to Convex and opened.

import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { RefreshCw, Save, Sparkles } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "../../lib/cn";
import { buildTestQuestions, splitTestQuestions, type TestQuestion } from "../../lib/learnApi";
import type { BookSource } from "../../lib/localAi";
import { BookPicker, bookLabel, useLocalShelf } from "./BookPicker";

export interface TestBuilderProps {
  onCreated: (testId: Id<"learnTests">) => void;
}

type Source = "request" | "deck";

/** A made test not yet fully saved: kept so a failed save loses nothing. */
interface Pending {
  title: string;
  prompt: string;
  deckId?: Id<"learnDecks">;
  sourceBook?: BookSource;
  parts: TestQuestion[][];
  count: number;
  /** Parts already saved, in order. */
  savedIds: Id<"learnTests">[];
}

function whole(text: string): number {
  const n = Math.floor(Number(text));
  return Number.isFinite(n) && n >= 0 ? n : -1;
}

export function TestBuilder({ onCreated }: TestBuilderProps) {
  const decks = useQuery(api.learn.listDecks);
  const createTest = useMutation(api.learnTests.createTest);
  const [source, setSource] = useState<Source>("request");
  const [request, setRequest] = useState("");
  const [deckId, setDeckId] = useState<Id<"learnDecks"> | "">("");
  const deckCards = useQuery(api.learnTests.deckCardsForTest, source === "deck" && deckId ? { deckId } : "skip");
  const [mcText, setMcText] = useState("10");
  const [shortText, setShortText] = useState("3");
  const [title, setTitle] = useState("");
  const [made, setMade] = useState<TestQuestion[]>([]);
  const [target, setTarget] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  // Local site only: a book from the Books folder for the AI to read.
  const shelf = useLocalShelf();
  const [book, setBook] = useState<BookSource | null>(null);
  const [saving, setSaving] = useState(false);
  const stopRef = useRef(false);
  const progressRef = useRef<TestQuestion[]>([]);

  const mc = whole(mcText);
  const short = whole(shortText);
  const countsOk = mc >= 0 && short >= 0 && mc + short >= 1;
  const deck = decks?.find((d) => d._id === deckId);
  const subjectOk =
    source === "request"
      ? request.trim().length > 0 || book !== null
      : Boolean(deckId) && (deckCards?.length ?? 0) > 0;
  const canMake = !busy && !saving && countsOk && subjectOk;

  /** Save a made test as one or more parts; on failure the unsaved parts stay for a retry. */
  async function save(p: Pending): Promise<void> {
    setSaving(true);
    setError("");
    const ids = [...p.savedIds];
    try {
      for (let i = ids.length; i < p.parts.length; i++) {
        const name = p.parts.length > 1 ? `${p.title} (part ${i + 1} of ${p.parts.length})` : p.title;
        const testId = await createTest({
          title: name,
          prompt: p.prompt,
          deckId: p.deckId,
          ...(p.sourceBook ? { sourceBook: p.sourceBook } : {}),
          questions: JSON.stringify(p.parts[i]),
        });
        ids.push(testId);
      }
    } catch (e) {
      const saved = ids.length;
      setPending({ ...p, savedIds: ids });
      const why = e instanceof Error ? e.message : "";
      setError(
        `The test could not be saved${saved > 0 ? ` (${saved} of ${p.parts.length} parts saved)` : ""}. Your questions are kept here.${why ? ` ${why}` : ""}`,
      );
      setSaving(false);
      return;
    }
    setPending(null);
    setSaving(false);
    setRequest("");
    setTitle("");
    setMade([]);
    setTarget(0);
    onCreated(ids[0]);
  }

  async function make() {
    if (!canMake) return;
    stopRef.current = false;
    setBusy(true);
    setError("");
    setPending(null);
    setMade([]);
    progressRef.current = [];
    setTarget(mc + short);
    const subject =
      source === "request"
        ? { request: request.trim(), book }
        : { request: request.trim(), cards: deckCards ?? [], book };
    const bookPart = book ? `${bookLabel(book.name)}${book.pages?.trim() ? `, ${book.pages.trim()}` : ""}` : "";
    const prompt =
      source === "request"
        ? request.trim() || bookPart
        : `Deck: ${deck?.name ?? ""}${request.trim() ? `. ${request.trim()}` : ""}`;
    let questions: TestQuestion[] = [];
    try {
      questions = await buildTestQuestions(subject, mc, short, {
        onProgress: (so) => {
          progressRef.current = so;
          setMade(so);
        },
        shouldStop: () => stopRef.current,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The AI could not write the test. Try again.");
      questions = [];
    }
    // A failed batch keeps what was already made, so a long test is not lost.
    const keep = questions.length > 0 ? questions : progressRef.current;
    setBusy(false);
    if (keep.length === 0) return;
    const name =
      title.trim() ||
      (source === "deck" ? `${deck?.name ?? "Deck"} test` : (request.trim().split("\n")[0] || bookPart).slice(0, 80));
    await save({
      title: name,
      prompt,
      deckId: source === "deck" && deckId ? deckId : undefined,
      sourceBook: book ?? undefined,
      parts: splitTestQuestions(keep),
      count: keep.length,
      savedIds: [],
    });
  }

  return (
    <section className="panel p-4 sm:p-5 space-y-4">
      <div>
        <p className="eyebrow">New test</p>
        <p className="text-sm text-white/55 mt-1">
          Type what to be tested on, or pick one of your decks. The AI writes the questions.
        </p>
      </div>

      <div role="radiogroup" aria-label="Test source" className="flex flex-wrap gap-2">
        {(
          [
            ["request", "From a request"],
            ["deck", "From a deck"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={source === key}
            onClick={() => setSource(key)}
            disabled={busy}
            className={cn(
              "px-3 py-1.5 text-sm rounded-sm border transition-colors",
              source === key ? "border-gold/60 text-gold bg-gold/10" : "border-white/15 text-white/60 hover:text-white",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {source === "deck" && (
        <label className="block space-y-1.5">
          <span className="label block">Deck</span>
          <select
            className="field"
            value={deckId}
            onChange={(e) => setDeckId(e.target.value as Id<"learnDecks"> | "")}
            disabled={busy}
          >
            <option value="">Choose a deck</option>
            {(decks ?? []).map((d) => (
              <option key={d._id} value={d._id}>
                {d.name}
              </option>
            ))}
          </select>
          {decks && decks.length === 0 && <span className="text-xs text-white/45 block">You have no decks yet.</span>}
          {deckId && deckCards && deckCards.length === 0 && (
            <span className="text-xs text-white/45 block">This deck has no cards.</span>
          )}
          {deckCards && deckCards.length >= 400 && (
            <span className="text-xs text-white/45 block">The test uses the first 400 cards of this deck.</span>
          )}
        </label>
      )}

      <label className="block space-y-1.5">
        <span className="label block">{source === "request" ? "What to be tested on" : "Focus (optional)"}</span>
        <textarea
          className="textarea"
          rows={source === "request" ? 3 : 2}
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          placeholder={source === "request" ? "For example: bond duration and convexity" : "For example: only the formulas"}
          disabled={busy}
        />
      </label>

      {shelf && <BookPicker books={shelf} value={book} onChange={setBook} withPages disabled={busy} />}

      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1.5">
          <span className="label block">Multiple choice</span>
          <input type="number" inputMode="numeric" min={0} step={1} className="field w-28" value={mcText} onChange={(e) => setMcText(e.target.value)} disabled={busy} />
        </label>
        <label className="space-y-1.5">
          <span className="label block">Short answer</span>
          <input type="number" inputMode="numeric" min={0} step={1} className="field w-28" value={shortText} onChange={(e) => setShortText(e.target.value)} disabled={busy} />
        </label>
        <label className="space-y-1.5 flex-1 min-w-[12rem]">
          <span className="label block">Test name</span>
          <input type="text" className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Named for you if left blank" disabled={busy} />
        </label>
      </div>
      {!countsOk && <p className="text-xs text-loss">Ask for at least one question.</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-gold" onClick={make} disabled={!canMake}>
          {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {busy ? "Writing questions" : saving ? "Saving" : "Make test"}
        </button>
        {pending && !busy && !saving && (
          <button type="button" className="btn-outline" onClick={() => void save(pending)}>
            <Save className="w-4 h-4" /> Save what was made ({pending.count.toLocaleString()} questions)
          </button>
        )}
        {busy && (
          <button type="button" className="btn-ghost" onClick={() => (stopRef.current = true)}>
            Stop and keep what is made
          </button>
        )}
        {busy && target > 0 && (
          <span className="text-sm text-white/55" aria-live="polite">
            {made.length} of {target} questions
          </span>
        )}
      </div>
      {busy && target > 0 && (
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden" aria-hidden="true">
          <div className="h-full bg-gold transition-all" style={{ width: `${Math.min(100, (made.length / target) * 100)}%` }} />
        </div>
      )}
      {error && <p className="text-sm text-loss">{error}</p>}
    </section>
  );
}
