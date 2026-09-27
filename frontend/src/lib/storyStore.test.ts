import { describe, expect, it } from "vitest";
import { STORY_INPUTS } from "./story";
import { STORED_STORY_VERSION, parseStoredStory, readStoredStory, resolveStoryMode, setStoredStory } from "./storyStore";

const conversion = { rows: [], riskFlags: [], weakestLink: "", counterStory: "" };
describe("storyStore", () => {
  it("returns the same object on every read so useSyncExternalStore settles", () => {
    setStoredStory("TEST", { version: STORED_STORY_VERSION, conversion, research: {}, savedAt: 1 });
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
  const stored = {
    version: STORED_STORY_VERSION,
    conversion: {
      rows: STORY_INPUTS.map(({ input, unit }) => ({ input, storyQuote: "q", value: 0.1, unit,
        proof: "p", sources: ["s"], verification: { status: "verified" as const } })),
      riskFlags: ["r"], weakestLink: "w", counterStory: "c",
    },
    research: {
      "indiv.story.market": { source: "user" as const, text: "mine", sources: [] },
      "indiv.story.edge": { source: "ai" as const, text: "theirs", sources: ["Book, chapter 3"] },
      "indiv.story.size": { source: "built" as const, text: "both", sources: ["Book, chapter 4"] },
      "indiv.story.end": { source: "user" as const, text: "", sources: [], error: "down" },
    },
    savedAt: 1,
  };
  it("reads corrupt or old-shape entries as no story", () => {   // Review Focus 3
    expect(parseStoredStory(null)).toBeNull();
    expect(parseStoredStory("{bad")).toBeNull();
    expect(parseStoredStory('{"savedAt":1}')).toBeNull();
    expect(parseStoredStory('{"conversion":{"rows":"x"},"savedAt":1}')).toBeNull();
    // The version-1 shape (no version, no research) is an old story.
    const { version: _v, research: _r, ...v1 } = stored;
    expect(parseStoredStory(JSON.stringify(v1))).toBeNull();
    expect(parseStoredStory(JSON.stringify({ ...stored, version: 1 }))).toBeNull();
    // Version 2 stored the verdict-era research (an answer kept unread) and eight rows.
    expect(parseStoredStory(JSON.stringify({ ...stored, version: 2 }))).toBeNull();
    const badSource = { ...stored, research: { "indiv.story.edge": { source: "bot", text: "t", sources: [] } } };
    expect(parseStoredStory(JSON.stringify(badSource))).toBeNull();
  });
  it("round-trips a saved story and drops unknown research keys", () => {
    expect(parseStoredStory(JSON.stringify(stored))).toEqual(stored);
    const extra = { ...stored, research: { ...stored.research, "indiv.other": { source: "ai", text: "x", sources: [] } } };
    expect(parseStoredStory(JSON.stringify(extra))).toEqual(stored);
  });
});
