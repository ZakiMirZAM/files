// The chat body of the AI sidebar (chat mode). The reader types any question
// about the app or the page in view; each one goes through the same /ask route
// and the same per-minute budget as every "Explain using AI" button. Mounted
// for the life of the panel and only hidden in the other modes, so the
// conversation survives closing the panel or opening an explain answer.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { RefreshCw, Send, Trash2 } from "lucide-react";
import { Markdown } from "./Markdown";
import { askQuestion } from "../lib/aiApi";
import { getPageAiContext } from "../lib/aiContextStore";
import { budgetWaitMessage, secondsUntilAllowed, subscribeAskBudget } from "../lib/askBudget";
import { chatDataContext, pageNameFromTitle, type ChatTurn } from "../lib/chatContext";
import { cn } from "../lib/cn";
import { getAiModel } from "../lib/aiModelStore";

interface ChatMessage {
  id: number;
  question: string;
  status: "loading" | "done" | "error";
  answer?: string;
  error?: string;
}

interface AiChatProps {
  /** True while the panel is in chat mode. */
  active: boolean;
}

export function AiChat({ active }: AiChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const nextId = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const seconds = useSyncExternalStore(subscribeAskBudget, () => secondsUntilAllowed());

  const busy = messages.some((m) => m.status === "loading");
  const canSend = draft.trim().length > 0 && !busy && seconds === 0;

  useEffect(() => {
    if (active) inputRef.current?.focus();
  }, [active]);

  useEffect(() => {
    if (active) endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, active]);

  const send = () => {
    const question = draft.trim();
    if (!question || busy || seconds > 0) return;
    const page = getPageAiContext();
    const history: ChatTurn[] = messages
      .filter((m) => m.status === "done" && m.answer)
      .map((m) => ({ question: m.question, answer: m.answer! }));
    nextId.current += 1;
    const id = nextId.current;
    setMessages((prev) => [...prev, { id, question, status: "loading" }]);
    setDraft("");

    askQuestion({
      question,
      context: page.subjectKey ?? page.subject,
      section: page.section,
      // The Dashboard's tab title carries no section name, so fall back to the
      // route; the chat block (JSON) then always travels with the question.
      dataContext: chatDataContext(
        page,
        pageNameFromTitle(document.title) ?? window.location.pathname,
        history,
      ),
      model: getAiModel(),
    }).then(
      (r) =>
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, status: "done", answer: r.text } : m)),
        ),
      (err: unknown) =>
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id
              ? { ...m, status: "error", error: err instanceof Error ? err.message : "Request failed" }
              : m,
          ),
        ),
    );
  };

  /** Put a failed question back in the box and drop it from the list. */
  const resend = (m: ChatMessage) => {
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
    setDraft(m.question);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // isComposing: Enter that confirms an input-method candidate must not send.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className={cn("flex-1 min-h-0 flex flex-col", !active && "hidden")}>
      <div role="log" aria-live="polite" className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {messages.length === 0 && (
          <p className="text-sm text-white/45 leading-relaxed">
            Ask anything about the app or the page you are on. The answer uses the figures on this page
            and your last three questions.
          </p>
        )}

        {messages.map((m) => (
          <div key={m.id} className="space-y-3">
            <p className="ml-auto max-w-[85%] w-fit rounded-sm bg-gold/10 border border-gold/20 px-3 py-2 text-sm text-white whitespace-pre-wrap">
              {m.question}
            </p>

            {m.status === "loading" && (
              <div className="flex items-center gap-2.5 text-sm text-white/45 font-mono">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Researching the vault and web…
              </div>
            )}

            {m.status === "error" && (
              <div className="space-y-2">
                <p className="text-sm text-loss leading-relaxed">{m.error}</p>
                <button
                  type="button"
                  onClick={() => resend(m)}
                  className="btn-ghost inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Edit and resend
                </button>
              </div>
            )}

            {m.status === "done" && m.answer && <Markdown content={m.answer} />}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form
        className="shrink-0 border-t border-gold/15 px-4 py-3 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        {seconds > 0 && <p className="text-[0.7rem] text-white/45">{budgetWaitMessage(seconds)}</p>}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            placeholder="Ask a question"
            aria-label="Your question"
            className="flex-1 resize-none rounded-sm bg-ink-800 border border-gold/15 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-gold/40"
          />
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send"
            title="Send (Enter)"
            className="btn-ghost p-2 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => setMessages([])}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-[0.7rem] text-white/40 hover:text-white/70 disabled:opacity-40"
          >
            <Trash2 className="w-3 h-3" /> New chat
          </button>
        )}
      </form>
    </div>
  );
}
