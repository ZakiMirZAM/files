// "Which Environment Is This?": five collapsed decks, one per structural
// environment (fragmented, emerging, maturing, declining, global). Each
// deck's collapsed header states its own raw indicators so the reader can
// judge fit before opening the questions inside.

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { EnvironmentIndicators } from "../../lib/industryStructureApi";
import type { RuntimeGroup } from "../../lib/types";
import { buildEnvironmentHeaderNotes, ENVIRONMENT_SECTION } from "../../lib/industryDecksB";
import { QualitativeBlock } from "../QualitativeBlock";
import { cn } from "../../lib/cn";

interface EnvironmentDecksProps {
  indicators: EnvironmentIndicators;
  industry: string;
  /** The five environment decks (fragmented, emerging, maturing, declining, global). */
  groups: RuntimeGroup[];
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

interface DeckProps {
  group: RuntimeGroup;
  header: string;
  isOpen: boolean;
  onToggle: () => void;
  industry: string;
}

function Deck({ group, header, isOpen, onToggle, industry }: DeckProps) {
  const bodyId = `env-deck-${slug(group.title)}`;
  return (
    <div className="panel overflow-hidden transition-colors hover:border-gold/20">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={bodyId}
        onClick={onToggle}
        className="w-full flex items-start gap-3 px-5 py-4 text-left group"
      >
        <ChevronDown
          className={cn(
            "w-4 h-4 text-white/40 shrink-0 mt-0.5 transition-transform duration-200 group-hover:text-gold",
            isOpen && "rotate-180 text-gold",
          )}
        />
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-base md:text-lg font-semibold text-gold leading-tight">
            {group.title}
          </h3>
          {header && <p className="text-xs text-white/50 mt-1 leading-relaxed">{header}</p>}
        </div>
      </button>
      {isOpen && (
        <div id={bodyId} className="px-5 pb-5 pt-1 border-t border-gold/10">
          <QualitativeBlock
            section="industry"
            scopeKey={industry}
            groups={[group]}
            storageSuffix={`env-${slug(group.title)}`}
            hideHeader
          />
        </div>
      )}
    </div>
  );
}

/**
 * Five collapsed decks, one per structural environment a reader might match
 * this industry to. Each header states the raw numbers behind that match, so
 * opening a deck is a choice, not a guess. The questions inside each deck are
 * the standing, answerable framework for that environment.
 */
export function EnvironmentDecks({ indicators, industry, groups }: EnvironmentDecksProps) {
  const [openDecks, setOpenDecks] = useState<Set<string>>(new Set());
  const headers = buildEnvironmentHeaderNotes(indicators);

  const toggle = (title: string) =>
    setOpenDecks((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });

  if (!groups || groups.length === 0) return null;

  return (
    <section className="space-y-4" data-tour="industry-environment">
      <div className="border-b border-gold/15 pb-4">
        <p className="eyebrow">{ENVIRONMENT_SECTION.eyebrow}</p>
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-white mt-1">
          {ENVIRONMENT_SECTION.heading}
        </h2>
      </div>
      <div className="space-y-3">
        {groups.map((group) => (
          <Deck
            key={group.title}
            group={group}
            header={headers[group.title] ?? ""}
            isOpen={openDecks.has(group.title)}
            onToggle={() => toggle(group.title)}
            industry={industry}
          />
        ))}
      </div>
    </section>
  );
}
