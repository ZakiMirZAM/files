import { useState } from "react";
import { ChevronDown, Layers } from "lucide-react";
import type { VerticalTable } from "../../lib/types";
import { cn } from "../../lib/cn";
import { DefinitionLink, MetricTerm } from "./DefinitionsBlock";

interface VerticalAnalysisSectionProps {
  vertical: { income: VerticalTable; balance: VerticalTable; cashflow?: VerticalTable };
  years: number[];
  defaultOpen?: boolean;
}

function pct(v: number | undefined): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function CommonSizeTable({ caption, base, table, years, defScope }: { caption: string; base: string; table: VerticalTable; years: number[]; defScope?: string }) {
  const rows = Object.keys(table);
  const cols = years.filter((y) => rows.some((r) => table[r]?.[String(y)] !== undefined));
  if (rows.length === 0 || cols.length === 0) return null;

  return (
    <div className="rounded-md border border-gold/15 bg-ink-800 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gold/10 flex items-baseline justify-between gap-3">
        <span className="text-[0.8rem] font-semibold text-white/85">{caption}</span>
        <span className="text-[0.65rem] font-mono text-white/35">base · {base}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="border-collapse text-sm w-full" style={{ minWidth: 520 }}>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-ink-800 text-left px-4 py-2.5 border-b border-r border-gold/15 min-w-[180px]">
                <span className="label">Line item</span>
              </th>
              {cols.map((y) => (
                <th key={y} scope="col" className="bg-ink-800 px-3 py-2.5 border-b border-gold/10 text-right min-w-[72px]">
                  <span className="text-[0.7rem] font-mono text-white/55">{y}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r}>
                <th scope="row" className="sticky left-0 z-10 bg-ink-800 text-left px-4 py-2 border-b border-r border-white/[0.06] font-normal">
                  <MetricTerm metric={r} scope={defScope} className="text-[0.82rem] text-white/75 leading-snug" />
                </th>
                {cols.map((y) => {
                  const v = table[r]?.[String(y)];
                  return (
                    <td
                      key={y}
                      className={cn(
                        "px-3 py-2 text-right border-b border-white/[0.05] tabular-nums font-mono text-[0.78rem]",
                        v === undefined ? "text-white/20" : "text-white/80",
                      )}
                    >
                      {pct(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Collapsible common-size (vertical) analysis: each line as a % of its base year. */
export function VerticalAnalysisSection({ vertical, years, defaultOpen = false }: VerticalAnalysisSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const hasData =
    Object.keys(vertical.income).length > 0 ||
    Object.keys(vertical.balance).length > 0 ||
    Object.keys(vertical.cashflow ?? {}).length > 0;
  if (!hasData) return null;

  return (
    <article className="panel overflow-hidden transition-colors hover:border-gold/20 animate-fade-up">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-4 px-5 md:px-6 py-4 text-left group"
      >
        <Layers className="w-5 h-5 text-gold/50 shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-lg md:text-xl font-semibold text-white leading-tight">Vertical (Common-Size) Analysis</h3>
          <p className="text-[0.7rem] uppercase tracking-wider font-mono mt-0.5 text-white/40">
            income &amp; cash flow as % of revenue · balance as % of total assets
          </p>
        </div>
        <ChevronDown className={cn("w-5 h-5 text-white/40 shrink-0 transition-transform duration-200 group-hover:text-gold", open && "rotate-180")} />
      </button>

      {open && (
        <div className="px-5 md:px-6 pb-6 pt-1 border-t border-gold/10 space-y-5">
          <DefinitionLink number={81}>How common-size analysis works</DefinitionLink>
          <CommonSizeTable caption="Income statement" base="Revenue" table={vertical.income} years={years} defScope="verticalIncome" />
          <CommonSizeTable caption="Balance sheet" base="Total Assets" table={vertical.balance} years={years} defScope="verticalBalance" />
          {vertical.cashflow && (
            <CommonSizeTable caption="Cash flow statement" base="Revenue" table={vertical.cashflow} years={years} defScope="verticalCashflow" />
          )}
        </div>
      )}
    </article>
  );
}
