/**
 * The sign a money figure carries, placed BEFORE the currency mark.
 *
 * A negative amount reads "-$88.58B", never "$-88.58B": the minus belongs to
 * the amount, and a reader scanning a column of figures sees the sign first.
 * The character is the ASCII hyphen-minus, the same one `toFixed` emits, so a
 * figure formatted through here and one formatted by `Intl.NumberFormat` print
 * the same glyph. U+2212 is load-bearing elsewhere in the app and is never
 * produced here.
 */
export function moneySign(value: number): string {
  return value < 0 ? "-" : "";
}

/**
 * One step of a compact ladder: a figure at or above `at` prints as the figure
 * divided by `at`, to `digits` decimal places, followed by `suffix`.
 */
export interface CompactTier {
  at: number;
  digits: number;
  suffix: string;
}

/**
 * The compact ladder, written once.
 *
 * Five near-copies of this used to live in as many files, each with its own
 * digit table, and a fix to one of them (where the minus sign goes) had to be
 * repeated in every one. The differences that are real stay in the arguments:
 * which tiers exist, how many decimals each keeps, whether a currency mark is
 * printed, and what a figure below the last tier looks like.
 *
 * `tiers` must run from the largest threshold down. The sign is emitted BEFORE
 * the currency mark, so a negative amount reads "-$88.58B".
 */
export function compactLadder(
  value: number,
  tiers: readonly CompactTier[],
  mark: string,
  below: (value: number) => string,
): string {
  const abs = Math.abs(value);
  const sign = moneySign(value);
  for (const tier of tiers) {
    if (abs >= tier.at) {
      return `${sign}${mark}${(abs / tier.at).toFixed(tier.digits)}${tier.suffix}`;
    }
  }
  return below(value);
}

/** Trillions through thousands, the digits a figure read in prose keeps. */
const PROSE_TIERS: readonly CompactTier[] = [
  { at: 1e12, digits: 2, suffix: "T" },
  { at: 1e9, digits: 2, suffix: "B" },
  { at: 1e6, digits: 2, suffix: "M" },
  { at: 1e3, digits: 1, suffix: "K" },
];

export function formatCurrency(value: number, opts: { compact?: boolean } = {}): string {
  const exact = () =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    }).format(value);
  if (opts.compact === false) return exact();
  return compactLadder(value, PROSE_TIERS, "$", exact);
}

/**
 * A per-share figure in dollars, sign before the mark: -$4.500, not $-4.500.
 * The individual page's sections each carried their own copy of this one-liner
 * and every one of them put the minus in the wrong place.
 */
export function formatPerShare(value: number | null | undefined, digits = 3): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${moneySign(value)}$${Math.abs(value).toFixed(digits)}`;
}

export function formatPercent(value: number, fractionDigits = 3): string {
  return `${value.toFixed(fractionDigits)}%`;
}

export function formatNumber(value: number, fractionDigits = 3): string {
  return compactLadder(value, PROSE_TIERS, "", (v) => {
    const abs = Math.abs(v);
    // Sub-1 values keep at least fractionDigits decimals (0.08 stays 0.080, not 0.1).
    if (abs > 0 && abs < 1) return v.toFixed(Math.max(fractionDigits, abs < 0.001 ? 4 : 3));
    return v.toFixed(fractionDigits);
  });
}

export function pctChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function isMaterialChange(pct: number, threshold = 20): boolean {
  return Math.abs(pct) >= threshold;
}

/** Days since epoch for a "YYYY", "YYYY-MM", or "YYYY-MM-DD" period string. */
function periodToDays(period: string): number {
  const [y, m, d] = period.split("-");
  return Math.floor(Date.UTC(Number(y), m ? Number(m) - 1 : 0, d ? Number(d) : 1) / 86_400_000);
}

/**
 * Transform a level series into "percent change from a year ago", the same units
 * transform FRED offers via Edit Graph → Units. For each point it finds the
 * observation closest to exactly one year earlier (within `toleranceDays`) and
 * computes ((now − yearAgo) / |yearAgo|) × 100. Mirrors the backend
 * build_yoy_series so the toggled view matches FRED's own YoY series.
 */
export function toYoYSeries<T extends { period: string; value: number }>(
  trend: readonly T[],
  toleranceDays = 45,
): { period: string; value: number }[] {
  if (trend.length < 2) return [];
  const sorted = [...trend].sort((a, b) => a.period.localeCompare(b.period));
  const days = sorted.map((p) => periodToDays(p.period));
  const out: { period: string; value: number }[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const target = days[i] - 365;
    // Binary search for the latest prior point at or before the target date.
    let lo = 0;
    let hi = i - 1;
    let pos = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (days[mid] <= target) {
        pos = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    // Nearest neighbour is pos or pos + 1, pick whichever is closer to the target.
    let bestIdx = -1;
    let bestDiff = Infinity;
    for (const j of [pos, pos + 1]) {
      if (j < 0 || j > i - 1) continue;
      const diff = Math.abs(days[j] - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = j;
      }
    }
    if (bestIdx < 0 || bestDiff > toleranceDays) continue;
    const prev = sorted[bestIdx].value;
    if (prev === 0) continue;
    out.push({ period: sorted[i].period, value: ((sorted[i].value - prev) / Math.abs(prev)) * 100 });
  }
  return out;
}

/**
 * The units the two macro payloads actually deliver, checked against
 * `/api/economic` and `/api/credit-banks` on 2026-09-20.
 *
 *   /api/economic       "%" (40 series), "" (22), "$" (12), "x" (1)
 *   /api/credit-banks   "%" (15), "$B" (1), "index" (1)
 *
 * "$B" and "index" reach the app only from the credit payload, and until this
 * was written neither had a branch: reserves of 3051.5 billion dollars printed
 * as "3.1K" and the stress index went through the same plain-number path by
 * accident rather than by decision.
 */
export type MetricDisplayUnit = "" | "$" | "%" | "x" | "$B" | "index";

/**
 * Series whose `unit` arrives as "$" while the FIGURE is in BILLIONS of
 * dollars. The name is not a reliable guide and cannot be used as one: three
 * series named ($M) and one named ($B) are delivered in whole dollars, while
 * the five below are delivered in billions. Each was read off the live payload
 * and checked against the size of the thing it measures:
 *
 *   M2 Money Supply ($B)              23218       $23.22T
 *   M1 Money Supply ($B)              19886.4     $19.89T
 *   Real M2 ($B, inflation-adjusted)  6976.3      $6.98T
 *   Real Exports ($B)                 2787.519    $2.79T
 *   Real Imports ($B)                 3871.231    $3.87T
 *
 * Delivered in whole dollars and already printed correctly, for contrast:
 * Trade Balance ($M), Fed Balance Sheet ($M), Treasury General Account ($M),
 * Residential Fixed Investment ($B) and Net Liquidity ($).
 */
const BILLIONS_SCALED_SERIES: ReadonlySet<string> = new Set([
  "M2 Money Supply ($B)",
  "M1 Money Supply ($B)",
  "Real M2 ($B, inflation-adjusted)",
  "Real Exports ($B)",
  "Real Imports ($B)",
]);

/** The unit a series is actually printed in, once the five scale exceptions
 *  above are applied. */
function displayUnitFor(unit: string, seriesName?: string): string {
  if (unit === "$" && seriesName !== undefined && BILLIONS_SCALED_SERIES.has(seriesName)) {
    return "$B";
  }
  return unit;
}

const BILLION = 1e9;

/**
 * One metric value rendered in its own unit, the formatting the metric
 * dropdown header and the reading picker's evidence line both use.
 *
 * `seriesName` is optional and only ever widens what the function knows: pass
 * it wherever the payload's own series name is to hand, and a dollar figure
 * delivered in billions prints as the amount of money it is. An unrecognised
 * unit falls through to the plain-number branch, which is what every other
 * renderer in the app already does with one.
 */
export function formatUnitValue(
  value: number,
  unit: MetricDisplayUnit | string,
  seriesName?: string,
): string {
  const shown = displayUnitFor(unit, seriesName);
  if (shown === "$B") return formatCurrency(value * BILLION);
  if (shown === "$") return formatCurrency(value);
  if (shown === "%") return formatPercent(value);
  if (shown === "x") return `${value.toFixed(3)}x`;
  // "index" is a level with no unit to print, the same as "".
  return formatNumber(value);
}

/**
 * A percent change printed with its sign, so a figure that describes a MOVE
 * cannot be read as a level. A year-over-year change of 6.9504 prints
 * "+6.95%", never "6.950%".
 */
export function formatSignedPercent(value: number, fractionDigits = 2): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(fractionDigits)}%`;
}

/** The same for a change kept in the series' own unit. */
export function formatSignedUnitValue(
  value: number,
  unit: MetricDisplayUnit | string,
  seriesName?: string,
): string {
  const body = formatUnitValue(value, unit, seriesName);
  return value > 0 ? `+${body}` : body;
}

/** 1 -> "1st", 2 -> "2nd", 63 -> "63rd". Used for a percentile in prose. */
export function ordinal(n: number): string {
  const abs = Math.abs(Math.round(n));
  const tens = abs % 100;
  if (tens >= 11 && tens <= 13) return `${abs}th`;
  const ones = abs % 10;
  if (ones === 1) return `${abs}st`;
  if (ones === 2) return `${abs}nd`;
  if (ones === 3) return `${abs}rd`;
  return `${abs}th`;
}
