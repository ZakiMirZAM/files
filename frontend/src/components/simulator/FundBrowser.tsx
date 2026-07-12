import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { FUND_GROUPS, type Fund, type FundLeverage } from "../../lib/fundCatalog";
import { cn } from "../../lib/cn";

interface FundBrowserProps {
  /** Called with the chosen ticker; the ticket then loads its live quote. */
  onPick: (ticker: string) => void;
}

/** Small coloured pill for a leveraged or inverse fund. */
export function LeverageBadge({ leverage }: { leverage: FundLeverage }) {
  if (!leverage) return null;
  const inverse = leverage.startsWith("-");
  return (
    <span
      className={cn(
        "text-[0.6rem] font-semibold px-1.5 py-0.5 rounded-sm font-mono shrink-0",
        inverse ? "bg-loss-ghost text-loss-strong" : "bg-gold-ghost text-gold",
      )}
      title={inverse ? "Inverse (bear) daily fund" : "Leveraged daily fund"}
    >
      {leverage}
    </span>
  );
}

export function FundBrowser({ onPick }: FundBrowserProps) {
  const [filter, setFilter] = useState("");
  const [openCats, setOpenCats] = useState<Set<string>>(new Set([FUND_GROUPS[0]?.category]));

  const q = filter.trim().toUpperCase();
  const filtering = q.length > 0;

  const groups = useMemo(() => {
    if (!filtering) return FUND_GROUPS;
    return FUND_GROUPS.map((g) => ({
      ...g,
      funds: g.funds.filter(
        (f) => f.ticker.includes(q) || f.name.toUpperCase().includes(q),
      ),
    })).filter((g) => g.funds.length > 0);
  }, [q, filtering]);

  function toggle(cat: string) {
    setOpenCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  return (
    <div>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter funds (e.g. gold, treasury, TECL)"
          className="field w-full pl-9"
        />
      </div>

      <div className="max-h-[22rem] overflow-y-auto pr-1 space-y-2">
        {groups.map((g) => {
          const isOpen = filtering || openCats.has(g.category);
          return (
            <div key={g.category} className="panel-soft overflow-hidden">
              <button
                onClick={() => toggle(g.category)}
                className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-white/[0.02]"
              >
                <span className="flex items-center gap-2">
                  <span className="font-display text-sm text-white">{g.label}</span>
                  <span className="font-mono text-[0.65rem] text-white/35">{g.funds.length}</span>
                </span>
                {!filtering && (
                  <ChevronDown className={cn("w-4 h-4 text-white/40 transition-transform", isOpen && "rotate-180")} />
                )}
              </button>
              {isOpen && (
                <>
                  <p className="px-3.5 pb-2 text-[0.72rem] text-white/40 leading-snug">{g.blurb}</p>
                  <ul className="pb-2">
                    {g.funds.map((f: Fund) => (
                      <li key={f.ticker}>
                        <button
                          onClick={() => onPick(f.ticker)}
                          className="w-full flex items-center gap-3 px-3.5 py-2 hover:bg-white/[0.04] text-left"
                        >
                          <span className="font-mono text-gold w-16 shrink-0">{f.ticker}</span>
                          <span className="text-xs text-white/60 flex-1 truncate">{f.name}</span>
                          <LeverageBadge leverage={f.leverage} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          );
        })}
        {groups.length === 0 && (
          <p className="text-sm text-white/40 py-6 text-center">No funds match "{filter}".</p>
        )}
      </div>
    </div>
  );
}
