import { useState } from "react";
import type { BreakevenDriverName, DcfBreakdown, ReverseBreakevenApplicable } from "../../lib/types";
import { formatCurrency, formatNumber, formatPerShare } from "../../lib/format";
import { cn } from "../../lib/cn";
import { formatStoryValue, STORY_VALUATION_DEFS as D } from "../../lib/story";
import {
  BREAKEVEN_DRIVERS, assumptionRows, defaultValuationDriver, formatDriver, priceVerdict, terminalFormula,
  type AssumptionRow,
} from "../../lib/reverseBreakeven";
import { MetricTerm } from "./DefinitionsBlock";
import { Line, PROJECTION_COLUMNS } from "./StoryValuation";

const WACC_DEF = 183;
const STABLE_GROWTH_DEF = 893;

const money = (v: number): string => formatCurrency(v);
const pct = (v: number | null): string => formatStoryValue("fraction", v);

/** Revenue through present value, with the discount factor before the present value. */
const COLUMNS = [
  ...PROJECTION_COLUMNS.slice(0, -1),
  { label: "Discount factor", def: D.presentValue },
  ...PROJECTION_COLUMNS.slice(-1),
];

/**
 * "The valuation that justifies today's price": the model's full DCF beside the
 * same DCF with one driver moved to the value the price needs.
 */
export function ReverseDcfValuation({ data }: { data: ReverseBreakevenApplicable }) {
  const [picked, setPicked] = useState<BreakevenDriverName | null>(null);
  const selected = picked ?? defaultValuationDriver(data.drivers);
  const driver = data.drivers.find((d) => d.driver === selected);
  if (!data.modelValuation || !driver?.valuation) return null;
  const rows = assumptionRows(data.drivers, driver.driver);
  const solved = driver.status === "solved";

  return (
    <div>
      <p className="eyebrow mb-3">The valuation that justifies today's price</p>
      <div role="group" aria-label="Driver" className="inline-flex flex-wrap rounded-sm border border-gold/15 overflow-hidden mb-4">
        {data.drivers.filter((d) => d.valuation).map((d, i) => (
          <button
            key={d.driver}
            type="button"
            onClick={() => setPicked(d.driver)}
            aria-pressed={d.driver === driver.driver}
            className={cn(
              "px-2.5 py-1 text-[0.65rem] font-mono uppercase tracking-wider transition-colors",
              i > 0 && "border-l border-gold/15",
              d.driver === driver.driver ? "bg-gold/15 text-gold" : "text-white/40 hover:text-white/70",
            )}
          >
            {BREAKEVEN_DRIVERS[d.driver].label}
          </button>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Column title="Model's numbers" v={data.modelValuation} rows={rows} side="model"
          verdict={priceVerdict(data.modelValuation, data.priceUsed, false)} />
        <Column title="At the price's assumption" v={driver.valuation} rows={rows} side="atPrice"
          verdict={priceVerdict(driver.valuation, data.priceUsed, solved)} />
      </div>
    </div>
  );
}

function Column({ title, v, rows, side, verdict }: {
  title: string; v: DcfBreakdown; rows: AssumptionRow[]; side: "model" | "atPrice"; verdict: string;
}) {
  return (
    <div className="rounded-sm border border-white/[0.06] p-4 space-y-4 min-w-0">
      <h3 className="font-display text-lg font-semibold text-white">{title}</h3>

      <dl className="space-y-1 text-sm">
        {rows.map((r) => (
          <div key={r.driver} className={cn("flex items-baseline justify-between gap-4 px-2 py-0.5 rounded-sm",
            r.changed && "bg-gold/10")}>
            <span className={cn("text-xs", r.changed ? "text-gold" : "text-white/55")}>
              <MetricTerm metric={BREAKEVEN_DRIVERS[r.driver].label} resolve={() => BREAKEVEN_DRIVERS[r.driver].def} asSpan />
            </span>
            <span className={cn("font-mono", r.changed && side === "atPrice" ? "text-gold" : "text-white/85")}>
              {formatDriver(r.driver, r[side])}
            </span>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-4 px-2 py-0.5">
          <span className="text-xs text-white/55">
            <MetricTerm metric="Stable growth rate" resolve={() => STABLE_GROWTH_DEF} asSpan />
          </span>
          <span className="font-mono text-white/85">{pct(v.stableGrowth)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-4 px-2 py-0.5">
          <span className="text-xs text-white/55"><MetricTerm metric="WACC" resolve={() => WACC_DEF} asSpan /></span>
          <span className="font-mono text-white/85">{pct(v.costOfCapital)}</span>
        </div>
      </dl>

      <div className="overflow-x-auto">
        <table className="border-collapse text-sm w-full" style={{ minWidth: 640 }}>
          <thead>
            <tr>
              <th scope="col" className="text-left px-2 py-2 border-b border-gold/15"><span className="label">Year</span></th>
              {COLUMNS.map(({ label, def }) => (
                <th key={label} scope="col" className="text-right px-2 py-2 border-b border-gold/15 align-bottom">
                  <span className="label"><MetricTerm metric={label} resolve={() => def} asSpan /></span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {v.rows.map((r) => (
              <tr key={r.year}>
                <th scope="row" className="text-left px-2 py-1.5 border-b border-white/[0.06] font-mono text-[0.72rem] text-white/60 font-normal">
                  {r.year}
                </th>
                {[money(r.revenue), pct(r.operatingMargin), money(r.ebitAfterTax), money(r.reinvestment),
                  money(r.fcff), r.discountFactor.toFixed(4), money(r.pvFcff)].map((x, j) => (
                  <td key={j} className="px-2 py-1.5 text-right border-b border-white/[0.05] tabular-nums font-mono text-[0.72rem] text-white/80">
                    {x}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 text-sm">
        <Line label="Return on capital after growth ends" def={880} value={pct(v.stableReturn)} />
        <Line label="Terminal value" def={D.terminalValue} value={money(v.terminal.value)} strong />
        <p className="font-mono text-[0.72rem] text-white/70 leading-relaxed break-words">
          {terminalFormula(v.terminal)}
        </p>
        <Line label="Present value of the terminal value" def={D.terminalValue} value={money(v.pvTerminal)} />
        <Line label="Sum of the present values of the cash flows" def={D.sumOfPresentValues} value={money(v.pvExplicit)} />
        <Line label="Enterprise value" def={D.enterpriseValue} value={money(v.enterpriseValue)} strong />
        <Line sign="+" label="Cash" def={D.cash} value={money(v.cash)} />
        <Line sign="−" label="Gross debt" def={D.grossDebt} value={money(v.grossDebt)} />
        <Line sign="−" label="Minority interest" def={D.minorityInterest} value={money(v.minorityInterest)} />
        <Line sign="=" label="Equity value" def={D.equityValue} value={money(v.equityValue)} strong />
        <Line label="Diluted shares" def={D.valuePerShare} value={formatNumber(v.dilutedShares)} />
        <div className="flex items-baseline justify-between gap-4 pt-2">
          <span className="text-xs text-white/75">
            <MetricTerm metric="Intrinsic / share" resolve={() => D.valuePerShare} asSpan />
          </span>
          <span className="font-display text-2xl font-semibold text-gold">{formatPerShare(v.valuePerShare)}</span>
        </div>
        <p className="text-[0.95rem] leading-7 text-white/70">{verdict}</p>
      </div>
    </div>
  );
}
