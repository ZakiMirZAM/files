// Tests for industryDecksB: the group map, share-return, value system,
// evolution, environment, and profit-pool copy. Every fixture is a real
// payload captured from the live endpoints, including a thin one-company
// partner and an industry with tickers but no financial rows.

import { describe, expect, it } from "vitest";
import { EM_DASH, HYGIENE, stringsFromGroups, assertCopyHygiene } from "./copyHygiene.test-helper";
import {
  GROUP_MAP_SEMICONDUCTORS,
  GROUP_MAP_SINGLE_FIRM,
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
  shareReturnQuartileSentence,
  peerCountCell,
  valueSystemIntro,
  GROUP_MAP_DECK_TITLE,
  SHARE_RETURN_DECK_TITLE,
  VALUE_SYSTEM_DECK_TITLE,
  EVOLUTION_DECK_TITLE,
  PROFIT_POOL_DECK_TITLE,
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
import type { EnvironmentIndicators } from "./industryStructureApi";

const ENV = ENVIRONMENT_SEMICONDUCTORS as EnvironmentIndicators;

// ── Group map ─────────────────────────────────────────────────────────────

describe("plottedSentence", () => {
  it("says how many of how many are drawn, and that groups cover everyone", () => {
    expect(plottedSentence(20, 512)).toBe(
      "The map plots the 20 largest of 512 companies; each group's figures cover every company in the group.",
    );
  });

  it("says so when every company is on the map", () => {
    expect(plottedSentence(12, 12)).toBe(
      "The map plots all 12 companies in this industry; each group's figures cover every company in the group.",
    );
  });

  it("uses the singular for a one-company industry", () => {
    expect(plottedSentence(1, 1)).toBe(
      "The map plots the only company in this industry; each group's figures cover every company in the group.",
    );
  });

  it("handles an empty map", () => {
    expect(plottedSentence(0, 40)).toBe("No company is plotted on this map yet.");
  });
});

describe("correlationSentence", () => {
  it("prints the correlation to two decimals with the rule beside it", () => {
    expect(correlationSentence(GROUP_MAP_SEMICONDUCTORS.axisCorrelation)).toBe(
      "These two dimensions have a correlation of -0.05 in this industry. A common rule for these maps: choose dimensions that do not move together.",
    );
  });

  it("says so plainly when the correlation is missing", () => {
    expect(correlationSentence(null)).toBe(
      `The correlation between these two dimensions is not available for this industry. ${GROUP_MAP_COPY.correlationRule}`,
    );
  });
});

describe("buildGroupMapDeck", () => {
  const deck = buildGroupMapDeck(
    GROUP_MAP_SEMICONDUCTORS.groups,
    "Semiconductors",
    "",
    20,
    512,
  );

  it("returns one group with six questions", () => {
    expect(deck).toHaveLength(1);
    expect(deck[0].title).toBe(GROUP_MAP_DECK_TITLE);
    expect(deck[0].questions).toHaveLength(6);
    expect(deck[0].questions.map((q) => q.id)).toEqual([
      "ind.groups.1",
      "ind.groups.2",
      "ind.groups.3",
      "ind.groups.4",
      "ind.groups.5",
      "ind.groups.6",
    ]);
  });

  it("quotes the group labels so they read as names", () => {
    expect(deck[0].questions[0].text).toContain('"High R&D intensity, high value-added share"');
    expect(deck[0].questions[0].text).toContain("69.3 percent of industry revenue");
    expect(deck[0].questions[0].text).toContain("6.7 percent pre-tax return on capital");
  });

  it("puts the coverage sentence in the AI context", () => {
    expect(deck[0].questions[0].dataContext).toContain(
      "The map plots the 20 largest of 512 companies",
    );
  });

  it("ends with the house-form synthesis", () => {
    expect(deck[0].questions[5].text).toContain(
      "No length limit; summarize everything from the questions above into the best complete picture you can.",
    );
  });

  it("does not crash when a payload carries no groups", () => {
    expect(buildGroupMapDeck(undefined as never, "X", "")).toEqual([]);
    expect(buildGroupMapDeck([], "X", "")).toEqual([]);
  });

  it("handles a one-company industry without a second group or a plural slip", () => {
    const thin = buildGroupMapDeck(
      GROUP_MAP_SINGLE_FIRM.groups,
      "Semiconductor Equipment & Materials",
      "",
      1,
      1,
    );
    expect(thin[0].questions[0].text).toContain(
      "Name what would keep a company outside this group from copying its strategy.",
    );
    expect(thin[0].questions[0].dataContext).toContain("1 company.");
    expect(thin[0].questions[0].dataContext).not.toContain("1 companies");
  });
});

// ── Share and return ──────────────────────────────────────────────────────

describe("share and return copy", () => {
  const fit = GROUP_MAP_SEMICONDUCTORS.shareReturn?.fit ?? null;

  it("prints R-squared to two decimals and warns when the fit explains nothing", () => {
    expect(shareReturnFitSentence(fit)).toBe(
      "R-squared 0.05 across 505 companies. At that level the fitted line accounts for almost none of the difference in returns, so read the scatter itself rather than the line.",
    );
  });

  it("drops the warning once the fit carries weight", () => {
    expect(shareReturnFitSentence({ coefficients: [0, 0, 0], r2: 0.42, n: 30 })).toBe(
      "R-squared 0.42 across 30 companies.",
    );
  });

  it("handles a missing fit and a missing R-squared", () => {
    expect(shareReturnFitSentence(null)).toBe("No line is fitted to these companies.");
    expect(shareReturnFitSentence({ coefficients: [0, 0, 0], r2: null, n: 5 })).toContain(
      "read the scatter itself rather than the line",
    );
  });

  it("states both quartile medians, or nothing", () => {
    expect(shareReturnQuartileSentence(0.074, 0.0306)).toBe(
      "Companies in the top quarter by share earn a median 7.4 percent pre-tax return on capital; the rest earn 3.1 percent.",
    );
    expect(shareReturnQuartileSentence(null, 0.03)).toBeNull();
  });

  it("builds one question that sends the reader to the scatter, not the line", () => {
    const deck = buildShareReturnDeck(fit, 0.074, 0.0306, "");
    expect(deck[0].title).toBe(SHARE_RETURN_DECK_TITLE);
    expect(deck[0].questions).toHaveLength(1);
    expect(deck[0].questions[0].id).toBe("ind.groups.curve");
    expect(deck[0].questions[0].text).toContain("Read the share and return scatter above, not the fitted line.");
    expect(deck[0].questions[0].text).toContain(SHARE_RETURN_COPY.caveat);
  });
});

// ── Value system ──────────────────────────────────────────────────────────

describe("value system copy", () => {
  it("names the industry in the intro", () => {
    expect(valueSystemIntro("Semiconductors")).toContain("Semiconductors's most important input");
  });

  it("labels a one-company partner in the singular", () => {
    expect(peerCountCell(VALUE_SYSTEM_THIN_PARTNER.supplier)).toBe("1 company");
    expect(peerCountCell(VALUE_SYSTEM_THIN_PARTNER.focal)).toBe("512 companies");
    expect(peerCountCell(null)).toBe("Not reported");
  });

  it("compounds the growth rate in the AI context", () => {
    const deck = buildValueSystemDeck(VALUE_SYSTEM_SEMICONDUCTORS, "Semiconductors", "");
    expect(deck[0].questions[0].dataContext).toContain("revenue grew 13.9 percent a year over five years");
    expect(deck[0].questions[0].dataContext).not.toContain("13.0 percent");
  });

  it("names the thin partner's company count in the AI context", () => {
    const deck = buildValueSystemDeck(VALUE_SYSTEM_THIN_PARTNER, "Semiconductors", "");
    expect(deck[0].questions[0].dataContext).toContain("1 company behind those figures");
  });

  it("asks the reader to pick a supplier before comparing, when none is chosen", () => {
    const deck = buildValueSystemDeck(VALUE_SYSTEM_SEMICONDUCTORS, "Semiconductors", "");
    expect(deck[0].questions[0].text).toContain("Choose a supplier industry in the picker above");
  });

  it("compares the two once a supplier is chosen", () => {
    const deck = buildValueSystemDeck(VALUE_SYSTEM_THIN_PARTNER, "Semiconductors", "");
    expect(deck[0].questions[0].text).toContain(
      'The supplier industry "Semiconductor Equipment & Materials" has a Herfindahl-Hirschman Index of 10,000 points against 404 here',
    );
  });

  it("prints no gaps for an industry with tickers but no financial rows", () => {
    const deck = buildValueSystemDeck(VALUE_SYSTEM_EMPTY, "Banking Services", "");
    const ctx = deck[0].questions[0].dataContext ?? "";
    expect(ctx).toContain("No company in this industry has financial rows on file.");
    expect(ctx).not.toMatch(/not available/i);
  });

  it("names the days rows it wants read", () => {
    const deck = buildValueSystemDeck(VALUE_SYSTEM_SEMICONDUCTORS, "Semiconductors", "");
    expect(deck[0].questions[1].text).toBe(
      "Read the days payable and days receivable chart above. In fiscal 2025 companies here took 52 days to pay their suppliers and waited 78 days to be paid. Decide who is financing whom along this chain. Paying later than you are paid means the suppliers are funding this industry's working capital.",
    );
  });

  it("uses the deck title the page excludes from the bottom bank", () => {
    expect(buildValueSystemDeck(VALUE_SYSTEM_SEMICONDUCTORS, "Semiconductors")[0].title).toBe(
      VALUE_SYSTEM_DECK_TITLE,
    );
  });
});

// ── Evolution ─────────────────────────────────────────────────────────────

describe("buildEvolutionSentences", () => {
  const sentences = buildEvolutionSentences(EVOLUTION_SEMICONDUCTORS, ENV);

  it("returns all six, in plan order", () => {
    expect(sentences.map((s) => s.key)).toEqual([
      "revenue",
      "companies",
      "hhi",
      "marginSpread",
      "rdSpread",
      "capacity",
    ]);
  });

  it("states compound growth and names both windows", () => {
    expect(sentences[0].text).toBe(
      "Revenue grew 9.9 percent a year from 2016 to 2021, and grew 13.9 percent a year from 2021 to 2025.",
    );
  });

  it("carries both company-count caveats", () => {
    expect(sentences[1].text).toContain("These are listings, not firm births.");
    expect(sentences[1].text).toContain("the data vendor widening coverage");
    expect(sentences[1].text).toContain("the most recent year can look low");
  });

  it("names the coverage jump this industry actually shows", () => {
    expect(sentences[1].text).toContain("from 414 in 2018 to 508 in 2019");
  });

  it("names the years on the concentration and spread sentences", () => {
    expect(sentences[2].text).toBe(
      "The Herfindahl-Hirschman Index was 393 points in 2016 and is 404 points in 2025.",
    );
    expect(sentences[3].text).toBe(
      "The gross margin spread between companies was 23.6 percentage points in 2016 and is 30.2 points in 2025.",
    );
    expect(sentences[4].text).toContain("research and development spread between companies");
  });

  it("states the capacity figures with their years", () => {
    expect(sentences[5].text).toBe(
      "Capital spending is 1.4 times depreciation in 2025. A dollar of plant produced 1.7 dollars of revenue in 2025, against 1.7 in 2020.",
    );
  });

  it("prints the not-available sentence rather than averaging year-over-year growth", () => {
    const noIndicators = buildEvolutionSentences(EVOLUTION_SEMICONDUCTORS, null);
    expect(noIndicators[0].text).toBe("Not available for this industry.");
    expect(noIndicators[0].available).toBe(false);
    // The other five still render from the series.
    expect(noIndicators[2].available).toBe(true);
  });

  it("survives an empty evolution payload", () => {
    const empty = buildEvolutionSentences(undefined, null);
    expect(empty).toHaveLength(6);
    for (const s of empty) expect(s.text).toBe("Not available for this industry.");
  });
});

describe("buildEvolutionDeck", () => {
  const deck = buildEvolutionDeck(EVOLUTION_SEMICONDUCTORS, "", ENV);

  it("has five questions under the evolution title", () => {
    expect(deck[0].title).toBe(EVOLUTION_DECK_TITLE);
    expect(deck[0].questions.map((q) => q.id)).toEqual([
      "ind.evolve.1",
      "ind.evolve.2",
      "ind.evolve.3",
      "ind.evolve.4",
      "ind.evolve.5",
    ]);
  });

  it("carries the life-cycle objections inside the closing question", () => {
    expect(deck[0].questions[4].text).toContain(EVOLUTION_COPY.lifeCycleNote);
  });

  it("puts all six sentences in the AI context", () => {
    const ctx = deck[0].questions[0].dataContext ?? "";
    expect(ctx).toContain("Revenue grew 9.9 percent a year from 2016 to 2021");
    expect(ctx).toContain("Capital spending is 1.4 times depreciation in 2025");
  });
});

// ── Environments ──────────────────────────────────────────────────────────

describe("buildEnvironmentHeaderNotes", () => {
  const headers = buildEnvironmentHeaderNotes(ENV);

  it("compounds both growth rates in the maturity header", () => {
    expect(headers[MATURITY_DECK_TITLE]).toBe(
      "Revenue grew 9.9 percent a year over the first five years and grew 13.9 percent a year over the last five; capital spending is 1.4 times depreciation.",
    );
  });

  it("compounds the five-year rate in the emerging header", () => {
    expect(headers[EMERGING_DECK_TITLE]).toBe(
      "Revenue grew 13.9 percent a year over five years; the median company has 13 years of reported history.",
    );
  });

  it("prints the fragmented header with a two-decimal R-squared", () => {
    expect(headers[FRAGMENTED_DECK_TITLE]).toBe(
      "Herfindahl-Hirschman Index 404 points; the four largest companies hold 32.6 percent of revenue; the scale economies slope is 7.7 points of operating margin for every tenfold increase in revenue (R-squared 0.10).",
    );
  });

  it("says plainly when an indicator is not available", () => {
    expect(headers[DECLINE_DECK_TITLE]).toContain(
      "Revenue after inflation is not available for this industry",
    );
    expect(headers[GLOBAL_DECK_TITLE]).toBe(
      "The number of countries the ten largest companies are based in is not available for this industry.",
    );
  });

  it("uses the singular for a net entry of one company", () => {
    const one = buildEnvironmentHeaderNotes({ ...ENV, netEntry5y: 1 });
    expect(one[DECLINE_DECK_TITLE]).toContain("net entry over five years 1 company.");
  });
});

describe("buildEnvironmentDecks", () => {
  const decks = buildEnvironmentDecks(ENV, "");

  it("returns the five environments in plan order", () => {
    expect(decks.map((d) => d.title)).toEqual([
      FRAGMENTED_DECK_TITLE,
      EMERGING_DECK_TITLE,
      MATURITY_DECK_TITLE,
      DECLINE_DECK_TITLE,
      GLOBAL_DECK_TITLE,
    ]);
  });

  it("gives every deck the question count the plan lists", () => {
    expect(decks.map((d) => d.questions.length)).toEqual([6, 7, 8, 6, 5]);
  });

  it("uses unique ids across all five", () => {
    const ids = decks.flatMap((d) => d.questions.map((q) => q.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── Profit pool ───────────────────────────────────────────────────────────

describe("buildProfitPoolDeck", () => {
  it("names the largest profit holder", () => {
    const deck = buildProfitPoolDeck(PROFIT_POOL_TECHNOLOGY, "Technology", "");
    expect(deck[0].title).toBe(PROFIT_POOL_DECK_TITLE);
    expect(deck[0].questions.map((q) => q.id)).toEqual(["sec.pool.1", "sec.pool.2", "sec.pool.3"]);
    expect(deck[0].questions[1].text).toContain('"Semiconductors" holds the largest share today.');
  });

  it("works for Energy and Financial Services too", () => {
    expect(
      buildProfitPoolDeck(PROFIT_POOL_ENERGY, "Energy", "")[0].questions[1].text,
    ).toContain('"Oil & Gas Integrated"');
    expect(
      buildProfitPoolDeck(PROFIT_POOL_FINANCIALS, "Financial Services", "")[0].questions[1].text,
    ).toContain('"Banks - Regional"');
  });

  it("drops the leader claim when the sector's profit is negative", () => {
    const negative = { ...PROFIT_POOL_TECHNOLOGY, negativeSectorProfit: true };
    const deck = buildProfitPoolDeck(negative, "Technology", "");
    expect(deck[0].questions[1].text).not.toContain("holds the largest share today");
    expect(deck[0].questions[0].dataContext).toContain(PROFIT_POOL_COPY.negative);
  });

  it("returns nothing without a payload", () => {
    expect(buildProfitPoolDeck(null, "Technology")).toEqual([]);
  });
});

// ── Copy hygiene over every generated string ──────────────────────────────
// The em-dash check and developer-shorthand regex now live in the shared
// helper (copyHygiene.test-helper.ts). This block delegates to it.

function everyGeneratedString(): string[] {
  const out: string[] = [];
  const push = (groups: ReturnType<typeof buildEvolutionDeck>) => {
    out.push(...stringsFromGroups(groups));
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

  out.push(plottedSentence(20, 512), plottedSentence(1, 1), plottedSentence(0, 0));
  out.push(correlationSentence(0.25), correlationSentence(null));
  out.push(shareReturnFitSentence(GROUP_MAP_SEMICONDUCTORS.shareReturn?.fit ?? null));
  out.push(...Object.values(GROUP_MAP_COPY));
  out.push(...Object.values(SHARE_RETURN_COPY));
  out.push(...Object.values(VALUE_SYSTEM_COPY.rows), VALUE_SYSTEM_COPY.title);
  out.push(...Object.values(EVOLUTION_COPY.cards), EVOLUTION_COPY.lifeCycleNote, EVOLUTION_COPY.countCaveat);
  out.push(...Object.values(PROFIT_POOL_COPY));
  out.push(
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
  for (const s of buildEvolutionSentences(EVOLUTION_SEMICONDUCTORS, ENV)) out.push(s.text);
  for (const v of Object.values(buildEnvironmentHeaderNotes(ENV))) out.push(v);
  for (const v of Object.values(buildEnvironmentHeaderNotes(BANKS_DIVERSIFIED.environmentIndicators))) {
    out.push(v);
  }
  return out;
}

describe("generated copy hygiene", () => {
  const strings = everyGeneratedString();

  it("produces a lot of strings to check", () => {
    expect(strings.length).toBeGreaterThan(120);
  });

  it("contains no em dash and no developer shorthand", () => {
    assertCopyHygiene(strings, "industryDecksB");
  });
});
