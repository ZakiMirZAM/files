import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getCompany = query({
  args: { symbol: v.string() },
  handler: async (ctx, args) => {
    const company = await ctx.db
      .query("companies")
      .withIndex("by_symbol", (q) => q.eq("symbol", args.symbol))
      .first();
    return company;
  },
});

export const getMetricsByCategory = query({
  args: { 
    companyId: v.id("companies"),
    category: v.union(
      v.literal("economic"),
      v.literal("quantitative"),
      v.literal("qualitative"),
      v.literal("valuation")
    )
  },
  handler: async (ctx, args) => {
    const metrics = await ctx.db
      .query("metrics")
      .withIndex("by_company_category", (q) => 
        q.eq("companyId", args.companyId).eq("category", args.category)
      )
      .collect();
    
    return metrics.sort((a, b) => a.order - b.order);
  },
});

export const getHistoricalData = query({
  args: { 
    companyId: v.id("companies"),
    metricName: v.string()
  },
  handler: async (ctx, args) => {
    const data = await ctx.db
      .query("historicalData")
      .withIndex("by_company_metric", (q) => 
        q.eq("companyId", args.companyId).eq("metricName", args.metricName)
      )
      .collect();
    
    return data.sort((a, b) => a.year - b.year);
  },
});

export const getCheckpoints = query({
  args: { 
    companyId: v.id("companies"),
    category: v.union(
      v.literal("economic"),
      v.literal("quantitative"),
      v.literal("qualitative"),
      v.literal("valuation")
    )
  },
  handler: async (ctx, args) => {
    const checkpoints = await ctx.db
      .query("checkpoints")
      .withIndex("by_company_category", (q) => 
        q.eq("companyId", args.companyId).eq("category", args.category)
      )
      .collect();
    
    return checkpoints.sort((a, b) => a.order - b.order);
  },
});
