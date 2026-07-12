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

from chunking import note_chunks
from rag_embed import DIM, MODEL, embed_documents

VAULT = os.environ.get("VAULT_PATH", r"C:\Users\Zaki_Mir\Desktop\Financial Texts")
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vault.db")
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


def embed_file(db: sqlite3.Connection, category: str, source: str, texts: list[str]) -> int:
    """Embed one note's chunks (in sub-batches) and insert chunk + vector rows.
    Caller commits together with the file's mtime so each note is atomic."""
    written = 0
    for i in range(0, len(texts), BATCH):
        sub = texts[i:i + BATCH]
        embs = embed_documents(sub)
        for t, emb in zip(sub, embs):
            cur = db.execute(
                "INSERT INTO chunks (category, source, text) VALUES (?, ?, ?)",
                (category, source, t),
            )
            db.execute(
                "INSERT INTO vec_chunks (rowid, embedding) VALUES (?, ?)",
                (cur.lastrowid, sqlite_vec.serialize_float32(emb)),
            )
        written += len(sub)
    return written


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


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rebuild", action="store_true", help="wipe and re-embed everything")
    ap.add_argument("--books", nargs="*", default=None, help="only index notes whose path contains one of these substrings")
    args = ap.parse_args()

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
    n_files = n_skipped = n_chunks = 0

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
        n_chunks += embed_file(db, category, source, note_chunks(raw))
        # Record mtime in the SAME transaction as the chunks: each note is atomic,
        # so a crash never leaves an mtime without its chunks (safe to resume).
        db.execute("INSERT OR REPLACE INTO files (path, mtime) VALUES (?, ?)", (source, mtime))
        db.commit()
        n_files += 1
        if n_files % 50 == 0:
            rate = n_chunks / max(time.time() - t0, 1e-6)
            print(f"  {n_files} notes indexed, {n_chunks} chunks ({rate:.0f}/s), {n_skipped} unchanged")

    total_chunks = db.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
    total_files = db.execute("SELECT COUNT(*) FROM files").fetchone()[0]
    print(f"\nDONE in {time.time() - t0:.1f}s")
    print(f"  notes embedded this run: {n_files} (+{n_skipped} unchanged-skipped)")
    print(f"  chunks written this run: {n_chunks}")
    print(f"  vault.db totals: {total_chunks} chunks across {total_files} notes")
    print(f"  model: {MODEL}  db: {DB_PATH}")
    db.close()


if __name__ == "__main__":
    main()
