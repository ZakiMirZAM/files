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
      await ctx.db.patch(existing._id, {
        answer: args.answer,
        sources: args.sources,
        model: args.model,
        generatedAt: Date.now(),
      });
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
    });
  },
});
