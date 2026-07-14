import type { IndividualAnalysis } from "../lib/types";
import { formatCurrency, formatPercent } from "../lib/format";
import { cn } from "../lib/cn";
import { Check, X, TrendingUp, Calculator, Award } from "lucide-react";
import { DefinitionsBlock, MetricTerm } from "./individual/DefinitionsBlock";

interface ValuationCardProps {
  analysis: IndividualAnalysis;
}

export function ValuationCard({ analysis }: ValuationCardProps) {
  const { valuation, verdict } = analysis;
  const mos = valuation.marginOfSafety;
  const verdictColor =
    verdict.qualityScore >= 75 ? "text-gain-strong border-gain/40 bg-gain-ghost" :
    verdict.qualityScore >= 60 ? "text-gain border-gain/30 bg-gain-ghost" :
    verdict.qualityScore >= 45 ? "text-gold border-gold/40 bg-gold/10" :
    verdict.qualityScore >= 30 ? "text-loss border-loss/30 bg-loss-ghost" :
    "text-loss-strong border-loss/40 bg-loss-ghost";

  return (
    <article className="panel p-6 md:p-8 mb-6 animate-fade-up">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4 mb-6 pb-5 border-b border-gold/10">
        <div>
          <p className="eyebrow mb-2">Valuation + Verdict</p>
          <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">
            {analysis.ticker}{" "}
            <span className="text-white/45 font-normal">
             , <MetricTerm metric="Quality Score" scope="valuation">Quality Score</MetricTerm>
            </span>
          </h2>
        </div>
        <div className="flex items-center gap-4">
          <QualityGauge score={verdict.qualityScore} />
          <div
            className={cn(
              "px-4 py-3 rounded-sm border max-w-xs",
              verdictColor,
            )}
          >
            <p className="text-[0.65rem] uppercase tracking-wider opacity-80 mb-1">Verdict</p>
            <p className="font-display text-sm leading-snug">{verdict.label}</p>
          </div>
        </div>
      </header>

      {/* DCF + ratios row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <DcfPanel valuation={valuation} mos={mos} />
        <RatiosPanel ratios={analysis.ratios} />
        <CashRow rows={analysis.cashGeneration} />
      </div>

      {/* Strengths + Weaknesses */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="panel-soft p-5">
          <p className="eyebrow mb-3 inline-flex items-center gap-2">
            <Check className="w-4 h-4 text-gain-strong" /> Strengths ({verdict.strengths.length})
          </p>
          <ul className="space-y-2">
            {verdict.strengths.length === 0 ? (
              <li className="text-sm text-white/40 italic">No strengths met quality thresholds.</li>
            ) : (
              verdict.strengths.map((s) => (
                <li key={s} className="flex items-start gap-2 text-sm text-white/80 leading-snug">
                  <span className="text-gain-strong mt-0.5 flex-shrink-0">+</span>
                  <span className="font-mono text-[0.85rem]">{s}</span>
                </li>
              ))
            )}
          </ul>
        </div>
        <div className="panel-soft p-5">
          <p className="eyebrow mb-3 inline-flex items-center gap-2">
            <X className="w-4 h-4 text-loss-strong" /> Weaknesses ({verdict.weaknesses.length})
          </p>
          <ul className="space-y-2">
            {verdict.weaknesses.length === 0 ? (
              <li className="text-sm text-white/40 italic">No flagged weaknesses.</li>
            ) : (
              verdict.weaknesses.map((w) => (
                <li key={w} className="flex items-start gap-2 text-sm text-white/80 leading-snug">
                  <span className="text-loss-strong mt-0.5 flex-shrink-0">−</span>
                  <span className="font-mono text-[0.85rem]">{w}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      <DefinitionsBlock section="valuation" title="Quality score & ratio definitions" className="mt-5" />
    </article>
  );
}

function QualityGauge({ score }: { score: number }) {
  const radius = 32;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (score / 100) * circ;
  const stroke =
    score >= 75 ? "#9dd093" :
    score >= 60 ? "#7fb87c" :
    score >= 45 ? "#c9a84c" :
    score >= 30 ? "#df8884" :
    "#c87672";
  return (
    <div className="relative w-20 h-20">
      <svg className="-rotate-90 w-20 h-20">
        <circle cx="40" cy="40" r={radius} stroke="rgba(255,255,255,0.06)" strokeWidth="6" fill="none" />
        <circle
          cx="40" cy="40" r={radius}
          stroke={stroke}
          strokeWidth="6"
          fill="none"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-xl font-semibold text-white">{score.toFixed(0)}</span>
        <span className="text-[0.65rem] uppercase tracking-wider text-white/40">/ 100</span>
      </div>
    </div>
  );
}

function DcfPanel({
  valuation,
  mos,
}: {
  valuation: IndividualAnalysis["valuation"];
  mos: number | null;
}) {
  const mosPct = mos !== null ? mos * 100 : null;
  const mosColor =
    mosPct === null ? "text-white/40" :
    mosPct >= 25 ? "text-gain-strong" :
    mosPct >= 0 ? "text-gain" :
    mosPct >= -25 ? "text-gold" :
    "text-loss";
  return (
    <div className="panel-soft p-5">
      <p className="eyebrow mb-3 inline-flex items-center gap-2">
        <Calculator className="w-4 h-4" /> DCF Valuation
      </p>
      <div className="space-y-2.5 text-sm">
        <Row label="Intrinsic / share" value={
          valuation.dcfIntrinsicPerShare !== null
            ? `$${valuation.dcfIntrinsicPerShare.toFixed(2)}`
            : "n/a"
        } />
        <Row label="Implied price" value={
          valuation.impliedPrice !== null ? `$${valuation.impliedPrice.toFixed(2)}` : "n/a"
        } />
        <Row label="Margin of safety" value={
          mosPct !== null
            ? <span className={cn("font-mono", mosColor)}>{mosPct >= 0 ? "+" : ""}{mosPct.toFixed(1)}%</span>
            : "n/a"
        } />
        <Row label="FCF growth used" value={
          valuation.fcfGrowthUsed !== null
            ? `${(valuation.fcfGrowthUsed * 100).toFixed(1)}%`
            : "n/a"
        } />
        <div className="pt-3 mt-3 border-t border-gold/10 text-[0.7rem] text-white/35 font-mono">
          WACC {(valuation.wacc * 100).toFixed(0)}% · Terminal {(valuation.terminalGrowth * 100).toFixed(0)}% · {valuation.projectionYears}yr proj
        </div>
      </div>
    </div>
  );
}

function RatiosPanel({ ratios }: { ratios: Record<string, number | null> }) {
  const order: Array<{ key: string; label: string; pct?: boolean }> = [
    { key: "Return On Equity", label: "ROE", pct: true },
    { key: "Return On Invested Capital", label: "ROIC", pct: true },
    { key: "Return On Assets", label: "ROA", pct: true },
    { key: "Return On Sales", label: "ROS", pct: true },
    { key: "Gross Profit Ratio", label: "Gross margin", pct: true },
    { key: "Asset Turnover", label: "Asset turnover" },
    { key: "Current Ratio", label: "Current ratio" },
    { key: "Quick Ratio", label: "Quick ratio" },
    { key: "Debt Service Coverage Ratio", label: "Debt service cov" },
    { key: "Interest Coverage Ratio", label: "Interest cov" },
    { key: "Debt To Equity", label: "Debt/Equity" },
    { key: "Debt To Assets", label: "Debt/Assets" },
    { key: "Net Debt To EBITDA", label: "Net debt/EBITDA" },
    { key: "Dividend Yield", label: "Div yield", pct: true },
    { key: "Price To Earnings", label: "P/E" },
    { key: "Price To Book", label: "P/B" },
    { key: "EV To EBIT", label: "EV/EBIT" },
    { key: "PEG (yfinance)", label: "PEG" },
    { key: "Income Quality", label: "Income quality" },
    { key: "FCF To Total Debt", label: "FCF/Total debt", pct: true },
    { key: "Sloan Accruals Ratio", label: "Sloan accruals", pct: true },
    { key: "SBC To Revenue", label: "SBC/Revenue", pct: true },
  ];
  return (
    <div className="panel-soft p-5">
      <p className="eyebrow mb-3 inline-flex items-center gap-2">
        <TrendingUp className="w-4 h-4" /> Latest Ratios
      </p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        {order.map(({ key, label, pct }) => {
          const v = ratios[key];
          let display = "n/a";
          if (v !== null && v !== undefined) {
            display = pct ? formatPercent(v * 100) : v.toFixed(2);
          }
          return (
            <div key={key} className="flex justify-between gap-2">
              <MetricTerm metric={label} scope="valuation" className="text-white/70 text-xs leading-tight" />
              <span className="font-mono text-gold text-xs">{display}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CashRow({ rows }: { rows: IndividualAnalysis["cashGeneration"] }) {
  const recent = rows.slice(-5);
  return (
    <div className="panel-soft p-5">
      <p className="eyebrow mb-3 inline-flex items-center gap-2">
        <Award className="w-4 h-4" /> Cash Generation (last 5y)
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-white/40 text-[0.65rem] uppercase tracking-wider">
              <th className="text-left font-medium pb-2">Year</th>
              <th className="text-right font-medium pb-2"><MetricTerm metric="NOPAT" scope="valuation" /></th>
              <th className="text-right font-medium pb-2"><MetricTerm metric="OCF" scope="valuation" /></th>
              <th className="text-right font-medium pb-2"><MetricTerm metric="FCF" scope="valuation" /></th>
            </tr>
          </thead>
          <tbody>
            {recent.map((r) => (
              <tr key={r.year} className="border-t border-gold/5">
                <td className="py-1.5 font-mono text-white/70">{r.year}</td>
                <td className="py-1.5 text-right font-mono text-white/80">{r.nopat !== null ? formatCurrency(r.nopat, { compact: true }) : "n/a"}</td>
                <td className="py-1.5 text-right font-mono text-white/80">{r.ocf !== null ? formatCurrency(r.ocf, { compact: true }) : "n/a"}</td>
                <td className="py-1.5 text-right font-mono text-gold">{r.fcf !== null ? formatCurrency(r.fcf, { compact: true }) : "n/a"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-white/70 text-xs">{label}</span>
      <span className="font-mono text-white/90">{value}</span>
    </div>
  );
}
