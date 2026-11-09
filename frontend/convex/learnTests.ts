// Learn slice A6: saved practice tests and the user's attempts at them.
// Questions and answers are JSON strings (shapes in src/lib/learnApi.ts).
// Every read and write is checked against the signed-in owner.

import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";

const MAX_TITLE = 200;
const MAX_PROMPT = 4000;
// UTF-8 bytes of one test document's questions, under Convex's 1 MiB document
// limit. The page splits a bigger test into parts (splitTestQuestions in
// src/lib/learnApi.ts), so there is no cap on how many questions a test has.
const MAX_QUESTIONS_BYTES = 900_000;
const MAX_ANSWERS_JSON = 800_000;
const MAX_SOURCE_CARDS = 400;

async function requireUser(ctx: QueryCtx | MutationCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  return userId;
}

async function requireTest(
  ctx: QueryCtx | MutationCtx,
  testId: Id<"learnTests">,
  userId: Id<"users">,
): Promise<Doc<"learnTests">> {
  const test = await ctx.db.get(testId);
  if (!test || test.userId !== userId) throw new Error("Test not found");
  return test;
}

function questionCounts(json: string): { mc: number; short: number } {
  try {
    const list = JSON.parse(json) as { type?: string }[];
    if (!Array.isArray(list)) return { mc: 0, short: 0 };
    return {
      mc: list.filter((q) => q?.type === "mc").length,
      short: list.filter((q) => q?.type === "short").length,
    };
  } catch {
    return { mc: 0, short: 0 };
  }
}

/** The caller's tests, newest first, with question counts and the latest attempt. */
export const listTests = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const tests = await ctx.db
      .query("learnTests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
    return Promise.all(
      tests.map(async (t) => {
        const attempts = await ctx.db
          .query("learnAttempts")
          .withIndex("by_user_test", (q) => q.eq("userId", userId).eq("testId", t._id))
          .collect();
        const last = attempts.reduce<Doc<"learnAttempts"> | null>(
          (best, a) => (!best || a.completedAt > best.completedAt ? a : best),
          null,
        );
        return {
          _id: t._id,
          title: t.title,
          prompt: t.prompt,
          deckId: t.deckId,
          createdAt: t.createdAt,
          ...questionCounts(t.questions),
          attemptCount: attempts.length,
          lastScore: last ? { score: last.score, total: last.total, completedAt: last.completedAt } : null,
        };
      }),
    );
  },
});

/** One test with its questions. Null (not throw) for a stale or foreign id. */
export const getTest = query({
  args: { testId: v.id("learnTests") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const test = await ctx.db.get(args.testId);
    if (!test || test.userId !== userId) return null;
    return test;
  },
});

export const createTest = mutation({
  args: {
    title: v.string(),
    prompt: v.string(),
    deckId: v.optional(v.id("learnDecks")),
    questions: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (new TextEncoder().encode(args.questions).length > MAX_QUESTIONS_BYTES) {
      throw new Error("This part of the test is too large to save in one piece.");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(args.questions);
    } catch {
      throw new Error("The questions could not be read.");
    }
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("A test needs at least one question.");
    if (args.deckId) {
      const deck = await ctx.db.get(args.deckId);
      if (!deck || deck.userId !== userId) throw new Error("Deck not found");
    }
    return ctx.db.insert("learnTests", {
      userId,
      title: args.title.trim().slice(0, MAX_TITLE) || "Practice test",
      prompt: args.prompt.trim().slice(0, MAX_PROMPT),
      deckId: args.deckId,
      questions: args.questions,
      createdAt: Date.now(),
    });
  },
});

export const deleteTest = mutation({
  args: { testId: v.id("learnTests") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await requireTest(ctx, args.testId, userId);
    const attempts = await ctx.db
      .query("learnAttempts")
      .withIndex("by_user_test", (q) => q.eq("userId", userId).eq("testId", args.testId))
      .collect();
    for (const a of attempts) await ctx.db.delete(a._id);
    await ctx.db.delete(args.testId);
  },
});

/** Past attempts at one test, newest first. */
export const listAttempts = query({
  args: { testId: v.id("learnTests") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const test = await ctx.db.get(args.testId);
    if (!test || test.userId !== userId) return [];
    const attempts = await ctx.db
      .query("learnAttempts")
      .withIndex("by_user_test", (q) => q.eq("userId", userId).eq("testId", args.testId))
      .collect();
    return attempts.sort((a, b) => b.completedAt - a.completedAt);
  },
});

export const saveAttempt = mutation({
  args: {
    testId: v.id("learnTests"),
    answers: v.string(),
    score: v.number(),
    total: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await requireTest(ctx, args.testId, userId);
    if (args.answers.length > MAX_ANSWERS_JSON) throw new Error("These answers are too long to save.");
    if (!Number.isFinite(args.score) || !Number.isFinite(args.total) || args.total < 0 || args.score < 0 || args.score > args.total) {
      throw new Error("The score is not valid.");
    }
    return ctx.db.insert("learnAttempts", {
      userId,
      testId: args.testId,
      answers: args.answers,
      score: args.score,
      total: args.total,
      completedAt: Date.now(),
    });
  },
});

/** Up to 400 of a deck's cards (front and back) to build a test from. */
export const deckCardsForTest = query({
  args: { deckId: v.id("learnDecks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const deck = await ctx.db.get(args.deckId);
    if (!deck || deck.userId !== userId) return [];
    const cards = await ctx.db
      .query("learnCards")
      .withIndex("by_user_deck", (q) => q.eq("userId", userId).eq("deckId", args.deckId))
      .take(MAX_SOURCE_CARDS);
    return cards.map((c) => ({ front: c.front, back: c.back }));
  },
});
