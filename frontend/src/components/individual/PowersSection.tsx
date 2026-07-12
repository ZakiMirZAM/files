import type { IndividualAnalysis } from "../../lib/types";
import { DefinitionLink, MetricTerm } from "./DefinitionsBlock";
import { QualitativeBlock } from "../QualitativeBlock";

interface PowersSectionProps {
  analysis: IndividualAnalysis;
  ticker: string;
  companyName?: string | null;
}

const SEVEN_POWERS = [
  "Scale Economies",
  "Network Economies",
  "Counter-Positioning",
  "Switching Costs",
  "Branding",
  "Cornered Resource",
  "Process Power",
];

/**
 * Helmer's 7 Powers (7 Powers, Parts I-II). A moat only counts as a power when a
 * benefit comes paired with a barrier that stops competitors from copying it. The
 * user decides which powers the company holds by answering the questions first;
 * the per-question "Explain using AI" button is a tutor that helps after a try.
 */
export function PowersSection({ analysis, ticker, companyName }: PowersSectionProps) {
  const dataContext = JSON.stringify({
    ticker,
    company: companyName ?? ticker,
    sector: analysis.sector,
    industry: analysis.industry,
    segments:
      analysis.forecast && typeof analysis.forecast === "object"
        ? analysis.forecast.waccBuild?.betaComponents ?? null
        : null,
    sevenPowers: SEVEN_POWERS,
  });

  return (
    <section className="animate-fade-up">
      <header className="mb-5">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">The 7 Powers</h2>
        <DefinitionLink number={567} prominent className="mt-3">How the 7 Powers work</DefinitionLink>
      </header>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {SEVEN_POWERS.map((p) => (
          <span
            key={p}
            className="font-mono text-[0.68rem] px-2 py-0.5 rounded-sm border border-white/10 text-white/55"
          >
            <MetricTerm metric={p} asSpan />
          </span>
        ))}
      </div>

      <QualitativeBlock
        section="individual"
        scopeKey={ticker}
        onlyTitles={["The 7 Powers"]}
        storageSuffix="powers"
        dataContext={dataContext}
        hideHeader
      />

    </section>
  );
}
