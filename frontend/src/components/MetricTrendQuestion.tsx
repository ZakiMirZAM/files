import { useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { Sparkles } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Metric, SectionKey } from "../lib/types";
import { QuestionField } from "./QuestionField";
import { historicalTrendQuestion, summarizeTrendForAI } from "../lib/aiDataContext";
import { getPageAiContext } from "../lib/aiContextStore";
import { openAi } from "../lib/aiPanelStore";

interface MetricTrendQuestionProps {
  metric: Metric;
  /** When both section and scopeKey are set, the answer persists to Convex; the
   *  economic dropdowns append their own copy, so this is used by the shared
   *  definition sidebar (Ask-AI-only) and the individual statement-trend chart. */
  section?: SectionKey;
  scopeKey?: string;
  /** Page figures to prepend; falls back to the global page AI context. */
  baseDataContext?: string;
}

/** Stable Convex questionId / AI-answer cache key for the historical question. */
const HIST_QID = "q-history";

/**
 * The one universal "why did this metric trend this way, and what does it mean"
 * question, attached beneath a metric's historical chart. Its "Explain using AI"
 * carries a compact summary of the ACTUAL series so the RAG analyses the real
 * trajectory against the vault's investing texts, not just the latest value.
 */
export function MetricTrendQuestion({
  metric,
  section,
  scopeKey,
  baseDataContext,
}: MetricTrendQuestionProps) {
  const enough = !!metric.trend && metric.trend.length >= 2;

  const dataContext = useMemo(() => {
    if (!enough) return undefined;
    const base = baseDataContext ?? getPageAiContext().dataContext;
    return [base, summarizeTrendForAI(metric)].filter(Boolean).join("\n\n") || undefined;
  }, [metric, baseDataContext, enough]);

  if (!enough) return null;

  const question = historicalTrendQuestion(metric.name);

  if (section && scopeKey) {
    return (
      <PersistedTrendQuestion
        metric={metric}
        section={section}
        scopeKey={scopeKey}
        question={question}
        dataContext={dataContext}
      />
    );
  }

  const page = getPageAiContext();
  return (
    <AskOnlyTrendQuestion
      metricId={metric.id}
      question={question}
      section={page.section}
      subject={page.subject}
      dataContext={dataContext}
    />
  );
}

function PersistedTrendQuestion({
  section,
  scopeKey,
  question,
  dataContext,
}: {
  metric: Metric;
  section: SectionKey;
  scopeKey: string;
  question: string;
  dataContext?: string;
}) {
  const saved = useQuery(api.qualitative.getAnswersForScope, { section, scopeKey });
  const saveAnswer = useMutation(api.qualitative.saveAnswer);
  const initial = useMemo(
    () => saved?.find((r) => r.questionId === HIST_QID)?.answer ?? "",
    [saved],
  );

  return (
    <div className="mt-4">
      <QuestionField
        questionId={`${scopeKey}-${HIST_QID}`}
        question={question}
        hint="Historical trend analysis. Explain using AI reads the chart's actual trajectory against the investing texts."
        section={section}
        scopeKey={scopeKey}
        dataContext={dataContext}
        initialAnswer={initial}
        onSave={async (value) =>
          await saveAnswer({ section, scopeKey, questionId: HIST_QID, answer: value })
        }
      />
    </div>
  );
}

function AskOnlyTrendQuestion({
  metricId,
  question,
  section,
  subject,
  dataContext,
}: {
  metricId: string;
  question: string;
  section?: SectionKey;
  subject?: string;
  dataContext?: string;
}) {
  return (
    <div className="mt-4 panel-soft p-4">
      <p className="text-[0.7rem] uppercase tracking-wider font-mono text-gold/70 mb-2">
        Historical Trend Analysis
      </p>
      <p className="text-sm text-white/80 leading-snug mb-3">{question}</p>
      <button
        type="button"
        onClick={() =>
          openAi({
            mode: "answer",
            title: "Historical trend analysis",
            question,
            questionId: `hist-${metricId}`,
            section,
            context: subject,
            dataContext,
          })
        }
        className="inline-flex items-center gap-1.5 text-[0.7rem] font-mono uppercase tracking-wider text-gold/70 hover:text-gold transition-colors"
      >
        <Sparkles className="w-3 h-3" /> Explain using AI
      </button>
    </div>
  );
}
