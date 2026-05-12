import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const applicationTables = {
  companies: defineTable({
    symbol: v.string(),
    name: v.string(),
    sector: v.string(),
    industry: v.string(),
    description: v.string(),
    marketCap: v.number(),
    employees: v.optional(v.number()),
    founded: v.optional(v.number()),
    headquarters: v.optional(v.string()),
  }).index("by_symbol", ["symbol"]),

  metrics: defineTable({
    companyId: v.id("companies"),
    category: v.union(
      v.literal("economic"),
      v.literal("quantitative"),
      v.literal("qualitative"),
      v.literal("valuation")
    ),
    name: v.string(),
    value: v.union(v.number(), v.string()),
    unit: v.optional(v.string()),
    explanation: v.string(),
    industryContext: v.string(),
    macroContext: v.string(),
    trendInterpretation: v.string(),
    keyInsights: v.array(v.string()),
    order: v.number(),
  }).index("by_company_category", ["companyId", "category"]),

  historicalData: defineTable({
    companyId: v.id("companies"),
    metricName: v.string(),
    year: v.number(),
    value: v.number(),
  }).index("by_company_metric", ["companyId", "metricName"]),

  checkpoints: defineTable({
    companyId: v.id("companies"),
    category: v.union(
      v.literal("economic"),
      v.literal("quantitative"),
      v.literal("qualitative"),
      v.literal("valuation")
    ),
    question: v.string(),
    options: v.array(v.string()),
    correctAnswer: v.number(),
    explanation: v.string(),
    order: v.number(),
  }).index("by_company_category", ["companyId", "category"]),

  userProgress: defineTable({
    userId: v.id("users"),
    companyId: v.id("companies"),
    currentStep: v.number(), // 1-4 for the four categories
    completedCheckpoints: v.array(v.id("checkpoints")),
    startedAt: v.number(),
    lastAccessedAt: v.number(),
  }).index("by_user_company", ["userId", "companyId"]),
};

export default defineSchema({
  ...authTables,
  ...applicationTables,
});
