// Per-section "Principles" guides, taught in the voice of the investing books in
// the user's vault (Security Analysis, Investment Valuation, Mankiw, Fridson,
// Best-Practice EVA, Global Investing, and others). The verbatim markdown is
// bundled straight from src/content/principles/*.md via Vite's `?raw` import, so
// nothing is retyped. One file per analysis altitude:
//   workspace.md     foundations + the top-down framework (shown on the dashboard)
//   economic.md      reading the economy
//   industry.md      judging an industry (industry surface)
//   sector.md        judging a sector (sector surface — broader than an industry)
//   comparative.md   comparing companies head to head (comparative surface)
//   individual.md    analyzing a single company

const RAW = import.meta.glob("../content/principles/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export type PrinciplesTopic =
  | "workspace"
  | "economic"
  | "credit"
  | "industry"
  | "sector"
  | "comparative"
  | "individual";

/** topic key (the filename stem) -> verbatim markdown. */
const BY_TOPIC: Record<string, string> = {};
for (const [path, content] of Object.entries(RAW)) {
  const m = /\/([a-z]+)\.md$/.exec(path);
  if (m) BY_TOPIC[m[1]] = content;
}

export function getPrinciples(topic: PrinciplesTopic): string | undefined {
  return BY_TOPIC[topic];
}
