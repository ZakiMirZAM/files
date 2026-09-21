// GICS sector names as the owner's definition files write them, mapped onto the
// eleven sector names the app uses everywhere else (`SECTORS` in sectorRotation).
//
// Six of the eleven are spelled differently in the two vocabularies; the other
// five are identical and are listed as identity entries so a reader of this file
// sees all eleven in one place.
//
// The map is deliberately CLOSED. Every token the definition tables actually
// contain is either one of the eleven GICS names, one of the eleven app names,
// or an explicit row in ODD_TOKENS below. Anything else throws, so a new
// definition file cannot quietly drop a sector, invent one, or hide a
// qualifier behind a parenthesis. The parser turns that throw into a
// non-conforming file with the file, part, row and token named, which is what
// reaches the gap report.

import { SECTORS, type Sector } from "./sectorRotation";

/** What one cell token resolved to. */
export interface ResolvedToken {
  /** The app sectors this token names. Empty for an explicit "none". */
  sectors: Sector[];
  /** The owner's parenthetical, carried verbatim and never interpreted. */
  qualifier?: string;
  kind: "sector" | "qualified" | "group" | "explicitNone" | "blanket";
}

/** GICS spelling -> app spelling. The six that differ, then the five that match. */
export const GICS_TO_APP: Record<string, Sector> = {
  // Different spelling
  "Consumer Discretionary": "Consumer Cyclical",
  "Consumer Staples": "Consumer Defensive",
  Financials: "Financial Services",
  "Health Care": "Healthcare",
  "Information Technology": "Technology",
  Materials: "Basic Materials",
  // Identical in both vocabularies, listed so all eleven are visible here
  Industrials: "Industrials",
  Energy: "Energy",
  "Real Estate": "Real Estate",
  "Communication Services": "Communication Services",
  Utilities: "Utilities",
};

/** The app's own names, accepted unchanged. */
const APP_IDENTITY: Record<string, Sector> = Object.fromEntries(
  SECTORS.map((s) => [s, s]),
) as Record<string, Sector>;

/**
 * Every token in the owner's tables that is not a bare sector name, resolved
 * explicitly. Three shapes appear:
 *   a parenthetical qualifier  -> the base sector plus the owner's words
 *   an explicit none           -> no sectors, kind "explicitNone"
 *   a blanket row              -> all eleven, kind "blanket"
 * One Part 4 row names two sectors in prose; it is a group row.
 *
 * Adding a row here is an editorial act. Do not guess: an unlisted token marks
 * its file non-conforming and is reported for the owner to resolve.
 */
export const ODD_TOKENS: Record<string, ResolvedToken> = {
  // Part 3, classification cells
  "(none)": { sectors: [], kind: "explicitNone" },
  "None on this metric": { sectors: [], kind: "explicitNone" },
  "All eleven sectors": { sectors: [...SECTORS], kind: "blanket" },
  "Materials (gold miners)": {
    sectors: ["Basic Materials"],
    qualifier: "gold miners",
    kind: "qualified",
  },
  "Materials (silver miners)": {
    sectors: ["Basic Materials"],
    qualifier: "silver miners",
    kind: "qualified",
  },
  "Industrials (Defense)": {
    sectors: ["Industrials"],
    qualifier: "Defense",
    kind: "qualified",
  },

  // Part 4, sector or sector group cells
  "Industrials (Aerospace & Defense)": {
    sectors: ["Industrials"],
    qualifier: "Aerospace & Defense",
    kind: "qualified",
  },
  "Financials (regional and community banks)": {
    sectors: ["Financial Services"],
    qualifier: "regional and community banks",
    kind: "qualified",
  },
  "Financials (large diversified banks)": {
    sectors: ["Financial Services"],
    qualifier: "large diversified banks",
    kind: "qualified",
  },
  "Financials (consumer lenders and card issuers)": {
    sectors: ["Financial Services"],
    qualifier: "consumer lenders and card issuers",
    kind: "qualified",
  },
  "Industrials (autos and consumer durables supply chains)": {
    sectors: ["Industrials"],
    qualifier: "autos and consumer durables supply chains",
    kind: "qualified",
  },
  "Communication Services and Information Technology together (long-duration growth)": {
    sectors: ["Communication Services", "Technology"],
    qualifier: "long-duration growth",
    kind: "group",
  },
};

/** Where a token was found, so a failure names the exact cell. */
export interface TokenContext {
  /** Surface and file, for example "economic/06-Yield-Curve.md". */
  file: string;
  /** "Part 3" or "Part 4". */
  part: string;
  /** The row's first cell: the reading label or the sector group label. */
  row: string;
}

/** Thrown for a token that is in neither vocabulary nor in ODD_TOKENS. */
export class UnknownSectorTokenError extends Error {
  readonly token: string;
  readonly context: TokenContext;
  constructor(token: string, context: TokenContext) {
    super(
      `Unknown sector token "${token}" in ${context.file}, ${context.part}, row "${context.row}". ` +
        "Add it to GICS_TO_APP or to ODD_TOKENS in lib/gicsSectorMap.ts.",
    );
    this.name = "UnknownSectorTokenError";
    this.token = token;
    this.context = context;
  }
}

/**
 * Resolve one token from a table cell. Throws UnknownSectorTokenError when the
 * token is in neither the GICS map, the app's own names, nor ODD_TOKENS.
 */
export function resolveSectorToken(token: string, context: TokenContext): ResolvedToken {
  const t = token.trim();
  const gics = GICS_TO_APP[t];
  if (gics) return { sectors: [gics], kind: "sector" };
  const own = APP_IDENTITY[t];
  if (own) return { sectors: [own], kind: "sector" };
  const odd = ODD_TOKENS[t];
  if (odd) return { sectors: [...odd.sectors], qualifier: odd.qualifier, kind: odd.kind };
  throw new UnknownSectorTokenError(t, context);
}

/**
 * Split a cell into tokens on commas that are not inside parentheses, so
 * "Materials (gold miners), Energy" yields two tokens, not three.
 */
export function splitSectorCell(cell: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of cell) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      const piece = current.trim();
      if (piece) out.push(piece);
      current = "";
    } else {
      current += ch;
    }
  }
  const last = current.trim();
  if (last) out.push(last);
  return out;
}
