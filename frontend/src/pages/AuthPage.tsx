import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SignInForm } from "../SignInForm";
import { QUOTES } from "../lib/quotes";

const QUOTE_ROTATE_MS = 8000;

export function AuthPage() {
  const navigate = useNavigate();
  // Start on a different quote each visit, then rotate gently through the library.
  const [quoteIdx, setQuoteIdx] = useState(() => Math.floor(Math.random() * QUOTES.length));

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(
      () => setQuoteIdx((i) => (i + 1) % QUOTES.length),
      QUOTE_ROTATE_MS,
    );
    return () => window.clearInterval(id);
  }, []);

  const quote = QUOTES[quoteIdx];

  return (
    <div className="min-h-screen bg-ink-800 text-white overflow-hidden relative">
      {/* Atmospheric backdrop */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(201,168,76,0.10) 0%, transparent 65%), radial-gradient(ellipse 50% 40% at 80% 100%, rgba(201,168,76,0.06) 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute inset-y-0 left-1/4 right-3/4 pointer-events-none"
        style={{ background: "linear-gradient(to right, transparent, rgba(201,168,76,0.04), transparent)" }}
      />

      <div className="relative min-h-screen flex flex-col lg:flex-row">
        {/* Left — quote panel */}
        <div className="hidden lg:flex flex-col justify-between p-12 xl:p-16 lg:w-1/2 border-r border-gold/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gold flex items-center justify-center rounded-sm">
              <span className="font-display text-ink-800 font-bold text-sm">I</span>
            </div>
            <span className="font-display text-base font-semibold tracking-tight">
              Intrinsic<span className="text-gold">FinEd</span>
            </span>
          </div>

          <div className="max-w-md">
            <p className="eyebrow mb-4">A small thought</p>
            {/* Keyed so each rotation re-triggers the fade-up animation. */}
            <div key={quoteIdx} className="animate-fade-up min-h-[10rem]">
              <blockquote className="font-display text-[1.75rem] xl:text-[2.1rem] text-white leading-snug font-medium">
                <span className="text-gold/70">&ldquo;</span>
                {quote.text}
                <span className="text-gold/70">&rdquo;</span>
              </blockquote>
              <p className="text-white/55 mt-5 text-sm font-medium">— {quote.author}</p>
              {quote.source && (
                <p className="text-white/30 mt-1 text-xs italic">{quote.source}</p>
              )}
            </div>

            {/* Progress dots for the rotating library */}
            <div className="flex items-center gap-1.5 mt-6" aria-hidden>
              {QUOTES.map((_, i) => (
                <span
                  key={i}
                  className={
                    "h-1 rounded-full transition-all duration-500 " +
                    (i === quoteIdx ? "w-5 bg-gold" : "w-1 bg-white/15")
                  }
                />
              ))}
            </div>

            <div className="mt-10 grid grid-cols-3 gap-4">
              {[
                { label: "Stages", value: "5" },
                { label: "Free", value: "100%" },
                { label: "Open", value: "Source" },
              ].map((s) => (
                <div key={s.label} className="border-l border-gold/20 pl-3">
                  <p className="font-display text-xl font-semibold text-gold">{s.value}</p>
                  <p className="text-[0.65rem] uppercase tracking-[0.16em] text-white/35 mt-1">
                    {s.label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <p className="text-[0.7rem] text-white/30 max-w-md">
            Educational tool, not financial advice. Always verify primary filings before making
            decisions with real money.
          </p>
        </div>

        {/* Right — auth */}
        <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
          <SignInForm onBack={() => navigate("/")} />
        </div>
      </div>
    </div>
  );
}
