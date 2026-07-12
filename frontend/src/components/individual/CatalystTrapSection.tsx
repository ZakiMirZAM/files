import type { IndividualAnalysis } from "../../lib/types";
import { DefinitionLink } from "./DefinitionsBlock";
import { QualitativeBlock } from "../QualitativeBlock";

interface CatalystTrapSectionProps {
  analysis: IndividualAnalysis;
  ticker: string;
  companyName?: string | null;
}

/**
 * The two questions the value canon insists on before buying anything cheap
 * (Marks, The Most Important Thing; Greenblatt, You Can Be a Stock Market Genius):
 * is there a catalyst that will close the gap between price and value, and is the
 * discount actually a value trap, a fatal defect wearing a bargain's clothes? The
 * user argues both sides in the deck; the page's own figures ground the AI helper.
 */
export function CatalystTrapSection({ analysis, ticker, companyName }: CatalystTrapSectionProps) {
  const f = analysis.forecast && typeof analysis.forecast === "object" ? analysis.forecast : null;
  const dataContext = JSON.stringify({
    ticker,
    company: companyName ?? ticker,
    sector: analysis.sector,
    industry: analysis.industry,
    marginOfSafety: f?.marginOfSafety ?? analysis.valuation?.marginOfSafety ?? null,
    dcfIntrinsicPerShare: f?.intrinsicPerShare ?? null,
    reverseDcf: f?.reverseDcf ?? null,
    epvPerShare: analysis.epv?.applicable ? analysis.epv.epvPerShare : null,
    verdict: analysis.verdict ?? null,
    shenanigansSummary: analysis.shenanigans?.summary ?? null,
    creditSummary: analysis.creditAnalysis?.summary ?? null,
    grahamAnchors: analysis.valuationAnchors ?? null,
  });

  return (
    <section className="animate-fade-up">
      <header className="mb-5">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">Catalyst or Value Trap</h2>
        <DefinitionLink number={591} prominent className="mt-3">How to tell a catalyst from a value trap</DefinitionLink>
      </header>

      <QualitativeBlock
        section="individual"
        scopeKey={ticker}
        onlyTitles={["Catalyst & Value Trap"]}
        storageSuffix="catalyst"
        dataContext={dataContext}
        hideHeader
      />

    </section>
  );
}
