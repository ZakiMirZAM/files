// Shared types for finding the owner's marks in a book PDF (Learn slice A7).
// Pure data, no browser APIs, so every step can be unit tested in Node.

export type MarkKind = "handwriting" | "underline" | "highlight" | "note" | "mark";
export type MarkMethod = "annotation" | "comparison";

/** [x0, y0, x1, y1] with x0 <= x1 and y0 <= y1. */
export type Rect = [number, number, number, number];

/** One mark found on a page. `rect` is in PDF points (page user space). */
export interface FoundMark {
  page: number;
  kind: MarkKind;
  method: MarkMethod;
  rect: Rect;
  text?: string;
}

export const MARK_KINDS: MarkKind[] = ["highlight", "underline", "handwriting", "note", "mark"];

export const MARK_KIND_LABEL: Record<MarkKind, string> = {
  highlight: "Highlight",
  underline: "Underline",
  handwriting: "Handwriting",
  note: "Note",
  mark: "Mark",
};

export function normRect(r: readonly number[]): Rect {
  const [a, b, c, d] = r;
  return [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)];
}

export function rectArea(r: Rect): number {
  return Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1]);
}

export function rectIntersection(a: Rect, b: Rect): number {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  return w > 0 && h > 0 ? w * h : 0;
}

export function unionRect(a: Rect, b: Rect): Rect {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

/** Gap between two rects (0 when they touch or overlap). */
export function rectGap(a: Rect, b: Rect): number {
  const dx = Math.max(0, Math.max(a[0], b[0]) - Math.min(a[2], b[2]));
  const dy = Math.max(0, Math.max(a[1], b[1]) - Math.min(a[3], b[3]));
  return Math.hypot(dx, dy);
}
