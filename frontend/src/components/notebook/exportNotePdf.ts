// A4 portrait in points.
const PAGE_W_PT = 595.28;
const PAGE_H_PT = 841.89;
const MARGIN_PT = 36;
// Offscreen render width (~A4 at 96dpi), .pdf-export-root CSS is tuned to it.
const RENDER_WIDTH_PX = 794;

export interface ExportPdfOptions {
  /**
   * Resolves a Convex storage id to a data URL. When provided, images are
   * inlined before capture so cross-origin canvas tainting can't blank them;
   * failures fall back to crossorigin + useCORS.
   */
  resolveImage?: (storageId: string) => Promise<string>;
}

/** Renders note HTML into a light-themed offscreen container and saves an A4 PDF. */
export async function exportNoteToPdf(
  title: string,
  html: string,
  options: ExportPdfOptions = {},
): Promise<void> {
  // Heavy libs load on demand, export is a rare action, keep them out of the main chunk.
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);

  const root = document.createElement("div");
  root.className = "pdf-export-root";
  root.style.cssText = `position:fixed;left:-10000px;top:0;width:${RENDER_WIDTH_PX}px;background:#ffffff;padding:48px;`;
  root.innerHTML = `<h1 class="pdf-export-title">${escapeHtml(title)}</h1>${html}`;
  document.body.appendChild(root);

  try {
    await inlineImages(root, options.resolveImage);
    await document.fonts.ready;
    await Promise.all(
      Array.from(root.querySelectorAll("img")).map((img) => img.decode().catch(() => undefined)),
    );

    const canvas = await html2canvas(root, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      imageTimeout: 15000,
    });

    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const contentW = PAGE_W_PT - MARGIN_PT * 2;
    const contentH = PAGE_H_PT - MARGIN_PT * 2;
    const pxPerPt = canvas.width / contentW;
    const pageHeightPx = Math.floor(contentH * pxPerPt);

    // Fixed-height slicing, can cut a text line at a page boundary (accepted
    // v1 tradeoff; a whitespace-scan for safe break rows is a future upgrade).
    let renderedPx = 0;
    let page = 0;
    while (renderedPx < canvas.height) {
      const sliceH = Math.min(pageHeightPx, canvas.height - renderedPx);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = sliceH;
      const ctx = slice.getContext("2d");
      if (!ctx) throw new Error("Canvas not supported");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, renderedPx, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

      if (page > 0) pdf.addPage();
      pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", MARGIN_PT, MARGIN_PT, contentW, sliceH / pxPerPt);
      slice.width = 0; // release the backing store now rather than at GC time
      renderedPx += sliceH;
      page += 1;
    }

    pdf.save(`${sanitizeFileName(title) || "note"}.pdf`);
  } finally {
    root.remove();
  }
}

/** Swap Convex-stored images to data URLs (primary); mark the rest for CORS fetch. */
async function inlineImages(
  root: HTMLElement,
  resolveImage: ExportPdfOptions["resolveImage"],
): Promise<void> {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    images.map(async (img) => {
      img.setAttribute("crossorigin", "anonymous");
      const storageId = img.getAttribute("data-storage-id");
      if (!storageId || !resolveImage) return;
      try {
        img.src = await resolveImage(storageId);
      } catch {
        // keep the original src, useCORS may still capture it
      }
    }),
  );
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeFileName(input: string): string {
  return input
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}
