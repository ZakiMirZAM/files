import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { IndividualAnalysis, UseOfCashKey, UsesOfCashYear } from "../../lib/types";
import { DefinitionLink, MetricTerm } from "./DefinitionsBlock";
import { QualitativeBlock } from "../QualitativeBlock";

interface UsesOfCashSectionProps {
  analysis: IndividualAnalysis;
  ticker: string;
  companyName?: string;
}

/** The six uses, in the order the capital-allocation literature reads them:
 *  reinvestment in the business first, then growth bought rather than built,
 *  then cash returned to shareholders, then debt.
 *
 *  `label` is the metric label the definition sidebar resolves. Each one already
 *  has a definition file (capex 159, R&D 085, acquisitions 160, buybacks 167,
 *  dividends 168, debt repayment 165), so they are reused rather than duplicated. */
const USES: ReadonlyArray<{ key: UseOfCashKey; label: string; short: string; color: string }> = [
  { key: "capex", label: "Capital Expenditure", short: "Capex", color: "#c9a84c" },
  { key: "rnd", label: "Research And Development Expenses", short: "R&D", color: "#7fb87c" },
  { key: "acquisitions", label: "Acquisitions Net", short: "Acquisitions", color: "#6f9dc4" },
  { key: "buybacks", label: "Common Stock Repurchased", short: "Buybacks", color: "#b98ac9" },
  { key: "dividends", label: "Dividends Paid", short: "Dividends", color: "#d9b85c" },
  { key: "debtRepaid", label: "Debt Repayment", short: "Debt repaid", color: "#c87672" },
];

const AXIS_TICK = { fill: "rgba(255,255,255,0.45)", fontSize: 11 };

function usd(v: number | null | undefined): string {
  if (v === null || v === undefined) return "not reported";
  const a = Math.abs(v);
  if (a >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toFixed(0)}`;
}

function pct(v: number | null | undefined): string {
  if (v === null || v === undefined) return "not reported";
  return `${(v * 100).toFixed(3)}%`;
}

/** Rows for the share chart. A year with no positive operating cash flow has no
 *  meaningful percentage, so it is left empty rather than drawn as a negative. */
function shareRows(years: UsesOfCashYear[]) {
  return years.map((y) => {
    const row: Record<string, number | string | null> = { year: String(y.year) };
    for (const u of USES) {
      const v = y.shareOfOcf ? y.shareOfOcf[u.key] : null;
      row[u.key] = v === null || v === undefined ? null : v * 100;
    }
    return row;
  });
}

function dollarRows(years: UsesOfCashYear[]) {
  return years.map((y) => {
    const row: Record<string, number | string | null> = { year: String(y.year) };
    for (const u of USES) row[u.key] = y.uses[u.key];
    return row;
  });
}

function ChartTooltip({ active, payload, label, unit }: {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; value?: number | string }>;
  label?: string | number;
  unit: "pct" | "usd";
}) {
  if (!active || !payload?.length) return null;
  const fmt = unit === "pct"
    ? (v: number) => `${v.toFixed(3)}%`
    : (v: number) => usd(v);
  return (
    <div className="panel-soft px-3 py-2 text-xs">
      <div className="font-mono text-white/50 mb-1">{label}</div>
      {USES.map((u) => {
        const p = payload.find((x) => x.dataKey === u.key);
        const v = p?.value;
        if (v === null || v === undefined || typeof v !== "number") return null;
        return (
          <div key={u.key} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-sm" style={{ background: u.color }} />
              <span className="text-white/70">{u.short}</span>
            </span>
            <span className="font-mono text-white">{fmt(v)}</span>
          </div>
        );
      })}
    </div>
  );
}

function StackedChart({ rows, unit }: {
  rows: Array<Record<string, number | string | null>>;
  unit: "pct" | "usd";
}) {
  return (
    <div className="h-72 md:h-80 -mx-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 12, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="year" axisLine={false} tickLine={false} tick={AXIS_TICK} />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={AXIS_TICK}
            width={58}
            tickFormatter={(v) => (unit === "pct" ? `${Number(v).toFixed(0)}%` : usd(Number(v)))}
          />
          <Tooltip
            cursor={{ fill: "rgba(201,168,76,0.06)" }}
            content={<ChartTooltip unit={unit} />}
          />
          <Legend
            iconType="square"
            iconSize={9}
            wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
            formatter={(value) => {
              const u = USES.find((x) => x.key === value);
              return <span className="text-white/60">{u?.short ?? value}</span>;
            }}
          />
          {USES.map((u, i) => (
            <Bar
              key={u.key}
              dataKey={u.key}
              stackId="uses"
              fill={u.color}
              radius={i === USES.length - 1 ? [3, 3, 0, 0] : undefined}
              // Recharts animates bar height up from zero, so the chart reads as
              // empty for the first second and a half. The house charts that carry
              // data rather than decoration turn it off (see DefinitionChart), and
              // an empty-looking chart is worse than an un-animated one.
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function UsesOfCashSection({ analysis, ticker, companyName }: UsesOfCashSectionProps) {
  const data = analysis.usesOfCash;
  if (!data) return null;

  const dataContext = JSON.stringify({
    ticker,
    company: companyName ?? ticker,
    sector: analysis.sector,
    industry: analysis.industry,
    usesOfCash: data,
    roic: analysis.forecast?.assumptions?.roic ?? null,
    wacc: analysis.forecast?.assumptions?.wacc ?? null,
  });

  const deck = (
    <QualitativeBlock
      section="individual"
      scopeKey={ticker}
      onlyTitles={[
        "Capital Allocation",
      ]}
      storageSuffix="capalloc"
      dataContext={dataContext}
      hideHeader
    />
  );

  if (!data.applicable) {
    return (
      <section className="animate-fade-up">
        <header className="mb-5">
          <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">Uses of Cash</h2>
          <DefinitionLink number={800} prominent className="mt-3">
            How the uses-of-cash record works
          </DefinitionLink>
        </header>
        <div className="panel-soft p-4 text-sm text-white/50">
          {data.reason ?? "This company does not report the cash-flow lines needed to show how its operating cash flow was used."}
        </div>
        <div className="mt-6">{deck}</div>
      </section>
    );
  }

  const years = data.years ?? [];
  const sourceYears = years.filter(
    (y) => y.sources.netDebtRaised !== null || y.sources.netDivestitures !== null,
  );
  const unreported = USES.filter((u) => years.some((y) => !y.reported[u.key]));
  const noShareYears = years.filter((y) => !y.ocfPositive);

  return (
    <section className="animate-fade-up">
      <header className="mb-5">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">Uses of Cash</h2>
        <p className="mt-2 text-sm text-white/60 max-w-3xl">
          What management actually did with each year's{" "}
          <MetricTerm metric="Operating Cash Flow" asSpan />. The chart is the record of the
          decision, not the narrative around it.
        </p>
        <DefinitionLink number={800} prominent className="mt-3">
          How the uses-of-cash record works
        </DefinitionLink>
      </header>

      {/* Share of operating cash flow. This is the diagnostic view: a dollar figure
          rises simply because the company grew, while a share shows what management
          chose to prioritise, and the drift in the shares is the finding. */}
      <div className="panel p-4 md:p-5">
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
          <h3 className="text-sm font-semibold text-white">
            <MetricTerm metric="Share of Operating Cash Flow" asSpan />
          </h3>
          <span className="text-[0.7rem] text-white/30">each use as a percent of operating cash flow</span>
        </div>
        <p className="text-xs text-white/40 mb-3 max-w-2xl">
          Read the drift across the years, not the level in any one of them. The shares do not
          sum to 100 percent: a company can spend more than it earned by drawing on cash or
          borrowing, and less by letting cash build up.
        </p>
        {data.anyPositiveOcf ? (
          <StackedChart rows={shareRows(years)} unit="pct" />
        ) : (
          <p className="text-sm text-white/50 py-8 text-center">
            Operating cash flow was never positive in the years on file, so no share can be
            computed. The dollar chart below still applies.
          </p>
        )}
      </div>

      {/* The same six uses in dollars. */}
      <div className="panel p-4 md:p-5 mt-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
          <h3 className="text-sm font-semibold text-white">Uses of cash in dollars</h3>
          <span className="text-[0.7rem] text-white/30">reporting currency</span>
        </div>
        <p className="text-xs text-white/40 mb-3 max-w-2xl">
          The same decisions in absolute terms. A rising figure here can simply mean the company
          got bigger, which is why the share chart above carries the diagnosis.
        </p>
        <StackedChart rows={dollarRows(years)} unit="usd" />
      </div>

      {/* The six uses, each clickable through to its definition. */}
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {USES.map((u) => (
          <span
            key={u.key}
            className="px-2 py-1 rounded-sm border border-white/10 flex items-center gap-1.5"
          >
            <span className="inline-block w-2 h-2 rounded-sm" style={{ background: u.color }} />
            <MetricTerm metric={u.label} asSpan />
            <span className="font-mono text-white/50">
              {usd(data.totals?.[u.key] ?? null)}
            </span>
            {data.totalShareOfOcf ? (
              <span className="font-mono text-white/30">
                ({pct(data.totalShareOfOcf[u.key])})
              </span>
            ) : null}
          </span>
        ))}
      </div>

      {/* Honesty notes. Each of these is a case where a naive chart would state
          something false, so they are surfaced rather than smoothed over. */}
      {(sourceYears.length > 0 || unreported.length > 0 || noShareYears.length > 0) && (
        <div className="panel-soft p-4 mt-4 space-y-2 text-xs text-white/55">
          {sourceYears.length > 0 && (
            <p>
              <span className="text-white/80">Cash that came in, not out. </span>
              In{" "}
              {sourceYears.map((y, i) => (
                <span key={y.year} className="font-mono text-white/70">
                  {y.year}
                  {i < sourceYears.length - 1 ? ", " : ""}
                </span>
              ))}{" "}
              the company was a net borrower or sold more than it bought. Borrowing is a source of
              cash, not a use of it, so those amounts are excluded from the bars above rather than
              drawn as spending.
            </p>
          )}
          {unreported.length > 0 && (
            <p>
              <span className="text-white/80">Not reported. </span>
              {unreported.map((u) => u.short).join(", ")}{" "}
              {unreported.length === 1 ? "is" : "are"} missing for at least one year on file. Those
              years are left blank rather than drawn as zero, because a line the company did not
              report is not the same as money it did not spend.
            </p>
          )}
          {noShareYears.length > 0 && (
            <p>
              <span className="text-white/80">No percentage shown. </span>
              Operating cash flow was not positive in{" "}
              {noShareYears.map((y, i) => (
                <span key={y.year} className="font-mono text-white/70">
                  {y.year}
                  {i < noShareYears.length - 1 ? ", " : ""}
                </span>
              ))}
              , so a share of it cannot be computed. Dividing by a negative denominator would turn
              every use into a negative percentage, which reads as the opposite of what happened.
            </p>
          )}
        </div>
      )}

      {/* The interrogation. Collapsed by default; the user answers in their own words. */}
      <div className="mt-6">{deck}</div>
    </section>
  );
}
