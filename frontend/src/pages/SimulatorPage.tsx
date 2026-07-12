import { useState } from "react";
import { LayoutDashboard, BookOpen, ListChecks } from "lucide-react";
import { SectionHeader } from "../components/SectionHeader";
import { PageTourButton } from "../components/onboarding/PageTourButton";
import { PortfolioDashboard } from "../components/simulator/PortfolioDashboard";
import { LessonsReader } from "../components/simulator/LessonsReader";
import { InvestorQuestions } from "../components/simulator/InvestorQuestions";
import { cn } from "../lib/cn";

type SimTab = "portfolio" | "lessons" | "questions";

const TAB_KEY = "ifed.sim.tab";

const TABS: { id: SimTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "portfolio", label: "Portfolio", icon: LayoutDashboard },
  { id: "lessons", label: "Lessons", icon: BookOpen },
  { id: "questions", label: "Investor's Questions", icon: ListChecks },
];

function loadTab(): SimTab {
  try {
    const v = localStorage.getItem(TAB_KEY);
    if (v === "portfolio" || v === "lessons" || v === "questions") return v;
  } catch {
    // ignore
  }
  return "portfolio";
}

/**
 * Practice section after Final Report. Three surfaces: a paper-trading portfolio,
 * humanized lessons sourced from the book RAG, and the verbatim cross-stage
 * investor question deck.
 */
export function SimulatorPage() {
  const [tab, setTab] = useState<SimTab>(loadTab);

  function selectTab(next: SimTab) {
    setTab(next);
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      // storage unavailable; tab just won't persist
    }
  }

  return (
    <div>
      <SectionHeader
        eyebrow="Practice"
        title="Stock Simulator"
        subtitle="Manage a virtual global portfolio with real prices, learn the index-fund and portfolio-management principles behind it, and run your holdings through the questions every stage of this software asks."
        actions={<PageTourButton tourId="simulator" />}
      />

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-8 border-b border-gold/10" role="tablist">
        {TABS.map((t) => {
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => selectTab(t.id)}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors",
                isActive
                  ? "border-gold text-gold"
                  : "border-transparent text-white/50 hover:text-white",
              )}
            >
              <t.icon className="w-4 h-4" strokeWidth={1.75} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "portfolio" && <PortfolioDashboard />}
      {tab === "lessons" && <LessonsReader />}
      {tab === "questions" && <InvestorQuestions />}
    </div>
  );
}
