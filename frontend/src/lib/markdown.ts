// Minimal, dependency-free Markdown parser for the Economic Metrics definition
// docs. Supports exactly the constructs those files use: ATX headings, GFM pipe
// tables, ordered/unordered lists, horizontal rules, and paragraphs (with inline
// **bold** / *italic* / `code`). It is intentionally small and self-contained so
// the verbatim definition text renders faithfully without adding a dependency.

export type MdBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; start: number; items: string[] }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "hr" };

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const HR_RE = /^(-{3,}|\*{3,}|_{3,})$/;
const UL_RE = /^[-*+]\s+(.*)$/;
const OL_NUM_RE = /^(\d+)\.\s+(.*)$/;

/** A table separator row, e.g. `| --- | :--: |` (only pipes, dashes, colons, spaces). */
function isTableSeparator(line: string): boolean {
  const t = line.trim();
  if (!t.includes("-") || !t.includes("|")) return false;
  return /^\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?$/.test(t);
}

function isTableRow(line: string): boolean {
  return line.trim().startsWith("|");
}

/** Split a pipe-delimited row into trimmed cells, dropping the leading/trailing empties. */
function splitRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|")) t = t.slice(0, -1);
  return t.split("|").map((c) => c.trim());
}

export function parseMarkdown(md: string): MdBlock[] {
  const lines = md.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const blocks: MdBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();

    // Blank line — skip.
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Heading.
    const h = HEADING_RE.exec(line);
    if (h) {
      blocks.push({ type: "heading", level: h[1].length, text: h[2].trim() });
      i++;
      continue;
    }

    // Horizontal rule.
    if (HR_RE.test(line.trim())) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // Table: a pipe row immediately followed by a separator row.
    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = splitRow(line);
      i += 2; // consume header + separator
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i]) && lines[i].trim() !== "") {
        rows.push(splitRow(lines[i]));
        i++;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }

    // Unordered list.
    if (UL_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && UL_RE.test(lines[i].trimEnd())) {
        items.push(UL_RE.exec(lines[i].trimEnd())![1].trim());
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    // Ordered list. Preserve the real starting number so blank-line-separated
    // numbered items (e.g. the ten questions) keep their 1..N numbering.
    if (OL_NUM_RE.test(line)) {
      const items: string[] = [];
      const start = parseInt(OL_NUM_RE.exec(line)![1], 10);
      while (i < lines.length && OL_NUM_RE.test(lines[i].trimEnd())) {
        items.push(OL_NUM_RE.exec(lines[i].trimEnd())![2].trim());
        i++;
      }
      blocks.push({ type: "ol", start: Number.isFinite(start) ? start : 1, items });
      continue;
    }

    // Paragraph: accumulate consecutive plain lines until a blank line or a new
    // block construct begins.
    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i].trimEnd();
      if (
        l.trim() === "" ||
        HEADING_RE.test(l) ||
        HR_RE.test(l.trim()) ||
        UL_RE.test(l) ||
        OL_NUM_RE.test(l) ||
        (isTableRow(l) && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
      ) {
        break;
      }
      para.push(l.trim());
      i++;
    }
    if (para.length > 0) blocks.push({ type: "paragraph", text: para.join(" ") });
  }

  return blocks;
}

/** Inline token used by the renderer for **bold**, *italic*, and `code`. */
export type InlineToken =
  | { kind: "text"; value: string }
  | { kind: "bold"; value: string }
  | { kind: "italic"; value: string }
  | { kind: "code"; value: string };

/** Tokenize inline emphasis. Handles **bold**, *italic*, and `code`. */
export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  // Order matters: bold (**) before italic (*).
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) tokens.push({ kind: "text", value: text.slice(last, m.index) });
    if (m[2] !== undefined) tokens.push({ kind: "bold", value: m[2] });
    else if (m[3] !== undefined) tokens.push({ kind: "italic", value: m[3] });
    else if (m[4] !== undefined) tokens.push({ kind: "code", value: m[4] });
    last = m.index + m[0].length;
  }
  if (last < text.length) tokens.push({ kind: "text", value: text.slice(last) });
  return tokens;
}
