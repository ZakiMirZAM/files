// A strict reader for the three tables inside every economic and credit
// definition file.
//
// The owner's markdown under src/content/economic and src/content/credit already
// says what each metric does to each of the eleven sectors. Parts 3, 4 and 5 are
// the machine-readable part of that: a classification per named reading, an
// earnings mechanism per sector, and the metrics to read alongside. This module
// turns them into typed rows and nothing else. Cell text is trimmed and carried
// word for word; no cell is rewritten, summarised or scored, and no number or
// trend is ever mapped onto a reading here.
//
// The parser is strict on structure and silent on content:
//   - the headings and the header cells must match exactly (see the constants
//     below, all verified against the real files);
//   - a file that does not match is returned as { conforming: false, problems }
//     and is never half-parsed, so a partial table cannot reach a page;
//   - an unrecognised sector token is a problem, not a guess (gicsSectorMap
//     throws and the throw is recorded with the file, part, row and token).
//
// Two header variations exist in the owner's files and are tolerated
// deliberately, because the column's MEANING is fixed by its position and only
// its wording changes per metric:
//   - Part 4 column 2 reads "Why the index valuation affects this sector" in
//     65-SP500-Fair-Value-and-Implied-Return.md;
//   - Part 5 columns 2 and 3 are worded per metric in every file.
// Columns whose wording is fixed (all of Part 3, Part 4 columns 1 and 3, Part 5
// column 1) are matched exactly.

import {
  resolveSectorToken,
  splitSectorCell,
  UnknownSectorTokenError,
  type TokenContext,
} from "./gicsSectorMap";
import type { Sector } from "./sectorRotation";

// ── Headings and headers, verified against the real files ──────────────────

export const PART3_HEADING = "## Part 3: What it tells you";
export const PART4_HEADING = "## Part 4: Finding the best sectors to invest in";
export const PART5_HEADING = "## Part 5: Metrics to analyze alongside it";

export const PART3_HEADER = [
  "Reading",
  "What it means",
  "Sectors Favored",
  "Sectors Not Favored",
  "Sectors Not Affected",
] as const;

/** Part 4 column 1 and column 3 are fixed; column 2 is worded per metric. */
export const PART4_HEADER_FIRST = "Sector or sector group";
export const PART4_HEADER_LAST = "The specific reading that signals a buy versus avoid";

/** Part 5 column 1 is fixed; columns 2 and 3 are worded per metric. */
export const PART5_HEADER_FIRST = "Paired metric";

// ── Row types ──────────────────────────────────────────────────────────────

export type ClassColumn = "favored" | "notFavored" | "notAffected";

/** One sector's parenthetical note, carried verbatim from the owner's cell. */
export interface SectorNote {
  column: ClassColumn | "part4";
  sector: Sector;
  note: string;
}

export interface Part3Row {
  /** The owner's reading cell, word for word. */
  readingLabel: string;
  /** A stable slug of readingLabel, used to re-find a saved pick after a reword. */
  readingKey: string;
  /** The owner's "What it means" cell, word for word. */
  meaning: string;
  favored: Sector[];
  notFavored: Sector[];
  notAffected: Sector[];
  /** Everything the three cells said beyond a plain sector name. */
  qualifiers: {
    notes: SectorNote[];
    /** Columns whose cell was an explicit none. */
    explicitNone: ClassColumn[];
    /** Columns written for all eleven sectors at once. */
    blanket: ClassColumn[];
  };
}

export interface Part4Row {
  /** The owner's first cell, word for word, including any group wording. */
  groupLabel: string;
  /** The sectors that cell names. */
  sectors: Sector[];
  /** The owner's earnings-mechanism cell, word for word. */
  mechanism: string;
  /** The owner's buy versus avoid cell, word for word. */
  buyAvoid: string;
  /** True when the row was written for more than one sector. */
  isGroupRow: boolean;
  notes: SectorNote[];
}

export interface Part5Row {
  /** The owner's paired-metric cell, word for word. */
  pairedMetric: string;
  /** Column 2, word for word. */
  why: string;
  /** Column 3, word for word. Empty when the file's table has two columns. */
  sharpens: string;
}

export interface ParsedDefinition {
  conforming: true;
  title: string;
  part3: Part3Row[];
  part4: Part4Row[];
  part5: Part5Row[];
}

export interface NonConformingDefinition {
  conforming: false;
  title: string;
  problems: string[];
}

export type DefinitionParse = ParsedDefinition | NonConformingDefinition;

// ── Markdown helpers ───────────────────────────────────────────────────────

/** Split a markdown table row into trimmed cells, honouring backslash escapes. */
export function splitTableRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const out: string[] = [];
  let current = "";
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "\\" && i + 1 < inner.length) {
      current += inner[++i];
      continue;
    }
    if (ch === "|") {
      out.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current.trim());
  return out;
}

/** A markdown table's alignment row, the one made only of dashes and colons. */
function isDividerRow(line: string): boolean {
  return /^\|[\s:|-]+\|?$/.test(line.trim()) && line.includes("-");
}

/** The first pipe table that follows `heading`, or null when there is none. */
function tableAfter(lines: string[], heading: string): string[] | null {
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start < 0) return null;
  let i = start + 1;
  while (i < lines.length && !lines[i].trim().startsWith("|")) {
    // A second heading before any table means this part carries no table.
    if (lines[i].trim().startsWith("## ")) return null;
    i++;
  }
  const rows: string[] = [];
  while (i < lines.length && lines[i].trim().startsWith("|")) {
    rows.push(lines[i].trim());
    i++;
  }
  return rows.length > 0 ? rows : null;
}

/** The file's H1, which is the metric's title. */
export function titleOf(markdown: string): string {
  const m = /^#\s+(.+)$/m.exec(markdown);
  return m ? m[1].trim() : "";
}

/** A stable key for a reading label: lower case, alphanumerics and hyphens. */
export function readingKeyOf(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── The parser ─────────────────────────────────────────────────────────────

interface CellResolution {
  sectors: Sector[];
  notes: { sector: Sector; note: string }[];
  explicitNone: boolean;
  blanket: boolean;
}

function resolveCell(cell: string, context: TokenContext): CellResolution {
  const out: CellResolution = { sectors: [], notes: [], explicitNone: false, blanket: false };
  for (const token of splitSectorCell(cell)) {
    const resolved = resolveSectorToken(token, context);
    if (resolved.kind === "explicitNone") {
      out.explicitNone = true;
      continue;
    }
    if (resolved.kind === "blanket") out.blanket = true;
    for (const s of resolved.sectors) {
      if (!out.sectors.includes(s)) out.sectors.push(s);
      if (resolved.qualifier) out.notes.push({ sector: s, note: resolved.qualifier });
    }
  }
  return out;
}

/**
 * Parse one definition file. `file` is only used to name the source in problem
 * messages, for example "economic/06-Yield-Curve.md".
 */
export function parseDefinitionFile(markdown: string, file: string): DefinitionParse {
  const title = titleOf(markdown);
  const lines = markdown.split(/\r?\n/);
  const problems: string[] = [];

  // ── Part 3 ───────────────────────────────────────────────────────────────
  const part3: Part3Row[] = [];
  const t3 = tableAfter(lines, PART3_HEADING);
  if (!t3) {
    problems.push(`${file}: no table under "${PART3_HEADING}"`);
  } else {
    const header = splitTableRow(t3[0]);
    if (header.length !== PART3_HEADER.length || PART3_HEADER.some((h, i) => header[i] !== h)) {
      problems.push(
        `${file}: Part 3 header is [${header.join(" | ")}], expected [${PART3_HEADER.join(" | ")}]`,
      );
    } else {
      const body = t3.slice(1).filter((r) => !isDividerRow(r));
      for (const raw of body) {
        const cells = splitTableRow(raw);
        if (cells.length !== PART3_HEADER.length) {
          problems.push(
            `${file}: Part 3 row "${cells[0] ?? ""}" has ${cells.length} cells, expected ${PART3_HEADER.length}`,
          );
          continue;
        }
        const [readingLabel, meaning] = cells;
        const context: TokenContext = { file, part: "Part 3", row: readingLabel };
        const columns: ClassColumn[] = ["favored", "notFavored", "notAffected"];
        const resolved: Partial<Record<ClassColumn, CellResolution>> = {};
        let failed = false;
        for (let c = 0; c < columns.length; c++) {
          try {
            resolved[columns[c]] = resolveCell(cells[c + 2], context);
          } catch (err) {
            failed = true;
            problems.push(
              err instanceof UnknownSectorTokenError ? err.message : `${file}: ${String(err)}`,
            );
          }
        }
        if (failed) continue;
        const notes: SectorNote[] = [];
        const explicitNone: ClassColumn[] = [];
        const blanket: ClassColumn[] = [];
        for (const column of columns) {
          const r = resolved[column];
          if (!r) continue;
          for (const n of r.notes) notes.push({ column, sector: n.sector, note: n.note });
          if (r.explicitNone) explicitNone.push(column);
          if (r.blanket) blanket.push(column);
        }
        part3.push({
          readingLabel,
          readingKey: readingKeyOf(readingLabel),
          meaning,
          favored: resolved.favored?.sectors ?? [],
          notFavored: resolved.notFavored?.sectors ?? [],
          notAffected: resolved.notAffected?.sectors ?? [],
          qualifiers: { notes, explicitNone, blanket },
        });
      }
      if (part3.length === 0 && problems.length === 0) {
        problems.push(`${file}: Part 3 table has no rows`);
      }
    }
  }

  // ── Part 4 ───────────────────────────────────────────────────────────────
  const part4: Part4Row[] = [];
  const t4 = tableAfter(lines, PART4_HEADING);
  if (!t4) {
    problems.push(`${file}: no table under "${PART4_HEADING}"`);
  } else {
    const header = splitTableRow(t4[0]);
    if (header.length !== 3 || header[0] !== PART4_HEADER_FIRST || header[2] !== PART4_HEADER_LAST) {
      problems.push(
        `${file}: Part 4 header is [${header.join(" | ")}], expected ` +
          `[${PART4_HEADER_FIRST} | <worded per metric> | ${PART4_HEADER_LAST}]`,
      );
    } else {
      for (const raw of t4.slice(1).filter((r) => !isDividerRow(r))) {
        const cells = splitTableRow(raw);
        if (cells.length !== 3) {
          problems.push(
            `${file}: Part 4 row "${cells[0] ?? ""}" has ${cells.length} cells, expected 3`,
          );
          continue;
        }
        const [groupLabel, mechanism, buyAvoid] = cells;
        const context: TokenContext = { file, part: "Part 4", row: groupLabel };
        let resolved: CellResolution;
        try {
          resolved = resolveCell(groupLabel, context);
        } catch (err) {
          problems.push(
            err instanceof UnknownSectorTokenError ? err.message : `${file}: ${String(err)}`,
          );
          continue;
        }
        part4.push({
          groupLabel,
          sectors: resolved.sectors,
          mechanism,
          buyAvoid,
          isGroupRow: resolved.sectors.length > 1,
          notes: resolved.notes.map((n) => ({ column: "part4" as const, ...n })),
        });
      }
    }
  }

  // ── Part 5 ───────────────────────────────────────────────────────────────
  const part5: Part5Row[] = [];
  const t5 = tableAfter(lines, PART5_HEADING);
  if (!t5) {
    problems.push(`${file}: no table under "${PART5_HEADING}"`);
  } else {
    const header = splitTableRow(t5[0]);
    if (header.length !== 3 || header[0] !== PART5_HEADER_FIRST) {
      problems.push(
        `${file}: Part 5 header is [${header.join(" | ")}], expected ` +
          `[${PART5_HEADER_FIRST} | <worded per metric> | <worded per metric>]`,
      );
    } else {
      for (const raw of t5.slice(1).filter((r) => !isDividerRow(r))) {
        const cells = splitTableRow(raw);
        if (cells.length !== 3) {
          problems.push(
            `${file}: Part 5 row "${cells[0] ?? ""}" has ${cells.length} cells, expected 3`,
          );
          continue;
        }
        part5.push({ pairedMetric: cells[0], why: cells[1], sharpens: cells[2] });
      }
    }
  }

  if (problems.length > 0) return { conforming: false, title, problems };
  return { conforming: true, title, part3, part4, part5 };
}

// ── Counting helpers, used by the tests and the gap report ─────────────────

/** Classification cells in one parse: one per reading per classification column. */
export function classificationCellCount(parsed: ParsedDefinition): number {
  return parsed.part3.length * 3;
}

/** Mechanism cells in one parse: one per Part 4 row. */
export function mechanismCellCount(parsed: ParsedDefinition): number {
  return parsed.part4.length;
}

/** The sectors that carry no Part 4 mechanism row in this file. */
export function sectorsWithoutMechanism(parsed: ParsedDefinition, all: readonly Sector[]): Sector[] {
  const covered = new Set<Sector>();
  for (const row of parsed.part4) for (const s of row.sectors) covered.add(s);
  return all.filter((s) => !covered.has(s));
}

// ── The generated dataset's shape ──────────────────────────────────────────
// Declared here so the generator, the generated file and every reader share
// one definition. The generated file imports these as types only, so nothing
// in this module is pulled into its chunk at runtime.

export type DefinitionSurface = "economic" | "credit";

export interface MetricSectorEntry {
  surface: DefinitionSurface;
  /** The file's leading number: economic 1 to 69, credit 1 to 17. */
  number: number;
  /** The file's H1. */
  title: string;
  /** The file name, for example "06-Yield-Curve.md". */
  file: string;
  conforming: boolean;
  /** Present and non-empty only when conforming is false. */
  problems: string[];
  part3: Part3Row[];
  part4: Part4Row[];
  part5: Part5Row[];
}

export interface MetricSectorMap {
  economic: Record<string, MetricSectorEntry>;
  credit: Record<string, MetricSectorEntry>;
}
