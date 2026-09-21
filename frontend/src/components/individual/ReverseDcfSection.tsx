import type { ReverseDcf } from "../../lib/types";
import { formatPerShare } from "../../lib/format";
import { cn } from "../../lib/cn";
import { DefinitionLink } from "./DefinitionsBlock";
import { FlipHorizontal2 } from "lucide-react";

interface ReverseDcfSectionProps {
  data?: ReverseDcf | null;
}

const pct = (v: number | null | undefined, d = 3): string =>
  v == null ? "n/a" : `${(v * 100).toFixed(d)}%`;

/**
 * Reverse DCF (Penman, Accounting for Value Ch.4). The forward model asks what
 * the company is worth given assumptions. This section asks the opposite: what
 * yearly revenue growth does today's PRICE already assume? The answer is judged
 * against the company's own history, so the market's expectation stops being
 * invisible.
 */
export function ReverseDcfSection({ data }: ReverseDcfSectionProps) {
  if (!data) return null;

  // The inversion solves for growth against a PRICE, so when the price and the
  // model's per-ordinary-share value are different kinds of number there is
  // nothing to solve against. Saying so beats rendering nothing: the section
  // used to disappear, which left a reader wondering where it went.
  if (!data.applicable) {
    return (
      <section className="animate-fade-up">
        <header className="mb-5">
          <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">Reverse DCF</h2>
          <DefinitionLink number={193} prominent className="mt-3">How market-implied growth works</DefinitionLink>
        </header>
        <div className="panel-soft p-5">
          <p className="text-[0.95rem] leading-7 text-white/70">
            Not applicable.{data.reason ? ` ${data.reason}` : ""}
          </p>
        </div>
      </section>
    );
  }

  const solved = data.status === "solved" && data.impliedGrowth != null;
  const gap =
    solved && data.historicalGrowth != null ? data.impliedGrowth! - data.historicalGrowth : null;
  const demanding = gap != null && gap > 0.05;

  return (
    <section className="animate-fade-up">
      <header className="mb-5">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">Reverse DCF</h2>
        <p className="text-[0.7rem] font-mono text-white/40 mt-1.5">
          Price used: {formatPerShare(data.priceUsed)}
        </p>
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
                  {gap == null ? "n/a" : `${gap >= 0 ? "+" : ""}${(gap * 100).toFixed(3)}pp`}
                </p>
              </div>
            </div>
            {(data.beyondDiagnosticBand ?? data.beyondModelCap) && (
              <p className="text-[0.78rem] font-mono text-loss-strong mt-3 inline-flex items-center gap-2">
                <FlipHorizontal2 className="w-3.5 h-3.5" /> The implied rate sits above
                {data.diagnosticBandHigh != null
                  ? ` the ${(data.diagnosticBandHigh * 100).toFixed(0)}% growth companies at this life-cycle stage typically sustain.`
                  : " what companies at this stage typically sustain."}
              </p>
            )}
            {data.multipleRoots && data.roots && (
              <p className="text-[0.72rem] font-mono text-white/45 mt-2">
                Other roots: {data.roots.map((r) => pct(r, 3)).join(", ")}
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
