// The "Explain using AI" click, shared by every surface that opens the AI
// panel on a question: QuestionField, the "Question the comparison" box and the
// deck tutor. It owns the ask budget read, the cross-stage gather for the page
// in view, the reader's saved answers and the abort-on-leave rule, so each
// caller only supplies the question.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useConvex } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { SectionKey } from "./types";
import { openAi } from "./aiPanelStore";
import { askPrompt, askDataContext } from "./questionPrompt";
import { secondsUntilAllowed, subscribeAskBudget } from "./askBudget";
import { getPageAiContext, type PageAiContext } from "./aiContextStore";
import { pageGatherFor } from "./pageStageContext";
import type { SavedAnswer } from "./stageContextLoader";

/**
 * How long the extra figures may take before the answer goes without them.
 *
 * It must not be shorter than the per-request wait in
 * `lib/stageContext/sources.ts` (REQUEST_TIMEOUT_MS, ninety seconds), which is
 * what the slowest cold call is allowed. At sixty the gather always lost that
 * race: the reader was told the figures had not loaded while a dozen requests
 * carried on running, and every one of them still finished and filled the
 * cache thirty seconds after nobody was waiting. A warm sector gather measures
 * about twenty one seconds, so this ceiling is only ever reached from a cold
 * backend, which is exactly when the ninety second requests need it.
 */
export const EXTRA_CONTEXT_TIMEOUT_MS = 90_000;

/** Reject after `ms` rather than keeping the reader waiting on one slow call. */
function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      onTimeout();
      reject(new Error("timed out"));
    }, ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        window.clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export interface AskRequest {
  /** The visible question, used for the panel title. */
  question: string;
  /** Hidden instruction, sent ahead of the question and never rendered. */
  guidance?: string;
  /** AI-answer cache key (namespaced per scope). */
  questionId: string;
  section: SectionKey;
  scopeKey: string;
  /** The page's own figures, sent ahead of the gathered block. */
  dataContext?: string;
  /** Gather this page context's block instead of the page in view (the Final
   *  Review's sell deck gathers the company stage for the reviewed ticker). */
  gatherContext?: PageAiContext;
  onCopy?: (text: string) => void;
}

export function useAskAi() {
  const [gatherFailed, setGatherFailed] = useState(false);
  const convex = useConvex();

  // True while the caller is on screen. The gather runs in the AI panel, which
  // is mounted once in the app shell and never unmounts, so this ref is the
  // only thing that knows the reader has left the page the question was about.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // The server allows three questions a minute. Reading the budget here means
  // the button is already disabled when the next one would be refused.
  const seconds = useSyncExternalStore(subscribeAskBudget, () => secondsUntilAllowed());
  const allowed = seconds === 0;

  /** The reader's own saved answers for the scopes the gathered block covers.
   *  Signed out, offline, or any failure costs the block its notes only. */
  const readAnswers = async (
    scopes: { section: string; scopeKey: string }[],
  ): Promise<SavedAnswer[]> => {
    const rows = await Promise.all(
      scopes.map(async (scope) => {
        try {
          return (await convex.query(
            api.qualitative.getAnswersForScope,
            scope as { section: SectionKey; scopeKey: string },
          )) as SavedAnswer[];
        } catch {
          return [] as SavedAnswer[];
        }
      }),
    );
    return rows.flat();
  };

  const ask = (req: AskRequest) => {
    if (!allowed) return;
    // Resolved on the click, not at render time, so a caller that mounted
    // before its page published its subject still gathers the right block.
    const gather = pageGatherFor(req.gatherContext ?? getPageAiContext(), {
      readAnswers,
      excludeQuestionId: req.questionId,
    });
    const gatherData = gather
      ? async (panelSignal: AbortSignal): Promise<string | null> => {
          setGatherFailed(false);
          const stop = new AbortController();
          const relay = () => stop.abort();
          panelSignal.addEventListener("abort", relay);
          let extra = "";
          try {
            extra = await withTimeout(gather(stop.signal), EXTRA_CONTEXT_TIMEOUT_MS, () =>
              stop.abort(),
            );
          } catch {
            if (mounted.current) setGatherFailed(true);
          } finally {
            panelSignal.removeEventListener("abort", relay);
          }
          // The reader left the page the question is about. Asking anyway
          // would answer it against another page and spend a model call.
          if (!mounted.current) {
            stop.abort();
            return null;
          }
          return askDataContext(req.dataContext, extra) ?? "";
        }
      : undefined;
    openAi({
      mode: "answer",
      title: req.question.length > 80 ? `${req.question.slice(0, 80)}…` : req.question,
      // The guidance travels in the question slot and is never rendered.
      question: askPrompt(req.question, req.guidance),
      questionId: req.questionId,
      section: req.section,
      context: req.scopeKey,
      dataContext: askDataContext(req.dataContext, ""),
      gatherData,
      onCopy: req.onCopy,
    });
  };

  return { ask, allowed, seconds, gatherFailed };
}
