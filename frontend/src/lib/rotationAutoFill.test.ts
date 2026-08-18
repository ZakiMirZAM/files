// Unit tests for the Sector Rotation auto-fill classifier. Everything is
// deterministic: the clock is injected and every series is synthetic.

import { describe, expect, it } from "vitest";
import type { Frequency, Metric, SectionData, TrendPoint } from "./types";
import { METRICS, clampWeight, scoreMatrix } from "./sectorRotation";
import {
  autoFillReadings,
  classifySeries,
  parsePeriod,
  sameReadings,
  seriesNameForRow,
} from "./rotationAutoFill";

const NOW = new Date(2026, 5, 30);
const OPTS = { now: NOW };
const MS_PER_DAY = 86_400_000;

/** Monthly points ending on the last day of endYear/endMonth (0-based). */
function monthlySeries(values: number[], endYear = 2026, endMonth = 5): TrendPoint[] {
  return values.map((value, i) => {
    const offset = values.length - 1 - i;
    const d = new Date(endYear, endMonth - offset + 1, 0);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return { period: `${d.getFullYear()}-${mm}-${dd}`, value };
  });
}

/** Weekly points ending just before NOW, for daily-frequency series. */
function weeklySeries(values: number[]): TrendPoint[] {
  const end = new Date(2026, 5, 26).getTime();
  return values.map((value, i) => {
    const offset = values.length - 1 - i;
    const d = new Date(end - offset * 7 * MS_PER_DAY);
    return { period: d.toISOString().slice(0, 10), value };
  });
}

function ramp(n: number, start: number, step: number): number[] {
  return Array.from({ length: n }, (_, i) => start + i * step);
}

function flat(n: number, v: number): number[] {
  return Array.from({ length: n }, () => v);
}

function makeMetric(name: string, trend: TrendPoint[], frequency: Frequency = "monthly"): Metric {
  return {
    id: name,
    number: 0,
    name,
    unit: "%",
    latestValue: trend.length > 0 ? trend[trend.length - 1].value : 0,
    trend,
    definition: "",
    analysis: "",
    vertical: [],
    frequency,
    displayType: "line",
    isRateOfChange: false,
  };
}

function makeData(metrics: Metric[], extra?: Partial<SectionData>): SectionData {
  return {
    section: "economic",
    scopeKey: "global",
    title: "Economic",
    subtitle: "test payload",
    metrics,
    recessionBands: [],
    ...extra,
  };
}

describe("parsePeriod", () => {
  it("parses a bare year as end of that year", () => {
    const d = parsePeriod("2024");
    expect(d?.getFullYear()).toBe(2024);
    expect(d?.getMonth()).toBe(11);
  });

  it("parses YYYY-MM as the end of that month", () => {
    const d = parsePeriod("2024-05");
    expect(d?.getFullYear()).toBe(2024);
    expect(d?.getMonth()).toBe(4);
    expect(d?.getDate()).toBe(31);
  });

  it("parses ISO dates and rejects garbage", () => {
    expect(parsePeriod("2024-05-17")).not.toBeNull();
    expect(parsePeriod("Unavailable")).toBeNull();
  });
});

describe("classifySeries slope rule", () => {
  it("reads a steady monthly rise as up", () => {
    const r = classifySeries(monthlySeries(ramp(60, 0, 1)), "monthly", OPTS);
    expect(r).toMatchObject({ reading: "up" });
  });

  it("reads a steady monthly fall as down", () => {
    const r = classifySeries(monthlySeries(ramp(60, 60, -1)), "monthly", OPTS);
    expect(r).toMatchObject({ reading: "down" });
  });

  it("reads a flat series as neutral", () => {
    const r = classifySeries(monthlySeries(flat(60, 5)), "monthly", OPTS);
    expect(r).toMatchObject({ reading: "neutral" });
  });

  it("ignores non-finite values", () => {
    const values = ramp(60, 0, 1);
    const pts = monthlySeries(values);
    pts[10] = { ...pts[10], value: Number.NaN };
    pts[30] = { ...pts[30], value: Number.POSITIVE_INFINITY };
    const r = classifySeries(pts, "monthly", OPTS);
    expect(r).toMatchObject({ reading: "up" });
  });

  it("skips a series whose latest point is stale", () => {
    const r = classifySeries(monthlySeries(ramp(60, 0, 1), 2024, 5), "monthly", OPTS);
    expect(r).toMatchObject({ skip: "stale-series" });
  });

  it("classifies an annual series with year-only periods", () => {
    const points = ramp(20, 10, 1).map((value, i) => ({ period: `${2006 + i}`, value }));
    const r = classifySeries(points, "annual", OPTS);
    expect(r).toMatchObject({ reading: "up" });
  });

  it("skips an annual series that is too short", () => {
    const points = ramp(4, 10, 1).map((value, i) => ({ period: `${2022 + i}`, value }));
    const r = classifySeries(points, "annual", OPTS);
    expect(r).toMatchObject({ skip: "too-few-points" });
  });

  it("skips an empty series", () => {
    expect(classifySeries([], "monthly", OPTS)).toMatchObject({ skip: "no-series" });
  });

  it("skips a monthly series too short for true 6-month changes", () => {
    // 13 points can only pair short-span edge changes; the span guard rejects
    // them, so the band would rest on too few observations.
    const r = classifySeries(monthlySeries(ramp(13, 0, 1)), "monthly", OPTS);
    expect(r).toMatchObject({ skip: "too-few-points" });
  });

  it("classifies quarterly series dated at period start", () => {
    const points: TrendPoint[] = [];
    for (let i = 0; i < 40; i++) {
      const d = new Date(2016, 3 + i * 3, 1);
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      points.push({ period: `${d.getFullYear()}-${mm}-01`, value: 10 + i });
    }
    const r = classifySeries(points, "quarterly", OPTS);
    expect(r).toMatchObject({ reading: "up" });
  });
});

describe("level overlay for neutral-vector rows", () => {
  // 120 months: 108 at the low level, then 12 flat at the high level. The
  // 6-month slope is zero, so only the overlay can move the reading.
  const stableHigh = monthlySeries([...flat(108, 12), ...flat(12, 35)]);
  const stableLow = monthlySeries([...flat(108, 2.5), ...flat(12, -0.5)]);

  it("escalates a stably elevated VIX to up instead of calling it calm", () => {
    const name = seriesNameForRow("vix");
    expect(name).toBe("VIX");
    const result = autoFillReadings(makeData([makeMetric(name as string, stableHigh)]), OPTS);
    expect(result.readings.vix).toBe("up");
    expect(result.filled.find((f) => f.id === "vix")?.rule).toBe("level-override");
  });

  it("keeps a stably inverted yield curve neutral, the late-cycle signal", () => {
    const name = seriesNameForRow("spread_10y3m");
    expect(name).toBe("10Y - 3M Treasury Spread");
    const result = autoFillReadings(makeData([makeMetric(name as string, stableLow)]), OPTS);
    expect(result.readings.spread_10y3m).toBe("neutral");
  });

  it("escalates stably low inflation to down", () => {
    const name = seriesNameForRow("cpi");
    const result = autoFillReadings(makeData([makeMetric(name as string, stableLow)]), OPTS);
    expect(result.readings.cpi).toBe("down");
    expect(result.filled.find((f) => f.id === "cpi")?.rule).toBe("level-override");
  });

  it("keeps a featureless flat series neutral, ties sit at the 0.5 midrank", () => {
    // Every point equal: a naive percentile would read 1.0 and escalate; the
    // midrank percentile must keep this neutral.
    const name = seriesNameForRow("cpi");
    const result = autoFillReadings(makeData([makeMetric(name as string, monthlySeries(flat(120, 2.5)))]), OPTS);
    expect(result.readings.cpi).toBe("neutral");
    expect(result.filled.find((f) => f.id === "cpi")?.rule).toBe("slope");
  });
});

describe("sameReadings", () => {
  it("is true only for identical maps", () => {
    expect(sameReadings({}, {})).toBe(true);
    expect(sameReadings({ cpi: "up" }, { cpi: "up" })).toBe(true);
    expect(sameReadings({ cpi: "up" }, { cpi: "down" })).toBe(false);
    expect(sameReadings({ cpi: "up" }, {})).toBe(false);
    expect(sameReadings({}, { cpi: "up" })).toBe(false);
    expect(sameReadings({ cpi: "up" }, { vix: "up" })).toBe(false);
  });
});

/** Frozen row -> payload series map. A backend metric rename silently turns a
 *  row into a permanent skip (no fallback, by design), so this test makes any
 *  drift fail loudly instead. Null = special provider or no source. */
const EXPECTED_SERIES_BY_ROW: Record<string, string | null> = {
  spread_10y3m: "10Y - 3M Treasury Spread",
  spread_10y2y: "10Y - 2Y Treasury Spread",
  yields: "10-Year Treasury Yield",
  mortgage30: "30-Year Mortgage Rate",
  fed_model: "S&P 500 Earnings Yield",
  hy_oas: "High-Yield Credit Spread (OAS)",
  sofr_ois: "SOFR-OIS Spread (proxy)",
  vix: "VIX",
  gold_silver: "Gold/Silver Ratio",
  ci_loans: "C&I Loans YoY %",
  breakeven5y: "5-Year Breakeven Inflation",
  ppi: "PPI YoY Inflation",
  cpi: "CPI YoY Inflation",
  import_prices: "Import Price Index YoY %",
  oil: "WTI Crude Oil",
  copper: "Copper Price",
  iron_ore: "Iron Ore Price Index",
  wheat: null,
  copper_gold: "Copper/Gold Ratio",
  resi_fixed_inv: "Residential Fixed Investment ($B)",
  heavy_trucks: "Heavy Truck Sales (SAAR)",
  indpro: "Industrial Production Index",
  capacity: "Capacity Utilization",
  gdp: "Real GDP Growth",
  output_gap: "GDP Output Gap",
  aud_jpy: "AUD/JPY Exchange Rate",
  sentiment: "Consumer Sentiment (UMich)",
  retail: "Retail Sales YoY %",
  payrolls: "Total Nonfarm Payrolls",
  real_wages: "Real Avg Hourly Earnings YoY %",
  unemployment: "Unemployment Rate",
  participation: "Labor Force Participation Rate",
  savings: "Personal Savings Rate",
  m2: "M2 YoY %",
  fed_bs: "Fed Balance Sheet ($M)",
  m1: "M1 YoY %",
  tga: "Treasury General Account ($M)",
  sp_m2: "S&P 500 / M2 Normalised",
  usd_twi: "Trade-Weighted USD Index",
  usd_afe: "Broad USD Index (Adv. Economies)",
  trade_bal: "Trade Balance ($M)",
  exports: "Real Exports YoY %",
  sp500_pe: null,
  cape: "Shiller CAPE (PE10)",
  sp500: "S&P 500 YoY %",
  nonfin_debt: "Total Non-Financial Debt % of GDP",
  population: "US Population YoY %",
};

describe("series resolution", () => {
  it("resolves the two curve rows to their own series", () => {
    expect(seriesNameForRow("spread_10y3m")).toBe("10Y - 3M Treasury Spread");
    expect(seriesNameForRow("spread_10y2y")).toBe("10Y - 2Y Treasury Spread");
  });

  it("freezes the payload series every row reads, so renames fail loudly", () => {
    for (const m of METRICS) {
      expect({ id: m.id, series: seriesNameForRow(m.id) }).toEqual({
        id: m.id,
        series: EXPECTED_SERIES_BY_ROW[m.id],
      });
    }
    expect(Object.keys(EXPECTED_SERIES_BY_ROW).sort()).toEqual(METRICS.map((m) => m.id).sort());
  });

  it("reads the 10-year yield from treasuryYields, not data.metrics", () => {
    const data = makeData([], {
      treasuryYields: [makeMetric("10-Year Treasury Yield", weeklySeries(ramp(160, 2, 0.02)), "daily")],
    });
    const result = autoFillReadings(data, OPTS);
    expect(result.readings.yields).toBe("up");
  });

  it("derives the fed model row from the earnings-yield minus Treasury spread", () => {
    const periods = weeklySeries(ramp(160, 3, 0.02));
    const data = makeData([], {
      fedModel: {
        earningsYieldTrend: periods,
        treasuryYieldTrend: periods.map((p) => ({ period: p.period, value: 4 })),
        treasurySeries: "DGS1",
        snapshot: null,
      },
    });
    const result = autoFillReadings(data, OPTS);
    expect(result.readings.fed_model).toBe("up");
  });

  it("reads wheat from the commodities block", () => {
    const data = makeData([], {
      commodities: [
        {
          label: "Wheat",
          ticker: "PWHEAMTUSDM",
          source: "fred",
          unit: "$ / metric ton",
          price: monthlySeries(ramp(60, 200, 2)),
          volatility12m: [],
        },
      ],
    });
    const result = autoFillReadings(data, OPTS);
    expect(result.readings.wheat).toBe("up");
  });

  it("never falls back to the wrong-semantics level series for a YoY row", () => {
    const data = makeData([makeMetric("M2 Money Supply ($B)", monthlySeries(ramp(60, 1000, 10)))]);
    const result = autoFillReadings(data, OPTS);
    expect(result.readings.m2).toBeUndefined();
    expect(result.skipped.find((s) => s.id === "m2")?.reason).toBe("no-series");
  });

  it("marks sp500_pe as not derivable", () => {
    const result = autoFillReadings(makeData([]), OPTS);
    expect(result.skipped.find((s) => s.id === "sp500_pe")?.reason).toBe("not-derivable");
  });
});

describe("autoFillReadings coverage", () => {
  it("skips every row when there is no payload", () => {
    const result = autoFillReadings(null, OPTS);
    expect(result.filled).toHaveLength(0);
    expect(result.skipped).toHaveLength(METRICS.length);
    expect(Object.keys(result.readings)).toHaveLength(0);
  });

  it("fills every derivable row from a complete payload and partitions the rest", () => {
    const names = new Set<string>();
    for (const m of METRICS) {
      const name = seriesNameForRow(m.id);
      if (name) names.add(name);
    }
    const data = makeData(
      [...names].map((name) => makeMetric(name, monthlySeries(ramp(60, 10, 0.5)))),
      {
        treasuryYields: [makeMetric("10-Year Treasury Yield", weeklySeries(ramp(160, 2, 0.02)), "daily")],
        fedModel: {
          earningsYieldTrend: weeklySeries(ramp(160, 3, 0.02)),
          treasuryYieldTrend: weeklySeries(flat(160, 4)),
          treasurySeries: "DGS1",
          snapshot: null,
        },
        commodities: [
          {
            label: "Wheat",
            ticker: "PWHEAMTUSDM",
            source: "fred",
            unit: "$ / metric ton",
            price: monthlySeries(ramp(60, 200, 2)),
            volatility12m: [],
          },
        ],
      },
    );

    const result = autoFillReadings(data, OPTS);
    const filledIds = new Set(result.filled.map((f) => f.id));
    const skippedIds = new Set(result.skipped.map((s) => s.id));

    // Every matrix row lands in exactly one bucket.
    expect(result.filled.length + result.skipped.length).toBe(METRICS.length);
    for (const m of METRICS) {
      expect(filledIds.has(m.id) !== skippedIds.has(m.id)).toBe(true);
    }
    // Only the P/E row has no source in the payload.
    expect([...skippedIds]).toEqual(["sp500_pe"]);
    // Rising ramps everywhere: every slope-rule reading is up.
    for (const f of result.filled) {
      if (f.rule === "slope") expect(f.reading).toBe("up");
    }
  });
});

describe("inflation durability and priced-in gates", () => {
  const cpiName = seriesNameForRow("cpi") as string;
  const beName = seriesNameForRow("breakeven5y") as string;

  // Latest 6 months back at 4 after a 6-month dip to 2: the 6-month change is
  // +2 (up) but the 12-month change is 0, a spike the year does not confirm.
  const spike = monthlySeries([...flat(108, 4), ...flat(6, 2), ...flat(6, 4)]);
  // A steady ramp clears its band at both horizons.
  const durable = monthlySeries(ramp(120, 1, 0.05));

  it("downgrades a 6-month rise the 12-month change does not confirm", () => {
    const result = autoFillReadings(makeData([makeMetric(cpiName, spike)]), OPTS);
    expect(result.readings.cpi).toBe("neutral");
    expect(result.filled.find((f) => f.id === "cpi")?.rule).toBe("durability-gate");
  });

  it("downgrades durable realized inflation when breakevens are not rising", () => {
    const result = autoFillReadings(
      makeData([makeMetric(cpiName, durable), makeMetric(beName, monthlySeries(flat(120, 2.3)))]),
      OPTS,
    );
    expect(result.readings.breakeven5y).toBe("neutral");
    expect(result.readings.cpi).toBe("neutral");
    expect(result.filled.find((f) => f.id === "cpi")?.rule).toBe("priced-in-gate");
  });

  it("keeps a durable rise that breakevens confirm", () => {
    const result = autoFillReadings(
      makeData([makeMetric(cpiName, durable), makeMetric(beName, monthlySeries(ramp(120, 1.5, 0.02)))]),
      OPTS,
    );
    expect(result.readings.breakeven5y).toBe("up");
    expect(result.readings.cpi).toBe("up");
    expect(result.filled.find((f) => f.id === "cpi")?.rule).toBe("slope");
  });

  it("skips the priced-in gate when the breakeven row is not derivable", () => {
    const result = autoFillReadings(makeData([makeMetric(cpiName, durable)]), OPTS);
    expect(result.readings.breakeven5y).toBeUndefined();
    expect(result.readings.cpi).toBe("up");
  });

  it("never touches falling or neutral inflation readings", () => {
    const falling = monthlySeries(ramp(120, 8, -0.05));
    const result = autoFillReadings(makeData([makeMetric(cpiName, falling)]), OPTS);
    expect(result.readings.cpi).toBe("down");
    expect(result.filled.find((f) => f.id === "cpi")?.rule).toBe("slope");
  });
});

describe("commodity rows are informational by default", () => {
  it("gives the single-commodity price rows weight 0", () => {
    for (const id of ["oil", "copper", "iron_ore", "wheat", "import_prices"]) {
      expect(METRICS.find((m) => m.id === id)?.weight).toBe(0);
    }
  });

  it("keeps the ratio rows weighted, a ratio is a signal not a price level", () => {
    expect(METRICS.find((m) => m.id === "copper_gold")?.weight).toBeGreaterThan(0);
    expect(METRICS.find((m) => m.id === "gold_silver")?.weight).toBeGreaterThan(0);
  });

  it("scores nothing for a weight-0 row unless the user overrides it", () => {
    const zeroed = scoreMatrix({ copper: "up" });
    expect(zeroed.every((s) => s.total === 0)).toBe(true);
    const overridden = scoreMatrix({ copper: "up" }, { copper: 3 });
    expect(overridden.some((s) => s.total !== 0)).toBe(true);
  });

  it("clamps weights to 0..5", () => {
    expect(clampWeight(0)).toBe(0);
    expect(clampWeight(-3)).toBe(0);
    expect(clampWeight(7)).toBe(5);
    expect(clampWeight(Number.NaN)).toBe(1);
  });
});
