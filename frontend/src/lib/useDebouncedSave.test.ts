// The debounce behind every autosaving textarea.
//
// There is no DOM test environment in this project, so these drive the pure
// core the hook is built from. The rule under test is the one that produced a
// real data loss: a save queued against one subject must write through the
// callback it was queued with, even when the field has since been handed a
// callback pointing at a different subject. That is what happens when a reader
// types into a definition's question deck and clicks another company inside
// the debounce window.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createDebouncedSaver, type SaveStatus } from "./useDebouncedSave";

const DELAY = 650;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Collects the status line the field would render. */
function statuses() {
  const seen: SaveStatus[] = [];
  return { seen, onStatus: (s: SaveStatus) => seen.push(s) };
}

describe("createDebouncedSaver", () => {
  it("waits the delay before writing", async () => {
    const writes: string[] = [];
    const { seen, onStatus } = statuses();
    const saver = createDebouncedSaver("", onStatus);

    saver.schedule("hello", (v) => writes.push(v), DELAY);
    expect(writes).toEqual([]);
    expect(seen).toEqual(["saving"]);

    // The write itself is a microtask behind the timer, so the clock is
    // advanced with the async form that drains them.
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(writes).toEqual(["hello"]);

    await vi.runAllTimersAsync();
    expect(saver.lastSaved.current).toBe("hello");
    expect(seen).toEqual(["saving", "saved", "idle"]);
  });

  it("only writes the last value when keystrokes land inside the window", async () => {
    const writes: string[] = [];
    const { onStatus } = statuses();
    const saver = createDebouncedSaver("", onStatus);
    const save = (v: string) => writes.push(v);

    saver.schedule("h", save, DELAY);
    vi.advanceTimersByTime(100);
    saver.schedule("he", save, DELAY);
    vi.advanceTimersByTime(100);
    saver.schedule("hel", save, DELAY);
    await vi.runAllTimersAsync();

    expect(writes).toEqual(["hel"]);
  });

  it("writes through the callback the value was queued with, not a later one", async () => {
    // The bug: the reader types NVDA's answer, then clicks AVGO in the peer
    // table before the debounce fires. The field is reused, so it is holding
    // AVGO's save callback when the timer goes off.
    const written: { subject: string; text: string }[] = [];
    const saveFor = (subject: string) => (text: string) => {
      written.push({ subject, text });
    };
    const { onStatus } = statuses();
    const saver = createDebouncedSaver("", onStatus);

    saver.schedule("NVDA's answer", saveFor("NVDA"), DELAY);
    // The page's subject changes inside the window. Nothing re-schedules,
    // because the textarea's value did not change.
    await vi.runAllTimersAsync();

    expect(written).toEqual([{ subject: "NVDA", text: "NVDA's answer" }]);
  });

  it("flush writes the pending value immediately, through its own callback", async () => {
    const written: { subject: string; text: string }[] = [];
    const saveFor = (subject: string) => (text: string) => {
      written.push({ subject, text });
    };
    const { onStatus } = statuses();
    const saver = createDebouncedSaver("", onStatus);

    saver.schedule("half a sentence", saveFor("NVDA"), DELAY);
    saver.flush(); // what an unmounting field does
    await vi.runAllTimersAsync();

    expect(written).toEqual([{ subject: "NVDA", text: "half a sentence" }]);
  });

  it("flush with nothing pending writes nothing", async () => {
    const writes: string[] = [];
    const { seen, onStatus } = statuses();
    const saver = createDebouncedSaver("", onStatus);

    saver.flush();
    await vi.runAllTimersAsync();

    expect(writes).toEqual([]);
    expect(seen).toEqual([]);
  });

  it("does not write the same queued value twice when the timer already fired", async () => {
    const writes: string[] = [];
    const { onStatus } = statuses();
    const saver = createDebouncedSaver("", onStatus);

    saver.schedule("done", (v) => writes.push(v), DELAY);
    await vi.runAllTimersAsync();
    saver.flush();
    await vi.runAllTimersAsync();

    expect(writes).toEqual(["done"]);
  });

  it("cancel drops the pending write", async () => {
    const writes: string[] = [];
    const { onStatus } = statuses();
    const saver = createDebouncedSaver("", onStatus);

    saver.schedule("never", (v) => writes.push(v), DELAY);
    saver.cancel();
    await vi.runAllTimersAsync();

    expect(writes).toEqual([]);
  });

  it("reports an error and swallows the rejection", async () => {
    const { seen, onStatus } = statuses();
    const saver = createDebouncedSaver("", onStatus);

    saver.schedule("boom", () => Promise.reject(new Error("convex said no")), DELAY);
    await vi.runAllTimersAsync();

    expect(seen).toEqual(["saving", "error"]);
    expect(saver.lastSaved.current).toBe("");
  });

  it("reports an error when the save throws outright", async () => {
    const { seen, onStatus } = statuses();
    const saver = createDebouncedSaver("", onStatus);

    saver.schedule("boom", () => {
      throw new Error("threw");
    }, DELAY);
    await vi.runAllTimersAsync();

    expect(seen).toEqual(["saving", "error"]);
  });

  it("tracks the last value it actually wrote", async () => {
    const { onStatus } = statuses();
    const saver = createDebouncedSaver("start", onStatus);
    expect(saver.lastSaved.current).toBe("start");

    saver.schedule("one", () => undefined, DELAY);
    await vi.runAllTimersAsync();
    expect(saver.lastSaved.current).toBe("one");

    saver.schedule("two", () => Promise.reject(new Error("no")), DELAY);
    await vi.runAllTimersAsync();
    expect(saver.lastSaved.current, "a failed save is not a saved value").toBe("one");
  });
});
