// Relationship map for the Head to Head base company: read on load (no AI),
// built by Ask AI only when the reader clicks. Mount with key={ticker} so a
// base change resets state and stops any polling.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BUILD_BUTTON,
  BUILDING_TEXT,
  GROUP_ORDER,
  MAX_POLLS,
  POLL_MS,
  droppedText,
  footerText,
  groupCategories,
  isPending,
  isSuggestionGroup,
  linkDataLabel,
  requestRelationshipMap,
  safeHref,
  type MapLink,
  type RelationshipMapResponse,
} from "../lib/relationshipMap";

interface Props {
  ticker: string;
  companyName: string;
  /** Called with the map whenever it is ready, and with null otherwise. */
  onMap?: (map: RelationshipMapResponse | null) => void;
}

export function RelationshipMapPanel({ ticker, companyName, onMap }: Props) {
  const [map, setMap] = useState<RelationshipMapResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const polls = useRef(0);
  const alive = useRef(true);
  const onMapRef = useRef(onMap);
  onMapRef.current = onMap;

  const accept = useCallback((m: RelationshipMapResponse) => {
    if (!alive.current) return;
    setMap(m);
    onMapRef.current?.(m.status === "ready" ? m : null);
  }, []);

  // First read: GET only.
  useEffect(() => {
    alive.current = true;
    const ctl = new AbortController();
    onMapRef.current?.(null);
    requestRelationshipMap(ticker, { signal: ctl.signal })
      .then(accept)
      .catch((e: unknown) => {
        if (!ctl.signal.aborted && alive.current) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive.current = false;
      ctl.abort();
    };
  }, [ticker, accept]);

  // Poll every 15 s while building, at most 40 times; cleared on unmount.
  const status = map?.status;
  useEffect(() => {
    if (!isPending(status)) return;
    if (polls.current >= MAX_POLLS) {
      setGaveUp(true);
      return;
    }
    const ctl = new AbortController();
    const id = window.setTimeout(() => {
      polls.current += 1;
      requestRelationshipMap(ticker, { signal: ctl.signal })
        .then((m) => {
          // Same status again: bump a copy so this effect schedules the next poll.
          accept({ ...m });
        })
        .catch((e: unknown) => {
          if (!ctl.signal.aborted && alive.current) setError(e instanceof Error ? e.message : String(e));
        });
    }, POLL_MS);
    return () => {
      window.clearTimeout(id);
      ctl.abort();
    };
  }, [map, status, ticker, accept]);

  const build = async (refresh: boolean) => {
    setPosting(true);
    setError(null);
    polls.current = 0;
    setGaveUp(false);
    try {
      accept(await requestRelationshipMap(ticker, { method: "POST", refresh }));
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (alive.current) setPosting(false);
    }
  };

  return (
    <section className="panel p-4 mb-5" aria-labelledby={`relmap-${ticker}`}>
      <h3 id={`relmap-${ticker}`} className="font-display text-base font-semibold text-white mb-1">
        Relationship map for {companyName}
      </h3>
      <p className="text-sm text-white/55 leading-6 mb-3 max-w-3xl">
        Who competes with {companyName}, what could replace it, who it buys from and sells to, and who
        could move in.
      </p>

      <div aria-live="polite">
        {!map && !error && <p className="text-sm text-white/50">Checking for a saved map…</p>}
        {isPending(map?.status) && !gaveUp && <p className="text-sm text-white/70">{BUILDING_TEXT}</p>}
        {gaveUp && (
          <p className="text-sm text-white/60">The map is still being built. Come back to this page later.</p>
        )}
        {error && <p className="text-sm text-white/60">{error}</p>}
      </div>

      {(map?.status === "none" || map?.status === "failed") && (
        <div className="mt-2">
          {map.status === "failed" && map.error && (
            <p className="text-xs text-white/50 mb-2">The last build did not finish: {map.error}.</p>
          )}
          {map.reason && <p className="text-xs text-white/50 mb-2">{map.reason}.</p>}
          <button type="button" className="btn-outline text-sm" onClick={() => build(false)} disabled={posting}>
            {BUILD_BUTTON}
          </button>
        </div>
      )}

      {map?.status === "ready" && (
        <>
          <div className="space-y-5">
            {GROUP_ORDER.map(({ key, label }) => {
              const cats = groupCategories(map.groups?.[key]);
              if (cats.length === 0) return null;
              return (
                <div key={key}>
                  <h4 className="text-xs font-mono uppercase tracking-wider text-gold mb-2">
                    {label}
                    {isSuggestionGroup(key) && (
                      <span className="ml-2 normal-case tracking-normal text-white/45">suggestion</span>
                    )}
                  </h4>
                  {cats.map((c) => (
                    <div key={c.category} className="mb-3">
                      <p className="text-sm text-white/80 mb-1">{c.category}</p>
                      <ul className="space-y-1.5 pl-3 border-l border-white/10">
                        {c.links.map((l, i) => (
                          <LinkItem key={`${l.name}-${i}`} link={l} />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center gap-3 text-xs text-white/50">
            <span>{footerText(map.builtAt)}</span>
            {droppedText(map.droppedNoSource) && <span>{droppedText(map.droppedNoSource)}</span>}
            <button type="button" className="btn-outline text-xs" onClick={() => build(true)} disabled={posting}>
              Rebuild
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function LinkItem({ link }: { link: MapLink }) {
  const href = safeHref(link.source?.url);
  const dataLabel = linkDataLabel(link);
  const sourceTitle = link.source?.title || link.source?.url || "source";
  return (
    <li className="text-sm text-white/70 leading-6">
      <span className="text-white">{link.name}</span>
      {link.ticker && <span className="ml-1 font-mono text-white/55">({link.ticker})</span>}
      {dataLabel && <span className="ml-2 text-xs text-white/45">{dataLabel}</span>}
      <span className="text-white/60"> · {link.product}</span>
      {link.geography && <span className="text-white/50"> · {link.geography}</span>}
      {link.routeIn && <span className="text-white/50"> · Route in: {link.routeIn}</span>}
      {link.note && <span className="text-white/50"> · {link.note}</span>}
      <span className="text-white/45">
        {" · Source: "}
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="underline hover:text-gold">
            {sourceTitle}
          </a>
        ) : (
          sourceTitle
        )}
      </span>
    </li>
  );
}
