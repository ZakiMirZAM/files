import type { EpvBlock, TobinsQBlock, OwnerEarningsBlock } from "../../lib/types";
import { formatCurrency, formatPerShare } from "../../lib/format";
import { cn } from "../../lib/cn";
import { DefinitionLink, MetricTerm } from "./DefinitionsBlock";
import { Gauge, Factory, HandCoins } from "lucide-react";
import { NotApplicable } from "../NotApplicable";

interface ValueLensesSectionProps {
  epv?: EpvBlock | null;
  tobinsQ?: TobinsQBlock | null;
  ownerEarnings?: OwnerEarningsBlock | null;
}

const money = (v: number | null | undefined): string =>
  v == null ? "n/a" : formatCurrency(v, { compact: true });
const ps = (v: number | null | undefined): string => formatPerShare(v);

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

function Tile({ label, value, hi }: { label: string; value: string; hi?: boolean }) {
  return (
    <div className={cn("rounded-sm px-2.5 py-2 border", hi ? "border-gold/40 bg-gold/[0.06]" : "border-gold/10 bg-white/[0.015]")}>
      <p className="text-[0.65rem] uppercase tracking-wider text-white/40"><MetricTerm metric={label} asSpan /></p>
      <p className={cn("font-mono text-[0.9rem] mt-0.5", hi ? "text-gold" : "text-white/85")}>{value}</p>
    </div>
  );
}

/**
 * Three value lenses that sit beside the DCF rather than replacing it:
 * Greenwald's no-growth earnings power value, Tobin's Q against the asset
 * base, and Buffett's owner earnings as the cash an owner could take out.
 */
export function ValueLensesSection({ epv, tobinsQ, ownerEarnings }: ValueLensesSectionProps) {
  const anyContent = epv || tobinsQ || ownerEarnings;
  if (!anyContent) return null;

  return (
    <section className="animate-fade-up">
      <header className="mb-5">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">
          Earnings Power &amp; Owner Value
        </h2>
        <div className="flex flex-wrap gap-2 mt-3">
          <DefinitionLink number={194} prominent>How earnings power value works</DefinitionLink>
          <DefinitionLink number={195} prominent>How Tobin's Q works</DefinitionLink>
          <DefinitionLink number={196} prominent>How owner earnings work</DefinitionLink>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {epv && (
          <CardShell icon={<Gauge className="w-4 h-4" />} title="Earnings Power Value">
            {epv.applicable ? (
              <div className="grid grid-cols-2 gap-2">
                <Tile label="EPV per share" value={ps(epv.epvPerShare)} hi />
                <Tile label="Price / EPV" value={epv.priceToEpv == null ? "n/a" : `${epv.priceToEpv.toFixed(3)}x`} />
                <Tile label="DCF intrinsic" value={ps(epv.dcfIntrinsicPerShare)} />
                <Tile label="Growth premium /sh" value={ps(epv.growthPremiumPerShare)} />
                <Tile label="Sustainable EBIT" value={money(epv.sustainableEbit)} />
                <Tile label="Capitalized at WACC" value={epv.wacc == null ? "n/a" : `${(epv.wacc * 100).toFixed(3)}%`} />
              </div>
            ) : (
              <NotApplicable reason={epv.reason} />
            )}
          </CardShell>
        )}

        {tobinsQ && (
          <CardShell icon={<Factory className="w-4 h-4" />} title="Tobin's Q">
            {tobinsQ.applicable ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Tile label="Q today" value={tobinsQ.latest == null ? "n/a" : `${tobinsQ.latest.toFixed(3)}x`} hi />
                  <Tile
                    label="Reading"
                    value={tobinsQ.latest == null ? "n/a" : tobinsQ.latest >= 1 ? "above asset base" : "below asset base"}
                  />
                </div>
                {tobinsQ.trend && tobinsQ.trend.length > 1 && (
                  <div className="mt-3">
                    <p className="text-[0.65rem] uppercase tracking-wider text-white/40 mb-1.5">History</p>
                    <div className="flex items-end gap-1 h-14">
                      {tobinsQ.trend.slice(-10).map((t) => {
                        const max = Math.max(...tobinsQ.trend!.slice(-10).map((x) => x.q), 1);
                        return (
                          <div key={t.year} className="flex-1 flex flex-col items-center gap-1" title={`${t.year}: ${t.q.toFixed(3)}x`}>
                            <div
                              className="w-full rounded-sm bg-gold/50"
                              style={{ height: `${Math.max(6, (t.q / max) * 100)}%` }}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-[0.6rem] font-mono text-white/35 mt-1">
                      <span>{tobinsQ.trend.slice(-10)[0]?.year}</span>
                      <span>{tobinsQ.trend[tobinsQ.trend.length - 1]?.year}</span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <NotApplicable reason={tobinsQ.reason} />
            )}
          </CardShell>
        )}

        {ownerEarnings && (
          <CardShell
            icon={<HandCoins className="w-4 h-4" />}
            title="Owner Earnings"
          >
            {ownerEarnings.applicable ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Tile label="Owner earnings" value={money(ownerEarnings.ownerEarnings)} hi />
                  <Tile label="Per share" value={ps(ownerEarnings.ownerEarningsPerShare)} />
                  <Tile label="Free cash flow" value={money(ownerEarnings.freeCashFlow)} />
                  <Tile label="Growth capex" value={money(ownerEarnings.growthCapex)} />
                </div>
                <dl className="mt-3 space-y-1 text-[0.75rem] font-mono text-white/55">
                  <div className="flex justify-between"><dt className="text-white/45">Net income</dt><dd>{money(ownerEarnings.netIncome)}</dd></div>
                  <div className="flex justify-between"><dt className="text-white/45">+ D&amp;A</dt><dd>{money(ownerEarnings.depreciationAmortization)}</dd></div>
                  <div className="flex justify-between"><dt className="text-white/45">− upkeep capex (est.)</dt><dd>{money(ownerEarnings.maintenanceCapexProxy)}</dd></div>
                  <div className="flex justify-between"><dt className="text-white/45">± working capital</dt><dd>{money(ownerEarnings.workingCapitalChange)}</dd></div>
                </dl>
                {ownerEarnings.lookThroughFlag && (
                  <p className="text-[0.72rem] text-gold/80 mt-2.5">Look-through earnings flag</p>
                )}
              </>
            ) : (
              <NotApplicable reason={ownerEarnings.reason} />
            )}
          </CardShell>
        )}
      </div>
    </section>
  );
}
