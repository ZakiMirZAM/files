// The single tour orchestrator, mounted once in AppShell. It subscribes to the
// tour store, runs the first-run auto-start, and drives each step: navigate to
// the step's route if needed, wait for the target element to appear, measure it,
// position the popover, and move focus. Renders nothing when no tour is running.

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  getTourState,
  subscribeTour,
  startTour,
  next,
  prev,
  skipTour,
  type TourStep,
} from "../../lib/tourStore";
import { isTourDone } from "../../lib/tourStorage";
import { WELCOME_TOUR } from "../../lib/tours";
import { computePopoverPosition, type PopoverPosition } from "./placement";
import { useTargetRect } from "./useTargetRect";
import { Spotlight } from "./Spotlight";
import { TourPopover } from "./TourPopover";

interface Waiter {
  promise: Promise<HTMLElement | null>;
  cancel: () => void;
}

/** Resolve a selector to a visible element, watching the DOM until a timeout. */
function waitForElement(selector: string, timeout: number): Waiter {
  let observer: MutationObserver | null = null;
  let interval = 0;
  let timer = 0;
  let done = false;

  const teardown = () => {
    if (observer) observer.disconnect();
    if (interval) window.clearInterval(interval);
    if (timer) window.clearTimeout(timer);
  };

  const promise = new Promise<HTMLElement | null>((resolve) => {
    const finish = (el: HTMLElement | null) => {
      if (done) return;
      done = true;
      teardown();
      resolve(el);
    };
    const check = () => {
      const el = document.querySelector<HTMLElement>(selector);
      if (el && el.getBoundingClientRect().width > 0) finish(el);
    };
    check();
    if (!done) {
      observer = new MutationObserver(check);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
      interval = window.setInterval(check, 150);
      timer = window.setTimeout(() => finish(null), timeout);
    }
  });

  return {
    promise,
    cancel: () => {
      if (done) return;
      done = true;
      teardown();
    },
  };
}

type Resolved = { kind: "target"; selector: string } | { kind: "center" } | null;

export function TourOverlay() {
  const snap = useSyncExternalStore(subscribeTour, getTourState);
  const tour = snap.tour;
  const index = snap.index;
  const step: TourStep | undefined = tour ? tour.steps[index] : undefined;

  const navigate = useNavigate();
  const location = useLocation();

  const [reduced, setReduced] = useState(false);
  const [resolved, setResolved] = useState<Resolved>(null);
  const [pos, setPos] = useState<PopoverPosition | null>(null);
  const [vpTick, setVpTick] = useState(0);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const enteredRef = useRef<TourStep | null>(null);

  // Honor the OS reduced-motion setting, including a mid-session change.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  // Recompute centered placement on viewport resize.
  useEffect(() => {
    const onResize = () => setVpTick((t) => t + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // First-run auto-start of the Welcome tour (once per version, guests included).
  useEffect(() => {
    if (getTourState().tour) return;
    if (isTourDone(WELCOME_TOUR.id, WELCOME_TOUR.version)) return;
    const raf = requestAnimationFrame(() => startTour(WELCOME_TOUR));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Escape always exits.
  useEffect(() => {
    if (!tour) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") skipTour();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tour]);

  // Per-step lifecycle: route gate, then wait for the target element.
  useEffect(() => {
    if (!tour || !step) {
      setResolved(null);
      return;
    }
    if (step.route && location.pathname !== step.route) {
      setResolved(null);
      navigate(step.route);
      return;
    }
    if (!step.target) {
      setResolved({ kind: "center" });
      return;
    }
    setResolved(null);
    const targetSel = step.target;
    const waiter = waitForElement(targetSel, step.waitTimeout ?? 4000);
    let cancelled = false;
    void waiter.promise.then((el) => {
      if (cancelled) return;
      if (el) {
        step.onEnter?.();
        enteredRef.current = step;
        setResolved({ kind: "target", selector: targetSel });
      } else if ((step.onMissing ?? "center") === "skip") {
        next();
      } else {
        setResolved({ kind: "center" });
      }
    });
    return () => {
      cancelled = true;
      waiter.cancel();
      if (enteredRef.current === step) {
        step.onLeave?.();
        enteredRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour?.id, index, step?.route, step?.target, location.pathname]);

  const selector = resolved?.kind === "target" ? resolved.selector : undefined;
  const stepKey = tour ? `${tour.id}:${index}` : "idle";
  const rect = useTargetRect(selector, stepKey, reduced);

  // Measure the popover and compute its fixed position.
  useLayoutEffect(() => {
    if (!tour || !step || resolved === null) {
      setPos(null);
      return;
    }
    const card = cardRef.current;
    if (!card) return;
    const size = { width: card.offsetWidth, height: card.offsetHeight };
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const targetRect = resolved.kind === "target" ? rect : null;
    setPos(
      computePopoverPosition({
        targetRect,
        popoverSize: size,
        viewport,
        preferred: step.placement ?? "auto",
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour?.id, index, resolved, rect, step?.placement, vpTick]);

  // Move focus to the popover once the step is ready (once per step).
  useEffect(() => {
    if (!tour || resolved === null) return;
    const raf = requestAnimationFrame(() => cardRef.current?.focus());
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour?.id, index, resolved]);

  // The live region stays mounted whenever this component is (it is always
  // mounted in AppShell), so assistive tech observes step changes from the
  // first step on. The spotlight and popover render only while a tour runs.
  const active = Boolean(tour && step);
  const total = tour ? tour.steps.length : 0;
  const isLast = active && index === total - 1;
  const showCard = active && resolved !== null;
  const spotlightRect = resolved?.kind === "target" ? rect : null;

  const cardStyle: CSSProperties = {
    top: pos?.top ?? 0,
    left: pos?.left ?? 0,
    opacity: pos ? 1 : 0,
    transform: pos ? "translateY(0)" : "translateY(4px)",
    transition: reduced ? "none" : "opacity 180ms ease-out, transform 180ms ease-out",
  };

  return (
    <>
      {active && step && (
        <Spotlight
          rect={spotlightRect}
          padding={step.padding ?? 8}
          reduced={reduced}
          onSkip={skipTour}
        />
      )}
      {showCard && step && (
        <TourPopover
          step={step}
          index={index}
          total={total}
          isLast={isLast}
          reduced={reduced}
          style={cardStyle}
          cardRef={cardRef}
          titleId="tour-step-title"
          bodyId="tour-step-body"
          onPrev={prev}
          onNext={next}
          onSkip={skipTour}
        />
      )}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {active && step ? `Step ${index + 1} of ${total}. ${step.title}. ${step.body}` : ""}
      </div>
    </>
  );
}
