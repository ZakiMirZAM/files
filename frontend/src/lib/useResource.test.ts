// The shared fetch machinery: one cache, one flight, one rate-limit sentence.
//
// There is no DOM test environment in this project, so these exercise the
// primitives the hook is built from rather than rendering it. Everything the
// hook adds on top is a useState call around these.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  EndpointError,
  acquireResource,
  clearResourceCache,
  forgetResource,
  getJson,
  loadResource,
  messageFor,
  peekResourceCache,
} from "./useResource";

const TTL = 5 * 60 * 1000;

/** A fetch stub that counts calls and resolves when the test says so. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  clearResourceCache();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-20T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  clearResourceCache();
});

describe("single flight", () => {
  it("two subscribers on one key make one request", async () => {
    let calls = 0;
    const load = () => {
      calls += 1;
      return Promise.resolve("value");
    };

    const a = acquireResource("k", load);
    const b = acquireResource("k", load);
    expect(calls).toBe(1);
    await expect(a.promise).resolves.toBe("value");
    await expect(b.promise).resolves.toBe("value");
    expect(calls).toBe(1);
  });

  it("does not abort a shared request because one subscriber left", async () => {
    const d = deferred<string>();
    let aborted = false;
    const load = (signal: AbortSignal) => {
      signal.addEventListener("abort", () => {
        aborted = true;
      });
      return d.promise;
    };

    const a = acquireResource("k", load);
    const b = acquireResource("k", load);
    a.release(); // one component unmounts while the other is still waiting
    expect(aborted).toBe(false);

    d.resolve("value");
    await expect(b.promise).resolves.toBe("value");
    expect(aborted).toBe(false);
  });

  it("aborts once the last subscriber leaves", async () => {
    const d = deferred<string>();
    let aborted = false;
    const load = (signal: AbortSignal) => {
      signal.addEventListener("abort", () => {
        aborted = true;
      });
      return d.promise;
    };

    const a = acquireResource("k", load);
    const b = acquireResource("k", load);
    a.release();
    b.release();
    expect(aborted).toBe(true);
  });

  it("a key change starts a separate request", async () => {
    const seen: string[] = [];
    const load = (key: string) => () => {
      seen.push(key);
      return Promise.resolve(key);
    };

    const first = acquireResource("industry|Semiconductors", load("a"));
    first.release();
    const second = acquireResource("industry|Banks", load("b"));
    await Promise.all([first.promise.catch(() => undefined), second.promise]);
    expect(seen).toEqual(["a", "b"]);
  });
});

describe("the success cache", () => {
  it("serves a second caller from the cache without re-requesting", async () => {
    let calls = 0;
    const load = () => {
      calls += 1;
      return Promise.resolve({ n: calls });
    };

    await expect(loadResource("k", load)).resolves.toEqual({ n: 1 });
    await expect(loadResource("k", load)).resolves.toEqual({ n: 1 });
    expect(calls).toBe(1);
  });

  it("re-requests once the time to live has run out", async () => {
    let calls = 0;
    const load = () => {
      calls += 1;
      return Promise.resolve({ n: calls });
    };

    await loadResource("k", load);
    expect(calls).toBe(1);

    vi.advanceTimersByTime(TTL - 1);
    await loadResource("k", load);
    expect(calls).toBe(1);

    vi.advanceTimersByTime(2);
    await expect(loadResource("k", load)).resolves.toEqual({ n: 2 });
    expect(calls).toBe(2);
  });

  it("never caches a failure", async () => {
    let calls = 0;
    const load = () => {
      calls += 1;
      return Promise.reject(new EndpointError("nope", 500));
    };

    await expect(loadResource("k", load)).rejects.toThrow("nope");
    await expect(loadResource("k", load)).rejects.toThrow("nope");
    expect(calls).toBe(2);
    expect(peekResourceCache("k")).toBeUndefined();
  });

  it("a retry drops the cached success so the next call re-requests", async () => {
    let calls = 0;
    const load = () => {
      calls += 1;
      return Promise.resolve({ n: calls });
    };

    await loadResource("k", load);
    expect(peekResourceCache("k")).toEqual({ n: 1 });

    // What the hook's retry does: forget this key, then ask again.
    clearResourceCache();
    await expect(loadResource("k", load)).resolves.toEqual({ n: 2 });
    expect(calls).toBe(2);
  });

  it("holds at most about fifty entries", async () => {
    for (let i = 0; i < 60; i++) {
      await loadResource(`k${i}`, () => Promise.resolve(i));
    }
    expect(peekResourceCache("k0")).toBeUndefined();
    expect(peekResourceCache("k59")).toBe(59);
  });

  it("forgets one key without touching the rest", async () => {
    await loadResource("a", () => Promise.resolve(1));
    await loadResource("b", () => Promise.resolve(2));
    forgetResource("a");
    expect(peekResourceCache("a")).toBeUndefined();
    expect(peekResourceCache("b")).toBe(2);
  });
});

describe("the ranking payloads, which are the heavy ones", () => {
  const ranking = (i: string) => `comparative-ranking|${i}`;

  it("keeps only the last three, so a browsed session cannot hold ten megabytes each", async () => {
    for (const industry of ["Semiconductors", "Banks", "Software", "Autos"]) {
      await loadResource(ranking(industry), () => Promise.resolve(industry));
    }
    expect(peekResourceCache(ranking("Semiconductors"))).toBeUndefined();
    expect(peekResourceCache(ranking("Banks"))).toBe("Banks");
    expect(peekResourceCache(ranking("Software"))).toBe("Software");
    expect(peekResourceCache(ranking("Autos"))).toBe("Autos");
  });

  it("counts a filtered ranking and the light form under the same cap", async () => {
    await loadResource(ranking("Semiconductors"), () => Promise.resolve(1));
    await loadResource(`${ranking("Semiconductors")}|light`, () => Promise.resolve(2));
    await loadResource(`${ranking("Semiconductors")}|developed`, () => Promise.resolve(3));
    await loadResource(ranking("Banks"), () => Promise.resolve(4));

    expect(peekResourceCache(ranking("Semiconductors"))).toBeUndefined();
    expect(peekResourceCache(ranking("Banks"))).toBe(4);
  });

  it("leaves every other key alone while trimming its own", async () => {
    await loadResource("economic", () => Promise.resolve("econ"));
    for (const industry of ["A", "B", "C", "D", "E"]) {
      await loadResource(ranking(industry), () => Promise.resolve(industry));
    }
    expect(peekResourceCache("economic")).toBe("econ");
    expect(peekResourceCache(ranking("E"))).toBe("E");
    expect(peekResourceCache(ranking("A"))).toBeUndefined();
  });

  it("drops an expired entry on the next write, not only when it is read again", async () => {
    await loadResource("stale", () => Promise.resolve("old"));
    vi.advanceTimersByTime(TTL + 1);
    // Nobody reads "stale" again; a write of another key is what sweeps it.
    await loadResource("fresh", () => Promise.resolve("new"));
    expect(peekResourceCache("stale", Number.MAX_SAFE_INTEGER)).toBeUndefined();
    expect(peekResourceCache("fresh")).toBe("new");
  });
});

describe("the failure sentences", () => {
  it("says one thing, and only one thing, about rate limiting", () => {
    const limited = messageFor(new EndpointError("ignored", 429), "value system figures");
    expect(limited.rateLimited).toBe(true);
    expect(limited.message).toBe(
      "The server is handling too many requests right now. Try again in a moment.",
    );
  });

  it("passes a server status through in the endpoint's own words", () => {
    const failed = messageFor(
      new EndpointError("The value system figures did not load (server said 500).", 500),
      "value system figures",
    );
    expect(failed.rateLimited).toBe(false);
    expect(failed.message).toBe("The value system figures did not load (server said 500).");
  });

  it("falls back to the connection sentence for anything else", () => {
    const failed = messageFor(new TypeError("network down"), "strategic group map");
    expect(failed.rateLimited).toBe(false);
    expect(failed.message).toBe(
      "The strategic group map did not load. Check your connection and try again.",
    );
  });
});

describe("getJson", () => {
  it("names the thing that failed and carries the status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("", { status: 429 }))),
    );
    await expect(getJson("http://x/y", "sector profit pool")).rejects.toMatchObject({
      status: 429,
      message: "The sector profit pool did not load (server said 429).",
    });
  });

  it("returns the parsed body on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ sector: "Energy" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ),
    );
    await expect(getJson("http://x/y", "sector profit pool")).resolves.toEqual({
      sector: "Energy",
    });
  });
});
