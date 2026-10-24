import { afterEach, describe, expect, it, vi } from "vitest";
import { snapshotChange } from "./snapshotChange";
import {
  marginOfSafetyFor,
  readStableGrowthChoice,
  resolveStableGrowth,
  writeStableGrowthChoice,
} from "./stableGrowthChoice";
import { growthUsedLabel, growthUsedWords } from "./growthUsedLabel";
import { resolveGrowthSplit } from "./cfFormatters";
import { isGrowthRateKey } from "./individualSeries";
import type { CompanyBlock } from "./connectionsTypes";

describe("snapshotChange (lookback snapshots)", () => {
  it("a level series shows the compound annual rate", () => {
    // 100 -> 161.051 over 5 years is 10% a year, not 61% cumulative.
    const s = snapshotChange(161.051, 100, 5, false);
    expect(s?.kind).toBe("cagr");
    expect(s?.change).toBeCloseTo(10, 6);
  });

  it("one year is the plain change", () => {
    expect(snapshotChange(110, 100, 1, false)?.change).toBeCloseTo(10, 9);
  });

  it("falls back to the cumulative change when an end is not positive", () => {
    const s = snapshotChange(50, -100, 3, false);
    expect(s?.kind).toBe("cumulative");
    expect(s?.change).toBeCloseTo(150, 9);
    expect(snapshotChange(-20, 100, 3, false)?.kind).toBe("cumulative");
  });

  it("a zero starting value has no change to show", () => {
    expect(snapshotChange(5, 0, 3, false)).toBeNull();
  });

  it("a rate keeps its point change", () => {
    const s = snapshotChange(12, 8, 5, true);
    expect(s).toEqual({ years: 5, change: 4, kind: "pp" });
  });
});

describe("stable growth toggle", () => {
  const alts = {
    min: { stableGrowth: 0.0412, intrinsicPerShare: 138.28 },
    rf: { stableGrowth: 0.0513, intrinsicPerShare: 153.19 },
  };

  it("defaults to the lower stable growth", () => {
    expect(resolveStableGrowth(alts, "min")).toEqual({ ...alts.min, basis: "min" });
  });

  it("switches to the risk-free alternative when chosen", () => {
    expect(resolveStableGrowth(alts, "rf")).toEqual({ ...alts.rf, basis: "rf" });
  });

  it("falls back to min when there is no risk-free alternative", () => {
    expect(resolveStableGrowth({ min: alts.min }, "rf")?.basis).toBe("min");
    expect(resolveStableGrowth(null, "rf")).toBeNull();
  });

  it("margin of safety is intrinsic over price less one", () => {
    // AAPL payload: 138.28 / 348.22 - 1 = -0.6029, the backend's figure.
    expect(marginOfSafetyFor(138.28, 348.22)).toBeCloseTo(-0.6029, 4);
    expect(marginOfSafetyFor(138.28, null)).toBeNull();
  });

  describe("persistence", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("reads min when storage is unavailable", () => {
      vi.stubGlobal("localStorage", undefined);
      expect(readStableGrowthChoice("aapl")).toBe("min");
      expect(() => writeStableGrowthChoice("aapl", "rf")).not.toThrow();
    });

    it("stores the choice per ticker under ifed.valuation.stableGrowth.<TICKER>", () => {
      const store = new Map<string, string>();
      vi.stubGlobal("localStorage", {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
      });
      writeStableGrowthChoice("aapl", "rf");
      expect(store.get("ifed.valuation.stableGrowth.AAPL")).toBe("rf");
      expect(readStableGrowthChoice("AAPL")).toBe("rf");
      expect(readStableGrowthChoice("V")).toBe("min");
    });
  });
});

describe("growthUsedKind labels", () => {
  it("labels the number by what it is", () => {
    expect(growthUsedLabel("revenueGrowth", "FCF growth used")).toBe("Revenue growth used");
    expect(growthUsedLabel("fcfPerShareHistory", "x")).toBe("Historical FCF per share growth");
    expect(growthUsedLabel("dividendGrowth", "x")).toBe("Dividend growth used");
  });

  it("legacy and unknown keep the existing label", () => {
    expect(growthUsedLabel("legacyFcfPerShare", "FCF growth used")).toBe("FCF growth used");
    expect(growthUsedLabel(undefined, "Growth used")).toBe("Growth used");
    expect(growthUsedLabel(null, "Growth used")).toBe("Growth used");
  });

  it("states the kind in words for the AI context", () => {
    expect(growthUsedWords("revenueGrowth")).toBe("revenue growth that drives the forecast");
    expect(growthUsedWords(undefined)).toBe("FCF growth");
  });
});

describe("growth split in compound rates", () => {
  const block = (industryPoints: number, sharePoints: number) =>
    ({
      growth: {
        companyCagr5y: industryPoints + sharePoints,
        industryCagr5y: industryPoints,
        industryPoints,
        sharePoints,
        shareNow: 0.111513,
        shareThen: 0.017867,
        years: 5,
      },
    }) as unknown as CompanyBlock;

  it("NVDA: every part is a compound rate and the parts add to the total", () => {
    const g = resolveGrowthSplit(block(0.129952, 0.366236));
    if (g.kind !== "full") throw new Error("expected a full split");
    expect(g.total).toBe("64.2");
    expect(g.industryPart).toBe("13.9");
    expect(g.sharePart).toBe("50.3");
    expect(g.companySigned).toBe(g.total);
    expect(Number(g.industryPart) + Number(g.sharePart)).toBeCloseTo(Number(g.total), 9);
  });

  it("a shrinking company is negative throughout", () => {
    const g = resolveGrowthSplit(block(0.02, -0.1));
    if (g.kind !== "full") throw new Error("expected a full split");
    expect(g.shrank).toBe(true);
    // exp(-0.08) - 1 = -7.7; industry exp(0.02) - 1 = 2.0; share -9.7.
    expect(g.total).toBe("-7.7");
    expect(g.industryPart).toBe("2.0");
    expect(g.sharePart).toBe("-9.7");
  });

  it("missing parts give no split", () => {
    expect(resolveGrowthSplit(null).kind).toBe("none");
  });
});

describe("growth-rate series", () => {
  it("*_growth keys are already rates", () => {
    expect(isGrowthRateKey("revenue_growth")).toBe(true);
    expect(isGrowthRateKey("net_income_growth")).toBe(true);
    expect(isGrowthRateKey("roic")).toBe(false);
    expect(isGrowthRateKey("growth_track_record")).toBe(false);
  });
});
