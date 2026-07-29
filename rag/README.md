# Vault RAG server

Answers investing questions and defines terms from the local "Financial Texts"
Obsidian vault. Retrieval is fully local; answers are written by Claude through
the **Claude Code login session** (Max subscription) via the Claude Agent SDK —
**no API key is used or stored.**

```
Obsidian vault ──index_vault.py──▶ vault.db (sqlite-vec 768-d + FTS5 + related_edges)
                                        │
   React app ──HTTP :3001──▶ server.py ─┤ search_vault ──▶ retrieval.py (hybrid)
                                        └ Claude Agent SDK ──▶ claude (Max login)
```

## Retrieval

`retrieval.py` owns everything between a query and the six passages the model
reads. Read its module docstring before changing any constant in it; each one was
set by measurement, and the file records what the alternatives scored.

| Stage | What it fixes |
|---|---|
| Query expansion | A one-token query like `WACC` produced a near-centroid vector and retrieved a back-of-book index page. `/define` and `/explain` pass bare metric labels, so they took nearly all of this. |
| Exact-phrase BM25, fused by reciprocal rank | Dense vectors are weakest on acronyms, symbol tokens and eponyms. `EV/EBITDA` matched 84 chunks lexically and zero inside a 200-deep vector pool. |
| Distance floor (`MAX_DISTANCE`) | Nothing stopped a bad match reaching a prompt that calls the vault "the primary voice". Insurance for out-of-domain queries, not a precision lever. |
| De-duplication | 11 books were imported twice under punctuation-variant directory names, so one answer could spend two of its six slots on the same passage. |
| `category` as a rowid pre-filter | The old post-hoc substring starved: `Competitive Strategy` had 815 chunks indexed and returned 0. |

Measured over 18 representative app queries against the live index, precision@6
went from 71% to 94%. The phrase channel is the largest single contributor.

`RAG_RETRIEVAL=off` restores the pre-2026-07-27 pure-vector path.

Indexing additionally now:
- prefixes `Book > Chapter > Heading` onto the text that is **embedded** (the stored
  and displayed text is unchanged), because 97.4% of chunks were continuation
  windows carrying no signal about their own source;
- records the vault's `## Related` wikilinks in `related_edges` (19,449 pre-scored
  cross-book links that were previously stripped before embedding). `search_vault`
  appends them as a "Related chapters" pointer line so the model can follow one
  with a second call rather than diluting its six passage slots.

Both of those require a full re-embed, so they only take effect after
`index_vault.py --rebuild`.

## One-time setup
1. **Ollama** — install from https://ollama.com, then:
   ```
   ollama serve
   ollama pull nomic-embed-text
   ```
2. **Claude Code login (Max, no API key):**
   ```
   claude logout && claude login        # choose Max credentials only
   ```
   Make sure `ANTHROPIC_API_KEY` is **not** set in the shell that runs the server
   (`echo %ANTHROPIC_API_KEY%` should be empty) — the SDK prefers a key if it finds one.
3. **Python deps:** `pip install -r requirements.txt`

## Build the index
```
set VAULT_PATH=C:\Users\Zaki_Mir\Desktop\Financial Texts
python index_vault.py --books "Private Capital" "Discounted Cash Flow"   # subset first
python index_vault.py                                                    # full vault (incremental)
python index_vault.py --rebuild                                          # wipe + re-embed
```
Re-runs only re-embed notes whose mtime changed. A full `--rebuild` is ~131k
chunks at roughly 24 chunks/s, so budget about 90 minutes.

Set `VAULT_DB` to build into a different file, so a full re-embed can be prepared
off to the side and swapped in only once it verifies, leaving the live index
serving throughout:
```
set VAULT_DB=%CD%\vault_rebuild.db
python index_vault.py --rebuild
```

`find_duplicate_books.py` reports books imported twice. Retrieval already folds
them, so removing the redundant directories is optional housekeeping; `--delete`
moves them to a timestamped quarantine folder rather than deleting outright.

## Run the server
```
python server.py        # http://localhost:3001
```

## Endpoints
- `POST /ask`    `{ "question": "...", "category": "<book>?" }` → `{ answer, sources }`
- `POST /define` `{ "term": "..." }` → `{ term, definition, cached }` (glossary-cached)
- `GET  /health` → `{ status, chunks, ask_model, define_model }`

```
curl -X POST http://localhost:3001/ask -H "Content-Type: application/json" \
  -d "{\"question\":\"What is the accrual ratio and why does it matter?\"}"
```
A token-usage line prints in the server console after each run — that confirms it
ran on the Max session.

## Models
- `/ask` → `claude-sonnet-4-6` (strong, efficient on the subscription)
- `/define` → `claude-haiku-4-5` (cheap; results cached in the `glossary` table)

## Answer verification (`rag/eval/`)

Measuring whether the model's figures actually reconcile to the app's own data.
Nothing here runs in the request path, and none of it touches `server.py`.

The eval set is **generated, not hand-labelled**: `backend/` already knows the true
WACC, ROIC and DCF value for every ticker, 214 definition files carry a
machine-extractable formula, and `build_group_integrity` returns a severity and a
threshold per check. 530 items today.

```bash
# 1. Freeze the exact prompt input by running the app's own TS serializer.
#    Do NOT reimplement buildDataContext in Python; it emits three numeric
#    conventions in one blob and a copy would drift silently.
node rag/eval/capture_context.mjs --ticker AAPL --ticker MSFT --out ctx.json

# 2. Generate items. --refresh DIFFS changed oracles instead of rewriting them.
python -m eval.build_set --contexts ctx.json --definitions --adversarial \
                         --integrity Technology Healthcare

# 3. Run them through the live RAG server and grade. --fresh is REQUIRED on a
#    re-run: /define returns a cached glossary row before it ever calls the
#    model, so without it you grade the previous run's answer.
python -m eval.run_eval --limit 40 --fresh --out eval/runs/baseline.jsonl

# 4. Calibrate the tolerance constants against those real answers.
python -m eval.verify_calibrate --runs eval/runs/baseline.jsonl --review
```

The calibration target is **zero false-positive mismatches**, not maximum
mismatches found. False positives are identified without hand labels by two
signals: a mismatch inside 2% is almost always a grader artefact (a model that
hallucinates does not miss by 0.4%), and a claim agreeing with the independent
oracle while disagreeing with the blob is a false positive by construction.

## Research tools (`research_tools.py`)

Three free, keyless, LOCAL MCP servers give `/ask` and `/explain` full-page web
extraction and academic-paper access, in tandem with the vault (which remains the
primary voice by prompt contract):

| Server | Package | Role |
|---|---|---|
| `fetch` | `mcp-server-fetch` (PyPI, official MCP reference) | URL to clean markdown, `start_index` pagination for long pages |
| `arxiv` | `arxiv-mcp-server` (PyPI) | search arXiv, abstracts, download + read full paper text (storage pinned to `rag/arxiv_papers/`) |
| `papers` | `paper-search-mcp` (PyPI) | multi-source paper SEARCH: SSRN, Semantic Scholar, OpenAlex, Google Scholar, PubMed |

Flag: **`RAG_RESEARCH` in {on, off}, default on.** `off` restores the previous
tool surface exactly.

The three servers advertise 72 tools; only a curated 10 are exposed
(`ALLOWED_RESEARCH`). The rest are stripped via `disallowed_tools` and denied by
the permission guard: Sci-Hub on legal grounds, every arbitrary-path `download_*`,
and workflow machinery (watches, BibTeX, LaTeX outlines). After upgrading any of
the three packages, re-run `python probe_mcp_tools.py`; a silently renamed tool
becomes a denied tool in production.

Adoption is steered by a GUIDANCE block appended to the USER message, which
restates: vault first and majority-voice, page figures authoritative, cite every
source. That block stays in the user message on purpose, because the set of
research tools varies per request (the flag can be off, and a server whose package
is missing is dropped) while a system prompt is unconditional. `ASK_SYSTEM` adds
only a name-free note that these tools may or may not be offered.

Install (already done on this box):
```
<python> -m pip install mcp-server-fetch paper-search-mcp arxiv-mcp-server
```

## Tests
```
python -m pytest rag/test_retrieval.py -q              # pure, network-free
python -m pytest rag/test_retrieval.py -q -m live      # needs vault.db + ollama
python -m pytest rag/test_eval.py -q                   # extractors + graders
python -m pytest rag/test_research_tools.py -q         # research MCP wiring
```

## Notes
- Ollama must be running for both indexing and queries (queries embed locally).
- `vault.db` is git-ignored (large, machine-specific) — rebuild it with `index_vault.py`.
- The lexical index is external-content FTS5, so it does not track inserts and
  deletes on its own. `index_vault.py` rebuilds it after any run that wrote, and
  `server.py` builds it on first open if the database predates it.
- Retrieval constants in `retrieval.py` are ablated, not chosen by taste. Two of
  them measured *worse* under the tidier-looking setting; the tests assert the
  measured values so a cleanup cannot silently regress them.
