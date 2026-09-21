// The generated dataset must equal a fresh parse of the owner's markdown.
//
// Edit a definition file without running `npm run gen:metric-map` and this test
// fails, which is the whole safety property: no page can show a classification
// the source files no longer say.
//
// The counts below are measured, not assumed. They are pinned so that a silent
// change in the source content (a deleted reading, a dropped Part 4 row) is
// visible as a number rather than as a quietly shorter table.

import { describe, expect, it } from "vitest";

import { definitionSources } from "./definitionSources";
import {
  parseDefinitionFile,
  type MetricSectorEntry,
  type MetricSectorMap,
} from "./definitionTables";
import { METRIC_SECTOR_MAP } from "./generated/metricSectorMap";
import { METRIC_SECTOR_SLIM } from "./generated/metricSectorMapSlim";
import { CREDIT_GROUP, METRIC_GROUPS, metricGroupEntries } from "./metricGroups";
import { slimMetricSectorMap } from "./metricSectorSlim";
import { SECTORS } from "./sectorRotation";
import { firstSentence } from "./stageContext/units";

// ── Measured counts, pinned ────────────────────────────────────────────────

const EXPECTED = {
  economicFiles: 70,
  economicConforming: 68,
  economicReadings: 272,
  economicClassificationCells: 816,
  economicMechanismCells: 749,
  economicPart5Rows: 219,
  creditFiles: 17,
  creditConforming: 17,
  creditReadings: 68,
  creditClassificationCells: 204,
  creditMechanismCells: 178,
  creditPart5Rows: 68,
  /** Economic 1 to 69 minus the concept file, plus all seventeen credit. */
  groupedMetrics: 86,
} as const;

/** The only files that do not conform, with the reason in one line each. */
const KNOWN_NONCONFORMING: Record<string, string> = {
  "economic/50": "No Sectors Not Affected column, and no Part 4 sector table.",
  "economic/70": "A concept explainer in the concept format; it carries no tables.",
};

// ── A fresh parse, built the same way the generator builds it ──────────────

function freshMap(): MetricSectorMap {
  const map: MetricSectorMap = { economic: {}, credit: {} };
  for (const src of definitionSources()) {
    const parsed = parseDefinitionFile(src.markdown, src.path);
    const entry: MetricSectorEntry = parsed.conforming
      ? {
          surface: src.surface,
          number: src.number,
          title: parsed.title,
          file: src.file,
          conforming: true,
          problems: [],
          part3: parsed.part3,
          part4: parsed.part4,
          part5: parsed.part5,
        }
      : {
          surface: src.surface,
          number: src.number,
          title: parsed.title,
          file: src.file,
          conforming: false,
          problems: parsed.problems,
          part3: [],
          part4: [],
          part5: [],
        };
    map[src.surface][String(src.number)] = entry;
  }
  return map;
}

const fresh = freshMap();
const entries = [
  ...Object.values(METRIC_SECTOR_MAP.economic),
  ...Object.values(METRIC_SECTOR_MAP.credit),
];

function tally(surface: "economic" | "credit") {
  const all = Object.values(METRIC_SECTOR_MAP[surface]);
  const conforming = all.filter((e) => e.conforming);
  return {
    files: all.length,
    conforming: conforming.length,
    readings: conforming.reduce((n, e) => n + e.part3.length, 0),
    classificationCells: conforming.reduce((n, e) => n + e.part3.length * 3, 0),
    mechanismCells: conforming.reduce((n, e) => n + e.part4.length, 0),
    part5Rows: conforming.reduce((n, e) => n + e.part5.length, 0),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("the generated dataset is in sync with the markdown", () => {
  it("equals a fresh parse of every definition file", () => {
    expect(
      METRIC_SECTOR_MAP,
      "run `npm run gen:metric-map` after editing a definition file",
    ).toEqual(fresh);
  });

  it("the slim companion equals a fresh slice of that parse", () => {
    expect(
      METRIC_SECTOR_SLIM,
      "run `npm run gen:metric-map` after editing a definition file",
    ).toEqual(slimMetricSectorMap(fresh));
  });

  it("the slim companion carries every metric that has a reading table", () => {
    const withReadings = entries
      .filter((e) => e.conforming && e.part3.length > 0)
      .map((e) => `${e.surface}/${e.number}`)
      .sort();
    const slimKeys = [
      ...Object.keys(METRIC_SECTOR_SLIM.economic).map((n) => `economic/${n}`),
      ...Object.keys(METRIC_SECTOR_SLIM.credit).map((n) => `credit/${n}`),
    ].sort();
    expect(slimKeys).toEqual(withReadings);
  });

  it("the slim companion keeps the owner's labels and sector lists word for word", () => {
    for (const e of entries) {
      const slim = METRIC_SECTOR_SLIM[e.surface][String(e.number)];
      if (!slim) continue;
      expect(
        slim.readings,
        `${e.surface}/${e.number}`,
      ).toEqual(
        e.part3.map((r) => ({
          label: r.readingLabel,
          favored: r.favored,
          notFavored: r.notFavored,
          notAffected: r.notAffected,
        })),
      );
      // The mechanism is cut to its opening sentence, which is all the block
      // ever printed, and every cut sentence is a prefix of the owner's cell.
      expect(slim.mechanisms.map((m) => m.sectors), `${e.surface}/${e.number}`).toEqual(
        e.part4.map((r) => r.sectors),
      );
      for (let i = 0; i < slim.mechanisms.length; i++) {
        expect(slim.mechanisms[i].first, `${e.surface}/${e.number} row ${i}`).toBe(
          firstSentence(e.part4[i].mechanism),
        );
      }
    }
  });
});

describe("measured counts", () => {
  const economic = tally("economic");
  const credit = tally("credit");

  it("the economic surface is unchanged", () => {
    expect(economic).toEqual({
      files: EXPECTED.economicFiles,
      conforming: EXPECTED.economicConforming,
      readings: EXPECTED.economicReadings,
      classificationCells: EXPECTED.economicClassificationCells,
      mechanismCells: EXPECTED.economicMechanismCells,
      part5Rows: EXPECTED.economicPart5Rows,
    });
  });

  it("the credit surface is unchanged", () => {
    expect(credit).toEqual({
      files: EXPECTED.creditFiles,
      conforming: EXPECTED.creditConforming,
      readings: EXPECTED.creditReadings,
      classificationCells: EXPECTED.creditClassificationCells,
      mechanismCells: EXPECTED.creditMechanismCells,
      part5Rows: EXPECTED.creditPart5Rows,
    });
  });
});

describe("non-conforming files", () => {
  it("are exactly the two known ones", () => {
    const actual = entries
      .filter((e) => !e.conforming)
      .map((e) => `${e.surface}/${e.number}`)
      .sort();
    expect(actual, "a new non-conforming file needs an owner content task").toEqual(
      Object.keys(KNOWN_NONCONFORMING).sort(),
    );
  });

  it("each carries at least one problem message and no rows", () => {
    for (const e of entries.filter((x) => !x.conforming)) {
      expect(e.problems.length, `${e.surface}/${e.number}`).toBeGreaterThan(0);
      expect(e.part3, `${e.surface}/${e.number}`).toEqual([]);
      expect(e.part4, `${e.surface}/${e.number}`).toEqual([]);
      expect(e.part5, `${e.surface}/${e.number}`).toEqual([]);
    }
  });

  it("every conforming file carries no problems and at least one reading", () => {
    for (const e of entries.filter((x) => x.conforming)) {
      expect(e.problems, `${e.surface}/${e.number}`).toEqual([]);
      expect(e.part3.length, `${e.surface}/${e.number}`).toBeGreaterThan(0);
    }
  });
});

describe("every emitted sector is one of the eleven", () => {
  it("in Part 3 and Part 4 alike", () => {
    const known = new Set<string>(SECTORS);
    const bad: string[] = [];
    for (const e of entries) {
      for (const row of e.part3) {
        for (const s of [...row.favored, ...row.notFavored, ...row.notAffected]) {
          if (!known.has(s)) bad.push(`${e.surface}/${e.number} part3 ${s}`);
        }
        for (const n of row.qualifiers.notes) {
          if (!known.has(n.sector)) bad.push(`${e.surface}/${e.number} note ${n.sector}`);
        }
      }
      for (const row of e.part4) {
        for (const s of row.sectors) {
          if (!known.has(s)) bad.push(`${e.surface}/${e.number} part4 ${s}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("never lists the same sector twice in one classification cell", () => {
    for (const e of entries) {
      for (const row of e.part3) {
        for (const cell of [row.favored, row.notFavored, row.notAffected]) {
          expect(new Set(cell).size, `${e.surface}/${e.number} ${row.readingKey}`).toBe(cell.length);
        }
      }
    }
  });
});

describe("reading keys", () => {
  it("are unique within each file, so a saved pick resolves to one row", () => {
    for (const e of entries) {
      const keys = e.part3.map((r) => r.readingKey);
      expect(new Set(keys).size, `${e.surface}/${e.number}`).toBe(keys.length);
    }
  });
});

describe("metric groups", () => {
  const placed = metricGroupEntries();

  it("place every definition of both surfaces exactly once", () => {
    expect(placed).toHaveLength(EXPECTED.groupedMetrics);
    const keys = placed.map((p) => `${p.surface}/${p.number}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("use only the ten group labels", () => {
    const known = new Set<string>(METRIC_GROUPS);
    expect(METRIC_GROUPS).toHaveLength(10);
    for (const p of placed) expect(known.has(p.group), `${p.surface}/${p.number}`).toBe(true);
  });

  it("put every credit metric in Credit & banks and no economic metric there", () => {
    for (const p of placed) {
      if (p.surface === "credit") expect(p.group).toBe(CREDIT_GROUP);
      else expect(p.group).not.toBe(CREDIT_GROUP);
    }
  });

  it("cover every conforming definition in the generated dataset", () => {
    const placedKeys = new Set(placed.map((p) => `${p.surface}/${p.number}`));
    for (const e of entries) {
      if (!e.conforming) continue;
      expect(placedKeys.has(`${e.surface}/${e.number}`), `${e.surface}/${e.number}`).toBe(true);
    }
  });
});
