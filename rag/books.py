"""Book identity for the vault index.

The vault's directory names are the raw filenames the books arrived with, so the
SAME book appears under two spellings that differ only in punctuation:

    The Little Book That Builds Wealth_ The Knockout Formula for -- Pat
    The_Little_Book_That_Builds_Wealth_The_Knockout_Formula_for_Pat

Both were indexed, so ~20k chunk rows are duplicates and a single retrieval could
burn two of its six slots on the same passage. `book_id` folds those spellings
onto one key by stripping every non-alphanumeric character, which is also the key
the retrieval de-duplicator and the category filter run on.

`display_title` is the separate, human-readable form: the category filter and the
"Sources:" line a user reads should never show `2b66030e0dd4c77b2bda437f6c1e5e66`
or a dokumen.pub slug when a real title can be recovered.
"""
from __future__ import annotations

import re

# Publisher/scraper prefixes and trailing junk that carry no title information.
_SLUG_PREFIXES = ("dokumen.pub_", "dokumen_pub_", "pdfcoffee.com_", "pdfdrive_", "libgen_")
_TRAILING_JUNK = re.compile(
    r"[\s_\-–—]*(pdf|epub|free|nbsped|z lib org|pdfdrive|university edition)[\s_\-–—]*$",
    re.IGNORECASE,
)
# Exporters append the book's ISBNs to the directory name. One title carried five
# of them, which is most of the "Related chapters" line the model reads.
_ISBN_RUN = re.compile(r"(?:\b97[89][\dxX]{10}\b[\s_-]*)+")
MAX_TITLE_CHARS = 72
# A directory that is only a hash or an accession number carries no title at all.
_OPAQUE_DIR = re.compile(r"^[0-9a-f]{16,}$|^[\d.]+$")
_CHAPTER_RE = re.compile(r"^(Ch\d+)\s*[-–]\s*(.*)$")


MIN_FOLD_LEN = 24   # below this a prefix match is coincidence, not the same book


def book_id(directory: str) -> str:
    """Punctuation-free key that folds duplicate spellings of one book together."""
    return "".join(ch for ch in directory.lower() if ch.isalnum())


def fold(ids) -> dict[str, str]:
    """Map every book id onto a canonical id, merging duplicate imports.

    Stripping punctuation alone catches only the pairs that differ by separators
    (`... for -- Pat` against `..._for_Pat`). The rest of the duplicates diverge
    partway through, because one export kept the author and the other truncated:

        poorcharliesalmanackthewitandwisdomof
        poorcharliesalmanackthewitandwisdomofcharlestmunger

    So a prefix relationship also folds, guarded by MIN_FOLD_LEN so two genuinely
    different books with a short shared opening are never merged. The longest
    spelling wins, since it is the one that kept the most title.
    """
    ordered = sorted({i for i in ids if i}, key=len, reverse=True)
    canon: dict[str, str] = {}
    for candidate in ordered:
        for existing in canon:
            if len(candidate) >= MIN_FOLD_LEN and existing.startswith(candidate):
                canon[candidate] = canon[existing]
                break
        else:
            canon[candidate] = candidate
    return canon


def is_opaque(directory: str) -> bool:
    """True when the directory name is a hash or accession number, not a title."""
    return bool(_OPAQUE_DIR.match(directory.strip()))


def display_title(directory: str) -> str:
    """Best human-readable title recoverable from a vault directory name."""
    name = directory.strip()
    for prefix in _SLUG_PREFIXES:
        if name.lower().startswith(prefix):
            name = name[len(prefix):]
            break
    if is_opaque(name):
        return name  # nothing to recover; caller falls back to the chapter title
    name = _ISBN_RUN.sub(" ", name)
    name = name.replace("_", " ").replace("-", " ")
    name = re.sub(r"\s+", " ", name).strip(" ,;")
    # "Title  Author Name" separators the exporters left behind
    name = re.sub(r"\s+--\s+", " ", name)
    prev = None
    while prev != name:  # strip stacked suffixes ("... PDF free")
        prev = name
        name = _TRAILING_JUNK.sub("", name).strip(" ,;")
    name = name or directory
    if len(name) > MAX_TITLE_CHARS:
        # Cut on a word boundary so a citation never ends mid-word.
        name = name[:MAX_TITLE_CHARS].rsplit(" ", 1)[0].rstrip(" ,;")
    return name


def split_source(source: str) -> tuple[str, str]:
    """`Books/<dir>/<note>.md` -> (directory, note stem). Non-book paths degrade
    to (first path segment, last segment)."""
    parts = source.split("/")
    if parts[0] == "Books" and len(parts) > 2:
        return parts[1], parts[-1].removesuffix(".md")
    if len(parts) > 1:
        return parts[0], parts[-1].removesuffix(".md")
    return parts[0], parts[0].removesuffix(".md")


def chapter_title(note_stem: str) -> str:
    """`Ch05 - Part 4 Risk and Return` -> `Part 4 Risk and Return`."""
    m = _CHAPTER_RE.match(note_stem.strip())
    return (m.group(2).strip() or note_stem) if m else note_stem


def context_prefix(source: str) -> str:
    """The `Book > Chapter` string prepended to a chunk before embedding.

    97.4% of chunks are continuation windows that carry no heading of their own,
    so without this the vector holds no signal about which book or chapter the
    passage came from and book identity is semantically unreachable.
    """
    directory, note = split_source(source)
    chapter = chapter_title(note)
    title = display_title(directory)
    if is_opaque(directory):
        return chapter
    return f"{title} > {chapter}" if chapter else title
