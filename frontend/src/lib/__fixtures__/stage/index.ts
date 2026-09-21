// Real payloads, captured from the analysis backend on 2026-09-20 and trimmed
// only in the two ways stated below. Nothing in them is synthetic.
//
// What was trimmed, and nothing else was:
//   * every long series keeps its LAST 130 points. That covers `trend`,
//     `levelTrend`, `altTrend` and `altLevelTrend` on each metric, the four
//     treasury yield series, each commodity's `price` and `volatility12m`, and
//     the Fed model's three daily series. A consequence worth knowing: a DAILY
//     series trimmed to 130 points covers about six months, which is shorter
//     than the six-month lookback the direction reader needs, so those series
//     read "direction not derivable" here while the live payload reads a
//     direction off the full history.
//   * the smuggled `_history` map is dropped from every scorecard-shaped
//     payload (`sectorMetrics`, the industry matrices, the scorecards and the
//     rankings). No serializer reads it, and it was four fifths of the bytes.
//   * four long prose fields no serializer reads are dropped: the payload's
//     `title` and `subtitle`, and each metric's `definition` and `analysis`.
//     They are where the backend's em dashes live ("TSM (em dash) Taiwan
//     Semiconductor Manufacturing Company Limited"), and the repo forbids a
//     literal em dash anywhere under frontend/src.
//
// Everything else is byte for byte what the backend returned, written with
// ensure_ascii so any surviving non-ASCII character is stored escaped.
//
// `sectorMetricsBlankColumn` is deliberately frozen. It is /api/sector-metrics
// as it answered on 2026-09-20, when a grouping query returned a TWELFTH
// column whose name is the empty string, holding the one company that filed
// with no sector. The backend query has since been fixed, so a refreshed
// capture no longer carries that column; this copy is kept so the guard
// against a nameless column still has a real payload to stand on.
//
// They are read from disk rather than imported, so TypeScript never has to
// infer a type for three and a half megabytes of JSON.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL(".", import.meta.url));

const cache = new Map<string, unknown>();

/** One captured payload, parsed once per run. */
export function stageFixture<T>(name: string): T {
  const hit = cache.get(name);
  if (hit !== undefined) return hit as T;
  const parsed = JSON.parse(readFileSync(`${DIR}${name}.json`, "utf8")) as unknown;
  cache.set(name, parsed);
  return parsed as T;
}

/** The eleven sector names whose connections bundles were captured, in the
 *  order the app lists them. */
export const SECTOR_FIXTURE_NAMES: [string, string][] = [
  ["Consumer Cyclical", "connections_sector_ConsumerCyclical"],
  ["Financial Services", "connections_sector_FinancialServices"],
  ["Industrials", "connections_sector_Industrials"],
  ["Technology", "connections_sector_Technology"],
  ["Basic Materials", "connections_sector_BasicMaterials"],
  ["Energy", "connections_sector_Energy"],
  ["Real Estate", "connections_sector_RealEstate"],
  ["Communication Services", "connections_sector_CommunicationServices"],
  ["Healthcare", "connections_sector_Healthcare"],
  ["Consumer Defensive", "connections_sector_ConsumerDefensive"],
  ["Utilities", "connections_sector_Utilities"],
];
