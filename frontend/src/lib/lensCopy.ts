// Every user-facing string the reading picker renders.
//
// STATUS: every key carries the writer's final text word for word, from
// lensWriting/ui-copy.md. The keys are stable and the component reads nothing
// but this module, so replacing a value here changes the page with no component
// edit. lensCopy.draft.md lists every key with the context it renders in;
// lensCopy.conformance.test.ts holds the two in step.
//
// Rules that survive the rewrite: no em dash, no author names, no verdict
// language. Nothing in this module names a reading; the picker now fills the
// reading automatically from the owner's own thresholds (lib/readingRules/),
// but the words it prints are the owner's Part 3 labels, and the strings here
// are only the frame around them.

/** Templates carry {placeholders}; fill them with `fillCopy`. */
export const LENS_COPY = {
  // The one line the reader sees first, with the reading already filled in.
  // Three shapes, one per fact a rule can decide on, because the figure the
  // line prints must be the figure the rule read. Every one of them carries
  // the period of the observation, so a reading can never be dated "now" by
  // implication.
  "picker.auto.line": "Reading now: {reading}, from the latest {value}, as of {period}",
  "picker.auto.lineYearOverYear":
    "Reading now: {reading}, from {value} year over year, as of {period}",
  "picker.auto.lineYearChange":
    "Reading now: {reading}, from a change of {value} over the year, as of {period}",
  "picker.auto.undetermined": "Reading now: not determined",
  "picker.auto.undeterminedLatest": "Reading now: not determined. Latest {value}, as of {period}.",
  "picker.auto.undeterminedFacts":
    "Reading now: not determined. Latest {value}, {direction}, as of {period}.",
  "picker.auto.stale": "Reading now: not determined. The latest figure is from {period}.",
  "picker.auto.chosen": "Reading now: {reading}, chosen by you",
  "picker.auto.change": "change",
  "picker.auto.close": "close",
  "picker.auto.useAutomatic": "use the automatic reading",

  // Section framing
  "picker.title": "Your reading",
  "picker.intro":
    "The reading above is filled from the thresholds this metric's own definition states. Pick a different one here when you read the same figures another way. The evidence below is arithmetic on the series above it.",

  // The three evidence lines above the options
  "picker.latest": "Latest",
  "picker.latestUnavailable": "No series on this page for this metric.",
  "picker.trend": "Trend",
  "picker.trendUnavailable": "Not derivable, {reason}.",
  "picker.trendDetail": "{change} over the lookback, against a band of {band}.",
  "picker.level": "10-year level",
  "picker.levelValue": "{percentile} of its last ten years.",
  "picker.levelUnavailable": "Not enough history for a ten-year level.",

  // Skip reasons, in plain words
  "picker.skip.noSeries": "there is no series behind this metric",
  "picker.skip.tooFewPoints": "the series is too short to compare",
  "picker.skip.staleSeries": "the series has not updated recently enough",
  "picker.skip.notDerivable": "the series cannot be read this way",

  // The options
  "picker.undecided": "undecided",
  "picker.meaningToggle": "What it means",
  "picker.meaningHide": "Hide",
  "picker.saveError": "That pick did not save. Pick it again.",
  "picker.saveSignedOut": "A reading is saved only when you are signed in.",

  // The two sentences that replace the options
  "picker.orphan":
    "Your saved reading no longer matches this metric's readings. Pick again.",
  "picker.noTable": "No reading options are available for this metric.",

  // The Sector Rotation line under a saved pick
  "picker.rotationLine": "Sector Rotation matrix row: {row}. Direction now: {direction}.",
  "picker.rotationUnset": "not set",
  "picker.rotationSet": "Set the matrix direction",
  "picker.rising": "rising",
  "picker.steady": "stable",
  "picker.falling": "falling",
} as const;

export type LensCopyKey = keyof typeof LENS_COPY;

/** Fill a template's {placeholders}. An unfilled placeholder is left as it is. */
export function fillCopy(key: LensCopyKey, values: Record<string, string>): string {
  let out: string = LENS_COPY[key];
  for (const [name, value] of Object.entries(values)) {
    out = out.split(`{${name}}`).join(value);
  }
  return out;
}
