import { useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Metric, SectionKey } from "../lib/types";
import { QuestionField } from "./QuestionField";
import { historicalTrendQuestion, summarizeTrendForAI } from "../lib/aiDataContext";

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

/**
 * The precise qualitative questions for one economic metric, each with its own
 * answer box, plus a universal historical-trend question appended last when the
 * metric carries a chart. Lives in the metric dropdown (below the chart). Answers
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

  // The historical question carries the metric's actual series alongside the page
  // figures, so its "Explain using AI" analyses the real trajectory, not the level.
  const histDataContext = useMemo(() => {
    if (!showHist) return dataContext;
    return [dataContext, summarizeTrendForAI(metric!)].filter(Boolean).join("\n\n") || undefined;
  }, [dataContext, metric, showHist]);

  if (questions.length === 0 && !showHist) return null;

  const total = questions.length + (showHist ? 1 : 0);

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
        {questions.map((question, i) => {
          const qid = `q${i + 1}`;
          return (
            <QuestionField
              key={qid}
              questionId={`${scopeKey}-${qid}`}
              question={`${i + 1}. ${question}`}
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
            question={`${questions.length + 1}. ${historicalTrendQuestion(metric!.name)}`}
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
