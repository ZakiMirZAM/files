import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { SectorColumn, SectorCellPoint, SectorMetricDef, SectorMetricsData } from "../lib/types";
import {
  formatSectorValue,
  rowStats,
  cellTint,
  colNote,
  sortMatrixData,
  cycleMatrixSort,
  type MatrixSort,
  type RowStats,
} from "../lib/sectorMetrics";
import { cn } from "../lib/cn";
import { MetricTerm } from "./individual/DefinitionsBlock";
import { openDefinitionSeries } from "../lib/definitionPanelStore";
import type { DefinitionSeries } from "../lib/individualSeries";

interface CompanyScorecardTableProps {
  data: SectorMetricsData;
  /** When set, the company (row) name becomes a link, e.g. to its detail page. */
  getRowHref?: (ticker: string) => string;
  /** Surface-scoped resolver so metric headers open their definitions. */
  resolveDef?: (label: string) => number | undefined;
  /** Mark one company's row and bring it into view inside the table's own
   *  scroll box. Used on the company page, where the reader arrived to read
   *  about that one company and the ranking can run to dozens of rows. */
  highlightTicker?: string;
}


/** A cell's year-by-year history, if the API attached one (comparative only). */
function cellHistory(col: SectorColumn | undefined, key: string): SectorCellPoint[] | undefined {
  const hist = (col as unknown as { _history?: Record<string, SectorCellPoint[]> } | undefined)?._history;
  return hist?.[key];
}

/**
 * The company comparison matrix, TRANSPOSED relative to SectorMetricsTable:
 * rows are companies, columns are metrics (grouped). The heatmap compares
 * companies WITHIN each metric (down a column). Each value CELL is clickable:
 * it opens the sidebar on that company's historical trend for that metric (the
 * backend ships a per-(company, metric) history). The metric-label header stays
 * pinned as the user scrolls down the company list.
 *
 * Memoised, because the full ranking runs to hundreds of rows against dozens of
 * metric columns and one render of it measures around a third of a second.
 * Every caller must hand it stable props, or the memo buys nothing: the row
 * link builder belongs in a useCallback and the definition resolver at module
 * scope.
 */
export const CompanyScorecardTable = memo(function CompanyScorecardTable({
  data,
  getRowHref,
  resolveDef,
  highlightTicker,
}: CompanyScorecardTableProps) {
  const stats = useMemo(() => {
    const m: Record<string, RowStats | null> = {};
    for (const met of data.metrics) m[met.key] = rowStats(data, met.key);
    return m;
  }, [data]);

  // Rank the company rows by one metric column: high to low, low to high,
  // source order. A pure reorder of `data.sectors` (the row tickers), so cells,
  // heatmap, definitions, and the clickable histories are untouched.
  const [sort, setSort] = useState<MatrixSort | null>(null);
  const view = useMemo(() => sortMatrixData(data, sort), [data, sort]);

  const marked = highlightTicker?.toUpperCase();

  // Bring the marked row into the middle of the table's own scroll box, and
  // only that box: the page itself must not jump under the reader. Re-runs
  // when the rows are reordered or filtered, so the row stays found.
  const scrollBox = useRef<HTMLDivElement>(null);
  const markedRow = useRef<HTMLTableRowElement>(null);
  const rowOrder = useMemo(() => view.sectors.join("|"), [view.sectors]);
  useEffect(() => {
    const box = scrollBox.current;
    const row = markedRow.current;
    if (!marked || !box || !row) return;
    const boxTop = box.getBoundingClientRect().top;
    const rect = row.getBoundingClientRect();
    box.scrollTop += rect.top - boxTop - box.clientHeight / 2 + rect.height / 2;
  }, [marked, rowOrder]);

  // Contiguous metric groups → spans for the top header row.
  const groups = useMemo(() => {
    const out: { group: string; count: number }[] = [];
    for (const met of data.metrics) {
      const last = out[out.length - 1];
      if (last && last.group === met.group) last.count += 1;
      else out.push({ group: met.group, count: 1 });
    }
    return out;
  }, [data.metrics]);

  function openCell(ticker: string, met: SectorMetricDef, col: SectorColumn | undefined) {
    const points = cellHistory(col, met.key);
    const series: DefinitionSeries | undefined =
      points && points.length >= 2
        ? {
            label: `${ticker} · ${met.label}`,
            points,
            format: (v) => formatSectorValue(v, met.unit),
            isRateOfChange: false,
          }
        : undefined;
    // Resolve the metric to its full markdown definition number so the sidebar
    // renders the complete definition under the chart. Only fall back to the
    // one-line backend blurb when no markdown definition exists (number 0).
    const num = resolveDef?.(met.label) ?? 0;
    openDefinitionSeries({
      number: num,
      series,
      title: `${ticker} · ${met.label}`,
      description: num > 0 ? undefined : met.definition,
    });
  }

  return (
    <div className="rounded-md border border-gold/20 bg-ink-800 overflow-hidden">
      <div ref={scrollBox} className="overflow-auto max-h-[75vh]">
        <table className="border-collapse text-sm w-full" style={{ minWidth: 760 }}>
          <caption className="sr-only">
            Per-company fundamentals. {data.universe}.
          </caption>
          <thead>
            {/* Group header row */}
            <tr>
              <th
                scope="col"
                rowSpan={2}
                className="sticky left-0 top-0 z-30 bg-ink-800 text-left px-4 py-3 border-b border-r border-gold/20 align-bottom min-w-[180px]"
              >
                <span className="label">Company</span>
              </th>
              {groups.map((g) => (
                <th
                  key={g.group}
                  scope="colgroup"
                  colSpan={g.count}
                  className="sticky top-0 z-20 bg-ink-900 text-center px-3 pt-3 pb-1.5 border-b border-l border-gold/10"
                >
                  <span className="eyebrow text-gold/70">{g.group}</span>
                </th>
              ))}
            </tr>
            {/* Metric header row, pinned just below the group row */}
            <tr>
              {data.metrics.map((met, i) => (
                <th
                  key={met.key}
                  scope="col"
                  title={met.definition}
                  className={cn(
                    "sticky top-[34px] z-10 bg-ink-800 px-3 py-2 border-b border-gold/15 text-center align-bottom min-w-[86px] cursor-help",
                    i > 0 && data.metrics[i - 1].group !== met.group && "border-l border-gold/10",
                  )}
                >
                  {resolveDef ? (
                    <MetricTerm
                      metric={met.label}
                      resolve={resolveDef}
                      className="block text-[0.7rem] font-semibold text-white/80 leading-tight"
                    />
                  ) : (
                    <span className="block text-[0.7rem] font-semibold text-white/80 leading-tight">
                      {met.label}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setSort((s) => cycleMatrixSort(s, met.key))}
                    aria-pressed={sort?.key === met.key}
                    aria-label={`Rank companies by ${met.label}`}
                    title={
                      sort?.key !== met.key
                        ? `Rank companies by ${met.label}, high to low`
                        : sort.dir === "desc"
                          ? "Ranked high to low, click for low to high"
                          : "Ranked low to high, click to restore the source order"
                    }
                    className={cn(
                      "mt-1 inline-flex p-0.5 rounded-sm transition-colors",
                      sort?.key === met.key ? "text-gold" : "text-white/25 hover:text-white/70",
                    )}
                  >
                    {sort?.key === met.key ? (
                      sort.dir === "desc" ? (
                        <ArrowDown className="w-3 h-3" />
                      ) : (
                        <ArrowUp className="w-3 h-3" />
                      )
                    ) : (
                      <ArrowUpDown className="w-3 h-3" />
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.sectors.map((ticker) => {
              const row = data.data[ticker];
              const isMarked = marked === ticker.toUpperCase();
              return (
                <tr
                  key={ticker}
                  ref={isMarked ? markedRow : undefined}
                  className="hover:bg-white/[0.015]"
                >
                  <th
                    scope="row"
                    className="sticky left-0 z-20 bg-ink-800 text-left px-4 py-2.5 border-b border-r border-white/[0.06] font-normal"
                  >
                    {getRowHref ? (
                      <Link
                        to={getRowHref(ticker)}
                        className={cn(
                          "text-[0.85rem] transition-colors underline-offset-2 hover:underline",
                          isMarked
                            ? "font-bold text-gold"
                            : "font-semibold text-white/85 hover:text-gold",
                        )}
                      >
                        {ticker}
                      </Link>
                    ) : (
                      <span
                        className={cn(
                          "text-[0.85rem]",
                          isMarked ? "font-bold text-gold" : "font-semibold text-white/85",
                        )}
                      >
                        {ticker}
                      </span>
                    )}
                    <span className="block text-[0.65rem] font-mono text-white/30 mt-0.5">
                      FY {row?.["_year"] ?? ""} · {formatSectorValue(row?.["_marketCap"], "$")}
                    </span>
                  </th>
                  {data.metrics.map((met, i) => {
                    const v = row?.[met.key];
                    const tint = cellTint(v, met.key, stats[met.key]);
                    const hasHistory = (cellHistory(row, met.key)?.length ?? 0) >= 2;
                    // A payload that explained why this one cell is empty wins
                    // the hover: it is the only place that reason is readable.
                    const note = colNote(row, met.key);
                    return (
                      <td
                        key={met.key}
                        role="button"
                        tabIndex={0}
                        title={
                          note ??
                          (hasHistory ? `${ticker} · ${met.label}, click for history` : met.definition)
                        }
                        onClick={() => openCell(ticker, met, row)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openCell(ticker, met, row);
                          }
                        }}
                        className={cn(
                          "px-3 py-2.5 text-center border-b border-white/[0.05] tabular-nums font-mono text-[0.8rem]",
                          "cursor-pointer transition-shadow hover:ring-1 hover:ring-inset hover:ring-gold/40",
                          "focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-gold",
                          v == null ? "text-white/20" : "text-white/85",
                          i > 0 && data.metrics[i - 1].group !== met.group && "border-l border-gold/10",
                        )}
                        style={tint ? { backgroundColor: tint } : undefined}
                      >
                        {formatSectorValue(v, met.unit)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-end px-4 py-3 border-t border-gold/10 text-[0.68rem] text-white/35">
        <span className="font-mono">as of {data.asOf}</span>
      </div>
    </div>
  );
});
