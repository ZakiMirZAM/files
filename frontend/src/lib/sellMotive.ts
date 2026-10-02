// Selling With a Motive (Final Review, plan item 12): the page's own figures
// for the deck's tutor. The valuation, the price and the lifecycle stage come
// from the company-stage gather; this adds what only the account knows: the
// reader's Investment Policy Statement, their simulator position, and their
// earlier company answers that the sell note builds on. Raw values only: no
// score, no verdict, no computed portfolio weight (the app has no live price
// for every holding, so the reader states the weight).

import type { RuntimeGroup } from "./types";
import type { SavedAnswer } from "./stageContextLoader";
import type { SimPositionInput } from "./simulator";
import { moneyPerShare, plain } from "./stageContext/units";

/** Fill `{company}` in the deck's question text (QualitativeBlock does not
 *  substitute it). Guidance is left as written; it names no company. */
// ponytail: same fill as headToHead.ts `withCompany` (unshipped); share one helper when that lands.
export function sellDeckFor(groups: RuntimeGroup[], company: string): RuntimeGroup[] {
  return groups.map((g) => ({
    ...g,
    questions: g.questions.map((q) => ({ ...q, text: q.text.split("{company}").join(company) })),
  }));
}

/** The Investment Policy Statement fields the deck reads. */
export interface SellPolicy {
  riskTolerance: string;
  horizonYears: number;
  constraints: string;
  taxNotes: string;
}

/** Company-page answers the sell note starts from, with the label each gets. */
const EARLIER_ANSWER_IDS: [string, string][] = [
  ["indiv.connect.synthesis", "full account of the company as an investment"],
  ["ind.cat.falsifier", "fact that would make it a value trap"],
  ["ind.cat.decay", "whether the cheap price masks a permanent decline"],
];

/** `ticker` is uppercase, as the page and the simulator both store it. */
export function sellDeckContext(input: {
  ticker: string;
  policy: SellPolicy | null;
  positions: Pick<SimPositionInput, "ticker" | "shares" | "avgCostUsd">[];
  answers: Pick<SavedAnswer, "questionId" | "answer">[];
}): string {
  const { ticker, policy, positions, answers } = input;
  const lines: string[] = ["SELLING WITH A MOTIVE"];

  lines.push(
    policy
      ? `Investment Policy: risk tolerance ${policy.riskTolerance} | horizon ${policy.horizonYears} years` +
          ` | constraints: ${plain(policy.constraints) || "none written (no position limit on file)"}` +
          ` | tax notes: ${plain(policy.taxNotes) || "none written"}`
      : "Investment Policy: not on file (no position limit on file)",
  );

  const pos = positions.find((p) => p.ticker === ticker && p.shares > 0);
  lines.push(
    pos
      ? `Simulator position in ${ticker}: ${pos.shares} shares at an average cost of ${moneyPerShare(pos.avgCostUsd, "USD")}`
      : `Simulator position in ${ticker}: none`,
  );
  lines.push("Portfolio weight: not computed by the app; use the weight the reader states");

  const byId = new Map(answers.map((a) => [a.questionId, plain(a.answer)]));
  for (const [id, label] of EARLIER_ANSWER_IDS) {
    lines.push(`Reader's earlier answer, ${label}: ${byId.get(id) || "not answered"}`);
  }
  return lines.join("\n");
}
