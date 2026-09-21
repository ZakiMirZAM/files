import { useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { SectionKey } from "../lib/types";
import { QuestionField } from "./QuestionField";

interface DefinitionQuestionsProps {
  /** Which surface owns the answers (sector or industry matrix pages). */
  section: SectionKey;
  /** e.g. "Technology-def-434": one answer set per (group, definition). */
  scopeKey: string;
  /** The definition's Part 9 questions, already split out of the markdown. */
  questions: string[];
  /** Page figures + the clicked series, for the per-question AI tutor. */
  dataContext?: string;
}

/**
 * The Part 9 questions of a sector/industry definition, rendered inside the
 * sidebar as answerable fields when the opener supplied a question scope
 * (a clicked matrix cell). A slim sibling of MetricQuestions: same Convex
 * wiring and q1..qN ids, none of the economic-only generated questions.
 */
export function DefinitionQuestions({ section, scopeKey, questions, dataContext }: DefinitionQuestionsProps) {
  const saved = useQuery(api.qualitative.getAnswersForScope, { section, scopeKey });
  const saveAnswer = useMutation(api.qualitative.saveAnswer);

  const savedMap = useMemo(() => {
    const m = new Map<string, string>();
    saved?.forEach((row) => m.set(row.questionId, row.answer));
    return m;
  }, [saved]);

  if (questions.length === 0) return null;

  return (
    <section className="mt-6 pt-5 border-t border-gold/10">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h4 className="font-display text-base font-semibold text-gold leading-tight">
          Precise Qualitative Questions
        </h4>
        <span className="font-mono text-[0.7rem] text-white/35 shrink-0">
          {savedMap.size}/{questions.length} answered
        </span>
      </div>
      <div className="space-y-4">
        {questions.map((question, i) => {
          const qid = `q${i + 1}`;
          return (
            // Keyed by the scope as well as the question, so a field is never
            // carried over from one subject to the next: its textarea holds
            // unsaved text that belongs to the subject it was typed under.
            <QuestionField
              key={`${scopeKey}-${qid}`}
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
      </div>
    </section>
  );
}
