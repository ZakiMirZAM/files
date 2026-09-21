// The reading under each chart: filled in from the numbers, changeable by hand.
//
// It sits inside every metric dropdown on the Economic page and the Credit and
// Banking page, between the chart and the metric's questions.
//
// What it does:
//   - it fills the reading automatically. lib/readingRules/ holds one rule per
//     named reading, and every threshold in those rules is a number the owner
//     wrote in that reading's own label or its "What it means" text. The engine
//     tests them against the live series and exactly one matching rule decides.
//     Nothing is scored and nothing is guessed: no match, two matches, no rule,
//     no series or a series the feed stopped updating all read "not
//     determined", and the reader picks by hand;
//   - the figure it prints is the figure the rule READ. A metric judged by its
//     year-over-year change prints that change, not the level of the index, and
//     every line carries the period of the observation it came from;
//   - it says nothing at all until it knows. While the payload or the reader's
//     own saved pick is still in flight there is a placeholder, not a claim
//     that later changes under the reader's eyes;
//   - a reading the reader saves WINS over the automatic one, and there is a
//     link back to the automatic reading, which clears the saved answer;
//   - it never preselects a Sector Rotation direction, because a reading such
//     as flat is neither rising nor falling. That line still only appears under
//     a reading the reader chose, and only for the matrix row that reads the
//     same series this picker read;
//   - it never rewrites the owner's reading labels or their meanings. Both are
//     rendered word for word from the definition file.
//
// The three evidence lines behind the "change" link are arithmetic that already
// ships: classifySeries in lib/rotationAutoFill.ts returns the trend word, the
// change, the band it was compared against, and the ten-year level percentile.
// Its skip reasons are shown in plain words rather than hidden.
//
// The named readings themselves come from the generated metric-sector dataset,
// which is about a megabyte. It is fetched only when the reader opens the
// manual list, or when they already have a pick that has to be resolved against
// it, so the one-line view costs nothing.

import { useEffect, useMemo, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ChevronDown } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Metric } from "../lib/types";
import type { Part3Row } from "../lib/definitionTables";
import { LENS_COPY, fillCopy } from "../lib/lensCopy";
import { classifySeries, seriesNameForRow } from "../lib/rotationAutoFill";
import { decideReading, factsFromSeries } from "../lib/readingRules/engine";
import { rulesFor } from "../lib/readingRules";
import type { ReadsFact } from "../lib/readingRules/types";
import {
  formatSignedPercent,
  formatSignedUnitValue,
  formatUnitValue,
  ordinal,
} from "../lib/format";
import {
  loadRotationDirections,
  rotationRowsForEconomic,
  setRotationDirection,
} from "../lib/rotationState";
import type { Reading } from "../lib/sectorRotation";
import type { ReadingSurface } from "../lib/readingTables";
import { cn } from "../lib/cn";

/** The questionId every reading pick is stored under, on both surfaces. */
export const READING_QUESTION_ID = "reading";

/** The scope a metric's answers live in, the scheme MetricQuestions uses. */
export function readingScopeKey(defNumber: number): string {
  return `metric-${defNumber}`;
}

interface ReadingPickerProps {
  surface: ReadingSurface;
  defNumber: number;
  /** The live metric behind this dropdown, when the page has one. */
  metric?: Metric;
  /** The page's own payload is still in flight, so an absent metric means
   *  "not known yet" rather than "this metric has no series". */
  loading?: boolean;
  /** Tighter spacing for the inline use in a later stage's table. */
  compact?: boolean;
}

// ── The automatic reading ──────────────────────────────────────────────────

export interface AutomaticReading {
  /** The owner's own label, or null when no rule decided. */
  reading: string | null;
  /** The figure the deciding rule READ, already formatted. */
  value: string | null;
  /** Which fact that figure is, so the line can name it. */
  reads: ReadsFact;
  /** The period of the observation the figures came from. */
  period: string | null;
  /** The direction word for the series, when the reader could derive one. */
  direction: string | null;
  /** The feed stopped updating this series, so there is no reading for now. */
  stale: boolean;
}

const NOTHING: AutomaticReading = {
  reading: null,
  value: null,
  reads: "latest",
  period: null,
  direction: null,
  stale: false,
};

const DIRECTION_WORD: Record<string, string> = {
  rising: LENS_COPY["picker.rising"],
  neutral: LENS_COPY["picker.steady"],
  falling: LENS_COPY["picker.falling"],
};

/** A period as the rest of the app writes one: the year and the month. */
export function asOfPeriod(period: string): string {
  return period.slice(0, 7);
}

/** One figure, printed the way the fact it is asks to be printed. */
function figure(value: number, reads: ReadsFact, metric: Metric): string {
  if (reads === "yoyChangePct") return formatSignedPercent(value);
  if (reads === "yoyChangeAbs") return formatSignedUnitValue(value, metric.unit, metric.name);
  return formatUnitValue(value, metric.unit, metric.name);
}

/** What the rules make of this metric's live series. Pure, so it is testable. */
export function automaticReading(
  surface: ReadingSurface,
  defNumber: number,
  metric: Metric | undefined,
  now?: Date,
): AutomaticReading {
  if (!metric) return NOTHING;
  const facts = factsFromSeries(metric.trend, metric.frequency, now);
  if (!facts) return NOTHING;
  // The figures are reported even when no rule decides, so a reader who sees
  // "not determined" also sees what the rules were given.
  const plain: AutomaticReading = {
    reading: null,
    value: formatUnitValue(facts.latest, metric.unit, metric.name),
    reads: "latest",
    period: asOfPeriod(facts.latestPeriod),
    direction: facts.trend === null ? null : DIRECTION_WORD[facts.trend] ?? null,
    stale: facts.stale === true,
  };
  const rules = rulesFor(surface, defNumber);
  if (!rules) return plain;
  const decision = decideReading(rules, facts);
  if (!decision.determined) return plain;
  return {
    ...plain,
    reading: decision.reading,
    reads: decision.reads,
    value: decision.value === null ? plain.value : figure(decision.value, decision.reads, metric),
  };
}

/** The one line the reader sees first. A saved pick always wins. */
export function readingLine(saved: string | null, automatic: AutomaticReading): string {
  if (saved) return fillCopy("picker.auto.chosen", { reading: saved });
  const { reading, value, reads, period, direction, stale } = automatic;
  // A series the feed stopped updating has a latest figure and a rule that
  // matches it, and saying "now" about either would be false.
  if (stale && period) return fillCopy("picker.auto.stale", { period });
  if (reading && value && period) {
    if (reads === "yoyChangePct") {
      return fillCopy("picker.auto.lineYearOverYear", { reading, value, period });
    }
    if (reads === "yoyChangeAbs") {
      return fillCopy("picker.auto.lineYearChange", { reading, value, period });
    }
    return fillCopy("picker.auto.line", { reading, value, period });
  }
  if (value && direction && period) {
    return fillCopy("picker.auto.undeterminedFacts", { value, direction, period });
  }
  if (value && period) return fillCopy("picker.auto.undeterminedLatest", { value, period });
  return LENS_COPY["picker.auto.undetermined"];
}

// ── Evidence ───────────────────────────────────────────────────────────────

const SKIP_COPY = {
  "no-series": LENS_COPY["picker.skip.noSeries"],
  "too-few-points": LENS_COPY["picker.skip.tooFewPoints"],
  "stale-series": LENS_COPY["picker.skip.staleSeries"],
  "not-derivable": LENS_COPY["picker.skip.notDerivable"],
} as const;

const TREND_WORD: Record<Reading, string> = {
  up: LENS_COPY["picker.rising"],
  neutral: LENS_COPY["picker.steady"],
  down: LENS_COPY["picker.falling"],
};

interface Evidence {
  latest: string;
  trend: string;
  level: string;
}

/**
 * The Sector Rotation matrix rows this picker may offer to set.
 *
 * ECON_LINK maps a matrix row to a definition, and BOTH curve rows carry
 * definition 6 while the rules of 6 read the 10Y-2Y series alone. Offering the
 * 10Y-3M row there invites the reader to set a direction from a reading taken
 * off a different series. Where a definition has more than one row, only the
 * row whose own series is the one this picker read is offered; where that
 * cannot be told, none is, because a wrong row is worse than no row.
 */
export function matrixRowsForMetric(
  surface: ReadingSurface,
  defNumber: number,
  metric: Metric | undefined,
): { id: string; name: string }[] {
  if (surface !== "economic") return [];
  const all = rotationRowsForEconomic(defNumber);
  if (all.length < 2) return all;
  if (!metric) return [];
  return all.filter((row) => seriesNameForRow(row.id) === metric.name);
}

/** The three evidence lines. Pure, so the figures are testable on their own. */
export function buildEvidence(metric: Metric | undefined): Evidence {
  if (!metric || metric.trend.length === 0) {
    return {
      latest: LENS_COPY["picker.latestUnavailable"],
      trend: LENS_COPY["picker.latestUnavailable"],
      level: LENS_COPY["picker.levelUnavailable"],
    };
  }
  const last = metric.trend[metric.trend.length - 1];
  const latest = `${formatUnitValue(metric.latestValue, metric.unit, metric.name)}, as of ${asOfPeriod(last.period)}`;

  const classified = classifySeries(metric.trend, metric.frequency);
  if ("skip" in classified) {
    return {
      latest,
      trend: fillCopy("picker.trendUnavailable", { reason: SKIP_COPY[classified.skip] }),
      level: LENS_COPY["picker.levelUnavailable"],
    };
  }
  const detail = fillCopy("picker.trendDetail", {
    change: formatUnitValue(classified.change, metric.unit, metric.name),
    band: formatUnitValue(classified.band, metric.unit, metric.name),
  });
  const level =
    classified.levelPercentile === null
      ? LENS_COPY["picker.levelUnavailable"]
      : fillCopy("picker.levelValue", {
          percentile: `${ordinal(classified.levelPercentile * 100)} percentile`,
        });
  return { latest, trend: `${TREND_WORD[classified.reading]}. ${detail}`, level };
}

function EvidenceLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="font-mono text-[0.7rem] uppercase tracking-wider text-white/40 shrink-0">
        {label}
      </span>
      <span className="text-sm text-white/70 leading-6 min-w-0">{value}</span>
    </div>
  );
}

const LINK_CLASS =
  "font-mono text-[0.7rem] uppercase tracking-wider text-white/45 hover:text-gold " +
  "focus:outline-none focus-visible:ring-1 focus-visible:ring-gold/60 rounded";

// ── The named readings, loaded on demand ───────────────────────────────────

interface ReadingTables {
  readingsFor: (surface: ReadingSurface, defNumber: number) => Part3Row[];
  resolveReading: (
    surface: ReadingSurface,
    defNumber: number,
    saved: string,
  ) => { row: Part3Row | null; orphaned: boolean };
}

/**
 * The owner's named readings for one metric, fetched only when they are needed.
 *
 * They live in the generated metric-sector dataset, which is about a megabyte,
 * so the module is imported when the reader opens the manual list or already
 * has a saved pick that has to be resolved against it. Until then this returns
 * null and the one-line view runs on the rules alone.
 */
function useReadingTables(wanted: boolean): ReadingTables | null {
  const [tables, setTables] = useState<ReadingTables | null>(null);
  useEffect(() => {
    if (!wanted || tables !== null) return;
    let alive = true;
    void import("../lib/readingTables").then((m) => {
      if (alive) setTables({ readingsFor: m.readingsFor, resolveReading: m.resolveReading });
    });
    return () => {
      alive = false;
    };
  }, [wanted, tables]);
  return tables;
}

// ── The picker ─────────────────────────────────────────────────────────────

export function ReadingPicker({
  surface,
  defNumber,
  metric,
  loading = false,
  compact = false,
}: ReadingPickerProps) {
  const scopeKey = readingScopeKey(defNumber);
  const answers = useQuery(api.qualitative.getAnswersForScope, { section: surface, scopeKey });
  const saveAnswer = useMutation(api.qualitative.saveAnswer);
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();

  const [openMeaning, setOpenMeaning] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  // A signed-out reader gets [] from the query, which is an answer, not a
  // silence: their line renders at once. `undefined` is the only unknown.
  const savedResolved = answers !== undefined;
  const saved = useMemo(
    () => answers?.find((a) => a.questionId === READING_QUESTION_ID)?.answer,
    [answers],
  );
  const hasPick = saved !== undefined && saved.trim().length > 0;

  const tables = useReadingTables(showOptions || hasPick);
  const rows: Part3Row[] = useMemo(
    () => (tables ? tables.readingsFor(surface, defNumber) : []),
    [tables, surface, defNumber],
  );
  const evidence = useMemo(() => buildEvidence(metric), [metric]);

  const resolved = useMemo(
    () => (tables && saved != null ? tables.resolveReading(surface, defNumber, saved) : null),
    [tables, saved, surface, defNumber],
  );
  const selectedKey = resolved?.row?.readingKey ?? null;

  const automatic = useMemo(
    () => automaticReading(surface, defNumber, metric),
    [surface, defNumber, metric],
  );
  const chosenLabel = resolved?.row?.readingLabel ?? null;
  const line = readingLine(chosenLabel, automatic);

  // Nothing is claimed until both halves have answered: the page's payload,
  // and the reader's own pick. A line that appears and then changes is worse
  // than a line that arrives a moment later.
  const settled = savedResolved && !loading && (!hasPick || tables !== null);

  // Credit metrics have no matrix row, so the line simply does not render.
  const matrixRows = useMemo(
    () => matrixRowsForMetric(surface, defNumber, metric),
    [surface, defNumber, metric],
  );
  // The rotation directions this picker can set, read from the store this
  // picker also writes to. Held in state rather than derived, because the
  // source is browser storage: a derived value has nothing to depend on, and
  // the counter that used to stand in for it said nothing about what changed.
  const [directions, setDirections] = useState<Record<string, Reading>>({});
  useEffect(() => {
    setDirections(matrixRows.length > 0 ? loadRotationDirections() : {});
  }, [matrixRows.length]);

  const pick = (label: string) => {
    setSaveFailed(false);
    void Promise.resolve()
      .then(() =>
        saveAnswer({
          section: surface,
          scopeKey,
          questionId: READING_QUESTION_ID,
          answer: label,
        }),
      )
      .catch(() => setSaveFailed(true));
  };

  const setMatrix = (metricId: string, reading: Reading) => {
    setDirections(setRotationDirection(metricId, reading));
  };

  const groupName = `reading-${surface}-${defNumber}`;
  const optionsId = `${groupName}-options`;

  if (!settled) {
    return (
      <section
        className={cn("mt-6 pt-5 border-t border-gold/10", compact && "mt-3 pt-3")}
        aria-label={LENS_COPY["picker.title"]}
        aria-busy="true"
      >
        <span
          aria-hidden="true"
          className="block h-4 w-2/3 max-w-sm rounded bg-white/5"
        />
      </section>
    );
  }

  // A metric whose definition file has no conforming reading table has nothing
  // to offer by hand. The line above still reports what the figures are, and
  // the panel says so rather than showing an empty list.
  const noReadings = tables !== null && rows.length === 0;

  return (
    <section
      className={cn("mt-6 pt-5 border-t border-gold/10", compact && "mt-3 pt-3")}
      aria-label={LENS_COPY["picker.title"]}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-sm text-white/80 leading-6 min-w-0">{line}</p>
        <span className="inline-flex items-center gap-2 shrink-0">
          <button
            type="button"
            aria-expanded={showOptions}
            // Only while the panel exists: aria-controls must name a rendered
            // element, and this one is not in the tree until it is open.
            {...(showOptions ? { "aria-controls": optionsId } : {})}
            onClick={() => setShowOptions((o) => !o)}
            className={LINK_CLASS}
          >
            {showOptions ? LENS_COPY["picker.auto.close"] : LENS_COPY["picker.auto.change"]}
          </button>
          {chosenLabel && (
            <>
              <span aria-hidden="true" className="text-white/20">
                ·
              </span>
              <button type="button" onClick={() => pick("")} className={LINK_CLASS}>
                {LENS_COPY["picker.auto.useAutomatic"]}
              </button>
            </>
          )}
        </span>
      </div>

      {resolved?.orphaned && (
        <p className="mt-2 text-sm text-gold/80 leading-6">{LENS_COPY["picker.orphan"]}</p>
      )}

      {saveFailed && (
        <p className="mt-2 text-sm text-red-300/80 leading-6">
          {isAuthenticated || authLoading
            ? LENS_COPY["picker.saveError"]
            : LENS_COPY["picker.saveSignedOut"]}
        </p>
      )}

      {showOptions && (
        <div id={optionsId} className="mt-4">
          <h4
            id={`${groupName}-heading`}
            className="font-display text-base font-semibold text-gold leading-tight"
          >
            {LENS_COPY["picker.title"]}
          </h4>
          {!compact && (
            <p className="text-sm text-white/50 leading-6 mt-1">{LENS_COPY["picker.intro"]}</p>
          )}

          <div className="mt-3 panel-soft p-3 sm:p-4 space-y-1.5">
            <EvidenceLine label={LENS_COPY["picker.latest"]} value={evidence.latest} />
            <EvidenceLine label={LENS_COPY["picker.trend"]} value={evidence.trend} />
            <EvidenceLine label={LENS_COPY["picker.level"]} value={evidence.level} />
          </div>

          {noReadings && (
            <p className="mt-3 text-sm text-white/50 leading-6">{LENS_COPY["picker.noTable"]}</p>
          )}

          {tables === null && (
            <span aria-hidden="true" className="mt-3 block h-4 w-1/2 max-w-xs rounded bg-white/5" />
          )}

          <div
            role="radiogroup"
            aria-labelledby={`${groupName}-heading`}
            className={cn("mt-3 space-y-1.5", (noReadings || tables === null) && "hidden")}
          >
            <label
              className={cn(
                "flex items-start gap-2.5 rounded-md px-2.5 py-2 cursor-pointer",
                "hover:bg-white/5 focus-within:ring-1 focus-within:ring-gold/60",
              )}
            >
              <input
                type="radio"
                name={groupName}
                className="mt-1 shrink-0 accent-gold focus:outline-none"
                checked={selectedKey === null && !resolved?.orphaned}
                onChange={() => pick("")}
              />
              <span className="text-sm text-white/55 leading-6">{LENS_COPY["picker.undecided"]}</span>
            </label>

            {rows.map((row) => {
              const isOpen = openMeaning === row.readingKey;
              const meaningId = `${groupName}-${row.readingKey}-meaning`;
              return (
                <div key={row.readingKey} className="rounded-md">
                  <label
                    className={cn(
                      "flex items-start gap-2.5 rounded-md px-2.5 py-2 cursor-pointer",
                      "hover:bg-white/5 focus-within:ring-1 focus-within:ring-gold/60",
                      selectedKey === row.readingKey && "bg-gold/10",
                    )}
                  >
                    <input
                      type="radio"
                      name={groupName}
                      className="mt-1 shrink-0 accent-gold focus:outline-none"
                      checked={selectedKey === row.readingKey}
                      onChange={() => pick(row.readingLabel)}
                    />
                    <span className="text-sm text-white/80 leading-6 min-w-0">{row.readingLabel}</span>
                  </label>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    {...(isOpen ? { "aria-controls": meaningId } : {})}
                    onClick={() => setOpenMeaning(isOpen ? null : row.readingKey)}
                    className="ml-9 mb-1 inline-flex items-center gap-1 font-mono text-[0.7rem] uppercase tracking-wider text-white/40 hover:text-gold focus:outline-none focus-visible:ring-1 focus-visible:ring-gold/60 rounded"
                  >
                    <ChevronDown className={cn("w-3 h-3 transition-transform", isOpen && "rotate-180")} />
                    {isOpen ? LENS_COPY["picker.meaningHide"] : LENS_COPY["picker.meaningToggle"]}
                  </button>
                  {isOpen && (
                    <p id={meaningId} className="ml-9 mr-1 mb-2 text-sm text-white/60 leading-6">
                      {row.meaning}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {selectedKey !== null &&
            matrixRows.map((row) => (
              <div key={row.id} className="mt-3 pt-3 border-t border-gold/10">
                <p className="text-sm text-white/60 leading-6">
                  {fillCopy("picker.rotationLine", {
                    row: row.name,
                    direction: directions[row.id]
                      ? TREND_WORD[directions[row.id]]
                      : LENS_COPY["picker.rotationUnset"],
                  })}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[0.7rem] uppercase tracking-wider text-white/40">
                    {LENS_COPY["picker.rotationSet"]}
                  </span>
                  {(["up", "neutral", "down"] as const).map((reading) => (
                    <button
                      key={reading}
                      type="button"
                      onClick={() => setMatrix(row.id, reading)}
                      aria-pressed={directions[row.id] === reading}
                      className={cn(
                        "btn-ghost px-2.5 py-1 text-[0.7rem] font-mono uppercase tracking-wider rounded",
                        "focus:outline-none focus-visible:ring-1 focus-visible:ring-gold/60",
                        directions[row.id] === reading
                          ? "text-gold border-gold/50 bg-gold/10"
                          : "text-white/50 hover:text-gold",
                      )}
                    >
                      {TREND_WORD[reading]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </section>
  );
}

export default ReadingPicker;
