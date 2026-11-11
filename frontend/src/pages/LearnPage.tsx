// The Learn section (slices A4-A6): flashcard decks, the study schedule, tests,
// and the Ask AI study companion (the chat in companion mode).

import { useState } from "react";
import { cn } from "../lib/cn";
import { DecksTab } from "../components/learn/DecksTab";
import { StudyTab } from "../components/learn/StudyTab";
import { TestsTab } from "../components/learn/TestsTab";
import { AiChat } from "../components/AiChat";

const TABS = [
  { key: "decks", label: "Decks" },
  { key: "study", label: "Study" },
  { key: "tests", label: "Tests" },
  { key: "ask", label: "Ask AI" },
] as const;

type TabKey = (typeof TABS)[number]["key"];
const TAB_KEY = "ifed.learn.tab";

function loadTab(): TabKey {
  try {
    const t = localStorage.getItem(TAB_KEY);
    return TABS.some((x) => x.key === t) ? (t as TabKey) : "decks";
  } catch {
    return "decks";
  }
}

export function LearnPage() {
  const [tab, setTab] = useState<TabKey>(loadTab);
  const choose = (t: TabKey) => {
    setTab(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      // storage unavailable: the tab still switches for this visit
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Learn</p>
        <h1 className="font-display text-3xl font-semibold text-white mt-1">Learn</h1>
        <p className="text-sm text-white/55 mt-2">
          Study with flashcards and tests, and ask the AI about what you are learning.
        </p>
      </header>

      <div role="tablist" aria-label="Learn sections" className="flex flex-wrap gap-1 border-b border-gold/10">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => choose(t.key)}
            className={cn(
              "px-4 py-2 text-sm -mb-px border-b-2 transition-colors",
              tab === t.key ? "border-gold text-gold" : "border-transparent text-white/55 hover:text-white",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === "decks" && <DecksTab onStudy={() => choose("study")} />}
        {tab === "study" && <StudyTab />}
        {tab === "tests" && <TestsTab />}
        {tab === "ask" && (
          <div className="panel flex h-[calc(100vh-16rem)] min-h-[28rem] flex-col">
            <AiChat active companion />
          </div>
        )}
      </div>
    </div>
  );
}
