import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PRICE_DECK_TITLE, QUALITATIVE_QUESTIONS, STORY_DECK_TITLE } from "./questions";
import { STORY_ANSWER_IDS, STORY_CHECK_IDS, STORY_INPUTS, STORY_QUESTION_LABELS, STORY_RESEARCH_IDS,
         STORY_SYNTHESIS_ID, STORY_VALUATION_DEFS, buildPriceDeck, buildStoryDeck, checkedLabel, formatStoryValue,
         inStoryBounds, researchStory, stageShapeLabel, storyDcfBody, storyQuestionText,
         type ResearchStatus } from "./story";
import { anyDefByNumber } from "./allDefinitions";
import type { StoryAnswerReply, StoryAnswerRequest, StoryRow } from "./aiApi";
import { EM_DASH } from "./copyHygiene.test-helper";

const HERE = dirname(fileURLToPath(import.meta.url));
const SPEC = readFileSync(join(HERE, "..", "..", "..", "docs", "plans", "2026-09-27-story-dcf-plan.md"), "utf8");
const PAGE = readFileSync(join(HERE, "..", "pages", "IndividualPage.tsx"), "utf8");
const group = (t: string) => QUALITATIVE_QUESTIONS.individual.find((g) => g.title === t)!;
const IDS = ["indiv.story.market", "indiv.story.new_customers", "indiv.story.size", "indiv.story.edge",
             "indiv.story.growth_cost", "indiv.story.outside_forces", "indiv.story.end",
             "indiv.story.edge_duration", "indiv.story.synthesis"];
// The owner-approved "What the Price Implies" questions, pinned verbatim.
const PRICE_QUESTIONS: Array<[string, string]> = [
  ["indiv.price.bet", "What does the market have to believe about {company}'s future for today's price to be fair, and which of those beliefs carries the most weight? A price that rests on one bold belief breaks when that belief fails; a price spread across several modest ones is harder to break."],
  ["indiv.price.market_size", "Is the market {company} sells into large enough, and growing fast enough, to support the growth the price assumes, or does the price quietly assume {company} will enter markets it is not in today? Revenue can never outgrow the market it comes from."],
  ["indiv.price.margin_edge", "What would let {company} earn the margin the price assumes when most rivals cannot, and is that advantage already proven or still a promise? A margin far above competitors' is only as safe as the edge that produces it."],
  ["indiv.price.edge_duration", "How long can {company} keep earning more on its investments than those investments cost, and what would eventually close that gap: new rivals, new technology, regulators, or customers who stop paying a premium? When a price needs excess returns forever, it is betting that nobody ever catches up."],
  ["indiv.price.value_or_price", "Is the market valuing {company} on the cash it will produce, or pricing it on something else, such as index buying, momentum, scarcity of similar companies, or a story investors love? A price driven by demand for the stock can stay away from value for a long time, so being right about value does not tell you when the gap closes."],
  ["indiv.price.your_story", "Where does your own story for {company} part ways with the story the price tells, and what evidence would eventually show which one is right? Disagreeing with the market is only useful when you can name the belief you disagree on and what would settle it."],
  ["indiv.price.synthesis", "Write the story the market is telling about {company} through today's price, say which parts of it you believe and which you do not, and what you would be willing to pay for the story you do believe. No length limit; pull together everything above into the best complete picture you can."],
];

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
  it("holds the seven price questions verbatim, with no steps or close", () => {
    expect(group(PRICE_DECK_TITLE).questions).toEqual(PRICE_QUESTIONS.map(([id, text]) => ({ id, text })));
    const ids = QUALITATIVE_QUESTIONS.individual.flatMap((g) => g.questions.map((q) => q.id));
    expect(ids).not.toContain("indiv.reverse_dcf");
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

describe("buildPriceDeck", () => {
  it("fills the company name into every price question", () => {
    const [g] = buildPriceDeck("Ferrari");
    expect(g.title).toBe(PRICE_DECK_TITLE);
    expect(g.questions.map((q) => q.text)).toEqual(PRICE_QUESTIONS.map(([, t]) => t.split("{company}").join("Ferrari")));
    expect(buildPriceDeck("")).toEqual([]);
  });
  it("renders the filled deck beside the Reverse DCF", () => {
    expect(PAGE).toMatch(/groups=\{priceDeck\}/);
  });
});

describe("story research", () => {
  const questions = buildStoryDeck("Ferrari")[0].questions;
  const saved = new Map([["indiv.story.market", "luxury goods"], ["indiv.story.edge", "the brand"]]);
  type Call = StoryAnswerRequest;
  // A fake server: answers every question, building on the reader's text when there is one.
  const fake = (calls: Call[], opts: { failId?: string; delay?: number } = {}) =>
    async (req: Call): Promise<StoryAnswerReply> => {
      calls.push(req);
      await new Promise((r) => setTimeout(r, opts.delay ?? 0));
      if (req.questionId === opts.failId) throw new Error("AI backend temporarily unavailable");
      return { answer: `ai ${req.questionId}`, sources: ["Book, chapter 1"], builtOnReader: req.userAnswer !== "" };
    };

  it("covers all eleven questions and names each one", () => {
    expect(STORY_ANSWER_IDS).toEqual(IDS.slice(0, 8));
    expect(STORY_RESEARCH_IDS).toEqual([...IDS, ...STORY_CHECK_IDS]);
    expect(STORY_RESEARCH_IDS.every((id) => STORY_QUESTION_LABELS[id])).toBe(true);
  });
  it("sends the ask, the numbered steps and the close as plain text", () => {
    const q = questions[0];
    const text = storyQuestionText(q);
    expect(text.startsWith(`${q.text}\nWork it out in steps:\n1. ${q.steps![0]}`)).toBe(true);
    expect(text.endsWith(q.close!)).toBe(true);
    expect(storyQuestionText(questions[9])).toBe(questions[9].text);   // a check has no steps
  });
  it("uses the AI's answer for every question, marking the ones built on the reader's", async () => {
    const calls: Call[] = [];
    const { results, answers } = await researchStory({ questions, saved, answer: fake(calls) });
    expect(results["indiv.story.market"]).toEqual({ source: "built", text: "ai indiv.story.market", sources: ["Book, chapter 1"] });
    expect(results["indiv.story.size"]).toEqual({ source: "ai", text: "ai indiv.story.size", sources: ["Book, chapter 1"] });
    expect(Object.keys(answers)).toEqual([...IDS.slice(0, 8), STORY_SYNTHESIS_ID]);
    expect(answers["indiv.story.market"]).toBe("ai indiv.story.market");
    expect(answers[STORY_SYNTHESIS_ID]).toBe(`ai ${STORY_SYNTHESIS_ID}`);
    expect(calls.find((c) => c.questionId === "indiv.story.edge")!.userAnswer).toBe("the brand");
  });
  it("tests the synthesis against the eight effective answers and the checks against all nine", async () => {
    const calls: Call[] = [];
    await researchStory({ questions, saved, answer: fake(calls) });
    const order = calls.map((c) => c.questionId);
    expect(order.slice(8)).toEqual([STORY_SYNTHESIS_ID, ...STORY_CHECK_IDS]);
    const synthesis = calls.find((c) => c.questionId === STORY_SYNTHESIS_ID)!;
    expect(Object.keys(synthesis.otherAnswers!)).toEqual(IDS.slice(0, 8));
    expect(synthesis.otherAnswers!["indiv.story.market"]).toBe("ai indiv.story.market");
    expect(synthesis.otherAnswers!["indiv.story.size"]).toBe("ai indiv.story.size");
    const check = calls.find((c) => c.questionId === "indiv.big_market")!;
    expect(check.otherAnswers![STORY_SYNTHESIS_ID]).toBe(`ai ${STORY_SYNTHESIS_ID}`);
    expect(calls.find((c) => c.questionId === "indiv.story.market")!.otherAnswers).toBeUndefined();
  });
  it("never marks a blank reader answer as built on", async () => {
    const answer = async (): Promise<StoryAnswerReply> => ({ answer: "a", sources: [], builtOnReader: true });
    const { results } = await researchStory({ questions, saved, answer });
    expect(results["indiv.story.size"].source).toBe("ai");
    expect(results["indiv.story.market"].source).toBe("built");
  });
  it("never runs more than three research calls at once", async () => {
    let live = 0, most = 0;
    const answer = async (): Promise<StoryAnswerReply> => {
      most = Math.max(most, ++live);
      await new Promise((r) => setTimeout(r, 5));
      live--;
      return { answer: "a", sources: [], builtOnReader: false };
    };
    await researchStory({ questions, saved, answer });
    expect(most).toBe(3);
  });
  it("turns one failed call into an error line and keeps the reader's text for it", async () => {
    const lines: Array<[string, ResearchStatus, string | undefined]> = [];
    const { results, answers } = await researchStory({
      questions, saved, answer: fake([], { failId: "indiv.story.edge" }),
      onProgress: (id, status, detail) => lines.push([id, status, detail]),
    });
    expect(results["indiv.story.edge"]).toEqual({ source: "user", text: "the brand", sources: [],
      error: "AI backend temporarily unavailable" });
    expect(answers["indiv.story.edge"]).toBe("the brand");
    expect(lines).toContainEqual(["indiv.story.edge", "failed", "AI backend temporarily unavailable"]);
    expect(lines).toContainEqual(["indiv.story.market", "built", undefined]);
    expect(lines).toContainEqual(["indiv.story.size", "answered", undefined]);
    expect(lines.filter(([, s]) => s === "researching")).toHaveLength(11);
  });
  it("refuses to run without the deck", async () => {
    await expect(researchStory({ questions: [], saved, answer: fake([]) })).rejects.toThrow("not loaded");
  });
  it("maps every input to the question that feeds it", () => {
    expect(Object.fromEntries(STORY_INPUTS.map((i) => [i.input, i.question]))).toEqual({
      totalMarket: IDS[0], marketGrowth10y: IDS[1], shareYear10: IDS[2], targetMargin: IDS[3],
      salesToCapital: IDS[4], failureProbability: IDS[6], distressProceeds: IDS[6], stableRoic: IDS[7],
      stages: IDS[7],
    });
  });
});

const row = (input: StoryRow["input"], value: number | null, status: StoryRow["verification"]["status"] = "verified"): StoryRow =>
  ({ input, value, unit: "fraction", storyQuote: "", proof: "", sources: [], verification: { status } });

describe("storyDcfBody", () => {
  it("sends only verified, in-range numbers and null for the rest", () => {
    const body = storyDcfBody([row("targetMargin", 0.2), row("stableRoic", 0.1, "flagged"),
      row("marketGrowth10y", 9), row("failureProbability", 1.5), row("shareYear10", 1.2),
      row("salesToCapital", null)]);
    expect(body).toEqual({ totalMarket: null, marketGrowth10y: null, shareYear10: 1.2, targetMargin: 0.2,
      salesToCapital: null, failureProbability: null, distressProceeds: null, stableRoic: null, stages: null });
    expect(Object.keys(body)).toEqual(STORY_INPUTS.map((i) => i.input));
  });
  it("sends a stage count of 1, 2 or 3 when verified or unchecked, and null otherwise", () => {
    expect(storyDcfBody([row("stages", 2)]).stages).toBe(2);
    expect(storyDcfBody([row("stages", 1, "unchecked")]).stages).toBe(1);
    expect(storyDcfBody([row("stages", 3, "flagged")]).stages).toBeNull();
    expect(storyDcfBody([row("stages", 3, "unavailable")]).stages).toBeNull();
    expect(storyDcfBody([row("stages", 4)]).stages).toBeNull();
    expect(storyDcfBody([row("stages", 2.5)]).stages).toBeNull();
    expect(storyDcfBody([row("stableRoic", 0.1, "unchecked")]).stableRoic).toBeNull();
  });
  it("mirrors the backend bounds", () => {
    expect(inStoryBounds("totalMarket", 0)).toBe(false);
    expect(inStoryBounds("marketGrowth10y", 1)).toBe(true);
    expect(inStoryBounds("salesToCapital", 100)).toBe(true);
    expect(inStoryBounds("stableRoic", 0)).toBe(false);
  });
});

describe("checkedLabel", () => {
  it("names the reason a row is not used", () => {
    expect(checkedLabel(row("targetMargin", 0.2), { status: "applied", rule: null })).toBe("Verified");
    expect(checkedLabel(row("targetMargin", null))).toBe("Not supported: the story gives no number here");
    expect(checkedLabel(row("targetMargin", 0.2, "flagged"))).toBe("Not supported: a figure in the proof does not match the data");
    expect(checkedLabel(row("targetMargin", 0.2, "unchecked"))).toBe("Not supported: the proof cites no figure the site can check");
    expect(checkedLabel(row("targetMargin", 0.2, "unavailable"))).toBe("Not supported: the check is not running");
    expect(checkedLabel(row("marketGrowth10y", 9))).toBe("Not supported: the number is outside the range the site accepts");
    expect(checkedLabel(row("shareYear10", 1.2), { status: "kept", rule: "shareAbove100" }))
      .toBe("Not supported: the share is above 100 percent of the market");
  });
  it("labels the stage count row", () => {
    expect(checkedLabel(row("stages", 2))).toBe("Verified");
    expect(checkedLabel(row("stages", 2, "unchecked"))).toBe("Used: the proof rests on the answers");
    expect(checkedLabel(row("stages", 2, "flagged"))).toBe("Not supported: a figure in the proof does not match the data");
    expect(checkedLabel(row("stages", null))).toBe("Not supported: the story gives no number here");
    expect(checkedLabel(row("shareYear10", 0.2), { status: "kept", rule: "oneStageNoHighGrowth" }))
      .toBe("Not supported: a 1-stage story has no high-growth years for this input to change");
  });
  it("carries no em dash in any label", () => {
    const rules = ["revenueNeedsAllThree", "shareAbove100", "growthUnsolvable", "marginAtOrAbove100", "stableRoicNotAboveStableGrowth", "oneStageNoHighGrowth", "missingInput"];
    for (const rule of rules) expect(checkedLabel(row("targetMargin", 0.2), { status: "kept", rule }).includes(EM_DASH)).toBe(false);
  });
});

describe("formatStoryValue", () => {
  it("formats by unit", () => {
    expect(formatStoryValue("fraction", 0.1234)).toBe("12.34%");
    expect(formatStoryValue("rate", 0.05)).toBe("5.00%");
    expect(formatStoryValue("ratio", 1.4)).toBe("1.40x");
    expect(formatStoryValue("fraction", null)).toBe("n/a");
    expect(formatStoryValue("count", 2)).toBe("2");
  });
});

describe("the story's valuation", () => {
  it("names the stage count in words", () => {
    expect(stageShapeLabel(1)).toBe("1-stage: no high-growth years, stable growth from today");
    expect(stageShapeLabel(2)).toBe("2-stage: 5 years of high growth, then stable");
    expect(stageShapeLabel(3)).toBe("3-stage: 5 years of high growth, 5 years of transition, then stable");
  });
  it("opens a definition from every label", () => {
    for (const n of Object.values(STORY_VALUATION_DEFS)) expect(anyDefByNumber(n), String(n)).toBeDefined();
    expect(STORY_INPUTS.find((i) => i.input === "stages")!.def).toBe(883);
  });
});

describe("the FCFF story switch", () => {
  it("the forecast reads the story under the route ticker", () => {
    expect(PAGE).toMatch(/<ForecastSection[^>]*scopeKey=\{ticker\}/);
  });
});
