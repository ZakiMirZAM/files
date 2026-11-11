import { describe, expect, it } from "vitest";
import { testResultsPrompt } from "./localAi";

describe("testResultsPrompt", () => {
  it("sends wrong answers in full and right answers as the question only", () => {
    const text = testResultsPrompt("WACC basics", "1.5 / 3", [
      { prompt: "What is WACC?", choices: ["A cost", "A return"], yourAnswer: "A. A cost", correctAnswer: "A. A cost", points: 1 },
      { prompt: "Why use market weights?", yourAnswer: "book is fine", correctAnswer: "Market values", points: 0.5 },
      { prompt: "Tax shield?", choices: ["Interest x t", "Debt x t"], yourAnswer: "", correctAnswer: "A. Interest x t", points: 0 },
    ]);
    expect(text).toContain('the test "WACC basics". My score: 1.5 / 3.');
    expect(text).toContain("1. What is WACC?\nResult: right");
    expect(text).not.toContain("A. A cost");
    expect(text).toContain("Choices: A. Interest x t | B. Debt x t");
    expect(text).toContain("Result: right");
    expect(text).toContain("Result: partly right");
    expect(text).toContain("My answer: (none)");
    expect(text).toContain("Result: wrong");
  });
});

describe("testResultsPrompt size", () => {
  it("stays under the tutor route's 40,000-character limit for a large test", () => {
    const long = "x".repeat(4000);
    const lines = Array.from({ length: 60 }, (_, i) => ({ prompt: long, yourAnswer: long, correctAnswer: long, points: i % 2 }));
    const text = testResultsPrompt("Big test", "30 / 60", lines);
    expect(text.length).toBeLessThanOrEqual(38_001);
    expect(text).toContain("1. ");
  });
});
