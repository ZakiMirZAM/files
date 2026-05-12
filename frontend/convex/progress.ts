import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const getUserProgress = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const progress = await ctx.db
      .query("userProgress")
      .withIndex("by_user_company", (q) => 
        q.eq("userId", userId).eq("companyId", args.companyId)
      )
      .unique();

    return progress;
  },
});

export const updateProgress = mutation({
  args: { 
    companyId: v.id("companies"),
    step: v.number(),
    checkpointId: v.optional(v.id("checkpoints"))
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("userProgress")
      .withIndex("by_user_company", (q) => 
        q.eq("userId", userId).eq("companyId", args.companyId)
      )
      .unique();

    if (existing) {
      const completedCheckpoints = args.checkpointId 
        ? [...existing.completedCheckpoints, args.checkpointId]
        : existing.completedCheckpoints;

      await ctx.db.patch(existing._id, {
        currentStep: Math.max(existing.currentStep, args.step),
        completedCheckpoints,
        lastAccessedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userProgress", {
        userId,
        companyId: args.companyId,
        currentStep: args.step,
        completedCheckpoints: args.checkpointId ? [args.checkpointId] : [],
        startedAt: Date.now(),
        lastAccessedAt: Date.now(),
      });
    }
  },
});
