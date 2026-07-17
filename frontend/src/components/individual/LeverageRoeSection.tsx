import type { LeverageRoe, LeverageRoeRow } from "../../lib/types";
import { cn } from "../../lib/cn";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { DefinitionLink, MetricTerm, requestDefinition } from "./DefinitionsBlock";
import { QualitativeBlock } from "../QualitativeBlock";

interface LeverageRoeSectionProps {
  leverageRoe?: LeverageRoe | null;
  ticker: string;
}

const pct = (v: number | null | undefined, d = 2): string =>
  v == null ? "n/a" : `${(v * 100).toFixed(d)}%`;
const signedPct = (v: number | null | undefined, d = 2): string =>
  v == null ? "n/a" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;

/**
 * A number that opens its own definition (and that definition's historical
 * chart) in the sidebar panel. The label is resolved to a definition number the
 * same way MetricTerm does, so a cell whose metric has no definition degrades to
 * plain text rather than offering a dead click.
 */
function MetricValue({
  metric,
  children,
  className,
  title,
}: {
  metric: string;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <MetricTerm
      metric={metric}
      asSpan
      className={cn("font-mono tabular-nums decoration-white/20", className)}
    >
      <span title={title}>{children}</span>
    </MetricTerm>
  );
}

/**
 * Damodaran's leverage decomposition of ROE (Investment Valuation, Ch.11):
 *
 *   ROE = ROIC + D/E × [ROIC − i(1−t)]
 *
 * Sits below the 5-factor DuPont section and reads the same ROE a different way.
 * DuPont multiplies five levers; this splits ROE into a sum of what the business
 * earned (ROIC) and what the balance sheet added (the leverage gain).
 *
 * Every rendered figure is clickable and opens its definition plus that metric's
 * own history, per the individual page's education-first contract.
 */
export function LeverageRoeSection({ leverageRoe: d, ticker }: LeverageRoeSectionProps) {
  if (!d || !d.applicable) return null;

  const t = d.terms;
  const recent = d.rows.slice(-8);
  const spreadNegative = d.spreadPositive === false;

  // The headline table: one row of the identity's inputs, mirroring the layout
  // the model is normally published in (ROIC, D/E, book rate, tax rate, ROE).
  const columns: { label: string; metric: string; value: string; accent?: boolean }[] = [
    { label: "ROIC", metric: "ROIC", value: pct(t.roic) },
    { label: "Book D/E", metric: "Debt To Equity", value: pct(t.debtEquity) },
    { label: "Book Interest Rate", metric: "Book Interest Rate", value: pct(t.bookInterestRate) },
    { label: "Tax Rate", metric: "Effective Tax Rate", value: pct(t.taxRate) },
    { label: "ROE", metric: "Return On Equity", value: pct(d.roeModel), accent: true },
  ];

  return (
    <section className="animate-fade-up">
      <header className="mb-5">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">
          Leverage ROE Decomposition
        </h2>
        <p className="text-sm text-white/50 mt-2 max-w-3xl leading-relaxed">
          The same ROE read a second way. Where the DuPont chain multiplies five levers, this splits
          the return into what the business earned on its capital and what borrowing added on top.
        </p>
        <DefinitionLink number={850} className="mt-3" prominent>
          How this model works
        </DefinitionLink>
      </header>

      {/* Headline table, styled to the app's gold/ink identity. */}
      <div className="panel-soft p-5 mb-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
          <p className="eyebrow">FY{d.latestYear}</p>
          {d.staleLatest && (
            <p className="text-[0.7rem] text-gold/80 font-mono" title={`The FY${d.dataThroughYear} statements do not report the interest expense this model needs, so the newest year it can compute is FY${d.latestYear}.`}>
              latest computable year · FY{d.dataThroughYear} lacks a reported interest expense
            </p>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="border-collapse text-sm w-full" style={{ minWidth: 520 }}>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.label}
                    className={cn(
                      "px-3 py-2 border-b text-right first:text-left",
                      c.accent ? "border-gold/40" : "border-gold/15",
                    )}
                  >
                    <span
                      className={cn(
                        "font-display italic text-[0.95rem] font-semibold",
                        c.accent ? "text-gold" : "text-gold/75",
                      )}
                    >
                      <MetricTerm metric={c.metric} asSpan>{c.label}</MetricTerm>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {columns.map((c) => (
                  <td
                    key={c.label}
                    className={cn(
                      "px-3 py-3 text-right first:text-left border-b border-white/[0.05]",
                      c.accent ? "text-gold text-lg" : "text-white/85",
                    )}
                  >
                    <MetricValue
                      metric={c.metric}
                      className={c.accent ? "text-gold" : "text-white/85"}
                      title={`Open the ${c.label} definition and its history`}
                    >
                      {c.value}
                    </MetricValue>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {/* The identity, written out with the company's own figures. */}
        <div className="mt-5 pt-4 border-t border-white/[0.06]">
          <p className="eyebrow mb-3">The identity</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 font-mono text-sm">
            <MetricValue metric="Return On Equity" className="text-gold text-base">
              {pct(d.roeModel)}
            </MetricValue>
            <span className="text-white/40">=</span>
            <MetricValue metric="ROIC" className="text-white/85">{pct(t.roic)}</MetricValue>
            <span className="text-white/40">+</span>
            <MetricValue metric="Debt To Equity" className="text-white/85">{pct(t.debtEquity)}</MetricValue>
            <span className="text-white/40">×</span>
            <span className="text-white/40">[</span>
            <MetricValue metric="ROIC" className="text-white/85">{pct(t.roic)}</MetricValue>
            <span className="text-white/40">−</span>
            <MetricValue metric="After-Tax Cost of Debt" className="text-white/85">
              {pct(t.afterTaxDebtCost)}
            </MetricValue>
            <span className="text-white/40">]</span>
          </div>

          {/* Spread and leverage gain, the two derived readings. */}
          <div className="grid gap-3 mt-4 sm:grid-cols-3">
            <div className="rounded-sm border border-gold/15 bg-ink-800 px-3 py-2.5">
              <p className="text-[0.65rem] uppercase tracking-wider text-white/40">
                <MetricTerm metric="ROIC − After-Tax Debt Cost" asSpan>Spread</MetricTerm>
              </p>
              <p className={cn("font-mono text-lg leading-tight mt-0.5", spreadNegative ? "text-loss-strong" : "text-gain-strong")}>
                <MetricValue metric="ROIC − After-Tax Debt Cost" className={spreadNegative ? "text-loss-strong" : "text-gain-strong"}>
                  {signedPct(t.spread)}
                </MetricValue>
              </p>
              <p className="text-[0.65rem] font-mono text-white/35 mt-0.5">ROIC − i(1−t)</p>
            </div>

            <div className="rounded-sm border border-gold/15 bg-ink-800 px-3 py-2.5">
              <p className="text-[0.65rem] uppercase tracking-wider text-white/40">
                <MetricTerm metric="Leverage Gain" asSpan />
              </p>
              <p className={cn("font-mono text-lg leading-tight mt-0.5", (t.leverageGain ?? 0) < 0 ? "text-loss-strong" : "text-white/90")}>
                <MetricValue metric="Leverage Gain" className={(t.leverageGain ?? 0) < 0 ? "text-loss-strong" : "text-white/90"}>
                  {signedPct(t.leverageGain)}
                </MetricValue>
              </p>
              <p className="text-[0.65rem] font-mono text-white/35 mt-0.5">D/E × spread</p>
            </div>

            <div className="rounded-sm border border-gold/15 bg-ink-800 px-3 py-2.5">
              <p className="text-[0.65rem] uppercase tracking-wider text-white/40">
                From leverage
              </p>
              <p className="font-mono text-lg text-white/90 leading-tight mt-0.5">
                {d.leverageShare == null ? "n/a" : `${(d.leverageShare * 100).toFixed(1)}%`}
              </p>
              <p className="text-[0.65rem] font-mono text-white/35 mt-0.5">share of ROE</p>
            </div>
          </div>

          {/* Reconciliation against reported ROE. The gap is the signal. */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4 text-xs">
            <span className={cn("inline-flex items-center gap-1.5 font-mono", d.reconciles ? "text-gain-strong" : "text-gold")}>
              {d.reconciles ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
              modelled {pct(d.roeModel)} {d.reconciles ? "≈ " : "vs "} reported {pct(d.roeReported)}
            </span>
            {!d.reconciles && d.nonOperatingGap != null && (
              <button
                type="button"
                onClick={() => requestDefinition(850)}
                className="text-white/45 font-mono underline decoration-dotted decoration-white/25 underline-offset-2 hover:text-gold transition-colors text-left"
                title="Why the two ROE figures differ. Click to read the model overview."
              >
                gap {signedPct(d.nonOperatingGap)}, non-operating profit the identity cannot see
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Per-year history. Every row label opens that metric's own chart. */}
      {recent.length > 1 && (
        <div className="panel-soft p-5">
          <p className="eyebrow mb-4">History · FY{recent[0].year}–FY{recent[recent.length - 1].year}</p>
          <div className="overflow-x-auto">
            <table className="border-collapse text-sm w-full" style={{ minWidth: 480 }}>
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-ink-800 text-left px-3 py-2 border-b border-r border-gold/15 min-w-[172px]">
                    <span className="label">Term</span>
                  </th>
                  {recent.map((r) => (
                    <th key={r.year} className="px-2.5 py-2 border-b border-gold/10 text-right min-w-[64px]">
                      <span className="text-[0.7rem] font-mono text-white/55">{r.year}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {([
                  { label: "ROIC", metric: "ROIC", get: (r: LeverageRoeRow) => r.roic },
                  { label: "Book D/E", metric: "Debt To Equity", get: (r: LeverageRoeRow) => r.debtEquity },
                  { label: "Book Interest Rate", metric: "Book Interest Rate", get: (r: LeverageRoeRow) => r.bookInterestRate },
                  { label: "Tax Rate", metric: "Effective Tax Rate", get: (r: LeverageRoeRow) => r.taxRate },
                  { label: "After-Tax Cost of Debt", metric: "After-Tax Cost of Debt", get: (r: LeverageRoeRow) => r.afterTaxDebtCost },
                  { label: "Spread", metric: "ROIC − After-Tax Debt Cost", get: (r: LeverageRoeRow) => r.spread },
                  { label: "Leverage Gain", metric: "Leverage Gain", get: (r: LeverageRoeRow) => r.leverageGain },
                  { label: "= ROE", metric: "Return On Equity", get: (r: LeverageRoeRow) => r.roeModel },
                ] as const).map((sr) => {
                  const isRoe = sr.label === "= ROE";
                  return (
                    <tr key={sr.label}>
                      <th
                        className={cn(
                          "sticky left-0 z-10 bg-ink-800 text-left px-3 py-1.5 border-b border-r border-white/[0.06] font-normal",
                          isRoe && "text-gold",
                        )}
                      >
                        <span className="text-[0.8rem] text-white/75">
                          <MetricTerm metric={sr.metric} asSpan>{sr.label}</MetricTerm>
                        </span>
                      </th>
                      {recent.map((r, i) => {
                        const v = sr.get(r);
                        const negative = v != null && v < 0 && (sr.label === "Spread" || sr.label === "Leverage Gain");
                        return (
                          <td
                            key={i}
                            className={cn(
                              "px-2.5 py-1.5 text-right border-b border-white/[0.05] tabular-nums font-mono text-[0.76rem]",
                              isRoe ? "text-gold" : negative ? "text-loss-strong" : "text-white/80",
                            )}
                          >
                            {v == null ? "n/a" : `${(v * 100).toFixed(2)}%`}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* User-first question deck: the reader answers, then the AI tutors. */}
      <div className="panel-soft p-5 mt-4">
        <p className="eyebrow mb-1">Interpreting this ROE</p>
        <p className="text-sm text-white/50 mb-4 max-w-3xl leading-relaxed">
          Answer these in your own words first. The decomposition gives you the figures; the
          judgment about whether this ROE survives a bad year is yours to make.
        </p>
        <QualitativeBlock
          section="individual"
          scopeKey={ticker}
          onlyTitles={["ROE Sustainability & Leverage"]}
          storageSuffix="leverage-roe"
          dataContext={JSON.stringify({ leverageRoe: d })}
          hideHeader
        />
      </div>
    </section>
  );
}
