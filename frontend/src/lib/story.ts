// The "Your Story" deck: the reader's own story of the company, built from the
// static deck in lib/questions.ts with the company's name filled in, and the
// answers the story conversion reads.

import type { StoryAnswerReply, StoryAnswerRequest, StoryRow, StoryRowStatus, StoryUnit } from "./aiApi";
import { fill } from "./connectQuestions";
import { formatCurrency } from "./format";
import { QUALITATIVE_QUESTIONS, STORY_DECK_TITLE } from "./questions";
import type { RuntimeGroup, RuntimeQuestion, StoryDcfInputs, StoryInputCheck, StoryInputName } from "./types";

/** The eight story answers the conversion turns into inputs. */
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

/** The synthesis question: researched after the eight and sent with them. */
export const STORY_SYNTHESIS_ID = "indiv.story.synthesis";

/** The two checks: researched against the finished story, shown, never converted. */
export const STORY_CHECK_IDS = ["indiv.story_test", "indiv.big_market"];

/** Every question the research step answers, in deck order. */
export const STORY_RESEARCH_IDS = [...STORY_ANSWER_IDS, STORY_SYNTHESIS_ID, ...STORY_CHECK_IDS];

/** The short name each question goes by in the progress list and the AI's answers. */
export const STORY_QUESTION_LABELS: Record<string, string> = {
  "indiv.story.market": "What market it is really in",
  "indiv.story.new_customers": "Who the new customers are",
  "indiv.story.size": "Whether size helps it win",
  "indiv.story.edge": "Why customers pay it more, or it spends less",
  "indiv.story.growth_cost": "What growth requires",
  "indiv.story.outside_forces": "What it cannot control",
  "indiv.story.end": "What could end the story",
  "indiv.story.edge_duration": "How long the advantage lasts",
  "indiv.story.synthesis": "The whole story",
  "indiv.story_test": "Possible, plausible and probable",
  "indiv.big_market": "A big market many rivals chase",
};

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

/** One question's answer as the conversion used it: the reader's, or the AI's. */
export interface ResearchedAnswer {
  source: "user" | "ai";
  text: string;
  sources: string[];
  /** Set when the research call failed and the reader's own text stood in. */
  error?: string;
}

export type ResearchStatus = "researching" | "kept" | "answered" | "failed";

export const STORY_RESEARCH_CONCURRENCY = 3;

/** The question as the server reads it: the ask, its numbered steps, its close. */
export function storyQuestionText(q: RuntimeQuestion): string {
  const steps = q.steps?.length
    ? ["Work it out in steps:", ...q.steps.map((s, i) => `${i + 1}. ${s}`)]
    : [];
  return [q.text, ...steps, ...(q.close ? [q.close] : [])].join("\n");
}

/** Run `fn` over `items` with at most `limit` calls in flight. */
async function inPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * The research step behind "Turn my story into numbers". The eight input
 * questions are researched with at most `concurrency` calls at once, then the
 * synthesis against their effective answers, then the two checks against all
 * nine. A question whose call fails keeps the reader's own text and reports
 * "failed". Returns every question's result and the answers the conversion reads
 * (the eight, plus the synthesis when it has text).
 */
export async function researchStory(p: {
  questions: RuntimeQuestion[];
  saved: Map<string, string>;
  answer: (req: StoryAnswerRequest) => Promise<StoryAnswerReply>;
  onProgress?: (questionId: string, status: ResearchStatus, detail?: string) => void;
  concurrency?: number;
}): Promise<{ results: Record<string, ResearchedAnswer>; answers: Record<string, string> }> {
  const byId = new Map(p.questions.map((q) => [q.id, q]));
  if (STORY_RESEARCH_IDS.some((id) => !byId.has(id))) {
    throw new Error("The story questions are not loaded yet. Try again.");
  }
  const results: Record<string, ResearchedAnswer> = {};
  const effective = (ids: string[]): Record<string, string> =>
    Object.fromEntries(ids.map((id) => [id, results[id].text]).filter(([, text]) => text));

  const research = async (id: string, otherAnswers?: Record<string, string>) => {
    const userAnswer = (p.saved.get(id) ?? "").trim();
    p.onProgress?.(id, "researching");
    try {
      const reply = await p.answer({
        questionId: id, question: storyQuestionText(byId.get(id)!), userAnswer,
        ...(otherAnswers ? { otherAnswers } : {}),
      });
      results[id] = reply.adequate
        ? { source: "user", text: userAnswer, sources: [] }
        : { source: "ai", text: reply.answer, sources: reply.sources };
      p.onProgress?.(id, reply.adequate ? "kept" : "answered");
    } catch (err) {
      const error = err instanceof Error ? err.message : "The research call failed.";
      results[id] = { source: "user", text: userAnswer, sources: [], error };
      p.onProgress?.(id, "failed", error);
    }
  };

  await inPool(STORY_ANSWER_IDS, p.concurrency ?? STORY_RESEARCH_CONCURRENCY, (id) => research(id));
  await research(STORY_SYNTHESIS_ID, effective(STORY_ANSWER_IDS));
  const story = effective([...STORY_ANSWER_IDS, STORY_SYNTHESIS_ID]);
  await Promise.all(STORY_CHECK_IDS.map((id) => research(id, story)));

  const answers: Record<string, string> = {};
  for (const id of STORY_ANSWER_IDS) answers[id] = results[id].text;
  if (results[STORY_SYNTHESIS_ID].text) answers[STORY_SYNTHESIS_ID] = results[STORY_SYNTHESIS_ID].text;
  return { results, answers };
}

/** The eight story inputs, in table order and story-dcf body key order, each
 *  with the label the table shows, the definition that label opens, and the
 *  question whose answer feeds it. */
export const STORY_INPUTS: ReadonlyArray<{
  input: StoryInputName; label: string; def: number; unit: StoryUnit; question: string;
}> = [
  { input: "totalMarket", label: "Total market", def: 891, unit: "currency", question: "indiv.story.market" },
  { input: "marketGrowth10y", label: "Market growth, next 10 years", def: 891, unit: "rate", question: "indiv.story.new_customers" },
  { input: "shareYear10", label: "Market share in year 10", def: 882, unit: "fraction", question: "indiv.story.size" },
  { input: "targetMargin", label: "Target operating margin", def: 892, unit: "fraction", question: "indiv.story.edge" },
  { input: "salesToCapital", label: "Sales to capital", def: 45, unit: "ratio", question: "indiv.story.growth_cost" },
  { input: "failureProbability", label: "Chance the story ends", def: 894, unit: "fraction", question: "indiv.story.end" },
  { input: "distressProceeds", label: "What owners get if it ends", def: 894, unit: "currency", question: "indiv.story.end" },
  { input: "stableRoic", label: "Return on capital after growth ends", def: 880, unit: "fraction", question: "indiv.story.edge_duration" },
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
