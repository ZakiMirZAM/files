import type { ManagementComp } from "../../lib/types";
import { formatCurrency } from "../../lib/format";
import { Users, ExternalLink } from "lucide-react";
import { DefinitionLink, MetricTerm } from "./DefinitionsBlock";
import { QualitativeBlock } from "../QualitativeBlock";

interface ManagementCompSectionProps {
  data?: ManagementComp | null;
  ticker: string;
  companyName?: string | null;
}

const money = (v: number | null | undefined): string =>
  v == null ? "n/a" : formatCurrency(v, { compact: true });
const pct = (v: number | null | undefined): string =>
  v == null ? "n/a" : `${(v * 100).toFixed(1)}%`;

/**
 * How managers are paid and who watches them. Links the latest DEF 14A proxy
 * statement and shows stock-based compensation as the in-statement pay proxy.
 * The user answers the compensation and governance questions in their own words
 * first; the per-question "Explain using AI" button is a tutor that helps after a try.
 */
export function ManagementCompSection({ data, ticker, companyName }: ManagementCompSectionProps) {
  if (!data) return null;

  const dataContext = JSON.stringify({
    ticker,
    company: companyName ?? ticker,
    proxyStatementUrl: data.proxy?.url ?? null,
    proxyFiledDate: data.proxy?.filedDate ?? null,
    stockBasedCompensation: data.sbc,
    sbcToRevenue: data.sbcToRevenue,
    sbcToNetIncome: data.sbcToNetIncome,
  });

  return (
    <section className="animate-fade-up">
      <header className="mb-5">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">Executive Compensation</h2>
        <DefinitionLink number={583} prominent className="mt-3">What analyzing executive compensation means</DefinitionLink>
      </header>

      <div className="panel-soft p-5 mb-5">
        <p className="eyebrow mb-3 inline-flex items-center gap-2">
          <Users className="w-4 h-4" /> Pay Proxy &amp; Filing
        </p>
        <div className="grid grid-cols-3 gap-3 text-sm mb-3">
          <div>
            <p className="text-[0.65rem] uppercase tracking-wider text-white/40"><MetricTerm metric="SBC" asSpan /></p>
            <p className="font-mono text-white/85 mt-0.5">{money(data.sbc)}</p>
          </div>
          <div>
            <p className="text-[0.65rem] uppercase tracking-wider text-white/40"><MetricTerm metric="SBC / revenue" asSpan /></p>
            <p className="font-mono text-white/85 mt-0.5">{pct(data.sbcToRevenue)}</p>
          </div>
          <div>
            <p className="text-[0.65rem] uppercase tracking-wider text-white/40"><MetricTerm metric="SBC / net income" asSpan /></p>
            <p className="font-mono text-white/85 mt-0.5">{pct(data.sbcToNetIncome)}</p>
          </div>
        </div>
        {data.proxy?.url ? (
          <a
            href={data.proxy.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-gold hover:underline"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Latest DEF 14A proxy
            {data.proxy.filedDate ? ` (filed ${data.proxy.filedDate})` : ""}
          </a>
        ) : (
          <p className="text-xs text-white/45">No DEF 14A proxy located (foreign filer or unavailable).</p>
        )}
      </div>

      <h2 className="font-display text-2xl md:text-3xl font-semibold text-white mb-4">Compensation</h2>
      <QualitativeBlock
        section="individual"
        scopeKey={ticker}
        onlyTitles={["Executive Compensation"]}
        storageSuffix="comp"
        dataContext={dataContext}
        hideHeader
      />

      <div className="mt-8">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">Board &amp; Governance</h2>
        <DefinitionLink number={584} prominent className="mt-3 mb-4">How board and governance analysis works</DefinitionLink>
        <QualitativeBlock
          section="individual"
          scopeKey={ticker}
          onlyTitles={["Board & Governance"]}
          storageSuffix="governance"
          dataContext={dataContext}
          hideHeader
        />
      </div>
    </section>
  );
}
