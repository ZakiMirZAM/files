// The cross-stage block, exercised against the real payloads captured on
// 2026-09-20.
//
// Every figure asserted below was worked out by hand from the fixture and the
// unit contract that governs it, and the unit contract is named in each case.
// Where a figure could be printed two ways, the assertion is the one the unit
// contract requires, not the one that happens to come out of the formatter.

import { describe, expect, it } from "vitest";
import { buildBlock, renderBlock, uncachedParts, SIZE_CAP_BYTES } from "./assemble";
import { creditLines } from "./companySection";
import { costStructureLines, genericStrategyLines } from "./companyProfile";
import { groupByTicker } from "./industrySection";
import { limitedTickers, matrixTable, rankingTable } from "./matrix";
import { NO_DROPS } from "./types";
import { ABSENCE_LEGEND, byteLength } from "./units";
import { fixtureBundle, FIXTURE_NOW, SUBJECTS } from "../__fixtures__/stage/bundles";
import { stageFixture } from "../__fixtures__/stage/index";
import { EM_DASH } from "../copyHygiene.test-helper";
import { automaticReadingsFromPayloads } from "../readingRules/engine";
import type { GroupMapData } from "../groupMapApi";
import type { CreditAnalysis, SectionData, SectorMetricsData } from "../types";
import type { DropLevel, StageKind } from "./types";

const STAGES: StageKind[] = ["credit", "sector", "industry", "comparative", "company"];

function block(subject: keyof typeof SUBJECTS, stage: StageKind): string {
  return buildBlock(fixtureBundle(SUBJECTS[subject], stage)).text;
}

const NVDA = block("NVDA", "company");
const TSM = block("TSM", "company");
const JPM = block("JPM", "company");
const RIVN = block("RIVN", "company");

/** One whole line of the block, found by its opening cell. */
function lineStartingWith(text: string, head: string): string {
  const hit = text.split("\n").find((l) => l.startsWith(head));
  expect(hit, `no line starting with ${head}`).toBeDefined();
  return hit as string;
}

// ---------------------------------------------------------------------------
// 1. Units, twenty five figures computed by hand
// ---------------------------------------------------------------------------

describe("units: every figure in the unit the contract names", () => {
  it("an already-percent yield is not multiplied again", () => {
    // /api/economic sends 4.94 for the ten year yield, meaning 4.94 percent.
    expect(lineStartingWith(NVDA, "10-Year Treasury Yield |")).toContain("| 4.940% |");
  });

  it("a dollar series delivered in billions prints as the money it is", () => {
    // /api/economic sends five dollar series scaled to billions, and says so in
    // the series name rather than in the unit. lib/format.ts keys that scale
    // off the name, so the block hands it over: 23218 is $23.22T, which is the
    // figure the page's own metric header shows, and used to print $23.2K.
    expect(lineStartingWith(NVDA, "M2 Money Supply ($B) |")).toBe(
      "M2 Money Supply ($B) | $23.22T | 2026-07-01 | rising by $804.60B | 100th",
    );
    expect(lineStartingWith(NVDA, "M1 Money Supply ($B) |")).toContain("| $19.89T |");
    expect(lineStartingWith(NVDA, "Real M2 ($B, inflation-adjusted) |")).toContain("| $6.98T |");
    expect(lineStartingWith(NVDA, "Real Exports ($B) |")).toContain("| $2.79T |");
    expect(lineStartingWith(NVDA, "Real Imports ($B) |")).toContain("| $3.87T |");
    // A dollar series delivered in whole dollars is untouched by that table.
    expect(lineStartingWith(NVDA, "Trade Balance ($M) |")).toContain("| -$88.58B |");
    expect(lineStartingWith(NVDA, "Net Liquidity ($) |")).toContain("| $5.87T |");
  });

  it("the credit payload's own units reach the formatter", () => {
    // /api/credit-banks carries a "$B" unit and an "index" unit, and both used
    // to be collapsed to a bare number here. 3051.5 is $3.05T.
    expect(lineStartingWith(NVDA, "Reserves of Depository Institutions ($B) |")).toContain(
      "| $3.05T |",
    );
    // An index is a level with no unit to print, so it is unchanged.
    expect(lineStartingWith(NVDA, "Financial Stress Index (St. Louis Fed) |")).toContain(
      "| -0.848 |",
    );
  });

  it("a fraction margin from the connections sector block becomes a percent", () => {
    // connections/UNITS.md: sector.medianOperatingMargin is a fraction. 0.0393.
    expect(lineStartingWith(NVDA, "Technology financing |")).toContain(
      "median operating margin 3.9%",
    );
    // sector.shareCoverageBelow2 is a fraction, 0.4245.
    expect(lineStartingWith(NVDA, "Technology financing |")).toContain(
      "share covering interest below two times 42.4%",
    );
  });

  it("a fraction sector figure keeps its own precision in the 2020 line", () => {
    // sector.revenueChange2020 = 0.0584.
    expect(lineStartingWith(NVDA, "Technology 2020 revenue change |")).toBe(
      "Technology 2020 revenue change | 5.8%",
    );
  });

  it("a display-unit matrix cell is printed as the scorecard shows it", () => {
    // /api/sector-metrics is already in display units: Technology ROIC 23.762.
    const row = lineStartingWith(NVDA, "ROIC | % |");
    expect(row).toContain("| 23.762% |");
  });

  it("a money cell in a matrix carries no currency sign", () => {
    // The sector EVA column sums unconverted figures, so a dollar sign there
    // would be wrong. Market Cap is the one converted column.
    const row = lineStartingWith(NVDA, "EVA (Economic Value Added) | $ |");
    expect(row).toContain("| 418B |");
    expect(row).not.toContain("$418B");
  });

  it("HHI is points on a nought to ten thousand scale", () => {
    // industry_structure/UNITS.md: hhi.value 403.7 points, percentile 0.17133.
    expect(lineStartingWith(NVDA, "concentration HHI |")).toBe(
      "concentration HHI | 404 points (higher than 17 percent of industries)",
    );
  });

  it("the five-year move of the top five is percentage points", () => {
    // industry_structure/UNITS.md: shareStability.top5ShareChange5y = 4.93 pp.
    expect(lineStartingWith(NVDA, "share stability |")).toContain(
      "five-year move of the top five 4.9 points",
    );
  });

  it("a log annual growth rate is shown as the compound rate", () => {
    // connections/UNITS.md: every *Cagr5y is a log rate. NVDA 0.496188 a year
    // compounds to exp(0.496188) - 1 = 64.2 percent.
    const g = lineStartingWith(NVDA, "NVDA growth split |");
    expect(g).toContain("company 64.2% a year compound");
    expect(g).toContain("industry 13.9% a year compound");
  });

  it("the growth split prints the compound rates first and the log parts after", () => {
    // The log parts are reconciled by cfFormatters so they add to the total:
    // 49.6 = 13.0 + 36.6.
    expect(lineStartingWith(NVDA, "NVDA growth split |")).toContain(
      "log points a year: total 49.6 = industry 13.0 + share 36.6",
    );
  });

  it("the margin split parts add to the printed total", () => {
    // 62.4 = 6.4 + 4.9 + 51.1, reconciled by cfFormatters.
    expect(lineStartingWith(NVDA, "NVDA operating margin split")).toContain(
      "company 62.4 = industry 6.4 + strategic group 4.9 + company 51.1",
    );
  });

  it("TSM's debt is shown in US dollars and its local figure carries no dollar sign", () => {
    // connections/UNITS.md: totalDebt is TWD, totalDebtUsd is the converted one.
    const b = lineStartingWith(TSM, "TSM balance |");
    expect(b).toContain("total debt 1.06T TWD");
    expect(b).toContain("total debt in US dollars $33.3B");
    expect(b).not.toContain("$1.06T");
  });

  it("TSM's per-share valuation carries its currency code, never a dollar sign", () => {
    // The individual page itself prints "$1990.550" for a New Taiwan dollar
    // figure. The block may not.
    const v = lineStartingWith(TSM, "Valuation |");
    expect(v).toContain("intrinsic per share 1990.550 TWD");
    expect(v).not.toContain("$1990");
  });

  it("TSM's quote is refused as a comparison, with the reason", () => {
    // 434.67 is the American depositary receipt's price in dollars while the
    // intrinsic value is 1990.55 New Taiwan dollars per ordinary share. The two
    // differ in the currency AND in the unit, and the number of ordinary shares
    // per receipt is not on file, so no reconciliation is possible. The block
    // used to print "margin of safety 357.95%, not currency reconciled", which
    // still put the figure in front of a reader.
    const v = lineStartingWith(TSM, "Valuation |");
    expect(v).toContain("intrinsic per share 1990.550 TWD");
    expect(v).toContain("market quote used not applicable");
    expect(v).toContain("margin of safety not applicable");
    expect(v).not.toContain("357.95");
    expect(v).not.toContain("434.670");
    expect(lineStartingWith(TSM, "Valuation price comparison |")).toContain(
      "the number of ordinary shares per receipt is not on file",
    );
    const r = lineStartingWith(TSM, "Reverse DCF |");
    expect(r).toContain("not applicable");
    expect(r).toContain("depositary receipt in USD");
    expect(r).not.toContain("434.670");
  });

  it("the quote currency comes off the individual payload, not a second request", () => {
    // One payload, one answer: the currency and the figures it describes can no
    // longer disagree because one of two requests failed.
    expect(lineStartingWith(TSM, "Company | TSM")).toContain("market quote currency USD");
    expect(lineStartingWith(NVDA, "Company | NVDA")).toContain("market quote currency USD");
  });

  it("a company quoted in its own reporting currency carries no warning", () => {
    // NVDA reports in US dollars and is quoted in them, so nothing is said.
    expect(lineStartingWith(NVDA, "Valuation |")).not.toContain("not currency reconciled");
    expect(NVDA).not.toContain("Valuation currency |");
  });

  it("a ranking cell for a Korean filer carries no dollar sign except the market cap", () => {
    const row = lineStartingWith(NVDA, "000660.KS |");
    expect(row).toContain("| 860675.330 |");
    expect(row).toContain("| $824B |");
  });

  it("JPM's guards are printed with the backend's own reasons", () => {
    expect(NVDA).not.toContain("JPM not applicable");
    expect(lineStartingWith(JPM, "JPM not applicable | interestCoverage |")).toBe(
      "JPM not applicable | interestCoverage | Interest expense is a bank's cost of funding, " +
        "not a fixed charge covered out of operating income, so interest coverage does not " +
        "measure the same thing here.",
    );
    expect(lineStartingWith(JPM, "JPM not applicable | grossMargin |")).toContain(
      "the stored gross margin is 1.0 by construction",
    );
  });

  it("JPM's interest stress and credit standing say why they do not apply", () => {
    expect(lineStartingWith(JPM, "JPM interest stress |")).toContain("not applicable");
    expect(lineStartingWith(JPM, "JPM credit standing |")).toContain("not applicable");
  });

  it("RIVN has no growth split and says so", () => {
    expect(lineStartingWith(RIVN, "RIVN growth split |")).toContain("not available");
    expect(lineStartingWith(RIVN, "RIVN 2020 revenue change |")).toBe(
      "RIVN 2020 revenue change | not available",
    );
  });

  it("RIVN's negative coverage gets its own sentence rather than a ratio", () => {
    expect(lineStartingWith(RIVN, "RIVN credit standing |")).toContain(
      "operating income is negative, so the coverage ratio reads -13.1x",
    );
  });

  it("a ten-year level percentile is printed as an ordinal", () => {
    // Real GDP Growth sits in the 23rd percentile of its trailing ten years.
    expect(lineStartingWith(NVDA, "Real GDP Growth | ")).toBe(
      "Real GDP Growth | 1.500% | 2026-04-01 | stable, moved 1.00 | 23rd",
    );
  });

  it("the Fed model's spread is points and its analyst growth is a decimal", () => {
    expect(lineStartingWith(NVDA, "Fed model |")).toContain("spread -0.533 points");
    expect(lineStartingWith(NVDA, "Fed model, forward |")).toContain("analyst growth 10.5%");
  });

  it("every rate inside the S&P 500 valuation is a decimal", () => {
    // payout 0.85, growth 0.0664, impliedERP 0.0339.
    expect(lineStartingWith(NVDA, "S&P 500 valuation |")).toContain("payout 85.0%");
    expect(lineStartingWith(NVDA, "S&P 500 valuation |")).toContain("growth 6.64%");
    expect(lineStartingWith(NVDA, "S&P 500 valuation, returns |")).toContain(
      "implied equity risk premium 3.39%",
    );
  });

  it("a commodity keeps its own unit string", () => {
    expect(lineStartingWith(NVDA, "Copper | ")).toContain("13542.82 $ / metric ton");
  });

  it("an exposure row mixes times, fractions and points correctly", () => {
    // connections/UNITS.md: interestCoverage times, the interest share a
    // fraction, grossMarginChange2020to2022 and shareChange5y points. Net debt
    // to EBITDA keeps two decimals because it is below one: at one decimal it
    // printed "0.0x", which is not the figure.
    expect(lineStartingWith(NVDA, "NVDA | NVIDIA Corporation |")).toBe(
      "NVDA | NVIDIA Corporation | $130.5B | 329.8x | 0.02x | 0.13% | -6.8% | 2.94 points | " +
        "1.287x | 9.36 points",
    );
  });

  it("a ratio below one keeps two decimals and never reads as a negative nothing", () => {
    // INTC's interest coverage is a small negative number. At one decimal it
    // printed "-0.0x", which is neither the figure nor zero.
    const intc = lineStartingWith(NVDA, "INTC | Intel Corporation |");
    expect(intc).not.toContain("| -0.0x |");
    expect(intc).not.toContain("| 0.0x |");
  });

  it("a negative dollar amount carries its sign in front of the currency", () => {
    // cfFormatters.usd wrote "$-4.2B", which reads as a dollar sign and then a
    // separate figure. Accounting convention puts the sign first. RIVN's
    // economic value added and its operating income are both negative.
    expect(lineStartingWith(RIVN, "EVA | Profitability & EVA |")).toContain("-$4.2B");
    expect(lineStartingWith(RIVN, "Normalized earnings |")).toContain(
      "reported operating income -$3.6B",
    );
    expect(lineStartingWith(RIVN, "RIVN balance |")).toContain(
      "operating income in US dollars -$3.6B",
    );
    // lib/format.ts formatUnitValue still writes "$-88.58B" on an economic
    // series, and that module is not this block's to change.
  });

  it("a rounded-to-nothing share drops its sign", () => {
    // sharePct(-0.0000004) printed "-0.00%", which reads as a small loss where
    // the rounded figure is nothing at all.
    expect(NVDA).not.toContain("-0.00%");
  });

  it("the strategic group's return on capital is the PRE-tax fraction", () => {
    // industry_structure/UNITS.md: medianPreTaxRoic 0.0671, range -1.0321 to 0.9091.
    expect(lineStartingWith(NVDA, "group | High R&D intensity, high value-added share |")).toContain(
      "| 6.7% | -103.2% to 90.9% |",
    );
  });

  it("a metricHistory figure is a DECIMAL on the individual surface", () => {
    // NVDA roic 0.65748 in 2026 and 0.17136 in 2021.
    expect(lineStartingWith(NVDA, "ROIC | Profitability & EVA |")).toBe(
      "ROIC | Profitability & EVA | 65.748% | 2026 | 17.136% | 2021",
    );
  });

  it("uses of cash states each line and its share of operating cash flow", () => {
    const u = lineStartingWith(NVDA, "Uses of cash, fiscal 2026 |");
    expect(u).toContain("operating cash flow $102.7B");
    // The payload's own field names are rnd and debtRepaid; the block prints
    // what they mean, not the key.
    expect(u).toContain("capital spending $6.0B (5.9% of operating cash flow)");
    expect(u).toContain("research and development $18.5B (18.0% of operating cash flow)");
    expect(u).toContain("debt repaid not reported");
    expect(u).not.toContain("rnd ");
    expect(u).toContain("buybacks not reported");
  });

  it("the profit pool prints shares as fractions and amounts in US dollars", () => {
    expect(lineStartingWith(NVDA, "Semiconductors | 511 |")).toBe(
      "Semiconductors | 511 | $1.2T | 16.3% | 26.4% | $308.9B | 31.0% | 23.1%",
    );
  });

  it("the value system's HHI is points and its growth is compounded", () => {
    const v = lineStartingWith(NVDA, "Value system focal |");
    expect(v).toContain("HHI 404 points");
    expect(v).toContain("HHI five years ago 334 points");
    expect(v).toContain("five-year revenue growth 13.9% a year compound");
  });

  it("the sector value score and rank come from the scorecard", () => {
    // The payload counts twelve peers because a grouping query returned a
    // nameless twelfth column, which the matrix above drops. Eleven columns
    // are printed, so the count is not printed against them: eleven sectors
    // each reading "rank 1 of 12" is a count of something the reader cannot
    // see.
    expect(lineStartingWith(NVDA, "Technology value score |")).toBe(
      "Technology value score | 74.45 | rank 1",
    );
  });
});

// ---------------------------------------------------------------------------
// 2. The owner's classification, checked against the markdown by eye
// ---------------------------------------------------------------------------

describe("classification of the subject's sector", () => {
  it("prints every reading of a metric with its verdict for this sector", () => {
    // src/content/economic/01-GDP-Growth.md, Part 3: Technology is favored
    // under the first two readings and not favored under the last two. The
    // earnings link follows on the same line.
    expect(lineStartingWith(NVDA, "Real GDP Growth (economic 1) |").split(" | earnings link ")[0])
      .toBe(
        "Real GDP Growth (economic 1) | Above 3% and accelerating -> favored | " +
          "Around 2% (trend growth) -> favored | 0% to 2% and decelerating -> not favored | " +
          "Negative (two or more quarters) -> not favored",
      );
  });

  it("prints the first sentence of the Part 4 earnings link, word for word", () => {
    const row = lineStartingWith(JPM, "Real GDP Growth (economic 1) |");
    expect(row.split(" | earnings link ")[1]).toBe(
      "Banks earn on loan volume and credit quality, both of which expand when the economy " +
        "is growing and contract when it is shrinking.",
    );
    // The metric's name and number are not repeated for the link.
    expect(JPM).not.toContain("Real GDP Growth (economic 1) earnings link");
  });

  it("carries a credit metric's classification as well as an economic one", () => {
    expect(NVDA).toContain("(credit 1) |");
    expect(NVDA).toContain("(credit 17) |");
  });

  it("the credit stage carries no classification lines at all", () => {
    const credit = block("NVDA", "credit");
    expect(credit).not.toContain("-> favored");
    expect(credit).not.toContain("earnings link");
  });
});

// ---------------------------------------------------------------------------
// 3. Hygiene
// ---------------------------------------------------------------------------

const HYGIENE = /NaN|undefined|\bnull\b|\[object|% percent|\$[0-9.,]+[TBM]? ?(TWD|KRW|JPY|EUR)/;

describe("hygiene over every built block", () => {
  const cases: [string, string][] = [
    ["credit", block("NVDA", "credit")],
    ["sector", block("NVDA", "sector")],
    ["industry", block("NVDA", "industry")],
    ["comparative", block("NVDA", "comparative")],
    ["company NVDA", NVDA],
    ["company TSM", TSM],
    ["company JPM", JPM],
    ["company RIVN", RIVN],
  ];

  for (const [name, text] of cases) {
    it(`${name} carries no leaked placeholder or mismatched currency`, () => {
      const bad = text.split("\n").filter((l) => HYGIENE.test(l));
      expect(bad, bad.slice(0, 3).join("\n")).toHaveLength(0);
    });

    it(`${name} carries no em dash`, () => {
      expect(text.includes(EM_DASH)).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// 4. Section presence per stage
// ---------------------------------------------------------------------------

describe("stage scoping", () => {
  const expected: Record<StageKind, string[]> = {
    credit: ["SUBJECT", "ECONOMY", "SECTOR FINANCING"],
    sector: ["SUBJECT", "ECONOMY", "SECTOR"],
    industry: ["SUBJECT", "ECONOMY", "SECTOR", "INDUSTRY"],
    comparative: ["SUBJECT", "ECONOMY", "SECTOR", "INDUSTRY", "PEERS"],
    company: ["SUBJECT", "ECONOMY", "SECTOR", "INDUSTRY", "PEERS", "COMPANY"],
  };
  const absent: Record<StageKind, string[]> = {
    credit: ["SECTOR\n", "INDUSTRY", "PEERS", "COMPANY"],
    sector: ["INDUSTRY", "PEERS", "COMPANY", "SECTOR FINANCING"],
    industry: ["PEERS", "COMPANY", "SECTOR FINANCING"],
    comparative: ["COMPANY", "SECTOR FINANCING"],
    company: ["SECTOR FINANCING"],
  };

  for (const stage of STAGES) {
    it(`${stage} carries exactly the sections its stage reaches`, () => {
      const text = block("NVDA", stage);
      const headers = text.split("\n").filter((l) => /^[A-Z][A-Z' ]+$/.test(l));
      for (const header of expected[stage]) expect(headers).toContain(header);
      for (const header of absent[stage]) expect(headers).not.toContain(header.trim());
    });
  }

  it("the credit stage carries the eleven sectors' financing", () => {
    const text = block("NVDA", "credit");
    expect(text).toContain("Financing of each sector that answered (11 of eleven)");
    expect(text).toContain("Utilities financing |");
    expect(text).toContain("Real Estate financing |");
  });
});

// ---------------------------------------------------------------------------
// 5. One source failing costs that section one line and nothing else
// ---------------------------------------------------------------------------

describe("a failing source", () => {
  it("prints one Not loaded line and leaves the rest of the block intact", () => {
    const whole = buildBlock(fixtureBundle(SUBJECTS.NVDA, "company")).text;
    const broken = buildBlock(
      fixtureBundle(SUBJECTS.NVDA, "company", {}, new Set(["structure"])),
    ).text;
    expect(broken).toContain("Not loaded: the Semiconductors structure figures");
    expect(broken).not.toContain("concentration HHI |");
    // Everything outside the structure payload still ships.
    expect(broken).toContain("Technology value score | 74.45");
    expect(broken).toContain("NVDA growth split |");
    expect(broken).toContain("Strategic group map | Semiconductors");
    expect(byteLength(broken)).toBeLessThan(byteLength(whole));
  });

  it("a failing economic payload leaves the credit series and the rest standing", () => {
    const broken = buildBlock(
      fixtureBundle(SUBJECTS.NVDA, "company", {}, new Set(["economic"])),
    ).text;
    expect(broken).toContain("Not loaded: the economic series");
    expect(broken).toContain("Credit and banking series (17)");
    expect(broken).toContain("Technology value score | 74.45");
  });
});

// ---------------------------------------------------------------------------
// 6. Size and the drop order
// ---------------------------------------------------------------------------

/**
 * The production path, exactly: every source this module loads, the automatic
 * readings the loader attaches on every click, and a full six kilobytes of
 * reader notes. There is no test-only ceiling any more, because the cap is now
 * a figure the ladder can actually reach on every stage.
 */
const READINGS = automaticReadingsFromPayloads(
  stageFixture<SectionData>("economic"),
  stageFixture<SectionData>("creditBanks"),
  FIXTURE_NOW,
);
const FULL_NOTES = "n".repeat(6 * 1024);

function production(subject: keyof typeof SUBJECTS, stage: StageKind) {
  return buildBlock(
    fixtureBundle(SUBJECTS[subject], stage, {
      automaticReadings: READINGS,
      readerNotes: FULL_NOTES,
    }),
  );
}

describe("size", () => {
  it("every stage of every subject fits the cap on the production path", () => {
    for (const key of ["NVDA", "TSM", "JPM", "RIVN"] as (keyof typeof SUBJECTS)[]) {
      for (const stage of STAGES) {
        const built = production(key, stage);
        expect(built.bytes, `${key} ${stage} is ${built.bytes} bytes`).toBeLessThanOrEqual(
          SIZE_CAP_BYTES,
        );
        expect(built.stillOver, `${key} ${stage} is over the cap`).toBe(false);
        expect(built.text, `${key} ${stage}`).not.toContain("Still over the size limit");
      }
    }
  });

  it("a stage that fits gives nothing up and announces nothing", () => {
    for (const stage of ["credit", "sector", "industry"] as StageKind[]) {
      const built = production("NVDA", stage);
      expect(built.dropped, `${stage} dropped ${built.dropped.join("; ")}`).toHaveLength(0);
      expect(built.text.startsWith("Dropped to fit the size limit:"), stage).toBe(false);
    }
  });

  it("a step that changed nothing is applied but never announced", () => {
    // The ladder is one fixed order for every stage. The Comparative block
    // carries no company section, so the rival rung cannot change it, and the
    // note must not claim it gave up rivals it never had.
    const built = production("NVDA", "comparative");
    expect(built.dropped.length).toBeGreaterThan(0);
    expect(built.dropped.join(" ")).not.toContain("similarly structured companies");
  });

  it("the company stage states every reduction it actually made", () => {
    for (const key of ["NVDA", "TSM", "JPM", "RIVN"] as (keyof typeof SUBJECTS)[]) {
      const built = production(key, "company");
      expect(built.dropped.length, key).toBeGreaterThan(0);
      expect(built.text.startsWith("Dropped to fit the size limit:"), key).toBe(true);
      // Each ranking rung replaces the one above it, so at most one survives.
      expect(built.dropped.filter((d) => d.includes("peer ranking rows")).length).toBeLessThanOrEqual(1);
    }
  });

  it("the drops are applied in the owner's order and each one shrinks the block", () => {
    const bundle = fixtureBundle(SUBJECTS.NVDA, "company");
    const steps: DropLevel[] = [
      NO_DROPS,
      { ...NO_DROPS, evolutionEnds: true },
      { ...NO_DROPS, evolutionEnds: true, nullMatrixRows: true },
      { ...NO_DROPS, evolutionEnds: true, nullMatrixRows: true, rivalsNearest: true },
      { ...NO_DROPS, evolutionEnds: true, nullMatrixRows: true, rivalsNearest: true, rankingTopRanked: 25 },
      { ...NO_DROPS, evolutionEnds: true, nullMatrixRows: true, rivalsNearest: true, rankingTopRanked: 15 },
      { ...NO_DROPS, evolutionEnds: true, nullMatrixRows: true, rivalsNearest: true, rankingTopRanked: 10 },
      {
        evolutionEnds: true,
        nullMatrixRows: true,
        rivalsNearest: true,
        rankingTopRanked: 10,
        unaffectedEarningsLinks: true,
      },
    ];
    const sizes = steps.map((d) => byteLength(renderBlock(bundle, d, null)));
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i], `step ${i} did not shrink the block`).toBeLessThan(sizes[i - 1]);
    }
  });

  it("computing the drop-independent parts once renders the same bytes as recomputing them", () => {
    // buildBlock renders the body once and then once per fired rung, and hands
    // every pass the same economy series list, strategic group map and company
    // block. Building each stage through the uncached parts is the path the
    // block took before that memo existed, so the two must agree byte for byte
    // and give up the same things.
    for (const key of Object.keys(SUBJECTS) as (keyof typeof SUBJECTS)[]) {
      for (const stage of STAGES) {
        const bundle = fixtureBundle(SUBJECTS[key], stage);
        const once = buildBlock(bundle);
        const every = buildBlock(bundle, SIZE_CAP_BYTES, uncachedParts(bundle));
        expect(once.text, `${key} ${stage}`).toBe(every.text);
        expect(once.dropped, `${key} ${stage}`).toEqual(every.dropped);
      }
    }
  });

  it("no drop ever removes a metric's latest value, the subject's figures or the company block", () => {
    const bundle = fixtureBundle(SUBJECTS.NVDA, "company");
    const all = renderBlock(
      bundle,
      {
        evolutionEnds: true,
        nullMatrixRows: true,
        rivalsNearest: true,
        rankingTopRanked: 10,
        unaffectedEarningsLinks: true,
      },
      null,
    );
    expect(all).toContain("Economic series (75)");
    expect(all).toContain("Credit and banking series (17)");
    expect(all).toContain("10-Year Treasury Yield | 4.940%");
    expect(all).toContain("Technology value score | 74.45");
    expect(all).toContain("NVDA | NVIDIA Corporation |");
    expect(all).toContain("ROIC | Profitability & EVA | 65.748%");
    // The subject's own ranking row survives the ranking limit.
    expect(all).toContain("\nNVDA | High R&D intensity, high value-added share |");
  });
});
// ---------------------------------------------------------------------------
// 7. The optional inputs
// ---------------------------------------------------------------------------

describe("optional inputs", () => {
  it("an automatic reading prints beside its metric once one is supplied", () => {
    const text = buildBlock(
      fixtureBundle(SUBJECTS.NVDA, "sector", {
        automaticReadings: {
          economic: { 1: "Around 2% (trend growth)" },
          // Credit 17 is the financial stress index, a name the economic
          // payload does not also carry, so the two surfaces cannot be mixed up.
          credit: { 17: "Below zero and falling" },
        },
      }),
    ).text;
    expect(lineStartingWith(text, "Real GDP Growth | ")).toContain(
      "| reading Around 2% (trend growth)",
    );
    expect(lineStartingWith(text, "Financial Stress Index (St. Louis Fed) | ")).toContain(
      "| reading Below zero and falling",
    );
  });

  it("with no readings supplied the column is simply absent", () => {
    expect(lineStartingWith(NVDA, "Real GDP Growth | ")).not.toContain("reading");
  });

  it("reader notes are appended word for word under their own header", () => {
    const notes = "I concluded the cycle is late and semiconductors are priced for perfection.";
    const text = buildBlock(
      fixtureBundle(SUBJECTS.NVDA, "sector", { readerNotes: notes }),
    ).text;
    expect(text).toContain("READER'S EARLIER CONCLUSIONS");
    expect(text).toContain(notes);
  });

  it("the value system names only the focal industry until picks are supplied", () => {
    // What the block can honestly say is what IT gathered. Whether the reader
    // picked a supplier is not something this module can know.
    expect(NVDA).toContain(
      "Value system: no supplier or buyer industry was gathered for this block",
    );
    expect(NVDA).not.toContain("the reader has picked none");
    const text = buildBlock(
      fixtureBundle(SUBJECTS.NVDA, "industry", {
        valueSystemPicks: { supplier: "Semiconductor Equipment & Materials" },
      }),
    ).text;
    expect(text).not.toContain("no supplier or buyer industry was gathered");
  });
});

// ---------------------------------------------------------------------------
// 8. The subject line
// ---------------------------------------------------------------------------

describe("the subject line", () => {
  it("names the stage, the three subjects and the fiscal years in play", () => {
    expect(lineStartingWith(NVDA, "stage |")).toBe("stage | company");
    expect(lineStartingWith(NVDA, "sector |")).toBe("sector | Technology");
    expect(lineStartingWith(NVDA, "industry |")).toBe("industry | Semiconductors");
    expect(lineStartingWith(NVDA, "company |")).toBe("company | NVDA, NVIDIA Corporation");
    const years = lineStartingWith(NVDA, "fiscal years in play |");
    expect(years).toContain("sector 2025");
    expect(years).toContain("industry 2025");
    expect(years).toContain("company 2026");
  });

  it("marks the subject's own column on every matrix of every stage", () => {
    // The sector matrix on four stages, and the industry matrix on three.
    const cases: [StageKind, (string | null)[]][] = [
      // The Sector stage also prints the industries-within-the-sector matrix,
      // which has no subject column: the reader has not picked an industry yet.
      ["sector", ["Technology (subject)", null]],
      ["industry", ["Technology (subject)", "Semiconductors (subject)"]],
      ["comparative", ["Technology (subject)", "Semiconductors (subject)"]],
      ["company", ["Technology (subject)", "Semiconductors (subject)"]],
    ];
    for (const [stage, marks] of cases) {
      const text = block("NVDA", stage);
      const headers = text.split("\n").filter((l) => l.startsWith("metric | unit |"));
      expect(headers, `${stage} matrices`).toHaveLength(marks.length);
      for (let i = 0; i < marks.length; i++) {
        const mark = marks[i];
        if (mark == null) {
          expect(headers[i], `${stage} matrix ${i}`).not.toContain("(subject)");
          continue;
        }
        // The subject is the FIRST column after metric and unit, and the only
        // cell anywhere in the header that carries the mark.
        expect(headers[i].split(" | ")[2], `${stage} matrix ${i}`).toBe(mark);
        expect(headers[i].split("(subject)")).toHaveLength(2);
      }
      for (const mark of marks) {
        if (mark != null) expect(text).toContain(`column ${mark} | companies `);
      }
    }
    // The Credit stage prints no matrix at all, so it marks nothing.
    expect(block("NVDA", "credit")).not.toContain("(subject)");
  });

  it("the subject's column is the one the subject line names, not a look-alike", () => {
    const text = block("JPM", "company");
    expect(lineStartingWith(text, "metric | unit |").split(" | ")[2]).toBe(
      "Financial Services (subject)",
    );
    const industry = text
      .split("\n")
      .filter((l) => l.startsWith("metric | unit |"))[1]
      .split(" | ")[2];
    expect(industry).toBe("Banks - Diversified (subject)");
  });
});

// ---------------------------------------------------------------------------
// 9. A column or row the backend left unnamed
// ---------------------------------------------------------------------------

/** Every scorecard-shaped payload that was captured, by fixture name. */
const MATRIX_FIXTURES = [
  "sectorMetrics",
  "sectorMetricsBlankColumn",
  "industryMetrics_Technology",
  "industryMetrics_FinancialServices",
  "industryMetrics_ConsumerCyclical",
  "scorecard_Semiconductors",
  "scorecard_BanksDiversified",
  "scorecard_AutoMfg",
];

const RANKING_FIXTURES = [
  "ranking_Semiconductors",
  "ranking_BanksDiversified",
  "ranking_AutoMfg",
];

describe("a column or row the backend left unnamed", () => {
  it("the captured payload really does carry a nameless twelfth sector", () => {
    const data = stageFixture<SectorMetricsData>("sectorMetricsBlankColumn");
    expect(data.sectors.filter((s) => s.trim() === "")).toHaveLength(1);
    expect(data.data[""]).toBeTruthy();
    // It is one company, which is what made it junk rather than a sector.
    expect((data.data[""] as unknown as Record<string, number>)._companies).toBe(1);
  });

  it("the nameless column is printed in no header, no column line and no row", () => {
    const data = stageFixture<SectorMetricsData>("sectorMetricsBlankColumn");
    const lines = matrixTable(data, "Industrials", { withColumnMeta: true });
    const header = lines[0].split(" | ");
    // metric, unit, then one cell per named sector. Eleven, never twelve.
    expect(header).toHaveLength(13);
    expect(header[2]).toBe("Industrials (subject)");
    expect(lines.filter((l) => l.startsWith("column "))).toHaveLength(11);
    expect(lines.some((l) => /^column\s*\|/.test(l))).toBe(false);

    for (const row of lines.slice(12)) {
      expect(row.split(" | "), row.slice(0, 60)).toHaveLength(header.length);
    }
    // The junk company's own figures reach no cell.
    expect(lines.join("\n")).not.toContain("−110.924%");
  });

  it("a nameless row is dropped from a ranking too, header and rows agreeing", () => {
    const ranking = stageFixture<SectorMetricsData>("ranking_Semiconductors");
    const withBlank: SectorMetricsData = {
      ...ranking,
      sectors: [...ranking.sectors, ""],
      data: { ...ranking.data, "": ranking.data[ranking.sectors[0]] },
    };
    const lines = rankingTable(withBlank);
    // The money caption, then the header, then one row per named company.
    expect(lines).toHaveLength(2 + ranking.sectors.length);
    const width = lines[1].split(" | ").length;
    for (const row of lines.slice(2)) expect(row.split(" | ")).toHaveLength(width);
  });

  it("every captured matrix has as many cells in each row as in its header", () => {
    for (const name of MATRIX_FIXTURES) {
      const data = stageFixture<SectorMetricsData>(name);
      const subjects = [null, data.sectors.find((s) => s.trim().length > 0) ?? null];
      for (const subject of subjects) {
        const lines = matrixTable(data, subject, { withColumnMeta: true });
        const width = lines[0].split(" | ").length;
        const metas = lines.filter((l) => l.startsWith("column ")).length;
        // Two label cells plus one per named column, and one meta line each.
        expect(width - 2, `${name} header`).toBe(metas);
        for (const row of lines.slice(1 + metas)) {
          expect(row.split(" | ").length, `${name}: "${row.slice(0, 60)}"`).toBe(width);
        }
      }
    }
  });

  it("every captured ranking has as many cells in each row as in its header", () => {
    for (const name of RANKING_FIXTURES) {
      const data = stageFixture<SectorMetricsData>(name);
      const lines = rankingTable(data);
      const width = lines[1].split(" | ").length;
      for (const row of lines.slice(2)) {
        expect(row.split(" | ").length, `${name}: "${row.slice(0, 40)}"`).toBe(width);
      }
    }
  });

  it("no line of any block leaves a cell empty between its separators", () => {
    for (const stage of STAGES) {
      for (const key of ["NVDA", "JPM"] as (keyof typeof SUBJECTS)[]) {
        const bad = block(key, stage)
          .split("\n")
          .filter((l) => l.includes("|") && (/\|\s*\|/.test(l) || /\|\s*$/.test(l)));
        expect(bad, `${key} ${stage}: ${bad.slice(0, 2).join(" // ")}`).toHaveLength(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 10. The peer ranking the Comparative stage sees
// ---------------------------------------------------------------------------

describe("the peer ranking under the size cap", () => {
  it("the payload's own order is rank order, so the leading rows are the best ranked", () => {
    const ranking = stageFixture<SectorMetricsData>("ranking_Semiconductors");
    const ranks = ranking.sectors.map(
      (t) => (ranking.data[t] as unknown as Record<string, number>).score,
    );
    for (let i = 1; i < ranks.length; i++) {
      if (ranks[i] == null || ranks[i - 1] == null) continue;
      expect(ranks[i], `row ${i} scores above row ${i - 1}`).toBeLessThanOrEqual(ranks[i - 1]);
    }
  });

  it("the comparative stage keeps the highest ranked, not the largest alone", () => {
    const text = block("NVDA", "comparative");
    const printed = text
      .split("\n")
      .filter((l) => /^[A-Z0-9][A-Za-z0-9.\-]* \| /.test(l) && l.includes(" | group not reported | ")
        || /^[A-Z0-9][A-Za-z0-9.\-]* \| (High|Low) /.test(l));
    const ranks = printed
      .map((l) => Number(l.split(" | ")[2]))
      .filter((n) => Number.isFinite(n));
    // Ranks one and two are the industry's best and were absent when only the
    // ten largest by market cap survived.
    expect(ranks).toContain(1);
    expect(ranks).toContain(2);
    expect(Math.min(...ranks)).toBe(1);
  });

  it("the header states exactly which rows are printed and keeps the industry total", () => {
    const head = lineStartingWith(block("NVDA", "comparative"), "Peer ranking for Semiconductors");
    expect(head).toContain("companies in the industry 561");
    expect(head).toContain("the ten largest by market cap");
    expect(head).toContain("highest ranked");
    expect(head).toContain("in rank order, best first");
    const printed = Number(/rows printed (\d+)/.exec(head)?.[1]);
    expect(printed).toBeGreaterThan(10);
    expect(printed).toBeLessThan(561);
    // The count in the header is the number of company rows actually printed.
    const rows = block("NVDA", "comparative")
      .split("\n")
      .slice(
        block("NVDA", "comparative").split("\n").indexOf(head) + 3,
      )
      .filter((l) => l.includes(" | "));
    expect(rows.length).toBeGreaterThanOrEqual(printed);
  });

  it("the company stage keeps the subject and its group as well", () => {
    const head = lineStartingWith(NVDA, "Peer ranking for Semiconductors");
    expect(head).toContain("the subject and the ten best ranked of its strategic group");
    expect(NVDA).toContain("\nNVDA | High R&D intensity, high value-added share |");
  });

  it("the limited set is the subject, its group, the largest and the best ranked", () => {
    const ranking = stageFixture<SectorMetricsData>("ranking_Semiconductors");
    const groups = new Map<string, string>([["AMD", "a group of two"], ["INTC", "a group of two"]]);
    const kept = limitedTickers(ranking, groups, {
      ticker: "NVDA",
      groupLabel: "a group of two",
      largest: 10,
      groupKept: 10,
      topRanked: 10,
    });
    expect(kept).toContain("NVDA");
    expect(kept).toContain("AMD");
    expect(kept).toContain("INTC");
    // The ten best ranked are the payload's first ten rows.
    for (const t of ranking.sectors.slice(0, 10)) expect(kept).toContain(t);
    // Rank order is preserved.
    const positions = kept.map((t) => ranking.sectors.indexOf(t));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});

// ---------------------------------------------------------------------------
// 11. Every figure absent at once
// ---------------------------------------------------------------------------

/**
 * A copy of `value` with every finite number replaced by null.
 *
 * This is the one case no fixture covers: a payload that answered but carries
 * nothing. It produced "not availablex", "not available points" and "not
 * available% a year compound" wherever a unit was written into the template by
 * hand instead of going through a suffix-aware helper.
 */
function nulled<T>(value: T): T {
  if (typeof value === "number") return null as unknown as T;
  if (Array.isArray(value)) return value.map(nulled) as unknown as T;
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = nulled(v);
    return out as unknown as T;
  }
  return value;
}

/**
 * A unit glued straight onto a word that is not a figure.
 *
 * The last two catch the separated forms of the same bug, where the unit was
 * written after the formatter's own output rather than inside it, so it reads
 * as "not available points" and "not available% a year compound".
 */
const GLUED = [
  /not available\S/,
  /n\/a\S/,
  /not available (points|index points|a year|of operating cash flow)/,
  /not available% /,
];

function assertNoGluedUnits(text: string, where: string): void {
  for (const l of text.split("\n")) {
    // The legend names the three words in quotation marks, so a closing quote
    // follows one of them. It is the one line in the block that may.
    if (l === ABSENCE_LEGEND) continue;
    for (const bad of GLUED) {
      expect(bad.test(l), `${where}: ${l.slice(0, 160)}`).toBe(false);
    }
    expect(l.includes("undefined"), `${where}: ${l.slice(0, 160)}`).toBe(false);
    expect(l.includes("NaN"), `${where}: ${l.slice(0, 160)}`).toBe(false);
  }
}

describe("a payload that answered and carries no figure at all", () => {
  it("never glues a unit to the missing word and never leaks a raw null", () => {
    for (const key of ["NVDA", "TSM", "JPM", "RIVN"] as (keyof typeof SUBJECTS)[]) {
      for (const stage of STAGES) {
        const bundle = nulled(fixtureBundle(SUBJECTS[key], stage));
        const text = renderBlock(bundle, NO_DROPS, null);
        assertNoGluedUnits(text, `${key} ${stage} nulled`);
        for (const l of text.split("\n")) {
          expect(l.includes("null"), `${key} ${stage}: ${l}`).toBe(false);
        }
      }
    }
  });

  it("the block with its real figures carries neither either", () => {
    for (const key of ["NVDA", "TSM", "JPM", "RIVN"] as (keyof typeof SUBJECTS)[]) {
      for (const stage of STAGES) {
        assertNoGluedUnits(block(key, stage), `${key} ${stage}`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 12. What the decks asked for and the block did not carry
// ---------------------------------------------------------------------------

describe("the figures the connect decks name", () => {
  it("the Sector stage carries every industry's own financial averages", () => {
    // sec.connect.industries asks for them in so many words, and until now the
    // industries matrix was loaded only from the Industry stage down.
    const sector = block("NVDA", "sector");
    expect(sector).toContain("Industry matrix, every industry inside Technology");
    expect(sector).toContain("column Semiconductors | companies ");
    // And the sector's own eleven-sector matrix is still there, marked.
    expect(sector).toContain("Technology (subject)");
  });

  it("the Company stage carries the cost of capital and how it was built", () => {
    // indiv.connect.valuation asks for "the cost of capital, its components
    // and how they were built"; waccBuild was never serialised.
    const w = lineStartingWith(NVDA, "Cost of capital |");
    expect(w).toContain("weighted average ");
    expect(w).toContain("cost of equity ");
    const inputs = lineStartingWith(NVDA, "Cost of capital, inputs |");
    expect(inputs).toContain("risk-free rate 4.94%");
    expect(inputs).toContain("beta method a bottom-up beta from one industry (bottom_up_single)");
    expect(inputs).toContain("beta confidence high");
    expect(NVDA).toContain("Cost of capital, weights |");
  });

  it("TSM's cost of capital is in its own reporting currency", () => {
    // Market cap and total debt are stored in the filer's currency, so a
    // dollar sign on them would be wrong by about thirty times.
    const w = lineStartingWith(TSM, "Cost of capital, weights |");
    expect(w).toContain("TWD");
    expect(w).not.toContain("$2.2T");
  });

  it("the Company stage carries the company against its industry and group", () => {
    // /api/individual/{ticker}/spreads, which the peers question asks for.
    expect(NVDA).toContain("Company against its benchmarks |");
    expect(NVDA).toContain(
      "benchmark | unit | company | industry median | group median | " +
        "industry weighted average | sector weighted average",
    );
    // The same metric label also heads a row of the industry matrix above, so
    // the benchmark row is found by the cells only it carries.
    const row = NVDA.split("\n").find(
      (l) => l.startsWith("DuPont · Asset Turnover | x |") && l.endsWith(" of 20"),
    );
    expect(row, "no benchmark row for asset turnover").toBeDefined();
    expect(row).toContain("| 1.044× | 0.496× | 0.481× |");
  });
});

// ---------------------------------------------------------------------------
// 13. A bank's block does not contradict itself
// ---------------------------------------------------------------------------

describe("the connections guard reaches the individual payload's blocks", () => {
  it("a bank's synthetic rating, spread and coverage are withheld with the reason", () => {
    const credit = lineStartingWith(JPM, "Credit analysis |");
    expect(credit).toContain("kind bank");
    expect(credit).toContain("synthetic rating not applicable");
    expect(credit).toContain("default spread not applicable");
    expect(credit).toContain("interest coverage not applicable");
    expect(credit).not.toContain("Caa/CCC");
    expect(lineStartingWith(JPM, "Credit analysis not applicable |")).toContain(
      "synthetic rating, default spread, investment grade, interest coverage",
    );
  });

  it("a bank's cost of goods and gross margin gap are withheld too", () => {
    expect(lineStartingWith(JPM, "Cost structure company |")).toContain(
      "cost of goods not applicable",
    );
    expect(JPM).not.toContain("Generic strategy gross margin gap");
    expect(JPM).not.toContain("Generic strategy cost of goods plus selling and admin");
    expect(lineStartingWith(JPM, "Cost structure not applicable |")).toContain("cost of goods");
    // The lines that do not lean on a cost of revenue survive.
    expect(JPM).toContain("Generic strategy selling and admin to revenue");
  });

  it("a company the guard does not cover keeps every one of those figures", () => {
    const credit = lineStartingWith(NVDA, "Credit analysis |");
    expect(credit).not.toContain("not applicable");
    expect(NVDA).toContain("Generic strategy gross margin gap");
    expect(lineStartingWith(NVDA, "Cost structure company |")).not.toContain(
      "cost of goods not applicable",
    );
  });

  it("a block that carries its own guard is read from that block", () => {
    // The backend ships isFinancial and a {field: reason} map on the credit
    // block, the cost structure block and the generic strategy block
    // themselves (backend/financial_guard.py), under the keys those blocks
    // emit. That guard travelled with the figures, so it answers first and the
    // connections bundle stays behind it for a payload that carries none.
    const own = "This block says so in its own words.";
    const credit = creditLines(
      {
        applicable: true,
        kind: "bank",
        rating: { letter: "Caa/CCC", spread: 0.1, investmentGrade: false, interestCoverage: 0.74 },
        isFinancial: true,
        notApplicable: { syntheticRating: own, interestCoverage: own },
      } as unknown as CreditAnalysis,
      null,
    );
    expect(credit[0]).toContain("synthetic rating not applicable");
    // The spread and the flag are read off the rating, so the rating's guard
    // covers them even though the map names neither: the backend substitutes a
    // model fallback spread there rather than leaving it empty.
    expect(credit[0]).toContain("default spread not applicable");
    expect(credit[0]).toContain("investment grade not applicable");
    expect(credit[0]).toContain("interest coverage not applicable");
    expect(credit[0]).not.toContain("Caa/CCC");
    expect(credit[1]).toBe(
      "Credit analysis not applicable | synthetic rating, default spread, investment grade, " +
        `interest coverage | ${own}`,
    );

    const cost = costStructureLines(
      {
        applicable: true,
        company: { cogsToRevenue: 0.4, sgaToRevenue: 0.2 },
        isFinancial: true,
        notApplicable: { cogsToRevenue: own },
      },
      null,
    );
    expect(cost.join("\n")).toContain("cost of goods not applicable");
    expect(cost[cost.length - 1]).toBe(`Cost structure not applicable | cost of goods | ${own}`);

    const generic = genericStrategyLines(
      {
        applicable: true,
        costOfGoodsPlusSgaToRevenue: { value: 0.6, rank: 1, count: 40 },
        grossMarginGap: { value: 0.1, rank: 1, count: 40 },
        sgaToRevenue: { value: 0.2, rank: 2, count: 40 },
        isFinancial: true,
        notApplicable: { costOfGoodsPlusSgaToRevenue: own, grossMarginGap: own },
      },
      null,
    );
    expect(generic.join("\n")).not.toContain("Generic strategy gross margin gap");
    expect(generic[generic.length - 1]).toBe(
      "Generic strategy not applicable | cost of goods plus selling and admin to revenue, " +
        `gross margin gap | ${own}`,
    );
  });

  it("a block with no guard of its own still reads the connections bundle", () => {
    const shared = "The connections bundle says so.";
    const cost = costStructureLines(
      { applicable: true, company: { cogsToRevenue: 0.4, sgaToRevenue: 0.2 } },
      { isFinancial: true, notApplicable: { grossMargin: shared } },
    );
    expect(cost.join("\n")).toContain("cost of goods not applicable");
    expect(cost[cost.length - 1]).toBe(`Cost structure not applicable | cost of goods | ${shared}`);
  });
});

// ---------------------------------------------------------------------------
// 14. The rest of the reviewer's list
// ---------------------------------------------------------------------------

describe("lines that used to say nothing, or the wrong thing", () => {
  it("a negative operating cash flow says so once instead of six times", () => {
    const uses = lineStartingWith(RIVN, "Uses of cash, fiscal 2025 |");
    expect(uses).toContain("capital spending $1.7B");
    expect(uses).not.toContain("of operating cash flow)");
    expect(uses).toContain("shares of operating cash flow are not defined this year");
    expect(lineStartingWith(RIVN, "Uses of cash note |")).toContain(
      "Operating cash flow was negative this year",
    );
    // A company with positive operating cash flow still gets its shares.
    expect(lineStartingWith(NVDA, "Uses of cash, fiscal ")).toContain("of operating cash flow)");
  });

  it("the block names its three absence words once, at the top", () => {
    for (const stage of STAGES) {
      const text = block("NVDA", stage);
      expect(text.split("Three words mean absence")).toHaveLength(2);
      expect(text).toContain('"not available" means the data does not support that figure');
    }
  });

  it("the life cycle and the reverse DCF carry the sentence the backend wrote", () => {
    expect(lineStartingWith(NVDA, "Semiconductors life cycle |")).toContain(
      "Recent growth swings across a very wide range",
    );
    expect(lineStartingWith(NVDA, "Reverse DCF note |")).toContain(
      "Compare the implied growth with the company",
    );
  });

  it("the share-stability line says how many of the five were compared", () => {
    expect(lineStartingWith(NVDA, "share stability |")).toContain("firms compared 5");
  });

  it("an enum reaches the reader as words, with its key beside it", () => {
    expect(lineStartingWith(NVDA, "Valuation |")).toContain(
      "shape high growth, a transition phase, then stable growth (amgen)",
    );
    expect(lineStartingWith(NVDA, "Valuation selection |")).toContain(
      "track free cash flow to the firm, discounted at the cost of capital (fcff)",
    );
    expect(lineStartingWith(NVDA, "Reverse DCF |")).toContain(
      "status a growth rate was solved for (solved)",
    );
    expect(lineStartingWith(NVDA, "Growth reconciliation |")).toContain(
      "mode growth measured from the fundamentals, with no growth clamp (damodaran)",
    );
  });

  it("a ranking row with no group says so about the group, not about a chart", () => {
    // "not plotted" is a fact about the group map's twenty plotted firms, not
    // about the company in front of the reader.
    expect(NVDA).not.toContain("| not plotted |");
    expect(NVDA).toContain("| group not reported |");
  });

  it("the subject's whole strategic group labels rows the map never plotted", () => {
    // /api/individual/NVDA/rivals names every firm in NVDA's group; the map
    // plots twenty firms across the whole industry.
    const rows = NVDA.split("\n").filter((l) =>
      l.includes(" | High R&D intensity, high value-added share | "),
    );
    const plotted = stageFixture<{ firms: { ticker: string; group?: string }[] }>(
      "groupMap_Semiconductors",
    ).firms.filter((f) => f.group === "High R&D intensity, high value-added share");
    expect(rows.length).toBeGreaterThan(plotted.length);
  });

  it("the rival list keeps every firm when the block fits and its nearest when it does not", () => {
    const whole = renderBlock(fixtureBundle(SUBJECTS.NVDA, "company"), NO_DROPS, null);
    const nearest = renderBlock(
      fixtureBundle(SUBJECTS.NVDA, "company"),
      { ...NO_DROPS, rivalsNearest: true },
      null,
    );
    const count = (t: string) => t.split("\n").filter((l) => l.startsWith("rival | ")).length;
    expect(count(whole)).toBeGreaterThan(100);
    // The header row is one of them, so twenty five rivals means twenty six.
    expect(count(nearest)).toBe(26);
    expect(nearest).toContain("the 25 largest by revenue of the 169 the group holds");
  });
});

// ---------------------------------------------------------------------------
// Strategic group membership for every firm, not only the plotted ones.
//
// /api/industry/{i}/group-map computes the median split over every peer and
// then hands the chart `limit` firms (20 by default, 100 at most, against 512
// peers in Semiconductors). Membership read off `firms[]` therefore covered
// the twenty largest, while the peer ranking prints the best RANKED, so eleven
// of thirty two printed rows carried a group on the Comparative stage. The
// payload now carries `groupByTicker` for all 512.

describe("full strategic group membership", () => {
  it("the payload names every firm the split ran over, not only the plotted ones", () => {
    const map = stageFixture<GroupMapData>("groupMap_Semiconductors");
    expect(map.firms.length).toBe(20);
    expect(map.available).toBe(512);
    expect(Object.keys(map.groupByTicker ?? {}).length).toBe(512);
    // Interned: every index resolves against the label list.
    const labels = map.groupLabels ?? [];
    expect(labels.length).toBe(4);
    for (const index of Object.values(map.groupByTicker ?? {})) {
      expect(labels[index]).toBeTruthy();
    }
  });

  it("the seeded map agrees with the plotted firms it overlaps", () => {
    const map = stageFixture<GroupMapData>("groupMap_Semiconductors");
    const seeded = groupByTicker(map);
    expect(seeded.size).toBe(512);
    for (const f of map.firms) {
      if (f.group) expect(seeded.get(f.ticker.toUpperCase())).toBe(f.group);
    }
  });

  it("the Comparative ranking labels almost every row it prints", () => {
    const map = stageFixture<GroupMapData>("groupMap_Semiconductors");
    const seeded = groupByTicker(map);
    const plottedOnly = new Set(map.firms.filter((f) => f.group).map((f) => f.ticker.toUpperCase()));
    const printed = block("NVDA", "comparative")
      .split("\n")
      .filter((l) => /^[A-Z0-9][A-Za-z0-9.\-]* \| /.test(l) && / \| \d+ \| /.test(l))
      .map((l) => l.split(" | ")[0]);
    expect(printed.length).toBeGreaterThan(20);
    const before = printed.filter((t) => plottedOnly.has(t)).length;
    const after = printed.filter((t) => seeded.has(t)).length;
    expect(before).toBeLessThan(printed.length / 2);
    expect(after).toBeGreaterThan(before * 2);
  });

  it("a firm outside the split is still absent, so the phrase keeps its meaning", () => {
    const map = stageFixture<GroupMapData>("groupMap_AutoMfg");
    const seeded = groupByTicker(map);
    // Every named firm resolves to a real label; nothing is mapped to null.
    for (const label of seeded.values()) expect(label.length).toBeGreaterThan(0);
    expect(seeded.size).toBeLessThanOrEqual(map.available);
  });

  it("a payload without the field still works off the plotted firms", () => {
    const map = stageFixture<GroupMapData>("groupMap_Semiconductors");
    const legacy = { ...map, groupByTicker: undefined, groupLabels: undefined };
    const seeded = groupByTicker(legacy);
    expect(seeded.size).toBe(map.firms.filter((f) => f.group).length);
  });
});
