// When both methods find the same mark, keep the annotation one: it carries
// the exact kind and any typed text.

import { rectArea, rectIntersection, type FoundMark, type Rect } from "./types";

/** Points added around an annotation box before comparing (the drawn stroke is wider than its path). */
const PAD = 3;
/** Overlap, as a share of the smaller box, that makes two marks the same. */
const SAME = 0.3;

function padded(r: Rect): Rect {
  return [r[0] - PAD, r[1] - PAD, r[2] + PAD, r[3] + PAD];
}

export function sameArea(a: Rect, b: Rect): boolean {
  const pa = padded(a);
  const inter = rectIntersection(pa, b);
  if (inter <= 0) return false;
  const smaller = Math.min(rectArea(pa), rectArea(b));
  return smaller > 0 && inter / smaller >= SAME;
}

/** All annotation marks, plus each comparison mark that no annotation mark already covers. */
export function dedupeMarks(marks: FoundMark[]): FoundMark[] {
  const byPage = new Map<number, FoundMark[]>();
  for (const m of marks) {
    if (m.method !== "annotation") continue;
    const list = byPage.get(m.page);
    if (list) list.push(m);
    else byPage.set(m.page, [m]);
  }
  return marks.filter((m) => {
    if (m.method === "annotation") return true;
    const anns = byPage.get(m.page) ?? [];
    return !anns.some((a) => sameArea(a.rect, m.rect));
  });
}
