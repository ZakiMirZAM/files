// Lines shared by the SECTOR and INDUSTRY sections: the group's own trend
// metrics, its life-cycle stage, its scorecard value score and the integrity
// checks that fired.
//
// Units. The trend metrics on /api/sector/{s} and /api/industry/{i} are in the
// same units their chart headers show, so they go through metricValue. The
// life cycle's medianGrowth5y is a decimal and marginSlopePpYr is already in
// points a year. An integrity check's value and threshold are printed as the
// backend produced them, because each check uses its own unit and the detail
// sentence beside it states which.

import { colIntegrity } from "../sectorMetrics";
import type {
  CompanyLifecycle,
  GroupScorecard,
  IndustryLifecycle,
  IntegrityCheck,
  Metric,
  SectorMetricsData,
} from "../types";
import {
  MISSING,
  NOT_APPLICABLE,
  countOf,
  line,
  metricValue,
  pctFrac,
  plain,
  plainNumber,
  pointsOf,
  withUnit,
} from "./units";

/** The point five calendar years before the latest one, when the series has it. */
function fiveYearsBack(metric: Metric): { period: string; value: number } | null {
  if (metric.trend.length === 0) return null;
  const latest = metric.trend[metric.trend.length - 1];
  const year = parseInt(latest.period.slice(0, 4), 10);
  if (!Number.isFinite(year)) return null;
  const target = String(year - 5);
  return metric.trend.find((p) => p.period.slice(0, 4) === target) ?? null;
}

function directionWord(change: number): string {
  if (change > 0) return "higher than five years ago";
  if (change < 0) return "lower than five years ago";
  return "unchanged over five years";
}

/** One line per trend metric: latest, the date, the value five years earlier
 *  and which way it moved. */
export function trendMetricLines(metrics: Metric[] | null | undefined): string[] {
  if (!metrics || metrics.length === 0) return [];
  return metrics.map((m) => {
    const latest = m.trend.length > 0 ? m.trend[m.trend.length - 1] : null;
    const back = fiveYearsBack(m);
    const cells = [
      plain(m.name),
      metricValue(latest ? latest.value : m.latestValue, m.unit),
      `as of ${latest ? latest.period : MISSING}`,
    ];
    if (back && latest) {
      cells.push(`${back.period} ${metricValue(back.value, m.unit)}`);
      cells.push(directionWord(latest.value - back.value));
    } else {
      // Both cells, so the row keeps the column count its caption names. They
      // carry the block's one missing word rather than a sentence each.
      cells.push(MISSING);
      cells.push(MISSING);
    }
    return line(...cells);
  });
}

/** The life-cycle classification of a sector, an industry or a company. */
export function lifecycleLine(
  label: string,
  lc: IndustryLifecycle | CompanyLifecycle | null | undefined,
): string | null {
  if (!lc) return null;
  if (lc.applicable === false) {
    return line(`${label} life cycle`, NOT_APPLICABLE, plain(lc.reason));
  }
  const full = lc as IndustryLifecycle;
  return line(
    `${label} life cycle`,
    `stage ${plain(lc.stage) || MISSING}`,
    `confidence ${plain(lc.confidence) || MISSING}`,
    `median five-year growth ${pctFrac(lc.medianGrowth5y)}`,
    `margin slope ${withUnit(pointsOf(lc.marginSlopePpYr, 2), " a year")}`,
    lc.cyclicalSwings ? "cyclical swings present" : null,
    full.reading ? plain(full.reading) : null,
    // The caveat the backend wrote for this classification: why the confidence
    // is low, what the aggregates were built from, and what the survivorship
    // bias does to them. It was the one field of the block that stated a
    // limitation of its own figures, and it was being dropped.
    full.note ? plain(full.note) : null,
  );
}

const REPORTED: IntegrityCheck["severity"][] = ["medium", "high"];

/** The checks at medium or high severity, with the detail text the backend
 *  wrote for each. */
function integrityLines(
  label: string,
  checks: IntegrityCheck[] | null | undefined,
): string[] {
  if (!checks || checks.length === 0) return [];
  const fired = checks.filter((c) => REPORTED.includes(c.severity));
  if (fired.length === 0) return [`${label} integrity checks | none at medium or high severity`];
  return [
    `${label} integrity checks at medium or high severity (${fired.length})`,
    ...fired.map((c) =>
      line(
        plain(c.id),
        plain(c.tier) || "scorecard checks",
        c.severity,
        `value ${plainNumber(c.value, 4)}`,
        `threshold ${plainNumber(c.threshold, 4)}`,
        plain(c.detail),
      ),
    ),
  ];
}

/**
 * The group's own value score and rank, plus the checks that fired.
 *
 * `peersPrinted` is how many columns the matrix above this line actually
 * carries. When the payload's own peer count is larger, the two do not
 * describe the same set: eleven sectors were each printed as "rank 1 of 12"
 * because the payload counted a twelfth, nameless column the matrix drops. The
 * rank is still the payload's, so it is printed on its own rather than against
 * a total the reader cannot see.
 */
export function scorecardLines(
  label: string,
  scorecard: GroupScorecard | null | undefined,
  peersPrinted?: number | null,
): string[] {
  if (!scorecard) return [];
  const peers = scorecard.peers;
  const countAgrees =
    peersPrinted == null || peers == null || !Number.isFinite(peers) || peers <= peersPrinted;
  const out = [
    line(
      `${label} value score`,
      plainNumber(scorecard.valueScore, 2),
      countAgrees ? `rank ${countOf(scorecard.rank)} of ${countOf(peers)}` : `rank ${countOf(scorecard.rank)}`,
    ),
  ];
  out.push(...integrityLines(label, scorecard.integrity));
  return out;
}

/** The integrity checks smuggled onto a single-group scorecard matrix. */
export function matrixIntegrityLines(
  label: string,
  data: SectorMetricsData | null | undefined,
  column: string | null,
): string[] {
  if (!data || !column) return [];
  return integrityLines(label, colIntegrity(data.data[column]));
}
