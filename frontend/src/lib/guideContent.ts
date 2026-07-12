// Loads the plain-language "How it works" guide. The verbatim markdown is
// bundled from src/content/guide/NN-slug.md via Vite's ?raw import (same pattern
// as principlesContent.ts). The slug after the number is the section id, which
// doubles as the anchor that help badges deep-link to (for example
// /app/guide#tool-ai). ORDER fixes the display order and the table-of-contents
// titles; the id union is exported so anchors stay type-checked.

const RAW = import.meta.glob("../content/guide/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const ORDER = [
  { id: "start-here", title: "Start here" },
  { id: "what-it-does", title: "What this app does" },
  { id: "the-order", title: "The order of the stages" },
  { id: "stage-economic", title: "Stage 1: the economy" },
  { id: "stage-sector", title: "Stage 2: the sector" },
  { id: "stage-industry", title: "Stage 3: the industry" },
  { id: "stage-comparative", title: "Stage 4: compare companies" },
  { id: "stage-individual", title: "Stage 5: one company" },
  { id: "final-report", title: "Stage 6: the Final Report" },
  { id: "tool-ai", title: "The Explain using AI button" },
  { id: "tool-definitions", title: "The Definitions panel" },
  { id: "tool-notebook", title: "The Notebook" },
  { id: "data-status", title: "Live data and sample data" },
  { id: "glossary", title: "A short glossary" },
  { id: "not-advice", title: "Education, not advice" },
] as const;

export type GuideSectionId = (typeof ORDER)[number]["id"];

export interface GuideSection {
  id: GuideSectionId;
  title: string;
  body: string;
}

const BY_ID: Record<string, string> = {};
for (const [path, content] of Object.entries(RAW)) {
  const m = /\/\d+-(.+)\.md$/.exec(path);
  if (m) BY_ID[m[1]] = content;
}

export const GUIDE_SECTIONS: GuideSection[] = ORDER.filter((s) => BY_ID[s.id]).map((s) => ({
  id: s.id,
  title: s.title,
  body: BY_ID[s.id],
}));
