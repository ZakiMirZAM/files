import { useState } from "react";
import { BookOpen, ChevronDown } from "lucide-react";
import type { Sp500Valuation } from "../lib/types";
import { cn } from "../lib/cn";
import { openDefinition } from "../lib/definitionPanelStore";
import { ECON_PANEL_OFFSET } from "../lib/economicDefinitions";

interface Sp500ValuationPanelProps {
  valuation?: Sp500Valuation | null;
}

const pct = (v: number | null | undefined, d = 2): string =>
  v == null || !Number.isFinite(v) ? "n/a" : `${(v * 100).toFixed(d)}%`;
const num = (v: number | null | undefined, d = 0): string =>
  v == null || !Number.isFinite(v) ? "n/a" : v.toLocaleString(undefined, { maximumFractionDigits: d });

/**
 * S&P 500 valuation panel — Damodaran's two-stage DCF on the index. Discounts the
 * index's expected shareholder cash flows (earnings × payout, grown then a
 * perpetuity at the risk-free rate) to back out the implied expected return / ERP,
 * and computes a fair value against a baseline required return. Collapsible to
 * match the other economic dropdowns. Sourced from /api/economic → sp500Valuation.
 */
export function Sp500ValuationPanel({ valuation }: Sp500ValuationPanelProps) {
  const [open, setOpen] = useState(false);
  if (!valuation) return null;

  const ou = valuation.overUnderValuationPct;
  const ouColor =
    ou == null ? "text-white/50" : ou >= 0 ? "text-gain-strong" : "text-loss-strong";
  const ouSummary = ou == null ? null : `${ou >= 0 ? "+" : ""}${ou.toFixed(1)}% vs fair value`;
  const proj = valuation.projection ?? [];

  return (
    <article className="panel overflow-hidden animate-fade-up">
      <div className="w-full flex items-center gap-3 px-6 md:px-8 py-4">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex-1 min-w-0 flex items-center gap-4 text-left group"
        >
          <div className="flex-1 min-w-0">
            <p className="eyebrow mb-1">Market inputs · S&amp;P 500 valuation</p>
            <h2 className="font-display text-xl md:text-2xl font-semibold text-white leading-tight">
              S&amp;P 500 Fair Value &amp; Implied Return
            </h2>
          </div>
          {ouSummary && (
            <span className={cn("hidden sm:block font-mono text-sm shrink-0", ouColor)}>
              {ouSummary}
            </span>
          )}
          <ChevronDown
            className={cn(
              "w-5 h-5 text-white/40 shrink-0 transition-transform duration-200 group-hover:text-gold",
              open && "rotate-180",
            )}
          />
        </button>
        <button
          type="button"
          onClick={() => openDefinition(ECON_PANEL_OFFSET + 65)}
          aria-label="Read the S&P 500 Fair Value and Implied Return definition"
          title="Definition"
          className="btn-ghost shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[0.7rem] font-mono uppercase tracking-wider text-white/45 hover:text-gold"
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Define</span>
        </button>
      </div>

      {open && (
        <div className="px-6 md:px-8 pb-8 pt-1 border-t border-gold/10">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-6">
            <Stat label="Index price" value={num(valuation.price, 0)} />
            <Stat label="S&P 500 earnings (trailing)" value={num(valuation.earnings, 1)} />
            <Stat label="Implied return" value={pct(valuation.impliedReturn)} accent />
            <Stat label="Implied ERP" value={pct(valuation.impliedERP)} accent />
            <Stat label="Risk-free (DGS10)" value={pct(valuation.riskFree)} />
            <Stat label="Expected growth" value={pct(valuation.growth)} />
            <Stat label="Cash payout" value={pct(valuation.payout)} />
            <Stat label="Terminal growth" value={pct(valuation.terminalGrowth)} />
            <Stat
              label={`Fair value @ ${pct(valuation.baselineERP)} ERP`}
              value={num(valuation.fairValueAtBaseline, 0)}
            />
            <Stat
              label="Over / under vs price"
              value={ou == null ? "n/a" : `${ou >= 0 ? "+" : ""}${ou.toFixed(1)}%`}
              className={ouColor}
            />
          </div>

          {proj.length > 0 && (
            <div className="mb-6">
              <h3 className="font-display text-base font-semibold text-white mb-1">
                5-Year Earnings Projection
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left text-[0.65rem] uppercase tracking-wider text-white/40 border-b border-gold/15">
                      <th className="py-2 pr-4 font-medium">Year</th>
                      <th className="py-2 pr-4 font-medium text-right">Projected EPS</th>
                      <th className="py-2 pr-4 font-medium text-right">Cash to shareholders</th>
                      <th className="py-2 font-medium text-right">PV @ implied return</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-white/85">
                    {proj.map((row) => (
                      <tr key={row.year} className="border-b border-white/[0.06]">
                        <td className="py-2 pr-4 text-white/60">Year {row.year}</td>
                        <td className="py-2 pr-4 text-right text-gold">{num(row.projectedEarnings, 1)}</td>
                        <td className="py-2 pr-4 text-right">{num(row.cashFlow, 1)}</td>
                        <td className="py-2 text-right text-white/70">{num(row.pvAtImpliedReturn, 1)}</td>
                      </tr>
                    ))}
                    {valuation.terminalCashFlow != null && (
                      <tr className="text-white/55">
                        <td className="py-2 pr-4">Terminal</td>
                        <td className="py-2 pr-4 text-right">—</td>
                        <td className="py-2 pr-4 text-right">
                          {num(valuation.terminalCashFlow, 1)} → perpetuity @ {pct(valuation.terminalGrowth)}
                        </td>
                        <td className="py-2 text-right">—</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="text-[0.72rem] text-white/40 leading-relaxed">
            {ou == null ? (
              "Fair value unavailable — the baseline required return falls below terminal growth for the current inputs."
            ) : ou >= 0 ? (
              <>
                At a baseline {pct(valuation.baselineERP)} equity risk premium, the index's fair value sits{" "}
                <span className="text-gain-strong">{Math.abs(ou).toFixed(1)}% above</span> its current
                price — the market looks <span className="text-gain-strong">cheap</span> versus that baseline.
              </>
            ) : (
              <>
                At a baseline {pct(valuation.baselineERP)} equity risk premium, the index's fair value sits{" "}
                <span className="text-loss-strong">{Math.abs(ou).toFixed(1)}% below</span> its current
                price — the market looks <span className="text-loss-strong">expensive</span> versus that baseline.
              </>
            )}
          </p>
        </div>
      )}
    </article>
  );
}

function Stat({
  label,
  value,
  accent,
  className,
}: {
  label: string;
  value: string;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div className="panel-soft px-3 py-2.5">
      <p className="text-[0.65rem] uppercase tracking-wider text-white/40 leading-tight">{label}</p>
      <p className={cn("font-mono text-[0.95rem] mt-1", accent ? "text-gold" : "text-white/85", className)}>
        {value}
      </p>
    </div>
  );
}
