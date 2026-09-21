// Fetching for the cross-stage block.
//
// Three rules hold everywhere in this file.
//
//  * One shared cache. Every call goes through loadResource under the key the
//    page that owns that endpoint already uses, so a reader who has looked at
//    the Industry page pays nothing for its structure payload here.
//  * Ninety seconds. Several of these calls take most of a minute cold, and
//    the shared getJson gives up after twenty, so a longer signal is supplied.
//  * No mock data and no partial failure. Every call either yields the live
//    payload or is recorded as not loaded, and one failure never stops the
//    rest. The two strict macro fetchers are used precisely because the
//    ordinary ones fall back to simulated figures.
//
// Three more rules, added after a gather that failed silently.
//
//  * The Not-loaded line says what went wrong. "Not loaded: the Semiconductors
//    industry figures" told the reader nothing; "(the server answered 429)"
//    tells them to wait a moment and click again.
//  * One retry, and only for a failure a retry can fix: 429, a 5xx and a
//    network error. A 404 is not retried, and neither is an abort.
//  * Six calls at a time. nginx meters the analysis host at 120 a minute with
//    a burst of twenty, and the page the reader is looking at is making its
//    own calls while the gather runs.

import {
  connectionsCacheKey,
  connectionsQuery,
  fetchCreditBanksStrict,
  fetchEconomicStrict,
  individualCacheKey,
  industryScorecardCacheKey,
  rivalsCacheKey,
} from "../api";
import type { ConnectionsData } from "../connectionsTypes";
import { groupMapCacheKey, valueSystemCacheKey } from "../groupMapApi";
import type { GroupMapData, ProfitPoolData, ValueSystemData } from "../groupMapApi";
import { structureCacheKey } from "../industryStructureApi";
import type { IndustryStructure } from "../industryStructureApi";
import { rankingCacheKey } from "../peerRanking";
import { SECTORS } from "../sectorRotation";
import type { SectionData, SectorMetricsData } from "../types";
import {
  API_BASE,
  EndpointError,
  getJson,
  loadResource,
  peekResourceCache,
} from "../useResource";
import type {
  RivalsData,
  Source,
  SpreadsData,
  StageKind,
  StageSubject,
} from "./types";
import { loaded, notLoaded } from "./types";

/**
 * How long one call may run. The cold /api/sector/{s} call measured 52 s.
 *
 * It is also the gatherer's own cap, in `components/QuestionField.tsx`. The
 * two used to be sixty and ninety, so the gather always gave up first, told
 * the reader the figures had not loaded, and left every request running.
 */
export const REQUEST_TIMEOUT_MS = 90_000;

/** How long a success stays usable, matching the shared cache's own default. */
const TTL_MS = 5 * 60 * 1000;

/** How many of the gather's calls may be in flight at once. */
export const GATHER_CONCURRENCY = 6;

/** How long to wait before the one retry. */
const RETRY_DELAY_MS = 600;

/** A source the stage never asks for. It prints nothing. */
export function notRequested<T>(): Source<T> {
  return { ok: false, what: "" };
}

// ── Six at a time ─────────────────────────────────────────────────────────

let running = 0;
const queue: (() => void)[] = [];

function releaseSlot(): void {
  running -= 1;
  const next = queue.shift();
  if (next) {
    running += 1;
    next();
  }
}

/** Run `fn` when a slot is free. Exported for the tests. */
export async function gated<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= GATHER_CONCURRENCY) {
    await new Promise<void>((resolve) => queue.push(resolve));
  } else {
    running += 1;
  }
  try {
    return await fn();
  } finally {
    releaseSlot();
  }
}

// ── What went wrong, in words, and whether it is worth trying again ───────

function isAbort(err: unknown): boolean {
  const name = (err as { name?: unknown } | null)?.name;
  return name === "AbortError" || name === "TimeoutError";
}

/** The parenthesis the Not-loaded line carries, or "" when there is nothing
 *  useful to say. */
export function failureNote(err: unknown): string {
  if (isAbort(err)) return " (it did not answer in time)";
  if (err instanceof EndpointError) return ` (the server answered ${err.status})`;
  return " (the request did not reach the server)";
}

/** True for a failure a second attempt could plausibly fix. */
export function worthRetrying(err: unknown): boolean {
  if (isAbort(err)) return false;
  if (err instanceof EndpointError) return err.status === 429 || err.status >= 500;
  return true; // a network error
}

/** GET one JSON document with the longer wait these endpoints need. */
export async function get<T>(path: string, what: string, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const relay = () => controller.abort();
  signal?.addEventListener("abort", relay);
  try {
    return await getJson<T>(`${API_BASE}${path}`, what, controller.signal);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", relay);
  }
}

export interface SourceOptions {
  /** The gather's own signal. When it aborts, the request stops rather than
   *  running on after the reader has been told the figures did not load. */
  signal?: AbortSignal;
}

/**
 * Load one source, turning any failure into a recorded absence that says what
 * went wrong.
 *
 * `timeoutMs` reaches `loadResource`, which is the only place that can put a
 * deadline on a loader that does not read the signal it is handed: the two
 * strict macro fetchers pass their signal straight into `getJson`, which then
 * uses it INSTEAD of its own timeout, so without this a hung /api/economic
 * left its in-flight entry in the shared map forever and every later gather in
 * that tab joined the same dead promise.
 */
export function source<T>(
  key: string,
  what: string,
  load: (signal: AbortSignal) => Promise<T>,
  opts: SourceOptions = {},
): Promise<Source<T>> {
  const once = () => loadResource<T>(key, load, TTL_MS, REQUEST_TIMEOUT_MS);
  const attempt = async (): Promise<Source<T>> => {
    try {
      return loaded(await gated(once));
    } catch (err) {
      if (!worthRetrying(err) || opts.signal?.aborted) {
        return notLoaded<T>(`${what}${failureNote(err)}`);
      }
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      if (opts.signal?.aborted) return notLoaded<T>(`${what} (the gather gave up first)`);
      try {
        return loaded(await gated(once));
      } catch (second) {
        return notLoaded<T>(`${what}${failureNote(second)}`);
      }
    }
  };
  return attempt();
}

const enc = encodeURIComponent;

// ── Cache keys, matching the pages that already own these endpoints ────────

export const KEYS = {
  economic: () => "economic",
  credit: () => "credit-banks",
  sectorMatrix: () => "sector-metrics",
  sectorDetail: (s: string) => `sector|${s}`,
  profitPool: (s: string) => `profit-pool|${s}`,
  industryMatrix: (s: string) => `industry-metrics|${s}`,
  industryDetail: (i: string) => `industry|${i}`,
  /** Shared with lib/api.ts fetchIndustryScorecard, so the industry page's own
   *  fetch and this gather are one request. */
  industryScorecard: (i: string) => industryScorecardCacheKey(i),
  /** The key useIndustryStructure builds, so the Industry page's own fetch and
   *  this gather are one request. */
  structure: (i: string) => structureCacheKey(i),
  /** useGroupMap's key with no axis or limit override. */
  groupMap: (i: string) => groupMapCacheKey(i),
  /** useValueSystem's key. With no picks it is the focal call every section of
   *  the Industry page shares; with the reader's picks it is the same key that
   *  page's Value System section builds, so the two are one request. */
  valueSystem: (i: string, supplier = "", buyer = "") => valueSystemCacheKey(i, supplier, buyer),
  /** The FULL ranking, the one the peer table loads (lib/peerRanking.ts
   *  rankingCacheKey with no filter set). */
  ranking: (i: string) => rankingCacheKey(i),
  /** The same ranking without the per-cell histories, which this block never
   *  reads. Its own key: the full payload must stay available under the key
   *  above, because the table's click-to-chart needs those histories. */
  rankingLight: (i: string) => `${rankingCacheKey(i)}|light`,
  /** Shared with lib/api.ts fetchIndividual, so the company page's own fetch
   *  and this gather are one request. */
  individual: (t: string) => individualCacheKey(t),
  /** Shared with components/PeerRankingTable.tsx, so the table's own fetch and
   *  this gather are one request. */
  rivals: (t: string) => rivalsCacheKey(t),
  /** Its own key: nothing else in the app loads this endpoint through the
   *  shared cache, so there is none to share. */
  spreads: (t: string) => `individual-spreads|${t}`,
  connections: (params: { sector?: string; industry?: string; ticker?: string }) =>
    connectionsCacheKey(params),
} as const;

// ── One loader per endpoint ───────────────────────────────────────────────

export const load = {
  economic: (g?: AbortSignal) =>
    source(KEYS.economic(), "the economic series", (s) => fetchEconomicStrict(s), { signal: g }),
  credit: (g?: AbortSignal) =>
    source(KEYS.credit(), "the credit and banking series", (s) => fetchCreditBanksStrict(s), {
      signal: g,
    }),
  sectorMatrix: (g?: AbortSignal) =>
    source<SectorMetricsData>(
      KEYS.sectorMatrix(),
      "the eleven-sector matrix",
      (s) => get("/api/sector-metrics", "the eleven-sector matrix", s),
      { signal: g },
    ),
  sectorDetail: (sector: string, g?: AbortSignal) =>
    source<SectionData>(
      KEYS.sectorDetail(sector),
      `the ${sector} sector figures`,
      (s) => get(`/api/sector/${enc(sector)}`, `the ${sector} sector figures`, s),
      { signal: g },
    ),
  profitPool: (sector: string, g?: AbortSignal) =>
    source<ProfitPoolData>(
      KEYS.profitPool(sector),
      `the ${sector} profit pool`,
      (s) => get(`/api/sector/${enc(sector)}/profit-pool`, `the ${sector} profit pool`, s),
      { signal: g },
    ),
  industryMatrix: (sector: string, g?: AbortSignal) =>
    source<SectorMetricsData>(
      KEYS.industryMatrix(sector),
      `the ${sector} industry matrix`,
      (s) => get(`/api/sector/${enc(sector)}/industry-metrics`, `the ${sector} industry matrix`, s),
      { signal: g },
    ),
  industryDetail: (industry: string, g?: AbortSignal) =>
    source<SectionData>(
      KEYS.industryDetail(industry),
      `the ${industry} industry figures`,
      (s) => get(`/api/industry/${enc(industry)}`, `the ${industry} industry figures`, s),
      { signal: g },
    ),
  industryScorecard: (industry: string, g?: AbortSignal) =>
    source<SectorMetricsData>(
      KEYS.industryScorecard(industry),
      `the ${industry} scorecard`,
      (s) => get(`/api/industry/${enc(industry)}/scorecard`, `the ${industry} scorecard`, s),
      { signal: g },
    ),
  structure: (industry: string, g?: AbortSignal) =>
    source<IndustryStructure>(
      KEYS.structure(industry),
      `the ${industry} structure figures`,
      (s) => get(`/api/industry/${enc(industry)}/structure`, `the ${industry} structure figures`, s),
      { signal: g },
    ),
  groupMap: (industry: string, g?: AbortSignal) =>
    source<GroupMapData>(
      KEYS.groupMap(industry),
      `the ${industry} strategic group map`,
      (s) => get(`/api/industry/${enc(industry)}/group-map`, `the ${industry} strategic group map`, s),
      { signal: g },
    ),
  /**
   * The value system.
   *
   * With no picks this is the focal call the Industry page already shares. With
   * the reader's own supplier and buyer, it is the call that page's Value
   * System section makes, under the same key, so the supplier and buyer blocks
   * the deck asks about actually carry figures instead of being absent.
   */
  valueSystem: (
    industry: string,
    picks: { supplier?: string; buyer?: string } = {},
    g?: AbortSignal,
  ) => {
    const supplier = picks.supplier ?? "";
    const buyer = picks.buyer ?? "";
    const params = new URLSearchParams();
    if (supplier) params.set("supplier", supplier);
    if (buyer) params.set("buyer", buyer);
    const qs = params.toString();
    return source<ValueSystemData>(
      KEYS.valueSystem(industry, supplier, buyer),
      `the ${industry} value system`,
      (s) =>
        get(
          `/api/industry/${enc(industry)}/value-system${qs ? `?${qs}` : ""}`,
          `the ${industry} value system`,
          s,
        ),
      { signal: g },
    );
  },
  /**
   * The peer ranking, WITHOUT the per-cell histories.
   *
   * This block prints current values only: nothing under lib/stageContext ever
   * reads a cell's `_history`, and those arrays are most of the document. The
   * Semiconductors ranking measures 10,096,340 bytes whole and 834,013 with
   * `?history=0`, so asking for the light form saves about nine megabytes on
   * one click. When the table on the page has already paid for the full
   * payload, that one is used instead and nothing is downloaded at all.
   */
  ranking: (industry: string, g?: AbortSignal) => {
    const what = `the ${industry} peer ranking`;
    const full = peekResourceCache<SectorMetricsData>(KEYS.ranking(industry));
    if (full) return Promise.resolve(loaded(full));
    return source<SectorMetricsData>(
      KEYS.rankingLight(industry),
      what,
      (s) => get(`/api/comparative/${enc(industry)}/ranking?history=0`, what, s),
      { signal: g },
    );
  },
  individual: (ticker: string, g?: AbortSignal) =>
    source<SectionData>(
      KEYS.individual(ticker),
      `the ${ticker} company analysis`,
      (s) => get(`/api/individual/${enc(ticker)}`, `the ${ticker} company analysis`, s),
      { signal: g },
    ),
  rivals: (ticker: string, g?: AbortSignal) =>
    source<RivalsData>(
      KEYS.rivals(ticker),
      `the ${ticker} similarly structured companies`,
      (s) =>
        get(
          `/api/individual/${enc(ticker)}/rivals`,
          `the ${ticker} similarly structured companies`,
          s,
        ),
      { signal: g },
    ),
  /**
   * The company against its industry median, its strategic group's median and
   * the two weighted averages, in display units.
   *
   * It is the slowest call in the bundle from a cold cache, 9 to 34 seconds,
   * so it rides the same ninety second deadline and the same abort as the
   * rest and degrades to one Not-loaded line.
   */
  spreads: (ticker: string, g?: AbortSignal) =>
    source<SpreadsData>(
      KEYS.spreads(ticker),
      `the ${ticker} benchmark spreads`,
      (s) => get(`/api/individual/${enc(ticker)}/spreads`, `the ${ticker} benchmark spreads`, s),
      { signal: g },
    ),
  connections: (
    params: { sector?: string; industry?: string; ticker?: string },
    what: string,
    g?: AbortSignal,
  ) =>
    source<ConnectionsData>(
      KEYS.connections(params),
      what,
      (s) => get(`/api/connections?${connectionsQuery(params)}`, what, s),
      { signal: g },
    ),
};

/** The eleven sectors' financing blocks, for the Credit stage. Any sector that
 *  fails is simply absent from the result. */
export async function loadSectorFinancing(
  g?: AbortSignal,
): Promise<{ sector: string; data: ConnectionsData }[]> {
  const results = await Promise.all(
    SECTORS.map(async (sector) => {
      const s = await load.connections({ sector }, `the ${sector} financing figures`, g);
      return s.ok ? { sector: sector as string, data: s.value } : null;
    }),
  );
  return results.filter((r): r is { sector: string; data: ConnectionsData } => r !== null);
}

/**
 * Fill in the names the caller did not supply. A company page knows its
 * ticker; the sector and industry come back with the connections bundle, which
 * every later call reuses from the cache.
 */
export async function resolveSubject(
  stage: StageKind,
  subject: StageSubject,
  g?: AbortSignal,
): Promise<{ sector: string | null; industry: string | null; ticker: string | null; companyName: string | null }> {
  const ticker = subject.ticker ? subject.ticker.toUpperCase() : null;
  let sector = subject.sector ?? null;
  let industry = subject.industry ?? null;
  let companyName: string | null = null;

  if (stage === "company" && ticker && (!sector || !industry)) {
    const c = await load.connections({ ticker }, `the ${ticker} connections bundle`, g);
    if (c.ok) {
      sector = sector ?? c.value.company?.sector ?? c.value.sector?.name ?? null;
      industry = industry ?? c.value.company?.industry ?? c.value.industry?.name ?? null;
      companyName = c.value.company?.name ?? null;
    }
  } else if ((stage === "industry" || stage === "comparative") && industry && !sector) {
    const c = await load.connections({ industry }, `the ${industry} connections bundle`, g);
    if (c.ok) sector = c.value.industry?.sector ?? c.value.sector?.name ?? null;
  }

  return { sector, industry, ticker, companyName };
}
