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


def note_chunks(raw_md: str) -> list[str]:
    """Return the list of indexable text chunks for one markdown note."""
    body = strip_markdown_for_index(raw_md)
    out: list[str] = []
    for section in HEADING_SPLIT_RE.split(body):
        section = section.strip()
        if not section:
            continue
        if len(section) <= TARGET_CHARS:
            if len(section) >= MIN_CHARS:
                out.append(section)
        else:
            for piece in chunk_text(section):
                if len(piece) >= MIN_CHARS:
                    out.append(piece)
    return out
