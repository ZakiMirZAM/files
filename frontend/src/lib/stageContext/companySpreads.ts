// /api/individual/{ticker}/spreads: the company against its industry median,
// its strategic group's median, and the two market-cap-weighted averages, one
// row per metric.
//
// This is the table the Company deck's peers question asks for in so many
// words ("set {company} against its strategic group, against its whole
// industry and against its sector on every metric family"), and it was the one
// payload the block never carried, so the answer had to reconstruct the
// comparison out of separate sections.
//
// Units, from the payload's own `unitsNote`: every value is in the DISPLAY
// units of the benchmarks endpoint, so a percent arrives already multiplied by
// a hundred and must never go through a fraction formatter. A `gap` is the
// company minus that benchmark, in the same display unit, which for a percent
// metric makes it percentage points.

import { countOf, figureText, line, matrixValue, plain } from "./units";
import type { SpreadsData, SpreadMetric } from "./types";

/** One metric's row: the company, the three benchmarks and the three gaps. */
function spreadRow(key: string, m: SpreadMetric): string {
  // A "%" value here is a display percent and "x" is a ratio, which is exactly
  // what the scorecard formatter takes, so the cells read the way the matrix
  // cells above them do.
  const unit = m.unit === "%" ? "%" : "x";
  const cell = (v: number | null | undefined) => figureText(matrixValue(v, unit));
  return line(
    plain(m.label) || plain(key),
    m.unit,
    cell(m.company),
    cell(m.industryMedian),
    cell(m.groupMedian),
    cell(m.industryWeighted),
    cell(m.sectorWeighted),
    cell(m.gapIndustry),
    cell(m.gapGroup),
    cell(m.gapSector),
    `${countOf(m.rank)} of ${countOf(m.count)}`,
  );
}

export function spreadLines(s: SpreadsData | null | undefined): string[] {
  if (!s) return [];
  if (s.applicable === false) {
    return [line("Company against its benchmarks", "not applicable", plain(s.reason))];
  }
  const metrics = s.metrics ?? {};
  const keys = Object.keys(metrics);
  if (keys.length === 0) return [];
  const out = [
    line(
      "Company against its benchmarks",
      `strategic group ${plain(s.groupLabel) || "not reported"}`,
      `firms in the group ${countOf(s.groupFirmCount)}`,
      `peers ${countOf(s.peerCount)}`,
      `fiscal year ${countOf(s.fiscalYear)}`,
      plain(s.unitsNote),
      plain(s.dataNote),
    ),
    line(
      "benchmark",
      "unit",
      "company",
      "industry median",
      "group median",
      "industry weighted average",
      "sector weighted average",
      "gap to the industry median",
      "gap to the group median",
      "gap to the sector average",
      "rank by size of the figure",
    ),
  ];
  for (const k of keys) out.push(spreadRow(k, metrics[k]));
  return out;
}
