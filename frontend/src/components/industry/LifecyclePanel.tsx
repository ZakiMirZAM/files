import type { IndustryLifecycle } from "../../lib/types";
import { cn } from "../../lib/cn";
import { Sprout, TrendingUp, Landmark, TrendingDown, HelpCircle } from "lucide-react";

interface LifecyclePanelProps {
  lifecycle?: IndustryLifecycle | null;
}

const STAGE_META: Record<
  string,
  { label: string; icon: React.ReactNode; chip: string }
> = {
  emerging: {
    label: "Emerging",
    icon: <Sprout className="w-4 h-4" />,
    chip: "text-gain-strong border-gain/40 bg-gain-ghost",
  },
  growth: {
    label: "Growth",
    icon: <TrendingUp className="w-4 h-4" />,
    chip: "text-gold border-gold/40 bg-gold-ghost",
  },
  mature: {
    label: "Mature",
    icon: <Landmark className="w-4 h-4" />,
    chip: "text-white/75 border-white/20 bg-white/[0.04]",
  },
  declining: {
    label: "Declining",
    icon: <TrendingDown className="w-4 h-4" />,
    chip: "text-loss-strong border-loss/40 bg-loss-ghost",
  },
};

const pct = (v: number | null | undefined, d = 3): string =>
  v == null ? "n/a" : `${(v * 100).toFixed(d)}%`;

/**
 * Where the industry sits in its life.
 * The stage changes what a good company looks like here: young industries earn
 * a pass on thin margins while they land-grab, mature ones owe you cash.
 */
export function LifecyclePanel({ lifecycle }: LifecyclePanelProps) {
  if (!lifecycle) return null;
  if (!lifecycle.applicable) {
    return (
      <div className="panel-soft p-5">
        <p className="eyebrow mb-2 inline-flex items-center gap-2">
          <HelpCircle className="w-4 h-4" /> Industry Life Cycle
        </p>
        <p className="text-sm text-white/55">{lifecycle.reason}</p>
      </div>
    );
  }
  const meta = STAGE_META[lifecycle.stage ?? "mature"];
  return (
    <div className="panel-soft p-5" data-tour="industry-lifecycle">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <p className="eyebrow inline-flex items-center gap-2">
          {meta.icon} Industry Life Cycle
        </p>
        <span
          className={cn(
            "font-mono text-[0.72rem] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-sm border",
            meta.chip,
          )}
        >
          {meta.label}
          {lifecycle.confidence === "low" ? " · low confidence" : ""}
        </span>
      </div>
      <p className="text-sm text-white/75 max-w-3xl">{lifecycle.reading}</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
        <div className="rounded-sm px-2.5 py-2 border border-gold/10 bg-white/[0.015]">
          <p className="text-[0.65rem] uppercase tracking-wider text-white/40">Median growth (5y)</p>
          <p className="font-mono text-[0.85rem] text-white/85 mt-0.5">{pct(lifecycle.medianGrowth5y)}</p>
        </div>
        <div className="rounded-sm px-2.5 py-2 border border-gold/10 bg-white/[0.015]">
          <p className="text-[0.65rem] uppercase tracking-wider text-white/40">Margin slope</p>
          <p className="font-mono text-[0.85rem] text-white/85 mt-0.5">
            {lifecycle.marginSlopePpYr == null ? "n/a" : `${lifecycle.marginSlopePpYr > 0 ? "+" : ""}${lifecycle.marginSlopePpYr}pp/yr`}
          </p>
        </div>
        <div className="rounded-sm px-2.5 py-2 border border-gold/10 bg-white/[0.015]">
          <p className="text-[0.65rem] uppercase tracking-wider text-white/40">Down years (of 3)</p>
          <p className="font-mono text-[0.85rem] text-white/85 mt-0.5">{lifecycle.negativeGrowthYearsOf3 ?? "n/a"}</p>
        </div>
        <div className="rounded-sm px-2.5 py-2 border border-gold/10 bg-white/[0.015]">
          <p className="text-[0.65rem] uppercase tracking-wider text-white/40">Years used</p>
          <p className="font-mono text-[0.85rem] text-white/85 mt-0.5">{lifecycle.yearsUsed ?? "n/a"}</p>
        </div>
      </div>
      <p className="text-[0.72rem] leading-6 text-white/40 mt-3 pt-3 border-t border-gold/10">{lifecycle.note}</p>
    </div>
  );
}
