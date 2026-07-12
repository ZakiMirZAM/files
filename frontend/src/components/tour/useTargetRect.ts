// Measures and tracks a tour target's viewport rect. Re-measures on scroll (in
// the capture phase, so scrolling inside a nested container is caught), on
// resize, and when the element itself resizes (ResizeObserver). Measurement is
// rAF-throttled. Returns null when there is no selector or no element, which
// makes the overlay fall back to a centered step.

import { useEffect, useState } from "react";
import type { Rect } from "./placement";

export function useTargetRect(
  selector: string | undefined,
  stepKey: string,
  reduced: boolean,
): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) {
      setRect(null);
      return;
    }

    let raf = 0;
    let cancelled = false;

    const measure = () => {
      if (cancelled) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        measure();
      });
    };

    el.scrollIntoView({
      block: "center",
      inline: "center",
      behavior: reduced ? "auto" : "smooth",
    });
    measure();

    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    ro?.observe(el);

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      ro?.disconnect();
    };
  }, [selector, stepKey, reduced]);

  return rect;
}
