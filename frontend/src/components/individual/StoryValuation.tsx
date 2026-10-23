import type { ReactNode } from "react";
import type { StoryForecast } from "../../lib/types";
import { formatCurrency, formatPerShare } from "../../lib/format";
import { cn } from "../../lib/cn";
import { MetricTerm } from "./DefinitionsBlock";
import { STORY_VALUATION_DEFS as D, formatStoryValue, stageShapeLabel } from "../../lib/story";

const money = (v: number | null | undefined): string => (v == null ? "n/a" : formatCurrency(v));
const pct = (v: number | null | undefined): string => formatStoryValue("fraction", v ?? null);

export const PROJECTION_COLUMNS: Array<{ label: string; def: number }> = [
  { label: "Revenue", def: D.revenue },
  { label: "Operating margin", def: D.operatingMargin },
  { label: "After-tax operating profit", def: D.afterTaxOperatingProfit },
  { label: "Reinvestment", def: D.reinvestment },
  { label: "Free cash flow", def: D.freeCashFlow },
  { label: "Present value", def: D.presentValue },
];

/**
 * "Your story's valuation": the story-dcf result laid out from the projection
 * to the value per share, at the end of the story section.
 */
export function StoryValuation({ forecast: f }: { forecast: StoryForecast }) {
  const c = f.storyChecks;
  const priceRefusal = f.priceComparison?.applicable === false ? f.priceComparison.reason : null;
  return (
    <div className="panel-soft p-5 space-y-5">
      <div>
        <h3 className="font-display text-lg font-semibold text-white">Your story's valuation</h3>
        <p className="mt-1 text-sm text-white/70">
          <MetricTerm metric="Number of stages" resolve={() => D.stages} asSpan />
          {`: ${stageShapeLabel(c.stages.used)}`}
        </p>
      </div>

      {f.rows.length === 0 ? (
        <p className="text-sm text-white/60 leading-relaxed">
          A single-stage valuation has no projection years: the company is treated as
          already stable, so the whole value is the terminal value.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="border-collapse text-sm w-full" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th scope="col" className="text-left px-3 py-2 border-b border-gold/15">
                  <span className="label">Year</span>
                </th>
                {PROJECTION_COLUMNS.map(({ label, def }) => (
                  <th key={label} scope="col" className="text-right px-3 py-2 border-b border-gold/15 align-bottom">
                    <span className="label"><MetricTerm metric={label} resolve={() => def} asSpan /></span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {f.rows.map((r, i) => (
                <tr key={r.year}>
                  <th scope="row" className="text-left px-3 py-1.5 border-b border-white/[0.06] font-mono text-[0.76rem] text-white/60 font-normal">
                    {f.years[i] ?? f.baseYear + r.year}
                  </th>
                  {[money(r.revenue), pct(r.operatingMargin), money(r.ebitAfterTax), money(r.reinvestment),
                    money(r.fcff), money(r.pvFcff)].map((v, j) => (
                    <td key={j} className="px-3 py-1.5 text-right border-b border-white/[0.05] tabular-nums font-mono text-[0.76rem] text-white/80">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <dl className="space-y-2 text-sm max-w-xl">
        <Line label="Terminal value" def={D.terminalValue} value={money(f.terminalValue)} />
        <Line label="Present value of the terminal value" def={D.terminalValue} value={money(f.pvTerminal)} />
        <Line label="Sum of the present values of the cash flows" def={D.sumOfPresentValues} value={money(f.pvExplicit)} />
        <Line label="Enterprise value" def={D.enterpriseValue} value={money(f.firmValue)} strong />
        <Line sign="+" label="Cash" def={D.cash} value={money(f.cash)} />
        <Line sign="−" label="Gross debt" def={D.grossDebt} value={money(f.grossDebt)} />
        <Line sign="−" label="Minority interest" def={D.minorityInterest} value={money(f.minorityInterest)} />
        <Line sign="=" label="Equity value" def={D.equityValue} value={money(f.equityValue)} strong />
        <Line label="Value per share if the story works" def={D.valuePerShare} value={formatPerShare(c.valueIfStoryWorksPerShare)} />
        <Line label="Chance the story ends" def={D.failure} value={pct(c.failureProbability)} />
        <Line
          label="Adjustment for the chance the story ends"
          def={D.failure}
          value={formatPerShare(c.failureAdjustedPerShare - c.valueIfStoryWorksPerShare)}
        />
        <div className="flex items-baseline justify-between gap-4 pt-2">
          <span className="text-xs text-white/75">
            <MetricTerm metric="Value per share from your story" resolve={() => D.valuePerShare} asSpan />
          </span>
          <span className="font-display text-2xl font-semibold text-gold">{formatPerShare(f.intrinsicPerShare)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-xs text-white/55"><MetricTerm metric="Current price" asSpan /></span>
          <span className="font-mono text-white/85">{priceRefusal ? "not applicable" : formatPerShare(f.currentPrice)}</span>
        </div>
        {priceRefusal && <p className="text-xs text-white/55 leading-snug">{priceRefusal}</p>}
      </dl>
    </div>
  );
}

export function Line({ label, def, value, sign, strong }: {
  label: string; def: number; value: ReactNode; sign?: string; strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className={cn("text-xs", strong ? "text-white/75" : "text-white/55")}>
        {sign ? `${sign} ` : ""}
        <MetricTerm metric={label} resolve={() => def} asSpan />
      </span>
      <span className={cn("font-mono", strong ? "text-white font-medium" : "text-white/85")}>{value}</span>
    </div>
  );
}
