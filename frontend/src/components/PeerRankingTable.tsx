// The per-ticker value ranking, the one block on two pages.
//
// The Comparative page shows it whole, with the four exposure figures appended
// as an extra column group. The Company page shows the same table, collapsed
// until the reader opens it, with that company's row marked and a toggle down
// to its strategic group. Both go through this one component, under one cache
// key, so the two cannot drift apart.
//
// Nothing is fetched until the reader opens the block. It used to prefetch as
// soon as it came near the viewport, which on the company page meant every
// reader who scrolled past paid for it: one large industry's ranking is about
// ten megabytes of JSON.

import { useEffect, useId, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { CompanyScorecardTable } from "./CompanyScorecardTable";
import { MatrixSkeleton } from "./Skeletons";
import { PanelLoadError } from "./DataStatusBanner";
import { PEER_RANKING } from "../lib/connectionsCopy";
import type { ConnectionsData } from "../lib/connectionsTypes";
import { connectionsCacheKey, connectionsQuery, rivalsCacheKey } from "../lib/api";
import {
  groupTickers,
  rankingCacheKey,
  rankingPath,
  withExposureColumns,
  withOnlyTickers,
  type PeerGroupRivals,
} from "../lib/peerRanking";
import { withRoicWaccSpread } from "../lib/sectorMetrics";
import { resolveComparativeDef } from "../lib/surfaceDefinitions";
import type { SectorMetricsData } from "../lib/types";
import {
  API_BASE,
  EndpointError,
  SLOW_ROUTE_TIMEOUT_MS,
  forgetResource,
  getJson,
  loadResource,
  useResource,
} from "../lib/useResource";
import { cn } from "../lib/cn";

interface PeerRankingTableProps {
  industry: string;
  /** The gold eyebrow over the block. */
  heading: string;
  /** Start closed and fetch nothing until the reader opens it. A cold ranking
   *  call takes several seconds, the payload is large, and the company page is
   *  already long. */
  collapsible?: boolean;
  /** Mark this company's row, and offer the strategic group toggle. Must be the
   *  symbol the BACKEND answered under: an alias route (/GOOGL, /BRK.B) is
   *  folded onto its primary listing, and the raw route ticker matches no row. */
  highlightTicker?: string;
  /** Append the four exposure figures as one extra column group. */
  withExposures?: boolean;
}

/** What a reader is told did not load, when it does not. */
const WHAT = "value ranking";

/** The company page each row links to. Hoisted so the memoised table below is
 *  handed the same function on every render: it is otherwise rebuilt on every
 *  keystroke in the market-cap filter, and rebuilding its ~27,000 cells
 *  measures around a third of a second. */
const rowHref = (ticker: string) => `/app/individual/${encodeURIComponent(ticker)}`;

type Status = "idle" | "loading" | "ready" | "empty" | "error";

/** One 404 from the ranking route means the filters left nothing to rank. */
function isEmpty(err: unknown): boolean {
  return err instanceof EndpointError && err.status === 404;
}

export function PeerRankingTable({
  industry,
  heading,
  collapsible = false,
  highlightTicker,
  withExposures = false,
}: PeerRankingTableProps) {
  const [open, setOpen] = useState(!collapsible);
  const instanceId = useId();

  // Filters, exactly as the Comparative page has always had them.
  const [developed, setDeveloped] = useState(false);
  const [minMcapInput, setMinMcapInput] = useState("");
  const [minMcap, setMinMcap] = useState<number | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const n = parseFloat(minMcapInput);
      setMinMcap(Number.isFinite(n) && n > 0 ? n : null);
    }, 400);
    return () => clearTimeout(t);
  }, [minMcapInput]);

  const [groupOnly, setGroupOnly] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const [data, setData] = useState<SectorMetricsData | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  const ticker = highlightTicker?.toUpperCase();
  const cacheKey = rankingCacheKey(industry, { developed, minMcap });

  // The ranking itself, under the key the cross-stage block already uses. It
  // keeps its own state rather than going through useResource because a 404
  // here is not a failure: it means the filters left nothing to rank, which is
  // its own line rather than the load-error panel.
  useEffect(() => {
    if (!open || !industry) return;
    let active = true;
    setStatus("loading");
    setData(null);
    loadResource<SectorMetricsData>(
      cacheKey,
      (signal) => getJson(`${API_BASE}${rankingPath(industry, { developed, minMcap })}`, WHAT, signal),
      undefined,
      SLOW_ROUTE_TIMEOUT_MS,
    ).then(
      (payload) => {
        if (!active) return;
        setData(payload);
        setStatus("ready");
      },
      (err: unknown) => {
        if (!active) return;
        setStatus(isEmpty(err) ? "empty" : "error");
      },
    );
    return () => {
      active = false;
    };
  }, [open, industry, developed, minMcap, cacheKey, attempt]);

  // The exposure figures, Comparative only. A failure leaves the group absent,
  // so the error the hook reports is deliberately not read.
  const exposureData = useResource<ConnectionsData>(
    open && withExposures && industry ? connectionsCacheKey({ industry }) : null,
    (signal) =>
      getJson(
        `${API_BASE}/api/connections?${connectionsQuery({ industry })}`,
        "exposure figures",
        signal,
      ),
    { timeoutMs: SLOW_ROUTE_TIMEOUT_MS },
  ).data;
  const exposures: ConnectionsData["exposures"] = exposureData?.exposures ?? null;

  // The company's strategic group, company page only. A failure hides the
  // toggle rather than offering one that would filter to nothing.
  const rivals = useResource<PeerGroupRivals>(
    open && ticker ? rivalsCacheKey(ticker) : null,
    (signal) =>
      getJson(
        `${API_BASE}/api/individual/${encodeURIComponent(ticker as string)}/rivals`,
        "strategic group",
        signal,
      ),
    { timeoutMs: SLOW_ROUTE_TIMEOUT_MS },
  ).data;

  const group = useMemo(
    () => (ticker ? groupTickers(rivals, ticker) : null),
    [rivals, ticker],
  );

  const view = useMemo(() => {
    if (!data) return null;
    const spread = withRoicWaccSpread(data);
    const merged = withExposures ? withExposureColumns(spread, exposures) : spread;
    return groupOnly && group ? withOnlyTickers(merged, group) : merged;
  }, [data, exposures, withExposures, groupOnly, group]);

  // The ticker is missing from the ranked set when the filters exclude it, or
  // when it has no stored beta. The payload gives no reason, so the line states
  // what the ranking covers instead of guessing.
  const notRanked =
    status === "ready" && !!ticker && !!data && !data.sectors.some((t) => t.toUpperCase() === ticker);

  const expanded = !collapsible || open;
  const bodyId = `peer-ranking-${industry.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  // The switch's only child is its knob, so it needs the label beside it named
  // explicitly: a wrapping <label> gives an accessible name to form controls,
  // not to a button playing a switch.
  const developedLabelId = `${instanceId}-developed`;

  // A failed load must not be re-served from the cache, the way useResource's
  // own retry drops its key before asking again.
  const retry = () => {
    forgetResource(cacheKey);
    setAttempt((n) => n + 1);
  };

  const filters = (
    <div className="flex items-center gap-4 flex-wrap">
      {group && (
        <div className="inline-flex rounded-sm border border-gold/15 overflow-hidden shrink-0">
          <button
            type="button"
            aria-pressed={!groupOnly}
            onClick={() => setGroupOnly(false)}
            className={cn(
              "px-2.5 py-1 text-[0.65rem] font-mono uppercase tracking-wider transition-colors",
              groupOnly ? "text-white/50 hover:text-gold" : "text-gold",
            )}
          >
            {PEER_RANKING.wholeIndustry}
          </button>
          <button
            type="button"
            aria-pressed={groupOnly}
            onClick={() => setGroupOnly(true)}
            className={cn(
              "px-2.5 py-1 text-[0.65rem] font-mono uppercase tracking-wider transition-colors border-l border-gold/15",
              groupOnly ? "text-gold" : "text-white/50 hover:text-gold",
            )}
          >
            {PEER_RANKING.groupOnly}
          </button>
        </div>
      )}
      <label className="inline-flex items-center gap-2 cursor-pointer select-none">
        <span id={developedLabelId} className="text-xs text-white/60">
          {PEER_RANKING.developedOnly}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={developed}
          aria-labelledby={developedLabelId}
          onClick={() => setDeveloped((v) => !v)}
          className={cn(
            "relative w-9 h-5 rounded-full transition-colors shrink-0",
            developed ? "bg-gold" : "bg-white/15",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-ink-900 transition-transform",
              developed && "translate-x-4",
            )}
          />
        </button>
      </label>
      <label className="inline-flex items-center gap-2">
        <span className="text-xs text-white/60">{PEER_RANKING.minMcap}</span>
        <span className="inline-flex items-center rounded-sm border border-gold/20 bg-ink-900 overflow-hidden">
          <input
            type="number"
            min={0}
            step={0.5}
            inputMode="decimal"
            value={minMcapInput}
            onChange={(e) => setMinMcapInput(e.target.value)}
            placeholder="0"
            aria-label="Minimum market cap in billions"
            className="w-16 bg-transparent px-2 py-1 text-sm text-white/85 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="px-2 py-1 text-xs text-white/40 font-mono border-l border-gold/15">
            {PEER_RANKING.billions}
          </span>
        </span>
      </label>
    </div>
  );

  const label = <span className="text-gold font-mono text-sm">{heading}</span>;

  return (
    <div>
      <div className="flex items-end justify-between gap-3 mb-3 flex-wrap">
        <div>
          {/* The heading owns the disclosure button, not the other way round: a
              button takes phrasing content, so an <h2> inside one is invalid. */}
          <h2 className="font-display text-xl font-semibold text-white">
            {collapsible ? (
              <button
                type="button"
                aria-expanded={open}
                aria-controls={bodyId}
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-3 text-left group"
              >
                <ChevronDown
                  className={cn(
                    "w-4 h-4 text-white/40 shrink-0 transition-transform duration-200 group-hover:text-gold",
                    open && "rotate-180 text-gold",
                  )}
                />
                {label}
              </button>
            ) : (
              <span className="flex items-center gap-3">{label}</span>
            )}
          </h2>
        </div>
        {expanded && filters}
      </div>

      {/* Always rendered, so aria-controls points at something that exists even
          while the block is shut. Empty until it is opened: this is where the
          fetch is paid for. */}
      <div id={bodyId} hidden={!expanded}>
        {expanded && (
          <>
            {notRanked && (
              <p className="text-[0.75rem] text-white/45 mb-3">{PEER_RANKING.notRanked}</p>
            )}
            {status === "error" ? (
              <PanelLoadError what={WHAT} onRetry={retry} />
            ) : status === "empty" ? (
              <p className="text-[0.8rem] text-white/45">{PEER_RANKING.noneAfterFilters}</p>
            ) : view ? (
              <CompanyScorecardTable
                data={view}
                getRowHref={rowHref}
                resolveDef={resolveComparativeDef}
                highlightTicker={ticker}
              />
            ) : (
              <MatrixSkeleton rows={10} cols={6} label={PEER_RANKING.loading} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
