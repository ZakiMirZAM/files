// One saved qualitative answer, read the way QualitativeBlock reads them.
//
// Four components used to repeat the same three steps: query every answer for
// the scope, find the row whose questionId matches, and fall back to "" while
// the query is still resolving or the reader is signed out.

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { SectionKey } from "./types";

/**
 * The answer saved under (section, scopeKey, questionId), or "" when there is
 * none yet, the query has not resolved, or the reader is not signed in.
 */
export function useSavedAnswer(
  section: SectionKey,
  scopeKey: string,
  questionId: string,
): string {
  const answers = useQuery(api.qualitative.getAnswersForScope, { section, scopeKey });
  return useMemo(() => {
    if (!answers) return "";
    return answers.find((a) => a.questionId === questionId)?.answer ?? "";
  }, [answers, questionId]);
}

/**
 * The raw answer, kept separate because ReasonedRating has to tell "no row yet"
 * from "a row holding an empty string": the first leaves its own state alone,
 * the second clears it.
 */
export function useSavedAnswerRaw(
  section: SectionKey,
  scopeKey: string,
  questionId: string,
): string | undefined {
  const answers = useQuery(api.qualitative.getAnswersForScope, { section, scopeKey });
  return useMemo(() => {
    if (!answers) return undefined;
    return answers.find((a) => a.questionId === questionId)?.answer;
  }, [answers, questionId]);
}
