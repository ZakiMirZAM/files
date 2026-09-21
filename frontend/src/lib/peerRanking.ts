// The peer ranking table's data work, kept out of the component so it can be
// tested on its own.
//
// One ranking payload serves two pages. The Comparative page shows it whole and
// appends the four exposure figures as an extra column group; the Company page
// shows the same table with its own row marked and an optional filter down to
// the company's strategic group. Nothing here fetches: these are transforms on
// a payload plus the cache key both pages request it under.

import {
  EXPOSURE_DEFINITIONS,
  EXPOSURE_GROUP,
  EXPOSURE_LABELS,
} from "./connectionsCopy";
import type { ExposureRow } from "./connectionsTypes";
import type { SectorColumn, SectorMetricDef, SectorMetricsData } from "./types";

export interface RankingFilters {
  /** Restrict to a developed-markets currency allowlist. */
  developed?: boolean;
  /** Drop companies below this market cap, in billions of dollars. */
  minMcap?: number | null;
}

/**
 * What every ranking cache key starts with.
 *
 * `lib/useResource.ts` imports it to give the ranking payloads their own, much
 * smaller cap in the shared cache: one large industry's table is about ten
 * megabytes. The prefix and the keys are built here so the cap cannot be
 * disarmed by a key spelled a hair differently somewhere else.
 */
export const RANKING_KEY_PREFIX = "comparative-ranking|";

/**
 * The key both pages load the ranking under, so the second page to ask pays
 * nothing. With no filter set it is byte for byte the key the cross-stage
 * block already uses (`lib/stageContext/sources.ts` KEYS.ranking, which calls
 * this), so a reader who has clicked "Explain using AI" has already paid for
 * the table.
 */
export function rankingCacheKey(industry: string, filters?: RankingFilters): string {
  const parts: string[] = [];
  if (filters?.developed) parts.push("developed");
  if (filters?.minMcap != null && filters.minMcap > 0) parts.push(`mcap=${filters.minMcap}`);
  return parts.length > 0
    ? `${RANKING_KEY_PREFIX}${industry}|${parts.join("|")}`
    : `${RANKING_KEY_PREFIX}${industry}`;
}

/** The ranking route for one industry under those filters. */
export function rankingPath(industry: string, filters?: RankingFilters): string {
  const params = new URLSearchParams();
  if (filters?.developed) params.set("developed", "true");
  if (filters?.minMcap != null && filters.minMcap > 0) params.set("min_mcap", String(filters.minMcap));
  const qs = params.toString();
  return `/api/comparative/${encodeURIComponent(industry)}/ranking${qs ? `?${qs}` : ""}`;
}

// ── The exposure column group ──────────────────────────────────────────────

/**
 * The four exposure columns, in the order they are appended.
 *
 * None of these keys appears in `METRIC_DIRECTION` (lib/sectorMetrics.ts), so
 * `cellTint` leaves them untinted. That is deliberate: an exposure is not
 * better or worse on its own, it is the thing the reader weighs against the
 * rest of the row.
 *
 * The units are the matrix's DISPLAY units: percents already multiplied by a
 * hundred. `interestPerPoint` and `revenueChange2020` arrive as fractions and
 * are converted; the other two already arrive in points.
 */
export const EXPOSURE_METRICS: SectorMetricDef[] = [
  {
    key: "exposureInterestPerPoint",
    label: EXPOSURE_LABELS.interestPerPoint,
    unit: "%",
    group: EXPOSURE_GROUP,
    definition: EXPOSURE_DEFINITIONS.interestPerPoint,
  },
  {
    key: "exposureRevenueChange2020",
    label: EXPOSURE_LABELS.revenueChange2020,
    unit: "%",
    group: EXPOSURE_GROUP,
    definition: EXPOSURE_DEFINITIONS.revenueChange2020,
  },
  {
    // Points, not percent: the backend already multiplies this one by a
    // hundred, and its definition calls it a change in percentage points.
    key: "exposureGrossMarginChange",
    label: EXPOSURE_LABELS.grossMarginChange,
    unit: "pts",
    group: EXPOSURE_GROUP,
    definition: EXPOSURE_DEFINITIONS.grossMarginChange,
  },
  {
    key: "exposureShareChange5y",
    label: EXPOSURE_LABELS.shareChange5y,
    unit: "pts",
    group: EXPOSURE_GROUP,
    definition: EXPOSURE_DEFINITIONS.shareChange5y,
  },
];

/** Which field of the backend's exposure row feeds each matrix column. The
 *  `notApplicable` map is keyed by these source names, not by the column keys. */
const EXPOSURE_SOURCE_FIELD: Record<string, keyof ExposureRow> = {
  exposureInterestPerPoint: "interestPerPointPctOfOperatingIncome",
  exposureRevenueChange2020: "revenueChange2020",
  exposureGrossMarginChange: "grossMarginChange2020to2022",
  exposureShareChange5y: "shareChange5y",
};

/** A fraction in display units, or null for anything that is not a number. */
function toDisplayPercent(value: number | null | undefined): number | null {
  return value == null || !Number.isFinite(value) ? null : value * 100;
}

/** A points-already figure, passed through with the same null handling. */
function asPoints(value: number | null | undefined): number | null {
  return value == null || !Number.isFinite(value) ? null : value;
}

/** One exposure row as the four matrix cells. A bank arrives with nulls and a
 *  `notApplicable` note, which lands here as four empty cells. */
export function exposureCells(row: ExposureRow): SectorColumn {
  return {
    exposureInterestPerPoint: toDisplayPercent(row.interestPerPointPctOfOperatingIncome),
    exposureRevenueChange2020: toDisplayPercent(row.revenueChange2020),
    exposureGrossMarginChange: asPoints(row.grossMarginChange2020to2022),
    exposureShareChange5y: asPoints(row.shareChange5y),
  };
}

/**
 * The reasons this company's exposure cells are empty, keyed by column.
 *
 * The backend explains every figure it cannot compute for a bank or an insurer
 * ("Banks and insurers report no cost of revenue, so the stored gross margin is
 * 1.0 by construction"). Dropping that on the floor is what left a bare n/a in
 * two columns with nothing to read; the table hangs it on the cell instead.
 */
export function exposureNotes(row: ExposureRow): Record<string, string> {
  const reasons = row.notApplicable;
  if (!reasons) return {};
  const out: Record<string, string> = {};
  for (const [key, field] of Object.entries(EXPOSURE_SOURCE_FIELD)) {
    const reason = reasons[field as string];
    if (typeof reason === "string" && reason.trim()) out[key] = reason;
  }
  return out;
}

/**
 * The exposure columns worth showing for this set of companies.
 *
 * A column every single company marks as not applicable carries no figure for
 * anybody, so the whole column is dropped rather than printed as a wall of
 * n/a. Every bank industry loses two columns this way; a mixed industry keeps
 * them, and the banks inside it keep their per-cell reason.
 */
export function applicableExposureMetrics(rows: ExposureRow[]): SectorMetricDef[] {
  if (rows.length === 0) return [];
  return EXPOSURE_METRICS.filter((met) =>
    rows.some((row) => exposureNotes(row)[met.key] === undefined),
  );
}

/**
 * Append the exposure figures to a ranking matrix as one extra column group.
 *
 * Pure: returns a new object and mutates nothing. A company the exposure table
 * does not cover (it covers the twenty largest by revenue) keeps its row
 * untouched, so its four cells render as the table's normal empty cell. With no
 * exposures at all the matrix comes back exactly as it went in, which is how a
 * failed `/api/connections` call leaves the group simply absent.
 */
export function withExposureColumns(
  data: SectorMetricsData,
  exposures: ExposureRow[] | null | undefined,
): SectorMetricsData {
  if (!exposures || exposures.length === 0) return data;
  if (data.metrics.some((m) => m.key === EXPOSURE_METRICS[0].key)) return data;

  const metrics = applicableExposureMetrics(exposures);
  if (metrics.length === 0) return data;
  const keep = new Set(metrics.map((m) => m.key));

  const byTicker = new Map<string, ExposureRow>();
  for (const row of exposures) {
    if (row?.ticker) byTicker.set(row.ticker.toUpperCase(), row);
  }

  const nextData: Record<string, SectorColumn> = {};
  for (const ticker of Object.keys(data.data)) {
    const row = byTicker.get(ticker.toUpperCase());
    if (!row) {
      nextData[ticker] = data.data[ticker];
      continue;
    }
    const cells = exposureCells(row);
    for (const key of Object.keys(cells)) if (!keep.has(key)) delete cells[key];
    const notes = exposureNotes(row);
    const kept = Object.fromEntries(Object.entries(notes).filter(([k]) => keep.has(k)));
    const existing = readNotes(data.data[ticker]);
    const merged = { ...existing, ...kept };
    nextData[ticker] = {
      ...data.data[ticker],
      ...cells,
      ...(Object.keys(merged).length > 0 ? withNotes(merged) : {}),
    };
  }

  return { ...data, metrics: [...data.metrics, ...metrics], data: nextData };
}

/** Read the smuggled per-cell notes off a column (same convention as
 *  `_history`: the column type is a plain number map). */
function readNotes(col: SectorColumn | undefined): Record<string, string> {
  return (col as unknown as { _notes?: Record<string, string> } | undefined)?._notes ?? {};
}

/** Write them back, through the one cast this file needs. */
function withNotes(notes: Record<string, string>): SectorColumn {
  return { _notes: notes } as unknown as SectorColumn;
}

// ── Filtering the rows ─────────────────────────────────────────────────────

/**
 * Keep only these tickers as rows. Pure, and only the row list changes, so
 * every cell, history and definition rides along untouched. The heatmap then
 * compares the kept rows against each other, which is what the strategic group
 * toggle is for. A null list means no filter.
 */
export function withOnlyTickers(
  data: SectorMetricsData,
  tickers: string[] | null | undefined,
): SectorMetricsData {
  if (!tickers) return data;
  const keep = new Set(tickers.map((t) => t.toUpperCase()));
  return { ...data, sectors: data.sectors.filter((t) => keep.has(t.toUpperCase())) };
}

// ── The company's strategic group ──────────────────────────────────────────

/** One member of the company's strategic group, as /api/individual/{t}/rivals
 *  returns it. Only the fields the toggle needs are declared. */
export interface PeerGroupRival {
  ticker: string;
  groupLabel?: string | null;
}

export interface PeerGroupRivals {
  applicable?: boolean;
  /** The symbol the route answered under. An alias (GOOGL, BRK.B) is folded
   *  onto its primary listing, and that primary is what the ranking's rows are
   *  keyed by, so it is preferred over whatever the caller asked with. */
  ticker?: string | null;
  groupRivals?: PeerGroupRival[] | null;
}

/**
 * The tickers of the company's strategic group, the company itself first, or
 * null when there is no group to filter to. The rivals route lists the other
 * members and leaves the company out, so it is put back here: without that, the
 * company's own row disappears from a table the reader opened to read about it.
 * A group with no other members leaves the toggle hidden, because the route
 * reports no rivals at all.
 */
export function groupTickers(
  rivals: PeerGroupRivals | null | undefined,
  ticker: string,
): string[] | null {
  if (!rivals || rivals.applicable === false) return null;
  const list = rivals.groupRivals ?? [];
  if (list.length === 0) return null;
  const self = (rivals.ticker ?? ticker).toUpperCase();
  const out = [self];
  for (const rival of list) {
    const t = rival?.ticker?.toUpperCase();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}
