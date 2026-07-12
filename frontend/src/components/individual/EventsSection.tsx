import { useState } from "react";
import type { CompanyEvent } from "../../lib/types";
import { cn } from "../../lib/cn";
import { askQuestion } from "../../lib/aiApi";
import { Markdown } from "../Markdown";
import { Sparkles, Loader2, ExternalLink } from "lucide-react";
import { DefinitionLink } from "./DefinitionsBlock";

interface EventsSectionProps {
  events?: CompanyEvent[] | null;
  ticker: string;
  companyName?: string | null;
}

const FORM_LABELS: Record<string, string> = {
  "10-K": "Annual report (10-K)",
  "10-K/A": "Annual report, amended (10-K/A)",
  "10-Q": "Quarterly report (10-Q)",
  "10-Q/A": "Quarterly report, amended (10-Q/A)",
  "20-F": "Annual report, foreign filer (20-F)",
  "20-F/A": "Annual report, foreign filer (20-F/A)",
  "40-F": "Annual report, foreign filer (40-F)",
  "40-F/A": "Annual report, foreign filer (40-F/A)",
};
const formLabel = (form: string): string => FORM_LABELS[form] ?? form;

/**
 * Latest Filings: the most recent annual report (10-K) and quarterly report
 * (10-Q), the primary documents an investor reads to analyze a company. Each row
 * links to the filing on SEC EDGAR; the "Explain" button answers one question,
 * a short summary of that specific filing on request.
 */
export function EventsSection({ events, ticker, companyName }: EventsSectionProps) {
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!events || events.length === 0) return null;

  const summarize = async (ev: CompanyEvent) => {
    setLoadingKey(ev.accession);
    setError(null);
    try {
      const dataContext = JSON.stringify({
        ticker,
        company: companyName ?? ticker,
        form: ev.form,
        filingDate: ev.filingDate,
        filingUrl: ev.url,
      });
      const res = await askQuestion({
        section: "individual",
        question:
          `Summarize the key takeaways from ${companyName ?? ticker}'s ${formLabel(ev.form)} filed ${ev.filingDate}. ` +
          `${ev.url ? `Read it at ${ev.url}. ` : ""}` +
          `In a short paragraph, cover the headline results, the biggest change from the prior period, and any ` +
          `risk or disclosure a long-term owner should notice. Point the reader to the parts of the report worth ` +
          `reading in full.`,
        dataContext,
      });
      setSummaries((s) => ({ ...s, [ev.accession]: res.text }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI filing summary failed.");
    } finally {
      setLoadingKey(null);
    }
  };

  return (
    <section className="animate-fade-up">
      <header className="mb-5">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">Latest Filings</h2>
        <DefinitionLink number={596} prominent className="mt-3">What a 10-K and 10-Q are</DefinitionLink>
      </header>

      <div className="panel-soft p-5">
        {error && <p className="text-sm text-loss-strong mb-3">{error}</p>}
        <ul className="space-y-2.5">
          {events.map((ev) => (
            <li key={ev.accession} className="rounded-sm border border-gold/10 bg-white/[0.015] px-3 py-2.5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                  <span className="font-mono text-[0.68rem] font-semibold px-2 py-0.5 rounded-sm border border-gold/30 text-gold whitespace-nowrap">
                    {ev.form}
                  </span>
                  <span className="font-mono text-[0.75rem] text-white/55 whitespace-nowrap">{ev.filingDate}</span>
                  <span className="text-[0.8rem] text-white/75 truncate">{formLabel(ev.form)}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {ev.url && (
                    <a
                      href={ev.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[0.72rem] text-white/50 hover:text-gold"
                    >
                      <ExternalLink className="w-3 h-3" /> filing
                    </a>
                  )}
                  <button
                    onClick={() => summarize(ev)}
                    disabled={loadingKey !== null}
                    className={cn(
                      "text-[0.72rem] font-medium px-2 py-1 rounded-sm border transition-colors inline-flex items-center gap-1",
                      loadingKey === ev.accession
                        ? "border-white/10 text-white/40"
                        : "border-gold/30 text-gold/90 hover:bg-gold/10",
                    )}
                  >
                    {loadingKey === ev.accession ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    {summaries[ev.accession] ? "Redo" : "Explain"}
                  </button>
                </div>
              </div>
              {summaries[ev.accession] && (
                <div className="text-[0.85rem] text-white/75 leading-relaxed mt-2.5 pt-2.5">
                  <Markdown content={summaries[ev.accession]} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
