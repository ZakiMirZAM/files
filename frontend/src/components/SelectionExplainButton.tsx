import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { openAi } from "../lib/aiPanelStore";
import { getPageAiContext } from "../lib/aiContextStore";

interface Selected {
  text: string;
  context: string;
  x: number;
  y: number;
}

const MIN_LEN = 3;
const MAX_LEN = 2000;

/** Only offer to explain selections inside the main content, never inside form
 *  controls, the AI panel, the notebook, or buttons. */
function isExplainable(node: Node | null): boolean {
  const el = node instanceof Element ? node : node?.parentElement ?? null;
  if (!el) return false;
  if (el.closest("input, textarea, [contenteditable='true'], [data-ai-panel], [data-notebook], button"))
    return false;
  return !!el.closest("main");
}

/** Grab the sentence/paragraph the selection sits in, as context for the model. */
function nearbyContext(node: Node | null): string {
  const el = node instanceof Element ? node : node?.parentElement ?? null;
  const block = el?.closest("p, li, td, th, h1, h2, h3, h4, blockquote, label, section, div");
  return (block?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 600);
}

/**
 * Floating "Explain using AI" button that appears above any text the user
 * selects in the app. Mounted once in the AppShell. Clicking it opens the
 * unified AI sidebar in explain mode.
 */
export function SelectionExplainButton() {
  const [sel, setSel] = useState<Selected | null>(null);

  useEffect(() => {
    function capture() {
      // Defer so the browser has finalized the selection.
      window.setTimeout(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
          setSel(null);
          return;
        }
        const text = selection.toString().trim();
        if (text.length < MIN_LEN || text.length > MAX_LEN || !isExplainable(selection.anchorNode)) {
          setSel(null);
          return;
        }
        const rect = selection.getRangeAt(0).getBoundingClientRect();
        setSel({
          text,
          context: nearbyContext(selection.anchorNode),
          x: rect.left + rect.width / 2,
          y: rect.top,
        });
      }, 0);
    }
    document.addEventListener("mouseup", capture);
    document.addEventListener("keyup", capture);
    return () => {
      document.removeEventListener("mouseup", capture);
      document.removeEventListener("keyup", capture);
    };
  }, []);

  // The button is positioned in viewport coordinates, so hide it when the page
  // scrolls or resizes rather than letting it drift away from the text.
  useEffect(() => {
    if (!sel) return;
    const hide = () => setSel(null);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [sel]);

  if (!sel) return null;

  return (
    <button
      type="button"
      // Keep the selection alive through the click (mousedown would clear it).
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        const page = getPageAiContext();
        openAi({
          mode: "explain",
          title: "Explanation",
          selection: sel.text,
          context: sel.context,
          section: page.section,
          subject: page.subject,
          dataContext: page.dataContext,
        });
        window.getSelection()?.removeAllRanges();
        setSel(null);
      }}
      style={{ left: sel.x, top: Math.max(sel.y - 8, 8) }}
      className="fixed z-[60] -translate-x-1/2 -translate-y-full inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm bg-gold text-ink-900 text-xs font-semibold shadow-lg hover:brightness-110 transition"
    >
      <Sparkles className="w-3.5 h-3.5" /> Explain using AI
    </button>
  );
}
