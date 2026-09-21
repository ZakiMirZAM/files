// Copy conformance: every static string of the connection layer must appear,
// word for word, in the owner-approved registry at the foot of
// connectionsCopy.draft.md, and the registry must not name a string the module
// does not carry. The diff runs in both directions so neither file can drift.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { COPY_REGISTRY } from "./connectionsCopy";

const HERE = dirname(fileURLToPath(import.meta.url));
const DRAFT = join(HERE, "connectionsCopy.draft.md");

const EM_DASH = String.fromCharCode(0x2014);

/** Parse the "Approved copy registry (machine-checked)" table. */
function readDraftRegistry(): Record<string, string> {
  const text = readFileSync(DRAFT, "utf8");
  const marker = "## Approved copy registry (machine-checked)";
  const start = text.indexOf(marker);
  if (start < 0) throw new Error(`${DRAFT} has no approved copy registry section`);
  const section = text.slice(start);
  const out: Record<string, string> = {};
  for (const raw of section.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("| `")) continue;
    // | `key` | text |
    const firstBar = line.indexOf("|", 1);
    const key = line.slice(1, firstBar).trim().replace(/^`|`$/g, "");
    const rest = line.slice(firstBar + 1);
    const lastBar = rest.lastIndexOf("|");
    const value = rest.slice(0, lastBar).trim().replace(/\\\|/g, "|");
    out[key] = value;
  }
  return out;
}

describe("connectionsCopy conformance with the approved draft", () => {
  const draft = readDraftRegistry();

  it("the draft registry parsed", () => {
    expect(Object.keys(draft).length).toBeGreaterThan(25);
  });

  it("every module string is approved in the draft, word for word", () => {
    const missing: string[] = [];
    const different: string[] = [];
    for (const [key, value] of Object.entries(COPY_REGISTRY)) {
      if (!(key in draft)) {
        missing.push(key);
      } else if (draft[key] !== value) {
        different.push(`${key}\n  module: ${value}\n  draft:  ${draft[key]}`);
      }
    }
    expect(
      { missing, different },
      "add the string to the draft's approved registry, or fix the wording",
    ).toEqual({ missing: [], different: [] });
  });

  it("every approved draft string is still used by the module", () => {
    const orphaned = Object.keys(draft).filter((k) => !(k in COPY_REGISTRY));
    expect(orphaned, "remove the stale draft rows").toEqual([]);
  });

  it("no approved string carries an em dash or a curly quote", () => {
    for (const [key, value] of Object.entries(draft)) {
      expect(value, key).not.toContain(EM_DASH);
      expect(value, key).not.toMatch(/[“”‘’]/);
    }
  });

  it("every string added during the build is recorded with a reason", () => {
    const text = readFileSync(DRAFT, "utf8");
    const start = text.indexOf("## Added during build (needs owner review)");
    const end = text.indexOf("## Approved copy registry (machine-checked)");
    expect(start).toBeGreaterThan(0);
    const added = text.slice(start, end);
    // Each of the keys the build introduced must appear in that section.
    for (const key of [
      "panel.eyebrow",
      "unavailable.figure",
      "goal.report",
      "synthesis.loading",
      "report.picker.notFound",
    ]) {
      expect(added, key).toContain(key);
    }
  });
});
