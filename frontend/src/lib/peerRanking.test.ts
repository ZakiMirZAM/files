// The peer ranking adapter: the cache key both pages share, the exposure
// column group merged onto a ranking matrix, and the strategic group filter.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { nvdaFixture } from "./__fixtures__/nvda";
import { stageFixture } from "./__fixtures__/stage";
import type { ConnectionsData, ExposureRow } from "./connectionsTypes";
import { EXPOSURE_GROUP } from "./connectionsCopy";
import {
  EXPOSURE_METRICS,
  RANKING_KEY_PREFIX,
  applicableExposureMetrics,
  exposureCells,
  exposureNotes,
  groupTickers,
  rankingCacheKey,
  rankingPath,
  withExposureColumns,
  withOnlyTickers,
} from "./peerRanking";
import {
  connectionsCacheKey,
  individualCacheKey,
  industryScorecardCacheKey,
  rivalsCacheKey,
} from "./api";
import { groupMapCacheKey, valueSystemCacheKey } from "./groupMapApi";
import { KEYS } from "./stageContext/sources";
import { METRIC_DIRECTION, cellTint, colNote, formatSectorValue, rowStats } from "./sectorMetrics";
import type { SectorMetricsData } from "./types";

const NVDA = nvdaFixture as unknown as ConnectionsData;
const EXPOSURES = NVDA.exposures ?? [];

/** The real Banks - Diversified payload: every one of its twenty rows marks
 *  two of the four exposure figures as not applicable, with the backend's own
 *  reason attached. */
const BANKS = stageFixture<ConnectionsData>("connections_industry_BanksDiversified");
const BANK_EXPOSURES = BANKS.exposures ?? [];

/** A ranking matrix shaped like the live payload, small enough to read. */
function matrix(): SectorMetricsData {
  return {
    asOf: "2026-09-20",
    universe: "3 companies in Semiconductors",
    metrics: [
      {
        key: "score",
        label: "Value Score",
        unit: "n",
        group: "Ranking",
        definition: "A 0-100 business-quality score.",
      },
      {
        key: "roic",
        label: "ROIC",
        unit: "%",
        group: "Value creation",
        definition: "Return on invested capital.",
      },
    ],
    sectors: ["NVDA", "TSM", "ZZZZ"],
    data: {
      NVDA: { score: 88, roic: 91.2, _year: 2025, _marketCap: 4.2e12 },
      TSM: { score: 81, roic: 26.4, _year: 2025, _marketCap: 9e11 },
      ZZZZ: { score: 40, roic: 3.1, _year: 2025, _marketCap: 2e9 },
    },
  };
}

describe("rankingCacheKey", () => {
  it("matches the key the cross-stage block already uses when no filter is set", () => {
    // lib/stageContext/sources.ts KEYS.ranking(i) is `comparative-ranking|${i}`.
    expect(rankingCacheKey("Semiconductors")).toBe("comparative-ranking|Semiconductors");
    expect(rankingCacheKey("Semiconductors", { developed: false, minMcap: null })).toBe(
      "comparative-ranking|Semiconductors",
    );
    expect(rankingCacheKey("Semiconductors", { minMcap: 0 })).toBe(
      "comparative-ranking|Semiconductors",
    );
  });

  it("gives each filtered set its own key, so one does not serve another", () => {
    const plain = rankingCacheKey("Semiconductors");
    const developed = rankingCacheKey("Semiconductors", { developed: true });
    const floored = rankingCacheKey("Semiconductors", { minMcap: 5 });
    const both = rankingCacheKey("Semiconductors", { developed: true, minMcap: 5 });
    expect(new Set([plain, developed, floored, both]).size).toBe(4);
  });
});

describe("the keys the page and the AI gather share", () => {
  it("the table and the cross-stage block ask for the full ranking under one key", () => {
    expect(rankingCacheKey("Semiconductors")).toBe(KEYS.ranking("Semiconductors"));
  });

  it("the light ranking has a key of its own, so it cannot replace the full one", () => {
    expect(KEYS.rankingLight("Semiconductors")).not.toBe(KEYS.ranking("Semiconductors"));
    // Still under the ranking prefix, so the cache's small ranking cap covers it.
    expect(KEYS.rankingLight("Semiconductors").startsWith("comparative-ranking|")).toBe(true);
  });

  it("one company's analysis is one request between the page and the gather", () => {
    expect(individualCacheKey("googl")).toBe(KEYS.individual("GOOGL"));
    expect(individualCacheKey("GOOGL")).toBe("individual|GOOGL");
  });

  it("one industry's scorecard likewise", () => {
    expect(industryScorecardCacheKey("Semiconductors")).toBe(
      KEYS.industryScorecard("Semiconductors"),
    );
  });
});

describe("every shared cache key comes from one builder", () => {
  // The shared cache in lib/useResource.ts is keyed by opaque strings, so a
  // key spelled a hair differently at a second call site silently doubles a
  // fetch and, for the ranking, disarms its three-entry cap. Each of these
  // pins a builder's output to the string the app has always used, so a change
  // to the format has to be made deliberately and in one place.
  it("emits the strings the app has always used", () => {
    expect(rankingCacheKey("Semiconductors")).toBe("comparative-ranking|Semiconductors");
    expect(rankingCacheKey("Semiconductors", { developed: true, minMcap: 5 })).toBe(
      "comparative-ranking|Semiconductors|developed|mcap=5",
    );
    expect(RANKING_KEY_PREFIX).toBe("comparative-ranking|");
    expect(groupMapCacheKey("Semiconductors")).toBe("group-map|Semiconductors|||");
    expect(groupMapCacheKey("Semiconductors", "roic", "share", 40)).toBe(
      "group-map|Semiconductors|roic|share|40",
    );
    expect(valueSystemCacheKey("Semiconductors")).toBe("value-system|Semiconductors||");
    expect(valueSystemCacheKey("Semiconductors", "Software", "Autos")).toBe(
      "value-system|Semiconductors|Software|Autos",
    );
    expect(individualCacheKey("nvda")).toBe("individual|NVDA");
    expect(industryScorecardCacheKey("Semiconductors")).toBe(
      "industry-scorecard|Semiconductors",
    );
    expect(rivalsCacheKey("NVDA")).toBe("individual-rivals|NVDA");
    expect(connectionsCacheKey({ industry: "Semiconductors" })).toBe(
      "connections|industry=Semiconductors",
    );
  });

  it("is the same builder the cross-stage block's KEYS call", () => {
    expect(KEYS.groupMap("Semiconductors")).toBe(groupMapCacheKey("Semiconductors"));
    expect(KEYS.valueSystem("Semiconductors")).toBe(valueSystemCacheKey("Semiconductors"));
    expect(KEYS.valueSystem("Semiconductors", "Software", "Autos")).toBe(
      valueSystemCacheKey("Semiconductors", "Software", "Autos"),
    );
    expect(KEYS.rivals("NVDA")).toBe(rivalsCacheKey("NVDA"));
    expect(KEYS.connections({ industry: "Semiconductors" })).toBe(
      connectionsCacheKey({ industry: "Semiconductors" }),
    );
    expect(KEYS.rankingLight("Semiconductors")).toBe(
      `${rankingCacheKey("Semiconductors")}|light`,
    );
  });

  it("is called, not spelled again, at every site that loads one", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const here = (p: string) => readFileSync(join(root, "..", p), "utf8");
    // Only the module that OWNS a resource may hold its literal.
    const sites: [string, string[]][] = [
      [
        "components/PeerRankingTable.tsx",
        ["comparative-ranking|", "connections|", "individual-rivals|"],
      ],
      [
        "lib/stageContext/sources.ts",
        ["comparative-ranking|", "group-map|", "value-system|", "individual-rivals|", "connections|"],
      ],
      ["lib/useResource.ts", ["comparative-ranking|"]],
    ];
    for (const [file, literals] of sites) {
      const src = here(file);
      for (const literal of literals) {
        expect(src, `${file} spells ${literal} by hand`).not.toContain(literal);
      }
    }
    // The two hooks that own those keys build them through the exported
    // builder, which is what the gather's KEYS call.
    const groupMap = here("lib/groupMapApi.ts");
    expect(groupMap).toContain("groupMapCacheKey(industry, x, y, limit)");
    expect(groupMap).toContain("valueSystemCacheKey(industry, supplier, buyer)");
  });
});

describe("rankingPath", () => {
  it("asks for the whole industry when no filter is set", () => {
    expect(rankingPath("Semiconductors")).toBe("/api/comparative/Semiconductors/ranking");
  });

  it("carries each filter the backend takes", () => {
    expect(rankingPath("Banks - Diversified", { developed: true, minMcap: 5 })).toBe(
      "/api/comparative/Banks%20-%20Diversified/ranking?developed=true&min_mcap=5",
    );
  });
});

describe("exposureCells", () => {
  it("converts NVDA's own live row into the matrix's display units", () => {
    const nvda = EXPOSURES.find((r) => r.ticker === "NVDA");
    expect(nvda, "the NVDA fixture carries its own exposure row").toBeDefined();

    // The live figures, for the record: two fractions and two points-already.
    expect(nvda?.interestPerPointPctOfOperatingIncome).toBe(0.0013);
    expect(nvda?.revenueChange2020).toBe(-0.0681);
    expect(nvda?.grossMarginChange2020to2022).toBe(2.94);
    expect(nvda?.shareChange5y).toBe(9.36);

    expect(exposureCells(nvda as ExposureRow)).toEqual({
      exposureInterestPerPoint: 0.13,
      exposureRevenueChange2020: -6.81,
      exposureGrossMarginChange: 2.94,
      exposureShareChange5y: 9.36,
    });
  });

  it("leaves a row the backend could not compute empty rather than zero", () => {
    const blank: ExposureRow = {
      ticker: "JPM",
      name: "JPMorgan Chase",
      revenueUsd: null,
      interestCoverage: null,
      netDebtToEbitda: null,
      interestPerPointPctOfOperatingIncome: null,
      revenueChange2020: null,
      grossMarginChange2020to2022: null,
      operatingLeverage: null,
      shareChange5y: null,
      roicMinusWacc: null,
      isFinancial: true,
      notApplicable: { grossMarginChange2020to2022: "not defined for a bank" },
    };
    expect(exposureCells(blank)).toEqual({
      exposureInterestPerPoint: null,
      exposureRevenueChange2020: null,
      exposureGrossMarginChange: null,
      exposureShareChange5y: null,
    });
  });
});

describe("withExposureColumns", () => {
  it("appends the four figures as one group at the end of the table", () => {
    const merged = withExposureColumns(matrix(), EXPOSURES);
    const added = merged.metrics.slice(-4);
    expect(added.map((m) => m.key)).toEqual(EXPOSURE_METRICS.map((m) => m.key));
    expect(new Set(added.map((m) => m.group))).toEqual(new Set([EXPOSURE_GROUP]));
    expect(merged.metrics).toHaveLength(6);
  });

  it("fills the companies the exposure table covers", () => {
    const merged = withExposureColumns(matrix(), EXPOSURES);
    expect(merged.data.NVDA.exposureInterestPerPoint).toBe(0.13);
    expect(merged.data.NVDA.exposureShareChange5y).toBe(9.36);
    expect(merged.data.TSM.exposureRevenueChange2020).toBeCloseTo(25.16, 10);
  });

  it("leaves a company outside the top twenty with no cells at all", () => {
    const merged = withExposureColumns(matrix(), EXPOSURES);
    for (const met of EXPOSURE_METRICS) {
      expect(merged.data.ZZZZ[met.key], met.key).toBeUndefined();
    }
  });

  it("gives the exposure columns no heatmap, because an exposure is not a grade", () => {
    const merged = withExposureColumns(matrix(), EXPOSURES);
    for (const met of EXPOSURE_METRICS) {
      expect(METRIC_DIRECTION[met.key], met.key).toBeUndefined();
      expect(
        cellTint(merged.data.NVDA[met.key], met.key, rowStats(merged, met.key)),
        met.key,
      ).toBeUndefined();
    }
  });

  it("hands the matrix straight back when the connections call gave nothing", () => {
    const base = matrix();
    expect(withExposureColumns(base, null)).toBe(base);
    expect(withExposureColumns(base, [])).toBe(base);
  });

  it("does not add the group twice", () => {
    const once = withExposureColumns(matrix(), EXPOSURES);
    const twice = withExposureColumns(once, EXPOSURES);
    expect(twice).toBe(once);
  });

  it("changes nothing about the matrix it was given", () => {
    const base = matrix();
    const before = JSON.stringify(base);
    withExposureColumns(base, EXPOSURES);
    expect(JSON.stringify(base)).toBe(before);
  });
});

describe("the reasons a bank's exposure cells are empty", () => {
  /** A bank matrix: the three rows the live ranking would carry. */
  function bankMatrix(): SectorMetricsData {
    const base = matrix();
    return {
      ...base,
      sectors: ["JPM", "BAC", "ZZZZ"],
      data: {
        JPM: { score: 62, roic: 11.1, _year: 2025, _marketCap: 7e11 },
        BAC: { score: 55, roic: 8.4, _year: 2025, _marketCap: 3e11 },
        ZZZZ: { score: 40, roic: 3.1, _year: 2025, _marketCap: 2e9 },
      },
    };
  }

  it("the fixture really is the case this is about", () => {
    expect(BANK_EXPOSURES.length).toBe(20);
    for (const row of BANK_EXPOSURES) {
      expect(row.interestPerPointPctOfOperatingIncome, row.ticker).toBeNull();
      expect(row.grossMarginChange2020to2022, row.ticker).toBeNull();
      expect(Object.keys(row.notApplicable ?? {}), row.ticker).toContain(
        "grossMarginChange2020to2022",
      );
    }
  });

  it("maps each reason onto the column it explains", () => {
    const jpm = BANK_EXPOSURES.find((r) => r.ticker === "JPM") as ExposureRow;
    const notes = exposureNotes(jpm);
    expect(Object.keys(notes).sort()).toEqual([
      "exposureGrossMarginChange",
      "exposureInterestPerPoint",
    ]);
    expect(notes.exposureGrossMarginChange).toBe(
      jpm.notApplicable?.grossMarginChange2020to2022,
    );
    expect(notes.exposureGrossMarginChange).toMatch(/cost of revenue/);
  });

  it("carries no reasons for a company the backend could compute", () => {
    const nvda = EXPOSURES.find((r) => r.ticker === "NVDA") as ExposureRow;
    expect(exposureNotes(nvda)).toEqual({});
  });

  it("drops a column no company in the set can answer", () => {
    const kept = applicableExposureMetrics(BANK_EXPOSURES).map((m) => m.key);
    expect(kept).toEqual(["exposureRevenueChange2020", "exposureShareChange5y"]);

    const merged = withExposureColumns(bankMatrix(), BANK_EXPOSURES);
    const added = merged.metrics.filter((m) => m.group === EXPOSURE_GROUP).map((m) => m.key);
    expect(added).toEqual(["exposureRevenueChange2020", "exposureShareChange5y"]);
    expect(merged.data.JPM.exposureInterestPerPoint).toBeUndefined();
    expect(merged.data.JPM.exposureGrossMarginChange).toBeUndefined();
  });

  it("keeps every column when one company in the set can answer it", () => {
    const bank = BANK_EXPOSURES[0];
    const mixed = [...BANK_EXPOSURES, { ...EXPOSURES[0], ticker: "BAC" } as ExposureRow];
    expect(bank.grossMarginChange2020to2022).toBeNull();
    expect(applicableExposureMetrics(mixed).map((m) => m.key)).toEqual(
      EXPOSURE_METRICS.map((m) => m.key),
    );

    const merged = withExposureColumns(bankMatrix(), mixed);
    // The bank still shows nothing in that column, but now with a reason.
    expect(merged.data.JPM.exposureGrossMarginChange).toBeNull();
    expect(colNote(merged.data.JPM, "exposureGrossMarginChange")).toMatch(/cost of revenue/);
    expect(colNote(merged.data.BAC, "exposureGrossMarginChange")).toBeUndefined();
  });

  it("hangs the reason on the cells that are dropped only when they survive", () => {
    const merged = withExposureColumns(bankMatrix(), BANK_EXPOSURES);
    // The two dropped columns take their notes with them: there is no cell left
    // to hover.
    expect(colNote(merged.data.JPM, "exposureGrossMarginChange")).toBeUndefined();
    expect(colNote(merged.data.JPM, "exposureRevenueChange2020")).toBeUndefined();
  });

  it("changes nothing about the matrix it was given", () => {
    const base = bankMatrix();
    const before = JSON.stringify(base);
    withExposureColumns(base, BANK_EXPOSURES);
    expect(JSON.stringify(base)).toBe(before);
  });
});

describe("the exposure columns that are measured in points", () => {
  it("prints points, not a percent sign, for the two the backend reports in points", () => {
    const byKey = new Map(EXPOSURE_METRICS.map((m) => [m.key, m]));
    expect(byKey.get("exposureGrossMarginChange")?.unit).toBe("pts");
    expect(byKey.get("exposureShareChange5y")?.unit).toBe("pts");
    expect(formatSectorValue(2.94, "pts")).toBe("2.94 pts");
    expect(formatSectorValue(-1.56, "pts")).toBe("−1.56 pts");
    expect(formatSectorValue(null, "pts")).toBe("n/a");
  });

  it("leaves the two that really are percentages as percentages", () => {
    const byKey = new Map(EXPOSURE_METRICS.map((m) => [m.key, m]));
    expect(byKey.get("exposureInterestPerPoint")?.unit).toBe("%");
    expect(byKey.get("exposureRevenueChange2020")?.unit).toBe("%");
  });
});

describe("withOnlyTickers", () => {
  it("keeps the rows the strategic group names, in the table's own order", () => {
    const filtered = withOnlyTickers(matrix(), ["TSM", "NVDA"]);
    expect(filtered.sectors).toEqual(["NVDA", "TSM"]);
  });

  it("leaves every cell and every column untouched", () => {
    const base = matrix();
    const filtered = withOnlyTickers(base, ["NVDA"]);
    expect(filtered.metrics).toBe(base.metrics);
    expect(filtered.data).toBe(base.data);
    expect(base.sectors).toEqual(["NVDA", "TSM", "ZZZZ"]);
  });

  it("means no filter when the group is null", () => {
    const base = matrix();
    expect(withOnlyTickers(base, null)).toBe(base);
    expect(withOnlyTickers(base, undefined)).toBe(base);
  });
});

describe("groupTickers", () => {
  it("puts the company first, then the rivals the route lists", () => {
    expect(
      groupTickers(
        {
          applicable: true,
          groupRivals: [{ ticker: "TSM", groupLabel: "Scale leaders" }, { ticker: "AMD" }],
        },
        "nvda",
      ),
    ).toEqual(["NVDA", "TSM", "AMD"]);
  });

  it("gives no group when the route could not answer, so the toggle hides", () => {
    expect(groupTickers(null, "NVDA")).toBeNull();
    expect(groupTickers({ applicable: false }, "NVDA")).toBeNull();
    expect(groupTickers({ applicable: true, groupRivals: [] }, "NVDA")).toBeNull();
  });

  it("uses the symbol the route answered under, not the alias asked with", () => {
    // /app/individual/GOOGL resolves to GOOG before any lookup, and GOOG is the
    // ticker the ranking's rows are keyed by. Putting GOOGL first would filter
    // the table to a row that does not exist, dropping the company itself out
    // of "its strategic group only".
    expect(
      groupTickers(
        { applicable: true, ticker: "GOOG", groupRivals: [{ ticker: "META" }] },
        "GOOGL",
      ),
    ).toEqual(["GOOG", "META"]);
  });

  it("falls back to the asked ticker when the route sends no symbol", () => {
    expect(
      groupTickers({ applicable: true, groupRivals: [{ ticker: "TSM" }] }, "nvda"),
    ).toEqual(["NVDA", "TSM"]);
  });
});

describe("the shared table wiring", () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const read = (p: string) => readFileSync(join(HERE, "..", p), "utf8");

  it("marks the company's row and scrolls only the table's own box", () => {
    const table = read("components/CompanyScorecardTable.tsx");
    expect(table).toContain("highlightTicker?: string;");
    expect(table).toContain("const marked = highlightTicker?.toUpperCase();");
    expect(table).toContain('isMarked ? "font-bold text-gold"');
    expect(table).toContain("box.scrollTop +=");
    // No red or green on the marked row: that pair means better or worse here.
    expect(table).not.toMatch(/isMarked \? "[^"]*(loss|gain)/);
  });

  it("is the one component both pages render the ranking through", () => {
    const comparative = read("pages/IndustryDetail.tsx");
    const company = read("pages/IndividualPage.tsx");
    for (const [name, source] of [["comparative", comparative], ["company", company]] as const) {
      expect(source, name).toContain("<PeerRankingTable");
      expect(source, name).not.toContain("fetchComparativeRanking");
    }
    expect(company).toContain("collapsible");
    expect(comparative).toContain("withExposures");
    // The fetcher that used to do this a second way is gone from the client.
    expect(read("lib/api.ts")).not.toContain("fetchComparativeRanking");
  });

  it("marks the company by the symbol the backend answered under", () => {
    const company = read("pages/IndividualPage.tsx");
    expect(company).toContain("highlightTicker={resolvedTicker}");
    expect(company).toContain('analysis?.ticker?.toUpperCase() ?? ticker');
  });

  it("fetches when the reader opens the block, not when it nears the viewport", () => {
    const table = read("components/PeerRankingTable.tsx");
    expect(table, "the prefetch observer downloaded ten megabytes unasked")
      .not.toContain("IntersectionObserver");
    // Every one of the three loads is gated on the disclosure being open.
    expect(table).toContain("if (!open || !industry) return;");
    expect(table).toContain("open && withExposures && industry ?");
    expect(table).toContain("open && ticker ?");
  });

  it("puts the disclosure button inside the heading, not the heading inside the button", () => {
    const table = read("components/PeerRankingTable.tsx");
    // A <button> takes phrasing content, so an <h2> inside one is invalid.
    expect(table).not.toMatch(/<button[^>]*>[\s\S]{0,400}<h2/);
    expect(table).toMatch(/<h2[^>]*>[\s\S]{0,200}<button/);
    // aria-controls must point at an element that exists while collapsed.
    expect(table).toContain('<div id={bodyId} hidden={!expanded}>');
  });

  it("names the developed markets switch, which is otherwise an unlabelled knob", () => {
    const table = read("components/PeerRankingTable.tsx");
    expect(table).toContain('role="switch"');
    expect(table).toContain("aria-labelledby={developedLabelId}");
  });

  it("holds no user-facing literal of its own", () => {
    const table = read("components/PeerRankingTable.tsx");
    for (const literal of ["US / developed only", "Min mkt cap", "Loading value ranking"]) {
      expect(table, literal).not.toContain(`>${literal}`);
      expect(table, literal).not.toContain(`"${literal}"`);
    }
    expect(table).toContain("PEER_RANKING.developedOnly");
    expect(table).toContain("PEER_RANKING.minMcap");
    expect(table).toContain("PEER_RANKING.billions");
    expect(table).toContain("PEER_RANKING.loading");
    expect(table).toContain("PEER_RANKING.noneAfterFilters");
  });

  it("drops the cached payload before a retry re-requests it", () => {
    const table = read("components/PeerRankingTable.tsx");
    expect(table).toContain("forgetResource(cacheKey)");
  });
});
