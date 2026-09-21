// The review sheet for the automatic readings, built from the rule registry.
//
// lib/readingRules.draft.md is not imported by the app. It exists so the owner
// can read every rule next to the sentence of their own definition file it was
// taken from, and say where a threshold is wrong. Because it is generated, it
// cannot drift: readingRulesSheet.test.ts rebuilds it and fails while the file
// on disk differs.
//
// The sheet has three tables. This module writes the first two, which are a
// pure function of the registry, so they pick up the economic rules the moment
// those files land. The third is a dated snapshot of what the engine decided
// against the live backend on one day; it is preserved word for word from the
// file rather than regenerated, because rebuilding it would need a network.

import { DEFAULT_READS } from "./readingRules/types";
import type { MetricRules, ReadingRule, ReadsFact } from "./readingRules/types";

/** How the sheet names each fact a rule can decide on, and so print. */
const READS_WORDS: Record<ReadsFact, string> = {
  latest: "the latest observation",
  yoyChangePct: "the year-over-year percent change",
  yoyChangeAbs: "the change over the year, in the series' own unit",
};

/** The fact this rule decides on, which is the figure the line prints. */
function readsOf(metric: MetricRules, rule: ReadingRule): string {
  return READS_WORDS[rule.reads ?? metric.reads ?? DEFAULT_READS];
}

/** Everything from this heading on is the dated snapshot, kept as it is. */
export const SNAPSHOT_MARKER = "## Table 3: the live result";

/** One markdown cell: no pipes, no line breaks, nothing else changed. */
function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim();
}

function surfaceOrder(m: MetricRules): string {
  return `${m.surface}|${String(m.defNumber).padStart(3, "0")}`;
}

function sorted(rules: MetricRules[]): MetricRules[] {
  return [...rules].sort((a, b) => surfaceOrder(a).localeCompare(surfaceOrder(b)));
}

const HEAD = `# Automatic readings, for owner review

Needs owner review.

Every economic and credit definition file states, in its "Part 3: What it tells
you" table, the readings that metric can have. This sheet lists the rule written
for each one: the condition the app tests, and the owner's own words the number
in it came from. Nothing here is a score and nothing is inferred. A rule fires
only on figures the app already has, and where the owner's text carries no
usable number the reading is listed as not determined instead of guessed.

## How to read it

* **Rule** is the condition in plain words, written in the unit the live
  payload delivers for that series. A percent series is already a percent; the
  one place a unit is converted is bank reserves, which arrive in billions
  while the definition file speaks in trillions.
* **Source sentence** is the owner's own text, word for word, from the reading
  label or from its "What it means" cell.
* **Gap note** appears where the owner's labels left a level with no reading.
  The nearest reading by level was widened to cover it, and the note says what
  was assumed. Bands share their endpoints ("3 to 5" then "5 to 8"), so every
  band is read as lower bound inclusive, upper bound exclusive: five belongs to
  "5 to 8".
* A rule never fires against a movement its own label rules out. A gap note
  beginning **"Uncovered on purpose:"** names the combination of level and
  direction that is then left with no reading at all: the app says the reading
  is not determined there rather than stretching a label to fit. Those are the
  lines to read if a metric ever shows no reading when you expected one.
* A gap note beginning **"Direction word not tested:"** records a word that
  reads like a movement but describes the level instead, with the reason. A
  year-over-year percent below zero is credit contracting whichever way that
  percent is itself moving.
* A gap note beginning **"Level word not tested:"** does the same for a word
  that names a level. Most of them are there because the level word is only the
  name of a band the owner defined with his own number: a spread below three
  points is tight whether or not three points is unusual for the decade. Where
  a label names a level with NO number of its own, the rule is held to the
  series' own trailing ten years instead, and will not call a figure in the
  bottom half of that window high, or one in the top half low.
* **Figure the line prints** is the fact the rule decides on, and so the figure
  the page shows beside the reading it chose. It is the latest observation
  almost everywhere. It is the year-over-year change on the handful of LEVEL
  series whose bands are written in percent a year, because printing the level
  of an index beside "above 4% year over year" would put two numbers on the
  page that cannot both be the one the rule read.
* A reading in the second table has no rule at all. The metric simply reports
  that no reading is determined when its figures fall there, and the reader
  picks by hand.

`;

/** The generated half of the sheet: the intro and the first two tables. */
export function buildReadingRulesSheet(rules: MetricRules[]): string {
  const all = sorted(rules);
  const lines: string[] = [HEAD.trimEnd(), ""];

  const ruleCount = all.reduce((n, m) => n + m.rules.length, 0);
  const undeterminedCount = all.reduce((n, m) => n + m.undetermined.length, 0);
  const economic = all.filter((m) => m.surface === "economic").length;
  const credit = all.filter((m) => m.surface === "credit").length;

  lines.push(
    `Metrics with rules: ${credit} credit, ${economic} economic. ` +
      `Rules: ${ruleCount}. Readings with no rule: ${undeterminedCount}.`,
  );
  lines.push("");

  lines.push("## Table 1: every rule");
  lines.push("");
  lines.push(
    "| Surface | File | Metric | Reading | Rule | Figure the line prints | Source sentence | Gap note |",
  );
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const metric of all) {
    for (const rule of metric.rules) {
      lines.push(
        `| ${metric.surface} | ${metric.defNumber} | ${cell(metric.metricName)} | ` +
          `${cell(rule.reading)} | ${cell(rule.rule)} | ${cell(readsOf(metric, rule))} | ` +
          `${cell(rule.source)} | ${cell(rule.gapNote ?? "")} |`,
      );
    }
  }
  if (ruleCount === 0) lines.push("| | | | | | | | |");
  lines.push("");

  lines.push("## Table 2: readings with no rule");
  lines.push("");
  lines.push("| Surface | File | Metric | Reading | Why it is not determined |");
  lines.push("|---|---|---|---|---|");
  for (const metric of all) {
    for (const u of metric.undetermined) {
      lines.push(
        `| ${metric.surface} | ${metric.defNumber} | ${cell(metric.metricName)} | ` +
          `${cell(u.reading)} | ${cell(u.why)} |`,
      );
    }
  }
  if (undeterminedCount === 0) lines.push("| | | | | none |");
  lines.push("");

  return `${lines.join("\n")}\n`;
}
