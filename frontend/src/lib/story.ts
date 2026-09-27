// The "Your Story" deck: the reader's own story of the company, built from the
// static deck in lib/questions.ts with the company's name filled in, and the
// answers the story conversion reads.

import { fill } from "./connectQuestions";
import { QUALITATIVE_QUESTIONS, STORY_DECK_TITLE } from "./questions";
import type { RuntimeGroup, RuntimeQuestion } from "./types";

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

/** True once every one of the eight story answers has text. */
export function storyAnswersReady(saved: Map<string, string>): boolean {
  return STORY_ANSWER_IDS.every((id) => (saved.get(id) ?? "").trim().length > 0);
}

/** The eight answers, trimmed and in order, plus the synthesis when written. */
export function collectStoryAnswers(saved: Map<string, string>): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const id of STORY_ANSWER_IDS) answers[id] = (saved.get(id) ?? "").trim();
  const synthesis = (saved.get(STORY_SYNTHESIS_ID) ?? "").trim();
  if (synthesis) answers[STORY_SYNTHESIS_ID] = synthesis;
  return answers;
}
