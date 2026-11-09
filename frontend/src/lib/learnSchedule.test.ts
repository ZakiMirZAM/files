import { describe, expect, it } from "vitest";
import { describeDue, formatWait, newCardState, parseSrs, previewDue, rate } from "./learnSchedule";

const NOW = new Date("2026-11-08T12:00:00Z");

describe("learnSchedule", () => {
  it("treats a missing or broken state as a new card", () => {
    expect(parseSrs(undefined, NOW).reps).toBe(0);
    expect(parseSrs("not json", NOW).reps).toBe(0);
    expect(parseSrs(JSON.stringify({ due: "garbage" }), NOW).state).toBe(newCardState(NOW).state);
  });

  it("schedules later for better ratings on a new card", () => {
    const p = previewDue(undefined, NOW);
    expect(p[1]).toBeLessThanOrEqual(p[2]);
    expect(p[2]).toBeLessThanOrEqual(p[3]);
    expect(p[3]).toBeLessThan(p[4]);
    expect(p[1]).toBeGreaterThan(NOW.getTime());
  });

  it("round-trips the stored state and keeps growing intervals", () => {
    const first = rate(undefined, 3, NOW);
    expect(first.card.reps).toBe(1);
    const parsed = parseSrs(first.srs, NOW);
    expect(parsed.due.getTime()).toBe(first.due);
    // Study again when due, rate Good twice: the gap should grow.
    const second = rate(first.srs, 3, new Date(first.due));
    const third = rate(second.srs, 3, new Date(second.due));
    expect(third.due - second.due).toBeGreaterThan(second.due - first.due);
    expect(JSON.parse(third.log).rating).toBe(3);
  });

  it("Again after a review brings the card back soon", () => {
    let s = rate(undefined, 4, NOW);
    s = rate(s.srs, 3, new Date(s.due));
    const lapse = rate(s.srs, 1, new Date(s.due));
    expect(lapse.due - s.due).toBeLessThan(86_400_000);
    expect(lapse.card.lapses).toBe(1);
  });

  it("formats waits plainly", () => {
    const t = NOW.getTime();
    expect(formatWait(t + 10_000, t)).toBe("now");
    expect(formatWait(t + 10 * 60_000, t)).toBe("10 min");
    expect(formatWait(t + 3 * 3_600_000, t)).toBe("3 h");
    expect(formatWait(t + 86_400_000, t)).toBe("1 day");
    expect(formatWait(t + 5 * 86_400_000, t)).toBe("5 days");
    expect(formatWait(t + 90 * 86_400_000, t)).toBe("3 mo");
    expect(describeDue(t + 10 * 60_000, t)).toBe("Back in 10 min.");
  });
});
