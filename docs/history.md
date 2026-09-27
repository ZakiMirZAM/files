# History: rag/server.py owner-approved changes

Moved verbatim from CLAUDE.md on 2026-09-27.

- All RAG protection (origin pinning, per-IP rate limits, wildcard-CORS strip, body caps) is done
  at **nginx** — treat `rag/server.py` as **protected**: never change its prompt, model, or Claude
  SDK logic without explicit owner approval. Three owner-approved changes exist so far:
  - **2026-07-17**: the vault search runs via `asyncio.to_thread` (blocking embed/KNN off the event
    loop — the fix for /ask 500s under parallel load) and the three answer handlers return JSON 503
    on SDK failure instead of aiohttp's HTML 500. Prompts, models, tools, and budgets unchanged.
  - **2026-07-28**: `options_for` passes `setting_sources=[]` + `strict_mcp_config=True`. `None` does
    NOT mean "load nothing" in this SDK, it omits the flag, so every request had been loading this
    repo's `CLAUDE.md`, ~31 user skills and user hooks. `rag/eval/verify_isolation.py` asserts the
    fix at the argv level.
  - **2026-07-29**: **`ASK_SYSTEM` was rewritten** from `docs/prompts/metric-definitions-master-prompt-v2.md`
    (answer-first structure, the house style rules, the verified Quality Score facts, plus new
    CALCULATOR and WRITING FIGURES sections), and `RAG_CALC` now defaults to `on`. `EXPLAIN_SYSTEM`
    and `DEFINE_SYSTEM` are byte-identical and still hash-locked. **The prompts are no longer
    immutable, but they are still hash-pinned**: an edit must update `EXPECTED` in
    `rag/test_prompts.py` in the same commit. Runtime mutation of a prompt remains banned outright.
    A second 2026-07-29 edit added the owner's analytical method: **THE EIGHT ANALYTICAL FRAMES**
    (5W1H + significance + assumptions, limitations, tradeoffs/incentives/scarcity/geography as a
    *menu* rather than a checklist, best industry or company, pros against cons, how it can be
    analyzed, long against short term, and possible/plausible/probable as three separate tests),
    **ECONOMIC AND MACRO QUESTIONS** (classify all eleven GICS sectors as favored / not favored /
    not affected, then give the per-sector earnings link, mirroring `economic/00-INDEX.md` parts 3
    and 4; the mechanism must be an earnings or discount-rate channel, never a correlation, and the
    CAUSE of a move changes the answer), and the **humanizer anti-patterns** folded into STYLE (no
    vague attribution, no knowledge-cutoff disclaimers, no negative parallelism, no superficial
    `-ing` clauses, no copula avoidance, straight quotes, sentence-case headings, no conversational
    artifacts, no generic positive closing). The humanizer's PERSONALITY AND SOUL half is
    deliberately NOT imported: it tells the writer to use "I", state opinions and leave in
    half-formed thoughts, which fights the house voice. `/ask` also moved to **Opus 5 at `high`
    effort** (from Sonnet 5 at `max`, which measured 15 turns and overran the client timeout);
    on the same request that cut 115s to 33.7s and numeric fidelity 0.73 to 1.00.
