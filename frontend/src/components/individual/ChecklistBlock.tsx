import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Check, ClipboardList } from "lucide-react";
import { COMPANY_CHECKLIST, CHECKLIST_ITEM_COUNT } from "../../lib/checklist";
import { cn } from "../../lib/cn";

interface ChecklistBlockProps {
  ticker: string;
}

const SECTION = "individual" as const;

/**
 * Erickson "Own the Best" company checklist. Each item is a per-ticker yes/no that
 * persists to the existing Convex qualitativeAnswers table (answer "done" | "").
 * Category headers, item wording, and the source notes are rendered verbatim.
 */
export function ChecklistBlock({ ticker }: ChecklistBlockProps) {
  const saved = useQuery(api.qualitative.getAnswersForScope, { section: SECTION, scopeKey: ticker });
  const saveAnswer = useMutation(api.qualitative.saveAnswer);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const savedMap = useMemo(() => {
    const m = new Map<string, string>();
    saved?.forEach((row) => m.set(row.questionId, row.answer));
    return m;
  }, [saved]);

  const isDone = (id: string): boolean => (id in overrides ? overrides[id] : savedMap.get(id) === "done");

  const toggle = async (id: string) => {
    const next = !isDone(id);
    setOverrides((o) => ({ ...o, [id]: next }));
    try {
      await saveAnswer({ section: SECTION, scopeKey: ticker, questionId: id, answer: next ? "done" : "" });
    } catch {
      setOverrides((o) => ({ ...o, [id]: !next }));
    }
  };

  const doneCount = COMPANY_CHECKLIST.reduce(
    (n, cat) => n + cat.items.filter((it) => isDone(it.id)).length,
    0,
  );

  return (
    <section className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <p className="eyebrow inline-flex items-center gap-2">
            <ClipboardList className="w-4 h-4" /> Company Checklist
          </p>
          <h2 className="font-display text-2xl md:text-3xl font-semibold text-white mt-1">Own the Best, Leave the Rest</h2>
        </div>
        <p className="hidden md:block text-xs font-mono text-white/30">
          {doneCount} / {CHECKLIST_ITEM_COUNT} done
        </p>
      </div>

      {COMPANY_CHECKLIST.map((cat) => (
        <div key={cat.title}>
          <h3 className="font-display text-lg font-semibold text-gold mb-3 flex items-center gap-3">
            <span className="block w-6 h-px bg-gold/60" />
            {cat.title}
          </h3>
          <div className="space-y-2">
            {cat.items.map((item) => {
              const done = isDone(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  role="checkbox"
                  aria-checked={done}
                  onClick={() => toggle(item.id)}
                  className={cn(
                    "w-full text-left panel-soft px-4 py-3 flex items-start gap-3 transition-colors hover:border-gold/25",
                    done && "border-gain/30 bg-gain-ghost",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 w-5 h-5 rounded-sm border flex items-center justify-center shrink-0 transition-colors",
                      done ? "bg-gain/20 border-gain/50 text-gain-strong" : "border-white/25 text-transparent",
                    )}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </span>
                  <span className={cn("text-[0.95rem] leading-snug", done ? "text-white/90" : "text-white/75")}>
                    {item.text}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
