"""Prove the RAG server's SDK options really isolate it from filesystem config.

`setting_sources=None` does NOT mean "load nothing". In this SDK it means the
`--setting-sources` flag is never emitted, so the CLI falls back to its default and
loads user + project settings, the repo's 53 KB CLAUDE.md, and user hooks into every
request. Only `[]` emits `--setting-sources=` (isolation mode).

That is invisible from the outside, so this asserts it at the level that actually
decides: the argv the SDK hands to the CLI. It builds the real `options_for()` and
calls the transport's own command builder. Nothing is spawned and no tokens are
spent, so it is safe to run any time.

  python -m eval.verify_isolation
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import server
from claude_agent_sdk._internal.transport.subprocess_cli import SubprocessCLITransport


def build_argv() -> list[str]:
    opts = server.options_for(model=server.ASK_MODEL, system_prompt=server.ASK_SYSTEM,
                              max_turns=4, effort="high")
    transport = SubprocessCLITransport(prompt="probe", options=opts)
    # `_build_command` refuses to run until connect() resolves the CLI path. Set a
    # placeholder so the argv can be inspected WITHOUT spawning the CLI: this check
    # must stay free and side-effect-free.
    transport._cli_path = transport._cli_path or "claude"   # noqa: SLF001
    return transport._build_command()          # noqa: SLF001 - the point is the argv


def main() -> int:
    argv = build_argv()
    joined = " ".join(argv)

    checks: list[tuple[str, bool, str]] = [
        ("--setting-sources= is emitted (isolation mode, no CLAUDE.md/settings/hooks)",
         any(a == "--setting-sources=" or a.startswith("--setting-sources=") and a == "--setting-sources="
             for a in argv),
         "MISSING -> the CLI will load user+project settings and CLAUDE.md"),
        ("--strict-mcp-config is emitted (ignore .mcp.json)",
         "--strict-mcp-config" in argv,
         "MISSING -> .mcp.json servers can be merged into the tool surface"),
        ("--system-prompt is passed through",
         "--system-prompt" in argv,
         "MISSING -> the prompt is not reaching the CLI"),
    ]

    print("argv flags of interest:")
    for a in argv:
        if a.startswith(("--setting-sources", "--strict-mcp", "--model", "--effort",
                         "--disallowedTools", "--mcp-config")):
            print(f"  {a[:110]}")

    print("\nchecks:")
    ok = True
    for label, passed, why in checks:
        print(f"  [{'PASS' if passed else 'FAIL'}] {label}")
        if not passed:
            print(f"         {why}")
            ok = False

    # A settings flag with a non-empty value would mean something IS being loaded.
    for a in argv:
        if a.startswith("--setting-sources=") and a != "--setting-sources=":
            print(f"  [FAIL] non-empty setting sources: {a}")
            ok = False

    print("\nISOLATION VERIFIED" if ok else "\nISOLATION NOT VERIFIED")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
