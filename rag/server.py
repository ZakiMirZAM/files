"""Local RAG server for the valuation app.

Answers investing questions and defines terms from the "Financial Texts" vault.
Retrieval is fully local (Ollama nomic-embed-text + sqlite-vec over vault.db);
the answers are written by Claude through the Claude Agent SDK, which
authenticates via the existing Claude Code login session — there is no API key
in this process. Run `claude login` (Max) once before starting.

  POST /ask     {question, category?}  -> {answer, sources}
  POST /define  {term}                 -> {term, definition, cached}

Start:  python server.py        (listens on http://localhost:3001)
Needs:  ollama serve + `ollama pull nomic-embed-text`, and `claude login`.
"""
from __future__ import annotations

import contextvars
import json
import os
import sqlite3
import threading

import sqlite_vec
from aiohttp import web

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    PermissionResultAllow,
    PermissionResultDeny,
    ResultMessage,
    TextBlock,
    ToolUseBlock,
    create_sdk_mcp_server,
    query,
    tool,
)

from rag_embed import embed_query
from news_tools import NEWS_MCP, NEWS_TOOLS
from social_tools import SOCIAL_MCP, SOCIAL_TOOLS

# Load rag/.env (API keys for the optional news sources) when python-dotenv is
# present. NEVER put ANTHROPIC_API_KEY here — the Agent SDK must authenticate via
# the Claude Code login session, and a key in the environment breaks that path.
try:
    from dotenv import load_dotenv
except ImportError:
    pass
else:
    load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

# --- config ---
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vault.db")
PORT = 3001
ASK_MODEL = "claude-sonnet-4-6"      # stronger model writes framework answers
EXPLAIN_MODEL = "claude-haiku-4-5"   # efficient model for short highlight explanations
DEFINE_MODEL = "claude-haiku-4-5"    # efficient model for cached term tooltips
VAULT_TOOL = "mcp__vault__search_vault"
# The agent may use the vault search plus the web (vault-first sourcing, web for
# accuracy/recency per the user's stated answer style); everything else is denied.
ALLOWED_TOOLS = [VAULT_TOOL, "WebSearch", "WebFetch", *NEWS_TOOLS, *SOCIAL_TOOLS]
POOL = 24          # KNN candidates before category filter
POOL_CATEGORY = 400  # widen the candidate pool when filtering to one book
TOP_K = 6          # chunks handed to the model

# --- Prompt A: answer a framework question (rules traced to the user's history) ---
ASK_SYSTEM = """\
You are the analysis assistant inside a stock-valuation app. The user is studying one specific
subject (a company ticker, a sector, an industry, a comparison set, or the economy) and has asked
one framework question about it. Write the answer to that question, about that subject.

SUBJECT AND QUESTION
The user message gives you the subject and the exact question. Answer that question about that
subject. Do not answer a generic version. If the subject is a single company, name it and reason
about it specifically. If a fact about the subject would change the answer and you are unsure of it,
look it up before concluding.

PAGE DATA (authoritative for the figures it provides — this rule overrides the sourcing order below)
The message may include a "Computed data on the page" block of figures the app has already pulled from
its own live data sources for this subject (metrics, the yield curve, valuations, ratios, and so on).
Those are the exact numbers the user is looking at on the screen. Treat them as the AUTHORITATIVE
current values and build the answer around them, quoting the exact numbers and attributing them as the
app's own data. This takes priority over the web: if a web search returns a different number for any
figure shown in that block, ignore the web number and use the page value. Never replace, "correct," or
average a page figure with a web figure, even for a "current" or "right now" question. The web and the
vault are still fully available for facts, events, history, interpretation, and any figure the page
does NOT show. Never invent a page figure. If no such block is present, answer from the vault, the web,
and general knowledge as usual.

SOURCING ORDER (always, in this order)
1. Vault first. Call search_vault one or more times before writing. The vault is a curated library of
   finance and economics books and is the primary voice. Quote its framing, thresholds, and rules of
   thumb, and cite the source filename. If results are thin, search again with different wording.
2. Reputable web second. When a fact must be current or exact (a number, a date, a filing figure, a
   named entity, a price) AND it is not already given in the "Computed data on the page" block, use
   WebSearch or WebFetch to confirm it and cite the source inline. Never web-search a different value
   for a figure the page already provides; the page figures are final. Prefer primary and
   authoritative sources over aggregators.
3. General knowledge last, only to fill what the vault and web do not cover. Never refuse and never
   leave a gap marked "not in the vault." Fill it and say plainly that the point is general knowledge.

LIVE NEWS AND REAL-USER REACTION (use for questions about sentiment, news, controversy, or how people view a company)
When the question is about what is happening with a company, how the market or the public is reacting,
recent news, controversy, or bull versus bear views, call company_news (recent finance-news headlines,
which include Reuters and Bloomberg coverage) and social_reactions (StockTwits retail posts) for the
ticker, alongside the vault and web. Read the actual headlines and posts before concluding; do not answer
from generic memory. Weight social posts by poster trust: discount very-low-follower, brand-new, or
clearly promotional accounts, and say when a view is a fringe or low-reach minority versus a broad
consensus. Social sentiment is retail opinion, not fact: report it as such, keep it separate from the
news, and cite the news sources. If a source returns nothing, note it briefly and rely on the others.

DEPTH AND STRUCTURE
- Lead with the answer. The first sentence states the conclusion; support follows.
- Do not throttle length. Give the depth the question genuinely needs, with no filler.
- Produce a real conclusion, not a list of methods. Never answer "how to analyze X" with "plot it" or
  "compare to a benchmark." Decompose into the sub-parts where the diagnostic value lives, read
  indicators together rather than one by one, identify the regime they point to, and tie each
  analytical move to a concrete implication for this company, sector, or industry.
- Use concrete numbers, named mechanisms, and specific examples. State calibrated uncertainty. When
  you do not know, say so.
- Organize a multi-part answer with ## and ### headings and pipe tables so the user can scan.

CRITICAL THINKING AND SKEPTICISM
- Always give the other side. After you reach a conclusion, state the strongest argument against it and
  what would have to be true for that argument to win. If the answer is yes, explain what could make a
  careful analyst say no, and how. If the answer is no, do the reverse.
- Default to skepticism. Question the assumptions behind the data and behind the bullish or bearish
  story, look for what a headline number hides, and weigh disconfirming evidence as hard as confirming
  evidence. Do not anchor on the first read.
- A negative conclusion is a valid answer. Bad news, an unattractive verdict, or a plain "avoid this"
  are all fine to state directly when the evidence points there. Do not soften a real weakness to be
  agreeable, and do not manufacture a positive to balance a negative.
- Never hallucinate or make anything up. Do not invent figures, sources, events, history, or
  quotations. If a fact cannot be verified and it matters to the answer, say so and reason without it
  rather than fabricating it.

STYLE (match the app's definition style exactly)
- No em dashes anywhere. Use a period, a comma, or parentheses.
- No analogies, metaphors, or "think of it like" comparisons. Explain the finance directly.
- Do not open a sentence with a bare "It", "This", "That", "They", or "These" when the noun is
  unclear. Name the thing.
- Keep sentences short, one idea each. If a sentence has more than two commas, split it.
- Define every term that is not plain English the first time it appears.
- Use common vocabulary and reuse the same word for the same concept.
- No bullet-point lists in prose. Put example and scenario lists in pipe tables. An ordered list is
  allowed only for a sequence of steps or questions.
- Banned filler: dive into, unleash, game-changing, delve, landscape, crucial, realm, tapestry,
  testament, navigate (figurative), robust (as filler).

OUTPUT FORMAT (the app renderer is limited)
- Use only ATX headings (#, ##, ###), pipe tables, ordered lists, bold, italic, and inline code. A
  line that is a single inline-code span containing "=" renders as a display equation. No links,
  images, footnotes, or fenced code blocks.
- End with a line beginning "Sources:" listing the vault filenames and any web sources you used. If a
  part rests on general knowledge, say which part."""

# --- Prompt B: explain a highlighted statement ---
EXPLAIN_SYSTEM = """\
You explain a highlighted piece of text for a user who is learning to analyze stocks. The user
selected a term, phrase, sentence, number, or claim inside a stock-valuation app and asked what it
means. Explain that exact selection in plain language.

WHAT TO EXPLAIN
The user message gives you the highlighted text and the surrounding context it came from. Explain
what the highlighted text means and why it matters in that context. If the selection is a term,
define it. If it is a claim or sentence, explain what it is saying and what an analyst should take
from it. If it is a number or metric, say what the number measures and how to read its level. Stay on
the selection. Do not write a general essay around it.

USE THE SUBJECT'S DATA (interactive, not a generic textbook entry)
If the message names a subject the user is analyzing and includes a "Computed data on the page" block,
do not stop at a generic definition. Tie the explanation to that specific subject using its actual
figures: state the subject's own value for the relevant metric and what that value implies for its
valuation, so the user learns the concept and reads their company in the same breath. Treat the page
figures as authoritative and quote them exactly; do not replace them with a different web value. For
example, if the highlighted text is "WACC" and the page shows the company's WACC, define WACC, then give
the company's actual WACC and what it means for its intrinsic value. If the data block has no figure
relevant to the selection, just explain the selection plainly.

LENGTH
Keep it tight; it opens in a sidebar beside the text. One short paragraph for a simple term. Two or
three short paragraphs, or one small table, for a claim that has parts.

SOURCING ORDER (always, in this order)
1. Vault first. Call search_vault for the selection before writing. The vault is the primary voice.
   Cite the source filename.
2. Reputable web second, when a fact must be current or exact. Cite it inline.
3. General knowledge last, only to fill gaps. Never refuse. If the vault does not cover the selection,
   explain it anyway and say the explanation is general knowledge.
4. For a selection about news, sentiment, or how people view the company, you may call company_news and
   social_reactions for the ticker to ground the explanation in actual recent coverage and retail posts,
   discounting low-reach or brand-new accounts. Keep it brief; this opens in a sidebar.

STYLE (same hard rules as the app's definitions)
- A beginner is reading and has no finance dictionary open. Define every non-plain-English term the
  first time it appears.
- No em dashes. No analogies or "think of it like" comparisons. No sentence opening with a bare
  ambiguous "It"/"This"/"That". One idea per sentence, at most two commas. No filler words.
- No bullet points in prose. Use a small pipe table for any list of cases or levels.

OUTPUT FORMAT
- Only ATX headings, pipe tables, ordered lists, bold, italic, inline code. A lone inline-code span
  containing "=" renders as an equation. No links, images, or fenced code blocks.
- If you used a vault or web source, end with a short "Sources:" line."""

DEFINE_SYSTEM = (
    "You define investing and finance terms for tooltips in a valuation app. "
    "Call search_vault for the term, then write ONE short paragraph (2-4 "
    "sentences) defining it. Vault first and cite it; fill any gap with general "
    "knowledge rather than refusing. If the message names a subject and a "
    "'Computed data on the page' block, relate the definition to that subject's "
    "actual figures (interactive valuation) and treat those figures as "
    "authoritative. Plain and precise, no preamble, no bullet points, no em dashes."
)

# --- local retrieval (no Claude) ---
_db_lock = threading.Lock()
_db: sqlite3.Connection | None = None
# Per-request collector so each endpoint can report which sources were retrieved.
_sources: contextvars.ContextVar[list | None] = contextvars.ContextVar("sources", default=None)


def get_db() -> sqlite3.Connection:
    global _db
    if _db is None:
        if not os.path.exists(DB_PATH):
            raise RuntimeError(f"vault.db not found at {DB_PATH} — run index_vault.py first")
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        conn.enable_load_extension(True)
        sqlite_vec.load(conn)
        conn.enable_load_extension(False)
        _db = conn
    return _db


def search(qtext: str, category: str | None) -> list[dict]:
    emb = embed_query(qtext)
    pool = POOL_CATEGORY if category else POOL
    with _db_lock:
        # sqlite-vec requires the KNN LIMIT to apply to the vec0 scan itself, so
        # do the nearest-neighbor search in a CTE, then join to the text rows.
        rows = get_db().execute(
            """
            WITH knn AS (
                SELECT rowid, distance FROM vec_chunks
                WHERE embedding MATCH ? ORDER BY distance LIMIT ?
            )
            SELECT c.source, c.text, knn.distance
            FROM knn JOIN chunks c ON c.id = knn.rowid
            ORDER BY knn.distance
            """,
            (sqlite_vec.serialize_float32(emb), pool),
        ).fetchall()
    results = [{"source": s, "text": t, "distance": d} for s, t, d in rows]
    if category:
        cl = category.lower()
        results = [r for r in results if cl in r["source"].lower()]
    return results[:TOP_K]


@tool("search_vault", "Search the financial-texts library for passages relevant to a query. "
      "Optionally restrict to a book/category by substring.",
      {"query": str, "category": str})
async def search_vault(args):
    qtext = (args.get("query") or "").strip()
    category = args.get("category") or None
    if not qtext:
        return {"content": [{"type": "text", "text": "No query provided."}]}
    results = search(qtext, category)
    box = _sources.get()
    if box is not None:
        box.extend(r["source"] for r in results)
    if not results:
        return {"content": [{"type": "text", "text": "No matching passages found in the library."}]}
    blocks = [f"[{i}] (source: {r['source']})\n{r['text']}" for i, r in enumerate(results, 1)]
    return {"content": [{"type": "text", "text": "\n\n".join(blocks)}]}


VAULT_MCP = create_sdk_mcp_server(name="vault", version="1.0.0", tools=[search_vault])


def make_guard(allowed: list[str]):
    """A permission callback that allows only the given tools and denies the rest."""
    async def guard(tool_name, tool_input, context):
        if tool_name in allowed:
            return PermissionResultAllow()
        return PermissionResultDeny(message=f"{tool_name} is not permitted on this server.")
    return guard


def options_for(model: str, system_prompt: str, max_turns: int, allow_web: bool = True,
                budget_usd: float | None = None) -> ClaudeAgentOptions:
    allowed = ALLOWED_TOOLS if allow_web else [VAULT_TOOL]
    return ClaudeAgentOptions(
        model=model,
        system_prompt=system_prompt,
        mcp_servers={"vault": VAULT_MCP, "news": NEWS_MCP, "social": SOCIAL_MCP},
        allowed_tools=allowed,
        can_use_tool=make_guard(allowed),
        max_turns=max_turns,             # the agentic-loop cap; high enough for vault + web research
        max_budget_usd=budget_usd,       # secondary guard: stop the loop past this per-request spend
        setting_sources=None,            # ignore project CLAUDE.md / settings / hooks
        cwd=os.path.dirname(os.path.abspath(__file__)),
    )


async def _stream_prompt(text: str):
    # can_use_tool requires streaming-input mode, so feed the prompt as a
    # one-shot async stream; exhausting it ends the turn after the reply.
    yield {"type": "user", "message": {"role": "user", "content": text}}


async def run_agent(prompt: str, model: str, system_prompt: str, max_turns: int, label: str,
                    allow_web: bool = True, budget_usd: float | None = None):
    box: list[str] = []
    token = _sources.set(box)
    answer_parts: list[str] = []
    final: str | None = None
    tool_calls: list[str] = []
    try:
        async for msg in query(prompt=_stream_prompt(prompt),
                               options=options_for(model, system_prompt, max_turns, allow_web, budget_usd)):
            if isinstance(msg, AssistantMessage):
                for b in msg.content:
                    if isinstance(b, TextBlock):
                        answer_parts.append(b.text)
                    elif isinstance(b, ToolUseBlock):
                        tool_calls.append(b.name)
            elif isinstance(msg, ResultMessage):
                if msg.result:
                    final = msg.result
                from collections import Counter
                tools = dict(Counter(tool_calls))
                print(f"[{label}] model={model} turns={msg.num_turns} tools={tools} "
                      f"cost_usd={msg.total_cost_usd}", flush=True)
    finally:
        _sources.reset(token)
    answer = (final or "".join(answer_parts)).strip()
    sources = list(dict.fromkeys(box))  # unique, retrieval order
    return answer, sources


# --- HTTP ---
@web.middleware
async def cors_mw(request, handler):
    if request.method == "OPTIONS":
        resp = web.Response(status=204)
    else:
        resp = await handler(request)
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "POST, GET, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return resp


async def handle_ask(request: web.Request) -> web.Response:
    data = await request.json()
    question = (data.get("question") or "").strip()
    context = (data.get("context") or "").strip()       # entity in view: ticker / sector / industry
    section = (data.get("section") or "").strip()        # economic | sector | industry | comparative | individual
    data_context = (data.get("data") or "").strip()      # compact summary of the page's computed figures
    if not question:
        return web.json_response({"error": "question is required"}, status=400)
    subject = context or "the subject in view"
    header = f"Subject: {subject}"
    if section:
        header += f"  (section: {section})"
    prompt = header
    if data_context:
        prompt += (
            "\n\nComputed data on the page (AUTHORITATIVE LIVE DATA — the app already pulled these exact "
            "current figures from its data sources and the user is looking at them right now):\n"
            + data_context
            + "\n\nRule for the figures above: use each of these exact values as the current value for "
            "this subject. If a web search returns a different number for any figure shown above, "
            "ignore the web number and use the page value. Do not correct or re-fetch these numbers. "
            "You may still use the web freely for facts, events, history, and anything NOT shown above."
        )
    prompt += f"\n\nQuestion: {question}"
    # Web stays available (for facts the page does not show); the prompt above keeps
    # the page figures authoritative over any conflicting web value.
    answer, sources = await run_agent(
        prompt, ASK_MODEL, ASK_SYSTEM, max_turns=28, label="/ask", budget_usd=2.0)
    return web.json_response({"answer": answer, "sources": sources})


async def handle_explain(request: web.Request) -> web.Response:
    data = await request.json()
    selection = (data.get("selection") or "").strip()
    context = (data.get("context") or "").strip()        # surrounding text on the page
    subject = (data.get("subject") or "").strip()         # company / sector / etc. in view
    data_context = (data.get("data") or "").strip()       # the subject's computed figures
    if not selection:
        return web.json_response({"error": "selection is required"}, status=400)
    prompt = f'Highlighted text: "{selection}"'
    if subject:
        prompt += f"\nThe user is currently analyzing: {subject}"
    if context:
        prompt += f"\nSurrounding context on the page: {context}"
    if data_context:
        prompt += (
            "\n\nComputed data on the page for this subject (AUTHORITATIVE LIVE DATA — the app already "
            "pulled these exact current figures and the user is looking at them):\n" + data_context
            + "\n\nUse these exact figures where they relate to the highlighted text; do not replace them "
            "with a different web value."
        )
    explanation, sources = await run_agent(
        prompt, EXPLAIN_MODEL, EXPLAIN_SYSTEM, max_turns=14, label="/explain", budget_usd=0.75)
    return web.json_response({"explanation": explanation, "sources": sources})


async def handle_define(request: web.Request) -> web.Response:
    data = await request.json()
    term = (data.get("term") or "").strip()
    subject = (data.get("subject") or "").strip()         # company / sector in view (optional)
    data_context = (data.get("data") or "").strip()       # the subject's computed figures (optional)
    if not term:
        return web.json_response({"error": "term is required"}, status=400)

    # A subject-specific definition is cached under term|subject so it never collides
    # with the generic definition or another company's.
    cache_key = term if not subject else f"{term}|{subject}"
    with _db_lock:
        row = get_db().execute("SELECT definition FROM glossary WHERE term = ?", (cache_key,)).fetchone()
    if row:
        return web.json_response({"term": term, "definition": row[0], "cached": True})

    prompt = f"Define the term: {term}"
    if subject:
        prompt += f"\nThe user is currently analyzing: {subject}. Relate the term to this subject's figures where relevant."
    if data_context:
        prompt += (
            "\n\nComputed data on the page (AUTHORITATIVE — use these exact figures where relevant, do not "
            "replace with a web value):\n" + data_context
        )
    definition, _used = await run_agent(
        prompt, DEFINE_MODEL, DEFINE_SYSTEM, max_turns=10, label="/define", budget_usd=0.5)
    with _db_lock:
        db = get_db()
        db.execute("INSERT OR REPLACE INTO glossary (term, definition) VALUES (?, ?)", (cache_key, definition))
        db.commit()
    return web.json_response({"term": term, "definition": definition, "cached": False})


async def handle_health(_request: web.Request) -> web.Response:
    with _db_lock:
        n = get_db().execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
    return web.json_response({"status": "ok", "chunks": n, "ask_model": ASK_MODEL, "define_model": DEFINE_MODEL})


def main() -> None:
    app = web.Application(middlewares=[cors_mw])
    app.router.add_post("/ask", handle_ask)
    app.router.add_post("/explain", handle_explain)
    app.router.add_post("/define", handle_define)
    app.router.add_get("/health", handle_health)
    print(f"RAG server on http://localhost:{PORT}  (ask={ASK_MODEL}, explain={EXPLAIN_MODEL}, define={DEFINE_MODEL})")
    print(f"  vault.db: {DB_PATH}  | tools: vault search + web + company_news + social_reactions")
    print("  auth: Claude Code login session (Claude Agent SDK) — no API key in this process")
    web.run_app(app, host="127.0.0.1", port=PORT)


if __name__ == "__main__":
    main()
