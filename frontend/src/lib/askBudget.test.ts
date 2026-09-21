// The per-minute AI budget, on fake timers.
//
// The rule being tested: the app never fires a request the server would refuse,
// and the countdown it shows is the real time until the oldest request leaves
// the window.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ASK_LIMIT_PER_MINUTE,
  askBudgetTicking,
  canAsk,
  msUntilAllowed,
  recordAsk,
  resetAskBudget,
  secondsUntilAllowed,
  subscribeAskBudget,
} from "./askBudget";

describe("askBudget", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T12:00:00.000Z"));
    resetAskBudget();
  });

  afterEach(() => {
    resetAskBudget();
    vi.useRealTimers();
  });

  it("allows the first three requests in a minute", () => {
    for (let i = 0; i < ASK_LIMIT_PER_MINUTE; i++) {
      expect(canAsk()).toBe(true);
      recordAsk();
    }
    expect(canAsk()).toBe(false);
  });

  it("counts down from the oldest request in the window", () => {
    recordAsk();
    vi.advanceTimersByTime(10_000);
    recordAsk();
    vi.advanceTimersByTime(10_000);
    recordAsk();
    // Twenty seconds after the first, so forty remain on it.
    expect(canAsk()).toBe(false);
    expect(secondsUntilAllowed()).toBe(40);
    expect(msUntilAllowed()).toBe(40_000);
  });

  it("allows another request once the oldest leaves the window", () => {
    recordAsk();
    recordAsk();
    recordAsk();
    vi.advanceTimersByTime(59_999);
    expect(canAsk()).toBe(false);
    expect(secondsUntilAllowed()).toBe(1);
    vi.advanceTimersByTime(1);
    expect(canAsk()).toBe(true);
    expect(secondsUntilAllowed()).toBe(0);
  });

  it("rounds a part second up, so the sentence never says zero while blocked", () => {
    recordAsk();
    recordAsk();
    recordAsk();
    vi.advanceTimersByTime(59_500);
    expect(canAsk()).toBe(false);
    expect(secondsUntilAllowed()).toBe(1);
  });

  it("a slow steady rhythm never blocks", () => {
    for (let i = 0; i < 10; i++) {
      expect(canAsk()).toBe(true);
      recordAsk();
      vi.advanceTimersByTime(21_000);
    }
    expect(canAsk()).toBe(true);
  });

  it("tells its subscribers when the record changes", () => {
    const seen: number[] = [];
    const unsubscribe = subscribeAskBudget(() => seen.push(seen.length));
    recordAsk();
    recordAsk();
    expect(seen).toHaveLength(2);
    unsubscribe();
    recordAsk();
    expect(seen).toHaveLength(2);
  });

  it("is a record, not a queue: nothing is retried and nothing is stored", () => {
    recordAsk();
    recordAsk();
    recordAsk();
    resetAskBudget();
    expect(canAsk()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The one countdown timer
// ---------------------------------------------------------------------------

describe("the countdown timer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T12:00:00.000Z"));
    resetAskBudget();
  });

  afterEach(() => {
    resetAskBudget();
    vi.useRealTimers();
  });

  /** Spend the budget, so the next question is refused. */
  function spend(): void {
    for (let i = 0; i < ASK_LIMIT_PER_MINUTE; i++) recordAsk();
  }

  it("runs no timer on an idle app", () => {
    expect(askBudgetTicking()).toBe(false);
    const stop = subscribeAskBudget(() => {});
    expect(askBudgetTicking()).toBe(false);
    stop();
  });

  it("runs no timer while nobody is listening", () => {
    spend();
    expect(canAsk()).toBe(false);
    expect(askBudgetTicking()).toBe(false);
  });

  it("starts when the budget is spent and someone is listening", () => {
    const stop = subscribeAskBudget(() => {});
    spend();
    expect(askBudgetTicking()).toBe(true);
    stop();
  });

  it("starts for a listener that arrives after the budget was spent", () => {
    spend();
    const stop = subscribeAskBudget(() => {});
    expect(askBudgetTicking()).toBe(true);
    stop();
  });

  it("ticks its listeners once a second while the wait runs", () => {
    let ticks = 0;
    const stop = subscribeAskBudget(() => {
      ticks += 1;
    });
    spend();
    // Three of those are the three recordAsk calls themselves.
    ticks = 0;
    vi.advanceTimersByTime(3_000);
    expect(ticks).toBe(3);
    stop();
  });

  it("stops on the tick that ends the wait, and tells the listeners then", () => {
    let ticks = 0;
    const stop = subscribeAskBudget(() => {
      ticks += 1;
    });
    spend();
    ticks = 0;
    vi.advanceTimersByTime(59_000);
    expect(askBudgetTicking()).toBe(true);
    expect(canAsk()).toBe(false);
    vi.advanceTimersByTime(1_000);
    expect(canAsk()).toBe(true);
    expect(askBudgetTicking()).toBe(false);
    expect(ticks).toBe(60);
    // Nothing more fires once it has stopped.
    vi.advanceTimersByTime(10_000);
    expect(ticks).toBe(60);
    stop();
  });

  it("stops when the last listener goes and starts again for the next one", () => {
    const first = subscribeAskBudget(() => {});
    const second = subscribeAskBudget(() => {});
    spend();
    expect(askBudgetTicking()).toBe(true);
    first();
    expect(askBudgetTicking()).toBe(true);
    second();
    expect(askBudgetTicking()).toBe(false);
    const third = subscribeAskBudget(() => {});
    expect(askBudgetTicking()).toBe(true);
    third();
  });

  it("stops when the record is dropped", () => {
    const stop = subscribeAskBudget(() => {});
    spend();
    expect(askBudgetTicking()).toBe(true);
    resetAskBudget();
    expect(askBudgetTicking()).toBe(false);
    stop();
  });

  it("hands a subscriber a plain number it can compare", () => {
    const stop = subscribeAskBudget(() => {});
    spend();
    expect(secondsUntilAllowed()).toBe(60);
    vi.advanceTimersByTime(30_000);
    expect(secondsUntilAllowed()).toBe(30);
    stop();
  });
});
