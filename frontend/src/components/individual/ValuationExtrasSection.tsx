import type { ValuationAnchors, RndAdjusted } from "../../lib/types";
import { formatCurrency } from "../../lib/format";
import { cn } from "../../lib/cn";
import { Anchor, FlaskConical } from "lucide-react";
import { DefinitionLink } from "./DefinitionsBlock";

interface ValuationExtrasSectionProps {
  anchors?: ValuationAnchors | null;
  rnd?: RndAdjusted | null;
}

const ps = (v: number | null | undefined): string => (v == null ? "n/a" : `$${v.toFixed(2)}`);
const pct = (v: number | null | undefined, d = 1): string => (v == null ? "n/a" : `${(v * 100).toFixed(d)}%`);

/**
 * Two compact cards: Graham deep-value asset floors, and the Damodaran R&D-
 * capitalization restatement of EBIT/ROIC for research-intensive firms.
 */
export function ValuationExtrasSection({ anchors, rnd }: ValuationExtrasSectionProps) {
  if (!anchors && !rnd) return null;

  return (
    <section className="animate-fade-up">
      <header className="mb-5">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">Deep Value &amp; R&amp;D Capitalization</h2>
        <div className="flex flex-wrap gap-2 mt-3">
          <DefinitionLink number={75} prominent>How Graham asset floors work</DefinitionLink>
          <DefinitionLink number={76} prominent>How R&amp;D capitalization works</DefinitionLink>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {anchors && <AnchorsCard a={anchors} />}
        {rnd && <RndCard r={rnd} />}
      </div>
    </section>
  );
}

function AnchorsCard({ a }: { a: ValuationAnchors }) {
  const upColor = (u: number | null) =>
    u == null ? "text-white/50" : u >= 0 ? "text-gain-strong" : "text-loss-strong";
  const upTxt = (u: number | null) => (u == null ? "n/a" : `${u >= 0 ? "+" : ""}${(u * 100).toFixed(0)}%`);

  return (
    <div className="panel-soft p-5">
      <p className="eyebrow mb-3 inline-flex items-center gap-2">
        <Anchor className="w-4 h-4" /> Deep-Value Asset Floors (Graham)
      </p>
      <dl className="space-y-2.5 text-sm">
        <Row label="Current price" value={ps(a.price)} />
        <Row label="Graham Number" value={ps(a.grahamNumber)}
             aside={<span className={cn("font-mono text-xs", upColor(a.grahamNumberUpside))}>{upTxt(a.grahamNumberUpside)}</span>} />
        <Row label="NCAV / share" value={ps(a.ncavPerShare)}
             aside={<span className={cn("font-mono text-xs", upColor(a.ncavPerShareUpside))}>{upTxt(a.ncavPerShareUpside)}</span>} />
        <Row label="Net-net / share (FMP)" value={ps(a.grahamNetNetPerShare)} />
        <div className="flex items-center justify-between pt-2 mt-1">
          <span className="text-white/55 text-xs">Passes Graham net-net test</span>
          <span className={cn(
            "font-mono text-xs px-2 py-0.5 rounded-sm border",
            a.passesNetNetTest == null ? "text-white/40 border-white/10"
            : a.passesNetNetTest ? "text-gain-strong border-gain/40 bg-gain-ghost"
            : "text-white/55 border-white/10",
          )}>
            {a.passesNetNetTest == null ? "n/a" : a.passesNetNetTest ? "YES" : "no"}
          </span>
        </div>
      </dl>
    </div>
  );
}

function RndCard({ r }: { r: RndAdjusted }) {
  if (!r.applicable) {
    return (
      <div className="panel-soft p-5">
        <p className="eyebrow mb-3 inline-flex items-center gap-2">
          <FlaskConical className="w-4 h-4" /> R&amp;D Capitalization
        </p>
        <p className="text-sm text-white/55">{r.reason}</p>
        {r.rdIntensity != null && (
          <p className="text-xs font-mono text-white/45 mt-2">R&amp;D / revenue: {pct(r.rdIntensity)}</p>
        )}
      </div>
    );
  }

  const roicDelta =
    r.roicAdjusted != null && r.roicReported != null ? r.roicAdjusted - r.roicReported : null;

  return (
    <div className="panel-soft p-5">
      <p className="eyebrow mb-3 inline-flex items-center gap-2">
        <FlaskConical className="w-4 h-4" /> R&amp;D Capitalization (Damodaran Ch.9)
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
        <Compare label="EBIT" rep={r.ebitReported} adj={r.ebitAdjusted} money />
        <Compare label="NOPAT" rep={r.nopatReported} adj={r.nopatAdjusted} money />
        <Compare label="Invested capital" rep={r.investedCapitalReported} adj={r.investedCapitalAdjusted} money />
        <div>
          <p className="text-[0.65rem] uppercase tracking-wider text-white/40">ROIC reported → adjusted</p>
          <p className="font-mono text-[0.85rem] text-white/85 mt-0.5">
            {pct(r.roicReported)} <span className="text-white/35">→</span>{" "}
            <span className="text-gold">{pct(r.roicAdjusted)}</span>
            {roicDelta != null && (
              <span className={cn("ml-1.5 text-[0.7rem]", roicDelta >= 0 ? "text-gain-strong" : "text-loss-strong")}>
                ({roicDelta >= 0 ? "+" : ""}{(roicDelta * 100).toFixed(1)}pp)
              </span>
            )}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3 text-[0.72rem] font-mono text-white/55">
        <span>R&amp;D/rev {pct(r.rdIntensity)}</span>
        <span>Asset {r.researchAsset != null ? formatCurrency(r.researchAsset, { compact: true }) : "n/a"}</span>
        <span>Life {r.life}y</span>
      </div>
    </div>
  );
}

function Compare({ label, rep, adj, money }: { label: string; rep: number | null | undefined; adj: number | null | undefined; money?: boolean }) {
  const f = (v: number | null | undefined) =>
    v == null ? "n/a" : money ? formatCurrency(v, { compact: true }) : v.toFixed(2);
  return (
    <div>
      <p className="text-[0.65rem] uppercase tracking-wider text-white/40">{label} rep → adj</p>
      <p className="font-mono text-[0.85rem] text-white/85 mt-0.5">
        {f(rep)} <span className="text-white/35">→</span> <span className="text-gold">{f(adj)}</span>
      </p>
    </div>
  );
}

function Row({ label, value, aside }: { label: string; value: string; aside?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-white/55 text-xs">{label}</span>
      <span className="flex items-baseline gap-2">
        <span className="font-mono text-white/85">{value}</span>
        {aside}
      </span>
    </div>
  );
}
