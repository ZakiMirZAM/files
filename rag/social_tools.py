"""`social_reactions` MCP tool: recent real-user posts about a stock.

Source: StockTwits' public per-symbol stream (free, no key) — the finance-native
social feed, so it is far higher signal for equities than general social media.
Each message ships its author's follower count, join date, like count, and a
Bullish/Bearish tag, so the model can weight posts by poster trust and discount
brand-new / very-low-reach / obviously-promotional accounts instead of treating
every voice equally. There is no reliable free bot filter, so this trust signal
plus the model's judgement is the practical "real users, not bots" heuristic.

Wrapped in the same circuit breaker + TTL cache + backoff as the news sources, so
a StockTwits hiccup degrades gracefully rather than failing the answer.
"""
from __future__ import annotations

from dataclasses import dataclass

import aiohttp
from claude_agent_sdk import create_sdk_mcp_server, tool

from source_utils import (
    CircuitBreaker,
    SourceError,
    TTLCache,
    fetch_json,
    normalize_ticker,
    strip_html,
)

_CACHE = TTLCache(ttl_seconds=600)
_BREAKER = CircuitBreaker(threshold=3, cooldown=300)
_LOW_REACH_FOLLOWERS = 50  # below this, treat the poster as low-trust/low-reach


@dataclass
class SocialMsg:
    body: str
    user: str
    followers: int
    joined: str
    likes: int
    sentiment: str  # "Bullish" | "Bearish" | ""

    @property
    def low_reach(self) -> bool:
        return self.followers < _LOW_REACH_FOLLOWERS


async def _stocktwits(session, ticker, limit):
    symbol = ticker.upper()
    url = f"https://api.stocktwits.com/api/2/streams/symbol/{symbol}.json"
    # StockTwits gates its public API behind bot checks; browser-like headers
    # improve the odds. If it still 403s, the router degrades gracefully.
    headers = {
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": f"https://stocktwits.com/symbol/{symbol}",
    }
    data = await fetch_json(session, url, headers=headers)
    messages = data.get("messages", []) if isinstance(data, dict) else []
    out: list[SocialMsg] = []
    for m in messages[:limit]:
        user = m.get("user") or {}
        sentiment = ((m.get("entities") or {}).get("sentiment") or {}).get("basic") or ""
        out.append(
            SocialMsg(
                body=strip_html(m.get("body", "")),
                user=user.get("username", ""),
                followers=int(user.get("followers") or 0),
                joined=(user.get("join_date") or "")[:7],  # YYYY-MM
                likes=int((m.get("likes") or {}).get("total") or 0),
                sentiment=sentiment,
            )
        )
    return out


_SOURCES = [("stocktwits", _stocktwits)]


async def social_router(ticker: str, max_items: int = 20) -> dict:
    """Collect recent real-user posts, skipping any source in cooldown. Returns
    ``{"items": [...], "used": [...], "failed": [...]}``."""
    ticker = (ticker or "").strip()
    cache_key = f"social|{ticker.lower()}|{max_items}"
    cached = _CACHE.get(cache_key)
    if cached is not None:
        return cached

    collected: list[SocialMsg] = []
    used: list[str] = []
    failed: list[str] = []
    async with aiohttp.ClientSession() as session:
        for name, fetch in _SOURCES:
            if len(collected) >= max_items:
                break
            if _BREAKER.is_open(name):
                failed.append(f"{name} (cooldown)")
                continue
            try:
                items = await fetch(session, ticker, max_items)
            except SourceError as exc:
                _BREAKER.record_failure(name)
                failed.append(f"{name} ({exc})")
                continue
            except Exception as exc:
                _BREAKER.record_failure(name)
                failed.append(f"{name} ({type(exc).__name__})")
                continue
            _BREAKER.record_success(name)
            if items:
                collected.extend(items)
                used.append(f"{name}:{len(items)}")

    result = {"items": collected[:max_items], "used": used, "failed": failed}
    _CACHE.set(cache_key, result)
    return result


def _format(ticker: str, result: dict) -> str:
    items: list[SocialMsg] = result["items"]
    if not items:
        tried = "; ".join(result["failed"]) or "no results"
        return f"No recent social posts found for {ticker}. Sources tried: {tried}."
    bullish = sum(1 for m in items if m.sentiment == "Bullish")
    bearish = sum(1 for m in items if m.sentiment == "Bearish")
    served = ", ".join(result["used"]) or "n/a"
    lines = [
        f"Recent StockTwits posts for {ticker} (sources: {served}). "
        f"Tagged sentiment: {bullish} bullish / {bearish} bearish of {len(items)} "
        f"(the rest untagged). Weight posts by poster reach; low-reach accounts are flagged.",
        "",
    ]
    for i, m in enumerate(items, 1):
        tags = []
        if m.sentiment:
            tags.append(m.sentiment)
        tags.append(f"{m.followers} followers")
        if m.low_reach:
            tags.append("low-reach")
        if m.joined:
            tags.append(f"joined {m.joined}")
        if m.likes:
            tags.append(f"{m.likes} likes")
        head = f"@{m.user}" if m.user else "anon"
        lines.append(f"{i}. {head} [{', '.join(tags)}]")
        if m.body:
            lines.append(f"   {m.body}")
    if result["failed"]:
        lines.append("")
        lines.append(f"(sources unavailable this call: {'; '.join(result['failed'])})")
    return "\n".join(lines)


@tool(
    "social_reactions",
    "Recent real-user posts about a stock from StockTwits (the finance social "
    "stream). Each post includes the author's follower count, join month, like "
    "count, and a Bullish/Bearish tag, so you can weight reactions by poster trust "
    "and discount brand-new or very-low-reach accounts. Use to gauge retail "
    "sentiment and the spread of views. Treat results as opinion, not fact. Args: "
    "ticker (required), max_items (default 20).",
    {"ticker": str, "max_items": int},
)
async def social_reactions(args):
    ticker = normalize_ticker(args.get("ticker"))
    if not ticker:
        return {"content": [{"type": "text", "text": "Provide a valid ticker symbol (letters/digits)."}]}
    try:
        max_items = int(args.get("max_items") or 20)
    except (TypeError, ValueError):
        max_items = 20
    max_items = max(1, min(max_items, 30))
    result = await social_router(ticker, max_items)
    return {"content": [{"type": "text", "text": _format(ticker, result)}]}


SOCIAL_MCP = create_sdk_mcp_server(name="social", version="1.0.0", tools=[social_reactions])
SOCIAL_TOOLS = ["mcp__social__social_reactions"]
