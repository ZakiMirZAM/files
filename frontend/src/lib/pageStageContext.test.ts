// The mapping every "Explain using AI" button now runs through: the page in
// view decides which stage's figures are gathered, and for which subject.

import { describe, expect, it } from "vitest";
import type { PageAiContext } from "./aiContextStore";
import {
  stageContextRequest,
  stageForSection,
  stageSubjectFor,
} from "./pageStageContext";
import type { SectionKey } from "./types";

const EVERY_SECTION: SectionKey[] = [
  "economic",
  "credit",
  "sector",
  "industry",
  "comparative",
  "individual",
  "final_review",
];

describe("stageForSection", () => {
  it("maps each data page to the stage the plan gives it", () => {
    expect(stageForSection("credit")).toBe("credit");
    expect(stageForSection("sector")).toBe("sector");
    expect(stageForSection("industry")).toBe("industry");
    expect(stageForSection("comparative")).toBe("comparative");
    expect(stageForSection("individual")).toBe("company");
  });

  it("gathers nothing on the first stage or the final review", () => {
    expect(stageForSection("economic")).toBeNull();
    expect(stageForSection("final_review")).toBeNull();
  });

  it("gathers nothing when no page has published a section", () => {
    expect(stageForSection(undefined)).toBeNull();
  });

  it("answers for every section key, so a new page cannot fall through", () => {
    for (const section of EVERY_SECTION) {
      const stage = stageForSection(section);
      expect(stage === null || typeof stage === "string", section).toBe(true);
    }
  });
});

describe("stageSubjectFor", () => {
  it("reads the sector page's subject as a sector", () => {
    expect(stageSubjectFor("sector", { subjectKey: "Industrials" })).toEqual({
      sector: "Industrials",
    });
  });

  it("reads the industry and comparative pages' subject as an industry", () => {
    const ctx: PageAiContext = { subjectKey: "Aerospace & Defense" };
    expect(stageSubjectFor("industry", ctx)).toEqual({ industry: "Aerospace & Defense" });
    expect(stageSubjectFor("comparative", ctx)).toEqual({ industry: "Aerospace & Defense" });
  });

  it("reads the company page's subject as a ticker", () => {
    expect(stageSubjectFor("company", { subjectKey: "NVDA" })).toEqual({ ticker: "NVDA" });
  });

  it("asks the credit stage for no subject at all", () => {
    expect(stageSubjectFor("credit", {})).toEqual({});
  });

  it("gives up when the page published no subject", () => {
    expect(stageSubjectFor("sector", {})).toBeNull();
    expect(stageSubjectFor("company", { subjectKey: "   " })).toBeNull();
  });
});

describe("stageContextRequest", () => {
  it("builds the request a company page's questions send", () => {
    expect(
      stageContextRequest({ section: "individual", subject: "NVDA", subjectKey: "NVDA" }),
    ).toEqual({ stage: "company", subject: { ticker: "NVDA" } });
  });

  it("builds the credit request without a subject", () => {
    expect(stageContextRequest({ section: "credit" })).toEqual({
      stage: "credit",
      subject: {},
    });
  });

  it("returns nothing on the economic page", () => {
    expect(stageContextRequest({ section: "economic", subject: "the US economy" })).toBeNull();
  });

  it("returns nothing on the final review", () => {
    expect(stageContextRequest({ section: "final_review", subject: "NVDA" })).toBeNull();
  });

  it("returns nothing when no page has published a context", () => {
    expect(stageContextRequest({})).toBeNull();
  });

  it("returns nothing when the page named a section but no subject", () => {
    expect(stageContextRequest({ section: "sector", subject: "Industrials sector" })).toBeNull();
  });
});
