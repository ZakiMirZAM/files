// Tests for the verification-report parsing layer. The server returns COUNTS
// ONLY while it runs in shadow mode and withholds the per-claim arrays, so the
// parser has to produce a usable report from either shape, and never throw:
// verification is commentary on an answer, and the answer is the product.

import { afterEach, describe, expect, it, vi } from "vitest";
import { parseVerification, toVerificationReport } from "./aiApi";

const SHADOW = {
  mode: "shadow",
  status: "flagged",
  checked: 22,
  bound: 14,
  matched: 12,
  approx: 1,
  mismatched: 1,
  unsupported: 8,
  numericFidelity: 0.93,
  arithmetic: { checked: 3, errors: 0 },
  contradictionsInformational: 2,
  elapsedMs: 8.6,
};

const ON = {
  ...SHADOW,
  mode: "on",
  token: "tok-123",
  flagged: [
    { text: "8.9%", label: "WACC", stated: 8.9, expected: 8.42, via: "WACC", line: 12 },
  ],
  arithmeticErrors: [{ text: "41.2 - 8.42 = 33.1", stated: 33.1, computed: 32.78 }],
  transcriptionErrors: [
    { label: "spread", expression: "41.2-8.42", tool_result: 32.78, answer_said: 32.8, raw: "32.8" },
  ],
};

describe("toVerificationReport", () => {
  it("reads the shadow shape and leaves the per-claim arrays absent", () => {
    const r = toVerificationReport(SHADOW);
    expect(r?.status).toBe("flagged");
    expect(r?.bound).toBe(14);
    expect(r?.matched).toBe(12);
    expect(r?.arithmetic).toEqual({ checked: 3, errors: 0 });
    expect(r?.flagged).toBeUndefined();
    expect(r?.token).toBeUndefined();
  });

  it("reads the on-mode shape including the flagged claims and the token", () => {
    const r = toVerificationReport(ON);
    expect(r?.token).toBe("tok-123");
    expect(r?.flagged).toHaveLength(1);
    expect(r?.flagged?.[0]).toMatchObject({ text: "8.9%", expected: 8.42, via: "WACC" });
    expect(r?.arithmeticErrors?.[0].computed).toBe(32.78);
    expect(r?.transcriptionErrors?.[0].tool_result).toBe(32.78);
  });

  it("defaults missing counts to zero rather than producing NaN", () => {
    const r = toVerificationReport({ status: "clean" });
    expect(r?.bound).toBe(0);
    expect(r?.matched).toBe(0);
    expect(r?.arithmetic).toEqual({ checked: 0, errors: 0 });
    expect(r?.contradictionsInformational).toBe(0);
  });

  it("treats any status other than flagged as clean", () => {
    expect(toVerificationReport({ status: "clean" })?.status).toBe("clean");
    expect(toVerificationReport({ status: "nonsense" })?.status).toBe("clean");
  });

  it("returns undefined when there is no usable report", () => {
    expect(toVerificationReport(undefined)).toBeUndefined();
    expect(toVerificationReport(null)).toBeUndefined();
    expect(toVerificationReport("flagged")).toBeUndefined();
    expect(toVerificationReport({})).toBeUndefined();
  });
});

describe("parseVerification", () => {
  it("round-trips a stored report", () => {
    const r = parseVerification(JSON.stringify(ON));
    expect(r?.mismatched).toBe(1);
    expect(r?.flagged).toHaveLength(1);
  });

  it("returns undefined for empty or corrupt stored JSON", () => {
    expect(parseVerification(undefined)).toBeUndefined();
    expect(parseVerification("")).toBeUndefined();
    expect(parseVerification("{not json")).toBeUndefined();
  });
});

import { convertStory, toStoryConversion } from "./aiApi";
const NAMES = ["totalMarket", "marketGrowth10y", "shareYear10", "targetMargin", "salesToCapital", "failureProbability", "distressProceeds", "stableRoic"];
const raw = { rows: NAMES.map((input) => ({ input, storyQuote: "q", value: 0.1, unit: "fraction", proof: "p", sources: [], verification: { status: "verified", report: null } })), riskFlags: [], weakestLink: "w", counterStory: "c" };
describe("toStoryConversion", () => {
  it("accepts the server shape", () => { expect(toStoryConversion(raw)?.rows).toHaveLength(8); });
  it("rejects a table missing an input", () => { expect(toStoryConversion({ ...raw, rows: raw.rows.slice(1) })).toBeNull(); });
  it("coerces unknown statuses and non-numbers", () => {
    const odd = { ...raw, rows: [{ ...raw.rows[0], value: "9%", verification: { status: "weird" } }, ...raw.rows.slice(1)] };
    const c = toStoryConversion(odd)!;
    expect(c.rows[0].value).toBeNull();
    expect(c.rows[0].verification.status).toBe("unavailable");
  });
});

describe("convertStory", () => {
  afterEach(() => vi.unstubAllGlobals());
  const reply = (body: string) => vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));
  const params = { ticker: "RACE", company: "Ferrari", answers: {}, dataBlock: "d" };
  it("shows the proxy's error sentence when the RAG server is down", async () => {
    // ai_proxy's fallback: a 200 after heartbeat spaces, an error and no rows.
    reply('  {"answer":"","explanation":"","definition":"","sources":[],"error":"AI backend temporarily unavailable"}');
    await expect(convertStory(params)).rejects.toThrow("AI backend temporarily unavailable");
    expect(toStoryConversion({ error: "AI backend temporarily unavailable" })).toBeNull();
  });
  it("treats a reply without the table as a failure, never an empty table", async () => {
    reply('{"rows":[],"sources":[]}');
    await expect(convertStory(params)).rejects.toThrow("The AI answer could not be read. Try again.");
  });
  it("returns the table", async () => {
    reply(JSON.stringify(raw));
    expect((await convertStory(params)).rows.map((r) => r.input)).toEqual(NAMES);
  });
});

import { answerStoryQuestion } from "./aiApi";
describe("answerStoryQuestion", () => {
  afterEach(() => vi.unstubAllGlobals());
  const reply = (body: string) => {
    const f = vi.fn(async (_url: string, _init?: RequestInit) => new Response(body, { status: 200 }));
    vi.stubGlobal("fetch", f);
    return f;
  };
  const params = { ticker: "RACE", company: "Ferrari", questionId: "indiv.story.market", question: "Q",
                   userAnswer: "", dataBlock: "d" };
  it("shows the proxy's error sentence when the RAG server is down", async () => {
    reply('  {"answer":"","explanation":"","definition":"","sources":[],"error":"AI backend temporarily unavailable"}');
    await expect(answerStoryQuestion(params)).rejects.toThrow("AI backend temporarily unavailable");
  });
  it("treats a reply without a verdict, or an empty AI answer, as a failure", async () => {
    reply('{"answer":"text"}');
    await expect(answerStoryQuestion(params)).rejects.toThrow("The AI answer could not be read. Try again.");
    reply('{"adequate":false,"answer":"  ","sources":[]}');
    await expect(answerStoryQuestion(params)).rejects.toThrow("The AI answer could not be read. Try again.");
  });
  it("returns the kept and the answered shapes", async () => {
    reply('{"adequate":true,"answer":"x","sources":["y"]}');
    expect(await answerStoryQuestion(params)).toEqual({ adequate: true, answer: "", sources: [] });
    reply('{"adequate":false,"answer":" researched ","sources":["Book, chapter 1", 3]}');
    expect(await answerStoryQuestion(params)).toEqual({ adequate: false, answer: "researched", sources: ["Book, chapter 1"] });
  });
  it("posts the server's field names", async () => {
    const f = reply('{"adequate":true,"answer":"","sources":[]}');
    await answerStoryQuestion({ ...params, otherAnswers: { "indiv.story.edge": "e" } });
    const [url, init] = f.mock.calls[0];
    expect(url.endsWith("/story-answer")).toBe(true);
    expect(JSON.parse(init!.body as string)).toEqual({ ticker: "RACE", company: "Ferrari",
      questionId: "indiv.story.market", question: "Q", userAnswer: "", otherAnswers: { "indiv.story.edge": "e" }, data: "d" });
  });
});
