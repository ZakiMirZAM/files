"""TTL + LRU cache with one lock per key (single flight).

Lifted out of ``sector_cache.py`` so the economy block can reuse it instead
of growing a third hand-rolled store. Two properties it is responsible for:

* **Single flight (finding M1).** Every key has its own lock, so eight
  concurrent cold requests for one industry run ONE build and the other
  seven wait for it, rather than eight identical panel queries racing.
* **Bounded (finding M2).** Each cache is an LRU with a hard entry cap, so
  a crawl over hundreds of industries cannot grow the process without
  limit.
"""

from __future__ import annotations

import threading
import time
from collections import OrderedDict
from typing import Any, Callable, Hashable

DEFAULT_TTL_SECONDS = 30 * 60  # 30 minutes


class TtlLruCache:
    """TTL + LRU cache with one lock per key (single flight)."""

    def __init__(self, maxsize: int, ttl: float = DEFAULT_TTL_SECONDS) -> None:
        self._maxsize = maxsize
        self._ttl = ttl
        self._data: "OrderedDict[Hashable, tuple[Any, float]]" = OrderedDict()
        self._guard = threading.Lock()
        self._key_locks: dict[Hashable, threading.Lock] = {}

    # -- plain access -------------------------------------------------
    def peek(self, key: Hashable) -> tuple[bool, Any]:
        """(hit, value) without building."""
        with self._guard:
            entry = self._data.get(key)
            if entry is None or (time.monotonic() - entry[1]) >= self._ttl:
                return (False, None)
            self._data.move_to_end(key)
            return (True, entry[0])

    def put(self, key: Hashable, value: Any) -> None:
        with self._guard:
            self._data[key] = (value, time.monotonic())
            self._data.move_to_end(key)
            while len(self._data) > self._maxsize:
                evicted, _ = self._data.popitem(last=False)
                self._key_locks.pop(evicted, None)

    def clear(self) -> None:
        with self._guard:
            self._data.clear()
            self._key_locks.clear()

    def __len__(self) -> int:
        with self._guard:
            return len(self._data)

    def __contains__(self, key: Hashable) -> bool:
        """Fresh-entry membership, so ``key in cache`` reads naturally."""
        return self.peek(key)[0]

    # -- single flight ------------------------------------------------
    def _lock_for(self, key: Hashable) -> threading.Lock:
        with self._guard:
            lock = self._key_locks.get(key)
            if lock is None:
                lock = threading.Lock()
                self._key_locks[key] = lock
            return lock

    def get_or_build(self, key: Hashable, build: Callable[[], Any]) -> Any:
        hit, value = self.peek(key)
        if hit:
            return value
        with self._lock_for(key):
            # Another thread may have finished the build while we waited.
            hit, value = self.peek(key)
            if hit:
                return value
            result = build()
            self.put(key, result)
            return result
