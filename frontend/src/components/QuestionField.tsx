import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useConvex } from "convex/react";
import { Check, CircleDashed, Sparkles } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { IntegritySeverity, SectionKey } from "../lib/types";
import { openAi } from "../lib/aiPanelStore";
import { useDebouncedSave } from "../lib/useDebouncedSave";
import { askPrompt, askDataContext, questionWithSteps } from "../lib/questionPrompt";
import { CONNECT_AI } from "../lib/connectQuestions";
import { budgetWaitMessage, secondsUntilAllowed, subscribeAskBudget } from "../lib/askBudget";
import { getPageAiContext } from "../lib/aiContextStore";
import { pageGatherFor } from "../lib/pageStageContext";
import type { SavedAnswer } from "../lib/stageContextLoader";
import { cn } from "../lib/cn";

export interface QuestionFieldProps {
  /** Unique id for the textarea + AI-answer cache (namespaced per scope). */
  questionId: string;
  question: string;
  hint?: string;
  /** Numbered steps shown under the question and sent to the tutor with it. */
  steps?: string[];
  /** The closing teaching sentence shown after the steps. */
  close?: string;
  section: SectionKey;
  scopeKey: string;
  dataContext?: string;
  initialAnswer: string;
  onSave: (value: string) => Promise<unknown>;
  /** Optional flag dot before the question (used by the integrity deck to show
   *  which checks fired on this sector/industry). */
  severity?: IntegritySeverity;
  /** Hidden tutor guidance. NEVER rendered: it is sent ahead of the question
   *  text in the AI request and nowhere else. */
  guidance?: string;
}

/** How long the textarea waits after the last keystroke before it saves. */
const SAVE_DELAY_MS = 650;

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

const SEVERITY_DOT: Record<string, string> = {
  high: "bg-loss",
  medium: "bg-gold",
};

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

/**
 * One qualitative question: a textarea that autosaves on a debounce, with a
 * save-status line and an "Explain using AI" shortcut that drops a drafted
 * answer back into the box. Shared by the page-level QualitativeBlock and the
 * per-metric question lists in the economic dropdowns.
 */
export function QuestionField({
  questionId,
  question,
  hint,
  steps,
  close,
  section,
  scopeKey,
  dataContext,
  initialAnswer,
  onSave,
  severity,
  guidance,
}: QuestionFieldProps) {
  const [value, setValue] = useState(initialAnswer);
  const [gatherFailed, setGatherFailed] = useState(false);
  const { status, lastSaved } = useDebouncedSave(value, onSave, SAVE_DELAY_MS);
  const convex = useConvex();

  // True while this field is on screen. The gather it starts runs in the AI
  // panel, which is mounted once in the app shell and never unmounts, so this
  // ref is the only thing that knows the reader has left the page the question
  // was about.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // The server allows three questions a minute. Reading the budget here rather
  // than inside askQuestion means the button is already disabled when the next
  // one would be refused, instead of the reader waiting out a whole gather to
  // be told so. The store owns the countdown and the one timer that drives it,
  // so the snapshot is a plain number of seconds and this field holds no timer
  // of its own.
  const seconds = useSyncExternalStore(subscribeAskBudget, () => secondsUntilAllowed());
  const allowed = seconds === 0;

  useEffect(() => {
    // Sync initial value when the query resolves after first render.
    if (initialAnswer && lastSaved.current !== initialAnswer && value === "") {
      setValue(initialAnswer);
      lastSaved.current = initialAnswer;
    }
  }, [initialAnswer]);

  /**
   * The reader's own saved answers for the scopes this block covers.
   *
   * The Convex client lives in the React tree, which is why this is here and
   * not in the loader. Signed out, offline, or any failure at all costs the
   * block its notes and nothing else.
   */
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

  const ask = () => {
    if (!allowed) return;
    // The cross-stage figures for whichever page is in view, or undefined when
    // that page has no earlier stage to gather (the economic page, the final
    // review). Resolved on the click, not at render time, so a field that
    // mounted before its page published its subject still gathers the right
    // block.
    const gather = pageGatherFor(getPageAiContext(), {
      readAnswers,
      excludeQuestionId: questionId,
    });
    const gatherData = gather
      ? async (panelSignal: AbortSignal): Promise<string | null> => {
          setGatherFailed(false);
          // One controller for this gather: the panel's signal and the wait
          // below both abort it, and it is what the requests carry. Giving up
          // therefore stops them, instead of leaving a dozen running after the
          // reader has been told they failed.
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
          return askDataContext(dataContext, extra) ?? "";
        }
      : undefined;
    openAi({
      mode: "answer",
      title: question.length > 80 ? `${question.slice(0, 80)}…` : question,
      // The guidance travels in the question slot and is never rendered. The
      // steps and the closing sentence ride with the question, as shown.
      question: askPrompt(questionWithSteps(question, steps, close), guidance),
      questionId,
      section,
      context: scopeKey,
      // What the question carries when the figures are not gathered at all, or
      // when gathering them fails.
      dataContext: askDataContext(dataContext, ""),
      gatherData,
      onCopy: (text) => setValue(text),
    });
  };

  return (
    <div className="panel-soft p-5 transition-colors hover:border-gold/25">
      <label htmlFor={questionId} className="block mb-2">
        <span className="text-[0.95rem] text-white/85 leading-snug inline-flex items-start gap-2">
          {severity && SEVERITY_DOT[severity] && (
            <span
              className={cn("w-2 h-2 rounded-full shrink-0 mt-1.5", SEVERITY_DOT[severity])}
              title={severity === "high" ? "This check flagged something notable" : "This check flagged something to look at"}
            />
          )}
          <span>{question}</span>
        </span>
        {hint && <span className="block text-xs text-white/35 mt-1">{hint}</span>}
      </label>
      {steps && steps.length > 0 && (
        <div className="mt-2 text-sm text-white/70 leading-relaxed">
          <p>Work it out in steps:</p>
          <ol className="list-decimal pl-5 mt-1 space-y-1">
            {steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      )}
      {close && <p className="mt-2 text-sm text-white/70 leading-relaxed">{close}</p>}
      <button
        type="button"
        disabled={!allowed}
        title={allowed ? undefined : budgetWaitMessage(seconds)}
        onClick={ask}
        className="mb-2.5 inline-flex items-center gap-1.5 text-[0.7rem] font-mono uppercase tracking-wider text-gold/70 hover:text-gold transition-colors disabled:opacity-60 disabled:hover:text-gold/70"
      >
        <Sparkles className="w-3 h-3" />
        Explain using AI
      </button>
      {!allowed && (
        <p className="mb-2.5 text-[0.7rem] text-white/40">
          {budgetWaitMessage(seconds)}
        </p>
      )}
      {gatherFailed && (
        <p className="mb-2.5 text-[0.7rem] text-white/40">{CONNECT_AI.gatherFailed}</p>
      )}
      <textarea
        id={questionId}
        className="textarea"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Your analysis..."
        rows={3}
      />
      <div className="mt-2 h-4 flex items-center text-[0.7rem] font-mono">
        {status === "saving" && (
          <span className="text-white/40 inline-flex items-center gap-1.5">
            <CircleDashed className="w-3 h-3 animate-spin" /> saving...
          </span>
        )}
        {status === "saved" && (
          <span className="text-gain-strong inline-flex items-center gap-1.5">
            <Check className="w-3 h-3" /> saved
          </span>
        )}
        {status === "error" && <span className="text-loss">save failed, try again</span>}
      </div>
    </div>
  );
}
