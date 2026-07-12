"""Shared resilience primitives for the live external-source tools (news, social).

These sources are public/free APIs and RSS feeds that can rate-limit, 403, or go
briefly down. The qualitative answer must never hard-fail because one feed is
unreachable, so every source call goes through three guards here:

  * TTLCache       — short in-process cache so repeated questions in one session
                     don't re-hit an API (news is fine a few minutes stale).
  * CircuitBreaker — after N consecutive failures a source is skipped for a
                     cooldown window instead of being retried on every call.
  * fetch_json/text — one async HTTP getter with a timeout, bounded backoff on
                     transient (timeout / 5xx) errors, and NO retry on 403/429
                     (those trip the breaker so we stop hammering a blocked host).

This is deliberately a fit-for-purpose async cache, not backend/marketdata's
disk-based http_cache (that one is sync urllib with a 7-day file freshness, built
for large static benchmark files — wrong shape for short-TTL per-ticker news).
"""
from __future__ import annotations

import asyncio
import html
import json
import re
import time
from dataclasses import dataclass
from urllib.parse import urlparse

import aiohttp

_TAG_RE = re.compile(r"<[^>]+>")


def strip_html(text: str | None) -> str:
    """Drop tags and unescape entities from an RSS/HTML snippet."""
    if not text:
        return ""
    return html.unescape(_TAG_RE.sub("", text)).strip()


def domain_of(url: str | None) -> str:
    """Bare host (leading www. stripped) of a URL, or '' if unparseable."""
    if not url:
        return ""
    try:
        host = urlparse(url).netloc
    except ValueError:
        return ""
    return host[4:] if host.startswith("www.") else host


_TICKER_RE = re.compile(r"[A-Z0-9.\-]{1,10}")


def normalize_ticker(raw: str | None) -> str:
    """Uppercase and validate a ticker; return '' if it is not a plausible
    symbol. Guards the outbound URLs against a model supplying a malformed value."""
    ticker = (raw or "").strip().upper()
    return ticker if _TICKER_RE.fullmatch(ticker) else ""


USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36 intrinsiced/1.0"
)
DEFAULT_TIMEOUT = 12.0


class SourceError(Exception):
    """A source call failed. ``retryable`` marks transient errors (timeout/5xx);
    403/429/4xx are non-retryable and trip the circuit breaker."""

    def __init__(self, message: str, *, status: int | None = None, retryable: bool = False):
        super().__init__(message)
        self.status = status
        self.retryable = retryable


@dataclass
class _Entry:
    expires: float
    value: object


class TTLCache:
    """Tiny monotonic-clock TTL cache (single-process, no eviction policy needed
    at this scale — a handful of tickers per session)."""

    def __init__(self, ttl_seconds: float):
        self._ttl = ttl_seconds
        self._data: dict[str, _Entry] = {}

    def get(self, key: str):
        entry = self._data.get(key)
        if entry is None:
            return None
        if entry.expires <= time.monotonic():
            self._data.pop(key, None)
            return None
        return entry.value

    def set(self, key: str, value: object) -> None:
        self._data[key] = _Entry(time.monotonic() + self._ttl, value)


class CircuitBreaker:
    """Open after ``threshold`` consecutive failures; stay open for ``cooldown``
    seconds, then allow a probe again. Success resets the count."""

    def __init__(self, threshold: int = 3, cooldown: float = 300.0):
        self._threshold = threshold
        self._cooldown = cooldown
        self._fails: dict[str, int] = {}
        self._open_until: dict[str, float] = {}

    def is_open(self, key: str) -> bool:
        until = self._open_until.get(key)
        return until is not None and until > time.monotonic()

    def record_success(self, key: str) -> None:
        self._fails.pop(key, None)
        self._open_until.pop(key, None)

    def record_failure(self, key: str) -> None:
        count = self._fails.get(key, 0) + 1
        self._fails[key] = count
        if count >= self._threshold:
            self._open_until[key] = time.monotonic() + self._cooldown


async def _fetch(session: aiohttp.ClientSession, url: str, params, headers,
                 timeout: float, retries: int, as_json: bool):
    merged = {"User-Agent": USER_AGENT}
    if headers:
        merged.update(headers)
    last: SourceError | None = None
    for attempt in range(retries + 1):
        try:
            async with session.get(
                url, params=params, headers=merged,
                timeout=aiohttp.ClientTimeout(total=timeout),
            ) as resp:
                status = resp.status
                if status in (403, 429):
                    raise SourceError(f"HTTP {status}", status=status, retryable=False)
                if status >= 500:
                    raise SourceError(f"HTTP {status}", status=status, retryable=True)
                if status >= 400:
                    raise SourceError(f"HTTP {status}", status=status, retryable=False)
                body = await resp.text()
            if not as_json:
                return body
            try:
                return json.loads(body)
            except (json.JSONDecodeError, ValueError) as exc:
                raise SourceError(f"bad json: {exc}", retryable=False) from exc
        except SourceError as exc:
            last = exc
            if not exc.retryable or attempt >= retries:
                raise
        except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
            last = SourceError(f"{type(exc).__name__}: {exc}", retryable=True)
            if attempt >= retries:
                raise last
        await asyncio.sleep(0.4 * (2 ** attempt))  # bounded exponential backoff
    assert last is not None  # loop always sets `last` before exhausting
    raise last


async def fetch_json(session: aiohttp.ClientSession, url: str, *, params=None,
                     headers=None, timeout: float = DEFAULT_TIMEOUT, retries: int = 2):
    """GET ``url`` and parse JSON, with backoff on transient errors."""
    return await _fetch(session, url, params, headers, timeout, retries, as_json=True)


async def fetch_text(session: aiohttp.ClientSession, url: str, *, params=None,
                     headers=None, timeout: float = DEFAULT_TIMEOUT, retries: int = 2):
    """GET ``url`` and return the raw text body, with backoff on transient errors."""
    return await _fetch(session, url, params, headers, timeout, retries, as_json=False)
