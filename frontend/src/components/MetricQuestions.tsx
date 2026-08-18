import { useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Metric, SectionKey } from "../lib/types";
import { QuestionField } from "./QuestionField";
import {
  historicalTrendQuestion,
  sectorBenefitQuestion,
  sectorExclusionHint,
  sectorExclusionQuestion,
  summarizeTrendForAI,
} from "../lib/aiDataContext";
import { sectorsHurtByEconMetric } from "../lib/sectorRotation";

interface MetricQuestionsProps {
  /** Definition number (economic 1-56, credit 1-17); with `section` it
   *  namespaces the saved answers so surfaces never share a scope. */
  metricNumber: number;
  questions: string[];
  /** The page's computed figures, passed to the AI answer helper. */
  dataContext?: string;
  /** The live metric behind this dropdown. When it carries a trend, a universal
   *  historical-analysis question is appended as the final question. */
  metric?: Metric;
  /** Which surface owns these answers. Defaults to economic for back-compat; the
   *  credit page passes "credit" so its answers don't collide with economic ones. */
  section?: SectionKey;
}

/** Stable Convex questionId for the appended historical-trend question. */
const HIST_QID = "q-history";

/** Stable Convex questionId for the prepended sector-benefit question. */
const SECTOR_QID = "q-sectors";

/** Stable Convex questionId for the sector-exclusion question that follows it. */
const EXCLUDE_QID = "q-exclude";

/**
 * The precise qualitative questions for one economic metric, each with its own
 * answer box, plus two universal questions when the metric carries a chart: a
 * sector-benefit question prepended first (economic surface only) and a
 * historical-trend question appended last. Lives in the metric dropdown (below the chart). Answers
 * persist to Convex under the economic section with a per-metric scope, so they
 * survive navigation and flow into the same store as the page-level answers.
 */
export function MetricQuestions({ metricNumber, questions, dataContext, metric, section = "economic" }: MetricQuestionsProps) {
  const scopeKey = `metric-${metricNumber}`;
  const saved = useQuery(api.qualitative.getAnswersForScope, { section, scopeKey });
  const saveAnswer = useMutation(api.qualitative.saveAnswer);

  const savedMap = useMemo(() => {
    const m = new Map<string, string>();
    saved?.forEach((row) => m.set(row.questionId, row.answer));
    return m;
  }, [saved]);

  const showHist = !!metric && !!metric.trend && metric.trend.length >= 2;

  // The sector-benefit question leads the deck, economic charts only: it asks
  // the user to read the CURRENT reading off the graph, so it needs one.
  const showSectors = showHist && section === "economic";

  // The historical question carries the metric's actual series alongside the page
  // figures, so its "Explain using AI" analyses the real trajectory, not the level.
  const histDataContext = useMemo(() => {
    if (!showHist) return dataContext;
    return [dataContext, summarizeTrendForAI(metric!)].filter(Boolean).join("\n\n") || undefined;
  }, [dataContext, metric, showHist]);

  if (questions.length === 0 && !showHist) return null;

  // The exclusion question is the sector-benefit question's inverse and shares
  // its gating: economic charts only, current reading required.
  const showExclude = showSectors;
  const excludeHint = showExclude ? sectorExclusionHint(sectorsHurtByEconMetric(metricNumber)) : "";

  const total = questions.length + (showHist ? 1 : 0) + (showSectors ? 1 : 0) + (showExclude ? 1 : 0);
  // Display numbering only; Convex questionIds (q1..qN, q-history) never move.
  const offset = (showSectors ? 1 : 0) + (showExclude ? 1 : 0);

  return (
    <section className="mt-6 pt-5 border-t border-gold/10">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h4 className="font-display text-base font-semibold text-gold leading-tight">
          Precise Qualitative Questions
        </h4>
        <span className="font-mono text-[0.7rem] text-white/35 shrink-0">
          {savedMap.size}/{total} answered
        </span>
      </div>
      <div className="space-y-4">
        {showSectors && (
          <QuestionField
            key={SECTOR_QID}
            questionId={`${scopeKey}-${SECTOR_QID}`}
            question={`1. ${sectorBenefitQuestion(metric!.name)}`}
            hint="Name the favored sectors, then test durability. Check your answer against the Sector Rotation matrix."
            section={section}
            scopeKey={scopeKey}
            dataContext={histDataContext}
            initialAnswer={savedMap.get(SECTOR_QID) ?? ""}
            onSave={async (value) =>
              await saveAnswer({ section, scopeKey, questionId: SECTOR_QID, answer: value })
            }
          />
        )}
        {showExclude && (
          <QuestionField
            key={EXCLUDE_QID}
            questionId={`${scopeKey}-${EXCLUDE_QID}`}
            question={`2. ${sectorExclusionQuestion(metric!.name)}`}
            hint={excludeHint}
            section={section}
            scopeKey={scopeKey}
            dataContext={histDataContext}
            initialAnswer={savedMap.get(EXCLUDE_QID) ?? ""}
            onSave={async (value) =>
              await saveAnswer({ section, scopeKey, questionId: EXCLUDE_QID, answer: value })
            }
          />
        )}
        {questions.map((question, i) => {
          const qid = `q${i + 1}`;
          return (
            <QuestionField
              key={qid}
              questionId={`${scopeKey}-${qid}`}
              question={`${i + 1 + offset}. ${question}`}
              section={section}
              scopeKey={scopeKey}
              dataContext={dataContext}
              initialAnswer={savedMap.get(qid) ?? ""}
              onSave={async (value) =>
                await saveAnswer({ section, scopeKey, questionId: qid, answer: value })
              }
            />
          );
        })}
        {showHist && (
          <QuestionField
            key={HIST_QID}
            questionId={`${scopeKey}-${HIST_QID}`}
            question={`${questions.length + 1 + offset}. ${historicalTrendQuestion(metric!.name)}`}
            hint="Historical trend analysis. Explain using AI reads the chart's actual trajectory against the investing texts."
            section={section}
            scopeKey={scopeKey}
            dataContext={histDataContext}
            initialAnswer={savedMap.get(HIST_QID) ?? ""}
            onSave={async (value) =>
              await saveAnswer({ section, scopeKey, questionId: HIST_QID, answer: value })
            }
          />
        )}
      </div>
    </section>
  );
}
