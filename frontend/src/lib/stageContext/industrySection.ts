// INDUSTRY: the industries-within-a-sector matrix, the subject industry's own
// trend metrics and life cycle, the integrity checks its scorecard fired, the
// whole structure payload, the strategic group map on its default axes, and
// the value system.
//
// Units. cr4 and every margin in the connections industry block are fractions;
// hhi is points on a 0 to 10,000 scale; top5ShareChange5y is percentage
// points; revenueCagr5y is a natural-log annual rate; every group-map figure
// is a fraction and its return on capital is PRE-TAX, not the after-tax ROIC
// the individual page shows.

import type { IndustryBlock } from "../connectionsTypes";
import type { GroupMapData, ValueSystemData, ValueSystemIndustry } from "../groupMapApi";
import type { IndustryStructure } from "../industryStructureApi";
import type { SectionData, SectorMetricsData } from "../types";
import { blockTailLines } from "./companyConnections";
import { lifecycleLine, matrixIntegrityLines, trendMetricLines } from "./groupDetail";
import { MONEY_CAPTION, matrixTable } from "./matrix";
import { structureLines } from "./structureSection";
import type { ValueSystemPicks } from "./types";
import {
  MISSING,
  NOT_APPLICABLE,
  compoundYearly,
  countOf,
  line,
  pctFrac,
  plain,
  plainNumber,
  pointsOf,
  scorePoints,
  shareOf,
  timesOf,
  yearPair,
} from "./units";

/** The connections industry block, including its share of the parent sector. */
function industryConnectionLines(
  label: string,
  i: IndustryBlock | null | undefined,
): string[] {
  if (!i) return [];
  return [
    line(
      `${label} connections`,
      `sector ${plain(i.sector)}`,
      `fiscal year ${countOf(i.fiscalYear)}`,
      `firms ${countOf(i.firmCount)}`,
      `coverage ${pctFrac(i.coverage)}`,
      `four largest share ${pctFrac(i.cr4)}`,
      `HHI ${scorePoints(i.hhi)}`,
      `five-year move of the top five ${pointsOf(i.top5ShareChange5y, 1)}`,
      `firms compared ${countOf(i.top5ShareChangeFirmsCompared)}`,
      `five-year revenue growth ${compoundYearly(i.revenueCagr5y)}`,
    ),
    line(
      `${label} financing`,
      `median interest coverage ${timesOf(i.medianInterestCoverage)}`,
      `median net debt to EBITDA ${timesOf(i.medianNetDebtToEbitda)}`,
      `share covering interest below two times ${pctFrac(i.shareCoverageBelow2)}`,
      `firms with an interest expense ${countOf(i.firmsWithInterest)}`,
      `median operating margin ${pctFrac(i.medianOperatingMargin)}`,
      `median operating margin five years ago ${pctFrac(i.medianOperatingMargin5yAgo)}`,
    ),
    ...blockTailLines(label, i, [
      line(
        `${label} share of ${plain(i.sector)}`,
        `sector fiscal year ${countOf(i.sectorFiscalYear)}`,
        `revenue share ${shareOf(i.shareOfSectorRevenue)}`,
        `profit share ${shareOf(i.shareOfSectorProfit)}`,
        `revenue share five years ago ${shareOf(i.shareOfSectorRevenue5yAgo)}`,
        `profit share five years ago ${shareOf(i.shareOfSectorProfit5yAgo)}`,
      ),
    ]),
  ];
}

/**
 * Ticker to strategic group label, for every firm the median split ran over.
 *
 * The payload's `groupByTicker` is the full membership: an index into
 * `groupLabels` per firm, for all 512 Semiconductors peers rather than the 20
 * the chart plots. `firms[]` is the fallback, for a payload captured before
 * that field existed, and it covers the plotted firms only, which is why
 * nineteen of thirty ranking rows used to read "group not reported".
 */
export function groupByTicker(map: GroupMapData | null | undefined): Map<string, string> {
  const out = new Map<string, string>();
  const labels = map?.groupLabels;
  const full = map?.groupByTicker;
  if (labels && full) {
    for (const [ticker, index] of Object.entries(full)) {
      const label = labels[index];
      if (label) out.set(ticker.toUpperCase(), label);
    }
  }
  for (const f of map?.firms ?? []) {
    if (f.group) out.set(f.ticker.toUpperCase(), f.group);
  }
  return out;
}

/** The strategic group map on its default axes, with each group's members
 *  among the plotted firms. */
function groupMapLines(map: GroupMapData | null | undefined): string[] {
  if (!map) return [];
  if (map.applicable === false) {
    return [line("Strategic group map", NOT_APPLICABLE, plain(map.reason))];
  }
  const axisLabel = (key: string) =>
    plain(map.axes?.find((a) => a.key === key)?.label) || plain(key);
  const out = [
    line(
      "Strategic group map",
      plain(map.industry),
      `fiscal year ${countOf(map.fiscalYear)}`,
      `x axis ${axisLabel(map.xKey)} (${plain(map.xKey)})`,
      `y axis ${axisLabel(map.yKey)} (${plain(map.yKey)})`,
      `axis correlation ${plainNumber(map.axisCorrelation, 2)}`,
      `plotted ${countOf(map.plotted ?? map.firms.length)}`,
      `available ${countOf(map.available)}`,
      `duplicate listings dropped ${countOf(map.duplicateListingsDropped ?? 0)}`,
    ),
    line(
      "group",
      "label",
      "firms in the whole industry",
      "combined revenue share",
      "median pre-tax return on capital",
      "pre-tax return range",
      "members among the plotted firms",
    ),
  ];
  for (const g of map.groups ?? []) {
    const members = (map.firms ?? [])
      .filter((f) => f.group === g.label)
      .map((f) => plain(f.ticker));
    out.push(
      line(
        "group",
        plain(g.label),
        countOf(g.firmCount),
        shareOf(g.combinedShare),
        pctFrac(g.medianPreTaxRoic),
        g.preTaxRoicRange
          ? `${pctFrac(g.preTaxRoicRange[0])} to ${pctFrac(g.preTaxRoicRange[1])}`
          : MISSING,
        members.length > 0 ? members.join(", ") : "none plotted",
      ),
    );
  }
  return out;
}

function valueSystemIndustryLines(role: string, v: ValueSystemIndustry | null): string[] {
  if (!v) return [];
  if (v.applicable === false) {
    return [line(`Value system ${role}`, plain(v.industry), NOT_APPLICABLE, plain(v.reason))];
  }
  const out = [
    line(
      `Value system ${role}`,
      plain(v.industry),
      `fiscal year ${countOf(v.fiscalYear)}`,
      `firms ${countOf(v.firmCount)}`,
      `HHI ${scorePoints(v.hhi)}`,
      `HHI five years ago ${scorePoints(v.hhiFiveYearsAgo)}`,
      `median operating margin ${pctFrac(v.medianOperatingMargin)}`,
      `five-year revenue growth ${compoundYearly(v.revenueCagr5y)}`,
      v.thinPeerSet === true ? "thin peer set" : null,
    ),
  ];
  const dpo = v.daysPayableByYear ?? [];
  const dso = v.daysReceivableByYear ?? [];
  if (dpo.length > 0) {
    out.push(line(`Value system ${role} days payable`, ...dpo.map((d) => yearPair(d.year, countOf(d.value)))));
  }
  if (dso.length > 0) {
    out.push(
      line(`Value system ${role} days receivable`, ...dso.map((d) => yearPair(d.year, countOf(d.value)))),
    );
  }
  return out;
}

/**
 * The value system: the focal industry, and the supplier and buyer industries
 * when the reader has picked them.
 *
 * The picks live in Convex under `ind.chain.supplier` and `ind.chain.buyer`,
 * written by the Value System section's two pickers, and the caller reads them
 * at click time. When the caller could not read them (signed out, or the query
 * failed) the line says what is true of THIS block, which is that no supplier
 * or buyer industry was gathered. It used to say "the reader has picked none",
 * which this module has no way of knowing and which was simply false for any
 * reader who had picked a pair.
 */
function valueSystemLines(
  v: ValueSystemData | null | undefined,
  picks: ValueSystemPicks | undefined,
): string[] {
  if (!v) return [];
  const out = valueSystemIndustryLines("focal", v.focal);
  if (picks?.supplier) out.push(...valueSystemIndustryLines("supplier", v.supplier));
  if (picks?.buyer) out.push(...valueSystemIndustryLines("buyer", v.buyer));
  if (!picks?.supplier && !picks?.buyer) {
    out.push(
      "Value system: no supplier or buyer industry was gathered for this block, so only the focal industry is shown.",
    );
  }
  return out;
}

export interface IndustrySectionInput {
  industry: string | null;
  matrix: SectorMetricsData | null;
  detail: SectionData | null;
  scorecard: SectorMetricsData | null;
  structure: IndustryStructure | null;
  groupMap: GroupMapData | null;
  valueSystem: ValueSystemData | null;
  connections: IndustryBlock | null;
  picks?: ValueSystemPicks;
  missingSources: string[];
  dropNullMatrixRows?: boolean;
  evolutionEnds?: boolean;
}

export function industrySection(input: IndustrySectionInput): string[] {
  const label = input.industry ? plain(input.industry) : "The industry";
  const out: string[] = [];
  for (const what of input.missingSources) out.push(`Not loaded: ${what}`);

  if (input.matrix) {
    out.push(
      "Industry matrix, every industry in the sector, values in the scorecard's display units " +
        `(percents already multiplied by a hundred), including the sector's own lens metrics. ${MONEY_CAPTION}`,
    );
    out.push(
      ...matrixTable(input.matrix, input.industry, {
        dropNullRows: input.dropNullMatrixRows,
        withColumnMeta: true,
      }),
    );
  }

  if (input.detail) {
    const trends = trendMetricLines(input.detail.metrics);
    if (trends.length > 0) {
      out.push(
        `${label} trend metrics: name | latest | as of | the same figure five years earlier | direction.`,
      );
      out.push(...trends);
    }
    const lc = lifecycleLine(label, input.detail.lifecycle);
    if (lc) out.push(lc);
  }

  out.push(...matrixIntegrityLines(label, input.scorecard, input.industry));
  out.push(...industryConnectionLines(label, input.connections));
  out.push(
    ...structureLines(input.structure, {
      evolutionEnds: input.evolutionEnds,
      // How many of the five largest were in both years, from the connections
      // block: the structure payload states the move without the count.
      firmsCompared: input.connections?.top5ShareChangeFirmsCompared ?? null,
    }),
  );
  out.push(...groupMapLines(input.groupMap));
  out.push(...valueSystemLines(input.valueSystem, input.picks));
  return out;
}
