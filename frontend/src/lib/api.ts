import type {
  IndividualBenchmarks,
  IndustryEntry,
  SectionData,
  SectorEtfData,
  SectorMetricsData,
  StoryContext,
  StoryDcfInputs,
  StoryDcfResult,
  StoryForecast,
} from "./types";
import {
  EndpointError,
  getJson,
  loadResource,
  messageFor,
  SLOW_ROUTE_TIMEOUT_MS,
} from "./useResource";
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

/** The wait for a quick route: a quote, a ticker search, the FX table. */
const QUICK_TIMEOUT_MS = 30_000;

async function fetchJson<T>(
  path: string,
  init?: RequestInit,
  timeoutMs: number = QUICK_TIMEOUT_MS,
): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      ...init,
    });
    if (!res.ok) {
      console.warn(`[api] ${path} returned ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[api] ${path} failed, falling back to mock data:`, err);
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

/** Every section endpoint is one of the routes that is slow from a cold cache,
 *  so it waits the full ninety seconds before the mock fallback is shown. */
async function fetchSection(path: string, mock: () => SectionData): Promise<SectionResult> {
  const live = await fetchJson<SectionData>(path, undefined, SLOW_ROUTE_TIMEOUT_MS);
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
  subtitle: "Simulated placeholder, live credit-cycle and banking data unavailable.",
  metrics: [],
  recessionBands: [],
};

export async function fetchCreditBanksResult(): Promise<SectionResult> {
  return fetchSection("/api/credit-banks", () => CREDIT_BANKS_MOCK);
}

/**
 * The two macro payloads WITHOUT the mock fallback, for the stage lens.
 *
 * Every other caller may fall back to simulated figures behind the banner. The
 * lens may not: it shows the owner's classification of a sector under a reading
 * the reader picked, and judging that against invented numbers would be worse
 * than showing nothing. A failure here throws, so useResource renders its
 * load-error with a retry.
 */
export async function fetchEconomicStrict(signal?: AbortSignal): Promise<SectionData> {
  return getJson<SectionData>(
    `${API_BASE}/api/economic`,
    "economic figures",
    signal,
    SLOW_ROUTE_TIMEOUT_MS,
  );
}

export async function fetchCreditBanksStrict(signal?: AbortSignal): Promise<SectionData> {
  return getJson<SectionData>(
    `${API_BASE}/api/credit-banks`,
    "credit figures",
    signal,
    SLOW_ROUTE_TIMEOUT_MS,
  );
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
 *  request itself failed, so panels can offer a retry instead of vanishing.
 *  An error carries the sentence a reader should see, which for HTTP 429 is
 *  the shared rate-limit one rather than a raw status. */
export type MetricsResult =
  | { status: "ok"; data: SectorMetricsData }
  | { status: "empty" }
  | { status: "error"; message: string; rateLimited: boolean };

/** The matrix endpoints (/api/sector-metrics, the sector and industry
 *  scorecards, the comparative routes) are all slow from a cold cache. */
async function fetchMetrics(path: string, what = "figures"): Promise<MetricsResult> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(SLOW_ROUTE_TIMEOUT_MS),
    });
    if (res.status === 404) return { status: "empty" };
    if (!res.ok) {
      console.warn(`[api] ${path} returned ${res.status}`);
      const { message, rateLimited } = messageFor(
        new EndpointError(`The ${what} did not load (server said ${res.status}).`, res.status),
        what,
      );
      return { status: "error", message, rateLimited };
    }
    return { status: "ok", data: (await res.json()) as SectorMetricsData };
  } catch (err) {
    console.warn(`[api] ${path} failed:`, err);
    const { message, rateLimited } = messageFor(err, what);
    return { status: "error", message, rateLimited };
  }
}

/**
 * The same, through the shared cache under `key`.
 *
 * For the routes the cross-stage AI block also gathers: asking under the key
 * that block uses makes the page view and the gather one request between them,
 * rather than two against one per-IP limit.
 */
async function fetchMetricsShared(
  path: string,
  what: string,
  key: string,
): Promise<MetricsResult> {
  try {
    const data = await loadResource<SectorMetricsData>(
      key,
      (signal) => getJson<SectorMetricsData>(`${API_BASE}${path}`, what, signal),
      undefined,
      SLOW_ROUTE_TIMEOUT_MS,
    );
    return { status: "ok", data };
  } catch (err) {
    if (err instanceof EndpointError && err.status === 404) return { status: "empty" };
    console.warn(`[api] ${path} failed:`, err);
    const { message, rateLimited } = messageFor(err, what);
    return { status: "error", message, rateLimited };
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
 *  base scorecard metrics + the parent sector's lens as rows, each value is
 *  that company's own number. Ticker symbols ride in the `sectors` field. */
export async function fetchComparativeCompanyMetrics(
  industry: string,
  limit?: number,
): Promise<MetricsResult> {
  const enc = encodeURIComponent(industry);
  const qs = limit ? `?limit=${limit}` : "";
  return fetchMetrics(`/api/comparative/${enc}/company-metrics${qs}`);
}

/** The Per-Ticker Value Ranking has no fetcher here: PeerRankingTable is the one
 *  component that loads it, through the shared cache in lib/useResource.ts under
 *  the key lib/peerRanking.ts builds, so the two pages showing it cannot fetch
 *  it twice. */

/** The shared-cache key one industry's scorecard is loaded under. Called by
 *  `lib/stageContext/sources.ts` KEYS.industryScorecard, for the same reason
 *  `individualCacheKey` is. */
export function industryScorecardCacheKey(industry: string): string {
  return `industry-scorecard|${industry}`;
}

/** One industry as a single aggregate column, using the exact scorecard metric
 *  set the sector page uses to compare its industries. Reused on the industry
 *  detail page via SectorMetricsPanel. */
export async function fetchIndustryScorecard(industry: string): Promise<MetricsResult> {
  const enc = encodeURIComponent(industry);
  return fetchMetricsShared(
    `/api/industry/${enc}/scorecard`,
    "industry scorecard",
    industryScorecardCacheKey(industry),
  );
}

export async function fetchIndustry(industry: string): Promise<SectionResult> {
  const enc = encodeURIComponent(industry);
  return fetchSection(`/api/industry/${enc}`, () => makeIndustryData(industry));
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
  /** The server asked us to slow down. Deliberately NOT api_down: simulated
   *  figures in place of a rate limit tell the reader the wrong thing. */
  | { status: "rate_limited"; message: string }
  | { status: "api_down"; mock: SectionData };

/**
 * The shared-cache key this company's analysis is loaded under.
 *
 * `lib/stageContext/sources.ts` KEYS.individual calls this rather than spelling
 * the key again, because the page fetch and the AI gather are only one request
 * between them while both ask under the same key.
 */
export function individualCacheKey(ticker: string): string {
  return `individual|${ticker.toUpperCase()}`;
}

/** The shared-cache key one company's strategic group is loaded under. Both
 *  `components/PeerRankingTable.tsx` and `lib/stageContext/sources.ts`
 *  KEYS.rivals call this, so the table and the AI gather are one request. */
export function rivalsCacheKey(ticker: string): string {
  return `individual-rivals|${ticker}`;
}

/** The shared-cache key one connections query is loaded under. Both
 *  `components/PeerRankingTable.tsx` and `lib/stageContext/sources.ts`
 *  KEYS.connections call this, for the same reason. */
export function connectionsCacheKey(params: ConnectionsParams): string {
  return `connections|${connectionsQuery(params)}`;
}

/** Industry + sector averages for one company's metrics, for the definition
 *  sidebar's comparison block. Null when the backend is offline (the sidebar
 *  simply omits the block; mock benchmarks would be fabricated context). */
export async function fetchIndividualBenchmarks(ticker: string): Promise<IndividualBenchmarks | null> {
  return fetchJson<IndividualBenchmarks>(
    `/api/individual/${encodeURIComponent(ticker.toUpperCase())}/benchmarks`,
  );
}

/**
 * One company's analysis.
 *
 * Routed through the shared cache so the page view and the cross-stage AI
 * gather, which asks for the same document under the same key, cost one call
 * between them. Reading a handful of companies inside a minute used to spend
 * two calls each against the route's per-IP limit, and the 429 that followed
 * reached the reader as the simulated-data banner.
 */
export async function fetchIndividual(ticker: string): Promise<IndividualResult> {
  const t = ticker.toUpperCase();
  const enc = encodeURIComponent(t);
  const what = `${t} company analysis`;
  try {
    const data = await loadResource<SectionData>(
      individualCacheKey(t),
      (signal) => getJson<SectionData>(`${API_BASE}/api/individual/${enc}`, what, signal),
      undefined,
      SLOW_ROUTE_TIMEOUT_MS,
    );
    return { status: "ok", data };
  } catch (err) {
    // Backend reachable, but the ticker isn't in financials.db.
    if (err instanceof EndpointError && err.status === 404) {
      return { status: "not_found", ticker: t };
    }
    if (err instanceof EndpointError && err.status === 429) {
      console.warn(`[api] /api/individual/${t} was rate limited`);
      return { status: "rate_limited", message: messageFor(err, what).message };
    }
    console.warn(`[api] /api/individual/${t} failed, using mock`, err);
    return { status: "api_down", mock: makeIndividualData(t) };
  }
}

/**
 * The shared-cache key one story valuation is loaded under. StorySection and
 * ForecastSection both build it from the ROUTE ticker, so one request serves
 * both. The body is part of the key: every story is a different valuation.
 */
export function storyDcfKey(key: string, body: StoryDcfInputs): string {
  return "story-dcf|" + key.toUpperCase() + "|" + JSON.stringify(body);
}

/** The figures the story conversion reads: the company's history, its
 *  industry's ranges, the model's own numbers and the data block the AI's
 *  proofs are checked against. */
export async function fetchStoryContext(ticker: string, signal?: AbortSignal): Promise<StoryContext> {
  const enc = encodeURIComponent(ticker.toUpperCase());
  return getJson<StoryContext>(
    `${API_BASE}/api/individual/${enc}/story-context`,
    "story figures",
    signal,
    SLOW_ROUTE_TIMEOUT_MS,
  );
}

/** The FCFF valuation re-run on the story's numbers (null keeps the model's). */
export async function postStoryDcf(
  ticker: string,
  body: StoryDcfInputs,
  signal?: AbortSignal,
): Promise<StoryDcfResult> {
  const enc = encodeURIComponent(ticker.toUpperCase());
  const res = await fetch(`${API_BASE}/api/individual/${enc}/story-dcf`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: signal ?? AbortSignal.timeout(SLOW_ROUTE_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new EndpointError(`The story valuation did not load (server said ${res.status}).`, res.status);
  }
  return (await res.json()) as StoryDcfResult;
}

export function isStoryForecast(r: StoryDcfResult): r is StoryForecast {
  return "storyChecks" in r;
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

export interface ConnectionsParams {
  sector?: string;
  industry?: string;
  ticker?: string;
  /** "economy" asks for just the economy and credit blocks. */
  scope?: string;
}

export function connectionsQuery(params: ConnectionsParams): string {
  const qs = new URLSearchParams();
  if (params.scope) qs.set("scope", params.scope);
  if (params.sector) qs.set("sector", params.sector);
  if (params.industry) qs.set("industry", params.industry);
  if (params.ticker) qs.set("ticker", params.ticker);
  return qs.toString();
}
