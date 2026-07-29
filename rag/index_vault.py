"""Index the Obsidian "Financial Texts" vault into vault.db for the RAG server.

Reads each note, strips frontmatter / Related blocks, splits into ~400-token
chunks, embeds them locally with Ollama nomic-embed-text, and stores everything
in a sqlite-vec database. The book directory (not the bare "Books" parent)
becomes the chunk's `category`.

Incremental: only re-embeds notes whose mtime changed since the last run.
  python index_vault.py                       # incremental, whole vault
  python index_vault.py --books "Private Capital" "Discounted Cash Flow"
  python index_vault.py --rebuild             # wipe and re-embed everything

Ollama must be running and the model pulled first:
  ollama serve  &&  ollama pull nomic-embed-text
"""
from __future__ import annotations

import argparse
import os
import sqlite3
import sys
import time

import sqlite_vec

import retrieval
from books import book_id, context_prefix, display_title, fold
from chunking import embed_text, note_sections, parse_related
from rag_embed import DIM, MODEL, embed_documents

VAULT = os.environ.get("VAULT_PATH", r"C:\Users\Zaki_Mir\Desktop\Financial Texts")
# Overridable so a full re-embed can be built off to the side and swapped in only
# after it verifies, leaving the live index serving throughout. Mirrors the
# FINANCIALS_DB convention the app backend uses for the same reason.
DB_PATH = os.environ.get(
    "VAULT_DB", os.path.join(os.path.dirname(os.path.abspath(__file__)), "vault.db"))
BATCH = 128
SKIP_NAMES = {"_MOC.md", "Library MOC.md"}


def long_path(p: str) -> str:
    """Bypass the Windows 260-char MAX_PATH limit when opening long note paths."""
    if sys.platform == "win32" and not p.startswith("\\\\?\\"):
        return "\\\\?\\" + os.path.abspath(p)
    return p


def connect() -> sqlite3.Connection:
    db = sqlite3.connect(DB_PATH)
    db.enable_load_extension(True)
    sqlite_vec.load(db)
    db.enable_load_extension(False)
    db.execute("CREATE TABLE IF NOT EXISTS chunks (id INTEGER PRIMARY KEY, category TEXT, source TEXT, text TEXT)")
    db.execute(f"CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(embedding float[{DIM}])")
    db.execute("CREATE TABLE IF NOT EXISTS files (path TEXT PRIMARY KEY, mtime REAL)")
    db.execute("CREATE TABLE IF NOT EXISTS glossary (term TEXT PRIMARY KEY, definition TEXT)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_chunks_category ON chunks(category)")
    # Added 2026-07-27. `book_id` folds the duplicate imports of one book; `context`
    # records the "Book > Chapter > Heading" trail that now prefixes the embedded
    # text. Added with ALTER so an existing database upgrades in place.
    cols = {r[1] for r in db.execute("PRAGMA table_info(chunks)")}
    if "book_id" not in cols:
        db.execute("ALTER TABLE chunks ADD COLUMN book_id TEXT")
    if "context" not in cols:
        db.execute("ALTER TABLE chunks ADD COLUMN context TEXT")
    db.execute("CREATE INDEX IF NOT EXISTS idx_chunks_book ON chunks(book_id)")
    db.execute(
        """CREATE TABLE IF NOT EXISTS related_edges (
               src_source TEXT, dst_note TEXT, dst_book TEXT,
               sim REAL, same_book INTEGER,
               PRIMARY KEY (src_source, dst_note, dst_book))"""
    )
    db.execute("CREATE INDEX IF NOT EXISTS idx_edges_src ON related_edges(src_source)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_edges_dst ON related_edges(dst_note)")
    db.execute(
        """CREATE TABLE IF NOT EXISTS books (
               book_id TEXT PRIMARY KEY, title TEXT, directories TEXT, n_chunks INTEGER)"""
    )
    return db


def category_for(rel: str) -> str:
    parts = rel.split(os.sep)
    if parts[0] == "Books" and len(parts) > 1:
        return parts[1]
    return parts[0]


def delete_file_rows(db: sqlite3.Connection, source: str) -> None:
    ids = [r[0] for r in db.execute("SELECT id FROM chunks WHERE source = ?", (source,))]
    if ids:
        qs = ",".join("?" * len(ids))
        db.execute(f"DELETE FROM vec_chunks WHERE rowid IN ({qs})", ids)
        db.execute("DELETE FROM chunks WHERE source = ?", (source,))
    db.execute("DELETE FROM related_edges WHERE src_source = ?", (source,))


def embed_file(db: sqlite3.Connection, category: str, source: str,
               sections: list[tuple[str, str]]) -> int:
    """Embed one note's chunks (in sub-batches) and insert chunk + vector rows.
    Caller commits together with the file's mtime so each note is atomic.

    The vector is built from `embed_text`, which prefixes the book and chapter, so
    a continuation window is no longer anonymous in the embedding space. The row
    stores the ORIGINAL text, so what the model reads back is unchanged.
    """
    prefix = context_prefix(source)
    bid = book_id(category)
    written = 0
    for i in range(0, len(sections), BATCH):
        sub = sections[i:i + BATCH]
        embs = embed_documents([embed_text(prefix, heading, text) for heading, text in sub])
        for (heading, text), emb in zip(sub, embs):
            trail = " > ".join(p for p in (prefix, heading) if p)
            cur = db.execute(
                "INSERT INTO chunks (category, source, text, book_id, context) "
                "VALUES (?, ?, ?, ?, ?)",
                (category, source, text, bid, trail),
            )
            db.execute(
                "INSERT INTO vec_chunks (rowid, embedding) VALUES (?, ?)",
                (cur.lastrowid, sqlite_vec.serialize_float32(emb)),
            )
        written += len(sub)
    return written


def save_related(db: sqlite3.Connection, source: str, raw_md: str) -> int:
    """Persist the note's `## Related` wikilinks as graph edges."""
    edges = parse_related(raw_md)
    if edges:
        db.executemany(
            "INSERT OR REPLACE INTO related_edges "
            "(src_source, dst_note, dst_book, sim, same_book) VALUES (?, ?, ?, ?, ?)",
            [(source, e["note"], e["book"], e["sim"], int(e["same_book"])) for e in edges],
        )
    return len(edges)


def rebuild_book_table(db: sqlite3.Connection) -> int:
    """Refresh the `books` lookup the category filter resolves against.

    Keyed on the CANONICAL id, so a book imported twice under punctuation-variant
    directory names appears once with both spellings recorded.
    """
    db.execute("DELETE FROM books")
    rows = db.execute(
        "SELECT category, COUNT(*) FROM chunks WHERE category IS NOT NULL GROUP BY category"
    ).fetchall()
    canon = fold(book_id(category) for category, _ in rows)
    merged: dict[str, tuple[set, int]] = {}
    for category, n in rows:
        bid = canon.get(book_id(category), book_id(category))
        dirs, total = merged.get(bid, (set(), 0))
        dirs.add(category)
        merged[bid] = (dirs, total + n)
    db.executemany(
        "INSERT OR REPLACE INTO books (book_id, title, directories, n_chunks) VALUES (?, ?, ?, ?)",
        [(bid, display_title(max(dirs, key=len)), " | ".join(sorted(dirs)), n)
         for bid, (dirs, n) in merged.items()],
    )
    return len(merged)


def iter_notes(book_filter: list[str] | None):
    for root, _dirs, files in os.walk(VAULT):
        if os.sep + ".obsidian" in root + os.sep:
            continue
        for name in files:
            if not name.endswith(".md") or name in SKIP_NAMES:
                continue
            full = os.path.join(root, name)
            rel = os.path.relpath(full, VAULT)
            cat = category_for(rel)
            if book_filter and not any(k.lower() in rel.lower() for k in book_filter):
                continue
            yield full, rel.replace(os.sep, "/"), cat


def backfill_metadata(db: sqlite3.Connection) -> None:
    """Populate `book_id`, `context` and `related_edges` WITHOUT re-embedding.

    Of everything the 2026-07-27 indexing change adds, only the contextual prefix
    alters the vectors, and re-embedding 131k chunks costs hours. The rest is
    derived from the source path and the note's own `## Related` block, so an
    existing index can gain the concept graph and the folded book identity in
    minutes and pick up the improved vectors later, on its own schedule.
    """
    t0 = time.time()
    sources = [r[0] for r in db.execute("SELECT DISTINCT source FROM chunks")]
    print(f"Backfilling metadata for {len(sources)} notes (no re-embedding) ...")

    updates = [(book_id(category), context_prefix(source), source)
               for source, category in db.execute("SELECT DISTINCT source, category FROM chunks")]
    db.executemany("UPDATE chunks SET book_id = ?, context = ? WHERE source = ?", updates)
    db.commit()
    print(f"  book_id + context set on {len(updates)} notes")

    n_edges = n_missing = 0
    db.execute("DELETE FROM related_edges")
    for source in sources:
        full = os.path.join(VAULT, source.replace("/", os.sep))
        try:
            raw = open(long_path(full), encoding="utf-8", errors="replace").read()
        except OSError:
            n_missing += 1
            continue
        n_edges += save_related(db, source, raw)
    db.commit()
    print(f"  related_edges: {n_edges} links" + (f" ({n_missing} notes unreadable)" if n_missing else ""))

    n_books = rebuild_book_table(db)
    db.commit()
    print(f"  books table: {n_books} distinct books after folding duplicate imports")
    retrieval.reindex_fts(db)
    print(f"  lexical index rebuilt")
    print(f"DONE in {time.time() - t0:.1f}s")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rebuild", action="store_true", help="wipe and re-embed everything")
    ap.add_argument("--books", nargs="*", default=None, help="only index notes whose path contains one of these substrings")
    ap.add_argument("--metadata-only", action="store_true",
                    help="backfill book_id/context/related_edges on an existing index without re-embedding")
    args = ap.parse_args()

    if args.metadata_only:
        if not os.path.isdir(VAULT):
            raise SystemExit(f"VAULT_PATH not found: {VAULT}")
        db = connect()
        backfill_metadata(db)
        db.close()
        return

    if not os.path.isdir(VAULT):
        raise SystemExit(f"VAULT_PATH not found: {VAULT}")

    db = connect()
    if args.rebuild:
        print("Rebuilding: wiping chunks / vectors / file manifest ...")
        db.execute("DELETE FROM chunks")
        db.execute("DELETE FROM vec_chunks")
        db.execute("DELETE FROM files")
        db.commit()

    known = {p: m for p, m in db.execute("SELECT path, mtime FROM files")}
    t0 = time.time()
    n_files = n_skipped = n_chunks = n_edges = 0

    for full, source, category in iter_notes(args.books):
        try:
            mtime = os.path.getmtime(full)
        except OSError:
            continue
        if not args.rebuild and known.get(source) == mtime:
            n_skipped += 1
            continue
        try:
            raw = open(long_path(full), encoding="utf-8", errors="replace").read()
        except OSError as e:
            print(f"  skip (read error): {source} -> {e}")
            continue

        delete_file_rows(db, source)  # changed/new file: drop stale chunks first
        n_chunks += embed_file(db, category, source, note_sections(raw))
        n_edges += save_related(db, source, raw)
        # Record mtime in the SAME transaction as the chunks: each note is atomic,
        # so a crash never leaves an mtime without its chunks (safe to resume).
        db.execute("INSERT OR REPLACE INTO files (path, mtime) VALUES (?, ?)", (source, mtime))
        db.commit()
        n_files += 1
        if n_files % 50 == 0:
            rate = n_chunks / max(time.time() - t0, 1e-6)
            print(f"  {n_files} notes indexed, {n_chunks} chunks ({rate:.0f}/s), {n_skipped} unchanged")

    if n_files:
        # Both are derived views over `chunks`, so refresh them only when something
        # was actually written. The FTS table is external-content and does not
        # track inserts or deletes on its own.
        print("\nRebuilding derived indexes ...")
        n_books = rebuild_book_table(db)
        db.commit()
        t_fts = time.time()
        retrieval.reindex_fts(db)
        print(f"  books table: {n_books} distinct books after folding duplicate imports")
        print(f"  lexical index rebuilt in {time.time() - t_fts:.1f}s")

    total_chunks = db.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
    total_files = db.execute("SELECT COUNT(*) FROM files").fetchone()[0]
    total_edges = db.execute("SELECT COUNT(*) FROM related_edges").fetchone()[0]
    print(f"\nDONE in {time.time() - t0:.1f}s")
    print(f"  notes embedded this run: {n_files} (+{n_skipped} unchanged-skipped)")
    print(f"  chunks written this run: {n_chunks}")
    print(f"  related edges this run:  {n_edges}")
    print(f"  vault.db totals: {total_chunks} chunks across {total_files} notes, {total_edges} edges")
    print(f"  model: {MODEL}  db: {DB_PATH}")
    db.close()


if __name__ == "__main__":
    main()
