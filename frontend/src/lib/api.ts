import type { IndustryEntry, SectionData, SectorEtfData, SectorMetricsData, StrategicGroups } from "./types";
import {
  ECONOMIC_DATA,
  INDUSTRIES,
  SECTORS,
  makeComparativeData,
  makeIndividualData,
  makeIndustryData,
  makeSectorData,
} from "./mockData";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:8000";

export interface DailyUpdateState {
  running: boolean;
  started_at: string | null;
  finished_at: string | null;
  result: { exit: number; stdout_tail: string; stderr_tail: string } | null;
  error: string | null;
}

export interface TickerHit {
  ticker: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { Accept: "application/json" },
      // First /api/economic call hits FRED ~12s; allow 30s before falling back.
      signal: AbortSignal.timeout(30000),
      ...init,
    });
    if (!res.ok) {
      console.warn(`[api] ${path} returned ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[api] ${path} failed — falling back to mock data:`, err);
    return null;
  }
}

export interface ApiHealth {
  ok: boolean;
  db_exists: boolean;
  db_path?: string;
  min_year?: number;
  max_year?: number;
  cache_entries?: number;
}

export async function fetchApiHealth(): Promise<ApiHealth | null> {
  try {
    const res = await fetch(`${API_BASE}/api/health`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    return (await res.json()) as ApiHealth;
  } catch {
    return null;
  }
}

/** SectionData plus whether it came from the live backend or the offline mock
 *  fallback, so pages can show a "simulated data" banner instead of passing
 *  mock figures off as real. */
export interface SectionResult {
  data: SectionData;
  isLive: boolean;
}

async function fetchSection(path: string, mock: () => SectionData): Promise<SectionResult> {
  const live = await fetchJson<SectionData>(path);
  return live ? { data: live, isLive: true } : { data: mock(), isLive: false };
}

export async function fetchEconomicResult(): Promise<SectionResult> {
  return fetchSection("/api/economic", () => ECONOMIC_DATA);
}

/** Legacy shape for callers that don't surface liveness (SectorRotation's
 *  sidebar charts). Page views should use fetchEconomicResult instead. */
export async function fetchEconomic(): Promise<SectionData> {
  return (await fetchEconomicResult()).data;
}

/** Offline mock for the Credit & Banking page. The page renders its dropdowns
 *  from CREDIT_METRIC_DEFS and attaches live charts by metric name, so an empty
 *  metrics array still shows every definition (charts read "data source
 *  pending") behind the simulated-data banner. */
const CREDIT_BANKS_MOCK: SectionData = {
  section: "credit",
  scopeKey: "global",
  title: "Credit & Banking",
  subtitle: "Simulated placeholder — live credit-cycle and banking data unavailable.",
  metrics: [],
  recessionBands: [],
};

export async function fetchCreditBanksResult(): Promise<SectionResult> {
  return fetchSection("/api/credit-banks", () => CREDIT_BANKS_MOCK);
}

export async function fetchIndustries(): Promise<IndustryEntry[]> {
  const live = await fetchJson<IndustryEntry[]>("/api/industries");
  return live ?? INDUSTRIES;
}

export async function fetchSectors(): Promise<IndustryEntry[]> {
  const live = await fetchJson<IndustryEntry[]>("/api/sectors");
  return live ?? SECTORS;
}

/** Discriminated result for the scorecard/ranking panels: "empty" means the
 *  backend answered but has nothing for this scope (404), "error" means the
 *  request itself failed — so panels can offer a retry instead of vanishing. */
export type MetricsResult =
  | { status: "ok"; data: SectorMetricsData }
  | { status: "empty" }
  | { status: "error" };

async function fetchMetrics(path: string): Promise<MetricsResult> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30000),
    });
    if (res.status === 404) return { status: "empty" };
    if (!res.ok) {
      console.warn(`[api] ${path} returned ${res.status}`);
      return { status: "error" };
    }
    return { status: "ok", data: (await res.json()) as SectorMetricsData };
  } catch (err) {
    console.warn(`[api] ${path} failed:`, err);
    return { status: "error" };
  }
}

/** Current-year pooled fundamentals for every sector (matrix + per-sector). */
export async function fetchSectorMetricsResult(): Promise<MetricsResult> {
  return fetchMetrics("/api/sector-metrics");
}

/** Legacy nullable shape for IndustryPicker (empty/error collapse to null). */
export async function fetchSectorMetrics(): Promise<SectorMetricsData | null> {
  const r = await fetchSectorMetricsResult();
  return r.status === "ok" ? r.data : null;
}

/** Same matrix one level down: industries within one sector, plus that
 *  sector's lens metrics. Column names ride in the `sectors` field. */
export async function fetchSectorIndustryMetrics(sector: string): Promise<MetricsResult> {
  const enc = encodeURIComponent(sector);
  return fetchMetrics(`/api/sector/${enc}/industry-metrics`);
}

/** The scorecard at company level: the industry's top companies as columns,
 *  base scorecard metrics + the parent sector's lens as rows — each value is
 *  that company's own number. Ticker symbols ride in the `sectors` field. */
export async function fetchComparativeCompanyMetrics(
  industry: string,
  limit?: number,
): Promise<MetricsResult> {
  const enc = encodeURIComponent(industry);
  const qs = limit ? `?limit=${limit}` : "";
  return fetchMetrics(`/api/comparative/${enc}/company-metrics${qs}`);
}

/** The Per-Ticker Value Ranking, shaped like the scorecard (SectorMetricsData)
 *  plus leading Rank/Score/MoS/DCF columns. `developed` restricts to a developed-
 *  markets currency allowlist; `minMcap` (in $B) drops companies below the floor. */
export async function fetchComparativeRanking(
  industry: string,
  opts?: { developed?: boolean; minMcap?: number | null },
): Promise<MetricsResult> {
  const enc = encodeURIComponent(industry);
  const params = new URLSearchParams();
  if (opts?.developed) params.set("developed", "true");
  if (opts?.minMcap != null && opts.minMcap > 0) params.set("min_mcap", String(opts.minMcap));
  const qs = params.toString();
  return fetchMetrics(`/api/comparative/${enc}/ranking${qs ? `?${qs}` : ""}`);
}

/** One industry as a single aggregate column, using the exact scorecard metric
 *  set the sector page uses to compare its industries. Reused on the industry
 *  detail page via SectorMetricsPanel. */
export async function fetchIndustryScorecard(industry: string): Promise<MetricsResult> {
  const enc = encodeURIComponent(industry);
  return fetchMetrics(`/api/industry/${enc}/scorecard`);
}

export async function fetchIndustry(industry: string): Promise<SectionResult> {
  const enc = encodeURIComponent(industry);
  return fetchSection(`/api/industry/${enc}`, () => makeIndustryData(industry));
}

/** Porter strategic-group map for an industry (peer-median quadrants + badges).
 *  Returns null when the API is down or the industry lacks enough peers. */
export async function fetchStrategicGroups(industry: string): Promise<StrategicGroups | null> {
  const enc = encodeURIComponent(industry);
  return await fetchJson<StrategicGroups>(`/api/industry/${enc}/strategic-groups`);
}

export async function fetchSector(sector: string): Promise<SectionResult> {
  const enc = encodeURIComponent(sector);
  return fetchSection(`/api/sector/${enc}`, () => makeSectorData(sector));
}

/** Yahoo Finance price history for a sector's SPDR index fund (XLK, XLF, ...).
 *  Backed by a 15-minute server-side cache. Returns null if the API is down. */
export async function fetchSectorEtf(sector: string): Promise<SectorEtfData | null> {
  const enc = encodeURIComponent(sector);
  return await fetchJson<SectorEtfData>(`/api/sector-etf/${enc}`);
}

export async function fetchComparative(industry: string): Promise<SectionResult> {
  const enc = encodeURIComponent(industry);
  return fetchSection(`/api/comparative/${enc}`, () => makeComparativeData(industry));
}

export type IndividualResult =
  | { status: "ok"; data: SectionData }
  | { status: "not_found"; ticker: string }
  | { status: "api_down"; mock: SectionData };

export async function fetchIndividual(ticker: string): Promise<IndividualResult> {
  const t = ticker.toUpperCase();
  const enc = encodeURIComponent(t);
  try {
    const res = await fetch(`${API_BASE}/api/individual/${enc}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30000),
    });
    if (res.status === 404) {
      // Backend reachable, but ticker isn't in financials.db
      return { status: "not_found", ticker: t };
    }
    if (!res.ok) {
      console.warn(`[api] /api/individual/${t} returned ${res.status} — using mock`);
      return { status: "api_down", mock: makeIndividualData(t) };
    }
    const data = (await res.json()) as SectionData;
    return { status: "ok", data };
  } catch (err) {
    console.warn(`[api] /api/individual/${t} fetch failed — using mock`, err);
    return { status: "api_down", mock: makeIndividualData(t) };
  }
}

/** Returns true only if the ticker exists in financials.db's `tickers` table.
 *  Returns null if the API is unreachable (so the caller can decide what to do). */
export async function tickerExists(ticker: string): Promise<boolean | null> {
  const t = ticker.trim().toUpperCase();
  if (!t) return false;
  const hits = await fetchJson<TickerHit[]>(`/api/tickers/search?q=${encodeURIComponent(t)}&limit=50`);
  if (hits === null) return null; // API down
  return hits.some((h) => h.ticker.toUpperCase() === t);
}

export interface LiveQuote {
  ticker: string;
  price: number | null;
  previousClose: number | null;
  dayChange: number | null;
  dayChangePct: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  yearHigh: number | null;
  yearLow: number | null;
  marketCap: number | null;
  volume: number | null;
  currency: string;
  exchange: string | null;
  fetchedAt: string;
  cacheTtlSeconds: number;
}

export type QuoteResult =
  | { status: "ok"; quote: LiveQuote }
  | { status: "not_found"; ticker: string }
  | { status: "error"; message: string };

export async function fetchQuote(ticker: string): Promise<QuoteResult> {
  const t = ticker.toUpperCase();
  const enc = encodeURIComponent(t);
  try {
    const res = await fetch(`${API_BASE}/api/quote/${enc}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30000),
    });
    if (res.status === 404) return { status: "not_found", ticker: t };
    if (!res.ok) {
      // Surface FastAPI's HTTPException `detail` when present (mirrors postAi).
      let detail = "";
      try {
        const body = (await res.json()) as { detail?: unknown };
        if (typeof body.detail === "string") detail = body.detail;
      } catch {
        // body was not JSON
      }
      return { status: "error", message: detail || `HTTP ${res.status}` };
    }
    return { status: "ok", quote: (await res.json()) as LiveQuote };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "fetch failed" };
  }
}

export async function searchTickers(query: string): Promise<TickerHit[]> {
  if (!query.trim()) return [];
  const enc = encodeURIComponent(query.trim());
  const live = await fetchJson<TickerHit[]>(`/api/tickers/search?q=${enc}&limit=8`);
  return live ?? [];
}

export interface FxRates {
  /** currency code → USD per 1 unit of that currency (USD is always 1.0). */
  rates: Record<string, number>;
  asof: string | null;
}

/** FX table for the simulator to value a multi-currency portfolio in USD.
 *  Falls back to a USD-only map when the backend is offline. */
export async function fetchFxRates(): Promise<FxRates> {
  const live = await fetchJson<FxRates>("/api/fx-rates");
  return live ?? { rates: { USD: 1.0 }, asof: null };
}

/** Batch quotes for the held tickers in one round-trip. Unknown/failed tickers
 *  are simply absent from the result, so the caller maps by ticker and treats a
 *  miss as "unpriced". Returns an empty list when the backend is offline. */
export async function fetchQuotes(tickers: string[]): Promise<LiveQuote[]> {
  const clean = Array.from(new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean)));
  if (clean.length === 0) return [];
  const enc = encodeURIComponent(clean.join(","));
  const live = await fetchJson<LiveQuote[]>(`/api/quotes?tickers=${enc}`);
  return live ?? [];
}

export async function triggerDailyUpdate(tickers: string[] = []): Promise<{ status: string } | null> {
  const qs = tickers.length > 0 ? "?" + tickers.map((t) => `ticker=${encodeURIComponent(t)}`).join("&") : "";
  return await fetchJson<{ status: string }>(`/api/daily-update${qs}`, { method: "POST" });
}

export async function getDailyUpdateState(): Promise<DailyUpdateState | null> {
  return await fetchJson<DailyUpdateState>("/api/daily-update");
}
