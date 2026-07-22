import { useEffect, useRef, useState } from "react";

/* Tester reviews carousel for the landing page. One slide per review, swipe
   or arrow through them. Quotes are the positive half of real beta-tester
   feedback, lightly edited for grammar and flow; names are the testers' own.
   Visual language mirrors LandingPage.tsx (ink + gold, Playfair display,
   fade-up reveals); the global .font-display, .fade-up and .hide-mobile
   classes are defined there and apply here because this renders inside it. */

const GOLD = "#c9a84c";

const REVIEWS = [
  {
    name: "Titus",
    date: "May 29, 2026",
    quote:
      "The AI explanations were the part that won me over. I couldn't tell they were AI at all. They never got technical on me, and every term I clicked finally made sense.",
  },
  {
    name: "Walker",
    date: "June 7, 2026",
    quote:
      "Really informative, and every definition is genuinely clear. Nothing I looked up left me guessing.",
  },
  {
    name: "Aatif",
    date: "June 12, 2026",
    quote:
      "The design is so clean, and nothing about it feels generic. The colors fit the software perfectly.",
  },
  {
    name: "Jack",
    date: "June 30, 2026",
    quote:
      "I definitely learned a lot about analyzing the economy and finding well valued companies.",
  },
  {
    name: "Suraj",
    date: "July 15, 2026",
    quote:
      "I was impressed by how deep the data goes, and I could still follow the valuation methods behind every number.",
  },
];

function Star() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4" fill={GOLD} aria-hidden="true">
      <path d="M10 1.6l2.53 5.13 5.66.82-4.1 3.99.97 5.64L10 14.52l-5.06 2.66.97-5.64-4.1-3.99 5.66-.82L10 1.6z" />
    </svg>
  );
}

export default function LandingReviews() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setInView(true);
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const goTo = (i: number) => {
    const el = trackRef.current;
    if (!el || el.clientWidth === 0) return;
    const n = REVIEWS.length;
    const next = ((i % n) + n) % n;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    el.scrollTo({ left: next * el.clientWidth, behavior: reduced ? "auto" : "smooth" });
  };

  const onScroll = () => {
    const el = trackRef.current;
    if (!el || el.clientWidth === 0) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    setIndex(Math.max(0, Math.min(REVIEWS.length - 1, i)));
  };

  return (
    <section id="reviews" className="py-24 px-6 relative" aria-label="Reviews">
      <style>{`
        .reviews-track { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
        .reviews-track::-webkit-scrollbar { display: none; }
        .review-slide { flex: 0 0 100%; scroll-snap-align: center; scroll-snap-stop: always; }
        .review-arrow { width: 42px; height: 42px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: transparent; border: 1px solid rgba(255,255,255,0.18); color: rgba(255,255,255,0.6); cursor: pointer; transition: border-color 0.2s, color 0.2s, background 0.2s; }
        .review-arrow:hover { border-color: rgba(201,168,76,0.5); color: ${GOLD}; background: rgba(201,168,76,0.04); }
        .review-dot { width: 7px; height: 7px; border-radius: 50%; border: none; padding: 0; background: rgba(255,255,255,0.16); cursor: pointer; transition: background 0.25s, transform 0.25s; }
        .review-dot[aria-current="true"] { background: ${GOLD}; transform: scale(1.25); }
      `}</style>

      <div ref={sectionRef} className="max-w-6xl mx-auto">
        <div className={`fade-up mb-12 text-center ${inView ? "in" : ""}`}>
          <p style={{ fontSize: "0.72rem", color: GOLD, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "0.75rem" }}>
            Reviews
          </p>
          <h2 className="font-display" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)", fontWeight: 700, lineHeight: 1.18, maxWidth: 640, marginInline: "auto" }}>
            In their own <span style={{ color: GOLD, fontStyle: "italic" }}>words</span>.
          </h2>
        </div>

        <div className={`fade-up d1 relative max-w-[760px] mx-auto ${inView ? "in" : ""}`} aria-roledescription="carousel">
          {/* oversized decorative quote mark behind the slides */}
          <span
            aria-hidden="true"
            className="font-display"
            style={{ position: "absolute", top: -46, left: "50%", transform: "translateX(-50%)", fontSize: "7rem", lineHeight: 1, color: GOLD, opacity: 0.08, pointerEvents: "none", userSelect: "none" }}
          >
            "
          </span>

          <button
            type="button"
            className="review-arrow hide-mobile"
            style={{ position: "absolute", left: -70, top: "50%", transform: "translateY(-50%)", zIndex: 1 }}
            onClick={() => goTo(index - 1)}
            aria-label="Previous review"
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" aria-hidden="true">
              <path d="M10 3 L5 8 L10 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            className="review-arrow hide-mobile"
            style={{ position: "absolute", right: -70, top: "50%", transform: "translateY(-50%)", zIndex: 1 }}
            onClick={() => goTo(index + 1)}
            aria-label="Next review"
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" aria-hidden="true">
              <path d="M6 3 L11 8 L6 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <div ref={trackRef} className="reviews-track" onScroll={onScroll} tabIndex={0} aria-label="Reviews, swipe or use the arrow buttons">
            {REVIEWS.map((r, i) => (
              <div
                key={r.name}
                className="review-slide"
                role="group"
                aria-roledescription="slide"
                aria-label={`Review ${i + 1} of ${REVIEWS.length}`}
              >
                <figure style={{ minHeight: 220, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 1rem", margin: 0 }}>
                  <div style={{ display: "flex", gap: "0.3rem", marginBottom: "1.4rem" }} aria-label="Rated 5 out of 5 stars">
                    <Star /><Star /><Star /><Star /><Star />
                  </div>
                  <blockquote style={{ margin: 0 }}>
                    <p className="font-display" style={{ fontSize: "clamp(1.1rem, 2vw, 1.45rem)", fontWeight: 600, fontStyle: "italic", lineHeight: 1.55, color: "rgba(255,255,255,0.92)", maxWidth: 620 }}>
                      "{r.quote}"
                    </p>
                  </blockquote>
                  <figcaption style={{ marginTop: "1.6rem" }}>
                    <div className="font-display" style={{ fontSize: "1.05rem", fontWeight: 700, lineHeight: 1.1 }}>{r.name}</div>
                    <div style={{ fontSize: "0.68rem", color: "rgba(255,255,255,0.4)", letterSpacing: "0.08em", marginTop: 5 }}>{r.date}</div>
                  </figcaption>
                </figure>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "center", gap: "0.6rem", marginTop: "1.9rem" }}>
            {REVIEWS.map((r, i) => (
              <button
                key={r.name}
                type="button"
                className="review-dot"
                aria-label={`Go to review ${i + 1}`}
                aria-current={i === index}
                onClick={() => goTo(i)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
