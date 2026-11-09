// Learn section (slices A4 + A5): flashcard decks, cards and study reviews.
// Every function checks the signed-in user and only touches that user's rows.

import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";

/** Cards inserted or deleted per transaction; keeps each mutation well under Convex limits. */
const CHUNK = 400;
const MAX_TEXT = 20_000;
const MAX_NAME = 200;
const MAX_TAGS = 50;
const MAX_CARDS_PER_CALL = 20_000;
/**
 * Counts stop here so one query stays inside Convex read limits however big a
 * deck is; the page shows "1,000+" when a count reaches it.
 */
const COUNT_CAP = 1_000;
/** Most due cards one dueCards call returns; the study session asks for the next page as it goes. */
const DUE_PAGE_MAX = 500;

const cardInput = v.object({
  front: v.string(),
  back: v.string(),
  tags: v.optional(v.array(v.string())),
});
type CardInput = { front: string; back: string; tags?: string[] };

const sourceValidator = v.union(v.literal("import"), v.literal("ai"), v.literal("manual"));

async function requireUser(ctx: QueryCtx | MutationCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  return userId;
}

async function requireDeck(
  ctx: QueryCtx | MutationCtx,
  deckId: Id<"learnDecks">,
  userId: Id<"users">,
): Promise<Doc<"learnDecks">> {
  const deck = await ctx.db.get(deckId);
  if (!deck || deck.userId !== userId) throw new Error("Deck not found");
  return deck;
}

async function requireCard(
  ctx: QueryCtx | MutationCtx,
  cardId: Id<"learnCards">,
  userId: Id<"users">,
): Promise<Doc<"learnCards">> {
  const card = await ctx.db.get(cardId);
  if (!card || card.userId !== userId) throw new Error("Card not found");
  return card;
}

function cleanName(name: string): string {
  const n = name.trim().slice(0, MAX_NAME);
  if (!n) throw new Error("Deck name is empty");
  return n;
}

function cleanTags(tags: string[] | undefined): string[] | undefined {
  if (!tags) return undefined;
  const out = tags
    .map((t) => t.trim().slice(0, 100))
    .filter((t) => t.length > 0)
    .slice(0, MAX_TAGS);
  return out.length ? out : undefined;
}

/** Trim and bound a card; null when both sides are empty. */
function cleanCard(c: CardInput): CardInput | null {
  const front = c.front.trim().slice(0, MAX_TEXT);
  const back = c.back.trim().slice(0, MAX_TEXT);
  if (!front && !back) return null;
  return { front, back, tags: cleanTags(c.tags) };
}

async function insertCards(
  ctx: MutationCtx,
  userId: Id<"users">,
  deckId: Id<"learnDecks">,
  cards: CardInput[],
): Promise<void> {
  const now = Date.now();
  for (const raw of cards) {
    const c = cleanCard(raw);
    if (!c) continue;
    await ctx.db.insert("learnCards", {
      userId,
      deckId,
      front: c.front,
      back: c.back,
      tags: c.tags,
      due: now,
      createdAt: now,
    });
  }
}

/** Insert the first chunk now and schedule the rest, one chunk per transaction. */
async function insertCardsChunked(
  ctx: MutationCtx,
  userId: Id<"users">,
  deckId: Id<"learnDecks">,
  cards: CardInput[],
): Promise<void> {
  if (cards.length > MAX_CARDS_PER_CALL) {
    throw new Error(`Too many cards in one call (max ${MAX_CARDS_PER_CALL})`);
  }
  await insertCards(ctx, userId, deckId, cards.slice(0, CHUNK));
  const rest = cards.slice(CHUNK);
  if (rest.length > 0) {
    await ctx.scheduler.runAfter(0, internal.learn.insertCardChunk, { userId, deckId, cards: rest });
  }
}

async function deleteReviewsFor(ctx: MutationCtx, userId: Id<"users">, cardId: Id<"learnCards">) {
  const reviews = await ctx.db
    .query("learnReviews")
    .withIndex("by_user_card", (q) => q.eq("userId", userId).eq("cardId", cardId))
    .collect();
  for (const r of reviews) await ctx.db.delete(r._id);
}

// ── Decks ──────────────────────────────────────────────────────────────────

/** Contract used by the AI deck generator and the importer. Returns the new deckId. */
export const createDeckWithCards = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    source: sourceValidator,
    prompt: v.optional(v.string()),
    cards: v.array(cardInput),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const now = Date.now();
    const deckId = await ctx.db.insert("learnDecks", {
      userId,
      name: cleanName(args.name),
      description: args.description?.trim().slice(0, 2000) || undefined,
      source: args.source,
      prompt: args.prompt?.slice(0, 4000) || undefined,
      createdAt: now,
      updatedAt: now,
    });
    await insertCardsChunked(ctx, userId, deckId, args.cards);
    return deckId;
  },
});

/** Add more cards to an existing deck (the importer sends large decks in parts). */
export const appendCards = mutation({
  args: { deckId: v.id("learnDecks"), cards: v.array(cardInput) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await requireDeck(ctx, args.deckId, userId);
    await insertCardsChunked(ctx, userId, args.deckId, args.cards);
    await ctx.db.patch(args.deckId, { updatedAt: Date.now() });
  },
});

export const insertCardChunk = internalMutation({
  args: { userId: v.id("users"), deckId: v.id("learnDecks"), cards: v.array(cardInput) },
  handler: async (ctx, args) => {
    const deck = await ctx.db.get(args.deckId);
    if (!deck || deck.userId !== args.userId) return; // deck deleted meanwhile
    await insertCardsChunked(ctx, args.userId, args.deckId, args.cards);
  },
});

/** The caller's decks, newest first (metadata only; counts come from deckStats). */
export const listDecks = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const decks = await ctx.db
      .query("learnDecks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return decks.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

/**
 * Card, due and new counts for one deck, each read with a bounded take so a deck
 * of any size stays under Convex read limits. A count that reaches COUNT_CAP is
 * flagged (shown as "1,000+"); `new` is null when the deck is past the cap.
 */
export const deckStats = query({
  args: { deckId: v.id("learnDecks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const deck = await ctx.db.get(args.deckId);
    if (!deck || deck.userId !== userId) return null;
    const cards = await ctx.db
      .query("learnCards")
      .withIndex("by_user_deck", (q) => q.eq("userId", userId).eq("deckId", args.deckId))
      .take(COUNT_CAP + 1);
    const cardsCapped = cards.length > COUNT_CAP;
    const due = await ctx.db
      .query("learnCards")
      .withIndex("by_user_deck_due", (q) => q.eq("userId", userId).eq("deckId", args.deckId).lte("due", Date.now()))
      .take(COUNT_CAP + 1);
    const dueCapped = due.length > COUNT_CAP;
    return {
      cards: Math.min(cards.length, COUNT_CAP),
      cardsCapped,
      due: Math.min(due.length, COUNT_CAP),
      dueCapped,
      new: cardsCapped ? null : cards.filter((c) => !c.srs).length,
    };
  },
});

export const getDeck = query({
  args: { deckId: v.id("learnDecks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const deck = await ctx.db.get(args.deckId);
    if (!deck || deck.userId !== userId) return null;
    return deck;
  },
});

export const renameDeck = mutation({
  args: { deckId: v.id("learnDecks"), name: v.string(), description: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await requireDeck(ctx, args.deckId, userId);
    const patch: Partial<Doc<"learnDecks">> = { name: cleanName(args.name), updatedAt: Date.now() };
    if (args.description !== undefined) patch.description = args.description.trim().slice(0, 2000) || undefined;
    await ctx.db.patch(args.deckId, patch);
  },
});

/** Delete a deck, its cards and their reviews. Big decks finish in background chunks. */
export const deleteDeck = mutation({
  args: { deckId: v.id("learnDecks") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await requireDeck(ctx, args.deckId, userId);
    await ctx.db.delete(args.deckId);
    await deleteCardChunkImpl(ctx, userId, args.deckId);
  },
});

async function deleteCardChunkImpl(ctx: MutationCtx, userId: Id<"users">, deckId: Id<"learnDecks">) {
  const cards = await ctx.db
    .query("learnCards")
    .withIndex("by_user_deck", (q) => q.eq("userId", userId).eq("deckId", deckId))
    .take(CHUNK / 2);
  for (const c of cards) {
    await deleteReviewsFor(ctx, userId, c._id);
    await ctx.db.delete(c._id);
  }
  if (cards.length === CHUNK / 2) {
    await ctx.scheduler.runAfter(0, internal.learn.deleteCardChunk, { userId, deckId });
  }
}

export const deleteCardChunk = internalMutation({
  args: { userId: v.id("users"), deckId: v.id("learnDecks") },
  handler: async (ctx, args) => {
    await deleteCardChunkImpl(ctx, args.userId, args.deckId);
  },
});

// ── Cards ──────────────────────────────────────────────────────────────────

/** One page of a deck's cards, in the order they were added. */
export const deckCards = query({
  args: { deckId: v.id("learnDecks"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const empty = { page: [], isDone: true, continueCursor: "" };
    if (!userId) return empty;
    const deck = await ctx.db.get(args.deckId);
    if (!deck || deck.userId !== userId) return empty;
    return await ctx.db
      .query("learnCards")
      .withIndex("by_user_deck", (q) => q.eq("userId", userId).eq("deckId", args.deckId))
      .paginate(args.paginationOpts);
  },
});

export const addCard = mutation({
  args: {
    deckId: v.id("learnDecks"),
    front: v.string(),
    back: v.string(),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await requireDeck(ctx, args.deckId, userId);
    const c = cleanCard(args);
    if (!c) throw new Error("Card is empty");
    const now = Date.now();
    const id = await ctx.db.insert("learnCards", {
      userId,
      deckId: args.deckId,
      front: c.front,
      back: c.back,
      tags: c.tags,
      due: now,
      createdAt: now,
    });
    await ctx.db.patch(args.deckId, { updatedAt: now });
    return id;
  },
});

export const updateCard = mutation({
  args: {
    cardId: v.id("learnCards"),
    front: v.string(),
    back: v.string(),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await requireCard(ctx, args.cardId, userId);
    const c = cleanCard(args);
    if (!c) throw new Error("Card is empty");
    await ctx.db.patch(args.cardId, { front: c.front, back: c.back, tags: c.tags });
  },
});

export const deleteCard = mutation({
  args: { cardId: v.id("learnCards") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await requireCard(ctx, args.cardId, userId);
    await deleteReviewsFor(ctx, userId, args.cardId);
    await ctx.db.delete(args.cardId);
  },
});

// ── Study ──────────────────────────────────────────────────────────────────

/**
 * One page of the cards due as of `asOf`, oldest due first. `deckId` narrows to
 * one deck. A page holds at most DUE_PAGE_MAX cards; the study session passes
 * back `continueCursor` and `asOf` for the next page, so "All due" still covers
 * every due card without one huge read. `asOf` stays fixed for a session so the
 * index range (and the cursor) does not shift while cards are rated.
 */
export const dueCards = query({
  args: {
    deckId: v.optional(v.id("learnDecks")),
    numItems: v.number(),
    cursor: v.union(v.string(), v.null()),
    asOf: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const asOf = args.asOf !== undefined && Number.isFinite(args.asOf) ? Math.min(args.asOf, now) : now;
    const empty = { page: [] as Doc<"learnCards">[], isDone: true, continueCursor: "", asOf };
    const userId = await getAuthUserId(ctx);
    if (!userId) return empty;
    const numItems = Math.min(DUE_PAGE_MAX, Math.max(1, Math.floor(args.numItems) || 1));
    const deckId = args.deckId;
    if (deckId) {
      const deck = await ctx.db.get(deckId);
      if (!deck || deck.userId !== userId) return empty;
    }
    const q = deckId
      ? ctx.db
          .query("learnCards")
          .withIndex("by_user_deck_due", (ix) => ix.eq("userId", userId).eq("deckId", deckId).lte("due", asOf))
      : ctx.db.query("learnCards").withIndex("by_user_due", (ix) => ix.eq("userId", userId).lte("due", asOf));
    const res = await q.paginate({ numItems, cursor: args.cursor });
    return { page: res.page, isDone: res.isDone, continueCursor: res.continueCursor, asOf };
  },
});

/**
 * How many cards are due now, for one deck or all decks. Counted with a bounded
 * take: `capped` means at least COUNT_CAP are due (shown as "1,000+").
 */
export const dueCount = query({
  args: { deckId: v.optional(v.id("learnDecks")) },
  handler: async (ctx, args) => {
    const none = { count: 0, capped: false };
    const userId = await getAuthUserId(ctx);
    if (!userId) return none;
    const deckId = args.deckId;
    if (deckId) {
      const deck = await ctx.db.get(deckId);
      if (!deck || deck.userId !== userId) return none;
    }
    const now = Date.now();
    const q = deckId
      ? ctx.db
          .query("learnCards")
          .withIndex("by_user_deck_due", (ix) => ix.eq("userId", userId).eq("deckId", deckId).lte("due", now))
      : ctx.db.query("learnCards").withIndex("by_user_due", (ix) => ix.eq("userId", userId).lte("due", now));
    const rows = await q.take(COUNT_CAP + 1);
    return { count: Math.min(rows.length, COUNT_CAP), capped: rows.length > COUNT_CAP };
  },
});

/** Save a study rating: the card's new FSRS state and due time, plus a review row. */
export const recordReview = mutation({
  args: {
    cardId: v.id("learnCards"),
    rating: v.number(),
    srs: v.string(),
    due: v.number(),
    log: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await requireCard(ctx, args.cardId, userId);
    if (![1, 2, 3, 4].includes(args.rating)) throw new Error("Rating must be 1 to 4");
    if (!Number.isFinite(args.due)) throw new Error("Bad due time");
    await ctx.db.patch(args.cardId, { srs: args.srs.slice(0, 4000), due: args.due });
    await ctx.db.insert("learnReviews", {
      userId,
      cardId: args.cardId,
      rating: args.rating,
      reviewedAt: Date.now(),
      log: args.log?.slice(0, 4000),
    });
  },
});
