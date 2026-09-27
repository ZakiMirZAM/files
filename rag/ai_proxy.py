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
STREAM_PATHS = {"/ask", "/explain", "/define", "/verify", "/story-inputs", "/story-answer"}   # POST answer routes


async def _call_upstream(session, method, url, body, headers):
    fwd = {"Content-Type": headers.get("Content-Type", "application/json")}
    async with session.request(method, url, data=body, headers=fwd) as up:
        return up.status, await up.read(), up.headers.get("Content-Type", "application/json")


async def handle(request: web.Request) -> web.StreamResponse:
    path = request.path
    body = await request.read()
    session = ClientSession(timeout=ClientTimeout(total=UPSTREAM_TIMEOUT))
    task: asyncio.Task | None = None
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
            except Exception as exc:
                # The upstream (RAG on :3001) refused the connection or died mid-call
                # (e.g. it is still starting after a restart). The 200 status line is
                # already committed, so we cannot send a real error code, but leading
                # whitespace already flushed keeps the body valid JSON: append the same
                # graceful error object server.py itself returns on failure, so the
                # browser parses a clean {"error": ...} instead of a torn connection.
                print(f"[ai_proxy] upstream {path} failed: {type(exc).__name__}: {exc}", flush=True)
                await resp.write(
                    b'{"answer":"","explanation":"","definition":"",'
                    b'"sources":[],"error":"AI backend temporarily unavailable"}')
                await resp.write_eof()
                return resp

        await resp.write(data)
        await resp.write_eof()
        return resp
    finally:
        # If the client disconnected mid-heartbeat, `task` is still running the full
        # metered upstream call for a response nobody will read. Cancel it before
        # closing the session, or it raises later against a torn-down connector and
        # asyncio logs an unretrieved-task-exception.
        # `task is not None`, NOT `"task" in dir()`. dir() lists local NAMES, and
        # `task` is bound to None at the top of this function, so the old check was
        # always True. On the GET path (which returns before a task exists) that
        # made this line raise AttributeError inside `finally`, which replaces the
        # response with a 500. Every GET through the proxy failed that way.
        if task is not None and not task.done():
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
        await session.close()


def main() -> None:
    app = web.Application(client_max_size=4 * 1024 * 1024)
    app.router.add_route("*", "/{tail:.*}", handle)
    print(f"AI heartbeat proxy on http://127.0.0.1:{PORT} -> {UPSTREAM} "
          f"(streaming {sorted(STREAM_PATHS)}, heartbeat {HEARTBEAT_INTERVAL}s)")
    web.run_app(app, host="127.0.0.1", port=PORT, print=None)


if __name__ == "__main__":
    main()
