import type { CapexSplitBlock, RndAdjusted, RndTaxMethod, RuntimeGroup } from "./types";

/**
 * The "Reinvestment and Value" deck and the notes printed under its two
 * tables. The questions are the owner's, placed word for word; only {company}
 * is filled in. Every Claude-written note lives in REINVESTMENT_COPY so the
 * owner can edit the section's copy in one place.
 */
export const REINVESTMENT_DECK_TITLE = "Reinvestment and Value";

export const REINVESTMENT_QUESTIONS = [
  {
    id: "indiv.reinvest.upkeep_burden",
    text: "What does {company} have to keep spending on, whether equipment, research, people or marketing, just to stay where it is? What forces (competition, technology change, regulation, customer expectations) drive that burden, is it getting heavier or lighter, and how does that change what its reported profits are actually worth?",
  },
  {
    id: "indiv.reinvest.rd_building",
    text: "What is {company}'s research spending actually building: new products, defending existing ones, or catching up to competitors? Using management's statements, the product history and how rivals spend, argue whether it deserves to be treated as an investment at all.",
  },
  {
    id: "indiv.reinvest.return_source",
    text: "Where do {company}'s returns on capital really come from: a durable advantage (brand, switching costs, scale, network effects, patents), leverage and accounting choices, or a favorable point in the industry cycle? What evidence supports each explanation, and which one would you bet on?",
  },
  {
    id: "indiv.reinvest.allocation",
    text: "How has management chosen between upkeep, growth, research, acquisitions and returning cash to shareholders? What does that pattern say about their priorities and discipline, and do their stated strategy and actual spending agree?",
  },
  {
    id: "indiv.reinvest.market_future",
    text: "The market price assumes a certain future for {company}. What would have to be true about its industry, competitors and management's reinvestment choices for that future to happen, and what is the most likely reason it won't?",
  },
  {
    id: "indiv.reinvest.disconfirm",
    text: "Pick the conclusion from this analysis you are most confident in. What evidence outside the financial statements would change your mind, and have you looked for it?",
  },
  {
    id: "indiv.reinvest.verdict",
    text: "Weighing the spending breakdown, the research treatment, returns, valuation and your qualitative judgment together: will {company}'s investment today earn more than it costs, and is that already reflected in the price? Which factor weighed most in your verdict, and why that one over the others?",
  },
] as const;

export const REINVESTMENT_COPY = {
  // Under the capex split table.
  capitalLight:
    "Net property, plant and equipment is under 5% of revenue, so the split between upkeep and growth spending means little for a capital-light company like {company}.",
  notInflationAdjusted:
    "Revenue change is not adjusted for inflation here, because the site holds US inflation only and {company} reports in {currency}.",
  inflationAdjusted:
    "Revenue change removes US consumer price inflation, since sales that rise only with prices need no new equipment.",
  acquisitionsAdjusted:
    "Revenue change also removes an estimate of the revenue bought through acquisitions, since that capacity was paid for as an acquisition rather than as capital spending.",
  ddaProxyInsufficient:
    "In {years} upkeep is set to depreciation, because the history was too short to measure the equipment needed per $1 of sales.",
  ddaProxyFloor:
    "In {years} upkeep is set to depreciation, because the estimate came out below a quarter of depreciation, which is not credible.",
  // Under the R&D capitalization table.
  lifeIndustry: "Research is written off over {life} years, the usual life for {lifeIndustry}.",
  lifeDefault: "Research is written off over {life} years, the default when the industry has no standard life.",
  shortHistory:
    "Only {yearsOfHistoryUsed} years of research spending are on file, so the research asset is understated.",
  tax: {
    footnote_capitalized:
      "Tax treatment: capitalized for tax. The FY{fy} income-tax footnote reports a deferred tax asset for capitalized research.",
    footnote_expensed:
      "Tax treatment: deducted immediately for tax. The FY{fy} income-tax footnote reports no deferred tax asset for capitalized research.",
    footnote_us_2025_expensed:
      "Tax treatment: deducted immediately for tax. US law restored the deduction for domestic research from 2025, so the deferred tax asset in the FY{fy} footnote is research capitalized in 2022 to 2024 that is still being written off.",
    rule_us_capitalized:
      "Tax treatment: capitalized over five years for tax, the US rule for domestic research in 2022 to 2024. The income-tax footnote could not be read.",
    rule_us_expensed:
      "Tax treatment: deducted immediately for tax, the US rule before 2022 and again from 2025. The income-tax footnote could not be read.",
    rule_non_us_expensed:
      "Tax treatment: deducted immediately for tax, the usual treatment outside the US. The income-tax footnote could not be read.",
  } satisfies Record<RndTaxMethod, string>,
};

/** Fill {key} placeholders; an unknown key is left as written. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
}

/** [2021] -> "FY2021", [2021, 2022] -> "FY2021 and FY2022", three or more -> "FY2020, FY2021 and FY2022". */
export function joinFiscalYears(years: number[]): string {
  const fy = years.map((y) => `FY${y}`);
  return fy.length <= 1 ? (fy[0] ?? "") : `${fy.slice(0, -1).join(", ")} and ${fy[fy.length - 1]}`;
}

/** The notes that apply under the capex split table, in display order. */
export function capexSplitNotes(c: CapexSplitBlock, company: string): string[] {
  const C = REINVESTMENT_COPY;
  const notes: string[] = [];
  if (c.capitalLight) notes.push(fill(C.capitalLight, { company }));
  if (c.inflationAdjusted) notes.push(C.inflationAdjusted);
  else if (c.currency && c.currency !== "USD") notes.push(fill(C.notInflationAdjusted, { company, currency: c.currency }));
  if (c.acquisitionsAdjusted) notes.push(C.acquisitionsAdjusted);
  const proxies = [
    ["dda_proxy_insufficient", C.ddaProxyInsufficient],
    ["dda_proxy_floor", C.ddaProxyFloor],
  ] as const;
  for (const [method, template] of proxies) {
    const years = (c.years ?? []).filter((y) => y.method === method).map((y) => y.year);
    if (years.length) notes.push(fill(template, { years: joinFiscalYears(years) }));
  }
  return notes;
}

/** The notes that apply under the R&D capitalization table, in display order. */
export function rndNotes(r: RndAdjusted): string[] {
  const C = REINVESTMENT_COPY;
  const notes: string[] = [];
  if (r.life != null) {
    if (r.lifeSource === "industry" && r.lifeIndustry) notes.push(fill(C.lifeIndustry, { life: r.life, lifeIndustry: r.lifeIndustry }));
    else if (r.lifeSource === "default") notes.push(fill(C.lifeDefault, { life: r.life }));
    if (r.yearsOfHistoryUsed != null && r.yearsOfHistoryUsed < r.life + 1) {
      notes.push(fill(C.shortHistory, { yearsOfHistoryUsed: r.yearsOfHistoryUsed }));
    }
  }
  const tax = r.taxMethod ? C.tax[r.taxMethod] : undefined;
  // A footnote line names its fiscal year; without one the line is omitted, not printed as "FY".
  if (tax && !(tax.includes("{fy}") && r.taxFiscalYear == null)) notes.push(fill(tax, { fy: r.taxFiscalYear ?? "" }));
  return notes;
}

export function buildReinvestmentDeck({ company, dataContext }: { company: string; dataContext: string }): RuntimeGroup[] {
  return [
    {
      title: REINVESTMENT_DECK_TITLE,
      questions: REINVESTMENT_QUESTIONS.map((q) => ({
        id: q.id,
        text: q.text.split("{company}").join(company),
        dataContext,
      })),
    },
  ];
}
