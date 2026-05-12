import { useState, useEffect, useRef } from "react";

const NAV_LINKS = ["How It Works", "Features", "Open Source", "Get Started"];

const STEPS = [
  {
    number: "01",
    title: "Economic Analysis",
    subtitle: "Macro Context First",
    description:
      "Understand the broader economic environment before touching a single balance sheet. IntrinsicEd surfaces GDP trends, interest rate cycles, and sector tailwinds — explained in plain language, not jargon.",
    icon: (
      <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10">
        <path d="M4 32 L12 20 L20 24 L28 12 L36 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="36" cy="8" r="3" fill="currentColor"/>
      </svg>
    ),
  },
  {
    number: "02",
    title: "Industry Analysis",
    subtitle: "Competitive Landscape",
    description:
      "Map the playing field. Identify structural advantages, pricing power, and competitive moats — so you know whether a company's numbers reflect skill or just a rising tide.",
    icon: (
      <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10">
        <rect x="4" y="20" width="8" height="16" rx="1" stroke="currentColor" strokeWidth="2.5"/>
        <rect x="16" y="12" width="8" height="24" rx="1" stroke="currentColor" strokeWidth="2.5"/>
        <rect x="28" y="4" width="8" height="32" rx="1" stroke="currentColor" strokeWidth="2.5"/>
      </svg>
    ),
  },
  {
    number: "03",
    title: "Financial Statements",
    subtitle: "Beyond the Numbers",
    description:
      "Balance sheets, income statements, and cash flows decoded by AI. Every metric explained in context — not just what it is, but why it matters for long-term intrinsic value.",
    icon: (
      <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10">
        <rect x="6" y="4" width="28" height="32" rx="2" stroke="currentColor" strokeWidth="2.5"/>
        <path d="M12 14 h16 M12 20 h16 M12 26 h10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    number: "04",
    title: "Qualitative Analysis",
    subtitle: "The Human Factor",
    description:
      "Management quality, brand strength, and business model durability. The things that don't show up in a spreadsheet — but often determine whether a great company stays great.",
    icon: (
      <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10">
        <circle cx="20" cy="14" r="7" stroke="currentColor" strokeWidth="2.5"/>
        <path d="M6 36 C6 28 34 28 34 36" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
    ),
  },
];

const FEATURES = [
  { title: "AI-Powered Explanations", description: "Every metric comes with plain-language commentary. No finance degree required." },
  { title: "Intrinsic Value Focus", description: "Built around valuation fundamentals — not price momentum or social sentiment." },
  { title: "Structured 4-Step Framework", description: "A repeatable process that professional analysts use, simplified for new investors." },
  { title: "Open Source & Free", description: "No paywalls. No subscriptions. Built by the community, for the community." },
  { title: "No Wall of Data", description: "We surface what matters. Everything else stays out of the way." },
  { title: "Long-Term Lens", description: "Designed for investors who think in years, not days." },
];

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, inView };
}

export default function LandingPage({ onGetStarted }: { onGetStarted?: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const hero = useInView(0.1);
  const trust = useInView(0.1);
  const steps = useInView(0.1);
  const features = useInView(0.1);
  const cta = useInView(0.1);

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white overflow-x-hidden" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,600&family=DM+Sans:wght@300;400;500;600&display=swap');

        .font-display { font-family: 'Playfair Display', Georgia, serif; }

        .fade-up { opacity: 0; transform: translateY(28px); transition: opacity 0.65s ease, transform 0.65s ease; }
        .fade-up.in { opacity: 1; transform: translateY(0); }
        .d1 { transition-delay: 0.1s; }
        .d2 { transition-delay: 0.2s; }
        .d3 { transition-delay: 0.3s; }
        .d4 { transition-delay: 0.4s; }

        .nav-link { font-size: 0.875rem; font-weight: 500; color: rgba(255,255,255,0.6); text-decoration: none; letter-spacing: 0.02em; transition: color 0.2s; position: relative; }
        .nav-link:hover { color: #fff; }
        .nav-link::after { content: ''; position: absolute; bottom: -2px; left: 0; width: 0; height: 1px; background: #c9a84c; transition: width 0.25s; }
        .nav-link:hover::after { width: 100%; }

        .step-card { border: 1px solid rgba(201,168,76,0.12); background: rgba(255,255,255,0.02); transition: border-color 0.3s, transform 0.3s; }
        .step-card:hover { border-color: rgba(201,168,76,0.4); transform: translateY(-3px); }

        .btn-gold { background: #c9a84c; color: #0a0f1e; font-weight: 600; font-size: 0.9rem; letter-spacing: 0.04em; padding: 0.8rem 1.8rem; border: none; cursor: pointer; transition: background 0.2s, transform 0.15s; }
        .btn-gold:hover { background: #d9b85c; transform: translateY(-1px); }

        .btn-outline { background: transparent; color: rgba(255,255,255,0.7); font-weight: 500; font-size: 0.9rem; letter-spacing: 0.03em; padding: 0.8rem 1.8rem; border: 1px solid rgba(255,255,255,0.18); cursor: pointer; transition: border-color 0.2s, color 0.2s; }
        .btn-outline:hover { border-color: rgba(201,168,76,0.5); color: #c9a84c; }

        .ticker-wrap { display: flex; animation: ticker 30s linear infinite; }
        @keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
      `}</style>

      {/* NAV */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
        background: scrolled ? "rgba(10,15,30,0.95)" : "transparent",
        backdropFilter: scrolled ? "blur(12px)" : "none",
        borderBottom: scrolled ? "1px solid rgba(201,168,76,0.1)" : "none",
        transition: "all 0.3s",
      }}>
        <div style={{ maxWidth: 1152, margin: "0 auto", padding: "1rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div style={{ width: 28, height: 28, background: "#c9a84c", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 3 }}>
              <span className="font-display" style={{ color: "#0a0f1e", fontWeight: 700, fontSize: 14 }}>I</span>
            </div>
            <span className="font-display" style={{ fontSize: "1.1rem", fontWeight: 600, letterSpacing: "-0.01em" }}>
              Intrinsic<span style={{ color: "#c9a84c" }}>FinEd</span>
            </span>
          </div>

          <div style={{ display: "flex", gap: "2rem", alignItems: "center" }} className="hidden-mobile">
            {["How It Works", "Features", "Open Source"].map(l => (
              <a key={l} href={`#${l.toLowerCase().replace(/\s+/g, "-")}`} className="nav-link">{l}</a>
            ))}
          </div>

          <div style={{ display: "flex", gap: "0.75rem" }} className="hidden-mobile">
            <button className="btn-outline" style={{ padding: "0.55rem 1.25rem" }}>Sign In</button>
            <button className="btn-gold" style={{ padding: "0.55rem 1.25rem" }} onClick={onGetStarted}>Get Started</button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section style={{
        minHeight: "100vh", display: "flex", alignItems: "center", paddingTop: 96, paddingBottom: 64, paddingLeft: 24, paddingRight: 24,
        background: "radial-gradient(ellipse 80% 55% at 50% -5%, rgba(201,168,76,0.09) 0%, transparent 65%), #0a0f1e",
        position: "relative", overflow: "hidden",
      }}>
        {/* grid lines */}
        {["20%", "80%"].map(l => (
          <div key={l} style={{ position: "absolute", left: l, top: 0, bottom: 0, width: 1, background: "rgba(201,168,76,0.05)", pointerEvents: "none" }} />
        ))}

        <div ref={hero.ref} style={{ maxWidth: 1152, margin: "0 auto", position: "relative", zIndex: 1, width: "100%" }}>
          <div className={`fade-up ${hero.inView ? "in" : ""}`}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", marginBottom: "2rem", padding: "0.35rem 0.9rem", border: "1px solid rgba(201,168,76,0.3)", borderRadius: 999, background: "rgba(201,168,76,0.05)" }}>
              <span style={{ fontSize: "0.7rem", color: "#c9a84c", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" }}>Valuation-Based Investing</span>
            </div>
          </div>

          <h1 className={`font-display fade-up d1 ${hero.inView ? "in" : ""}`} style={{ fontSize: "clamp(2.5rem, 7vw, 4.5rem)", fontWeight: 700, lineHeight: 1.07, marginBottom: "1.5rem", maxWidth: 820 }}>
            Invest like you{" "}
            <span style={{ color: "#c9a84c", fontStyle: "italic" }}>understand</span>{" "}
            what you own.
          </h1>

          <p className={`fade-up d2 ${hero.inView ? "in" : ""}`} style={{ fontSize: "1.125rem", color: "rgba(255,255,255,0.57)", maxWidth: 580, lineHeight: 1.75, marginBottom: "2.5rem" }}>
            IntrinsicFinEd is an open-source financial analysis platform that replaces walls of data with plain-language AI explanations — guiding young investors through a proven four-step valuation process.
          </p>

          <div className={`fade-up d3 ${hero.inView ? "in" : ""}`} style={{ display: "flex", gap: "0.875rem", flexWrap: "wrap", marginBottom: "4rem" }}>
            <button className="btn-gold" onClick={onGetStarted}>Start Analyzing Free →</button>
            <button className="btn-outline">View on GitHub</button>
          </div>

          <div className={`fade-up d4 ${hero.inView ? "in" : ""}`} style={{ display: "flex", gap: "2.5rem", flexWrap: "wrap" }}>
            {[{ val: "4-Step", label: "Framework" }, { val: "AI", label: "Explanations" }, { val: "100%", label: "Free & Open" }].map(s => (
              <div key={s.label} style={{ borderLeft: "2px solid rgba(201,168,76,0.2)", paddingLeft: "1rem" }}>
                <div className="font-display" style={{ fontSize: "1.6rem", fontWeight: 700, color: "#c9a84c" }}>{s.val}</div>
                <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 100, background: "linear-gradient(to bottom, transparent, #0a0f1e)", pointerEvents: "none" }} />
      </section>

      {/* TICKER */}
      <section ref={trust.ref} style={{ borderTop: "1px solid rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.05)", padding: "1.25rem 0", overflow: "hidden" }}>
        <div style={{ display: "flex", overflow: "hidden" }}>
          <div className="ticker-wrap" style={{ gap: "3rem", whiteSpace: "nowrap" }}>
            {[...Array(2)].flatMap((_, i) =>
              ["Economic Analysis", "Industry Moats", "Balance Sheet Clarity", "Cash Flow", "Intrinsic Value", "Qualitative Factors", "Open Source", "AI Powered"].map(t => (
                <span key={`${i}-${t}`} style={{ fontSize: "0.75rem", fontWeight: 500, color: "rgba(255,255,255,0.22)", textTransform: "uppercase", letterSpacing: "0.1em", display: "inline-flex", alignItems: "center", gap: "0.75rem" }}>
                  <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#c9a84c", opacity: 0.6, flexShrink: 0 }} />
                  {t}
                </span>
              ))
            )}
          </div>
        </div>
      </section>

      {/* STEPS */}
      <section id="how-it-works" style={{ padding: "7rem 1.5rem" }}>
        <div ref={steps.ref} style={{ maxWidth: 1152, margin: "0 auto" }}>
          <div className={`fade-up ${steps.inView ? "in" : ""}`} style={{ marginBottom: "3.5rem" }}>
            <p style={{ fontSize: "0.7rem", color: "#c9a84c", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "0.75rem" }}>The Framework</p>
            <h2 className="font-display" style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 700, maxWidth: 480, lineHeight: 1.15 }}>
              Four steps to understanding any company.
            </h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.25rem" }}>
            {STEPS.map((step, i) => (
              <div key={step.number} className={`step-card fade-up d${i + 1} ${steps.inView ? "in" : ""}`} style={{ borderRadius: 4, padding: "2rem" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.5rem" }}>
                  <span className="font-display" style={{ fontSize: "3rem", fontWeight: 700, color: "rgba(255,255,255,0.04)", lineHeight: 1 }}>{step.number}</span>
                  <span style={{ color: "#c9a84c" }}>{step.icon}</span>
                </div>
                <p style={{ fontSize: "0.7rem", color: "#c9a84c", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.4rem" }}>{step.subtitle}</p>
                <h3 className="font-display" style={{ fontSize: "1.4rem", fontWeight: 600, marginBottom: "0.75rem" }}>{step.title}</h3>
                <p style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.52)", lineHeight: 1.75 }}>{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DIVIDER */}
      <div style={{ maxWidth: 1152, margin: "0 auto", padding: "0 1.5rem" }}>
        <div style={{ height: 1, background: "linear-gradient(to right, transparent, rgba(201,168,76,0.2), transparent)" }} />
      </div>

      {/* FEATURES */}
      <section id="features" style={{ padding: "7rem 1.5rem" }}>
        <div ref={features.ref} style={{ maxWidth: 1152, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "4rem", alignItems: "start" }}>
          <div className={`fade-up ${features.inView ? "in" : ""}`}>
            <p style={{ fontSize: "0.7rem", color: "#c9a84c", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "0.75rem" }}>Why IntrinsicFinEd</p>
            <h2 className="font-display" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.75rem)", fontWeight: 700, lineHeight: 1.18, marginBottom: "1.25rem" }}>
              Built for investors who want to{" "}
              <span style={{ color: "#c9a84c", fontStyle: "italic" }}>actually understand</span>{" "}
              what they own.
            </h2>
            <p style={{ fontSize: "0.95rem", color: "rgba(255,255,255,0.52)", lineHeight: 1.8, marginBottom: "2rem" }}>
              Most platforms give you data. IntrinsicFinEd gives you understanding. Every number comes with context, every metric with meaning — powered by AI that speaks in plain English, not Bloomberg-speak.
            </p>
            <button className="btn-gold" onClick={onGetStarted}>Start for Free →</button>
          </div>

          <div className={`fade-up d2 ${features.inView ? "in" : ""}`} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{ borderLeft: "2px solid rgba(201,168,76,0.18)", paddingLeft: "1.25rem", transition: "border-color 0.25s" }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "#c9a84c")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(201,168,76,0.18)")}
              >
                <h4 style={{ fontWeight: 600, fontSize: "0.95rem", marginBottom: "0.3rem" }}>{f.title}</h4>
                <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.45)", lineHeight: 1.7 }}>{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* OPEN SOURCE */}
      <section id="open-source" style={{ padding: "2rem 1.5rem 7rem" }}>
        <div style={{ maxWidth: 1152, margin: "0 auto" }}>
          <div style={{
            borderRadius: 4, padding: "clamp(2rem, 5vw, 3.5rem)",
            background: "linear-gradient(135deg, rgba(201,168,76,0.07) 0%, rgba(201,168,76,0.02) 100%)",
            border: "1px solid rgba(201,168,76,0.2)", position: "relative", overflow: "hidden",
          }}>
            <div style={{ position: "absolute", top: 0, right: 0, width: 300, height: 300, background: "#c9a84c", borderRadius: "50%", filter: "blur(80px)", opacity: 0.04, transform: "translate(30%, -30%)", pointerEvents: "none" }} />
            <div style={{ position: "relative", zIndex: 1, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "2.5rem" }}>
              <div style={{ flex: "1 1 320px" }}>
                <p style={{ fontSize: "0.7rem", color: "#c9a84c", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "0.75rem" }}>Open Source</p>
                <h2 className="font-display" style={{ fontSize: "clamp(1.6rem, 3vw, 2.25rem)", fontWeight: 700, marginBottom: "1rem", lineHeight: 1.2 }}>
                  Financial literacy shouldn't be behind a paywall.
                </h2>
                <p style={{ fontSize: "0.95rem", color: "rgba(255,255,255,0.52)", lineHeight: 1.8, maxWidth: 520 }}>
                  IntrinsicFinEd is free, open-source, and community-driven. Built by investors who believe the tools for long-term wealth creation should be accessible to everyone — regardless of background or bank account.
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", flexShrink: 0 }}>
                <button className="btn-gold">View on GitHub →</button>
                <button className="btn-outline">Read the Docs</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="get-started" style={{ padding: "7rem 1.5rem", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 60% 50% at 50% 100%, rgba(201,168,76,0.06) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div ref={cta.ref} style={{ maxWidth: 700, margin: "0 auto", position: "relative", zIndex: 1 }}>
          <p className={`fade-up ${cta.inView ? "in" : ""}`} style={{ fontSize: "0.7rem", color: "#c9a84c", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "1rem" }}>
            Get Started Today
          </p>
          <h2 className={`font-display fade-up d1 ${cta.inView ? "in" : ""}`} style={{ fontSize: "clamp(2.2rem, 5vw, 3.75rem)", fontWeight: 700, lineHeight: 1.1, marginBottom: "1.25rem" }}>
            Ready to invest with{" "}
            <span style={{ color: "#c9a84c", fontStyle: "italic" }}>conviction</span>?
          </h2>
          <p className={`fade-up d2 ${cta.inView ? "in" : ""}`} style={{ fontSize: "1.05rem", color: "rgba(255,255,255,0.52)", lineHeight: 1.8, marginBottom: "2.5rem" }}>
            Join the next generation of investors learning to analyze companies the right way — from the fundamentals up.
          </p>
          <div className={`fade-up d3 ${cta.inView ? "in" : ""}`} style={{ display: "flex", gap: "0.875rem", justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn-gold" onClick={onGetStarted}>Start Analyzing Free →</button>
            <button className="btn-outline">Learn the Framework</button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "3rem 1.5rem" }}>
        <div style={{ maxWidth: 1152, margin: "0 auto", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div style={{ width: 24, height: 24, background: "#c9a84c", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 3 }}>
              <span className="font-display" style={{ color: "#0a0f1e", fontWeight: 700, fontSize: 12 }}>I</span>
            </div>
            <span className="font-display" style={{ fontWeight: 600 }}>Intrinsic<span style={{ color: "#c9a84c" }}>FinEd</span></span>
          </div>

          <div style={{ display: "flex", gap: "2rem" }}>
            {["How It Works", "Features", "GitHub", "Docs"].map(l => (
              <a key={l} href="#" style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.32)", textDecoration: "none", transition: "color 0.2s" }}
                onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
                onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.32)")}
              >{l}</a>
            ))}
          </div>

          <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.22)" }}>
            © 2025 IntrinsicFinEd. Open Source. Not financial advice.
          </p>
        </div>
      </footer>
    </div>
  );
}
