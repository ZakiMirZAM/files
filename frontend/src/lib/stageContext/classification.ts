// The owner's own classification of ONE sector, metric by metric, read out of
// the generated dataset and never rewritten.
//
// Part 3 gives, for each named reading of a metric, the sectors it favors, the
// sectors it does not favor and the sectors it leaves unaffected. Part 4 gives
// the earnings mechanism per sector. Both are the owner's words; this module
// selects and prints, it does not paraphrase, score or rank.
//
// A payload metric reaches its definition through CHART_METRIC_NAME, which is
// the same map the sidebar chart uses to attach a series to a definition. A
// metric with no definition, or with a definition whose tables do not parse,
// simply has no line here; its figures still appear in the series list.
//
// The dataset imported here is the SLIM artifact: the reading labels, the three
// sector lists and the first sentence of each mechanism, which is everything
// this file reads. The full map is five times the size and is loaded only by
// the reading picker, which needs the rest of it. See lib/metricSectorSlim.ts.

import type { DefinitionSurface } from "../definitionTables";
import { METRIC_SECTOR_SLIM } from "../generated/metricSectorMapSlim";
import type { SlimEntry } from "../metricSectorSlim";
import { CREDIT_DEF_BY_NAME, ECONOMIC_DEF_BY_NAME } from "../metricDefByName";
import type { Sector } from "../sectorRotation";
import type { Metric } from "../types";
import { line, plain } from "./units";

// The two name maps now live in lib/metricDefByName.ts, which imports neither
// the generated dataset nor anything else large, so a caller that needs only
// the lookup does not pull this module's dataset with it. Re-exported here so
// every existing importer keeps working.
export { CREDIT_DEF_BY_NAME, ECONOMIC_DEF_BY_NAME };

/** The reading and mechanism rows for one definition, or null when it carries
 *  none. The slim dataset leaves such a definition out altogether. */
function entryFor(surface: DefinitionSurface, n: number): SlimEntry | null {
  return METRIC_SECTOR_SLIM[surface][String(n)] ?? null;
}

type Verdict = "favored" | "not favored" | "not affected" | "not named";

function verdictFor(entry: SlimEntry, rowIndex: number, sector: Sector): Verdict {
  const row = entry.readings[rowIndex];
  if (row.favored.includes(sector)) return "favored";
  if (row.notFavored.includes(sector)) return "not favored";
  if (row.notAffected.includes(sector)) return "not affected";
  return "not named";
}

/** True when every one of this metric's readings leaves the sector unaffected. */
function alwaysUnaffected(entry: SlimEntry, sector: Sector): boolean {
  return entry.readings.every((_, i) => verdictFor(entry, i, sector) === "not affected");
}

/** The first sentence of the Part 4 mechanism written for this sector, which
 *  the generator cut once so the block does not cut it on every render. */
function earningsLink(entry: SlimEntry, sector: Sector): string | null {
  const row = entry.mechanisms.find((r) => r.sectors.includes(sector));
  if (!row) return null;
  return row.first.length > 0 ? row.first : null;
}

export interface ClassificationOptions {
  /** Leave out the earnings link for metrics this sector is never affected by. */
  dropUnaffectedEarningsLinks?: boolean;
}

interface Candidate {
  surface: DefinitionSurface;
  number: number;
  /** The payload's own name for the series, so the two lists join up. */
  name: string;
}

function candidates(
  metrics: Metric[] | null,
  surface: DefinitionSurface,
  map: Map<string, number>,
): Candidate[] {
  if (!metrics) return [];
  const seen = new Set<number>();
  const out: Candidate[] = [];
  for (const m of metrics) {
    const n = map.get(m.name);
    if (n == null || seen.has(n)) continue;
    seen.add(n);
    out.push({ surface, number: n, name: m.name });
  }
  return out;
}

/**
 * One line per metric that carries a reading table: the classification of this
 * sector under every named reading, then the earnings link.
 *
 *   Real GDP Growth (economic 1) | Above 3% and accelerating -> favored | ... |
 *     earnings link <the owner's first sentence>
 *
 * The link used to take a second line under a repeat of the metric's name and
 * number. On the Company stage that repeat cost about 2.7 kB of a block that
 * is already over its size limit, and it carried nothing the line above did
 * not already say.
 */
export function classificationLines(
  sector: Sector,
  economicMetrics: Metric[] | null,
  creditMetrics: Metric[] | null,
  opts: ClassificationOptions = {},
): string[] {
  const all = [
    ...candidates(economicMetrics, "economic", ECONOMIC_DEF_BY_NAME),
    ...candidates(creditMetrics, "credit", CREDIT_DEF_BY_NAME),
  ];
  const out: string[] = [];
  for (const c of all) {
    const entry = entryFor(c.surface, c.number);
    if (!entry) continue;
    const head = `${plain(c.name)} (${c.surface} ${c.number})`;
    const readings = entry.readings.map(
      (row, i) => `${plain(row.label)} -> ${verdictFor(entry, i, sector)}`,
    );
    const drop = opts.dropUnaffectedEarningsLinks && alwaysUnaffected(entry, sector);
    const link = drop ? null : earningsLink(entry, sector);
    out.push(line(head, ...readings, link ? `earnings link ${link}` : null));
  }
  return out;
}
