// PEERS: the comparative ranking exactly as the Comparative page requests it
// (default filters, no developed-markets restriction and no market-cap floor),
// each company's strategic group, and the connections exposure rows.
//
// Units. Every ranking cell is in DISPLAY units, so it goes through
// matrixValue. In the exposure rows revenueUsd is US dollars, interestCoverage
// netDebtToEbitda and operatingLeverage are times, the interest share and the
// 2020 revenue change are fractions, and grossMarginChange2020to2022 and
// shareChange5y are already percentage points.

import type { ExposureRow } from "../connectionsTypes";
import type { SectorMetricsData } from "../types";
import type { RankingLimit } from "./matrix";
import { namedKeys, rankingTable } from "./matrix";
import { countOf, line, pctFrac, plain, pointsOf, timesOf, usdOf } from "./units";

/** The twenty largest firms by USD revenue, one row each. */
function exposureLines(rows: ExposureRow[] | null | undefined): string[] {
  if (!rows || rows.length === 0) return [];
  const out = [
    `Exposure rows from the connections bundle (${rows.length} largest by US dollar revenue). ` +
      "The return minus cost of capital column is left empty by the backend on purpose, because " +
      "the peer return is pre-tax while the cost of capital comes from the full snapshot, so it " +
      "is not printed here either.",
    line(
      "company",
      "name",
      "revenue",
      "interest coverage",
      "net debt to EBITDA",
      "extra interest from one point as a share of operating income",
      "2020 revenue change",
      "gross margin change 2020 to 2022",
      "operating leverage",
      "five-year share change",
    ),
  ];
  // Every bank in a lender's industry carries the same four guard sentences,
  // so the reason is written once with the companies it covers beside it.
  const guards = new Map<string, { field: string; reason: string; tickers: string[] }>();
  for (const r of rows) {
    out.push(
      line(
        plain(r.ticker),
        plain(r.name),
        usdOf(r.revenueUsd),
        timesOf(r.interestCoverage),
        timesOf(r.netDebtToEbitda),
        pctFrac(r.interestPerPointPctOfOperatingIncome, 2),
        pctFrac(r.revenueChange2020),
        pointsOf(r.grossMarginChange2020to2022, 2),
        timesOf(r.operatingLeverage, 3),
        pointsOf(r.shareChange5y, 2),
      ),
    );
    for (const [field, reason] of Object.entries(r.notApplicable ?? {})) {
      const key = `${field}|${reason}`;
      const hit = guards.get(key);
      if (hit) hit.tickers.push(r.ticker);
      else guards.set(key, { field, reason, tickers: [r.ticker] });
    }
  }
  for (const g of guards.values()) {
    out.push(
      line("exposure not applicable", g.field, g.tickers.join(", "), plain(g.reason)),
    );
  }
  return out;
}

export interface PeersSectionInput {
  industry: string | null;
  ranking: SectorMetricsData | null;
  groupByTicker: Map<string, string>;
  exposures: ExposureRow[] | null;
  /** The subject company and its group, used only when the block is over size. */
  subjectTicker: string | null;
  subjectGroupLabel: string | null;
  /** How many of the highest ranked to keep, or null for every company. */
  topRanked?: number | null;
  missingSources: string[];
}

/** How many of the largest companies survive the size cap beside the group. */
const LARGEST_KEPT = 10;

/** How many of the subject's own strategic group survive, best ranked first.
 *  The group itself can hold 169 firms; see matrix.ts RankingLimit.groupKept. */
const GROUP_KEPT = 10;

/**
 * The rungs the size cap steps down, most companies first.
 *
 * The highest ranked matter because the Comparative stage has no subject
 * ticker: kept by market cap alone, a 561-company industry printed its ten
 * biggest companies and none of its best ranked, while the question on that
 * page asks which two or three deserve a full analysis.
 */
export const RANKING_RUNGS = [25, 20, 15, LARGEST_KEPT] as const;

const NUMBER_WORDS: Record<number, string> = {
  10: "ten",
  15: "fifteen",
  20: "twenty",
  25: "twenty five",
  30: "thirty",
  40: "forty",
};

/** A small count in words, so a caption reads as a sentence. */
export function inWords(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

/**
 * What the header line says the printed rows are, so the reader can never
 * mistake the subset for the whole industry.
 *
 * It reads the SAME limit object the ranking table was cut with, so the caption
 * cannot claim a set the table did not keep.
 */
function rowsPrintedNote(printed: number, limit: RankingLimit | null): string {
  const rows = `rows printed ${countOf(printed)}`;
  if (!limit) return rows;
  const parts = [
    `the ${inWords(limit.largest)} largest by market cap`,
    `the ${inWords(limit.topRanked)} highest ranked`,
  ];
  if (limit.ticker != null && limit.groupLabel != null) {
    parts.unshift(
      `the subject and the ${inWords(limit.groupKept)} best ranked of its strategic group`,
    );
  } else if (limit.ticker != null) {
    parts.unshift("the subject");
  }
  return `${rows}: ${parts.join(", ").replace(/, ([^,]*)$/, " and $1")}`;
}

export function peersSection(input: PeersSectionInput): string[] {
  const out: string[] = [];
  for (const what of input.missingSources) out.push(`Not loaded: ${what}`);

  if (input.ranking) {
    const total = namedKeys(input.ranking).length;
    const topRanked = input.topRanked ?? null;
    const limit: RankingLimit | null =
      topRanked == null
        ? null
        : {
            ticker: input.subjectTicker,
            groupLabel: input.subjectGroupLabel,
            largest: LARGEST_KEPT,
            groupKept: GROUP_KEPT,
            topRanked,
          };
    const rows = rankingTable(input.ranking, {
      groupByTicker: input.groupByTicker,
      limitTo: limit ?? undefined,
    });
    // rows carries the money caption and the header before the companies.
    const printed = Math.max(rows.length - 2, 0);
    out.push(
      line(
        `Peer ranking for ${plain(input.industry) || "the industry"}`,
        `companies in the industry ${countOf(total)}`,
        rowsPrintedNote(printed, limit),
        "default filters, every currency, no market-cap floor",
        "values in display units",
        "in rank order, best first",
      ),
    );
    out.push(...rows);
  }

  out.push(...exposureLines(input.exposures));
  return out;
}
