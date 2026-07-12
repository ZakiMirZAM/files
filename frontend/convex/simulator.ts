import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

/** Virtual starting wallet for a fresh paper-trading account (USD). */
const STARTING_CASH = 100_000;
/** Skip an unforced NAV snapshot if the newest one is younger than this. */
const SNAPSHOT_THROTTLE_MS = 5 * 60 * 1000;
/** Tolerance for float comparisons on cash / shares. */
const EPS = 1e-6;

const sideValidator = v.union(v.literal("buy"), v.literal("sell"));
const progressKindValidator = v.union(v.literal("lesson"), v.literal("question"));

// ── Queries ──────────────────────────────────────────────────────────────────

export const getPortfolio = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const row = await ctx.db
      .query("simPortfolio")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    // Surface the default wallet to the UI before the first trade seeds a row.
    if (!row) {
      return { cashUsd: STARTING_CASH, startingCashUsd: STARTING_CASH, seeded: false };
    }
    return {
      cashUsd: row.cashUsd,
      startingCashUsd: row.startingCashUsd,
      seeded: true,
    };
  },
});

export const getPositions = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("simPositions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const getTrades = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("simTrades")
      .withIndex("by_user_executed", (q) => q.eq("userId", userId))
      .order("desc")
      .take(args.limit ?? 100);
  },
});

export const getNavHistory = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("simNavSnapshots")
      .withIndex("by_user_taken", (q) => q.eq("userId", userId))
      .order("asc")
      .take(500);
  },
});

export const getProgress = query({
  args: { kind: progressKindValidator },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("simProgress")
      .withIndex("by_user_kind", (q) => q.eq("userId", userId).eq("kind", args.kind))
      .collect();
  },
});

// ── Mutations ────────────────────────────────────────────────────────────────

/** Execute a paper buy/sell. The client fetches the live execution price and
 *  passes it in (Convex can't reach Yahoo); the mutation re-validates buying
 *  power / held shares, updates cash + the position, and logs the trade. */
export const executeTrade = mutation({
  args: {
    ticker: v.string(),
    side: sideValidator,
    shares: v.number(),
    priceUsd: v.number(),
    priceLocal: v.number(),
    currency: v.string(),
    fxRate: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const ticker = args.ticker.trim().toUpperCase();
    if (!ticker) throw new Error("Ticker is required");
    if (!(args.shares > 0)) throw new Error("Shares must be greater than zero");
    if (!(args.priceUsd > 0)) throw new Error("A live price is required to trade");

    const now = Date.now();

    // Ensure a wallet exists (seed on first trade).
    let portfolio = await ctx.db
      .query("simPortfolio")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!portfolio) {
      const id = await ctx.db.insert("simPortfolio", {
        userId,
        cashUsd: STARTING_CASH,
        startingCashUsd: STARTING_CASH,
        createdAt: now,
        updatedAt: now,
      });
      portfolio = (await ctx.db.get(id))!;
    }

    const existing = await ctx.db
      .query("simPositions")
      .withIndex("by_user_ticker", (q) => q.eq("userId", userId).eq("ticker", ticker))
      .first();

    const valueUsd = args.shares * args.priceUsd;

    if (args.side === "buy") {
      if (valueUsd > portfolio.cashUsd + EPS) {
        throw new Error("Insufficient buying power for this order");
      }
      await ctx.db.patch(portfolio._id, {
        cashUsd: portfolio.cashUsd - valueUsd,
        updatedAt: now,
      });
      if (existing) {
        const newShares = existing.shares + args.shares;
        const newAvg =
          (existing.shares * existing.avgCostUsd + args.shares * args.priceUsd) / newShares;
        await ctx.db.patch(existing._id, {
          shares: newShares,
          avgCostUsd: newAvg,
          currency: args.currency,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("simPositions", {
          userId,
          ticker,
          shares: args.shares,
          avgCostUsd: args.priceUsd,
          currency: args.currency,
          updatedAt: now,
        });
      }
    } else {
      // sell
      if (!existing || args.shares > existing.shares + EPS) {
        throw new Error("You do not hold that many shares to sell");
      }
      await ctx.db.patch(portfolio._id, {
        cashUsd: portfolio.cashUsd + valueUsd,
        updatedAt: now,
      });
      const remaining = existing.shares - args.shares;
      if (remaining <= EPS) {
        await ctx.db.delete(existing._id);
      } else {
        await ctx.db.patch(existing._id, { shares: remaining, updatedAt: now });
      }
    }

    await ctx.db.insert("simTrades", {
      userId,
      ticker,
      side: args.side,
      shares: args.shares,
      priceLocal: args.priceLocal,
      priceUsd: args.priceUsd,
      currency: args.currency,
      fxRate: args.fxRate,
      valueUsd,
      executedAt: now,
    });

    return { ok: true };
  },
});

/** Append a NAV snapshot for the equity curve. Throttled unless `force` is set
 *  (the dashboard forces one right after a trade so the curve gets a fresh point). */
export const recordNavSnapshot = mutation({
  args: {
    navUsd: v.number(),
    cashUsd: v.number(),
    holdingsUsd: v.number(),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const now = Date.now();
    if (!args.force) {
      const newest = await ctx.db
        .query("simNavSnapshots")
        .withIndex("by_user_taken", (q) => q.eq("userId", userId))
        .order("desc")
        .first();
      if (newest && now - newest.takenAt < SNAPSHOT_THROTTLE_MS) {
        return null;
      }
    }

    return await ctx.db.insert("simNavSnapshots", {
      userId,
      navUsd: args.navUsd,
      cashUsd: args.cashUsd,
      holdingsUsd: args.holdingsUsd,
      takenAt: now,
    });
  },
});

/** Reset the account to a fresh wallet (clears positions, trades, snapshots). */
export const resetPortfolio = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const now = Date.now();

    for (const table of ["simPositions", "simTrades", "simNavSnapshots"] as const) {
      const rows = await ctx.db
        .query(table)
        .filter((q) => q.eq(q.field("userId"), userId))
        .collect();
      for (const row of rows) await ctx.db.delete(row._id);
    }

    const portfolio = await ctx.db
      .query("simPortfolio")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (portfolio) {
      await ctx.db.patch(portfolio._id, { cashUsd: STARTING_CASH, updatedAt: now });
    }
    return { ok: true };
  },
});

/** Upsert a lesson-read flag or a reflective-question note/checkbox. */
export const setProgress = mutation({
  args: {
    kind: progressKindValidator,
    key: v.string(),
    state: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("simProgress")
      .withIndex("by_user_kind", (q) => q.eq("userId", userId).eq("kind", args.kind))
      .filter((q) => q.eq(q.field("key"), args.key))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { state: args.state, updatedAt: Date.now() });
      return existing._id;
    }
    return await ctx.db.insert("simProgress", {
      userId,
      kind: args.kind,
      key: args.key,
      state: args.state,
      updatedAt: Date.now(),
    });
  },
});
