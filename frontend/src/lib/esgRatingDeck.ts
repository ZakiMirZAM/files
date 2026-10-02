import type { RuntimeGroup } from "./types";

/**
 * The "What Drives {company}'s ESG Risk" deck, shown under the existing ESG
 * Analysis deck. Ordered from broad to specific: two questions answerable from
 * knowing the business, four scenarios on how a change would move the
 * company's numbers, two that use the company's own documents and the rating
 * pages, then the synthesis. Each asks why or how, with any figure only as
 * support. Only {company} and {industry} are filled in.
 *
 * It is a runtime deck (passed to QualitativeBlock as `groups`), not a
 * QUALITATIVE_QUESTIONS group, so the page-bottom bank never renders it twice.
 */
export const ESG_RATING_DECK_TITLE = "What Drives {company}'s ESG Risk";

export const ESG_RATING_QUESTIONS = [
  {
    id: "ind.esgrating.core_issue",
    text: "Think about how {company} makes its money. Which one environmental, social, or governance issue is most tied to that, for example emissions for a company that burns fuel, worker safety for one that runs plants, or customer data for one that sells software? Explain how a problem with that issue would show up in {company}'s revenue, operating margin, or capital spending, and why.",
  },
  {
    id: "ind.esgrating.customers",
    text: "Would {company}'s customers pay more, pay less, or leave over how it handles that issue? Think about who the customers are, whether they can easily buy elsewhere, and whether a cleaner or safer product is something they pay extra for or simply expect. Your answer shows whether the issue affects {company}'s revenue and pricing power or only its costs.",
  },
  {
    id: "ind.esgrating.regulation",
    text: "Suppose the rules on emissions, safety, or data in {industry} get stricter over the next five years. Would {company} gain or lose against its competitors, and why? Think about whether {company} is larger than most rivals, whether the rules would make it more expensive for new companies to enter, and whether the rules would fall on {company}'s product or on the products that compete with it.",
  },
  {
    id: "ind.esgrating.carbon",
    text: "If carbon emissions were taxed, how would {company}'s operating margin change compared with its competitors'? Explain what decides the answer: how much {company} emits for each dollar of sales compared with rivals, and whether its customers would accept higher prices. If {company} reports its direct emissions (Scope 1), multiplying them by $100 per tonne and comparing the result with EBITDA gives a rough size.",
  },
  {
    id: "ind.esgrating.supply_chain",
    text: "Which suppliers or countries could {company} not easily replace, and what labor or environmental problems in that supply chain could stop its deliveries? US customs can hold goods linked to forced labor at the border, so a problem at a supplier can stop {company}'s sales even if {company} did nothing wrong. Explain how such a stop would affect revenue and inventory, and how quickly {company} could switch suppliers.",
  },
  {
    id: "ind.esgrating.cleanup",
    text: "Will {company} owe money in the future to clean up or shut down sites, such as mines, wells, plants, or stores? What could make that bill grow, such as stricter rules or sites closing earlier than planned, and if it grew, how would it compete with dividends, buybacks, or new investment for {company}'s cash?",
  },
  {
    id: "ind.esgrating.promise",
    text: "What is {company}'s main sustainability promise, and does the business have a financial reason to keep it, such as lower costs, customers who require it, or rules that will force it anyway? Check whether planned capital spending is set aside for it. A promise with no financial reason behind it and no spending set aside is unlikely to be met.",
  },
  {
    id: "ind.esgrating.ratings",
    text: "Open {company}'s pages at MSCI and Sustainalytics using the links above. Do the issues they flag match the ones you found above? Where they differ, explain why. MSCI grades a company against its own industry, while Sustainalytics uses one scale for every industry and also shows a controversy level from 1 to 5. A rating that flags an issue you found does not affect cash flow tells you about the rating, not about the business.",
  },
  {
    id: "ind.esgrating.synthesis",
    text: "Take the two issues from above that would change {company}'s numbers the most. For each, decide whether it is a cost {company} will pay every year, which belongs in your operating margin forecast, or a one-time event that may or may not happen, which belongs in a separate scenario weighted by its chance of happening rather than in a higher discount rate. No length limit.",
  },
] as const;

/**
 * Hidden tutor guidance, sent ahead of every question in this deck and never
 * rendered. It replaces the SASB materiality map (licensed) with a first
 * principles test: an issue is material only if it reaches a valuation input.
 */
export const ESG_RATING_GUIDANCE =
  "Tutor guidance for this deck. Treat an ESG issue as material to value only if it reaches one of five valuation inputs: revenue growth or market size, operating margin, capital needs (sales to invested capital), the chance of failure, or the cost of capital. " +
  "Use the cost of capital only for broad country or political risk; treat a one-off legal or regulatory threat as a probability of a bad outcome, not as a higher discount rate. Separate costs that recur every year from discrete events that may or may not happen. " +
  "Explain the qualitative reasons first (how the business makes money, customer and supplier power, competitors' position), then support them with figures. When useful, find the supporting figures: the 10-K legal proceedings section (Item 3) and commitments and contingencies note (accrued versus reasonably possible losses), environmental remediation liabilities and asset retirement obligations, Scope 1 emissions from the sustainability report, Science Based Targets initiative status, forced-labor or customs detention language, and the controversy level on the Sustainalytics page. Use web search for these, say where each figure came from, and say plainly when a figure is not disclosed. " +
  "When the reader needs to know which issues matter for {industry}, name them from general knowledge and web search, and for each issue say which input it moves, in which direction, and what evidence in the filings would confirm it. " +
  "Tie each issue to the figures in the data block where they exist, such as free cash flow, EBITDA, margins, capital spending and returns on capital, and compare with a close competitor where possible. " +
  "For regulation, ask whether the rule raises the minimum scale needed to compete or falls on the product's substitutes, which can help large incumbents relative to smaller rivals. " +
  "Keep price and value apart: a rating can move the share price through fund flows without changing the cash flows. " +
  "Do not produce an ESG score or a rating of your own, and do not reproduce SASB's tables or any rater's methodology tables. " +
  "Ground the reasoning in the library: Measuring ESG Effects in Systematic Investing (Ch.1, 5, 9, 10, 11, 13), Business and Society (stakeholder management, crisis stages, greenwashing), Financial Shenanigans (contingencies and reserves), Narrative and Numbers (Ch.8, 11), Investment Valuation (Ch.13, 33), Applied Corporate Finance (Ch.2, 12) and Competitive Strategy (Ch.1, 8).";

/** Public rating pages, linked only. Nothing is fetched, copied or stored. */
export const ESG_RATING_LINKS = [
  { label: "See this company's rating at MSCI", href: "https://www.msci.com/data-and-analytics/sustainability-solutions/esg-ratings-climate-search-tool" },
  { label: "See this company's rating at Sustainalytics", href: "https://www.sustainalytics.com/esg-data" },
] as const;

function fill(text: string, company: string, industry: string): string {
  return text.split("{company}").join(company).split("{industry}").join(industry);
}

export function buildEsgRatingDeck({
  company,
  industry,
  dataContext,
}: {
  company: string;
  industry?: string | null;
  dataContext: string;
}): RuntimeGroup[] {
  const ind = industry?.trim() || "its industry";
  return [
    {
      title: fill(ESG_RATING_DECK_TITLE, company, ind),
      questions: ESG_RATING_QUESTIONS.map((q) => ({
        id: q.id,
        text: fill(q.text, company, ind),
        dataContext,
        guidance: fill(ESG_RATING_GUIDANCE, company, ind),
      })),
    },
  ];
}
