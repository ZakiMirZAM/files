import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { QUALITATIVE_QUESTIONS } from "../lib/questions";
import type { RuntimeGroup, SectionKey } from "../lib/types";
import { ChevronDown } from "lucide-react";
import { cn } from "../lib/cn";
import { QuestionField } from "./QuestionField";

interface QualitativeBlockProps {
  section: SectionKey;
  scopeKey: string;
  /** Hide the "Frameworks & Open Questions" title block (used on the final report,
   *  where the page already has its own title). The expand/collapse controls and
   *  answered count are kept. */
  hideHeader?: boolean;
  /** Compact summary of the page's computed figures, fed to the AI answer so it uses
   *  the site's own data (e.g. the yield curve). Omit when data is mock/offline. */
  dataContext?: string;
  /** Render only these group titles (e.g. a top "Business Overview & SWOT" block). */
  onlyTitles?: string[];
  /** Render every group EXCEPT these titles (so the rest of the bank can sit elsewhere). */
  excludeTitles?: string[];
  /** Disambiguates the persisted expand/collapse state when two instances of the
   *  same section render on one page. */
  storageSuffix?: string;
  /** Runtime question deck (e.g. the integrity checks). When set, it replaces
   *  the static deck for `section`; each question may carry its own dataContext
   *  and a severity flag. `onlyTitles`/`excludeTitles` do not apply. */
  groups?: RuntimeGroup[];
}

function groupSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function QualitativeBlock({ section, scopeKey, hideHeader = false, dataContext, onlyTitles, excludeTitles, storageSuffix, groups: runtimeGroups }: QualitativeBlockProps) {
  const groups: RuntimeGroup[] = runtimeGroups
    ? runtimeGroups
    : QUALITATIVE_QUESTIONS[section].filter((g) =>
        onlyTitles ? onlyTitles.includes(g.title) : excludeTitles ? !excludeTitles.includes(g.title) : true,
      );
  const saved = useQuery(api.qualitative.getAnswersForScope, { section, scopeKey });
  const saveAnswer = useMutation(api.qualitative.saveAnswer);

  const savedMap = useMemo(() => {
    const m = new Map<string, string>();
    saved?.forEach((row) => m.set(row.questionId, row.answer));
    return m;
  }, [saved]);

  // Collapsible groups so a long question bank is not overwhelming. The open set
  // persists per section, so the user's place survives navigation; all groups
  // start collapsed.
  const storageKey = `ifed.qual.open.${section}${storageSuffix ? `.${storageSuffix}` : ""}`;
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const titles = new Set(groups.map((g) => g.title));
        return new Set((JSON.parse(raw) as string[]).filter((t) => titles.has(t)));
      }
    } catch {
      // ignore
    }
    return new Set();
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...openGroups]));
    } catch {
      // ignore
    }
  }, [openGroups, storageKey]);

  const toggle = (title: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });

  const controls = (
    <div className="flex items-center gap-3" data-tour="ai-explain">
      <div className="inline-flex rounded-sm border border-gold/15 overflow-hidden shrink-0">
        <button
          type="button"
          onClick={() => setOpenGroups(new Set(groups.map((g) => g.title)))}
          className="px-2.5 py-1 text-[0.65rem] font-mono uppercase tracking-wider text-white/50 hover:text-gold transition-colors"
        >
          Expand all
        </button>
        <button
          type="button"
          onClick={() => setOpenGroups(new Set())}
          className="px-2.5 py-1 text-[0.65rem] font-mono uppercase tracking-wider text-white/50 hover:text-gold transition-colors border-l border-gold/15"
        >
          Collapse all
        </button>
      </div>
    </div>
  );

  return (
    <section className="space-y-4">
      {hideHeader ? (
        <div className="flex justify-end border-b border-gold/15 pb-4">{controls}</div>
      ) : (
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-gold/15 pb-4">
          <div>
            <p className="eyebrow">Qualitative</p>
            <h2 className="font-display text-2xl md:text-3xl font-semibold text-white mt-1">
              Frameworks & Open Questions
            </h2>
          </div>
          {controls}
        </div>
      )}

      <div className="space-y-3">
        {groups.map((group) => {
          const isOpen = openGroups.has(group.title);
          const answered = group.questions.filter((q) => savedMap.has(q.id)).length;
          const complete = answered === group.questions.length && answered > 0;
          const bodyId = `qual-${section}-${groupSlug(group.title)}`;
          return (
            <div key={group.title} className="panel overflow-hidden transition-colors hover:border-gold/20">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={bodyId}
                onClick={() => toggle(group.title)}
                className="w-full flex items-center gap-3 px-5 py-4 text-left group"
              >
                <ChevronDown
                  className={cn(
                    "w-4 h-4 text-white/40 shrink-0 transition-transform duration-200 group-hover:text-gold",
                    isOpen && "rotate-180 text-gold",
                  )}
                />
                <h3 className="flex-1 min-w-0 font-display text-base md:text-lg font-semibold text-gold leading-tight">
                  {group.title}
                </h3>
                <span
                  className={cn(
                    "font-mono text-[0.7rem] shrink-0",
                    complete ? "text-gain-strong" : "text-white/35",
                  )}
                >
                  {answered}/{group.questions.length}
                </span>
              </button>
              {isOpen && (
                <div id={bodyId} className="px-5 pb-5 pt-1 border-t border-gold/10 space-y-4">
                  {group.questions.map((q) => (
                    <QuestionField
                      key={q.id}
                      questionId={q.id}
                      question={q.text}
                      hint={q.hint}
                      section={section}
                      scopeKey={scopeKey}
                      // Per-question context (integrity figures) wins; else the block's.
                      dataContext={q.dataContext ?? dataContext}
                      severity={q.severity}
                      initialAnswer={savedMap.get(q.id) ?? ""}
                      onSave={async (value) =>
                        await saveAnswer({
                          section,
                          scopeKey,
                          questionId: q.id,
                          answer: value,
                        })
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

