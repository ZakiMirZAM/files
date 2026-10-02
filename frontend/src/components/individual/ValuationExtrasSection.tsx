import type { ValuationAnchors } from "../../lib/types";
import { formatPerShare } from "../../lib/format";
import { cn } from "../../lib/cn";
import { Anchor } from "lucide-react";
import { DefinitionLink } from "./DefinitionsBlock";

interface ValuationExtrasSectionProps {
  anchors?: ValuationAnchors | null;
}

const ps = (v: number | null | undefined): string => formatPerShare(v);

/**
 * Graham deep-value asset floors. The R&D capitalization restatement that used
 * to sit beside them now lives in ReinvestmentSection.
 */
export function ValuationExtrasSection({ anchors }: ValuationExtrasSectionProps) {
  if (!anchors) return null;

  return (
    <section className="animate-fade-up">
      <header className="mb-5">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">Deep Value</h2>
        <div className="flex flex-wrap gap-2 mt-3">
          <DefinitionLink number={75} prominent>How asset floors work</DefinitionLink>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AnchorsCard a={anchors} />
      </div>
    </section>
  );
}

function AnchorsCard({ a }: { a: ValuationAnchors }) {
  const upColor = (u: number | null) =>
    u == null ? "text-white/50" : u >= 0 ? "text-gain-strong" : "text-loss-strong";
  const upTxt = (u: number | null) => (u == null ? "n/a" : `${u >= 0 ? "+" : ""}${(u * 100).toFixed(3)}%`);

  return (
    <div className="panel-soft p-5">
      <p className="eyebrow mb-3 inline-flex items-center gap-2">
        <Anchor className="w-4 h-4" /> Deep-Value Asset Floors
      </p>
      <dl className="space-y-2.5 text-sm">
        <Row label="Current price" value={ps(a.price)} />
        <Row label="Graham Number" value={ps(a.grahamNumber)}
             aside={<span className={cn("font-mono text-xs", upColor(a.grahamNumberUpside))}>{upTxt(a.grahamNumberUpside)}</span>} />
        <Row label="NCAV / share" value={ps(a.ncavPerShare)}
             aside={<span className={cn("font-mono text-xs", upColor(a.ncavPerShareUpside))}>{upTxt(a.ncavPerShareUpside)}</span>} />
        <Row label="Net-net / share (FMP)" value={ps(a.grahamNetNetPerShare)} />
        <div className="flex items-center justify-between pt-2 mt-1">
          <span className="text-white/55 text-xs">Passes net-net test</span>
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
