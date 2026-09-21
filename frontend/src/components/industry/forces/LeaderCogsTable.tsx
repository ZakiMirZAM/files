// The four largest companies' cost of goods as a share of revenue, first and
// last year on file, with a sparkline of every year between. The backend sends
// one series per company, so this is a small table rather than a single tile.

import { Link } from "react-router-dom";
import type { LeaderCogsSeries } from "../../../lib/industryStructureApi";
import { buildLeaderCogsRows } from "../../../lib/industryStructureFormat";
import {
  LEADER_COGS_TITLE,
  LEADER_COGS_NOTE,
  LEADER_COGS_EMPTY,
  LEADER_COGS_COLUMNS,
} from "../../../lib/industryForcesCopy";

interface LeaderCogsTableProps {
  leaders: LeaderCogsSeries[] | null | undefined;
}

const SPARK_WIDTH = 72;
const SPARK_HEIGHT = 18;

/** A bare polyline over one company's series, sized to the row. */
function Sparkline({ series, label }: { series: Array<{ year: number; value: number }>; label: string }) {
  if (series.length < 2) return null;
  const values = series.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = series
    .map((p, i) => {
      const x = (i / (series.length - 1)) * SPARK_WIDTH;
      const y = SPARK_HEIGHT - ((p.value - min) / span) * SPARK_HEIGHT;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      width={SPARK_WIDTH}
      height={SPARK_HEIGHT}
      viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
      role="img"
      aria-label={label}
      className="shrink-0"
    >
      <polyline
        points={points}
        fill="none"
        stroke="rgba(201,168,76,0.75)"
        strokeWidth={1.25}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function LeaderCogsTable({ leaders }: LeaderCogsTableProps) {
  const rows = buildLeaderCogsRows(leaders);

  return (
    <div className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-2.5 space-y-2">
      <p className="text-xs text-white/60">{LEADER_COGS_TITLE}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-white/35 italic">{LEADER_COGS_EMPTY}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[0.65rem] uppercase tracking-wider text-white/35">
                  <th scope="col" className="py-1 pr-3 font-normal">{LEADER_COGS_COLUMNS.company}</th>
                  <th scope="col" className="py-1 pr-3 font-normal text-right">{LEADER_COGS_COLUMNS.first}</th>
                  <th scope="col" className="py-1 pr-3 font-normal text-right">{LEADER_COGS_COLUMNS.last}</th>
                  <th scope="col" className="py-1 font-normal" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.ticker} className="border-t border-white/5">
                    <th scope="row" className="py-1.5 pr-3 font-normal text-left">
                      <Link
                        to={`/app/individual/${encodeURIComponent(row.ticker)}`}
                        className="text-gold hover:underline font-mono"
                      >
                        {row.ticker}
                      </Link>
                      <span className="text-white/40 ml-2 hidden sm:inline">{row.name}</span>
                    </th>
                    <td className="py-1.5 pr-3 text-right font-mono text-white/70">
                      {row.firstYear != null ? `${row.firstYear}: ` : ""}
                      {row.firstValue}
                      {row.firstYear != null ? "%" : ""}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono text-white/70">
                      {row.lastYear != null ? `${row.lastYear}: ` : ""}
                      {row.lastValue}
                      {row.lastYear != null ? "%" : ""}
                    </td>
                    <td className="py-1.5">
                      <Sparkline
                        series={row.series}
                        label={`${row.name} cost of goods as a share of revenue, ${row.firstYear ?? ""} to ${row.lastYear ?? ""}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[0.65rem] text-white/35 leading-relaxed">{LEADER_COGS_NOTE}</p>
        </>
      )}
    </div>
  );
}
