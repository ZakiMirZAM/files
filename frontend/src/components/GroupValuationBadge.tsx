import type { GroupValuation } from "../lib/types";
import { cn } from "../lib/cn";

interface GroupValuationBadgeProps {
  valuation: GroupValuation;
  groupLabel: string;
}

export function GroupValuationBadge({ valuation, groupLabel }: GroupValuationBadgeProps) {
  if (!valuation || (valuation.cape === null && valuation.dcfIntrinsic === null && valuation.valueScore === null)) {
    return null;
  }
  const mosPct = valuation.marginOfSafety !== null ? valuation.marginOfSafety * 100 : null;
  const mosColor =
    mosPct === null ? "text-white/40" :
    mosPct >= 25 ? "text-gain-strong" :
    mosPct >= 0 ? "text-gain" :
    mosPct >= -25 ? "text-gold" :
    "text-loss";
  const scoreColor =
    valuation.valueScore === null ? "text-white/40" :
    valuation.valueScore >= 75 ? "text-gain-strong" :
    valuation.valueScore >= 50 ? "text-gold" :
    valuation.valueScore >= 25 ? "text-white/70" :
    "text-loss";

  return (
    <div className="panel p-5 mb-6 animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow mb-1">Group Valuation · {groupLabel}</p>
          <p className="text-xs text-white/45">
            From <span className="text-white/70 font-mono">industry_averages.py</span> · CAPE + DCF + composite Value Score
          </p>
        </div>
        <div className="flex flex-wrap items-stretch gap-3">
          <Stat label="CAPE" value={
            valuation.cape !== null ? `${valuation.cape.toFixed(3)}x` : "n/a"
          } />
          <Stat label="DCF / share" value={
            valuation.dcfIntrinsic !== null ? `$${valuation.dcfIntrinsic.toFixed(3)}` : "n/a"
          } />
          <Stat label="Margin of safety" value={
            mosPct !== null ? `${mosPct >= 0 ? "+" : ""}${mosPct.toFixed(3)}%` : "n/a"
          } valueClass={mosColor} />
          <Stat label="FCF growth used" value={
            valuation.fcfGrowthUsed !== null ? `${(valuation.fcfGrowthUsed * 100).toFixed(3)}%` : "n/a"
          } />
          <Stat label="Value Score" value={
            valuation.valueScore !== null ? `${valuation.valueScore.toFixed(3)}/100` : "n/a"
          } valueClass={scoreColor} prominent />
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass,
  prominent,
}: {
  label: string;
  value: string;
  valueClass?: string;
  prominent?: boolean;
}) {
  return (
    <div className={cn(
      "px-4 py-2.5 rounded-sm border",
      prominent ? "border-gold/40 bg-gold/5" : "border-gold/10 bg-white/[0.02]",
    )}>
      <p className="text-[0.65rem] uppercase tracking-wider text-white/40 mb-1">{label}</p>
      <p className={cn("font-mono text-base", valueClass ?? "text-gold")}>{value}</p>
    </div>
  );
}
