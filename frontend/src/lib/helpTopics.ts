// Help-badge copy. Each topic pairs a typed title and a Guide anchor (kept in
// sync with guideContent's id union) with a short markdown body bundled from
// src/content/help/<key>.md via Vite's ?raw import. getHelpTopic joins the two.

import type { GuideSectionId } from "./guideContent";

const RAW = import.meta.glob("../content/help/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export type HelpTopicKey =
  | "workflow"
  | "aiExplain"
  | "definitions"
  | "notebook"
  | "apiStatus"
  | "rotationWeights"
  | "tickerSearch"
  | "finalReport"
  | "refreshData"
  | "principles";

interface HelpMeta {
  title: string;
  /** Section in the Guide that "Learn more" deep-links to. */
  anchor: GuideSectionId;
}

const META: Record<HelpTopicKey, HelpMeta> = {
  workflow: { title: "The analysis menu", anchor: "the-order" },
  aiExplain: { title: "Explain using AI", anchor: "tool-ai" },
  definitions: { title: "The Definitions panel", anchor: "tool-definitions" },
  notebook: { title: "The Notebook", anchor: "tool-notebook" },
  apiStatus: { title: "Live data and sample data", anchor: "data-status" },
  rotationWeights: { title: "Sector Rotation weights", anchor: "the-order" },
  tickerSearch: { title: "Company search", anchor: "stage-individual" },
  finalReport: { title: "The Final Report", anchor: "final-report" },
  refreshData: { title: "Refresh data", anchor: "data-status" },
  principles: { title: "The reading framework", anchor: "start-here" },
};

const BY_KEY: Record<string, string> = {};
for (const [path, content] of Object.entries(RAW)) {
  const m = /\/([a-zA-Z]+)\.md$/.exec(path);
  if (m) BY_KEY[m[1]] = content;
}

export interface HelpTopic {
  key: HelpTopicKey;
  title: string;
  anchor: GuideSectionId;
  body: string;
}

export function getHelpTopic(key: HelpTopicKey): HelpTopic | undefined {
  const meta = META[key];
  const body = BY_KEY[key];
  if (!meta || !body) return undefined;
  return { key, title: meta.title, anchor: meta.anchor, body };
}
