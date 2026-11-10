// Learn slice A7: book notes. A book is the owner's marked PDF (plus, when
// given, the clean original); its notes are the marks found in it, each with
// a small picture. Every function checks the signed-in user and ownership.
// Each upload is claimed in learnFiles (first claim wins); a file is only
// attached, served or deleted for the user holding that claim.

import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";

const kindValidator = v.union(
  v.literal("handwriting"),
  v.literal("underline"),
  v.literal("highlight"),
  v.literal("note"),
  v.literal("mark"),
);
const methodValidator = v.union(v.literal("annotation"), v.literal("comparison"));

/** Most notes one addNotes call may write. */
const MAX_NOTES_PER_CALL = 50;
/** Notes removed per step when a book is deleted. */
const DELETE_BATCH = 200;
async function requireUser(ctx: QueryCtx | MutationCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  return userId;
}

async function requireBook(
  ctx: QueryCtx | MutationCtx,
  bookId: Id<"learnBooks">,
  userId: Id<"users">,
): Promise<Doc<"learnBooks">> {
  const book = await ctx.db.get(bookId);
  if (!book || book.userId !== userId) throw new Error("Book not found");
  return book;
}

async function ownsFile(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  storageId: Id<"_storage">,
): Promise<boolean> {
  const row = await ctx.db
    .query("learnFiles")
    .withIndex("by_user_storage", (q) => q.eq("userId", userId).eq("storageId", storageId))
    .first();
  return row !== null;
}

async function requireOwnedFile(ctx: MutationCtx, userId: Id<"users">, storageId: Id<"_storage">): Promise<void> {
  if (!(await ownsFile(ctx, userId, storageId))) throw new Error("File not found");
}

/** URL of a file the user owns, or null. */
async function ownedUrl(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  storageId: Id<"_storage"> | undefined,
): Promise<string | null> {
  if (!storageId || !(await ownsFile(ctx, userId, storageId))) return null;
  return await ctx.storage.getUrl(storageId);
}

/** Deletes a file and its ownership row, only when the user owns it. */
async function deleteOwnedFile(ctx: MutationCtx, userId: Id<"users">, storageId: Id<"_storage">): Promise<void> {
  const rows = await ctx.db
    .query("learnFiles")
    .withIndex("by_user_storage", (q) => q.eq("userId", userId).eq("storageId", storageId))
    .collect();
  if (rows.length === 0) return;
  const meta = await ctx.db.system.get(storageId);
  if (meta) await ctx.storage.delete(storageId);
  for (const r of rows) await ctx.db.delete(r._id);
}

function cleanTitle(s: string): string {
  const t = s.trim().slice(0, 200);
  return t || "Untitled book";
}

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Claims a fresh upload for the caller. The first claim wins: claiming your
 * own file again does nothing, and a file someone else claimed (here or as a
 * notebook picture) is refused.
 */
export const claimFile = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const meta = await ctx.db.system.get(args.storageId);
    if (!meta) throw new Error("File not found");
    const existing = await ctx.db
      .query("learnFiles")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .first();
    if (existing) {
      if (existing.userId !== userId) throw new Error("File not found");
      return;
    }
    const notebook = await ctx.db
      .query("noteFiles")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .first();
    if (notebook) throw new Error("File not found");
    await ctx.db.insert("learnFiles", { userId, storageId: args.storageId, createdAt: Date.now() });
  },
});

/** Removes an upload the caller owns, for files that never reached a book or note. */
export const discardFile = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await deleteOwnedFile(ctx, userId, args.storageId);
  },
});

/**
 * A book is either an uploaded copy (`storageId`) or a PDF in the owner's local
 * Books folder (`localPath`, the local bookshelf); exactly one of the two.
 */
export const createBook = mutation({
  args: {
    title: v.string(),
    fileName: v.string(),
    storageId: v.optional(v.id("_storage")),
    localPath: v.optional(v.string()),
    cleanStorageId: v.optional(v.id("_storage")),
    pageCount: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const localPath = args.localPath?.trim().slice(0, 1000);
    if ((args.storageId === undefined) === !localPath) {
      throw new Error("A book needs either an uploaded file or a local path");
    }
    if (args.storageId) await requireOwnedFile(ctx, userId, args.storageId);
    if (args.cleanStorageId) await requireOwnedFile(ctx, userId, args.cleanStorageId);
    const now = Date.now();
    return await ctx.db.insert("learnBooks", {
      userId,
      title: cleanTitle(args.title),
      fileName: args.fileName.slice(0, 300),
      ...(args.storageId ? { storageId: args.storageId } : { localPath }),
      ...(args.cleanStorageId ? { cleanStorageId: args.cleanStorageId } : {}),
      pageCount: Math.max(0, Math.floor(args.pageCount)),
      noteCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const renameBook = mutation({
  args: { bookId: v.id("learnBooks"), title: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await requireBook(ctx, args.bookId, userId);
    await ctx.db.patch(args.bookId, { title: cleanTitle(args.title), updatedAt: Date.now() });
  },
});

export const addNotes = mutation({
  args: {
    bookId: v.id("learnBooks"),
    notes: v.array(
      v.object({
        page: v.number(),
        kind: kindValidator,
        method: methodValidator,
        imageStorageId: v.optional(v.id("_storage")),
        rect: v.optional(v.string()),
        text: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const book = await requireBook(ctx, args.bookId, userId);
    if (args.notes.length > MAX_NOTES_PER_CALL) throw new Error("Too many notes in one call");
    for (const n of args.notes) {
      if (n.imageStorageId) await requireOwnedFile(ctx, userId, n.imageStorageId);
    }
    const now = Date.now();
    for (const n of args.notes) {
      await ctx.db.insert("learnBookNotes", {
        userId,
        bookId: args.bookId,
        page: Math.max(1, Math.floor(n.page)),
        kind: n.kind,
        method: n.method,
        ...(n.imageStorageId ? { imageStorageId: n.imageStorageId } : {}),
        ...(n.rect ? { rect: n.rect.slice(0, 200) } : {}),
        ...(n.text ? { text: n.text.slice(0, 5000) } : {}),
        createdAt: now,
      });
    }
    await ctx.db.patch(args.bookId, { noteCount: book.noteCount + args.notes.length, updatedAt: now });
  },
});

export const listBooks = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const books = await ctx.db
      .query("learnBooks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return books
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((b) => ({
        _id: b._id,
        title: b.title,
        fileName: b.fileName,
        localPath: b.localPath ?? null,
        hasClean: b.cleanStorageId !== undefined,
        pageCount: b.pageCount,
        noteCount: b.noteCount,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
      }));
  },
});

export const bookNotes = query({
  args: { bookId: v.id("learnBooks"), kind: v.optional(kindValidator) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const book = await ctx.db.get(args.bookId);
    if (!book || book.userId !== userId) return [];
    const notes = await ctx.db
      .query("learnBookNotes")
      .withIndex("by_user_book", (q) => q.eq("userId", userId).eq("bookId", args.bookId))
      .collect();
    const picked = args.kind ? notes.filter((n) => n.kind === args.kind) : notes;
    picked.sort((a, b) => a.page - b.page || a._creationTime - b._creationTime);
    return await Promise.all(
      picked.map(async (n) => ({
        _id: n._id,
        page: n.page,
        kind: n.kind,
        method: n.method,
        rect: n.rect,
        text: n.text,
        imageUrl: await ownedUrl(ctx, userId, n.imageStorageId),
      })),
    );
  },
});

export const bookFileUrl = query({
  args: { bookId: v.id("learnBooks"), which: v.optional(v.union(v.literal("marked"), v.literal("clean"))) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const book = await ctx.db.get(args.bookId);
    if (!book || book.userId !== userId) return null;
    return await ownedUrl(ctx, userId, args.which === "clean" ? book.cleanStorageId : book.storageId);
  },
});

export const noteImageUrl = query({
  args: { noteId: v.id("learnBookNotes") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const note = await ctx.db.get(args.noteId);
    if (!note || note.userId !== userId) return null;
    return await ownedUrl(ctx, userId, note.imageStorageId);
  },
});

/**
 * Deletes the book and its uploaded PDFs now; its notes and their pictures go in
 * batches (a long book can have many) through a scheduled follow-up.
 */
export const deleteBook = mutation({
  args: { bookId: v.id("learnBooks") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const book = await requireBook(ctx, args.bookId, userId);
    // A local-bookshelf book has no uploaded copy; its PDF stays in the Books folder.
    if (book.storageId) await deleteOwnedFile(ctx, userId, book.storageId);
    if (book.cleanStorageId) await deleteOwnedFile(ctx, userId, book.cleanStorageId);
    await ctx.db.delete(args.bookId);
    await deleteNotesBatch(ctx, userId, args.bookId);
  },
});

async function deleteNotesBatch(ctx: MutationCtx, userId: Id<"users">, bookId: Id<"learnBooks">): Promise<void> {
  const batch = await ctx.db
    .query("learnBookNotes")
    .withIndex("by_user_book", (q) => q.eq("userId", userId).eq("bookId", bookId))
    .take(DELETE_BATCH);
  for (const n of batch) {
    if (n.imageStorageId) await deleteOwnedFile(ctx, userId, n.imageStorageId);
    await ctx.db.delete(n._id);
  }
  if (batch.length === DELETE_BATCH) {
    await ctx.scheduler.runAfter(0, internal.books.deleteNotesStep, { userId, bookId });
  }
}

export const deleteNotesStep = internalMutation({
  args: { userId: v.id("users"), bookId: v.id("learnBooks") },
  handler: async (ctx, args) => {
    await deleteNotesBatch(ctx, args.userId, args.bookId);
  },
});
