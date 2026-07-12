// Lesson library for the stock simulator. The bodies are humanized syntheses of
// principles pulled from the Obsidian finance vault (Bogle, Erickson's Global
// Investing, Damodaran/Penman, Nofsinger, and the value-investing canon), shipped
// as static markdown so the lessons always load offline. Titles and one-line
// summaries live here; the markdown files hold the body only (no top-level H1).
//
// Files: src/content/simulator/NN-slug.md, numbered for order. Mirrors the
// import.meta.glob pattern used by individualDefinitions.ts.

const BODIES = import.meta.glob("../content/simulator/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export interface Lesson {
  id: string; // stable key for progress storage, e.g. "01-why-index-funds"
  number: number;
  title: string;
  summary: string;
  body: string;
}

/** Display title + one-line summary per lesson number. */
const META: Record<number, { title: string; summary: string }> = {
  1: {
    title: "Why index funds win",
    summary: "Costs compound against you, and the average active fund must trail the index after fees.",
  },
  2: {
    title: "Diversification, allocation, and rebalancing",
    summary: "How much you hold in stocks versus bonds drives most of your long-run result, not which names you pick.",
  },
  3: {
    title: "Sector tilts and leveraged ETFs",
    summary: "Tilting toward stronger sectors can be sound. A 3x daily fund like TECL is a different animal.",
  },
  4: {
    title: "Global investing and conflict",
    summary: "Erickson's rules for sovereign risk, geopolitical escalation, and why construction beats forecasting.",
  },
  5: {
    title: "When to buy and when to sell",
    summary: "Buy with a margin of safety. Selling is where discipline, not emotion, has to take over.",
  },
};

/** All lessons, ordered by file number. */
export const LESSONS: Lesson[] = Object.entries(BODIES)
  .flatMap(([path, body]): Lesson[] => {
    const m = /\/(\d+)-([^/]+)\.md$/.exec(path);
    if (!m) return [];
    const number = parseInt(m[1], 10);
    const meta = META[number];
    if (!meta) return [];
    return [{ id: `${m[1]}-${m[2]}`, number, title: meta.title, summary: meta.summary, body }];
  })
  .sort((a, b) => a.number - b.number);

export function lessonById(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}
