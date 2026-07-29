export function formatCurrency(value: number, opts: { compact?: boolean } = {}): string {
  const abs = Math.abs(value);
  if (opts.compact !== false) {
    if (abs >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(value);
}

export function formatPercent(value: number, fractionDigits = 3): string {
  return `${value.toFixed(fractionDigits)}%`;
}

export function formatNumber(value: number, fractionDigits = 3): string {
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  // Sub-1 values keep at least fractionDigits decimals (0.08 stays 0.080, not 0.1).
  if (abs > 0 && abs < 1) return value.toFixed(Math.max(fractionDigits, abs < 0.001 ? 4 : 3));
  return value.toFixed(fractionDigits);
}

export function pctChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function isMaterialChange(pct: number, threshold = 20): boolean {
  return Math.abs(pct) >= threshold;
}

/** Days since epoch for a "YYYY", "YYYY-MM", or "YYYY-MM-DD" period string. */
function periodToDays(period: string): number {
  const [y, m, d] = period.split("-");
  return Math.floor(Date.UTC(Number(y), m ? Number(m) - 1 : 0, d ? Number(d) : 1) / 86_400_000);
}

/**
 * Transform a level series into "percent change from a year ago", the same units
 * transform FRED offers via Edit Graph → Units. For each point it finds the
 * observation closest to exactly one year earlier (within `toleranceDays`) and
 * computes ((now − yearAgo) / |yearAgo|) × 100. Mirrors the backend
 * build_yoy_series so the toggled view matches FRED's own YoY series.
 */
export function toYoYSeries<T extends { period: string; value: number }>(
  trend: readonly T[],
  toleranceDays = 45,
): { period: string; value: number }[] {
  if (trend.length < 2) return [];
  const sorted = [...trend].sort((a, b) => a.period.localeCompare(b.period));
  const days = sorted.map((p) => periodToDays(p.period));
  const out: { period: string; value: number }[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const target = days[i] - 365;
    // Binary search for the latest prior point at or before the target date.
    let lo = 0;
    let hi = i - 1;
    let pos = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (days[mid] <= target) {
        pos = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    // Nearest neighbour is pos or pos + 1, pick whichever is closer to the target.
    let bestIdx = -1;
    let bestDiff = Infinity;
    for (const j of [pos, pos + 1]) {
      if (j < 0 || j > i - 1) continue;
      const diff = Math.abs(days[j] - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = j;
      }
    }
    if (bestIdx < 0 || bestDiff > toleranceDays) continue;
    const prev = sorted[bestIdx].value;
    if (prev === 0) continue;
    out.push({ period: sorted[i].period, value: ((sorted[i].value - prev) / Math.abs(prev)) * 100 });
  }
  return out;
}
