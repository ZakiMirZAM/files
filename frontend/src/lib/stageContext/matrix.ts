// The three scorecard-shaped payloads, printed as tables.
//
// /api/sector-metrics, /api/sector/{s}/industry-metrics, /api/industry/{i}/
// scorecard and /api/comparative/{i}/ranking all return SectorMetricsData, and
// every value in them is already in DISPLAY units: a five point spread arrives
// as 5.0, not 0.05. So every cell goes through formatSectorValue by way of
// matrixValue and nothing is scaled here.
//
// Two orientations. The sector and industry matrices are wide in columns and
// long in rows, so they print one row per metric. The ranking has hundreds of
// companies and fifty metrics, so it prints one row per company under a single
// header of metric labels.

import type { SectorColumn, SectorMetricDef, SectorMetricsData } from "../types";
import { countOf, line, matrixValue, plain } from "./units";

/** The one money column these payloads convert to US dollars. Market caps go
 *  through _mc_to_usd and the fx_rates join; every other dollar-unit column is
 *  a raw figure in the filer's own reporting currency. */
const USD_KEYS = new Set(["marketCap"]);

/**
 * One cell. A money cell that is NOT the market cap loses its dollar sign,
 * because the underlying figure is in the company's own currency and a New
 * Taiwan dollar or Korean won amount behind a dollar sign is simply wrong. The
 * table says so once in its own caption.
 */
export function cell(
  value: number | null | undefined,
  met: Pick<SectorMetricDef, "key" | "unit">,
): string {
  const text = matrixValue(value, met.unit);
  if (met.unit !== "$" || USD_KEYS.has(met.key)) return text;
  return text.replace("$", "");
}

/** The caption every money-bearing table carries. */
export const MONEY_CAPTION =
  "Money cells other than Market Cap are not FX converted: a per-company cell is in that " +
  "filer's own reporting currency and a group cell sums unconverted figures, so neither " +
  "carries a currency sign. Market Cap is in US dollars.";

/** Read one of the smuggled underscore fields off a column. */
function meta(col: SectorColumn | undefined, key: string): number | null {
  const v = (col as unknown as Record<string, number | null> | undefined)?.[key];
  return v == null || !Number.isFinite(v) ? null : v;
}

/**
 * Whether a column, row or metric name can be printed at all.
 *
 * A grouping query can return a group whose name is the empty string: one
 * company filed with no sector, and `/api/sector-metrics` carried a twelfth
 * column called "". A nameless column still puts a value in every data row,
 * but `line` drops its empty header cell, so the header and the rows disagree
 * in length and every reader counts the columns wrong. Every table here drops
 * such a name instead, from the header, the `column ...` lines and the data
 * rows alike.
 */
export function named(name: string | null | undefined): name is string {
  return typeof name === "string" && name.trim().length > 0;
}

/**
 * The payload's own row order, with any blank name dropped. The payload orders
 * the ranking by rank, so this order is rank order.
 *
 * The filter is what a matrix needs: a grouping query can answer with a column
 * called "". On the ranking path the names are tickers, which cannot be blank,
 * so there it is a shared no-op rather than a second rule.
 */
export function namedKeys(data: SectorMetricsData): string[] {
  return data.sectors.filter(named);
}

/** The metrics that can be printed, in the payload's own order. A metric with
 *  no label would lose its leading cell and shift its whole row left. */
function namedMetrics(data: SectorMetricsData): SectorMetricDef[] {
  return data.metrics.filter((m) => named(m.label));
}

/** The subject's column first, then the rest in the payload's own order. */
function orderedColumns(data: SectorMetricsData, subject: string | null): string[] {
  const head = named(subject) ? subject : null;
  const names = namedKeys(data).filter((s) => s !== head);
  return head && data.data[head] ? [head, ...names] : names;
}

export interface MatrixOptions {
  /** Leave out any row whose value is null in the subject's own column. */
  dropNullRows?: boolean;
  /** Print the per-column company count and fiscal year. */
  withColumnMeta?: boolean;
}

/**
 * One matrix as `metric | unit | column | column | ...`, the subject's column
 * first and marked.
 */
export function matrixTable(
  data: SectorMetricsData,
  subject: string | null,
  opts: MatrixOptions = {},
): string[] {
  const cols = orderedColumns(data, subject);
  if (cols.length === 0) return [];
  const out: string[] = [];
  const header = cols.map((c) => (c === subject ? `${plain(c)} (subject)` : plain(c)));
  out.push(line("metric", "unit", ...header));

  if (opts.withColumnMeta) {
    for (const c of cols) {
      const col = data.data[c];
      out.push(
        line(
          `column ${plain(c)}${c === subject ? " (subject)" : ""}`,
          `companies ${countOf(meta(col, "_companies"))}`,
          `fiscal year ${countOf(meta(col, "_year"))}`,
        ),
      );
    }
  }

  for (const met of namedMetrics(data)) {
    const subjectValue = subject ? data.data[subject]?.[met.key] : undefined;
    if (opts.dropNullRows && subject && (subjectValue == null || !Number.isFinite(subjectValue))) {
      continue;
    }
    const cells = cols.map((c) => cell(data.data[c]?.[met.key], met));
    out.push(line(plain(met.label), met.unit, ...cells));
  }
  return out;
}

/** Which companies a limited ranking keeps beside the subject and its group. */
export interface RankingLimit {
  ticker: string | null;
  groupLabel: string | null;
  /** How many of the largest by market cap to keep. */
  largest: number;
  /** How many of the highest ranked to keep. The payload is in rank order, so
   *  these are simply its leading rows. */
  topRanked: number;
  /**
   * How many of the subject's own strategic group to keep, best ranked first.
   *
   * Group membership used to come from the group map's twenty plotted firms,
   * so "the subject's group" was at most a handful of rows. It now comes from
   * /api/individual/{ticker}/rivals as well, which for a Semiconductors
   * company names 169 firms in the same group, and keeping all of them would
   * put more of the ranking in the block than every other reduction takes out.
   */
  groupKept: number;
}

export interface RankingOptions {
  /** Ticker -> strategic group label, from the group map's plotted firms and,
   *  on the company stage, from the subject's own rivals list. */
  groupByTicker?: Map<string, string>;
  /** When set, only the subject, its group, the largest and the highest
   *  ranked print. */
  limitTo?: RankingLimit;
}

/**
 * What a row says when no source names its strategic group.
 *
 * It used to say "not plotted", which is a fact about the group map's chart
 * rather than about the company, and it was printed on nineteen of thirty
 * rows because the map plots only its twenty largest firms while the ranking
 * prints the best ranked. Nothing in this block plots anything.
 */
const GROUP_NOT_REPORTED = "group not reported";

/**
 * The tickers a limited ranking keeps: the subject, its strategic group, the
 * N largest by market cap and the N highest ranked.
 *
 * The highest ranked matter because the Comparative stage has no subject
 * ticker at all, and the question there asks which companies deserve a full
 * analysis. Kept by market cap alone, the best ranked companies in a large
 * industry never reach the block.
 *
 * Order follows the payload, which is rank order.
 */
export function limitedTickers(
  data: SectorMetricsData,
  groupByTicker: Map<string, string> | undefined,
  limit: RankingLimit,
): string[] {
  const rows = namedKeys(data);
  const keep = new Set<string>();
  if (limit.ticker && data.data[limit.ticker]) keep.add(limit.ticker);
  if (limit.groupLabel && groupByTicker) {
    // Rows are in rank order, so the first matches are the best ranked of the
    // subject's group.
    let kept = 0;
    for (const t of rows) {
      if (kept >= limit.groupKept) break;
      if (groupByTicker.get(t) === limit.groupLabel) {
        keep.add(t);
        kept += 1;
      }
    }
  }
  const byCap = rows
    .map((t) => ({ t, cap: data.data[t]?.marketCap }))
    .filter((r) => r.cap != null && Number.isFinite(r.cap))
    .sort((a, b) => (b.cap as number) - (a.cap as number))
    .slice(0, limit.largest);
  for (const r of byCap) keep.add(r.t);
  for (const t of rows.slice(0, limit.topRanked)) keep.add(t);
  return rows.filter((t) => keep.has(t));
}

/**
 * The ranking as one row per company: `ticker | strategic group | value | ...`
 * under a header naming every metric.
 */
export function rankingTable(
  data: SectorMetricsData,
  opts: RankingOptions = {},
): string[] {
  const tickers = opts.limitTo
    ? limitedTickers(data, opts.groupByTicker, opts.limitTo)
    : namedKeys(data);
  if (tickers.length === 0) return [];
  const metrics = namedMetrics(data);
  const out: string[] = [MONEY_CAPTION];
  out.push(
    line(
      "company",
      "strategic group",
      ...metrics.map((m) => `${plain(m.label)} (${m.unit})`),
    ),
  );
  for (const t of tickers) {
    const col = data.data[t];
    if (!col) continue;
    out.push(
      line(
        plain(t),
        opts.groupByTicker?.get(t) ?? GROUP_NOT_REPORTED,
        ...metrics.map((m) => cell(col[m.key], m)),
      ),
    );
  }
  return out;
}
