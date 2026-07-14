import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { Search, X, Loader2, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import {
  fetchQuote,
  searchTickers,
  type LiveQuote,
  type TickerHit,
  type FxRates,
} from "../../lib/api";
import {
  quoteToUsd,
  formatUsd,
  formatLocalPrice,
  formatShares,
} from "../../lib/simulator";
import { fundByTicker } from "../../lib/fundCatalog";
import { FundBrowser, LeverageBadge } from "./FundBrowser";
import { cn } from "../../lib/cn";

type Side = "buy" | "sell";

interface TradeTicketProps {
  open: boolean;
  onClose: () => void;
  cashUsd: number;
  /** ticker -> shares currently held, for validating sells and the max button. */
  heldShares: Record<string, number>;
  fx: FxRates;
  /** Prefill (e.g. clicking Sell on a holding row). */
  initialTicker?: string;
  initialSide?: Side;
  /** Called after a successful trade so the dashboard can force a NAV snapshot. */
  onTraded?: () => void;
}

type QuoteState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; quote: LiveQuote }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

export function TradeTicket({
  open,
  onClose,
  cashUsd,
  heldShares,
  fx,
  initialTicker,
  initialSide,
  onTraded,
}: TradeTicketProps) {
  const executeTrade = useMutation(api.simulator.executeTrade);

  const [pickerMode, setPickerMode] = useState<"search" | "browse">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TickerHit[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteState>({ kind: "idle" });
  const [side, setSide] = useState<Side>("buy");
  const [sharesStr, setSharesStr] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset / prefill whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setSharesStr("");
    setPickerMode("search");
    setSide(initialSide ?? "buy");
    if (initialTicker) {
      setSelected(initialTicker.toUpperCase());
      loadQuote(initialTicker.toUpperCase());
    } else {
      quoteReqId.current += 1; // invalidate any in-flight quote request
      setSelected(null);
      setQuote({ kind: "idle" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTicker, initialSide]);

  // Debounced ticker search.
  const searchTimer = useRef<number | null>(null);
  useEffect(() => {
    if (selected) return; // a name is chosen; stop searching
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    const q = query.trim();
    if (q.length < 1) {
      setResults([]);
      return;
    }
    searchTimer.current = window.setTimeout(async () => {
      const hits = await searchTickers(q);
      setResults(hits);
    }, 220);
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
  }, [query, selected]);

  // Monotonic id so a slow response for a previously selected ticker can never
  // overwrite the current ticker's quote (same guard as AiPanel's reqId check).
  const quoteReqId = useRef(0);

  async function loadQuote(ticker: string) {
    const reqId = ++quoteReqId.current;
    setQuote({ kind: "loading" });
    const res = await fetchQuote(ticker);
    if (reqId !== quoteReqId.current) return; // a newer request superseded this one; ignore
    if (res.status === "ok") setQuote({ kind: "ok", quote: res.quote });
    else if (res.status === "not_found") setQuote({ kind: "not_found" });
    else setQuote({ kind: "error", message: res.message });
  }

  function selectTicker(ticker: string) {
    const t = ticker.toUpperCase();
    setSelected(t);
    setQuery("");
    setResults([]);
    loadQuote(t);
  }

  function clearSelection() {
    quoteReqId.current += 1; // invalidate any in-flight quote request
    setSelected(null);
    setQuote({ kind: "idle" });
    setSharesStr("");
  }

  if (!open) return null;

  const held = selected ? heldShares[selected] ?? 0 : 0;
  const fund = selected ? fundByTicker(selected) : undefined;
  const liveQuote = quote.kind === "ok" ? quote.quote : null;
  const conv = liveQuote ? quoteToUsd(liveQuote, fx.rates) : null;
  const shares = Number(sharesStr);
  const sharesValid = Number.isFinite(shares) && shares > 0;
  const orderUsd = conv?.priceUsd != null && sharesValid ? conv.priceUsd * shares : null;

  const buyTooExpensive = side === "buy" && orderUsd != null && orderUsd > cashUsd + 1e-6;
  const sellTooMany = side === "sell" && sharesValid && shares > held + 1e-6;
  const priceMissing = conv?.priceUsd == null;

  const canSubmit =
    !submitting &&
    !!selected &&
    !!liveQuote &&
    !priceMissing &&
    sharesValid &&
    !buyTooExpensive &&
    !sellTooMany &&
    !(side === "sell" && held <= 0);

  async function submit() {
    if (!selected || !liveQuote || !conv || conv.priceUsd == null || !sharesValid) return;
    setSubmitting(true);
    try {
      await executeTrade({
        ticker: selected,
        side,
        shares,
        priceUsd: conv.priceUsd,
        priceLocal: conv.priceLocal ?? conv.priceUsd,
        currency: conv.currency,
        fxRate: conv.fxRate,
      });
      toast.success(
        `${side === "buy" ? "Bought" : "Sold"} ${formatShares(shares)} ${selected} at ${formatUsd(
          conv.priceUsd,
        )}`,
      );
      onTraded?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Trade failed");
    } finally {
      setSubmitting(false);
    }
  }

  function setMax() {
    if (side === "sell") {
      setSharesStr(held > 0 ? String(held) : "");
    } else if (conv?.priceUsd) {
      setSharesStr(String(Math.floor(cashUsd / conv.priceUsd)));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:pt-20 overflow-y-auto">
      <button aria-label="Close" className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative panel w-full max-w-lg p-6 shadow-2xl animate-fade-up"
        role="dialog"
        aria-modal="true"
        aria-label="Trade ticket"
        data-tour="sim-trade-ticket"
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="eyebrow mb-1">Paper trade</p>
            <h2 className="font-display text-2xl font-semibold text-white">Trade ticket</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-white/40 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Side toggle */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          {(["buy", "sell"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSide(s)}
              className={cn(
                "flex items-center justify-center gap-2 rounded-sm py-2.5 text-sm font-semibold border transition-colors capitalize",
                side === s
                  ? s === "buy"
                    ? "bg-gain-ghost border-gain/50 text-gain-strong"
                    : "bg-loss-ghost border-loss/50 text-loss-strong"
                  : "border-white/10 text-white/50 hover:text-white",
              )}
            >
              {s === "buy" ? <ArrowDownToLine className="w-4 h-4" /> : <ArrowUpFromLine className="w-4 h-4" />}
              {s}
            </button>
          ))}
        </div>

        {/* Ticker picker */}
        {!selected ? (
          <div className="mb-4">
            <div className="grid grid-cols-2 gap-2 mb-3">
              {(["search", "browse"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setPickerMode(m)}
                  className={cn(
                    "rounded-sm py-2 text-sm font-medium border transition-colors",
                    pickerMode === m
                      ? "border-gold/45 text-gold bg-gold/5"
                      : "border-white/10 text-white/50 hover:text-white",
                  )}
                >
                  {m === "search" ? "Search any symbol" : "Browse funds"}
                </button>
              ))}
            </div>

            {pickerMode === "search" ? (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search a symbol or company (e.g. VOO, TSM, 2330.TW)"
                  className="field w-full pl-9"
                />
                {results.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full panel max-h-64 overflow-y-auto py-1">
                    {results.map((hit) => (
                      <li key={hit.ticker}>
                        <button
                          onClick={() => selectTicker(hit.ticker)}
                          className="w-full text-left px-3 py-2 hover:bg-white/[0.04] flex items-center justify-between gap-3"
                        >
                          <span className="font-mono text-gold">{hit.ticker}</span>
                          <span className="text-xs text-white/50 truncate">{hit.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[0.72rem] text-white/35 mt-2">
                  International local-exchange tickers use a suffix, e.g. 2330.TW (Taiwan), 7203.T (Tokyo),
                  005930.KS (Korea).
                </p>
              </div>
            ) : (
              <FundBrowser onPick={selectTicker} />
            )}
          </div>
        ) : (
          <div className="mb-4">
            <div className="flex items-center justify-between panel-soft px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <span className="font-display text-xl text-white">{selected}</span>
                  {fund && <LeverageBadge leverage={fund.leverage} />}
                  {quote.kind === "loading" && <Loader2 className="w-4 h-4 animate-spin text-white/40" />}
                </div>
                {fund && <p className="text-xs text-white/45 mt-0.5 truncate">{fund.name}</p>}
              </div>
              <button onClick={clearSelection} className="btn-ghost text-xs shrink-0">
                Change
              </button>
            </div>

            {fund && fund.leverage && (
              <p className="mt-2 text-[0.72rem] text-amber-300/80 leading-snug">
                {fund.leverage.startsWith("-") ? "Inverse" : "Leveraged"} daily fund. It targets{" "}
                {fund.leverage} the index for a single day and decays over longer holds. See Lesson 3 before
                holding it.
              </p>
            )}

            {quote.kind === "ok" && conv && (
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <Stat label="Last price" value={formatLocalPrice(conv.priceLocal, conv.currency)} />
                <Stat
                  label="In USD"
                  value={conv.currency === "USD" ? "n/a" : formatUsd(conv.priceUsd)}
                />
                <Stat label={side === "sell" ? "Shares held" : "Buying power"} value={
                  side === "sell" ? formatShares(held) : formatUsd(cashUsd)
                } />
                <Stat
                  label="Day"
                  value={liveQuote?.dayChangePct != null ? `${liveQuote.dayChangePct.toFixed(2)}%` : "n/a"}
                />
              </div>
            )}

            {quote.kind === "not_found" && (
              <p className="mt-3 text-sm text-loss-strong">No live quote for {selected} on Yahoo Finance.</p>
            )}
            {quote.kind === "error" && (
              <p className="mt-3 text-sm text-loss-strong">
                Could not reach the price API. Is the backend running on port 8000?
              </p>
            )}
          </div>
        )}

        {/* Shares + submit */}
        {selected && quote.kind === "ok" && (
          <>
            <label className="block mb-1.5 text-[0.7rem] uppercase tracking-[0.16em] text-white/40">
              Shares
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="number"
                min="0"
                step="any"
                value={sharesStr}
                onChange={(e) => setSharesStr(e.target.value)}
                placeholder="0"
                className="field flex-1"
              />
              <button onClick={setMax} className="btn-outline text-xs whitespace-nowrap">
                Max
              </button>
            </div>

            <div className="flex items-center justify-between text-sm mb-4">
              <span className="text-white/45">Estimated {side === "buy" ? "cost" : "proceeds"}</span>
              <span className="font-mono text-white/90">{orderUsd != null ? formatUsd(orderUsd) : "n/a"}</span>
            </div>

            {buyTooExpensive && (
              <p className="text-sm text-loss-strong mb-3">Order exceeds your buying power of {formatUsd(cashUsd)}.</p>
            )}
            {sellTooMany && (
              <p className="text-sm text-loss-strong mb-3">You only hold {formatShares(held)} shares.</p>
            )}
            {side === "sell" && held <= 0 && (
              <p className="text-sm text-white/50 mb-3">You do not hold any {selected} to sell.</p>
            )}

            <button
              onClick={submit}
              disabled={!canSubmit}
              className={cn(
                "w-full justify-center",
                side === "buy" ? "btn-gold" : "btn-outline",
                !canSubmit && "opacity-50 cursor-not-allowed",
              )}
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                `${side === "buy" ? "Buy" : "Sell"} ${selected}`
              )}
            </button>
            <p className="text-[0.7rem] text-white/30 mt-3 text-center">
              Fills use the latest cached price (up to 15 min old). Practice money only.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel-soft px-3 py-2">
      <p className="text-[0.65rem] uppercase tracking-[0.14em] text-white/35">{label}</p>
      <p className="font-mono text-white/90 mt-0.5">{value}</p>
    </div>
  );
}
