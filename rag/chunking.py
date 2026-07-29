"""Markdown chunking for the vault RAG index.

Ported from the vault's tested `rag_lib.py` helpers (strip_markdown_for_index,
chunk_text) plus a heading splitter, kept dependency-free so the app-owned RAG
stack doesn't import the BGE/onnxruntime pipeline.

Pipeline per note: strip frontmatter + `## Related` / `## Source` blocks, split
on markdown headings, then size-cap each section to ~400-token windows. This
matters because every book-extract note here is a single `# Title` + one
`## Related` block, so a heading-only split would leave the entire chapter body
(up to ~270 KB) as one chunk that the embedding model would silently truncate.
"""
from __future__ import annotations

import re

FRONTMATTER_RE = re.compile(r"^---\n.*?\n---\n", re.DOTALL)
RELATED_BLOCK_RE = re.compile(r"\n## Related\n.*?(?=\n## |\Z)", re.DOTALL)
SOURCE_BLOCK_RE = re.compile(r"\n## Source\n.*?(?=\n## |\Z)", re.DOTALL)
HEADING_SPLIT_RE = re.compile(r"\n(?=#{1,6}\s)")

# `- [[Ch19 - The Future of Cycles]] *(sim 0.79)* — Mastering-the-Market-Cycle`
# with an optional `*(same book)*` marker before the em-dash separator.
RELATED_LINK_RE = re.compile(
    r"^\s*[-*]\s*\[\[(?P<note>[^\]]+)\]\]"
    r"(?:\s*\*\(sim\s*(?P<sim>[\d.]+)\)\*)?"
    r"(?P<same>\s*\*\(same book\)\*)?"
    r"(?:\s*[—–-]\s*(?P<book>.+?))?\s*$",
    re.MULTILINE,
)
HEADING_LINE_RE = re.compile(r"^(#{1,6})\s+(.*)$")

TARGET_CHARS = 1600   # ~400 tokens at ~4 chars/token
OVERLAP_CHARS = 200
MIN_CHARS = 40        # drop trivial fragments (stray headings, link stubs)


def strip_markdown_for_index(text: str) -> str:
    text = FRONTMATTER_RE.sub("", text, count=1)
    text = RELATED_BLOCK_RE.sub("", text)
    text = SOURCE_BLOCK_RE.sub("", text)
    return text.strip()


def chunk_text(
    text: str,
    target_chars: int = TARGET_CHARS,
    overlap_chars: int = OVERLAP_CHARS,
) -> list[str]:
    """Split text into overlapping windows on paragraph/sentence boundaries."""
    text = text.strip()
    if not text:
        return []
    if len(text) <= target_chars:
        return [text]

    chunks: list[str] = []
    pos, n = 0, len(text)
    while pos < n:
        end = min(pos + target_chars, n)
        if end < n:
            cut = text.rfind("\n\n", pos + target_chars // 2, end)
            if cut == -1:
                cut = text.rfind(". ", pos + target_chars // 2, end)
                if cut != -1:
                    cut += 2
            if cut != -1 and cut > pos:
                end = cut
        piece = text[pos:end].strip()
        if piece:
            chunks.append(piece)
        if end == n:
            break
        pos = max(end - overlap_chars, pos + 1)
    return chunks


def parse_related(raw_md: str) -> list[dict]:
    """Extract the note's `## Related` wikilinks before they are stripped.

    The vault carries 19,449 of these across 2,850 notes, each already scored for
    similarity by whatever built the vault. `strip_markdown_for_index` deletes the
    block so it never reaches an embedding, which threw away the only explicit
    concept graph in the corpus. Parsing it here makes it a queryable table.
    """
    match = RELATED_BLOCK_RE.search("\n" + raw_md)
    if not match:
        return []
    out: list[dict] = []
    for link in RELATED_LINK_RE.finditer(match.group(0)):
        note = link.group("note").strip()
        if not note:
            continue
        try:
            sim = float(link.group("sim")) if link.group("sim") else None
        except ValueError:
            sim = None
        out.append({
            "note": note,
            "book": (link.group("book") or "").strip(),
            "sim": sim,
            "same_book": bool(link.group("same")),
        })
    return out


def _heading_of(section: str) -> str:
    """The section's own heading text, or '' when the section is body prose."""
    first = section.split("\n", 1)[0]
    m = HEADING_LINE_RE.match(first.strip())
    return m.group(2).strip() if m else ""


def note_sections(raw_md: str) -> list[tuple[str, str]]:
    """(heading, chunk_text) for one note, heading carried onto EVERY window.

    A heading-only split leaves 97.4% of chunks as continuation windows with no
    heading of their own, so the heading is repeated onto each window of an
    oversized section rather than surviving only on the first.
    """
    body = strip_markdown_for_index(raw_md)
    out: list[tuple[str, str]] = []
    for section in HEADING_SPLIT_RE.split(body):
        section = section.strip()
        if not section:
            continue
        heading = _heading_of(section)
        pieces = [section] if len(section) <= TARGET_CHARS else chunk_text(section)
        for piece in pieces:
            if len(piece) >= MIN_CHARS:
                out.append((heading, piece))
    return out


def note_chunks(raw_md: str) -> list[str]:
    """Return the list of indexable text chunks for one markdown note."""
    return [text for _heading, text in note_sections(raw_md)]


def embed_text(context: str, heading: str, text: str) -> str:
    """The string actually handed to the embedding model.

    The stored/displayed text stays untouched; only the vector sees the prefix, so
    a continuation window still carries which book and chapter it came from.
    """
    trail = " > ".join(p for p in (context, heading) if p)
    return f"{trail}\n\n{text}" if trail else text
