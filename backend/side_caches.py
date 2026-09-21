"""Registry for the caches that live outside ``api.py``'s ``_cache``.

``POST /api/cache/clear`` promises to clear everything, but the connections
sector cache, the cross-industry rank table and the macro economy block are
separate in-process stores. They used to be cleared by two hard-coded
imports inside ``api.py#_clear_side_caches``, so a cache added later was
silently missed and kept serving old numbers for up to half an hour.

Each owning module now registers itself at import time:

    register_side_cache(("", "db"), clear_sector_cache, name="connections.sector_cache")

``clear_side_caches(prefix)`` calls every clear function whose prefix set
contains ``prefix`` and returns the names it cleared.
``backend/test_side_caches.py`` walks the three packages and asserts that
every module-level cache object belongs to a registered module, so a future
cache cannot be missed.
"""

from __future__ import annotations

import importlib
import logging
import threading
from typing import Callable, Iterable

log = logging.getLogger(__name__)

# The modules that own a side cache. Imported on demand before a clear, so a
# clear works even when no request has pulled the analysis modules in yet.
CACHE_MODULES: tuple[str, ...] = (
    "connections.sector_cache",
    "connections.economy",
    "industry_structure.ranks",
)

_lock = threading.Lock()
_registry: list[tuple[frozenset[str], Callable[[], None], str]] = []


def register_side_cache(
    prefixes: Iterable[str],
    clear_fn: Callable[[], None],
    *,
    name: str,
) -> None:
    """Register ``clear_fn`` for the cache-clear prefixes it answers to.

    Re-registering the same ``name`` replaces the earlier entry, so a module
    reload during tests does not queue the clear twice.
    """
    entry = (frozenset(prefixes), clear_fn, name)
    with _lock:
        for i, (_p, _f, existing) in enumerate(_registry):
            if existing == name:
                _registry[i] = entry
                return
        _registry.append(entry)


def registered_names() -> set[str]:
    """The names registered so far (diagnostics and tests)."""
    with _lock:
        return {name for _p, _f, name in _registry}


def load_cache_modules() -> None:
    """Import every module in ``CACHE_MODULES`` so it can register itself."""
    for mod in CACHE_MODULES:
        try:
            importlib.import_module(mod)
        except Exception as exc:  # noqa: BLE001 — a clear must never 500
            log.warning("[side_caches] could not import %s: %s", mod, exc)


def clear_side_caches(prefix: str) -> list[str]:
    """Run every registered clear that answers to ``prefix``.

    An "econ" invalidation (the marketdata scheduler's) reaches the economy
    and connections caches, because their figures are read from
    ``market_data.db``. Returns the names cleared.
    """
    load_cache_modules()
    with _lock:
        entries = list(_registry)
    cleared: list[str] = []
    for prefixes, clear_fn, name in entries:
        if prefix not in prefixes:
            continue
        try:
            clear_fn()
            cleared.append(name)
        except Exception as exc:  # noqa: BLE001 — a clear must never 500
            log.warning("[side_caches] clear failed for %s: %s", name, exc)
    return cleared
