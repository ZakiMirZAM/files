// The whole /api/industry/{industry}/structure payload, printed.
//
// Every figure goes through industryStructureFormat, the module that already
// owns the number formatting for this surface, so a value reads the same here
// as it does in the tile on the page. That matters most for the four fields
// UNITS.md calls out: HHI is points on a 0 to 10,000 scale, top5ShareChange5y
// is percentage points, capexToDepreciation and revenueOverPpe are ratios, and
// revenueCagr5y, growthFirst5y and growthLast5y are natural-log rates whose
// compound rate is exp(x) - 1.

import type {
  IndustryStructure,
  ScalarWithPercentile,
  YearValue,
} from "../industryStructureApi";
import {
  buildLeaderCogsRows,
  formatR2,
  num,
  pctFromFraction,
  percentileSentence,
  pointsValue,
  scaleSlopePerTenfold,
} from "../industryStructureFormat";
import {
  MISSING,
  NOT_APPLICABLE,
  compoundYearly,
  countOf,
  figureText,
  line,
  notApplicableLines,
  pctFrac,
  plain,
  plainNumber,
  pointsOf,
  scorePoints,
  timesOf,
  usdOf,
  withUnit,
  yearPair,
} from "./units";

function withPercentile(text: string, p: number | null | undefined): string {
  const sentence = percentileSentence(p);
  return sentence ? `${text} (${sentence})` : text;
}

function fractionScalar(label: string, s: ScalarWithPercentile | null | undefined): string {
  if (!s || s.value == null) return line(label, MISSING);
  return line(label, withPercentile(pctFrac(s.value), s.percentile));
}

type SeriesUnit = "usd" | "fraction" | "count" | "points" | "times";

function seriesValue(v: number | null, unit: SeriesUnit): string {
  if (v == null || !Number.isFinite(v)) return MISSING;
  switch (unit) {
    case "usd":
      return usdOf(v);
    case "fraction":
      return pctFrac(v);
    case "count":
      return countOf(v);
    case "points":
      // pointsValue separates thousands, the way the HHI tile on the page does.
      return figureText(pointsValue(v));
    case "times":
      return timesOf(v, 2);
  }
}

/** One evolution series as `year:value` pairs. `endsOnly` keeps the first and
 *  the last pair, which is the first thing the size cap gives up. */
function evolutionLine(
  label: string,
  series: YearValue[] | null | undefined,
  unit: SeriesUnit,
  endsOnly: boolean,
): string | null {
  if (!series || series.length === 0) return null;
  const points = endsOnly && series.length > 2 ? [series[0], series[series.length - 1]] : series;
  const cells = points.map((p) => yearPair(p.year, seriesValue(p.value, unit)));
  return line(
    `evolution ${label}${endsOnly && series.length > 2 ? " (first and last only)" : ""}`,
    ...cells,
  );
}

/** How concentrated the industry is, and the ten largest firms in it. */
function concentrationLines(c: IndustryStructure["concentration"]): string[] {
  const out = [
    line("concentration firms", countOf(c.firmCount)),
    fractionScalar("concentration four largest share", c.cr4),
    fractionScalar("concentration eight largest share", c.cr8),
    line("concentration HHI", withPercentile(scorePoints(c.hhi?.value), c.hhi?.percentile)),
  ];
  if (c.top5ShareChange5y != null) {
    out.push(line("concentration five-year move of the top five", pointsOf(c.top5ShareChange5y, 1)));
  }
  out.push(line("ten largest", "rank", "ticker", "name", "revenue", "share", "share of the leader"));
  for (const f of c.top10 ?? []) {
    out.push(
      line(
        "ten largest",
        countOf(f.rank),
        plain(f.ticker),
        plain(f.name),
        usdOf(f.revenueUsd),
        pctFrac(f.share, 2),
        timesOf(f.relativeShare, 3),
      ),
    );
  }
  return out;
}

/** What it costs to enter: the capital, the scale curve and who actually did. */
function entryLines(e: IndustryStructure["entryEvidence"]): string[] {
  const out = [
    fractionScalar("entry plant to revenue", e.ppeToRevenue),
    fractionScalar("entry capital spending to revenue", e.capexToRevenue),
    fractionScalar("entry research to revenue", e.rdToRevenue),
    fractionScalar("entry selling costs to revenue", e.sgaToRevenue),
    line(
      "entry scale slope",
      e.scaleSlope == null
        ? MISSING
        : withUnit(
            num(scaleSlopePerTenfold(e.scaleSlope), 1),
            " points of operating margin per tenfold of revenue",
          ),
      `R-squared ${formatR2(e.scaleR2)}`,
      `companies ${countOf(e.scaleFirms)}`,
    ),
    fractionScalar("entry gross margin median", e.grossMarginMedian),
    line(
      "entry gross margin spread",
      e.grossMarginIqr == null ? MISSING : withUnit(pctFromFraction(e.grossMarginIqr), " points"),
    ),
    fractionScalar("entry incumbent cash to assets", e.incumbentCashToAssets),
    line("entry net entry over five years", countOf(e.netEntry5y)),
  ];
  for (const leader of buildLeaderCogsRows(e.leaderCogsToRevenue5y)) {
    out.push(
      line(
        "leader cost of goods to revenue",
        plain(leader.ticker),
        plain(leader.name),
        ...leader.series.map((y) => yearPair(y.year, pctFrac(y.value))),
      ),
    );
  }
  return out;
}

/** What it costs to leave, how hard the survivors compete, and whether the
 *  shares among them hold still. */
function exitAndRivalryLines(
  s: IndustryStructure,
  firmsCompared: number | null | undefined,
): string[] {
  const x = s.exitEvidence;
  const r = s.rivalryEvidence;
  return [
    fractionScalar("exit plant to assets", x.ppeToAssets),
    fractionScalar("exit intangibles to assets", x.intangiblesToAssets),
    line(
      "exit share of firms spending below depreciation",
      pctFrac(x.shareOfFirmsWithCapexBelowDepreciation),
    ),
    line(
      "rivalry five-year revenue growth",
      withPercentile(compoundYearly(r.revenueCagr5y?.value), r.revenueCagr5y?.percentile),
    ),
    fractionScalar("rivalry depreciation to revenue", r.daToRevenue),
    line(
      "rivalry revenue spread among the ten largest",
      withUnit(pctFrac(r.revenueSpreadAmongTop10), " of the average"),
    ),
    line(
      "share stability",
      `five-year move of the top five ${pointsOf(s.shareStability?.top5ShareChange5y, 1)}`,
      // How many of the five largest were present in BOTH years, which is what
      // the move was actually averaged over. It lives on the connections
      // industry block, so the caller passes it in.
      firmsCompared == null ? null : `firms compared ${countOf(firmsCompared)}`,
      `rank correlation ${plainNumber(s.shareStability?.shareRankCorrelation5y, 2)}`,
    ),
  ];
}

/** The ten-year series, one line each, and the rule net entry was counted by. */
function evolutionLines(ev: IndustryStructure["evolution"], ends: boolean): string[] {
  const series: [string, YearValue[] | undefined, SeriesUnit][] = [
    ["revenue", ev?.revenue, "usd"],
    ["revenue growth", ev?.growth, "fraction"],
    ["firm count", ev?.firmCount, "count"],
    ["net entry", ev?.netEntry, "count"],
    ["HHI", ev?.hhi, "points"],
    ["gross margin spread", ev?.grossMarginSpread, "fraction"],
    ["research intensity spread", ev?.rdIntensitySpread, "fraction"],
    ["capital spending to depreciation", ev?.capexToDepreciation, "times"],
    ["revenue over plant", ev?.revenueOverPpe, "times"],
  ];
  const out: string[] = [];
  for (const [label, list, unit] of series) {
    const l = evolutionLine(label, list, unit, ends);
    if (l) out.push(l);
  }
  if (ev?.netEntryRule) out.push(line("net entry rule", plain(ev.netEntryRule)));
  return out;
}

/** The backend's own summary indicators, as one line. */
function environmentLine(env: IndustryStructure["environmentIndicators"]): string[] {
  if (!env) return [];
  return [
    line(
      "environment indicators",
      `HHI ${scorePoints(env.hhi)}`,
      `four largest share ${pctFrac(env.cr4)}`,
      `scale slope ${env.scaleSlope == null ? MISSING : withUnit(num(scaleSlopePerTenfold(env.scaleSlope), 1), " points per tenfold")}`,
      `R-squared ${formatR2(env.scaleR2)}`,
      `five-year revenue growth ${compoundYearly(env.revenueCagr5y)}`,
      `growth years -10 to -5 ${compoundYearly(env.growthFirst5y)}`,
      `growth years -5 to now ${compoundYearly(env.growthLast5y)}`,
      `median years of history ${plainNumber(env.medianYearsOfHistory, 1)}`,
      `capital spending to depreciation ${timesOf(env.capexToDepreciation, 2)}`,
      `net entry over five years ${countOf(env.netEntry5y)}`,
    ),
  ];
}

export function structureLines(
  s: IndustryStructure | null,
  opts: { evolutionEnds?: boolean; firmsCompared?: number | null } = {},
): string[] {
  if (!s) return [];
  if (s.applicable === false) {
    return [line("Industry structure", NOT_APPLICABLE, plain(s.reason))];
  }
  return [
    line(
      "Industry structure",
      plain(s.industry),
      `fiscal year ${countOf(s.fiscalYear)}`,
      `firms ${countOf(s.firmCount)}`,
      `coverage ${pctFrac(s.coverage)}`,
      `duplicate listings dropped ${countOf(s.duplicateListingsDropped ?? 0)}`,
      s.netEntryWindow
        ? `net entry window ${countOf(s.netEntryWindow[0])} to ${countOf(s.netEntryWindow[1])}`
        : null,
      `isFinancial ${s.isFinancial === true ? "true" : "false"}`,
    ),
    ...concentrationLines(s.concentration),
    ...entryLines(s.entryEvidence),
    ...exitAndRivalryLines(s, opts.firmsCompared),
    ...evolutionLines(s.evolution, opts.evolutionEnds === true),
    ...environmentLine(s.environmentIndicators),
    ...notApplicableLines(s.notApplicable, "structure"),
  ];
}
