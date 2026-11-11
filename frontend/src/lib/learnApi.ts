// The Learn section's AI calls: flashcards (/learn/cards), practice tests
// (/learn/quiz) and short-answer grading (/learn/grade), all on the local RAG
// server (rag/learn.py). Every call runs only when the user clicks.
//
// The server makes at most 25 cards or 15 questions per call, so a big deck or
// test is built in batches here, one call at a time, with progress. There is no
// cap on the total.

import { getAiModel } from "./aiModelStore";
import type { BookSource } from "./localAi";

const AI_BASE = (import.meta.env.VITE_AI_BASE as string | undefined) ?? "http://localhost:3001";

export const CARDS_PER_CALL = 25;
export const QUESTIONS_PER_CALL = 15;
const TIMEOUT_MS = 600_000; // nginx proxy_read_timeout and ai_proxy's ceiling
const GRADE_TIMEOUT_MS = 180_000;
/** Give up after this many batches in a row that add nothing new. */
const MAX_EMPTY_BATCHES = 2;

// The server's own limits (rag/learn.py). Clipping here keeps the request body
// small however many cards or questions have been made so far.
const MAX_AVOID_ITEMS = 600;
const MAX_AVOID_ITEM = 200;
const MAX_AVOID_TOTAL = 40_000;
const MAX_SOURCE_CARDS = 400;
const MAX_SOURCE_FRONT = 300;
const MAX_SOURCE_BACK = 1_200;
const MAX_SOURCE_TOTAL = 80_000;

/** The most recent `avoid` items the server will read, clipped the way it clips them. */
export function clipAvoid(items: string[]): string[] {
  const trimmed = items.map((x) => x.trim().slice(0, MAX_AVOID_ITEM)).filter((x) => x.length > 0);
  const recent = trimmed.slice(-MAX_AVOID_ITEMS);
  const kept: string[] = [];
  let total = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    total += recent[i].length + 1;
    if (total > MAX_AVOID_TOTAL) break;
    kept.push(recent[i]);
  }
  return kept.reverse();
}

/** The deck cards the server will read: the first 400, each side clipped, within the total. */
export function clipSourceCards(cards: { front: string; back: string }[]): { front: string; back: string }[] {
  const out: { front: string; back: string }[] = [];
  let total = 0;
  for (const c of cards.slice(0, MAX_SOURCE_CARDS)) {
    const front = c.front.trim().slice(0, MAX_SOURCE_FRONT);
    const back = c.back.trim().slice(0, MAX_SOURCE_BACK);
    if (!front || !back) continue;
    total += front.length + back.length;
    if (total > MAX_SOURCE_TOTAL) break;
    out.push({ front, back });
  }
  return out;
}

export interface LearnCard {
  front: string;
  back: string;
  tags: string[];
}

export interface McQuestion {
  type: "mc";
  prompt: string;
  choices: string[];
  answer: number;
  explanation: string;
}

export interface ShortQuestion {
  type: "short";
  prompt: string;
  answer: string;
}

export type TestQuestion = McQuestion | ShortQuestion;

export type Score = 0 | 0.5 | 1;

export interface GradeResult {
  score: Score;
  feedback: string;
}

async function postLearn(path: string, body: Record<string, unknown>, timeoutMs: number): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(`${AI_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ...body, model: getAiModel() }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof DOMException && (err.name === "AbortError" || err.name === "TimeoutError")) {
      throw new Error(`The AI took longer than ${Math.round(timeoutMs / 1000)} seconds and the page stopped waiting. Try again.`);
    }
    throw new Error("Could not reach the AI server. Check your connection and try again.");
  }
  // Read as text first: the heartbeat proxy commits a 200 and sends spaces while
  // the model works, so a connection cut mid-answer arrives as an empty body.
  const raw = await res.text();
  let data: unknown = null;
  if (raw.trim()) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
  }
  const obj = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
  if (typeof obj.error === "string" && obj.error) throw new Error(obj.error);
  if (res.status === 429) throw new Error("Too many AI requests in a short time. Wait a minute and try again.");
  if (!res.ok) throw new Error(`The AI server returned ${res.status}. Try again.`);
  if (!raw.trim()) {
    throw new Error("The connection closed before the AI finished. On an iPad or phone this can happen when the screen locks. Try again.");
  }
  if (data === null) throw new Error("The AI answer came back incomplete. Try again.");
  return obj;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function toCards(raw: unknown): LearnCard[] {
  if (!Array.isArray(raw)) return [];
  const out: LearnCard[] = [];
  for (const c of raw) {
    if (typeof c !== "object" || c === null) continue;
    const r = c as Record<string, unknown>;
    const front = str(r.front);
    const back = str(r.back);
    if (!front || !back) continue;
    const tags = Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === "string" && t.length > 0) : [];
    out.push({ front, back, tags });
  }
  return out;
}

export function toQuestions(raw: unknown): TestQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: TestQuestion[] = [];
  for (const q of raw) {
    if (typeof q !== "object" || q === null) continue;
    const r = q as Record<string, unknown>;
    const prompt = str(r.prompt);
    if (!prompt) continue;
    if (r.type === "mc") {
      const choices = Array.isArray(r.choices) ? r.choices.map(str) : [];
      const answer = typeof r.answer === "number" ? r.answer : -1;
      if (choices.length < 2 || choices.some((c) => !c) || !Number.isInteger(answer) || answer < 0 || answer >= choices.length) continue;
      out.push({ type: "mc", prompt, choices, answer, explanation: str(r.explanation) });
    } else if (r.type === "short") {
      const answer = str(r.answer);
      if (answer) out.push({ type: "short", prompt, answer });
    }
  }
  return out;
}

function key(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Which share of a book's page range one parallel batch covers (index of `of`). */
export interface Slice {
  index: number;
  of: number;
}

/** Batches a book-based deck or test sends at the same time. */
export const PARALLEL_BATCHES = 4;

/** `total` split into `n` near-equal whole parts, larger parts first. */
export function splitEven(total: number, n: number): number[] {
  const parts = Math.max(1, n);
  return Array.from({ length: parts }, (_, i) => Math.floor(total / parts) + (i < total % parts ? 1 : 0));
}

/**
 * Plans the batches of a book-based test: as few as fit QUESTIONS_PER_CALL, each
 * with its share of the multiple-choice and short-answer counts.
 */
export function planQuestionBatches(mc: number, short: number): { mc: number; short: number }[] {
  let n = Math.max(1, Math.ceil((mc + short) / QUESTIONS_PER_CALL));
  for (;;) {
    const mcs = splitEven(mc, n);
    const shorts = splitEven(short, n).reverse(); // pair the larger mc share with the smaller short share
    const plan = mcs.map((m, i) => ({ mc: m, short: shorts[i] })).filter((b) => b.mc + b.short > 0);
    if (plan.every((b) => b.mc + b.short <= QUESTIONS_PER_CALL)) return plan;
    n += 1;
  }
}

/** Runs `jobs` at most `limit` at a time; settles every job. */
async function inWaves<T>(jobs: (() => Promise<T>)[], limit: number): Promise<PromiseSettledResult<T>[]> {
  const out: PromiseSettledResult<T>[] = [];
  for (let i = 0; i < jobs.length; i += limit) {
    out.push(...(await Promise.allSettled(jobs.slice(i, i + limit).map((j) => j()))));
  }
  return out;
}

/**
 * One batch of cards. `avoid` is the fronts already made for this deck. With a
 * `book` (local site only) the local AI server reads that book from the Books
 * folder and writes the cards from its pages.
 */
export async function generateCards(
  request: string,
  count: number,
  avoid: string[] = [],
  book?: BookSource | null,
  slice?: Slice,
): Promise<LearnCard[]> {
  const data = await postLearn(
    book ? "/local/learn/cards" : "/learn/cards",
    { request, count, avoid: clipAvoid(avoid), ...(book ? { book } : {}), ...(book && slice ? { slice } : {}) },
    TIMEOUT_MS,
  );
  const cards = toCards(data.cards);
  if (cards.length === 0) throw new Error("The AI answer could not be read. Try again.");
  return cards;
}

/** One batch of questions, from a request, a deck's cards, or both. */
export async function generateQuestions(p: {
  request?: string;
  cards?: { front: string; back: string }[];
  mcCount: number;
  shortCount: number;
  avoid?: string[];
  book?: BookSource | null;
  slice?: Slice;
}): Promise<TestQuestion[]> {
  const data = await postLearn(
    p.book ? "/local/learn/quiz" : "/learn/quiz",
    {
      request: p.request ?? "",
      cards: clipSourceCards(p.cards ?? []),
      mcCount: p.mcCount,
      shortCount: p.shortCount,
      avoid: clipAvoid(p.avoid ?? []),
      ...(p.book ? { book: p.book } : {}),
      ...(p.book && p.slice ? { slice: p.slice } : {}),
    },
    TIMEOUT_MS,
  );
  const qs = toQuestions(data.questions);
  if (qs.length === 0) throw new Error("The AI answer could not be read. Try again.");
  return qs;
}

export async function gradeShortAnswer(p: {
  question: string;
  modelAnswer: string;
  userAnswer: string;
  selfScore?: Score;
}): Promise<GradeResult> {
  const data = await postLearn("/learn/grade", { ...p }, GRADE_TIMEOUT_MS);
  const score = data.score;
  const feedback = str(data.feedback);
  if ((score !== 0 && score !== 0.5 && score !== 1) || !feedback) {
    throw new Error("The AI answer could not be read. Try again.");
  }
  return { score, feedback };
}

export interface BatchHooks<T> {
  /** Called after every batch with everything made so far. */
  onProgress?: (made: T[]) => void;
  /** Checked between batches; return true to stop early and keep what was made. */
  shouldStop?: () => boolean;
}

/**
 * Build `total` cards in batches. Each batch tells the server which fronts it
 * already has, so a later batch moves on instead of repeating. Stops early when
 * two batches in a row add nothing new; the caller sees the shortfall.
 */
export async function buildDeckCards(
  request: string,
  total: number,
  hooks: BatchHooks<LearnCard> = {},
  book?: BookSource | null,
): Promise<LearnCard[]> {
  const made: LearnCard[] = [];
  const seen = new Set<string>();
  const addCards = (batch: LearnCard[]): number => {
    let added = 0;
    for (const c of batch) {
      const k = key(c.front);
      if (!k || seen.has(k) || made.length >= total) continue;
      seen.add(k);
      made.push(c);
      added += 1;
    }
    return added;
  };

  // With a book: the batches go out together, each on its own share of the pages
  // (the local server reads them), then the gaps are topped up the usual way.
  if (book) {
    const counts = splitEven(total, Math.ceil(total / CARDS_PER_CALL));
    let firstError: unknown = null;
    await inWaves(
      counts.map((count, index) => async () => {
        if (hooks.shouldStop?.()) return;
        try {
          addCards(await generateCards(request, count, [], book, { index, of: counts.length }));
          hooks.onProgress?.([...made]);
        } catch (err) {
          firstError ??= err;
        }
      }),
      PARALLEL_BATCHES,
    );
    if (made.length === 0 && firstError) throw firstError;
  }

  let empty = 0;
  while (made.length < total && empty < MAX_EMPTY_BATCHES) {
    if (hooks.shouldStop?.()) break;
    const n = Math.min(CARDS_PER_CALL, total - made.length);
    const batch = await generateCards(request, n, clipAvoid(made.map((c) => c.front)), book);
    const added = addCards(batch);
    empty = added === 0 ? empty + 1 : 0;
    hooks.onProgress?.([...made]);
  }
  return made;
}

/** Split the counts still needed into one call's worth, multiple choice first. */
export function nextQuestionBatch(mcLeft: number, shortLeft: number): { mc: number; short: number } {
  const mc = Math.min(Math.max(mcLeft, 0), QUESTIONS_PER_CALL);
  const short = Math.min(Math.max(shortLeft, 0), QUESTIONS_PER_CALL - mc);
  return { mc, short };
}

/** Build a test with `mcTotal` multiple-choice and `shortTotal` short-answer questions. */
export async function buildTestQuestions(
  source: { request?: string; cards?: { front: string; back: string }[]; book?: BookSource | null },
  mcTotal: number,
  shortTotal: number,
  hooks: BatchHooks<TestQuestion> = {},
): Promise<TestQuestion[]> {
  const mcs: TestQuestion[] = [];
  const shorts: TestQuestion[] = [];
  const seen = new Set<string>();
  const addQuestions = (batch: TestQuestion[]): number => {
    let added = 0;
    for (const q of batch) {
      const k = key(q.prompt);
      const bucket = q.type === "mc" ? mcs : shorts;
      const cap = q.type === "mc" ? mcTotal : shortTotal;
      if (!k || seen.has(k) || bucket.length >= cap) continue;
      seen.add(k);
      bucket.push(q);
      added += 1;
    }
    return added;
  };

  // With a book: all batches at once, each on its own share of the pages.
  if (source.book) {
    const plan = planQuestionBatches(mcTotal, shortTotal);
    let firstError: unknown = null;
    await inWaves(
      plan.map((b, index) => async () => {
        if (hooks.shouldStop?.()) return;
        try {
          addQuestions(await generateQuestions({ ...source, mcCount: b.mc, shortCount: b.short, slice: { index, of: plan.length } }));
          hooks.onProgress?.([...mcs, ...shorts]);
        } catch (err) {
          firstError ??= err;
        }
      }),
      PARALLEL_BATCHES,
    );
    if (mcs.length + shorts.length === 0 && firstError) throw firstError;
  }

  let empty = 0;
  while ((mcs.length < mcTotal || shorts.length < shortTotal) && empty < MAX_EMPTY_BATCHES) {
    if (hooks.shouldStop?.()) break;
    const { mc, short } = nextQuestionBatch(mcTotal - mcs.length, shortTotal - shorts.length);
    const batch = await generateQuestions({
      ...source,
      mcCount: mc,
      shortCount: short,
      avoid: clipAvoid([...mcs, ...shorts].map((q) => q.prompt)),
    });
    const added = addQuestions(batch);
    empty = added === 0 ? empty + 1 : 0;
    hooks.onProgress?.([...mcs, ...shorts]);
  }
  return [...mcs, ...shorts];
}

// ── Attempts: what the user did on each question, and the score ────────────

export interface QuestionResponse {
  /** Multiple choice: the chosen index. */
  choice?: number;
  /** Multiple choice: the user pressed Check or Show answer. */
  revealed?: boolean;
  /** Short answer: what the user wrote. */
  text?: string;
  selfScore?: Score;
  aiScore?: Score;
  aiFeedback?: string;
}

/** Points for one question: 1 for a right choice; a short answer's AI grade, else its self grade. */
export function questionPoints(q: TestQuestion, r: QuestionResponse | undefined): number {
  if (!r) return 0;
  if (q.type === "mc") return r.choice === q.answer ? 1 : 0;
  return r.aiScore ?? r.selfScore ?? 0;
}

export function scoreTest(questions: TestQuestion[], responses: Record<number, QuestionResponse>): { score: number; total: number } {
  const score = questions.reduce((sum, q, i) => sum + questionPoints(q, responses[i]), 0);
  return { score, total: questions.length };
}

/** UTF-8 bytes of one saved test part's questions JSON; well under Convex's 1 MiB document limit. */
export const TEST_PART_BYTES = 700_000;

/**
 * Split a test into parts whose questions JSON each fit in one Convex document.
 * A test of any size is saved whole, as one or more parts, in order.
 */
export function splitTestQuestions(questions: TestQuestion[], maxBytes = TEST_PART_BYTES): TestQuestion[][] {
  const enc = new TextEncoder();
  const parts: TestQuestion[][] = [];
  let part: TestQuestion[] = [];
  let bytes = 2; // the [ and ]
  for (const q of questions) {
    const size = enc.encode(JSON.stringify(q)).length + 1; // plus the comma
    if (part.length > 0 && bytes + size > maxBytes) {
      parts.push(part);
      part = [];
      bytes = 2;
    }
    part.push(q);
    bytes += size;
  }
  if (part.length > 0) parts.push(part);
  return parts;
}

/** Questions as stored in Convex (learnTests.questions is a JSON string). */
export function parseStoredQuestions(json: string): TestQuestion[] {
  try {
    return toQuestions(JSON.parse(json));
  } catch {
    return [];
  }
}

/** A bounded count from Convex (learn.ts COUNT_CAP): "1,000+" once it reaches the cap. */
export function countText(n: number, capped: boolean): string {
  return `${n.toLocaleString()}${capped ? "+" : ""}`;
}

export function formatScore(score: number, total: number): string {
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const s = Number.isInteger(score) ? String(score) : score.toFixed(1);
  return `${s} of ${total} (${pct}%)`;
}
