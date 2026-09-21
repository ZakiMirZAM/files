// Which cross-stage block a question belongs to, read off the page in view.
//
// Every "Explain using AI" button on a data page sends the page's own figures
// first and the cross-stage block after. Rather than threading a gatherer
// through every component that renders a question, QuestionField derives one
// from the page context each page already publishes (lib/aiContextStore.ts).
// This module is the pure part of that: section to stage, and page context to
// the subject that stage is about.

import type { PageAiContext } from "./aiContextStore";
import { loadStageContext } from "./stageContextLoader";
import type { ReaderContribution, StageKind, StageSubject } from "./stageContextLoader";
import type { SectionKey } from "./types";

/** The stage each page's questions gather. The economic page is the first
 *  stage, so it has nothing earlier to gather, and the final review reads the
 *  reader's own saved answers rather than a stage's figures. */
export const STAGE_FOR_SECTION: Partial<Record<SectionKey, StageKind>> = {
  credit: "credit",
  sector: "sector",
  industry: "industry",
  comparative: "comparative",
  individual: "company",
};

export function stageForSection(section: SectionKey | undefined): StageKind | null {
  return (section && STAGE_FOR_SECTION[section]) ?? null;
}

/**
 * The subject of that stage, taken from the page context. The credit stage is
 * about the whole economy and needs no name. Every other stage takes the name
 * from `subjectKey`, which each page already publishes as the scorecard's own
 * column name: the sector on a sector page, the industry on an industry or
 * comparative page, the ticker on a company page. No extra fields are needed
 * on the page context, because that one already carries exactly the name the
 * stage is about.
 *
 * Returns null when the name is missing, so the question asks without the
 * block rather than asking about nothing.
 */
export function stageSubjectFor(stage: StageKind, ctx: PageAiContext): StageSubject | null {
  if (stage === "credit") return {};
  const name = (ctx.subjectKey ?? "").trim();
  if (!name) return null;
  if (stage === "sector") return { sector: name };
  if (stage === "company") return { ticker: name };
  return { industry: name };
}

/** The stage and subject one page context resolves to, or null when that page
 *  carries no earlier stage to gather. */
export function stageContextRequest(
  ctx: PageAiContext,
): { stage: StageKind; subject: StageSubject } | null {
  const stage = stageForSection(ctx.section);
  if (!stage) return null;
  const subject = stageSubjectFor(stage, ctx);
  return subject ? { stage, subject } : null;
}

/**
 * The gatherer for one page context, or undefined when that page carries no
 * earlier stage to gather.
 *
 * A question field calls this at CLICK time rather than at render time, so a
 * field that mounted before its page published its subject still gathers the
 * block the reader is looking at. Nothing is fetched until the returned
 * function is called. `load` is the door to the lazy half and is only ever
 * replaced by the test.
 */
export function pageGatherFor(
  ctx: PageAiContext,
  reader: ReaderContribution,
  load: typeof loadStageContext = loadStageContext,
): ((signal: AbortSignal) => Promise<string>) | undefined {
  const request = stageContextRequest(ctx);
  if (!request) return undefined;
  return (signal) => load(request.stage, request.subject, reader, signal);
}
