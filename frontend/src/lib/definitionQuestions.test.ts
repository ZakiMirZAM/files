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

  test("does not match the economic surface's heading", () => {
    const md = "# T\n\nBody.\n\n## Ten Precise Qualitative Questions\n\n1. Economic style.\n";
    const { questions } = splitSurfaceDefinition(md);
    expect(questions).toHaveLength(0);
  });
});
