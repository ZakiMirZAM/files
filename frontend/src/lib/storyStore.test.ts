import { describe, expect, it } from "vitest";
import { STORY_INPUTS } from "./story";
import { parseStoredStory, readStoredStory, resolveStoryMode, setStoredStory } from "./storyStore";

const conversion = { rows: [], riskFlags: [], weakestLink: "", counterStory: "" };
describe("storyStore", () => {
  it("returns the same object on every read so useSyncExternalStore settles", () => {
    setStoredStory("TEST", { conversion, savedAt: 1 });
    expect(readStoredStory("TEST")).toBe(readStoredStory("TEST"));
  });
  it("treats a missing or corrupt entry as no story", () => {   // Review Focus 3
    expect(readStoredStory("NEVER")).toBeNull();
    setStoredStory("TEST", null);
    expect(readStoredStory("TEST")).toBeNull();
  });
  it("shows story mode only when a story exists", () => {
    expect(resolveStoryMode(false, "story")).toBe("model");
    expect(resolveStoryMode(true, "story")).toBe("story");
    expect(resolveStoryMode(true, null)).toBe("model");
  });
});

describe("parseStoredStory", () => {
  it("reads corrupt or old-shape entries as no story", () => {   // Review Focus 3
    expect(parseStoredStory(null)).toBeNull();
    expect(parseStoredStory("{bad")).toBeNull();
    expect(parseStoredStory('{"savedAt":1}')).toBeNull();
    expect(parseStoredStory('{"conversion":{"rows":"x"},"savedAt":1}')).toBeNull();
  });
  it("round-trips a saved story", () => {
    const stored = {
      conversion: {
        rows: STORY_INPUTS.map(({ input, unit }) => ({ input, storyQuote: "q", value: 0.1, unit,
          proof: "p", sources: ["s"], verification: { status: "verified" as const } })),
        riskFlags: ["r"], weakestLink: "w", counterStory: "c",
      },
      savedAt: 1,
    };
    expect(parseStoredStory(JSON.stringify(stored))).toEqual(stored);
  });
});
