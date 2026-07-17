import { useEffect } from "react";
import { Link } from "react-router-dom";
import Logo from "./Logo";

/* Shared chrome for /terms and /privacy. Both are public routes, so this must
   not mount AppShell or anything that reads Convex. */

export function LegalLayout({
  title,
  updated,
  lede,
  children,
}: {
  title: string;
  updated: string;
  lede: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    document.title = `IntrinsicFinEd - ${title}`;
    window.scrollTo(0, 0);
  }, [title]);

  return (
    <div className="min-h-screen bg-ink-800 text-white">
      <header className="sticky top-0 z-20 bg-ink-900/85 backdrop-blur-md border-b border-gold/10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" aria-label="Home">
            <Logo size={28} idSuffix="legal-nav" wordmarkSize={1.05} />
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/terms" className="text-sm text-white/50 hover:text-white transition-colors">Terms</Link>
            <Link to="/privacy" className="text-sm text-white/50 hover:text-white transition-colors">Privacy</Link>
            <Link to="/auth" className="btn-gold">Get started</Link>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 lg:py-16">
        <p className="eyebrow mb-3">Legal</p>
        <h1 className="font-display text-4xl md:text-5xl font-semibold text-white tracking-tight leading-[1.05] mb-4 text-balance">
          {title}
        </h1>
        <p className="text-sm text-white/40 mb-8">Last updated {updated}</p>

        <p className="text-lg text-white/70 leading-relaxed border-l-2 border-gold/40 pl-5 mb-12">{lede}</p>

        <div className="legal-body">{children}</div>

        <style>{`
          .legal-body h2 { font-family: 'Playfair Display', Georgia, serif; font-size: 1.5rem; font-weight: 600;
            color: #fff; margin: 2.75rem 0 0.85rem; letter-spacing: -0.01em; }
          .legal-body h2:first-child { margin-top: 0; }
          .legal-body h3 { font-size: 1rem; font-weight: 600; color: rgba(255,255,255,0.9); margin: 1.75rem 0 0.5rem; }
          .legal-body p { color: rgba(255,255,255,0.62); line-height: 1.85; margin-bottom: 1rem; }
          .legal-body ul { margin: 0 0 1.15rem 0; padding: 0; list-style: none; }
          .legal-body li { color: rgba(255,255,255,0.62); line-height: 1.8; margin-bottom: 0.55rem;
            padding-left: 1.15rem; position: relative; }
          .legal-body li::before { content: ''; position: absolute; left: 0; top: 0.72em;
            width: 5px; height: 5px; border-radius: 50%; background: rgba(201,168,76,0.6); }
          .legal-body strong { color: rgba(255,255,255,0.9); font-weight: 600; }
          .legal-body a { color: #c9a84c; text-decoration: none; border-bottom: 1px solid rgba(201,168,76,0.35); }
          .legal-body a:hover { border-bottom-color: #c9a84c; }
          .legal-body .callout { border: 1px solid rgba(201,168,76,0.22); background: rgba(201,168,76,0.05);
            border-radius: 8px; padding: 1.15rem 1.35rem; margin: 1.5rem 0; }
          .legal-body .callout p { margin-bottom: 0; color: rgba(255,255,255,0.75); }
        `}</style>

        <div className="mt-16 pt-8 border-t border-gold/10 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-sm text-white/45">Questions about this page?</p>
          <a href="mailto:contact@intrinsicfined.org" className="btn-outline">Email us</a>
        </div>
      </main>

      <footer className="border-t border-white/[0.06] px-6 py-10">
        <div className="max-w-3xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-white/40">
            © 2026 IntrinsicFinEd. Free and open. Not financial advice.
          </p>
          <div className="flex gap-5 text-xs">
            <Link to="/" className="text-white/40 hover:text-white/70 transition-colors">Home</Link>
            <Link to="/guide" className="text-white/40 hover:text-white/70 transition-colors">Guide</Link>
            <Link to="/terms" className="text-white/40 hover:text-white/70 transition-colors">Terms</Link>
            <Link to="/privacy" className="text-white/40 hover:text-white/70 transition-colors">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
