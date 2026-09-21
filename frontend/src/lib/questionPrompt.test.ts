// What the AI request carries: the hidden guidance ahead of the question, and
// the page's own figures ahead of any extra block gathered on the click.
//
// The repo has no DOM test environment, so the composition is tested as the
// pure functions it was extracted into, and only what happens inside the
// component's own markup is checked statically: QuestionField must render
// `question` and must not render `guidance`.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { askPrompt, askDataContext } from "./questionPrompt";
import { buildConnectDeck } from "./connectQuestions";
import { pageGatherFor } from "./pageStageContext";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIELD = join(HERE, "..", "components", "QuestionField.tsx");

describe("askPrompt", () => {
  it("puts the guidance first, then a blank line, then the question", () => {
    expect(askPrompt("What is the channel?", "Teach the transmission.")).toBe(
      "Teach the transmission.\n\nWhat is the channel?",
    );
  });

  it("sends the question alone when there is no guidance", () => {
    expect(askPrompt("What is the channel?")).toBe("What is the channel?");
    expect(askPrompt("What is the channel?", "   ")).toBe("What is the channel?");
  });

  it("never alters the question text it was given", () => {
    const question = buildConnectDeck("sector", { sector: "Industrials" })[0].questions[0];
    expect(askPrompt(question.text, question.guidance).endsWith(question.text)).toBe(true);
  });
});

describe("askDataContext", () => {
  it("puts the page's figures first, then a blank line, then the extra block", () => {
    expect(askDataContext("PAGE FIGURES", "CROSS-STAGE BLOCK")).toBe(
      "PAGE FIGURES\n\nCROSS-STAGE BLOCK",
    );
  });

  it("sends whichever side it has when only one is present", () => {
    expect(askDataContext("PAGE FIGURES", "")).toBe("PAGE FIGURES");
    expect(askDataContext("PAGE FIGURES")).toBe("PAGE FIGURES");
    expect(askDataContext(undefined, "CROSS-STAGE BLOCK")).toBe("CROSS-STAGE BLOCK");
    expect(askDataContext("  ", "CROSS-STAGE BLOCK")).toBe("CROSS-STAGE BLOCK");
  });

  it("omits the field entirely when neither side has anything", () => {
    expect(askDataContext()).toBeUndefined();
    expect(askDataContext("", "")).toBeUndefined();
    expect(askDataContext("   ", "  ")).toBeUndefined();
  });
});

describe("the gatherer a question field builds on the click", () => {
  it("gathers nothing on a page with no earlier stage", () => {
    // The economic page IS the first stage, and the final review reads the
    // reader's own answers rather than a stage's figures.
    expect(pageGatherFor({ section: "economic" }, {})).toBeUndefined();
    expect(pageGatherFor({ section: "final_review" }, {})).toBeUndefined();
    // A page whose subject has not been published yet asks without the block
    // rather than asking about nothing.
    expect(pageGatherFor({ section: "individual", subjectKey: "  " }, {})).toBeUndefined();
  });

  it("asks the loader for that page's own stage and subject, and hands the reader through", async () => {
    const seen: unknown[][] = [];
    const reader = { excludeQuestionId: "q1" };
    const signal = new AbortController().signal;
    const gather = pageGatherFor(
      { section: "individual", subjectKey: "NVDA" },
      reader,
      async (...args) => {
        seen.push(args);
        return "CROSS-STAGE BLOCK";
      },
    );
    expect(gather).toBeDefined();
    // Nothing is fetched until the reader clicks.
    expect(seen).toHaveLength(0);
    await expect(gather?.(signal)).resolves.toBe("CROSS-STAGE BLOCK");
    expect(seen).toEqual([["company", { ticker: "NVDA" }, reader, signal]]);
  });

  it("takes the subject its own stage is about", async () => {
    const seen: unknown[][] = [];
    const load = async (...args: unknown[]) => {
      seen.push(args);
      return "";
    };
    const signal = new AbortController().signal;
    await pageGatherFor({ section: "sector", subjectKey: "Technology" }, {}, load)?.(signal);
    await pageGatherFor({ section: "comparative", subjectKey: "Semiconductors" }, {}, load)?.(signal);
    // The credit stage is about the whole economy and needs no name.
    await pageGatherFor({ section: "credit" }, {}, load)?.(signal);
    expect(seen.map((args) => [args[0], args[1]])).toEqual([
      ["sector", { sector: "Technology" }],
      ["comparative", { industry: "Semiconductors" }],
      ["credit", {}],
    ]);
  });
});

describe("QuestionField renders the question and not the guidance", () => {
  const source = readFileSync(FIELD, "utf8");

  it("passes the question text into the label and nothing else", () => {
    expect(source).toContain("<span>{question}</span>");
  });

  it("sends the composed prompt in the AI request", () => {
    expect(source).toContain("question: askPrompt(question, guidance)");
  });

  it("sends the page figures ahead of the gathered block", () => {
    // The gather now runs inside the AI panel's fetch path, so the request
    // carries a thunk and a fallback rather than a finished string.
    expect(source).toContain("return askDataContext(dataContext, extra)");
    expect(source).toContain('dataContext: askDataContext(dataContext, "")');
    expect(source).toContain("gatherData,");
  });

  it("does not render guidance anywhere in its markup", () => {
    // Ignore comments, then require that every remaining use of the identifier
    // is the prop declaration, the destructuring, or the one askPrompt call.
    const code = source
      .split("\n")
      .filter((line) => {
        const t = line.trim();
        return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
      })
      .join("\n");
    const uses = code.split("guidance").length - 1;
    expect(uses, code.split("\n").filter((l) => l.includes("guidance")).join("\n")).toBe(3);
    expect(code).not.toContain("{guidance}");
  });

  it("checks the per-minute budget before it gathers anything", () => {
    // The gather is a dozen calls and tens of seconds. A reader who has spent
    // the budget used to wait all of it and then be refused.
    const ask = source.slice(source.indexOf("const ask = () => {"));
    expect(ask.slice(0, 120)).toContain("if (!allowed) return;");
    expect(source).toContain("useSyncExternalStore(subscribeAskBudget");
  });

  it("does not ask at all when the reader left the page mid-gather", () => {
    expect(source).toContain("if (!mounted.current) {");
    expect(source).toContain("return null;");
  });
});
