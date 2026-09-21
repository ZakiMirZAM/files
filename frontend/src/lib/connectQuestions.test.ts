// The connect deck: the exact 33 ids the plan names, each built with its names
// filled in and its own hidden prompt attached.

import { describe, expect, it } from "vitest";
import {
  CONNECT_DECK_TITLE,
  CONNECT_QUESTIONS,
  buildConnectDeck,
  fill,
  plainName,
  type ConnectStage,
} from "./connectQuestions";

/** The ids the plan lists, in the order it lists them. */
const PLAN_IDS: Record<ConnectStage, string[]> = {
  credit: ["credit.connect.rates", "credit.connect.sectors", "credit.connect.cycle"],
  sector: [
    "sec.connect.readings",
    "sec.connect.credit",
    "sec.connect.score_vs_matrix",
    "sec.connect.industries",
    "sec.connect.temporary",
    "sec.connect.triggers",
    "sec.connect.synthesis",
  ],
  industry: [
    "ind.connect.channels",
    "ind.connect.profit_share",
    "ind.connect.structure",
    "ind.connect.groups",
    "ind.connect.stress_test",
    "ind.connect.cost_passthrough",
    "ind.connect.cost_of_money",
    "ind.connect.synthesis",
  ],
  comparative: [
    "comp.connect.exposure",
    "comp.connect.structure",
    "comp.connect.share_change",
    "comp.connect.valuation",
    "comp.connect.demand_leverage",
    "comp.connect.above_industry",
    "comp.connect.synthesis",
  ],
  company: [
    "indiv.connect.channels",
    "indiv.connect.industry",
    "indiv.connect.peers",
    "indiv.connect.growth_split",
    "indiv.connect.valuation",
    "indiv.connect.rates_to_value",
    "indiv.connect.drivers",
    "indiv.connect.synthesis",
  ],
};

const NAMES = {
  sector: "Industrials",
  industry: "Aerospace & Defense",
  parentSector: "Industrials",
  company: "Boeing",
};

const STAGES = Object.keys(PLAN_IDS) as ConnectStage[];

/** The sentence the writer repeats at the end of every hidden prompt, at every
 *  stage. It is the one rule that holds across all thirty-three. */
const SHARED_RULE =
  "Use only the figures in the data block and do not invent a score or a grade.";

/** The extra rule sentence the writer repeats through one stage's prompts. The
 *  credit deck has none: its two prompts close on their own findings. */
const STAGE_RULE: Record<ConnectStage, string | null> = {
  credit: null,
  sector: "Finish by ranking the eleven sectors under this evidence.",
  industry: "Do not re-decide the economic reading; apply it.",
  comparative: "Finish by naming the companies that deserve a full analysis.",
  company: "Do not re-teach macro or sector calls; apply the ones in the block to this company.",
};

/** The prompts the writer left without their stage's rule, recorded so a rule
 *  dropped by accident still fails. The sector synthesis pulls the other five
 *  together rather than adding a sixth ranking. The industries and temporary
 *  questions are not cross-sector rankings at all: one compares the industries
 *  inside the sector, the other separates its temporary advantages from its
 *  durable ones, so each closes on its own finish. */
const WITHOUT_STAGE_RULE = new Set([
  "sec.connect.synthesis",
  "sec.connect.industries",
  "sec.connect.temporary",
  // Added 2026-09-21. Each follows one mechanism back to the economy and
  // closes on its own question, not on a ranking or a list of companies.
  "sec.connect.triggers",
  "comp.connect.demand_leverage",
  "comp.connect.above_industry",
]);

describe("the connect deck ids", () => {
  it("carries exactly the thirty-three questions the plan lists", () => {
    const built = STAGES.flatMap((s) => CONNECT_QUESTIONS[s].map((x) => x.id));
    const planned = STAGES.flatMap((s) => PLAN_IDS[s]);

    expect(built).toEqual(planned);
    expect(built).toHaveLength(33);
  });

  it("every id is unique", () => {
    const built = STAGES.flatMap((s) => CONNECT_QUESTIONS[s].map((x) => x.id));
    expect(new Set(built).size).toBe(built.length);
  });

  it("names one title per stage, as the plan words them", () => {
    expect(CONNECT_DECK_TITLE).toEqual({
      credit: "Connect the Economy to Credit Conditions",
      sector: "Connect the Earlier Stages to This Sector",
      industry: "Connect the Earlier Stages to This Industry",
      comparative: "Connect the Earlier Stages to This Peer Group",
      company: "Connect the Earlier Stages to This Company",
    });
  });
});

describe("buildConnectDeck", () => {
  it("returns one group per stage, titled as the plan words it", () => {
    for (const stage of STAGES) {
      const deck = buildConnectDeck(stage, NAMES);
      expect(deck, stage).toHaveLength(1);
      expect(deck[0].title, stage).toBe(CONNECT_DECK_TITLE[stage]);
      expect(deck[0].questions.map((q) => q.id), stage).toEqual(PLAN_IDS[stage]);
    }
  });

  it("leaves no placeholder unfilled, in the question or in the guidance", () => {
    for (const stage of STAGES) {
      for (const question of buildConnectDeck(stage, NAMES)[0].questions) {
        expect(question.text, question.id).not.toMatch(/\{[a-zA-Z]+\}/);
        expect(question.guidance ?? "", question.id).not.toMatch(/\{[a-zA-Z]+\}/);
        expect(question.text.length, question.id).toBeGreaterThan(40);
      }
    }
  });

  it("fills the names the stage actually uses", () => {
    const sector = buildConnectDeck("sector", NAMES)[0].questions;
    expect(sector[0].text).toContain("Industrials");

    const industry = buildConnectDeck("industry", NAMES)[0].questions;
    expect(industry[0].text).toContain("Aerospace & Defense");
    expect(industry[0].text).toContain("Industrials");

    const company = buildConnectDeck("company", NAMES)[0].questions;
    expect(company[0].text).toContain("Boeing");
  });

  it("gives every question a hidden prompt of its own", () => {
    const seen = new Map<string, string>();
    for (const stage of STAGES) {
      for (const question of buildConnectDeck(stage, NAMES)[0].questions) {
        const guidance = question.guidance ?? "";
        expect(guidance.trim().length, question.id).toBeGreaterThan(200);
        const twin = seen.get(guidance);
        expect(twin, `${question.id} shares its hidden prompt with ${twin}`).toBeUndefined();
        seen.set(guidance, question.id);
      }
    }
    expect(seen.size).toBe(33);
  });

  it("closes every hidden prompt on the rule the writer applied to that stage", () => {
    for (const stage of STAGES) {
      const rule = STAGE_RULE[stage];
      for (const question of buildConnectDeck(stage, NAMES)[0].questions) {
        const guidance = question.guidance ?? "";
        expect(guidance, question.id).toContain(SHARED_RULE);
        if (rule && !WITHOUT_STAGE_RULE.has(question.id)) {
          expect(guidance, question.id).toContain(rule);
        }
      }
    }
  });

  it("names a stage rule that some prompt of that stage actually carries", () => {
    for (const stage of STAGES) {
      const rule = STAGE_RULE[stage];
      if (!rule) continue;
      const carriers = buildConnectDeck(stage, NAMES)[0].questions.filter((question) =>
        (question.guidance ?? "").includes(rule),
      );
      expect(carriers.length, stage).toBeGreaterThan(0);
    }
  });

  it("carries no per-question dataContext, so the page's own figures reach the tutor", () => {
    for (const stage of STAGES) {
      for (const question of buildConnectDeck(stage, NAMES)[0].questions) {
        expect(question.dataContext, question.id).toBeUndefined();
      }
    }
  });
});

describe("the names a deck interpolates", () => {
  // Built here too, so this file carries no literal em dash either.
  const EM_DASH = String.fromCharCode(0x2014);

  it("keeps an em dash out of every question and every hidden prompt", () => {
    // What the company page used to hand it: the backend's own title, which is
    // "TICKER {em dash} Company Name".
    const deck = buildConnectDeck("company", {
      ...NAMES,
      company: `BA ${EM_DASH} The Boeing Company`,
    });
    for (const question of deck[0].questions) {
      expect(question.text, question.id).not.toContain(EM_DASH);
      expect(question.guidance ?? "", question.id).not.toContain(EM_DASH);
    }
  });

  it("keeps a realistic company name whole", () => {
    const deck = buildConnectDeck("company", { ...NAMES, company: "Alphabet Inc." });
    expect(deck[0].questions[0].text).toContain("Alphabet Inc.");
    expect(deck[0].questions[0].text).not.toContain(EM_DASH);
  });

  it("reads the title's separator as the comma the sentence calls for", () => {
    expect(plainName(`GOOG ${EM_DASH} Alphabet Inc.`)).toBe("GOOG, Alphabet Inc.");
    expect(plainName(`A${EM_DASH}B`)).toBe("A, B");
    expect(plainName(null)).toBe("");
    expect(plainName("NVIDIA Corporation")).toBe("NVIDIA Corporation");
  });

  it("leaves an em dash out of an industry or sector name too", () => {
    const deck = buildConnectDeck("industry", {
      industry: `Banks ${EM_DASH} Diversified`,
      parentSector: "Financial Services",
    });
    for (const question of deck[0].questions) {
      expect(question.text, question.id).not.toContain(EM_DASH);
      expect(question.guidance ?? "", question.id).not.toContain(EM_DASH);
    }
  });
});

describe("the one correction applied to the writer's text", () => {
  it("no longer sends the tutor to compare a ten-year percentile across sectors", () => {
    const guidance =
      CONNECT_QUESTIONS.sector.find((item) => item.id === "sec.connect.readings")?.guidance ?? "";
    expect(guidance).toContain(
      "especially when you cite a reading's ten-year percentile or compare the sectors' figures",
    );
    expect(guidance).not.toContain("ten-year percentile across sectors");
  });
});

describe("a name the page could not supply", () => {
  it("builds no deck rather than a question about nothing", () => {
    // fill() used to substitute the empty string, which turned "trace it
    // through {sector} and {industry} to {company}" into "trace it through
    // to ." and put it in front of a reader.
    expect(buildConnectDeck("company", { sector: "Technology" })).toEqual([]);
    expect(buildConnectDeck("industry", { industry: "Semiconductors" })).toEqual([]);
    expect(buildConnectDeck("sector", {})).toEqual([]);
  });

  it("builds the credit deck, which names nothing", () => {
    expect(buildConnectDeck("credit", {})[0].questions).toHaveLength(3);
  });

  it("returns null from fill rather than a half-written sentence", () => {
    expect(fill("through {sector} to {company}", { sector: "Technology" })).toBeNull();
    expect(fill("through {sector}", { sector: "Technology" })).toBe("through Technology");
    // A blank name is a missing name.
    expect(fill("through {sector}", { sector: "   " })).toBeNull();
  });
});
