import type { ReverseDcf } from "../../lib/types";
import { cn } from "../../lib/cn";
import { DefinitionLink } from "./DefinitionsBlock";
import { FlipHorizontal2 } from "lucide-react";

interface ReverseDcfSectionProps {
  data?: ReverseDcf | null;
}

const pct = (v: number | null | undefined, d = 1): string =>
  v == null ? "n/a" : `${(v * 100).toFixed(d)}%`;

/**
 * Reverse DCF (Penman, Accounting for Value Ch.4). The forward model asks what
 * the company is worth given assumptions. This section asks the opposite: what
 * yearly revenue growth does today's PRICE already assume? The answer is judged
 * against the company's own history, so the market's expectation stops being
 * invisible.
 */
export function ReverseDcfSection({ data }: ReverseDcfSectionProps) {
  if (!data || !data.applicable) return null;

  const solved = data.status === "solved" && data.impliedGrowth != null;
  const gap =
    solved && data.historicalGrowth != null ? data.impliedGrowth! - data.historicalGrowth : null;
  const demanding = gap != null && gap > 0.05;

  return (
    <section className="animate-fade-up">
      <header className="mb-5">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">Reverse DCF</h2>
        <p className="text-[0.7rem] font-mono text-white/40 mt-1.5">Price used: ${data.priceUsed.toFixed(2)}</p>
        <DefinitionLink number={193} prominent className="mt-3">How market-implied growth works</DefinitionLink>
      </header>

      <div className="panel-soft p-5">
        {solved ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded-sm px-2.5 py-2 border border-gold/40 bg-gold/[0.06]">
                <p className="text-[0.65rem] uppercase tracking-wider text-white/40">Growth the price implies</p>
                <p className="font-mono text-lg text-gold mt-0.5">{pct(data.impliedGrowth)}</p>
              </div>
              <div className="rounded-sm px-2.5 py-2 border border-gold/10 bg-white/[0.015]">
                <p className="text-[0.65rem] uppercase tracking-wider text-white/40">The company's history</p>
                <p className="font-mono text-lg text-white/85 mt-0.5">{pct(data.historicalGrowth)}</p>
              </div>
              <div className="rounded-sm px-2.5 py-2 border border-gold/10 bg-white/[0.015]">
                <p className="text-[0.65rem] uppercase tracking-wider text-white/40">Base forecast uses</p>
                <p className="font-mono text-lg text-white/85 mt-0.5">{pct(data.baseGrowth)}</p>
              </div>
              <div className="rounded-sm px-2.5 py-2 border border-gold/10 bg-white/[0.015]">
                <p className="text-[0.65rem] uppercase tracking-wider text-white/40">Expectation gap</p>
                <p
                  className={cn(
                    "font-mono text-lg mt-0.5",
                    gap == null ? "text-white/50" : demanding ? "text-loss-strong" : "text-gain-strong",
                  )}
                >
                  {gap == null ? "n/a" : `${gap >= 0 ? "+" : ""}${(gap * 100).toFixed(1)}pp`}
                </p>
              </div>
            </div>
            {data.beyondModelCap && (
              <p className="text-[0.78rem] font-mono text-loss-strong mt-3 inline-flex items-center gap-2">
                <FlipHorizontal2 className="w-3.5 h-3.5" /> The implied rate sits above the forward
                model's own 25% growth cap.
              </p>
            )}
            {data.multipleRoots && data.roots && (
              <p className="text-[0.72rem] font-mono text-white/45 mt-2">
                Other roots: {data.roots.map((r) => pct(r, 0)).join(", ")}
              </p>
            )}
          </>
        ) : (
          <div className="rounded-sm px-3 py-2.5 border border-gold/25 bg-gold/[0.04]">
            <p className="font-mono text-[0.8rem] text-gold">
              {data.status === "below_band" ? "Price below every modeled path" : "Price above every modeled path"}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
