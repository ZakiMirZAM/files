import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { List, X } from "lucide-react";
import { cn } from "../lib/cn";

interface TocEntry {
  id: string;
  text: string;
  level: number;
}

const TOC_OPEN_KEY = "ifed.toc.open";
const MIN_HEADINGS = 2;
const SCAN_DEBOUNCE_MS = 300;

function loadOpen(): boolean {
  try {
    return localStorage.getItem(TOC_OPEN_KEY) !== "0";
  } catch {
    return true;
  }
}

function saveOpen(v: boolean) {
  try {
    localStorage.setItem(TOC_OPEN_KEY, v ? "1" : "0");
  } catch {
    // private mode
  }
}

export function PageTOC() {
  const location = useLocation();
  const [entries, setEntries] = useState<TocEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState(loadOpen);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const scanTimerRef = useRef<number>(0);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      saveOpen(next);
      return next;
    });
  }, []);

  const scanHeadings = useCallback(() => {
    const main = document.querySelector("main");
    if (!main) return;

    const headings = main.querySelectorAll<HTMLHeadingElement>("h1, h2");
    const result: TocEntry[] = [];
    let autoIdx = 0;

    headings.forEach((el) => {
      const text = el.textContent?.trim();
      if (!text || text.length < 2) return;
      if (el.closest("[hidden]") || el.offsetParent === null) return;

      if (!el.id) {
        el.id = `toc-heading-${autoIdx++}`;
      }
      result.push({
        id: el.id,
        text,
        level: el.tagName === "H1" ? 1 : 2,
      });
    });

    setEntries(result);
  }, []);

  const debouncedScan = useCallback(() => {
    window.clearTimeout(scanTimerRef.current);
    scanTimerRef.current = window.setTimeout(scanHeadings, SCAN_DEBOUNCE_MS);
  }, [scanHeadings]);

  // Reset + re-scan on route change
  useEffect(() => {
    setEntries([]);
    setActiveId(null);
    const timer = window.setTimeout(scanHeadings, 400);
    return () => window.clearTimeout(timer);
  }, [location.pathname, scanHeadings]);

  // Watch for DOM changes (async-loaded sections) with debounce
  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;

    const mo = new MutationObserver(debouncedScan);
    mo.observe(main, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      window.clearTimeout(scanTimerRef.current);
    };
  }, [location.pathname, debouncedScan]);

  // Scroll-based active heading tracking (works reliably for long pages)
  useEffect(() => {
    if (entries.length < MIN_HEADINGS) return;

    const onScroll = () => {
      let last: string | null = null;
      for (const entry of entries) {
        const el = document.getElementById(entry.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= 100) {
          last = entry.id;
        }
      }
      if (last) setActiveId(last);
    };

    // Run once immediately to set initial active
    onScroll();

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [entries]);

  // IntersectionObserver as secondary signal for headings entering viewport
  useEffect(() => {
    if (entries.length < MIN_HEADINGS) return;

    observerRef.current?.disconnect();

    const observer = new IntersectionObserver(
      (ioEntries) => {
        for (const e of ioEntries) {
          if (e.isIntersecting) {
            setActiveId(e.target.id);
            break;
          }
        }
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 },
    );

    observerRef.current = observer;

    for (const entry of entries) {
      const el = document.getElementById(entry.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [entries]);

  if (entries.length < MIN_HEADINGS) return null;

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top, behavior: "smooth" });
    setActiveId(id);
  };

  return (
    <>
      {/* Toggle button: hidden on mobile, visible from lg up */}
      <button
        onClick={toggle}
        aria-label={open ? "Close page outline" : "Open page outline"}
        aria-expanded={open}
        className={cn(
          "hidden lg:flex fixed z-30 right-4 top-20 p-2 rounded-sm transition-all",
          "items-center justify-center",
          "border border-gold/20 bg-ink-900/95 backdrop-blur-md shadow-panel",
          "text-white/55 hover:text-gold hover:border-gold/40",
          open && "text-gold border-gold/30",
        )}
      >
        {open ? <X className="w-4 h-4" /> : <List className="w-4 h-4" />}
      </button>

      {/* TOC panel */}
      <nav
        aria-label="Page outline"
        className={cn(
          "hidden lg:block fixed z-30 right-4 top-[4.5rem] pt-12 transition-all duration-200",
          "pointer-events-none",
          open ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4",
        )}
      >
        <div
          className={cn(
            "pointer-events-auto w-52 xl:w-56 max-h-[calc(100vh-6rem)] overflow-y-auto overscroll-contain",
            "rounded-sm border border-gold/15 bg-ink-900/95 backdrop-blur-md shadow-panel",
            "py-3 px-1",
            !open && "pointer-events-none",
          )}
        >
          <p className="px-3 pb-2 text-[0.6rem] font-mono uppercase tracking-widest text-white/30">
            On this page
          </p>
          <ul className="space-y-px">
            {entries.map((entry) => (
              <li key={entry.id}>
                <button
                  onClick={() => scrollTo(entry.id)}
                  className={cn(
                    "w-full text-left px-3 py-1.5 rounded-sm text-[0.75rem] leading-snug transition-colors truncate",
                    entry.level === 2 && "pl-5",
                    entry.id === activeId
                      ? "text-gold bg-gold/10 font-medium"
                      : "text-white/50 hover:text-white/80 hover:bg-white/[0.03]",
                  )}
                  title={entry.text}
                >
                  {entry.text}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </>
  );
}
