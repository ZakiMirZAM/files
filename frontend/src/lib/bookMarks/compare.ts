// Method 2: page comparison. When a note app flattens marks into the page
// image there are no annotation objects left, so we render the marked page and
// the clean original at the same scale and look for what changed.
//
// Pipeline (all pure, on RGBA pixel arrays):
//   diffMask      pixel differs from the clean page (with 1px shift tolerance)
//   despeckle     drop lone changed pixels (anti-aliasing noise)
//   dilate        join nearby strokes so a handwritten word becomes one blob
//   findRegions   connected components, with stats from the undilated pixels
//   classifyRegion  highlight band / underline line / handwriting

import type { MarkKind, Rect } from "./types";

export interface Bitmap {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, row-major (what getImageData returns). */
  data: Uint8ClampedArray | Uint8Array;
}

export interface DiffOptions {
  /** Max channel difference that still counts as "same" (0..255). */
  threshold?: number;
  /** Search this many pixels around for a match, to absorb tiny shifts. */
  shiftTolerance?: number;
}

/** 1 where the marked page differs from the clean page. */
export function diffMask(marked: Bitmap, clean: Bitmap, opts: DiffOptions = {}): Uint8Array {
  const { width: w, height: h } = marked;
  if (clean.width !== w || clean.height !== h) throw new Error("Bitmaps differ in size");
  const t = opts.threshold ?? 48;
  const r = opts.shiftTolerance ?? 1;
  const m = marked.data;
  const c = clean.data;
  const mask = new Uint8Array(w * h);
  const dist = (i: number, j: number) =>
    Math.max(Math.abs(m[i] - c[j]), Math.abs(m[i + 1] - c[j + 1]), Math.abs(m[i + 2] - c[j + 2]));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const i = p * 4;
      if (dist(i, i) <= t) continue;
      let matched = false;
      for (let dy = -r; dy <= r && !matched; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w || (dx === 0 && dy === 0)) continue;
          if (dist(i, (yy * w + xx) * 4) <= t) {
            matched = true;
            break;
          }
        }
      }
      if (!matched) mask[p] = 1;
    }
  }
  return mask;
}

/** Keep a changed pixel only when at least `minNeighbours` of its 8 neighbours changed too. */
export function despeckle(mask: Uint8Array, w: number, h: number, minNeighbours = 2): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!mask[p]) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if ((dx || dy) && xx >= 0 && xx < w && mask[yy * w + xx]) n++;
        }
      }
      if (n >= minNeighbours) out[p] = 1;
    }
  }
  return out;
}

/** Square dilation by `radius` pixels, done as two running-window passes. */
export function dilate(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  if (radius <= 0) return mask.slice();
  const tmp = new Uint8Array(mask.length);
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let count = 0;
    for (let x = 0; x < Math.min(radius, w); x++) count += mask[row + x];
    for (let x = 0; x < w; x++) {
      const add = x + radius;
      if (add < w) count += mask[row + add];
      const drop = x - radius - 1;
      if (drop >= 0) count -= mask[row + drop];
      if (count > 0) tmp[row + x] = 1;
    }
  }
  for (let x = 0; x < w; x++) {
    let count = 0;
    for (let y = 0; y < Math.min(radius, h); y++) count += tmp[y * w + x];
    for (let y = 0; y < h; y++) {
      const add = y + radius;
      if (add < h) count += tmp[add * w + x];
      const drop = y - radius - 1;
      if (drop >= 0) count -= tmp[drop * w + x];
      if (count > 0) out[y * w + x] = 1;
    }
  }
  return out;
}

export interface Region {
  /** Pixel box of the changed (undilated) pixels: [x0, y0, x1, y1], x1/y1 exclusive. */
  box: Rect;
  /** Number of changed pixels. */
  count: number;
  /** Share of changed pixels whose new colour is a light, saturated tint (a highlighter). */
  tintShare: number;
  /** Share of changed pixels whose new colour is dark (pen or pencil). */
  darkShare: number;
}

function colourStats(px: Uint8ClampedArray | Uint8Array, i: number): { tint: boolean; dark: boolean } {
  const r = px[i], g = px[i + 1], b = px[i + 2];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  return { tint: max - min >= 40 && light >= 150, dark: light < 140 };
}

/**
 * Connected regions of `grouping` (the dilated mask). Stats come from the
 * pixels of `mask` (undilated) that fall inside each region, read from the
 * marked page's colours.
 */
export function findRegions(mask: Uint8Array, grouping: Uint8Array, w: number, h: number, marked: Bitmap): Region[] {
  const labels = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  const regions: Region[] = [];
  let next = 0;
  for (let start = 0; start < w * h; start++) {
    if (!grouping[start] || labels[start]) continue;
    next++;
    let sp = 0;
    stack[sp++] = start;
    labels[start] = next;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    let count = 0, tint = 0, dark = 0;
    while (sp > 0) {
      const p = stack[--sp];
      const x = p % w;
      const y = (p - x) / w;
      if (mask[p]) {
        count++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        const s = colourStats(marked.data, p * 4);
        if (s.tint) tint++;
        if (s.dark) dark++;
      }
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const q = yy * w + xx;
          if (grouping[q] && !labels[q]) {
            labels[q] = next;
            stack[sp++] = q;
          }
        }
      }
    }
    if (count > 0) {
      regions.push({ box: [x0, y0, x1 + 1, y1 + 1], count, tintShare: tint / count, darkShare: dark / count });
    }
  }
  return regions;
}

/** Thresholds in PDF points, so they hold at any render scale. */
export const REGION = {
  /** Regions with fewer changed square points than this are specks. */
  minAreaPt2: 4,
  /** ...or smaller than this on their longest side. */
  minSidePt: 3,
  highlightMinFill: 0.4,
  highlightMinTint: 0.5,
  highlightMinHeight: 4,
  underlineMinWidth: 15,
  underlineMaxThickness: 4,
  underlineMinAspect: 4,
  underlineMaxHeight: 10,
};

export function isSpeck(r: Region, scale: number): boolean {
  const wPt = (r.box[2] - r.box[0]) / scale;
  const hPt = (r.box[3] - r.box[1]) / scale;
  return r.count / (scale * scale) < REGION.minAreaPt2 || Math.max(wPt, hPt) < REGION.minSidePt;
}

/**
 * Kind of a changed region. `scale` is canvas pixels per PDF point.
 *   highlight: a band at least as wide as tall, mostly filled, in a light tint
 *     (text still shows through, so dark text pixels do not count as changed)
 *   underline: a long, thin, roughly horizontal line
 *   handwriting: anything else
 */
export function classifyRegion(r: Region, scale: number): MarkKind {
  const wPx = r.box[2] - r.box[0];
  const hPx = r.box[3] - r.box[1];
  const wPt = wPx / scale;
  const hPt = hPx / scale;
  const fill = r.count / Math.max(1, wPx * hPx);
  if (
    r.tintShare >= REGION.highlightMinTint &&
    fill >= REGION.highlightMinFill &&
    hPt >= REGION.highlightMinHeight &&
    wPt >= hPt * 1.2
  ) {
    return "highlight";
  }
  const thickness = r.count / Math.max(1, wPx) / scale;
  if (
    wPt >= REGION.underlineMinWidth &&
    hPt <= REGION.underlineMaxHeight &&
    wPt >= hPt * REGION.underlineMinAspect &&
    thickness <= REGION.underlineMaxThickness
  ) {
    return "underline";
  }
  return "handwriting";
}

export interface ComparedRegion {
  kind: MarkKind;
  /** Pixel box on the rendered page. */
  box: Rect;
}

export interface CompareResult {
  regions: ComparedRegion[];
  /** Share of the page that changed; a large share means the pages do not line up. */
  changedShare: number;
  /** True when so much changed that the result is not trustworthy. */
  misaligned: boolean;
}

export interface CompareOptions extends DiffOptions {
  /** Join strokes closer than this many points. */
  joinPt?: number;
  /** Above this share of changed pixels the page is reported, not read. */
  maxChangedShare?: number;
}

/** Full comparison of one page. `scale` is canvas pixels per PDF point. */
export function comparePage(marked: Bitmap, clean: Bitmap, scale: number, opts: CompareOptions = {}): CompareResult {
  const { width: w, height: h } = marked;
  const raw = diffMask(marked, clean, opts);
  const mask = despeckle(raw, w, h);
  let changed = 0;
  for (let i = 0; i < mask.length; i++) changed += mask[i];
  const changedShare = changed / Math.max(1, w * h);
  if (changedShare > (opts.maxChangedShare ?? 0.25)) {
    return { regions: [], changedShare, misaligned: true };
  }
  if (changed === 0) return { regions: [], changedShare: 0, misaligned: false };
  const radius = Math.max(1, Math.round((opts.joinPt ?? 6) * scale));
  const grouped = dilate(mask, w, h, radius);
  const regions = findRegions(mask, grouped, w, h, marked)
    .filter((r) => !isSpeck(r, scale))
    .map((r) => ({ kind: classifyRegion(r, scale), box: r.box }));
  return { regions, changedShare, misaligned: false };
}

/** Invert an affine transform [a, b, c, d, e, f]. */
export function invertTransform(t: readonly number[]): number[] {
  const [a, b, c, d, e, f] = t;
  const det = a * d - b * c;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

/**
 * Pixel box on a canvas rendered with `viewportTransform` (pdf.js
 * viewport.transform, PDF to canvas) back to a rect in PDF points.
 */
export function pixelBoxToPdf(box: Rect, viewportTransform: readonly number[]): Rect {
  const inv = invertTransform(viewportTransform);
  const pts = [
    [box[0], box[1]],
    [box[2], box[1]],
    [box[0], box[3]],
    [box[2], box[3]],
  ].map(([x, y]) => [inv[0] * x + inv[2] * y + inv[4], inv[1] * x + inv[3] * y + inv[5]]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Rect in PDF points to a pixel box on a canvas rendered with `viewportTransform`. */
export function pdfRectToPixels(rect: Rect, viewportTransform: readonly number[]): Rect {
  const t = viewportTransform;
  const pts = [
    [rect[0], rect[1]],
    [rect[2], rect[1]],
    [rect[0], rect[3]],
    [rect[2], rect[3]],
  ].map(([x, y]) => [t[0] * x + t[2] * y + t[4], t[1] * x + t[3] * y + t[5]]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Pixel box grown by `pad` on each side and clipped to the canvas. */
export function padBox(box: Rect, pad: number, w: number, h: number): Rect {
  return [
    Math.max(0, Math.floor(box[0] - pad)),
    Math.max(0, Math.floor(box[1] - pad)),
    Math.min(w, Math.ceil(box[2] + pad)),
    Math.min(h, Math.ceil(box[3] + pad)),
  ];
}
