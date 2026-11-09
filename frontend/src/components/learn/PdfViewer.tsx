// Read-only, in-app PDF viewer shown as an overlay: one page at a time, with
// previous / next and zoom. Used to open a book at the page of a note.

import { useCallback, useEffect, useRef, useState } from "react";
import { pdfRectToPixels } from "../../lib/bookMarks/compare";
import { closePdf, freeCanvas, openPdf, type PdfDoc } from "../../lib/bookMarks/pdfjs";
import { chooseScale } from "../../lib/bookMarks/scale";
import type { Rect } from "../../lib/bookMarks/types";

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];

export interface PdfViewerProps {
  /** URL of the PDF (null while it is still being looked up). */
  url: string | null | undefined;
  title: string;
  initialPage: number;
  /** Area to outline on the initial page, in PDF points. */
  focusRect?: Rect | null;
  onClose: () => void;
}

export function PdfViewer({ url, title, initialPage, focusRect, onClose }: PdfViewerProps) {
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(initialPage);
  const [zoomIdx, setZoomIdx] = useState(2);
  const [box, setBox] = useState<{ w: number; h: number; focus: Rect | null } | null>(null);
  const [rendering, setRendering] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Open the document.
  useEffect(() => {
    if (!url) return;
    let alive = true;
    let opened: PdfDoc | null = null;
    openPdf({ url })
      .then((d) => {
        opened = d;
        if (alive) setDoc(d);
        else void closePdf(d);
      })
      .catch(() => alive && setError("The book could not be opened."));
    return () => {
      alive = false;
      void closePdf(opened);
    };
  }, [url]);

  const pageCount = doc?.numPages ?? 0;
  const go = useCallback(
    (n: number) => setPage(Math.max(1, pageCount ? Math.min(n, pageCount) : n)),
    [pageCount],
  );

  // Render the current page.
  useEffect(() => {
    if (!doc || !canvasRef.current) return;
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    const canvas = canvasRef.current;
    (async () => {
      setRendering(true);
      try {
        const pdfPage = await doc.getPage(Math.min(page, doc.numPages));
        if (cancelled) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const avail = Math.max(240, (scrollRef.current?.clientWidth ?? 800) - 24);
        const cssScale = (avail / base.width) * ZOOMS[zoomIdx];
        const cssW = base.width * cssScale;
        const cssH = base.height * cssScale;
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        // Sharp on retina screens, but never over the iOS canvas limit.
        const scale = chooseScale(base.width, base.height, {
          targetLongSide: Math.max(cssW, cssH) * dpr,
          maxPixels: 10_000_000,
        });
        const viewport = pdfPage.getViewport({ scale });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
        const rt = pdfPage.render({ canvas, viewport });
        task = rt;
        await rt.promise;
        if (cancelled) return;
        const cssViewport = pdfPage.getViewport({ scale: cssScale });
        const focus = focusRect && page === initialPage ? pdfRectToPixels(focusRect, cssViewport.transform) : null;
        setBox({ w: cssW, h: cssH, focus });
        if (focus && scrollRef.current) {
          scrollRef.current.scrollTo({ top: Math.max(0, focus[1] - 120), left: Math.max(0, focus[0] - 40) });
        }
      } catch (err) {
        if (!cancelled && !(err instanceof Error && err.name === "RenderingCancelledException")) {
          setError("This page could not be shown.");
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page, zoomIdx, focusRect, initialPage]);

  useEffect(() => {
    const canvas = canvasRef.current;
    return () => freeCanvas(canvas);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === "PageDown") go(page + 1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") go(page - 1);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [go, page, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink-800/95 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex flex-wrap items-center gap-2 border-b border-gold/15 px-3 py-2">
        <p className="mr-auto min-w-0 truncate text-sm text-white/80">{title}</p>
        <div className="flex items-center gap-1">
          <button type="button" className="btn-ghost min-h-[44px] min-w-[44px]" onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Previous page">
            ‹
          </button>
          <span className="px-1 text-sm text-white/70 tabular-nums">
            Page {page}
            {pageCount ? ` of ${pageCount}` : ""}
          </span>
          <button
            type="button"
            className="btn-ghost min-h-[44px] min-w-[44px]"
            onClick={() => go(page + 1)}
            disabled={pageCount > 0 && page >= pageCount}
            aria-label="Next page"
          >
            ›
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className="btn-ghost min-h-[44px] min-w-[44px]" onClick={() => setZoomIdx((z) => Math.max(0, z - 1))} disabled={zoomIdx === 0} aria-label="Zoom out">
            −
          </button>
          <span className="w-12 text-center text-sm text-white/70 tabular-nums">{Math.round(ZOOMS[zoomIdx] * 100)}%</span>
          <button
            type="button"
            className="btn-ghost min-h-[44px] min-w-[44px]"
            onClick={() => setZoomIdx((z) => Math.min(ZOOMS.length - 1, z + 1))}
            disabled={zoomIdx === ZOOMS.length - 1}
            aria-label="Zoom in"
          >
            +
          </button>
        </div>
        <button type="button" className="btn-outline min-h-[44px]" onClick={onClose}>
          Close
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-auto p-3" style={{ WebkitOverflowScrolling: "touch" }}>
        {error ? (
          <p className="text-sm text-red-300">{error}</p>
        ) : (
          <div className="relative mx-auto bg-white shadow-panel" style={box ? { width: box.w, height: box.h } : undefined}>
            <canvas ref={canvasRef} className="block" />
            {box?.focus && (
              <div
                className="pointer-events-none absolute rounded-sm border-2 border-gold"
                style={{
                  left: box.focus[0] - 6,
                  top: box.focus[1] - 6,
                  width: box.focus[2] - box.focus[0] + 12,
                  height: box.focus[3] - box.focus[1] + 12,
                }}
              />
            )}
            {(!doc || rendering) && !box && <p className="p-6 text-sm text-ink-800/70">Opening the book…</p>}
          </div>
        )}
      </div>
    </div>
  );
}
