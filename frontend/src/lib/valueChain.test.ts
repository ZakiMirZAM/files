import { describe, expect, it } from "vitest";
import { formatChainValue, formatPair, rowsForSide, type ValueChainRow } from "./valueChain";

describe("value chain", () => {
  it("prints now · 5 years ago, with not available for a gap", () => {
    expect(formatPair([0.4, 0.35], "pct")).toBe("40.0% · 35.0%");
    expect(formatPair([45.4, null], "days")).toBe("45 days · not available");
    expect(formatPair(null, "days")).toBe("not available · not available");
    expect(formatChainValue(undefined, "pct")).toBe("not available");
  });

  it("groups rows by side, keeping order", () => {
    const rows: ValueChainRow[] = [
      { ticker: "A", side: "company" },
      { ticker: "S1", side: "supplier" },
      { ticker: "C1", side: "customer" },
      { ticker: "S2", side: "supplier" },
    ];
    expect(rowsForSide(rows, "supplier").map((r) => r.ticker)).toEqual(["S1", "S2"]);
    expect(rowsForSide(undefined, "company")).toEqual([]);
  });
});
