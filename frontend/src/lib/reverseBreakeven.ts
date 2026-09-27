// Pure helpers for the Reverse DCF panel: driver labels, number formatting, the
// sentence shown when a driver cannot reach the price, cell tints and the
// plausibility lines. The figures come from GET /api/individual/{t}/reverse-dcf.

import type { StoryUnit } from "./aiApi";
import { formatCurrency, formatPerShare } from "./format";
import { formatStoryValue } from "./story";
import type {
  BreakevenCell, BreakevenDriver, BreakevenGrid, BreakevenDriverName, DcfBreakdown, ReverseBreakevenApplicable,
} from "./types";

export const BREAKEVEN_DRIVERS: Record<BreakevenDriverName, { label: string; def: number; unit: StoryUnit }> = {
  revenueGrowth: { label: "Revenue growth", def: 188, unit: "rate" },
  targetMargin: { label: "Target operating margin", def: 892, unit: "fraction" },
  stableRoic: { label: "Return on capital after growth ends", def: 880, unit: "fraction" },
  salesToCapital: { label: "Sales to capital", def: 45, unit: "ratio" },
};

/** One driver's number in its own unit: 12.34% or 1.40x, "n/a" when missing. */
export function formatDriver(driver: BreakevenDriverName, value: number | null): string {
  return formatStoryValue(BREAKEVEN_DRIVERS[driver].unit, value);
}

/** Why a driver shows no implied number; null when it solved. */
export function statusSentence(d: BreakevenDriver): string | null {
  if (d.status === "solved" && d.implied != null) return null;
  const range = `${formatDriver(d.driver, d.low)} to ${formatDriver(d.driver, d.high)}`;
  if (d.status === "above_range") {
    return `No value from ${range} reaches today's price: every one leaves the company worth less than the price.`;
  }
  if (d.status === "below_range") {
    return `No value from ${range} comes down to today's price: every one leaves the company worth more than the price.`;
  }
  return `The model could not value the company anywhere from ${range}.`;
}

/** The firm's own figure, with the period it covers. */
export function firmFigure(d: BreakevenDriver): string {
  if (d.firm == null) return "n/a";
  const basis = d.firmBasis === "fiveYearMedian" ? "5-year median" : "latest";
  return `${formatDriver(d.driver, d.firm)} (${basis})`;
}

/** Tint for a breakeven cell: only cells worth at least today's price are tinted. */
export function cellTint(cell: BreakevenCell): string | undefined {
  return cell.value != null && cell.atOrAbovePrice ? "rgba(127,184,124,0.24)" : undefined;
}

const pct = (v: number) => formatStoryValue("fraction", v);

/** The plain sentences that test whether the price's numbers are believable. */
export function plausibilityLines(r: ReverseBreakevenApplicable): string[] {
  const p = r.plausibility;
  const lines: string[] = [];
  if (p.impliedRevenueYear10 != null) {
    lines.push(`At the growth the price needs, revenue in year 10 is ${formatCurrency(p.impliedRevenueYear10)}.`);
    if (p.impliedShareOfPeerRevenue != null && p.peerTotalRevenue != null) {
      lines.push(`That is ${pct(p.impliedShareOfPeerRevenue)} of the ${formatCurrency(p.peerTotalRevenue)} the whole peer group sells today.`);
    }
  } else {
    lines.push("Revenue growth alone does not reach today's price, so there is no implied year-10 revenue.");
  }
  if (p.impliedStableRoic != null) {
    const against = [
      p.currentRoic != null ? `a current return on capital of ${pct(p.currentRoic)}` : null,
      p.wacc != null ? `a cost of capital of ${pct(p.wacc)}` : null,
    ].filter(Boolean);
    lines.push(`The price needs a return on capital after growth ends of ${pct(p.impliedStableRoic)}`
      + (against.length ? `, against ${against.join(" and ")}.` : "."));
  } else {
    lines.push("No return on capital after growth ends reaches today's price on its own.");
  }
  return lines;
}

/** The line under a grid none of whose cells reaches the price; null when one does. */
export function gridNote(grid: BreakevenGrid): string | null {
  return grid.reachesPrice ? null : "No combination in this grid reaches today's price";
}

// ── The valuation that justifies today's price ─────────────────────────────

/** The driver the side-by-side opens on: the first that solved, else the first with a run. */
export function defaultValuationDriver(drivers: BreakevenDriver[]): BreakevenDriverName | null {
  const withRun = drivers.filter((d) => d.valuation != null);
  return (withRun.find((d) => d.status === "solved") ?? withRun[0])?.driver ?? null;
}

export interface AssumptionRow {
  driver: BreakevenDriverName;
  model: number | null;
  atPrice: number | null;
  changed: boolean;
}

/** Each driver's number on the model's run and on the price's run; only the selected one moves. */
export function assumptionRows(drivers: BreakevenDriver[], selected: BreakevenDriverName): AssumptionRow[] {
  return drivers.map((d) => {
    const changed = d.driver === selected;
    return { driver: d.driver, model: d.model, atPrice: changed ? d.valuationAt : d.model, changed };
  });
}

/** The terminal value with its numbers substituted:
 *  "$773.96B × (1 − 102.78%) / 3.24% = -$662.92B". */
export function terminalFormula(t: DcfBreakdown["terminal"]): string {
  const rr = t.reinvestmentRate == null ? "n/a" : pct(t.reinvestmentRate);
  return `${formatCurrency(t.ebitAfterTaxNext)} × (1 − ${rr}) / ${pct(t.waccMinusGrowth)} = ${formatCurrency(t.value)}`;
}

/** The value per share read against the price: equal when solved, else the gap. */
export function priceVerdict(v: DcfBreakdown, price: number, solved: boolean): string {
  const at = `${formatPerShare(v.valuePerShare)} a share against today's price of ${formatPerShare(price)}`;
  if (solved) return `${at}: the two are equal.`;
  const gap = formatPerShare(Math.abs(v.gapToPrice));
  return v.gapToPrice < 0 ? `${at}: ${gap} short.` : `${at}: ${gap} above.`;
}
