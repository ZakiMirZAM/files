// The raw economic and credit definition markdown, one list, numbered.
//
// Same bundling convention as economicDefinitions.ts and creditDefinitions.ts:
// Vite's eager raw glob, keyed off the leading number in the file name. It is
// kept separate from those two modules because only the generator and the sync
// test read whole files; the app reads the generated dataset instead.

import type { DefinitionSurface } from "./definitionTables";

const ECONOMIC_RAW = import.meta.glob("../content/economic/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const CREDIT_RAW = import.meta.glob("../content/credit/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export interface DefinitionSource {
  surface: DefinitionSurface;
  /** The file's leading number. */
  number: number;
  /** File name only, for example "06-Yield-Curve.md". */
  file: string;
  /** Surface plus file name, the form used in problem messages. */
  path: string;
  markdown: string;
}

function collect(raw: Record<string, string>, surface: DefinitionSurface): DefinitionSource[] {
  const out: DefinitionSource[] = [];
  for (const [path, markdown] of Object.entries(raw)) {
    const m = /\/(\d+)-([^/]+\.md)$/.exec(path);
    if (!m) continue;
    const number = parseInt(m[1], 10);
    // 00-INDEX.md is the table of contents, not a metric.
    if (number === 0) continue;
    out.push({
      surface,
      number,
      file: `${m[1]}-${m[2]}`,
      path: `${surface}/${m[1]}-${m[2]}`,
      markdown,
    });
  }
  return out.sort((a, b) => a.number - b.number);
}

/** Every economic then every credit definition, each in file-number order. */
export function definitionSources(): DefinitionSource[] {
  return [...collect(ECONOMIC_RAW, "economic"), ...collect(CREDIT_RAW, "credit")];
}
