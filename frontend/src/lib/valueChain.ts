// Value chain (Head to Head): the payload of GET /api/individual/{t}/value-chain
// and the pure rules ValueChainTable prints. Raw figures only: no colors, no
// labels for good or bad.

import { API_BASE, getJson } from "./useResource";
import { formatFigure } from "./headToHead";

export type ChainSide = "company" | "supplier" | "customer";

/** [now, five years ago], each from the firm's own fiscal years. */
export type Pair = [number | null, number | null];

export interface ValueChainRow {
  ticker: string;
  name?: string | null;
  side: ChainSide;
  category?: string | null;
  /** This firm's own [latest, five years before] fiscal years. */
  years?: [number, number];
  grossMargin?: Pair | null;
  operatingMargin?: Pair | null;
  daysReceivable?: Pair | null;
  daysPayable?: Pair | null;
}

export interface SubstituteCategory {
  category: string;
  examples: { ticker: string; name?: string | null; operatingMargin?: number | null }[];
  medianOperatingMargin?: number | null;
}

export interface ValueChainPayload {
  applicable: boolean;
  reason?: string;
  years?: [number, number];
  rows?: ValueChainRow[];
  substitutes?: SubstituteCategory[];
  note?: string;
}

export type ChainColumn = "grossMargin" | "operatingMargin" | "daysReceivable" | "daysPayable";

export const CHAIN_COLUMNS: { key: ChainColumn; label: string; kind: "pct" | "days" }[] = [
  { key: "grossMargin", label: "Gross margin", kind: "pct" },
  { key: "operatingMargin", label: "Operating margin", kind: "pct" },
  { key: "daysReceivable", label: "Days receivable", kind: "days" },
  { key: "daysPayable", label: "Days payable", kind: "days" },
];

export const CHAIN_SIDES: { side: ChainSide; label: string }[] = [
  { side: "company", label: "Company" },
  { side: "supplier", label: "Suppliers" },
  { side: "customer", label: "Customers" },
];

const isNum = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

export function formatChainValue(v: number | null | undefined, kind: "pct" | "days"): string {
  if (kind === "pct") return formatFigure(v, "pct");
  return isNum(v) ? `${Math.round(v)} days` : "not available";
}

/** "now · 5 years ago" for one cell. */
export function formatPair(pair: Pair | null | undefined, kind: "pct" | "days"): string {
  return `${formatChainValue(pair?.[0], kind)} · ${formatChainValue(pair?.[1], kind)}`;
}

/** The rows of one side, in response order. */
export function rowsForSide(rows: ValueChainRow[] | undefined, side: ChainSide): ValueChainRow[] {
  return (rows ?? []).filter((r) => r.side === side);
}

export const fetchValueChain = (ticker: string) => (signal: AbortSignal) =>
  getJson<ValueChainPayload>(
    `${API_BASE}/api/individual/${encodeURIComponent(ticker)}/value-chain`,
    "value chain figures",
    signal,
  );
