// Every figure in the block goes through one of these, and every one of them
// wraps a formatter the app already ships. Nothing here rescales anything.
//
// Which wrapper to use is decided by the three unit contracts:
//   backend/connections/UNITS.md, backend/industry_structure/UNITS.md and
//   backend/company_profile/UNITS.md.
//
//   fraction        -> pctFrac      (0.0393 prints 3.9%)
//   already percent -> metricValue  (4.94 prints 4.940%, as the chart header does)
//   points          -> pointsOf     (4.93 prints 4.9 points)
//   times           -> timesOf      (329.77 prints 329.8x)
//   HHI             -> scorePoints  (403.7 prints 404 points, a 0 to 10,000 scale)
//   log annual rate -> compoundPct  (0.4962 prints 64.3%, exp(x) - 1)
//   USD amount      -> usdOf        ($33.3B)
//   local money     -> localMoney   (1.06T TWD, NEVER a dollar sign)
//   display matrix  -> matrixValue  (already x100, formatSectorValue)

import {
  compoundFromLog,
  num,
  pctFromFraction,
  points,
  sharePct,
  times,
  usd,
} from "../cfFormatters";
import { formatNumber, formatUnitValue, ordinal, type MetricDisplayUnit } from "../format";
import { pointsValue } from "../industryStructureFormat";
import { formatSectorValue } from "../sectorMetrics";
import type { SectorMetricUnit } from "../types";

/** What the block prints where the data does not support a figure. */
export const MISSING = "not available";

/** What the block prints where a figure has no meaning for this subject, which
 *  is a different thing from a figure the data could not produce. */
export const NOT_APPLICABLE = "not applicable";

/** How a source that did not answer on this click is named. */
const NOT_LOADED = "Not loaded";

/**
 * The one line at the head of the block naming the three absence words.
 *
 * The block used to carry five ways of saying nothing ("not available", "n/a",
 * "not applicable", "Not loaded" and "no reading five years earlier"), which a
 * reader had to tell apart by guessing. There are three meanings, so there is
 * now one word for each and this sentence says which is which.
 */
export const ABSENCE_LEGEND =
  `Three words mean absence, and nothing else does. "${MISSING}" means the data ` +
  `does not support that figure. "${NOT_APPLICABLE}" means the figure has no meaning ` +
  `for that subject, and the reason follows it. A line beginning "${NOT_LOADED}:" means ` +
  "that source did not answer on this click, so its figures are absent rather than zero.";

/**
 * Every spelling of "no figure" a formatter this block reaches can produce.
 *
 * `formatSectorValue` and `formatMetricValue` answer "n/a" because that is
 * what their cells show on the page. Inside the block they are folded to the
 * one missing word above, so the legend holds.
 */
const ABSENT_FORMS = new Set(["not available", "n/a"]);

/** True when a formatted cell carries no figure at all. */
export function absent(text: string | null | undefined): boolean {
  return text == null || ABSENT_FORMS.has(text.trim().toLowerCase());
}

/** One formatted figure, with every spelling of absence folded to one word. */
export function figureText(text: string): string {
  return absent(text) ? MISSING : text;
}

/**
 * `text` with its unit attached, or the bare missing word when there is no
 * figure to attach a unit to.
 *
 * Every `${formatter(x)}<suffix>` template in this package goes through here.
 * Written by hand, they printed "not availablex", "not available points" and
 * "not available% a year compound", which read as figures rather than as
 * absences.
 */
export function withUnit(text: string, suffix: string): string {
  return absent(text) ? MISSING : `${text}${suffix}`;
}

function finite(v: number | null | undefined): v is number {
  return v != null && Number.isFinite(v);
}

/** A fraction of one, as a percent: 0.0393 -> "3.9%". */
export function pctFrac(v: number | null | undefined, digits = 1): string {
  return finite(v) ? `${pctFromFraction(v, digits)}%` : MISSING;
}

/** A share of a total, keeping two decimals below one percent. */
export function shareOf(v: number | null | undefined): string {
  return finite(v) ? `${sharePct(v)}%` : MISSING;
}

/** A difference between two fractions, already in points: 4.93 -> "4.9 points". */
export function pointsOf(v: number | null | undefined, digits = 1): string {
  return finite(v) ? `${points(v, digits)} points` : MISSING;
}

/** A difference between two fractions expressed as a fraction: 0.0418 -> "4.2 points". */
export function pointsFromFraction(v: number | null | undefined, digits = 1): string {
  return finite(v) ? `${points(v * 100, digits)} points` : MISSING;
}

/**
 * A ratio: 329.77 -> "329.8x".
 *
 * Below one the figure keeps two decimals whatever the caller asked for: at
 * one decimal a coverage ratio of 0.02 printed "0.0x" and a slightly negative
 * one printed "-0.0x", neither of which is the figure.
 */
export function timesOf(v: number | null | undefined, digits = 1): string {
  if (!finite(v)) return MISSING;
  const places = Math.abs(v) < 1 ? Math.max(digits, 2) : digits;
  return `${times(v, places)}x`;
}

/**
 * One `year:value` pair of a series.
 *
 * A pair whose year is absent is the missing word on its own:
 * "not available:not available" reads as a glued unit and says the same
 * nothing twice.
 */
export function yearPair(year: number | null | undefined, value: string): string {
  return finite(year) ? `${num(year, 0)}:${value}` : MISSING;
}

/** A score on a 0 to 10,000 point scale, with its unit: 403.7 -> "404 points". */
export function scorePoints(v: number | null | undefined): string {
  return withUnit(pointsValue(v), " points");
}

/** A natural-log annual rate as the compound rate, with its unit. */
export function compoundYearly(v: number | null | undefined, digits = 1): string {
  return withUnit(compoundPct(v, digits), " a year compound");
}

/** A whole count. */
export function countOf(v: number | null | undefined): string {
  return finite(v) ? num(v, 0) : MISSING;
}

/** A plain coefficient, such as a correlation or a regression slope. */
export function plainNumber(v: number | null | undefined, digits = 3): string {
  return finite(v) ? num(v, digits) : MISSING;
}

/** A US dollar amount. Only ever called on a field whose name ends in Usd, or
 *  on a company that reports in US dollars. */
export function usdOf(v: number | null | undefined): string {
  return finite(v) ? usd(v) : MISSING;
}

/**
 * Money in the company's own reporting currency. The currency code follows the
 * number and no dollar sign is printed, because a New Taiwan dollar figure
 * behind a dollar sign overstated TSM's debt by about thirty times.
 */
export function localMoney(
  v: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (!finite(v)) return MISSING;
  const code = currency && currency.length > 0 ? currency : "local currency";
  return `${formatNumber(v)} ${code}`;
}

/**
 * A per-share or unit price, in the company's reporting currency.
 *
 * The individual page prints these with a dollar sign whatever the filer's
 * currency, which is the one figure in the app that cannot be copied as it
 * stands: TSM's intrinsic value per share is New Taiwan dollars. The currency
 * code replaces the sign here, and the three decimals the page shows are kept.
 */
export function moneyPerShare(
  v: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (!finite(v)) return MISSING;
  const code = currency && currency.length > 0 ? currency : "reporting currency";
  return `${num(v, 3)} ${code}`;
}

/** A money amount: US dollars when the filer reports in them, the local
 *  currency with its code otherwise. */
export function moneyAmount(
  v: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (!finite(v)) return MISSING;
  return currency === "USD" ? usd(v) : localMoney(v, currency);
}

/** A natural-log annual growth rate, shown as the compound rate. */
function compoundPct(v: number | null | undefined, digits = 1): string {
  return finite(v) ? `${compoundFromLog(v, digits)}%` : MISSING;
}

/** A fraction 0..1 as an ordinal percentile: 0.1993 -> "20th". */
export function percentileOf(v: number | null | undefined): string {
  return finite(v) ? ordinal(v * 100) : MISSING;
}

/**
 * The units the app's own renderer knows how to print. Anything else falls
 * through to the plain-number branch, exactly as MetricBlock's formatValue
 * does.
 *
 * "$B" and "index" are what /api/credit-banks delivers on two of its series,
 * and both were being collapsed here: bank reserves printed as a bare figure
 * rather than as the amount of money the page shows.
 */
function narrowUnit(unit: string | null | undefined): MetricDisplayUnit {
  return unit === "$" || unit === "%" || unit === "x" || unit === "$B" || unit === "index"
    ? unit
    : "";
}

/**
 * One economic, credit, sector or industry trend metric, formatted the way the
 * app's own metric header formats it.
 *
 * `name` is the payload's own series name, and passing it is what lets a
 * dollar series DELIVERED in billions print as the amount of money it is:
 * lib/format.ts keys that scale off the name, so without it M2 printed as
 * thousands of dollars against a page that reads the same figure in trillions.
 * It only ever widens what the formatter knows, so a caller with no name to
 * hand may leave it out.
 */
export function metricValue(
  v: number | null | undefined,
  unit: string | null | undefined,
  name?: string,
): string {
  return finite(v) ? formatUnitValue(v, narrowUnit(unit), name) : MISSING;
}

/** One scorecard, ranking or company-metrics cell. These arrive in DISPLAY
 *  units (percents already multiplied by a hundred), so they must never go
 *  through a fraction formatter. The page's own "n/a" is folded to the block's
 *  one missing word. */
export function matrixValue(
  v: number | null | undefined,
  unit: SectorMetricUnit,
): string {
  return figureText(formatSectorValue(v, unit));
}

/** The last period of a trend, which is what "as of" means for that series. */
export function asOfTrend(trend: { period: string }[] | null | undefined): string {
  if (!trend || trend.length === 0) return MISSING;
  return trend[trend.length - 1].period;
}

/** U+2014 EM DASH, built at runtime so no literal em dash lives in source,
 *  the same way lib/copyHygiene.test-helper.ts builds it. */
const EM_DASH = String.fromCharCode(0x2014);

/**
 * Text carried from a payload, made safe for a pipe-delimited line: one line,
 * no pipes, no double spaces. An em dash becomes a comma, because the block is
 * held to the same zero-em-dash rule as the rest of the app and the app's own
 * substitution for one is the punctuation the sentence calls for.
 */
export function plain(text: string | null | undefined): string {
  if (text == null) return "";
  return String(text)
    .split(EM_DASH)
    .join(", ")
    .replace(/\s+/g, " ")
    .split("|")
    .join("/")
    .trim();
}

/**
 * `plain`, cut to `limit` characters, at the last sentence end inside the
 * limit when there is one and at a word boundary otherwise.
 *
 * Cutting on the word alone left a company summary ending "The company's",
 * which reads as a truncated claim rather than as a summary that stopped.
 */
export function plainCapped(text: string | null | undefined, limit: number): string {
  const flat = plain(text);
  if (flat.length <= limit) return flat;
  const cut = flat.slice(0, limit);
  let lastEnd = -1;
  for (let i = 0; i < cut.length; i++) {
    const c = cut[i];
    if ((c === "." || c === "!" || c === "?") && (i + 1 >= cut.length || cut[i + 1] === " ")) {
      lastEnd = i;
    }
  }
  if (lastEnd > limit * 0.5) return cut.slice(0, lastEnd + 1).trim();
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
}

/**
 * The first sentence of a cell, word for word, cut at the sentence end. A
 * terminator only counts when whitespace or the end of the text follows it, so
 * "3.5 percent" and "R&D" do not split a sentence in half.
 */
export function firstSentence(text: string | null | undefined): string {
  const flat = plain(text);
  if (flat.length === 0) return "";
  const m = /[.!?](?=\s|$)/.exec(flat);
  return m ? flat.slice(0, m.index + 1) : flat;
}

/** One pipe-delimited line. Empty cells are dropped, so a line never ends in
 *  a dangling separator. */
export function line(...cells: (string | null | undefined)[]): string {
  return cells.filter((c) => c != null && c !== "").join(" | ");
}

/** A `{field: reason}` guard map, printed as the backend wrote it. */
export function notApplicableLines(
  map: Record<string, string> | null | undefined,
  label: string,
): string[] {
  if (!map) return [];
  const keys = Object.keys(map);
  if (keys.length === 0) return [];
  return keys.map((k) => line(`${label} ${NOT_APPLICABLE}`, k, plain(map[k])));
}

/** The size of a block in bytes, which is what the server limit counts. */
export function byteLength(text: string): number {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text).length;
  return text.length;
}
