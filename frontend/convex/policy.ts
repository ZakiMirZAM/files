import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

// Investment Policy Statement: one per user. Reilly & Brown make the written
// policy statement step one of the whole process: objectives and constraints
// come before any analysis, and every thesis is judged against them.

export const getPolicy = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    return await ctx.db
      .query("policy")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
  },
});

export const savePolicy = mutation({
  args: {
    objectives: v.string(),
    riskTolerance: v.union(
      v.literal("conservative"),
      v.literal("balanced"),
      v.literal("aggressive"),
    ),
    horizonYears: v.number(),
    liquidityNeeds: v.string(),
    taxNotes: v.string(),
    constraints: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("policy")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: Date.now() });
      return existing._id;
    }

    return await ctx.db.insert("policy", {
      userId,
      ...args,
      updatedAt: Date.now(),
    });
  },
});
