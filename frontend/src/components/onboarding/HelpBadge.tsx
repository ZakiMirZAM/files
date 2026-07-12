// A small "?" badge placed next to a control. Clicking it opens a fixed-position
// popover with a short plain-language explanation and a "Learn more" link into
// the Guide. Fixed positioning (computed from the button rect) avoids being
// clipped inside scrolling panels. Focus moves into the dialog on open and
// returns to the badge on close; Escape, outside click, or scroll dismiss it.

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { HelpCircle, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Markdown } from "../Markdown";
import { getHelpTopic, type HelpTopicKey } from "../../lib/helpTopics";
import { cn } from "../../lib/cn";

interface HelpBadgeProps {
  topic: HelpTopicKey;
  label?: string;
  className?: string;
}

const PANEL_W = 280;

export function HelpBadge({ topic, label, className }: HelpBadgeProps) {
  const info = getHelpTopic(topic);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onScroll = () => setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Move focus into the dialog when it opens.
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => dialogRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open]);

  if (!info) return null;

  const dialogId = `help-popover-${topic}`;

  function close() {
    setOpen(false);
    btnRef.current?.focus();
  }

  const toggle = () => {
    if (open) {
      close();
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const left = Math.min(Math.max(8, r.left), window.innerWidth - PANEL_W - 8);
      const top = Math.min(r.bottom + 8, window.innerHeight - 8);
      setCoords({ top, left, maxHeight: Math.max(120, window.innerHeight - top - 12) });
    }
    setOpen(true);
  };

  const onDialogKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const el = dialogRef.current;
    if (!el) return;
    const items = Array.from(
      el.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-label={label ?? `Help: ${info.title}`}
        aria-expanded={open}
        aria-controls={dialogId}
        className={cn(
          "inline-flex items-center justify-center w-7 h-7 rounded-full text-white/40 hover:text-gold transition-colors align-middle",
          className,
        )}
      >
        <HelpCircle className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
      </button>

      {open && coords && (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={close}
            className="fixed inset-0 z-[62] cursor-default"
          />
          <div
            ref={dialogRef}
            id={dialogId}
            role="dialog"
            aria-modal="true"
            aria-label={info.title}
            tabIndex={-1}
            onKeyDown={onDialogKeyDown}
            style={{ top: coords.top, left: coords.left, width: PANEL_W, maxHeight: coords.maxHeight }}
            className="fixed z-[63] panel p-3.5 shadow-xl overflow-y-auto outline-none"
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <h3 className="font-display text-sm font-semibold text-white">{info.title}</h3>
              <button
                type="button"
                onClick={close}
                aria-label="Close help"
                className="-mt-0.5 -mr-1 p-1 rounded-sm text-white/45 hover:text-gold transition-colors"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
            <div className="text-sm text-white/80">
              <Markdown content={info.body} />
            </div>
            <Link
              to={`/app/guide#${info.anchor}`}
              onClick={() => setOpen(false)}
              className="mt-2 inline-block text-xs font-medium text-gold hover:text-gold-soft transition-colors"
            >
              Learn more
            </Link>
          </div>
        </>
      )}
    </>
  );
}
