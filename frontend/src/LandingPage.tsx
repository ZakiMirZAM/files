import { useState, useEffect, useRef } from "react";
import Logo from "./components/Logo";
import HeroVisual from "./components/HeroVisual";

/* ─────────────────────────────────────────────────────────────────────────
   Palette, gold/ink luxury identity, with emerald (live/positive) and a
   soft indigo as supporting accents so the page reads as a real market tool
   instead of a single-accent template.
   ───────────────────────────────────────────────────────────────────────── */
const GOLD = "#c9a84c";
const GOLD_SOFT = "#d9b85c";
const EMERALD = "#7fb87c";
const INDIGO = "#7c93d6";

/* The real five-stage pipeline, mirrors the in-app workspace (Dashboard.tsx),
   stated in concrete terms rather than generic marketing. */
const STEPS = [
  {
    number: "01",
    title: "Economic Analysis",
    subtitle: "The macro tide",
    description:
      "Real GDP, inflation, debt, rates and money supply pulled from FRED back to 2012, each series charted against NBER recession bands and explained in plain language.",
    icon: (
      <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10">
        <path d="M4 32 L12 20 L20 24 L28 12 L36 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="36" cy="8" r="3" fill="currentColor" />
      </svg>
    ),
  },
  {
    number: "02",
    title: "Sector Analysis",
    subtitle: "Eleven sectors",
    description:
      "Aggregate growth, margins, ROIC and leverage across every company in eleven GICS-style sectors, so you know which part of the market the wind is actually behind.",
    icon: (
      <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10">
        <rect x="4" y="20" width="8" height="16" rx="1" stroke="currentColor" strokeWidth="2.5" />
        <rect x="16" y="12" width="8" height="24" rx="1" stroke="currentColor" strokeWidth="2.5" />
        <rect x="28" y="4" width="8" height="32" rx="1" stroke="currentColor" strokeWidth="2.5" />
      </svg>
    ),
  },
  {
    number: "03",
    title: "Industry Analysis",
    subtitle: "164 industries",
    description:
      "Market-cap-weighted averages computed straight from the financials database: pricing power, structural advantage and where a moat is real versus a rising tide.",
    icon: (
      <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10">
        <circle cx="20" cy="20" r="15" stroke="currentColor" strokeWidth="2.5" />
        <path d="M20 5 V20 L31 27" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    number: "04",
    title: "Comparative Analysis",
    subtitle: "Side by side",
    description:
      "Line up the top public companies in an industry across margin, cash generation and valuation multiples: the head-to-head that separates the leader from the laggard.",
    icon: (
      <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10">
        <rect x="6" y="4" width="28" height="32" rx="2" stroke="currentColor" strokeWidth="2.5" />
        <path d="M12 14 h16 M12 20 h16 M12 26 h10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    number: "05",
    title: "Individual Analysis",
    subtitle: "Down to one share",
    description:
      "Enter a ticker and drill into 13 years of financials, vertical analysis and a long qualitative checklist, with every metric explained for what it means to intrinsic value.",
    icon: (
      <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10">
        <circle cx="20" cy="14" r="7" stroke="currentColor" strokeWidth="2.5" />
        <path d="M6 36 C6 28 34 28 34 36" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    ),
  },
];

const FEATURES = [
  { title: "Every number, explained", description: "Each metric carries plain-language commentary on what it is and why it moves intrinsic value. Not a tooltip, a teacher." },
  { title: "Valuation, not vibes", description: "Built around DCF, residual income and EVA fundamentals. No price momentum, no social sentiment, no noise." },
  { title: "The analyst's real process", description: "The same top-down macro-to-company sequence professionals run, sequenced into five stages you can actually follow." },
  { title: "Free and open source", description: "No paywall, no subscription, no locked tiers. The full pipeline, the full code, on GitHub." },
  { title: "Signal over surface area", description: "We surface the handful of figures that decide the thesis and keep the rest out of your way." },
  { title: "Built for the long horizon", description: "Designed for investors who measure conviction in years and want to understand what they own." },
];

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setInView(true);
      },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);
  return { ref, inView };
}

/** Count a number up from 0 → target once `active` flips true. Respects reduced motion. */
function useCountUp(target: number, active: boolean, durationMs = 1400) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    let raf = 0;
    let start = 0;
    const tick = (t: number) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setValue(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, durationMs]);
  return value;
}

/* ─────────────────────────────────────────────────────────────────────────
   Live hero chart, an intrinsic-value line drawing itself on, with a faint
   "price" line oscillating around it (the gap the product is built to close).
   Pure inline SVG so it ships with zero extra weight.
   ───────────────────────────────────────────────────────────────────────── */
const W = 520;
const H = 300;
// Deterministic series (0..1 of height, top = high value).
const VALUE_PTS = [0.74, 0.7, 0.66, 0.6, 0.55, 0.52, 0.46, 0.42, 0.37, 0.32, 0.26, 0.2];
const PRICE_PTS = [0.82, 0.64, 0.72, 0.58, 0.62, 0.44, 0.55, 0.36, 0.46, 0.3, 0.34, 0.22];

function toPath(pts: number[]): string {
  const stepX = W / (pts.length - 1);
  return pts
    .map((p, i) => {
      const x = i * stepX;
      const y = 24 + p * (H - 48);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function HeroChart({ active }: { active: boolean }) {
  const valuePath = toPath(VALUE_PTS);
  const pricePath = toPath(PRICE_PTS);
  const lastX = W;
  const lastY = 24 + VALUE_PTS[VALUE_PTS.length - 1] * (H - 48);

  return (
    <div className="hero-chart-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
          <span className="live-dot" />
          <span style={{ fontSize: "0.7rem", letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)", fontFamily: "'JetBrains Mono', monospace" }}>
            Intrinsic value vs. price
          </span>
        </div>
        <span style={{ fontSize: "0.7rem", color: EMERALD, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
          +38.2%
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="none" style={{ display: "block", height: 240 }} role="img" aria-label="Intrinsic value rising above market price">
        <defs>
          <linearGradient id="hero-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GOLD} stopOpacity={0.28} />
            <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* gridlines */}
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1={0} x2={W} y1={24 + g * (H - 48)} y2={24 + g * (H - 48)} stroke="rgba(201,168,76,0.08)" strokeWidth={1} />
        ))}

        {/* area under the value line */}
        <path d={`${valuePath} L${W} ${H - 24} L0 ${H - 24} Z`} fill="url(#hero-fill)" className={active ? "hero-area in" : "hero-area"} />

        {/* faint market price line, indigo, dashed, oscillating */}
        <path d={pricePath} fill="none" stroke={INDIGO} strokeWidth={1.4} strokeDasharray="4 5" opacity={0.55} className={active ? "hero-price in" : "hero-price"} />

        {/* intrinsic value line, gold, draws on */}
        <path d={valuePath} fill="none" stroke={GOLD} strokeWidth={2.4} strokeLinecap="round" className={active ? "hero-line in" : "hero-line"} />

        {/* live endpoint */}
        <circle cx={lastX - 2} cy={lastY} r={4.5} fill={GOLD_SOFT} className={active ? "hero-pulse in" : "hero-pulse"} />
      </svg>

      <div style={{ display: "flex", gap: "1.5rem", marginTop: "1rem", flexWrap: "wrap" }}>
        <LegendDot color={GOLD} label="Intrinsic value" />
        <LegendDot color={INDIGO} label="Market price" dashed />
      </div>
    </div>
  );
}

function LegendDot({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", fontSize: "0.72rem", color: "rgba(255,255,255,0.5)", fontFamily: "'JetBrains Mono', monospace" }}>
      <span style={{ width: 16, height: 2, background: dashed ? "transparent" : color, borderTop: dashed ? `2px dashed ${color}` : "none", display: "inline-block" }} />
      {label}
    </span>
  );
}

export default function LandingPage({ onGetStarted }: { onGetStarted?: () => void } = {}) {
  const [scrolled, setScrolled] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const handleStart = onGetStarted ?? (() => { window.location.href = "/auth"; });
  const handleSignIn = () => { window.location.href = "/auth"; };

  // Track scroll for the nav frost + a subtle hero parallax. Parallax is
  // disabled under reduced-motion and clamped so it only acts within the hero.
  const reducedMotion = useRef(false);
  useEffect(() => {
    reducedMotion.current = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let raf = 0;
    const handler = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        setScrolled(y > 40);
        setScrollY(reducedMotion.current ? 0 : Math.min(y, 720));
        raf = 0;
      });
    };
    window.addEventListener("scroll", handler, { passive: true });
    return () => { window.removeEventListener("scroll", handler); if (raf) cancelAnimationFrame(raf); };
  }, []);

  const hero = useInView(0.1);
  const trust = useInView(0.1);
  const steps = useInView(0.1);
  const features = useInView(0.1);
  const about = useInView(0.1);
  const cta = useInView(0.1);

  // Animated hero stats
  const yearsVal = useCountUp(2012, hero.inView, 1600);
  const industriesVal = useCountUp(164, hero.inView, 1500);
  const stagesVal = useCountUp(5, hero.inView, 1000);

  return (
    <div className="landing-root min-h-screen bg-ink-800 text-white overflow-x-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,600&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');

        .font-display { font-family: 'Playfair Display', Georgia, serif; }

        .fade-up { opacity: 0; transform: translateY(28px); transition: opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1); }
        .fade-up.in { opacity: 1; transform: translateY(0); }
        .d1 { transition-delay: 0.08s; } .d2 { transition-delay: 0.16s; } .d3 { transition-delay: 0.24s; }
        .d4 { transition-delay: 0.32s; } .d5 { transition-delay: 0.40s; }

        /* Animated aurora, gold + emerald + indigo drifting behind the hero.
           This is what replaces the flat single-accent background. */
        @keyframes aurora-drift {
          0%   { transform: translate3d(-6%, -4%, 0) scale(1); }
          50%  { transform: translate3d(6%, 5%, 0) scale(1.15); }
          100% { transform: translate3d(-6%, -4%, 0) scale(1); }
        }
        .aurora { position: absolute; inset: -25%; pointer-events: none; z-index: 0; filter: blur(70px); opacity: 0.6; }
        .aurora span { position: absolute; border-radius: 50%; mix-blend-mode: screen; }
        .aurora .a1 { top: 4%; left: 12%; width: 46vw; height: 46vw; background: radial-gradient(circle, rgba(201,168,76,0.22), transparent 62%); animation: aurora-drift 22s ease-in-out infinite; }
        .aurora .a2 { top: 18%; right: 6%; width: 38vw; height: 38vw; background: radial-gradient(circle, rgba(124,147,214,0.16), transparent 62%); animation: aurora-drift 28s ease-in-out infinite reverse; }
        .aurora .a3 { bottom: -8%; left: 30%; width: 40vw; height: 40vw; background: radial-gradient(circle, rgba(127,184,124,0.12), transparent 62%); animation: aurora-drift 32s ease-in-out infinite; }

        /* Fine grain texture so the dark surfaces have tooth instead of flat black. */
        .grain { position: absolute; inset: 0; z-index: 0; pointer-events: none; opacity: 0.04;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }

        .nav-link { font-size: 0.875rem; font-weight: 500; color: rgba(255,255,255,0.6); text-decoration: none; letter-spacing: 0.02em; transition: color 0.2s; position: relative; }
        .nav-link:hover { color: #fff; }
        .nav-link::after { content: ''; position: absolute; bottom: -2px; left: 0; width: 0; height: 1px; background: ${GOLD}; transition: width 0.25s; }
        .nav-link:hover::after { width: 100%; }

        .step-card { border: 1px solid rgba(201,168,76,0.12); background: rgba(255,255,255,0.02); transition: border-color 0.35s, transform 0.35s, box-shadow 0.35s; position: relative; overflow: hidden; }
        .step-card::before { content: ''; position: absolute; inset: 0; background: radial-gradient(420px circle at var(--mx,50%) var(--my,0%), rgba(201,168,76,0.10), transparent 60%); opacity: 0; transition: opacity 0.35s; pointer-events: none; }
        .step-card:hover { border-color: rgba(201,168,76,0.45); transform: translateY(-4px); box-shadow: 0 24px 48px -28px rgba(0,0,0,0.7); }
        .step-card:hover::before { opacity: 1; }

        .btn-gold { position: relative; background: ${GOLD}; color: #0a0f1e; font-weight: 600; font-size: 0.9rem; letter-spacing: 0.04em; padding: 0.8rem 1.8rem; border: none; cursor: pointer; transition: background 0.2s, transform 0.15s, box-shadow 0.2s; overflow: hidden; }
        .btn-gold:hover { background: ${GOLD_SOFT}; transform: translateY(-1px); box-shadow: 0 12px 28px -12px rgba(201,168,76,0.55); }
        .btn-gold::after { content: ''; position: absolute; top: 0; left: -120%; width: 60%; height: 100%; background: linear-gradient(110deg, transparent, rgba(255,255,255,0.45), transparent); transform: skewX(-18deg); transition: left 0.55s; }
        .btn-gold:hover::after { left: 130%; }

        .btn-outline { background: transparent; color: rgba(255,255,255,0.7); font-weight: 500; font-size: 0.9rem; letter-spacing: 0.03em; padding: 0.8rem 1.8rem; border: 1px solid rgba(255,255,255,0.18); cursor: pointer; transition: border-color 0.2s, color 0.2s, background 0.2s; }
        .btn-outline:hover { border-color: rgba(201,168,76,0.5); color: ${GOLD}; background: rgba(201,168,76,0.04); }

        .ticker-wrap { display: flex; animation: ticker 32s linear infinite; }
        @keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }

        /* Hero chart */
        .hero-chart-card { position: relative; border: 1px solid rgba(201,168,76,0.18); background: linear-gradient(165deg, rgba(255,255,255,0.035), rgba(255,255,255,0.01)); border-radius: 8px; padding: 1.5rem; box-shadow: 0 32px 64px -40px rgba(0,0,0,0.8); backdrop-filter: blur(6px); }
        .live-dot { width: 8px; height: 8px; border-radius: 50%; background: ${EMERALD}; box-shadow: 0 0 0 0 rgba(127,184,124,0.6); animation: live-pulse 2s ease-out infinite; }
        @keyframes live-pulse { 0% { box-shadow: 0 0 0 0 rgba(127,184,124,0.5); } 70% { box-shadow: 0 0 0 8px rgba(127,184,124,0); } 100% { box-shadow: 0 0 0 0 rgba(127,184,124,0); } }
        .hero-line { stroke-dasharray: 1200; stroke-dashoffset: 1200; }
        .hero-line.in { animation: draw 2.2s cubic-bezier(0.16,1,0.3,1) 0.2s forwards; }
        .hero-price { stroke-dasharray: 1200; stroke-dashoffset: 1200; }
        .hero-price.in { animation: draw 2.6s ease-out 0.5s forwards; }
        @keyframes draw { to { stroke-dashoffset: 0; } }
        .hero-area { opacity: 0; }
        .hero-area.in { animation: area-in 1.2s ease-out 1.4s forwards; }
        @keyframes area-in { to { opacity: 1; } }
        .hero-pulse { opacity: 0; transform-box: fill-box; transform-origin: center; }
        .hero-pulse.in { animation: dot-in 0.5s ease-out 2.1s forwards, dot-pulse 2.4s ease-in-out 2.6s infinite; }
        @keyframes dot-in { to { opacity: 1; } }
        @keyframes dot-pulse { 0%,100% { r: 4.5; } 50% { r: 6.5; } }

        @media (prefers-reduced-motion: reduce) {
          .fade-up, .aurora span, .ticker-wrap, .hero-line, .hero-price, .hero-area, .hero-pulse, .live-dot, .btn-gold::after { animation: none !important; transition: none !important; }
          .fade-up { opacity: 1; transform: none; }
          .hero-line, .hero-price { stroke-dashoffset: 0; }
          .hero-area, .hero-pulse { opacity: 1; }
        }

        /* Founder portrait, gold-framed, gently zooms on hover */
        .founder-card { position: relative; border-radius: 10px; overflow: hidden; border: 1px solid rgba(201,168,76,0.28); background: linear-gradient(165deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01)); box-shadow: 0 40px 80px -50px rgba(0,0,0,0.85); }
        .founder-card img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center 15%; transition: transform 0.6s cubic-bezier(0.16,1,0.3,1); }
        .founder-card:hover img { transform: scale(1.045); }
        .founder-card::after { content: ''; position: absolute; inset: 0; pointer-events: none; box-shadow: inset 0 -90px 70px -50px rgba(10,15,30,0.7); }
        .founder-chip { font-size: 0.72rem; color: rgba(255,255,255,0.6); border: 1px solid rgba(201,168,76,0.22); border-radius: 999px; padding: 0.32rem 0.85rem; background: rgba(201,168,76,0.05); font-family: 'JetBrains Mono', monospace; letter-spacing: 0.02em; transition: border-color 0.25s, color 0.25s; }
        .founder-chip:hover { border-color: rgba(201,168,76,0.5); color: rgba(255,255,255,0.85); }

        @media (max-width: 900px) { .hide-mobile { display: none !important; } .hero-grid { grid-template-columns: 1fr !important; } .about-grid { grid-template-columns: 1fr !important; } }
      `}</style>

      {/* NAV */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
        background: scrolled ? "rgba(10,15,30,0.92)" : "transparent",
        backdropFilter: scrolled ? "blur(12px)" : "none",
        borderBottom: scrolled ? "1px solid rgba(201,168,76,0.1)" : "1px solid transparent",
        transition: "all 0.3s",
      }}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Logo size={30} idSuffix="nav" wordmarkSize={1.1} />

          <div style={{ display: "flex", gap: "2rem", alignItems: "center" }} className="hide-mobile">
            {["How It Works", "Features", "Our Story", "Open Source"].map((l) => (
              <a key={l} href={`#${l.toLowerCase().replace(/\s+/g, "-")}`} className="nav-link">{l}</a>
            ))}
          </div>

          <div style={{ display: "flex", gap: "0.75rem" }} className="hide-mobile">
            <button className="btn-outline" style={{ padding: "0.55rem 1.25rem" }} onClick={handleSignIn}>Sign In</button>
            <button className="btn-gold" style={{ padding: "0.55rem 1.25rem" }} onClick={handleStart}>Get Started</button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative min-h-screen flex items-center pt-[120px] pb-[72px] px-6 overflow-hidden">
        <div className="aurora" aria-hidden><span className="a1" /><span className="a2" /><span className="a3" /></div>
        <div className="grain" aria-hidden />
        {/* vertical guide lines */}
        {["18%", "82%"].map((l) => (
          <div key={l} style={{ position: "absolute", left: l, top: 0, bottom: 0, width: 1, background: "rgba(201,168,76,0.05)", pointerEvents: "none", zIndex: 0 }} />
        ))}

        <div ref={hero.ref} className="hero-grid max-w-6xl mx-auto relative z-[1] w-full grid items-center gap-14 grid-cols-[1.05fr_0.95fr]">
          {/* Left: copy */}
          <div>
            <div className={`fade-up ${hero.inView ? "in" : ""}`}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: "0.6rem", marginBottom: "1.75rem", padding: "0.4rem 0.95rem", border: "1px solid rgba(201,168,76,0.3)", borderRadius: 999, background: "rgba(201,168,76,0.06)" }}>
                <span className="live-dot" />
                <span style={{ fontSize: "0.7rem", color: GOLD, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" }}>Open source · Valuation-first</span>
              </div>
            </div>

            <h1 className={`font-display fade-up d1 ${hero.inView ? "in" : ""}`} style={{ fontSize: "clamp(2.5rem, 5.5vw, 4.5rem)", fontWeight: 700, lineHeight: 1.05, marginBottom: "1.5rem" }}>
              Invest like you{" "}
              <span style={{ color: GOLD, fontStyle: "italic" }}>understand</span>{" "}
              what you own.
            </h1>

            <p className={`fade-up d2 ${hero.inView ? "in" : ""}`} style={{ fontSize: "1.15rem", color: "rgba(255,255,255,0.62)", maxWidth: 540, lineHeight: 1.75, marginBottom: "2.25rem" }}>
              IntrinsicFinEd turns walls of financial data into plain-language explanations, and walks you through the exact top-down process analysts use, from the macro tide down to a single share.
            </p>

            <div className={`fade-up d3 ${hero.inView ? "in" : ""}`} style={{ display: "flex", gap: "0.875rem", flexWrap: "wrap", marginBottom: "3rem" }}>
              <button className="btn-gold" onClick={handleStart}>Start analyzing free →</button>
              <button className="btn-outline">View on GitHub</button>
            </div>

            <div className={`fade-up d4 ${hero.inView ? "in" : ""}`} style={{ display: "flex", gap: "2.5rem", flexWrap: "wrap" }}>
              {[
                { val: `${Math.round(stagesVal)}`, label: "Stage framework" },
                { val: `${Math.round(industriesVal)}`, label: "Industries covered" },
                { val: `${Math.round(yearsVal)}`, label: "Macro data since" },
              ].map((s) => (
                <div key={s.label} style={{ borderLeft: "2px solid rgba(201,168,76,0.25)", paddingLeft: "1rem" }}>
                  <div className="font-display" style={{ fontSize: "1.85rem", fontWeight: 700, color: GOLD, fontVariantNumeric: "tabular-nums" }}>{s.val}</div>
                  <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: bespoke art panel with the live chart card floating over it */}
          <div className={`hero-visual-wrap fade-up d3 hide-mobile ${hero.inView ? "in" : ""}`} style={{ position: "relative" }}>
            <div style={{ transform: `translate3d(0, ${scrollY * -0.045}px, 0)`, transition: "transform 0.12s linear", willChange: "transform" }}>
              <HeroVisual active={hero.inView} />
            </div>
            <div
              className="hero-float-card"
              style={{
                position: "absolute", right: "-7%", bottom: "-9%", width: "80%",
                transform: `translate3d(0, ${scrollY * 0.05}px, 0)`, transition: "transform 0.12s linear", willChange: "transform",
              }}
            >
              <HeroChart active={hero.inView} />
            </div>
          </div>
        </div>

        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 120, background: "linear-gradient(to bottom, transparent, #0a0f1e)", pointerEvents: "none", zIndex: 0 }} />
      </section>

      {/* TICKER */}
      <section ref={trust.ref} className="border-y border-white/5 py-5 overflow-hidden bg-white/[0.012]">
        <div style={{ display: "flex", overflow: "hidden" }}>
          <div className="ticker-wrap" style={{ gap: "3rem", whiteSpace: "nowrap" }}>
            {[...Array(2)].flatMap((_, i) =>
              ["FRED Macro Data", "NBER Recession Bands", "Sector ROIC", "164 Industries", "DCF & Residual Income", "EVA Valuation", "13-Year Financials", "Open Source"].map((t) => (
                <span key={`${i}-${t}`} style={{ fontSize: "0.75rem", fontWeight: 500, color: "rgba(255,255,255,0.24)", textTransform: "uppercase", letterSpacing: "0.1em", display: "inline-flex", alignItems: "center", gap: "0.75rem" }}>
                  <span style={{ width: 4, height: 4, borderRadius: "50%", background: GOLD, opacity: 0.6, flexShrink: 0 }} />
                  {t}
                </span>
              )),
            )}
          </div>
        </div>
      </section>

      {/* STEPS */}
      <section id="how-it-works" className="py-28 px-6 relative">
        <div ref={steps.ref} className="max-w-6xl mx-auto">
          <div className={`fade-up mb-14 ${steps.inView ? "in" : ""}`}>
            <p style={{ fontSize: "0.72rem", color: GOLD, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "0.75rem" }}>The Framework</p>
            <h2 className="font-display" style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 700, maxWidth: 540, lineHeight: 1.15 }}>
              Five stages, top down: from the economy to a single share.
            </h2>
          </div>

          <div className="grid gap-5 grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
            {STEPS.map((step, i) => (
              <div
                key={step.number}
                className={`step-card fade-up d${Math.min(i + 1, 5)} ${steps.inView ? "in" : ""}`}
                style={{ borderRadius: 6, padding: "2rem" }}
                onMouseMove={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
                  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.5rem", position: "relative", zIndex: 1 }}>
                  <span className="font-display" style={{ fontSize: "3rem", fontWeight: 700, color: "rgba(255,255,255,0.05)", lineHeight: 1 }}>{step.number}</span>
                  <span style={{ color: GOLD }}>{step.icon}</span>
                </div>
                <p style={{ fontSize: "0.72rem", color: GOLD, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.4rem", position: "relative", zIndex: 1 }}>{step.subtitle}</p>
                <h3 className="font-display" style={{ fontSize: "1.4rem", fontWeight: 600, marginBottom: "0.75rem", position: "relative", zIndex: 1 }}>{step.title}</h3>
                <p style={{ fontSize: "0.95rem", color: "rgba(255,255,255,0.58)", lineHeight: 1.75, position: "relative", zIndex: 1 }}>{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DIVIDER */}
      <div className="max-w-6xl mx-auto px-6">
        <div style={{ height: 1, background: "linear-gradient(to right, transparent, rgba(201,168,76,0.2), transparent)" }} />
      </div>

      {/* FEATURES */}
      <section id="features" className="py-28 px-6">
        <div ref={features.ref} className="max-w-6xl mx-auto grid items-start gap-16 grid-cols-[repeat(auto-fit,minmax(300px,1fr))]">
          <div className={`fade-up ${features.inView ? "in" : ""}`}>
            <p style={{ fontSize: "0.72rem", color: GOLD, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "0.75rem" }}>Why IntrinsicFinEd</p>
            <h2 className="font-display" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.75rem)", fontWeight: 700, lineHeight: 1.18, marginBottom: "1.25rem" }}>
              Most platforms hand you data. We hand you{" "}
              <span style={{ color: GOLD, fontStyle: "italic" }}>understanding</span>.
            </h2>
            <p style={{ fontSize: "1rem", color: "rgba(255,255,255,0.58)", lineHeight: 1.8, marginBottom: "2rem" }}>
              Every figure arrives with the context that gives it meaning, explained in plain English, not Bloomberg shorthand. The result is a workspace you can actually learn from while you use it.
            </p>
            <button className="btn-gold" onClick={handleStart}>Start for free →</button>
          </div>

          <div className={`fade-up d2 flex flex-col gap-[1.4rem] ${features.inView ? "in" : ""}`}>
            {FEATURES.map((f) => (
              <div
                key={f.title}
                style={{ borderLeft: "2px solid rgba(201,168,76,0.18)", paddingLeft: "1.25rem", transition: "border-color 0.25s, transform 0.25s" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = GOLD; e.currentTarget.style.transform = "translateX(3px)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(201,168,76,0.18)"; e.currentTarget.style.transform = "translateX(0)"; }}
              >
                <h4 style={{ fontWeight: 600, fontSize: "1rem", marginBottom: "0.3rem" }}>{f.title}</h4>
                <p style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.5)", lineHeight: 1.7 }}>{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DIVIDER */}
      <div className="max-w-6xl mx-auto px-6">
        <div style={{ height: 1, background: "linear-gradient(to right, transparent, rgba(201,168,76,0.2), transparent)" }} />
      </div>

      {/* ABOUT / OUR STORY */}
      <section id="our-story" className="py-28 px-6 relative overflow-hidden">
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 48% 40% at 78% 18%, rgba(201,168,76,0.06), transparent 70%)", pointerEvents: "none" }} />
        <div ref={about.ref} className="about-grid max-w-6xl mx-auto relative z-[1] grid items-center gap-16 grid-cols-[0.82fr_1.18fr]">
          {/* Portrait */}
          <div className={`fade-up ${about.inView ? "in" : ""}`} style={{ position: "relative" }}>
            <div className="founder-card" style={{ aspectRatio: "4 / 5", maxWidth: 380, marginInline: "auto" }}>
              <img
                src="/founder.jpg"
                alt="Zaki Mir, founder of IntrinsicFinEd"
                onError={(e) => {
                  const img = e.currentTarget;
                  img.style.display = "none";
                  const fallback = img.nextElementSibling as HTMLElement | null;
                  if (fallback) fallback.style.display = "flex";
                }}
              />
              {/* monogram fallback shown if /founder.jpg is missing */}
              <div style={{ display: "none", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", background: "linear-gradient(165deg, rgba(201,168,76,0.16), rgba(124,147,214,0.06))", color: GOLD, fontFamily: "'Playfair Display', serif", fontSize: "4.5rem", fontWeight: 700 }}>
                ZM
              </div>
            </div>

            {/* floating attribution card */}
            <div className="hide-mobile" style={{ position: "absolute", right: "-4%", bottom: "7%", background: "rgba(10,15,30,0.92)", border: "1px solid rgba(201,168,76,0.3)", borderRadius: 8, padding: "0.85rem 1.15rem", backdropFilter: "blur(8px)", boxShadow: "0 22px 44px -26px rgba(0,0,0,0.85)" }}>
              <div className="font-display" style={{ fontSize: "1.05rem", fontWeight: 700, lineHeight: 1.1 }}>Zaki Mir</div>
              <div style={{ fontSize: "0.66rem", color: GOLD, letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 3 }}>Founder</div>
            </div>
          </div>

          {/* Story */}
          <div>
            <p className={`fade-up ${about.inView ? "in" : ""}`} style={{ fontSize: "0.72rem", color: GOLD, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "0.75rem" }}>Our Story</p>

            <h2 className={`font-display fade-up d1 ${about.inView ? "in" : ""}`} style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.75rem)", fontWeight: 700, lineHeight: 1.18, marginBottom: "1.5rem" }}>
              Built by an investor who started with his{" "}
              <span style={{ color: GOLD, fontStyle: "italic" }}>mistakes</span>.
            </h2>

            <div className={`fade-up d2 ${about.inView ? "in" : ""}`} style={{ fontSize: "1rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.85, display: "flex", flexDirection: "column", gap: "1.1rem" }}>
              <p>
                IntrinsicFinEd started with a teenager in Houston who refused to read his losses as red numbers on a screen. Zaki Mir treated every one as evidence. Not <em style={{ color: "rgba(255,255,255,0.82)", fontStyle: "italic" }}>how much did I lose</em>, but <em style={{ color: "rgba(255,255,255,0.82)", fontStyle: "italic" }}>what did I get wrong</em>? Asked over and over, that one question became the foundation of this platform.
              </p>
              <p>
                After early missteps, buying companies before he understood their competitive position, he read deeply into Graham, Shiller and Dalio, and learned to tell a real bargain from a value trap. One lesson stuck above the rest: a number is never just a number. It always has an explanation behind it.
              </p>
            </div>

            <blockquote className={`fade-up d3 ${about.inView ? "in" : ""}`} style={{ borderLeft: `3px solid ${GOLD}`, paddingLeft: "1.4rem", margin: "1.9rem 0" }}>
              <p className="font-display" style={{ fontSize: "1.25rem", fontWeight: 600, fontStyle: "italic", lineHeight: 1.45, color: "rgba(255,255,255,0.92)" }}>
                "I didn't build the model so it could say yes or no. I want to understand why it is saying that."
              </p>
            </blockquote>

            <p className={`fade-up d3 ${about.inView ? "in" : ""}`} style={{ fontSize: "1rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.85, marginBottom: "1.75rem" }}>
              So he built the tool he wished he had, for the investors who need it most and can least afford an expensive professional terminal. It walks through the same process analysts use, from the broad economy down to a single share, and it stays free, open source, and explained in plain language for anyone willing to ask why.
            </p>

            <div className={`fade-up d4 ${about.inView ? "in" : ""}`} style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
              {["Houston, TX", "Valuation over speculation", "Self-taught analyst", "Reads Graham, Shiller, Dalio"].map((c) => (
                <span key={c} className="founder-chip">{c}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* OPEN SOURCE */}
      <section id="open-source" className="px-6 pt-8 pb-28">
        <div className="max-w-6xl mx-auto">
          <div style={{
            borderRadius: 6, padding: "clamp(2rem, 5vw, 3.5rem)",
            background: "linear-gradient(135deg, rgba(201,168,76,0.08) 0%, rgba(124,147,214,0.04) 100%)",
            border: "1px solid rgba(201,168,76,0.2)", position: "relative", overflow: "hidden",
          }}>
            <div style={{ position: "absolute", top: 0, right: 0, width: 320, height: 320, background: GOLD, borderRadius: "50%", filter: "blur(90px)", opacity: 0.05, transform: "translate(30%, -30%)", pointerEvents: "none" }} />
            <div style={{ position: "relative", zIndex: 1, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "2.5rem" }}>
              <div style={{ flex: "1 1 320px" }}>
                <p style={{ fontSize: "0.72rem", color: GOLD, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "0.75rem" }}>Open Source</p>
                <h2 className="font-display" style={{ fontSize: "clamp(1.6rem, 3vw, 2.25rem)", fontWeight: 700, marginBottom: "1rem", lineHeight: 1.2 }}>
                  Financial literacy shouldn't sit behind a paywall.
                </h2>
                <p style={{ fontSize: "1rem", color: "rgba(255,255,255,0.58)", lineHeight: 1.8, maxWidth: 520 }}>
                  The entire pipeline is free and open: the data layer, the valuation models, the explanations and the code. Inspect it, fork it, learn from it. The tools for long-term wealth shouldn't depend on your bank balance.
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", flexShrink: 0 }}>
                <button className="btn-gold">View on GitHub →</button>
                <button className="btn-outline" onClick={() => { window.location.href = "/guide"; }}>Read the docs</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="get-started" className="py-28 px-6 text-center relative overflow-hidden">
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 60% 50% at 50% 100%, rgba(201,168,76,0.07) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div ref={cta.ref} className="max-w-[700px] mx-auto relative z-[1]">
          <p className={`fade-up ${cta.inView ? "in" : ""}`} style={{ fontSize: "0.72rem", color: GOLD, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "1rem" }}>
            Get started today
          </p>
          <h2 className={`font-display fade-up d1 ${cta.inView ? "in" : ""}`} style={{ fontSize: "clamp(2.2rem, 5vw, 3.75rem)", fontWeight: 700, lineHeight: 1.1, marginBottom: "1.25rem" }}>
            Ready to invest with{" "}
            <span style={{ color: GOLD, fontStyle: "italic" }}>conviction</span>?
          </h2>
          <p className={`fade-up d2 ${cta.inView ? "in" : ""}`} style={{ fontSize: "1.1rem", color: "rgba(255,255,255,0.58)", lineHeight: 1.8, marginBottom: "2.5rem" }}>
            Learn to read a company the way the professionals do, from the macro tide down to the fundamentals of a single share.
          </p>
          <div className={`fade-up d3 ${cta.inView ? "in" : ""}`} style={{ display: "flex", gap: "0.875rem", justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn-gold" onClick={handleStart}>Start analyzing free →</button>
            <button className="btn-outline" onClick={() => { window.location.href = "/guide"; }}>Learn the framework</button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/[0.06] px-6 py-12">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-6">
          <Logo size={24} idSuffix="footer" wordmarkSize={1} />

          <div style={{ display: "flex", gap: "2rem" }}>
            {["How It Works", "Features", "GitHub", "Docs"].map((l) => (
              <a key={l} href="#" style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.32)", textDecoration: "none", transition: "color 0.2s" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.32)")}
              >{l}</a>
            ))}
          </div>

          <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.22)" }}>
            © 2025 IntrinsicFinEd. Open source. Not financial advice.
          </p>
        </div>
      </footer>
    </div>
  );
}
