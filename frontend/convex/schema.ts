import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const applicationTables = {
  // Stored qualitative answers per user + section + scope key (e.g. ticker, industry)
  qualitativeAnswers: defineTable({
    userId: v.id("users"),
    section: v.union(
      v.literal("economic"),
      v.literal("credit"),
      v.literal("sector"),
      v.literal("industry"),
      v.literal("comparative"),
      v.literal("individual"),
      v.literal("final_review"),
    ),
    scopeKey: v.string(), // "global" for economic, industry name for industry/comparative, ticker for individual
    questionId: v.string(),
    answer: v.string(),
    updatedAt: v.number(),
  })
    .index("by_user_section_scope", ["userId", "section", "scopeKey"])
    .index("by_user_question", ["userId", "questionId"]),

  // Cached AI ("Explain using AI") answers per user + section + scope + question, so
  // reopening an explanation does not re-query Claude. Regenerate overwrites the row.
  aiAnswers: defineTable({
    userId: v.id("users"),
    section: v.union(
      v.literal("economic"),
      v.literal("credit"),
      v.literal("sector"),
      v.literal("industry"),
      v.literal("comparative"),
      v.literal("individual"),
      v.literal("final_review"),
    ),
    scopeKey: v.string(),
    questionId: v.string(),
    answer: v.string(),
    sources: v.string(), // JSON array of vault source filenames
    model: v.string(),
    generatedAt: v.number(),
    // Serialized verification report from the RAG server's reconciliation pass
    // (counts always, per-claim detail only when the server runs in `on` mode).
    // Optional: the table already has rows, and a required field fails deploy.
    verification: v.optional(v.string()),
    // The answer text as first generated, kept when a later write replaces
    // `answer` (a Tier 1 revision, or a Regenerate) so the original survives.
    answerOriginal: v.optional(v.string()),
  })
    .index("by_user_section_scope", ["userId", "section", "scopeKey"])
    .index("by_user_question", ["userId", "questionId"]),

  // Final report: one per user (Tiptap JSON)
  reports: defineTable({
    userId: v.id("users"),
    title: v.string(),
    content: v.string(), // Tiptap JSON serialized
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // Investment Policy Statement: one per user (Reilly & Brown Ch.2: written
  // objectives and constraints every thesis gets judged against).
  policy: defineTable({
    userId: v.id("users"),
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
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // Notebook notes: many per user (Tiptap JSON)
  notes: defineTable({
    userId: v.id("users"),
    title: v.string(),
    content: v.string(), // Tiptap JSON serialized
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user_updated", ["userId", "updatedAt"]),

  // Ownership of notebook image uploads: gates file URL/byte access per user
  noteFiles: defineTable({
    userId: v.id("users"),
    storageId: v.id("_storage"),
    createdAt: v.number(),
  })
    .index("by_storage", ["storageId"])
    .index("by_user_storage", ["userId", "storageId"]),

  // Saved tickers / industries the user is analyzing (recents)
  watchlist: defineTable({
    userId: v.id("users"),
    kind: v.union(v.literal("ticker"), v.literal("industry")),
    value: v.string(),
    addedAt: v.number(),
  }).index("by_user_kind", ["userId", "kind"]),

  // ── Stock simulator (paper trading) ──────────────────────────────────────
  // Cash wallet: one row per user. Seeded to STARTING_CASH on first trade.
  simPortfolio: defineTable({
    userId: v.id("users"),
    cashUsd: v.number(),
    startingCashUsd: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // Open positions: one row per held ticker. avgCostUsd is the cost basis in USD.
  simPositions: defineTable({
    userId: v.id("users"),
    ticker: v.string(),
    shares: v.number(),
    avgCostUsd: v.number(),
    currency: v.string(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_ticker", ["userId", "ticker"]),

  // Append-only trade blotter.
  simTrades: defineTable({
    userId: v.id("users"),
    ticker: v.string(),
    side: v.union(v.literal("buy"), v.literal("sell")),
    shares: v.number(),
    priceLocal: v.number(), // execution price in the instrument's own currency
    priceUsd: v.number(), // execution price converted to USD
    currency: v.string(),
    fxRate: v.number(), // USD per 1 unit of `currency` at execution
    valueUsd: v.number(), // shares * priceUsd
    executedAt: v.number(),
  }).index("by_user_executed", ["userId", "executedAt"]),

  // Append-only NAV snapshots for the equity curve (throttled to ~1/12h).
  simNavSnapshots: defineTable({
    userId: v.id("users"),
    navUsd: v.number(),
    cashUsd: v.number(),
    holdingsUsd: v.number(),
    takenAt: v.number(),
  }).index("by_user_taken", ["userId", "takenAt"]),

  // Lesson-read flags and reflective-question state for the simulator section.
  simProgress: defineTable({
    userId: v.id("users"),
    kind: v.union(v.literal("lesson"), v.literal("question")),
    key: v.string(), // lesson id or question id
    state: v.string(), // "read" | "checked" | free-text note
    updatedAt: v.number(),
  }).index("by_user_kind", ["userId", "kind"]),
};

export default defineSchema({
  ...authTables,
  ...applicationTables,
});
