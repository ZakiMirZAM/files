// Test helper shared by the rule files' tests: a SeriesFacts with neutral
// defaults, so a test states only the figures its rule reads.

import type { SeriesFacts } from "./types";

export function makeFacts(overrides: Partial<SeriesFacts> & { latest: number }): SeriesFacts {
  return {
    latestPeriod: "2026-01-01",
    previous: null,
    yearAgo: null,
    yoyChangeAbs: null,
    yoyChangePct: null,
    trend: null,
    trendChange: null,
    percentile10y: null,
    consecutiveNegative: 0,
    points: [],
    ...overrides,
  };
}
