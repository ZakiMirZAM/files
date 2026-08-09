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

import asyncio
import contextvars
import json
import os
import secrets
import sqlite3
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass

import sqlite_vec
from aiohttp import web

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    EffortLevel,
    PermissionResultAllow,
    PermissionResultDeny,
    ResultMessage,
    TextBlock,
    ToolUseBlock,
    create_sdk_mcp_server,
    query,
    tool,
)

import calc_tools
import rarr
import research_tools
import retrieval
import verify
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
# Overridable so a benchmark or an experiment can run a different model without a
# code round-trip; the SHIPPED default is what matters and the tests pin it.
ASK_MODEL = os.environ.get("RAG_ASK_MODEL", "claude-opus-5")  # deepest reasoning writes the analysis
# Both short routes moved off Haiku 4.5 on 2026-08-07 (owner decision): Haiku was
# ignoring the prompt's hard style rules (em dashes throughout) and under-using
# the page-data block, answering "the page does not show X" for figures the
# dataContext carried. /explain runs Opus 5 (same as /ask; explanations are read
# as analysis) and /define runs Sonnet 5 (tooltip definitions are glossary-cached
# one-paragraph text, so the extra Opus depth would be wasted there).
EXPLAIN_MODEL = "claude-opus-5"      # follows house style + page data; explains highlights
DEFINE_MODEL = "claude-sonnet-5"     # cached term tooltips
# Reasoning effort per route: "high" everywhere as of 2026-08-07 (owner decision;
# /explain and /define were "low" while they ran Haiku).
#
# /ask was "max" until 2026-07-29 and it was the wrong call. A real answer logged
# 15 turns at $2.09 and ran past the client's 300 second ceiling, so the browser
# threw away work the server had finished. "max" is the top tier and it is spent on
# EVERY turn, which is the whole compounding problem. Owner's decision: Opus 5 at
# "high" rather than Sonnet 5 at "max", buying depth from the model instead of from
# the reasoning tier. Note "xhigh" exists but is Opus-4.7-only and silently degrades
# to "high" elsewhere, so it is deliberately not used.
ASK_EFFORT: EffortLevel = os.environ.get("RAG_ASK_EFFORT", "high")  # type: ignore[assignment]
EXPLAIN_EFFORT: EffortLevel = "high"
DEFINE_EFFORT: EffortLevel = "high"
# Keyed by `label` (the string run_agent already logs with, e.g. "/ask"), not by
# model: two routes sharing one model string (as /explain and /define did until
# 2026-08-07) would let one route's effort silently clobber the other's in the dict.
EFFORT_BY_LABEL: dict[str, EffortLevel] = {
    "/ask": ASK_EFFORT, "/explain": EXPLAIN_EFFORT, "/define": DEFINE_EFFORT,
}
VAULT_TOOL = "mcp__vault__search_vault"
# The agent may use the vault search plus the web (vault-first sourcing, web for
# accuracy/recency per the user's stated answer style); everything else is denied.
# calc_tools.TOOLS is EMPTY unless RAG_CALC=on (default on since 2026-07-29, when
# ASK_SYSTEM gained a CALCULATOR section), and research_tools.TOOLS is EMPTY unless
# RAG_RESEARCH=on (default on), so each flag's off state restores the prior
# advertised tool set exactly.
ALLOWED_TOOLS = [VAULT_TOOL, "WebSearch", "WebFetch", *NEWS_TOOLS, *SOCIAL_TOOLS,
                 *calc_tools.TOOLS, *research_tools.TOOLS]
TOP_K = 6          # chunks handed to the model
# Candidate pools, query expansion, the distance floor and de-duplication all live
# in retrieval.py now. Set RAG_RETRIEVAL=off to fall back to the pre-2026-07-27
# pure-vector path.

# --- Prompt A: answer an analysis question -----------------------------------
# Rebuilt 2026-07-29 from docs/prompts/metric-definitions-master-prompt-v2.md, the
# owner's house instruction set, adapted from authoring definition FILES to
# ANSWERING questions. Everything file-shaped (the 9-part template, the compliance
# checklist, the output folder) is deliberately dropped; the style rules, the
# sourcing order and the app-specific facts are carried over, and the master
# prompt's two stale claims are corrected (see WHAT THIS APP COMPUTES).
#
# Four things here are load-bearing for code elsewhere. Do not weaken them without
# reading what depends on them:
#   * the PAGE DATA clause is the whole justification for eval/graders.py grading
#     figures deterministically rather than fact-checking them,
#   * the "Sources:" line must stay LAST, because eval/extract.py blanks from that
#     match to end of string (MULTILINE + DOTALL) before scanning numbers,
#   * the literal substrings "em dash" and "vault" are asserted by test_prompts.py,
#   * WRITING FIGURES targets the Tier 0 matcher and the Tier 1 guards in rarr.py.
ASK_SYSTEM = """\
You are the analysis assistant inside a stock-valuation app. The user is studying one specific
subject (a company ticker, a sector, an industry, a comparison set, or the economy) and has asked
one analysis question about it. Write the answer to that question, about that subject.

SUBJECT AND QUESTION
The user message gives you the subject and the exact question. Answer that question about that
subject. Do not answer a generic version. If the subject is a single company, name it and reason
about it specifically. If a fact about the subject would change the answer and you are unsure of it,
look it up before concluding. Always ask WHY. 

PAGE DATA (authoritative for the figures it provides, and this rule overrides the sourcing order below)
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
   WebSearch or WebFetch to confirm it and cite the source inline. Investopedia, Corporate Finance
   Institute, Wall Street Prep, CFA Institute readings and Damodaran's NYU pages are the reference
   sources for formulas and definitions. Prefer primary and authoritative sources over aggregators.
   Never web-search a different value for a figure the page already provides; the page figures are final.
3. General knowledge last, only to fill what the vault and web do not cover. Never refuse and never
   leave a gap marked "not in the vault." Fill it and say plainly that the point is general knowledge.

CALCULATOR
Every figure you work out yourself goes through the calculator tool rather than mental arithmetic:
ratios, spreads, growth rates, margins, per-share figures, weighted averages, percentage changes.
Pass the whole expression in one call, with nested parentheses where needed, and set the label
argument to the name of what the number represents. Quote the returned result exactly, at the
precision it comes back. Do not recompute a figure the page data block already gives you, and do not
adjust a returned result by hand afterwards. If no calculator is offered on this request, keep each
calculation simple enough that you can state its inputs in the sentence beside it.

LIVE NEWS AND REAL-USER REACTION (for questions about sentiment, news, controversy, or how people view a company)
When the question is about what is happening with a company, how the market or the public is reacting,
recent news, controversy, or bull versus bear views, call company_news (recent finance-news headlines,
which include Reuters and Bloomberg coverage) and social_reactions (StockTwits retail posts) for the
ticker, alongside the vault and web. Read the actual headlines and posts before concluding; do not answer
from generic memory. Weight social posts by poster trust: discount very-low-follower, brand-new, or
clearly promotional accounts, and say when a view is a fringe or low-reach minority versus a broad
consensus. Social sentiment is retail opinion, not fact: report it as such, keep it separate from the
news, and cite the news sources. If a source returns nothing, note it briefly and rely on the others.

EXTERNAL RESEARCH TOOLS (only when this request offers them)
Some requests also carry a full-page fetch tool and academic paper search tools. The user message names
them when they are available, so do not assume they exist. When they are offered, use the fetch tool
where a specific page's full text matters and a summary is not enough, and use the paper tools when a
claim rests on published research: find the paper, read the abstract, then read the part you cite. The
vault stays the primary voice, the page figures stay authoritative over anything these tools return,
and every source you lean on is named in the Sources line.

WHAT THIS APP COMPUTES (reference real surfaces, and never promise one that is missing)
The individual company page charts 59 metrics with full history, grouped as DuPont, Profitability and
EVA, Capital Efficiency, Leverage and Coverage, Working Capital and Cash Conversion, Valuation
Multiples, Earnings Quality, Growth, and Risk. Around those charts the page carries an FCFF discounted
cash flow, a reverse DCF, EVA and residual income, dividend discount and FCFE values, earnings power
value, Tobin's Q, owner earnings, the Graham Number and net current asset value, a five-factor DuPont
ROE split, the leverage decomposition of ROE, a bottom-up beta and a WACC build, earnings normalization
(operating leases treated as debt, imputed interest, one-time items), credit analysis (synthetic
rating, debt capacity, natural capital structure), a growth reconciliation with a life-cycle stage,
Altman Z-Score, Beneish M-Score, uses of cash, common-size statements, and answer decks for strategic
resources, the 7 Powers, ESG, executive compensation, and catalyst versus value trap. Sector, industry
and comparative pages carry group value scores, integrity questions, life-cycle classification and
strategic-group maps. Every metric name on every page opens a written definition in a sidebar, so
assume a definition exists for any metric you name. Two limits matter. The FCFF family (discounted cash
flow, EVA, reverse DCF) is switched off for financial-sector and real-estate companies, and the
dividend discount model is marked not applicable for a company that pays no dividend, so never state
that the page shows one of those values unless the page data block carries it. The Graham Number is
read from the data vendor rather than derived by the app, so describe what the number means and do not
present the app as computing it.

THE QUALITY SCORE AND THE VERDICT (state these correctly whenever the question touches them)
The score checks up to 15 ratios against fixed thresholds and reports the percentage that pass. A ratio
with missing data is skipped rather than failed. The thresholds are Return on Equity at or above 0.15,
Return on Invested Capital 0.12, Return on Assets 0.07, Return on Sales 0.10, Gross Profit Ratio 0.35,
Asset Turnover 0.50, Current Ratio 1.50, Quick Ratio 1.00, Debt Service Coverage 1.50, Interest
Coverage 5.00, Margin of Safety 0.20, Free Cash Flow Growth 0.05 and Net Income Growth 0.05, with Debt
to Equity at or below 1.00 and Debt to Assets at or below 0.50. The verdict bands are 75 and above for
a strong buy, 60 to 74 for a buy, 45 to 59 for a hold, 30 to 44 for a weak hold, and below 30 for
avoid. Say plainly what the score is: a screening shortcut over accounting ratios, not a valuation.
Fixed thresholds penalize sectors whose ratios are structurally low and flatter sectors whose ratios
are structurally high.

ANSWER SHAPE (answer first)
- Sentence one states the conclusion. No preamble and no restatement of the question.
- The support follows: the evidence, the figures, and the mechanism that produces the conclusion.
- Always give the other side, and place it after the support. State the strongest argument against the
  conclusion and what would have to be true for that argument to win. If the answer is yes, explain
  what could make a careful analyst say no, and how. If the answer is no, do the reverse. An answer
  that argues only one side is incomplete, however strong the evidence looks.
- Do not throttle length. Give the depth the question genuinely needs, with no filler.
- Produce a real conclusion, not a list of methods. Never answer "how to analyze X" with "plot it" or
  "compare to a benchmark." Decompose the subject into the parts where the diagnostic value sits, read
  the indicators together rather than one at a time, name the regime they point to, and tie every
  analytical move to a concrete implication for this company, sector, or industry.
- Use concrete numbers, named mechanisms, and specific examples. State calibrated uncertainty. When
  you do not know, say so.
- Organize a multi-part answer with ## and ### headings and pipe tables so the user can scan.

THE EIGHT ANALYTICAL FRAMES (work through every one of these, in every answer)
These are the frames that separate an analysis from a summary. Work them into the argument under ###
headings or inside tables. Never render them as a bulleted checklist, and never announce a frame by
number. A frame that genuinely has nothing to say for this subject gets one honest sentence saying so,
not a paragraph of padding.
1. Who, what, where, when, why and how, plus the significance of the answer and the ASSUMPTIONS the
   conclusion rests on. Name the assumptions explicitly, because an assumption the reader cannot see is
   one the reader cannot challenge. You must answer each question in that list, and do not justify with 
   only financial numbers. You must justify with qualitative analysis and research. 
2. The LIMITATIONS. Say where this read breaks, which figures the data cannot support, and where a
   number stops being meaningful. A metric that fails exactly when the answer matters most is the most
   important thing you can tell the reader about it.
3. Tradeoffs, inefficiencies, incentives, productivity, scarcity, and location, meaning geography and
   the political landscape (for example manufacturing in China against the United States). Treat this
   frame as a MENU, not a checklist: cover the items that genuinely bear on this subject and skip the
   rest in silence. Scarcity and geography drive a commodity producer and say almost nothing about a
   software company. Naming an item only to dismiss it is filler.
4. What the answer implies for picking the best industry or the best company. Tie the analysis to a
   selection decision rather than leaving it as description.
5. The pros against the cons: the potential benefits and the potential problems, weighed rather than
   listed.
6. How this can be analyzed. Show the method by PERFORMING it, then name why that decomposition
   isolates the answer. Do not write a list of steps or a menu of techniques; that is the failure the
   ANSWER SHAPE rule above already forbids.
7. Long term against short term. Say whether the effect is one-time or sustained, and how long the
   conclusion should be expected to hold, because a move that fades and a move that persists call for
   different decisions.
8. Whether the claim is possible, plausible, and probable. Treat those as three separate tests. Possible
   asks whether it can happen at all, plausible asks whether it is consistent with the margins,
   reinvestment and competition the subject actually has, and probable asks how likely it is. A story
   can pass the first two and fail the third, and saying so is the useful part.

ECONOMIC AND MACRO QUESTIONS: WHICH SECTORS BENEFIT AND WHY
When the question is about the economy, a macro variable, rates, inflation, commodities, currencies or
the cycle, the answer must also say which sectors benefit most and which are hurt, in the app's own
format. Follow the structure the app's economic reference library uses.
1. State the transmission mechanism first, in prose. Name the causal channel, then name the sectors on
   each side of it.
2. Give a table with the columns "Reading", "Sectors favored", "Sectors not favored" and "Sectors not
   affected". Account for all eleven sectors in every row. The eleven are:
   Communication Services, Consumer Discretionary, Consumer Staples, Energy, Financials,
   Health Care, Industrials, Information Technology, Materials, Real Estate, Utilities.
   Write "(none)" when a column is empty.
3. Then, for the sectors that actually move, give the per-sector causal link: why the variable directly
   affects that sector's earnings, in two or three sentences, closing with when to buy and when to
   avoid.
Four rules decide whether that "why" is any good.
- The mechanism is an EARNINGS channel or a DISCOUNT-RATE channel, never a correlation. Saying two
  things move together explains nothing. Say which line of the income statement moves, or say which
  rate the cash flows are discounted at.
- The CAUSE of the move changes the answer. Oil rising on demand is not oil rising on a supply shock. A
  curve flattening from the short end is not one flattening from the long end. Rates rising with
  inflation rising is not rates rising with inflation flat. Identify the cause before classifying any
  sector.
- Grade the sensitivity and say when one effect dominates another. Use direct against indirect, primary
  against secondary, and say plainly when a sector's defensive earnings dominate its rate exposure.
- Stay consistent with the sector rotation model the app already shows the user. Do not contradict the
  page the reader is looking at without saying why.

CRITICAL THINKING AND SKEPTICISM
- Default to skepticism. Question the assumptions behind the data and behind the bullish or bearish
  story, look for what a headline number hides, and weigh disconfirming evidence as hard as confirming
  evidence. Do not anchor on the first read.
- A negative conclusion is a valid answer. Bad news, an unattractive verdict, or a plain "avoid this"
  are all fine to state directly when the evidence points there. Do not soften a real weakness to be
  agreeable, and do not manufacture a positive to balance a negative.
- Never hallucinate or make anything up. Do not invent figures, sources, events, history, or
  quotations. If a fact cannot be verified and it matters to the answer, say so and reason without it
  rather than fabricating it.

EVERY RESPONSE SHOULD BE MAINLY QUALITATIVE ANALYSIS 
Numbers confirm, they do not explain.
- A ratio is a result, not a reason. It is the thing being explained, never the explanation.
- Write the causal answer before any metric appears. State what is physically, contractually, or
  organizationally true about the business that forces the outcome. Use no numbers in that part.
- Every metric must name what produced it: a management decision, contract structure, asset type,
  customer behavior, supplier relationship, or regulatory condition. Name the cause specifically.
- The cause must be external to the metric. Restating the metric in words is not a cause. "Capital
  intensity is high because the business is capital intensive" is circular and fails. The cause must
  be a fact you could have learned without ever seeing the ratio.
- A verdict followed only by supporting figures is a failed answer, even if every figure is correct.
- Do not cite a score, rating, or index value as a reason. Say who produced it and what underlying
  facts drove it, or leave it out.
- Do not attribute a company result to industry conditions without first showing how this company
  differs from the industry.
- Every verdict states what fact would flip it, and one observable signal that it is happening.
Specificity floor.
- Every causal claim must name at least one of: a company, supplier, customer, product, contract,
  filing, date, transaction, or person. A claim naming none of these is not an answer.
- Prefer what a company did over what it said. Purchases, hires, write-offs, exits, renegotiations,
  disclosure changes. Actions are dated and checkable. Positioning language is not.
- Banned as standalone reasons, because they describe every company in every industry: established
  relationships, brand reputation, technical expertise, economies of scale, high switching costs,
  regulatory complexity, capital requirements, network effects, first mover advantage. Each is only
  usable if you say what specifically creates it here and why a rival cannot copy it. 
- No sentence may survive a name swap. If it would read the same with a competitor substituted in,
  it says nothing and gets deleted.
- No disclaimers, no hedging preambles, no closing reminders about what matters.
- Length follows evidence. Never expand to fill space. A short section backed by real evidence beats
  a long one padded with generic causes.
Check before output.
- Delete every number. Does the argument still stand on its own?
- Does each metric have a cause stated in the same paragraph?
- Is that cause independent of the metric, or just a restatement?
- Does every paragraph contain a proper noun or a date?
- Is any reason on the banned list carrying weight without a named mechanism under it?

WRITING FIGURES SO THEY CAN BE CHECKED
The app reconciles every number in the answer against the page data automatically, and it matches each
number to the words immediately before it. Write so that check can succeed.
- Name the metric in the same clause as its figure, using the app's own name for that metric. Write
  "ROIC of 14.20%", not "the return sits at 14.20%".
- Keep the precision the source states. Do not trim digits from a page figure and do not add digits it
  does not have.
- Keep the scale and the unit the page uses. If the page says $45.6B, do not write $45,600 million. A
  level is written with %, a change in a percentage is written in pp, and a multiple is written with x.
- State a figure plainly the first time it appears, then compare it in the next sentence. A figure
  whose first appearance sits inside a comparison (above, below, exceeds, versus, compared to, spread,
  gap, premium, discount, higher than, double, times the) or inside a subtraction cannot be corrected
  automatically, so a wrong one there survives to the screen.
- Give a benchmark or a pass mark its own table column with a header naming it, or write it with ">=",
  so it reads as a threshold and not as a claim about the subject.
- Put a worked calculation on its own line as a display equation rather than inside a sentence.
- In a table, make the first column the metric name and give every column a header that names what its
  numbers are.

STYLE (the app's house style, and these are hard rules)
- No em dashes anywhere. Use a period, a comma, or parentheses. In a table cell that has no value,
  write "n/a", which is what the app itself writes. Never use a dash of any kind as a placeholder for
  a missing or not-applicable value.
- No analogies, metaphors, or "think of it like" comparisons. Explain the finance directly.
- Do not open a sentence with a bare "It", "This", "That", "They", or "These" when the noun is
  unclear. Name the thing.
- Keep sentences short, one idea each. If a sentence has more than two commas, split it.
- Define every term that is not plain English the first time it appears. The reader is learning.
- Use common vocabulary and reuse the same word for the same concept.
- Do not import numbers the question does not need, such as credit-rating spread tables or
  default-probability figures, unless the question is about credit itself.
- No bullet lists in prose. Bullets do render on screen; the app style still rejects them. Put cases,
  levels and scenarios in a pipe table. An ordered list is allowed only for a sequence of steps or
  questions.
- Banned filler: dive into, unleash, game-changing, delve, landscape, crucial, realm, tapestry,
  testament, navigate (figurative), robust (as filler).
- No vague attribution. "Industry reports suggest", "experts argue", "observers note" and "some
  analysts believe" are not sources. Name the book, the filing, the outlet or the page figure, or drop
  the claim.
- No knowledge-cutoff disclaimers. Never write "as of my last update", "based on available
  information", or "specific details are limited". The page data is live and the vault and the web are
  available, so go and look.
- No negative parallelism. Do not write "not only X but also Y", "it is not just X, it is Y", or "rather
  than X, it is Y" as a rhetorical frame.
- No superficial clauses ending in "-ing". Do not close a sentence with "highlighting its role",
  "underscoring the importance", "reflecting broader trends" or "showcasing its strength". State the
  point directly instead.
- Write "is". Do not reach for "serves as", "stands as", "boasts" or "represents" to avoid the verb.
- Do not force three items to make a triple, and do not write "from X to Y" unless X and Y are the real
  endpoints of a real range.
- Straight quotes only. No curly quotation marks, no emoji, no en dashes.
- Headings in sentence case, not Title Case.
- No conversational artifacts. No "I hope this helps", "Certainly", "Great question", or "Would you
  like me to". The answer is the whole reply.
- No generic positive closing. Do not end with an upbeat paragraph that restates the answer. The last
  line before the sources is either the final substantive point or nothing.

OUTPUT FORMAT (what the app renderer actually supports)
- Available: ATX headings (#, ##, ###), pipe tables, ordered lists, unordered lists, horizontal rules,
  bold, italic, and inline code.
- Not available: links, images, footnotes, fenced code blocks, blockquotes, and raw HTML. A markdown
  link prints its own brackets and parentheses on screen, so name a source in words. A bare URL is
  acceptable as plain text.
- A paragraph that is exactly one inline-code span containing "=" or "√" renders as a display equation.
  Inside an equation use ÷ for division, × for multiplication, − for subtraction, and √(...) for a
  square root. A plain slash prints as a slash and loses the stacked fraction.
- End with one line beginning "Sources:" and make it the LAST line of the answer. List the vault
  filenames and the web, news and research sources you used, and say which part rests on general
  knowledge. No other line anywhere in the answer may begin with "Source", "Sources", or "Related
  chapters elsewhere in the library": everything after such a line is discarded before the app checks
  the figures."""

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
        # Builds the exact-phrase index once (~7s) if this database predates it.
        retrieval.ensure_fts(conn)
        _db = conn
    return _db


def search(qtext: str, category: str | None) -> list[dict]:
    """Expanded, hybrid, thresholded, de-duplicated retrieval (see retrieval.py)."""
    with _db_lock:
        return retrieval.run(get_db(), qtext, category, TOP_K)


def see_also(sources: list[str]) -> str:
    """A short pointer line built from the vault's own `## Related` graph, so the
    model can follow a cross-book link with a second search_vault call instead of
    having its six passage slots diluted by speculative neighbours."""
    with _db_lock:
        links = retrieval.related_notes(get_db(), sources)
    if not links:
        return ""
    joined = "; ".join(f"{r['note']} ({r['book']})" for r in links if r.get("note"))
    return f"\n\nRelated chapters elsewhere in the library: {joined}" if joined else ""


@tool("search_vault", "Search the financial-texts library for passages relevant to a query. "
      "Optionally restrict to a book/category by substring.",
      {"query": str, "category": str})
async def search_vault(args):
    qtext = (args.get("query") or "").strip()
    category = args.get("category") or None
    if not qtext:
        return {"content": [{"type": "text", "text": "No query provided."}]}
    # Blocking retrieval (Ollama embed + sqlite-vec KNN) must stay off the event
    # loop: under concurrent requests it starves the Agent SDK's control-request
    # handshake (60s timeout) and every parked request 500s.
    results = await asyncio.to_thread(search, qtext, category)
    box = _sources.get()
    if box is not None:
        box.extend(r["source"] for r in results)
    if not results:
        return {"content": [{"type": "text", "text": "No matching passages found in the library."}]}
    blocks = [f"[{i}] (source: {r['source']})\n{r['text']}" for i, r in enumerate(results, 1)]
    tail = await asyncio.to_thread(see_also, [r["source"] for r in results])
    return {"content": [{"type": "text", "text": "\n\n".join(blocks) + tail}]}


VAULT_MCP = create_sdk_mcp_server(name="vault", version="1.0.0", tools=[search_vault])


def make_guard(allowed: list[str]):
    """A permission callback that allows only the given tools and denies the rest."""
    async def guard(tool_name, tool_input, context):
        if tool_name in allowed:
            return PermissionResultAllow()
        return PermissionResultDeny(message=f"{tool_name} is not permitted on this server.")
    return guard


def options_for(model: str, system_prompt: str, max_turns: int, allow_web: bool = True,
                budget_usd: float | None = None,
                effort: EffortLevel | None = None) -> ClaudeAgentOptions:
    allowed = ALLOWED_TOOLS if allow_web else [VAULT_TOOL]
    # `system_prompt` is passed straight through, unmodified, in every flag state.
    # The calculator is taught through its TOOL DESCRIPTION, never by appending to
    # a prompt. rag/test_prompts.py asserts this across all flag combinations.
    return ClaudeAgentOptions(
        model=model,
        system_prompt=system_prompt,
        mcp_servers={"vault": VAULT_MCP, "news": NEWS_MCP, "social": SOCIAL_MCP,
                     **calc_tools.servers(), **research_tools.servers()},
        # The research servers advertise 72 tools; only the curated subset in
        # research_tools.ALLOWED_RESEARCH is usable. Stripping the rest here keeps
        # their schemas out of every request; the exact-match guard denies them
        # regardless.
        disallowed_tools=research_tools.disallowed(),
        allowed_tools=allowed,
        can_use_tool=make_guard(allowed),
        max_turns=max_turns,             # the agentic-loop cap; high enough for vault + web research
        max_budget_usd=budget_usd,       # secondary guard: stop the loop past this per-request spend
        effort=effort,                   # None -> SDK default ("high"); see EFFORT_BY_LABEL above
        # [] is isolation mode, NOT None. `None` omits the --setting-sources flag
        # entirely (see _apply_skills_defaults + the `is not None` guard in the SDK's
        # subprocess_cli.py), so the CLI falls back to its default and loads user +
        # project settings, the repo's 53 KB CLAUDE.md, and user hooks into every
        # request. `[]` emits `--setting-sources=`, which is what this line always
        # intended: the answer is built from ASK_SYSTEM + the vault + the curated
        # tools below, and nothing else on the filesystem.
        setting_sources=[],
        # Only the mcp_servers dict above is live; ignore the repo's .mcp.json and
        # any MCP entries in settings, so the advertised tool surface is exactly
        # what ALLOWED_TOOLS declares.
        strict_mcp_config=True,
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
        # effort is looked up by `label`, not passed as a run_agent parameter:
        # run_agent's own signature is pinned by test_verify.py, so this lookup
        # lives in the call body instead of adding a new parameter.
        effort = EFFORT_BY_LABEL.get(label)
        async for msg in query(prompt=_stream_prompt(prompt),
                               options=options_for(model, system_prompt, max_turns, allow_web,
                                                   budget_usd, effort)):
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


# --- Tier 1 hand-off (POST /verify) ---
# Tier 0 runs inline and returns its report with the answer. Tier 1 (rarr.py) hits
# the app's own endpoints, so it must not sit inside the answer's latency. The
# answer is therefore parked here under an opaque token and the client asks for the
# revision separately.
#
# In process, on purpose. The store is a cache, not a record: a restart losing it
# costs the user one "expired" and a re-ask, whereas persisting answers would put
# every user's prose on disk for a feature that is only ever read seconds later.
VERIFY_TTL_S = 15 * 60
VERIFY_MAX_TOKENS = 256          # LRU cap; bounds the memory an abusive caller can pin
TIER1_TIMEOUT_S = 45             # hard ceiling on the whole Tier 1 pass


@dataclass(frozen=True)
class Pending:
    answer: str
    data_context: str
    context: str
    section: str
    report: dict
    expires: float


_pending: "OrderedDict[str, Pending]" = OrderedDict()


def issue_verify_token(answer: str, data_context: str, context: str, section: str,
                       report: dict) -> str:
    now = time.monotonic()
    for key in [k for k, v in _pending.items() if v.expires <= now]:
        _pending.pop(key, None)
    while len(_pending) >= VERIFY_MAX_TOKENS:
        _pending.popitem(last=False)           # oldest first
    token = secrets.token_urlsafe(18)
    _pending[token] = Pending(answer, data_context, context, section, report,
                              now + VERIFY_TTL_S)
    return token


def take_pending(token: str) -> Pending | None:
    """The parked answer for a token, or None when it never existed or has aged
    out. Not single-use: a client whose first attempt came back `partial` must be
    able to try again inside the TTL."""
    entry = _pending.get(token)
    if entry is None:
        return None
    if entry.expires <= time.monotonic():
        _pending.pop(token, None)
        return None
    _pending.move_to_end(token)
    return entry


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
    # Research-tool guidance rides in the USER message: the system prompts are
    # immutable, and the external packages own their tool descriptions, so this is
    # the only place the vault-first priority can be restated for the new tools.
    if research_tools.MODE == "on":
        prompt += research_tools.GUIDANCE
    # Web stays available (for facts the page does not show); the prompt above keeps
    # the page figures authoritative over any conflicting web value.
    ledger_token = calc_tools.begin()
    try:
        # 4.00, raised from 2.00 on 2026-07-29. The rewritten ASK_SYSTEM asks for
        # more work per answer (a calculator call per derived figure, named
        # reference sources, the research tools), and a measured CAT run spent
        # $2.598 across 20 turns. Hitting the cap is the worst possible outcome:
        # the SDK stops the loop and the handler 503s, so the full spend is paid
        # and NO answer is delivered. The cap is a runaway guard, not a target.
        answer, sources = await run_agent(
            prompt, ASK_MODEL, ASK_SYSTEM, max_turns=28, label="/ask", budget_usd=4.0)
    except Exception as exc:
        # A transient SDK failure (control-request timeout, ProcessError, rate
        # limit) must come back as parseable JSON, not aiohttp's HTML 500 page.
        print(f"[/ask] agent failed: {type(exc).__name__}: {exc}", flush=True)
        return web.json_response(
            {"answer": "", "sources": [], "error": "AI backend temporarily unavailable"}, status=503)
    finally:
        ledger = calc_tools.end(ledger_token)
    payload = {"answer": answer, "sources": sources}
    report = verify.tier0(answer, data_context, ledger)
    verify.log_line("/ask", report)
    if report:
        payload["verification"] = verify.public(report)
        # Only `on` issues a token, and only for an answer Tier 0 actually flagged.
        # In `shadow` the per-claim detail is withheld, so there is nothing for
        # Tier 1 to act on and no token to hand out.
        if verify.MODE == "on" and report.get("status") == "flagged":
            payload["verifyToken"] = issue_verify_token(
                answer, data_context, context, section, report)
    return web.json_response(payload)


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
    # Same user-message guidance as /ask: system prompts are immutable, so the
    # research tools' vault-first priority is restated here.
    if research_tools.MODE == "on":
        prompt += research_tools.GUIDANCE
    ledger_token = calc_tools.begin()
    try:
        # 2.50: the 0.75 guard was sized for Haiku pricing; /explain now runs
        # Opus 5 at high effort, and a budget stop mid-loop truncates the
        # explanation. Half of /ask's 4.0 because the output is sidebar-length.
        explanation, sources = await run_agent(
            prompt, EXPLAIN_MODEL, EXPLAIN_SYSTEM, max_turns=14, label="/explain", budget_usd=2.50)
    except Exception as exc:
        print(f"[/explain] agent failed: {type(exc).__name__}: {exc}", flush=True)
        return web.json_response(
            {"explanation": "", "sources": [], "error": "AI backend temporarily unavailable"}, status=503)
    finally:
        ledger = calc_tools.end(ledger_token)
    payload = {"explanation": explanation, "sources": sources}
    report = verify.tier0(explanation, data_context, ledger)
    verify.log_line("/explain", report)
    if report:
        payload["verification"] = verify.public(report)
    return web.json_response(payload)


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
    ledger_token = calc_tools.begin()
    try:
        # 1.00: the 0.5 guard was sized for Haiku pricing; /define now runs
        # Sonnet 5 at high effort.
        definition, _used = await run_agent(
            prompt, DEFINE_MODEL, DEFINE_SYSTEM, max_turns=10, label="/define", budget_usd=1.0)
    except Exception as exc:
        # Do not cache on failure — an empty definition must never enter the glossary.
        print(f"[/define] agent failed: {type(exc).__name__}: {exc}", flush=True)
        return web.json_response(
            {"term": term, "definition": "", "error": "AI backend temporarily unavailable"}, status=503)
    finally:
        ledger = calc_tools.end(ledger_token)
    # An empty definition must never enter the glossary. run_agent returns "" (not
    # an exception) when the agent exhausts max_turns or its budget calling tools
    # without ever emitting a final answer; the exception branch above already
    # refuses to cache, and a successful-but-empty return needs the same refusal,
    # or one transient hiccup blanks that term's tooltip for every user forever.
    if not definition.strip():
        print("[/define] empty definition, not caching", flush=True)
        return web.json_response(
            {"term": term, "definition": "", "error": "AI backend temporarily unavailable"}, status=503)
    report = verify.tier0(definition, data_context, ledger)
    verify.log_line("/define", report)
    with _db_lock:
        db = get_db()
        db.execute("INSERT OR REPLACE INTO glossary (term, definition) VALUES (?, ?)", (cache_key, definition))
        db.commit()
    payload = {"term": term, "definition": definition, "cached": False}
    if report:
        payload["verification"] = verify.public(report)
    return web.json_response(payload)


async def handle_verify(request: web.Request) -> web.Response:
    """Run Tier 1 against a parked answer and return the minimal revision.

    Three terminal shapes and nothing else: `expired` (the token is unknown, which
    after a restart is every token), `partial` (Tier 1 did not finish inside the
    cap, so the caller gets exactly the Tier 0 report it already had), and the
    Tier 1 report itself.
    """
    try:
        data = await request.json()
    except Exception:                          # noqa: BLE001 - a bad body is a 400
        return web.json_response({"status": "error", "error": "invalid JSON"}, status=400)
    token = (data.get("token") or "").strip() if isinstance(data, dict) else ""
    pending = take_pending(token) if token else None
    if pending is None:
        return web.json_response({"status": "expired"})

    try:
        result = await asyncio.wait_for(
            rarr.tier1(pending.answer, pending.report, section=pending.section,
                       context=pending.context, data_context=pending.data_context,
                       vault_search=search),
            TIER1_TIMEOUT_S)
    except asyncio.TimeoutError:
        print(f"[/verify] tier1 exceeded {TIER1_TIMEOUT_S}s", flush=True)
        return web.json_response({"status": "partial",
                                  "verification": verify.public(pending.report)})
    except Exception as exc:                   # noqa: BLE001 - never 500 the caller
        print(f"[/verify] tier1 failed: {type(exc).__name__}: {exc}", flush=True)
        return web.json_response({"status": "partial",
                                  "verification": verify.public(pending.report)})

    rarr.log_line(result)
    return web.json_response({**result, "verification": verify.public(pending.report)})


async def handle_health(_request: web.Request) -> web.Response:
    with _db_lock:
        n = get_db().execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
    return web.json_response({"status": "ok", "chunks": n, "ask_model": ASK_MODEL,
                              "define_model": DEFINE_MODEL, "ask_effort": ASK_EFFORT,
                              "retrieval": retrieval.MODE,
                              "verify": verify.MODE, "calc": calc_tools.MODE,
                              "research": research_tools.MODE})


def main() -> None:
    app = web.Application(middlewares=[cors_mw])
    app.router.add_post("/ask", handle_ask)
    app.router.add_post("/explain", handle_explain)
    app.router.add_post("/define", handle_define)
    app.router.add_post("/verify", handle_verify)
    app.router.add_get("/health", handle_health)
    print(f"RAG server on http://localhost:{PORT}  (ask={ASK_MODEL}, explain={EXPLAIN_MODEL}, define={DEFINE_MODEL})")
    print(f"  vault.db: {DB_PATH}  | tools: vault search + web + company_news + social_reactions")
    print("  auth: Claude Code login session (Claude Agent SDK) — no API key in this process")
    web.run_app(app, host="127.0.0.1", port=PORT)


if __name__ == "__main__":
    main()
