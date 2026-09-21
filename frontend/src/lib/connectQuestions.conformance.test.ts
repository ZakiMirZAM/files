// Copy conformance for the connect decks, in two halves.
//
// 1. The 25 questions and their hidden prompts are the writer's, and they are
//    written in docs/connect-questions.final.md. That document used to reach
//    lib/connectQuestions.ts through a one-off hand transfer, so the two could
//    drift in silence. They are now diffed against each other, word for word
//    and in both directions, on every test run.
//
// 2. Everything else the module carries as a static string (the five deck
//    titles and the AI panel's three sentences) is diffed against the approved
//    registry at the foot of connectQuestions.draft.md, in both directions.
//
// Rewrite the module's question and prompt literals from the document:
//   bash        WRITE_CONNECT_QUESTIONS=1 npx vitest run src/lib/connectQuestions.conformance
//   PowerShell  $env:WRITE_CONNECT_QUESTIONS="1"; npx vitest run src/lib/connectQuestions.conformance
//
// The ids are never rewritten. A reader's saved answer is keyed by the id, so
// a reworded question keeps the answer typed under it.

import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { CONNECT_COPY_REGISTRY, CONNECT_QUESTIONS } from "./connectQuestions";
import { EM_DASH } from "./copyHygiene.test-helper";

const HERE = dirname(fileURLToPath(import.meta.url));
const DRAFT = join(HERE, "connectQuestions.draft.md");
const MODULE = join(HERE, "connectQuestions.ts");
/** The writer's document, at the repository root rather than under frontend/. */
const FINAL = join(HERE, "..", "..", "..", "docs", "connect-questions.final.md");

const WRITE = process.env.WRITE_CONNECT_QUESTIONS === "1";

const REWRITE =
  "the module and docs/connect-questions.final.md disagree. Rewrite the module " +
  "from the document with WRITE_CONNECT_QUESTIONS=1 npx vitest run " +
  'src/lib/connectQuestions.conformance (PowerShell: $env:WRITE_CONNECT_QUESTIONS="1"; ' +
  "npx vitest run src/lib/connectQuestions.conformance), or fix the document";

interface DocQuestion {
  text: string;
  guidance: string;
}

/** A question heading, as the document writes one. The changelog sections at
 *  the foot are dated headings at the same level, so the id shape is matched
 *  rather than the heading level alone. */
const ID_HEADING = /^###\s+([a-z]+\.connect\.[a-z_]+)\s*$/;

const FIELDS: [string, keyof DocQuestion][] = [
  ["**Question:**", "text"],
  ["**Hidden prompt:**", "guidance"],
];

/**
 * The document's 25 questions, by id.
 *
 * Both fields are written as one quoted line, so the value is everything
 * between the first and the last double quote. A value carrying a double quote
 * of its own would end the line early, which is why the test below refuses one.
 */
function readFinalDoc(): Map<string, DocQuestion> {
  const out = new Map<string, DocQuestion>();
  let id: string | null = null;
  for (const raw of readFileSync(FINAL, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    const heading = ID_HEADING.exec(line);
    if (heading) {
      id = heading[1];
      out.set(id, { text: "", guidance: "" });
      continue;
    }
    // Any other heading ends the question that was being read.
    if (line.startsWith("#")) {
      id = null;
      continue;
    }
    if (id == null) continue;
    for (const [label, key] of FIELDS) {
      if (!line.startsWith(label)) continue;
      const rest = line.slice(label.length).trim();
      if (!rest.startsWith('"') || !rest.endsWith('"') || rest.length < 2) {
        throw new Error(`${id} ${key}: expected one quoted line, found ${rest.slice(0, 40)}`);
      }
      (out.get(id) as DocQuestion)[key] = rest.slice(1, -1);
    }
  }
  return out;
}

/** Every id the module carries, stage by stage, in the module's own order. */
function moduleQuestions(): Map<string, DocQuestion> {
  const out = new Map<string, DocQuestion>();
  for (const list of Object.values(CONNECT_QUESTIONS)) {
    for (const item of list) out.set(item.id, { text: item.text, guidance: item.guidance });
  }
  return out;
}

/** Replace one string literal of one question in the module's source. */
function replaceLiteral(src: string, id: string, field: string, value: string): string {
  const at = src.indexOf(`id: "${id}",`);
  if (at < 0) throw new Error(`${id} is not in the module`);
  // Bound the search by the next question, so a missing field cannot reach
  // into the one below it.
  const next = src.indexOf('      id: "', at + 1);
  const end = next < 0 ? src.length : next;
  const fieldAt = src.indexOf(`${field}:`, at);
  if (fieldAt < 0 || fieldAt > end) throw new Error(`${id} has no ${field}`);
  const open = src.indexOf('"', fieldAt);
  const close = src.indexOf('"', open + 1);
  if (open < 0 || close < 0 || close > end) throw new Error(`${id} ${field} is not one literal`);
  return src.slice(0, open + 1) + value + src.slice(close);
}

/** The module's source with every question and prompt taken from the doc. */
function rewritten(doc: Map<string, DocQuestion>): string {
  let src = readFileSync(MODULE, "utf8");
  for (const [id, entry] of doc) {
    src = replaceLiteral(src, id, "text", entry.text);
    src = replaceLiteral(src, id, "guidance", entry.guidance);
  }
  return src;
}

/** Parse the "Approved copy registry (machine-checked)" table. */
function readDraftRegistry(): Record<string, string> {
  const text = readFileSync(DRAFT, "utf8");
  const marker = "## Approved copy registry (machine-checked)";
  const start = text.indexOf(marker);
  if (start < 0) throw new Error(`${DRAFT} has no approved copy registry section`);
  const out: Record<string, string> = {};
  for (const raw of text.slice(start).split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("| `")) continue;
    const firstBar = line.indexOf("|", 1);
    const key = line.slice(1, firstBar).trim().replace(/^`|`$/g, "");
    const rest = line.slice(firstBar + 1);
    const lastBar = rest.lastIndexOf("|");
    out[key] = rest.slice(0, lastBar).trim().replace(/\\\|/g, "|");
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. The module against the writer's document
// ---------------------------------------------------------------------------

describe("the connect questions match the writer's document", () => {
  const doc = readFinalDoc();
  const module = moduleQuestions();

  it.skipIf(!WRITE)("rewrites the module's literals from the document", () => {
    const fresh = rewritten(doc);
    writeFileSync(MODULE, fresh, "utf8");
    expect(readFileSync(MODULE, "utf8")).toBe(fresh);
  });

  it("the document parsed", () => {
    expect(doc.size).toBe(25);
    for (const [id, entry] of doc) {
      expect(entry.text.length, `${id} question`).toBeGreaterThan(0);
      expect(entry.guidance.length, `${id} hidden prompt`).toBeGreaterThan(0);
    }
  });

  it.skipIf(WRITE)("carries every question the document writes, word for word", () => {
    const missing: string[] = [];
    const different: string[] = [];
    for (const [id, entry] of doc) {
      const mine = module.get(id);
      if (!mine) {
        missing.push(id);
        continue;
      }
      if (mine.text !== entry.text) different.push(`${id} question`);
      if (mine.guidance !== entry.guidance) different.push(`${id} hidden prompt`);
    }
    expect({ missing, different }, REWRITE).toEqual({ missing: [], different: [] });
  });

  it.skipIf(WRITE)("carries no question the document does not write", () => {
    const orphaned = [...module.keys()].filter((id) => !doc.has(id));
    expect(orphaned, "write the question in the document, or drop it here").toEqual([]);
  });

  it("no question or prompt carries a double quote, an em dash or a curly quote", () => {
    for (const [id, entry] of doc) {
      for (const [field, value] of Object.entries(entry)) {
        // A double quote would end the document's own quoted line early, so
        // neither the parse above nor the rewrite could be trusted with one.
        expect(value, `${id} ${field}`).not.toContain('"');
        expect(value, `${id} ${field}`).not.toContain(EM_DASH);
        expect(value, `${id} ${field}`).not.toMatch(/[“”‘’]/);
      }
    }
  });

  it("rewriting from the document changes nothing while the two agree", () => {
    expect(rewritten(doc), REWRITE).toBe(readFileSync(MODULE, "utf8"));
  });
});

// ---------------------------------------------------------------------------
// 2. Everything else, against the approved draft registry
// ---------------------------------------------------------------------------

describe("connectQuestions conformance with the approved draft", () => {
  const draft = readDraftRegistry();

  it("the draft registry parsed", () => {
    // The five deck titles and the panel's three sentences.
    expect(Object.keys(draft).length).toBe(8);
  });

  it("every module string is approved in the draft, word for word", () => {
    const missing: string[] = [];
    const different: string[] = [];
    for (const [key, value] of Object.entries(CONNECT_COPY_REGISTRY)) {
      if (!(key in draft)) missing.push(key);
      else if (draft[key] !== value) {
        different.push(`${key}\n  module: ${value.slice(0, 120)}\n  draft:  ${draft[key].slice(0, 120)}`);
      }
    }
    expect(
      { missing, different },
      "add the string to the draft's approved registry, or fix the wording",
    ).toEqual({ missing: [], different: [] });
  });

  it("every approved draft string is still used by the module", () => {
    const orphaned = Object.keys(draft).filter((k) => !(k in CONNECT_COPY_REGISTRY));
    expect(orphaned, "remove the stale draft rows").toEqual([]);
  });

  it("no approved string carries an em dash or a curly quote", () => {
    for (const [key, value] of Object.entries(draft)) {
      expect(value, key).not.toContain(EM_DASH);
      expect(value, key).not.toMatch(/[“”‘’]/);
    }
  });
});
