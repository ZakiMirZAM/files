// The level cuts a reading rule reads a percentile against, and the four
// predicates that compare one.
//
// Several of the owner's labels name a level ("at a high level", "below
// typical levels", "well above average") without naming a number. Those rules
// read `percentile10y`, and the cuts here are the app's own: the shipped
// Sector Rotation reader already treats the top and bottom fifth of a series'
// trailing ten years as an extreme level.
//
// They are written out rather than imported from that reader's options, and
// deliberately so: the reader's thresholds are a tuning knob its own tests
// move, while these are the meaning of a word in the owner's label. The two
// happening to agree today is not a reason to make one follow the other.
//
// Both economic halves used to declare these separately, under two sets of
// names. They are declared once here and each half re-exports the names its own
// rule files already use.

/** Bottom and top fifth of the trailing ten years. */
export const LOW_PCT = 20;
export const HIGH_PCT = 80;

/**
 * The middle of a series' own trailing ten years.
 *
 * A label that claims the figure is HIGH must not fire below it, and one that
 * claims the figure is LOW must not fire above it, unless the label's own
 * number band is what places the level. That is the level half of the rule the
 * rule files follow: a reading never fires when the measured figures
 * contradict a word in the owner's own label. A percentile that cannot be
 * computed at all places nothing, so it satisfies neither.
 */
export const MIDDLE_PCT = 50;

/** At or above a percentile cut. A missing percentile is never an extreme. */
export const atOrAbove = (p: number | null, cut: number): boolean => p !== null && p >= cut;

/** At or below a percentile cut. A missing percentile is never an extreme. */
export const atOrBelow = (p: number | null, cut: number): boolean => p !== null && p <= cut;

/** Strictly inside a percentile band. A missing percentile matches nothing. */
export const inBand = (p: number | null, lo: number, hi: number): boolean =>
  p !== null && p > lo && p < hi;

/** Inside a percentile band, lower edge included and upper edge excluded. */
export const inHalfOpen = (p: number | null, lo: number, hi: number): boolean =>
  p !== null && p >= lo && p < hi;
