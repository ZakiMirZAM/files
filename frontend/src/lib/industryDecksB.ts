// Question decks and panel sentences for plan sections 2.5 to 2.10: strategic
// group map, share-return curve, value system, evolution, the five industry
// environments, and the sector profit pool.
//
// This is the second of the two Part 2 copy modules. Every user-facing string
// for those sections lives here or in industryForcesCopy.ts; the audit and the
// owner-review list live in industryDecksB.draft.md.
//
// House rules: no U+2014 em dashes, no author names, no developer shorthand,
// every question names the chart or table to read, one decision per question,
// the teaching point after the ask.

import type { RuntimeGroup, RuntimeQuestion } from "./types";
import { q, ctx } from "./deckBuilders";
import type {
  GroupMapGroup,
  ShareReturnFit,
  ValueSystemData,
  ValueSystemIndustry,
  ProfitPoolData,
} from "./groupMapApi";
import type { EvolutionSeries, EnvironmentIndicators, YearValue } from "./industryStructureApi";
import {
  compoundRateValue,
  formatR2,
  num,
  pctFromFraction,
  pointsValue,
  days as fmtDays,
  times as fmtTimes,
  scaleSlopePerTenfold,
  NOT_AVAILABLE_FIGURE,
} from "./industryStructureFormat";
import { peerCountLabel } from "./industryForcesCopy";

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

const NOT_AVAILABLE_SENTENCE = "Not available for this industry.";

/** Fraction to a bare percent string for question text. */
function pct(v: number | null | undefined): string {
  return pctFromFraction(v);
}

/** A log-annual rate spoken with the verb its sign calls for. */
function ratePhrase(v: number | null | undefined): string {
  const compound = compoundRateValue(v);
  if (compound == null) return "did not change measurably";
  const rounded = Number(compound.toFixed(1));
  if (rounded === 0) return "did not change measurably";
  const verb = rounded > 0 ? "grew" : "shrank";
  return `${verb} ${Math.abs(rounded).toFixed(1)} percent a year`;
}

/** Quote an interpolated group label so it reads as a name, not a sentence. */
function named(label: string | null | undefined): string {
  return label ? `"${label}"` : "this group";
}

/** A series point the backend actually computed. A null value means the year
 *  could not be computed, and those points are dropped before anything reads
 *  the series. */
interface ReportedYear {
  year: number;
  value: number;
}

function sortedAsc(series: YearValue[] | undefined | null): ReportedYear[] {
  if (!Array.isArray(series)) return [];
  return series
    .filter((d): d is ReportedYear => d != null && Number.isFinite(d.value) && Number.isFinite(d.year))
    .slice()
    .sort((a, b) => a.year - b.year);
}

function firstOf(series: ReportedYear[]): ReportedYear | null {
  return series.length > 0 ? series[0] : null;
}

function lastOf(series: ReportedYear[]): ReportedYear | null {
  return series.length > 0 ? series[series.length - 1] : null;
}

/**
 * "X was A <unit> in <year> and is B <unit> in <year>." Three of the evolution
 * sentences are this shape; only the subject, the formatter and the unit word
 * change between them.
 */
function firstAndLastSentence(
  series: ReportedYear[],
  subject: string,
  format: (v: number) => string,
  firstUnit: string,
  lastUnit: string,
): string {
  const first = firstOf(series);
  const last = lastOf(series);
  if (!first || !last) return NOT_AVAILABLE_SENTENCE;
  return `${subject} was ${format(first.value)} ${firstUnit} in ${first.year} and is ${format(last.value)} ${lastUnit} in ${last.year}.`;
}

// ---------------------------------------------------------------------------
// Titles
// ---------------------------------------------------------------------------

export const GROUP_MAP_DECK_TITLE = "Reading the Strategic Group Map";
export const SHARE_RETURN_DECK_TITLE = "Return Against Market Share";
export const VALUE_SYSTEM_DECK_TITLE = "The Value System Around This Industry";
export const EVOLUTION_DECK_TITLE = "Industry Evolution";
export const FRAGMENTED_DECK_TITLE = "Competing in a Fragmented Industry";
export const EMERGING_DECK_TITLE = "Competing in an Emerging Industry";
export const MATURITY_DECK_TITLE = "The Transition to Maturity";
export const DECLINE_DECK_TITLE = "Competing in a Declining Industry";
export const GLOBAL_DECK_TITLE = "Competing in a Global Industry";
export const PROFIT_POOL_DECK_TITLE = "Where the Sector's Profit Actually Sits";

/** The static "Strategic Groups" question group in questions.ts.
 *
 *  The section that used to render it is gone, so it is NOT excluded from the
 *  industry page's bottom question bank: that bank is now the only place it
 *  appears, and excluding it as well left every answer a reader had already
 *  written to it stored but unreachable. The title stays exported because it
 *  names a group the copy registry tracks. */
export const STRATEGIC_GROUPS_DECK_TITLE = "Strategic Groups";

// ---------------------------------------------------------------------------
// 1. Strategic group map copy and deck (plan 2.5)
// ---------------------------------------------------------------------------

export const GROUP_MAP_COPY = {
  title: "Strategic Group Map",
  bubbleNote: "Bubble area is each company's share of industry revenue.",
  correlationRule:
    "A common rule for these maps: choose dimensions that do not move together.",
  fiveYearToggle: "Show five-year movement",
  preTaxNote:
    "Every return shown on this map is before tax, so it does not match the after-tax return on capital on a company page.",
  noMap: "This industry does not have enough companies with usable data to plot a group map.",
  overviewLink: "How the strategic-group map works",
  loading: "Loading the strategic group map.",
} as const;

/**
 * The sentence under the map. Groups are computed over the whole industry even
 * though only the largest companies are drawn, and the reader has to know that
 * before reading a group's figures.
 */
export function plottedSentence(
  plotted: number | null | undefined,
  available: number | null | undefined,
): string {
  if (plotted == null || !Number.isFinite(plotted) || plotted <= 0) {
    return "No company is plotted on this map yet.";
  }
  if (available == null || !Number.isFinite(available) || available <= plotted) {
    const subject =
      plotted === 1
        ? "the only company in this industry"
        : `all ${num(plotted, 0)} companies in this industry`;
    return `The map plots ${subject}; each group's figures cover every company in the group.`;
  }
  return `The map plots the ${num(plotted, 0)} largest of ${num(available, 0)} companies; each group's figures cover every company in the group.`;
}

/** The axis-correlation sentence beside the pickers. */
export function correlationSentence(r: number | null | undefined): string {
  if (r == null || !Number.isFinite(r)) {
    return `The correlation between these two dimensions is not available for this industry. ${GROUP_MAP_COPY.correlationRule}`;
  }
  return `These two dimensions have a correlation of ${num(r, 2)} in this industry. ${GROUP_MAP_COPY.correlationRule}`;
}

export function buildGroupMapDeck(
  groups: GroupMapGroup[],
  industry: string,
  pageContext?: string,
  plotted?: number | null,
  available?: number | null,
): RuntimeGroup[] {
  if (!Array.isArray(groups) || groups.length === 0) return [];

  const sorted = [...groups].sort((a, b) => b.combinedShare - a.combinedShare);
  const gA = sorted[0];
  const gB = sorted.length > 1 ? sorted[1] : null;

  const groupsTable = groups
    .map(
      (g) =>
        `${named(g.label)}: ${pct(g.combinedShare)} percent of industry revenue, median pre-tax return on capital ${pct(g.medianPreTaxRoic)} percent, ${peerCountLabel(g.firmCount) ?? "no companies"}.`,
    )
    .join("\n");

  const coverage = plottedSentence(plotted, available);
  const figures = ctx(pageContext, `Industry: ${industry}`, coverage, groupsTable);

  const firstAsk = gB
    ? `Read the strategic group map and the group cards under it. ${named(gA.label)} holds ${pct(gA.combinedShare)} percent of industry revenue and earns a median ${pct(gA.medianPreTaxRoic)} percent pre-tax return on capital, against ${pct(gB.combinedShare)} percent and ${pct(gB.medianPreTaxRoic)} percent for ${named(gB.label)}. Name what keeps companies outside ${named(gA.label)} from copying its strategy: scale, brand, technology, distribution, capital, or government. Whatever stops the copying is what keeps the gap in returns open.`
    : `Read the strategic group map and the group card under it. ${named(gA.label)} holds ${pct(gA.combinedShare)} percent of industry revenue and earns a median ${pct(gA.medianPreTaxRoic)} percent pre-tax return on capital. Name what would keep a company outside this group from copying its strategy. Whatever stops the copying is what keeps the gap in returns open.`;

  const questions: RuntimeQuestion[] = [
    q("ind.groups.1", firstAsk, figures),
    q(
      "ind.groups.2",
      "Read the group cards under the map and name the group that looks marginal, with low pre-tax returns on capital and little protection. Decide whether its members are candidates to leave the industry or to move to another group. A group with no barrier around it earns whatever competition allows.",
      figures,
    ),
    q(
      "ind.groups.3",
      "Switch on five-year movement on the map. Decide whether the groups are moving apart or converging on the same position. Groups drifting apart tend to calm rivalry; groups converging tend to intensify it.",
      figures,
    ),
    q(
      "ind.groups.4",
      "Name the trend in this industry that is closing off one group's viability, and the trend raising the barriers around another. Read the Industry Evolution charts below for the trends the data shows. A barrier that is rising is worth more than one that is merely high today.",
      figures,
    ),
    q(
      "ind.groups.5",
      "Pick one group on the map and say how its members would react if demand fell or a new entrant appeared. Companies inside a group tend to react alike, because they carry the same costs and the same commitments.",
      figures,
    ),
    q(
      "ind.groups.6",
      "Decide how much the groups' customers overlap, then write the full account a strategist would give of the structure of competition in this industry, pulling together your answers above. The more their customers overlap, the more directly the groups compete. No length limit; summarize everything from the questions above into the best complete picture you can.",
      figures,
    ),
  ];

  return [{ title: GROUP_MAP_DECK_TITLE, questions }];
}

// ---------------------------------------------------------------------------
// 2. Share-return curve copy and deck (plan 2.6)
// ---------------------------------------------------------------------------

export const SHARE_RETURN_COPY = {
  title: "Share and Return",
  empty:
    "Not enough companies here carry both a revenue share and a return on capital to draw this curve.",
  caveat:
    "The idea that companies caught between low cost and differentiation earn the least has been contested. Later studies disagree, and a high share may be a result of good management rather than a cause of high returns.",
} as const;

/** The fit sentence. Below this R-squared the fitted line explains almost
 *  nothing, and the copy has to say so rather than let the curve speak. */
const WEAK_FIT_R2 = 0.1;

export function shareReturnFitSentence(fit: ShareReturnFit | null | undefined): string {
  if (!fit) return "No line is fitted to these companies.";
  if (fit.r2 == null || !Number.isFinite(fit.r2)) {
    return `A line is fitted across ${num(fit.n, 0)} companies, but its R-squared is not available, so read the scatter itself rather than the line.`;
  }
  const base = `R-squared ${formatR2(fit.r2)} across ${num(fit.n, 0)} companies.`;
  if (fit.r2 < WEAK_FIT_R2) {
    return `${base} At that level the fitted line accounts for almost none of the difference in returns, so read the scatter itself rather than the line.`;
  }
  return base;
}

export function shareReturnQuartileSentence(
  topQuarter: number | null | undefined,
  rest: number | null | undefined,
): string | null {
  if (topQuarter == null || rest == null) return null;
  return `Companies in the top quarter by share earn a median ${pct(topQuarter)} percent pre-tax return on capital; the rest earn ${pct(rest)} percent.`;
}

export function buildShareReturnDeck(
  fit: ShareReturnFit | null,
  topQ: number | null | undefined,
  restQ: number | null | undefined,
  pageContext?: string,
): RuntimeGroup[] {
  const fitNote = shareReturnFitSentence(fit);
  const quarterNote = shareReturnQuartileSentence(topQ, restQ);
  const figures = ctx(pageContext, fitNote, quarterNote);

  const ask =
    `Read the share and return scatter above, not the fitted line. Decide what the picture says about whether size or focus pays in this industry: whether small focused companies and large companies both earn well here while mid-sized ones earn less, or whether the returns show no relation to size at all. ${fitNote} ${SHARE_RETURN_COPY.caveat}` +
    (quarterNote ? ` ${quarterNote}` : "");

  return [
    {
      title: SHARE_RETURN_DECK_TITLE,
      questions: [q("ind.groups.curve", ask, figures)],
    },
  ];
}

// ---------------------------------------------------------------------------
// 3. Value system copy and deck (plan 2.7)
// ---------------------------------------------------------------------------

export const VALUE_SYSTEM_COPY = {
  title: "Value System",
  supplierPicker: "Which industry supplies the most important input?",
  buyerPicker: "Which industry buys the output?",
  placeholder: "Select an industry",
  rows: {
    hhiNow: "Herfindahl-Hirschman Index (HHI) now",
    hhiThen: "Herfindahl-Hirschman Index (HHI) five years ago",
    margin: "Median operating margin",
    growth: "Revenue growth over five years",
    companies: "Companies behind these figures",
  },
  focalTag: "focal",
} as const;

/** Intro sentence for the section, with the industry's own name in it. */
export function valueSystemIntro(industry: string): string {
  return `Every industry sits inside a chain of suppliers and buyers. Choose the industry that supplies ${industry}'s most important input, and the one that buys its output, to see how concentration, margin, and payment terms compare across the chain.`;
}

/** Row text for the company-count row, so a one-company partner is visible. */
export function peerCountCell(side: ValueSystemIndustry | null | undefined): string {
  return peerCountLabel(side?.firmCount) ?? "Not reported";
}

/** One industry's line in the AI context. Figures the payload does not carry
 *  are left out rather than printed as a gap. */
function industryLine(
  role: string,
  name: string,
  side: ValueSystemIndustry,
): string {
  const parts: string[] = [];
  if (side.hhi != null && Number.isFinite(side.hhi)) {
    const then =
      side.hhiFiveYearsAgo != null && Number.isFinite(side.hhiFiveYearsAgo)
        ? `, against ${pointsValue(side.hhiFiveYearsAgo)} points five years ago`
        : "";
    parts.push(`Herfindahl-Hirschman Index ${pointsValue(side.hhi)} points${then}`);
  }
  if (side.medianOperatingMargin != null && Number.isFinite(side.medianOperatingMargin)) {
    parts.push(`median operating margin ${pct(side.medianOperatingMargin)} percent`);
  }
  if (side.revenueCagr5y != null && Number.isFinite(side.revenueCagr5y)) {
    parts.push(`revenue ${ratePhrase(side.revenueCagr5y)} over five years`);
  }
  const count = peerCountLabel(side.firmCount);
  if (count) parts.push(`${count} behind those figures`);
  if (parts.length === 0) {
    return `${role}: ${named(name)}. No company in this industry has financial rows on file.`;
  }
  return `${role}: ${named(name)}, ${parts.join(", ")}.`;
}

export function buildValueSystemDeck(
  data: ValueSystemData | null,
  industry: string,
  pageContext?: string,
): RuntimeGroup[] {
  if (!data) return [];
  const focal = data.focal;
  const supplierLabel = data.supplier ? named(data.supplier.industry) : "the supplier industry";
  const hasSupplier =
    data.supplier != null &&
    Number.isFinite(data.supplier.hhi ?? NaN) &&
    Number.isFinite(focal.hhi ?? NaN);

  const dpArr = sortedAsc(focal.daysPayableByYear);
  const drArr = sortedAsc(focal.daysReceivableByYear);
  const latestDP = lastOf(dpArr);
  const latestDR = lastOf(drArr);

  const figures = ctx(
    pageContext,
    industryLine("Focal industry", industry, focal),
    data.supplier ? industryLine("Supplier industry", data.supplier.industry, data.supplier) : undefined,
    data.buyer ? industryLine("Buyer industry", data.buyer.industry, data.buyer) : undefined,
    latestDP && latestDR
      ? `In fiscal ${latestDP.year} companies here took ${fmtDays(latestDP.value)} days to pay suppliers and waited ${fmtDays(latestDR.value)} days to be paid.`
      : undefined,
  );

  const chainAsk = hasSupplier
    ? `Read the value system table above. The supplier industry ${supplierLabel} has a Herfindahl-Hirschman Index of ${pointsValue(data.supplier?.hhi)} points against ${pointsValue(focal.hhi)} here, and a median operating margin of ${pct(data.supplier?.medianOperatingMargin)} percent against ${pct(focal.medianOperatingMargin)} percent. Decide which of the two holds the bargaining power, and whether it is shifting. The more concentrated and better-paid side of a trade usually keeps more of the profit.`
    : `Choose a supplier industry in the picker above, then read the value system table and decide which of the two holds the bargaining power${data.supplier ? ` between ${supplierLabel} and this industry` : ""}. The more concentrated and better-paid side of a trade usually keeps more of the profit.`;

  const daysAsk =
    latestDP && latestDR
      ? `Read the days payable and days receivable chart above. In fiscal ${latestDP.year} companies here took ${fmtDays(latestDP.value)} days to pay their suppliers and waited ${fmtDays(latestDR.value)} days to be paid. Decide who is financing whom along this chain. Paying later than you are paid means the suppliers are funding this industry's working capital.`
      : "Read the days payable and days receivable chart above and decide who is financing whom along this chain. Paying later than you are paid means the suppliers are funding this industry's working capital.";

  return [
    {
      title: VALUE_SYSTEM_DECK_TITLE,
      questions: [
        q("ind.chain.1", chainAsk, figures),
        q("ind.chain.2", daysAsk, figures),
        q(
          "ind.chain.3",
          "Compare the two Herfindahl-Hirschman Index rows in the table above, now against five years ago, for the supplier and buyer industries. Decide whether either one is consolidating, and what that does to the prices this industry can charge or must pay. A consolidating buyer takes price out of its suppliers year after year.",
          figures,
        ),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// 4. Evolution sentences and deck (plan 2.8)
// ---------------------------------------------------------------------------

export const EVOLUTION_COPY = {
  title: "Industry Evolution",
  lifeCycleNote:
    "Why not just use the life cycle? The main objections: stage lengths vary widely; industries skip or reverse stages; companies can change the curve through innovation; and the nature of competition at each stage differs by industry.",
  cards: {
    revenue: "Revenue and growth",
    companies: "Companies and net entry",
    hhi: "Concentration (HHI)",
    marginSpread: "Gross margin spread between companies",
    rdSpread: "Research and development spread between companies",
    capacity: "Capital spending against depreciation",
  },
  countCaveat:
    "These are listings, not firm births. A jump in the count can be the data vendor widening coverage rather than companies being founded, and the most recent year can look low because some companies have not reported yet.",
} as const;

export interface EvolutionSentence {
  key: keyof typeof EVOLUTION_COPY.cards;
  title: string;
  text: string;
  available: boolean;
}

/** Fraction of the previous year's count above which a jump is worth naming. */
const COVERAGE_JUMP = 0.15;

function coverageJumpNote(firmCount: ReportedYear[]): string {
  for (let i = 1; i < firmCount.length; i++) {
    const prev = firmCount[i - 1];
    const curr = firmCount[i];
    if (prev.value > 0 && (curr.value - prev.value) / prev.value >= COVERAGE_JUMP) {
      return ` The count here went from ${num(prev.value, 0)} in ${prev.year} to ${num(curr.value, 0)} in ${curr.year}, which is the kind of step that usually means wider coverage rather than new companies.`;
    }
  }
  return "";
}

/**
 * The six sentences printed under the six evolution charts. Each states
 * figures and names the years they come from, and nothing else.
 *
 * Growth comes only from the backend's log-annual figures, converted to the
 * compound rate. There is no fallback that averages year-over-year rates:
 * two definitions of one idea would print two different numbers for it.
 */
export function buildEvolutionSentences(
  evolution: EvolutionSeries | null | undefined,
  env?: EnvironmentIndicators | null,
): EvolutionSentence[] {
  const revenue = sortedAsc(evolution?.revenue);
  const firmCount = sortedAsc(evolution?.firmCount);
  const netEntry = sortedAsc(evolution?.netEntry);
  const hhi = sortedAsc(evolution?.hhi);
  const marginSpread = sortedAsc(evolution?.grossMarginSpread);
  const rdSpread = sortedAsc(evolution?.rdIntensitySpread);
  const capexToDep = sortedAsc(evolution?.capexToDepreciation);
  const revenueOverPpe = sortedAsc(evolution?.revenueOverPpe);

  // 1. Revenue and growth.
  const first = firstOf(revenue);
  const last = lastOf(revenue);
  const midYear =
    first && last ? Math.round((first.year + last.year) / 2) : null;
  const growthFirst = env?.growthFirst5y ?? null;
  const growthLast = env?.growthLast5y ?? null;
  const growthReady =
    growthFirst != null &&
    Number.isFinite(growthFirst) &&
    growthLast != null &&
    Number.isFinite(growthLast) &&
    first != null &&
    last != null &&
    midYear != null;
  const revenueText = growthReady
    ? `Revenue ${ratePhrase(growthFirst)} from ${first!.year} to ${midYear}, and ${ratePhrase(growthLast)} from ${midYear} to ${last!.year}.`
    : NOT_AVAILABLE_SENTENCE;

  // 2. Companies and net entry.
  const entryWindow = netEntry.slice(-5);
  const entries = entryWindow.filter((d) => d.value > 0).reduce((s, d) => s + d.value, 0);
  const exits = entryWindow.filter((d) => d.value < 0).reduce((s, d) => s + Math.abs(d.value), 0);
  const windowFrom = entryWindow.length > 0 ? entryWindow[0].year : null;
  const windowTo = entryWindow.length > 0 ? entryWindow[entryWindow.length - 1].year : null;
  const countText =
    firmCount.length >= 2 && windowFrom != null && windowTo != null
      ? `${num(entries, 0)} ${entries === 1 ? "company" : "companies"} first reported and ${num(exits, 0)} last reported between ${windowFrom} and ${windowTo}. ${EVOLUTION_COPY.countCaveat}${coverageJumpNote(firmCount)}`
      : NOT_AVAILABLE_SENTENCE;

  // 3, 4 and 5: concentration, gross margin spread, research spread.
  const hhiText = firstAndLastSentence(
    hhi,
    "The Herfindahl-Hirschman Index",
    pointsValue,
    "points",
    "points",
  );
  const gmText = firstAndLastSentence(
    marginSpread,
    "The gross margin spread between companies",
    pct,
    "percentage points",
    "points",
  );
  const rdText = firstAndLastSentence(
    rdSpread,
    "The research and development spread between companies",
    pct,
    "percentage points",
    "points",
  );

  // 6. Capacity.
  const capexLast = lastOf(capexToDep);
  const ppeLast = lastOf(revenueOverPpe);
  const ppeThen =
    revenueOverPpe.length > 0
      ? revenueOverPpe[Math.max(0, revenueOverPpe.length - 6)]
      : null;
  const capacityText =
    capexLast && ppeLast && ppeThen
      ? `Capital spending is ${fmtTimes(capexLast.value)} times depreciation in ${capexLast.year}. A dollar of plant produced ${fmtTimes(ppeLast.value)} dollars of revenue in ${ppeLast.year}, against ${fmtTimes(ppeThen.value)} in ${ppeThen.year}.`
      : NOT_AVAILABLE_SENTENCE;

  return [
    { key: "revenue", title: EVOLUTION_COPY.cards.revenue, text: revenueText, available: growthReady },
    { key: "companies", title: EVOLUTION_COPY.cards.companies, text: countText, available: countText !== NOT_AVAILABLE_SENTENCE },
    { key: "hhi", title: EVOLUTION_COPY.cards.hhi, text: hhiText, available: hhiText !== NOT_AVAILABLE_SENTENCE },
    { key: "marginSpread", title: EVOLUTION_COPY.cards.marginSpread, text: gmText, available: gmText !== NOT_AVAILABLE_SENTENCE },
    { key: "rdSpread", title: EVOLUTION_COPY.cards.rdSpread, text: rdText, available: rdText !== NOT_AVAILABLE_SENTENCE },
    { key: "capacity", title: EVOLUTION_COPY.cards.capacity, text: capacityText, available: capacityText !== NOT_AVAILABLE_SENTENCE },
  ];
}

export function buildEvolutionDeck(
  evolution: EvolutionSeries,
  pageContext?: string,
  env?: EnvironmentIndicators | null,
): RuntimeGroup[] {
  const sentences = buildEvolutionSentences(evolution, env);
  const figures = ctx(pageContext, ...sentences.map((s) => `${s.title}: ${s.text}`));

  return [
    {
      title: EVOLUTION_DECK_TITLE,
      questions: [
        q(
          "ind.evolve.1",
          "Read the gross margin spread chart above. Decide whether buyers here are becoming more experienced and better informed, so that they treat the product more like a commodity over time. Margins converge as buyers learn what the product is worth.",
          figures,
        ),
        q(
          "ind.evolve.2",
          "Read the research and development spread chart above. Decide whether the know-how that once protected the leaders is spreading, through staff moving between companies, suppliers selling the same equipment to everyone, or products being copied. Know-how that spreads stops being a barrier.",
          figures,
        ),
        q(
          "ind.evolve.3",
          "Read the companies and net entry chart above, then name any established company from another industry that has entered here recently or signaled that it will. Entrants from adjacent industries arrive with scale and cash, and they often change the rules rather than play by them.",
          figures,
        ),
        q(
          "ind.evolve.4",
          "Name the policy change likely to raise the capital needed or the minimum size required to compete here. A rule that raises the price of admission protects whoever is already inside.",
          figures,
        ),
        q(
          "ind.evolve.5",
          `Putting the six charts above and your answers together, decide whether the barriers protecting established companies are rising, holding, or falling, and name the process driving it. ${EVOLUTION_COPY.lifeCycleNote} No length limit; summarize everything from the questions above into the best complete picture you can.`,
          figures,
        ),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// 5. Five industry environments (plan 2.9)
// ---------------------------------------------------------------------------

export const ENVIRONMENT_SECTION = {
  eyebrow: "Structural Fit",
  heading: "Which Environment Is This?",
} as const;

function orNA(v: number | null | undefined, format: (x: number) => string): string {
  return v != null && Number.isFinite(v) ? format(v) : NOT_AVAILABLE_FIGURE;
}

/** Each environment deck's collapsed-header sentence, keyed by deck title. */
export function buildEnvironmentHeaderNotes(
  ind: EnvironmentIndicators,
): Record<string, string> {
  const inflPart =
    ind.inflationAdjusted5yRevenueChange != null &&
    Number.isFinite(ind.inflationAdjusted5yRevenueChange)
      ? `Revenue after inflation changed ${pct(ind.inflationAdjusted5yRevenueChange)} percent over five years`
      : "Revenue after inflation is not available for this industry";
  const countriesPart =
    ind.countries != null && Number.isFinite(ind.countries)
      ? `The ten largest companies are based in ${num(ind.countries, 0)} countries.`
      : "The number of countries the ten largest companies are based in is not available for this industry.";

  return {
    [FRAGMENTED_DECK_TITLE]: `Herfindahl-Hirschman Index ${orNA(ind.hhi, pointsValue)} points; the four largest companies hold ${orNA(ind.cr4, (v) => pct(v))} percent of revenue; the scale economies slope is ${orNA(ind.scaleSlope, (v) => num(scaleSlopePerTenfold(v), 1))} points of operating margin for every tenfold increase in revenue (R-squared ${orNA(ind.scaleR2, formatR2)}).`,
    [EMERGING_DECK_TITLE]: `Revenue ${ratePhrase(ind.revenueCagr5y)} over five years; the median company has ${orNA(ind.medianYearsOfHistory, (v) => num(v, 0))} years of reported history.`,
    [MATURITY_DECK_TITLE]: `Revenue ${ratePhrase(ind.growthFirst5y)} over the first five years and ${ratePhrase(ind.growthLast5y)} over the last five; capital spending is ${orNA(ind.capexToDepreciation, (v) => fmtTimes(v))} times depreciation.`,
    [DECLINE_DECK_TITLE]: `${inflPart}; net entry over five years ${orNA(ind.netEntry5y, (v) => `${num(v, 0)} ${Math.abs(v) === 1 ? "company" : "companies"}`)}.`,
    [GLOBAL_DECK_TITLE]: countriesPart,
  };
}

export function buildEnvironmentDecks(
  ind: EnvironmentIndicators,
  pageContext?: string,
): RuntimeGroup[] {
  const headers = buildEnvironmentHeaderNotes(ind);
  const figures = ctx(pageContext, ...Object.values(headers));

  return [
    {
      title: FRAGMENTED_DECK_TITLE,
      questions: [
        q("ind.env.frag.1", "Read the concentration figures in this deck's header. Name why this industry is fragmented: low entry barriers, no economies of scale, high transport costs, diverse buyer needs, heavy creative or personal service content, local regulation, or exit barriers that keep marginal companies alive. The cause decides whether the fragmentation can be undone at all.", figures),
        q("ind.env.frag.2", "Decide whether that cause can be overcome, for example by standardizing diverse needs, splitting off the part of the business that resists scale, or buying companies to reach a workable size. Consolidating an industry whose costs do not fall with size destroys money rather than making it.", figures),
        q("ind.env.frag.3", "Name any company that has tried to consolidate this industry, and say what happened to it. A failed attempt is the cheapest evidence you will get about whether the structure allows one.", figures),
        q("ind.env.frag.4", "Read the Key Players table on this page and decide which coping strategy the strongest companies use: tightly managed decentralization, formula facilities, added value, specialization by product, customer, or order type, a geographic focus, or a bare bones cost position. A fragmented industry rewards discipline in one of these, not all of them.", figures),
        q("ind.env.frag.5", "Decide whether any leading company here is seeking dominance in a structure that will not allow it. Chasing a share the structure cannot deliver is the most common way money is lost in a fragmented industry.", figures),
        q("ind.env.frag.6", "Decide whether the leading companies here show strategic discipline, or chase every opportunity and lose focus. In a fragmented industry the cost of an unfocused move is paid immediately, because nobody has the scale to absorb it.", figures),
      ],
    },
    {
      title: EMERGING_DECK_TITLE,
      questions: [
        q("ind.env.emerg.1", "Name the technology or product design most likely to win here, and say how certain that is. Until the design settles, every company's investment is a bet rather than a commitment.", figures),
        q("ind.env.emerg.2", "Read the strategic group map on this page and decide whether an agreed way to compete has emerged, or whether every company is trying something different. Scattered positions on the map are the signature of an industry that has not settled.", figures),
        q("ind.env.emerg.3", "Decide how fast costs are falling as volume grows here, and name the company furthest down that curve. Early volume becomes a permanent cost advantage only when the learning stays inside the company.", figures),
        q("ind.env.emerg.4", "Name the first buyers of this product and what would convince the next group to switch from what they use today. The second group of buyers is usually harder to win than the first, and it is the one that decides the size of the industry.", figures),
        q("ind.env.emerg.5", "Name what is holding this industry's development back: missing infrastructure, no product standards, erratic quality, customer confusion, regulatory approval, or the response of the industries it threatens. The binding constraint sets the pace, not the technology.", figures),
        q("ind.env.emerg.6", "Name the early barriers protecting today's leaders here, proprietary technology, access to distribution, access to inputs, or experience, and decide which will fade as the industry matures. A barrier that fades is a head start rather than a defense.", figures),
        q("ind.env.emerg.7", "Decide whether it is better to be early or late in this industry. Early entry pays when reputation and experience stay with the pioneer; late entry pays when pioneers bear the cost of opening the market and the technology keeps changing.", figures),
      ],
    },
    {
      title: MATURITY_DECK_TITLE,
      questions: [
        q("ind.env.mature.1", "Read the growth figures in this deck's header. Decide whether companies here are now fighting for share rather than sharing in growth. When growth stops, one company's gain has to come out of another's.", figures),
        q("ind.env.mature.2", "Decide whether buyers here are now experienced repeat purchasers choosing between brands, rather than deciding whether to buy at all. Repeat buyers know what the product costs to make, and they price accordingly.", figures),
        q("ind.env.mature.3", "Decide whether competition here has shifted toward cost and service. That shift is what turns a growth industry into a grinding one, and it usually arrives before anyone admits it.", figures),
        q("ind.env.mature.4", "Read the capital spending against depreciation chart in the Industry Evolution section. Decide whether this industry is adding capacity faster than demand is growing. Capacity added into flat demand is paid for with price.", figures),
        q("ind.env.mature.5", "Read the Key Players table on this page and decide whether companies based abroad are gaining share. Foreign entrants often bring a cost base the incumbents cannot match on their own ground.", figures),
        q("ind.env.mature.6", "Read the strategic group map and decide which companies have made a clear choice between low cost, differentiation, and focus, and which are caught between them. The ones caught in between carry the costs of both and the advantages of neither.", figures),
        q("ind.env.mature.7", "Name any company here investing heavily to build share in a market that has stopped growing. Share bought in a flat market rarely returns its price.", figures),
        q("ind.env.mature.8", "Decide whether any company here is using a claim of higher quality as a reason not to meet competitors' prices. A quality claim buyers do not accept is a way of losing share slowly.", figures),
      ],
    },
    {
      title: DECLINE_DECK_TITLE,
      questions: [
        q("ind.env.decline.1", "Read the revenue chart in the Industry Evolution section. Name why demand is falling here, technological substitution, demographics, or changing needs, and say how certain and how fast the decline is. Certain, fast decline calls for a different answer than slow, uncertain decline.", figures),
        q("ind.env.decline.2", "Name the pockets of demand here that will stay stable or decline slowly, and the companies serving them. A profitable pocket inside a declining industry is worth more than a share of the whole of it.", figures),
        q("ind.env.decline.3", "Read the exit evidence tiles on this page. Decide how high the exit barriers are: durable specialized assets, fixed costs of leaving such as labor settlements, links to a company's other businesses, management's attachment, or government and social pressure. High exit barriers turn a decline into a price war.", figures),
        q("ind.env.decline.4", "Decide whether the remaining competitors are likely to fight a war of attrition, each investing to outlast the others. Attrition destroys the value of the pockets that would otherwise have been worth holding.", figures),
        q("ind.env.decline.5", "Decide where the leading company sits on this grid and why: when the structure is favorable for decline and the company has strengths in the remaining pockets, it can pursue leadership or a niche; favorable structure without strengths calls for harvesting or a quick sale; unfavorable structure with strengths calls for a niche or harvesting; unfavorable structure without strengths calls for selling quickly. The structure of the decline matters as much as the company's own position.", figures),
        q("ind.env.decline.6", "Decide whether any company here is harvesting without a clear end point, or failing to recognize the decline at all. Harvesting without a deadline is how a business is run into the ground by accident.", figures),
      ],
    },
    {
      title: GLOBAL_DECK_TITLE,
      questions: [
        q("ind.env.global.1", "Read the Key Players table on this page. Decide whether a company's position in one country depends on its position worldwide. If it does, this is a global industry, and a purely national competitor is at a structural disadvantage.", figures),
        q("ind.env.global.2", "Name the sources of global advantage that apply here: comparative advantage in costs, production scale beyond any one national market, global experience, logistics scale, marketing scale, purchasing scale, a worldwide reputation, proprietary technology, or the ability to move production. Each source is worth something only where the cost of serving one country from another is low.", figures),
        q("ind.env.global.3", "Name what holds global competition back here: transport costs, different product needs by country, the need for local service, government barriers such as tariffs and local content rules, or the burden of managing across borders. These are the obstacles that keep a national company viable.", figures),
        q("ind.env.global.4", "Read the Key Players table and sort the leading companies into four kinds: a broad line worldwide, one segment worldwide, one country, or a protected niche. Each kind is vulnerable to a different change in the rules.", figures),
        q("ind.env.global.5", "Decide whether the companies in the Key Players table are the right comparison set for this industry, or whether important competitors are private or listed somewhere this page does not reach. A peer set that misses the real competitors flatters everything built on it.", figures),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// 6. Profit pool copy and deck (plan 2.10)
// ---------------------------------------------------------------------------

export const PROFIT_POOL_COPY = {
  title: "Profit Pool",
  note: "Bar width is each industry's share of sector revenue and bar height is its operating margin, so the area of a bar is its share of the sector's operating profit.",
  negative:
    "This sector's combined operating profit is negative, so shares of it are not meaningful and are left blank.",
  empty: "No industry in this sector has both revenue and operating profit on file.",
} as const;

export function buildProfitPoolDeck(
  data: ProfitPoolData | null,
  sector: string,
  pageContext?: string,
): RuntimeGroup[] {
  if (!data) return [];
  const ranked = [...data.industries].sort(
    (a, b) => (b.profitShare ?? -Infinity) - (a.profitShare ?? -Infinity),
  );
  const top = ranked[0] ?? null;

  const figures = ctx(
    pageContext,
    `Sector: ${named(sector)}, fiscal year ${data.fiscalYear}. Total revenue ${num(data.totalRevenueUsd / 1e9, 1)} billion US dollars, total operating profit ${num(data.totalOperatingProfitUsd / 1e9, 1)} billion US dollars.`,
    data.negativeSectorProfit ? PROFIT_POOL_COPY.negative : undefined,
    ...data.industries.map(
      (i) =>
        `${named(i.industry)}: ${pct(i.revenueShare)} percent of sector revenue, operating margin ${pct(i.operatingMargin)} percent, ${i.profitShare == null ? "share of sector profit not meaningful" : `${pct(i.profitShare)} percent of sector profit`}${i.profitShareFiveYearsAgo != null ? ` (${pct(i.profitShareFiveYearsAgo)} percent five years ago)` : ""}.`,
    ),
  );

  const secondAsk =
    top && !data.negativeSectorProfit
      ? `Read the profit pool chart again, comparing each industry's share of sector profit now with its share five years ago. ${named(top.industry)} holds the largest share today. Name the industry that gained the most, and what changed in its structure to let it. A share of profit that moves is evidence that a barrier moved with it.`
      : "Read the profit pool chart again, comparing each industry's share of sector profit now with its share five years ago. Name the industry that gained the most, and what changed in its structure to let it. A share of profit that moves is evidence that a barrier moved with it.";

  return [
    {
      title: PROFIT_POOL_DECK_TITLE,
      questions: [
        q(
          "sec.pool.1",
          "Read the profit pool chart above. Name the industry that is wide but short, with large revenue and a thin margin, and the one that is narrow but tall. Decide whether that matches the answer you gave earlier about which layer of this sector keeps the most profit. Revenue tells you where the activity is; area tells you where the money ends up.",
          figures,
        ),
        q("sec.pool.2", secondAsk, figures),
        q(
          "sec.pool.3",
          "Read the profit pool chart once more and decide whether this sector's most profitable industries win on margin, on revenue share, or on both. Winning on margin points to a barrier; winning on share alone points to size without protection.",
          figures,
        ),
      ],
    },
  ];
}
