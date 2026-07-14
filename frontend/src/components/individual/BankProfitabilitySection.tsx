import type { BankProfitability } from "../../lib/types";

interface BankProfitabilitySectionProps {
  bankProfitability?: BankProfitability | null;
}

const rate = (v: number | null | undefined, d = 2): string =>
  v == null ? "n/a" : `${(v * 100).toFixed(d)}%`;

const bn = (v: number | null | undefined): string => {
  if (v == null) return "n/a";
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toFixed(0)}`;
};

/**
 * Net interest margin and the interest spread that drives bank profitability
 *. NIM = net interest income ÷ average
 * assets = asset yield − funding cost. Only renders for spread-based lenders.
 */
export function BankProfitabilitySection({ bankProfitability: bp }: BankProfitabilitySectionProps) {
  if (!bp || !bp.applicable) return null;
  const trend = bp.nimTrend ?? [];
  const maxNim = Math.max(0.0001, ...trend.map((r) => r.nim));

  return (
    <section className="animate-fade-up">
      <header className="mb-5">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">Net Interest Margin</h2>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Spread breakdown */}
        <div className="lg:col-span-2 space-y-4">
          <div className="panel-soft p-5">
            <p className="eyebrow mb-4">Latest Spread</p>
            <div className="flex items-baseline justify-between mb-3">
              <span className="text-white/55 text-xs">Net interest margin</span>
              <span className="font-display text-3xl font-semibold text-gold">{rate(bp.netInterestMargin)}</span>
            </div>
            <dl className="space-y-2 text-sm mt-3">
              <Row label="Asset yield (interest income / assets)" value={rate(bp.assetYield)} />
              <Row label="− Funding cost (interest expense / assets)" value={rate(bp.fundingCost)} />
              <Row label="Net interest income" value={bn(bp.netInterestIncome)} />
              <Row label="Interest income / revenue" value={rate(bp.interestIncomeToRevenue)} />
            </dl>
          </div>
        </div>

        {/* NIM trend */}
        <div className="lg:col-span-3 panel-soft p-5">
          <p className="eyebrow mb-4">Net Interest Margin, history</p>
          {trend.length > 0 ? (
            <div className="flex items-end gap-1.5 h-40">
              {trend.map((r) => (
                <div key={r.year} className="flex-1 flex flex-col items-center justify-end h-full">
                  <span className="text-[0.65rem] font-mono text-white/70 mb-1">{(r.nim * 100).toFixed(1)}</span>
                  <div
                    className="w-full bg-gold/70 rounded-t-sm transition-all"
                    style={{ height: `${Math.max(2, (r.nim / maxNim) * 100)}%` }}
                    title={`${r.year}: NIM ${(r.nim * 100).toFixed(2)}% · yield ${(r.assetYield * 100).toFixed(2)}% · cost ${(r.fundingCost * 100).toFixed(2)}%`}
                  />
                  <span className="text-[0.65rem] font-mono text-white/40 mt-1">{`'${String(r.year).slice(2)}`}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-white/45">No NIM history available.</p>
          )}
        </div>
      </div>
    </section>
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
