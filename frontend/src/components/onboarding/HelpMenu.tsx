// Header help dropdown. Mirrors the ApiStatusBadge popover mechanics: a toggle
// button plus a full-screen invisible close button and an absolutely positioned
// panel of plain buttons and links (Tab-navigable, no menu arrow-key contract).
// Offers replaying the Welcome tour, touring the current page (when one exists),
// and opening the Guide. Escape and outside click return focus to the trigger.

import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { BookOpen, Compass, HelpCircle, MapPin } from "lucide-react";
import { startWelcomeTour, startPageTour, pathToTourId } from "../../lib/tours";
import { cn } from "../../lib/cn";

export function HelpMenu() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const pageTour = pathToTourId(location.pathname);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  const itemClass =
    "w-full flex items-center gap-2.5 px-3 py-2 rounded-sm text-sm text-white/80 hover:bg-white/[0.04] hover:text-white transition-colors text-left";

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Help and guide"
        title="Help"
        data-tour="help-menu"
        className={cn(
          "p-2 rounded-sm transition-colors",
          open ? "bg-gold/15 text-gold" : "text-white/55 hover:text-gold",
        )}
      >
        <HelpCircle className="w-[18px] h-[18px]" strokeWidth={1.75} aria-hidden="true" />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="fixed inset-0 z-20 cursor-default"
            onClick={close}
          />
          <div
            aria-label="Help and guide"
            className="absolute right-0 top-full mt-2 w-60 panel p-1.5 z-30 shadow-xl"
          >
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                startWelcomeTour();
              }}
              className={itemClass}
            >
              <Compass className="w-4 h-4 text-gold/80 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              Take the tour
            </button>
            {pageTour && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  startPageTour(pageTour);
                }}
                className={itemClass}
              >
                <MapPin className="w-4 h-4 text-gold/80 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                Show me this page
              </button>
            )}
            <Link to="/app/guide" onClick={() => setOpen(false)} className={itemClass}>
              <BookOpen className="w-4 h-4 text-gold/80 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              How it works
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
