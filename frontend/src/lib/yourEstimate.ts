import type { NextTwoYearsKey } from "./types";

/**
 * The reader's own two-year forecast, one typed string per line per year,
 * stored as ONE JSON answer. Only strings that look like a number are kept,
 * exactly as typed; nothing is parsed into a number or converted.
 */
export type YourEstimate = { [K in NextTwoYearsKey]?: { y1?: string; y2?: string } };

export const ESTIMATE_KEYS: readonly NextTwoYearsKey[] = [
  "revenue",
  "operatingMargin",
  "nopat",
  "reinvestment",
  "fcff",
  "roic",
  "eva",
  "eps",
];

// Sign and "$" in either order ("-$9.50", "$-9.50"), thousands commas grouped
// in threes ("1,200"), and one trailing unit the placeholders invite ("12%",
// "538B", "40 m").
const NUMERIC = /^\s*(?:[-−]\$?|\$[-−]?)?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?|\.\d+)\s*[%BbMm]?\s*$/;

/** A decimal as a reader types it: optionally negative (hyphen or U+2212
 *  minus), with an optional "$", thousands commas and a trailing %, B or M. */
export function looksNumeric(s: unknown): s is string {
  return typeof s === "string" && NUMERIC.test(s);
}

/** A typed cell that is neither blank nor a number: shown, never saved. */
export function isRejected(s: string | undefined): boolean {
  return s != null && s.trim() !== "" && !looksNumeric(s);
}

/**
 * The saved map after one cell is typed into. A number replaces the cell, a
 * blank clears it, and anything else leaves the last number saved there, so a
 * stray keystroke never deletes a saved figure.
 */
export function applyCell(saved: YourEstimate, key: NextTwoYearsKey, slot: "y1" | "y2", typed: string): YourEstimate {
  if (isRejected(typed)) return saved;
  const cell = { ...saved[key] };
  if (typed.trim() === "") delete cell[slot];
  else cell[slot] = typed;
  const out = { ...saved };
  if (cell.y1 === undefined && cell.y2 === undefined) delete out[key];
  else out[key] = cell;
  return out;
}

/** Known keys and numeric-looking strings only; everything else is dropped. */
function clean(input: unknown): YourEstimate {
  const out: YourEstimate = {};
  if (input == null || typeof input !== "object" || Array.isArray(input)) return out;
  const src = input as Record<string, unknown>;
  for (const key of ESTIMATE_KEYS) {
    const cell = src[key];
    if (cell == null || typeof cell !== "object" || Array.isArray(cell)) continue;
    const { y1, y2 } = cell as Record<string, unknown>;
    const kept: { y1?: string; y2?: string } = {};
    if (looksNumeric(y1)) kept.y1 = y1;
    if (looksNumeric(y2)) kept.y2 = y2;
    if (kept.y1 !== undefined || kept.y2 !== undefined) out[key] = kept;
  }
  return out;
}

export function encodeYourEstimate(map: YourEstimate): string {
  return JSON.stringify(clean(map));
}

export function decodeYourEstimate(raw: string | null | undefined): YourEstimate {
  if (!raw) return {};
  try {
    return clean(JSON.parse(raw));
  } catch {
    return {};
  }
}
