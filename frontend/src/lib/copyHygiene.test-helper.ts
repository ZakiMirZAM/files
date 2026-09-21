// Shared copy-hygiene assertions applied across every deck builder in
// the connection, industry forces, and industry decks copy layers.
//
// The em-dash check and the developer-shorthand regex were first written
// inside industryDecksB.test.ts; this file is the canonical location so
// the exact same bar is applied everywhere.

import { expect } from "vitest";
import type { RuntimeGroup } from "./types";

/** U+2014 EM DASH, built at runtime so no literal em dash lives in source. */
export const EM_DASH = String.fromCharCode(0x2014);

/**
 * Regex that catches developer shorthand, broken interpolation, and
 * formatting accidents that must never reach the page.
 *
 *  NaN / undefined / null   - broken interpolation
 *  n/a                      - developer shorthand (rule: "not available")
 *  not available percent    - a missing value followed by a unit
 *  % percent                - double unit
 *  4-digit-dot-1 percent    - unformatted large number ("1234.5 percent")
 *  \bR2\b                   - unformatted R-squared (should be "R-squared")
 */
export const HYGIENE =
  /NaN|undefined|null|n\/a|not available percent|% percent|\d{4,}\.\d percent|\bR2\b/;

/**
 * Collect every user-facing string (title, question text, dataContext)
 * from an array of RuntimeGroups returned by a deck builder.
 */
export function stringsFromGroups(groups: RuntimeGroup[]): string[] {
  const out: string[] = [];
  for (const g of groups) {
    out.push(g.title);
    for (const q of g.questions) {
      out.push(q.text);
      if (q.dataContext) out.push(q.dataContext);
    }
  }
  return out;
}

/**
 * Assert em-dash and developer-shorthand hygiene on a batch of strings.
 * Call this in an `it()` block for each builder invocation.
 */
export function assertCopyHygiene(strings: string[], label: string): void {
  for (const s of strings) {
    expect(s.includes(EM_DASH), `em dash in ${label}: ${s.slice(0, 80)}`).toBe(false);
    expect(s, `shorthand in ${label}: ${s.slice(0, 80)}`).not.toMatch(HYGIENE);
  }
}
