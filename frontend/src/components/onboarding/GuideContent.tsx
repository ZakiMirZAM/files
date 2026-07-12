// Shared body of the "How it works" guide. Each section is wrapped in a
// <section id> so help badges can deep-link to it (for example
// /app/guide#tool-ai). Used by both the in-app GuidePage and the public guide,
// so the explainer has a single source of truth.

import { Markdown } from "../Markdown";
import { GUIDE_SECTIONS } from "../../lib/guideContent";

export function GuideContent() {
  return (
    <div className="space-y-12">
      {GUIDE_SECTIONS.map((section) => (
        <section key={section.id} id={section.id} className="scroll-mt-24">
          <Markdown content={section.body} />
        </section>
      ))}
    </div>
  );
}
