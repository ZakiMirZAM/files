"""
marketdata/http_cache.py  (ported from valuation_debug/data_sources/http_cache.py)

A tiny, dependency-free caching HTTP downloader built on :mod:`urllib.request`.
It exists so every external data source in this package can be fetched once and
then served from a local cache — which keeps repeat runs fast, keeps tests
offline, and makes the whole system *work offline after the first fetch*.

Design notes
------------
* Cache freshness is mtime-based. A cached file younger than ``max_age_days`` is
  returned without touching the network.
* If a download fails (no network, server error) but a *stale* cache exists, the
  stale copy is returned. Data must never hard-fail because a benchmark feed was
  briefly unreachable — graceful degradation is the rule.
* A browser-like ``User-Agent`` is sent because some academic hosts (Shiller,
  Damodaran, the GPR site) reject the default ``Python-urllib`` agent.
"""

from __future__ import annotations

import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path

# Default cache directory: ``marketdata/../data_cache`` == ``backend/data_cache``.
_PKG_DIR = Path(__file__).resolve().parent
DEFAULT_CACHE_DIR = _PKG_DIR.parent / "data_cache"

_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36 intrinsiced/1.0"
)

_DEFAULT_TIMEOUT = 30
_DEFAULT_MAX_AGE_DAYS = 7


@dataclass(frozen=True)
class FetchResult:
    """Outcome of a cached fetch.

    ``data`` is the file bytes (or None on total failure). ``from_cache`` says
    whether the network was skipped. ``stale`` flags that a cached copy was
    returned only because the live fetch failed. ``error`` carries the last
    network error message for logging when ``data`` is None.
    """

    data: bytes | None
    path: Path
    from_cache: bool
    stale: bool = False
    error: str | None = None

    @property
    def ok(self) -> bool:
        return self.data is not None


def _is_fresh(path: Path, max_age_days: float) -> bool:
    if not path.exists() or path.stat().st_size == 0:
        return False
    # "Pass 0 to always attempt a fresh download." Guard explicitly — otherwise a
    # just-written file whose age rounds to 0.0 (coarse mtime on Windows) is
    # wrongly judged fresh and the network is skipped.
    if max_age_days <= 0:
        return False
    age_seconds = time.time() - path.stat().st_mtime
    return age_seconds <= max_age_days * 86400


def cached_download(
    url: str,
    filename: str,
    *,
    cache_dir: str | os.PathLike[str] | None = None,
    max_age_days: float = _DEFAULT_MAX_AGE_DAYS,
    timeout: float = _DEFAULT_TIMEOUT,
    force: bool = False,
    user_agent: str | None = None,
) -> FetchResult:
    """Download ``url`` to ``cache_dir/filename``, serving from cache when fresh.

    Parameters
    ----------
    url:
        The resource to fetch.
    filename:
        Local cache file name (not a full path); kept stable per source so the
        cache is reused across runs.
    cache_dir:
        Override the cache directory (tests use a temp dir). Defaults to
        :data:`DEFAULT_CACHE_DIR`.
    max_age_days:
        Serve the cached copy without hitting the network if it is younger than
        this. Pass 0 to always attempt a fresh download.
    timeout:
        Per-request socket timeout in seconds.
    force:
        Ignore any existing cache and force a network fetch (but still fall back
        to a stale cache if the fetch fails).
    user_agent:
        Override the default browser-like agent. SEC EDGAR requires a declared
        contact UA (e.g. "AppName/1.0 email@example.com") and blocks generic ones.
    """
    base = Path(cache_dir) if cache_dir is not None else DEFAULT_CACHE_DIR
    base.mkdir(parents=True, exist_ok=True)
    path = base / filename

    if not force and _is_fresh(path, max_age_days):
        return FetchResult(path.read_bytes(), path, from_cache=True)

    req = urllib.request.Request(url, headers={"User-Agent": user_agent or _USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read()
        if not data:
            raise ValueError("empty response body")
        # Write atomically so a crash mid-write can't leave a truncated cache.
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_bytes(data)
        os.replace(tmp, path)
        return FetchResult(data, path, from_cache=False)
    except (urllib.error.URLError, ValueError, TimeoutError, OSError) as exc:
        # Network/parse failure — fall back to any cached copy, even if stale.
        if path.exists() and path.stat().st_size > 0:
            return FetchResult(
                path.read_bytes(), path, from_cache=True, stale=True,
                error=f"{type(exc).__name__}: {exc}",
            )
        return FetchResult(
            None, path, from_cache=False, error=f"{type(exc).__name__}: {exc}"
        )


def cached_text(
    url: str,
    filename: str,
    *,
    encoding: str = "utf-8",
    **kwargs: object,
) -> str | None:
    """Convenience wrapper returning decoded text (or None on failure)."""
    result = cached_download(url, filename, **kwargs)  # type: ignore[arg-type]
    if result.data is None:
        return None
    for enc in (encoding, "utf-8-sig", "cp1252", "latin-1"):
        try:
            return result.data.decode(enc)
        except UnicodeDecodeError:
            continue
    return result.data.decode(encoding, errors="replace")
