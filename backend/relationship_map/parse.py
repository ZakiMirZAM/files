"""Extract and validate the map from an Ask AI answer. Pure, no I/O.

Every string is plain text by the time it leaves here: control characters
stripped, HTML tags removed, em dashes replaced, length capped. A link is
kept only with a name, a product and a source URL that is http(s) with a
host. No source, no link.
"""

from __future__ import annotations

import json
import re
import urllib.parse
from typing import Any, Optional

from relationship_map.prompt import GROUP_KEYS, SUGGESTION_GROUPS

MAX_CATEGORIES = 8
MAX_LINKS = 4
MAX_SOURCES = 30
MAX_ANSWER_CHARS = 400_000

_FENCE = re.compile(r"```json\s*(.*?)```", re.IGNORECASE | re.DOTALL)
_TAG = re.compile(r"<[^>]*>")
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")
_EM_DASH = re.compile(r"\s*—\s*")
_SPACES = re.compile(r"\s+")
_TICKER = re.compile(r"^[A-Z0-9.\-]{1,15}$")


def extract_last_json(answer: Any) -> Optional[dict]:
    """The LAST ```json fenced block of the answer as a dict, or None."""
    if not isinstance(answer, str):
        return None
    blocks = _FENCE.findall(answer[:MAX_ANSWER_CHARS])
    if not blocks:
        return None
    try:
        obj = json.loads(blocks[-1])
    except (ValueError, RecursionError):
        return None
    return obj if isinstance(obj, dict) else None


def clean_text(v: Any, max_len: int) -> Optional[str]:
    """Plain text, or None when empty or not a string."""
    if not isinstance(v, str):
        return None
    s = _TAG.sub(" ", v)
    s = s.replace("<", " ").replace(">", " ")
    s = _CONTROL.sub(" ", s)
    s = _EM_DASH.sub(", ", s)
    s = _SPACES.sub(" ", s).strip(" ,")
    return s[:max_len].rstrip() or None


def clean_url(v: Any) -> Optional[str]:
    """An http(s) URL with a host, or None. Never rewritten beyond a strip."""
    if not isinstance(v, str):
        return None
    url = v.strip()
    if not url or len(url) > 1000 or _CONTROL.search(url):
        return None
    if any(c in url for c in ' <>"`\\'):
        return None
    if not url.lower().startswith(("https://", "http://")):
        return None
    try:
        parts = urllib.parse.urlparse(url)
    except ValueError:
        return None
    if parts.scheme.lower() not in ("http", "https") or not parts.netloc:
        return None
    return url


def clean_ticker(v: Any) -> Optional[str]:
    if not isinstance(v, str):
        return None
    t = v.strip().upper()
    return t if _TICKER.match(t) else None


def _clean_link(raw: Any) -> tuple[Optional[dict], bool]:
    """``(link_or_None, dropped_for_no_source)``."""
    if not isinstance(raw, dict):
        return None, False
    name = clean_text(raw.get("name"), 120)
    product = clean_text(raw.get("product"), 200)
    if not name or not product:
        return None, False
    src = raw.get("source") if isinstance(raw.get("source"), dict) else {}
    url = clean_url(src.get("url"))
    if url is None:
        return None, True
    title = clean_text(src.get("title"), 200) or urllib.parse.urlparse(url).netloc
    return {
        "name": name,
        "ticker": clean_ticker(raw.get("ticker")),
        "product": product,
        "geography": clean_text(raw.get("geography"), 200),
        "routeIn": clean_text(raw.get("routeIn"), 300),
        "note": clean_text(raw.get("note"), 400),
        "source": {"title": title, "url": url},
        "resolvedTicker": None,
        "inDatabase": False,
    }, False


def validate_map(obj: Any) -> dict[str, Any]:
    """``{"groups", "linkCount", "droppedNoSource"}`` from the raw json.

    ``groups`` maps each kept group key to ``{"suggestion", "categories"}``;
    empty categories and empty groups are dropped. Caps apply to KEPT
    entries, so a category whose first links have no source still shows up
    to four sourced ones.
    """
    raw_groups = obj.get("groups") if isinstance(obj, dict) else None
    if not isinstance(raw_groups, dict):
        raw_groups = obj if isinstance(obj, dict) else {}

    groups: dict[str, Any] = {}
    link_count = 0
    dropped = 0
    for key in GROUP_KEYS:
        raw_cats = raw_groups.get(key)
        if not isinstance(raw_cats, list):
            continue
        cats = []
        for raw_cat in raw_cats:
            if len(cats) >= MAX_CATEGORIES:
                break
            if not isinstance(raw_cat, dict):
                continue
            category = clean_text(raw_cat.get("category"), 80)
            raw_links = raw_cat.get("links")
            if not category or not isinstance(raw_links, list):
                continue
            links = []
            for raw_link in raw_links:
                if len(links) >= MAX_LINKS:
                    break
                link, no_source = _clean_link(raw_link)
                dropped += no_source
                if link is not None:
                    links.append(link)
            if links:
                cats.append({"category": category, "links": links})
                link_count += len(links)
        if cats:
            groups[key] = {"suggestion": key in SUGGESTION_GROUPS, "categories": cats}
    return {"groups": groups, "linkCount": link_count, "droppedNoSource": dropped}


def clean_sources(raw: Any) -> list[str]:
    """The RAG response's ``sources`` as plain unique strings, capped."""
    out: list[str] = []
    if not isinstance(raw, list):
        return out
    for item in raw:
        s = clean_text(item, 300)
        if s and s not in out:
            out.append(s)
        if len(out) >= MAX_SOURCES:
            break
    return out


def iter_links(groups: dict[str, Any]):
    """Every kept link, for the ticker-resolution pass in ``build.py``."""
    for g in groups.values():
        for cat in g["categories"]:
            yield from cat["links"]
