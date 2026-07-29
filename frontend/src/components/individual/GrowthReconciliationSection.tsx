import type { CompanyLifecycle, GrowthReconciliation } from "../../lib/types";
import { cn } from "../../lib/cn";
import { DefinitionLink } from "./DefinitionsBlock";
import { GrowthExplainer } from "../GrowthExplainer";
import { Sprout } from "lucide-react";

interface GrowthReconciliationSectionProps {
  data?: GrowthReconciliation | null;
  lifecycle?: CompanyLifecycle | null;
}

const pct = (v: number | null | undefined, d = 3): string =>
  v == null ? "n/a" : `${(v * 100).toFixed(d)}%`;

const STAGE_LABEL: Record<string, string> = {
  emerging: "Emerging",
  growth: "High growth",
  mature: "Mature",
  declining: "Declining",
};

const STAGE_TINT: Record<string, string> = {
  emerging: "border-gain/40 bg-gain/[0.06] text-gain-strong",
  growth: "border-gain/30 bg-gain/[0.04] text-gain",
  mature: "border-gold/30 bg-gold/[0.05] text-gold",
  declining: "border-loss/35 bg-loss/[0.05] text-loss",
};

/**
 * Growth reconciliation.
 * The forward model needs one growth rate. There are two honest ways to read it:
 * the trend through the company's own revenue history, and the rate its
 * reinvestment and returns can actually fund. This section shows both, says which
 * one drove the model and why, and names the life-cycle stage that set the rules.
 */
export function GrowthReconciliationSection({ data, lifecycle }: GrowthReconciliationSectionProps) {
  if (!data) return null;

  const stage = lifecycle?.applicable ? lifecycle.stage : undefined;
  const usesSalesToCapital = data.reinvestmentMethod === "salesToCapital";

  return (
    <section className="animate-fade-up">
      <header className="mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">
            Growth Reconciliation
          </h2>
          {stage && (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[0.65rem] font-mono uppercase tracking-wider",
                STAGE_TINT[stage] ?? "border-white/15 text-white/60",
              )}
            >
              <Sprout className="w-3 h-3" />
              {STAGE_LABEL[stage] ?? stage}
              {lifecycle?.confidence === "low" && <span className="opacity-60">· low confidence</span>}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <DefinitionLink number={519} prominent>What is fundamental growth?</DefinitionLink>
          <DefinitionLink number={521} prominent>How the life-cycle stage is set</DefinitionLink>
        </div>
      </header>

      <div className="panel-soft p-5 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-sm px-2.5 py-2 border border-gold/10 bg-white/[0.015]">
            <p className="text-[0.65rem] uppercase tracking-wider text-white/40">Its own history</p>
            <p className="font-mono text-lg text-white/85 mt-0.5">{pct(data.historical)}</p>
          </div>
          <div className="rounded-sm px-2.5 py-2 border border-gold/10 bg-white/[0.015]">
            <p className="text-[0.65rem] uppercase tracking-wider text-white/40">
              What its fundamentals fund
            </p>
            <p className="font-mono text-lg text-white/85 mt-0.5">{pct(data.fundamental)}</p>
          </div>
          <div
            className={cn(
              "rounded-sm px-2.5 py-2 border",
              data.divergenceFlag ? "border-loss/40 bg-loss/[0.05]" : "border-gold/10 bg-white/[0.015]",
            )}
          >
            <p className="text-[0.65rem] uppercase tracking-wider text-white/40">Gap between them</p>
            <p
              className={cn(
                "font-mono text-lg mt-0.5",
                data.divergenceFlag ? "text-loss" : "text-white/85",
              )}
            >
              {pct(data.divergence)}
            </p>
          </div>
          <div className="rounded-sm px-2.5 py-2 border border-gold/40 bg-gold/[0.06]">
            <p className="text-[0.65rem] uppercase tracking-wider text-white/40">The model uses</p>
            <p className="font-mono text-lg text-gold mt-0.5">{pct(data.growthUsed)}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {usesSalesToCapital && <DefinitionLink number={520}>How sales-to-capital works</DefinitionLink>}
          {data.efficiencyTerm != null && data.efficiencyTerm > 0 && (
            <DefinitionLink number={523}>Why that source runs out</DefinitionLink>
          )}
        </div>

        <GrowthExplainer />
      </div>
    </section>
  );
}
