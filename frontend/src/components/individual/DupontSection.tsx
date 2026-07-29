import type { Dupont } from "../../lib/types";
import { cn } from "../../lib/cn";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { DefinitionsBlock, MetricTerm } from "./DefinitionsBlock";

interface DupontSectionProps {
  dupont?: Dupont | null;
}

const pct = (v: number | null | undefined, d = 3): string =>
  v == null ? "n/a" : `${(v * 100).toFixed(d)}%`;
const mult = (v: number | null | undefined, d = 3): string =>
  v == null ? "n/a" : `${v.toFixed(d)}×`;

// The five levers, in decomposition order. `kind` drives formatting (ratio vs %).
const FACTORS: { key: keyof Dupont["factors"]; label: string; sub: string; kind: "x" | "%" }[] = [
  { key: "taxBurden", label: "Tax Burden", sub: "NI / EBT", kind: "x" },
  { key: "interestBurden", label: "Interest Burden", sub: "EBT / EBIT", kind: "x" },
  { key: "ebitMargin", label: "EBIT Margin", sub: "EBIT / Revenue", kind: "%" },
  { key: "assetTurnover", label: "Asset Turnover", sub: "Revenue / Avg Assets", kind: "x" },
  { key: "financialLeverage", label: "Financial Leverage", sub: "Avg Assets / Avg Equity", kind: "x" },
];

/**
 * Extended 5-factor (CFA) DuPont decomposition of ROE for the individual company:
 * ROE = Tax Burden × Interest Burden × EBIT Margin × Asset Turnover × Financial Leverage.
 * Balance-sheet terms use average (begin+end)/2; EBIT = Operating Income.
 */
export function DupontSection({ dupont: d }: DupontSectionProps) {
  if (!d) return null;

  const fmt = (key: keyof Dupont["factors"], kind: "x" | "%") => {
    const v = d.factors[key];
    return kind === "%" ? pct(v) : mult(v);
  };

  const recent = d.rows.slice(-8);

  return (
    <section className="animate-fade-up">
      <header className="mb-5">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">
          5-Factor ROE Decomposition
        </h2>
      </header>

      {/* The multiplicative chain */}
      <div className="panel-soft p-5 mb-4">
        <div className="flex flex-wrap items-stretch gap-2">
          {FACTORS.map((f, i) => (
            <div key={f.key} className="flex items-center gap-2">
              <div className="rounded-sm border border-gold/15 bg-ink-800 px-3 py-2.5 min-w-[112px]">
                <p className="text-[0.65rem] uppercase tracking-wider text-white/40">
                  <MetricTerm metric={f.label} scope="dupont" />
                </p>
                <p className="font-mono text-lg text-white/90 leading-tight mt-0.5">{fmt(f.key, f.kind)}</p>
                <p className="text-[0.65rem] font-mono text-white/35 mt-0.5">{f.sub}</p>
              </div>
              <span className="text-gold/60 font-mono text-lg">{i < FACTORS.length - 1 ? "×" : "="}</span>
            </div>
          ))}
          <div className="rounded-sm border border-gold/40 bg-gold/10 px-3 py-2.5 min-w-[112px]">
            <p className="text-[0.65rem] uppercase tracking-wider text-gold/70">
              <MetricTerm metric="ROE" scope="dupont" />
            </p>
            <p className="font-mono text-lg text-gold leading-tight mt-0.5">{pct(d.roe)}</p>
            <p className="text-[0.65rem] font-mono text-white/35 mt-0.5">NI / Avg Equity</p>
          </div>
        </div>

        {/* Reconciliation + net-margin bridge */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4 text-xs">
          <span className={cn("inline-flex items-center gap-1.5 font-mono", d.reconciles ? "text-gain-strong" : "text-gold")}>
            {d.reconciles ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
            product {mult(d.product, 3)} {d.reconciles ? "= " : "≈ "} ROE {pct(d.roe)}
          </span>
          <span className="text-white/45 font-mono">
            Net margin (Tax × Interest × EBIT Margin) = {pct(d.netMargin)}
          </span>
          {d.roeReported != null && (
            <span className="text-white/40 font-mono" title="Stored ROE uses period-end equity; the decomposition uses average equity.">
              reported ROE (period-end equity) = {pct(d.roeReported)}
            </span>
          )}
        </div>
      </div>

      {/* Per-year history */}
      {recent.length > 1 && (
        <div className="panel-soft p-5">
          <p className="eyebrow mb-4">History · FY{recent[0].year}–{recent[recent.length - 1].year}</p>
          <div className="overflow-x-auto">
            <table className="border-collapse text-sm w-full" style={{ minWidth: 480 }}>
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-ink-800 text-left px-3 py-2 border-b border-r border-gold/15 min-w-[150px]">
                    <span className="label">Lever</span>
                  </th>
                  {recent.map((r) => (
                    <th key={r.year} className="px-2.5 py-2 border-b border-gold/10 text-right min-w-[64px]">
                      <span className="text-[0.7rem] font-mono text-white/55">{r.year}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "Tax Burden", get: (r: Dupont["rows"][number]) => mult(r.taxBurden) },
                  { label: "Interest Burden", get: (r: Dupont["rows"][number]) => mult(r.interestBurden) },
                  { label: "EBIT Margin", get: (r: Dupont["rows"][number]) => pct(r.ebitMargin) },
                  { label: "Asset Turnover", get: (r: Dupont["rows"][number]) => mult(r.assetTurnover) },
                  { label: "Financial Leverage", get: (r: Dupont["rows"][number]) => mult(r.financialLeverage) },
                  { label: "= ROE", get: (r: Dupont["rows"][number]) => pct(r.roe) },
                ].map((sr) => (
                  <tr key={sr.label}>
                    <th className={cn(
                      "sticky left-0 z-10 bg-ink-800 text-left px-3 py-1.5 border-b border-r border-white/[0.06] font-normal",
                      sr.label === "= ROE" && "text-gold",
                    )}>
                      <span className="text-[0.8rem] text-white/75">{sr.label}</span>
                    </th>
                    {recent.map((r, i) => (
                      <td key={i} className={cn(
                        "px-2.5 py-1.5 text-right border-b border-white/[0.05] tabular-nums font-mono text-[0.76rem]",
                        sr.label === "= ROE" ? "text-gold" : "text-white/80",
                      )}>
                        {sr.get(r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <DefinitionsBlock section="dupont" title="DuPont lever definitions" className="mt-4" />
    </section>
  );
}
