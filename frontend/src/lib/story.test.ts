import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PRICE_DECK_TITLE, QUALITATIVE_QUESTIONS, STORY_DECK_TITLE } from "./questions";
import { STORY_ANSWER_IDS, STORY_SYNTHESIS_ID, buildStoryDeck, collectStoryAnswers, storyAnswersReady } from "./story";
import { EM_DASH } from "./copyHygiene.test-helper";

const HERE = dirname(fileURLToPath(import.meta.url));
const SPEC = readFileSync(join(HERE, "..", "..", "..", "docs", "plans", "2026-09-27-story-dcf-plan.md"), "utf8");
const PAGE = readFileSync(join(HERE, "..", "pages", "IndividualPage.tsx"), "utf8");
const group = (t: string) => QUALITATIVE_QUESTIONS.individual.find((g) => g.title === t)!;
const IDS = ["indiv.story.market", "indiv.story.new_customers", "indiv.story.size", "indiv.story.edge",
             "indiv.story.growth_cost", "indiv.story.outside_forces", "indiv.story.end",
             "indiv.story.edge_duration", "indiv.story.synthesis"];

describe("the Your Story deck", () => {
  it("holds the nine story questions, then the two moved ones", () => {
    expect(group(STORY_DECK_TITLE).questions.map((q) => q.id))
      .toEqual([...IDS, "indiv.story_test", "indiv.big_market"]);
  });
  it("copies every ask, step and closing sentence verbatim from the spec", () => {
    for (const q of group(STORY_DECK_TITLE).questions.slice(0, 9)) {
      expect(SPEC).toContain(`${q.text} Work it out in steps:`);
      q.steps!.forEach((s, i) => expect(SPEC).toContain(`${i + 1}. ${s}`));
      expect(SPEC).toContain(q.close!);
    }
    expect(group(STORY_DECK_TITLE).questions.slice(0, 9).map((q) => q.steps!.length))
      .toEqual([6, 6, 6, 5, 5, 6, 5, 4, 4]);
  });
  it("keeps the load-bearing minus and carries no em dash or author name", () => {
    const all = JSON.stringify(group(STORY_DECK_TITLE));
    expect(all).toContain("ROIC − WACC");
    expect(all.includes(EM_DASH)).toBe(false);
    expect(all).not.toMatch(/Damodaran|Porter|Mauboussin|Rappaport|Helmer|Dorsey|Besanko/);
  });
  it("moves story_test and big_market unchanged and drops narrative_break", () => {
    const qs = group(STORY_DECK_TITLE).questions;
    expect(qs[9].text).toBe("Is the growth story possible (does it exceed its addressable market or beat GDP forever), plausible (consistent with margins, reinvestment, competition), and probable?");
    expect(qs[10].text).toBe("Does the story rely on a big market that many competitors are chasing, so the winners cannot all earn their cost of capital?");
    const ids = QUALITATIVE_QUESTIONS.individual.flatMap((g) => g.questions.map((q) => q.id));
    expect(ids).not.toContain("indiv.narrative_break");
    expect(QUALITATIVE_QUESTIONS.individual.map((g) => g.title)).not.toContain("Narrative & Expectations");
  });
  it("puts reverse_dcf in its own deck without the author parenthetical", () => {
    expect(group(PRICE_DECK_TITLE).questions).toEqual([{ id: "indiv.reverse_dcf",
      text: "What growth and margin does today's price imply (reverse DCF), and is that more or less optimistic than my own forecast?" }]);
  });
  it("keeps both decks out of the page-bottom bank", () => {
    const exclude = PAGE.slice(PAGE.indexOf("excludeTitles={["), PAGE.indexOf("]}", PAGE.indexOf("excludeTitles={[")));
    expect(exclude).toContain("STORY_DECK_TITLE");
    expect(exclude).toContain("PRICE_DECK_TITLE");
  });
});

describe("buildStoryDeck", () => {
  it("fills the company name into the ask, the steps and the close", () => {
    const [g] = buildStoryDeck("Ferrari");
    expect(g.title).toBe(STORY_DECK_TITLE);
    expect(JSON.stringify(g)).not.toContain("{company}");
    expect(g.questions[0].text.startsWith("What business is Ferrari really in")).toBe(true);
  });
  it("builds nothing without a name", () => {
    expect(buildStoryDeck("")).toEqual([]);
  });
});

describe("story answers", () => {
  const full = new Map(IDS.slice(0, 8).map((id) => [id, "answer"]));
  it("is ready only when all eight answers have text", () => {
    expect(STORY_ANSWER_IDS).toEqual(IDS.slice(0, 8));
    expect(storyAnswersReady(full)).toBe(true);
    expect(storyAnswersReady(new Map([...full, ["indiv.story.end", "   "]]))).toBe(false);
  });
  it("sends the synthesis only when it is answered", () => {
    expect(Object.keys(collectStoryAnswers(full))).toEqual(IDS.slice(0, 8));
    expect(collectStoryAnswers(new Map([...full, [STORY_SYNTHESIS_ID, "whole story"]]))[STORY_SYNTHESIS_ID]).toBe("whole story");
  });
});
