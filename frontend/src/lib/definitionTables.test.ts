// Parser unit tests on inline fixtures.
//
// Three shapes are exercised: a plainly conforming file, a Part 4 row written
// for a group of sectors, and a file carrying a token the sector map does not
// know. Every assertion on a cell compares it word for word, because the whole
// point of the parser is that it never rewrites the owner's text.

import { describe, expect, it } from "vitest";

import {
  PART3_HEADER,
  parseDefinitionFile,
  readingKeyOf,
  sectorsWithoutMechanism,
  splitTableRow,
  type ParsedDefinition,
} from "./definitionTables";
import {
  resolveSectorToken,
  splitSectorCell,
  UnknownSectorTokenError,
} from "./gicsSectorMap";
import { SECTORS } from "./sectorRotation";

// ── Fixtures ───────────────────────────────────────────────────────────────

const CONFORMING = `# Test Metric

## Part 1: Definition

Body text.

## Part 3: What it tells you

| Reading | What it means | Sectors Favored | Sectors Not Favored | Sectors Not Affected |
|---|---|---|---|---|
| Steeply upward sloping (gap above 1.5 points) | Banks fund cheaply and lend dear. | Financials, Materials (gold miners) | Consumer Staples | (none) |
| Inverted (short rates above long rates) | The market expects cuts. | Consumer Staples | Financials, Information Technology | Energy |

## Part 4: Finding the best sectors to invest in

| Sector or sector group | Why this metric directly affects this sector's earnings | The specific reading that signals a buy versus avoid |
|---|---|---|
| Financials | Banks make money on the spread. | Buy when the curve is steeply upward sloping. |
| Consumer Staples | Staples earnings are stable through the cycle. | Buy when the curve flattens or inverts. |

## Part 5: Metrics to analyze alongside it

| Paired metric | Why this metric should be read alongside the Test Metric | How combining the two metrics sharpens the answer to which sector is the best investment |
|---|---|---|
| ISM Manufacturing Index | It confirms the warning with real activity. | Both signalling contraction makes the rotation urgent. |
`;

const GROUP_ROW = CONFORMING.replace(
  "| Financials | Banks make money on the spread. | Buy when the curve is steeply upward sloping. |",
  "| Communication Services and Information Technology together (long-duration growth) | " +
    "Long-duration earnings are discounted at the long rate. | Buy when long rates fall. |",
);

const ODD_TOKEN = CONFORMING.replace(
  "| Financials, Materials (gold miners) |",
  "| Financials, Materials (platinum miners) |",
);

function asParsed(file: string, markdown: string): ParsedDefinition {
  const parsed = parseDefinitionFile(markdown, file);
  if (!parsed.conforming) {
    throw new Error(`expected a conforming parse, got: ${parsed.problems.join("; ")}`);
  }
  return parsed;
}

// ── Cell splitting ─────────────────────────────────────────────────────────

describe("cell splitting", () => {
  it("splits a table row on unescaped pipes only", () => {
    expect(splitTableRow("| a | b \\| c | d |")).toEqual(["a", "b | c", "d"]);
  });

  it("splits a sector cell on commas that are not inside parentheses", () => {
    expect(splitSectorCell("Materials (gold miners), Energy, Financials")).toEqual([
      "Materials (gold miners)",
      "Energy",
      "Financials",
    ]);
  });

  it("makes a stable reading key", () => {
    expect(readingKeyOf("Steeply upward sloping (gap above 1.5 points)")).toBe(
      "steeply-upward-sloping-gap-above-1-5-points",
    );
  });
});

// ── The conforming fixture ─────────────────────────────────────────────────

describe("a conforming definition", () => {
  const parsed = asParsed("test/01-Test.md", CONFORMING);

  it("reads the title from the H1", () => {
    expect(parsed.title).toBe("Test Metric");
  });

  it("reads both Part 3 rows with their labels and meanings word for word", () => {
    expect(parsed.part3).toHaveLength(2);
    expect(parsed.part3[0].readingLabel).toBe("Steeply upward sloping (gap above 1.5 points)");
    expect(parsed.part3[0].meaning).toBe("Banks fund cheaply and lend dear.");
    expect(parsed.part3[1].readingLabel).toBe("Inverted (short rates above long rates)");
    expect(parsed.part3[1].meaning).toBe("The market expects cuts.");
  });

  it("maps GICS names onto the app's names", () => {
    expect(parsed.part3[1].favored).toEqual(["Consumer Defensive"]);
    expect(parsed.part3[1].notFavored).toEqual(["Financial Services", "Technology"]);
    expect(parsed.part3[1].notAffected).toEqual(["Energy"]);
  });

  it("keeps a parenthetical qualifier as a note beside its sector", () => {
    expect(parsed.part3[0].favored).toEqual(["Financial Services", "Basic Materials"]);
    expect(parsed.part3[0].qualifiers.notes).toEqual([
      { column: "favored", sector: "Basic Materials", note: "gold miners" },
    ]);
  });

  it("records an explicit none as a marker, not as a sector", () => {
    expect(parsed.part3[0].notAffected).toEqual([]);
    expect(parsed.part3[0].qualifiers.explicitNone).toEqual(["notAffected"]);
    expect(parsed.part3[1].qualifiers.explicitNone).toEqual([]);
  });

  it("reads Part 4 mechanism and buy versus avoid cells word for word", () => {
    expect(parsed.part4).toHaveLength(2);
    expect(parsed.part4[0]).toEqual({
      groupLabel: "Financials",
      sectors: ["Financial Services"],
      mechanism: "Banks make money on the spread.",
      buyAvoid: "Buy when the curve is steeply upward sloping.",
      isGroupRow: false,
      notes: [],
    });
  });

  it("reads Part 5 rows word for word", () => {
    expect(parsed.part5).toEqual([
      {
        pairedMetric: "ISM Manufacturing Index",
        why: "It confirms the warning with real activity.",
        sharpens: "Both signalling contraction makes the rotation urgent.",
      },
    ]);
  });

  it("reports the sectors with no mechanism row", () => {
    const missing = sectorsWithoutMechanism(parsed, SECTORS);
    expect(missing).not.toContain("Financial Services");
    expect(missing).not.toContain("Consumer Defensive");
    expect(missing).toContain("Utilities");
    expect(missing).toHaveLength(SECTORS.length - 2);
  });
});

// ── A Part 4 row written for a group ───────────────────────────────────────

describe("a Part 4 row written for a group of sectors", () => {
  const parsed = asParsed("test/02-Group.md", GROUP_ROW);

  it("attaches the row to every sector in the group and flags it", () => {
    const row = parsed.part4[0];
    expect(row.groupLabel).toBe(
      "Communication Services and Information Technology together (long-duration growth)",
    );
    expect(row.sectors).toEqual(["Communication Services", "Technology"]);
    expect(row.isGroupRow).toBe(true);
  });

  it("keeps the owner's qualifier on each sector of the group", () => {
    expect(parsed.part4[0].notes).toEqual([
      { column: "part4", sector: "Communication Services", note: "long-duration growth" },
      { column: "part4", sector: "Technology", note: "long-duration growth" },
    ]);
  });
});

// ── An unknown token ───────────────────────────────────────────────────────

describe("a token the sector map does not know", () => {
  it("throws from resolveSectorToken, naming the file, part, row and token", () => {
    const context = { file: "test/03-Odd.md", part: "Part 3", row: "Steeply upward sloping" };
    let thrown: unknown;
    try {
      resolveSectorToken("Materials (platinum miners)", context);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(UnknownSectorTokenError);
    const message = (thrown as UnknownSectorTokenError).message;
    expect(message).toContain("Materials (platinum miners)");
    expect(message).toContain("test/03-Odd.md");
    expect(message).toContain("Part 3");
    expect(message).toContain("Steeply upward sloping");
  });

  it("makes the whole file non-conforming rather than parsing it in part", () => {
    const parsed = parseDefinitionFile(ODD_TOKEN, "test/03-Odd.md");
    expect(parsed.conforming).toBe(false);
    if (parsed.conforming) return;
    expect(parsed.problems.join(" ")).toContain("Materials (platinum miners)");
    // Nothing else is exposed: there is no half-parsed table to read.
    expect(Object.keys(parsed)).toEqual(["conforming", "title", "problems"]);
  });
});

// ── Structural failures ────────────────────────────────────────────────────

describe("structural failures", () => {
  it("rejects a Part 3 table with a missing column", () => {
    const missingColumn = CONFORMING.replace(
      `| ${PART3_HEADER.join(" | ")} |`,
      "| Reading | What it means | Sectors Favored | Sectors Not Favored |",
    );
    const parsed = parseDefinitionFile(missingColumn, "test/04-Short.md");
    expect(parsed.conforming).toBe(false);
    if (parsed.conforming) return;
    expect(parsed.problems[0]).toContain("Part 3 header is");
  });

  it("rejects a file with no Part 4 table", () => {
    const noPart4 = CONFORMING.replace(
      "## Part 4: Finding the best sectors to invest in",
      "## Part 4: Metrics to analyze alongside it",
    );
    const parsed = parseDefinitionFile(noPart4, "test/05-NoPart4.md");
    expect(parsed.conforming).toBe(false);
    if (parsed.conforming) return;
    expect(parsed.problems.join(" ")).toContain("Part 4: Finding the best sectors to invest in");
  });
});
