import { describe, expect, test } from "vitest";
import { splitSurfaceDefinition } from "./definitionQuestions";

const WITH_QUESTIONS = `# ROIC − WACC Spread

## Part 1: Definition

The spread between the return on invested capital and the cost of that capital.

## Part 8: Limitations

Aggregates hide dispersion.

## Part 9: Precise qualitative questions

1. Is the current spread driven by a high return on capital, a low cost of capital, or both?
2. How much of the invested capital is goodwill from acquisitions?
   What is the spread on the operating assets alone?
3. If the spread is wide, what protects it from competition?
`;

describe("splitSurfaceDefinition", () => {
  test("splits Part 9 questions out of the body", () => {
    // Arrange handled by the fixture above.

    // Act
    const { body, questions } = splitSurfaceDefinition(WITH_QUESTIONS);

    // Assert
    expect(questions).toHaveLength(3);
    expect(questions[0]).toBe(
      "Is the current spread driven by a high return on capital, a low cost of capital, or both?",
    );
    // A wrapped question collapses to one line.
    expect(questions[1]).toBe(
      "How much of the invested capital is goodwill from acquisitions? What is the spread on the operating assets alone?",
    );
    expect(body).toContain("## Part 8: Limitations");
    expect(body).not.toContain("Part 9");
    expect(body.endsWith("\n")).toBe(true);
  });

  test("returns the whole markdown when the heading is absent", () => {
    const md = "# Title\n\n## Part 1: Definition\n\nBody only.\n";
    const { body, questions } = splitSurfaceDefinition(md);
    expect(questions).toHaveLength(0);
    expect(body).toBe(md);
  });

  test("matches an H3 heading and flexible spacing", () => {
    const md = "# T\n\nBody.\n\n### Part 9:  Precise qualitative questions\n\n1. Only one?\n";
    const { questions } = splitSurfaceDefinition(md);
    expect(questions).toEqual(["Only one?"]);
  });

  test("matches the economic and credit surfaces' heading too", () => {
    const md = "# T\n\nBody.\n\n## Ten Precise Qualitative Questions\n\n1. Economic style.\n";
    const { questions } = splitSurfaceDefinition(md);
    expect(questions).toEqual(["Economic style."]);
  });
});

// ---------------------------------------------------------------------------
// Every definition file on disk. A file that carries a questions heading must
// yield at least one question, so a differently worded heading cannot silently
// fall back to a plain list of text the reader cannot answer.
// ---------------------------------------------------------------------------

const FILES = import.meta.glob(
  [
    "../content/individual/*.md",
    "../content/comparative/*.md",
    "../content/industry/*.md",
    "../content/sector/*.md",
    "../content/economic/*.md",
    "../content/credit/*.md",
    "!**/000-INDEX.md",
    "!**/00-INDEX.md",
  ],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

/**
 * A heading in the family the splitter exists for: the numbered "Part 9" close
 * of the metric template, and the "Precise ... Questions" close the economic
 * and credit files use. It is deliberately wider than the splitter's own
 * regex, so a file that drifts to "Part 9 - Precise Qualitative Questions" or
 * "Nine Precise Qualitative Questions" fails here instead of silently
 * rendering as plain text.
 *
 * It does not match a prose heading that merely contains the word questions,
 * such as content/individual/522-Growth-Viability.md's "The five questions
 * this section asks", which introduces a deck the page builds itself.
 */
const LOOKS_LIKE_QUESTIONS = /^#{2,4}\s+(?:Part\s*9\b.*|.*\bPrecise\b.*\bQuestions?\b.*)$/im;

describe("the splitter over every definition file", () => {
  test("the glob found the definition files", () => {
    expect(Object.keys(FILES).length).toBeGreaterThan(400);
  });

  test("every file with a questions heading yields at least one question", () => {
    const failed: string[] = [];
    for (const [path, markdown] of Object.entries(FILES)) {
      const heading = LOOKS_LIKE_QUESTIONS.exec(markdown);
      if (!heading) continue;
      const { questions } = splitSurfaceDefinition(markdown);
      if (questions.length === 0) failed.push(`${path}  ${heading[0].trim()}`);
    }
    expect(failed, "these headings are not matched by the splitter").toEqual([]);
  });

  test("a split never loses the body", () => {
    for (const [path, markdown] of Object.entries(FILES)) {
      const { body, questions } = splitSurfaceDefinition(markdown);
      if (questions.length === 0) continue;
      expect(body.length, path).toBeGreaterThan(200);
    }
  });
});
