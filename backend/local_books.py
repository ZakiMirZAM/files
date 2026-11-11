"""Local bookshelf: the PDFs in the owner's Books folders, for the LOCAL site only.

The local site lists them so the reader can pick or @-mention a book for the book
AI. api.py exposes GET /api/learn/local-books on top of this module and turns it
off when ENV=production. rag/book_tools.py loads this same file, so the list and
the book AI always agree on which books exist and on each book's id.

Folders: the owner's books folder Documents\\books\\books first, then Desktop\\Books
for the few PDFs that exist only there (LOCAL_BOOKS_DIR overrides,
several folders separated by os.pathsep). Books are PDFs. One entry per book:
a second copy (same file name, a " (2)" copy, or the same size) is left out.

Pure functions only (no FastAPI), tested in test_local_books.py.
"""
from __future__ import annotations

import os
import re
from pathlib import Path

DEFAULT_BOOKS_DIRS = (Path.home() / "Documents" / "books" / "books", Path.home() / "Desktop" / "Books")
BOOK_SUFFIXES = (".pdf",)
_COPY_RE = re.compile(r"\s*\(\d+\)\s*$")          # "Title (2)" -> a copy of "Title"
_ID_RE = re.compile(r"^@(\d{1,2})/(.+)$")          # "@1/sub/x.pdf" -> folder 1
_SAME_SIZE_MIN = 64 * 1024                          # tiny files can share a size by chance


def books_roots() -> list[Path]:
    """The Books folders that exist, in order (the first one keeps plain ids)."""
    raw = os.environ.get("LOCAL_BOOKS_DIR", "").strip()
    dirs = [Path(p.strip()) for p in raw.split(os.pathsep) if p.strip()] if raw else list(DEFAULT_BOOKS_DIRS)
    out: list[Path] = []
    for d in dirs:
        try:
            root = d.resolve(strict=True)
        except OSError:
            continue
        if root.is_dir() and root not in out:
            out.append(root)
    return out


def books_root() -> Path | None:
    """The first Books folder, or None when there is none."""
    roots = books_roots()
    return roots[0] if roots else None


def _as_roots(roots) -> list[Path]:
    return [roots] if isinstance(roots, Path) else list(roots)


def _hidden(rel: Path) -> bool:
    # Tool folders such as .claude-flow, receipts and review-receipts hold no books.
    # Lower-cased: Windows names ignore case, so RECEIPTS is the same folder.
    return any(p.startswith(".") or p in ("receipts", "review-receipts") for p in (x.lower() for x in rel.parts))


def _id(index: int, rel: Path) -> str:
    return rel.as_posix() if index == 0 else f"@{index}/{rel.as_posix()}"


def shelf(roots) -> list[tuple[str, Path, int]]:
    """(id, path, size) of every book, one entry per book, sorted by file name."""
    found = []
    for index, root in enumerate(_as_roots(roots)):
        for path in root.rglob("*"):
            if path.suffix.lower() not in BOOK_SUFFIXES or not path.is_file():
                continue
            rel = path.relative_to(root)
            if _hidden(rel):
                continue
            try:
                size = path.stat().st_size
            except OSError:
                continue
            title = _COPY_RE.sub("", path.stem).strip().lower()
            is_copy = bool(_COPY_RE.search(path.stem))
            # Keep order: first folder, then the original before a " (2)" copy.
            found.append(((index, is_copy, path.name.lower()),
                          title, _id(index, rel), path, size))
    found.sort(key=lambda f: f[0])
    titles: set[str] = set()
    sizes: set[int] = set()
    out: list[tuple[str, Path, int]] = []
    for _key, title, book_id, path, size in found:
        if title in titles or (size >= _SAME_SIZE_MIN and size in sizes):
            continue
        titles.add(title)
        sizes.add(size)
        out.append((book_id, path, size))
    out.sort(key=lambda b: b[1].name.lower())
    return out


def list_books(roots) -> list[dict]:
    """Every book, sorted by name: {id, name, size}. `id` is what resolve_book takes."""
    return [{"id": book_id, "name": path.name, "size": size} for book_id, path, size in shelf(roots)]


def book_id(roots, path: Path) -> str:
    for index, root in enumerate(_as_roots(roots)):
        if path.is_relative_to(root):
            return _id(index, path.relative_to(root))
    return path.name


def resolve_book(roots, book: str) -> Path | None:
    """A book file inside one of the folders, by its id or, failing that, by a
    unique case-insensitive match of words in its file name."""
    roots = _as_roots(roots)
    book = (book or "").strip()
    if not roots or not book or len(book) > 1000 or "\x00" in book:
        return None
    index, rest = 0, book
    m = _ID_RE.match(book)
    if m:
        index, rest = int(m.group(1)), m.group(2)
    rel = Path(rest)
    if index < len(roots) and not (rel.is_absolute() or rel.drive or ".." in rel.parts or _hidden(rel)):
        root = roots[index]
        try:
            path = (root / rel).resolve(strict=True)
        except OSError:
            path = None
        if path and path.is_relative_to(root) and path.is_file() and path.suffix.lower() in BOOK_SUFFIXES \
                and not _hidden(path.relative_to(root)):
            return path
    words = [w for w in re.split(r"\W+", book.lower()) if w]
    if not words:
        return None
    hits = [path for _id_, path, _size in shelf(roots) if all(w in path.name.lower() for w in words)]
    return hits[0] if len(hits) == 1 else None
