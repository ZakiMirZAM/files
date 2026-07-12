import type { IndividualForecast, WaccBuild } from "../../lib/types";
import { formatCurrency, formatNumber } from "../../lib/format";
import { cn } from "../../lib/cn";
import { Scale, AlertTriangle } from "lucide-react";
import { DefinitionLink, MetricTerm } from "./DefinitionsBlock";

interface ForecastSectionProps {
  forecast: IndividualForecast;
}

const money = (v: number | null | undefined): string => (v == null ? "n/a" : formatCurrency(v));
const perShare = (v: number | null | undefined): string => (v == null ? "n/a" : `$${v.toFixed(2)}`);
const rate = (v: number | null | undefined, digits = 1): string => (v == null ? "n/a" : `${(v * 100).toFixed(digits)}%`);

/** Heat tint for a sensitivity cell relative to today's price (or intrinsic). */
function tint(value: number | null, ref: number | null): string | undefined {
  if (value == null || ref == null || ref <= 0) return undefined;
  const r = value / ref - 1;
  const mag = Math.min(Math.abs(r), 0.5) / 0.5;
  const a = (0.08 + mag * 0.34).toFixed(2);
  return r >= 0 ? `rgba(127,184,124,${a})` : `rgba(200,118,114,${a})`;
}

const STATEMENT_ROWS: Array<{ label: string; get: (r: IndividualForecast["rows"][number]) => string }> = [
  { label: "Revenue", get: (r) => formatCurrency(r.revenue) },
  { label: "Operating margin", get: (r) => `${(r.operatingMargin * 100).toFixed(1)}%` },
  { label: "EBIT", get: (r) => formatCurrency(r.ebit) },
  { label: "EBIT × (1 − tax)", get: (r) => formatCurrency(r.ebitAfterTax) },
  { label: "− Reinvestment", get: (r) => formatCurrency(r.reinvestment) },
  { label: "= FCFF", get: (r) => formatCurrency(r.fcff) },
  { label: "PV of FCFF", get: (r) => formatCurrency(r.pvFcff) },
];

export function ForecastSection({ forecast: f }: ForecastSectionProps) {
  if (f.applicable === false) {
    return (
      <article className="panel p-6 md:p-8 animate-fade-up">
        <header className="mb-5">
          <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">FCFF Firm Valuation</h2>
        </header>
        <div className="panel-soft p-5 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-gold/70 shrink-0 mt-0.5" />
          <p className="text-[0.95rem] leading-7 text-white/70">
            {f.notApplicableReason ?? "FCFF/EVA is not applicable for this sector."}
          </p>
        </div>
      </article>
    );
  }
  const a = f.assumptions;
  const ref = f.currentPrice ?? f.intrinsicPerShare;
  const mos = f.marginOfSafety;
  const mosColor =
    mos == null ? "text-white/50" :
    mos >= 0.25 ? "text-gain-strong" :
    mos >= 0 ? "text-gain" :
    mos >= -0.25 ? "text-gold" :
    "text-loss-strong";

  const assumptions: Array<{ k: string; v: string }> = [
    { k: "Horizon", v: `${a.horizonYears} yrs` },
    { k: "Revenue growth", v: `${rate(a.revenueGrowthInitial)} → ${rate(a.revenueGrowthTerminal)}` },
    { k: "Operating margin", v: `${rate(a.operatingMarginCurrent)} → ${rate(a.operatingMarginTarget)}` },
    { k: "Tax rate (effective)", v: rate(a.taxRate) },
    { k: "ROIC", v: rate(a.roic) },
    { k: "WACC", v: rate(a.wacc) },
    { k: "Net debt", v: money(a.netDebt) },
    { k: "Diluted shares", v: a.dilutedShares == null ? "n/a" : formatNumber(a.dilutedShares) },
    { k: "Exit P/FCF", v: a.exitPfcfMultiple == null ? "n/a" : `${a.exitPfcfMultiple.toFixed(1)}x` },
    { k: "Exit EV/EBITDA", v: a.evEbitdaMultiple == null ? "n/a" : `${a.evEbitdaMultiple.toFixed(1)}x` },
  ];

  return (
    <article className="panel p-6 md:p-8 animate-fade-up">
      <header className="mb-6">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">FCFF Firm Valuation</h2>
        <DefinitionLink number={71} prominent className="mt-3">How the FCFF model and WACC work</DefinitionLink>
      </header>

      {/* Assumptions */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
        {assumptions.map(({ k, v }) => (
          <div key={k} className="panel-soft px-3 py-2.5">
            <p className="text-[0.65rem] uppercase tracking-wider text-white/40"><MetricTerm metric={k} asSpan /></p>
            <p className="font-mono text-[0.8rem] text-white/85 mt-0.5">{v}</p>
          </div>
        ))}
      </div>

      {f.waccBuild && <WaccBuildPanel build={f.waccBuild} />}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Valuation bridge */}
        <div className="lg:col-span-2 panel-soft p-5">
          <p className="eyebrow mb-4">Valuation Bridge</p>
          <dl className="space-y-2 text-sm">
            <BridgeRow label="PV of explicit FCFF" value={money(f.pvExplicit)} />
            <BridgeRow label="+ PV of terminal value" value={money(f.pvTerminal)} />
            <BridgeRow label="= Enterprise value" value={money(f.firmValue)} strong />
            <BridgeRow label="+ Cash & investments" value={money(f.cash)} />
            <BridgeRow label="− Gross debt" value={money(f.grossDebt)} />
            <BridgeRow label="− Minority interest" value={money(f.minorityInterest)} />
            <BridgeRow label="= Equity value" value={money(f.equityValue)} strong />
            <div className="pt-1 mt-2">
              <div className="flex items-baseline justify-between">
                <span className="text-white/55 text-xs"><MetricTerm metric="Intrinsic / share" asSpan /></span>
                <span className="font-display text-2xl font-semibold text-gold">{perShare(f.intrinsicPerShare)}</span>
              </div>
            </div>
            <BridgeRow label="Current price" value={perShare(f.currentPrice)} />
            <div className="flex items-baseline justify-between">
              <span className="text-white/55 text-xs"><MetricTerm metric="Margin of safety" asSpan /></span>
              <span className={cn("font-mono text-base", mosColor)}>
                {mos == null ? "n/a" : `${mos >= 0 ? "+" : ""}${(mos * 100).toFixed(1)}%`}
              </span>
            </div>
            <div className="pt-1 mt-3 space-y-2">
              <BridgeRow label="EV/EBITDA exit cross-check / share" value={perShare(f.evEbitdaCrossCheckPerShare)} />
              <BridgeRow label="P/FCF exit cross-check / share" value={perShare(f.exitCrossCheckPerShare)} />
              <BridgeRow label="β = 1 intrinsic / share" value={perShare(f.betaOneIntrinsicPerShare)} />
              {f.evEbitdaImpliedGrowth != null && (
                <BridgeRow label="EV/EBITDA implied growth" value={rate(f.evEbitdaImpliedGrowth)} />
              )}
            </div>
          </dl>
        </div>

        {/* Projected statements */}
        <div className="lg:col-span-3 panel-soft p-5">
          <p className="eyebrow mb-4">Projected Statements</p>
          <div className="overflow-x-auto">
            <table className="border-collapse text-sm w-full" style={{ minWidth: 520 }}>
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 z-10 bg-ink-800 text-left px-3 py-2 border-b border-r border-gold/15 min-w-[150px]">
                    <span className="label">Line</span>
                  </th>
                  {f.years.map((y) => (
                    <th key={y} scope="col" className="px-2.5 py-2 border-b border-gold/10 text-right min-w-[72px]">
                      <span className="text-[0.7rem] font-mono text-white/55">{y}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {STATEMENT_ROWS.map((sr) => (
                  <tr key={sr.label}>
                    <th scope="row" className="sticky left-0 z-10 bg-ink-800 text-left px-3 py-1.5 border-b border-r border-white/[0.06] font-normal">
                      <span className="text-[0.8rem] text-white/75"><MetricTerm metric={sr.label} asSpan /></span>
                    </th>
                    {f.rows.map((r, i) => (
                      <td key={i} className="px-2.5 py-1.5 text-right border-b border-white/[0.05] tabular-nums font-mono text-[0.76rem] text-white/80">
                        {sr.get(r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Sensitivity */}
      <div className="mt-6">
        <p className="eyebrow mb-3">Sensitivity · intrinsic value / share</p>
        <div className="overflow-x-auto">
          <table className="border-collapse text-sm" style={{ minWidth: 480 }}>
            <thead>
              <tr>
                <th className="px-3 py-2 text-left border-b border-r border-gold/15">
                  <span className="text-[0.65rem] uppercase tracking-wider text-white/40">WACC ＼ Growth</span>
                </th>
                {f.sensitivity.growthAxis.map((g, gi) => (
                  <th key={gi} className={cn("px-3 py-2 text-right border-b border-gold/10 min-w-[78px]", gi === 2 && "bg-gold/5")}>
                    <span className="text-[0.7rem] font-mono text-white/60">{(g * 100).toFixed(1)}%</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {f.sensitivity.matrix.map((row, wi) => (
                <tr key={wi}>
                  <th scope="row" className={cn("px-3 py-2 text-left border-b border-r border-gold/10", wi === 2 && "bg-gold/5")}>
                    <span className="text-[0.7rem] font-mono text-white/60">{(f.sensitivity.waccAxis[wi] * 100).toFixed(2)}%</span>
                  </th>
                  {row.map((cell, gi) => (
                    <td
                      key={gi}
                      className={cn(
                        "px-3 py-2 text-right border-b border-white/[0.05] tabular-nums font-mono text-[0.76rem]",
                        cell == null ? "text-white/20" : "text-white/85",
                        wi === 2 && gi === 2 && "ring-1 ring-inset ring-gold/50",
                      )}
                      style={{ backgroundColor: tint(cell, ref) }}
                    >
                      {cell == null ? "—" : `$${cell.toFixed(0)}`}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </article>
  );
}

function WaccBuildPanel({ build: b }: { build: WaccBuild }) {
  const betaLabel = b.betaMethod && b.betaMethod.startsWith("bottom_up")
    ? "Beta (bottom-up)"
    : "Beta (measured)";
  const erpLabel = b.erpMethod === "implied_two_stage"
    ? "Equity risk premium (implied)"
    : b.erpMethod === "fixed_fallback"
      ? "Equity risk premium (anchor)"
      : "Equity risk premium";
  const tiles: { k: string; v: string; hi?: boolean }[] = [
    { k: betaLabel, v: b.beta == null ? "n/a" : b.beta.toFixed(2) },
    { k: "Risk-free (10Y)", v: rate(b.riskFreeRate) },
    { k: erpLabel, v: rate(b.equityRiskPremium) },
    { k: "Cost of equity", v: rate(b.costOfEquity) },
    { k: "Cost of debt (pre→after)", v: `${rate(b.costOfDebtPretax)} → ${rate(b.costOfDebtAfterTax)}` },
    { k: "Interest coverage", v: b.interestCoverage == null ? "n/a" : `${b.interestCoverage.toFixed(1)}x` },
    { k: "Weights (E / D)", v: `${(b.weightEquity * 100).toFixed(0)}% / ${(b.weightDebt * 100).toFixed(0)}%` },
    { k: "WACC", v: rate(b.wacc), hi: true },
  ];
  return (
    <div className="panel-soft p-4 mb-6">
      <p className="eyebrow mb-3 inline-flex items-center gap-2">
        <Scale className="w-4 h-4" /> Cost of Capital · true WACC
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {tiles.map(({ k, v, hi }) => (
          <div
            key={k}
            className={cn(
              "rounded-sm px-2.5 py-2 border border-gold/10 bg-white/[0.015]",
              hi && "border-gold/40 bg-gold/[0.06]",
            )}
          >
            <p className="text-[0.65rem] uppercase tracking-wider text-white/40 leading-tight"><MetricTerm metric={k} asSpan /></p>
            <p className="font-mono text-[0.78rem] text-white/85 mt-0.5">{v}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function BridgeRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={cn("text-xs", strong ? "text-white/75" : "text-white/55")}>
        <MetricTerm metric={label} asSpan />
      </span>
      <span className={cn("font-mono", strong ? "text-white font-medium" : "text-white/85")}>{value}</span>
    </div>
  );
}
