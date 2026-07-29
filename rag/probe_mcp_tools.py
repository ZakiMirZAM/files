"""List the real tool names of the external research MCP servers.

`can_use_tool` in server.py does EXACT string matching on `mcp__<key>__<tool>`, so
the allowlist in research_tools.py must carry each server's actual tool names, not
guesses. This script launches each server over stdio, runs the MCP handshake, and
prints what it actually advertises. Run it once to pin the constants, and again
after any package upgrade to catch a renamed tool before production does.

  python probe_mcp_tools.py
"""
from __future__ import annotations

import asyncio
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

PYTHON = sys.executable

SERVERS: dict[str, StdioServerParameters] = {
    "fetch": StdioServerParameters(command=PYTHON, args=["-m", "mcp_server_fetch"]),
    "arxiv": StdioServerParameters(command=PYTHON, args=["-m", "arxiv_mcp_server"]),
    "papers": StdioServerParameters(command=PYTHON, args=["-m", "paper_search_mcp.server"]),
}


async def probe(key: str, params: StdioServerParameters) -> list[str]:
    names: list[str] = []
    try:
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                await asyncio.wait_for(session.initialize(), timeout=30)
                result = await asyncio.wait_for(session.list_tools(), timeout=30)
                for tool in result.tools:
                    full = f"mcp__{key}__{tool.name}"
                    names.append(full)
                    desc = (tool.description or "").replace("\n", " ")[:110]
                    print(f"  {full}")
                    print(f"      {desc}")
    except Exception as exc:                     # noqa: BLE001 - a probe reports, never raises
        print(f"  FAILED: {type(exc).__name__}: {exc}")
    return names


async def main() -> None:
    pinned: dict[str, list[str]] = {}
    for key, params in SERVERS.items():
        print(f"\n=== {key}: {params.command} {' '.join(params.args)} ===")
        pinned[key] = await probe(key, params)

    print("\n=== paste into research_tools.py ===")
    for key, names in pinned.items():
        print(f"{key.upper()}_TOOLS = {names!r}")


if __name__ == "__main__":
    asyncio.run(main())
