import { Fragment, useMemo } from "react";
import { Link } from "react-router-dom";
import type { SectorMetricsData } from "../lib/types";
import {
  formatSectorValue,
  rowStats,
  cellTint,
  colHistory,
  openMetricHistory,
  type RowStats,
} from "../lib/sectorMetrics";
import { cn } from "../lib/cn";
import { MetricTerm } from "./individual/DefinitionsBlock";
import { resolveSectorDef } from "../lib/surfaceDefinitions";

interface SectorMetricsTableProps {
  data: SectorMetricsData;
  highlightSector?: string;
  /** When set, column headers become links (e.g. industry → its detail page). */
  getColumnHref?: (name: string) => string;
  /** Surface resolver for metric labels + clicked cells (default: sector surface). */
  resolveDef?: (label: string) => number | undefined;
}

const UNIT_TAG: Record<string, string> = { $: "USD", "%": "percent", x: "ratio", d: "days", yrs: "years" };

export function SectorMetricsTable({
  data,
  highlightSector,
  getColumnHref,
  resolveDef = resolveSectorDef,
}: SectorMetricsTableProps) {
  const stats = useMemo(() => {
    const m: Record<string, RowStats | null> = {};
    for (const met of data.metrics) m[met.key] = rowStats(data, met.key);
    return m;
  }, [data]);

  return (
    <div className="rounded-md border border-gold/20 bg-ink-800 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="border-collapse text-sm w-full" style={{ minWidth: 760 }}>
          <caption className="sr-only">
            Current-year fundamentals by sector. {data.universe}.
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 top-0 z-30 bg-ink-800 text-left px-4 py-3 border-b border-r border-gold/20 min-w-[208px]"
              >
                <span className="label">Metric</span>
              </th>
              {data.sectors.map((s) => {
                const col = data.data[s];
                return (
                  <th
                    key={s}
                    scope="col"
                    className={cn(
                      "sticky top-0 z-10 bg-ink-800 px-3 py-3 border-b border-gold/15 text-center align-bottom min-w-[106px]",
                      highlightSector === s && "bg-gold/10",
                    )}
                  >
                    {getColumnHref ? (
                      <Link
                        to={getColumnHref(s)}
                        className="block text-[0.72rem] font-semibold text-white/85 leading-tight hover:text-gold transition-colors underline-offset-2 hover:underline"
                      >
                        {s}
                      </Link>
                    ) : (
                      <span className="block text-[0.72rem] font-semibold text-white/85 leading-tight">{s}</span>
                    )}
                    <span className="block text-[0.65rem] font-mono text-white/30 mt-0.5">
                      {/* Single-company columns (the comparative matrix) show just the year. */}
                      {col?.["_companies"] === 1
                        ? `FY ${col?.["_year"] ?? ""}`
                        : `${col?.["_companies"] ?? "—"} cos · ${col?.["_year"] ?? ""}`}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data.metrics.map((met, i) => {
              const showGroup = i === 0 || data.metrics[i - 1].group !== met.group;
              return (
                <Fragment key={met.key}>
                  {showGroup && (
                    <tr>
                      <th
                        scope="colgroup"
                        colSpan={data.sectors.length + 1}
                        className="sticky left-0 z-10 bg-ink-900 text-left px-4 pt-4 pb-1.5 border-b border-gold/10"
                      >
                        <span className="eyebrow text-gold/70">{met.group}</span>
                      </th>
                    </tr>
                  )}
                  <tr>
                    <th
                      scope="row"
                      className="sticky left-0 z-20 bg-ink-800 text-left px-4 py-2.5 border-b border-r border-white/[0.06] font-normal"
                    >
                      <MetricTerm
                        metric={met.label}
                        resolve={resolveDef}
                        className="text-[0.85rem] text-white/80 leading-snug"
                      />
                      <span className="block text-[0.65rem] font-mono text-white/25 uppercase tracking-wide">
                        {UNIT_TAG[met.unit]}
                      </span>
                    </th>
                    {data.sectors.map((s) => {
                      const col = data.data[s];
                      const v = col?.[met.key];
                      const tint = cellTint(v, met.key, stats[met.key]);
                      const hasHistory = (colHistory(col, met.key)?.length ?? 0) >= 2;
                      return (
                        <td
                          key={s}
                          role="button"
                          tabIndex={0}
                          title={hasHistory ? `${s} · ${met.label} — click for history` : met.definition}
                          onClick={() => openMetricHistory(s, met, col, resolveDef)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openMetricHistory(s, met, col, resolveDef);
                            }
                          }}
                          className={cn(
                            "px-3 py-2.5 text-center border-b border-white/[0.05] tabular-nums font-mono text-[0.8rem]",
                            "cursor-pointer transition-shadow hover:ring-1 hover:ring-inset hover:ring-gold/40",
                            "focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-gold",
                            v == null ? "text-white/20" : "text-white/85",
                            highlightSector === s && "ring-1 ring-inset ring-gold/30",
                          )}
                          style={tint ? { backgroundColor: tint } : undefined}
                        >
                          {formatSectorValue(v, met.unit)}
                        </td>
                      );
                    })}
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 border-t border-gold/10 text-[0.68rem] text-white/35">
        <span>{data.universe}</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "rgba(127,184,124,0.45)" }} /> better
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "rgba(200,118,114,0.45)" }} /> worse
        </span>
        <span className="ml-auto font-mono">as of {data.asOf}</span>
      </div>
    </div>
  );
}
