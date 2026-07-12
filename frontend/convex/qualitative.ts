import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

const sectionValidator = v.union(
  v.literal("economic"),
  v.literal("credit"),
  v.literal("sector"),
  v.literal("industry"),
  v.literal("comparative"),
  v.literal("individual"),
  v.literal("final_review"),
);

export const getAnswersForScope = query({
  args: {
    section: sectionValidator,
    scopeKey: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const rows = await ctx.db
      .query("qualitativeAnswers")
      .withIndex("by_user_section_scope", (q) =>
        q.eq("userId", userId).eq("section", args.section).eq("scopeKey", args.scopeKey),
      )
      .collect();

    return rows;
  },
});

export const saveAnswer = mutation({
  args: {
    section: sectionValidator,
    scopeKey: v.string(),
    questionId: v.string(),
    answer: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("qualitativeAnswers")
      .withIndex("by_user_section_scope", (q) =>
        q.eq("userId", userId).eq("section", args.section).eq("scopeKey", args.scopeKey),
      )
      .filter((q) => q.eq(q.field("questionId"), args.questionId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        answer: args.answer,
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("qualitativeAnswers", {
      userId,
      section: args.section,
      scopeKey: args.scopeKey,
      questionId: args.questionId,
      answer: args.answer,
      updatedAt: Date.now(),
    });
  },
});

export const getAllAnswersForUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("qualitativeAnswers")
      .filter((q) => q.eq(q.field("userId"), userId))
      .collect();
  },
});
