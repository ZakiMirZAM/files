import { describe, expect, test } from "vitest";
import type { SectionData } from "./types";
import {
  addMonths,
  forwardReturn,
  spearman,
  truncateSectionData,
  type MonthlyClose,
} from "./rotationBacktest";

describe("addMonths", () => {
  test("adds within and across year boundaries", () => {
    expect(addMonths("2020-01", 3)).toBe("2020-04");
    expect(addMonths("2020-11", 3)).toBe("2021-02");
    expect(addMonths("2020-01", -1)).toBe("2019-12");
  });
});

describe("forwardReturn", () => {
  const closes: MonthlyClose[] = [
    { period: "2020-01", close: 100 },
    { period: "2020-02", close: 110 },
    { period: "2020-04", close: 121 },
  ];

  test("computes the simple return over the horizon", () => {
    expect(forwardReturn(closes, "2020-01", 1)).toBeCloseTo(0.1, 10);
    expect(forwardReturn(closes, "2020-02", 2)).toBeCloseTo(0.1, 10);
  });

  test("returns null when either month is missing", () => {
    expect(forwardReturn(closes, "2020-01", 2)).toBeNull();
    expect(forwardReturn(closes, "2020-04", 1)).toBeNull();
  });
});

describe("spearman", () => {
  test("perfect monotone agreement is 1, inversion is -1", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1, 10);
    expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1, 10);
  });

  test("handles ties with midranks", () => {
    const r = spearman([1, 1, 2, 3], [1, 2, 3, 4]);
    expect(r).not.toBeNull();
    expect(r!).toBeGreaterThan(0.7);
    expect(r!).toBeLessThan(1);
  });

  test("degenerate inputs return null", () => {
    expect(spearman([1, 2], [1, 2])).toBeNull();
    expect(spearman([1, 1, 1], [1, 2, 3])).toBeNull();
  });
});

describe("truncateSectionData", () => {
  const data = {
    title: "t",
    subtitle: "s",
    metrics: [
      {
        name: "Real GDP Growth",
        unit: "%",
        frequency: "quarterly",
        latestValue: 2,
        trend: [
          { period: "2015-03-31", value: 1 },
          { period: "2019-12-31", value: 2 },
          { period: "2024-03-31", value: 3 },
        ],
      },
    ],
    treasuryYields: [
      {
        name: "10-Year Treasury Yield",
        unit: "%",
        frequency: "daily",
        latestValue: 4,
        trend: [
          { period: "2018-06-01", value: 3 },
          { period: "2024-06-01", value: 4 },
        ],
      },
    ],
    commodities: [
      {
        label: "Wheat",
        price: [
          { period: "2019-01", value: 5 },
          { period: "2024-01", value: 6 },
        ],
      },
    ],
  } as unknown as SectionData;

  test("drops points after the cutoff on every series family", () => {
    const cut = truncateSectionData(data, new Date(2020, 0, 31));
    expect(cut.metrics[0].trend).toHaveLength(2);
    expect(cut.treasuryYields?.[0].trend).toHaveLength(1);
    expect(cut.commodities?.[0].price).toHaveLength(1);
    // The original is untouched (immutability).
    expect(data.metrics[0].trend).toHaveLength(3);
  });
});
