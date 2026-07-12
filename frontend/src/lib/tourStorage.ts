// localStorage flags for the onboarding tours. Mirrors the app's other ifed.*
// helpers (notebookStorage.ts, the AppShell sidebar key): a small try/catch
// wrapper so a blocked storage (private mode) degrades to "not done" instead of
// throwing.
//
// The stored value is the completed tour VERSION (an integer). Bumping a tour's
// version re-triggers its first-run without needing a new key.

const doneKey = (tourId: string): string => `ifed.tour.${tourId}.done`;

/** True when this tour was completed or skipped at or above the given version. */
export function isTourDone(tourId: string, version: number): boolean {
  try {
    const raw = localStorage.getItem(doneKey(tourId));
    if (!raw) return false;
    const seen = Number.parseInt(raw, 10);
    return Number.isFinite(seen) && seen >= version;
  } catch {
    return false;
  }
}

/** Mark a tour done at a version. Completing and skipping both call this. */
export function markTourDone(tourId: string, version: number): void {
  try {
    localStorage.setItem(doneKey(tourId), String(version));
  } catch {
    // storage unavailable (private mode); the tour may re-show next visit
  }
}

/** Clear a tour's done flag, to force a replay or for manual testing. */
export function clearTourDone(tourId: string): void {
  try {
    localStorage.removeItem(doneKey(tourId));
  } catch {
    // ignore
  }
}
