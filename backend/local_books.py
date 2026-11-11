"""Local bookshelf: the PDFs in the owner's Books folder, for the LOCAL site only.

The local site lists them so the reader can pick or @-mention a book for the book
AI (rag/book_tools.py reads the files). api.py exposes GET /api/learn/local-books
on top of this module and turns it off when ENV=production.

Pure functions only (no FastAPI), tested in test_local_books.py.
"""
from __future__ import annotations

import os
from pathlib import Path

DEFAULT_BOOKS_DIR = Path.home() / "Desktop" / "Books"


def books_root() -> Path | None:
    """The Books folder (LOCAL_BOOKS_DIR overrides), or None when it is missing."""
    raw = os.environ.get("LOCAL_BOOKS_DIR", "").strip()
    root = Path(raw) if raw else DEFAULT_BOOKS_DIR
    try:
        root = root.resolve(strict=True)
    except OSError:
        return None
    return root if root.is_dir() else None


def _hidden(rel: Path) -> bool:
    # Tool folders such as .claude-flow, receipts and review-receipts hold no books.
    # Lower-cased: Windows names ignore case, so RECEIPTS is the same folder.
    return any(p.startswith(".") or p in ("receipts", "review-receipts") for p in (x.lower() for x in rel.parts))


def list_books(root: Path) -> list[dict]:
    """Every PDF under root, sorted by name: {id, name, size}. `id` is the
    forward-slash path inside root, which is also what resolve_book takes."""
    out: list[dict] = []
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix.lower() != ".pdf":
            continue
        rel = path.relative_to(root)
        if _hidden(rel):
            continue
        try:
            size = path.stat().st_size
        except OSError:
            continue
        out.append({"id": rel.as_posix(), "name": path.name, "size": size})
    out.sort(key=lambda b: b["name"].lower())
    return out
