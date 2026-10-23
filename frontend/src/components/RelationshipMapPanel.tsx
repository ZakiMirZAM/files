// Relationship map for the Head to Head base company: read on load (no AI),
// built by Ask AI only when the reader clicks. Mount with key={ticker} so a
// base change resets state and stops any polling.

import { useCallback, useEffect, useRef, useState } from "react";
import { Markdown } from "./Markdown";
import { askQuestion } from "../lib/aiApi";
import {
  ADDED_ON_REQUEST,
  BUILD_BUTTON,
  BUILDING_TEXT,
  FALLBACK_LABEL,
  GROUP_ORDER,
  MAX_POLLS,
  POLL_MS,
  SUGGEST_BUTTON,
  SUGGEST_GAVE_UP,
  SUGGEST_POLL_MS,
  addedText,
  cleanSuggestName,
  droppedText,
  footerText,
  getSuggestion,
  groupCategories,
  isPending,
  isSuggestionGroup,
  linkDataLabel,
  linkFieldLines,
  postSuggestion,
  rebuildReasonText,
  requestRelationshipMap,
  safeHref,
  suggestFallbackQuestion,
  suggestionNext,
  type GroupKey,
  type MapLink,
  type RelationshipMapResponse,
  type SuggestionResult,
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

  // After a company is added: read the stored map again (GET only, no AI).
  const refetch = useCallback(async () => {
    try {
      accept(await requestRelationshipMap(ticker));
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : String(e));
    }
  }, [ticker, accept]);

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
                          <LinkItem key={`${l.name}-${i}`} link={l} group={key} companyName={companyName} />
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
            {rebuildReasonText(map.rebuildReason) && <span>{rebuildReasonText(map.rebuildReason)}</span>}
          </div>
          <AddCompany ticker={ticker} companyName={companyName} map={map} onAdded={refetch} />
          <AskAboutMap map={map} />
        </>
      )}
    </section>
  );
}

const inputCls =
  "bg-ink-900 border border-white/15 rounded px-2 py-1.5 text-sm text-white focus:border-gold/60 focus:outline-none";

/** An Ask AI answer, rendered the way other AI answers are. Never saved. */
function AiAnswerBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="mt-3 panel-soft p-4 text-sm text-white/75 leading-relaxed">
      <p className="text-[0.7rem] font-mono uppercase tracking-wider text-white/45 mb-2">{label}</p>
      <Markdown content={text} />
    </div>
  );
}

function AddCompany({
  ticker,
  companyName,
  map,
  onAdded,
}: {
  ticker: string;
  companyName: string;
  map: RelationshipMapResponse;
  onAdded: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [group, setGroup] = useState<GroupKey>("competitors");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

  const run = async () => {
    const clean = cleanSuggestName(name);
    if (!clean) return;
    setBusy(true);
    setMessage(null);
    setFallback(null);
    try {
      let res: SuggestionResult = await postSuggestion(ticker, clean, group);
      const id = res.status === "checking" ? res.id : undefined;
      let polls = 0;
      while (alive.current && id) {
        const next = suggestionNext(res.status, polls);
        if (next === "done") break;
        if (next === "give-up") {
          setMessage(SUGGEST_GAVE_UP);
          return;
        }
        await wait(SUGGEST_POLL_MS);
        if (!alive.current) return;
        polls += 1;
        res = await getSuggestion(ticker, id);
      }
      if (!alive.current) return;
      if (res.status === "added") {
        await onAdded();
        setMessage(addedText(res.group ?? group, res.category));
        return;
      }
      if (res.status === "checking") return;
      // Not added or failed: say why, then run the full Ask AI answer, which the
      // reader's click started. It is shown here and never saved into the map.
      setMessage(res.status === "not-added" ? res.reason ?? "Ask AI did not add it." : res.error ?? "The check failed.");
      const ai = await askQuestion({
        question: suggestFallbackQuestion(clean, companyName),
        section: "comparative",
        dataContext: JSON.stringify(map),
      });
      if (alive.current) setFallback(ai.text);
    } catch (e) {
      if (alive.current) setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  return (
    <div className="mt-4 pt-3 border-t border-white/10">
      <p className="text-sm text-white/70 mb-2">Add a company</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          className={inputCls}
          value={name}
          maxLength={120}
          placeholder="Company name"
          aria-label="Company name"
          onChange={(e) => setName(e.target.value)}
        />
        <select
          className={inputCls}
          value={group}
          aria-label="Group"
          onChange={(e) => setGroup(e.target.value as GroupKey)}
        >
          {GROUP_ORDER.map((g) => (
            <option key={g.key} value={g.key}>
              {g.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn-outline text-xs"
          onClick={run}
          disabled={busy || !cleanSuggestName(name)}
        >
          {SUGGEST_BUTTON}
        </button>
      </div>
      <div aria-live="polite">
        {busy && !message && <p className="mt-2 text-xs text-white/50">Ask AI is checking. This can take a few minutes.</p>}
        {message && <p className="mt-2 text-xs text-white/60">{message}</p>}
      </div>
      {fallback && <AiAnswerBlock label={FALLBACK_LABEL} text={fallback} />}
    </div>
  );
}

function AskAboutMap({ map }: { map: RelationshipMapResponse }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    const q = question.trim();
    if (!q) return;
    setBusy(true);
    setError(null);
    try {
      const res = await askQuestion({ question: q, section: "comparative", dataContext: JSON.stringify(map) });
      setAnswer(res.text);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 pt-3 border-t border-white/10">
      <label htmlFor={`ask-map-${map.ticker ?? ""}`} className="block text-sm text-white/70 mb-2">
        Ask AI about this map
      </label>
      <textarea
        id={`ask-map-${map.ticker ?? ""}`}
        className="textarea"
        rows={2}
        value={question}
        placeholder="Your question..."
        onChange={(e) => setQuestion(e.target.value)}
      />
      <button
        type="button"
        className="btn-outline text-xs mt-2"
        onClick={run}
        disabled={busy || !question.trim()}
      >
        {busy ? "Asking..." : "Ask AI"}
      </button>
      {error && <p className="mt-2 text-xs text-white/60">{error}</p>}
      {answer && <AiAnswerBlock label="Ask AI's answer (not saved to the map)" text={answer} />}
    </div>
  );
}

function LinkItem({ link, group, companyName }: { link: MapLink; group: GroupKey; companyName: string }) {
  const href = safeHref(link.source?.url);
  const dataLabel = linkDataLabel(link);
  const sourceTitle = link.source?.title || link.source?.url || "source";
  const lines = linkFieldLines(link, group, companyName);
  return (
    <li className="text-sm text-white/70 leading-6">
      <span className="text-white">{link.name}</span>
      {link.ticker && <span className="ml-1 font-mono text-white/55">({link.ticker})</span>}
      {dataLabel && <span className="ml-2 text-xs text-white/45">{dataLabel}</span>}
      {link.addedOnRequest && <span className="ml-2 text-xs text-white/45">{ADDED_ON_REQUEST}</span>}
      <span className="text-white/60"> · {link.product}</span>
      {link.geography && <span className="text-white/50"> · {link.geography}</span>}
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
      {lines.length > 0 && (
        <ul className="mt-0.5 text-xs text-white/55 leading-5">
          {lines.map((ln) => (
            <li key={ln.label}>
              <span className="text-white/40">{ln.label}:</span> {ln.text}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
