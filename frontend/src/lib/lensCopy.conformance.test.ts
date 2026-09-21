// Copy conformance: every string in lensCopy.ts must appear word for word in
// the registry at the foot of lensCopy.draft.md, and the registry must not
// name a key the module no longer carries. The diff runs both ways so neither
// file can drift while the wording is still a placeholder awaiting the writer.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { LENS_COPY, fillCopy } from "./lensCopy";
import { EM_DASH } from "./copyHygiene.test-helper";

const HERE = dirname(fileURLToPath(import.meta.url));
const DRAFT = join(HERE, "lensCopy.draft.md");

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

describe("lensCopy conformance with the approved draft", () => {
  const draft = readDraftRegistry();
  const registry: Record<string, string> = { ...LENS_COPY };

  it("the module carries every key the picker needs", () => {
    for (const key of [
      "picker.latest",
      "picker.trend",
      "picker.level",
      "picker.undecided",
      "picker.meaningToggle",
      "picker.orphan",
      "picker.noTable",
      "picker.rotationLine",
      "picker.rotationSet",
      "picker.rising",
      "picker.steady",
      "picker.falling",
    ]) {
      expect(registry[key], key).toBeTypeOf("string");
    }
  });

  it("the draft registry parsed", () => {
    expect(Object.keys(draft).length).toBeGreaterThan(20);
  });

  it("every module string is approved in the draft, word for word", () => {
    const missing: string[] = [];
    const different: string[] = [];
    for (const [key, value] of Object.entries(registry)) {
      if (!(key in draft)) missing.push(key);
      else if (draft[key] !== value) {
        different.push(`${key}\n  module: ${value}\n  draft:  ${draft[key]}`);
      }
    }
    expect(
      { missing, different },
      "add the string to the draft's approved registry, or fix the wording",
    ).toEqual({ missing: [], different: [] });
  });

  it("every approved draft string is still used by the module", () => {
    const orphaned = Object.keys(draft).filter((k) => !(k in registry));
    expect(orphaned, "remove the stale draft rows").toEqual([]);
  });

  it("no string carries an em dash or a curly quote", () => {
    for (const [key, value] of Object.entries(registry)) {
      expect(value.includes(EM_DASH), key).toBe(false);
      expect(value, key).not.toMatch(/[“”‘’]/);
    }
  });

  it("fillCopy replaces every placeholder it is given", () => {
    const filled = fillCopy("picker.rotationLine", {
      row: "10Y-3M Treasury Spread",
      direction: LENS_COPY["picker.rising"],
    });
    expect(filled).toBe("Sector Rotation matrix row: 10Y-3M Treasury Spread. Direction now: rising.");
    expect(filled).not.toContain("{");
  });

  it("leaves an unfilled placeholder visible rather than printing undefined", () => {
    const filled = fillCopy("picker.trendDetail", { change: "0.54 points" });
    expect(filled).toContain("{band}");
    expect(filled).not.toContain("undefined");
  });
});
