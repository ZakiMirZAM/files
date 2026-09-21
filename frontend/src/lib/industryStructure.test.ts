// Tests for the industry structure data layer, tile formatters, copy, and
// ReasonedRating encode/decode. Every fixture is a real payload captured from
// the live endpoints (Semiconductors, Banks - Regional, Banks - Diversified).

/** em dash as a runtime value so no literal U+2014 exists in source */
const EM_DASH = String.fromCharCode(0x2014);

import { describe, expect, it } from "vitest";
import {
  SEMICONDUCTORS,
  BANKS_REGIONAL,
  BANKS_DIVERSIFIED,
} from "./__fixtures__/industryStructureFixtures";
import {
  formatTileValue,
  percentileSentence,
  buildEntryTiles,
  buildExitTiles,
  buildRivalryTiles,
  buildLeaderCogsRows,
  tileFromScalar,
  tileFromBare,
  compoundRateFromLog,
  compoundRateValue,
  formatR2,
  pointsValue,
} from "./industryStructureFormat";
import {
  encodeReasonedRating,
  decodeReasonedRating,
  isRatingEnabled,
} from "../components/ReasonedRating";
import {
  buildEntryQuestions,
  buildRivalryQuestions,
  buildSubstitutesQuestions,
  buildBuyersQuestions,
  buildSuppliersQuestions,
  buildFactorsQuestions,
  FORCES_SYNTHESIS,
  TILE_LABELS,
  HHI_REFERENCE,
  SHARE_STABILITY_REFERENCE,
  KEY_PLAYERS_NOTE,
  BARRIER_GRID_NOTE,
  SCALE_LABELS,
  SUMMARY_PROMPTS,
  BARRIER_PROMPTS,
  FACTORS_INTRO,
  FIVE_FORCES_TITLE,
  BARRIER_GRID_TITLE,
  KEY_PLAYERS_TITLE,
  FORCE_TITLES,
  DIAGRAM_CENTER,
  DIAGRAM_LABELS,
  BARRIER_CELLS,
  netEntryWindowSentence,
  duplicateListingsSentence,
  notApplicableSentence,
  peerCountLabel,
} from "./industryForcesCopy";

function tile(tiles: ReturnType<typeof buildEntryTiles>, label: string) {
  const found = tiles.find((t) => t.label === label);
  if (!found) throw new Error(`no tile labelled ${label}`);
  return found;
}

// ── ReasonedRating encode/decode ──────────────────────────────────────────

describe("ReasonedRating encode/decode", () => {
  it("round-trips reason and rating", () => {
    const encoded = encodeReasonedRating("Strong barriers due to R&D costs.", 4);
    expect(encoded).toBe("Strong barriers due to R&D costs. || 4");
    expect(decodeReasonedRating(encoded)).toEqual({
      reason: "Strong barriers due to R&D costs.",
      rating: 4,
    });
  });

  it("splits on the LAST separator so a reason containing it survives", () => {
    const encoded = encodeReasonedRating("Cost || scale both matter", 2);
    expect(decodeReasonedRating(encoded)).toEqual({
      reason: "Cost || scale both matter",
      rating: 2,
    });
  });

  it("decodes reason-only and empty input", () => {
    expect(decodeReasonedRating("just words")).toEqual({ reason: "just words", rating: null });
    expect(decodeReasonedRating("")).toEqual({ reason: "", rating: null });
    expect(decodeReasonedRating(undefined)).toEqual({ reason: "", rating: null });
  });

  it("rejects an out-of-range number rather than reading it as a rating", () => {
    expect(decodeReasonedRating("words || 9").rating).toBeNull();
    expect(decodeReasonedRating("words || x").rating).toBeNull();
  });

  it("keeps the rating disabled until the reason has content", () => {
    expect(isRatingEnabled("")).toBe(false);
    expect(isRatingEnabled("   ")).toBe(false);
    expect(isRatingEnabled("a")).toBe(true);
  });
});

// ── Compound rate helper ──────────────────────────────────────────────────

describe("compoundRateFromLog", () => {
  it("converts a log-annual rate to the compound rate", () => {
    expect(compoundRateFromLog(0.13)).toBe("13.9");
    expect(compoundRateFromLog(0.158)).toBe("17.1");
    expect(compoundRateFromLog(0)).toBe("0.0");
  });

  it("handles a negative rate", () => {
    expect(compoundRateFromLog(-0.078)).toBe("-7.5");
  });

  it("returns the unavailable text for missing input", () => {
    expect(compoundRateFromLog(null)).toBe("not available");
    expect(compoundRateFromLog(undefined)).toBe("not available");
    expect(compoundRateFromLog(NaN)).toBe("not available");
    expect(compoundRateValue(null)).toBeNull();
  });
});

describe("formatR2", () => {
  it("always prints two decimals", () => {
    expect(formatR2(0.1034)).toBe("0.10");
    expect(formatR2(0.0471)).toBe("0.05");
    expect(formatR2(0.0049)).toBe("0.00");
  });

  it("handles a missing R-squared", () => {
    expect(formatR2(null)).toBe("not available");
  });
});

describe("pointsValue", () => {
  it("separates thousands", () => {
    expect(pointsValue(403.7)).toBe("404");
    expect(pointsValue(10000)).toBe("10,000");
  });
});

// ── Tile value formatting ─────────────────────────────────────────────────

describe("formatTileValue", () => {
  it("multiplies fractions by 100", () => {
    expect(formatTileValue(0.3285, "fraction")).toBe("32.9");
  });

  it("leaves HHI points unscaled", () => {
    expect(formatTileValue(403.7, "points")).toBe("403.7");
  });

  it("leaves percentage points as they arrive", () => {
    expect(formatTileValue(4.9277, "pctPoints")).toBe("4.9");
  });

  it("rounds counts to whole numbers", () => {
    expect(formatTileValue(512, "count")).toBe("512");
  });

  it("prints a correlation to two decimals", () => {
    expect(formatTileValue(0.9463, "correlation")).toBe("0.95");
  });

  it("compounds a log rate", () => {
    expect(formatTileValue(0.13, "compoundFromLog")).toBe("13.9");
  });

  it("returns the unavailable text for null and NaN", () => {
    expect(formatTileValue(null, "fraction")).toBe("not available");
    expect(formatTileValue(NaN, "fraction")).toBe("not available");
  });
});

describe("percentileSentence", () => {
  it("builds the sentence with no direction word", () => {
    expect(percentileSentence(0.5839)).toBe("higher than 58 percent of industries");
  });

  it("returns null when the rank is missing", () => {
    expect(percentileSentence(null)).toBeNull();
  });
});

// ── Entry tiles, real Semiconductors payload ──────────────────────────────

describe("buildEntryTiles (Semiconductors)", () => {
  const tiles = buildEntryTiles(SEMICONDUCTORS);

  it("produces eleven tiles and no leaders tile", () => {
    expect(tiles).toHaveLength(11);
    expect(tiles.some((t) => t.label === TILE_LABELS.leaderCogsToRevenue5y)).toBe(false);
  });

  it("states the scale slope per tenfold with a two-decimal R-squared", () => {
    const t = tile(tiles, TILE_LABELS.scaleSlope);
    expect(t.value).toBe("7.7");
    expect(t.suffix).toBe(
      "points of operating margin for every tenfold increase in revenue (R-squared 0.10, 462 companies)",
    );
  });

  it("prints PP&E to revenue as a percent with its rank", () => {
    const t = tile(tiles, TILE_LABELS.ppeToRevenue);
    expect(t.value).toBe("32.9");
    expect(t.suffix).toBe("percent");
    expect(t.percentile).toBe("higher than 58 percent of industries");
  });

  it("prints research and development to revenue", () => {
    expect(tile(tiles, TILE_LABELS.rdToRevenue).value).toBe("5.7");
  });

  it("prints net entry as a signed count of companies", () => {
    const t = tile(tiles, TILE_LABELS.netEntry5y);
    expect(t.value).toBe("38");
    expect(t.suffix).toBe("companies");
  });

  it("leaves the five-largest share movement in percentage points", () => {
    const t = tile(tiles, TILE_LABELS.top5ShareChange5y);
    expect(t.value).toBe("4.9");
    expect(t.suffix).toBe("percentage points");
  });

  it("prints the share rank correlation to two decimals", () => {
    expect(tile(tiles, TILE_LABELS.shareRankCorrelation5y).value).toBe("0.95");
  });
});

describe("buildEntryTiles (Banks - Diversified)", () => {
  const tiles = buildEntryTiles(BANKS_DIVERSIFIED);

  it("counts net entry in companies when there is more than one", () => {
    const t = tile(tiles, TILE_LABELS.netEntry5y);
    expect(t.value).toBe("2");
    expect(t.suffix).toBe("companies");
  });

  it("uses the singular when net entry is one company", () => {
    const one = {
      ...BANKS_DIVERSIFIED,
      entryEvidence: { ...BANKS_DIVERSIFIED.entryEvidence, netEntry5y: 1 },
    };
    const t = tile(buildEntryTiles(one), TILE_LABELS.netEntry5y);
    expect(t.value).toBe("1");
    expect(t.suffix).toBe("company");
  });

  it("prints a reported zero rather than hiding it", () => {
    expect(tile(tiles, TILE_LABELS.rdToRevenue).value).toBe("0.0");
  });

  it("prints a negative scale slope", () => {
    expect(tile(tiles, TILE_LABELS.scaleSlope).value).toBe("-0.7");
  });

  it("prints the drafted sentence for a figure the backend marks not applicable", () => {
    const flagged = buildEntryTiles({
      ...BANKS_DIVERSIFIED,
      notApplicable: { rdToRevenue: "banks report no research and development line" },
    });
    const t = tile(flagged, TILE_LABELS.rdToRevenue);
    expect(t.value).toBe(
      "Not shown for this industry: banks report no research and development line.",
    );
    expect(t.rawValue).toBeNull();
    expect(t.suffix).toBe("");
  });
});

describe("buildEntryTiles (Banks - Regional)", () => {
  it("keeps a reported zero for research and development", () => {
    const t = tile(buildEntryTiles(BANKS_REGIONAL), TILE_LABELS.rdToRevenue);
    expect(t.value).toBe("0.0");
  });
});

// ── Exit and rivalry tiles ────────────────────────────────────────────────

describe("buildExitTiles", () => {
  const tiles = buildExitTiles(SEMICONDUCTORS);

  it("produces three tiles", () => {
    expect(tiles).toHaveLength(3);
  });

  it("prints PP&E to assets and the capex-below-depreciation share as percents", () => {
    expect(tile(tiles, TILE_LABELS.ppeToAssets).value).toBe("18.0");
    expect(tile(tiles, TILE_LABELS.shareOfFirmsWithCapexBelowDepreciation).value).toBe("52.2");
  });
});

describe("buildRivalryTiles", () => {
  const tiles = buildRivalryTiles(SEMICONDUCTORS);

  it("compounds the five-year revenue growth and labels it a year", () => {
    const t = tile(tiles, TILE_LABELS.revenueCagr5y);
    expect(t.value).toBe("13.9");
    expect(t.suffix).toBe("percent a year");
  });

  it("prints the company count and the four-firm share", () => {
    expect(tile(tiles, TILE_LABELS.firmCount).value).toBe("512");
    expect(tile(tiles, TILE_LABELS.cr4).value).toBe("32.6");
  });

  it("leaves HHI on its points scale", () => {
    expect(tile(tiles, TILE_LABELS.hhi).value).toBe("403.7");
    expect(tile(tiles, TILE_LABELS.hhi).suffix).toBe("points");
  });

  it("compounds Banks - Diversified growth too", () => {
    const t = tile(buildRivalryTiles(BANKS_DIVERSIFIED), TILE_LABELS.revenueCagr5y);
    expect(t.value).toBe("16.8");
  });
});

// ── Leaders' cost of goods table ──────────────────────────────────────────

describe("buildLeaderCogsRows", () => {
  const rows = buildLeaderCogsRows(SEMICONDUCTORS.entryEvidence.leaderCogsToRevenue5y);

  it("returns one row per leading company", () => {
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.ticker)).toEqual(["NVDA", "TSM", "000660.KS", "AVGO"]);
  });

  it("carries the first and last year on file", () => {
    expect(rows[0]).toMatchObject({
      ticker: "NVDA",
      firstYear: 2021,
      firstValue: "37.7",
      lastYear: 2025,
      lastValue: "25.0",
    });
    expect(rows[0].series).toHaveLength(5);
  });

  it("handles a negative reported value", () => {
    const banks = buildLeaderCogsRows(BANKS_DIVERSIFIED.entryEvidence.leaderCogsToRevenue5y);
    expect(banks[0].firstValue).toBe("-2.9");
  });

  it("returns an empty list when the field is missing", () => {
    expect(buildLeaderCogsRows(undefined)).toEqual([]);
    expect(buildLeaderCogsRows(null)).toEqual([]);
  });
});

// ── Tile builders from bare inputs ────────────────────────────────────────

describe("tileFromScalar and tileFromBare", () => {
  it("falls back to the not-reported line for a missing scalar", () => {
    const t = tileFromScalar("X", null, "fraction", "percent");
    expect(t.value).toBe("Not reported for this industry");
    expect(t.rawValue).toBeNull();
  });

  it("formats a scalar with its percentile", () => {
    const t = tileFromScalar("X", { value: 0.25, percentile: 0.8 }, "fraction", "percent");
    expect(t.value).toBe("25.0");
    expect(t.percentile).toBe("higher than 80 percent of industries");
  });

  it("falls back for an undefined bare number", () => {
    expect(tileFromBare("X", undefined, "count", "").value).toBe("Not reported for this industry");
  });
});

// ── Notes and labels ──────────────────────────────────────────────────────

describe("structural notes", () => {
  it("names the net entry window when the backend supplies one", () => {
    expect(netEntryWindowSentence([2020, 2025])).toBe(
      "Net entry counts companies that first reported minus companies that last reported between fiscal 2020 and fiscal 2025. These are listings, not firm births.",
    );
  });

  it("still says what net entry counts without a window", () => {
    expect(netEntryWindowSentence(undefined)).toContain("listings, not firm births");
  });

  it("names dropped second listings, singular and plural", () => {
    expect(duplicateListingsSentence(1)).toBe(
      "One second listing of a company already counted here was left out, so no company is counted twice.",
    );
    expect(duplicateListingsSentence(3)).toContain("3 second listings");
    expect(duplicateListingsSentence(0)).toBeNull();
    expect(duplicateListingsSentence(undefined)).toBeNull();
  });

  it("wraps a not-applicable reason in a full sentence", () => {
    expect(notApplicableSentence("banks report no cost of goods")).toBe(
      "Not shown for this industry: banks report no cost of goods.",
    );
    expect(notApplicableSentence("")).toContain("Not shown for this industry:");
  });

  it("labels a one-company peer set in the singular", () => {
    expect(peerCountLabel(1)).toBe("1 company");
    expect(peerCountLabel(18)).toBe("18 companies");
    expect(peerCountLabel(0)).toBeNull();
    expect(peerCountLabel(null)).toBeNull();
  });
});

// ── Question ids ──────────────────────────────────────────────────────────

const ALL_FORCE_QUESTIONS = [
  ...buildEntryQuestions(),
  ...buildRivalryQuestions(),
  ...buildSubstitutesQuestions(),
  ...buildBuyersQuestions(),
  ...buildSuppliersQuestions(),
  ...buildFactorsQuestions("grew 13.9 percent a year"),
  FORCES_SYNTHESIS,
];

describe("force question ids", () => {
  it("are unique", () => {
    const ids = ALL_FORCE_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all sit under ind.forces", () => {
    for (const q of ALL_FORCE_QUESTIONS) {
      expect(q.id.startsWith("ind.forces.")).toBe(true);
    }
  });

  it("quotes the compound growth phrase in the factors question", () => {
    const factors = buildFactorsQuestions("grew 13.9 percent a year");
    expect(factors[0].text).toContain(
      "Revenue in this industry grew 13.9 percent a year over the past five years.",
    );
  });
});

// ── Copy hygiene ──────────────────────────────────────────────────────────

const ALL_COPY_STRINGS: string[] = [
  HHI_REFERENCE,
  SHARE_STABILITY_REFERENCE,
  KEY_PLAYERS_NOTE,
  BARRIER_GRID_NOTE,
  FACTORS_INTRO,
  FIVE_FORCES_TITLE,
  BARRIER_GRID_TITLE,
  KEY_PLAYERS_TITLE,
  DIAGRAM_CENTER,
  ...Object.values(DIAGRAM_LABELS),
  ...Object.values(BARRIER_CELLS),
  ...Object.values(SCALE_LABELS),
  ...Object.values(SUMMARY_PROMPTS),
  ...Object.values(BARRIER_PROMPTS),
  ...Object.values(FORCE_TITLES),
  ...Object.values(TILE_LABELS),
  ...ALL_FORCE_QUESTIONS.map((q) => q.text),
];

describe("copy hygiene", () => {
  it("contains no em dash", () => {
    for (const s of ALL_COPY_STRINGS) {
      expect(s.includes(EM_DASH)).toBe(false);
    }
  });

  const HYGIENE =
    /NaN|undefined|null|n\/a|not available percent|% percent|\d{4,}\.\d percent|\bR2\b/;

  it("carries no developer shorthand or leaked placeholder", () => {
    for (const s of ALL_COPY_STRINGS) {
      expect(s, s).not.toMatch(HYGIENE);
    }
  });

  it("spells out every abbreviation it uses on first sight", () => {
    for (const s of [TILE_LABELS.cr4, TILE_LABELS.hhi]) {
      expect(s).toMatch(/\(([A-Z0-9]+)\)$/);
    }
    expect(TILE_LABELS.grossMarginIqr).not.toMatch(/IQR/);
  });
});

describe("generated tile strings are clean on every fixture", () => {
  const HYGIENE =
    /NaN|undefined|null|n\/a|not available percent|% percent|\d{4,}\.\d percent|\bR2\b/;

  for (const [name, payload] of [
    ["Semiconductors", SEMICONDUCTORS],
    ["Banks - Regional", BANKS_REGIONAL],
    ["Banks - Diversified", BANKS_DIVERSIFIED],
  ] as const) {
    it(`${name} tiles read cleanly`, () => {
      const all = [
        ...buildEntryTiles(payload),
        ...buildExitTiles(payload),
        ...buildRivalryTiles(payload),
      ];
      for (const t of all) {
        const line = `${t.label}: ${t.value} ${t.suffix}`;
        expect(line, line).not.toMatch(HYGIENE);
        expect(line.includes(EM_DASH)).toBe(false);
      }
    });
  }
});
