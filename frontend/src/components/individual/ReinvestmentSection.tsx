import { useMemo } from "react";
import type {
  CapexSplitBlock,
  CapexSplitFigures,
  CapitalBaseBlock,
  IndividualForecast,
  OwnerEarningsBlock,
  RndAdjusted,
  UsesOfCash,
} from "../../lib/types";
import { formatCurrency, formatPerShare } from "../../lib/format";
import { buildReinvestmentDeck, capexSplitNotes, rndNotes } from "../../lib/reinvestmentDeck";
import { DefinitionLink, MetricTerm } from "./DefinitionsBlock";
import { QualitativeBlock } from "../QualitativeBlock";
import { NotApplicable } from "../NotApplicable";

interface ReinvestmentSectionProps {
  capexSplit?: CapexSplitBlock | null;
  rnd?: RndAdjusted | null;
  ownerEarnings?: OwnerEarningsBlock | null;
  forecast?: IndividualForecast | null;
  capitalBase?: CapitalBaseBlock | null;
  usesOfCash?: UsesOfCash | null;
  ticker: string;
  companyName: string;
}

/** `currency` is the section's reporting currency; only money figures use it. */
type Fmt = (v: number | null | undefined, currency?: string | null) => string;

/** A non-USD block prints its ISO code where the formatter put "$": "TWD 1.27T". */
const inCurrency = (s: string, currency?: string | null) =>
  currency && currency !== "USD" ? s.replace("$", `${currency} `) : s;

const sign = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "");
// A zero here is a real answer (no growth spending when revenue fell), and the
// shared compact formatter prints it as "$0.000".
const money: Fmt = (v, c) => (v == null ? "n/a" : inCurrency(v === 0 ? "$0" : formatCurrency(v, { compact: true }), c));
const signedMoney: Fmt = (v, c) =>
  v == null ? "n/a" : inCurrency(v === 0 ? "$0" : `${sign(v)}${formatCurrency(Math.abs(v), { compact: true })}`, c);
// A ratio (dollars of equipment per dollar of sales), the same in any currency,
// so it keeps the "$" its owner-worded label reads in.
const perDollar: Fmt = (v) => formatPerShare(v, 2);
const times: Fmt = (v) => (v == null ? "n/a" : `${v.toFixed(2)}x`);
const pct: Fmt = (v) => (v == null ? "n/a" : `${v < 0 ? "−" : ""}${Math.abs(v * 100).toFixed(1)}%`);
const pts: Fmt = (v) => (v == null ? "n/a" : `${sign(v)}${Math.abs(v * 100).toFixed(1)} pts`);

/** Owner's row labels, word for word. `metric` only where an existing definition resolves. */
const CAPEX_ROWS: { label: string; metric?: string; key: keyof CapexSplitFigures; fmt: Fmt }[] = [
  { label: "Capital spending", metric: "Capital Expenditure", key: "capitalSpending", fmt: money },
  { label: "Equipment per $1 of sales (multi-year average of net PP&E ÷ revenue)", key: "ppeToSales", fmt: perDollar },
  { label: "Revenue change (excluding inflation and acquisitions)", key: "revenueChange", fmt: signedMoney },
  { label: "Growth spending (floored at zero when revenue falls)", key: "growthSpending", fmt: money },
  { label: "Upkeep spending (estimated)", key: "upkeepSpending", fmt: money },
  { label: "Depreciation", metric: "Depreciation And Amortization", key: "depreciation", fmt: money },
  { label: "Upkeep ÷ depreciation", key: "upkeepToDepreciation", fmt: times },
  { label: "Profit overstatement (upkeep − depreciation, in dollars)", key: "profitOverstatement", fmt: signedMoney },
];

type RndKey = keyof RndAdjusted;
const RND_ROWS: { label: string; metric: string; rep: RndKey; adj: RndKey; fmt: Fmt }[] = [
  { label: "Operating profit", metric: "Operating Income", rep: "ebitReported", adj: "ebitAdjusted", fmt: money },
  { label: "After-tax operating profit", metric: "NOPAT", rep: "nopatReported", adj: "nopatAdjusted", fmt: money },
  {
    label: "Capital invested (beginning of year, including last year's research asset)",
    metric: "Invested Capital",
    rep: "investedCapitalReported",
    adj: "investedCapitalAdjusted",
    fmt: money,
  },
  { label: "ROIC", metric: "ROIC", rep: "roicReported", adj: "roicAdjusted", fmt: pct },
  { label: "ROIC − WACC", metric: "ROIC − WACC", rep: "roicMinusWaccReported", adj: "roicMinusWaccAdjusted", fmt: pts },
];

const num = (v: unknown) => (typeof v === "number" ? v : null);

/**
 * How much of what the company spends keeps it standing and how much grows it:
 * the capex split into upkeep and growth, the R&D restatement that treats
 * research as an investment, and the deck that turns both into a judgment.
 */
export function ReinvestmentSection({
  capexSplit,
  rnd,
  ownerEarnings,
  forecast,
  capitalBase,
  usesOfCash,
  ticker,
  companyName,
}: ReinvestmentSectionProps) {
  const deck = useMemo(
    () =>
      buildReinvestmentDeck({
        company: companyName,
        dataContext: JSON.stringify({
          company: companyName,
          capexSplit,
          rndAdjusted: rnd,
          ownerEarnings,
          wacc: forecast?.assumptions?.wacc,
          roic: forecast?.assumptions?.roic,
          reverseDcf: forecast?.reverseDcf,
          capitalBase,
          usesOfCash,
        }),
      }),
    [companyName, capexSplit, rnd, ownerEarnings, forecast, capitalBase, usesOfCash],
  );

  if (!capexSplit && !rnd) return null;
  // Both tables are in the reporting currency; only the capex block names it.
  const currency = capexSplit?.currency;

  return (
    <section className="animate-fade-up">
      <header className="mb-5">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">Reinvestment and Value</h2>
        <div className="flex flex-wrap gap-2 mt-3">
          <DefinitionLink number={196} prominent>How owner earnings work</DefinitionLink>
          <DefinitionLink number={76} prominent>How R&amp;D capitalization works</DefinitionLink>
        </div>
      </header>

      <div className="space-y-4">
        {capexSplit && (
          <div className="panel-soft p-5">
            <p className="eyebrow mb-4">Capex split</p>
            {capexSplit.applicable ? (
              <>
                <FigureTable
                  columns={[...(capexSplit.years ?? []).map((y) => `FY${y.year}`), "5-year average"]}
                  rows={CAPEX_ROWS.map((r) => ({
                    label: r.label,
                    metric: r.metric,
                    cells: [
                      ...(capexSplit.years ?? []).map((y) => r.fmt(y[r.key], currency)),
                      r.fmt(capexSplit.average?.[r.key], currency),
                    ],
                  }))}
                />
                <Notes lines={capexSplitNotes(capexSplit, companyName)} />
              </>
            ) : (
              <NotApplicable reason={capexSplit.reason} />
            )}
          </div>
        )}

        {rnd?.applicable && (
          <div className="panel-soft p-5">
            <p className="eyebrow mb-4">R&amp;D capitalization</p>
            <FigureTable
              columns={["As reported", "R&D treated as an investment"]}
              rows={RND_ROWS.map((r) => ({
                label: r.label,
                metric: r.metric,
                cells: [r.fmt(num(rnd[r.rep]), currency), r.fmt(num(rnd[r.adj]), currency)],
              }))}
            />
            <Notes lines={rndNotes(rnd)} />
          </div>
        )}

        <div className="panel-soft p-5">
          <QualitativeBlock section="individual" scopeKey={ticker} groups={deck} storageSuffix="reinvestment" defaultOpen hideHeader />
        </div>
      </div>
    </section>
  );
}

// ── Pieces ────────────────────────────────────────────────────────────────

function FigureTable({ columns, rows }: { columns: string[]; rows: { label: string; metric?: string; cells: string[] }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-sm w-full" style={{ minWidth: 520 }}>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 bg-ink-800 text-left px-3 py-2 border-b border-r border-gold/15 min-w-[220px]">
              <span className="label">Line</span>
            </th>
            {columns.map((c) => (
              <th key={c} scope="col" className="px-2.5 py-2 border-b border-gold/10 text-right min-w-[84px]">
                <span className="text-[0.7rem] font-mono text-white/55">{c}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row" className="sticky left-0 z-10 bg-ink-800 text-left px-3 py-1.5 border-b border-r border-white/[0.06] font-normal max-w-[320px]">
                <span className="text-[0.8rem] text-white/75">
                  {r.metric ? (
                    <MetricTerm metric={r.metric} asSpan>
                      {r.label}
                    </MetricTerm>
                  ) : (
                    r.label
                  )}
                </span>
              </th>
              {r.cells.map((v, i) => (
                <td
                  key={i}
                  className="px-2.5 py-1.5 text-right border-b border-white/[0.05] tabular-nums font-mono text-[0.76rem] text-white/80 whitespace-nowrap"
                >
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Notes({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="mt-3 space-y-1.5 max-w-prose">
      {lines.map((l) => (
        <p key={l} className="text-[0.75rem] leading-relaxed text-white/50">
          {l}
        </p>
      ))}
    </div>
  );
}
