import { useSyncExternalStore } from "react";
import { toStoryConversion, type StoryConversion } from "./aiApi";

/** The reader's converted story per company, and which numbers the FCFF
 *  valuation shows ("model" or "story").
 *
 * The same module-store pattern as stageStore: StorySection writes the story,
 * ForecastSection reads it and the switch, and both re-render on any change.
 * Keyed by the ROUTE ticker, the key the story answers are saved under.
 */
// ponytail: device-local localStorage; move to Convex if the story ever needs to follow the reader across devices.

export type StoryMode = "model" | "story";

export interface StoredStory {
  conversion: StoryConversion;
  savedAt: number;
}

const listeners = new Set<() => void>();
// This session's writes win over storage (private mode, node tests).
const storyOverrides = new Map<string, StoredStory | null>();
const modeOverrides = new Map<string, StoryMode>();
// The last parse per key: a read returns the same object until the stored
// string changes, which useSyncExternalStore needs to settle.
const memo = new Map<string, { raw: string | null; value: StoredStory | null }>();

const storyKey = (key: string) => `ifed.story.conversion.${key}`;
const modeKey = (key: string) => `ifed.story.mode.${key}`;

function readRaw(storageKey: string): string | null {
  try {
    return localStorage.getItem(storageKey);
  } catch {
    return null; // storage unavailable (private mode, node)
  }
}

function writeRaw(storageKey: string, value: string | null): void {
  try {
    if (value == null) localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, value);
  } catch {
    // Persisting is a nicety; the in-memory override still works.
  }
}

function notify(): void {
  listeners.forEach((l) => l());
}

/** A stored entry, or null when it is missing, corrupt or from an older shape. */
export function parseStoredStory(raw: string | null): StoredStory | null {
  if (raw == null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { conversion, savedAt } = parsed as Record<string, unknown>;
  const table = toStoryConversion(conversion);
  if (!table || typeof savedAt !== "number" || !Number.isFinite(savedAt)) return null;
  return { conversion: table, savedAt };
}

export function readStoredStory(key: string): StoredStory | null {
  if (storyOverrides.has(key)) return storyOverrides.get(key) ?? null;
  const raw = readRaw(storyKey(key));
  const hit = memo.get(key);
  if (hit && hit.raw === raw) return hit.value;
  const value = parseStoredStory(raw);
  memo.set(key, { raw, value });
  return value;
}

/** Save a converted story, or remove it (null), which also resets the switch to the model. */
export function setStoredStory(key: string, story: StoredStory | null): void {
  storyOverrides.set(key, story);
  writeRaw(storyKey(key), story ? JSON.stringify(story) : null);
  if (story) notify();
  else setStoryMode(key, "model");
}

function readStoredMode(key: string): StoryMode | null {
  const mode = modeOverrides.get(key) ?? readRaw(modeKey(key));
  return mode === "model" || mode === "story" ? mode : null;
}

export function setStoryMode(key: string, mode: StoryMode): void {
  modeOverrides.set(key, mode);
  writeRaw(modeKey(key), mode);
  notify();
}

/** Story mode only when there is a story to show and the reader chose it. */
export function resolveStoryMode(hasStory: boolean, stored: StoryMode | null): StoryMode {
  return hasStory && stored === "story" ? "story" : "model";
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useStoredStory(key: string): StoredStory | null {
  return useSyncExternalStore(subscribe, () => readStoredStory(key));
}

export function useStoryMode(key: string): StoryMode {
  return useSyncExternalStore(subscribe, () =>
    resolveStoryMode(readStoredStory(key) != null, readStoredMode(key)),
  );
}
