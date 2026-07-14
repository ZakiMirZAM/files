import type { SectorMetricsData, SectorMetricDef } from "../lib/types";
import { formatSectorValue, colHistory, openMetricHistory } from "../lib/sectorMetrics";
import { cn } from "../lib/cn";
import { MetricTerm } from "./individual/DefinitionsBlock";
import { resolveSectorDef } from "../lib/surfaceDefinitions";

interface SectorMetricsPanelProps {
  data: SectorMetricsData;
  /** Column key to read (a sector name, or an industry name on the industry page). */
  sector: string;
  /** Heading (default "Sector Scorecard"). */
  title?: string;
  /** Small label above the heading (default "Current-Year Fundamentals"). */
  eyebrow?: string;
  /** Surface resolver for the clickable metric labels (default: sector surface). */
  resolveDef?: (label: string) => number | undefined;
}

/** A single fundamentals column (a sector or one industry), grouped by category. */
export function SectorMetricsPanel({
  data,
  sector,
  title = "Sector Scorecard",
  eyebrow = "Current-Year Fundamentals",
  resolveDef = resolveSectorDef,
}: SectorMetricsPanelProps) {
  const col = data.data[sector];
  if (!col) return null;

  const groups: { name: string; metrics: SectorMetricDef[] }[] = [];
  for (const m of data.metrics) {
    let g = groups.find((x) => x.name === m.group);
    if (!g) {
      g = { name: m.group, metrics: [] };
      groups.push(g);
    }
    g.metrics.push(m);
  }

  const roic = col["roic"];
  const wacc = col["wacc"];
  const spread = roic != null && wacc != null ? roic - wacc : null;

  return (
    <section className="space-y-5">
      <div className="flex items-end justify-between border-b border-gold/15 pb-3">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="font-display text-2xl md:text-3xl font-semibold text-white mt-1">{title}</h2>
        </div>
        <p className="text-xs font-mono text-white/30 text-right">
          {col["_companies"] ?? "n/a"} companies · FY{col["_year"] ?? ""}
        </p>
      </div>

      {spread != null && (
        <div
          className={cn(
            "panel-soft p-5 flex items-center justify-between gap-4",
            spread >= 0 ? "border-gain/30" : "border-loss/30",
          )}
        >
          <div>
            <p className="label">ROIC − WACC spread</p>
            <p className="text-xs text-white/45 mt-0.5 max-w-md">
              {spread >= 0
                ? "Capital employed earns above its cost, growth creates value."
                : "Returns sit below the cost of capital, growth destroys value."}
            </p>
          </div>
          <p
            className={cn(
              "font-mono text-2xl whitespace-nowrap",
              spread >= 0 ? "text-gain-strong" : "text-loss-strong",
            )}
          >
            {spread >= 0 ? "+" : "−"}
            {Math.abs(spread).toFixed(1)} pp
          </p>
        </div>
      )}

      {groups.map((g) => (
        <div key={g.name}>
          <h3 className="eyebrow text-gold/70 mb-2.5">{g.name}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {g.metrics.map((m) => {
              const hasHistory = (colHistory(col, m.key)?.length ?? 0) >= 2;
              return (
                <div
                  key={m.key}
                  className="panel-soft px-4 py-3 flex items-start justify-between gap-3"
                >
                  {/* resolveDef PROP (not the hardcoded sector resolver) so the
                      industry page opens its own 301-range definitions. */}
                  <MetricTerm
                    metric={m.label}
                    resolve={resolveDef}
                    className="text-xs text-white/70 leading-snug"
                  >
                    {m.label.replace(/^DuPont · /, "")}
                  </MetricTerm>
                  <button
                    type="button"
                    title={hasHistory ? `${sector} · ${m.label}, click for history` : m.definition}
                    onClick={() => openMetricHistory(sector, m, col, resolveDef)}
                    className={cn(
                      "font-mono text-sm text-gold whitespace-nowrap shrink-0 rounded-sm px-1 -mx-1",
                      "cursor-pointer transition-shadow hover:ring-1 hover:ring-gold/40",
                      "focus:outline-none focus-visible:ring-1 focus-visible:ring-gold",
                    )}
                  >
                    {formatSectorValue(col[m.key], m.unit)}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
