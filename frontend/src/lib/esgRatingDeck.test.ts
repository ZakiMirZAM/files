import { describe, expect, it } from "vitest";
import {
  buildEsgRatingDeck,
  ESG_RATING_DECK_TITLE,
  ESG_RATING_GUIDANCE,
  ESG_RATING_LINKS,
  ESG_RATING_QUESTIONS,
} from "./esgRatingDeck";
import { QUALITATIVE_QUESTIONS } from "./questions";

describe("What Drives {company}'s ESG Risk deck", () => {
  it("fills company and industry into the approved wording, in order", () => {
    const [g] = buildEsgRatingDeck({ company: "Acme", industry: "Oil & Gas E&P", dataContext: '{"a":1}' });
    expect(g.title).toBe("What Drives Acme's ESG Risk");
    expect(g.questions.map((q) => q.id)).toEqual([
      "ind.esgrating.core_issue",
      "ind.esgrating.customers",
      "ind.esgrating.regulation",
      "ind.esgrating.carbon",
      "ind.esgrating.supply_chain",
      "ind.esgrating.cleanup",
      "ind.esgrating.promise",
      "ind.esgrating.ratings",
      "ind.esgrating.synthesis",
    ]);
    expect(g.questions[0].text).toBe(
      "Think about how Acme makes its money. Which one environmental, social, or governance issue is most tied to that, for example emissions for a company that burns fuel, worker safety for one that runs plants, or customer data for one that sells software? Explain how a problem with that issue would show up in Acme's revenue, operating margin, or capital spending, and why.",
    );
    expect(g.questions[2].text).toBe(
      "Suppose the rules on emissions, safety, or data in Oil & Gas E&P get stricter over the next five years. Would Acme gain or lose against its competitors, and why? Think about whether Acme is larger than most rivals, whether the rules would make it more expensive for new companies to enter, and whether the rules would fall on Acme's product or on the products that compete with it.",
    );
    for (const q of g.questions) {
      expect(q.text).not.toMatch(/\{company\}|\{industry\}/);
      expect(q.dataContext).toBe('{"a":1}');
    }
  });

  it("sends the hidden materiality guidance with every question", () => {
    const [g] = buildEsgRatingDeck({ company: "Acme", industry: "Utilities", dataContext: "{}" });
    for (const q of g.questions) {
      expect(q.guidance).toContain("five valuation inputs");
      expect(q.guidance).toContain("matter for Utilities");
      expect(q.guidance).not.toContain("{industry}");
    }
  });

  it("falls back to 'its industry' when the industry is unknown", () => {
    const [g] = buildEsgRatingDeck({ company: "Acme", industry: null, dataContext: "{}" });
    expect(g.questions[2].text).toContain("data in its industry get stricter");
  });

  it("ends with a synthesis question and keeps house copy rules", () => {
    const last = ESG_RATING_QUESTIONS[ESG_RATING_QUESTIONS.length - 1];
    expect(last.text).toContain("No length limit");
    const all = [ESG_RATING_DECK_TITLE, ...ESG_RATING_QUESTIONS.map((q) => q.text), ESG_RATING_GUIDANCE, ...ESG_RATING_LINKS.map((l) => l.label)];
    const emDash = String.fromCharCode(0x2014);
    for (const t of all) expect(t).not.toContain(emDash);
  });

  it("does not collide with the static question bank", () => {
    const staticIds = new Set(QUALITATIVE_QUESTIONS.individual.flatMap((g) => g.questions.map((q) => q.id)));
    const staticTitles = new Set(QUALITATIVE_QUESTIONS.individual.map((g) => g.title));
    for (const q of ESG_RATING_QUESTIONS) expect(staticIds.has(q.id)).toBe(false);
    expect(staticTitles.has(buildEsgRatingDeck({ company: "Acme", dataContext: "{}" })[0].title)).toBe(false);
  });

  it("links only to the raters' public https pages", () => {
    for (const l of ESG_RATING_LINKS) expect(l.href).toMatch(/^https:\/\/www\.(msci|sustainalytics)\.com\//);
  });
});
