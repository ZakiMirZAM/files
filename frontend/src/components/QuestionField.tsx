import { useEffect, useState } from "react";
import { Check, CircleDashed, Sparkles } from "lucide-react";
import type { IntegritySeverity, SectionKey } from "../lib/types";
import type { PageAiContext } from "../lib/aiContextStore";
import { useDebouncedSave } from "../lib/useDebouncedSave";
import { CONNECT_AI } from "../lib/connectQuestions";
import { budgetWaitMessage } from "../lib/askBudget";
import { useAskAi } from "../lib/useAskAi";
import { questionWithSteps } from "../lib/questionPrompt";
import { cn } from "../lib/cn";

export { EXTRA_CONTEXT_TIMEOUT_MS } from "../lib/useAskAi";

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
  /** Gather this page context's block instead of the page in view. */
  gatherContext?: PageAiContext;
}

/** How long the textarea waits after the last keystroke before it saves. */
const SAVE_DELAY_MS = 650;

const SEVERITY_DOT: Record<string, string> = {
  high: "bg-loss",
  medium: "bg-gold",
};

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
  gatherContext,
}: QuestionFieldProps) {
  const [value, setValue] = useState(initialAnswer);
  const { status, lastSaved } = useDebouncedSave(value, onSave, SAVE_DELAY_MS);
  const { ask: askAi, allowed, seconds, gatherFailed } = useAskAi();

  useEffect(() => {
    // Sync initial value when the query resolves after first render.
    if (initialAnswer && lastSaved.current !== initialAnswer && value === "") {
      setValue(initialAnswer);
      lastSaved.current = initialAnswer;
    }
  }, [initialAnswer]);

  const ask = () =>
    askAi({
      // The steps and the closing sentence ride with the question, as shown.
      question: questionWithSteps(question, steps, close),
      guidance,
      questionId,
      section,
      scopeKey,
      dataContext,
      gatherContext,
      onCopy: (text) => setValue(text),
    });

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
