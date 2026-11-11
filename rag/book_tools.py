"""Local book tools: the AI reads the owner's own books, on the LOCAL site only.

The local site (Vite + dev backend + this server started with LOCAL_BOOKS=1) lets
the owner ask about a book in the Books folder, review test questions against
it, and make cards and tests from its pages, "as if Claude Code ran in the page".
The model gets four read-only tools limited to that folder:

  list_books(query)            find a book by words in its file name
  book_contents(book)          the chapter outline with PDF page numbers
  read_pages(book, start, end) the text of a range of pages
  search_book(book, query)     the pages that mention the words, with snippets

No filesystem tool (Read, Bash, Glob) is ever given. Page numbers are PDF page
numbers, the same numbers the in-app viewer shows.

Routes (added by server.py, all 404 unless local_allowed(request)):
  GET  /local/status        -> {"ok": true}
  POST /local/ask           {question, book?, page?, history?, model?} -> {answer}
  POST /local/learn/cards   /learn/cards body + book {id, pages?}      -> {cards}
  POST /local/learn/quiz    /learn/quiz body + book {id, pages?}       -> {questions}

The cards and quiz routes use the owner-approved LEARN_*_SYSTEM prompts unchanged;
the book to read rides in the user message. Only LOCAL_ASK_SYSTEM is new
(hash-pinned in test_prompts.py, owner approval required to change).

Why the guard is strict: the production AI server runs on this same PC behind
the Cloudflare tunnel and nginx. These routes answer only when this process was
started with LOCAL_BOOKS=1, the Host is localhost/127.0.0.1, and the request
carries no forwarding header (nginx and the tunnel always add one).
"""
from __future__ import annotations

import asyncio
import os
import re
import threading
from collections import OrderedDict
from pathlib import Path

from aiohttp import web

import learn

# --- prompt (owner approval required to change; hash in test_prompts.py) --------
LOCAL_ASK_SYSTEM = """\
You answer questions for a reader who studies finance, accounting, economics and investing from the books on their own computer. You can read those books with four tools: list_books finds a book by words in its title, book_contents gives its chapters with page numbers, read_pages returns the text of a range of pages, and search_book finds the pages that mention given words. The user message may name the book open in the viewer, the page in view, and the reader's last questions with your answers.

HOW TO WORK
1. When a question is about a book, read the book before you answer. Find the chapter with book_contents or search_book, then read its pages with read_pages. Answer from the text you read, not from memory, and read more pages when the first ones do not settle the question.
2. When the reader pastes test questions they got wrong, take them one at a time: say what the question tests, why the correct answer is right, what mistake the reader's answer makes, and where the book explains the idea, with the page numbers.
3. Use search_vault or the web only for a point the books do not cover, and general knowledge last. Never refuse.
4. Never invent a figure, a formula, a quotation or a page number. When a page has no readable text (a scanned page), say so.

STYLE
Answer the question directly, with no headings and no source list. Name the page where the reader can find each idea, written as "page 42"; these are the page numbers the viewer shows. Plain words. Define a term the first time it appears. Keep formulas exact and define every variable. No em dashes or en dashes: use a period, a comma or parentheses. Straight quotes only. No filler words and no closing pleasantries."""

PROMPTS = {"LOCAL_ASK_SYSTEM": LOCAL_ASK_SYSTEM}

EFFORT_BY_LABEL = {"/local/ask": "medium", "/local/learn/cards": "medium", "/local/learn/quiz": "medium"}
ASK_MAX_TURNS, ASK_BUDGET_USD = 30, 4.0
LEARN_MAX_TURNS, LEARN_BUDGET_USD = 30, 4.0

# --- limits ----------------------------------------------------------------------
MAX_QUESTION = 12_000          # room for a pasted list of wrong test answers
MAX_BOOKS = 5                  # books one question may reference
MAX_HISTORY_TURNS, MAX_HISTORY_CHARS = 4, 1_500
MAX_PAGES_PER_READ, MAX_READ_CHARS = 25, 80_000
MAX_LIST, MAX_TOC, MAX_HITS, SNIPPET = 40, 400, 15, 320
TEXT_CACHE_BOOKS = 4

ERR_QUESTION = "question is required"
ERR_QUESTION_LONG = "question is too long"
ERR_BOOK = "book must be {id, pages?} naming a PDF in the Books folder"

DEFAULT_BOOKS_DIR = Path.home() / "Desktop" / "Books"
_LOCAL_HOST_RE = re.compile(r"^(localhost|127\.0\.0\.1)(:\d{1,5})?$", re.IGNORECASE)
_FORWARD_HEADERS = ("x-forwarded-for", "x-real-ip", "cf-connecting-ip", "cf-ray", "forwarded")


# --- guard -----------------------------------------------------------------------
def local_allowed(request: web.Request) -> bool:
    if os.environ.get("LOCAL_BOOKS", "").strip() != "1":
        return False
    if any(h in request.headers for h in _FORWARD_HEADERS):
        return False
    return bool(_LOCAL_HOST_RE.match(request.headers.get("Host", "")))


# --- the Books folder (same rules as backend/local_books.py) ---------------------
def books_root() -> Path | None:
    raw = os.environ.get("LOCAL_BOOKS_DIR", "").strip()
    root = Path(raw) if raw else DEFAULT_BOOKS_DIR
    try:
        root = root.resolve(strict=True)
    except OSError:
        return None
    return root if root.is_dir() else None


def _hidden(rel: Path) -> bool:
    return any(p.startswith(".") or p in ("receipts", "review-receipts") for p in (x.lower() for x in rel.parts))


def list_pdfs(root: Path) -> list[Path]:
    out = []
    for p in root.rglob("*"):
        if p.is_file() and p.suffix.lower() == ".pdf" and not _hidden(p.relative_to(root)):
            out.append(p)
    return sorted(out, key=lambda p: p.name.lower())


def resolve_book(root: Path, book: str) -> Path | None:
    """A PDF inside root, by its id (path inside the folder) or, failing that,
    by a unique case-insensitive match of words in its file name."""
    book = (book or "").strip()
    if not book or len(book) > 1000 or "\x00" in book:
        return None
    rel = Path(book)
    if not (rel.is_absolute() or rel.drive or ".." in rel.parts or _hidden(rel)):
        try:
            path = (root / rel).resolve(strict=True)
        except OSError:
            path = None
        if path and path.is_relative_to(root) and path.is_file() and path.suffix.lower() == ".pdf" \
                and not _hidden(path.relative_to(root)):
            return path
    words = [w for w in re.split(r"\W+", book.lower()) if w]
    if not words:
        return None
    hits = [p for p in list_pdfs(root) if all(w in p.name.lower() for w in words)]
    return hits[0] if len(hits) == 1 else None


def book_id(root: Path, path: Path) -> str:
    return path.relative_to(root).as_posix()


# --- page text, cached per book ----------------------------------------------------
_cache: "OrderedDict[tuple[str, float], list[str]]" = OrderedDict()
_cache_lock = threading.Lock()


def page_texts(path: Path) -> list[str]:
    """Text of every page (index 0 = PDF page 1). Cached for the last few books."""
    import fitz  # PyMuPDF; imported lazily so the server starts without it

    key = (str(path), path.stat().st_mtime)
    with _cache_lock:
        if key in _cache:
            _cache.move_to_end(key)
            return _cache[key]
    with fitz.open(path) as doc:
        texts = [page.get_text() for page in doc]
    with _cache_lock:
        _cache[key] = texts
        while len(_cache) > TEXT_CACHE_BOOKS:
            _cache.popitem(last=False)
    return texts


def contents_text(root: Path, path: Path) -> str:
    import fitz

    with fitz.open(path) as doc:
        toc, pages = doc.get_toc(simple=True), doc.page_count
    head = f"Book: {path.name} (id: {book_id(root, path)}), {pages} PDF pages."
    if not toc:
        return head + "\nThis PDF has no chapter outline. Use search_book to find a chapter by its title words."
    lines = [f"{'  ' * (lvl - 1)}{title.strip()} (page {page})" for lvl, title, page in toc[:MAX_TOC] if page > 0]
    more = f"\n(and {len(toc) - MAX_TOC} more entries)" if len(toc) > MAX_TOC else ""
    return head + "\nOutline:\n" + "\n".join(lines) + more


def read_text(path: Path, start: int, end: int) -> str:
    texts = page_texts(path)
    n = len(texts)
    start = max(1, min(start, n))
    end = max(start, min(end, n, start + MAX_PAGES_PER_READ - 1))
    parts, total = [], 0
    for p in range(start, end + 1):
        body = texts[p - 1].strip() or "(no text layer on this page)"
        block = f"--- page {p} ---\n{body}"
        if total + len(block) > MAX_READ_CHARS and parts:
            parts.append(f"(stopped before page {p}: too much text for one call; read from page {p} next)")
            break
        parts.append(block)
        total += len(block)
    return f"{path.name}, pages {start}-{end} of {n}:\n\n" + "\n\n".join(parts)


def search_text(path: Path, query: str) -> str:
    words = [w for w in re.split(r"\W+", query.lower()) if len(w) > 1]
    if not words:
        return "Give one or more words to search for."
    scored = []
    for i, text in enumerate(page_texts(path), 1):
        low = text.lower()
        hits = sum(low.count(w) for w in words)
        if hits and all(w in low for w in words):
            first = min(low.find(w) for w in words if w in low)
            snippet = " ".join(text[max(0, first - SNIPPET // 3): first + SNIPPET].split())
            scored.append((hits, i, snippet))
    if not scored:
        return f"No page of {path.name} contains all of: {', '.join(words)}."
    scored.sort(key=lambda t: (-t[0], t[1]))
    return f"Pages of {path.name} that mention {', '.join(words)} (most mentions first):\n" + "\n".join(
        f"page {i}: ...{snip}..." for _, i, snip in scored[:MAX_HITS])


# --- request payloads --------------------------------------------------------------
def parse_book(raw) -> tuple[str | None, dict | None]:
    """{id, pages?} from a request, or (None, None) when no book was sent."""
    if raw is None:
        return None, None
    if not isinstance(raw, dict) or not isinstance(raw.get("id"), str) or not raw["id"].strip():
        return ERR_BOOK, None
    pages = raw.get("pages")
    pages = pages.strip()[:60] if isinstance(pages, str) else ""
    name = raw.get("name") if isinstance(raw.get("name"), str) else ""
    return None, {"id": raw["id"].strip()[:1000], "pages": pages, "name": name.strip()[:300]}


def book_note(book: dict, page: int | None = None) -> str:
    label = book["name"] or book["id"]
    parts = [f'The book: "{label}" (book id for the tools: {book["id"]}).']
    if book.get("pages"):
        parts.append(f"Pages or chapter to use: {book['pages']}.")
    if page:
        parts.append(f"The viewer is open at page {page}.")
    return " ".join(parts)


def learn_book_guidance(book: dict) -> str:
    return ("\n\nSOURCE ON THIS COMPUTER\n" + book_note(book) + " This book is the primary source for this "
            "batch: read it with the book tools (book_contents, read_pages, search_book) before writing, and "
            "write from its text and its own wording. Use search_vault or the web only to confirm a fact.")


def validate_ask(data) -> tuple[str | None, dict | None]:
    if not isinstance(data, dict):
        return ERR_QUESTION, None
    q = data.get("question")
    q = q.strip() if isinstance(q, str) else ""
    if not q:
        return ERR_QUESTION, None
    if len(q) > MAX_QUESTION:
        return ERR_QUESTION_LONG, None
    err, book = parse_book(data.get("book"))
    if err:
        return err, None
    # Books @-mentioned in the chat (up to MAX_BOOKS), besides the picked one.
    books: list[dict] = [book] if book else []
    raw = data.get("books")
    if raw is not None:
        if not isinstance(raw, list):
            return ERR_BOOK, None
        for item in raw:
            berr, b = parse_book(item)
            if berr:
                return berr, None
            if b and all(b["id"] != x["id"] for x in books):
                books.append(b)
    books = books[:MAX_BOOKS]
    page = learn._whole(data.get("page"))
    history = []
    for t in (data.get("history") or [])[-MAX_HISTORY_TURNS:] if isinstance(data.get("history"), list) else []:
        if isinstance(t, dict) and isinstance(t.get("question"), str) and isinstance(t.get("answer"), str):
            history.append({"question": t["question"][:MAX_HISTORY_CHARS],
                            "answer": t["answer"][:MAX_HISTORY_CHARS]})
    return None, {"question": q, "book": books[0] if books else None, "books": books,
                  "page": page if page and page > 0 else None, "history": history}


def build_ask_prompt(p: dict) -> str:
    parts = []
    books = p.get("books") or ([p["book"]] if p.get("book") else [])
    if len(books) == 1:
        parts.append(book_note(books[0], p["page"]))
    elif books:
        parts.append("The reader referenced these books; read each one the question needs:\n" + "\n".join(
            f"- {book_note(b)}" for b in books))
    if p["history"]:
        parts.append("Earlier in this chat:\n" + "\n\n".join(
            f"Reader: {t['question']}\nYou: {t['answer']}" for t in p["history"]))
    parts.append("The reader's question:\n" + p["question"])
    return "\n\n".join(parts)


# --- the agent ----------------------------------------------------------------------
def make_handlers(pick_model, default_model: str, vault_mcp, vault_tool: str) -> dict:
    """Routes bound to server.py's vault server and model switch (injected, as in
    learn.make_handlers, because server.py runs as __main__)."""
    from claude_agent_sdk import (
        AssistantMessage,
        ClaudeAgentOptions,
        PermissionResultAllow,
        PermissionResultDeny,
        ResultMessage,
        TextBlock,
        create_sdk_mcp_server,
        query,
        tool,
    )

    def _root_or_err() -> tuple[Path | None, str | None]:
        root = books_root()
        return (root, None) if root else (None, "The Books folder was not found on this computer.")

    def _text(s: str) -> dict:
        return {"content": [{"type": "text", "text": s}]}

    async def _with_book(args, fn):
        root, err = _root_or_err()
        if err:
            return _text(err)
        path = resolve_book(root, str(args.get("book") or ""))
        if path is None:
            return _text("No single book matches that id or title. Call list_books to find the book id.")
        try:
            return _text(await asyncio.to_thread(fn, root, path))
        except Exception as exc:  # noqa: BLE001 - a broken PDF is a tool message, not a crash
            return _text(f"The PDF could not be read: {type(exc).__name__}.")

    @tool("list_books", "List the books in the reader's Books folder whose file names contain all the given "
          "words (empty query lists the first ones). Returns each book's id for the other tools.",
          {"query": str})
    async def list_books(args):
        root, err = _root_or_err()
        if err:
            return _text(err)
        words = [w for w in re.split(r"\W+", str(args.get("query") or "").lower()) if w]
        pdfs = await asyncio.to_thread(list_pdfs, root)
        hits = [p for p in pdfs if all(w in p.name.lower() for w in words)]
        if not hits:
            return _text("No book in the Books folder matches those words.")
        lines = [f"- {p.name} (id: {book_id(root, p)})" for p in hits[:MAX_LIST]]
        more = f"\n(and {len(hits) - MAX_LIST} more; use more words)" if len(hits) > MAX_LIST else ""
        return _text(f"{len(hits)} matching books:\n" + "\n".join(lines) + more)

    @tool("book_contents", "The chapter outline of a book with the page number of each chapter, and its "
          "page count. `book` is a book id from list_books or unique words from its title.", {"book": str})
    async def book_contents(args):
        return await _with_book(args, contents_text)

    @tool("read_pages", f"The text of pages `start` to `end` of a book (at most {MAX_PAGES_PER_READ} pages "
          "per call). Page numbers are PDF page numbers, as book_contents and the viewer show them.",
          {"book": str, "start": int, "end": int})
    async def read_pages(args):
        start = learn._whole(args.get("start")) or 1
        end = learn._whole(args.get("end")) or start
        return await _with_book(args, lambda _root, path: read_text(path, start, end))

    @tool("search_book", "The pages of a book that mention all the given words, most mentions first, "
          "with a snippet of each.", {"book": str, "query": str})
    async def search_book(args):
        q = str(args.get("query") or "")
        return await _with_book(args, lambda _root, path: search_text(path, q))

    books_mcp = create_sdk_mcp_server(name="books", version="1.0.0",
                                      tools=[list_books, book_contents, read_pages, search_book])
    allowed = [vault_tool, "WebSearch", "WebFetch", "mcp__books__list_books", "mcp__books__book_contents",
               "mcp__books__read_pages", "mcp__books__search_book"]

    async def guard(tool_name, tool_input, context):
        if tool_name in allowed:
            return PermissionResultAllow()
        return PermissionResultDeny(message=f"{tool_name} is not permitted on this server.")

    async def _stream(text: str):
        yield {"type": "user", "message": {"role": "user", "content": text}}

    async def run(prompt: str, data: dict, system: str, label: str, max_turns: int, budget: float) -> str | None:
        options = ClaudeAgentOptions(
            model=pick_model(data, default_model),
            system_prompt=system,
            mcp_servers={"vault": vault_mcp, "books": books_mcp},
            allowed_tools=allowed,
            can_use_tool=guard,
            max_turns=max_turns,
            max_budget_usd=budget,
            effort=EFFORT_BY_LABEL.get(label),
            # Same isolation as server.options_for: no settings, CLAUDE.md, skills,
            # hooks or .mcp.json; only the servers above are live.
            setting_sources=[],
            strict_mcp_config=True,
            cwd=os.path.dirname(os.path.abspath(__file__)),
        )
        parts: list[str] = []
        final = None
        try:
            async for msg in query(prompt=_stream(prompt), options=options):
                if isinstance(msg, AssistantMessage):
                    parts.extend(b.text for b in msg.content if isinstance(b, TextBlock))
                elif isinstance(msg, ResultMessage):
                    final = msg.result or final
                    print(f"[{label}] turns={msg.num_turns} cost_usd={msg.total_cost_usd}", flush=True)
        except Exception as exc:  # noqa: BLE001 - never an HTML 500
            print(f"[{label}] agent failed: {type(exc).__name__}: {exc}", flush=True)
            return None
        return (final or "".join(parts)).strip() or None

    def _fail(status: int, error: str) -> web.Response:
        return web.json_response({"error": error}, status=status)

    async def _body(request: web.Request):
        try:
            return await request.json()
        except Exception:  # noqa: BLE001
            return None

    async def status(request: web.Request) -> web.Response:
        if not local_allowed(request):
            raise web.HTTPNotFound()
        return web.json_response({"ok": books_root() is not None})

    async def ask(request: web.Request) -> web.Response:
        if not local_allowed(request):
            raise web.HTTPNotFound()
        data = await _body(request)
        err, payload = validate_ask(data)
        if err:
            return _fail(400, err)
        text = await run(build_ask_prompt(payload), data, LOCAL_ASK_SYSTEM, "/local/ask",
                         ASK_MAX_TURNS, ASK_BUDGET_USD)
        if text is None:
            return _fail(503, learn.ERR_BACKEND)
        return web.json_response({"answer": learn.tidy(text)})

    async def cards(request: web.Request) -> web.Response:
        if not local_allowed(request):
            raise web.HTTPNotFound()
        data = await _body(request)
        err, payload = learn.validate_cards_request(data)
        berr, book = parse_book((data or {}).get("book") if isinstance(data, dict) else None)
        if err or berr or book is None:
            return _fail(400, err or berr or ERR_BOOK)
        text = await run(learn.build_cards_prompt(payload, learn_book_guidance(book)), data,
                         learn.LEARN_CARDS_SYSTEM, "/local/learn/cards", LEARN_MAX_TURNS, LEARN_BUDGET_USD)
        if text is None:
            return _fail(503, learn.ERR_BACKEND)
        parsed = learn.parse_cards_output(text, payload["count"], payload["avoid"])
        if parsed is None:
            return _fail(503, learn.ERR_UNREADABLE)
        return web.json_response({"cards": parsed})

    async def quiz(request: web.Request) -> web.Response:
        if not local_allowed(request):
            raise web.HTTPNotFound()
        data = await _body(request)
        berr, book = parse_book((data or {}).get("book") if isinstance(data, dict) else None)
        if berr or book is None:
            return _fail(400, berr or ERR_BOOK)
        body = dict(data)
        if not str(body.get("request") or "").strip() and not body.get("cards"):
            body["request"] = f"A practice test on {book['pages'] or 'this book'}."
        err, payload = learn.validate_quiz_request(body)
        if err:
            return _fail(400, err)
        text = await run(learn.build_quiz_prompt(payload, learn_book_guidance(book)), data,
                         learn.LEARN_QUIZ_SYSTEM, "/local/learn/quiz", LEARN_MAX_TURNS, LEARN_BUDGET_USD)
        if text is None:
            return _fail(503, learn.ERR_BACKEND)
        parsed = learn.parse_quiz_output(text, payload["mcCount"], payload["shortCount"], payload["avoid"])
        if parsed is None:
            return _fail(503, learn.ERR_UNREADABLE)
        return web.json_response({"questions": parsed})

    return {"status": status, "ask": ask, "cards": cards, "quiz": quiz}
