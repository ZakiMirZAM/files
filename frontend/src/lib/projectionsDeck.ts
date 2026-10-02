import type { ConsensusYear, ForecastRow, NextTwoYearsKey, NextTwoYearsRow, RuntimeGroup } from "./types";

/**
 * The "Projections" deck. The owner's questions, placed word for word; only
 * {company} is filled in. Q1 is asked on its own, before any projection table
 * is shown; Q2 to Q4 sit under the Next two years table.
 */
export const PROJECTIONS_DECK_TITLE = "Projections";

export const PROJECTIONS_OPENING_ID = "indiv.projections.growth_source";
export const YOUR_ESTIMATE_ID = "indiv.projections.your_estimate";

export const PROJECTIONS_QUESTIONS = [
  {
    id: PROJECTIONS_OPENING_ID,
    text: "Where will {company}'s growth over the next two years come from? Name the customers, products or markets, and explain why they will spend more with {company} rather than a competitor or not at all. You can't use a forecast, guidance or past growth rate as your reason.",
  },
  {
    id: "indiv.projections.story",
    text: "Management's guidance and analyst consensus each tell a story about {company}'s next two years. What is that story, what has to happen in the real world for it to come true, and what have customers, suppliers or competitors done recently that supports or contradicts it? How reliably has management delivered on past guidance, and what do their incentives push them to promise?",
  },
  {
    id: "indiv.projections.evidence",
    // The owner's original set the parenthetical off with em dashes; the repo
    // forbids them, so it is bracketed instead. Otherwise verbatim.
    text: "Does {company}'s recent growth show up everywhere it should (cash collected, customer numbers, hiring, supplier orders, industry data), or only in reported revenue and earnings? If earnings are expected to grow faster than the business itself, what is making up the difference and can it last? Where the evidence doesn't line up, give the most innocent explanation and the least innocent one.",
  },
  {
    id: "indiv.projections.response",
    text: "If {company} grows the way you expect, how will competitors, customers and new entrants respond, and how does that change your view? Only then write your forecast for the next two years, and name one event in the next two to four quarters that would prove you wrong.",
  },
] as const;

/** Claude-written copy for the gate and the consensus notes. */
export const PROJECTIONS_COPY = {
  gate: "Answer the first question before looking at the projections.",
  showAnyway: "Show the projections anyway",
  doesNotTie: (metric: string, lastFiscalYear: number) =>
    `Consensus ${metric} is not shown because Yahoo's figure for FY${lastFiscalYear} does not match the reported accounts, which usually means a different share basis, a different currency, or earnings adjusted for one-off items.`,
  databaseBehind:
    "Consensus is not shown because the site's accounts are a year behind Yahoo's, so the years would not line up.",
  noCoverage: (metric: string) => `No analyst consensus is available for ${metric}.`,
} as const;

type Question = (typeof PROJECTIONS_QUESTIONS)[number];

function group(questions: readonly Question[], company: string, dataContext: string): RuntimeGroup[] {
  return [
    {
      title: PROJECTIONS_DECK_TITLE,
      questions: questions.map((q) => ({
        id: q.id,
        text: q.text.split("{company}").join(company),
        dataContext,
      })),
    },
  ];
}

/** Q1 only: asked before the reader sees any forecast. */
export function buildProjectionsOpening({ company, dataContext }: { company: string; dataContext: string }): RuntimeGroup[] {
  return group(PROJECTIONS_QUESTIONS.slice(0, 1), company, dataContext);
}

/** Q2 to Q4: asked under the Next two years table. */
export function buildProjectionsDeck({ company, dataContext }: { company: string; dataContext: string }): RuntimeGroup[] {
  return group(PROJECTIONS_QUESTIONS.slice(1), company, dataContext);
}

/**
 * The scope the projections answers are saved under: the page's route ticker
 * when given, so Q1, the gate and Your estimate share a key with every other
 * saved answer on the page (GOOG stays GOOG even when the data resolves to
 * GOOGL), else the resolved ticker.
 */
export function answerScope(scopeKey: string | null | undefined, ticker: string): string {
  return scopeKey || ticker;
}

/** The tables show once Q1 has a saved answer, or "show anyway" was clicked on this scope. */
export function projectionsVisible(growthSource: string, shownFor: string | null, scope: string): boolean {
  return growthSource.trim() !== "" || shownFor === scope;
}

/** The saveAnswer call for the reader's own estimate. */
export function yourEstimateSave(scope: string, answer: string) {
  return { section: "individual" as const, scopeKey: scope, questionId: YOUR_ESTIMATE_ID, answer };
}

// Next two years line → the projection row field it reads (nopat is EBIT after tax).
const VARIANT_FIELD: Partial<Record<NextTwoYearsKey, keyof ForecastRow>> = {
  revenue: "revenue",
  operatingMargin: "operatingMargin",
  nopat: "ebitAfterTax",
  reinvestment: "reinvestment",
  fcff: "fcff",
  roic: "roic",
};

/**
 * The model columns for a stage structure other than the one the block was
 * built from. Lines the projection rows carry come from its first two years;
 * EVA is projected only for the recommended model, so it reads n/a, as does
 * every model cell when the structure has fewer than two projection years.
 * `variantRows` null means the block's own rows are the ones on screen.
 */
export function withVariantModel(rows: NextTwoYearsRow[], variantRows: ForecastRow[] | null | undefined): NextTwoYearsRow[] {
  if (!variantRows) return rows;
  const two = variantRows.length >= 2;
  return rows.map((r) => {
    const field = VARIANT_FIELD[r.key];
    const pick = (i: 0 | 1): number | null => {
      if (!two || !field) return null;
      const v = variantRows[i][field];
      return typeof v === "number" ? v : null;
    };
    return { ...r, model1: pick(0), model2: pick(1) };
  });
}

/** One sentence per distinct reason a consensus figure is hidden, first seen first. */
export function consensusNotes(years: ConsensusYear[], lastFiscalYear: number): string[] {
  const out = new Set<string>();
  for (const y of years) {
    const pairs = [
      ["revenue", y.revenueHiddenReason],
      ["earnings per share", y.epsHiddenReason],
    ] as const;
    for (const [metric, reason] of pairs) {
      if (reason === "does_not_tie") out.add(PROJECTIONS_COPY.doesNotTie(metric, lastFiscalYear));
      else if (reason === "database_behind") out.add(PROJECTIONS_COPY.databaseBehind);
      else if (reason === "no_coverage") out.add(PROJECTIONS_COPY.noCoverage(metric));
    }
  }
  return [...out];
}
