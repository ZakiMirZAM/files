// Cross-layer copy hygiene: the em-dash and developer-shorthand sweep
// applied to EVERY builder across every copy layer (connect deck, industry
// forces, industry decks, reading picker) exercised over real fixtures.
//
// Each layer's own test file may also carry an inline sweep; this test
// is the single canonical gate that covers every layer uniformly with the
// shared helper from copyHygiene.test-helper.ts.

import { describe, expect, it } from "vitest";

// -- Shared helper ----------------------------------------------------------
import {
  stringsFromGroups,
  assertCopyHygiene,
} from "./copyHygiene.test-helper";

// -- Connect deck layer -----------------------------------------------------
import {
  CONNECT_AI,
  CONNECT_COPY_REGISTRY,
  buildConnectDeck,
  type ConnectStage,
} from "./connectQuestions";

// -- Industry forces layer --------------------------------------------------
import {
  buildEntryQuestions,
  buildRivalryQuestions,
  buildSubstitutesQuestions,
  buildBuyersQuestions,
  buildSuppliersQuestions,
  buildFactorsQuestions,
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
  SECTION_STATUS,
} from "./industryForcesCopy";

// -- Industry decks layer ---------------------------------------------------
import {
  buildGroupMapDeck,
  buildShareReturnDeck,
  buildValueSystemDeck,
  buildEvolutionDeck,
  buildEvolutionSentences,
  buildEnvironmentDecks,
  buildEnvironmentHeaderNotes,
  buildProfitPoolDeck,
  plottedSentence,
  correlationSentence,
  shareReturnFitSentence,
  GROUP_MAP_DECK_TITLE,
  SHARE_RETURN_DECK_TITLE,
  VALUE_SYSTEM_DECK_TITLE,
  EVOLUTION_DECK_TITLE,
  FRAGMENTED_DECK_TITLE,
  EMERGING_DECK_TITLE,
  MATURITY_DECK_TITLE,
  DECLINE_DECK_TITLE,
  GLOBAL_DECK_TITLE,
  GROUP_MAP_COPY,
  SHARE_RETURN_COPY,
  VALUE_SYSTEM_COPY,
  EVOLUTION_COPY,
  PROFIT_POOL_COPY,
} from "./industryDecksB";

import {
  GROUP_MAP_SEMICONDUCTORS,
} from "./__fixtures__/groupMapSemiconductors";
import {
  VALUE_SYSTEM_SEMICONDUCTORS,
  VALUE_SYSTEM_THIN_PARTNER,
  VALUE_SYSTEM_EMPTY,
} from "./__fixtures__/valueSystemSemiconductors";
import {
  EVOLUTION_SEMICONDUCTORS,
  ENVIRONMENT_SEMICONDUCTORS,
} from "./__fixtures__/structureEvolutionSemiconductors";
import {
  PROFIT_POOL_TECHNOLOGY,
  PROFIT_POOL_ENERGY,
  PROFIT_POOL_FINANCIALS,
} from "./__fixtures__/profitPoolTechnology";
import { BANKS_DIVERSIFIED } from "./__fixtures__/industryStructureFixtures";
import type { EnvironmentIndicators } from "./industryStructureApi";

// -- Reading picker layer ---------------------------------------------------
import { LENS_COPY, fillCopy } from "./lensCopy";

const ENV = ENVIRONMENT_SEMICONDUCTORS as EnvironmentIndicators;

// ---------------------------------------------------------------------------
// 1. Connect deck hygiene
// ---------------------------------------------------------------------------

describe("cross-layer hygiene: the connect deck", () => {
  const STAGES: ConnectStage[] = ["credit", "sector", "industry", "comparative", "company"];
  const NAMES = {
    sector: "Financial Services",
    industry: "Banks - Diversified",
    parentSector: "Financial Services",
    company: "JPMorgan Chase",
  };

  it("every static string is clean", () => {
    assertCopyHygiene(Object.values(CONNECT_COPY_REGISTRY), "connect-registry");
    assertCopyHygiene(Object.values(CONNECT_AI), "connect-ai");
  });

  it("every built deck reads cleanly once the names are filled in", () => {
    const all: string[] = [];
    for (const stage of STAGES) {
      const deck = buildConnectDeck(stage, NAMES);
      all.push(...stringsFromGroups(deck));
      for (const question of deck[0].questions) {
        if (question.guidance) all.push(question.guidance);
        expect(question.text, question.id).not.toContain("{");
      }
    }
    assertCopyHygiene(all, "connect-decks");
  });
});

// ---------------------------------------------------------------------------
// 2. Industry forces layer hygiene
// ---------------------------------------------------------------------------

describe("cross-layer hygiene: industry forces", () => {
  it("all static constants are clean", () => {
    const strings: string[] = [
      ...Object.values(TILE_LABELS),
      NOT_APPLICABLE_FALLBACK,
      FINANCIAL_INDUSTRY_NOTE,
      HHI_REFERENCE,
      SHARE_STABILITY_REFERENCE,
      KEY_PLAYERS_NOTE,
      BARRIER_GRID_NOTE,
      LEADER_COGS_TITLE,
      LEADER_COGS_NOTE,
      LEADER_COGS_EMPTY,
      ...Object.values(LEADER_COGS_COLUMNS),
      ...Object.values(BARRIER_CELLS),
      ...Object.values(SCALE_LABELS),
      ...Object.values(SUMMARY_PROMPTS),
      ...Object.values(BARRIER_PROMPTS),
      FORCES_SYNTHESIS.text,
      FACTORS_INTRO,
      FIVE_FORCES_TITLE,
      BARRIER_GRID_TITLE,
      KEY_PLAYERS_TITLE,
      ...Object.values(FORCE_TITLES),
      FORCES_SYNTHESIS_TITLE,
      DIAGRAM_CENTER,
      ...Object.values(DIAGRAM_LABELS),
      ...Object.values(SECTION_STATUS),
    ];
    assertCopyHygiene(strings, "forces-constants");
  });

  it("all question builders produce clean strings", () => {
    const strings: string[] = [];
    for (const q of buildEntryQuestions()) strings.push(q.text);
    for (const q of buildRivalryQuestions()) strings.push(q.text);
    for (const q of buildSubstitutesQuestions()) strings.push(q.text);
    for (const q of buildBuyersQuestions()) strings.push(q.text);
    for (const q of buildSuppliersQuestions()) strings.push(q.text);
    for (const q of buildFactorsQuestions("revenue grew 12 percent")) strings.push(q.text);
    assertCopyHygiene(strings, "forces-questions");
  });
});

// ---------------------------------------------------------------------------
// 3. Industry decks layer hygiene
// ---------------------------------------------------------------------------

describe("cross-layer hygiene: industry decks", () => {
  it("all deck builders produce clean strings", () => {
    const all: string[] = [];
    const push = (groups: ReturnType<typeof buildEvolutionDeck>) => {
      all.push(...stringsFromGroups(groups));
    };

    push(buildGroupMapDeck(GROUP_MAP_SEMICONDUCTORS.groups, "Semiconductors", "", 20, 512));
    push(
      buildShareReturnDeck(
        GROUP_MAP_SEMICONDUCTORS.shareReturn?.fit ?? null,
        GROUP_MAP_SEMICONDUCTORS.shareReturn?.topQuarterMedianPreTaxRoic,
        GROUP_MAP_SEMICONDUCTORS.shareReturn?.restMedianPreTaxRoic,
        "",
      ),
    );
    for (const vs of [VALUE_SYSTEM_SEMICONDUCTORS, VALUE_SYSTEM_THIN_PARTNER, VALUE_SYSTEM_EMPTY]) {
      push(buildValueSystemDeck(vs, vs.focal.industry, ""));
    }
    push(buildEvolutionDeck(EVOLUTION_SEMICONDUCTORS, "", ENV));
    push(buildEvolutionDeck(BANKS_DIVERSIFIED.evolution, "", BANKS_DIVERSIFIED.environmentIndicators));
    push(buildEnvironmentDecks(ENV, ""));
    push(buildEnvironmentDecks(BANKS_DIVERSIFIED.environmentIndicators, ""));
    for (const [name, pool] of [
      ["Technology", PROFIT_POOL_TECHNOLOGY],
      ["Energy", PROFIT_POOL_ENERGY],
      ["Financial Services", PROFIT_POOL_FINANCIALS],
    ] as const) {
      push(buildProfitPoolDeck(pool, name, ""));
    }

    // Standalone sentence helpers
    all.push(plottedSentence(20, 512), plottedSentence(1, 1), plottedSentence(0, 0));
    all.push(correlationSentence(0.25), correlationSentence(null));
    all.push(shareReturnFitSentence(GROUP_MAP_SEMICONDUCTORS.shareReturn?.fit ?? null));

    // Static copy objects
    all.push(...Object.values(GROUP_MAP_COPY));
    all.push(...Object.values(SHARE_RETURN_COPY));
    all.push(...Object.values(VALUE_SYSTEM_COPY.rows), VALUE_SYSTEM_COPY.title);
    all.push(
      ...Object.values(EVOLUTION_COPY.cards),
      EVOLUTION_COPY.lifeCycleNote,
      EVOLUTION_COPY.countCaveat,
    );
    all.push(...Object.values(PROFIT_POOL_COPY));
    all.push(
      GROUP_MAP_DECK_TITLE,
      SHARE_RETURN_DECK_TITLE,
      VALUE_SYSTEM_DECK_TITLE,
      EVOLUTION_DECK_TITLE,
      FRAGMENTED_DECK_TITLE,
      EMERGING_DECK_TITLE,
      MATURITY_DECK_TITLE,
      DECLINE_DECK_TITLE,
      GLOBAL_DECK_TITLE,
    );
    for (const s of buildEvolutionSentences(EVOLUTION_SEMICONDUCTORS, ENV)) all.push(s.text);
    for (const v of Object.values(buildEnvironmentHeaderNotes(ENV))) all.push(v);
    for (const v of Object.values(buildEnvironmentHeaderNotes(BANKS_DIVERSIFIED.environmentIndicators))) {
      all.push(v);
    }

    assertCopyHygiene(all, "industry-decks");
  });
});

// ---------------------------------------------------------------------------
// 4. Reading picker layer hygiene
// ---------------------------------------------------------------------------

describe("cross-layer hygiene: reading picker copy", () => {
  it("every static string is clean", () => {
    assertCopyHygiene(Object.values(LENS_COPY), "lens-copy");
  });

  it("every filled template is clean", () => {
    const filled = [
      fillCopy("picker.trendUnavailable", { reason: LENS_COPY["picker.skip.noSeries"] }),
      fillCopy("picker.trendUnavailable", { reason: LENS_COPY["picker.skip.tooFewPoints"] }),
      fillCopy("picker.trendUnavailable", { reason: LENS_COPY["picker.skip.staleSeries"] }),
      fillCopy("picker.trendUnavailable", { reason: LENS_COPY["picker.skip.notDerivable"] }),
      fillCopy("picker.trendDetail", { change: "0.54 points", band: "0.21 points" }),
      fillCopy("picker.levelValue", { percentile: "63rd percentile" }),
      fillCopy("picker.rotationLine", {
        row: "High-Yield Credit Spread (OAS)",
        direction: LENS_COPY["picker.rising"],
      }),
      fillCopy("picker.rotationLine", {
        row: "10Y-2Y Treasury Spread",
        direction: LENS_COPY["picker.rotationUnset"],
      }),
    ];
    assertCopyHygiene(filled, "lens-copy-filled");
  });

  it("no template is left with an unfilled placeholder once every value is given", () => {
    const filled = fillCopy("picker.rotationLine", { row: "VIX", direction: "rising" });
    expect(filled).not.toContain("{");
  });
});
