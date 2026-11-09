import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildDeckCards,
  buildTestQuestions,
  clipAvoid,
  clipSourceCards,
  formatScore,
  generateCards,
  gradeShortAnswer,
  nextQuestionBatch,
  parseStoredQuestions,
  questionPoints,
  scoreTest,
  splitTestQuestions,
  toQuestions,
  type TestQuestion,
} from "./learnApi";

const MC: TestQuestion = { type: "mc", prompt: "Q1", choices: ["a", "b", "c", "d"], answer: 2, explanation: "e" };
const SHORT: TestQuestion = { type: "short", prompt: "Q2", answer: "model" };

function stubReplies(replies: unknown[]) {
  const f = vi.fn(async (_url: string, _init?: RequestInit) => {
    const next = replies.shift();
    return new Response(typeof next === "string" ? next : JSON.stringify(next), { status: 200 });
  });
  vi.stubGlobal("fetch", f);
  return f;
}

function bodyOf(f: ReturnType<typeof stubReplies>, call: number): Record<string, unknown> {
  return JSON.parse(String(f.mock.calls[call][1]?.body)) as Record<string, unknown>;
}

const card = (front: string) => ({ front, back: "- b", tags: [] });

afterEach(() => vi.unstubAllGlobals());

describe("postLearn errors", () => {
  it("surfaces the server or proxy error sentence", async () => {
    stubReplies(['   {"answer":"","sources":[],"error":"AI backend temporarily unavailable"}']);
    await expect(generateCards("x", 1)).rejects.toThrow("AI backend temporarily unavailable");
  });
  it("names an empty body as a cut connection", async () => {
    stubReplies(["    "]);
    await expect(generateCards("x", 1)).rejects.toThrow("connection closed");
  });
  it("names a rate limit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 429 })));
    await expect(generateCards("x", 1)).rejects.toThrow("Too many AI requests");
  });
  it("sends the sidebar model choice", async () => {
    const f = stubReplies([{ cards: [card("a")] }]);
    await generateCards("x", 1);
    expect(bodyOf(f, 0).model).toBe("opus");
    expect(String(f.mock.calls[0][0])).toMatch(/\/learn\/cards$/);
  });
});

describe("buildDeckCards", () => {
  it("asks in batches of 25, passes the fronts made so far, and reports progress", async () => {
    const first = Array.from({ length: 25 }, (_, i) => card(`f${i}`));
    const second = Array.from({ length: 5 }, (_, i) => card(`g${i}`));
    const f = stubReplies([{ cards: first }, { cards: second }]);
    const progress: number[] = [];
    const out = await buildDeckCards("CFA", 30, { onProgress: (m) => progress.push(m.length) });
    expect(out).toHaveLength(30);
    expect(bodyOf(f, 0).count).toBe(25);
    expect(bodyOf(f, 1).count).toBe(5);
    expect((bodyOf(f, 1).avoid as string[]).length).toBe(25);
    expect(progress).toEqual([25, 30]);
  });
  it("drops repeats and stops after two batches that add nothing", async () => {
    stubReplies([{ cards: [card("a"), card("A")] }, { cards: [card("a")] }, { cards: [card("a")] }]);
    const out = await buildDeckCards("x", 10);
    expect(out.map((c) => c.front)).toEqual(["a"]);
  });
  it("stops between batches when asked", async () => {
    const f = stubReplies([{ cards: [card("a")] }]);
    let stop = false;
    const out = await buildDeckCards("x", 50, { onProgress: () => (stop = true), shouldStop: () => stop });
    expect(out).toHaveLength(1);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("buildTestQuestions", () => {
  it("splits counts into batches of 15, multiple choice first", () => {
    expect(nextQuestionBatch(20, 5)).toEqual({ mc: 15, short: 0 });
    expect(nextQuestionBatch(5, 20)).toEqual({ mc: 5, short: 10 });
    expect(nextQuestionBatch(0, 3)).toEqual({ mc: 0, short: 3 });
  });
  it("fills each type to its own count", async () => {
    const f = stubReplies([
      { questions: [MC, { ...MC, prompt: "Q3" }] },
      { questions: [SHORT] },
    ]);
    const out = await buildTestQuestions({ request: "bonds" }, 2, 1);
    expect(out.map((q) => q.type)).toEqual(["mc", "mc", "short"]);
    expect(bodyOf(f, 0)).toMatchObject({ mcCount: 2, shortCount: 1 });
    expect(bodyOf(f, 1)).toMatchObject({ mcCount: 0, shortCount: 1, avoid: ["Q1", "Q3"] });
  });
});

describe("gradeShortAnswer", () => {
  it("returns the score and feedback", async () => {
    stubReplies([{ score: 0.5, feedback: "Close." }]);
    await expect(gradeShortAnswer({ question: "q", modelAnswer: "m", userAnswer: "u", selfScore: 1 })).resolves.toEqual({
      score: 0.5,
      feedback: "Close.",
    });
  });
  it("rejects an unreadable grade", async () => {
    stubReplies([{ score: 0.7, feedback: "x" }]);
    await expect(gradeShortAnswer({ question: "q", modelAnswer: "m", userAnswer: "u" })).rejects.toThrow("could not be read");
  });
});

describe("questions and scores", () => {
  it("validates stored questions", () => {
    expect(toQuestions([MC, SHORT, { type: "mc", prompt: "x", choices: ["a"], answer: 0 }, { type: "short", prompt: "y" }, 3])).toEqual([MC, SHORT]);
    expect(parseStoredQuestions("not json")).toEqual([]);
    expect(parseStoredQuestions(JSON.stringify([MC]))).toEqual([MC]);
  });
  it("scores multiple choice by the choice and short answers by the AI grade, else the self grade", () => {
    expect(questionPoints(MC, { choice: 2 })).toBe(1);
    expect(questionPoints(MC, { choice: 1 })).toBe(0);
    expect(questionPoints(MC, undefined)).toBe(0);
    expect(questionPoints(SHORT, { selfScore: 1 })).toBe(1);
    expect(questionPoints(SHORT, { selfScore: 1, aiScore: 0.5 })).toBe(0.5);
    expect(scoreTest([MC, SHORT], { 0: { choice: 2 }, 1: { selfScore: 0.5 } })).toEqual({ score: 1.5, total: 2 });
    expect(formatScore(1.5, 2)).toBe("1.5 of 2 (75%)");
    expect(formatScore(0, 0)).toBe("0 of 0 (0%)");
  });
});

describe("request size", () => {
  it("keeps only the most recent avoid items the server reads, each clipped", () => {
    const many = Array.from({ length: 10_000 }, (_, i) => `front ${i}`);
    const out = clipAvoid(many);
    expect(out).toHaveLength(600);
    expect(out[out.length - 1]).toBe("front 9999");
    expect(clipAvoid(["  " + "x".repeat(500) + "  ", " "])).toEqual(["x".repeat(200)]);
    const long = Array.from({ length: 600 }, (_, i) => `${i}`.padEnd(200, "y"));
    const kept = clipAvoid(long);
    expect(kept.reduce((n, x) => n + x.length + 1, 0)).toBeLessThanOrEqual(40_000);
    expect(kept[kept.length - 1]).toBe(long[long.length - 1]);
  });
  it("clips deck source cards to 400 and each side to the server's lengths", () => {
    const cards = Array.from({ length: 1000 }, () => ({ front: "f".repeat(500), back: "b".repeat(5000) }));
    const out = clipSourceCards(cards);
    expect(out.length).toBeLessThanOrEqual(400);
    expect(out[0]).toEqual({ front: "f".repeat(300), back: "b".repeat(1200) });
    expect(out.reduce((n, c) => n + c.front.length + c.back.length, 0)).toBeLessThanOrEqual(80_000);
  });
  it("sends a clipped avoid list on a long deck", async () => {
    const f = stubReplies([{ cards: [card("a")] }]);
    await generateCards("x", 1, Array.from({ length: 5000 }, (_, i) => `c${i}`));
    expect((bodyOf(f, 0).avoid as string[]).length).toBe(600);
  });
});

describe("splitTestQuestions", () => {
  it("keeps a small test in one part", () => {
    expect(splitTestQuestions([MC, SHORT])).toEqual([[MC, SHORT]]);
  });
  it("splits a large test into ordered parts that each fit", () => {
    const qs: TestQuestion[] = Array.from({ length: 50 }, (_, i) => ({ type: "short", prompt: `Q${i}`, answer: "z".repeat(100) }));
    const parts = splitTestQuestions(qs, 1_000);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.flat()).toEqual(qs);
    for (const p of parts) expect(new TextEncoder().encode(JSON.stringify(p)).length).toBeLessThanOrEqual(1_000);
  });
});
