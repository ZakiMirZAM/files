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

  // ── Learn section (slices A4-A7) ─────────────────────────────────────────
  // Flashcard decks: imported (CSV/.xlsx/Anki), AI-generated, or hand-made.
  learnDecks: defineTable({
    userId: v.id("users"),
    name: v.string(),
    description: v.optional(v.string()),
    source: v.union(v.literal("import"), v.literal("ai"), v.literal("manual")),
    /** For an AI deck: the request the user typed. */
    prompt: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // One card. `due` drives the study queue; `srs` is the ts-fsrs card state
  // (JSON), absent until the card is first studied.
  learnCards: defineTable({
    userId: v.id("users"),
    deckId: v.id("learnDecks"),
    front: v.string(),
    back: v.string(),
    tags: v.optional(v.array(v.string())),
    due: v.number(),
    srs: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user_deck", ["userId", "deckId"])
    .index("by_user_due", ["userId", "due"])
    .index("by_user_deck_due", ["userId", "deckId", "due"]),

  // One study rating (1 Again, 2 Hard, 3 Good, 4 Easy) with the FSRS log.
  learnReviews: defineTable({
    userId: v.id("users"),
    cardId: v.id("learnCards"),
    rating: v.number(),
    reviewedAt: v.number(),
    log: v.optional(v.string()),
  }).index("by_user_card", ["userId", "cardId"]),

  // A generated test: questions as JSON (multiple choice and short answer).
  learnTests: defineTable({
    userId: v.id("users"),
    title: v.string(),
    prompt: v.string(),
    deckId: v.optional(v.id("learnDecks")),
    questions: v.string(),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),

  // One attempt at a test: answers, self grades and AI grades as JSON.
  learnAttempts: defineTable({
    userId: v.id("users"),
    testId: v.id("learnTests"),
    answers: v.string(),
    score: v.number(),
    total: v.number(),
    completedAt: v.number(),
  }).index("by_user_test", ["userId", "testId"]),

  // A7: a book the user imported. The marked copy is kept privately; the clean
  // original is optional (needed only when the marks are flattened).
  learnBooks: defineTable({
    userId: v.id("users"),
    title: v.string(),
    fileName: v.string(),
    storageId: v.id("_storage"),
    cleanStorageId: v.optional(v.id("_storage")),
    pageCount: v.number(),
    noteCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // A7: who uploaded each Learn file (book PDFs, mark pictures). The first
  // claim wins, as with noteFiles; nothing is served or deleted without it.
  learnFiles: defineTable({
    userId: v.id("users"),
    storageId: v.id("_storage"),
    createdAt: v.number(),
  })
    .index("by_storage", ["storageId"])
    .index("by_user_storage", ["userId", "storageId"]),

  // A7: one mark found in a book. `method` says how it was found: a real PDF
  // annotation object, or a page comparison with the clean original.
  learnBookNotes: defineTable({
    userId: v.id("users"),
    bookId: v.id("learnBooks"),
    page: v.number(),
    kind: v.union(
      v.literal("handwriting"),
      v.literal("underline"),
      v.literal("highlight"),
      v.literal("note"),
      v.literal("mark"),
    ),
    method: v.union(v.literal("annotation"), v.literal("comparison")),
    imageStorageId: v.optional(v.id("_storage")),
    /** [x0, y0, x1, y1] in PDF points, as JSON. */
    rect: v.optional(v.string()),
    /** Typed note text, when the annotation carries one. */
    text: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user_book", ["userId", "bookId"])
    .index("by_user_book_page", ["userId", "bookId", "page"]),

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
