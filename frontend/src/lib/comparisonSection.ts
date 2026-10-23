// Pure logic for the "How {company} differs" section on the Company page.
//
// It reads only the existing comparison table (GET /api/individual/{t}/spreads,
// backend/company_profile/spreads.py) and computes nothing new: no metric, no
// column. What lives here is layout (which heading a row sits under), binding
// (which [above]/[below] variant a question shows) and hiding (which questions
// have no table rows to draw on). All of it is exported for the tests.

import type { SpreadMetric, SpreadsData } from "./stageContext/types";
import type { CompanyEvent } from "./types";
import type {
  BoxQuestion,
  DeckQuestion,
  RowConcept,
  RowRule,
} from "./comparisonQuestions";

// ── Layout ──────────────────────────────────────────────────────────────────

/** The owner's headings, in order, with the table rows that fit each. A heading
 *  with no rows in the payload is not shown; rows that fit none go under Other. */
export const ROW_GROUPS: { heading: string; keys: string[] }[] = [
  { heading: "Growth", keys: ["revenue_growth", "net_income_growth"] },
  { heading: "Pricing and costs", keys: ["operating_margin", "net_margin", "dupont_ebit_margin"] },
  { heading: "Capital", keys: ["sales_invested_capital", "asset_turnover", "capex_depreciation"] },
  { heading: "Working capital", keys: [] },
  {
    heading: "Returns",
    keys: ["roic", "wacc", "roic_wacc_spread", "eva_margin", "roe", "cost_of_equity", "excess_return"],
  },
  {
    heading: "Risk and cash",
    keys: ["net_debt_ocf", "liabilities_equity", "equity_multiplier", "fcf_net_income", "operating_leverage"],
  },
];

export const OTHER_HEADING = "Other";

/** Rows whose good or bad direction depends on context: leverage and capital
 *  intensity (the table has no days-to-pay or cash conversion cycle row). */
export const CONTEXT_MARKER_KEYS = new Set([
  "net_debt_ocf",
  "liabilities_equity",
  "equity_multiplier",
  "sales_invested_capital",
  "asset_turnover",
  // Above 1 can be growth investment or overbuilding; below 1 can be
  // efficiency or under-investment.
  "capex_depreciation",
]);

export function groupedRows(p: SpreadsData | null | undefined): { heading: string; keys: string[] }[] {
  const metrics = p?.metrics ?? {};
  const placed = new Set<string>();
  const out: { heading: string; keys: string[] }[] = [];
  for (const g of ROW_GROUPS) {
    const keys = g.keys.filter((k) => k in metrics);
    keys.forEach((k) => placed.add(k));
    if (keys.length) out.push({ heading: g.heading, keys });
  }
  const other = Object.keys(metrics).filter((k) => !placed.has(k));
  if (other.length) out.push({ heading: OTHER_HEADING, keys: other });
  return out;
}

// ── Row mapping (Step 1, section 6) ─────────────────────────────────────────

/** Each concept the questions name, mapped to the table rows that measure it.
 *  An empty list is a concept the table does not carry. */
export const CONCEPT_ROWS: Record<RowConcept, string[]> = {
  revenueGrowth: ["revenue_growth"],
  grossMargin: [],
  operatingMargin: ["operating_margin"],
  overhead: [],
  capitalIntensity: ["sales_invested_capital", "asset_turnover"],
  daysToCollect: [],
  daysOfInventory: [],
  daysToPay: [],
  cashConversionCycle: [],
  roic: ["roic"],
  roicSpread: ["roic_wacc_spread"],
  marginVolatility: [],
  leverage: ["net_debt_ocf"],
  cashConversion: ["fcf_net_income"],
  marketImplied: [],
  peerGrossMargin: [],
};

/** Plain names for the concepts, used when a question is hidden. */
export const CONCEPT_NAMES: Record<RowConcept, string> = {
  revenueGrowth: "revenue growth",
  grossMargin: "gross margin",
  operatingMargin: "operating margin",
  overhead: "operating expenses (SG&A, R&D)",
  capitalIntensity: "capital intensity",
  daysToCollect: "days to collect",
  daysOfInventory: "days of inventory",
  daysToPay: "days to pay suppliers",
  cashConversionCycle: "cash conversion cycle",
  roic: "return on invested capital",
  roicSpread: "return minus cost of capital",
  marginVolatility: "margin volatility",
  leverage: "leverage",
  cashConversion: "cash conversion",
  marketImplied: "a market-implied expectations metric",
  peerGrossMargin: "each peer's gross margin",
};

/** Table rows present in the payload for a list of concepts, in order, unique. */
export function mappedRows(p: SpreadsData | null | undefined, concepts: RowConcept[]): string[] {
  const metrics = p?.metrics ?? {};
  const out: string[] = [];
  for (const c of concepts) {
    for (const k of CONCEPT_ROWS[c]) {
      if (k in metrics && !out.includes(k)) out.push(k);
    }
  }
  return out;
}

// ── Direction ───────────────────────────────────────────────────────────────

/** Below this many firms in the group, the industry median is the benchmark. */
export const MIN_GROUP_FIRMS_FOR_GROUP_MEDIAN = 5;

export function usesGroupMedian(p: SpreadsData | null | undefined): boolean {
  return (p?.groupFirmCount ?? 0) >= MIN_GROUP_FIRMS_FOR_GROUP_MEDIAN;
}

function finite(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** The benchmark a row is compared with: the group median, or the industry
 *  median when the group has fewer than five members. */
export function benchmarkOf(p: SpreadsData, m: SpreadMetric): number | null {
  const v = usesGroupMedian(p) ? m.groupMedian : m.industryMedian;
  return finite(v) ? v : null;
}

/** "above" or "below" the benchmark, or null when equal or not meaningful. */
export function directionOf(p: SpreadsData, key: string): "above" | "below" | null {
  const m = p.metrics?.[key];
  if (!m || !finite(m.company)) return null;
  const b = benchmarkOf(p, m);
  if (b == null || m.company === b) return null;
  return m.company > b ? "above" : "below";
}

// ── Row rules ───────────────────────────────────────────────────────────────

/** Rows where the company ranks in the top or bottom fifth of the ranked set. */
export function fifthRows(p: SpreadsData): string[] {
  return Object.entries(p.metrics ?? {})
    .filter(([, m]) => {
      if (!finite(m.rank) || !finite(m.count) || m.count < 5) return false;
      const fifth = Math.floor(m.count / 5);
      return m.rank <= fifth || m.rank > m.count - fifth;
    })
    .map(([k]) => k);
}

/** Medians this close to zero make a percent-of-median gap meaningless. */
export const NEAR_ZERO_MEDIAN = { "%": 1, x: 0.05 } as const;

/** The row furthest from its benchmark, measured as the gap in percent of the
 *  benchmark so percent and ratio rows compare. Rows whose benchmark is near
 *  zero are skipped. */
/** Rows that may not be "the row furthest from the group": derived spreads
 *  restate another row's gap (ROIC - WACC restates ROIC), and cost-of-capital
 *  and market multiples describe the market, not what the company does. */
export const LARGEST_GAP_EXCLUDED = new Set([
  "roic_wacc_spread",
  "excess_return",
  "eva_margin",
  "wacc",
  "cost_of_equity",
  "pb",
  "pe",
  "justified_pb",
]);

export function largestGapRow(p: SpreadsData): string | null {
  let best: string | null = null;
  let bestScore = -1;
  for (const [k, m] of Object.entries(p.metrics ?? {})) {
    if (LARGEST_GAP_EXCLUDED.has(k)) continue;
    const b = benchmarkOf(p, m);
    if (!finite(m.company) || b == null) continue;
    // Opposite signs (net cash against net debt, growth against decline)
    // make a ratio to the benchmark meaningless.
    if (Math.sign(m.company) !== Math.sign(b)) continue;
    const floor = m.unit === "%" ? NEAR_ZERO_MEDIAN["%"] : NEAR_ZERO_MEDIAN.x;
    if (Math.abs(b) < floor) continue;
    const score = Math.abs(m.company - b) / Math.abs(b);
    if (score > bestScore) {
      bestScore = score;
      best = k;
    }
  }
  return best;
}

/** True when at least one row carries two or more years. */
export function hasHistory(p: SpreadsData | null | undefined): boolean {
  return Object.values(p?.history ?? {}).some((pts) => (pts?.length ?? 0) >= 2);
}

// ── Binding ─────────────────────────────────────────────────────────────────

export function fillCompany(text: string, company: string): string {
  return text.split("{company}").join(company);
}

export interface BoundQuestion {
  id: string;
  heading: string;
  label?: string;
  text: string;
  /** Table rows the question draws on, flagged in the AI context. */
  rowKeys: string[];
  /** The "Rows:" line: the mapped rows and any non-table items. */
  rowsLine: string;
}

export interface HiddenQuestion {
  id: string;
  heading: string;
  reason: string;
}

export interface Availability {
  /** EDGAR business segments are on the page. */
  segments: boolean;
  /** At least one filing link is on the page. */
  filings: boolean;
  /** The strategic group label is known. */
  group: boolean;
}

function labelOf(p: SpreadsData, key: string): string {
  return p.metrics?.[key]?.label ?? key;
}

/** Resolve one question's rows by its concepts and rule. */
function resolveRows(
  p: SpreadsData,
  concepts: RowConcept[],
  rule: RowRule | undefined,
): { keys: string[]; line: string } | { hidden: string } {
  if (rule === "all") return { keys: Object.keys(p.metrics ?? {}), line: "All rows" };
  if (rule === "history") {
    return hasHistory(p)
      ? { keys: Object.keys(p.history ?? {}), line: "All rows, with history" }
      : { hidden: "no history in the table" };
  }
  if (rule === "fifth") {
    const keys = fifthRows(p);
    return keys.length
      ? { keys, line: keys.map((k) => labelOf(p, k)).join(" · ") }
      : { hidden: "no row where the company ranks in the top or bottom fifth" };
  }
  if (rule === "largestGap") {
    const k = largestGapRow(p);
    return k ? { keys: [k], line: labelOf(p, k) } : { hidden: "no row with a usable gap to the group" };
  }
  if (concepts.length === 0) return { keys: [], line: "" };
  const keys = mappedRows(p, concepts);
  if (!keys.length) {
    return {
      hidden: `the table has no row for ${concepts.map((c) => CONCEPT_NAMES[c]).join(", ")}`,
    };
  }
  return { keys, line: keys.map((k) => labelOf(p, k)).join(" · ") };
}

function extrasAvailable(extras: string[] | undefined, a: Availability): string[] {
  return (extras ?? []).filter((e) =>
    e === "segment note" ? a.segments : e === "filings" ? a.filings : e === "group members" ? a.group : true,
  );
}

export function bindBoxQuestion(
  q: BoxQuestion,
  p: SpreadsData,
  company: string,
  a: Availability,
): BoundQuestion | HiddenQuestion {
  const rows = resolveRows(p, q.rows, q.rule);
  if ("hidden" in rows) return { id: q.id, heading: q.heading, reason: rows.hidden };

  let text = q.text;
  if (q.variants) {
    const dirKey = mappedRows(p, q.directionFrom ?? q.rows)[0];
    const dir = dirKey ? directionOf(p, dirKey) : null;
    if (!dir) {
      const reported = finite(p.metrics?.[dirKey ?? ""]?.company);
      return {
        id: q.id,
        heading: q.heading,
        reason: reported
          ? `${labelOf(p, dirKey ?? "")} equals its benchmark`
          : `${labelOf(p, dirKey ?? "")} is not reported for the company`,
      };
    }
    const v = q.variants.find((x) => x.when === dir);
    if (!v) {
      return {
        id: q.id,
        heading: q.heading,
        reason: `only shown when ${labelOf(p, dirKey)} is ${dir === "above" ? "below" : "above"} its benchmark`,
      };
    }
    text = v.text;
  }
  const line = [rows.line, ...extrasAvailable(q.extras, a)].filter(Boolean).join("; ");
  return {
    id: q.id,
    heading: q.heading,
    label: q.label,
    text: fillCompany(text ?? "", company),
    rowKeys: rows.keys,
    rowsLine: line,
  };
}

export interface BoundDeckQuestion extends DeckQuestion {
  rowKeys: string[];
  boundText: string;
  boundFollowUps: string[];
}

export function bindDeckQuestion(
  q: DeckQuestion,
  p: SpreadsData,
  company: string,
  deckTitle: string,
): BoundDeckQuestion | HiddenQuestion {
  const rows = resolveRows(p, q.rows, q.rule);
  if ("hidden" in rows) return { id: q.id, heading: deckTitle, reason: rows.hidden };
  return {
    ...q,
    rowKeys: rows.keys,
    boundText: fillCompany(q.text, company),
    boundFollowUps: q.followUps.map((f) => fillCompany(f, company)),
  };
}

export function isHidden(x: object): x is HiddenQuestion {
  return "reason" in x;
}

// ── AI context ──────────────────────────────────────────────────────────────

function num(v: number | null | undefined, unit: string): string {
  if (!finite(v)) return "n/a";
  const s = Math.abs(v).toFixed(2);
  const sign = v < 0 ? "-" : "";
  if (unit === "pts") return `${sign}${s} pts`;
  return unit === "%" ? `${sign}${s}%` : `${sign}${s}x`;
}

/** The full comparison table as text for Ask AI, with the question's rows
 *  marked, the history and the latest filing links. */
export function comparisonContext(
  p: SpreadsData,
  company: string,
  flagged: string[],
  events: CompanyEvent[] | null | undefined,
): string {
  const lines: string[] = [];
  const basis = usesGroupMedian(p) ? "group median" : "industry median (group has fewer than 5 firms)";
  lines.push(`HOW ${company.toUpperCase()} DIFFERS: the comparison table.`);
  lines.push(
    `Industry peers N=${p.peerCount ?? "n/a"}; strategic group "${p.groupLabel ?? "not reported"}" N=${p.groupFirmCount ?? "n/a"}; fiscal year ${p.fiscalYear ?? "n/a"}. Direction is read against the ${basis}.`,
  );
  lines.push("Values in display units (% already multiplied by 100). Gap = company minus benchmark. Rank 1 = highest value, not best.");
  lines.push(
    `READING THE MEDIANS: peers are the top 20 US-dollar filers in the industry by market cap plus ${company}, not the whole industry. Both medians include ${company}. Each firm counts once, whatever its size. The group median rests on ${p.groupFirmCount ?? "n/a"} firms.`,
    "The strategic group is today's median split on two axes, applied unchanged to past years.",
    "Firms differ in fiscal year end and accounting (leases, R&D, acquisitions, IFRS or US GAAP). Treat small gaps as noise. Before reading a large gap as a business difference, say which accounting difference could produce it.",
    "Leverage and capital intensity have no good direction without the business model.",
    "Explain a row by what the business does, not by another row. Say whether the reason belongs to the whole group (what rivals inside it share and what keeps outsiders out: scale, brand, channels, technology, contracts) or to this firm alone (scale within the group, timing of entry, execution).",
  );
  if (flagged.length) lines.push("Rows this question draws on are marked [ASKED].");
  lines.push("Metric | company | industry median | group median | gap to industry | gap to group | rank");
  for (const g of groupedRows(p)) {
    lines.push(`${g.heading}:`);
    for (const k of g.keys) {
      const m = p.metrics![k];
      const u = m.unit === "%" ? "%" : "x";
      lines.push(
        `${flagged.includes(k) ? "[ASKED] " : ""}${m.label} | ${num(m.company, u)} | ${num(m.industryMedian, u)} | ${num(m.groupMedian, u)} | ${num(m.gapIndustry, u === "%" ? "pts" : u)} | ${num(m.gapGroup, u === "%" ? "pts" : u)} | ${m.rank ?? "n/a"} of ${m.count ?? "n/a"}`,
      );
    }
  }
  const hist = p.history ?? {};
  if (Object.keys(hist).length) {
    lines.push("History, company / industry median / group median by year:");
    for (const [k, pts] of Object.entries(hist)) {
      const u = p.metrics?.[k]?.unit === "%" ? "%" : "x";
      lines.push(
        `${flagged.includes(k) ? "[ASKED] " : ""}${labelOf(p, k)}: ${pts
          .map((pt) => `${pt.year} ${num(pt.company, u)} / ${num(pt.industryMedian, u)} / ${num(pt.groupMedian, u)}`)
          .join("; ")}`,
      );
    }
    if (p.historyNote) lines.push(p.historyNote);
  }
  const filings = (events ?? []).filter((e) => e.url);
  if (filings.length) {
    lines.push("LATEST FILINGS:");
    for (const e of filings) lines.push(`${e.form} filed ${e.filingDate}: ${e.url}`);
  }
  return lines.join("\n");
}

// ── Tutor ───────────────────────────────────────────────────────────────────

/** Attempts before the tutor gives its own reading unasked. */
export const READING_AFTER_ATTEMPTS = 2;

/** Hidden tutor instruction sent ahead of the question. Never rendered. */
export function tutorGuidance(opts: {
  answer: string;
  attempt: number;
  followUps: string[];
  giveReading: boolean;
}): string {
  const listed = opts.followUps.length
    ? opts.followUps.map((f) => `- ${f}`).join("\n")
    : "- (none listed)";
  const reading = opts.giveReading
    ? "After the follow-up, give your own reading in under 300 words, from the comparison table and the filings. Open with one sentence on what the reader's answer already gets right, then show the step it was missing, then name one thing in the filings to check next."
    : "Do not give your own answer, reading or conclusion, and no hint that contains it. Do not confirm or reject the reader's claim. Ask only.";
  return [
    "TUTOR MODE for this one question. The goal: a business reason for the difference, meaning something the company does, owns, sells or contracts differently, that rivals cannot easily copy. Another number is not yet a reason.",
    "1. Find the single weakest point of the answer: the claim with the least evidence, a number used to explain another number, a reason that would apply equally to the rivals, or a missing step between what the company does and the row.",
    "2. Name that point in one neutral sentence. No praise, no score, no comparison with other readers.",
    "3. Ask exactly ONE follow-up aimed at it. If a listed follow-up fits, use it word for word. Otherwise write one open question that offers no options and cannot be answered yes or no.",
    "4. On a revised answer, target what is still weakest, not a point already fixed.",
    "5. If the answer is empty or off the question, ask the reader to try the question first.",
    `6. ${reading}`,
    "LISTED FOLLOW-UPS:",
    listed,
    `READER'S ANSWER (attempt ${opts.attempt}):`,
    opts.answer.trim(),
  ].join("\n");
}
