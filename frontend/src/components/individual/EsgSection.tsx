import { useMemo } from "react";
import { ExternalLink } from "lucide-react";
import type { EsgBlock } from "../../lib/types";
import { DefinitionLink } from "./DefinitionsBlock";
import { QualitativeBlock } from "../QualitativeBlock";
import { buildEsgRatingDeck, ESG_RATING_LINKS } from "../../lib/esgRatingDeck";

interface EsgSectionProps {
  data?: EsgBlock | null;
  ticker: string;
  companyName?: string | null;
  sector?: string | null;
  industry?: string | null;
}

/**
 * ESG section. The numeric score tiles are gone: the Yahoo ESG feed they read
 * died, so they never showed anything. The reader answers the ESG Analysis
 * deck, then the "What Drives an ESG Rating" deck, whose tutor works out which
 * issues matter from the valuation inputs they reach. The two rater pages are
 * linked only; nothing is fetched or stored.
 */
export function EsgSection({ data, ticker, companyName, sector, industry }: EsgSectionProps) {
  const company = companyName ?? ticker;
  const dataContext = JSON.stringify({
    ticker,
    company,
    sector: sector ?? null,
    industry: industry ?? null,
  });
  const ratingDeck = useMemo(
    () => buildEsgRatingDeck({ company, industry, dataContext }),
    [company, industry, dataContext],
  );

  if (!data) return null;

  return (
    <section className="animate-fade-up">
      <header className="mb-5">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">ESG Analysis</h2>
        <DefinitionLink number={578} prominent className="mt-3">How ESG analysis works</DefinitionLink>
      </header>

      <QualitativeBlock
        section="individual"
        scopeKey={ticker}
        onlyTitles={["ESG Analysis"]}
        storageSuffix="esg"
        dataContext={dataContext}
        hideHeader
      />

      <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4 mb-2">
        {ESG_RATING_LINKS.map((l) => (
          <a
            key={l.href}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-gold hover:underline"
          >
            <ExternalLink className="w-3.5 h-3.5" /> {l.label}
          </a>
        ))}
      </div>

      <QualitativeBlock
        section="individual"
        scopeKey={ticker}
        groups={ratingDeck}
        storageSuffix="esg-rating"
        hideHeader
      />
    </section>
  );
}
