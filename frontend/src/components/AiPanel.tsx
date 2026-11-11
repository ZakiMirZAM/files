import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Sparkles,
  X,
  Copy,
  Check,
  RefreshCw,
  Save,
  Maximize2,
  Minimize2,
  MessageSquare,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import { cn } from "../lib/cn";
import { Markdown } from "./Markdown";
import {
  askQuestion,
  explainSelection,
  parseVerification,
  verifyAnswer,
  type AiResult,
  type VerificationReport,
} from "../lib/aiApi";
import {
  AI_VERIFY_UI,
  AiVerificationDetail,
  AiVerificationStrip,
  reviewCount,
} from "./AiVerification";
import { closeAi, getOpenAi, setAiPanelWidth, subscribeAi, toggleChat } from "../lib/aiPanelStore";
import { CONNECT_AI } from "../lib/connectQuestions";
import { AiChat } from "./AiChat";
import { getAiModel, modelIdFor, setAiModel, subscribeAiModel } from "../lib/aiModelStore";

type Status = "loading" | "done" | "error";

/** Thrown to stop a run that must not reach the model: a newer request took
 *  over, or the reader navigated away while the figures were being gathered. */
class AbandonedError extends Error {
  constructor(message = "") {
    super(message);
    this.name = "AbandonedError";
  }
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
  const isChat = req?.mode === "chat";
  const aiModel = useSyncExternalStore(subscribeAiModel, getAiModel);

  // Cache lookup for answer-mode questions (skipped for explain mode).
  const cacheArgs =
    req && req.mode === "answer" && req.questionId && req.section && req.context
      ? { section: req.section, scopeKey: req.context, questionId: req.questionId }
      : ("skip" as const);
  const cached = useQuery(api.aiAnswers.getAiAnswer, cacheArgs);
  const saveAiAnswer = useMutation(api.aiAnswers.saveAiAnswer);
  const saveVerification = useMutation(api.aiAnswers.saveVerification);

  const [status, setStatus] = useState<Status>("loading");
  const [result, setResult] = useState<AiResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [fromCache, setFromCache] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  // The answer as first written, kept when a verification pass revises it so the
  // reader can put the two side by side.
  const [answerOriginal, setAnswerOriginal] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  // Widen the panel for long AI answers (off by default so it matches the
  // definition sidebar's collapsed width).
  const [expanded, setExpanded] = useState(false);
  // Tell full-screen overlays (the PDF viewer) how much room the panel takes.
  useEffect(() => {
    setAiPanelWidth(open ? (expanded ? 760 : 480) : 0);
  }, [open, expanded]);
  const [regenStamp, setRegenStamp] = useState(0);
  const [gathering, setGathering] = useState(false);
  const gatherAbort = useRef<AbortController | null>(null);
  const regenForReqId = useRef<number | null>(null);
  const handledRef = useRef<string>("");
  const verifiedRef = useRef<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const canCache = !!(req?.questionId && req.section && req.context);
  const isRegen = !!req && regenForReqId.current === req.id;
  const gen = req ? `${req.id}:${isRegen ? regenStamp : "c"}` : "";

  // Decide: serve from cache, or call the server (and cache the result).
  useEffect(() => {
    if (!req) return;
    // Chat mode sends nothing on open; AiChat sends each typed question itself.
    if (req.mode === "chat") return;

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
        setResult({
          text: cached.answer,
          sources: parseSources(cached.sources),
          verification: parseVerification(cached.verification),
        });
        setAnswerOriginal(cached.answerOriginal ?? null);
        setShowOriginal(false);
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
    setAnswerOriginal(null);
    setShowOriginal(false);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    const reqId = req.id;
    const request = req;
    // Read once per run, so the saved answer records the model that wrote it.
    const model = getAiModel();

    // The figures are gathered HERE, not at the click, so a question whose
    // answer came back from the cache above never pays for them.
    // null means the reader moved on, and the model is not called at all.
    const withData = async (): Promise<string | null | undefined> => {
      if (!request.gatherData) return request.dataContext;
      const controller = new AbortController();
      gatherAbort.current?.abort();
      gatherAbort.current = controller;
      setGathering(true);
      try {
        return await request.gatherData(controller.signal);
      } catch {
        // The figures failed; the question still goes, on the page's own.
        return request.dataContext;
      } finally {
        setGathering(false);
        if (gatherAbort.current === controller) gatherAbort.current = null;
      }
    };

    const pending = withData().then((dataContext) => {
      if (getOpenAi()?.id !== reqId) throw new AbandonedError();
      if (dataContext === null) throw new AbandonedError(CONNECT_AI.abandoned);
      return request.mode === "answer"
        ? askQuestion({
            question: request.question ?? "",
            context: request.context,
            section: request.section,
            dataContext,
            model,
          })
        : explainSelection({
            selection: request.selection ?? "",
            context: request.context,
            subject: request.subject,
            dataContext,
            model,
          });
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
            model: modelIdFor(model),
            // Strip the token: it is a one-shot handle on the live request, and a
            // stale one in the cache would re-fire /verify on every reload.
            verification: r.verification
              ? JSON.stringify({ ...r.verification, token: undefined })
              : undefined,
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
        if (err instanceof AbandonedError && !err.message) {
          // A newer request took over. Its own run owns the panel now.
          return;
        }
        setErrorMsg(err instanceof Error ? err.message : "Request failed");
        setStatus("error");
      },
    );
  }

  // Second verification pass, for an answer the first pass flagged. The token is
  // only issued when the server runs verification in `on` mode, so a shadow-mode
  // answer never reaches the network here. Gated on the badge flag too: with the
  // UI off there is nothing to show, so there is no reason to spend the call.
  useEffect(() => {
    if (!AI_VERIFY_UI) return;
    if (status !== "done" || !result || !req) return;
    // Chat mode never resets `result`, so without this the hidden answer from
    // before the chat opened would send its spent token to /verify again.
    if (req.mode === "chat") return;
    const report = result.verification;
    if (!report || report.status !== "flagged" || report.revised) return;
    const token = report.token;
    if (!token) return;

    const reqId = req.id;
    const key = `${reqId}:${token}`;
    if (verifiedRef.current === key) return;
    verifiedRef.current = key;

    const canPersist = req.mode === "answer" && canCache;
    const section = req.section;
    const scopeKey = req.context;
    const questionId = req.questionId;
    const priorText = result.text;
    const priorReview = reviewCount(report);

    verifyAnswer(token).then(
      (v) => {
        if (getOpenAi()?.id !== reqId) return; // a newer request opened; ignore
        const after = v.verification ?? report;
        const revisedText = v.revisedAnswer?.trim();
        const didRevise = !!revisedText && revisedText !== priorText;
        const corrected = v.correctedCount ?? Math.max(1, priorReview - reviewCount(after));
        const merged: VerificationReport = {
          ...after,
          token: undefined, // spent
          revised: didRevise,
          revisedCount: didRevise ? corrected : undefined,
        };

        if (didRevise && revisedText) {
          setAnswerOriginal(priorText);
          setResult((prev) => (prev ? { ...prev, text: revisedText, verification: merged } : prev));
        } else {
          setResult((prev) => (prev ? { ...prev, verification: merged } : prev));
        }

        if (canPersist && section && scopeKey && questionId) {
          saveVerification({
            section,
            scopeKey,
            questionId,
            verification: JSON.stringify(merged),
            revisedAnswer: didRevise ? revisedText : undefined,
          }).catch((err: unknown) => {
            // Non-blocking: the report still rendered, only the Convex write failed.
            console.error(`[AiPanel] failed to save verification (question=${questionId}):`, err);
          });
        }
      },
      (err: unknown) => {
        if (getOpenAi()?.id !== reqId) return;
        // Verification is commentary on the answer, never a reason to fail it.
        console.error(`[AiPanel] verification pass failed (question=${questionId}):`, err);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, result, req?.id]);

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
      {/* Mobile/tablet: fixed overlay sliding in from the right. Desktop (lg+):
          an in-flow sticky column beside the page, like the notebook, so the
          page stays usable while the panel is open. Inert while closed. */}
      <aside
        data-ai-panel
        aria-label="AI assistant"
        aria-hidden={!open}
        inert={!open}
        className={cn(
          "fixed inset-y-0 right-0 z-50 w-full bg-ink-900/95 backdrop-blur-md",
          expanded ? "sm:w-[760px]" : "sm:w-[480px]",
          "transform transition-[width,transform] duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full",
          // lg:z-40 keeps the fixed page outline (PageTOC, z-30) from drawing over the panel.
          "lg:sticky lg:top-0 lg:h-screen lg:self-start lg:z-40 lg:transform-none lg:overflow-clip",
          !open ? "lg:w-0" : expanded ? "lg:w-[760px]" : "lg:w-[480px]",
        )}
      >
        <div
          className={cn(
            "h-full w-full flex flex-col border-l border-gold/15",
            expanded ? "sm:w-[760px]" : "sm:w-[480px]",
          )}
        >
          <header className="flex items-center gap-3 px-4 py-3 border-b border-gold/15 shrink-0">
            <Sparkles className="w-4 h-4 text-gold shrink-0" />
            <h3 className="flex-1 min-w-0 font-display text-base font-semibold text-white leading-tight truncate">
              {req?.title ?? "AI"}
            </h3>
            <span className="font-mono text-[0.65rem] uppercase tracking-wider text-white/30 shrink-0">
              {req?.mode === "explain" ? "Explain" : isChat ? "Chat" : "Answer"}
            </span>
            <div
              role="group"
              aria-label="AI model"
              className="inline-flex shrink-0 rounded-sm border border-gold/15 overflow-hidden font-mono text-[0.65rem]"
            >
              {(["opus", "haiku"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setAiModel(m)}
                  aria-pressed={aiModel === m}
                  title={m === "opus" ? "Opus 5.5: deeper answers" : "Haiku 5.5: faster answers"}
                  className={cn(
                    "px-2 py-1 transition-colors",
                    aiModel === m ? "bg-gold/15 text-gold" : "text-white/45 hover:text-white/80",
                  )}
                >
                  {m === "opus" ? "Opus" : "Haiku"}
                </button>
              ))}
            </div>
            {open && !isChat && (
              // The open panel covers the header's own chat button on wide
              // screens, so the panel carries a way back to the chat.
              <button
                type="button"
                onClick={toggleChat}
                aria-label="Open the chat"
                title="Open the chat"
                className="btn-ghost p-1.5 shrink-0"
              >
                <MessageSquare className="w-4 h-4" />
              </button>
            )}
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

          <AiChat active={isChat} />

          <div ref={scrollRef} className={cn("flex-1 overflow-y-auto px-4 py-4", isChat && "hidden")}>
            {status === "loading" && (
              <div className="flex items-center gap-2.5 text-sm text-white/45 font-mono py-6">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                {gathering
                  ? CONNECT_AI.gathering
                  : req?.mode === "explain"
                    ? "Explaining from the vault…"
                    : "Researching the vault and web…"}
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
                {((fromCache && savedAt != null) || (AI_VERIFY_UI && !!result.verification)) && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.7rem] font-mono text-white/35">
                    {fromCache && savedAt != null && (
                      <span className="inline-flex items-center gap-1.5">
                        <Save className="w-3 h-3 text-gold/50" />
                        Saved · {new Date(savedAt).toLocaleString()}
                      </span>
                    )}
                    <AiVerificationStrip
                      report={result.verification}
                      revised={result.verification?.revised}
                      correctedCount={result.verification?.revisedCount}
                      showingOriginal={showOriginal}
                      onToggleOriginal={
                        answerOriginal && result.verification?.revised
                          ? () => setShowOriginal((v) => !v)
                          : undefined
                      }
                    />
                  </div>
                )}

                <Markdown content={showOriginal && answerOriginal ? answerOriginal : result.text} />

                <AiVerificationDetail report={result.verification} />

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
