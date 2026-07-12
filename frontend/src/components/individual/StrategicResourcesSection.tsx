import type { IndividualAnalysis } from "../../lib/types";
import { DefinitionLink, MetricTerm } from "./DefinitionsBlock";
import { QualitativeBlock } from "../QualitativeBlock";

interface StrategicResourcesSectionProps {
  analysis: IndividualAnalysis;
  ticker: string;
  companyName?: string | null;
}

/**
 * Lev & Gu's strategic-resources lens (The End of Accounting). Accounting expenses
 * the assets that actually create value at modern companies (research, brands,
 * platforms, data, talent), so the analysis reorganizes around those resources.
 * The user answers the five Lev & Gu questions in their own words first; the
 * per-question "Explain using AI" button is a tutor that helps only after a try.
 */
export function StrategicResourcesSection({ analysis, ticker, companyName }: StrategicResourcesSectionProps) {
  const rd = analysis.rndAdjusted;
  const wb = analysis.forecast && typeof analysis.forecast === "object" ? analysis.forecast.waccBuild : null;
  const dataContext = JSON.stringify({
    ticker,
    company: companyName ?? ticker,
    sector: analysis.sector,
    industry: analysis.industry,
    rndCapitalization: analysis.rndAdjusted ?? null,
    goodwillAndSbc: analysis.normalizedEarnings?.goodwillSbc ?? null,
    segments: wb?.betaComponents ?? null,
    managementComp: analysis.managementComp
      ? { sbc: analysis.managementComp.sbc, sbcToRevenue: analysis.managementComp.sbcToRevenue }
      : null,
  });

  return (
    <section className="animate-fade-up">
      <header className="mb-5">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">Strategic Resources</h2>
        <DefinitionLink number={560} prominent className="mt-3">How the strategic-resources lens works</DefinitionLink>
      </header>

      {rd?.applicable && (rd.researchAsset != null || rd.rdIntensity != null) && (
        <div className="flex flex-wrap gap-2 text-[0.75rem] font-mono text-white/60 mb-4">
          {rd.researchAsset != null && (
            <span className="px-2 py-0.5 rounded-sm border border-gold/20 text-gold/90">
              <MetricTerm metric="Research asset on file" asSpan />
            </span>
          )}
          {rd.rdIntensity != null && (
            <span className="px-2 py-0.5 rounded-sm border border-white/10">
              <MetricTerm metric="R&D / revenue" asSpan /> {(rd.rdIntensity * 100).toFixed(1)}%
            </span>
          )}
        </div>
      )}

      <QualitativeBlock
        section="individual"
        scopeKey={ticker}
        onlyTitles={["Strategic Resources"]}
        storageSuffix="strategic"
        dataContext={dataContext}
        hideHeader
      />

    </section>
  );
}
