// The part of the metric-sector dataset the cross-stage data block reads.
//
// The generated map is about 950 kB, and the block reads four things out of it:
// each reading's label, the three sector lists under that reading, and the
// first sentence of the Part 4 mechanism written for the subject's sector.
// Everything else in the map (reading keys, the owner's meaning cell, the
// qualifier notes, Part 5, titles, file names, the problems of a file that does
// not conform) belongs to the reading picker and to the reading rules, both of
// which load the full map themselves.
//
// So the generator emits a second, smaller artifact beside the full one and
// lib/stageContext/classification.ts imports THAT, which keeps the block's
// chunk off the megabyte. Nothing here parses or rewords: every string below is
// a cell of the full map, and the mechanism is cut by the same `firstSentence`
// the block used to call at render time, so the printed line is unchanged.

import type { DefinitionSurface, MetricSectorMap } from "./definitionTables";
import type { Sector } from "./sectorRotation";
import { firstSentence } from "./stageContext/units";

/** One named reading of a metric, and how it classifies the eleven sectors. */
export interface SlimReading {
  /** The owner's reading cell, word for word. */
  label: string;
  favored: Sector[];
  notFavored: Sector[];
  notAffected: Sector[];
}

/** One Part 4 row: the sectors it covers and the opening sentence of the
 *  mechanism written for them, which is all the block prints. */
export interface SlimMechanism {
  sectors: Sector[];
  first: string;
}

/** One metric that carries a reading table. A metric that does not conform, or
 *  that has no reading, is simply absent. */
export interface SlimEntry {
  readings: SlimReading[];
  mechanisms: SlimMechanism[];
}

export type SlimMetricSectorMap = Record<DefinitionSurface, Record<string, SlimEntry>>;

const SURFACES: DefinitionSurface[] = ["economic", "credit"];

/**
 * The slim map for one full map. Pure, so the generator writes its output and
 * the sync test compares against it.
 *
 * A non-conforming file and a file with no reading row are left out, because
 * the block's own lookup already treated both as absent.
 */
export function slimMetricSectorMap(map: MetricSectorMap): SlimMetricSectorMap {
  const out: SlimMetricSectorMap = { economic: {}, credit: {} };
  for (const surface of SURFACES) {
    for (const [key, entry] of Object.entries(map[surface])) {
      if (!entry.conforming || entry.part3.length === 0) continue;
      out[surface][key] = {
        readings: entry.part3.map((row) => ({
          label: row.readingLabel,
          favored: row.favored,
          notFavored: row.notFavored,
          notAffected: row.notAffected,
        })),
        mechanisms: entry.part4.map((row) => ({
          sectors: row.sectors,
          first: firstSentence(row.mechanism),
        })),
      };
    }
  }
  return out;
}
