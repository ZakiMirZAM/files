import type { ReactNode } from "react";
import type { BreakevenGrid, ReverseBreakevenApplicable } from "../../lib/types";
import { fetchReverseBreakeven } from "../../lib/api";
import { SLOW_ROUTE_TIMEOUT_MS, useResource } from "../../lib/useResource";
import { formatPerShare } from "../../lib/format";
import { cn } from "../../lib/cn";
import {
  BREAKEVEN_DRIVERS, cellTint, firmFigure, formatDriver, plausibilityLines, statusSentence,
} from "../../lib/reverseBreakeven";
import { DefinitionLink, MetricTerm } from "./DefinitionsBlock";

interface ReverseDcfSectionProps {
  /** The ROUTE ticker; the backend folds aliases onto the primary listing. */
  ticker: string;
}

/**
 * Reverse DCF as a breakeven: for each valuation driver, holding the others at
 * the model's numbers, the value today's price needs; then two grids of value
 * per share over pairs of drivers, and plain checks on whether those numbers
 * are believable.
 */
export function ReverseDcfSection({ ticker }: ReverseDcfSectionProps) {
  const res = useResource(
    `reverse-dcf|${ticker.toUpperCase()}`,
    (s) => fetchReverseBreakeven(ticker, s),
    { what: "reverse DCF figures", timeoutMs: SLOW_ROUTE_TIMEOUT_MS },
  );
  const data = res.state === "ready" ? res.data : null;

  let body: ReactNode;
  if (data?.applicable) body = <BreakevenPanel data={data} />;
  else {
    const text = data
      ? `Not applicable. ${data.reason}`
      : res.state === "error"
        ? res.error
        : "Working out what today's price implies.";
    body = (
      <div className="panel-soft p-5">
        <p className="text-[0.95rem] leading-7 text-white/70">{text}</p>
        {res.state === "error" && (
          <button type="button" className="btn-outline mt-3" onClick={res.retry}>Try again</button>
        )}
      </div>
    );
  }

  return (
    <section className="animate-fade-up">
      <header className="mb-5">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">Reverse DCF</h2>
        <DefinitionLink number={193} prominent className="mt-3">How market-implied growth works</DefinitionLink>
      </header>
      {body}
    </section>
  );
}

const TH = "px-3 py-2 border-b border-gold/15 text-[0.65rem] uppercase tracking-wider text-white/40 font-normal";
const TD = "px-3 py-2 border-b border-white/[0.05] font-mono text-[0.76rem] tabular-nums text-white/85";

function Term({ driver }: { driver: keyof typeof BREAKEVEN_DRIVERS }) {
  const { label, def } = BREAKEVEN_DRIVERS[driver];
  return <MetricTerm metric={label} resolve={() => def} asSpan />;
}

function BreakevenPanel({ data }: { data: ReverseBreakevenApplicable }) {
  return (
    <div className="panel-soft p-5 space-y-6">
      <p className="text-[0.95rem] leading-7 text-white/70">
        Today's price is {formatPerShare(data.priceUsed)} a share
        {data.valueAtModel != null && <>; on the model's numbers the company is worth {formatPerShare(data.valueAtModel)}</>}.
        {" "}Each row changes one number, holds the rest at the model's, and finds the value that makes the two equal.
      </p>

      <div>
        <p className="eyebrow mb-3">What the price implies</p>
        <div className="overflow-x-auto">
          <table className="border-collapse text-sm w-full" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th className={cn(TH, "text-left")}>Driver</th>
                <th className={cn(TH, "text-right")}>Model's number</th>
                <th className={cn(TH, "text-right")}>What today's price needs</th>
                <th className={cn(TH, "text-right")}>Firm history</th>
                <th className={cn(TH, "text-right")}>Peer median</th>
                <th className={cn(TH, "text-right")}>Peer top decile</th>
              </tr>
            </thead>
            <tbody>
              {data.drivers.map((d) => {
                const why = statusSentence(d);
                return (
                  <tr key={d.driver}>
                    <th scope="row" className="px-3 py-2 border-b border-white/[0.05] text-left text-[0.85rem] font-normal text-white/85">
                      <Term driver={d.driver} />
                    </th>
                    <td className={cn(TD, "text-right")}>{formatDriver(d.driver, d.model)}</td>
                    <td className={cn(TD, "text-right", why ? "text-white/70 font-sans text-[0.8rem] max-w-[280px]" : "text-gold")}>
                      {why ?? formatDriver(d.driver, d.implied)}
                    </td>
                    <td className={cn(TD, "text-right")}>{firmFigure(d)}</td>
                    <td className={cn(TD, "text-right")}>{formatDriver(d.driver, d.peerMedian)}</td>
                    <td className={cn(TD, "text-right")}>{formatDriver(d.driver, d.peerTopDecile)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <GridTable grid={data.grids.growthMargin} />
      <GridTable grid={data.grids.growthRoic} />

      <ul className="space-y-1.5 text-[0.95rem] leading-7 text-white/70">
        {plausibilityLines(data).map((line) => <li key={line}>{line}</li>)}
      </ul>
    </div>
  );
}

/** A breakeven grid in the sensitivity-grid style; the centre is the model's numbers. */
function GridTable({ grid }: { grid: BreakevenGrid }) {
  const centre = Math.floor(grid.rowAxis.length / 2);
  const colCentre = Math.floor(grid.colAxis.length / 2);
  return (
    <div>
      <p className="eyebrow mb-3">
        Value per share · {BREAKEVEN_DRIVERS[grid.rowDriver].label.toLowerCase()} by {BREAKEVEN_DRIVERS[grid.colDriver].label.toLowerCase()}
      </p>
      <div className="overflow-x-auto">
        <table className="border-collapse text-sm" style={{ minWidth: 640 }}>
          <thead>
            <tr>
              <th className="px-3 py-2 text-left border-b border-r border-gold/15 text-[0.65rem] uppercase tracking-wider text-white/40 font-normal">
                <Term driver={grid.rowDriver} /> ＼ <Term driver={grid.colDriver} />
              </th>
              {grid.colAxis.map((c, ci) => (
                <th key={ci} className={cn("px-3 py-2 text-right border-b border-gold/10 min-w-[78px]", ci === colCentre && "bg-gold/5")}>
                  <span className="text-[0.7rem] font-mono text-white/60">{formatDriver(grid.colDriver, c)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.cells.map((row, ri) => (
              <tr key={ri}>
                <th scope="row" className={cn("px-3 py-2 text-left border-b border-r border-gold/10", ri === centre && "bg-gold/5")}>
                  <span className="text-[0.7rem] font-mono text-white/60">{formatDriver(grid.rowDriver, grid.rowAxis[ri])}</span>
                </th>
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className={cn(
                      "px-3 py-2 text-right border-b border-white/[0.05] tabular-nums font-mono text-[0.76rem]",
                      cell.value == null ? "text-white/20" : "text-white/85",
                      ri === centre && ci === colCentre && "ring-1 ring-inset ring-gold/50",
                    )}
                    style={{ backgroundColor: cellTint(cell) }}
                  >
                    {formatPerShare(cell.value)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
