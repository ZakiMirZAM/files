import { QualitativeBlock } from "../QualitativeBlock";
import { cn } from "../../lib/cn";
import { MetricTerm } from "./DefinitionsBlock";
import {
  isApplicable,
  type GrowthComparison,
  type ReinvestmentHistory,
  type ReturnsQuality,
  type RoeHistory,
  type RoicHistory,
  type RoicIndustry,
} from "../../lib/returnsQualityTypes";

interface ReturnsQualitySectionProps {
  returnsQuality?: ReturnsQuality | null;
  ticker: string;
}

const pct = (v: number | null | undefined, d = 1): string =>
  v == null ? "n/a" : `${(v * 100).toFixed(d)}%`;
// A gap between two percentages is percentage POINTS, not a percentage change.
const pp = (v: number | null | undefined, d = 1): string =>
  v == null ? "n/a" : `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(d)}pp`;
const mult = (v: number | null | undefined, d = 2): string =>
  v == null ? "n/a" : `${v.toFixed(d)}×`;

const gapTone = (v: number | null | undefined): string =>
  v == null ? "text-white/50" : v >= 0 ? "text-gain-strong" : "text-loss-strong";

/** The group titles in lib/questions.ts. Each block renders only its own deck. */
const DECK = {
  roe: "Return on Equity Against Its Own History",
  roic: "Return on Capital Against Its Own History",
  industry: "Return on Capital Against the Industry",
  growth: "Expected Growth Against Actual Growth",
  reinvestment: "Is the Reinvestment Rate Sustainable",
} as const;

/* ── shared bits ─────────────────────────────────────────────────────────── */

function Tile({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="panel-soft px-3 py-2.5">
      <p className="text-[0.65rem] uppercase tracking-wider text-white/40">
        <MetricTerm metric={k} asSpan />
      </p>
      <p className={cn("font-mono text-[0.8rem] mt-0.5", tone ?? "text-white/85")}>{v}</p>
    </div>
  );
}

function Tiles({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">{children}</div>;
}

/** A figure the engine currently gets wrong, or a benchmark that is missing. */
function Caveat({ text }: { text: string }) {
  return (
    <div className="rounded-sm border border-loss/30 bg-loss-ghost px-3.5 py-2.5 flex gap-2.5 items-start mt-3">
      <span className="text-loss-strong font-mono text-[0.7rem] shrink-0 mt-px">!</span>
      <p className="text-[0.78rem] leading-relaxed text-white/70">{text}</p>
    </div>
  );
}

/** A year-keyed series as the app's standard sticky-first-column table. */
function SeriesTable({
  label,
  rows,
}: {
  label: string;
  rows: { label: string; series: Record<string, number>; fmt: (v: number) => string; gold?: boolean }[];
}) {
  const years = Array.from(
    new Set(rows.flatMap((r) => Object.keys(r.series))),
  ).sort();
  if (years.length < 2) return null;
  return (
    <div className="panel-soft p-5 mb-4">
      <p className="eyebrow mb-4">{label}</p>
      <div className="overflow-x-auto">
        <table className="border-collapse text-sm w-full" style={{ minWidth: 480 }}>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-ink-800 text-left px-3 py-2 border-b border-r border-gold/15 min-w-[150px]">
                <span className="label">Lever</span>
              </th>
              {years.map((y) => (
                <th key={y} scope="col" className="px-2.5 py-2 border-b border-gold/10 text-right min-w-[64px]">
                  <span className="text-[0.7rem] font-mono text-white/55">{y}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row" className={cn(
                  "sticky left-0 z-10 bg-ink-800 text-left px-3 py-1.5 border-b border-r border-white/[0.06] font-normal",
                  r.gold && "text-gold",
                )}>
                  <span className="text-[0.8rem] text-white/75">
                    <MetricTerm metric={r.label} asSpan />
                  </span>
                </th>
                {years.map((y) => (
                  <td key={y} className={cn(
                    "px-2.5 py-1.5 text-right border-b border-white/[0.05] tabular-nums font-mono text-[0.76rem]",
                    r.gold ? "text-gold" : "text-white/80",
                  )}>
                    {r.series[y] == null ? "n/a" : r.fmt(r.series[y])}
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

function Deck({ title, ticker, dataContext }: { title: string; ticker: string; dataContext: unknown }) {
  return (
    <QualitativeBlock
      section="individual"
      scopeKey={ticker}
      onlyTitles={[title]}
      storageSuffix="returnsQuality"
      dataContext={JSON.stringify(dataContext)}
      hideHeader
    />
  );
}

/* ── 1. ROE against its own history ──────────────────────────────────────── */

function RoeBlock({ d, ticker }: { d: RoeHistory; ticker: string }) {
  return (
    <div>
      <Tiles>
        <Tile k="ROE" v={pct(d.current)} />
        <Tile k="ROE 5y average" v={pct(d.avg5)} />
        <Tile k="ROE 5y median" v={pct(d.median5)} />
        <Tile k="Gap vs 5y average" v={pp(d.gap)} tone={gapTone(d.gap)} />
        <Tile k="Financial Leverage" v={mult(d.leverageCurrent)} />
      </Tiles>
      <SeriesTable
        label={`History · ${d.yearsUsed} years to FY${d.latestYear}`}
        rows={[
          { label: "ROE", series: d.series, fmt: (v) => pct(v), gold: true },
          { label: "Financial Leverage", series: d.leverage, fmt: (v) => mult(v) },
        ]}
      />
      <Deck title={DECK.roe} ticker={ticker} dataContext={d} />
    </div>
  );
}

/* ── 2. ROIC against its own history, and why ────────────────────────────── */

function RoicBlock({ d, ticker }: { d: RoicHistory; ticker: string }) {
  const a = d.attribution;
  return (
    <div>
      <Tiles>
        <Tile k="ROIC" v={pct(d.current)} />
        <Tile k="ROIC 5y average" v={pct(d.avg5)} />
        <Tile k="ROIC 5y median" v={pct(d.median5)} />
        <Tile k="Gap vs 5y average" v={pp(d.gap)} tone={gapTone(d.gap)} />
      </Tiles>

      {a && (
        <div className="panel-soft p-5 mb-4">
          <p className="eyebrow mb-4">
            Why the gap · current year against the 5y average, one component at a time
          </p>
          <dl className="space-y-2 text-sm">
            {[
              { label: "Capital turnover effect", v: a.turnoverEffect },
              { label: "Operating margin effect", v: a.marginEffect },
              { label: "Tax effect", v: a.taxEffect },
            ]
              .sort((x, y) => Math.abs(y.v) - Math.abs(x.v))
              .map((r) => (
                <div key={r.label} className="flex items-baseline justify-between">
                  <span className="text-xs text-white/55">{r.label}</span>
                  <span className={cn("font-mono", gapTone(r.v))}>{pp(r.v, 2)}</span>
                </div>
              ))}
            <div className="flex items-baseline justify-between pt-2 mt-1 border-t border-gold/10">
              <span className="text-xs text-white/75">= Total</span>
              <span className="font-mono text-white font-medium">{pp(a.total, 2)}</span>
            </div>
          </dl>
          {!a.reconciles && a.reconcileNote && <Caveat text={a.reconcileNote} />}
        </div>
      )}

      <SeriesTable
        label={`History · ${d.yearsUsed} years to FY${d.latestYear}`}
        rows={[{ label: "ROIC", series: d.series, fmt: (v) => pct(v), gold: true }]}
      />
      <Deck title={DECK.roic} ticker={ticker} dataContext={d} />
    </div>
  );
}

/* ── 3. ROIC and spread against the industry ─────────────────────────────── */

function IndustryBlock({ d, ticker }: { d: RoicIndustry; ticker: string }) {
  const rows = [
    { label: "ROIC", a: d.company.roic, b: d.industry.roic, gap: d.roicGap },
    { label: "WACC", a: d.company.wacc, b: d.industry.wacc, gap: null },
    { label: "ROIC − WACC", a: d.company.spread, b: d.industry.spread, gap: d.spreadGap },
    { label: "ROE", a: d.company.roe, b: d.industry.roe, gap: d.roeGap },
  ];
  return (
    <div>
      <Tiles>
        <Tile k="ROIC" v={pct(d.company.roic)} />
        <Tile k="Industry ROIC" v={pct(d.industry.roic)} />
        <Tile k="ROIC − WACC" v={pct(d.company.spread)} />
        <Tile k="Industry ROIC − WACC" v={pct(d.industry.spread)} />
        <Tile k="Spread gap" v={pp(d.spreadGap)} tone={gapTone(d.spreadGap)} />
      </Tiles>

      <div className="panel-soft p-5 mb-4">
        <p className="eyebrow mb-4">
          {d.industryName ?? "Industry"}
          {d.universe ? ` · ${d.universe}` : ""}
        </p>
        <div className="overflow-x-auto">
          <table className="border-collapse text-sm w-full" style={{ minWidth: 420 }}>
            <thead>
              <tr>
                <th scope="col" className="text-left px-3 py-2 border-b border-gold/15">
                  <span className="label">Metric</span>
                </th>
                <th scope="col" className="px-2.5 py-2 border-b border-gold/10 text-right">
                  <span className="text-[0.7rem] font-mono text-white/55">{ticker}</span>
                </th>
                <th scope="col" className="px-2.5 py-2 border-b border-gold/10 text-right">
                  <span className="text-[0.7rem] font-mono text-white/55">Industry</span>
                </th>
                <th scope="col" className="px-2.5 py-2 border-b border-gold/10 text-right">
                  <span className="text-[0.7rem] font-mono text-white/55">Gap</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <th scope="row" className="text-left px-3 py-1.5 border-b border-white/[0.06] font-normal">
                    <span className="text-[0.8rem] text-white/75">
                      <MetricTerm metric={r.label} asSpan />
                    </span>
                  </th>
                  <td className="px-2.5 py-1.5 text-right border-b border-white/[0.05] tabular-nums font-mono text-[0.76rem] text-white/85">
                    {pct(r.a)}
                  </td>
                  <td className="px-2.5 py-1.5 text-right border-b border-white/[0.05] tabular-nums font-mono text-[0.76rem] text-white/55">
                    {pct(r.b)}
                  </td>
                  <td className={cn(
                    "px-2.5 py-1.5 text-right border-b border-white/[0.05] tabular-nums font-mono text-[0.78rem]",
                    r.gap == null ? "text-white/30" : gapTone(r.gap),
                  )}>
                    {r.gap == null ? "" : pp(r.gap, 2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {d.leverageTell && <Caveat text={d.leverageTell} />}
        <Caveat text={d.benchmarkCaveat} />
      </div>

      <Deck title={DECK.industry} ticker={ticker} dataContext={d} />
    </div>
  );
}

/* ── 4. Expected growth against actual ───────────────────────────────────── */

function GrowthBlock({ d, ticker }: { d: GrowthComparison; ticker: string }) {
  const i = d.inputs;
  return (
    <div>
      <Tiles>
        <Tile k="Actual growth" v={pct(d.actual)} tone={gapTone(d.actual)} />
        <Tile k="Expected growth" v={pct(d.expectedCurrent)} tone={gapTone(d.expectedCurrent)} />
        <Tile
          k="Expected growth 5y average"
          v={pct(d.expectedFiveYearAverage)}
          tone={gapTone(d.expectedFiveYearAverage)}
        />
        <Tile k="Divergence" v={d.divergence == null ? "n/a" : `${(d.divergence * 100).toFixed(1)}pp`} />
      </Tiles>

      <div className="panel-soft p-5 mb-4">
        <p className="eyebrow mb-4">
          Expected growth built two ways · current year against the five year average
        </p>
        <dl className="space-y-2 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-white/55 text-xs leading-snug">
              Reinvestment rate × ROIC (current year)
            </span>
            <span className="font-mono text-white/85 whitespace-nowrap">
              {pct(i.reinvestmentCurrent)} × {pct(i.roicCurrent)}{" "}
              <span className="text-white/35">=</span>{" "}
              <span className={gapTone(d.expectedCurrent)}>{pct(d.expectedCurrent)}</span>
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-white/55 text-xs leading-snug">
              Reinvestment rate × ROIC (5y average)
            </span>
            <span className="font-mono text-white/85 whitespace-nowrap">
              {pct(i.reinvestmentFiveYearAverage)} × {pct(i.roicFiveYearAverage)}{" "}
              <span className="text-white/35">=</span>{" "}
              <span className={gapTone(d.expectedFiveYearAverage)}>
                {pct(d.expectedFiveYearAverage)}
              </span>
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-3 pt-2 mt-1 border-t border-gold/10">
            <span className="text-white/75 text-xs leading-snug">Actual growth</span>
            <span className={cn("font-mono", gapTone(d.actual))}>{pct(d.actual)}</span>
          </div>
          {d.reinvestmentRequiredForActual != null && (
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-white/55 text-xs leading-snug">
                Reinvestment the actual growth demands
              </span>
              <span className="font-mono text-white/85">{pct(d.reinvestmentRequiredForActual)}</span>
            </div>
          )}
          {d.equityLens.expected != null && (
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-white/55 text-xs leading-snug">
                Retention × ROE (equity lens)
              </span>
              <span className="font-mono text-white/85">{pct(d.equityLens.expected)}</span>
            </div>
          )}
        </dl>
        <p className="text-[0.75rem] font-mono text-white/40 mt-3 leading-relaxed">{d.note}</p>
      </div>

      <Deck title={DECK.growth} ticker={ticker} dataContext={d} />
    </div>
  );
}

/* ── 5. Reinvestment against its own history ─────────────────────────────── */

function ReinvestmentBlock({ d, ticker }: { d: ReinvestmentHistory; ticker: string }) {
  return (
    <div>
      <Tiles>
        <Tile k="Reinvestment Rate" v={pct(d.current)} tone={gapTone(d.current)} />
        <Tile k="Reinvestment 5y average" v={pct(d.avg5)} tone={gapTone(d.avg5)} />
        <Tile k="Reinvestment 5y median" v={pct(d.median5)} tone={gapTone(d.median5)} />
        <Tile k="Capex / Depreciation" v={mult(d.capexToDepreciationCurrent)} />
        <Tile
          k="Industry Sales / Invested Capital"
          v={mult(d.industrySalesToInvestedCapital)}
        />
      </Tiles>

      <SeriesTable
        label={`History · ${d.yearsUsed} years to FY${d.latestYear}`}
        rows={[
          { label: "Reinvestment Rate", series: d.series, fmt: (v) => pct(v), gold: true },
          { label: "Capex / Depreciation", series: d.capexToDepreciation, fmt: (v) => mult(v) },
        ]}
      />

      {d.benchmarkNote && (
        <div className="panel-soft p-5 mb-4">
          <Caveat text={d.benchmarkNote} />
        </div>
      )}

      <Deck title={DECK.reinvestment} ticker={ticker} dataContext={d} />
    </div>
  );
}

/* ── section ─────────────────────────────────────────────────────────────── */

/**
 * Returns Quality: five comparisons rather than five point estimates.
 *
 * Each block renders its own figures and then only its own question deck. Blocks
 * are independent, so one that the backend could not compute simply does not
 * render while the rest still do.
 *
 * The five-year average is a COMPARISON throughout, never a fallback. Expected
 * growth in particular is always shown built both ways, because the distance
 * between the two is the finding.
 */
export function ReturnsQualitySection({ returnsQuality: d, ticker }: ReturnsQualitySectionProps) {
  if (!d || !d.applicable) return null;

  const blocks = [
    isApplicable<RoeHistory>(d.roeHistory) && <RoeBlock key="roe" d={d.roeHistory} ticker={ticker} />,
    isApplicable<RoicHistory>(d.roicHistory) && <RoicBlock key="roic" d={d.roicHistory} ticker={ticker} />,
    isApplicable<RoicIndustry>(d.roicIndustry) && <IndustryBlock key="ind" d={d.roicIndustry} ticker={ticker} />,
    isApplicable<GrowthComparison>(d.growth) && <GrowthBlock key="growth" d={d.growth} ticker={ticker} />,
    isApplicable<ReinvestmentHistory>(d.reinvestment) && (
      <ReinvestmentBlock key="reinv" d={d.reinvestment} ticker={ticker} />
    ),
  ].filter(Boolean);

  if (blocks.length === 0) return null;

  return <section className="animate-fade-up space-y-6">{blocks}</section>;
}
