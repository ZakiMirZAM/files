// Browser pipeline: walk a book page by page, find marks with both methods,
// and cut a picture of each. Pure decisions live in the sibling modules; this
// file only renders pages and moves pixels.

import { hasReaderMarks, marksFromAnnotations, type RawAnnotation, type TextRun } from "./annotations";
import { comparePage, padBox, pdfRectToPixels, pixelBoxToPdf } from "./compare";
import { dedupeMarks } from "./dedupe";
import { freeCanvas, yieldToBrowser, type PdfDoc, type PdfPage } from "./pdfjs";
import { chooseScale, sameShape } from "./scale";
import type { FoundMark, Rect } from "./types";

/** Page comparison resolution: enough for a pen stroke, light on memory. */
const COMPARE_SCALE = { targetLongSide: 1400, maxPixels: 2_500_000, maxScale: 2.5 };
/** Resolution of the pictures cut for each mark. */
const PICTURE_SCALE = { targetLongSide: 1800, maxPixels: 4_000_000, maxScale: 3 };
/** Points of page kept around each mark in its picture. */
const PICTURE_PAD_PT = 14;
/** Widest saved picture, in pixels. */
const PICTURE_MAX_WIDTH = 1000;

export interface MarkWithPicture extends FoundMark {
  picture: Blob | null;
}

export interface ScanProgress {
  page: number;
  pageCount: number;
  found: number;
}

export interface ScanResult {
  found: number;
  /** Pages whose size differs between the marked and the clean PDF. */
  sizeMismatchPages: number[];
  /** Pages where the clean page did not line up with the marked one. */
  misalignedPages: number[];
  /** Pages in the marked PDF that the clean PDF does not have. */
  missingCleanPages: number[];
}

export interface ScanOptions {
  marked: PdfDoc;
  clean?: PdfDoc | null;
  signal: AbortSignal;
  onProgress: (p: ScanProgress) => void;
  /** Called once per page that has marks; awaited, so saving keeps pace with scanning. */
  onPageMarks: (marks: MarkWithPicture[]) => Promise<void>;
}

export class ScanCancelled extends Error {
  constructor() {
    super("Cancelled");
    this.name = "ScanCancelled";
  }
}

function pageSize(page: PdfPage): { w: number; h: number } {
  const vp = page.getViewport({ scale: 1 });
  return { w: vp.width, h: vp.height };
}

async function render(page: PdfPage, canvas: HTMLCanvasElement, scale: number) {
  const viewport = page.getViewport({ scale });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("This browser could not create a drawing surface.");
  await page.render({ canvas, viewport, background: "#ffffff" }).promise;
  return { viewport, ctx };
}

async function textRuns(page: PdfPage): Promise<TextRun[]> {
  const tc = await page.getTextContent();
  const runs: TextRun[] = [];
  for (const item of tc.items) {
    if (!("str" in item)) continue;
    const t = item.transform as number[];
    runs.push({ str: item.str, x: t[4], y: t[5], width: item.width, height: item.height || Math.abs(t[3]) });
  }
  return runs;
}

function cutPicture(source: HTMLCanvasElement, box: Rect): Promise<Blob | null> {
  const w = Math.max(1, Math.round(box[2] - box[0]));
  const h = Math.max(1, Math.round(box[3] - box[1]));
  const shrink = Math.min(1, PICTURE_MAX_WIDTH / w);
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(w * shrink));
  out.height = Math.max(1, Math.round(h * shrink));
  const ctx = out.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(source, box[0], box[1], w, h, 0, 0, out.width, out.height);
  return new Promise((resolve) =>
    out.toBlob((blob) => {
      freeCanvas(out);
      resolve(blob);
    }, "image/png"),
  );
}

export async function scanBook(opts: ScanOptions): Promise<ScanResult> {
  const { marked, clean, signal } = opts;
  const pageCount = marked.numPages;
  const result: ScanResult = { found: 0, sizeMismatchPages: [], misalignedPages: [], missingCleanPages: [] };
  const markedCanvas = document.createElement("canvas");
  const cleanCanvas = document.createElement("canvas");

  try {
    for (let p = 1; p <= pageCount; p++) {
      if (signal.aborted) throw new ScanCancelled();
      opts.onProgress({ page: p, pageCount, found: result.found });

      const page = await marked.getPage(p);
      let found: FoundMark[] = [];
      // Canvas holding the marked page, when it has already been rendered.
      let rendered: { scale: number; transform: number[] } | null = null;

      const anns = (await page.getAnnotations()) as RawAnnotation[];
      if (hasReaderMarks(anns)) {
        const needsText = anns.some((a) => a.subtype === "Highlight" || a.subtype === "Underline" || a.subtype === "Squiggly");
        found.push(...marksFromAnnotations(p, anns, needsText ? await textRuns(page) : undefined));
      }

      if (clean) {
        if (p > clean.numPages) {
          result.missingCleanPages.push(p);
        } else {
          const cleanPage = await clean.getPage(p);
          const size = pageSize(page);
          const cleanSize = pageSize(cleanPage);
          if (!sameShape(size, cleanSize)) {
            result.sizeMismatchPages.push(p);
          } else {
            const scale = chooseScale(size.w, size.h, COMPARE_SCALE);
            const a = await render(page, markedCanvas, scale);
            // A re-exported PDF can keep the page shape but change its size in
            // points; render the clean page to the same pixel size.
            const b = await render(cleanPage, cleanCanvas, (scale * size.w) / cleanSize.w);
            const w = Math.min(markedCanvas.width, cleanCanvas.width);
            const h = Math.min(markedCanvas.height, cleanCanvas.height);
            const cmp = comparePage(
              { width: w, height: h, data: a.ctx.getImageData(0, 0, w, h).data },
              { width: w, height: h, data: b.ctx.getImageData(0, 0, w, h).data },
              scale,
            );
            freeCanvas(cleanCanvas);
            if (cmp.misaligned) result.misalignedPages.push(p);
            for (const r of cmp.regions) {
              found.push({ page: p, kind: r.kind, method: "comparison", rect: pixelBoxToPdf(r.box, a.viewport.transform) });
            }
            rendered = { scale, transform: a.viewport.transform };
          }
          cleanPage.cleanup();
        }
      }

      found = dedupeMarks(found);
      if (found.length > 0) {
        // Pictures come from a sharper render than the comparison one.
        const size = pageSize(page);
        const scale = chooseScale(size.w, size.h, PICTURE_SCALE);
        if (!rendered || rendered.scale < scale * 0.9) {
          const r = await render(page, markedCanvas, scale);
          rendered = { scale, transform: r.viewport.transform };
        }
        const withPictures: MarkWithPicture[] = [];
        for (const m of found) {
          const px = pdfRectToPixels(m.rect, rendered.transform);
          const box = padBox(px, PICTURE_PAD_PT * rendered.scale, markedCanvas.width, markedCanvas.height);
          withPictures.push({ ...m, picture: await cutPicture(markedCanvas, box) });
        }
        freeCanvas(markedCanvas);
        if (signal.aborted) throw new ScanCancelled();
        await opts.onPageMarks(withPictures);
        result.found += withPictures.length;
      } else if (rendered) {
        freeCanvas(markedCanvas);
      }

      page.cleanup();
      await yieldToBrowser();
    }
    opts.onProgress({ page: pageCount, pageCount, found: result.found });
    return result;
  } finally {
    freeCanvas(markedCanvas);
    freeCanvas(cleanCanvas);
  }
}
