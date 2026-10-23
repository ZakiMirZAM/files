import type { RuntimeGroup } from "./types";
import { formatMetricValue } from "./metricFormat";

/**
 * The "P/E, Growth and Returns" deck. The owner's questions, placed word for
 * word; only the two placeholders they carry are filled in: {company} with the
 * company's name and [implied rate] with the growth today's P/E implies.
 */
export const PE_GROWTH_DECK_TITLE = "P/E, Growth and Returns";

export const PE_GROWTH_QUESTIONS = [
  {
    id: "indiv.pe_growth.implied_rate",
    text: "Read the P/E vs growth and returns panel. Today’s P/E implies {company} can grow earnings at [implied rate] a year forever while earning its current return on equity. Compare that rate with the five-year EPS growth and the 10-year Treasury yield, and say whether the company can keep it up. Growth only raises the fair P/E when the return on new investment is above the cost of equity; at a return equal to the cost of equity, the fair P/E is 1 divided by the cost of equity.",
  },
  {
    id: "indiv.pe_growth.yield_gap",
    text: "Compare {company}’s earnings yield (earnings divided by price) with the 10-year Treasury yield. If the stock earns less per dollar than the bond pays, work out how much earnings growth has to arrive, and over how many years, to close the gap.",
  },
  {
    id: "indiv.pe_growth.case",
    text: "Write the case for or against paying today’s P/E for {company} in terms of growth and returns on capital. No length limit; pull together the implied growth rate, the ROIC minus WACC spread, and the earnings yield gap above.",
  },
] as const;

export function buildPeGrowthDeck({
  company,
  impliedGrowth,
  dataContext,
}: {
  company: string;
  impliedGrowth: number | null;
  dataContext: string;
}): RuntimeGroup[] {
  const rate = formatMetricValue(impliedGrowth, "%");
  return [
    {
      title: PE_GROWTH_DECK_TITLE,
      questions: PE_GROWTH_QUESTIONS.map((q) => ({
        id: q.id,
        text: q.text.split("{company}").join(company).replace("[implied rate]", rate),
        dataContext,
      })),
    },
  ];
}
