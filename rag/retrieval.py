"""Retrieval for the vault RAG server.

Replaces a bare top-6 nearest-neighbour lookup with four stages, each fixing a
failure measured against the live index (131,463 chunks, 2,898 notes):

  1. QUERY EXPANSION. `nomic-embed-text` produces a weak, near-centroid vector for
     a one-token query, so the app's own metric labels retrieved junk: "WACC"
     returned a back-of-book index page and Ibn Khaldun's Muqaddimah, with one
     on-topic chunk at rank 4. The same corpus returns Damodaran and The Valuation
     Handbook at distance 0.637 once the acronym is spelled out. `/define` and
     `/explain` pass bare labels, so they took nearly all of that damage.

  2. EXACT-PHRASE BM25, fused with the vector hits by reciprocal rank. Dense
     vectors are worst exactly where finance is most precise: acronyms, symbol
     tokens and eponyms. "EV/EBITDA" matched 84 chunks lexically and ZERO within a
     200-deep vector pool. Note the operator matters. Fusing an OR-of-tokens BM25
     query moved precision@6 by 2 points; the exact-phrase form is what carries it.

  3. DISTANCE THRESHOLD. Nothing previously stopped a bad match being handed to the
     model under a prompt that calls the vault "the primary voice". The two
     populations separate cleanly: every failing query's nearest neighbour sat
     above 0.88, every working one at or below 0.762. Below the cut we return
     nothing and let the prompt's own "fill from general knowledge" path run.

  4. DE-DUPLICATION. 11 books were indexed twice under punctuation-variant
     directory names (~20k duplicate rows), so a single answer could spend two of
     its six slots on one passage.

`category` is now resolved to a book id and applied as a rowid pre-filter. The old
post-hoc substring over a fixed pool starved: "Competitive Strategy" had 815 chunks
indexed and returned 0, and "Investment Valuation" returned 0 because the vault
directories spell it with dashes.

Flag: RAG_RETRIEVAL in {on, off}, default on. `off` restores the legacy path.
"""
from __future__ import annotations

import os
import re
import sqlite3
import threading

import sqlite_vec

from books import book_id, display_title, fold
from rag_embed import embed_query

MODE = os.environ.get("RAG_RETRIEVAL", "on").lower()

TOP_K = 6
# Pools were swept against the live index: 100/100 measured 6 points better than
# 50/50, and 150/150 added nothing. The embedding round trip dominates latency, so
# a wider pool is close to free.
VEC_POOL = 100         # vector candidates entering the fusion
LEX_POOL = 100         # exact-phrase candidates entering the fusion
RRF_K = 60             # reciprocal-rank-fusion damping constant

# L2 over unit-normalised nomic vectors: 0 = identical, 1.414 = orthogonal.
# Measured separation: junk queries >= 0.887, working queries <= 0.762.
# This is insurance, not a precision lever. On in-domain queries it scores the
# same as having no floor at all, because fusion already ranks the junk out. What
# it buys is the out-of-domain case, where it returns nothing instead of handing
# the model an unrelated passage under a prompt that calls the vault the primary
# voice. Tightening it below 0.85 starts cutting real hits (0.80 lost 6 points).
MAX_DISTANCE = 0.85

MAX_PREFILTER_IDS = 20000   # beyond this, rowid IN (...) stops paying for itself
DEDUPE_TEXT_CHARS = 400     # prefix length used to spot the same passage twice


# --- 1. query expansion -----------------------------------------------------
# Only terms whose expansion is unambiguous in a finance corpus. A wrong
# expansion actively hurts: an over-broad rewrite of "return on invested capital"
# dropped its precision from 4/6 to 0/6 in testing, because the added words pulled
# the query toward cost-of-capital passages. Short queries with no entry here are
# left alone and rely on the exact-phrase channel instead.
EXPANSIONS: dict[str, str] = {
    "wacc": "weighted average cost of capital",
    "roic": "return on invested capital",
    "roe": "return on equity",
    "roa": "return on assets",
    "roce": "return on capital employed",
    "fcff": "free cash flow to the firm",
    "fcfe": "free cash flow to equity",
    "dcf": "discounted cash flow valuation",
    "eva": "economic value added residual income",
    "epv": "earnings power value",
    "cape": "cyclically adjusted price earnings ratio",
    "pe10": "cyclically adjusted price earnings ratio",
    "erp": "equity risk premium",
    "ddm": "dividend discount model",
    "capm": "capital asset pricing model",
    "ebit": "earnings before interest and taxes",
    "ebitda": "earnings before interest taxes depreciation and amortization",
    "ev": "enterprise value",
    "ev/ebitda": "enterprise value to EBITDA multiple",
    "ev/ebit": "enterprise value to EBIT multiple",
    "ev/sales": "enterprise value to sales multiple",
    "p/e": "price to earnings ratio",
    "pe ratio": "price to earnings ratio",
    "p/b": "price to book ratio",
    "peg": "price earnings to growth ratio",
    "fcf": "free cash flow",
    "nopat": "net operating profit after tax",
    "wc": "working capital",
    "sbc": "stock based compensation",
    "cagr": "compound annual growth rate",
    "irr": "internal rate of return",
    "npv": "net present value",
    "tsr": "total shareholder return",
    "capex": "capital expenditures",
    "opex": "operating expenses",
    "d&a": "depreciation and amortization",
    "nwc": "net working capital",
    "ke": "cost of equity",
    "kd": "cost of debt",
    "m-score": "Beneish M-Score earnings manipulation detection",
    "z-score": "Altman Z-Score bankruptcy prediction",
    "altman z-score": "bankruptcy prediction distress model",
    "beneish m-score": "earnings manipulation detection model",
    "tobin's q": "ratio of market value to replacement cost of assets",
    "graham number": "Graham intrinsic value formula for defensive investors",
    "dupont": "DuPont decomposition of return on equity",
    "gics": "global industry classification standard sector",
    "def 14a": "annual proxy statement executive compensation disclosure",
    "10-k": "annual report filing",
    "10-q": "quarterly report filing",
    "moat": "durable competitive advantage",
    "tam": "total addressable market",
}

_WORD_RE = re.compile(r"[A-Za-z0-9]+")


# Swept against the live index: 2 is where the curve plateaus (3 and 4 score
# identically, 1 and 0 lose 4 points), so take the shortest query that gets there.
MAX_ADDITIONS = 2
SKIP_NESTED_KEYS = False


def expand_query(text: str, *, max_additions: int | None = None,
                 skip_nested: bool | None = None) -> str:
    """Append the canonical long form of any acronym present in the query.

    The original wording is kept, not replaced: it still carries the user's intent
    and it is what the exact-phrase channel matches on.

    Both knobs were set by ablation against the live index, not by taste. Notably
    `skip_nested=True` reads tidier ("Altman Z-Score" stops expanding through both
    its own key and the nested "z-score" key) but measured 7 points WORSE, because
    the repetition weights the head term. Do not "clean this up" without re-running
    the ablation.
    """
    if not text:
        return text
    # Resolved at call time, not bound as a default, so the ablation harness can
    # sweep the module globals.
    if max_additions is None:
        max_additions = MAX_ADDITIONS
    if skip_nested is None:
        skip_nested = SKIP_NESTED_KEYS
    lowered = text.lower()
    additions: list[str] = []
    matched: list[str] = []

    # Longest key first so "ev/ebitda" wins over "ev" and "altman z-score" over "z-score".
    for key in sorted(EXPANSIONS, key=len, reverse=True):
        if skip_nested and any(key in prior for prior in matched):
            continue
        # Bare acronyms must match as whole tokens, or "ev" fires inside "seven".
        pattern = re.escape(key)
        if key[0].isalnum():
            pattern = rf"\b{pattern}"
        if key[-1].isalnum():
            pattern = rf"{pattern}\b"
        if not re.search(pattern, lowered):
            continue
        matched.append(key)
        value = EXPANSIONS[key]
        if value.lower() in lowered or value in additions:
            continue
        additions.append(value)
        if len(additions) >= max_additions:
            break
    return f"{text} {' '.join(additions)}" if additions else text


def phrase_for(text: str) -> str:
    """The exact phrase the lexical channel searches for.

    The user's own words, not the expansion: an exact-phrase hit on "EV/EBITDA" is
    the signal, and diluting it with expansion tokens is what made the first
    OR-based fusion attempt worthless.
    """
    return " ".join(_WORD_RE.findall(text))


# --- FTS5 lexical index -----------------------------------------------------
_fts_lock = threading.Lock()
_fts_ready = False


def ensure_fts(db: sqlite3.Connection) -> bool:
    """Create the exact-phrase index if absent. Builds over 131k chunks in ~7s and
    is a no-op on every later call, so it self-heals a database indexed before
    this module existed."""
    global _fts_ready
    if _fts_ready:
        return True
    with _fts_lock:
        if _fts_ready:
            return True
        try:
            exists = db.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='chunks_fts'"
            ).fetchone()
            if not exists:
                _create_fts(db)
            _fts_ready = True
        except sqlite3.Error as exc:
            # Retrieval must degrade to vector-only rather than fail the request.
            print(f"[retrieval] FTS unavailable, vector-only: {exc}", flush=True)
            return False
    return True


def _create_fts(db: sqlite3.Connection) -> None:
    """External-content FTS5 over `chunks`, so the 177 MB of text is not stored
    twice. `rebuild` is the supported way to populate an external-content table."""
    db.execute(
        "CREATE VIRTUAL TABLE chunks_fts USING fts5("
        "text, content='chunks', content_rowid='id', tokenize='porter unicode61')"
    )
    db.execute("INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild')")
    db.commit()


def reindex_fts(db: sqlite3.Connection) -> None:
    """Rebuild the lexical index from `chunks`. Called by index_vault after a run,
    because an external-content table does not track inserts and deletes by itself."""
    global _fts_ready
    db.execute("DROP TABLE IF EXISTS chunks_fts")
    _create_fts(db)
    _fts_ready = True


# --- category resolution ----------------------------------------------------
_book_map: dict[str, list[str]] | None = None   # canonical book id -> directories
_canon: dict[str, str] = {}                     # raw book id -> canonical book id
_book_lock = threading.Lock()


def _books(db: sqlite3.Connection) -> dict[str, list[str]]:
    """Canonical book id -> every directory spelling it covers. Built once per
    process; duplicate imports of one book collapse onto a single key here."""
    global _book_map, _canon
    if _book_map is not None:
        return _book_map
    with _book_lock:
        if _book_map is None:
            dirs = [c for (c,) in db.execute("SELECT DISTINCT category FROM chunks") if c]
            _canon = fold(book_id(d) for d in dirs)
            mapping: dict[str, list[str]] = {}
            for d in dirs:
                mapping.setdefault(canonical_id(d), []).append(d)
            _book_map = mapping
    return _book_map


def canonical_id(directory: str) -> str:
    """Book id with duplicate imports folded onto one key. Falls back to the raw
    id before the map is built, which only affects de-duplication."""
    raw = book_id(directory)
    return _canon.get(raw, raw)


def resolve_category(db: sqlite3.Connection, category: str) -> list[str]:
    """Loose book name -> the directory spellings to restrict retrieval to.

    Matches on the punctuation-free key in both directions, so "Investment
    Valuation" now reaches `investment-valuation-3rd-edition` and
    `dokumen.pub_investment-valuation-university-edition...`, and both duplicate
    spellings of a doubled book resolve together.
    """
    key = book_id(category or "")
    if not key:
        return []
    dirs: list[str] = []
    for bid, spellings in _books(db).items():
        if key in bid or bid in key:
            dirs.extend(spellings)
            continue
        if any(key in book_id(display_title(s)) for s in spellings):
            dirs.extend(spellings)
    return dirs


# --- 2/3/4. hybrid search ---------------------------------------------------
def _prefilter_ids(db: sqlite3.Connection, dirs: list[str]) -> list[int] | None:
    """Chunk ids belonging to the requested books, or None when the set is too
    large to bind (fall back to a wide pool plus a post-filter)."""
    if not dirs:
        return []
    qs = ",".join("?" * len(dirs))
    ids = [r[0] for r in db.execute(
        f"SELECT id FROM chunks WHERE category IN ({qs}) LIMIT {MAX_PREFILTER_IDS + 1}", dirs)]
    return None if len(ids) > MAX_PREFILTER_IDS else ids


# When a category resolves to more chunks than the rowid pre-filter can bind,
# fall back to a wide unfiltered KNN and post-filter by category. Without this the
# vector channel silently returned OFF-category hits (a "Economics" search surfaced
# Porter's Competitive Strategy) while the lexical channel stayed correctly scoped.
CATEGORY_POOL = 2000


def _vector_hits(db: sqlite3.Connection, qtext: str, limit: int,
                 only_ids: list[int] | None, dirs: list[str] | None = None) -> list[dict]:
    emb = sqlite_vec.serialize_float32(embed_query(qtext))
    if only_ids is None:
        if dirs:
            # Category set but too large to bind as rowids: widen the KNN and keep
            # only the requested books, then let fusion/dedup cap at top_k.
            qs = ",".join("?" * len(dirs))
            rows = db.execute(
                f"""WITH knn AS (SELECT rowid, distance FROM vec_chunks
                                 WHERE embedding MATCH ? ORDER BY distance LIMIT ?)
                    SELECT c.id, c.source, c.text, knn.distance
                    FROM knn JOIN chunks c ON c.id = knn.rowid
                    WHERE c.category IN ({qs}) ORDER BY knn.distance LIMIT ?""",
                (emb, CATEGORY_POOL, *dirs, limit)).fetchall()
            return [{"id": i, "source": s, "text": t, "distance": d} for i, s, t, d in rows]
        rows = db.execute(
            """WITH knn AS (SELECT rowid, distance FROM vec_chunks
                            WHERE embedding MATCH ? ORDER BY distance LIMIT ?)
               SELECT c.id, c.source, c.text, knn.distance
               FROM knn JOIN chunks c ON c.id = knn.rowid ORDER BY knn.distance""",
            (emb, limit)).fetchall()
    else:
        if not only_ids:
            return []
        qs = ",".join("?" * len(only_ids))
        rows = db.execute(
            f"""WITH knn AS (SELECT rowid, distance FROM vec_chunks
                             WHERE embedding MATCH ? AND rowid IN ({qs})
                             ORDER BY distance LIMIT ?)
                SELECT c.id, c.source, c.text, knn.distance
                FROM knn JOIN chunks c ON c.id = knn.rowid ORDER BY knn.distance""",
            (emb, *only_ids, limit)).fetchall()
    return [{"id": i, "source": s, "text": t, "distance": d} for i, s, t, d in rows]


def _fts_query(db: sqlite3.Connection, match: str, limit: int,
               dirs: list[str] | None) -> list[dict]:
    params: list = [match]
    sql = ("SELECT c.id, c.source, c.text FROM chunks_fts JOIN chunks c ON c.id = chunks_fts.rowid "
           "WHERE chunks_fts MATCH ?")
    if dirs:
        sql += f" AND c.category IN ({','.join('?' * len(dirs))})"
        params.extend(dirs)
    sql += " ORDER BY bm25(chunks_fts) LIMIT ?"
    params.append(limit)
    try:
        rows = db.execute(sql, params).fetchall()
    except sqlite3.Error:
        return []   # an unparseable query must not fail the request
    return [{"id": i, "source": s, "text": t, "distance": None} for i, s, t in rows]


def _phrase_hits(db: sqlite3.Connection, phrase: str, limit: int,
                 dirs: list[str] | None) -> list[dict]:
    """Exact phrase first, then all-terms as a fallback.

    The exact phrase is the high-precision signal and stays first. But the app's
    label is not always the corpus's wording: "M-Score" appears zero times in the
    vault, which writes "M Score", and "Beneish M Score" never occurs as an
    adjacent sequence at all. Requiring every term still pins the rare token
    ("Beneish" is in 21 chunks) without the OR-of-terms dilution that made the
    first fusion attempt worthless.
    """
    if not phrase or not ensure_fts(db):
        return []
    hits = _fts_query(db, f'"{phrase}"', limit, dirs)
    if hits:
        return hits
    terms = [t for t in phrase.split() if len(t) > 1]
    if len(terms) < 2:
        return hits
    return _fts_query(db, " AND ".join(f'"{t}"' for t in terms), limit, dirs)


def _rrf(*channels: list[dict]) -> list[dict]:
    """Reciprocal rank fusion. Rank-based, so it needs no score calibration between
    an L2 distance and a BM25 score."""
    scores: dict[int, float] = {}
    best: dict[int, dict] = {}
    for channel in channels:
        for rank, hit in enumerate(channel, 1):
            cid = hit["id"]
            scores[cid] = scores.get(cid, 0.0) + 1.0 / (RRF_K + rank)
            prior = best.get(cid)
            # Keep whichever copy carries a distance, for the caller's telemetry.
            if prior is None or (prior["distance"] is None and hit["distance"] is not None):
                best[cid] = hit
    return [best[cid] for cid, _ in sorted(scores.items(), key=lambda kv: -kv[1])]


def _dedupe(hits: list[dict], top_k: int) -> list[dict]:
    """One passage per (book, chapter), and never the same text twice."""
    seen_text: set[str] = set()
    seen_chapter: set[tuple[str, str]] = set()
    out: list[dict] = []
    for hit in hits:
        directory, _, note = hit["source"].rpartition("/")
        key = (canonical_id(directory.removeprefix("Books/")), note)
        head = hit["text"][:DEDUPE_TEXT_CHARS]
        if head in seen_text or key in seen_chapter:
            continue
        seen_text.add(head)
        seen_chapter.add(key)
        out.append(hit)
        if len(out) >= top_k:
            break
    return out


def search(db: sqlite3.Connection, qtext: str, category: str | None = None,
           top_k: int = TOP_K) -> list[dict]:
    """Expand, retrieve on both channels, fuse, threshold, de-duplicate."""
    qtext = (qtext or "").strip()
    if not qtext:
        return []
    _books(db)   # warm the fold map; de-duplication below depends on it

    dirs: list[str] | None = None
    only_ids: list[int] | None = None
    if category:
        dirs = resolve_category(db, category)
        if not dirs:
            # An unknown book name must not silently return an empty answer;
            # fall back to searching everything.
            print(f"[retrieval] unknown category {category!r}, searching all books", flush=True)
            dirs = None
        else:
            only_ids = _prefilter_ids(db, dirs)

    vector = _vector_hits(db, expand_query(qtext), VEC_POOL, only_ids, dirs)
    # 3. Threshold: drop vector hits that are nearer the floor of the space than
    # the query, so junk is never presented as the vault's voice.
    vector = [h for h in vector if h["distance"] is not None and h["distance"] <= MAX_DISTANCE]
    lexical = _phrase_hits(db, phrase_for(qtext), LEX_POOL, dirs)

    if not vector and not lexical:
        return []
    return _dedupe(_rrf(vector, lexical), top_k)


def legacy_search(db: sqlite3.Connection, qtext: str, category: str | None = None,
                  top_k: int = TOP_K) -> list[dict]:
    """The pre-2026-07-27 path, kept reachable via RAG_RETRIEVAL=off."""
    emb = sqlite_vec.serialize_float32(embed_query(qtext))
    pool = 400 if category else 24
    rows = db.execute(
        """WITH knn AS (SELECT rowid, distance FROM vec_chunks
                        WHERE embedding MATCH ? ORDER BY distance LIMIT ?)
           SELECT c.id, c.source, c.text, knn.distance
           FROM knn JOIN chunks c ON c.id = knn.rowid ORDER BY knn.distance""",
        (emb, pool)).fetchall()
    results = [{"id": i, "source": s, "text": t, "distance": d} for i, s, t, d in rows]
    if category:
        cl = category.lower()
        results = [r for r in results if cl in r["source"].lower()]
    return results[:top_k]


def run(db: sqlite3.Connection, qtext: str, category: str | None = None,
        top_k: int = TOP_K) -> list[dict]:
    """Flag-gated entry point used by the server."""
    if MODE == "off":
        return legacy_search(db, qtext, category, top_k)
    return search(db, qtext, category, top_k)


# --- 6. the Related graph ---------------------------------------------------
# Cross-book edge weights run 0.57 to 1.00, median 0.82. Below this floor the
# links are topical noise ("About the Type" pointing at a name index).
MIN_RELATED_SIM = 0.80


def related_notes(db: sqlite3.Connection, sources: list[str], limit: int = 4) -> list[dict]:
    """Strongest `## Related` neighbours of the retrieved passages.

    The vault carries 19,449 pre-scored wikilinks across 2,850 notes and the
    indexer used to strip them before embedding, so none of that structure was
    reachable. Returned as navigation, not as extra context: the model can follow a
    link with a second search_vault call rather than have its six slots diluted.

    Two filters matter. The weight floor drops the noise tail. The canonical-book
    check drops the duplicate imports, which the vault's own `same_book` flag
    misses entirely: a book present under two directory names links to its own
    other copy at sim 1.00, and those edges otherwise dominate the top of the list.
    """
    if not sources:
        return []
    try:
        qs = ",".join("?" * len(sources))
        rows = db.execute(
            f"""SELECT dst_note, dst_book, MAX(sim) s FROM related_edges
                WHERE src_source IN ({qs}) AND same_book = 0 AND sim >= ?
                GROUP BY dst_note, dst_book ORDER BY s DESC LIMIT ?""",
            (*sources, MIN_RELATED_SIM, limit * 6)).fetchall()
    except sqlite3.Error:
        return []   # table absent until the vault is re-indexed

    _books(db)
    origin = {canonical_id(s.split("/")[1]) for s in sources
              if s.startswith("Books/") and len(s.split("/")) > 2}
    seen: set[tuple[str, str]] = set()
    out: list[dict] = []
    for note, book, sim in rows:
        # Key on (book, note), not note alone. Generic chapter titles like
        # "Ch01 - Introduction" recur across 22 unrelated books here, so deduping
        # by title dropped every legitimately distinct book after the first.
        key = (canonical_id(book or ""), note)
        if canonical_id(book or "") in origin or key in seen:
            continue
        seen.add(key)
        out.append({"note": note, "book": display_title(book or ""), "sim": sim})
        if len(out) >= limit:
            break
    return out
