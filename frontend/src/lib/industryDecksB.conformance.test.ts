// Copy conformance: every static string of the industry decks layer must
// appear, word for word, in the owner-approved registry at the foot of
// industryDecksB.draft.md, and the registry must not name a string the
// module does not carry. The diff runs in both directions so neither file
// can drift.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  GROUP_MAP_DECK_TITLE,
  SHARE_RETURN_DECK_TITLE,
  VALUE_SYSTEM_DECK_TITLE,
  EVOLUTION_DECK_TITLE,
  FRAGMENTED_DECK_TITLE,
  EMERGING_DECK_TITLE,
  MATURITY_DECK_TITLE,
  DECLINE_DECK_TITLE,
  GLOBAL_DECK_TITLE,
  PROFIT_POOL_DECK_TITLE,
  STRATEGIC_GROUPS_DECK_TITLE,
  GROUP_MAP_COPY,
  SHARE_RETURN_COPY,
  VALUE_SYSTEM_COPY,
  EVOLUTION_COPY,
  PROFIT_POOL_COPY,
  ENVIRONMENT_SECTION,
} from "./industryDecksB";

import { EM_DASH } from "./copyHygiene.test-helper";

const HERE = dirname(fileURLToPath(import.meta.url));
const DRAFT = join(HERE, "industryDecksB.draft.md");

// ---------------------------------------------------------------------------
// Build a flat registry of every static string in the module.
// Templated builder functions (buildGroupMapDeck, buildShareReturnDeck, etc.)
// are excluded: the rendering tests check those at runtime. Only strings
// that are the same for every invocation belong here.
// ---------------------------------------------------------------------------

function buildModuleRegistry(): Record<string, string> {
  const r: Record<string, string> = {};

  // Deck title constants
  r["GROUP_MAP_DECK_TITLE"] = GROUP_MAP_DECK_TITLE;
  r["SHARE_RETURN_DECK_TITLE"] = SHARE_RETURN_DECK_TITLE;
  r["VALUE_SYSTEM_DECK_TITLE"] = VALUE_SYSTEM_DECK_TITLE;
  r["EVOLUTION_DECK_TITLE"] = EVOLUTION_DECK_TITLE;
  r["FRAGMENTED_DECK_TITLE"] = FRAGMENTED_DECK_TITLE;
  r["EMERGING_DECK_TITLE"] = EMERGING_DECK_TITLE;
  r["MATURITY_DECK_TITLE"] = MATURITY_DECK_TITLE;
  r["DECLINE_DECK_TITLE"] = DECLINE_DECK_TITLE;
  r["GLOBAL_DECK_TITLE"] = GLOBAL_DECK_TITLE;
  r["PROFIT_POOL_DECK_TITLE"] = PROFIT_POOL_DECK_TITLE;
  r["STRATEGIC_GROUPS_DECK_TITLE"] = STRATEGIC_GROUPS_DECK_TITLE;

  // GROUP_MAP_COPY
  for (const [k, v] of Object.entries(GROUP_MAP_COPY)) {
    r[`groupMap.${k}`] = v;
  }

  // SHARE_RETURN_COPY
  for (const [k, v] of Object.entries(SHARE_RETURN_COPY)) {
    r[`shareReturn.${k}`] = v;
  }

  // VALUE_SYSTEM_COPY (nested: top-level scalars + rows sub-object)
  r["valueSystem.title"] = VALUE_SYSTEM_COPY.title;
  r["valueSystem.supplierPicker"] = VALUE_SYSTEM_COPY.supplierPicker;
  r["valueSystem.buyerPicker"] = VALUE_SYSTEM_COPY.buyerPicker;
  r["valueSystem.placeholder"] = VALUE_SYSTEM_COPY.placeholder;
  r["valueSystem.focalTag"] = VALUE_SYSTEM_COPY.focalTag;
  for (const [k, v] of Object.entries(VALUE_SYSTEM_COPY.rows)) {
    r[`valueSystem.rows.${k}`] = v;
  }

  // EVOLUTION_COPY (nested: top-level scalars + cards sub-object)
  r["evolution.title"] = EVOLUTION_COPY.title;
  r["evolution.lifeCycleNote"] = EVOLUTION_COPY.lifeCycleNote;
  r["evolution.countCaveat"] = EVOLUTION_COPY.countCaveat;
  for (const [k, v] of Object.entries(EVOLUTION_COPY.cards)) {
    r[`evolution.cards.${k}`] = v;
  }

  // PROFIT_POOL_COPY
  for (const [k, v] of Object.entries(PROFIT_POOL_COPY)) {
    r[`profitPool.${k}`] = v;
  }

  // ENVIRONMENT_SECTION
  for (const [k, v] of Object.entries(ENVIRONMENT_SECTION)) {
    r[`envSection.${k}`] = v;
  }

  return r;
}

// ---------------------------------------------------------------------------
// Parse the draft
// ---------------------------------------------------------------------------

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
    const firstBar = line.indexOf("|", 1);
    const key = line.slice(1, firstBar).trim().replace(/^`|`$/g, "");
    const rest = line.slice(firstBar + 1);
    const lastBar = rest.lastIndexOf("|");
    const value = rest.slice(0, lastBar).trim().replace(/\\\|/g, "|");
    out[key] = value;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("industryDecksB conformance with the approved draft", () => {
  const registry = buildModuleRegistry();
  const draft = readDraftRegistry();

  it("the module registry has a reasonable number of entries", () => {
    expect(Object.keys(registry).length).toBeGreaterThan(40);
  });

  it("the draft registry parsed", () => {
    expect(Object.keys(draft).length).toBeGreaterThan(40);
  });

  it("every module string is approved in the draft, word for word", () => {
    const missing: string[] = [];
    const different: string[] = [];
    for (const [key, value] of Object.entries(registry)) {
      if (!(key in draft)) {
        missing.push(key);
      } else if (draft[key] !== value) {
        different.push(`${key}\n  module: ${value.slice(0, 120)}\n  draft:  ${draft[key].slice(0, 120)}`);
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

  it("no approved string carries an em dash or a curly quote", () => {
    for (const [key, value] of Object.entries(draft)) {
      expect(value, key).not.toContain(EM_DASH);
      expect(value, key).not.toMatch(/[“”‘’]/);
    }
  });
});
