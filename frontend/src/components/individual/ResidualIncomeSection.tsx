import type { ResidualIncome } from "../../lib/types";
import { cn } from "../../lib/cn";
import { DefinitionLink } from "./DefinitionsBlock";

interface ResidualIncomeSectionProps {
  residualIncome?: ResidualIncome | null;
}

const ps = (v: number | null | undefined): string => (v == null ? "n/a" : `$${v.toFixed(3)}`);
const rate = (v: number | null | undefined, d = 3): string => (v == null ? "n/a" : `${(v * 100).toFixed(d)}%`);
const x = (v: number | null | undefined): string => (v == null ? "n/a" : `${v.toFixed(3)}x`);

/**
 * Residual-income (excess-return) equity valuation + justified P/B-vs-ROE anchor.
 * The correct intrinsic model for Financials/REITs, where the FCFF firm model is
 * disabled. RIₜ = (ROE − Ke) × BVPSₜ₋₁ ; V = BVPS₀ + Σ PV(RI). Justified P/B =
 * (ROE − g)/(Ke − g).
 */
export function ResidualIncomeSection({ residualIncome: ri }: ResidualIncomeSectionProps) {
  if (!ri) return null;

  if (!ri.applicable) {
    return (
      <section className="animate-fade-up">
        <SectionHead recommended={false} />
        <div className="panel-soft p-5 text-sm text-white/55">
          {ri.reason ?? "Residual income could not be computed for this company."}
          {ri.actualPB != null && (
            <span className="ml-2 font-mono text-white/70">Actual P/B {x(ri.actualPB)}.</span>
          )}
        </div>
      </section>
    );
  }

  const mos = ri.marginOfSafety;
  const mosColor =
    mos == null ? "text-white/50"
    : mos >= 0.25 ? "text-gain-strong"
    : mos >= 0 ? "text-gain"
    : mos >= -0.25 ? "text-gold"
    : "text-loss-strong";

  const pb = ri.pbVsRoe;
  const cheap = pb?.verdict === "cheap vs ROE";

  return (
    <section className="animate-fade-up">
      <SectionHead recommended={!!ri.recommended} />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Bridge + P/B–ROE anchor */}
        <div className="lg:col-span-2 space-y-4">
          <div className="panel-soft p-5">
            <p className="eyebrow mb-4">Valuation Bridge (per share)</p>
            <dl className="space-y-2 text-sm">
              <BridgeRow label="Book value / share (BVPS₀)" value={ps(ri.bvps0)} />
              <BridgeRow label="+ PV of residual income" value={ps(sumPv(ri))} />
              <BridgeRow label="+ PV terminal RI" value={ps(ri.pvTerminal)} />
              <div className="pt-1 mt-2 flex items-baseline justify-between">
                <span className="text-white/55 text-xs">RI intrinsic / share</span>
                <span className="font-display text-2xl font-semibold text-gold">{ps(ri.intrinsicPerShare)}</span>
              </div>
              <BridgeRow label="Current price" value={ps(ri.currentPrice)} />
              <div className="flex items-baseline justify-between">
                <span className="text-white/55 text-xs">Margin of safety</span>
                <span className={cn("font-mono text-base", mosColor)}>
                  {mos == null ? "n/a" : `${mos >= 0 ? "+" : ""}${(mos * 100).toFixed(3)}%`}
                </span>
              </div>
            </dl>
          </div>

          {/* P/B vs ROE anchor */}
          <div className="panel-soft p-5">
            <p className="eyebrow mb-3">P/B vs ROE anchor</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Stat k="ROE (used)" v={rate(pb?.roe ?? ri.roeUsed)} />
              <Stat k="Cost of equity" v={rate(pb?.costOfEquity ?? ri.costOfEquity)} />
              <Stat k="Justified P/B" v={x(ri.justifiedPB)} />
              <Stat k="Actual P/B" v={x(ri.actualPB)} />
            </div>
            <div className="mt-3 space-y-1.5">
              <Stat k="Fair value at justified multiple" v={ps(ri.fairValueSingleStage)} />
              {pb?.verdict && (
                <p className={cn("text-xs font-medium", cheap ? "text-gain-strong" : "text-loss-strong")}>{pb.verdict}</p>
              )}
            </div>
          </div>
        </div>

        {/* Projection table */}
        <div className="lg:col-span-3 panel-soft p-5">
          <p className="eyebrow mb-4">Projected Residual Income (per share)</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <Stat k="Ke" v={rate(ri.costOfEquity)} />
            <Stat k="ROE current" v={rate(ri.roeCurrent)} />
            <Stat k="Retention" v={rate(ri.retention)} />
            <Stat k="Terminal g" v={rate(ri.growthTerminal)} />
          </div>
          {ri.rows && ri.rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="border-collapse text-sm w-full" style={{ minWidth: 420 }}>
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-ink-800 text-left px-3 py-2 border-b border-r border-gold/15 min-w-[120px]">
                      <span className="label">Line</span>
                    </th>
                    {ri.rows.map((r) => (
                      <th key={r.year} className="px-2.5 py-2 border-b border-gold/10 text-right min-w-[64px]">
                        <span className="text-[0.7rem] font-mono text-white/55">Y{r.year}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: "BVPS (begin)", get: (r: NonNullable<ResidualIncome["rows"]>[number]) => ps(r.bvpsBegin) },
                    { label: "− Equity charge", get: (r: NonNullable<ResidualIncome["rows"]>[number]) => ps(r.equityCharge) },
                    { label: "= Residual income", get: (r: NonNullable<ResidualIncome["rows"]>[number]) => ps(r.residualIncome) },
                    { label: "PV of RI", get: (r: NonNullable<ResidualIncome["rows"]>[number]) => ps(r.pv) },
                  ].map((sr) => (
                    <tr key={sr.label}>
                      <th className="sticky left-0 z-10 bg-ink-800 text-left px-3 py-1.5 border-b border-r border-white/[0.06] font-normal">
                        <span className="text-[0.8rem] text-white/75">{sr.label}</span>
                      </th>
                      {ri.rows!.map((r, i) => (
                        <td key={i} className="px-2.5 py-1.5 text-right border-b border-white/[0.05] tabular-nums font-mono text-[0.74rem] text-white/80">
                          {sr.get(r)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-white/45">No projection rows.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function sumPv(ri: ResidualIncome): number | null {
  if (!ri.rows || ri.rows.length === 0) return null;
  return ri.rows.reduce((acc, r) => acc + (r.pv ?? 0), 0);
}

function SectionHead({ recommended }: { recommended: boolean }) {
  return (
    <header className="mb-5">
      <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">
        Residual Income &amp; P/B–ROE {recommended && <span className="text-gold/70 text-lg">· recommended</span>}
      </h2>
      <DefinitionLink number={73} prominent className="mt-3">How residual income and justified P/B work</DefinitionLink>
    </header>
  );
}

function BridgeRow({ label, value }: { label: string; value: string }) {
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
