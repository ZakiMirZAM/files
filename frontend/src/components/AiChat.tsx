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
import { getOpenAi, subscribeAi } from "../lib/aiPanelStore";
import { askLocal, type BookSource } from "../lib/localAi";
import { matchBooks, mentionAt, type LocalBook } from "../lib/localBooks";
import { BookPicker, bookLabel, useLocalShelf } from "./learn/BookPicker";

/**
 * The text inserted for an @-mention: a readable title. Download-site prefixes
 * (dokumen.pub_, OceanofPDF, pdfcoffee.com_) go, dashes and underscores become
 * spaces, and the title is cut at a word near 50 characters.
 */
export function mentionLabel(b: { name: string }): string {
  let t = bookLabel(b.name)
    .replace(/^(_?oceanofpdf[._]?com_?|dokumen\.pub_|pdfcoffee\.com_|\d{6,}[-_ ])/i, "")
    .split(/ -- /)[0]
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length > 50) t = t.slice(0, 50).replace(/\s+\S*$/, "");
  return t || bookLabel(b.name).slice(0, 50);
}

interface ChatMessage {
  id: number;
  question: string;
  /** Set when the question went to the local book AI. */
  bookName?: string;
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
  // Local site only: a book from the Books folder for the AI to read.
  const shelf = useLocalShelf();
  const [book, setBook] = useState<BookSource | null>(null);
  const req = useSyncExternalStore(subscribeAi, getOpenAi);
  // @-mentions: books referenced in the text, and the list shown while typing one.
  const [mentioned, setMentioned] = useState<{ label: string; book: BookSource }[]>([]);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [pick, setPick] = useState(0);
  const suggestions = shelf && mention ? matchBooks(shelf, mention.query) : [];

  // Opened from a test review: take its book and text.
  useEffect(() => {
    if (req?.mode !== "chat") return;
    if (req.book) setBook(req.book);
    if (req.draft) setDraft(req.draft);
  }, [req?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Books the question still mentions (an @-mention deleted from the text drops out). */
  const mentionedNow = (text: string) => mentioned.filter((m) => text.includes(`@${m.label}`)).map((m) => m.book);
  const usesBooks = book !== null || mentionedNow(draft).length > 0;

  const busy = messages.some((m) => m.status === "loading");
  // The local book AI has no shared per-minute budget; /ask keeps its own.
  const canSend = draft.trim().length > 0 && !busy && (usesBooks || seconds === 0);

  const onDraft = (value: string, caret: number) => {
    setDraft(value);
    const m = shelf ? mentionAt(value, caret) : null;
    setMention(m);
    setPick(0);
  };

  const choose = (b: LocalBook) => {
    if (!mention) return;
    const label = mentionLabel(b);
    const caret = inputRef.current?.selectionStart ?? draft.length;
    const next = `${draft.slice(0, mention.start)}@${label} ${draft.slice(caret)}`;
    setDraft(next);
    setMentioned((prev) => [...prev.filter((x) => x.book.id !== b.id), { label, book: { id: b.id, name: b.name } }]);
    setMention(null);
    requestAnimationFrame(() => {
      const pos = mention.start + label.length + 2;
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(pos, pos);
    });
  };

  useEffect(() => {
    if (active) inputRef.current?.focus();
  }, [active]);

  useEffect(() => {
    if (active) endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, active]);

  const send = () => {
    const question = draft.trim();
    if (!question || busy || (!usesBooks && seconds > 0)) return;
    const refs = mentionedNow(question);
    const history: ChatTurn[] = messages
      .filter((m) => m.status === "done" && m.answer)
      .map((m) => ({ question: m.question, answer: m.answer! }));
    nextId.current += 1;
    const id = nextId.current;
    const names = [...(book ? [bookLabel(book.name)] : []), ...refs.map((b) => bookLabel(b.name))];
    const bookName = names.length > 1 ? `${names.length} books` : names[0];
    setMessages((prev) => [...prev, { id, question, status: "loading", bookName }]);
    setDraft("");
    setMention(null);

    const settle = (p: Promise<string>) =>
      p.then(
        (answer) => setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, status: "done", answer } : m))),
        (err: unknown) =>
          setMessages((prev) =>
            prev.map((m) =>
              m.id === id ? { ...m, status: "error", error: err instanceof Error ? err.message : "Request failed" } : m,
            ),
          ),
      );

    if (book || refs.length > 0) {
      settle(askLocal({ question, book, books: refs, history, model: getAiModel() }));
      return;
    }

    const pageCtx = getPageAiContext();
    settle(
      askQuestion({
        question,
        context: pageCtx.subjectKey ?? pageCtx.subject,
        section: pageCtx.section,
        // The Dashboard's tab title carries no section name, so fall back to the
        // route; the chat block (JSON) then always travels with the question.
        dataContext: chatDataContext(
          pageCtx,
          pageNameFromTitle(document.title) ?? window.location.pathname,
          history,
        ),
        model: getAiModel(),
      }).then((r) => r.text),
    );
  };

  /** Put a failed question back in the box and drop it from the list. */
  const resend = (m: ChatMessage) => {
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
    setDraft(m.question);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // While the @-mention list is open, arrows move, Enter or Tab picks, Escape closes.
    if (suggestions.length > 0) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setPick((i) => (i + (e.key === "ArrowDown" ? 1 : suggestions.length - 1)) % suggestions.length);
        return;
      }
      if ((e.key === "Enter" || e.key === "Tab") && !e.nativeEvent.isComposing) {
        e.preventDefault();
        choose(suggestions[Math.min(pick, suggestions.length - 1)]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMention(null);
        return;
      }
    }
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
            {book
              ? `Ask anything about ${bookLabel(book.name)}. The AI reads the book on this computer before it answers.`
              : shelf
                ? "Ask anything about the app or the page you are on. Type @ to bring in a book from your Books folder; the AI then reads it before it answers."
                : "Ask anything about the app or the page you are on. The answer uses the figures on this page and your last three questions."}
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
                {m.bookName ? `Reading ${m.bookName}…` : "Researching the vault and web…"}
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
        {shelf && (
          <BookPicker
            books={shelf}
            value={book}
            compact
            disabled={busy}
            onChange={setBook}
          />
        )}
        {!usesBooks && seconds > 0 && <p className="text-[0.7rem] text-white/45">{budgetWaitMessage(seconds)}</p>}
        {suggestions.length > 0 && (
          <ul role="listbox" aria-label="Books" className="max-h-56 overflow-y-auto rounded-sm border border-gold/20 bg-ink-800">
            {suggestions.map((b, i) => (
              <li key={b.id} role="option" aria-selected={i === pick}>
                <button
                  type="button"
                  // mousedown keeps the textarea's caret, so the mention lands where it was typed
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(b);
                  }}
                  className={cn(
                    "block w-full truncate px-3 py-2 text-left text-sm",
                    i === pick ? "bg-gold/10 text-gold" : "text-white/75 hover:bg-white/5",
                  )}
                  title={b.name}
                >
                  {bookLabel(b.name)}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => onDraft(e.target.value, e.target.selectionStart ?? e.target.value.length)}
            onKeyDown={onKeyDown}
            rows={2}
            placeholder={shelf ? "Ask a question (type @ to reference a book)" : "Ask a question"}
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
            onClick={() => {
              setMessages([]);
              setMentioned([]);
            }}
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
