/**
 * Pure helpers for the stock simulator: currency conversion, portfolio
 * valuation, cost-basis math, and display formatting. No React, no network , 
 * everything here is a deterministic function of its inputs so the core money
 * logic stays easy to reason about and test.
 */
import type { LiveQuote } from "./api";

/** Starting wallet for a fresh paper-trading account (USD). Mirrors the
 *  STARTING_CASH constant in convex/simulator.ts. */
export const STARTING_CASH = 100_000;

/** A held position as stored in Convex (only the fields valuation needs). */
export interface SimPositionInput {
  ticker: string;
  shares: number;
  avgCostUsd: number;
  currency: string;
}

export interface PositionValuation {
  ticker: string;
  shares: number;
  currency: string;
  /** Last price in the instrument's own currency (null when unpriced). */
  priceLocal: number | null;
  /** Last price converted to USD (null when unpriced). */
  priceUsd: number | null;
  /** true when a live quote priced this position; false means valued at cost. */
  priced: boolean;
  costBasisUsd: number;
  marketValueUsd: number;
  unrealizedUsd: number | null;
  unrealizedPct: number | null;
  dayChangePct: number | null;
}

export interface PortfolioValuation {
  navUsd: number;
  cashUsd: number;
  holdingsUsd: number;
  costBasisUsd: number;
  totalUnrealizedUsd: number;
  totalReturnPct: number | null;
  positions: PositionValuation[];
  /** NAV-weighted slices including a trailing "Cash" slice, for the donut. */
  allocation: AllocationSlice[];
  /** true when at least one position could not be priced by a live quote. */
  hasUnpriced: boolean;
}

export interface AllocationSlice {
  label: string;
  valueUsd: number;
  weight: number; // 0..1 of NAV
}

/** Build a ticker→quote lookup from a batch-quote response. */
export function quotesByTicker(quotes: LiveQuote[]): Record<string, LiveQuote> {
  const map: Record<string, LiveQuote> = {};
  for (const q of quotes) map[q.ticker.toUpperCase()] = q;
  return map;
}

/** USD per 1 unit of `currency`. Defaults to 1.0 (USD, unknown, or no rate). */
export function fxToUsd(currency: string | null | undefined, rates: Record<string, number>): number {
  if (!currency) return 1;
  const r = rates[currency.toUpperCase()];
  return typeof r === "number" && r > 0 ? r : 1;
}

/** Convert a live quote's price to USD using the FX table. Returns the USD
 *  price and the fx rate used, so a trade can be logged with both. Null price
 *  when the quote has no usable last price. */
export function quoteToUsd(
  quote: LiveQuote | undefined,
  rates: Record<string, number>,
): { priceUsd: number | null; priceLocal: number | null; currency: string; fxRate: number } {
  const currency = (quote?.currency || "USD").toUpperCase();
  const fxRate = fxToUsd(currency, rates);
  const priceLocal = quote?.price ?? null;
  const priceUsd = priceLocal != null ? priceLocal * fxRate : null;
  return { priceUsd, priceLocal, currency, fxRate };
}

/** Value a whole portfolio in USD. Unpriced positions fall back to cost basis
 *  so NAV stays meaningful, and are flagged so the UI can mark them stale. */
export function valuePortfolio(
  positions: SimPositionInput[],
  quotes: Record<string, LiveQuote>,
  rates: Record<string, number>,
  cashUsd: number,
): PortfolioValuation {
  const valued: PositionValuation[] = positions.map((p) => {
    const quote = quotes[p.ticker.toUpperCase()];
    const { priceUsd, priceLocal } = quoteToUsd(quote, rates);
    const priced = priceUsd != null;
    const costBasisUsd = p.avgCostUsd * p.shares;
    const marketValueUsd = priced ? priceUsd! * p.shares : costBasisUsd;
    const unrealizedUsd = priced ? marketValueUsd - costBasisUsd : null;
    const unrealizedPct =
      priced && costBasisUsd > 0 ? ((marketValueUsd - costBasisUsd) / costBasisUsd) * 100 : null;
    return {
      ticker: p.ticker.toUpperCase(),
      shares: p.shares,
      currency: p.currency,
      priceLocal,
      priceUsd,
      priced,
      costBasisUsd,
      marketValueUsd,
      unrealizedUsd,
      unrealizedPct,
      dayChangePct: quote?.dayChangePct ?? null,
    };
  });

  const holdingsUsd = valued.reduce((sum, v) => sum + v.marketValueUsd, 0);
  const costBasisUsd = valued.reduce((sum, v) => sum + v.costBasisUsd, 0);
  const navUsd = holdingsUsd + cashUsd;
  const totalUnrealizedUsd = holdingsUsd - costBasisUsd;
  const totalReturnPct = STARTING_CASH > 0 ? ((navUsd - STARTING_CASH) / STARTING_CASH) * 100 : null;

  // Largest holdings first; cash always sits at the end of the donut.
  const sorted = [...valued].sort((a, b) => b.marketValueUsd - a.marketValueUsd);
  const allocation: AllocationSlice[] = sorted.map((v) => ({
    label: v.ticker,
    valueUsd: v.marketValueUsd,
    weight: navUsd > 0 ? v.marketValueUsd / navUsd : 0,
  }));
  if (cashUsd > 0) {
    allocation.push({ label: "Cash", valueUsd: cashUsd, weight: navUsd > 0 ? cashUsd / navUsd : 0 });
  }

  return {
    navUsd,
    cashUsd,
    holdingsUsd,
    costBasisUsd,
    totalUnrealizedUsd,
    totalReturnPct,
    positions: valued,
    allocation,
    hasUnpriced: valued.some((v) => !v.priced),
  };
}

// ── Formatting ────────────────────────────────────────────────────────────────

const usdFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const usdCompactFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return usdFmt.format(value);
}

export function formatUsdCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return usdCompactFmt.format(value);
}

/** Signed percent with a leading + on gains, e.g. "+6.21%" / "-1.10%". */
export function formatSignedPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

/** Signed USD with a leading + on gains. */
export function formatSignedUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${usdFmt.format(value)}`;
}

/** Local-currency price (kept distinct from USD so non-USD names read honestly). */
export function formatLocalPrice(value: number | null | undefined, currency: string): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    // Unknown/invalid ISO currency code, fall back to a plain number + code.
    return `${value.toFixed(2)} ${currency}`;
  }
}

export function formatShares(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/\.?0+$/, "");
}

/** Tailwind text class for a gain/loss/neutral number, matching the app theme. */
export function gainLossClass(value: number | null | undefined): string {
  if (value == null || value === 0 || !Number.isFinite(value)) return "text-white/70";
  return value > 0 ? "text-gain-strong" : "text-loss-strong";
}
