// In-app "How it works" guide. Lives under /app so it inherits the sidebar,
// header, and help menu. Shows a contents list, the shared GuideContent, and a
// "Take the tour" action. Smooth-scrolls to a section when arriving with a hash
// (help badges deep-link here, for example /app/guide#tool-ai).

import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Compass } from "lucide-react";
import { SectionHeader } from "../components/SectionHeader";
import { GuideContent } from "../components/onboarding/GuideContent";
import { GUIDE_SECTIONS } from "../lib/guideContent";
import { startWelcomeTour } from "../lib/tours";

export function GuidePage() {
  const location = useLocation();

  useEffect(() => {
    if (!location.hash) return;
    const el = document.getElementById(location.hash.slice(1));
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }, [location.hash]);

  return (
    <div>
      <SectionHeader
        eyebrow="Help"
        title="How IntrinsicEd works"
        actions={
          <button type="button" onClick={() => startWelcomeTour()} className="btn-outline">
            <Compass className="w-4 h-4" aria-hidden="true" />
            Take the tour
          </button>
        }
      />

      <nav aria-label="Guide contents" className="panel-soft p-5 mb-12">
        <p className="label mb-3">On this page</p>
        <ol className="grid sm:grid-cols-2 gap-x-8 gap-y-2">
          {GUIDE_SECTIONS.map((section, i) => (
            <li key={section.id} className="text-sm">
              <a
                href={`#${section.id}`}
                className="flex gap-2 text-white/65 hover:text-gold transition-colors"
              >
                <span className="font-mono text-[0.7rem] text-white/30 pt-0.5">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <GuideContent />
    </div>
  );
}
