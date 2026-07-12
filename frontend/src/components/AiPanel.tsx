import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery } from "convex/react";
import { Sparkles, X, Copy, Check, RefreshCw, BookText, Save, Maximize2, Minimize2 } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { cn } from "../lib/cn";
import { Markdown } from "./Markdown";
import { askQuestion, explainSelection, type AiResult } from "../lib/aiApi";
import { closeAi, getOpenAi, subscribeAi } from "../lib/aiPanelStore";

type Status = "loading" | "done" | "error";
const ASK_MODEL = "claude-sonnet-4-6";

function prettySource(path: string): string {
  const parts = path.split("/");
  const book = parts[0] === "Books" && parts.length > 1 ? parts[1] : parts[0];
  const file = parts[parts.length - 1].replace(/\.md$/, "");
  return `${book.slice(0, 42)} · ${file}`;
}

function parseSources(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function AiPanel() {
  const req = useSyncExternalStore(subscribeAi, getOpenAi);
  const open = req != null;

  // Cache lookup for answer-mode questions (skipped for explain mode).
  const cacheArgs =
    req && req.mode === "answer" && req.questionId && req.section && req.context
      ? { section: req.section, scopeKey: req.context, questionId: req.questionId }
      : ("skip" as const);
  const cached = useQuery(api.aiAnswers.getAiAnswer, cacheArgs);
  const saveAiAnswer = useMutation(api.aiAnswers.saveAiAnswer);

  const [status, setStatus] = useState<Status>("loading");
  const [result, setResult] = useState<AiResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [fromCache, setFromCache] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  // Widen the panel for long AI answers (off by default so it matches the
  // definition sidebar's collapsed width).
  const [expanded, setExpanded] = useState(false);
  const [regenStamp, setRegenStamp] = useState(0);
  const regenForReqId = useRef<number | null>(null);
  const handledRef = useRef<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const canCache = !!(req?.questionId && req.section && req.context);
  const isRegen = !!req && regenForReqId.current === req.id;
  const gen = req ? `${req.id}:${isRegen ? regenStamp : "c"}` : "";

  // Decide: serve from cache, or call the server (and cache the result).
  useEffect(() => {
    if (!req) return;

    if (req.mode === "explain") {
      if (handledRef.current === gen) return;
      handledRef.current = gen;
      runFetch(false);
      return;
    }

    // answer mode
    if (canCache && !isRegen) {
      if (cached === undefined) {
        setStatus("loading"); // cache row still loading
        return;
      }
      if (cached) {
        if (handledRef.current === gen) return;
        handledRef.current = gen;
        setResult({ text: cached.answer, sources: parseSources(cached.sources) });
        setFromCache(true);
        setSavedAt(cached.generatedAt);
        setStatus("done");
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
        return;
      }
      // cached === null -> generate below
    }
    if (handledRef.current === gen) return;
    handledRef.current = gen;
    runFetch(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req?.id, regenStamp, cached]);

  function runFetch(saveOnDone: boolean) {
    if (!req) return;
    setStatus("loading");
    setResult(null);
    setErrorMsg("");
    setFromCache(false);
    setSavedAt(null);
    setCopied(false);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    const reqId = req.id;

    const pending =
      req.mode === "answer"
        ? askQuestion({
            question: req.question ?? "",
            context: req.context,
            section: req.section,
            dataContext: req.dataContext,
          })
        : explainSelection({
            selection: req.selection ?? "",
            context: req.context,
            subject: req.subject,
            dataContext: req.dataContext,
          });

    pending.then(
      (r) => {
        if (getOpenAi()?.id !== reqId) return; // a newer request opened; ignore
        setResult(r);
        setStatus("done");
        setSavedAt(Date.now());
        if (saveOnDone && req.mode === "answer" && canCache) {
          saveAiAnswer({
            section: req.section!,
            scopeKey: req.context!,
            questionId: req.questionId!,
            answer: r.text,
            sources: JSON.stringify(r.sources),
            model: ASK_MODEL,
          }).catch((err: unknown) => {
            // Non-blocking: the answer still rendered; only the Convex cache write failed.
            console.error(
              `[AiPanel] failed to cache AI answer (section=${req.section}, question=${req.questionId}):`,
              err,
            );
          });
        }
      },
      (err: unknown) => {
        if (getOpenAi()?.id !== reqId) return;
        setErrorMsg(err instanceof Error ? err.message : "Request failed");
        setStatus("error");
      },
    );
  }

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAi();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const onCopy = () => {
    if (result && req?.onCopy) {
      req.onCopy(result.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  };

  const onRegenerate = () => {
    if (!req) return;
    regenForReqId.current = req.id;
    setRegenStamp(Date.now());
  };

  return (
    <>
      {open && (
        <button
          aria-label="Close AI panel"
          onClick={closeAi}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        />
      )}
      <aside
        data-ai-panel
        aria-label="AI assistant"
        aria-hidden={!open}
        className={cn(
          "fixed inset-y-0 right-0 z-50 w-full bg-ink-900/95 backdrop-blur-md",
          expanded ? "sm:w-[760px]" : "sm:w-[480px]",
          "transform transition-[width,transform] duration-300 ease-out border-l border-gold/15",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="h-full flex flex-col">
          <header className="flex items-center gap-3 px-4 py-3 border-b border-gold/15 shrink-0">
            <Sparkles className="w-4 h-4 text-gold shrink-0" />
            <h3 className="flex-1 min-w-0 font-display text-base font-semibold text-white leading-tight truncate">
              {req?.title ?? "AI"}
            </h3>
            <span className="font-mono text-[0.65rem] uppercase tracking-wider text-white/30 shrink-0">
              {req?.mode === "explain" ? "Explain" : "Answer"}
            </span>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? "Collapse panel" : "Expand panel"}
              aria-pressed={expanded}
              title={expanded ? "Narrow the panel" : "Widen the panel for long answers"}
              className="btn-ghost p-1.5 shrink-0 hidden sm:inline-flex"
            >
              {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button type="button" onClick={closeAi} aria-label="Close" className="btn-ghost p-1.5 shrink-0">
              <X className="w-4 h-4" />
            </button>
          </header>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
            {status === "loading" && (
              <div className="flex items-center gap-2.5 text-sm text-white/45 font-mono py-6">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                {req?.mode === "explain" ? "Explaining from the vault…" : "Researching the vault and web…"}
              </div>
            )}

            {status === "error" && (
              <div className="py-4 space-y-3">
                <p className="text-sm text-loss leading-relaxed">{errorMsg}</p>
                <button
                  type="button"
                  onClick={onRegenerate}
                  className="btn-ghost inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Retry
                </button>
              </div>
            )}

            {status === "done" && result && (
              <div className="space-y-5">
                {fromCache && savedAt != null && (
                  <div className="flex items-center gap-1.5 text-[0.7rem] font-mono text-white/35">
                    <Save className="w-3 h-3 text-gold/50" />
                    Saved · {new Date(savedAt).toLocaleString()}
                  </div>
                )}

                <Markdown content={result.text} />

                {result.sources.length > 0 && (
                  <div className="pt-4 border-t border-gold/10">
                    <p className="flex items-center gap-1.5 label mb-2">
                      <BookText className="w-3.5 h-3.5 text-gold/60" /> Vault sources
                    </p>
                    <ul className="space-y-1">
                      {result.sources.map((s) => (
                        <li key={s} className="font-mono text-[0.7rem] text-white/45 leading-snug">
                          {prettySource(s)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="pt-2 flex flex-wrap items-center gap-2">
                  {req?.onCopy && (
                    <button
                      type="button"
                      onClick={onCopy}
                      className="btn-ghost inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-gain-strong" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? "Copied to your answer" : "Copy to my answer"}
                    </button>
                  )}
                  {req?.mode === "answer" && canCache && (
                    <button
                      type="button"
                      onClick={onRegenerate}
                      className="btn-ghost inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5"
                      title="Run a fresh answer and replace the saved one"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Regenerate
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
