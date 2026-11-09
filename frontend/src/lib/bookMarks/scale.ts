// Render-scale choice. iOS Safari refuses canvases above about 16.7 million
// pixels and runs out of memory well before that when several are alive, so
// every page render asks this function for a scale that fits a pixel budget.

/** Hard ceiling from iOS Safari (4096 x 4096). */
export const IOS_MAX_CANVAS_PIXELS = 16_777_216;

export interface ScaleOptions {
  /** Preferred size of the page's longer side, in canvas pixels. */
  targetLongSide: number;
  /** Pixel budget for one canvas (kept below the iOS ceiling). */
  maxPixels?: number;
  /** Never go above this scale (1 = 72 dpi). */
  maxScale?: number;
}

/**
 * True when two pages can be compared pixel for pixel: same size in points
 * (within 1 point), or the same shape at another size (within 1%), which
 * happens when an app re-exports the book at a different page size.
 */
export function sameShape(a: { w: number; h: number }, b: { w: number; h: number }): boolean {
  if (Math.abs(a.w - b.w) <= 1 && Math.abs(a.h - b.h) <= 1) return true;
  const ra = a.w / a.h;
  const rb = b.w / b.h;
  return Math.abs(ra - rb) / rb <= 0.01;
}

/**
 * Scale (canvas pixels per PDF point) for a page of the given size in points.
 * Aims for `targetLongSide`, then shrinks until width x height fits the budget.
 */
export function chooseScale(widthPt: number, heightPt: number, opts: ScaleOptions): number {
  const w = Math.max(1, Math.abs(widthPt));
  const h = Math.max(1, Math.abs(heightPt));
  const budget = Math.min(opts.maxPixels ?? 4_000_000, IOS_MAX_CANVAS_PIXELS);
  let scale = opts.targetLongSide / Math.max(w, h);
  if (opts.maxScale !== undefined) scale = Math.min(scale, opts.maxScale);
  const fit = Math.sqrt(budget / (w * h));
  scale = Math.min(scale, fit);
  // Floor so rounding the canvas size up never crosses the budget.
  while (Math.ceil(w * scale) * Math.ceil(h * scale) > budget && scale > 0.01) scale *= 0.99;
  return Math.max(0.01, scale);
}
