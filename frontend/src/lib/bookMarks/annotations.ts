// Method 1: read real PDF annotation objects (what a note app writes when it
// keeps marks editable). Input is the plain data pdf.js returns from
// page.getAnnotations(), so this file has no pdf.js import and runs in Node.

import {
  normRect,
  rectGap,
  unionRect,
  type FoundMark,
  type MarkKind,
  type Rect,
} from "./types";

/** The fields of a pdf.js annotation this module reads. */
export interface RawAnnotation {
  subtype?: string;
  rect?: ArrayLike<number>;
  /** Ink: one flat [x0, y0, x1, y1, ...] list per stroke (pdf.js v4+). */
  inkLists?: ArrayLike<ArrayLike<number> | { x: number; y: number }[]>;
  /** Highlight / Underline: 8 numbers per quad (flat) or arrays of points. */
  quadPoints?: ArrayLike<number> | ArrayLike<{ x: number; y: number }[]>;
  contentsObj?: { str?: string };
  textContent?: string[];
}

/** A pdf.js text item reduced to what text lookup needs. */
export interface TextRun {
  str: string;
  /** Baseline-left corner and size in PDF points (from item.transform). */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Subtypes that are part of the book itself, never the reader's marks. */
const IGNORED = new Set(["Link", "Popup", "Widget", "Watermark", "PrinterMark", "TrapNet", "Screen", "3D", "RichMedia"]);

export interface Stroke {
  points: number[]; // flat x, y pairs in PDF points
  rect: Rect;
  length: number;
}

export function toStroke(list: ArrayLike<number> | { x: number; y: number }[]): Stroke | null {
  const pts: number[] = [];
  const arr = list as ArrayLike<unknown>;
  if (arr.length > 0 && typeof arr[0] === "object") {
    for (const p of list as { x: number; y: number }[]) pts.push(p.x, p.y);
  } else {
    for (let i = 0; i < arr.length; i++) pts.push(Number(arr[i]));
  }
  if (pts.length < 2) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, len = 0;
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i], y = pts[i + 1];
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    if (i >= 2) len += Math.hypot(x - pts[i - 2], y - pts[i - 1]);
  }
  return { points: pts, rect: [x0, y0, x1, y1], length: len };
}

/** Thresholds in PDF points (72 per inch). */
export const INK = {
  /** An underline stroke is at least this wide... */
  underlineMinWidth: 24,
  /** ...no taller than this share of its width... */
  underlineMaxSlope: 0.2,
  /** ...and no taller than this. */
  underlineMaxHeight: 10,
  /** A stroke this straight (path length / width) counts as one line. */
  underlineMaxWiggle: 1.6,
  /** Strokes closer than this belong to the same piece of writing. */
  clusterGap: 10,
  /** A cluster smaller than this on both sides is a dot or a tick. */
  dotSize: 5,
  /** A single stroke whose path is this many times its size is cursive writing. */
  cursiveRatio: 3,
  /** This many strokes together read as handwriting. */
  handwritingStrokes: 3,
};

export function isUnderlineStroke(s: Stroke): boolean {
  const w = s.rect[2] - s.rect[0];
  const h = s.rect[3] - s.rect[1];
  return (
    w >= INK.underlineMinWidth &&
    h <= INK.underlineMaxHeight &&
    h <= w * INK.underlineMaxSlope &&
    s.length <= w * INK.underlineMaxWiggle
  );
}

/** Group strokes whose boxes lie within `gap` points of each other. */
export function clusterStrokes(strokes: Stroke[], gap = INK.clusterGap): Stroke[][] {
  const parent = strokes.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < strokes.length; i++) {
    for (let j = i + 1; j < strokes.length; j++) {
      if (rectGap(strokes[i].rect, strokes[j].rect) <= gap) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, Stroke[]>();
  strokes.forEach((s, i) => {
    const r = find(i);
    const g = groups.get(r);
    if (g) g.push(s);
    else groups.set(r, [s]);
  });
  return [...groups.values()];
}

/** Kind of a cluster of ink strokes that are not underlines. */
export function classifyInkCluster(strokes: Stroke[]): MarkKind {
  const rect = strokes.map((s) => s.rect).reduce(unionRect);
  const w = rect[2] - rect[0];
  const h = rect[3] - rect[1];
  if (w < INK.dotSize && h < INK.dotSize) return "mark";
  if (strokes.length >= INK.handwritingStrokes) return "handwriting";
  const total = strokes.reduce((a, s) => a + s.length, 0);
  if (total >= INK.cursiveRatio * Math.max(w, h)) return "handwriting";
  return "mark";
}

/**
 * Turn every Ink stroke on a page into marks: each long, nearly flat stroke is
 * its own underline; the remaining strokes are grouped by distance and each
 * group is handwriting (many strokes or a looping path) or a mark (a tick,
 * bracket or dot).
 */
export function marksFromInk(page: number, strokes: Stroke[]): FoundMark[] {
  const out: FoundMark[] = [];
  const rest: Stroke[] = [];
  for (const s of strokes) {
    if (isUnderlineStroke(s)) out.push({ page, kind: "underline", method: "annotation", rect: s.rect });
    else rest.push(s);
  }
  for (const group of clusterStrokes(rest)) {
    out.push({
      page,
      kind: classifyInkCluster(group),
      method: "annotation",
      rect: group.map((s) => s.rect).reduce(unionRect),
    });
  }
  return out;
}

/** Quad boxes of a Highlight / Underline annotation, in PDF points. */
export function quadRects(q: RawAnnotation["quadPoints"]): Rect[] {
  if (!q || q.length === 0) return [];
  const rects: Rect[] = [];
  const first = (q as ArrayLike<unknown>)[0];
  if (typeof first === "object") {
    for (const quad of Array.from(q as ArrayLike<{ x: number; y: number }[]>)) {
      const xs = quad.map((p) => p.x);
      const ys = quad.map((p) => p.y);
      rects.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
    }
    return rects;
  }
  const flat = q as ArrayLike<number>;
  for (let i = 0; i + 7 < flat.length; i += 8) {
    const xs = [flat[i], flat[i + 2], flat[i + 4], flat[i + 6]];
    const ys = [flat[i + 1], flat[i + 3], flat[i + 5], flat[i + 7]];
    rects.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
  }
  return rects;
}

/**
 * Text of the page that sits inside the given boxes. A run is split evenly
 * across its width so a highlight over part of a line keeps only those words.
 */
export function textInRects(runs: TextRun[], rects: Rect[]): string {
  const lines: string[] = [];
  for (const r of rects) {
    const midY = (r[1] + r[3]) / 2;
    const parts: { x: number; s: string }[] = [];
    for (const run of runs) {
      if (!run.str) continue;
      const top = run.y + Math.max(run.height, 1);
      // The run's baseline band must cross the middle of the quad.
      if (midY < run.y - run.height * 0.3 || midY > top) continue;
      if (run.x + run.width < r[0] || run.x > r[2]) continue;
      const n = run.str.length;
      const cw = run.width / Math.max(1, n);
      // Character widths are estimated evenly, so allow a little slack at the
      // quad's edges or a wide first letter gets dropped.
      const slack = cw * 0.35;
      let s = "";
      for (let i = 0; i < n; i++) {
        const cx = run.x + cw * (i + 0.5);
        if (cx >= r[0] - slack && cx <= r[2] + slack) s += run.str[i];
      }
      if (s) parts.push({ x: run.x, s });
    }
    parts.sort((a, b) => a.x - b.x);
    const line = parts.map((p) => p.s).join("").replace(/\s+/g, " ").trim();
    if (line) lines.push(line);
  }
  return lines.join(" ").replace(/\s+/g, " ").trim();
}

/** True when this page's annotations include any the reader made. */
export function hasReaderMarks(anns: RawAnnotation[]): boolean {
  return anns.some((a) => a.subtype && !IGNORED.has(a.subtype));
}

/**
 * Marks from one page's annotations. `runs` (the page's text) is optional;
 * when given, highlights and underlines carry the words they cover.
 */
export function marksFromAnnotations(page: number, anns: RawAnnotation[], runs?: TextRun[]): FoundMark[] {
  const out: FoundMark[] = [];
  const strokes: Stroke[] = [];
  for (const a of anns) {
    const sub = a.subtype;
    if (!sub || IGNORED.has(sub)) continue;
    const rect = a.rect && a.rect.length >= 4 ? normRect(Array.from(a.rect)) : null;
    if (sub === "Ink") {
      let any = false;
      for (const list of Array.from(a.inkLists ?? [])) {
        const s = toStroke(list);
        if (s) {
          strokes.push(s);
          any = true;
        }
      }
      if (!any && rect) out.push({ page, kind: "mark", method: "annotation", rect });
      continue;
    }
    if (!rect) continue;
    if (sub === "Highlight" || sub === "Underline" || sub === "Squiggly") {
      const kind: MarkKind = sub === "Highlight" ? "highlight" : "underline";
      const quads = quadRects(a.quadPoints);
      let text = runs ? textInRects(runs, quads.length ? quads : [rect]) : "";
      const comment = a.contentsObj?.str?.trim();
      if (comment) text = text ? `${text}\n\nNote: ${comment}` : comment;
      out.push({ page, kind, method: "annotation", rect, ...(text ? { text } : {}) });
      continue;
    }
    if (sub === "FreeText" || sub === "Text") {
      const text = a.contentsObj?.str?.trim() || (a.textContent ?? []).join(" ").trim();
      out.push({ page, kind: "note", method: "annotation", rect, ...(text ? { text } : {}) });
      continue;
    }
    const text = a.contentsObj?.str?.trim();
    out.push({ page, kind: "mark", method: "annotation", rect, ...(text ? { text } : {}) });
  }
  out.push(...marksFromInk(page, strokes));
  return out;
}
