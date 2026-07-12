import type { EsgBlock } from "../../lib/types";
import { DefinitionLink } from "./DefinitionsBlock";
import { QualitativeBlock } from "../QualitativeBlock";

interface EsgSectionProps {
  data?: EsgBlock | null;
  ticker: string;
  companyName?: string | null;
  sector?: string | null;
}

const NUMERIC_TILES: { key: string; label: string }[] = [
  { key: "totalEsg", label: "Total ESG risk" },
  { key: "environmentScore", label: "Environmental" },
  { key: "socialScore", label: "Social" },
  { key: "governanceScore", label: "Governance" },
];

/**
 * ESG section. Shows numeric Sustainalytics scores when a feed is available.
 * The user answers the ESG questions first in their own words; the per-question
 * "Explain using AI" button is a tutor that helps only after a try. The section
 * no longer generates an unprompted AI essay.
 */
export function EsgSection({ data, ticker, companyName, sector }: EsgSectionProps) {
  if (!data) return null;
  const scores = data.scores;
  const dataContext = JSON.stringify({
    ticker,
    company: companyName ?? ticker,
    sector: sector ?? null,
    numericEsgScores: scores ?? "unavailable (Yahoo ESG feed deprecated)",
  });

  return (
    <section className="animate-fade-up">
      <header className="mb-5">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">ESG Analysis</h2>
        <DefinitionLink number={578} prominent className="mt-3">How ESG analysis works</DefinitionLink>
      </header>

      {data.hasNumericScores && scores && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          {NUMERIC_TILES.filter((t) => scores[t.key] != null).map((t) => (
            <div key={t.key} className="rounded-sm px-3 py-2.5 border border-gold/10 bg-white/[0.015]">
              <p className="text-[0.65rem] uppercase tracking-wider text-white/40">{t.label}</p>
              <p className="font-mono text-lg text-white/85 mt-0.5">{scores[t.key].toFixed(1)}</p>
            </div>
          ))}
        </div>
      )}

      <QualitativeBlock
        section="individual"
        scopeKey={ticker}
        onlyTitles={["ESG Analysis"]}
        storageSuffix="esg"
        dataContext={dataContext}
        hideHeader
      />

    </section>
  );
}
