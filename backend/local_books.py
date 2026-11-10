"""Local bookshelf: the PDFs in the owner's Books folder, for the LOCAL site only.

The live site keeps uploading a private copy of each book (Book notes, slice A7).
On this PC the books are already on disk, so the local site reads them from the
folder instead of uploading 4 GB to Convex. api.py exposes two routes on top of
this module and turns both off when ENV=production.

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


def resolve_book(root: Path, book_id: str) -> Path | None:
    """The PDF for an id from list_books, or None. Refuses anything that is not a
    .pdf inside root (absolute paths, '..', drive letters, hidden folders)."""
    if not book_id or len(book_id) > 1000 or "\x00" in book_id:
        return None
    rel = Path(book_id)
    if rel.is_absolute() or rel.drive or ".." in rel.parts or _hidden(rel):
        return None
    try:
        path = (root / rel).resolve(strict=True)
    except OSError:
        return None
    if not path.is_relative_to(root) or not path.is_file() or path.suffix.lower() != ".pdf":
        return None
    # Check the real (resolved) names too: a short 8.3 name such as RECEIP~1
    # passes the check on the id but resolves to the hidden folder.
    if _hidden(path.relative_to(root)):
        return None
    return path
