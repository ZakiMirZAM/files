import type {
  NormalizedEarnings,
  NormalizedLeases,
  NormalizedInvestmentIncome,
  NormalizedOneTime,
  NormalizedGoodwillSbc,
} from "../../lib/types";
import { formatCurrency } from "../../lib/format";
import { cn } from "../../lib/cn";
import { Scale, PiggyBank, Sparkles, Layers } from "lucide-react";
import { DefinitionLink, MetricTerm } from "./DefinitionsBlock";
import { NotApplicable } from "../NotApplicable";

interface NormalizedEarningsSectionProps {
  data?: NormalizedEarnings | null;
}

const money = (v: number | null | undefined): string =>
  v == null ? "n/a" : formatCurrency(v, { compact: true });
const pct = (v: number | null | undefined, d = 3): string =>
  v == null ? "n/a" : `${(v * 100).toFixed(d)}%`;

const LBL = "text-[0.65rem] uppercase tracking-wider text-white/40";

/** A clickable metric label rendered in the small uppercase tile style. */
function Lbl({ children }: { children: string }) {
  return (
    <p className={LBL}>
      <MetricTerm metric={children} asSpan />
    </p>
  );
}

/**
 * Damodaran-style normalized-earnings bridge (Investment Valuation, Ch.9). Four
 * cards restate reported figures the way a valuation should treat them: operating
 * leases as debt, investment income stripped out (ex-financials), one-time items
 * normalized to a through-the-cycle margin, and the SBC/goodwill drag surfaced.
 * Every figure is clickable for its sidebar definition.
 */
export function NormalizedEarningsSection({ data }: NormalizedEarningsSectionProps) {
  if (!data) return null;

  return (
    <section className="animate-fade-up">
      <header className="mb-5">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">
          Normalized Earnings &amp; Capital
        </h2>
        <DefinitionLink number={530} prominent className="mt-3">How earnings normalization works</DefinitionLink>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LeasesCard l={data.leases} />
        <InvestmentIncomeCard i={data.investmentIncome} />
        <OneTimeCard o={data.oneTime} />
        <GoodwillSbcCard g={data.goodwillSbc} />
      </div>

    </section>
  );
}

function CardShell({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="panel-soft p-5">
      <p className="eyebrow mb-3 inline-flex items-center gap-2">
        {icon} <MetricTerm metric={title} asSpan />
      </p>
      {children}
    </div>
  );
}

function Bridge({ label, rep, adj }: { label: string; rep: number | null | undefined; adj: number | null | undefined }) {
  return (
    <div>
      <p className={LBL}>
        <MetricTerm metric={label} asSpan /> reported → adjusted
      </p>
      <p className="font-mono text-[0.85rem] text-white/85 mt-0.5">
        {money(rep)} <span className="text-white/35">→</span> <span className="text-gold">{money(adj)}</span>
      </p>
    </div>
  );
}

function LeasesCard({ l }: { l: NormalizedLeases }) {
  const icon = <Scale className="w-4 h-4" />;
  const title = "Operating Leases as Debt";
  if (!l.applicable) {
    return (
      <CardShell icon={icon} title={title}>
        <NotApplicable reason={l.reason} />
      </CardShell>
    );
  }
  const footnote = l.leaseSource === "xbrl_footnote";
  return (
    <CardShell icon={icon} title={title}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
        <Bridge label="Operating income" rep={l.reportedEbit} adj={l.adjustedEbit} />
        <Bridge label="Debt (+ leases)" rep={l.conventionalDebt} adj={l.totalDebtWithLeases} />
        <div>
          <Lbl>Debt value of leases</Lbl>
          <p className="font-mono text-[0.85rem] text-white/85 mt-0.5">{money(l.leaseDebt)}</p>
        </div>
        <div>
          <Lbl>Imputed interest</Lbl>
          <p className="font-mono text-[0.85rem] text-white/85 mt-0.5">{money(l.imputedInterest)}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span
          className={cn(
            "font-mono text-[0.68rem] px-2 py-0.5 rounded-sm border",
            footnote
              ? "text-gain-strong border-gain/40 bg-gain-ghost"
              : "text-white/50 border-white/10",
          )}
        >
          {footnote ? "10-K footnote · in WACC" : "capital leases · context only"}
        </span>
      </div>
    </CardShell>
  );
}

function InvestmentIncomeCard({ i }: { i: NormalizedInvestmentIncome }) {
  const icon = <PiggyBank className="w-4 h-4" />;
  const title = "Investment Income Removed";
  if (!i.applicable) {
    return (
      <CardShell icon={icon} title={title}>
        <NotApplicable reason={i.reason} />
      </CardShell>
    );
  }
  return (
    <CardShell icon={icon} title={title}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
        <Bridge label="Net income" rep={i.reportedNetIncome} adj={i.coreNetIncome} />
        <div>
          <Lbl>Investment income (after tax)</Lbl>
          <p className="font-mono text-[0.85rem] text-white/85 mt-0.5">{money(i.afterTaxInvestmentIncome)}</p>
        </div>
        <div>
          <Lbl>Share of net income</Lbl>
          <p className="font-mono text-[0.85rem] text-white/85 mt-0.5">{pct(i.pctFromInvestments)}</p>
        </div>
        <div>
          <Lbl>Securities held aside</Lbl>
          <p className="font-mono text-[0.85rem] text-gold mt-0.5">{money(i.marketableSecuritiesHeldAside)}</p>
        </div>
      </div>
    </CardShell>
  );
}

function OneTimeCard({ o }: { o: NormalizedOneTime }) {
  const icon = <Sparkles className="w-4 h-4" />;
  const title = "One-Time Item Normalization";
  if (!o.applicable) {
    return (
      <CardShell icon={icon} title={title}>
        <NotApplicable reason={o.reason} />
      </CardShell>
    );
  }
  const dev =
    o.reportedMargin != null && o.medianOperatingMargin != null
      ? o.reportedMargin - o.medianOperatingMargin
      : null;
  return (
    <CardShell icon={icon} title={title}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
        <Bridge label="Operating income" rep={o.reportedEbit} adj={o.normalizedEbit} />
        <div>
          <Lbl>Margin (reported vs median)</Lbl>
          <p className="font-mono text-[0.85rem] text-white/85 mt-0.5">
            {pct(o.reportedMargin)} <span className="text-white/35">vs</span>{" "}
            <span className="text-gold">{pct(o.medianOperatingMargin)}</span>
            {dev != null && Math.abs(dev) > 0.001 && (
              <span className={cn("ml-1.5 text-[0.7rem]", dev >= 0 ? "text-gain-strong" : "text-loss-strong")}>
                ({dev >= 0 ? "+" : ""}
                {(dev * 100).toFixed(3)}pp)
              </span>
            )}
          </p>
        </div>
      </div>
      {o.flaggedYears && o.flaggedYears.length > 0 && (
        <p className="text-[0.72rem] font-mono text-white/55 mt-3">
          Flagged years:{" "}
          {o.flaggedYears
            .map((f) => `${f.year} (${f.deviation >= 0 ? "+" : ""}${(f.deviation * 100).toFixed(3)}pp)`)
            .join(", ")}
        </p>
      )}
      {o.inferredGoodwillImpairment && (
        <p className="text-[0.72rem] font-mono text-loss-strong mt-1.5">
          Inferred goodwill impairment {o.inferredGoodwillImpairment.year}:{" "}
          {money(o.inferredGoodwillImpairment.impairment)} ({pct(o.inferredGoodwillImpairment.pctOfAssets)} of assets)
        </p>
      )}
    </CardShell>
  );
}

function GoodwillSbcCard({ g }: { g: NormalizedGoodwillSbc }) {
  return (
    <CardShell icon={<Layers className="w-4 h-4" />} title="Goodwill &amp; Stock Comp">
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
        <div>
          <Lbl>SBC (kept as expense)</Lbl>
          <p className="font-mono text-[0.85rem] text-white/85 mt-0.5">{money(g.sbc)}</p>
        </div>
        <div>
          <Lbl>SBC / revenue</Lbl>
          <p className="font-mono text-[0.85rem] text-white/85 mt-0.5">{pct(g.sbcToRevenue)}</p>
        </div>
        <div>
          <Lbl>SBC / operating cash flow</Lbl>
          <p className="font-mono text-[0.85rem] text-white/85 mt-0.5">{pct(g.sbcToOperatingCashFlow)}</p>
        </div>
        <div>
          <Lbl>Goodwill / assets</Lbl>
          <p className="font-mono text-[0.85rem] text-white/85 mt-0.5">{pct(g.goodwillToAssets)}</p>
        </div>
      </div>
      {g.inferredImpairment && (
        <p className="text-[0.72rem] font-mono text-loss-strong mt-3">
          Inferred impairment {g.inferredImpairment.year}: {money(g.inferredImpairment.impairment)} (
          {pct(g.inferredImpairment.pctOfAssets)} of assets)
        </p>
      )}
    </CardShell>
  );
}
