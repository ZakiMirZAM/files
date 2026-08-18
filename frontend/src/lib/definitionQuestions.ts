// Splits a sector/industry surface definition into its body (Parts 1-8) and the
// "Part 9: Precise qualitative questions" list, so the sidebar can render the
// questions as answerable fields instead of inert markdown. Mirrors the economic
// surface's splitDefinition (lib/economicDefinitions.ts), whose heading regex
// matches "Ten Precise Qualitative Questions" and stays untouched.
//
// The audit of content/sector/4*.md and content/industry/3*.md found exactly one
// heading spelling across all files. If a future file drifts, widen this regex,
// never the files.

const SURFACE_QUESTIONS_HEADING = /\n#{2,3}\s+Part\s*9:\s*Precise\s+qualitative\s+questions\s*\n/i;

export interface SplitSurfaceDefinition {
  /** Parts 1-8, rendered as the sidebar's markdown body. */
  body: string;
  /** The Part 9 questions, one string each. Empty when the heading is absent. */
  questions: string[];
}

export function splitSurfaceDefinition(markdown: string): SplitSurfaceDefinition {
  const m = SURFACE_QUESTIONS_HEADING.exec(markdown);
  if (!m) return { body: markdown, questions: [] };
  const body = `${markdown.slice(0, m.index).trimEnd()}\n`;
  const questions = markdown
    .slice(m.index + m[0].length)
    .split(/\n(?=\s*\d+\.\s)/)
    .map((p) => p.trim().replace(/^\d+\.\s*/, "").replace(/\s+/g, " ").trim())
    .filter((q) => q.length > 0);
  return { body, questions };
}
