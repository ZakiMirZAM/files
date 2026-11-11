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
numbers (page 1 is the first page of the file).

Routes (added by server.py, all 404 unless local_allowed(request)):
  GET  /local/status        -> {"ok": true}
  POST /local/ask           {question, book?, page?, history?, model?, mode?} -> {answer}
                            mode "tutor" (Learn page only): LOCAL_TUTOR_SYSTEM, longer history
  POST /local/learn/cards   /learn/cards body + book {id, pages?}      -> {cards}
  POST /local/learn/quiz    /learn/quiz body + book {id, pages?}       -> {questions}
                            style "socratic": SOCRATIC_QUIZ_GUIDANCE added; the book is then optional

The cards and quiz routes use the owner-approved LEARN_*_SYSTEM prompts unchanged;
the book to read rides in the user message. LOCAL_ASK_SYSTEM, LOCAL_TUTOR_SYSTEM and
SOCRATIC_QUIZ_GUIDANCE are new
(hash-pinned in test_prompts.py, owner approval required to change).

Why the guard is strict: the production AI server runs on this same PC behind
the Cloudflare tunnel and nginx. These routes answer only when this process was
started with LOCAL_BOOKS=1, the Host is localhost/127.0.0.1, and the request
carries no forwarding header (nginx and the tunnel always add one).
"""
from __future__ import annotations

import asyncio
import importlib.util
import os
import re
import threading
from collections import OrderedDict
from pathlib import Path

from aiohttp import web

import learn

# --- prompt (owner approval required to change; hash in test_prompts.py) --------
LOCAL_ASK_SYSTEM = """\
You answer questions for a reader who studies finance, accounting, economics and investing from the books on their own computer. You can read those books with four tools: list_books finds a book by words in its title, book_contents gives its chapters with page numbers, read_pages returns the text of a range of pages, and search_book finds the pages that mention given words. The user message may name the books the reader picked or mentioned with @, and the reader's last questions with your answers.

HOW TO WORK
1. When a question is about a book or what a book teaches, read the book before you answer. Find the chapter with book_contents or search_book, then read its pages with read_pages. Answer from the text you read, not from memory, and read more pages when the first ones do not settle the question.
2. When the reader pastes test questions they got wrong, take them one at a time: say what the question tests, why the correct answer is right, and what mistake the reader's answer makes.
3. Use search_vault or the web for a point the books do not cover, and general knowledge last. Never refuse.
4. Never invent a figure, a formula or a quotation. When a page has no readable text (a scanned page), say so.

ANSWER SHAPE
- Get straight to the point. The first sentence is the answer. No preamble and no restatement of the question.
- The support follows: the reasoning, each formula with every variable defined, and worked numbers where they help.
- When the question has two sides, give the strongest opposing view after the support.
- Give the depth the question needs, with no filler.

NO CITATIONS (hard rule)
The reader knows the answer comes from their books. Do not spend words on the source: no book titles, authors, chapter, module or page numbers, no "the book says", "according to" or "the text explains", no Sources line, reference list or URL. State the idea itself. Name a page only when the reader asks where something is.

STYLE (hard rules)
Plain words. Define a term the first time it appears and reuse the same word for the same idea. Keep formulas exact. No headings. No em dashes or en dashes: use a period, a comma or parentheses. Straight quotes only. No analogies or metaphors. No filler words (crucial, key, pivotal, landscape, robust, delve, underscore, showcase). No conversational openers or closings and no upbeat closing paragraph: the last line is the final substantive point."""

# The Jane Street socratic-tutor skill (github.com/janestreet/agent_skills,
# socratic-tutor/SKILL.md), WORD FOR WORD (owner: "use the exact skill"). The
# YAML front matter is left out. Learn page only (Ask AI tab Tutor mode and the
# test debrief); never the sidebar chat, /ask or the question decks.
SOCRATIC_TUTOR_SKILL = """# Socratic Tutor

Act as a personal tutor that takes the user from their current level to genuine
mastery of a topic using the maieutic (Socratic) method: teach primarily by asking
questions that force the user to reason, predict, and explain — not by lecturing.

## Guard: confirm intent before starting

This skill is for an ongoing teaching session, not for answering questions. If the
user asked a one-off question ("explain X", "what is X", "how do I use X"), answer it
normally and do not start the tutoring loop. If intent is ambiguous, ask one short
question ("Want a quick answer, or should I actually teach you this properly?") before
launching the diagnostic. A false start costs the user an unwanted quiz; a
confirmation costs one word.

## Session start

1. Break the topic into 4-10 concrete subskills (fewer for narrow topics). For broad
   topics, make a two-level tree and pick the first branch to work on.
2. Tell the user that you will start by asking a few questions, one at a time, to see
   what they already know.
3. Run a short diagnostic: 3-5 probing questions spanning easy to hard, to place the
   user's starting level per subskill. Do not teach anything until the diagnostic is
   done.
4. Show the initial skill map (format below) and propose where to start. Let the user
   override.


## Skill map

Track each subskill at levels 0-5:

    0 unaware . 1 heard of it . 2 can follow along . 3 can do with help
    4 can do independently . 5 can teach it / handle edge cases

Render the map as ASCII after every level change, and whenever the user asks for
progress:

    Topic: <topic>                          overall: ######.... 58%
    -----------------------------------------------------------------
    subskill A            [########..]  4/5  * independent
    subskill B            [######....]  3/5  <- current focus
    subskill C            [##........]  1/5
    -----------------------------------------------------------------

Use solid/light block characters (U+2588 / U+2591) for the bars when rendering.

## Teaching loop (repeat per subskill)

- Ask ONE question at a time. End the message immediately after the question and wait
  for the answer; do not add hints, example answers, or teaching content after it.
- Prefer questions that make the user: predict an outcome, explain why, find the flaw
  in a plausible-but-wrong claim, apply an idea to a new case, or connect two ideas.
- When the user is wrong, do not give the answer. Ask a narrower question that exposes
  the contradiction in their reasoning. Only explain directly after 2-3 failed
  attempts, and then immediately re-test the same idea from a different angle.
- When the user is right, occasionally play devil's advocate ("are you sure? what
  about X?") — they should be able to defend correct answers under pressure.
- Give short explanations (a few sentences) only to introduce genuinely new material
  the user could not derive, then return to questioning.
- Where tools are available and relevant, set practical exercises (e.g. "write a
  query that...", "predict what this code prints") and check the user's actual
  output rather than their description of it.

## Evaluation rules — be strict

- Levels are earned, not given. Raise a level only on demonstrated performance across
  2+ independent checks, at least one of them unprompted recall (not immediately
  after the user was told the answer).
- A vague or partially-correct answer is not correct. Probe until you know whether
  the user actually understands. Do not attribute to the user any insight they did
  not actually express.
- Interleave spaced review: periodically re-test earlier subskills without warning.
  If the user fails a review, lower the level and revisit.
- Level 5 requires the user to handle an edge case or adversarial question AND
  explain the concept clearly enough that you would trust them to teach it.
- Do not flatter. "Not quite — why would X happen if Y were true?" beats "Great
  try!".

## Mastery and completion

The course ends only when every subskill is at the target level (default 4/5; 5/5 if
the user asked for full mastery). Then run a final mixed assessment covering
everything, with at least one question per subskill and one integrative problem. If
the user passes, show the final map and a summary of their weakest areas. If not,
back to the loop.

## Commands the user can use anytime

- "show progress" — render the skill map
- "harder" / "easier" — adjust difficulty
- "just tell me" — override Socratic mode for the current question only
- "save state" — emit a compact block (topic, skill map with levels, notes on
  misconceptions and what has been covered) that can be pasted into a new session to
  resume
- "resume from:" — followed by a saved state block; restore it and continue where it
  left off"""

TUTOR_LOCAL_RULES = """LOCAL RULES FOR THIS APP
The rules above are the tutoring method. These rules add what this app needs.

TOOLS
You can read the reader's books with four tools: list_books finds a book by words in its title, book_contents gives its chapters with page numbers, read_pages returns the text of a range of pages, and search_book finds the pages that mention given words. Before you write a question or judge an answer, read the pages that teach the idea, so that every question, every correct answer and every explanation agrees with the text. Use search_vault or the web for a point the books do not cover, and general knowledge last. Never invent a figure, a formula or a quotation. The user message may name the books the reader picked or mentioned with @, and the earlier turns of this session. You cannot run code, so a practical exercise is a calculation with worked numbers that the reader does and reports.

WHEN THE READER ASKS FOR THE ANSWER
Keep the rules above: by default, do not give the answer to a wrong or incomplete answer. The reader decides when to see it. When the reader asks for the answer ("show the answer", "just tell me", "what is the answer", or similar), reply in this order, in one message:
1. Why the reader's answer was wrong, or what it left out.
2. A correct example answer to the exact question asked, on its own line that starts with "Example answer:". Write it as the full answer the reader could have given, in a few sentences, with the worked numbers when the question has numbers.
3. The next question.
An answer the reader asked for does not count as their own recall: test the same idea again later from a different angle.

TEST RESULTS
When the message holds the reader's results from a test (each question, the reader's answer, the correct answer, and the score), do this first, in one message:
1. A summary: the score, what the reader knows well, and each weak area with the exact misunderstanding the wrong answers show. Group the questions by subskill.
2. A skill map built from the results.
3. One question: does the reader want to work on the weak areas now?
If the reader says yes, start the teaching loop on the weakest subskill, with new questions that are not copies of the test questions.

NO CITATIONS (hard rule)
The reader knows the material comes from their books. Do not spend words on the source: no book titles, authors, chapter, module or page numbers, no "the book says", "according to" or "the text explains", no Sources line, reference list or URL. Name a page only when the reader asks where something is.

STYLE (hard rules)
Plain words. Define a term the first time it appears and reuse the same word for the same idea. Keep formulas exact, with every variable defined. No headings in your messages. No em dashes or en dashes: use a period, a comma or parentheses. Straight quotes only. No analogies or metaphors. No filler words (crucial, key, pivotal, landscape, robust, delve, underscore, showcase). No upbeat closing paragraph."""

LOCAL_TUTOR_SYSTEM = SOCRATIC_TUTOR_SKILL + "\n\n" + TUTOR_LOCAL_RULES

# Added to a Learn test request when the reader picks "Socratic questions".
SOCRATIC_QUIZ_GUIDANCE = """

SOCRATIC STYLE
Write the questions in the Socratic style. Each question makes the reader do one of these: predict an outcome, explain why something is true, find the flaw in a claim that sounds right but is wrong, apply an idea to a new case, or connect two ideas. Use worked numbers when the subject is numerical. Do not ask for a definition that the reader can repeat from memory. In multiple choice, each wrong choice is a mistake a real learner makes."""

PROMPTS = {"LOCAL_ASK_SYSTEM": LOCAL_ASK_SYSTEM, "LOCAL_TUTOR_SYSTEM": LOCAL_TUTOR_SYSTEM,
           "SOCRATIC_QUIZ_GUIDANCE": SOCRATIC_QUIZ_GUIDANCE}

EFFORT_BY_LABEL = {"/local/ask": "medium", "/local/tutor": "medium", "/local/learn/cards": "medium", "/local/learn/quiz": "medium"}
ASK_MAX_TURNS, ASK_BUDGET_USD = 30, 4.0
LEARN_MAX_TURNS, LEARN_BUDGET_USD = 30, 4.0
FAST_MAX_TURNS = 3             # the book text is in the prompt: write, no tool round trips

# --- limits ----------------------------------------------------------------------
MAX_QUESTION = 12_000          # room for a pasted list of wrong test answers
MAX_BOOKS = 5                  # books one question may reference
SOURCE_MAX_CHARS = 160_000     # book text put in one deck/test request (about 40k tokens)
MAX_SLICES = 8                 # batches that may split one page range
MAX_HISTORY_TURNS, MAX_HISTORY_CHARS = 4, 1_500
# Tutor mode: a session needs the diagnostic answers and the latest skill map.
TUTOR_HISTORY_TURNS, TUTOR_HISTORY_CHARS = 12, 4_000
MAX_TUTOR_QUESTION = 40_000      # a finished test's full results
MAX_PAGES_PER_READ, MAX_READ_CHARS = 25, 80_000
MAX_LIST, MAX_TOC, MAX_HITS, SNIPPET = 40, 400, 15, 320
TEXT_CACHE_BOOKS = 4

ERR_QUESTION = "question is required"
ERR_QUESTION_LONG = "question is too long"
ERR_BOOK = "book must be {id, pages?} naming a PDF in the Books folder"

_LOCAL_HOST_RE = re.compile(r"^(localhost|127\.0\.0\.1)(:\d{1,5})?$", re.IGNORECASE)
_FORWARD_HEADERS = ("x-forwarded-for", "x-real-ip", "cf-connecting-ip", "cf-ray", "forwarded")


# --- guard -----------------------------------------------------------------------
def local_allowed(request: web.Request) -> bool:
    if os.environ.get("LOCAL_BOOKS", "").strip() != "1":
        return False
    if any(h in request.headers for h in _FORWARD_HEADERS):
        return False
    return bool(_LOCAL_HOST_RE.match(request.headers.get("Host", "")))


# --- the Books folders: one set of rules, shared with the backend's book list ----
# Loaded from backend/local_books.py by path (rag/ and backend/ are separate
# processes with no shared package), so the list the page shows and the books the
# AI can open never differ. `roots` below is that module's folder list.
def _load_shelf_rules():
    path = Path(__file__).resolve().parent.parent / "backend" / "local_books.py"
    spec = importlib.util.spec_from_file_location("ife_local_books", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_shelf = _load_shelf_rules()
books_roots = _shelf.books_roots
books_root = _shelf.books_root
resolve_book = _shelf.resolve_book
book_id = _shelf.book_id


def list_book_files(roots) -> list[Path]:
    """Every book PDF, one per book, sorted by file name."""
    return [path for _id, path, _size in _shelf.shelf(roots)]


# --- page text, cached per book ----------------------------------------------------
_cache: "OrderedDict[tuple[str, float], list[str]]" = OrderedDict()
_cache_lock = threading.Lock()
_extract_locks: dict[tuple[str, float], threading.Lock] = {}


def page_texts(path: Path) -> list[str]:
    """Text of every page (index 0 = PDF page 1). Cached for the last few books."""
    import fitz  # PyMuPDF; imported lazily so the server starts without it

    key = (str(path), path.stat().st_mtime)
    with _cache_lock:
        if key in _cache:
            _cache.move_to_end(key)
            return _cache[key]
        book_lock = _extract_locks.setdefault(key, threading.Lock())
    # One extraction per book: parallel batches on the same book wait for the first.
    with book_lock:
        with _cache_lock:
            if key in _cache:
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


# --- fast path: the server reads the pages once --------------------------------------
# Decks and tests used to let the model find and read the pages through the tools on
# every batch, which took about two minutes a batch. When the request names pages or
# a chapter, the server now finds the range, reads that text itself (well under a
# second once the book is cached) and puts it in the request, and the model only writes.
_NUM_WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8,
              "nine": 9, "ten": 10}
_ROMAN = {"i": 1, "ii": 2, "iii": 3, "iv": 4, "v": 5, "vi": 6, "vii": 7, "viii": 8, "ix": 9, "x": 10}
_NUM = r"(\d{1,3}|[ivx]{1,4}|one|two|three|four|five|six|seven|eight|nine|ten)"


def _num(tok: str | None) -> int | None:
    if not tok:
        return None
    t = tok.lower()
    if t.isdigit():
        return int(t)
    return _NUM_WORDS.get(t) or _ROMAN.get(t)


def _roman(n: int) -> str:
    return next((k for k, v in _ROMAN.items() if v == n), str(n))


def _unit_start(path: Path, kind: str, k: int) -> int | None:
    """First PDF page of chapter / module / part `k`: from the outline, else from a
    heading at the top of a page (contents pages, which list many units, skipped)."""
    import fitz

    forms = {str(k), _roman(k)} if kind == "part" else {str(k)}
    alt = "|".join(re.escape(f) for f in forms)
    head = re.compile(rf"^\s*(?:learning\s+)?{kind}\s+(?:{alt})\b", re.I)
    with fitz.open(path) as doc:
        toc = doc.get_toc(simple=True)
    for _lvl, title, page in toc:
        if page > 0 and head.search(title.replace("\t", " ")):
            return page
    texts = page_texts(path)
    listing = re.compile(rf"(?:learning\s+)?{kind}\s+\w+", re.I)
    tops = [[ln.strip() for ln in t.strip().splitlines()[:6] if ln.strip()] for t in texts]
    # 1. A short heading line: "CHAPTER 3", "Part II", "Learning Module 1 Rates and Returns".
    #    Short, so a sentence that starts "Chapter 1 described..." does not count.
    def is_contents(text: str, top: list[str]) -> bool:
        return len(listing.findall(text)) >= 3 or any("contents" in ln.lower() for ln in top[:2])

    for i, (text, top) in enumerate(zip(texts, tops), 1):
        if top and not is_contents(text, top) and any(len(ln) <= 50 and head.search(ln) for ln in top):
            return i
    # 2. A bare number on the first line ("2" then the chapter title; "I" for a part),
    #    unless the next line is a running header that repeats through the book.
    from collections import Counter

    second = Counter(top[1] for top in tops if len(top) > 1)
    common = {line for line, c in second.items() if c >= max(8, len(texts) // 40)}
    # A part opens with its Roman numeral; a bare Arabic number there is a chapter.
    bare = {_roman(k).lower()} if kind == "part" else {str(k)}
    for i, top in enumerate(tops, 1):
        # "Il" for "II": a scanned Roman numeral often reads its I as a lowercase L.
        if len(top) < 2:
            continue
        first = top[0].lower().replace("l", "i") if kind == "part" else top[0].lower()
        if first in bare and top[1] not in common \
                and not top[1][:1].isdigit():
            return i
    return None


def page_range(path: Path, pages: str) -> tuple[int, int] | None:
    """(first, last) PDF page for "pages 41 to 56", "11-52", "Chapter 1",
    "Learning Module 1", "chapters 1 to 8" or "Part I"; None when it cannot tell."""
    n = len(page_texts(path))
    t = (pages or "").lower().replace("–", "-")
    m = re.search(r"(?:pages?|pp?\.?)\s*(\d+)\s*(?:-|to|through)\s*(\d+)", t) or \
        re.fullmatch(r"\s*(\d+)\s*(?:-|to)\s*(\d+)\s*", t)
    if m:
        a, b = sorted((int(m.group(1)), int(m.group(2))))
        return (max(1, a), min(n, b)) if a <= n else None
    for kind, pat in (("chapter", r"chapters?"), ("module", r"(?:learning\s+)?modules?"), ("part", r"parts?")):
        m = re.search(rf"\b{pat}\s+{_NUM}(?:\s*(?:-|to|through|and)\s*{_NUM})?\b", t)
        if not m:
            continue
        a = _num(m.group(1))
        b = _num(m.group(2)) or a
        if not a:
            continue
        start = _unit_start(path, kind, a)
        if not start:
            continue
        nxt = _unit_start(path, kind, b + 1)
        end = nxt - 1 if nxt and nxt > start else min(n, start + 59)
        return start, end
    return None


def slice_range(first: int, last: int, index: int, of: int) -> tuple[int, int]:
    """The `index`-th of `of` contiguous, near-equal parts of the page range."""
    total = last - first + 1
    of = max(1, min(of, total))
    index = max(0, min(index, of - 1))
    a = first + (total * index) // of
    b = first + (total * (index + 1)) // of - 1
    return a, max(a, b)


def source_text(path: Path, first: int, last: int, max_chars: int = 0) -> str:
    max_chars = max_chars or SOURCE_MAX_CHARS
    texts = page_texts(path)
    parts, total = [], 0
    for p in range(first, last + 1):
        body = " ".join(texts[p - 1].split())
        if not body:
            continue
        block = f"--- page {p} ---\n{body}"
        if total + len(block) > max_chars:
            parts.append(f"(the text stops here, before page {p}, to keep the request small)")
            break
        parts.append(block)
        total += len(block)
    return "\n".join(parts)


def parse_slice(raw) -> tuple[int, int]:
    """{index, of} from a request: which share of the page range this batch covers."""
    if isinstance(raw, dict):
        i, o = learn._whole(raw.get("index")), learn._whole(raw.get("of"))
        if i is not None and o is not None and 1 <= o <= MAX_SLICES and 0 <= i < o:
            return i, o
    return 0, 1


def source_guidance(book: dict, first: int, last: int, text: str) -> str:
    label = book["name"] or book["id"]
    return (f'\n\nSOURCE ON THIS COMPUTER\nThe text below is pages {first} to {last} of the book "{label}", '
            "the part this batch covers. Write every card or question from this text and its own wording. "
            "No tool is available for this batch and none is needed: everything you need is below. "
            "Spread the batch across the whole text, not only its first pages.\n\n<<<BOOK TEXT\n"
            + text + "\nBOOK TEXT>>>")


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
        parts.append(f"The reader is looking at page {page}.")
    return " ".join(parts)


def learn_book_guidance(book: dict) -> str:
    return ("\n\nSOURCE ON THIS COMPUTER\n" + book_note(book) + " This book is the primary source for this "
            "batch: read it with the book tools (book_contents, read_pages, search_book) before writing, and "
            "write from its text and its own wording. Use search_vault or the web only to confirm a fact.")


def validate_ask(data) -> tuple[str | None, dict | None]:
    if not isinstance(data, dict):
        return ERR_QUESTION, None
    tutor = data.get("mode") == "tutor"
    q = data.get("question")
    q = q.strip() if isinstance(q, str) else ""
    if not q:
        return ERR_QUESTION, None
    if len(q) > (MAX_TUTOR_QUESTION if tutor else MAX_QUESTION):
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
    turns, chars = (TUTOR_HISTORY_TURNS, TUTOR_HISTORY_CHARS) if tutor else (MAX_HISTORY_TURNS, MAX_HISTORY_CHARS)
    history = []
    for t in (data.get("history") or [])[-turns:] if isinstance(data.get("history"), list) else []:
        if isinstance(t, dict) and isinstance(t.get("question"), str) and isinstance(t.get("answer"), str):
            # A tutor turn keeps its END: the skill map and the open question are last.
            history.append({"question": t["question"][-chars:] if tutor else t["question"][:chars],
                            "answer": t["answer"][-chars:] if tutor else t["answer"][:chars]})
    return None, {"question": q, "book": books[0] if books else None, "books": books,
                  "page": page if page and page > 0 else None, "history": history, "tutor": tutor}


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
def make_handlers(pick_model, default_model: str, vault_mcp, vault_tool: str, verifier=None) -> dict:
    """Routes bound to server.py's vault server and model switch (injected, as in
    learn.make_handlers, because server.py runs as __main__). `verifier` is the
    RARR module (rag/verify.py): each /local/ask answer gets the same Tier 0 pass
    as /ask. With no page data block, its useful part here is the arithmetic check."""
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

    def _root_or_err() -> tuple[list[Path] | None, str | None]:
        roots = books_roots()
        return (roots, None) if roots else (None, "The Books folder was not found on this computer.")

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
        pdfs = await asyncio.to_thread(list_book_files, root)
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
          "per call). Page numbers are PDF page numbers, as book_contents shows them.",
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

    async def no_tools(tool_name, tool_input, context):
        return PermissionResultDeny(message="No tool is available for this request.")

    async def run(prompt: str, data: dict, system: str, label: str, max_turns: int, budget: float,
                  tools: bool = True) -> str | None:
        # tools=False: the book text is already in the prompt (fast path), so no
        # tool round trips; a tool call is denied and the model writes at once.
        options = ClaudeAgentOptions(
            model=pick_model(data, default_model),
            system_prompt=system,
            mcp_servers={"vault": vault_mcp, "books": books_mcp} if tools else {},
            allowed_tools=allowed if tools else [],
            disallowed_tools=[] if tools else ["WebSearch", "WebFetch"],
            can_use_tool=guard if tools else no_tools,
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

    async def _fast_source(book: dict, data: dict) -> tuple[str, str] | None:
        """(guidance with the book text, label) when the pages can be found, else None."""
        if not book.get("pages"):
            return None
        roots = books_roots()
        path = resolve_book(roots, book["id"]) if roots else None
        if path is None:
            return None
        try:
            rng = await asyncio.to_thread(page_range, path, book["pages"])
            if not rng:
                return None
            index, of = parse_slice(data.get("slice"))
            first, last = slice_range(rng[0], rng[1], index, of)
            text = await asyncio.to_thread(source_text, path, first, last)
        except Exception as exc:  # noqa: BLE001 - fall back to the tools
            print(f"[book_tools] fast path failed: {type(exc).__name__}: {exc}", flush=True)
            return None
        if len(text) < 200:          # scanned pages with no text layer: let the tools try
            return None
        return source_guidance(book, first, last, text), f"pages {first}-{last}"

    async def _body(request: web.Request):
        try:
            return await request.json()
        except Exception:  # noqa: BLE001
            return None

    async def status(request: web.Request) -> web.Response:
        if not local_allowed(request):
            raise web.HTTPNotFound()
        return web.json_response({"ok": bool(books_roots())})

    async def ask(request: web.Request) -> web.Response:
        if not local_allowed(request):
            raise web.HTTPNotFound()
        data = await _body(request)
        err, payload = validate_ask(data)
        if err:
            return _fail(400, err)
        # Tutor mode (Learn page only): the Socratic tutor prompt, same tools.
        system, label = (LOCAL_TUTOR_SYSTEM, "/local/tutor") if payload["tutor"] else (LOCAL_ASK_SYSTEM, "/local/ask")
        text = await run(build_ask_prompt(payload), data, system, label, ASK_MAX_TURNS, ASK_BUDGET_USD)
        if text is None:
            return _fail(503, learn.ERR_BACKEND)
        answer = learn.tidy(text)
        payload = {"answer": answer}
        if verifier is not None:
            report = verifier.tier0(answer, "", [])
            verifier.log_line(label, report)
            if report:
                payload["verification"] = verifier.public(report)
        return web.json_response(payload)

    async def cards(request: web.Request) -> web.Response:
        if not local_allowed(request):
            raise web.HTTPNotFound()
        data = await _body(request)
        err, payload = learn.validate_cards_request(data)
        berr, book = parse_book((data or {}).get("book") if isinstance(data, dict) else None)
        if err or berr or book is None:
            return _fail(400, err or berr or ERR_BOOK)
        fast = await _fast_source(book, data)
        if fast:
            print(f"[/local/learn/cards] fast path, {fast[1]}", flush=True)
            text = await run(learn.build_cards_prompt(payload, fast[0]), data, learn.LEARN_CARDS_SYSTEM,
                             "/local/learn/cards", FAST_MAX_TURNS, LEARN_BUDGET_USD, tools=False)
        else:
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
        # "Socratic questions" (Learn test builder) may come with no book: the
        # model then uses the vault and the web, as /learn/quiz does.
        socratic = isinstance(data, dict) and data.get("style") == "socratic"
        if berr or (book is None and not socratic):
            return _fail(400, berr or ERR_BOOK)
        body = dict(data)
        if book and not str(body.get("request") or "").strip() and not body.get("cards"):
            body["request"] = f"A practice test on {book['pages'] or 'this book'}."
        err, payload = learn.validate_quiz_request(body)
        if err:
            return _fail(400, err)
        style = SOCRATIC_QUIZ_GUIDANCE if socratic else ""
        fast = await _fast_source(book, data) if book else None
        if fast:
            print(f"[/local/learn/quiz] fast path, {fast[1]}", flush=True)
            text = await run(learn.build_quiz_prompt(payload, fast[0] + style), data, learn.LEARN_QUIZ_SYSTEM,
                             "/local/learn/quiz", FAST_MAX_TURNS, LEARN_BUDGET_USD, tools=False)
        else:
            guidance = (learn_book_guidance(book) if book else "") + style
            text = await run(learn.build_quiz_prompt(payload, guidance), data,
                             learn.LEARN_QUIZ_SYSTEM, "/local/learn/quiz", LEARN_MAX_TURNS, LEARN_BUDGET_USD)
        if text is None:
            return _fail(503, learn.ERR_BACKEND)
        parsed = learn.parse_quiz_output(text, payload["mcCount"], payload["shortCount"], payload["avoid"])
        if parsed is None:
            return _fail(503, learn.ERR_UNREADABLE)
        return web.json_response({"questions": parsed})

    return {"status": status, "ask": ask, "cards": cards, "quiz": quiz}
