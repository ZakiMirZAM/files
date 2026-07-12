import {
  action,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";

const EMPTY_DOC = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] });

async function requireUser(ctx: QueryCtx | MutationCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  return userId;
}

async function requireNote(
  ctx: MutationCtx,
  noteId: Id<"notes">,
  userId: Id<"users">,
): Promise<Doc<"notes">> {
  const note = await ctx.db.get(noteId);
  if (!note || note.userId !== userId) throw new Error("Note not found");
  return note;
}

export const listNotes = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const notes = await ctx.db
      .query("notes")
      .withIndex("by_user_updated", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    // Strip content — the list subscription only needs metadata.
    return notes.map((n) => ({
      _id: n._id,
      title: n.title,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    }));
  },
});

export const getNote = query({
  args: { noteId: v.id("notes") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    // Null (not throw) so a stale stored note id degrades gracefully client-side.
    const note = await ctx.db.get(args.noteId);
    if (!note || note.userId !== userId) return null;
    return note;
  },
});

export const createNote = mutation({
  args: { title: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const now = Date.now();
    return await ctx.db.insert("notes", {
      userId,
      title: args.title ?? "Untitled",
      content: EMPTY_DOC,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const renameNote = mutation({
  args: { noteId: v.id("notes"), title: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await requireNote(ctx, args.noteId, userId);
    await ctx.db.patch(args.noteId, { title: args.title, updatedAt: Date.now() });
  },
});

export const updateNote = mutation({
  args: { noteId: v.id("notes"), content: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await requireNote(ctx, args.noteId, userId);
    await ctx.db.patch(args.noteId, { content: args.content, updatedAt: Date.now() });
  },
});

export const deleteNote = mutation({
  args: { noteId: v.id("notes") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await requireNote(ctx, args.noteId, userId);
    await ctx.db.delete(args.noteId);
  },
});

// NOTE: Convex cannot enforce type/size limits on generateUploadUrl uploads —
// the client validates (image/*, ≤5MB) but a direct caller could upload
// anything. Blast radius is storage cost only; files are never served as HTML.
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

// Claims ownership of a fresh upload (first-write-wins) and returns its URL.
// Every later read of the file is gated on the noteFiles ownership row.
export const registerImage = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);

    const existing = await ctx.db
      .query("noteFiles")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .first();
    if (existing && existing.userId !== userId) throw new Error("File not found");
    if (!existing) {
      await ctx.db.insert("noteFiles", {
        userId,
        storageId: args.storageId,
        createdAt: Date.now(),
      });
    }

    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) throw new Error("File not found");
    return url;
  },
});

export const fileOwnedByUser = internalQuery({
  args: { storageId: v.id("_storage"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("noteFiles")
      .withIndex("by_user_storage", (q) =>
        q.eq("userId", args.userId).eq("storageId", args.storageId),
      )
      .first();
    return row !== null;
  },
});

// PDF-export fallback: serve a stored image as base64 so the client can build a
// data URL when cross-origin canvas drawing is blocked.
export const getImageBase64 = action({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const owned = await ctx.runQuery(internal.notes.fileOwnedByUser, {
      storageId: args.storageId,
      userId,
    });
    if (!owned) throw new Error("File not found");

    const blob = await ctx.storage.get(args.storageId);
    if (!blob) throw new Error("File not found");

    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    const CHUNK = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return { mime: blob.type || "image/png", base64: btoa(binary) };
  },
});
