// SECTOR: the eleven-sector matrix, the subject sector's own trend metrics and
// life cycle, its value score and integrity checks, how its companies are
// financed, and the profit pool across its industries.
//
// Units, from backend/connections/UNITS.md and backend/industry_structure/
// UNITS.md: the financing medians are times, shareCoverageBelow2 and every
// gross margin and operating margin are fractions, revenueChange2020 is a
// fraction, and every share in the profit pool is a fraction.

import type { SectorBlock } from "../connectionsTypes";
import type { ProfitPoolData } from "../groupMapApi";
import type { SectionData, SectorMetricsData } from "../types";
import { blockTailLines } from "./companyConnections";
import { lifecycleLine, scorecardLines, trendMetricLines } from "./groupDetail";
import { MONEY_CAPTION, matrixTable, namedKeys } from "./matrix";
import type { SectorFinancing } from "./types";
import {
  countOf,
  line,
  NOT_APPLICABLE,
  pctFrac,
  plain,
  shareOf,
  timesOf,
  usdOf,
} from "./units";

/** The financing figures a sector block carries, on one line. */
function sectorFinancingLine(label: string, s: SectorBlock): string {
  return line(
    `${label} financing`,
    `fiscal year ${countOf(s.fiscalYear)}`,
    `firms ${countOf(s.firmCount)}`,
    `coverage ${pctFrac(s.coverage)}`,
    `median interest coverage ${timesOf(s.medianInterestCoverage)}`,
    `median net debt to EBITDA ${timesOf(s.medianNetDebtToEbitda)}`,
    `share covering interest below two times ${pctFrac(s.shareCoverageBelow2)}`,
    `firms with an interest expense ${countOf(s.firmsWithInterest)}`,
    `median operating margin ${pctFrac(s.medianOperatingMargin)}`,
    `median operating margin five years ago ${pctFrac(s.medianOperatingMargin5yAgo)}`,
  );
}

/** The whole connections sector block: financing, the 2020 shock, the
 *  inflation-episode gross margins, and every guard the backend set. */
function sectorConnectionLines(label: string, s: SectorBlock | null | undefined): string[] {
  if (!s) return [];
  return [sectorFinancingLine(label, s), ...blockTailLines(label, s)];
}

/** Every industry's slice of the sector's revenue and operating profit. */
function profitPoolLines(pool: ProfitPoolData | null | undefined): string[] {
  if (!pool) return [];
  if (pool.applicable === false) {
    return [line("Profit pool", NOT_APPLICABLE, plain(pool.reason))];
  }
  const out = [
    line(
      `Profit pool, fiscal ${countOf(pool.fiscalYear)}`,
      `five years ago ${countOf(pool.fiscalYear5yAgo)}`,
      `total revenue ${usdOf(pool.totalRevenueUsd)}`,
      `total operating profit ${usdOf(pool.totalOperatingProfitUsd)}`,
      `firms ${countOf(pool.firmCount)}`,
      pool.negativeSectorProfit
        ? "sector operating profit is negative, so no profit share is reported"
        : null,
    ),
    line(
      "industry",
      "firms",
      "revenue",
      "revenue share",
      "operating margin",
      "operating profit",
      "profit share",
      "profit share five years ago",
    ),
  ];
  for (const i of pool.industries) {
    out.push(
      line(
        plain(i.industry),
        countOf(i.firmCount),
        usdOf(i.revenueUsd),
        shareOf(i.revenueShare),
        pctFrac(i.operatingMargin),
        usdOf(i.operatingProfitUsd),
        shareOf(i.profitShare),
        shareOf(i.profitShareFiveYearsAgo),
      ),
    );
  }
  return out;
}

export interface SectorSectionInput {
  sector: string | null;
  matrix: SectorMetricsData | null;
  /**
   * The industries-within-this-sector matrix.
   *
   * The Sector deck asks for "each industry's own financial averages" in so
   * many words, and until now that matrix was loaded only from the Industry
   * stage down, so the Sector block answered the question with the profit pool
   * alone (revenue and profit shares, no returns, no margins, no leverage).
   */
  industryMatrix?: SectorMetricsData | null;
  detail: SectionData | null;
  connections: SectorBlock | null;
  profitPool: ProfitPoolData | null;
  /** Names of the sources that did not load, for the "Not loaded" lines. */
  missingSources: string[];
  dropNullMatrixRows?: boolean;
}

export function sectorSection(input: SectorSectionInput): string[] {
  const label = input.sector ? plain(input.sector) : "The sector";
  const out: string[] = [];
  for (const what of input.missingSources) out.push(`Not loaded: ${what}`);

  let columnsPrinted: number | null = null;
  if (input.matrix) {
    columnsPrinted = namedKeys(input.matrix).length;
    out.push(
      "Sector matrix, all eleven sectors, values in the scorecard's display units " +
        `(percents already multiplied by a hundred). ${MONEY_CAPTION}`,
    );
    out.push(
      ...matrixTable(input.matrix, input.sector, {
        dropNullRows: input.dropNullMatrixRows,
        withColumnMeta: true,
      }),
    );
  }

  if (input.industryMatrix) {
    out.push(
      `Industry matrix, every industry inside ${label}, values in the same display units ` +
        "as the sector matrix above, including this sector's own lens metrics. " +
        MONEY_CAPTION,
    );
    // No subject column: on this stage the reader has not picked an industry
    // yet, which is the decision the matrix is there to inform.
    out.push(
      ...matrixTable(input.industryMatrix, null, {
        dropNullRows: false,
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
    out.push(...scorecardLines(label, input.detail.scorecard, columnsPrinted));
  }

  out.push(...sectorConnectionLines(label, input.connections));
  out.push(...profitPoolLines(input.profitPool));
  return out;
}

/** Credit stage only: the financing figures of every sector that answered. */
export function sectorFinancingSection(rows: SectorFinancing[]): string[] {
  if (rows.length === 0) return [];
  const out = [
    `Financing of each sector that answered (${rows.length} of eleven). ` +
      "Medians are times, shares and margins are fractions shown as percents.",
  ];
  for (const r of rows) out.push(sectorFinancingLine(plain(r.sector), r.block));
  const missing = rows.length < 11 ? `Not loaded: ${11 - rows.length} sector financing blocks` : null;
  if (missing) out.push(missing);
  return out;
}
