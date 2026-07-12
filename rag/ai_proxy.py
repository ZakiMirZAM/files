"""
ai_proxy.py — heartbeat-streaming reverse proxy in front of the RAG server.

WHY THIS EXISTS
The RAG server (server.py) answers /ask synchronously — a complex Sonnet answer
with web searches can take 2-3 minutes to produce its single JSON response.
Cloudflare's free/Pro/Business tiers hard-kill any proxied request that doesn't
return response headers within ~100 seconds (Error 524), so long /ask calls fail
as "Failed to fetch" through the tunnel while working fine locally.

server.py is treated as untouchable (Claude Agent SDK logic), so instead of
changing it, this proxy sits in front: it starts the HTTP response IMMEDIATELY
and dribbles whitespace "heartbeat" bytes to the client every few seconds while
the real answer is still computing. Cloudflare sees a responsive origin and keeps
the connection open indefinitely. When server.py finally returns, we append the
real JSON body. Leading/trailing whitespace is valid JSON, so the browser's
response.json() parses the accumulated body unchanged — no frontend change needed
and the answer is delivered in full, exactly as the local version produces it.

Topology:  Cloudflare -> nginx (proxy_buffering off) -> ai_proxy :3002 -> RAG :3001
"""
import asyncio

from aiohttp import ClientSession, ClientTimeout, web

UPSTREAM = "http://127.0.0.1:3001"
PORT = 3002
HEARTBEAT_INTERVAL = 8          # seconds between keep-alive bytes
UPSTREAM_TIMEOUT = 600          # generous ceiling; server.py has its own budget caps
STREAM_PATHS = {"/ask", "/explain", "/define"}   # POST answer routes


async def _call_upstream(session, method, url, body, headers):
    fwd = {"Content-Type": headers.get("Content-Type", "application/json")}
    async with session.request(method, url, data=body, headers=fwd) as up:
        return up.status, await up.read(), up.headers.get("Content-Type", "application/json")


async def handle(request: web.Request) -> web.StreamResponse:
    path = request.path
    body = await request.read()
    session = ClientSession(timeout=ClientTimeout(total=UPSTREAM_TIMEOUT))
    try:
        # GET (health) — simple pass-through, always fast.
        if request.method == "GET" or path not in STREAM_PATHS:
            status, data, ctype = await _call_upstream(session, request.method, UPSTREAM + path, body, request.headers)
            return web.Response(status=status, body=data, content_type=ctype.split(";")[0])

        # POST answer routes — heartbeat-stream while server.py works.
        resp = web.StreamResponse(
            status=200,
            headers={"Content-Type": "application/json", "Cache-Control": "no-cache"},
        )
        await resp.prepare(request)

        task = asyncio.create_task(
            _call_upstream(session, request.method, UPSTREAM + path, body, request.headers)
        )
        while True:
            try:
                status, data, _ = await asyncio.wait_for(asyncio.shield(task), timeout=HEARTBEAT_INTERVAL)
                break
            except asyncio.TimeoutError:
                # keep Cloudflare's connection alive; a space is valid JSON leading trivia
                await resp.write(b" ")

        await resp.write(data)
        await resp.write_eof()
        return resp
    finally:
        await session.close()


def main() -> None:
    app = web.Application(client_max_size=4 * 1024 * 1024)
    app.router.add_route("*", "/{tail:.*}", handle)
    print(f"AI heartbeat proxy on http://127.0.0.1:{PORT} -> {UPSTREAM} "
          f"(streaming {sorted(STREAM_PATHS)}, heartbeat {HEARTBEAT_INTERVAL}s)")
    web.run_app(app, host="127.0.0.1", port=PORT, print=None)


if __name__ == "__main__":
    main()
