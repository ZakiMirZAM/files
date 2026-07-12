import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check, BookOpen } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { LESSONS } from "../../lib/simulatorContent";
import { Markdown } from "../Markdown";
import { cn } from "../../lib/cn";

export function LessonsReader() {
  const [activeId, setActiveId] = useState<string>(LESSONS[0]?.id ?? "");
  const progress = useQuery(api.simulator.getProgress, { kind: "lesson" });
  const setProgress = useMutation(api.simulator.setProgress);

  const readSet = useMemo(() => {
    const s = new Set<string>();
    progress?.forEach((row) => {
      if (row.state === "read") s.add(row.key);
    });
    return s;
  }, [progress]);

  const active = LESSONS.find((l) => l.id === activeId) ?? LESSONS[0];

  // Mark a lesson read once it has been open briefly.
  useEffect(() => {
    if (!active) return;
    const id = window.setTimeout(() => {
      if (!readSet.has(active.id)) {
        void setProgress({ kind: "lesson", key: active.id, state: "read" });
      }
    }, 1500);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  if (!active) {
    return <p className="text-white/40">No lessons available.</p>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[18rem_1fr] gap-6">
      {/* Lesson rail */}
      <nav className="space-y-2" data-tour="sim-lessons">
        {LESSONS.map((lesson) => {
          const isActive = lesson.id === active.id;
          const isRead = readSet.has(lesson.id);
          return (
            <button
              key={lesson.id}
              onClick={() => setActiveId(lesson.id)}
              className={cn(
                "w-full text-left panel p-3.5 transition-colors",
                isActive ? "border-gold/45" : "hover:border-gold/20",
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-[0.7rem] text-gold/70">
                  {String(lesson.number).padStart(2, "0")}
                </span>
                {isRead && <Check className="w-3.5 h-3.5 text-gain-strong" />}
              </div>
              <p className={cn("font-display text-[0.95rem] leading-snug", isActive ? "text-gold" : "text-white")}>
                {lesson.title}
              </p>
              <p className="text-xs text-white/45 mt-1 leading-snug">{lesson.summary}</p>
            </button>
          );
        })}
      </nav>

      {/* Lesson body */}
      <article className="panel p-6 lg:p-8 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <BookOpen className="w-4 h-4 text-gold" />
          <span className="eyebrow">Lesson {String(active.number).padStart(2, "0")}</span>
        </div>
        <h2 className="font-display text-3xl font-semibold text-white mb-1.5">{active.title}</h2>
        <p className="text-white/50 mb-6">{active.summary}</p>
        <Markdown content={active.body} />
        <p className="mt-8 pt-4 border-t border-gold/10 text-xs text-white/35">
          Highlight any sentence and choose Explain using AI for a sourced, plain-language explanation.
        </p>
      </article>
    </div>
  );
}
