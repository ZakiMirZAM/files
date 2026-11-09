// Lazy pdf.js loader for the browser. The legacy build is used on purpose:
// the modern build relies on very new JavaScript (Map.getOrInsertComputed)
// that older iPad Safari versions lack. Loaded on demand so the Learn page
// does not pay for pdf.js until a book is opened or added.

import type * as PdfJs from "pdfjs-dist";

export type PdfJsLib = typeof PdfJs;
export type PdfDoc = PdfJs.PDFDocumentProxy;
export type PdfPage = PdfJs.PDFPageProxy;

let loading: Promise<PdfJsLib> | null = null;

export function loadPdfJs(): Promise<PdfJsLib> {
  if (!loading) {
    loading = Promise.all([
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
    ])
      .then(([lib, worker]) => {
        const pdfjs = lib as unknown as PdfJsLib;
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        return pdfjs;
      })
      .catch((err) => {
        loading = null;
        throw err;
      });
  }
  return loading;
}

/** Open a PDF from bytes or a URL, always rendering on the main thread (we read the pixels back). */
export async function openPdf(src: { data: Uint8Array } | { url: string }): Promise<PdfDoc> {
  const pdfjs = await loadPdfJs();
  return await pdfjs.getDocument({ ...src, disableWorkerRendering: true, verbosity: 0 } as Parameters<PdfJsLib["getDocument"]>[0])
    .promise;
}

/** Close a document and its worker. */
export async function closePdf(doc: PdfDoc | null | undefined): Promise<void> {
  if (!doc) return;
  try {
    await doc.loadingTask.destroy();
  } catch {
    // already closed
  }
}

/** Give a canvas's memory back right away (iOS Safari keeps a tight total). */
export function freeCanvas(c: HTMLCanvasElement | null | undefined): void {
  if (!c) return;
  c.width = 0;
  c.height = 0;
}

/** Let the browser paint and handle input between pages. */
export function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
