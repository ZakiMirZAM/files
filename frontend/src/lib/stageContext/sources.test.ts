// What the gather does when a call is slow, refused, or simply never answers.
//
// Every case here was a real failure mode of the block: a hung /api/economic
// that poisoned the tab, a 429 that erased a whole section behind one word,
// and a wave of a dozen calls fired at a server metered on a burst of twenty.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GATHER_CONCURRENCY,
  REQUEST_TIMEOUT_MS,
  failureNote,
  gated,
  source,
  worthRetrying,
} from "./sources";
import { clearResourceCache, EndpointError, peekResourceCache } from "../useResource";

beforeEach(() => {
  clearResourceCache();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a call that never answers", () => {
  it("gives up on its own deadline and leaves nothing behind", async () => {
    vi.useFakeTimers();
    let settled = false;
    // The two strict macro fetchers do exactly this: they take the signal they
    // are handed and pass it into getJson, which then uses it INSTEAD of its
    // own timeout. Nothing but loadResource's deadline can stop them.
    const hang = (signal: AbortSignal) =>
      new Promise<string>((_, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")));
      });

    const first = source("hung", "the economic series", hang).then((r) => {
      settled = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
    expect(settled, "gave up early").toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    const result = await first;
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.what).toContain("the economic series");

    // And the in-flight entry is gone: the next gather in this tab starts a
    // fresh request rather than joining a promise that will never settle.
    let started = 0;
    const second = source("hung", "the economic series", () => {
      started += 1;
      return Promise.resolve("fresh");
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toBe(1);
    expect((await second).ok).toBe(true);
    expect(peekResourceCache<string>("hung")).toBe("fresh");
  });
});

describe("what the Not-loaded line says", () => {
  it("names the status the server answered with", () => {
    expect(failureNote(new EndpointError("x", 429))).toBe(" (the server answered 429)");
    expect(failureNote(new EndpointError("x", 503))).toBe(" (the server answered 503)");
  });

  it("separates a timeout from a network failure", () => {
    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    expect(failureNote(timeout)).toBe(" (it did not answer in time)");
    expect(failureNote(new TypeError("Failed to fetch"))).toBe(
      " (the request did not reach the server)",
    );
  });

  it("reaches the recorded absence", async () => {
    const result = await source("s", "the Semiconductors industry figures", () =>
      Promise.reject(new EndpointError("x", 404)),
    );
    expect(result.ok === false && result.what).toBe(
      "the Semiconductors industry figures (the server answered 404)",
    );
  });
});

describe("the one retry", () => {
  it("is spent on a 429, a 5xx and a network error", () => {
    expect(worthRetrying(new EndpointError("x", 429))).toBe(true);
    expect(worthRetrying(new EndpointError("x", 500))).toBe(true);
    expect(worthRetrying(new EndpointError("x", 503))).toBe(true);
    expect(worthRetrying(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("is not spent on a 404 or on an abort", () => {
    expect(worthRetrying(new EndpointError("x", 404))).toBe(false);
    expect(worthRetrying(new EndpointError("x", 400))).toBe(false);
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(worthRetrying(abort)).toBe(false);
  });

  it("turns a first 429 into a loaded payload", async () => {
    let calls = 0;
    const result = await source("retry", "the ranking", () => {
      calls += 1;
      return calls === 1 ? Promise.reject(new EndpointError("x", 429)) : Promise.resolve("ok");
    });
    expect(calls).toBe(2);
    expect(result.ok && result.value).toBe("ok");
  });

  it("does not try a 404 twice", async () => {
    let calls = 0;
    await source("miss", "the ranking", () => {
      calls += 1;
      return Promise.reject(new EndpointError("x", 404));
    });
    expect(calls).toBe(1);
  });

  it("stops when the gather has already given up", async () => {
    const stop = new AbortController();
    stop.abort();
    let calls = 0;
    const result = await source(
      "gone",
      "the ranking",
      () => {
        calls += 1;
        return Promise.reject(new EndpointError("x", 500));
      },
      { signal: stop.signal },
    );
    expect(calls).toBe(1);
    expect(result.ok).toBe(false);
  });
});

describe("how many calls run at once", () => {
  it("never exceeds the cap, whatever the wave asks for", async () => {
    let live = 0;
    let peak = 0;
    const release: (() => void)[] = [];
    const work = () =>
      gated(async () => {
        live += 1;
        peak = Math.max(peak, live);
        await new Promise<void>((resolve) => release.push(resolve));
        live -= 1;
      });

    const all = Promise.all(Array.from({ length: 18 }, work));
    // Let the first wave take its slots.
    await Promise.resolve();
    await Promise.resolve();
    expect(peak).toBe(GATHER_CONCURRENCY);
    while (release.length > 0) {
      release.shift()?.();
      await Promise.resolve();
      await Promise.resolve();
    }
    await all;
    expect(peak).toBe(GATHER_CONCURRENCY);
    expect(live).toBe(0);
  });
});
