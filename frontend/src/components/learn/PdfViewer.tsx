// Read-only, in-app PDF viewer shown as an overlay. The whole book is laid out
// in one scrolling column, but only the pages near the viewport get a canvas,
// so a 1,000-page book stays within the iPad's canvas memory. Used to open a
// book at the page of a note.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { pdfRectToPixels } from "../../lib/bookMarks/compare";
import { closePdf, freeCanvas, openPdf, type PdfDoc, type PdfPage } from "../../lib/bookMarks/pdfjs";
import { chooseScale } from "../../lib/bookMarks/scale";
import type { Rect } from "../../lib/bookMarks/types";

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
/** Space above the first page, below the last, and on each side. */
const PAD = 12;
/** Space between two pages. */
const GAP = 12;
/** Most pages that hold a canvas at once. */
const MAX_LIVE = 8;
/** Pixels shared by all live canvases (iOS Safari caps total canvas memory). */
const PIXEL_BUDGET = 48_000_000;
/** How far beyond the visible area pages are rendered, in screen heights. */
const AHEAD_SCREENS = 1.5;
const LG_MIN_WIDTH = 1024;

export interface PdfViewerProps {
  /** URL of the PDF (null while it is still being looked up). */
  url: string | null | undefined;
  title: string;
  initialPage: number;
  /** Area to outline on the initial page, in PDF points. */
  focusRect?: Rect | null;
  onClose: () => void;
  /** When given, the header shows "Ask AI about this book"; called with the page most in view. */
  onAsk?: (page: number) => void;
  /** Pixels left free on the right on large screens (at least 1024px wide), for a sidebar. */
  rightInset?: number;
}

interface Size {
  w: number;
  h: number;
}

// ---------------------------------------------------------------------------
// Pure layout helpers (page indexes are 0-based here).

/** Top offset of each page when stacked with `gap` between them, starting at `start`. */
export function layoutPages(heights: readonly number[], gap: number, start = 0): { tops: number[]; total: number } {
  const tops: number[] = new Array(heights.length);
  let y = start;
  for (let i = 0; i < heights.length; i++) {
    tops[i] = y;
    y += heights[i] + (i < heights.length - 1 ? gap : 0);
  }
  return { tops, total: y };
}

/** Index of the last page whose top is at or above `y` (0 when `y` is above the first page). */
export function pageAtOffset(tops: readonly number[], y: number): number {
  let lo = 0;
  let hi = tops.length - 1;
  let found = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (tops[mid] <= y) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** Index of the page covering the most of the view between `viewTop` and `viewBottom`. */
export function mostVisiblePage(tops: readonly number[], heights: readonly number[], viewTop: number, viewBottom: number): number {
  if (!tops.length) return 0;
  let best = pageAtOffset(tops, viewTop);
  let bestOverlap = -Infinity;
  for (let i = best; i < tops.length && tops[i] < viewBottom; i++) {
    const overlap = Math.min(viewBottom, tops[i] + heights[i]) - Math.max(viewTop, tops[i]);
    if (overlap > bestOverlap) {
      best = i;
      bestOverlap = overlap;
    }
  }
  return best;
}

/**
 * First and last page index overlapping `from`..`to`, trimmed to at most
 * `maxPages` pages kept around `current`.
 */
export function pagesInRange(
  tops: readonly number[],
  heights: readonly number[],
  from: number,
  to: number,
  current: number,
  maxPages: number,
): [number, number] {
  if (!tops.length) return [0, -1];
  let first = pageAtOffset(tops, from);
  if (tops[first] + heights[first] < from && first < tops.length - 1) first++;
  let last = Math.max(first, pageAtOffset(tops, to));
  if (last - first + 1 > maxPages) {
    first = Math.max(first, Math.min(current - Math.floor((maxPages - 1) / 2), last - maxPages + 1));
    last = first + maxPages - 1;
  }
  return [first, last];
}

// ---------------------------------------------------------------------------

interface PageViewProps {
  doc: PdfDoc;
  index: number;
  /** CSS pixels per PDF point. */
  k: number;
  top: number;
  width: number;
  height: number;
  focusRect: Rect | null;
  onSize: (index: number, w: number, h: number) => void;
  onFocusShown: (index: number, rect: Rect) => void;
}

/** One rendered page. Its canvas is released as soon as it leaves the window. */
function PageView({ doc, index, k, top, width, height, focusRect, onSize, onFocusShown }: PageViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [focusPx, setFocusPx] = useState<Rect | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    let pdfPage: PdfPage | null = null;
    (async () => {
      try {
        pdfPage = await doc.getPage(index + 1);
        if (cancelled) return;
        const base = pdfPage.getViewport({ scale: 1 });
        onSize(index, base.width, base.height);
        const cssW = base.width * k;
        const cssH = base.height * k;
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        // Sharp on retina screens, but all live canvases together stay under the iOS limit.
        const scale = chooseScale(base.width, base.height, {
          targetLongSide: Math.max(cssW, cssH) * dpr,
          maxPixels: Math.min(10_000_000, Math.floor(PIXEL_BUDGET / MAX_LIVE)),
        });
        const viewport = pdfPage.getViewport({ scale });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const rt = pdfPage.render({ canvas, viewport });
        task = rt;
        await rt.promise;
        if (cancelled) return;
        if (focusRect) {
          const px = pdfRectToPixels(focusRect, pdfPage.getViewport({ scale: k }).transform);
          setFocusPx(px);
          onFocusShown(index, px);
        }
      } catch (err) {
        if (!cancelled && !(err instanceof Error && err.name === "RenderingCancelledException")) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
      freeCanvas(canvas);
      pdfPage?.cleanup();
    };
  }, [doc, index, k, focusRect, onSize, onFocusShown]);

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 bg-white shadow-panel"
      style={{ top, width, height }}
      aria-label={`Page ${index + 1}`}
      role="img"
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
      {focusPx && (
        <div
          className="pointer-events-none absolute rounded-sm border-2 border-gold"
          style={{
            left: focusPx[0] - 6,
            top: focusPx[1] - 6,
            width: focusPx[2] - focusPx[0] + 12,
            height: focusPx[3] - focusPx[1] + 12,
          }}
        />
      )}
      {failed && <p className="absolute inset-x-0 top-0 p-6 text-sm text-ink-800/70">This page could not be shown.</p>}
    </div>
  );
}

export function PdfViewer({ url, title, initialPage, focusRect, onClose, onAsk, rightInset = 0 }: PdfViewerProps) {
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [baseSize, setBaseSize] = useState<Size | null>(null);
  const [ptSizes, setPtSizes] = useState<Record<number, Size>>({});
  const [zoomIdx, setZoomIdx] = useState(2);
  const [availW, setAvailW] = useState(800);
  const [current, setCurrent] = useState(Math.max(1, initialPage));
  const [range, setRange] = useState<[number, number]>([0, -1]);
  const [isLg, setIsLg] = useState(() => typeof window !== "undefined" && window.innerWidth >= LG_MIN_WIDTH);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  /** Page at the top of the view and how far into it (fraction of its height); kept across re-layouts. */
  const anchorRef = useRef({ index: Math.max(0, initialPage - 1), frac: 0 });
  const focusDoneRef = useRef(false);
  const frameRef = useRef(0);

  // Open the document and measure page 1 for the placeholders.
  useEffect(() => {
    if (!url) return;
    let alive = true;
    let opened: PdfDoc | null = null;
    openPdf({ url })
      .then(async (d) => {
        opened = d;
        if (!alive) {
          void closePdf(d);
          return;
        }
        const first = await d.getPage(1);
        const vp = first.getViewport({ scale: 1 });
        if (!alive) return;
        setBaseSize({ w: vp.width, h: vp.height });
        setDoc(d);
      })
      .catch(() => alive && setError("The book could not be opened."));
    return () => {
      alive = false;
      void closePdf(opened);
    };
  }, [url]);

  // Available width and the large-screen flag follow the window.
  useLayoutEffect(() => {
    const measure = () => {
      if (scrollRef.current) setAvailW(Math.max(240, scrollRef.current.clientWidth - 2 * PAD));
      setIsLg(window.innerWidth >= LG_MIN_WIDTH);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const pageCount = doc?.numPages ?? 0;
  const k = baseSize ? (availW / baseSize.w) * ZOOMS[zoomIdx] : 1;

  const layout = useMemo(() => {
    if (!doc || !baseSize) return null;
    const widths: number[] = new Array(pageCount);
    const heights: number[] = new Array(pageCount);
    let maxW = 0;
    for (let i = 0; i < pageCount; i++) {
      const s = ptSizes[i] ?? baseSize;
      widths[i] = s.w * k;
      heights[i] = s.h * k;
      if (widths[i] > maxW) maxW = widths[i];
    }
    const { tops, total } = layoutPages(heights, GAP, PAD);
    return { widths, heights, tops, total: total + PAD, maxW };
  }, [doc, baseSize, ptSizes, pageCount, k]);
  const layoutRef = useRef(layout);
  useLayoutEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  // Work out the page most in view and which pages get a canvas.
  const update = useCallback(() => {
    const el = scrollRef.current;
    const l = layoutRef.current;
    if (!el || !l || !l.tops.length) return;
    const top = el.scrollTop;
    const bottom = top + el.clientHeight;
    const a = pageAtOffset(l.tops, top);
    anchorRef.current = { index: a, frac: (top - l.tops[a]) / l.heights[a] };
    const most = mostVisiblePage(l.tops, l.heights, top, bottom);
    setCurrent(most + 1);
    const ahead = el.clientHeight * AHEAD_SCREENS;
    const [f, t] = pagesInRange(l.tops, l.heights, top - ahead, bottom + ahead, most, MAX_LIVE);
    setRange((r) => (r[0] === f && r[1] === t ? r : [f, t]));
  }, []);

  const onScroll = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      update();
    });
  }, [update]);
  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  // After any re-layout (open, zoom, a page's real size arriving), keep the anchored page in place.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !layout || !layout.tops.length) return;
    const a = anchorRef.current;
    const i = Math.min(Math.max(0, a.index), layout.tops.length - 1);
    el.scrollTop = Math.max(0, layout.tops[i] + a.frac * layout.heights[i]);
    update();
  }, [layout, update]);

  const scrollToPage = useCallback(
    (n: number) => {
      const el = scrollRef.current;
      const l = layoutRef.current;
      if (!el || !l || !l.tops.length) return;
      const i = Math.min(Math.max(1, n), l.tops.length) - 1;
      el.scrollTop = i === 0 ? 0 : l.tops[i];
      update();
    },
    [update],
  );

  const onSize = useCallback((index: number, w: number, h: number) => {
    setPtSizes((prev) => {
      const known = prev[index];
      if (known && Math.abs(known.w - w) < 0.5 && Math.abs(known.h - h) < 0.5) return prev;
      return { ...prev, [index]: { w, h } };
    });
  }, []);

  // Scroll the outlined area into view the first time it is drawn.
  const onFocusShown = useCallback(
    (index: number, rect: Rect) => {
      if (focusDoneRef.current) return;
      focusDoneRef.current = true;
      const el = scrollRef.current;
      const l = layoutRef.current;
      if (!el || !l) return;
      el.scrollTop = Math.max(0, l.tops[index] + rect[1] - 120);
      el.scrollLeft = Math.max(0, PAD + (l.maxW - l.widths[index]) / 2 + rect[0] - 40);
      update();
    },
    [update],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        scrollToPage(current + 1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        scrollToPage(current - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scrollToPage, current, onClose]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  const initialIndex = Math.max(0, initialPage - 1);
  const live: number[] = [];
  if (layout) for (let i = range[0]; i <= Math.min(range[1], pageCount - 1); i++) live.push(i);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-ink-800/95 backdrop-blur-sm"
      style={{ right: isLg ? rightInset : 0 }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-gold/15 px-3 py-2">
        <p className="mr-auto min-w-0 truncate text-sm text-white/80">{title}</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="btn-ghost min-h-[44px] min-w-[44px]"
            onClick={() => scrollToPage(current - 1)}
            disabled={current <= 1}
            aria-label="Previous page"
          >
            ‹
          </button>
          <span className="px-1 text-sm text-white/70 tabular-nums" aria-live="polite">
            Page {current}
            {pageCount ? ` of ${pageCount}` : ""}
          </span>
          <button
            type="button"
            className="btn-ghost min-h-[44px] min-w-[44px]"
            onClick={() => scrollToPage(current + 1)}
            disabled={pageCount > 0 && current >= pageCount}
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
        {onAsk && (
          <button type="button" className="btn-outline min-h-[44px]" onClick={() => onAsk(current)}>
            Ask AI about this book
          </button>
        )}
        <button type="button" className="btn-outline min-h-[44px]" onClick={onClose}>
          Close
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-auto" style={{ WebkitOverflowScrolling: "touch" }} onScroll={onScroll}>
        {error ? (
          <p className="p-3 text-sm text-red-300">{error}</p>
        ) : !layout || !doc ? (
          <div className="p-3">
            <div className="mx-auto max-w-md bg-white shadow-panel">
              <p className="p-6 text-sm text-ink-800/70">Opening the book…</p>
            </div>
          </div>
        ) : (
          <div className="mx-auto" style={{ width: layout.maxW + 2 * PAD, paddingLeft: PAD, paddingRight: PAD }}>
            <div className="relative" style={{ height: layout.total }}>
              {live.map((i) => (
                <PageView
                  key={i}
                  doc={doc}
                  index={i}
                  k={k}
                  top={layout.tops[i]}
                  width={layout.widths[i]}
                  height={layout.heights[i]}
                  focusRect={i === initialIndex && focusRect ? focusRect : null}
                  onSize={onSize}
                  onFocusShown={onFocusShown}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
