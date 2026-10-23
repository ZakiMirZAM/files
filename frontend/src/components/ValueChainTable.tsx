// Value chain under the Head to Head table: the base company, its suppliers and
// customers with figures in our database, then substitute profitability. Raw
// figures only, no colors for good or bad. Fetched only once the map is ready.

import { Fragment } from "react";
import { MetricTerm } from "./individual/DefinitionsBlock";
import { MatrixSkeleton } from "./Skeletons";
import { PanelLoadError } from "./DataStatusBanner";
import { SLOW_ROUTE_TIMEOUT_MS, useResource } from "../lib/useResource";
import { resolveComparativeDef } from "../lib/surfaceDefinitions";
import { formatFigure } from "../lib/headToHead";
import {
  CHAIN_COLUMNS,
  CHAIN_SIDES,
  fetchValueChain,
  formatPair,
  rowsForSide,
  type ValueChainPayload,
} from "../lib/valueChain";

interface Props {
  ticker: string;
  /** Changes when the stored map changes, so the figures are read again. */
  mapStamp: string;
}

export function ValueChainTable({ ticker, mapStamp }: Props) {
  const res = useResource<ValueChainPayload>(`valuechain|${ticker}|${mapStamp}`, fetchValueChain(ticker), {
    timeoutMs: SLOW_ROUTE_TIMEOUT_MS,
    what: "value chain figures",
  });

  if (res.state === "loading") {
    return <MatrixSkeleton rows={6} cols={CHAIN_COLUMNS.length + 1} label="Loading the value chain figures…" />;
  }
  if (res.state === "error") {
    return <PanelLoadError what="value chain figures" message={res.error ?? undefined} onRetry={res.retry} />;
  }
  const data = res.data;
  if (!data) return null;
  if (!data.applicable) {
    return <p className="panel p-4 text-sm text-white/60">{data.reason ?? "The value chain is not available."}</p>;
  }

  const [now, then] = data.years ?? [null, null];
  const cell = "px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap text-white";
  const substitutes = data.substitutes ?? [];

  return (
    <div className="panel p-4 mt-5">
      <h3 className="font-display text-base font-semibold text-white mb-1">Along the value chain</h3>
      <p className="text-xs text-white/50 mb-3">
        Each cell shows now · 5 years ago
        {now != null && then != null && (
          <>
            {" "}
            ({now} · {then} for {ticker}; every other firm uses its own fiscal years)
          </>
        )}
        .
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-white/60">
              <th className="px-3 py-2 text-left font-normal">Firm</th>
              {CHAIN_COLUMNS.map((c) => (
                <th key={c.key} className="px-3 py-2 text-right font-normal">
                  <MetricTerm metric={c.label} resolve={resolveComparativeDef} asSpan />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CHAIN_SIDES.map(({ side, label }) => {
              const rows = rowsForSide(data.rows, side);
              if (rows.length === 0) return null;
              return (
                <Fragment key={side}>
                  <tr>
                    <td
                      colSpan={CHAIN_COLUMNS.length + 1}
                      className="px-3 pt-3 pb-1 text-xs font-mono uppercase tracking-wider text-gold"
                    >
                      {label}
                    </td>
                  </tr>
                  {rows.map((r) => (
                    <tr key={`${side}-${r.ticker}`} className="border-t border-white/5">
                      <td className="px-3 py-2 text-white/80">
                        {r.name ?? r.ticker} <span className="font-mono text-white/50">({r.ticker})</span>
                        {r.category && <span className="block text-[11px] text-white/45">{r.category}</span>}
                        {r.years && now != null && r.years[0] !== now && (
                          <span className="block text-[11px] text-white/45">
                            FY {r.years[0]} · {r.years[1]}
                          </span>
                        )}
                      </td>
                      {CHAIN_COLUMNS.map((c) => (
                        <td key={c.key} className={cell}>
                          {formatPair(r[c.key], c.kind)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {substitutes.length > 0 && (
        <div className="mt-5">
          <h4 className="text-xs font-mono uppercase tracking-wider text-gold mb-2">Substitutes</h4>
          <ul className="space-y-2">
            {substitutes.map((s) => (
              <li key={s.category} className="text-sm text-white/70 leading-6">
                <span className="text-white/85">{s.category}</span>
                {s.examples.length > 0 && (
                  <span>
                    {" · "}
                    {s.examples
                      .map(
                        (e) =>
                          `${e.name ?? e.ticker} (${e.ticker}) operating margin ${formatFigure(e.operatingMargin, "pct")}`,
                      )
                      .join("; ")}
                  </span>
                )}
                <span className="text-white/55">
                  {" · median operating margin "}
                  {formatFigure(s.medianOperatingMargin, "pct")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.note && <p className="text-xs text-white/50 mt-4">{data.note}</p>}
    </div>
  );
}
