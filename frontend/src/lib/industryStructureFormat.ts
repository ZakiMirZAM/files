// Tile formatters for the industry structure payload.
// Each field's unit is documented in backend/industry_structure/UNITS.md.
// Fractions are multiplied by 100 for display; HHI stays on its 0..10,000
// scale; percentage-point fields are displayed as-is; counts are plain.
//
// This module owns the number formatting for every Part 2 surface, so a figure
// reads the same in a tile, a chart caption, a deck question, and the AI
// dataContext string. It deliberately has no imports from the connection
// layer's formatters, so a change there cannot silently restate a figure here.

import type { ScalarWithPercentile, IndustryStructure, LeaderCogsSeries } from "./industryStructureApi";
import { TILE_LABELS, NOT_APPLICABLE_FALLBACK, notApplicableSentence } from "./industryForcesCopy";

// ── Plain formatters ───────────────────────────────────────────────────────

/** Text printed in place of a figure the data does not carry. */
export const NOT_AVAILABLE_FIGURE = "not available";

/** Fraction (0.13) to display percent string ("13.0"). No percent sign. */
export function pctFromFraction(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return NOT_AVAILABLE_FIGURE;
  return (v * 100).toFixed(digits);
}

/** A value already in percent or percentage points (4.94 to "4.9"). */
export function pctAlreadyPercent(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return NOT_AVAILABLE_FIGURE;
  return Number(v).toFixed(digits);
}

/** Plain number with fixed decimals (HHI points, counts, ratios). */
export function num(v: number | null | undefined, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return NOT_AVAILABLE_FIGURE;
  return Number(v).toFixed(digits);
}

/** A times ratio (1.4107 to "1.4"). */
export function times(v: number | null | undefined, digits = 1): string {
  return num(v, digits);
}

/** HHI and other point scores, thousands separated ("403" and "1,806"). */
export function pointsValue(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return NOT_AVAILABLE_FIGURE;
  return Math.round(Number(v)).toLocaleString("en-US");
}

/** Whole days ("52"). */
export function days(v: number | null | undefined): string {
  return num(v, 0);
}

/**
 * R-squared, always to two decimals, everywhere it is printed.
 * One formatter so the same fit never reads "0.103" in one place and "0.10"
 * in another.
 */
export function formatR2(v: number | null | undefined): string {
  return num(v, 2);
}

// ── Comparison-tile cells ──────────────────────────────────────────────────
// The value-system table, the substitutes picker and the buyer and supplier
// tiles print the same three cells. They were written out three times, so the
// same figure could have read differently in two tiles on one page.

/** Text printed in a comparison cell the payload does not carry. */
export const NOT_REPORTED = "Not reported";

/** A fraction as a percent with its sign, or the not-reported text. */
export function marginCell(v: number | null | undefined): string {
  return v != null && Number.isFinite(v) ? `${pctFromFraction(v, 1)}%` : NOT_REPORTED;
}

/** A log-annual rate as the compound rate a reader means, or the not-reported text. */
export function growthCell(v: number | null | undefined): string {
  return v != null && Number.isFinite(v) ? `${compoundRateFromLog(v, 1)}% a year` : NOT_REPORTED;
}

/** HHI points, or the not-reported text. */
export function hhiCell(v: number | null | undefined): string {
  return v != null && Number.isFinite(v) ? `${pointsValue(v)} points` : NOT_REPORTED;
}

// ── Log growth rates ───────────────────────────────────────────────────────

/**
 * Every backend field named `*Cagr5y`, `growthFirst5y`, or `growthLast5y` is a
 * natural-log rate per year. Those add exactly across periods but are not the
 * rate a reader means by "13 percent a year". The compound rate is exp(x) - 1.
 *
 *   compoundRateValue(0.13) -> 13.883...
 *
 * Year-over-year series values are ordinary fractions and must NOT come
 * through here.
 */
export function compoundRateValue(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return (Math.exp(Number(v)) - 1) * 100;
}

/**
 * The same conversion as a display string.
 *   compoundRateFromLog(0.13) -> "13.9"
 */
export function compoundRateFromLog(v: number | null | undefined, digits = 1): string {
  const pct = compoundRateValue(v);
  if (pct == null) return NOT_AVAILABLE_FIGURE;
  return pct.toFixed(digits);
}

// ── Shared scale-slope conversion ─────────────────────────────────────────

/** Backend scaleSlope (fraction of operating margin per ln-unit of revenue)
 *  converted to percentage points per tenfold increase in revenue.
 *  Example: 0.033297 -> 7.7 (each tenfold gives about 7.7 points of margin). */
export function scaleSlopePerTenfold(slope: number): number {
  return slope * Math.LN10 * 100;
}

// ── Tile value ─────────────────────────────────────────────────────────────

export type TileUnit =
  | "fraction"
  | "compoundFromLog"
  | "points"
  | "pctPoints"
  | "times"
  | "count"
  | "correlation";

/** Format a scalar value according to its unit. Returns a display string with
 *  NO trailing unit suffix (the tile adds its own label). */
export function formatTileValue(
  value: number | null | undefined,
  unit: TileUnit,
  digits = 1,
): string {
  if (value == null || !Number.isFinite(value)) return NOT_AVAILABLE_FIGURE;
  switch (unit) {
    case "fraction":
      return pctFromFraction(value, digits);
    case "compoundFromLog":
      return compoundRateFromLog(value, digits);
    case "points":
      return num(value, digits);
    case "pctPoints":
      return pctAlreadyPercent(value, digits);
    case "times":
      return num(value, digits);
    case "count":
      return num(value, 0);
    case "correlation":
      return num(value, 2);
    default:
      return num(value, digits);
  }
}

/** Build the percentile sentence: "higher than 58 percent of industries".
 *  No direction; no em dashes. Returns null when percentile is null. */
export function percentileSentence(p: number | null | undefined): string | null {
  if (p == null || !Number.isFinite(p)) return null;
  const pct = (p * 100).toFixed(0);
  return `higher than ${pct} percent of industries`;
}

// ── Tile descriptor ────────────────────────────────────────────────────────

export interface TileDescriptor {
  label: string;
  value: string;
  percentile: string | null;
  /** The label's unit suffix shown after the value. */
  suffix: string;
  /** Raw numeric value for sorting or charting, null when unavailable. */
  rawValue: number | null;
  /** Set when the figure does not apply to this industry: the tile prints this
   *  sentence instead of a number. */
  notApplicable?: string;
}

function unavailableTile(label: string, notApplicable?: string): TileDescriptor {
  return {
    label,
    value: notApplicable ?? "Not reported for this industry",
    percentile: null,
    suffix: "",
    rawValue: null,
    notApplicable,
  };
}

/** The key the backend uses for a field in its `notApplicable` map, or
 *  undefined when the field applies. */
type NotApplicableMap = Record<string, string> | undefined;

function reasonFor(map: NotApplicableMap, field: string): string | undefined {
  if (!map) return undefined;
  const raw = map[field];
  if (raw == null) return undefined;
  return notApplicableSentence(typeof raw === "string" && raw.trim() ? raw : NOT_APPLICABLE_FALLBACK);
}

/** Build a tile descriptor from a ScalarWithPercentile. */
export function tileFromScalar(
  label: string,
  s: ScalarWithPercentile | null | undefined,
  unit: TileUnit,
  suffix: string,
  digits = 1,
  notApplicable?: string,
): TileDescriptor {
  if (notApplicable) return unavailableTile(label, notApplicable);
  if (!s || s.value == null || !Number.isFinite(s.value)) return unavailableTile(label);
  return {
    label,
    value: formatTileValue(s.value, unit, digits),
    percentile: percentileSentence(s.percentile),
    suffix,
    rawValue: s.value,
  };
}

/** Build a tile descriptor from a bare number (no percentile). */
export function tileFromBare(
  label: string,
  value: number | null | undefined,
  unit: TileUnit,
  suffix: string,
  digits = 1,
  notApplicable?: string,
): TileDescriptor {
  if (notApplicable) return unavailableTile(label, notApplicable);
  if (value == null || !Number.isFinite(value)) return unavailableTile(label);
  return {
    label,
    value: formatTileValue(value, unit, digits),
    percentile: null,
    suffix,
    rawValue: value,
  };
}

// ── Leaders' cost of goods table ──────────────────────────────────────────

export interface LeaderCogsRow {
  ticker: string;
  name: string;
  firstYear: number | null;
  firstValue: string;
  lastYear: number | null;
  lastValue: string;
  /** Every year on file, for the sparkline. */
  series: Array<{ year: number; value: number }>;
}

/**
 * The four largest companies' cost of goods as a share of revenue, first and
 * last year on file. The backend sends one array per company, so this renders
 * as rows rather than collapsing into a single number.
 */
export function buildLeaderCogsRows(
  leaders: LeaderCogsSeries[] | null | undefined,
): LeaderCogsRow[] {
  if (!Array.isArray(leaders)) return [];
  return leaders.map((leader) => {
    const usable = (leader.years ?? []).filter(
      (y) => y != null && Number.isFinite(y.value) && Number.isFinite(y.year),
    ) as Array<{ year: number; value: number }>;
    const first = usable[0] ?? null;
    const last = usable.length > 0 ? usable[usable.length - 1] : null;
    return {
      ticker: leader.ticker,
      name: leader.name,
      firstYear: first?.year ?? null,
      firstValue: first ? pctFromFraction(first.value) : NOT_AVAILABLE_FIGURE,
      lastYear: last?.year ?? null,
      lastValue: last ? pctFromFraction(last.value) : NOT_AVAILABLE_FIGURE,
      series: usable,
    };
  });
}

// ── Build tile lists per force ─────────────────────────────────────────────

export function buildEntryTiles(s: IndustryStructure): TileDescriptor[] {
  const e = s.entryEvidence;
  const stab = s.shareStability;
  const na = s.notApplicable;
  const scaleSuffix = `points of operating margin for every tenfold increase in revenue (R-squared ${formatR2(e.scaleR2)}, ${num(e.scaleFirms, 0)} companies)`;
  return [
    // The backend slope is margin per ln unit of revenue; scaleSlopePerTenfold
    // restates it as percentage points per tenfold increase in revenue.
    tileFromBare(
      TILE_LABELS.scaleSlope,
      e.scaleSlope == null ? null : scaleSlopePerTenfold(e.scaleSlope),
      "pctPoints",
      scaleSuffix,
      1,
      reasonFor(na, "scaleSlope"),
    ),
    tileFromScalar(TILE_LABELS.ppeToRevenue, e.ppeToRevenue, "fraction", "percent", 1, reasonFor(na, "ppeToRevenue")),
    tileFromScalar(TILE_LABELS.capexToRevenue, e.capexToRevenue, "fraction", "percent", 1, reasonFor(na, "capexToRevenue")),
    tileFromScalar(TILE_LABELS.grossMarginMedian, e.grossMarginMedian, "fraction", "percent", 1, reasonFor(na, "grossMarginMedian")),
    tileFromBare(TILE_LABELS.grossMarginIqr, e.grossMarginIqr, "fraction", "percentage points", 1, reasonFor(na, "grossMarginIqr")),
    tileFromScalar(TILE_LABELS.rdToRevenue, e.rdToRevenue, "fraction", "percent", 1, reasonFor(na, "rdToRevenue")),
    tileFromScalar(TILE_LABELS.sgaToRevenue, e.sgaToRevenue, "fraction", "percent", 1, reasonFor(na, "sgaToRevenue")),
    tileFromScalar(TILE_LABELS.incumbentCashToAssets, e.incumbentCashToAssets, "fraction", "percent", 1, reasonFor(na, "incumbentCashToAssets")),
    tileFromBare(
      TILE_LABELS.netEntry5y,
      e.netEntry5y,
      "count",
      Math.abs(e.netEntry5y ?? 0) === 1 ? "company" : "companies",
      1,
      reasonFor(na, "netEntry5y"),
    ),
    tileFromBare(TILE_LABELS.top5ShareChange5y, stab?.top5ShareChange5y, "pctPoints", "percentage points", 1, reasonFor(na, "top5ShareChange5y")),
    tileFromBare(TILE_LABELS.shareRankCorrelation5y, stab?.shareRankCorrelation5y, "correlation", "", 1, reasonFor(na, "shareRankCorrelation5y")),
  ];
}

export function buildExitTiles(s: IndustryStructure): TileDescriptor[] {
  const x = s.exitEvidence;
  const na = s.notApplicable;
  return [
    tileFromScalar(TILE_LABELS.ppeToAssets, x.ppeToAssets, "fraction", "percent", 1, reasonFor(na, "ppeToAssets")),
    tileFromScalar(TILE_LABELS.intangiblesToAssets, x.intangiblesToAssets, "fraction", "percent", 1, reasonFor(na, "intangiblesToAssets")),
    tileFromBare(
      TILE_LABELS.shareOfFirmsWithCapexBelowDepreciation,
      x.shareOfFirmsWithCapexBelowDepreciation,
      "fraction",
      "percent",
      1,
      reasonFor(na, "shareOfFirmsWithCapexBelowDepreciation"),
    ),
  ];
}

export function buildRivalryTiles(s: IndustryStructure): TileDescriptor[] {
  const c = s.concentration;
  const r = s.rivalryEvidence;
  const x = s.exitEvidence;
  const na = s.notApplicable;
  return [
    tileFromBare(TILE_LABELS.firmCount, c.firmCount, "count", c.firmCount === 1 ? "company" : "companies"),
    tileFromScalar(TILE_LABELS.cr4, c.cr4, "fraction", "percent of revenue", 1, reasonFor(na, "cr4")),
    tileFromScalar(TILE_LABELS.hhi, c.hhi, "points", "points", 1, reasonFor(na, "hhi")),
    tileFromBare(TILE_LABELS.revenueSpreadAmongTop10, r.revenueSpreadAmongTop10, "fraction", "percent of the average", 1, reasonFor(na, "revenueSpreadAmongTop10")),
    // revenueCagr5y is a natural-log rate: show the compound rate a reader means.
    tileFromScalar(TILE_LABELS.revenueCagr5y, r.revenueCagr5y, "compoundFromLog", "percent a year", 1, reasonFor(na, "revenueCagr5y")),
    tileFromScalar(TILE_LABELS.daToRevenue, r.daToRevenue, "fraction", "percent", 1, reasonFor(na, "daToRevenue")),
    tileFromBare(TILE_LABELS.grossMarginIqr, s.entryEvidence.grossMarginIqr, "fraction", "percentage points", 1, reasonFor(na, "grossMarginIqr")),
    tileFromScalar(TILE_LABELS.ppeToAssets, x.ppeToAssets, "fraction", "percent", 1, reasonFor(na, "ppeToAssets")),
    tileFromScalar(TILE_LABELS.intangiblesToAssets, x.intangiblesToAssets, "fraction", "percent", 1, reasonFor(na, "intangiblesToAssets")),
    tileFromBare(
      TILE_LABELS.shareOfFirmsWithCapexBelowDepreciation,
      x.shareOfFirmsWithCapexBelowDepreciation,
      "fraction",
      "percent",
      1,
      reasonFor(na, "shareOfFirmsWithCapexBelowDepreciation"),
    ),
  ];
}
