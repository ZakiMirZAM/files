import { formatCurrency } from "../../lib/format";
import { cn } from "../../lib/cn";
import { Sparkline } from "./Sparkline";
import { DefinitionsBlock, MetricTerm } from "./DefinitionsBlock";

interface PerShareSectionProps {
  perShareHistory?: Record<string, Record<string, number>>;
}

// The four the user asked for come first; the rest follow. "EPS" maps to
// "Net Income Per Share" (the per-share earnings figure the DB carries).
const ORDER: Array<{ key: string; label: string }> = [
  { key: "Revenue Per Share", label: "Revenue / Share" },
  { key: "Net Income Per Share", label: "EPS (Net Income / Share)" },
  { key: "Operating Cash Flow Per Share", label: "OCF / Share" },
  { key: "Free Cash Flow Per Share", label: "FCF / Share" },
  { key: "Book Value Per Share", label: "Book Value / Share" },
  { key: "Cash Per Share", label: "Cash / Share" },
  { key: "Tangible Book Value Per Share", label: "Tangible BV / Share" },
  { key: "Shareholders Equity Per Share", label: "Equity / Share" },
  { key: "Capex Per Share", label: "Capex / Share" },
  { key: "Interest Debt Per Share", label: "Interest Debt / Share" },
];

function series(history: Record<string, number>): { values: number[]; latest: number } | null {
  const years = Object.keys(history)
    .map(Number)
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => a - b);
  const values = years.map((y) => history[String(y)]).filter((v) => Number.isFinite(v));
  if (values.length < 2) return null;
  return { values, latest: values[values.length - 1] };
}

export function PerShareSection({ perShareHistory }: PerShareSectionProps) {
  if (!perShareHistory) return null;

  const tiles = ORDER
    .map(({ key, label }) => {
      const hist = perShareHistory[key];
      if (!hist) return null;
      const s = series(hist);
      if (!s) return null;
      const first = s.values[0];
      const pct = first !== 0 ? ((s.latest - first) / Math.abs(first)) * 100 : null;
      return { key, label, ...s, pct };
    })
    .filter((t): t is { key: string; label: string; values: number[]; latest: number; pct: number | null } => t !== null);

  if (tiles.length === 0) return null;

  return (
    <section className="animate-fade-up">
      <header className="mb-5">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">Per-Share Trends</h2>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {tiles.map((t) => (
          <div key={t.key} className="panel-soft p-3.5">
            <MetricTerm
              metric={t.label}
              scope="perShare"
              className="block text-[0.8rem] text-white/75 leading-tight font-medium mb-2 line-clamp-2"
            />
            <Sparkline values={t.values} variant="bar" />
            <div className="flex items-baseline justify-between gap-2 mt-2">
              <span className="font-mono text-sm text-gold tabular-nums">{formatCurrency(t.latest, { compact: false })}</span>
              {t.pct !== null && (
                <span className={cn("font-mono text-[0.7rem]", t.pct >= 0 ? "text-gain-strong" : "text-loss-strong")}>
                  {t.pct >= 0 ? "+" : ""}
                  {t.pct.toFixed(0)}%
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <DefinitionsBlock section="perShare" title="Per-share metric definitions" className="mt-5" />
    </section>
  );
}
