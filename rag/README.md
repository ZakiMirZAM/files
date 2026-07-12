# Vault RAG server

Answers investing questions and defines terms from the local "Financial Texts"
Obsidian vault. Retrieval is fully local; answers are written by Claude through
the **Claude Code login session** (Max subscription) via the Claude Agent SDK —
**no API key is used or stored.**

```
Obsidian vault ──index_vault.py──▶ vault.db (sqlite-vec, nomic-embed-text 768-d)
                                        │
   React app ──HTTP :3001──▶ server.py ─┤ search_vault (local KNN)  ← only tool
                                        └ Claude Agent SDK ──▶ claude (Max login)
```

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
Re-runs only re-embed notes whose mtime changed.

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

## Notes
- Ollama must be running for both indexing and queries (queries embed locally).
- `vault.db` is git-ignored (large, machine-specific) — rebuild it with `index_vault.py`.
- The agent is restricted to the `search_vault` tool only (a permission guard denies
  everything else), so it cannot run shell/file/web tools.
