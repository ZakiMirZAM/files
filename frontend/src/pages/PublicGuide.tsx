// Public "How it works" guide, reachable at /guide without signing in. Reuses
// the same GuideContent as the in-app page but wraps it in lightweight public
// chrome (logo + sign-in calls to action). It must not mount AppShell or any
// Convex-dependent panel, since unauthenticated visitors render this.

import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import Logo from "../components/Logo";
import { GuideContent } from "../components/onboarding/GuideContent";

export function PublicGuide() {
  const location = useLocation();

  useEffect(() => {
    if (!location.hash) return;
    const el = document.getElementById(location.hash.slice(1));
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }, [location.hash]);

  return (
    <div className="min-h-screen bg-ink-800 text-white">
      <header className="sticky top-0 z-20 bg-ink-900/85 backdrop-blur-md border-b border-gold/10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" aria-label="Home">
            <Logo size={28} idSuffix="guide-nav" wordmarkSize={1.05} />
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/auth" className="btn-outline">
              Sign in
            </Link>
            <Link to="/auth" className="btn-gold">
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 lg:py-16">
        <p className="eyebrow mb-3">Guide</p>
        <h1 className="font-display text-4xl md:text-5xl font-semibold text-white tracking-tight leading-[1.05] mb-12 text-balance">
          How IntrinsicEd works
        </h1>

        <GuideContent />

        <div className="mt-16 pt-8 border-t border-gold/10 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-sm text-white/45">Ready to try it for yourself?</p>
          <Link to="/auth" className="btn-gold">
            Get started
          </Link>
        </div>
      </main>

      <footer className="border-t border-white/[0.06] px-6 py-10 text-center">
        <p className="text-xs text-white/50">
          © 2026 IntrinsicFinEd. Free for everyone. Not financial advice.
        </p>
      </footer>
    </div>
  );
}
