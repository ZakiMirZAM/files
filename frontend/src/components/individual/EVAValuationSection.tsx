import type { EvNopat, IndividualForecast } from "../../lib/types";
import { formatCurrency, formatPerShare } from "../../lib/format";
import { formatMetricValue } from "../../lib/metricFormat";
import { cn } from "../../lib/cn";
import { DefinitionLink, MetricTerm } from "./DefinitionsBlock";
import { DefinitionChart } from "./DefinitionChart";
import type { DefinitionSeries, SeriesPoint } from "../../lib/individualSeries";

interface EVAValuationSectionProps {
  forecast: IndividualForecast;
  /** Per-metric annual history (keyed like "roic_wacc_spread"); drives the spread chart. */
  metricHistory?: Record<string, Record<string, number>>;
}

const money = (v: number | null | undefined): string => (v == null ? "n/a" : formatCurrency(v));
const perShare = (v: number | null | undefined): string => formatPerShare(v);
const rate = (v: number | null | undefined, d = 3): string => (v == null ? "n/a" : `${(v * 100).toFixed(d)}%`);

/** Build a DefinitionSeries from a {year: value} history map, oldest → newest. */
function spreadSeriesFrom(history: Record<string, number> | undefined): DefinitionSeries | null {
  if (!history) return null;
  const points: SeriesPoint[] = Object.keys(history)
    .map((y) => ({ year: Number(y), period: y }))
    .filter((e) => Number.isFinite(e.year))
    .sort((a, b) => a.year - b.year)
    .map((e) => ({ period: e.period, value: history[e.period] }))
    .filter((p) => Number.isFinite(p.value));
  if (points.length < 2) return null;
  return {
    label: "ROIC − WACC spread",
    points,
    format: (v) => formatMetricValue(v, "%"),
    isRateOfChange: true,
  };
}

export function EVAValuationSection({ forecast: f, metricHistory }: EVAValuationSectionProps) {
  const eva = f.eva;
  if (!eva) return null;

  const a = f.assumptions;
  const shares = a.dilutedShares;
  const equityAdjust = (f.cash ?? 0) - (f.grossDebt ?? 0) - (f.minorityInterest ?? 0);
  const roicWaccSpread = a.roic != null ? a.roic - a.wacc : null;
  const spreadSeries = spreadSeriesFrom(metricHistory?.["roic_wacc_spread"]);

  // Per-share for each MVA form: (Invested Capital₀ + MVA + equity adjust) ÷ shares.
  const perShareOf = (mva: number | null | undefined): number | null => {
    if (mva == null || !shares || shares <= 0) return null;
    return (eva.investedCapital0 + mva + equityAdjust) / shares;
  };

  const forms: { label: string; mva: number | null | undefined; ps: number | null }[] = [
    { label: "Perpetuity · EVA₁ / WACC", mva: eva.perpetuityMva, ps: perShareOf(eva.perpetuityMva) },
    { label: "Constant-growth · EVA₁ / (WACC − g)", mva: eva.constantGrowthMva, ps: perShareOf(eva.constantGrowthMva) },
    { label: "2-stage (flat-EVA terminal), headline", mva: eva.mva, ps: eva.intrinsicPerShare },
  ];

  const mos =
    eva.intrinsicPerShare != null && f.currentPrice && f.currentPrice > 0
      ? (eva.intrinsicPerShare - f.currentPrice) / f.currentPrice
      : null;
  const mosColor =
    mos == null ? "text-white/50" : mos >= 0.25 ? "text-gain-strong" : mos >= 0 ? "text-gain" : mos >= -0.25 ? "text-gold" : "text-loss-strong";

  return (
    <article className="panel p-6 md:p-8 animate-fade-up">
      <header className="mb-6">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">Economic Profit (EVA / MVA)</h2>
        <DefinitionLink number={72} prominent className="mt-3">How the EVA valuation works</DefinitionLink>
      </header>

      {/* Assumptions */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-6">
        {[
          { k: "WACC", v: rate(eva.wacc) },
          { k: "Invested Capital₀", v: money(eva.investedCapital0) },
          { k: "ROIC", v: rate(a.roic) },
          { k: "ROIC − WACC", v: rate(roicWaccSpread) },
          { k: "EVA₁", v: money(eva.eva1) },
        ].map(({ k, v }) => (
          <div key={k} className="panel-soft px-3 py-2.5">
            <p className="text-[0.65rem] uppercase tracking-wider text-white/40"><MetricTerm metric={k} asSpan /></p>
            <p className="font-mono text-[0.8rem] text-white/85 mt-0.5">{v}</p>
          </div>
        ))}
      </div>

      {spreadSeries && (
        <div className="panel-soft p-5 mb-6">
          <p className="eyebrow mb-3">ROIC − WACC spread · history</p>
          <DefinitionChart series={spreadSeries} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Bridge + three forms */}
        <div className="lg:col-span-2 space-y-4">
          <div className="panel-soft p-5">
            <p className="eyebrow mb-4">Valuation Bridge</p>
            <dl className="space-y-2 text-sm">
              <BridgeRow label="Invested Capital₀" value={money(eva.investedCapital0)} />
              <BridgeRow label="+ MVA (PV of future EVA)" value={money(eva.mva)} />
              <BridgeRow label="= Enterprise value" value={money(eva.firmValue)} strong />
              <BridgeRow label="+ Cash & investments" value={money(f.cash)} />
              <BridgeRow label="− Gross debt" value={money(f.grossDebt)} />
              <BridgeRow label="− Minority interest" value={money(f.minorityInterest)} />
              <BridgeRow label="= Equity value" value={money(eva.equityValue)} strong />
              <div className="pt-1 mt-2 flex items-baseline justify-between">
                <span className="text-white/55 text-xs"><MetricTerm metric="EVA intrinsic / share" asSpan /></span>
                <span className="font-display text-2xl font-semibold text-gold">{perShare(eva.intrinsicPerShare)}</span>
              </div>
              <BridgeRow label="Current price" value={perShare(f.currentPrice)} />
              <div className="flex items-baseline justify-between">
                <span className="text-white/55 text-xs"><MetricTerm metric="Margin of safety" asSpan /></span>
                <span className={cn("font-mono text-base", mosColor)}>
                  {mos == null ? "n/a" : `${mos >= 0 ? "+" : ""}${(mos * 100).toFixed(3)}%`}
                </span>
              </div>
            </dl>
          </div>

          <div className="panel-soft p-5">
            <p className="eyebrow mb-3">Three economic-profit forms</p>
            <div className="space-y-2 text-sm">
              {forms.map((form) => (
                <div key={form.label} className="flex items-baseline justify-between gap-3">
                  <span className="text-white/55 text-xs leading-snug">{form.label}</span>
                  <span className="font-mono text-white/85 whitespace-nowrap">
                    {money(form.mva)} <span className="text-white/35">·</span> {perShare(form.ps)}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[0.75rem] font-mono text-white/40 mt-3">
              Cross-check vs FCFF DCF: <span className="text-white/70">{perShare(f.intrinsicPerShare)}</span>
            </p>
          </div>

          {eva.evNopat && <EvNopatCard ev={eva.evNopat} />}
        </div>

        {/* Projected EVA table */}
        <div className="lg:col-span-3 panel-soft p-5">
          <p className="eyebrow mb-4">Projected Economic Profit</p>
          <div className="overflow-x-auto">
            <table className="border-collapse text-sm w-full" style={{ minWidth: 480 }}>
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 z-10 bg-ink-800 text-left px-3 py-2 border-b border-r border-gold/15 min-w-[140px]">
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
                {[
                  { label: "NOPAT", get: (r: typeof eva.projected[number]) => money(r.nopat) },
                  { label: "Invested capital", get: (r: typeof eva.projected[number]) => money(r.investedCapital) },
                  { label: "− Capital charge", get: (r: typeof eva.projected[number]) => money(r.capitalCharge) },
                  { label: "= EVA", get: (r: typeof eva.projected[number]) => money(r.eva) },
                  { label: "PV of EVA", get: (r: typeof eva.projected[number]) => money(r.pvEva) },
                ].map((sr) => (
                  <tr key={sr.label}>
                    <th scope="row" className="sticky left-0 z-10 bg-ink-800 text-left px-3 py-1.5 border-b border-r border-white/[0.06] font-normal">
                      <span className="text-[0.8rem] text-white/75"><MetricTerm metric={sr.label} asSpan /></span>
                    </th>
                    {eva.projected.map((r, i) => (
                      <td key={i} className="px-2.5 py-1.5 text-right border-b border-white/[0.05] tabular-nums font-mono text-[0.76rem] text-white/80">
                        {sr.get(r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[0.72rem] text-white/40 mt-3 font-mono">
            <MetricTerm metric="Terminal EVA" asSpan /> {money(eva.terminalEva)} · PV {money(eva.pvTerminalEva)} ·{" "}
            <MetricTerm metric="MVA" asSpan /> {money(eva.mva)}
          </p>
        </div>
      </div>

    </article>
  );
}

/** Actual EV/NOPAT against the multiple ROIC, WACC and g justify. */
function EvNopatCard({ ev }: { ev: EvNopat }) {
  const x = (v: number | null) => formatMetricValue(v, "x");
  return (
    <div className="panel-soft p-5">
      <p className="eyebrow mb-3">EV / NOPAT · actual vs justified</p>
      <dl className="space-y-2 text-sm">
        <BridgeRow label="Actual EV / NOPAT" value={x(ev.actual)} />
        <BridgeRow label="Justified EV / NOPAT" value={x(ev.justified)} />
        <BridgeRow label="Actual ÷ justified" value={x(ev.actualToJustified)} strong />
      </dl>
      <p className="text-[0.75rem] font-mono text-white/40 mt-3 leading-relaxed">
        (1 − {rate(ev.growth)} ÷ {rate(ev.roic)}) × (1 + {rate(ev.growth)}) ÷ ({rate(ev.wacc)} − {rate(ev.growth)})
      </p>
      <p className="text-[0.75rem] text-white/55 mt-1">Below 1 means cheap.</p>
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
