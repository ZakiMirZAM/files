import { useMemo } from "react";
import type { PeGrowth, SolverBound } from "../../lib/types";
import { formatMetricValue } from "../../lib/metricFormat";
import { buildPeGrowthDeck } from "../../lib/peGrowthDeck";
import { useSavedAnswer } from "../../lib/useSavedAnswer";
import { cn } from "../../lib/cn";
import { DefinitionLink, MetricTerm } from "./DefinitionsBlock";
import { QualitativeBlock } from "../QualitativeBlock";

interface PeGrowthSectionProps {
  data: PeGrowth;
  ticker: string;
  companyName: string;
}

/** The panel's own definition; every label without a metric of its own opens it. */
const PANEL_DEF = "P/E vs Growth and Returns";
const PANEL_DEF_NUMBER = 910;

const pct = (v: number | null | undefined) => formatMetricValue(v, "%");
const times = (v: number | null | undefined) => formatMetricValue(v, "x");
const sign = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "");
const signed = (v: number | null | undefined) => (v == null ? "n/a" : `${sign(v)}${pct(Math.abs(v))}`);
const signedX = (v: number | null | undefined) => (v == null ? "n/a" : `${sign(v)}${times(Math.abs(v))}`);
const negative = (v: number | null | undefined) => v != null && v < 0;
/** A formatted figure, kept on one line; worded fallbacks are allowed to wrap. */
const NUMBER = /^[−+-]?[\d.,]+(%|x| years)?$|^n\/a$/;
const minus = (a: number | null, b: number | null) => (a != null && b != null ? a - b : null);

/** What a solver that fell off one end of its range says instead of a number. */
function boundText(bound: SolverBound, what: string): string {
  if (bound === "above") return `above what any ${what} reaches`;
  if (bound === "below") return `below what any ${what} reaches`;
  return "n/a";
}

/**
 * "Does growth justify the P/E?" at company level. Figures only, no verdict:
 * the fair P/E from growth and returns, the growth today's P/E implies, and
 * the deck that makes the reader weigh the two. Sits directly below the
 * P/B vs ROE anchor, whose ROE, cost of equity and stable growth it shares.
 */
export function PeGrowthSection({ data: d, ticker, companyName }: PeGrowthSectionProps) {
  const moat = useSavedAnswer("individual", ticker, "ind.moat");
  const deck = useMemo(
    () =>
      buildPeGrowthDeck({
        company: companyName,
        impliedGrowth: d.impliedGrowth,
        dataContext: JSON.stringify({ company: companyName, peGrowth: d, moatAnswer: moat || null }),
      }),
    [companyName, d, moat],
  );

  const years = d.highGrowthYears;
  const twoStage = d.impliedGrowthTwoStage;
  const n = d.highGrowthYearsWindow;

  return (
    <section className="animate-fade-up">
      <header className="mb-5">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">P/E vs growth and returns</h2>
        <DefinitionLink number={PANEL_DEF_NUMBER} prominent className="mt-3">
          How this panel works
        </DefinitionLink>
      </header>

      {/* The three readings the fair P/E is built from. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Price and yield">
          <Figure label="P/E (forward)" metric="Price To Earnings" value={times(d.forwardPe)} accent />
          <Figure label="Trailing P/E" metric="Price To Earnings" value={times(d.trailingPe)} />
          <Figure label="Earnings yield" value={pct(d.earningsYield)} />
          <Figure label="10-year Treasury yield" metric="Risk-Free Rate" value={pct(d.treasury10y)} />
          <Figure label="Cost of equity" metric="Cost Of Equity" value={pct(d.costOfEquity)} />
          <Figure label="Earnings yield − cost of equity" value={signed(d.earningsYieldMinusKe)} tone={d.earningsYieldMinusKe} />
          <Source>
            {d.consensusSource
              ? `Forward earnings: consensus, ${d.consensusSource}${d.consensusAnalysts ? `, ${d.consensusAnalysts} analysts` : ""}`
              : "No positive forward P/E in the analyst consensus, so the forward figures are n/a"}
          </Source>
        </Card>

        <Card title="Growth">
          <Figure label="5-year earnings growth" value={pct(d.epsGrowth5y)} accent />
          <Figure label="Historical 5-year growth (trend)" value={pct(d.epsGrowthTrend5y)} />
          <Figure label="Consensus growth (next year)" value={pct(d.consensusGrowth)} />
          <Figure label="PEG (quick glance only)" metric="PEG Ratio" value={times(d.peg)} />
          <Figure label="Sustainable growth (ROE × retention)" metric="Fundamental Growth" value={pct(d.sustainableGrowth)} />
          <Figure label="Reinvestment rate" metric="Reinvestment Rate" value={pct(d.reinvestmentRate)} />
          <Figure label="Incremental ROIC" metric="Marginal ROIC" value={pct(d.marginalRoic)} />
        </Card>

        <Card title="Returns">
          <Figure label="Return on equity" metric="Return On Equity" value={pct(d.roe)} />
          <Figure label="Cost of equity" metric="Cost Of Equity" value={pct(d.costOfEquity)} />
          <Figure label="ROE − cost of equity" metric="Excess Return" value={signed(d.roeMinusKe)} tone={d.roeMinusKe} accent />
          <Figure label="ROIC" metric="ROIC" value={pct(d.roic)} />
          <Figure label="WACC" metric="WACC" value={pct(d.wacc)} />
          <Figure label="ROIC − WACC" metric="ROIC − WACC Spread" value={signed(d.roicMinusWacc)} tone={d.roicMinusWacc} accent />
        </Card>
      </div>

      {d.spreadHistory.length > 1 && <SpreadTrend rows={d.spreadHistory} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        {/* The fair P/E, written out with the company's own figures. */}
        <Card title="Fair P/E from growth and returns">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 font-mono text-sm pb-3 mb-1 border-b border-white/[0.06]">
            <Term>Fair P/E</Term>
            <span className="text-white/40">=</span>
            <span className="text-white/85">
              (1 − {pct(d.stableGrowth)} ÷ {pct(d.roe)}) ÷ ({pct(d.costOfEquity)} − {pct(d.stableGrowth)})
            </span>
            <span className="text-white/40">=</span>
            <span className="text-gold text-base">{times(d.fairPe)}</span>
          </div>
          <Figure label="Stable growth (g in the formula)" value={pct(d.stableGrowth)} />
          <Figure label="Fair P/E" value={times(d.fairPe)} accent />
          <Figure label="Actual P/E ÷ fair P/E" value={times(d.actualToFairPe)} />
          <Figure label="P/E with no value-adding growth (1 ÷ cost of equity)" value={times(d.noGrowthPe)} />
          <Figure label="Growth premium share of price" value={pct(d.growthPremiumShare)} />
        </Card>

        <Card title="What today's P/E implies">
          <Figure label="Growth the P/E implies (forever, at the ROE used)" value={pct(d.impliedGrowth)} accent />
          <Figure
            label={`Two-stage: growth for ${n} years, then none that adds value`}
            value={twoStage?.growth != null ? pct(twoStage.growth) : boundText(twoStage?.bound ?? null, `${n}-year growth`)}
          />
          <Figure label="Implied return at consensus growth" value={pct(d.impliedReturnAtConsensus)} />
          <Figure
            label="Implied return − cost of equity"
            value={signed(minus(d.impliedReturnAtConsensus, d.costOfEquity))}
            tone={minus(d.impliedReturnAtConsensus, d.costOfEquity)}
          />
          <div className="pt-3 mt-1 border-t border-white/[0.06] space-y-2">
            <p className="text-[0.65rem] uppercase tracking-wider text-white/40">Implied growth vs deliverable growth</p>
            <Figure label="Implied − sustainable growth" value={signed(d.impliedMinusSustainable)} tone={d.impliedMinusSustainable} />
            <Figure label="Implied − consensus growth" value={signed(d.impliedMinusConsensus)} tone={d.impliedMinusConsensus} />
          </div>
        </Card>
      </div>

      {/* The implied years beside the reader's own moat judgment. */}
      <div className="panel-soft p-5 mt-4 grid gap-4 md:grid-cols-[minmax(0,15rem)_1fr] md:items-start">
        <div>
          <p className="text-[0.65rem] uppercase tracking-wider text-white/40">
            <Term>Implied years of high growth</Term>
            {years ? ` at ${pct(years.growth)}` : ""}
          </p>
          <p className="font-mono text-2xl text-gold tabular-nums mt-1">
            {years?.years != null ? `${years.years.toFixed(2)} years` : years ? boundText(years.bound, "number of years") : "n/a"}
          </p>
        </div>
        <div>
          <p className="text-[0.65rem] uppercase tracking-wider text-white/40">
            Your moat judgment · Does the company have a sustainable competitive advantage?
          </p>
          <p className={cn("text-sm leading-relaxed mt-1.5 max-w-prose", moat ? "text-white/80" : "text-white/40")}>
            {moat || "Not answered yet. The question is in the Competitive Advantage Durability deck at the foot of this page."}
          </p>
        </div>
      </div>

      {(d.grid || d.scenarios.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mt-4">
          {d.grid && (
            <div className="lg:col-span-3">
              <Card title="Fair P/E sensitivity · cost of equity ＼ growth">
                <SensitivityGrid grid={d.grid} />
                <div className="grid grid-cols-3 gap-2">
                  <Tile label="Actual P/E" metric="Price To Earnings" value={times(d.forwardPe)} />
                  <Tile label="Rates −100 bp" value={times(d.rateShock?.down)} />
                  <Tile label="Rates +100 bp" value={times(d.rateShock?.up)} />
                </div>
              </Card>
            </div>
          )}
          {d.scenarios.length > 0 && (
            <div className={d.grid ? "lg:col-span-2" : "lg:col-span-5"}>
              <Card title={`Bear, base, bull · ${n} years at each growth rate`}>
                <Scenarios data={d} />
              </Card>
            </div>
          )}
        </div>
      )}

      {d.peers && d.peers.peers.length > 0 && <Peers peers={d.peers} ticker={ticker} />}

      <div className="panel-soft p-5 mt-4">
        <QualitativeBlock section="individual" scopeKey={ticker} groups={deck} storageSuffix="pe-growth" defaultOpen hideHeader />
      </div>
    </section>
  );
}

// ── Pieces ────────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel-soft p-5 h-full">
      <p className="eyebrow mb-3">{title}</p>
      <div className="space-y-2 text-sm">{children}</div>
    </div>
  );
}

/** A label that opens its definition: the metric's own when it has one, else the panel's. */
function Term({ metric = PANEL_DEF, children }: { metric?: string; children: React.ReactNode }) {
  return (
    <MetricTerm metric={metric} asSpan>
      {children}
    </MetricTerm>
  );
}

function Figure({
  label,
  value,
  metric,
  tone,
  accent,
}: {
  label: string;
  value: string;
  metric?: string;
  tone?: number | null;
  accent?: boolean;
}) {
  return (
    <dl className="flex items-baseline justify-between gap-4">
      <dt className="text-white/55 text-xs leading-snug">
        <Term metric={metric}>{label}</Term>
      </dt>
      <dd
        className={cn(
          "font-mono tabular-nums text-right",
          NUMBER.test(value) && "whitespace-nowrap",
          negative(tone) ? "text-loss-strong" : accent ? "text-gold" : "text-white/85",
        )}
      >
        {value}
      </dd>
    </dl>
  );
}

/** Label over value, for figures whose value is too long to sit beside its label. */
function Tile({ label, value, metric }: { label: string; value: string; metric?: string }) {
  return (
    <dl className="rounded-sm border border-white/[0.06] bg-ink-800/60 px-3 py-2.5">
      <dt className="text-[0.65rem] uppercase tracking-wider text-white/40">
        <Term metric={metric}>{label}</Term>
      </dt>
      <dd className="font-mono tabular-nums text-[0.85rem] text-white/85 mt-1">{value}</dd>
    </dl>
  );
}

function Source({ children }: { children: React.ReactNode }) {
  return <p className="text-[0.72rem] font-mono text-white/40 pt-2">{children}</p>;
}

function SpreadTrend({ rows }: { rows: PeGrowth["spreadHistory"] }) {
  const lines = [
    { label: "ROE − cost of equity", metric: "Excess Return", get: (r: (typeof rows)[number]) => r.roeMinusKe },
    { label: "ROIC − WACC", metric: "ROIC − WACC Spread", get: (r: (typeof rows)[number]) => r.roicMinusWacc },
  ];
  return (
    <div className="panel-soft p-5 mt-4">
      <p className="eyebrow mb-3">
        Trend of both spreads · FY{rows[0].year}–FY{rows[rows.length - 1].year}
      </p>
      <div className="overflow-x-auto">
        <table className="border-collapse text-sm w-full" style={{ minWidth: 520 }}>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-ink-800 text-left px-3 py-2 border-b border-r border-gold/15 min-w-[160px]">
                <span className="label">Spread</span>
              </th>
              {rows.map((r) => (
                <th key={r.year} scope="col" className="px-2.5 py-2 border-b border-gold/10 text-right min-w-[68px]">
                  <span className="text-[0.7rem] font-mono text-white/55">{r.year}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.label}>
                <th scope="row" className="sticky left-0 z-10 bg-ink-800 text-left px-3 py-1.5 border-b border-r border-white/[0.06] font-normal">
                  <span className="text-[0.8rem] text-white/75">
                    <Term metric={l.metric}>{l.label}</Term>
                  </span>
                </th>
                {rows.map((r) => {
                  const v = l.get(r);
                  return (
                    <td
                      key={r.year}
                      className={cn(
                        "px-2.5 py-1.5 text-right border-b border-white/[0.05] tabular-nums font-mono text-[0.76rem]",
                        negative(v) ? "text-loss-strong" : "text-white/80",
                      )}
                    >
                      {pct(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** One hue, light to dark with the value: a magnitude, not a verdict. On a log
 *  scale, because a cell where growth nearly reaches the cost of equity runs
 *  into the hundreds and would wash out every other cell on a linear one. */
function goldTint(v: number | null, lo: number, hi: number): string | undefined {
  if (v == null || v <= 0 || lo <= 0 || hi <= lo) return undefined;
  const t = Math.log(v / lo) / Math.log(hi / lo);
  return `rgba(201,168,76,${(0.05 + t * 0.3).toFixed(2)})`;
}

function SensitivityGrid({ grid }: { grid: NonNullable<PeGrowth["grid"]> }) {
  const values = grid.matrix.flat().filter((v): v is number => v != null);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return (
    <div className="overflow-x-auto mb-3">
      <table className="border-collapse text-sm w-full" style={{ minWidth: 440 }}>
        <thead>
          <tr>
            <th scope="col" className="px-3 py-2 text-left border-b border-r border-gold/15">
              <span className="text-[0.65rem] uppercase tracking-wider text-white/40">Ke ＼ g</span>
            </th>
            {grid.growthAxis.map((g, gi) => (
              <th key={gi} scope="col" className={cn("px-3 py-2 text-right border-b border-gold/10", gi === 2 && "bg-gold/5")}>
                <span className="text-[0.7rem] font-mono text-white/60">{pct(g)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.matrix.map((row, ki) => (
            <tr key={ki}>
              <th scope="row" className={cn("px-3 py-2 text-left border-b border-r border-gold/10", ki === 2 && "bg-gold/5")}>
                <span className="text-[0.7rem] font-mono text-white/60">{pct(grid.keAxis[ki])}</span>
              </th>
              {row.map((cell, gi) => (
                <td
                  key={gi}
                  title={`Cost of equity ${pct(grid.keAxis[ki])}, growth ${pct(grid.growthAxis[gi])}: fair P/E ${times(cell)}`}
                  className={cn(
                    "px-3 py-2 text-right border-b border-white/[0.05] tabular-nums font-mono text-[0.76rem]",
                    cell == null ? "text-white/20" : "text-white/85",
                    ki === 2 && gi === 2 && "ring-1 ring-inset ring-gold/60",
                  )}
                  style={{ backgroundColor: goldTint(cell, lo, hi) }}
                >
                  {times(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SOURCE_LABEL: Record<PeGrowth["scenarios"][number]["source"], string> = {
  historical: "5-year earnings growth",
  sustainable: "Sustainable growth",
  consensus: "Consensus growth",
};

function Scenarios({ data: d }: { data: PeGrowth }) {
  const head = "px-2 py-2 border-b border-gold/15 font-normal";
  const cell = "px-2 py-2 text-right border-b border-white/[0.05] font-mono tabular-nums";
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-sm w-full" style={{ minWidth: 340 }}>
        <thead>
          <tr className="text-[0.65rem] uppercase tracking-wider text-white/40">
            <th scope="col" className={cn(head, "text-left")}>Case</th>
            <th scope="col" className={cn(head, "text-right")}>Growth</th>
            <th scope="col" className={cn(head, "text-right")}>Fair P/E</th>
            <th scope="col" className={cn(head, "text-right")}>Actual ÷ fair</th>
          </tr>
        </thead>
        <tbody>
          {d.scenarios.map((s) => (
            <tr key={s.case}>
              <th scope="row" className="px-2 py-2 text-left border-b border-white/[0.05] font-normal">
                <span className="text-white/85 capitalize">{s.case}</span>
                <span className="block text-[0.7rem] text-white/40">{SOURCE_LABEL[s.source]}</span>
              </th>
              <td className={cn(cell, "text-white/80")}>{pct(s.growth)}</td>
              <td className={cn(cell, "text-gold")}>{times(s.fairPe)}</td>
              <td className={cn(cell, "text-white/80")}>{times(s.actualToFairPe)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Peers({ peers: p, ticker }: { peers: NonNullable<PeGrowth["peers"]>; ticker: string }) {
  const reg = p.regression;
  const head = "px-2 py-2 border-b border-gold/15 font-normal";
  const cell = "px-2 py-1.5 text-right border-b border-white/[0.05] font-mono tabular-nums";
  return (
    <div className="panel-soft p-5 mt-4">
      <p className="eyebrow mb-3">
        Peers{p.fiscalYear ? ` · FY${p.fiscalYear}` : ""} · actual minus fair P/E, and P/E vs spread
      </p>
      <div className="overflow-x-auto">
        <table className="border-collapse text-sm w-full" style={{ minWidth: 560 }}>
          <thead>
            <tr className="text-[0.65rem] uppercase tracking-wider text-white/40">
              <th scope="col" className={cn(head, "text-left")}>Company</th>
              <th scope="col" className={cn(head, "text-right")}>P/E, FY-end</th>
              <th scope="col" className={cn(head, "text-right")}>Fair P/E, trailing</th>
              <th scope="col" className={cn(head, "text-right")}>Actual − fair</th>
              <th scope="col" className={cn(head, "text-right")}>ROE − Ke</th>
            </tr>
          </thead>
          <tbody>
            {p.peers.map((r) => (
              <tr key={r.ticker} className={cn(r.isSubject && "bg-gold/[0.07]")}>
                <th scope="row" className="px-2 py-1.5 text-left border-b border-white/[0.05] font-normal">
                  <span className={cn("font-mono text-[0.78rem]", r.isSubject ? "text-gold" : "text-white/80")}>{r.ticker}</span>
                  <span className="ml-2 text-[0.72rem] text-white/40">{r.name}</span>
                </th>
                <td className={cn(cell, "text-white/80")}>{times(r.pe)}</td>
                <td className={cn(cell, "text-white/80")}>{times(r.fairPe)}</td>
                <td className={cn(cell, "text-white/80")}>{signedX(r.gap)}</td>
                <td className={cn(cell, negative(r.spread) ? "text-loss-strong" : "text-white/80")}>{signed(r.spread)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-2 md:grid-cols-3 mt-4">
        <Tile
          label="Regression across peers"
          value={reg ? `P/E = ${reg.intercept.toFixed(3)} ${reg.slope < 0 ? "−" : "+"} ${Math.abs(reg.slope).toFixed(3)} × spread` : "n/a"}
        />
        <Tile label="R² · peers in the fit" value={reg ? `${reg.r2 == null ? "n/a" : reg.r2.toFixed(3)} · ${reg.n}` : "n/a"} />
        <Tile
          label={`${ticker}: P/E minus the line`}
          value={p.subject ? `${signedX(p.subject.residual)} (line ${times(p.subject.predictedPe)})` : "n/a"}
        />
      </div>
      {!reg ? (
        <Source>
          No line: {p.peerCount} peers pass the filters, and a fit needs at least {p.minPeersForFit}.
        </Source>
      ) : (
        !p.subject && (
          <Source>
            {ticker} is not in the fit: it made a loss, has negative book value, reports in a currency other than US
            dollars, or its P/E or ROE falls outside the bounds the scorecards use.
          </Source>
        )
      )}
    </div>
  );
}
