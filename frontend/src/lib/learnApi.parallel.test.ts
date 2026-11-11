import { describe, expect, it } from "vitest";
import { planQuestionBatches, QUESTIONS_PER_CALL, splitEven } from "./learnApi";

describe("splitEven", () => {
  it("splits into near-equal whole parts, larger first", () => {
    expect(splitEven(75, 3)).toEqual([25, 25, 25]);
    expect(splitEven(60, 3)).toEqual([20, 20, 20]);
    expect(splitEven(10, 3)).toEqual([4, 3, 3]);
  });
});

describe("planQuestionBatches", () => {
  it("covers every question in as few batches as fit one call", () => {
    for (const [mc, short] of [[15, 5], [10, 3], [16, 14], [1, 15], [40, 0], [0, 7]]) {
      const plan = planQuestionBatches(mc, short);
      expect(plan.reduce((a, b) => a + b.mc, 0)).toBe(mc);
      expect(plan.reduce((a, b) => a + b.short, 0)).toBe(short);
      expect(plan.every((b) => b.mc + b.short <= QUESTIONS_PER_CALL && b.mc + b.short > 0)).toBe(true);
      expect(plan.length).toBeLessThanOrEqual(Math.ceil((mc + short) / QUESTIONS_PER_CALL) + 1);
    }
  });

  it("makes a 20-question test two parallel batches", () => {
    expect(planQuestionBatches(15, 5)).toEqual([{ mc: 8, short: 2 }, { mc: 7, short: 3 }]);
  });
});