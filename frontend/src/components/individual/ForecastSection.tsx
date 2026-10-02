import { useMemo, useState } from "react";
import type { ForecastRow, IndividualForecast, NextTwoYearsBlock, WaccBuild } from "../../lib/types";
import { formatCurrency, formatNumber, formatPerShare } from "../../lib/format";
import { cn } from "../../lib/cn";
import { Scale, AlertTriangle } from "lucide-react";
import { DefinitionLink, MetricTerm } from "./DefinitionsBlock";
import { StageToggle, useActiveVariant } from "./StageToggle";
import { NextTwoYearsSection } from "./NextTwoYearsSection";
import { QualitativeBlock } from "../QualitativeBlock";
import {
  answerScope,
  buildProjectionsOpening,
  PROJECTIONS_COPY,
  PROJECTIONS_OPENING_ID,
  projectionsVisible,
} from "../../lib/projectionsDeck";
import { useSavedAnswer } from "../../lib/useSavedAnswer";

interface ForecastSectionProps {
  forecast: IndividualForecast;
  ticker?: string;
  /** The key the projections answers are saved under; the page's route ticker. Falls back to `ticker`. */
  scopeKey?: string;
  nextTwoYears?: NextTwoYearsBlock | null;
  companyName?: string;
}

/** Stable empty rows, so a structure with no projection years does not re-memo every render. */
const NO_ROWS: ForecastRow[] = [];

const money = (v: number | null | undefined): string => (v == null ? "n/a" : formatCurrency(v));
const perShare = (v: number | null | undefined): string => formatPerShare(v);
const rate = (v: number | null | undefined, digits = 3): string => (v == null ? "n/a" : `${(v * 100).toFixed(digits)}%`);

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
  { label: "Operating margin", get: (r) => `${(r.operatingMargin * 100).toFixed(3)}%` },
  { label: "EBIT", get: (r) => formatCurrency(r.ebit) },
  { label: "EBIT × (1 − tax)", get: (r) => formatCurrency(r.ebitAfterTax) },
  { label: "− Reinvestment", get: (r) => formatCurrency(r.reinvestment) },
  { label: "= FCFF", get: (r) => formatCurrency(r.fcff) },
  { label: "PV of FCFF", get: (r) => formatCurrency(r.pvFcff) },
];

export function ForecastSection({ forecast: f, ticker = "", scopeKey, nextTwoYears, companyName }: ForecastSectionProps) {
  const sel = f.valuationSelection ?? null;
  const active = useActiveVariant(ticker, sel?.stageVariants, sel?.recommendedStages);
  const company = companyName || ticker;
  const scope = answerScope(scopeKey, ticker);
  // Q1 is answered before any projection is shown, so its context carries no
  // model numbers.
  const opening = useMemo(
    () => buildProjectionsOpening({ company, dataContext: JSON.stringify({ company, ticker }) }),
    [company, ticker],
  );
  const growthSource = useSavedAnswer("individual", scope, PROJECTIONS_OPENING_ID);
  // "Show anyway" holds for the scope it was clicked on and is not persisted.
  const [shownFor, setShownFor] = useState<string | null>(null);
  const showProjections = projectionsVisible(growthSource, shownFor, scope);
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
  // The stage toggle is a lens: when the reader picks a non-recommended
  // structure, the projection table and the valuation bridge follow it.
  const isVariantView = active != null
    && active.stageCount !== (sel?.recommendedStages ?? active.stageCount);
  // Safe cast: this section only ever receives variants from the FORECAST's
  // stageVariants, which the backend builds exclusively from the firm-side
  // engine (ForecastRow-shaped rows); dividend-track variants never reach here.
  const viewRows: ForecastRow[] = (isVariantView && active?.rows
    ? (active.rows as ForecastRow[])
    : f.rows);
  const viewYears = viewRows === f.rows
    ? f.years
    : viewRows.map((r) => f.baseYear + r.year);
  const equityAdjust = f.equityValue - f.firmValue;
  const view = isVariantView && active
    ? {
        pvExplicit: active.pvExplicit ?? null,
        pvTerminal: active.pvTerminal ?? null,
        firmValue: (active.pvExplicit ?? 0) + (active.pvTerminal ?? 0),
        equityValue: (active.pvExplicit ?? 0) + (active.pvTerminal ?? 0) + equityAdjust,
        intrinsicPerShare: active.intrinsicPerShare ?? null,
        marginOfSafety: active.marginOfSafety ?? null,
      }
    : {
        pvExplicit: f.pvExplicit,
        pvTerminal: f.pvTerminal,
        firmValue: f.firmValue,
        equityValue: f.equityValue,
        intrinsicPerShare: f.intrinsicPerShare,
        marginOfSafety: f.marginOfSafety,
      };
  const ref = f.currentPrice ?? f.intrinsicPerShare;
  // Why there is no price to compare against, when that is the case: the quote
  // is a depositary receipt's, in a currency the statements are not in, and the
  // number of ordinary shares per receipt is not on file.
  const priceRefusal =
    f.priceComparison?.applicable === false ? f.priceComparison.reason : null;
  const mos = priceRefusal ? null : view.marginOfSafety;
  const mosColor =
    mos == null ? "text-white/50" :
    mos >= 0.25 ? "text-gain-strong" :
    mos >= 0 ? "text-gain" :
    mos >= -0.25 ? "text-gold" :
    "text-loss-strong";
  const hasStageMeta = viewRows.length > 0 && viewRows[0].phase != null;

  const assumptions: Array<{ k: string; v: string }> = [
    { k: "Horizon", v: `${a.horizonYears} yrs` },
    { k: "Revenue growth", v: `${rate(a.revenueGrowthInitial)} → ${rate(a.revenueGrowthTerminal)}` },
    { k: "Operating margin", v: `${rate(a.operatingMarginCurrent)} → ${rate(a.operatingMarginTarget)}` },
    { k: "Tax rate (effective)", v: rate(a.taxRate) },
    { k: "ROIC", v: rate(a.roic) },
    { k: "WACC", v: rate(a.wacc) },
    { k: "Net debt", v: money(a.netDebt) },
    { k: "Diluted shares", v: a.dilutedShares == null ? "n/a" : formatNumber(a.dilutedShares) },
    { k: "Exit P/FCF", v: a.exitPfcfMultiple == null ? "n/a" : `${a.exitPfcfMultiple.toFixed(3)}x` },
    { k: "Exit EV/EBITDA", v: a.evEbitdaMultiple == null ? "n/a" : `${a.evEbitdaMultiple.toFixed(3)}x` },
  ];

  return (
    <article className="panel p-6 md:p-8 animate-fade-up">
      <header className="mb-6">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">FCFF Firm Valuation</h2>
        <DefinitionLink number={71} prominent className="mt-3">How the FCFF model and WACC work</DefinitionLink>
      </header>

      <div className="mb-6">
        <QualitativeBlock section="individual" scopeKey={scope} groups={opening} storageSuffix="projections-open" defaultOpen hideHeader />
      </div>

      {/* Model structure: selection rationale + the stage toggle + warnings */}
      {sel && (
        <div className="panel-soft p-5 mb-6">
          <p className="eyebrow mb-3">Model Structure</p>
          <StageToggle
            ticker={ticker}
            variants={sel.stageVariants}
            recommended={sel.recommendedStages}
          />
          {sel.rationale.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {sel.rationale.map((s) => (
                <li key={s} className="text-sm text-white/65 leading-snug">{s}</li>
              ))}
            </ul>
          )}
          {(sel.diagnostics?.length ?? 0) > 0 && (
            <div className="mt-3 space-y-1.5">
              {sel.diagnostics?.map((d) => (
                <p key={`${d.id}-${d.detail}`} className="text-xs text-gold/80 leading-snug flex gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{d.detail}</span>
                </p>
              ))}
            </div>
          )}
          <DefinitionLink number={870} className="mt-3">
            How the engine chooses a model
          </DefinitionLink>
        </div>
      )}

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
            <BridgeRow label="PV of explicit FCFF" value={money(view.pvExplicit)} />
            <BridgeRow label="+ PV of terminal value" value={money(view.pvTerminal)} />
            <BridgeRow label="= Enterprise value" value={money(view.firmValue)} strong />
            <BridgeRow label="+ Cash & investments" value={money(f.cash)} />
            <BridgeRow label="− Gross debt" value={money(f.grossDebt)} />
            <BridgeRow label="− Minority interest" value={money(f.minorityInterest)} />
            <BridgeRow label="= Equity value" value={money(view.equityValue)} strong />
            <div className="pt-1 mt-2">
              <div className="flex items-baseline justify-between">
                <span className="text-white/55 text-xs"><MetricTerm metric="Intrinsic / share" asSpan /></span>
                <span className="font-display text-2xl font-semibold text-gold">{perShare(view.intrinsicPerShare)}</span>
              </div>
            </div>
            <BridgeRow
              label="Current price"
              value={priceRefusal ? "not applicable" : perShare(f.currentPrice)}
            />
            <div className="flex items-baseline justify-between">
              <span className="text-white/55 text-xs"><MetricTerm metric="Margin of safety" asSpan /></span>
              <span className={cn("font-mono text-base", mosColor)}>
                {mos == null
                  ? (priceRefusal ? "not applicable" : "n/a")
                  : `${mos >= 0 ? "+" : ""}${(mos * 100).toFixed(3)}%`}
              </span>
            </div>
            {priceRefusal && (
              <p className="text-xs text-white/55 leading-snug pt-1">{priceRefusal}</p>
            )}
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
          {!showProjections ? (
            <div className="space-y-3">
              <p className="text-sm text-white/65 leading-relaxed">{PROJECTIONS_COPY.gate}</p>
              <button
                type="button"
                onClick={() => setShownFor(scope)}
                className="text-xs px-3 py-1.5 rounded-md border border-gold/30 text-gold/90 hover:bg-gold/10 transition-colors"
              >
                {PROJECTIONS_COPY.showAnyway}
              </button>
            </div>
          ) : viewRows.length === 0 ? (
            <p className="text-sm text-white/55 leading-relaxed">
              A single-stage model has no explicit projection years: the company
              is treated as already stable, so the whole value is the perpetuity.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="border-collapse text-sm w-full" style={{ minWidth: 520 }}>
                <thead>
                  <tr>
                    <th scope="col" className="sticky left-0 z-10 bg-ink-800 text-left px-3 py-2 border-b border-r border-gold/15 min-w-[150px]">
                      <span className="label">Line</span>
                    </th>
                    {viewYears.map((y) => (
                      <th key={y} scope="col" className="px-2.5 py-2 border-b border-gold/10 text-right min-w-[72px]">
                        <span className="text-[0.7rem] font-mono text-white/55">{y}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {hasStageMeta && (
                    <tr>
                      <th scope="row" className="sticky left-0 z-10 bg-ink-800 text-left px-3 py-1.5 border-b border-r border-white/[0.06] font-normal">
                        <span className="text-[0.8rem] text-white/75"><MetricTerm metric="Stage" asSpan /></span>
                      </th>
                      {viewRows.map((r, i) => (
                        <td key={i} className="px-2.5 py-1.5 text-right border-b border-white/[0.05] font-mono text-[0.7rem] text-white/55">
                          {r.phase === "high" ? "high" : "transition"}
                        </td>
                      ))}
                    </tr>
                  )}
                  {STATEMENT_ROWS.map((sr) => (
                    <tr key={sr.label}>
                      <th scope="row" className="sticky left-0 z-10 bg-ink-800 text-left px-3 py-1.5 border-b border-r border-white/[0.06] font-normal">
                        <span className="text-[0.8rem] text-white/75"><MetricTerm metric={sr.label} asSpan /></span>
                      </th>
                      {viewRows.map((r, i) => (
                        <td key={i} className="px-2.5 py-1.5 text-right border-b border-white/[0.05] tabular-nums font-mono text-[0.76rem] text-white/80">
                          {sr.get(r)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {hasStageMeta && viewRows[0].wacc != null && (
                    <tr>
                      <th scope="row" className="sticky left-0 z-10 bg-ink-800 text-left px-3 py-1.5 border-b border-r border-white/[0.06] font-normal">
                        <span className="text-[0.8rem] text-white/75"><MetricTerm metric="Cost of capital" asSpan /></span>
                      </th>
                      {viewRows.map((r, i) => (
                        <td key={i} className="px-2.5 py-1.5 text-right border-b border-white/[0.05] tabular-nums font-mono text-[0.76rem] text-white/70">
                          {r.wacc != null ? `${(r.wacc * 100).toFixed(2)}%` : "n/a"}
                        </td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showProjections && nextTwoYears?.applicable && (
        <NextTwoYearsSection
          key={scope}
          data={nextTwoYears}
          scopeKey={scope}
          company={company}
          forecast={f}
          // Only a non-recommended structure overrides the block's model columns.
          variantRows={isVariantView ? ((active?.rows ?? NO_ROWS) as ForecastRow[]) : null}
        />
      )}

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
                    <span className="text-[0.7rem] font-mono text-white/60">{(g * 100).toFixed(3)}%</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {f.sensitivity.matrix.map((row, wi) => (
                <tr key={wi}>
                  <th scope="row" className={cn("px-3 py-2 text-left border-b border-r border-gold/10", wi === 2 && "bg-gold/5")}>
                    <span className="text-[0.7rem] font-mono text-white/60">{(f.sensitivity.waccAxis[wi] * 100).toFixed(3)}%</span>
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
                      {cell == null ? "n/a" : `$${cell.toFixed(3)}`}
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
    { k: betaLabel, v: b.beta == null ? "n/a" : b.beta.toFixed(3) },
    { k: "Risk-free (10Y)", v: rate(b.riskFreeRate) },
    { k: erpLabel, v: rate(b.equityRiskPremium) },
    { k: "Cost of equity", v: rate(b.costOfEquity) },
    { k: "Cost of debt (pre→after)", v: `${rate(b.costOfDebtPretax)} → ${rate(b.costOfDebtAfterTax)}` },
    { k: "Interest coverage", v: b.interestCoverage == null ? "n/a" : `${b.interestCoverage.toFixed(3)}x` },
    { k: "Weights (E / D)", v: `${(b.weightEquity * 100).toFixed(3)}% / ${(b.weightDebt * 100).toFixed(3)}%` },
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
