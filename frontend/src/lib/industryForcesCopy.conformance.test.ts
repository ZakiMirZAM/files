// Copy conformance: every static string of the industry forces layer must
// appear, word for word, in the owner-approved registry at the foot of
// industryForcesCopy.draft.md, and the registry must not name a string the
// module does not carry. The diff runs in both directions so neither file
// can drift.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  TILE_LABELS,
  NOT_APPLICABLE_FALLBACK,
  FINANCIAL_INDUSTRY_NOTE,
  HHI_REFERENCE,
  SHARE_STABILITY_REFERENCE,
  KEY_PLAYERS_NOTE,
  BARRIER_GRID_NOTE,
  LEADER_COGS_TITLE,
  LEADER_COGS_NOTE,
  LEADER_COGS_EMPTY,
  LEADER_COGS_COLUMNS,
  BARRIER_CELLS,
  SCALE_LABELS,
  SUMMARY_PROMPTS,
  BARRIER_PROMPTS,
  FORCES_SYNTHESIS,
  FACTORS_INTRO,
  FIVE_FORCES_TITLE,
  BARRIER_GRID_TITLE,
  KEY_PLAYERS_TITLE,
  FORCE_TITLES,
  FORCES_SYNTHESIS_TITLE,
  DIAGRAM_CENTER,
  DIAGRAM_LABELS,
  SUPPLIER_PICK_ID,
  BUYER_PICK_ID,
  SECTION_STATUS,
  buildEntryQuestions,
  buildRivalryQuestions,
  buildSubstitutesQuestions,
  buildBuyersQuestions,
  buildSuppliersQuestions,
} from "./industryForcesCopy";

import { EM_DASH } from "./copyHygiene.test-helper";

const HERE = dirname(fileURLToPath(import.meta.url));
const DRAFT = join(HERE, "industryForcesCopy.draft.md");

// ---------------------------------------------------------------------------
// Build a flat registry of every static string in the module.
// Templated functions (notApplicableSentence, netEntryWindowSentence, etc.)
// are excluded: the rendering tests check those at runtime. Only strings
// that are the same for every invocation belong here.
// ---------------------------------------------------------------------------

function buildModuleRegistry(): Record<string, string> {
  const r: Record<string, string> = {};

  // Tile labels
  for (const [k, v] of Object.entries(TILE_LABELS)) {
    r[`tile.${k}`] = v;
  }

  // Standalone constants
  r["NOT_APPLICABLE_FALLBACK"] = NOT_APPLICABLE_FALLBACK;
  r["FINANCIAL_INDUSTRY_NOTE"] = FINANCIAL_INDUSTRY_NOTE;
  r["HHI_REFERENCE"] = HHI_REFERENCE;
  r["SHARE_STABILITY_REFERENCE"] = SHARE_STABILITY_REFERENCE;
  r["KEY_PLAYERS_NOTE"] = KEY_PLAYERS_NOTE;
  r["BARRIER_GRID_NOTE"] = BARRIER_GRID_NOTE;
  r["LEADER_COGS_TITLE"] = LEADER_COGS_TITLE;
  r["LEADER_COGS_NOTE"] = LEADER_COGS_NOTE;
  r["LEADER_COGS_EMPTY"] = LEADER_COGS_EMPTY;
  r["FACTORS_INTRO"] = FACTORS_INTRO;
  r["FIVE_FORCES_TITLE"] = FIVE_FORCES_TITLE;
  r["BARRIER_GRID_TITLE"] = BARRIER_GRID_TITLE;
  r["KEY_PLAYERS_TITLE"] = KEY_PLAYERS_TITLE;
  r["FORCES_SYNTHESIS_TITLE"] = FORCES_SYNTHESIS_TITLE;
  r["DIAGRAM_CENTER"] = DIAGRAM_CENTER;
  r["SUPPLIER_PICK_ID"] = SUPPLIER_PICK_ID;
  r["BUYER_PICK_ID"] = BUYER_PICK_ID;

  // Object constants
  for (const [k, v] of Object.entries(LEADER_COGS_COLUMNS)) {
    r[`leaderCogsCol.${k}`] = v;
  }
  for (const [k, v] of Object.entries(BARRIER_CELLS)) {
    r[`barrierCell.${k}`] = v;
  }
  for (const [k, v] of Object.entries(SCALE_LABELS)) {
    r[`scale.${k}`] = v;
  }
  for (const [k, v] of Object.entries(SUMMARY_PROMPTS)) {
    r[`summary.${k}`] = v;
  }
  for (const [k, v] of Object.entries(BARRIER_PROMPTS)) {
    r[`barrier.${k}`] = v;
  }
  for (const [k, v] of Object.entries(FORCE_TITLES)) {
    r[`forceTitle.${k}`] = v;
  }
  for (const [k, v] of Object.entries(DIAGRAM_LABELS)) {
    r[`diagram.${k}`] = v;
  }
  for (const [k, v] of Object.entries(SECTION_STATUS)) {
    r[`status.${k}`] = v;
  }

  // FORCES_SYNTHESIS is a RuntimeQuestion with static text
  r["FORCES_SYNTHESIS.id"] = FORCES_SYNTHESIS.id;
  r["FORCES_SYNTHESIS.text"] = FORCES_SYNTHESIS.text;

  // Question builders that take no parameters (static text)
  for (const q of buildEntryQuestions()) {
    r[`q.${q.id}`] = q.text;
  }
  for (const q of buildRivalryQuestions()) {
    r[`q.${q.id}`] = q.text;
  }
  for (const q of buildSubstitutesQuestions()) {
    r[`q.${q.id}`] = q.text;
  }
  for (const q of buildBuyersQuestions()) {
    r[`q.${q.id}`] = q.text;
  }
  for (const q of buildSuppliersQuestions()) {
    r[`q.${q.id}`] = q.text;
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

describe("industryForcesCopy conformance with the approved draft", () => {
  const registry = buildModuleRegistry();
  const draft = readDraftRegistry();

  it("the module registry has a reasonable number of entries", () => {
    expect(Object.keys(registry).length).toBeGreaterThan(70);
  });

  it("the draft registry parsed", () => {
    expect(Object.keys(draft).length).toBeGreaterThan(70);
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
