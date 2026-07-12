import type { EarningsBridge } from "../../lib/types";
import { formatCurrency } from "../../lib/format";
import { cn } from "../../lib/cn";
import { Receipt } from "lucide-react";
import { DefinitionLink, MetricTerm } from "./DefinitionsBlock";
import { QualitativeBlock } from "../QualitativeBlock";

interface EarningsBridgeSectionProps {
  data?: EarningsBridge | null;
  ticker: string;
  companyName?: string | null;
}

const money = (v: number | null | undefined): string =>
  v == null ? "n/a" : formatCurrency(v, { compact: true });

/**
 * The income-statement walk pulled from the latest 10-K XBRL (SEC EDGAR). Each
 * line is clickable for its definition. The old AI narration is replaced by the
 * earnings-quality question deck: the user answers first, and the per-question
 * "Explain using AI" button is a tutor that helps only after a try.
 */
export function EarningsBridgeSection({ data, ticker, companyName }: EarningsBridgeSectionProps) {
  if (!data || data.steps.length === 0) return null;

  const dataContext = JSON.stringify({
    ticker,
    company: companyName ?? ticker,
    periodEnd: data.periodEnd,
    incomeStatement: data.income,
    operatingLeases: data.leases,
    operatingLeasePV: data.operatingLeasePV,
    source: "SEC 10-K XBRL",
  });

  return (
    <section className="animate-fade-up">
      <header className="mb-5">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">Earnings Bridge</h2>
        {data.periodEnd && (
          <p className="text-[0.7rem] font-mono text-white/40 mt-1.5">10-K period ending {data.periodEnd}</p>
        )}
        <DefinitionLink number={530} prominent className="mt-3">How earnings normalization works</DefinitionLink>
      </header>

      <div className="panel-soft p-5 mb-5 max-w-xl">
        <p className="eyebrow mb-3 inline-flex items-center gap-2">
          <Receipt className="w-4 h-4" /> Income Statement Walk
        </p>
        <dl className="space-y-1.5 text-sm">
          {data.steps.map((s) => {
            const isTotal = s.kind === "total";
            return (
              <div
                key={s.key}
                className={cn(
                  "flex items-baseline justify-between gap-2 py-1",
                  isTotal && "mt-1 pt-2",
                )}
              >
                <span className={cn(isTotal ? "text-white/80 font-medium" : "text-white/50 pl-3")}>
                  {s.kind === "subtract" ? "− " : ""}
                  <MetricTerm metric={s.label} asSpan />
                </span>
                <span className={cn("font-mono", isTotal ? "text-white/90" : "text-white/60")}>
                  {money(s.value)}
                </span>
              </div>
            );
          })}
        </dl>
        {data.operatingLeasePV != null && (
          <p className="text-[0.72rem] font-mono text-white/40 mt-3">
            <MetricTerm metric="Operating Leases as Debt" asSpan>
              Operating-lease liability
            </MetricTerm>
            : <span className="text-gold">{money(data.operatingLeasePV)}</span>
          </p>
        )}
      </div>

      <QualitativeBlock
        section="individual"
        scopeKey={ticker}
        onlyTitles={["Earnings Quality"]}
        storageSuffix="earnings"
        dataContext={dataContext}
        hideHeader
      />

    </section>
  );
}
