import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Plus, RefreshCw, RotateCcw, TrendingUp, Wallet } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { fetchFxRates, fetchQuotes, type FxRates, type LiveQuote } from "../../lib/api";
import { useApiHealth } from "../../lib/useApiHealth";
import {
  STARTING_CASH,
  quotesByTicker,
  valuePortfolio,
  formatUsd,
  formatSignedUsd,
  formatSignedPct,
  formatShares,
  formatLocalPrice,
  gainLossClass,
  type SimPositionInput,
} from "../../lib/simulator";
import { cn } from "../../lib/cn";
import { TradeTicket } from "./TradeTicket";

const EMPTY_FX: FxRates = { rates: { USD: 1 }, asof: null };

// Donut palette: gold lead, then gain/loss-adjacent tones, cash muted last.
const SLICE_COLORS = ["#c9a84c", "#d9b85c", "#7fb87c", "#6f9fce", "#b98fcf", "#c87672", "#a98e3a"];
const CASH_COLOR = "rgba(255,255,255,0.18)";

export function PortfolioDashboard() {
  const { status } = useApiHealth();
  const backendOffline = status === "offline";

  const portfolio = useQuery(api.simulator.getPortfolio, {});
  const positions = useQuery(api.simulator.getPositions, {});
  const trades = useQuery(api.simulator.getTrades, { limit: 15 });
  const navHistory = useQuery(api.simulator.getNavHistory, {});
  const recordNavSnapshot = useMutation(api.simulator.recordNavSnapshot);
  const resetPortfolio = useMutation(api.simulator.resetPortfolio);

  const cashUsd = portfolio?.cashUsd ?? STARTING_CASH;

  const [quotes, setQuotes] = useState<LiveQuote[]>([]);
  const [fx, setFx] = useState<FxRates>(EMPTY_FX);
  const [refreshKey, setRefreshKey] = useState(0);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticketPrefill, setTicketPrefill] = useState<{ ticker?: string; side?: "buy" | "sell" }>({});
  const [confirmReset, setConfirmReset] = useState(false);
  const forceSnapshot = useRef(false);

  const positionInputs: SimPositionInput[] = useMemo(
    () =>
      (positions ?? []).map((p) => ({
        ticker: p.ticker,
        shares: p.shares,
        avgCostUsd: p.avgCostUsd,
        currency: p.currency,
      })),
    [positions],
  );

  // Stable key so the fetch effect only re-runs when holdings actually change.
  const positionsKey = useMemo(
    () => positionInputs.map((p) => `${p.ticker}:${p.shares}`).join(","),
    [positionInputs],
  );

  // Fetch FX + live quotes for held tickers; record a NAV snapshot off the fresh data.
  useEffect(() => {
    let active = true;
    const tickers = positionInputs.map((p) => p.ticker);
    (async () => {
      const [fxRes, quoteRes] = await Promise.all([fetchFxRates(), fetchQuotes(tickers)]);
      if (!active) return;
      setFx(fxRes);
      setQuotes(quoteRes);
      if (tickers.length > 0) {
        const v = valuePortfolio(positionInputs, quotesByTicker(quoteRes), fxRes.rates, cashUsd);
        void recordNavSnapshot({
          navUsd: v.navUsd,
          cashUsd: v.cashUsd,
          holdingsUsd: v.holdingsUsd,
          force: forceSnapshot.current,
        }).catch((err) => console.error("NAV snapshot failed", err));
      }
      forceSnapshot.current = false;
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionsKey, cashUsd, refreshKey]);

  const valuation = useMemo(
    () => valuePortfolio(positionInputs, quotesByTicker(quotes), fx.rates, cashUsd),
    [positionInputs, quotes, fx, cashUsd],
  );

  const heldShares = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of positionInputs) m[p.ticker] = p.shares;
    return m;
  }, [positionInputs]);

  const loading = positions === undefined || portfolio === undefined;
  const isEmpty = !loading && positionInputs.length === 0;

  function openTrade(prefill: { ticker?: string; side?: "buy" | "sell" } = {}) {
    setTicketPrefill(prefill);
    setTicketOpen(true);
  }

  async function doReset() {
    setConfirmReset(false);
    try {
      await resetPortfolio({});
      setQuotes([]);
      toast.success(`Portfolio reset to ${formatUsd(STARTING_CASH)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reset failed");
    }
  }

  return (
    <div className="space-y-6">
      {backendOffline && (
        <div className="panel-soft border-loss/30 px-4 py-3 text-sm text-loss-strong">
          The price API is offline, so trading is paused. Start the FastAPI backend on port 8000 to trade.
          Your holdings and lessons still work.
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          label="Portfolio value"
          value={formatUsd(valuation.navUsd)}
          sub={`${formatSignedPct(valuation.totalReturnPct)} all time`}
          subClass={gainLossClass(valuation.totalReturnPct)}
          accent
        />
        <Kpi label="Cash" value={formatUsd(valuation.cashUsd)} sub="Buying power" />
        <Kpi
          label="Holdings"
          value={formatUsd(valuation.holdingsUsd)}
          sub={`${positionInputs.length} ${positionInputs.length === 1 ? "position" : "positions"}`}
        />
        <Kpi
          label="Unrealized P&L"
          value={formatSignedUsd(valuation.totalUnrealizedUsd)}
          valueClass={gainLossClass(valuation.totalUnrealizedUsd)}
          sub="Versus cost basis"
        />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => openTrade({ side: "buy" })}
          disabled={backendOffline}
          className={cn("btn-gold", backendOffline && "opacity-50 cursor-not-allowed")}
          data-tour="sim-trade"
        >
          <Plus className="w-4 h-4" />
          Trade
        </button>
        <button onClick={() => setRefreshKey((k) => k + 1)} className="btn-outline" disabled={backendOffline}>
          <RefreshCw className="w-4 h-4" />
          Refresh prices
        </button>
        {valuation.hasUnpriced && (
          <span className="text-xs text-white/40">Some holdings could not be priced and show at cost.</span>
        )}
        <div className="ml-auto">
          {confirmReset ? (
            <span className="inline-flex items-center gap-2 text-sm">
              <span className="text-white/60">Reset to {formatUsd(STARTING_CASH)}?</span>
              <button onClick={doReset} className="btn-outline text-xs">
                Yes, reset
              </button>
              <button onClick={() => setConfirmReset(false)} className="btn-ghost text-xs">
                Cancel
              </button>
            </span>
          ) : (
            <button onClick={() => setConfirmReset(true)} className="btn-ghost text-xs">
              <RotateCcw className="w-3.5 h-3.5" />
              Reset account
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="panel p-10 text-center text-white/40">Loading your portfolio…</div>
      ) : isEmpty ? (
        <EmptyState onTrade={() => openTrade({ side: "buy" })} disabled={backendOffline} />
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <HoldingsTable valuation={valuation} onSell={(t) => openTrade({ ticker: t, side: "sell" })} />
            </div>
            <AllocationCard valuation={valuation} />
          </div>
          <EquityCurve navHistory={navHistory ?? []} />
          <RecentTrades trades={trades ?? []} />
        </>
      )}

      <TradeTicket
        open={ticketOpen}
        onClose={() => setTicketOpen(false)}
        cashUsd={cashUsd}
        heldShares={heldShares}
        fx={fx}
        initialTicker={ticketPrefill.ticker}
        initialSide={ticketPrefill.side}
        onTraded={() => {
          forceSnapshot.current = true;
          setRefreshKey((k) => k + 1);
        }}
      />
    </div>
  );
}

// ── Pieces ────────────────────────────────────────────────────────────────────

function Kpi({
  label,
  value,
  sub,
  subClass,
  valueClass,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  subClass?: string;
  valueClass?: string;
  accent?: boolean;
}) {
  return (
    <div className={cn("panel p-4", accent && "border-gold/30")}>
      <p className="text-[0.65rem] uppercase tracking-[0.16em] text-white/40">{label}</p>
      <p className={cn("font-display text-2xl font-semibold mt-1", valueClass ?? "text-white")}>{value}</p>
      <p className={cn("text-xs mt-1", subClass ?? "text-white/40")}>{sub}</p>
    </div>
  );
}

function EmptyState({ onTrade, disabled }: { onTrade: () => void; disabled: boolean }) {
  return (
    <div className="panel p-10 text-center">
      <div className="w-12 h-12 rounded-sm bg-gold/10 text-gold flex items-center justify-center mx-auto mb-4">
        <Wallet className="w-6 h-6" strokeWidth={1.75} />
      </div>
      <h3 className="font-display text-2xl font-semibold text-white mb-2">
        You have {formatUsd(STARTING_CASH)} to practice with
      </h3>
      <p className="text-white/55 max-w-md mx-auto mb-5">
        Buy a broad index fund as your core, then test individual names and sectors against it. Nothing here
        is real money, so try the ideas you would not risk live.
      </p>
      <button onClick={onTrade} disabled={disabled} className={cn("btn-gold", disabled && "opacity-50 cursor-not-allowed")}>
        <Plus className="w-4 h-4" />
        Place your first trade
      </button>
      <p className="text-xs text-white/35 mt-4">
        Open a trade and choose <span className="text-white/55">Browse funds</span> for a catalog of 150+ verified
        index funds: the 11 sectors and their leveraged versions, stock indices, emerging markets, commodities,
        currencies, and bonds. Or search any stock, US or international.
      </p>
    </div>
  );
}

function HoldingsTable({
  valuation,
  onSell,
}: {
  valuation: ReturnType<typeof valuePortfolio>;
  onSell: (ticker: string) => void;
}) {
  return (
    <div className="panel overflow-hidden">
      <div className="px-5 py-3 border-b border-gold/10 flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-gold" />
        <h3 className="font-display text-base text-white">Holdings</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[0.65rem] uppercase tracking-[0.12em] text-white/35 border-b border-white/[0.06]">
              <th className="px-4 py-2.5 font-medium">Ticker</th>
              <th className="px-3 py-2.5 font-medium text-right">Shares</th>
              <th className="px-3 py-2.5 font-medium text-right">Last</th>
              <th className="px-3 py-2.5 font-medium text-right">Value</th>
              <th className="px-3 py-2.5 font-medium text-right">Weight</th>
              <th className="px-3 py-2.5 font-medium text-right">P&L</th>
              <th className="px-3 py-2.5 font-medium text-right"></th>
            </tr>
          </thead>
          <tbody>
            {valuation.positions.map((p) => {
              const weight = valuation.navUsd > 0 ? (p.marketValueUsd / valuation.navUsd) * 100 : 0;
              return (
                <tr key={p.ticker} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                  <td className="px-4 py-3 font-mono text-gold">
                    {p.ticker}
                    {p.currency !== "USD" && (
                      <span className="ml-1.5 text-[0.6rem] text-white/30">{p.currency}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-white/80">{formatShares(p.shares)}</td>
                  <td className="px-3 py-3 text-right font-mono text-white/70">
                    {p.priced ? formatLocalPrice(p.priceLocal, p.currency) : "—"}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-white/90">{formatUsd(p.marketValueUsd)}</td>
                  <td className="px-3 py-3 text-right font-mono text-white/55">{weight.toFixed(1)}%</td>
                  <td className={cn("px-3 py-3 text-right font-mono", gainLossClass(p.unrealizedUsd))}>
                    {p.unrealizedUsd != null ? (
                      <>
                        {formatSignedUsd(p.unrealizedUsd)}
                        <span className="block text-[0.7rem] opacity-80">{formatSignedPct(p.unrealizedPct)}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button onClick={() => onSell(p.ticker)} className="btn-ghost text-xs">
                      Sell
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AllocationCard({ valuation }: { valuation: ReturnType<typeof valuePortfolio> }) {
  const data = valuation.allocation.filter((s) => s.valueUsd > 0);
  return (
    <div className="panel p-5">
      <h3 className="font-display text-base text-white mb-3">Allocation</h3>
      {data.length === 0 ? (
        <p className="text-sm text-white/40 py-10 text-center">No holdings yet.</p>
      ) : (
        <>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="valueUsd"
                  nameKey="label"
                  innerRadius={48}
                  outerRadius={80}
                  paddingAngle={2}
                  stroke="none"
                  isAnimationActive={false}
                >
                  {data.map((slice, i) => (
                    <Cell
                      key={slice.label}
                      fill={slice.label === "Cash" ? CASH_COLOR : SLICE_COLORS[i % SLICE_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#15161a",
                    border: "1px solid rgba(201,168,76,0.25)",
                    borderRadius: 4,
                    fontSize: 12,
                  }}
                  formatter={(value, name) => [formatUsd(Number(value)), String(name)]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-3 space-y-1.5">
            {data.map((slice, i) => (
              <li key={slice.label} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-sm"
                    style={{
                      background: slice.label === "Cash" ? CASH_COLOR : SLICE_COLORS[i % SLICE_COLORS.length],
                    }}
                  />
                  <span className="text-white/70">{slice.label}</span>
                </span>
                <span className="font-mono text-white/50">{(slice.weight * 100).toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function EquityCurve({ navHistory }: { navHistory: Array<{ navUsd: number; takenAt: number }> }) {
  const data = navHistory.map((s) => ({
    t: new Date(s.takenAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    nav: s.navUsd,
  }));
  return (
    <div className="panel p-5">
      <h3 className="font-display text-base text-white mb-3">Portfolio value over time</h3>
      {data.length < 2 ? (
        <p className="text-sm text-white/40 py-10 text-center">
          The equity curve builds as you trade and revisit. Come back after a few sessions to see it grow.
        </p>
      ) : (
        <div className="h-64 -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 12, right: 24, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="t" axisLine={false} tickLine={false} minTickGap={32} />
              <YAxis
                axisLine={false}
                tickLine={false}
                width={64}
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{
                  background: "#15161a",
                  border: "1px solid rgba(201,168,76,0.25)",
                  borderRadius: 4,
                  fontSize: 12,
                }}
                formatter={(value) => [formatUsd(Number(value)), "Value"]}
              />
              <Line type="monotone" dataKey="nav" stroke="#c9a84c" strokeWidth={1.8} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function RecentTrades({
  trades,
}: {
  trades: Array<{ _id: string; ticker: string; side: "buy" | "sell"; shares: number; priceUsd: number; executedAt: number }>;
}) {
  if (trades.length === 0) return null;
  return (
    <div className="panel p-5">
      <h3 className="font-display text-base text-white mb-3">Recent trades</h3>
      <ul className="divide-y divide-white/[0.05]">
        {trades.map((t) => (
          <li key={t._id} className="flex items-center justify-between py-2 text-sm">
            <span className="flex items-center gap-3">
              <span
                className={cn(
                  "text-[0.6rem] uppercase font-semibold px-1.5 py-0.5 rounded-sm",
                  t.side === "buy" ? "bg-gain-ghost text-gain-strong" : "bg-loss-ghost text-loss-strong",
                )}
              >
                {t.side}
              </span>
              <span className="font-mono text-gold">{t.ticker}</span>
              <span className="text-white/50">{formatShares(t.shares)} @ {formatUsd(t.priceUsd)}</span>
            </span>
            <span className="font-mono text-white/35 text-xs">
              {new Date(t.executedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
