// Study schedule (Learn slice A5): a thin wrapper over ts-fsrs.
// A card's FSRS state is stored in Convex as a JSON string (learnCards.srs);
// a card with no state yet is new and is due as soon as it is created.

import { createEmptyCard, fsrs, Rating, State, type Card, type Grade } from "ts-fsrs";

export type StudyRating = 1 | 2 | 3 | 4;

export const RATINGS: { value: StudyRating; label: string; key: string }[] = [
  { value: 1, label: "Again", key: "1" },
  { value: 2, label: "Hard", key: "2" },
  { value: 3, label: "Good", key: "3" },
  { value: 4, label: "Easy", key: "4" },
];

const scheduler = fsrs({ enable_fuzz: false });

const GRADE: Record<StudyRating, Grade> = {
  1: Rating.Again,
  2: Rating.Hard,
  3: Rating.Good,
  4: Rating.Easy,
};

/** A fresh FSRS card for a card that has never been studied. */
export function newCardState(now: Date = new Date()): Card {
  return createEmptyCard(now);
}

/** Read a stored state; anything missing or unreadable counts as a new card. */
export function parseSrs(srs: string | undefined | null, now: Date = new Date()): Card {
  if (!srs) return newCardState(now);
  try {
    const raw = JSON.parse(srs) as Record<string, unknown>;
    const due = new Date(raw.due as string | number);
    if (Number.isNaN(due.getTime())) return newCardState(now);
    const last = raw.last_review != null ? new Date(raw.last_review as string | number) : undefined;
    return {
      due,
      stability: Number(raw.stability) || 0,
      difficulty: Number(raw.difficulty) || 0,
      scheduled_days: Number(raw.scheduled_days) || 0,
      learning_steps: Number(raw.learning_steps) || 0,
      reps: Number(raw.reps) || 0,
      lapses: Number(raw.lapses) || 0,
      state: (Number(raw.state) || State.New) as State,
      last_review: last && !Number.isNaN(last.getTime()) ? last : undefined,
    };
  } catch {
    return newCardState(now);
  }
}

export function serializeSrs(card: Card): string {
  return JSON.stringify(card);
}

export interface ScheduleResult {
  card: Card;
  /** JSON for learnCards.srs */
  srs: string;
  /** ms since epoch for learnCards.due */
  due: number;
  /** JSON of the FSRS review log for learnReviews.log */
  log: string;
}

/** The card's next state after a rating. */
export function rate(srs: string | undefined | null, rating: StudyRating, now: Date = new Date()): ScheduleResult {
  const current = parseSrs(srs, now);
  const { card, log } = scheduler.next(current, now, GRADE[rating]);
  return { card, srs: serializeSrs(card), due: card.due.getTime(), log: JSON.stringify(log) };
}

/** When the card would come back for each rating (ms since epoch). */
export function previewDue(srs: string | undefined | null, now: Date = new Date()): Record<StudyRating, number> {
  return {
    1: rate(srs, 1, now).due,
    2: rate(srs, 2, now).due,
    3: rate(srs, 3, now).due,
    4: rate(srs, 4, now).due,
  };
}

/** Short, plain wait: "now", "10 min", "3 h", "1 day", "2 mo", "1.5 yr". */
export function formatWait(due: number, now: number = Date.now()): string {
  const ms = due - now;
  if (ms < 60_000) return "now";
  const min = ms / 60_000;
  if (min < 60) return `${Math.round(min)} min`;
  const h = min / 60;
  if (h < 24) return `${Math.round(h)} h`;
  const d = h / 24;
  if (d < 31) {
    const n = Math.round(d);
    return `${n} ${n === 1 ? "day" : "days"}`;
  }
  if (d < 365) return `${Math.round(d / 30)} mo`;
  const y = d / 365;
  return `${Math.round(y * 10) / 10} yr`;
}

/** A full sentence for after a rating: "Back in 3 days (Tue, Nov 11)." */
export function describeDue(due: number, now: number = Date.now()): string {
  const wait = formatWait(due, now);
  if (wait === "now") return "Back in under a minute.";
  const date = new Date(due).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return due - now < 86_400_000 ? `Back in ${wait}.` : `Back in ${wait} (${date}).`;
}
