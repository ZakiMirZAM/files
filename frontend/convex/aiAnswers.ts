import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

// Cache for AI-generated question answers, mirroring qualitative.ts. Keyed by
// (user, section, scopeKey, questionId). Reopening a question reads the cached
// row instead of re-querying Claude; the panel's Regenerate overwrites it.

const sectionValidator = v.union(
  v.literal("economic"),
  v.literal("credit"),
  v.literal("sector"),
  v.literal("industry"),
  v.literal("comparative"),
  v.literal("individual"),
  v.literal("final_review"),
);

export const getAiAnswer = query({
  args: {
    section: sectionValidator,
    scopeKey: v.string(),
    questionId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const row = await ctx.db
      .query("aiAnswers")
      .withIndex("by_user_section_scope", (q) =>
        q.eq("userId", userId).eq("section", args.section).eq("scopeKey", args.scopeKey),
      )
      .filter((q) => q.eq(q.field("questionId"), args.questionId))
      .first();

    return row; // the row, or null when not yet generated
  },
});

export const saveAiAnswer = mutation({
  args: {
    section: sectionValidator,
    scopeKey: v.string(),
    questionId: v.string(),
    answer: v.string(),
    sources: v.string(),
    model: v.string(),
    /** Serialized verification report, when the server returned one. */
    verification: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("aiAnswers")
      .withIndex("by_user_section_scope", (q) =>
        q.eq("userId", userId).eq("section", args.section).eq("scopeKey", args.scopeKey),
      )
      .filter((q) => q.eq(q.field("questionId"), args.questionId))
      .first();

    if (existing) {
      // A Regenerate produces a fresh, unrevised answer, so it has NO pre-revision
      // original yet: clear `answerOriginal` here and let the following Tier-1
      // saveVerification set it (write-once) for THIS generation. The previous
      // write-once-in-saveAiAnswer conflated a Regenerate with a revision, so after
      // regenerate+revise the "Show original" toggle showed an unrelated old draft.
      const patch: {
        answer: string;
        sources: string;
        model: string;
        generatedAt: number;
        verification?: string;
        answerOriginal?: string;
      } = {
        answer: args.answer,
        sources: args.sources,
        model: args.model,
        generatedAt: Date.now(),
        // Passing undefined clears any report left over from the previous answer.
        verification: args.verification,
        answerOriginal: undefined,
      };
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("aiAnswers", {
      userId,
      section: args.section,
      scopeKey: args.scopeKey,
      questionId: args.questionId,
      answer: args.answer,
      sources: args.sources,
      model: args.model,
      generatedAt: Date.now(),
      verification: args.verification,
    });
  },
});

/**
 * Persist the verification report (and, when a Tier 1 pass revised the text, the
 * revised answer) onto an already-saved row, so the status survives a reload.
 * Touches only those fields: the answer, sources and model of an unrevised row
 * are left exactly as `saveAiAnswer` wrote them.
 */
export const saveVerification = mutation({
  args: {
    section: sectionValidator,
    scopeKey: v.string(),
    questionId: v.string(),
    verification: v.string(),
    revisedAnswer: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("aiAnswers")
      .withIndex("by_user_section_scope", (q) =>
        q.eq("userId", userId).eq("section", args.section).eq("scopeKey", args.scopeKey),
      )
      .filter((q) => q.eq(q.field("questionId"), args.questionId))
      .first();

    // The row can be gone (never cached, or regenerated into a different key).
    // Verification is commentary on an answer, so no row means nothing to do.
    if (!existing) return null;

    const patch: { verification: string; answer?: string; answerOriginal?: string } = {
      verification: args.verification,
    };
    const revised = args.revisedAnswer?.trim();
    if (revised && revised !== existing.answer) {
      patch.answer = revised;
      if (existing.answerOriginal === undefined) patch.answerOriginal = existing.answer;
    }
    await ctx.db.patch(existing._id, patch);
    return existing._id;
  },
});
