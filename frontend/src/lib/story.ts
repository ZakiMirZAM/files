// The "Your Story" deck: the reader's own story of the company, built from the
// static deck in lib/questions.ts with the company's name filled in, and the
// answers the story conversion reads.

import type { StoryRow, StoryRowStatus, StoryUnit } from "./aiApi";
import { fill } from "./connectQuestions";
import { formatCurrency } from "./format";
import { QUALITATIVE_QUESTIONS, STORY_DECK_TITLE } from "./questions";
import type { RuntimeGroup, RuntimeQuestion, StoryDcfInputs, StoryInputCheck, StoryInputName } from "./types";

/** The eight story answers the conversion needs before it can run. */
export const STORY_ANSWER_IDS = [
  "indiv.story.market",
  "indiv.story.new_customers",
  "indiv.story.size",
  "indiv.story.edge",
  "indiv.story.growth_cost",
  "indiv.story.outside_forces",
  "indiv.story.end",
  "indiv.story.edge_duration",
];

/** The synthesis question: sent with the answers when written, never required. */
export const STORY_SYNTHESIS_ID = "indiv.story.synthesis";

/**
 * The story deck with `{company}` filled into every ask, step and closing
 * sentence. Empty when the name is missing, so the page never shows a
 * question about nobody.
 */
export function buildStoryDeck(company: string): RuntimeGroup[] {
  const group = QUALITATIVE_QUESTIONS.individual.find((g) => g.title === STORY_DECK_TITLE);
  if (!group) return [];
  const names = { company };
  const questions: RuntimeQuestion[] = [];
  for (const q of group.questions) {
    const text = fill(q.text, names);
    const steps = q.steps?.map((s) => fill(s, names));
    const close = q.close === undefined ? undefined : fill(q.close, names);
    if (text == null || close === null || steps?.some((s) => s == null)) return [];
    questions.push({ ...q, text, steps: steps as string[] | undefined, close });
  }
  return [{ title: group.title, questions }];
}

/** The eight answers, trimmed and in order (blank ones sent empty so the AI applies
 *  each input's fallback), plus the synthesis when written. */
export function collectStoryAnswers(saved: Map<string, string>): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const id of STORY_ANSWER_IDS) answers[id] = (saved.get(id) ?? "").trim();
  const synthesis = (saved.get(STORY_SYNTHESIS_ID) ?? "").trim();
  if (synthesis) answers[STORY_SYNTHESIS_ID] = synthesis;
  return answers;
}

/** The eight story inputs, in table order and story-dcf body key order, each
 *  with the label the table shows and the definition that label opens. */
export const STORY_INPUTS: ReadonlyArray<{ input: StoryInputName; label: string; def: number; unit: StoryUnit }> = [
  { input: "totalMarket", label: "Total market", def: 891, unit: "currency" },
  { input: "marketGrowth10y", label: "Market growth, next 10 years", def: 891, unit: "rate" },
  { input: "shareYear10", label: "Market share in year 10", def: 882, unit: "fraction" },
  { input: "targetMargin", label: "Target operating margin", def: 892, unit: "fraction" },
  { input: "salesToCapital", label: "Sales to capital", def: 45, unit: "ratio" },
  { input: "failureProbability", label: "Chance the story ends", def: 894, unit: "fraction" },
  { input: "distressProceeds", label: "What owners get if it ends", def: 894, unit: "currency" },
  { input: "stableRoic", label: "Return on capital after growth ends", def: 880, unit: "fraction" },
];

// The story-dcf body's bounds (backend/api.py StoryDcfBody), strict where it
// uses gt/lt. The backend answers 422 to the whole body when one number is out
// of range, so an out-of-range row is dropped here and sent as null.
const BOUNDS: Record<StoryInputName, (v: number) => boolean> = {
  totalMarket: (v) => v > 0 && v < 1e16,
  marketGrowth10y: (v) => v >= -0.5 && v <= 1,
  shareYear10: (v) => v >= 0 && v <= 10,
  targetMargin: (v) => v >= -2 && v <= 2,
  salesToCapital: (v) => v > 0 && v <= 100,
  failureProbability: (v) => v >= 0 && v <= 1,
  distressProceeds: (v) => v >= 0 && v < 1e16,
  stableRoic: (v) => v > 0 && v <= 2,
};

/** True when the story-dcf route would accept this number for this input. */
export function inStoryBounds(input: StoryInputName, value: number): boolean {
  return Number.isFinite(value) && BOUNDS[input](value);
}

/** The story-dcf body: a row's number only when its proof verified and the
 *  route accepts it, else null so that input keeps the model's number. */
export function storyDcfBody(rows: StoryRow[]): StoryDcfInputs {
  return Object.fromEntries(
    STORY_INPUTS.map(({ input }) => {
      const row = rows.find((r) => r.input === input);
      const ok = row != null && row.verification.status === "verified" && row.value != null
        && inStoryBounds(input, row.value);
      return [input, ok ? row.value : null];
    }),
  ) as StoryDcfInputs;
}

const STATUS_LABELS: Record<Exclude<StoryRowStatus, "verified">, string> = {
  flagged: "Not supported: a figure in the proof does not match the data",
  unchecked: "Not supported: the proof cites no figure the site can check",
  unavailable: "Not supported: the check is not running",
};

// The site rules in backend/valuation/story.py that keep the model's number.
const RULE_LABELS = new Map<string, string>([
  ["revenueNeedsAllThree", "Not supported: revenue needs the market, its growth and the share"],
  ["shareAbove100", "Not supported: the share is above 100 percent of the market"],
  ["growthUnsolvable", "Not supported: no growth rate reaches that revenue"],
  ["marginAtOrAbove100", "Not supported: the margin is 100 percent or more"],
  ["stableRoicNotAboveStableGrowth", "Not supported: the return must be above the stable growth rate"],
]);

/** The Checked column: "Verified", or the one reason the row keeps the model's number. */
export function checkedLabel(row: StoryRow, check?: StoryInputCheck): string {
  if (row.value == null) return "Not supported: the story gives no number here";
  if (row.verification.status !== "verified") return STATUS_LABELS[row.verification.status];
  if (!inStoryBounds(row.input, row.value)) return "Not supported: the number is outside the range the site accepts";
  if (check?.status === "kept") return RULE_LABELS.get(check.rule ?? "") ?? "Not supported";
  return "Verified";
}

/** One story number in its unit: an amount, a percent, or a multiple. */
export function formatStoryValue(unit: StoryUnit, value: number | null): string {
  if (value == null) return "n/a";
  if (unit === "currency") return formatCurrency(value);
  if (unit === "ratio") return `${value.toFixed(2)}x`;
  return `${(value * 100).toFixed(2)}%`;
}
