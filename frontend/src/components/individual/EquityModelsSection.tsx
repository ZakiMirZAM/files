import type { DividendDiscount, DividendDiscountRow, FcfeRegulatory } from "../../lib/types";
import { formatPerShare } from "../../lib/format";
import { cn } from "../../lib/cn";
import { Coins, Banknote } from "lucide-react";
import { DefinitionLink } from "./DefinitionsBlock";
import { StageToggle, useActiveVariant } from "./StageToggle";
import { NotApplicable } from "../NotApplicable";

interface EquityModelsSectionProps {
  dividendDiscount?: DividendDiscount | null;
  fcfeRegulatory?: FcfeRegulatory | null;
  ticker?: string;
}

const ps = (v: number | null | undefined): string => formatPerShare(v);
const rate = (v: number | null | undefined, d = 3): string =>
  v == null ? "n/a" : `${(v * 100).toFixed(d)}%`;

const mosColor = (mos: number | null | undefined): string =>
  mos == null ? "text-white/50"
  : mos >= 0.25 ? "text-gain-strong"
  : mos >= 0 ? "text-gain"
  : mos >= -0.25 ? "text-gold"
  : "text-loss-strong";

const mosText = (mos: number | null | undefined): string =>
  mos == null ? "n/a" : `${mos >= 0 ? "+" : ""}${(mos * 100).toFixed(3)}%`;

/**
 * Two complementary equity-side intrinsic models for financial-service firms
 *, the companions to the residual-income
 * model. Method 2, dividend discount (observable payouts sidestep the
 * unmeasurable-reinvestment problem). Method 3, FCFE where reinvestment is
 * redefined as the equity retained to grow regulatory capital.
 */
export function EquityModelsSection({ dividendDiscount: ddm, fcfeRegulatory: fcfe, ticker = "" }: EquityModelsSectionProps) {
  if (!ddm && !fcfe) return null;
  const recommended = !!(ddm?.recommended || fcfe?.recommended);

  return (
    <section className="animate-fade-up">
      <header className="mb-5">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">
          Dividend Discount &amp; FCFE {recommended && <span className="text-gold/70 text-lg">· recommended</span>}
        </h2>
        <DefinitionLink number={74} prominent className="mt-3">How the dividend discount and FCFE models work</DefinitionLink>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DdmCard ddm={ddm} ticker={ticker} />
        <FcfeCard fcfe={fcfe} />
      </div>
    </section>
  );
}

function DdmCard({ ddm, ticker }: { ddm?: DividendDiscount | null; ticker: string }) {
  const variants = ddm?.stageVariants ?? null;
  const recommendedStages = ddm?.recommendedStages ?? null;
  const active = useActiveVariant(ticker, variants, recommendedStages);
  if (!ddm) return null;
  // The toggle is a lens: the card's headline follows the selected structure.
  const shownIntrinsic = active?.intrinsicPerShare ?? ddm.intrinsicPerShare;
  const shownMos = active?.marginOfSafety ?? ddm.marginOfSafety;
  // Safe cast: DdmCard only receives variants from the DDM's stageVariants,
  // which the backend builds exclusively from the dividend-track engine.
  const shownRows = (active?.rows as DividendDiscountRow[] | undefined) ?? ddm.rows;
  const shownPvDiv = active?.pvDividends ?? ddm.pvDividends;
  const shownPvTerm = active?.pvTerminal ?? ddm.pvTerminal;
  return (
    <div className="panel-soft p-5">
      <p className="eyebrow mb-3 inline-flex items-center gap-2">
        <Banknote className="w-4 h-4" /> Method 2 · Dividend Discount
      </p>
      {!ddm.applicable ? (
        <NotApplicable reason={ddm.reason} fallback="Not applicable." />
      ) : (
        <>
          {variants && recommendedStages != null && (
            <StageToggle
              ticker={ticker}
              variants={variants}
              recommended={recommendedStages}
              className="mb-4"
            />
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <Stat k="Ke" v={rate(ddm.costOfEquity)} />
            <Stat
              k={ddm.buybacksIncluded ? "Payout (aug.)" : "Payout"}
              v={rate(ddm.payout)}
            />
            <Stat k="ROE" v={rate(ddm.roeUsed)} />
            <Stat k="g → term" v={`${rate(ddm.growthInitial)}→${rate(ddm.growthTerminal)}`} />
          </div>
          {ddm.buybacksIncluded && ddm.conventionalPayout != null && (
            <p className="text-xs text-white/45 mb-3 leading-snug">
              The augmented payout counts buybacks as returned cash
              ({rate(ddm.augmentedPayout)} vs {rate(ddm.conventionalPayout)} on
              dividends alone), aggregated over recent years because buybacks
              are lumpy.
            </p>
          )}
          <dl className="space-y-2 text-sm">
            <Row label="EPS₀ / DPS₀" value={`${ps(ddm.eps0)} / ${ps(ddm.dps0)}`} />
            <Row label="PV of dividends" value={ps(shownPvDiv)} />
            <Row label="+ PV terminal price" value={ps(shownPvTerm)} />
            <div className="pt-1 mt-2 flex items-baseline justify-between">
              <span className="text-white/55 text-xs">DDM intrinsic / share</span>
              <span className="font-display text-2xl font-semibold text-gold">{ps(shownIntrinsic)}</span>
            </div>
            <Row label="Current price" value={ps(ddm.currentPrice)} />
            <div className="flex items-baseline justify-between">
              <span className="text-white/55 text-xs">Margin of safety</span>
              <span className={cn("font-mono text-base", mosColor(shownMos))}>
                {mosText(shownMos)}
              </span>
            </div>
          </dl>
          {shownRows && shownRows.length > 0 && (
            <ProjTable
              years={shownRows.map((r) => r.year)}
              rows={[
                { label: "Growth", get: (i) => rate(shownRows[i].growth) },
                { label: "EPS", get: (i) => ps(shownRows[i].eps) },
                { label: "DPS", get: (i) => ps(shownRows[i].dps) },
                { label: "PV", get: (i) => ps(shownRows[i].pv) },
              ]}
            />
          )}
          {ddm.hModel && (
            <div className="mt-4 panel-soft p-3">
              <p className="text-[0.65rem] uppercase tracking-wider text-white/40 mb-1.5">
                H-model cross-check
              </p>
              <p className="text-xs text-white/60 leading-snug">
                Growth declining linearly over {ddm.hModel.hYears * 2} years
                values the stock at {ps(ddm.hModel.value)} ({ps(ddm.hModel.stableComponent)}
                {" "}stable + {ps(ddm.hModel.extraordinaryComponent)} extraordinary).
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FcfeCard({ fcfe }: { fcfe?: FcfeRegulatory | null }) {
  if (!fcfe) return null;
  return (
    <div className="panel-soft p-5">
      <p className="eyebrow mb-3 inline-flex items-center gap-2">
        <Coins className="w-4 h-4" /> Method 3 · FCFE (regulatory capital)
      </p>
      {!fcfe.applicable ? (
        <NotApplicable reason={fcfe.reason} fallback="Not applicable." />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <Stat k="Ke" v={rate(fcfe.costOfEquity)} />
            <Stat k="ROE" v={rate(fcfe.roeUsed)} />
            <Stat k="Equity/Assets" v={rate(fcfe.equityAssetRatio)} />
            <Stat k="Reinvest g/ROE" v={rate(fcfe.equityReinvestmentRate)} />
          </div>
          {fcfe.growthSource && (
            <p className="text-xs text-white/45 mb-3 leading-snug">
              Growth source: {fcfe.growthSource}.
            </p>
          )}
          <dl className="space-y-2 text-sm">
            <Row label="Book value / share (BVPS₀)" value={ps(fcfe.bvps0)} />
            <Row label="PV of FCFE" value={ps(fcfe.pvFcfe)} />
            <Row label="+ PV terminal" value={ps(fcfe.pvTerminal)} />
            <div className="pt-1 mt-2 flex items-baseline justify-between">
              <span className="text-white/55 text-xs">FCFE intrinsic / share</span>
              <span className="font-display text-2xl font-semibold text-gold">{ps(fcfe.intrinsicPerShare)}</span>
            </div>
            <Row label="Current price" value={ps(fcfe.currentPrice)} />
            <div className="flex items-baseline justify-between">
              <span className="text-white/55 text-xs">Margin of safety</span>
              <span className={cn("font-mono text-base", mosColor(fcfe.marginOfSafety))}>
                {mosText(fcfe.marginOfSafety)}
              </span>
            </div>
          </dl>
          {fcfe.rows && fcfe.rows.length > 0 && (
            <ProjTable
              years={fcfe.rows.map((r) => r.year)}
              rows={[
                { label: "EPS (ROE×BV)", get: (i) => ps(fcfe.rows![i].eps) },
                { label: "− Equity reinvested", get: (i) => ps(fcfe.rows![i].equityReinvested) },
                { label: "= FCFE", get: (i) => ps(fcfe.rows![i].fcfe) },
                { label: "PV", get: (i) => ps(fcfe.rows![i].pv) },
              ]}
            />
          )}
        </>
      )}
    </div>
  );
}

interface ProjRow {
  label: string;
  get: (index: number) => string;
}

function ProjTable({ years, rows }: { years: number[]; rows: ProjRow[] }) {
  return (
    <div className="overflow-x-auto mt-4">
      <table className="border-collapse text-sm w-full" style={{ minWidth: 360 }}>
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-ink-800 text-left px-3 py-2 border-b border-r border-gold/15 min-w-[120px]">
              <span className="label">Line</span>
            </th>
            {years.map((y) => (
              <th key={y} className="px-2.5 py-2 border-b border-gold/10 text-right min-w-[58px]">
                <span className="text-[0.7rem] font-mono text-white/55">Y{y}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((sr) => (
            <tr key={sr.label}>
              <th className="sticky left-0 z-10 bg-ink-800 text-left px-3 py-1.5 border-b border-r border-white/[0.06] font-normal">
                <span className="text-[0.8rem] text-white/75">{sr.label}</span>
              </th>
              {years.map((_, i) => (
                <td
                  key={i}
                  className="px-2.5 py-1.5 text-right border-b border-white/[0.05] tabular-nums font-mono text-[0.74rem] text-white/80"
                >
                  {sr.get(i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-white/55 text-xs">{label}</span>
      <span className="font-mono text-white/85">{value}</span>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="panel-soft px-3 py-2">
      <p className="text-[0.65rem] uppercase tracking-wider text-white/40">{k}</p>
      <p className="font-mono text-[0.8rem] text-white/85 mt-0.5">{v}</p>
    </div>
  );
}
