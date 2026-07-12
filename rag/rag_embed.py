"""Local embeddings via Ollama `nomic-embed-text` (768-dim).

Shared by index_vault.py (documents) and server.py (queries) so both sides use
the exact same model, endpoint, and task prefixes — nomic-embed-text is an
asymmetric model that expects `search_document:` on indexed text and
`search_query:` on queries; mismatching them silently degrades retrieval.

Uses Ollama's batched `/api/embed` endpoint (input array) rather than the
one-at-a-time `/api/embeddings`, so indexing ~100k chunks stays tractable.
"""
from __future__ import annotations

import os

import requests

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
MODEL = os.environ.get("EMBED_MODEL", "nomic-embed-text")
DIM = 768
_TIMEOUT = 300


_MAX_DOC_CHARS = 6000  # hard cap before embed; nomic truncates internally too


def _post(inputs: list[str], prefix: str) -> list[list[float]]:
    resp = requests.post(
        f"{OLLAMA_URL}/api/embed",
        json={"model": MODEL, "input": [prefix + t for t in inputs], "truncate": True},
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    embs = resp.json().get("embeddings")
    if not embs or len(embs) != len(inputs):
        raise RuntimeError(f"Ollama returned {len(embs or [])} embeddings for {len(inputs)} inputs")
    return embs


def _embed(inputs: list[str], prefix: str) -> list[list[float]]:
    """Embed a batch, always returning exactly one vector per input. On a bad
    batch (HTTP 400 from a pathological chunk), bisect to isolate the offender,
    hard-truncate it, and fall back to a zero vector only as a last resort."""
    if not inputs:
        return []
    try:
        return _post(inputs, prefix)
    except requests.HTTPError:
        if len(inputs) == 1:
            try:
                return _post([inputs[0][:_MAX_DOC_CHARS]], prefix)
            except requests.HTTPError:
                print(f"  [embed] skipping un-embeddable chunk (len={len(inputs[0])}): "
                      f"{inputs[0][:80]!r}", flush=True)
                return [[0.0] * DIM]
        mid = len(inputs) // 2
        return _embed(inputs[:mid], prefix) + _embed(inputs[mid:], prefix)


def embed_documents(texts: list[str]) -> list[list[float]]:
    return _embed(texts, "search_document: ")


def embed_query(text: str) -> list[float]:
    return _embed([text], "search_query: ")[0]
