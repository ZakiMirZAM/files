import { useEffect, useRef, useState } from "react";
import { Check, CircleDashed, Sparkles } from "lucide-react";
import type { IntegritySeverity, SectionKey } from "../lib/types";
import { openAi } from "../lib/aiPanelStore";
import { cn } from "../lib/cn";

export interface QuestionFieldProps {
  /** Unique id for the textarea + AI-answer cache (namespaced per scope). */
  questionId: string;
  question: string;
  hint?: string;
  section: SectionKey;
  scopeKey: string;
  dataContext?: string;
  initialAnswer: string;
  onSave: (value: string) => Promise<unknown>;
  /** Optional flag dot before the question (used by the integrity deck to show
   *  which checks fired on this sector/industry). */
  severity?: IntegritySeverity;
}

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
  section,
  scopeKey,
  dataContext,
  initialAnswer,
  onSave,
  severity,
}: QuestionFieldProps) {
  const [value, setValue] = useState(initialAnswer);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const lastSaved = useRef(initialAnswer);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    // Sync initial value when the query resolves after first render.
    if (initialAnswer && lastSaved.current !== initialAnswer && value === "") {
      setValue(initialAnswer);
      lastSaved.current = initialAnswer;
    }
  }, [initialAnswer]);

  useEffect(() => {
    if (value === lastSaved.current) return;
    if (timer.current) window.clearTimeout(timer.current);
    setStatus("saving");
    timer.current = window.setTimeout(async () => {
      try {
        await onSave(value);
        lastSaved.current = value;
        setStatus("saved");
        window.setTimeout(() => setStatus("idle"), 1400);
      } catch {
        setStatus("error");
      }
    }, 650);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [value]);

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
      <button
        type="button"
        onClick={() =>
          openAi({
            mode: "answer",
            title: question.length > 80 ? `${question.slice(0, 80)}…` : question,
            question,
            questionId,
            section,
            context: scopeKey,
            dataContext,
            onCopy: (text) => setValue(text),
          })
        }
        className="mb-2.5 inline-flex items-center gap-1.5 text-[0.7rem] font-mono uppercase tracking-wider text-gold/70 hover:text-gold transition-colors"
      >
        <Sparkles className="w-3 h-3" /> Explain using AI
      </button>
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
