import type {
  CreditAnalysis,
  CreditMetricItem,
  CreditSeverity,
  ForensicScore,
} from "../../lib/types";
import { cn } from "../../lib/cn";
import { Gauge, ShieldAlert } from "lucide-react";
import { MetricTerm, DefinitionLink } from "./DefinitionsBlock";

interface CreditAnalysisSectionProps {
  credit?: CreditAnalysis | null;
}

const SEV_STYLE: Record<CreditSeverity, string> = {
  good: "text-gain border-gain/25 bg-gain-ghost",
  warn: "text-gold border-gold/40 bg-gold/10",
  bad: "text-loss-strong border-loss/40 bg-loss-ghost",
  na: "text-white/45 border-white/10 bg-white/[0.03]",
};

const SEV_LABEL: Record<CreditSeverity, string> = {
  good: "Pass", warn: "Watch", bad: "Fail", na: "n/a",
};

const BAND_STYLE: Record<string, string> = {
  strong: "border-gain/30 bg-gain-ghost text-gain",
  adequate: "border-gold/30 bg-gold/10 text-gold",
  weak: "border-gold/40 bg-gold/10 text-gold",
  distressed: "border-loss/40 bg-loss-ghost text-loss-strong",
  na: "border-white/10 bg-white/[0.03] text-white/60",
};

function fmt(value: number | null, unit: string): string {
  if (value === null || value === undefined) return "n/a";
  if (unit === "x") return `${value.toFixed(3)}x`;
  return `${value}`;
}

function pct(v: number | null | undefined): string {
  return v === null || v === undefined ? "n/a" : `${(v * 100).toFixed(3)}%`;
}

/**
 * Company credit analysis in the voice of Arnold Ziegel's "Fundamentals of
 * Credit and Credit Analysis": a synthetic risk rating, the leverage / coverage
 * / liquidity ratios that decide debt capacity, a free-cash-flow debt-capacity
 * read, and the natural-capital-structure rule. Banks get a separate track
 * (capital adequacy, NIM) because leverage is their raw material and the Altman
 * Z-Score / manufacturer ratios do not apply.
 */
export function CreditAnalysisSection({ credit }: CreditAnalysisSectionProps) {
  if (!credit || !credit.applicable) return null;

  const { rating, summary, metrics, debtCapacity, capitalStructure, forensic } = credit;
  const bandStyle = BAND_STYLE[summary.band] ?? BAND_STYLE.na;

  return (
    <section className="animate-fade-up">
      <header className="mb-5">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">
          Credit Analysis {credit.kind === "bank" && <span className="text-gold/70 text-lg">· bank track</span>}
        </h2>
        <DefinitionLink number={545} prominent className="mt-3">How credit analysis works</DefinitionLink>
      </header>

      {/* Summary + synthetic rating */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
        <div className={cn("rounded-sm border px-4 py-3.5 flex items-start gap-3", bandStyle)}>
          <Gauge className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <MetricTerm
              metric="Composite credit score"
              asSpan
              className="text-[0.62rem] uppercase tracking-wider text-white/50"
            />
            <p className="text-2xl font-mono font-semibold text-white tabular-nums">
              {summary.score.toFixed(0)}
              <span className="text-sm text-white/40"> / 100</span>
              <span className="text-sm uppercase tracking-wider ml-2">{summary.band}</span>
            </p>
            <p className="text-sm leading-snug mt-1">{summary.headline}</p>
          </div>
        </div>
        <div className="rounded-sm border border-white/10 bg-white/[0.03] px-4 py-3.5">
          <div className="flex items-baseline justify-between gap-2">
            <MetricTerm metric="Synthetic rating" asSpan className="text-sm font-medium text-white/90" />
            {rating.investmentGrade !== null && (
              <span
                className={cn(
                  "text-[0.62rem] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded-sm border",
                  rating.investmentGrade
                    ? "text-gain border-gain/30"
                    : "text-gold border-gold/40",
                )}
              >
                {rating.investmentGrade ? "Investment grade" : "Below IG"}
              </span>
            )}
          </div>
          <p className="text-2xl font-mono font-semibold text-white mt-1 tabular-nums">
            {rating.letter ?? "n/a"}
          </p>
        </div>
      </div>

      {/* Leverage / coverage / liquidity (or bank capital) panel */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {metrics.map((m) => <CreditMetricCard key={m.label} m={m} />)}
      </div>

      {/* Debt capacity + natural capital structure (corporate track) */}
      {credit.kind === "corporate" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
          {debtCapacity && (
            <div className="rounded-sm border border-white/10 bg-white/[0.03] px-4 py-3.5">
              <p className="eyebrow mb-1"><MetricTerm metric="Debt capacity" asSpan /></p>
              <p className="text-lg font-semibold text-white leading-tight">{debtCapacity.headline}</p>
              <p className="text-[0.8rem] font-mono text-white/50 mt-1">
                Total debt / 3-yr avg free cash flow:{" "}
                {debtCapacity.debtToFcf !== null ? `${debtCapacity.debtToFcf}x` : "n/a"}
              </p>
            </div>
          )}
          {capitalStructure && (
            <div
              className={cn(
                "rounded-sm border px-4 py-3.5",
                capitalStructure.mismatch
                  ? "border-loss/40 bg-loss-ghost"
                  : "border-white/10 bg-white/[0.03]",
              )}
            >
              <p className="eyebrow mb-1 inline-flex items-center gap-2">
                {capitalStructure.mismatch && <ShieldAlert className="w-3.5 h-3.5" />}
                <MetricTerm metric="Natural capital structure" asSpan />
              </p>
              <p className="text-lg font-semibold text-white leading-tight">{capitalStructure.headline}</p>
              <p className="text-[0.8rem] font-mono text-white/50 mt-1">
                <MetricTerm metric="Revenue-growth volatility" asSpan />:{" "}
                {capitalStructure.revenueGrowthVolatility !== null
                  ? pct(capitalStructure.revenueGrowthVolatility)
                  : "n/a"}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Forensic cross-reference */}
      {(forensic.altmanZ || forensic.beneishM) && (
        <div className="flex flex-wrap gap-3 mb-4">
          {forensic.altmanZ && <ForensicChip score={forensic.altmanZ} />}
          {forensic.beneishM && <ForensicChip score={forensic.beneishM} />}
        </div>
      )}

    </section>
  );
}

function CreditMetricCard({ m }: { m: CreditMetricItem }) {
  const cmp = m.higherIsBetter ? ">=" : "<=";
  return (
    <div className={cn("rounded-sm border px-4 py-3", SEV_STYLE[m.severity])}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <MetricTerm metric={m.label} asSpan className="text-sm font-medium text-white/90 leading-tight" />
        <span className="text-[0.65rem] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded-sm border border-current/30 whitespace-nowrap">
          {SEV_LABEL[m.severity]}
        </span>
      </div>
      <p className="text-xl font-mono font-semibold text-white tabular-nums">{fmt(m.value, m.unit)}</p>
      <p className="text-[0.68rem] font-mono text-white/35 mt-0.5">
        target {cmp} {m.unit === "x" ? `${m.threshold}x` : m.threshold}
      </p>
    </div>
  );
}

function ForensicChip({ score }: { score: ForensicScore }) {
  return (
    <div className="rounded-sm border border-white/10 bg-white/[0.03] px-3 py-2 text-[0.78rem]">
      <span className="text-white/80 font-medium"><MetricTerm metric={score.label} asSpan />: </span>
      <span className="text-white/60">
        {score.applicable && score.value !== null ? score.value.toFixed(3) : "n/a"} · {score.headline}
      </span>
    </div>
  );
}
