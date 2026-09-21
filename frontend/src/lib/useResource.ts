// One fetch hook for every read-only JSON endpoint on the connection and
// industry-structure surfaces.
//
// Before this module there were three hand-rolled copies of the same thing
// (industry structure, the group-map family, and the connections bundle), each
// with its own error class, its own 429 sentence and its own cache. A reader
// walking Sector -> Industry -> Comparative -> Company fired the focal
// value-system call up to four times on one page.
//
// What lives here, once:
//   - EndpointError and getJson, so every route reports a failure the same way.
//   - messageFor, so the rate-limit sentence exists in exactly one place.
//   - A keyed success cache with a time to live. Failures are never cached, so
//     a retry always re-requests.
//   - A single in-flight map, so components mounting together share one
//     request. A subscriber that unmounts while others are still waiting does
//     NOT abort the shared request; it simply stops listening.

import { useCallback, useEffect, useRef, useState } from "react";

import { RANKING_KEY_PREFIX } from "./peerRanking";

export const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:8000";

/** How long a successful response stays usable. */
const DEFAULT_TTL_MS = 5 * 60 * 1000;

/** Upper bound on cached responses, so a long session cannot grow without end. */
const MAX_CACHE_ENTRIES = 50;

/**
 * The ranking payloads are in a different weight class from everything else
 * here: one large industry's full table is about ten megabytes of JSON. Fifty
 * of those would be half a gigabyte held in a tab, so entries under this prefix
 * get their own, much smaller, cap.
 *
 * The prefix is imported from lib/peerRanking.ts, the module that builds every
 * ranking key (lib/stageContext/sources.ts KEYS.ranking calls the same
 * builder), so the cap and the keys cannot drift apart.
 */
const MAX_RANKING_ENTRIES = 3;

/** How long a single request may run before it is abandoned. */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * The wait for the routes that are slow when the backend's caches are cold:
 * /api/economic, /api/sector-metrics, /api/sector/{s}, /api/industry/{name},
 * the comparative routes and /api/connections. Warm they answer in under a
 * second; from a restart the first call has taken up to fifty.
 */
export const SLOW_ROUTE_TIMEOUT_MS = 90_000;

export type FetchState = "idle" | "loading" | "ready" | "error";

export class EndpointError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "EndpointError";
    this.status = status;
  }
}

/** GET one JSON document. `what` names the thing being loaded, for the message
 *  a reader sees when it fails. `timeoutMs` raises the wait for a route that is
 *  slow when cold; it is ignored when the caller supplies its own signal. */
export async function getJson<T>(
  url: string,
  what: string,
  signal?: AbortSignal,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: signal ?? AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new EndpointError(`The ${what} did not load (server said ${res.status}).`, res.status);
  }
  return (await res.json()) as T;
}

/** True for the abort this module raises when a request outran its wait. */
function isTimeout(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as { name?: unknown }).name === "TimeoutError"
  );
}

/** The one place the rate-limit and still-loading sentences are written. */
export function messageFor(
  err: unknown,
  what: string,
): { message: string; rateLimited: boolean } {
  if (isTimeout(err)) {
    return {
      message: `The ${what} did not finish loading in time. The server is still working on them, so try again in a moment.`,
      rateLimited: false,
    };
  }
  if (err instanceof EndpointError) {
    return {
      message:
        err.status === 429
          ? "The server is handling too many requests right now. Try again in a moment."
          : err.message,
      rateLimited: err.status === 429,
    };
  }
  return {
    message: `The ${what} did not load. Check your connection and try again.`,
    rateLimited: false,
  };
}

// ── The shared cache and in-flight map ─────────────────────────────────────

interface CacheEntry {
  at: number;
  value: unknown;
}

interface Inflight {
  promise: Promise<unknown>;
  controller: AbortController;
  /** How many live subscribers are still waiting on this request. */
  subscribers: number;
}

const successCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Inflight>();

function readCache<T>(key: string, ttlMs: number): { hit: true; value: T } | { hit: false } {
  const entry = successCache.get(key);
  if (!entry) return { hit: false };
  if (Date.now() - entry.at >= ttlMs) {
    successCache.delete(key);
    return { hit: false };
  }
  return { hit: true, value: entry.value as T };
}

/** Drop everything past its time to live. Called on every write, not only when
 *  a stale key happens to be read again: an entry nobody asks for twice would
 *  otherwise hold its payload for the life of the tab. */
function dropExpired(now: number): void {
  for (const [key, entry] of successCache) {
    if (now - entry.at >= DEFAULT_TTL_MS) successCache.delete(key);
  }
}

/** Evict the least recently written keys until at most `max` of the keys
 *  matching `test` remain. */
function trimTo(max: number, test: (key: string) => boolean): void {
  let over = 0;
  for (const key of successCache.keys()) if (test(key)) over += 1;
  if (over <= max) return;
  for (const key of [...successCache.keys()]) {
    if (over <= max) break;
    if (!test(key)) continue;
    successCache.delete(key);
    over -= 1;
  }
}

function writeCache(key: string, value: unknown): void {
  const now = Date.now();
  dropExpired(now);
  // Re-inserting moves the key to the end, so the first key is always the
  // least recently written one.
  successCache.delete(key);
  successCache.set(key, { at: now, value });
  trimTo(MAX_RANKING_ENTRIES, (k) => k.startsWith(RANKING_KEY_PREFIX));
  trimTo(MAX_CACHE_ENTRIES, () => true);
}

/** Read one cached entry. Exported for the tests. */
export function peekResourceCache<T>(key: string, ttlMs: number = DEFAULT_TTL_MS): T | undefined {
  const hit = readCache<T>(key, ttlMs);
  return hit.hit ? hit.value : undefined;
}

/** Forget one cached success, so the next caller re-requests it. What a retry
 *  does, whether it comes from `useResource` or from a component holding its
 *  own state. */
export function forgetResource(key: string): void {
  successCache.delete(key);
}

/** Drop everything. Exported for the tests, which need a clean slate per case. */
export function clearResourceCache(): void {
  successCache.clear();
  inFlight.clear();
}

/**
 * Start (or join) the request for `key`.
 *
 * Returns the shared promise plus a `release` the caller must invoke when it
 * stops caring. The request is aborted only when the LAST subscriber releases
 * while it is still running, so one component unmounting cannot cancel the
 * fetch another component is still waiting for.
 *
 * Exported because it is the whole of the hook that is worth testing on its
 * own: single flight, who may abort, and what reaches the cache.
 */
export function acquireResource<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
  timeoutMs?: number,
): { promise: Promise<T>; release: () => void } {
  let entry = inFlight.get(key);
  if (!entry) {
    const controller = new AbortController();
    // The wait lives here rather than inside each loader, so every route gets
    // it whether it reads the signal through getJson or through its own fetch.
    const timer =
      timeoutMs != null
        ? setTimeout(() => {
            const err = new Error("timed out");
            err.name = "TimeoutError";
            controller.abort(err);
          }, timeoutMs)
        : undefined;
    const created: Inflight = {
      controller,
      subscribers: 0,
      promise: Promise.resolve(),
    };
    created.promise = load(controller.signal).then(
      (value) => {
        clearTimeout(timer);
        inFlight.delete(key);
        writeCache(key, value);
        return value;
      },
      (err: unknown) => {
        // Failures are never cached: the next caller re-requests.
        clearTimeout(timer);
        inFlight.delete(key);
        // A loader that wraps the abort in its own error would hide the
        // still-loading sentence, so the timeout reason wins when it fired.
        const reason: unknown = controller.signal.reason;
        throw isTimeout(reason) ? reason : err;
      },
    );
    inFlight.set(key, created);
    entry = created;
  }
  const mine = entry;
  mine.subscribers += 1;

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    mine.subscribers -= 1;
    // Only abort while this exact request is still the live one. Once it has
    // settled (or been replaced) the map no longer points at it, and aborting
    // would cancel somebody else's fetch.
    if (mine.subscribers <= 0 && inFlight.get(key) === mine) {
      mine.controller.abort();
      inFlight.delete(key);
    }
  };

  return { promise: mine.promise as Promise<T>, release };
}

/**
 * The same cache and the same single flight, for a caller that is not a hook.
 *
 * There is no release: an imperative caller has no unmount to tell us about,
 * so the request it started always runs to completion.
 */
export function loadResource<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS,
  timeoutMs?: number,
): Promise<T> {
  const cached = readCache<T>(key, ttlMs);
  if (cached.hit) return Promise.resolve(cached.value);
  return acquireResource<T>(key, load, timeoutMs).promise;
}

export interface ResourceResult<T> {
  data: T | null;
  state: FetchState;
  /** One sentence naming what went wrong, when state is "error". */
  error: string | null;
  /** True when the server asked us to slow down (HTTP 429). */
  rateLimited: boolean;
  retry: () => void;
}

export interface ResourceOptions {
  /** How long a success stays usable. Defaults to five minutes. */
  ttlMs?: number;
  /** Names the thing being loaded, for the reader-facing failure sentence. */
  what?: string;
  /** How long this one route may run. Omitted means no wait is imposed here.
   *  Pass SLOW_ROUTE_TIMEOUT_MS for a route that is slow from a cold cache. */
  timeoutMs?: number;
}

/**
 * Load `key` through `load`, sharing one request and one cache with every
 * other caller using the same key. Passing a null key means "nothing to load".
 */
export function useResource<T>(
  key: string | null,
  load: (signal: AbortSignal) => Promise<T>,
  opts?: ResourceOptions,
): ResourceResult<T> {
  const ttlMs = opts?.ttlMs ?? DEFAULT_TTL_MS;
  const what = opts?.what ?? "figures";
  const timeoutMs = opts?.timeoutMs;

  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<FetchState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // `load` is written inline at every call site, so its identity changes on
  // every render. The key is what decides when to re-request.
  const loadRef = useRef(load);
  loadRef.current = load;

  const retry = useCallback(() => {
    if (key) forgetResource(key);
    setAttempt((n) => n + 1);
  }, [key]);

  useEffect(() => {
    if (!key) {
      setData(null);
      setState("idle");
      setError(null);
      setRateLimited(false);
      return;
    }

    const cached = readCache<T>(key, ttlMs);
    if (cached.hit) {
      setData(cached.value);
      setState("ready");
      setError(null);
      setRateLimited(false);
      return;
    }

    let active = true;
    setState("loading");
    setError(null);
    setRateLimited(false);

    const { promise, release } = acquireResource<T>(
      key,
      (signal) => loadRef.current(signal),
      timeoutMs,
    );
    promise.then(
      (value) => {
        if (!active) return;
        setData(value);
        setState("ready");
      },
      (err: unknown) => {
        if (!active) return;
        const { message, rateLimited: limited } = messageFor(err, what);
        setData(null);
        setError(message);
        setRateLimited(limited);
        setState("error");
      },
    );

    return () => {
      active = false;
      release();
    };
  }, [key, ttlMs, what, timeoutMs, attempt]);

  return { data, state, error, rateLimited, retry };
}
