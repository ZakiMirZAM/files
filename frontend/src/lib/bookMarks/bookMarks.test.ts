import { describe, expect, it } from "vitest";
import { chooseScale, IOS_MAX_CANVAS_PIXELS, sameShape } from "./scale";
import {
  classifyInkCluster,
  isUnderlineStroke,
  marksFromAnnotations,
  quadRects,
  textInRects,
  toStroke,
  type RawAnnotation,
} from "./annotations";
import {
  comparePage,
  despeckle,
  diffMask,
  dilate,
  pdfRectToPixels,
  pixelBoxToPdf,
  type Bitmap,
} from "./compare";
import { dedupeMarks } from "./dedupe";
import type { FoundMark } from "./types";

// ---------- scale ----------

describe("chooseScale", () => {
  it("aims for the target long side", () => {
    expect(chooseScale(600, 800, { targetLongSide: 1600 })).toBeCloseTo(2, 5);
  });
  it("never exceeds the pixel budget or the iOS ceiling", () => {
    const s = chooseScale(612, 792, { targetLongSide: 20000, maxPixels: 50_000_000 });
    expect(Math.ceil(612 * s) * Math.ceil(792 * s)).toBeLessThanOrEqual(IOS_MAX_CANVAS_PIXELS);
    const t = chooseScale(612, 792, { targetLongSide: 4000, maxPixels: 2_000_000 });
    expect(Math.ceil(612 * t) * Math.ceil(792 * t)).toBeLessThanOrEqual(2_000_000);
  });
  it("pages compare when they share a size or a shape", () => {
    expect(sameShape({ w: 612, h: 792 }, { w: 612.5, h: 792 })).toBe(true);
    expect(sameShape({ w: 612, h: 792 }, { w: 1224, h: 1584 })).toBe(true);
    expect(sameShape({ w: 612, h: 792 }, { w: 595, h: 842 })).toBe(false);
  });
  it("respects maxScale", () => {
    expect(chooseScale(100, 100, { targetLongSide: 5000, maxScale: 3 })).toBe(3);
  });
});

// ---------- annotations ----------

function line(x0: number, y0: number, x1: number, y1: number, n = 20): number[] {
  const pts: number[] = [];
  for (let i = 0; i <= n; i++) pts.push(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n);
  return pts;
}

function zigzag(x0: number, y0: number, w: number, h: number, waves: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i <= waves * 8; i++) {
    const t = i / (waves * 8);
    pts.push(x0 + w * t, y0 + (h / 2) * (1 + Math.sin(t * waves * 2 * Math.PI)));
  }
  return pts;
}

describe("ink strokes", () => {
  it("a long flat stroke is an underline", () => {
    const s = toStroke(line(100, 500, 300, 502))!;
    expect(isUnderlineStroke(s)).toBe(true);
  });
  it("a short or steep stroke is not", () => {
    expect(isUnderlineStroke(toStroke(line(100, 500, 115, 501))!)).toBe(false);
    expect(isUnderlineStroke(toStroke(line(100, 500, 140, 540))!)).toBe(false);
    expect(isUnderlineStroke(toStroke(zigzag(100, 500, 100, 8, 10))!)).toBe(false);
  });
  it("many small strokes are handwriting, a single tick is a mark, a dot is a mark", () => {
    const letters = [0, 1, 2, 3].map((i) => toStroke(zigzag(100 + i * 8, 400, 6, 10, 2))!);
    expect(classifyInkCluster(letters)).toBe("handwriting");
    expect(classifyInkCluster([toStroke(line(50, 50, 60, 40))!])).toBe("mark");
    expect(classifyInkCluster([toStroke([10, 10, 11, 11])!])).toBe("mark");
  });
  it("one looping stroke is cursive handwriting", () => {
    expect(classifyInkCluster([toStroke(zigzag(100, 400, 30, 12, 6))!])).toBe("handwriting");
  });
  it("accepts {x, y} point lists (older pdf.js)", () => {
    const s = toStroke([{ x: 1, y: 2 }, { x: 5, y: 2 }])!;
    expect(s.rect).toEqual([1, 2, 5, 2]);
  });
});

describe("marksFromAnnotations", () => {
  const runs = [
    { str: "Value is what you get.", x: 100, y: 600, width: 220, height: 10 },
    { str: "Price is what you pay.", x: 100, y: 580, width: 220, height: 10 },
  ];
  const anns: RawAnnotation[] = [
    { subtype: "Link", rect: [0, 0, 10, 10] },
    { subtype: "Popup", rect: [0, 0, 10, 10] },
    {
      subtype: "Highlight",
      rect: [98, 598, 322, 611],
      quadPoints: new Float32Array([100, 611, 320, 611, 100, 598, 320, 598]),
      contentsObj: { str: "" },
    },
    { subtype: "FreeText", rect: [400, 400, 500, 420], contentsObj: { str: "Key idea" } },
    { subtype: "Square", rect: [10, 10, 50, 50] },
    {
      subtype: "Ink",
      rect: [100, 575, 320, 578],
      inkLists: [new Float32Array(line(100, 576, 320, 577))],
    },
    {
      subtype: "Ink",
      rect: [450, 300, 490, 315],
      inkLists: [0, 1, 2, 3].map((i) => new Float32Array(zigzag(450 + i * 9, 300, 7, 12, 2))),
    },
  ];
  const marks = marksFromAnnotations(12, anns, runs);
  const kinds = marks.map((m) => m.kind).sort();

  it("skips links and popups and classifies the rest", () => {
    expect(kinds).toEqual(["handwriting", "highlight", "mark", "note", "underline"]);
    expect(marks.every((m) => m.page === 12 && m.method === "annotation")).toBe(true);
  });
  it("highlights carry the words under them, notes carry their text", () => {
    expect(marks.find((m) => m.kind === "highlight")!.text).toBe("Value is what you get.");
    expect(marks.find((m) => m.kind === "note")!.text).toBe("Key idea");
  });
  it("reads flat and point-list quads", () => {
    expect(quadRects(new Float32Array([1, 9, 5, 9, 1, 2, 5, 2]))).toEqual([[1, 2, 5, 9]]);
    expect(quadRects([[{ x: 1, y: 9 }, { x: 5, y: 9 }, { x: 1, y: 2 }, { x: 5, y: 2 }]])).toEqual([[1, 2, 5, 9]]);
  });
  it("partial highlights keep only the covered words", () => {
    expect(textInRects(runs, [[100, 598, 150, 611]])).toBe("Value");
  });
});

// ---------- comparison ----------

const SCALE = 2; // canvas pixels per point
const W = 600 * SCALE / 2; // a 300 x 400 pt page at scale 2 = 600 x 800 px
const H = 800;

function blankPage(): Bitmap {
  const data = new Uint8ClampedArray(W * H * 4).fill(255);
  return { width: W, height: H, data };
}

function setPx(b: Bitmap, x: number, y: number, rgb: [number, number, number]) {
  if (x < 0 || y < 0 || x >= b.width || y >= b.height) return;
  const i = (y * b.width + x) * 4;
  b.data[i] = rgb[0];
  b.data[i + 1] = rgb[1];
  b.data[i + 2] = rgb[2];
}

/** Lines of fake text: dark glyph blocks with gaps, 20 px line pitch. */
function textPage(): Bitmap {
  const b = blankPage();
  for (let row = 0; row < 30; row++) {
    const top = 40 + row * 24;
    for (let x = 40; x < 560; x++) {
      if (x % 9 < 6 && (x * 7 + row) % 50 > 4) {
        for (let y = top; y < top + 14; y++) setPx(b, x, y, [20, 20, 20]);
      }
    }
  }
  return b;
}

function copy(b: Bitmap): Bitmap {
  return { width: b.width, height: b.height, data: new Uint8ClampedArray(b.data) };
}

/** Multiply a highlighter tint over a box (text stays dark, paper turns yellow). */
function highlight(b: Bitmap, x0: number, y0: number, x1: number, y1: number) {
  const tint = [255, 240, 102];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * b.width + x) * 4;
      for (let k = 0; k < 3; k++) b.data[i + k] = Math.round((b.data[i + k] * tint[k]) / 255);
    }
  }
}

function penLine(b: Bitmap, pts: [number, number][], thick: number, rgb: [number, number, number]) {
  for (let k = 1; k < pts.length; k++) {
    const [ax, ay] = pts[k - 1];
    const [bx, by] = pts[k];
    const n = Math.ceil(Math.hypot(bx - ax, by - ay)) * 2;
    for (let s = 0; s <= n; s++) {
      const x = ax + ((bx - ax) * s) / n;
      const y = ay + ((by - ay) * s) / n;
      for (let dy = 0; dy < thick; dy++) for (let dx = 0; dx < thick; dx++) setPx(b, Math.round(x + dx), Math.round(y + dy), rgb);
    }
  }
}

describe("pixel diff building blocks", () => {
  it("a 1px shift of the same page is not a change", () => {
    const a = textPage();
    const shifted = blankPage();
    for (let y = 0; y < H; y++) {
      for (let x = 1; x < W; x++) {
        const i = (y * W + x) * 4;
        const j = (y * W + x - 1) * 4;
        for (let k = 0; k < 4; k++) shifted.data[i + k] = a.data[j + k];
      }
    }
    const mask = diffMask(shifted, a);
    expect(mask.reduce((s, v) => s + v, 0)).toBe(0);
  });
  it("despeckle drops lone pixels, dilate grows a pixel into a square", () => {
    const w = 10, h = 10;
    const m = new Uint8Array(w * h);
    m[55] = 1;
    expect(despeckle(m, w, h).reduce((s, v) => s + v, 0)).toBe(0);
    expect(dilate(m, w, h, 2).reduce((s, v) => s + v, 0)).toBe(25);
  });
  it("pixel boxes round-trip to PDF points", () => {
    // pdf.js viewport for a page with view [0,0,300,400] at scale 2: y flips.
    const t = [2, 0, 0, -2, 0, 800];
    const pdf = pixelBoxToPdf([100, 200, 300, 260], t);
    expect(pdf).toEqual([50, 270, 150, 300]);
    expect(pdfRectToPixels(pdf, t)).toEqual([100, 200, 300, 260]);
  });
});

describe("comparePage on synthetic pages", () => {
  const clean = textPage();
  const marked = copy(clean);
  // Highlight over the text on row 3 (top 112).
  highlight(marked, 120, 110, 420, 128);
  // Blue pen underline under row 8 (top 232, glyphs end at 246).
  penLine(marked, [[80, 250], [400, 252]], 3, [0, 77, 230]);
  // Handwritten scribble in the right margin, rows 15 to 18.
  const scribble: [number, number][] = [];
  for (let i = 0; i <= 60; i++) scribble.push([566 + (i % 2 ? 12 : 0) + (i % 5), 400 + i * 1.6]);
  penLine(marked, scribble, 2, [30, 30, 120]);

  const res = comparePage(marked, clean, SCALE);
  const kinds = res.regions.map((r) => r.kind).sort();

  it("finds exactly the three marks", () => {
    expect(res.misaligned).toBe(false);
    expect(kinds).toEqual(["handwriting", "highlight", "underline"]);
  });
  it("puts each region where the mark was drawn", () => {
    const hl = res.regions.find((r) => r.kind === "highlight")!;
    expect(hl.box[0]).toBeGreaterThanOrEqual(118);
    expect(hl.box[2]).toBeLessThanOrEqual(422);
    const ul = res.regions.find((r) => r.kind === "underline")!;
    expect(ul.box[1]).toBeGreaterThanOrEqual(248);
    expect(ul.box[3]).toBeLessThanOrEqual(258);
    const hw = res.regions.find((r) => r.kind === "handwriting")!;
    expect(hw.box[0]).toBeGreaterThanOrEqual(560);
  });
  it("an unchanged page has no regions", () => {
    expect(comparePage(copy(clean), clean, SCALE).regions).toEqual([]);
  });
  it("a different page is reported as not lining up", () => {
    const other = blankPage();
    // A full-page picture where the clean page has text.
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) setPx(other, x, y, [(x * 3) % 200, (y * 5) % 180, 90]);
    const r = comparePage(other, clean, SCALE);
    expect(r.misaligned).toBe(true);
    expect(r.regions).toEqual([]);
  });
  it("tiny specks are dropped", () => {
    const m = copy(clean);
    penLine(m, [[300, 780], [301, 780]], 2, [0, 0, 0]);
    expect(comparePage(m, clean, SCALE).regions).toEqual([]);
  });
});

// ---------- de-duplication ----------

describe("dedupeMarks", () => {
  const ann: FoundMark = { page: 5, kind: "underline", method: "annotation", rect: [100, 500, 300, 502] };
  const sameCmp: FoundMark = { page: 5, kind: "handwriting", method: "comparison", rect: [99, 497, 301, 504] };
  const otherCmp: FoundMark = { page: 5, kind: "highlight", method: "comparison", rect: [100, 300, 300, 312] };
  const otherPage: FoundMark = { ...sameCmp, page: 6 };
  it("keeps the annotation when both methods find the same area", () => {
    const out = dedupeMarks([sameCmp, ann, otherCmp, otherPage]);
    expect(out).toContain(ann);
    expect(out).not.toContain(sameCmp);
    expect(out).toContain(otherCmp);
    expect(out).toContain(otherPage);
  });
});
