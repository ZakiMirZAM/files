import { describe, expect, it } from "vitest";
import {
  CHAT_ANSWER_CHARS,
  CHAT_MEMORY_TURNS,
  chatBlock,
  chatDataContext,
  pageNameFromTitle,
} from "./chatContext";

const turn = (n: number) => ({ question: `q${n}`, answer: `a${n}` });

describe("chatBlock", () => {
  it("is undefined with no page and no earlier turns", () => {
    expect(chatBlock(undefined, [])).toBeUndefined();
    expect(chatBlock("   ", [])).toBeUndefined();
  });

  it("keeps only the last CHAT_MEMORY_TURNS exchanges, oldest first", () => {
    const turns = [1, 2, 3, 4, 5].map(turn);
    const parsed = JSON.parse(chatBlock("Individual Analysis", turns)!);
    expect(parsed.chat.askedOnPage).toBe("Individual Analysis");
    expect(parsed.chat.earlierInThisChat).toHaveLength(CHAT_MEMORY_TURNS);
    expect(parsed.chat.earlierInThisChat.map((t: { question: string }) => t.question)).toEqual([
      "q3",
      "q4",
      "q5",
    ]);
  });

  it("clips a long earlier answer", () => {
    const long = "x".repeat(CHAT_ANSWER_CHARS + 500);
    const parsed = JSON.parse(chatBlock(undefined, [{ question: "q", answer: long }])!);
    const answer: string = parsed.chat.earlierInThisChat[0].answer;
    expect(answer.length).toBe(CHAT_ANSWER_CHARS + 1);
    expect(answer.endsWith("…")).toBe(true);
  });
});

describe("chatDataContext", () => {
  it("puts the page's own figures first, then the chat block", () => {
    const ctx = chatDataContext({ dataContext: '{"ticker":"KO"}' }, "Individual Analysis", [turn(1)]);
    expect(ctx!.startsWith('{"ticker":"KO"}\n\n{"chat":')).toBe(true);
  });

  it("is the chat block alone when the page has no figures", () => {
    expect(chatDataContext({}, "Guide", [])).toBe('{"chat":{"askedOnPage":"Guide"}}');
  });
});

describe("pageNameFromTitle", () => {
  it("reads the section from the tab title", () => {
    expect(pageNameFromTitle("IntrinsicFinEd - Economic")).toBe("Economic");
    expect(pageNameFromTitle("IntrinsicFinEd")).toBeUndefined();
  });
});
