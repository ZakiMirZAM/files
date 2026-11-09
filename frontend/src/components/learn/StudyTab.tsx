// The Study tab (Learn slice A5): pick a deck (or all decks) and how many cards
// to study, see the front, reveal the back, rate Again/Hard/Good/Easy. ts-fsrs
// (lib/learnSchedule.ts) sets when each card comes back.
// Due cards arrive in pages (api.learn.dueCards, at most 500 a call); the
// session asks for the next page as the queue runs low, so "All due" covers
// every due card however many there are.

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { GraduationCap, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { cn } from "../../lib/cn";
import { countText } from "../../lib/learnApi";
import { RATINGS, describeDue, formatWait, previewDue, rate, type StudyRating } from "../../lib/learnSchedule";
import { getStudyDeck, setStudyDeck } from "./StudyDeckChoice";

type Card = Doc<"learnCards">;
const ALL = "all";
/** Cards asked for per page (the server's own maximum). */
const PAGE = 500;
/** Ask for the next page when this few cards are left in the queue. */
const REFILL_AT = 50;

/** Where the next page of due cards comes from. */
interface Source {
  deckId?: Id<"learnDecks">;
  /** The session's "due as of" time, fixed so the cursor stays valid. */
  asOf: number;
  cursor: string;
  /** No more due cards to fetch. */
  done: boolean;
  /** Cards still to fetch for a "This many" session; Infinity for all due. */
  remaining: number;
}

interface Session {
  queue: Card[];
  reviewed: number;
  counts: Record<StudyRating, number>;
  source: Source;
}

export function StudyTab() {
  const [session, setSession] = useState<Session | null>(null);
  if (session) return <StudySession session={session} setSession={setSession} />;
  return (
    <StudySetup
      onStart={(queue, source) => setSession({ queue, reviewed: 0, counts: { 1: 0, 2: 0, 3: 0, 4: 0 }, source })}
    />
  );
}

// ── Setup ────────────────────────────────────────────────────────────────────

function StudySetup({ onStart }: { onStart: (queue: Card[], source: Source) => void }) {
  const convex = useConvex();
  const decks = useQuery(api.learn.listDecks);
  const [deck, setDeck] = useState<string>(() => getStudyDeck() ?? ALL);
  const [mode, setMode] = useState<"all" | "number">("all");
  const [number, setNumber] = useState("20");
  const [starting, setStarting] = useState(false);

  // A remembered deck that was deleted falls back to all decks.
  useEffect(() => {
    if (decks && deck !== ALL && !decks.some((d) => d._id === deck)) setDeck(ALL);
  }, [decks, deck]);

  const deckId = deck === ALL ? undefined : (deck as Id<"learnDecks">);
  const due = useQuery(api.learn.dueCount, { deckId });
  const n = Math.floor(Number(number));
  const validNumber = Number.isFinite(n) && n >= 1;

  const start = async () => {
    setStarting(true);
    try {
      const wanted = mode === "number" ? n : Infinity;
      const res = await convex.query(api.learn.dueCards, {
        deckId,
        numItems: Math.min(PAGE, wanted),
        cursor: null,
      });
      const queue = res.page.slice(0, Math.min(res.page.length, wanted));
      if (queue.length === 0) {
        toast.message("Nothing is due right now.");
        return;
      }
      const remaining = wanted - queue.length;
      onStart(queue, {
        deckId,
        asOf: res.asOf,
        cursor: res.continueCursor,
        done: res.isDone || remaining <= 0,
        remaining,
      });
    } catch {
      toast.error("Could not load the cards");
    } finally {
      setStarting(false);
    }
  };

  if (decks !== undefined && decks.length === 0) {
    return (
      <div className="panel-soft py-10 text-center">
        <GraduationCap className="w-8 h-8 mx-auto text-white/15 mb-3" strokeWidth={1.5} />
        <p className="text-sm text-white/45">Make or import a deck in the Decks tab first.</p>
      </div>
    );
  }

  return (
    <div className="panel p-4 md:p-5 space-y-5 max-w-xl">
      <label className="block space-y-1.5">
        <span className="label">Deck</span>
        <select
          className="field min-h-[44px] py-2"
          value={deck}
          onChange={(e) => {
            setDeck(e.target.value);
            setStudyDeck(e.target.value === ALL ? null : (e.target.value as Id<"learnDecks">));
          }}
        >
          <option value={ALL} className="bg-ink-800">
            All decks
          </option>
          {decks?.map((d) => (
            <option key={d._id} value={d._id} className="bg-ink-800">
              {d.name}
            </option>
          ))}
        </select>
      </label>

      <p className="text-sm text-white/70">
        {due === undefined ? (
          " "
        ) : (
          <>
            <span className="text-gold font-semibold">{countText(due.count, due.capped)}</span>{" "}
            {due.count === 1 && !due.capped ? "card is" : "cards are"} due
            now.
          </>
        )}
      </p>

      <fieldset className="space-y-2">
        <legend className="label mb-2">How many cards this session</legend>
        <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
          <input
            type="radio"
            name="study-count"
            className="accent-gold w-5 h-5"
            checked={mode === "all"}
            onChange={() => setMode("all")}
          />
          <span className="text-sm text-white">All due</span>
        </label>
        <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
          <input
            type="radio"
            name="study-count"
            className="accent-gold w-5 h-5"
            checked={mode === "number"}
            onChange={() => setMode("number")}
          />
          <span className="text-sm text-white">This many:</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            className="field w-28 py-2"
            value={number}
            onFocus={() => setMode("number")}
            onChange={(e) => setNumber(e.target.value)}
            aria-label="Number of cards"
          />
        </label>
      </fieldset>

      <button
        type="button"
        className="btn-gold min-h-[44px] w-full sm:w-auto"
        disabled={starting || due?.count === 0 || (mode === "number" && !validNumber)}
        onClick={() => void start()}
      >
        <GraduationCap className="w-4 h-4" />
        {starting ? "Loading..." : "Start studying"}
      </button>
    </div>
  );
}

// ── Session ──────────────────────────────────────────────────────────────────

function StudySession({
  session,
  setSession,
}: {
  session: Session;
  setSession: Dispatch<SetStateAction<Session | null>>;
}) {
  const convex = useConvex();
  const recordReview = useMutation(api.learn.recordReview);
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchFailed, setFetchFailed] = useState(false);
  /** Every card id fetched this session, so a later page never repeats one. */
  const seen = useRef<Set<string> | null>(null);
  if (seen.current === null) seen.current = new Set(session.queue.map((c) => c._id));
  const card = session.queue[0];
  const src = session.source;
  const more = !src.done && src.remaining > 0;

  const fetchMore = useCallback(async () => {
    setFetching(true);
    setFetchFailed(false);
    try {
      const res = await convex.query(api.learn.dueCards, {
        deckId: src.deckId,
        numItems: Math.min(PAGE, src.remaining),
        cursor: src.cursor,
        asOf: src.asOf,
      });
      const ids = seen.current ?? new Set<string>();
      const fresh = res.page.filter((c) => !ids.has(c._id)).slice(0, Math.min(res.page.length, src.remaining));
      for (const c of fresh) ids.add(c._id);
      const remaining = src.remaining - fresh.length;
      setSession((s) =>
        s && {
          ...s,
          queue: [...s.queue, ...fresh],
          source: { ...s.source, cursor: res.continueCursor, done: res.isDone || remaining <= 0, remaining },
        },
      );
    } catch {
      setFetchFailed(true);
      toast.error("Could not load more cards");
    } finally {
      setFetching(false);
    }
  }, [convex, src, setSession]);

  // Ask for the next page before the queue runs out.
  useEffect(() => {
    if (more && !fetching && !fetchFailed && session.queue.length < REFILL_AT) void fetchMore();
  }, [more, fetching, fetchFailed, session.queue.length, fetchMore]);

  const answer = useCallback(
    async (rating: StudyRating) => {
      if (!card || saving) return;
      setSaving(true);
      const now = new Date();
      const result = rate(card.srs, rating, now);
      try {
        await recordReview({ cardId: card._id, rating, srs: result.srs, due: result.due, log: result.log });
      } catch {
        toast.error("Could not save that rating. Try again.");
        setSaving(false);
        return;
      }
      setLast(describeDue(result.due, now.getTime()));
      setSession((s) => {
        if (!s) return s;
        const rest = s.queue.slice(1);
        // "Again" cards come back later in this same session with their new state.
        const queue = rating === 1 ? [...rest, { ...card, srs: result.srs, due: result.due }] : rest;
        return {
          ...s,
          queue,
          reviewed: s.reviewed + 1,
          counts: { ...s.counts, [rating]: s.counts[rating] + 1 },
        };
      });
      setRevealed(false);
      setSaving(false);
    },
    [card, saving, recordReview, setSession],
  );

  // Keyboard: space or enter reveals, 1 to 4 rates.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (!revealed && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed && ["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        void answer(Number(e.key) as StudyRating);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, answer]);

  if (!card && more) {
    return (
      <div className="panel p-5 space-y-4 max-w-xl">
        {fetchFailed ? (
          <>
            <p className="text-sm text-white/70">The next cards could not be loaded.</p>
            <div className="flex gap-2">
              <button type="button" className="btn-gold min-h-[44px]" onClick={() => void fetchMore()} disabled={fetching}>
                Try again
              </button>
              <button
                type="button"
                className="btn-ghost min-h-[44px]"
                onClick={() => setSession((s) => s && { ...s, source: { ...s.source, done: true } })}
              >
                End session
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-white/55">Loading the next cards...</p>
        )}
      </div>
    );
  }

  if (!card) {
    const c = session.counts;
    return (
      <div className="panel p-5 space-y-4 max-w-xl">
        <h2 className="font-display text-xl font-semibold text-white">Session done</h2>
        <p className="text-sm text-white/70">
          You rated {session.reviewed.toLocaleString()} {session.reviewed === 1 ? "card" : "cards"}: {c[1]} Again ·{" "}
          {c[2]} Hard · {c[3]} Good · {c[4]} Easy.
        </p>
        {last && <p className="text-xs text-white/45">Last card: {last}</p>}
        <button type="button" className="btn-gold min-h-[44px]" onClick={() => setSession(null)}>
          <RotateCcw className="w-4 h-4" /> Study more
        </button>
      </div>
    );
  }

  const preview = revealed ? previewDue(card.srs) : null;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between gap-3 text-xs text-white/45">
        <span>
          {countText(session.queue.length, more)} left · {session.reviewed.toLocaleString()} done
        </span>
        <button
          type="button"
          className="btn-ghost min-h-[44px]"
          onClick={() => setSession((s) => s && { ...s, queue: [], source: { ...s.source, done: true } })}
        >
          End session
        </button>
      </div>

      <div className="panel p-5 md:p-6 space-y-4 min-h-[14rem]">
        <p className="eyebrow">{card.srs ? "Review" : "New card"}</p>
        <p className="text-lg text-white whitespace-pre-wrap break-words leading-relaxed">{card.front || " "}</p>
        {revealed && (
          <>
            <div className="divider-gold" />
            <p className="text-base text-white/80 whitespace-pre-wrap break-words leading-relaxed">{card.back || " "}</p>
          </>
        )}
      </div>

      {!revealed ? (
        <button type="button" className="btn-gold min-h-[52px] w-full" onClick={() => setRevealed(true)}>
          Show answer
        </button>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {RATINGS.map((r) => (
            <button
              key={r.value}
              type="button"
              disabled={saving}
              onClick={() => void answer(r.value)}
              className={cn(
                "min-h-[56px] rounded-sm border px-3 py-2 flex flex-col items-center justify-center transition-colors disabled:opacity-50",
                r.value === 1 && "border-loss/40 text-loss hover:bg-loss/10",
                r.value === 2 && "border-white/15 text-white/80 hover:bg-white/5",
                r.value === 3 && "border-gold/40 text-gold hover:bg-gold/10",
                r.value === 4 && "border-gain/40 text-gain hover:bg-gain/10",
              )}
            >
              <span className="text-sm font-semibold">{r.label}</span>
              {preview && <span className="text-[0.7rem] opacity-70">{formatWait(preview[r.value])}</span>}
            </button>
          ))}
        </div>
      )}

      {last && <p className="text-xs text-white/45">Previous card: {last}</p>}
    </div>
  );
}
