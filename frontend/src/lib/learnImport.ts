// Flashcard import (Learn slice A4). CSV, TSV and the Anki plain-text export
// are parsed here in the browser; .xlsx and .apkg go to the backend
// (POST /api/learn/import), which returns cards and stores nothing.

export interface ImportCard {
  front: string;
  back: string;
  tags?: string[];
}

/** A parsed text file: rows plus a suggested column mapping the user can change. */
export interface ParsedTable {
  rows: string[][];
  /** Column names when the file had a header row (CSV) or Anki column headers. */
  header?: string[];
  columnCount: number;
  frontCol: number;
  backCol: number;
  /** -1 when there is no tags column. */
  tagsCol: number;
  /** Cells hold HTML (Anki #html:true or HTML found in cells). */
  html: boolean;
  separatorName: string;
}

export type ImportKind = "text" | "backend";

const BACKEND_EXT = new Set(["xlsx", "apkg", "colpkg"]);
const TEXT_EXT = new Set(["csv", "tsv", "txt", "text", "tab"]);

export function fileExtension(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function importKind(name: string): ImportKind | null {
  const ext = fileExtension(name);
  if (BACKEND_EXT.has(ext)) return "backend";
  if (TEXT_EXT.has(ext)) return "text";
  return null;
}

// ── HTML to readable text ─────────────────────────────────────────────────

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: String.fromCharCode(0x2014),
  hellip: "...",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  minus: "−",
  times: "×",
  middot: "·",
  bull: "•",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    const v = NAMED[body.toLowerCase()];
    return v ?? m;
  });
}

const HTML_HINT = /<\s*\/?\s*(br|div|p|li|ul|ol|b|i|u|em|strong|span|small|sup|sub|img|hr|table|tr|td|font)\b[^>]*>/i;

export function looksLikeHtml(s: string): boolean {
  return HTML_HINT.test(s);
}

/**
 * Turn card HTML into plain text people can read: line breaks for blocks,
 * bullets for list items, media and tags dropped, entities decoded.
 */
export function htmlToText(html: string): string {
  let s = html.replace(/\r\n?/g, "\n");
  s = s.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "");
  s = s.replace(/\[sound:[^\]]*\]/gi, "");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<li\b[^>]*>/gi, "\n• ");
  s = s.replace(/<\/(p|div|li|ul|ol|h[1-6]|tr|table|blockquote)\s*>/gi, "\n");
  s = s.replace(/<(p|div|ul|ol|h[1-6]|tr|table|blockquote|hr)\b[^>]*>/gi, "\n");
  s = s.replace(/<\/t[dh]\s*>/gi, "\t");
  s = s.replace(/<[^>]*>/g, "");
  s = decodeEntities(s);
  s = s.replace(/ /g, " ");
  s = s
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n");
  s = s.replace(/\n{2,}/g, "\n");
  return s.trim();
}

// ── Delimited text ────────────────────────────────────────────────────────

/** Split delimited text into rows, honouring "quoted" fields with separators, quotes ("") and newlines. */
export function parseDelimited(text: string, sep: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let atFieldStart = true;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && atFieldStart) {
      inQuotes = true;
      atFieldStart = false;
      continue;
    }
    if (ch === sep) {
      row.push(field);
      field = "";
      atFieldStart = true;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      atFieldStart = true;
      continue;
    }
    field += ch;
    atFieldStart = false;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const SEPARATORS: Record<string, string> = {
  tab: "\t",
  comma: ",",
  semicolon: ";",
  pipe: "|",
  colon: ":",
  space: " ",
};

function sepName(sep: string): string {
  return Object.entries(SEPARATORS).find(([, v]) => v === sep)?.[0] ?? sep;
}

/** Pick the separator that splits the first lines most consistently into 2+ columns. */
export function guessSeparator(lines: string[]): string {
  const sample = lines.slice(0, 20);
  let best = "\t";
  let bestScore = -1;
  for (const sep of ["\t", ",", ";", "|"]) {
    const counts = sample.map((l) => parseDelimited(l, sep)[0]?.length ?? 0);
    const multi = counts.filter((c) => c >= 2).length;
    if (multi === 0) continue;
    const same = counts.filter((c) => c === counts[0]).length;
    const score = multi * 10 + same + (sep === "\t" ? 0.5 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = sep;
    }
  }
  return best;
}

const FRONT_NAMES = ["front", "question", "term", "prompt", "q", "side 1", "word"];
const BACK_NAMES = ["back", "answer", "definition", "a", "side 2", "meaning"];
const TAG_NAMES = ["tags", "tag"];

function headerIndex(header: string[], names: string[]): number {
  return header.findIndex((h) => names.includes(h.trim().toLowerCase()));
}

/**
 * Parse CSV, TSV or an Anki "Notes in Plain Text" export. Anki header lines
 * (#separator:tab, #html:true, #tags column:3, #columns:..., #deck column:N,
 * #notetype column:N, #guid column:N) set the separator and column roles.
 */
export function parseTextImport(text: string, fileName = ""): ParsedTable {
  const clean = text.replace(/^﻿/, "");
  const lines = clean.split(/\r?\n/);
  let sep: string | null = null;
  let html: boolean | null = null;
  let tagsCol = -1;
  const skipCols = new Set<number>();
  let header: string[] | undefined;
  let bodyStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const m = /^#([a-z ]+):(.*)$/i.exec(lines[i].trim());
    if (!m) break;
    bodyStart = i + 1;
    const key = m[1].trim().toLowerCase();
    const val = m[2].trim();
    if (key === "separator") sep = SEPARATORS[val.toLowerCase()] ?? (val.length === 1 ? val : sep);
    else if (key === "html") html = val.toLowerCase() === "true";
    else if (key === "tags column") tagsCol = parseInt(val, 10) - 1;
    else if (key === "deck column" || key === "notetype column" || key === "guid column") {
      const n = parseInt(val, 10) - 1;
      if (n >= 0) skipCols.add(n);
    } else if (key === "columns") header = val.split(sep ?? "\t");
  }

  const body = lines.slice(bodyStart).join("\n");
  if (!sep) {
    const ext = fileExtension(fileName);
    sep = ext === "tsv" || ext === "tab" ? "\t" : guessSeparator(lines.slice(bodyStart));
  }
  let rows = parseDelimited(body, sep);

  // A plain CSV header row such as "Front,Back,Tags".
  if (!header && rows.length > 0) {
    const first = rows[0];
    if (headerIndex(first, FRONT_NAMES) >= 0 && headerIndex(first, BACK_NAMES) >= 0) {
      header = first;
      rows = rows.slice(1);
    }
  }

  const columnCount = rows.reduce((m, r) => Math.max(m, r.length), header?.length ?? 0);
  if (header && tagsCol < 0) tagsCol = headerIndex(header, TAG_NAMES);
  if (tagsCol >= columnCount) tagsCol = -1;

  let frontCol = header ? headerIndex(header, FRONT_NAMES) : -1;
  let backCol = header ? headerIndex(header, BACK_NAMES) : -1;
  const free = Array.from({ length: columnCount }, (_, i) => i).filter((i) => i !== tagsCol && !skipCols.has(i));
  if (frontCol < 0) frontCol = free[0] ?? 0;
  if (backCol < 0) backCol = free.find((i) => i !== frontCol) ?? Math.min(1, columnCount - 1);

  const isHtml = html ?? rows.slice(0, 50).some((r) => r.some(looksLikeHtml));
  return { rows, header, columnCount, frontCol, backCol, tagsCol, html: isHtml, separatorName: sepName(sep) };
}

/** Build cards from a parsed table and the chosen columns. Rows with both sides empty are dropped. */
export function tableToCards(t: Pick<ParsedTable, "rows" | "frontCol" | "backCol" | "tagsCol" | "html">): ImportCard[] {
  const conv = (s: string) => (t.html || looksLikeHtml(s) ? htmlToText(s) : s.trim());
  const out: ImportCard[] = [];
  for (const r of t.rows) {
    const front = conv(r[t.frontCol] ?? "");
    const back = conv(r[t.backCol] ?? "");
    if (!front && !back) continue;
    const card: ImportCard = { front, back };
    if (t.tagsCol >= 0) {
      const tags = (r[t.tagsCol] ?? "").split(/\s+/).filter(Boolean);
      if (tags.length) card.tags = tags;
    }
    out.push(card);
  }
  return out;
}

/** A deck name from a file name: "damodaran_iv_ch01_core.txt" -> "damodaran iv ch01 core". */
export function deckNameFromFile(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();
  return base || "Imported deck";
}

// ── Backend parse (.xlsx, .apkg) ──────────────────────────────────────────

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:8000";

/** /api/learn/import accepts files up to 25 MB (backend LEARN_IMPORT_MAX_FILE; nginx allows 26 MB). */
export const MAX_BACKEND_UPLOAD = 25 * 1024 * 1024;

export async function parseOnServer(file: File): Promise<ImportCard[]> {
  if (file.size > MAX_BACKEND_UPLOAD) {
    throw new Error(
      `This file is ${(file.size / (1024 * 1024)).toFixed(1)} MB. The limit is 25 MB. For an Anki deck, export it without media, or export "Notes in Plain Text" and import the .txt.`,
    );
  }
  const form = new FormData();
  form.append("file", file, file.name);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/learn/import`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new Error("Could not reach the server to read this file. Try again in a moment.");
  }
  if (!res.ok) {
    let detail = `The server could not read this file (${res.status}).`;
    try {
      const j = (await res.json()) as { detail?: unknown };
      if (typeof j.detail === "string") detail = j.detail;
    } catch {
      // keep the generic message
    }
    throw new Error(detail);
  }
  const data = (await res.json()) as { cards?: ImportCard[] };
  return (data.cards ?? []).filter((c) => (c.front ?? "").trim() || (c.back ?? "").trim());
}

/** Split cards into groups for chunked saving. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
