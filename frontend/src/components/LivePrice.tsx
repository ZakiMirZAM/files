import { useEffect, useState } from "react";
import { fetchQuote, type LiveQuote } from "../lib/api";
import { formatCurrency } from "../lib/format";
import { cn } from "../lib/cn";
import { CircleDashed, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";

const REFRESH_MS = 15 * 60 * 1000; // 15 minutes

interface LivePriceProps {
  ticker: string;
}

type Status = "loading" | "ok" | "not_found" | "error";

export function LivePrice({ ticker }: LivePriceProps) {
  const [quote, setQuote] = useState<LiveQuote | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [nextRefresh, setNextRefresh] = useState<number>(REFRESH_MS);
  // Bumped by manual refresh so the effect below re-runs, recreating the
  // interval, otherwise the countdown display and the real timer drift apart.
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch the quote, called on mount + every 15min + on manual refresh
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const result = await fetchQuote(ticker);
      if (cancelled) return;
      if (result.status === "ok") {
        setQuote(result.quote);
        setStatus("ok");
        setNextRefresh(REFRESH_MS);
      } else if (result.status === "not_found") {
        setStatus("not_found");
      } else {
        setStatus("error");
        setErrorMsg(result.message);
      }
    };
    setStatus("loading");
    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [ticker, refreshKey]);

  // 1-second countdown so user sees the timer ticking
  useEffect(() => {
    if (status !== "ok") return;
    const id = window.setInterval(() => {
      setNextRefresh((n) => Math.max(0, n - 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [status, quote]);

  const handleManualRefresh = () => setRefreshKey((k) => k + 1);

  // ─────────────────────── Loading / error states ───────────────────────
  if (status === "loading" && !quote) {
    return (
      <article className="panel p-6 md:p-8 mb-6 animate-fade-up">
        <div className="flex items-center gap-3 text-white/40">
          <CircleDashed className="w-4 h-4 animate-spin" />
          <p className="text-sm font-mono">Fetching live quote for {ticker}...</p>
        </div>
      </article>
    );
  }

  if (status === "not_found") {
    return (
      <article className="panel p-6 mb-6 animate-fade-up border-white/10">
        <p className="text-sm text-white/55">
          <span className="font-mono text-gold">{ticker}</span> isn't recognised by Yahoo Finance, so no live price is available. Historical financials from financials.db are still shown below.
        </p>
      </article>
    );
  }

  if (status === "error" || !quote) {
    return (
      <article className="panel p-6 mb-6 animate-fade-up border-loss/30">
        <p className="text-sm text-loss-strong">
          Live quote unavailable {errorMsg ? `(${errorMsg})` : ""}. Historical analysis below is still based on real data from financials.db.
        </p>
      </article>
    );
  }

  // ─────────────────────── Main quote panel ───────────────────────
  const positive = (quote.dayChange ?? 0) >= 0;
  const trendIcon = positive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />;
  const trendColor = positive ? "text-gain-strong" : "text-loss-strong";

  const fetchedAt = new Date(quote.fetchedAt);
  const minsUntilRefresh = Math.floor(nextRefresh / 60_000);
  const secsUntilRefresh = Math.floor((nextRefresh % 60_000) / 1000);

  return (
    <article className="panel p-6 md:p-8 mb-6 animate-fade-up">
      <header className="flex items-start justify-between mb-5 pb-4 border-b border-gold/10 flex-wrap gap-3">
        <div>
          <p className="eyebrow mb-1 inline-flex items-center gap-2">
            <span className="inline-flex w-1.5 h-1.5 rounded-full bg-gain animate-pulse" />
            Live · Yahoo Finance · {quote.exchange ?? "n/a"}
          </p>
          <h2 className="font-display text-2xl md:text-3xl font-semibold text-white mt-1">
            {ticker} <span className="text-white/35 font-normal text-base">
              {quote.currency !== "USD" ? quote.currency : ""}
            </span>
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[0.7rem] font-mono text-white/40">
            updated {fetchedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · next in {String(minsUntilRefresh).padStart(2, "0")}:{String(secsUntilRefresh).padStart(2, "0")}
          </span>
          <button
            onClick={handleManualRefresh}
            className="btn-ghost p-1.5"
            title="Refresh quote now"
            disabled={status === "loading"}
          >
            <RefreshCw className={cn("w-3.5 h-3.5", status === "loading" && "animate-spin")} />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Big price */}
        <div className="lg:col-span-1">
          <p className="label mb-2">Last price</p>
          <div className="flex items-baseline gap-3">
            <p className="font-display text-5xl md:text-6xl font-semibold text-white tracking-tight">
              ${quote.price?.toFixed(2)}
            </p>
            <span className={cn("inline-flex items-center gap-1.5 text-sm font-mono", trendColor)}>
              {trendIcon}
              {positive ? "+" : ""}
              {quote.dayChange?.toFixed(2)} ({positive ? "+" : ""}
              {quote.dayChangePct?.toFixed(2)}%)
            </span>
          </div>
          <p className="text-xs text-white/45 mt-2 font-mono">
            prev close ${quote.previousClose?.toFixed(2)}
          </p>
        </div>

        {/* Day range */}
        <div className="lg:col-span-1">
          <p className="label mb-2">Today's range</p>
          <Range low={quote.dayLow} high={quote.dayHigh} current={quote.price} />
        </div>

        {/* 52-week range */}
        <div className="lg:col-span-1">
          <p className="label mb-2">52-week range</p>
          <Range low={quote.yearLow} high={quote.yearHigh} current={quote.price} />
        </div>
      </div>

      {/* Footer stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-5 border-t border-gold/10">
        <Stat label="Market cap" value={
          quote.marketCap !== null ? formatCurrency(quote.marketCap) : "n/a"
        } />
        <Stat label="Volume" value={
          quote.volume !== null ? quote.volume.toLocaleString() : "n/a"
        } />
        <Stat label="Day high" value={
          quote.dayHigh !== null ? `$${quote.dayHigh.toFixed(2)}` : "n/a"
        } />
        <Stat label="Day low" value={
          quote.dayLow !== null ? `$${quote.dayLow.toFixed(2)}` : "n/a"
        } />
      </div>
    </article>
  );
}

function Range({
  low, high, current,
}: { low: number | null; high: number | null; current: number | null }) {
  if (low === null || high === null) {
    return <p className="text-white/40 text-sm">n/a</p>;
  }
  const pct = current !== null && high > low
    ? Math.max(0, Math.min(100, ((current - low) / (high - low)) * 100))
    : 0;
  return (
    <div>
      <div className="relative h-2 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-gold border-2 border-ink-800 shadow-gold"
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between mt-2 text-xs font-mono">
        <span className="text-white/55">${low.toFixed(2)}</span>
        <span className="text-white/55">${high.toFixed(2)}</span>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="label">{label}</p>
      <p className="font-mono text-sm text-gold mt-1">{value}</p>
    </div>
  );
}
