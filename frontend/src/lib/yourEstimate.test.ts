import { describe, expect, it } from "vitest";
import { applyCell, decodeYourEstimate, encodeYourEstimate, isRejected, looksNumeric } from "./yourEstimate";

describe("your estimate encoding", () => {
  it("round-trips the typed strings unchanged", () => {
    const map = { revenue: { y1: "412.5", y2: "440" }, operatingMargin: { y1: "31.2" }, eps: { y2: "-1.05" }, eva: { y1: "−2" } };
    expect(decodeYourEstimate(encodeYourEstimate(map))).toEqual(map);
  });

  it("treats null, empty and bad JSON as nothing saved", () => {
    expect(decodeYourEstimate(null)).toEqual({});
    expect(decodeYourEstimate(undefined)).toEqual({});
    expect(decodeYourEstimate("")).toEqual({});
    expect(decodeYourEstimate("{not json")).toEqual({});
    expect(decodeYourEstimate("[1,2]")).toEqual({});
    expect(decodeYourEstimate('"text"')).toEqual({});
  });

  it("drops unknown keys and wrong shapes", () => {
    const raw = JSON.stringify({ revenue: { y1: "1", y3: "2" }, bogus: { y1: "5" }, roic: "12", fcff: [1], nopat: { y1: 5 } });
    expect(decodeYourEstimate(raw)).toEqual({ revenue: { y1: "1" } });
  });

  it("leaves non-numeric input unsaved", () => {
    expect(encodeYourEstimate({ revenue: { y1: "abc", y2: "12" }, roic: { y1: "", y2: "-" } })).toBe('{"revenue":{"y2":"12"}}');
    expect(["1", "1.", ".5", "-3.25", " 7 ", "−2"].every(looksNumeric)).toBe(true);
    expect(["", "-", ".", "$", "%", "1e5", "12%%", "1,00", "1,2345", "--4", "-$-4", "12 abc", "B"].some(looksNumeric)).toBe(false);
  });

  it("accepts what the placeholders invite, stored exactly as typed", () => {
    const typed = ["12%", "538B", "538 b", "40M", "7m", "1,200", "1,200.50", "$9.50", "-$9.50", "$-9.50", "−$4", " 12.5 % "];
    for (const s of typed) expect(looksNumeric(s)).toBe(true);
    const map = { revenue: { y1: "538B", y2: "1,200" }, roic: { y1: "12%" }, eps: { y1: "$9.50", y2: "-$9.50" } };
    expect(decodeYourEstimate(encodeYourEstimate(map))).toEqual(map);
  });
});

describe("applyCell", () => {
  const saved = { revenue: { y1: "412", y2: "440" }, roic: { y1: "12%" } };

  it("keeps the saved number when the new text is not a number", () => {
    expect(applyCell(saved, "revenue", "y1", "412x")).toBe(saved);
    expect(applyCell(saved, "roic", "y1", "twelve")).toBe(saved);
    expect(isRejected("412x")).toBe(true);
  });

  it("replaces the cell with a number and clears it on a blank", () => {
    expect(applyCell(saved, "revenue", "y1", "538B")).toEqual({ revenue: { y1: "538B", y2: "440" }, roic: { y1: "12%" } });
    expect(applyCell(saved, "revenue", "y2", "  ")).toEqual({ revenue: { y1: "412" }, roic: { y1: "12%" } });
    expect(applyCell(saved, "roic", "y1", "")).toEqual({ revenue: { y1: "412", y2: "440" } });
    expect(applyCell({}, "eps", "y2", "$1.05")).toEqual({ eps: { y2: "$1.05" } });
    expect(saved).toEqual({ revenue: { y1: "412", y2: "440" }, roic: { y1: "12%" } });
    expect([undefined, "", " ", "12%"].some(isRejected)).toBe(false);
  });
});
