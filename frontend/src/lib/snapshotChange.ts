/** How a lookback snapshot reads: a point change for a rate, a compound annual
 *  rate for a level, or the cumulative change when a compound rate cannot be
 *  taken (a zero or negative value at either end). */
export type SnapshotKind = "pp" | "cagr" | "cumulative";

export interface SnapshotChange {
  years: number;
  change: number;
  kind: SnapshotKind;
}

export function snapshotChange(
  latest: number,
  prev: number,
  years: number,
  isRateOfChange: boolean,
): SnapshotChange | null {
  if (!Number.isFinite(latest) || !Number.isFinite(prev) || years <= 0) return null;
  if (isRateOfChange) return { years, change: latest - prev, kind: "pp" };
  if (latest > 0 && prev > 0) {
    return { years, change: (Math.pow(latest / prev, 1 / years) - 1) * 100, kind: "cagr" };
  }
  if (prev === 0) return null;
  return { years, change: ((latest - prev) / Math.abs(prev)) * 100, kind: "cumulative" };
}
