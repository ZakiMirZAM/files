"""`company_news` MCP tool: recent finance-news headlines for a ticker.

Aggregates several FREE, no-ban-risk sources behind a resilient router. None of
the primary sources need a key, so the tool always has a floor to fall back to:

  Priority order
  1. Yahoo Finance per-ticker RSS   (no key, unlimited)
  2. GDELT 2.0 Doc API              (no key, indexes thousands of outlets incl.
                                     Reuters/Bloomberg/AP coverage, with tone)
  3. Finnhub company-news           (key optional; skipped cleanly if unset)
  4. Google News search RSS         (no key; `site:` filters pull Reuters/Bloomberg)

The router pulls from sources in order until it has enough fresh, de-duplicated
items, tripping a circuit breaker on any source that 403s/429s/errors so a
blocked feed is skipped for a cooldown instead of retried every call. We never
scrape paywalled sites directly — only their syndicated/aggregated coverage.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from urllib.parse import quote_plus

import aiohttp
import feedparser
from claude_agent_sdk import create_sdk_mcp_server, tool

from source_utils import (
    CircuitBreaker,
    SourceError,
    TTLCache,
    domain_of,
    fetch_json,
    fetch_text,
    normalize_ticker,
    strip_html,
)

_CACHE = TTLCache(ttl_seconds=600)        # news a few minutes stale is fine
_BREAKER = CircuitBreaker(threshold=3, cooldown=300)
_MAX_SUMMARY = 280


def _finnhub_key() -> str:
    return os.environ.get("FINNHUB_API_KEY", "").strip()


@dataclass
class NewsItem:
    title: str
    url: str
    source: str
    published: str
    summary: str = ""


# --- individual sources (each: async (session, ticker, company, limit) -> list[NewsItem]) ---

async def _yahoo_rss(session, ticker, company, limit):
    url = (
        "https://feeds.finance.yahoo.com/rss/2.0/headline"
        f"?s={quote_plus(ticker)}&region=US&lang=en-US"
    )
    feed = feedparser.parse(await fetch_text(session, url))
    return [
        NewsItem(
            title=strip_html(e.get("title")),
            url=e.get("link", ""),
            source=domain_of(e.get("link", "")) or "Yahoo Finance",
            published=e.get("published", ""),
            summary=strip_html(e.get("summary", "")),
        )
        for e in feed.entries[:limit]
    ]


async def _gdelt(session, ticker, company, limit):
    query = f'"{company or ticker}"'
    params = {
        "query": query,
        "mode": "ArtList",
        "format": "json",
        "maxrecords": str(min(max(limit, 1), 75)),
        "timespan": "7d",
        "sort": "DateDesc",
    }
    data = await fetch_json(session, "https://api.gdeltproject.org/api/v2/doc/doc", params=params)
    articles = data.get("articles", []) if isinstance(data, dict) else []
    return [
        NewsItem(
            title=strip_html(a.get("title", "")),
            url=a.get("url", ""),
            source=a.get("domain", "") or "GDELT",
            published=a.get("seendate", ""),
        )
        for a in articles[:limit]
    ]


async def _finnhub(session, ticker, company, limit):
    key = _finnhub_key()
    if not key:
        return []  # not configured — a clean skip, not a failure (keep the breaker for real outages)
    today = datetime.now(timezone.utc).date()
    params = {
        "symbol": ticker.upper(),
        "from": (today - timedelta(days=7)).isoformat(),
        "to": today.isoformat(),
        "token": key,
    }
    data = await fetch_json(session, "https://finnhub.io/api/v1/company-news", params=params)
    articles = data if isinstance(data, list) else []
    items: list[NewsItem] = []
    for a in articles[:limit]:
        ts = a.get("datetime")
        published = datetime.fromtimestamp(ts, timezone.utc).isoformat() if ts else ""
        items.append(
            NewsItem(
                title=strip_html(a.get("headline", "")),
                url=a.get("url", ""),
                source=a.get("source", "") or "Finnhub",
                published=published,
                summary=strip_html(a.get("summary", "")),
            )
        )
    return items


async def _google_news_rss(session, ticker, company, limit):
    query = f"{company or ticker} stock when:7d"
    url = (
        "https://news.google.com/rss/search"
        f"?q={quote_plus(query)}&hl=en-US&gl=US&ceid=US:en"
    )
    feed = feedparser.parse(await fetch_text(session, url))
    items: list[NewsItem] = []
    for e in feed.entries[:limit]:
        src = ""
        source_field = e.get("source")
        if isinstance(source_field, dict):
            src = source_field.get("title", "")
        items.append(
            NewsItem(
                title=strip_html(e.get("title")),
                url=e.get("link", ""),
                source=src or domain_of(e.get("link", "")) or "Google News",
                published=e.get("published", ""),
                summary=strip_html(e.get("summary", "")),
            )
        )
    return items


_SOURCES = [
    ("yahoo_rss", _yahoo_rss),
    ("gdelt", _gdelt),
    ("finnhub", _finnhub),
    ("google_news", _google_news_rss),
]


async def news_router(ticker: str, company: str | None = None, max_items: int = 12) -> dict:
    """Aggregate news across sources in priority order, skipping tripped/cooling
    sources, de-duplicating by URL, until ``max_items`` are collected. Returns
    ``{"items": [...], "used": [...], "failed": [...]}`` (sources annotated)."""
    ticker = (ticker or "").strip()
    company = (company or "").strip() or None
    cache_key = f"news|{ticker.lower()}|{(company or '').lower()}|{max_items}"
    cached = _CACHE.get(cache_key)
    if cached is not None:
        return cached

    collected: list[NewsItem] = []
    used: list[str] = []
    failed: list[str] = []
    seen: set[str] = set()
    async with aiohttp.ClientSession() as session:
        for name, fetch in _SOURCES:
            if len(collected) >= max_items:
                break
            if _BREAKER.is_open(name):
                failed.append(f"{name} (cooldown)")
                continue
            try:
                items = await fetch(session, ticker, company, max_items)
            except SourceError as exc:
                _BREAKER.record_failure(name)
                failed.append(f"{name} ({exc})")
                continue
            except Exception as exc:  # a parser quirk must not sink the whole answer
                _BREAKER.record_failure(name)
                failed.append(f"{name} ({type(exc).__name__})")
                continue
            _BREAKER.record_success(name)
            fresh = 0
            for item in items:
                key = (item.url or item.title).strip().lower()
                if not key or key in seen:
                    continue
                seen.add(key)
                collected.append(item)
                fresh += 1
            if fresh:
                used.append(f"{name}:{fresh}")

    result = {"items": collected[:max_items], "used": used, "failed": failed}
    _CACHE.set(cache_key, result)
    return result


def _format(ticker: str, result: dict) -> str:
    items: list[NewsItem] = result["items"]
    if not items:
        tried = "; ".join(result["failed"]) or "no results"
        return f"No recent news found for {ticker}. Sources tried: {tried}."
    served = ", ".join(result["used"]) or "n/a"
    lines = [f"Recent news for {ticker} (sources: {served}):", ""]
    for i, item in enumerate(items, 1):
        meta = " · ".join(p for p in (item.source, item.published) if p)
        lines.append(f"{i}. {item.title}" + (f"  [{meta}]" if meta else ""))
        if item.summary:
            lines.append(f"   {item.summary[:_MAX_SUMMARY]}")
        if item.url:
            lines.append(f"   {item.url}")
    if result["failed"]:
        lines.append("")
        lines.append(f"(sources unavailable this call: {'; '.join(result['failed'])})")
    return "\n".join(lines)


@tool(
    "company_news",
    "Recent finance-news headlines for a stock, aggregated from free sources "
    "(Yahoo Finance, GDELT, Finnhub, Google News — which includes Reuters and "
    "Bloomberg coverage) with automatic fallback when a source is rate-limited or "
    "down. Use when a question is about what is being reported about a company, "
    "recent developments, or news-driven sentiment. Args: ticker (required), "
    "company (full name, improves recall), max_items (default 12).",
    {"ticker": str, "company": str, "max_items": int},
)
async def company_news(args):
    ticker = normalize_ticker(args.get("ticker"))
    if not ticker:
        return {"content": [{"type": "text", "text": "Provide a valid ticker symbol (letters/digits)."}]}
    company = (args.get("company") or "").strip()
    try:
        max_items = int(args.get("max_items") or 12)
    except (TypeError, ValueError):
        max_items = 12
    max_items = max(1, min(max_items, 30))
    result = await news_router(ticker, company, max_items)
    return {"content": [{"type": "text", "text": _format(ticker, result)}]}


NEWS_MCP = create_sdk_mcp_server(name="news", version="1.0.0", tools=[company_news])
NEWS_TOOLS = ["mcp__news__company_news"]
