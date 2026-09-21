// Autosave on a debounce, with the save status a field can render.
//
// QuestionField and ReasonedRating both held their own timer ref and their own
// clear-on-unmount cleanup. They keep their own delays; only the timer is
// shared.
//
// The scheduling itself lives in `createDebouncedSaver`, a plain function with
// no React in it, because the rule that matters here is not a rendering rule:
// a queued save must write through the callback it was QUEUED with, never the
// one the component happens to hold when the timer fires. A field whose
// subject changed under it (the reader clicked another company while a save
// was pending) would otherwise write the old subject's text under the new
// subject's key. The pure core is what the unit test drives.

import { useEffect, useRef, useState } from "react";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/** How long the "saved" tick stays up before the line goes quiet again. */
const SAVED_FLASH_MS = 1400;

export type SaveFn = (value: string) => unknown;

export interface DebouncedSave {
  status: SaveStatus;
  /** The value the last successful save wrote. Mutable so a caller syncing
   *  from the server can mark a value as already saved. */
  lastSaved: React.MutableRefObject<string>;
}

export interface DebouncedSaver {
  /** The value the last completed save wrote. */
  lastSaved: { current: string };
  /** Queue `value` to be written by `save` once `ms` have passed with nothing
   *  else queued. A later schedule replaces the pending one. */
  schedule(value: string, save: SaveFn, ms: number): void;
  /** Write the pending value now, through the function it was queued with. */
  flush(): void;
  /** Drop the pending write without performing it. */
  cancel(): void;
}

interface PendingSave {
  value: string;
  save: SaveFn;
}

/**
 * The debounce, without React.
 *
 * `schedule` captures the save function alongside the value, so whatever runs
 * later writes the pair that was queued together. `flush` performs that same
 * pair immediately, which is what an unmounting field calls so a save queued
 * milliseconds before it went away is not lost.
 *
 * A rejected save reports "error" and is caught, so it never surfaces as an
 * unhandled rejection.
 */
export function createDebouncedSaver(
  initialValue: string,
  onStatus: (status: SaveStatus) => void,
): DebouncedSaver {
  const lastSaved = { current: initialValue };
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: PendingSave | null = null;

  const clear = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const run = (job: PendingSave) => {
    // job.save may return a promise, a value, or throw outright.
    void Promise.resolve()
      .then(() => job.save(job.value))
      .then(
        () => {
          lastSaved.current = job.value;
          onStatus("saved");
          setTimeout(() => onStatus("idle"), SAVED_FLASH_MS);
        },
        () => onStatus("error"),
      );
  };

  const take = (): PendingSave | null => {
    const job = pending;
    pending = null;
    return job;
  };

  return {
    lastSaved,
    schedule(value, save, ms) {
      clear();
      pending = { value, save };
      onStatus("saving");
      timer = setTimeout(() => {
        timer = null;
        const job = take();
        if (job) run(job);
      }, ms);
    },
    flush() {
      clear();
      const job = take();
      if (job) run(job);
    },
    cancel() {
      clear();
      take();
    },
  };
}

/**
 * Save `value` `ms` after it stops changing. A value equal to the last saved
 * one is not written again. A save still pending when the field goes away is
 * flushed rather than dropped, through the callback it was scheduled under.
 */
export function useDebouncedSave(
  value: string,
  onSave: SaveFn,
  ms: number,
): DebouncedSave {
  const [status, setStatus] = useState<SaveStatus>("idle");

  // One saver per mounted field, created on the first render and kept for the
  // life of the field. `setStatus` is stable, so the saver never goes stale.
  const saverRef = useRef<DebouncedSaver | null>(null);
  if (saverRef.current === null) {
    saverRef.current = createDebouncedSaver(value, setStatus);
  }
  const saver = saverRef.current;

  useEffect(() => {
    if (value === saver.lastSaved.current) return;
    // `onSave` is deliberately not a dependency: this effect runs on the render
    // where the VALUE changed, so the callback captured here is the one that
    // belongs to that value. A later render with a different scope must not
    // re-target a write that is already queued.
    saver.schedule(value, onSave, ms);
    // No cleanup: the next schedule replaces the pending write, and the unmount
    // effect below flushes whatever is still queued.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, ms, saver]);

  useEffect(() => () => saver.flush(), [saver]);

  return { status, lastSaved: saver.lastSaved };
}
