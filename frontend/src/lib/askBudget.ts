// One shared record of when the reader last asked the AI server a question.
//
// The server allows three questions a minute per reader. Every "Explain using
// AI" button under a question, and the full-analysis button, go through the
// same `askQuestion` call, so the budget is recorded in that one place and
// every button reads the same record. Nothing here queues or retries: a
// request that would be refused is never sent, and the button says when the
// next one is allowed.
//
// This budget covers /ask alone. `explainSelection` posts to /explain, which
// nginx meters in its own zone at six a minute, so it is deliberately not
// counted here.
//
// The record is in memory only. A reload clears it, which is the honest
// behaviour: the server is the authority, and this only keeps the app from
// firing a request it knows would be refused.

/** What the AI server allows one reader per minute. */
export const ASK_LIMIT_PER_MINUTE = 3;

/** What the reader is told when the next question is not allowed yet. */
export function budgetWaitMessage(seconds: number): string {
  return `You have asked the limit of ${ASK_LIMIT_PER_MINUTE} questions a minute. The next one is allowed in ${seconds} seconds.`;
}

const WINDOW_MS = 60_000;

/** The timestamps of the most recent requests, oldest first. */
let stamps: number[] = [];

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function prune(now: number): number[] {
  return stamps.filter((t) => now - t < WINDOW_MS);
}

/**
 * The one countdown timer for the whole app.
 *
 * The window rolls forward on its own, with nothing to notify the store, so
 * something has to tick while a question is refused. Every mounted question
 * field used to run its own one-second interval to do it, and a reader who has
 * used "Expand all" has about a hundred and fifty fields on screen. There is
 * one timer here instead. It runs only while someone is listening AND the
 * budget is actually spent, so an idle app carries no timer at all.
 */
let timer: ReturnType<typeof setInterval> | null = null;

function syncTicker(): void {
  const wanted = listeners.size > 0 && msUntilAllowed() > 0;
  if (wanted && timer == null) {
    timer = setInterval(() => {
      // Stops itself on the tick that ends the wait, and tells the listeners
      // on that same tick so the button re-enables.
      syncTicker();
      emit();
    }, 1000);
  } else if (!wanted && timer != null) {
    clearInterval(timer);
    timer = null;
  }
}

/** Record that a request is being sent now. */
export function recordAsk(now: number = Date.now()): void {
  stamps = [...prune(now), now].slice(-ASK_LIMIT_PER_MINUTE);
  syncTicker();
  emit();
}

/** Milliseconds until another request is allowed, 0 when one is allowed now. */
export function msUntilAllowed(now: number = Date.now()): number {
  const live = prune(now);
  if (live.length < ASK_LIMIT_PER_MINUTE) return 0;
  const oldest = live[0];
  return Math.max(0, WINDOW_MS - (now - oldest));
}

/** Whole seconds until another request is allowed, rounded up. */
export function secondsUntilAllowed(now: number = Date.now()): number {
  return Math.ceil(msUntilAllowed(now) / 1000);
}

export function canAsk(now: number = Date.now()): boolean {
  return msUntilAllowed(now) === 0;
}

/** Drop the record. Exported for the tests, which need a clean slate. */
export function resetAskBudget(): void {
  stamps = [];
  syncTicker();
  emit();
}

/**
 * Subscribe to changes, so a disabled button can count down.
 *
 * A field that mounts while the budget is already spent starts the timer, and
 * the last field to go clears it. Pair this with a snapshot that is a plain
 * number or boolean, such as `secondsUntilAllowed`: a fresh object would make
 * React re-render on every tick whether anything moved or not.
 */
export function subscribeAskBudget(listener: () => void): () => void {
  listeners.add(listener);
  syncTicker();
  return () => {
    listeners.delete(listener);
    syncTicker();
  };
}

/** True while the countdown timer is running. Exported for the test that
 *  proves it starts, ticks, stops, and never runs on an idle app. */
export function askBudgetTicking(): boolean {
  return timer != null;
}
