// Tests for the verification-report parsing layer. The server returns COUNTS
// ONLY while it runs in shadow mode and withholds the per-claim arrays, so the
// parser has to produce a usable report from either shape, and never throw:
// verification is commentary on an answer, and the answer is the product.

import { describe, expect, it } from "vitest";
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
