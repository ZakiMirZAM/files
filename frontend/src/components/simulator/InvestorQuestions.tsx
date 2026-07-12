import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ChevronDown } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { QUALITATIVE_QUESTIONS } from "../../lib/questions";
import type { SectionKey } from "../../lib/types";
import { cn } from "../../lib/cn";

// The standing question deck. These are the exact questions the software already
// asks at each stage of analysis (lib/questions.ts), surfaced here unchanged so an
// investor can run their live holdings through them. Decision-relevant stages lead
// and start expanded.
const STAGE_ORDER: { key: SectionKey; label: string }[] = [
  { key: "final_review", label: "Final Review" },
  { key: "individual", label: "Individual Stock" },
  { key: "economic", label: "Economic" },
  { key: "sector", label: "Sector" },
  { key: "industry", label: "Industry" },
  { key: "comparative", label: "Comparative" },
];

const DEFAULT_OPEN: SectionKey[] = ["final_review", "individual", "economic"];

export function InvestorQuestions() {
  const progress = useQuery(api.simulator.getProgress, { kind: "question" });
  const setProgress = useMutation(api.simulator.setProgress);
  const [open, setOpen] = useState<Set<SectionKey>>(new Set(DEFAULT_OPEN));

  const checked = useMemo(() => {
    const s = new Set<string>();
    progress?.forEach((row) => {
      if (row.state === "checked") s.add(row.key);
    });
    return s;
  }, [progress]);

  function toggleStage(key: SectionKey) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleQuestion(id: string) {
    const isChecked = checked.has(id);
    void setProgress({ kind: "question", key: id, state: isChecked ? "" : "checked" });
  }

  return (
    <div className="space-y-5">
      <div className="panel-soft px-5 py-4">
        <p className="text-sm text-white/65 leading-relaxed">
          These are the exact questions this software asks at each stage of the analysis workflow, surfaced here
          unchanged. Treat them as a standing checklist while you manage the simulated portfolio. Tick the ones
          you have genuinely thought through for your current holdings. Highlight any question and choose Explain
          using AI for a sourced answer.
        </p>
      </div>

      {STAGE_ORDER.map(({ key, label }) => {
        const groups = QUALITATIVE_QUESTIONS[key];
        const allIds = groups.flatMap((g) => g.questions.map((q) => q.id));
        const doneCount = allIds.filter((id) => checked.has(id)).length;
        const isOpen = open.has(key);
        return (
          <section key={key} className="panel overflow-hidden">
            <button
              onClick={() => toggleStage(key)}
              className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="eyebrow">Stage</span>
                <span className="font-display text-lg text-white">{label}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-mono text-xs text-white/40">
                  {doneCount}/{allIds.length}
                </span>
                <ChevronDown className={cn("w-4 h-4 text-white/40 transition-transform", isOpen && "rotate-180")} />
              </div>
            </button>

            {isOpen && (
              <div className="px-5 pb-5 space-y-6">
                {groups.map((group) => (
                  <div key={group.title}>
                    <h4 className="font-display text-sm font-semibold text-gold mt-2 mb-2.5 flex items-center gap-2.5">
                      <span className="block w-4 h-px bg-gold/50" />
                      {group.title}
                    </h4>
                    <ul className="space-y-1.5">
                      {group.questions.map((q) => {
                        const isChecked = checked.has(q.id);
                        return (
                          <li key={q.id}>
                            <label className="flex items-start gap-3 px-3 py-2 rounded-sm hover:bg-white/[0.02] cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleQuestion(q.id)}
                                className="mt-1 accent-gold w-4 h-4 shrink-0"
                              />
                              <span
                                className={cn(
                                  "text-sm leading-7 text-white/80",
                                  isChecked && "text-white/40 line-through decoration-gold/40",
                                )}
                              >
                                {q.text}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
