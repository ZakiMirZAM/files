"""Tests for the external research MCP wiring. Network-free; no server is spawned.

  python -m pytest rag/test_research_tools.py -q
"""
from __future__ import annotations

import importlib.util
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import research_tools


# --- flag discipline ---------------------------------------------------------
def test_default_is_on():
    """Unlike calc, this defaults ON: the owner asked for the research tools to be
    used on /ask and /explain. Two-valued, no shadow for a visible tool."""
    assert research_tools.MODE in ("on", "off")
    assert os.environ.get("RAG_RESEARCH", "on").lower() == research_tools.MODE


def test_off_empties_everything(monkeypatch):
    monkeypatch.setattr(research_tools, "MODE", "off")
    assert research_tools.servers() == {}
    assert research_tools.disallowed() == []
    # TOOLS is bound at import; the server-side splice uses it, so assert the
    # off-state CONTRACT on the functions that are evaluated per call.


# --- curation, the point of the module ---------------------------------------
def test_curated_surface_is_small():
    """The three servers advertise 72 tools. Exposing them all would push dozens
    of schemas into every request; the curated list must stay tight."""
    assert len(research_tools.ALLOWED_RESEARCH) <= 12


def test_curated_and_disallowed_partition_the_probed_inventory():
    everything = (set(research_tools.FETCH_ALL) | set(research_tools.ARXIV_ALL)
                  | set(research_tools.PAPERS_ALL))
    allowed = set(research_tools.ALLOWED_RESEARCH)
    disallowed = set(research_tools.DISALLOWED_RESEARCH)
    assert allowed <= everything, "an allowed tool is not in any probed inventory"
    assert allowed | disallowed == everything
    assert allowed & disallowed == set()


def test_scihub_is_excluded():
    assert "mcp__papers__download_scihub" in research_tools.DISALLOWED_RESEARCH


def test_arbitrary_path_downloads_are_excluded():
    """Every papers download_* takes a caller-chosen save_path: an arbitrary
    filesystem write the model does not need. All must stay disallowed."""
    for name in research_tools.PAPERS_ALL:
        if "download" in name:
            assert name in research_tools.DISALLOWED_RESEARCH, name


def test_tool_name_format():
    for name in research_tools.ALLOWED_RESEARCH:
        assert name.startswith("mcp__") and name.count("__") >= 2, name


# --- graceful degradation ----------------------------------------------------
def test_available_filters_missing_runtimes(monkeypatch):
    monkeypatch.setattr(importlib.util, "find_spec", lambda _name: None)
    assert research_tools._available() == {}


def test_available_registers_present_runtimes():
    """On THIS machine all three packages are installed, so all three register."""
    servers = research_tools._available()
    assert set(servers) == {"fetch", "arxiv", "papers"}
    for cfg in servers.values():
        assert cfg["command"] == sys.executable
        assert cfg["args"][0] == "-m"


def test_arxiv_storage_is_pinned_inside_rag():
    cfg = research_tools._available().get("arxiv")
    if cfg is None:
        pytest.skip("arxiv_mcp_server not installed")
    assert cfg["env"]["ARXIV_STORAGE_PATH"].endswith("arxiv_papers")


# --- the guidance block ------------------------------------------------------
def test_guidance_restates_vault_dominance():
    g = research_tools.GUIDANCE
    assert "vault remains the primary voice" in g
    assert "majority of the answer" in g
    assert "authoritative" in g          # page figures stay authoritative
    assert "Sources" in g


def test_guidance_has_no_em_dashes():
    assert "—" not in research_tools.GUIDANCE


def test_guidance_names_only_allowed_tools():
    """The guidance must not advertise a tool the guard would deny."""
    import re
    mentioned = set(re.findall(r"mcp__[a-z_]+__[a-z_]+", research_tools.GUIDANCE))
    assert mentioned <= set(research_tools.ALLOWED_RESEARCH)


# --- server wiring -----------------------------------------------------------
server = pytest.importorskip("server", reason="claude_agent_sdk not installed")


def test_allowed_tools_carries_the_curated_set_when_on():
    if research_tools.MODE != "on":
        pytest.skip("RAG_RESEARCH is off in this environment")
    for name in research_tools.ALLOWED_RESEARCH:
        assert name in server.ALLOWED_TOOLS


def test_options_register_the_servers_and_strip_the_rest():
    opts = server.options_for(model="claude-haiku-4-5",
                              system_prompt=server.ASK_SYSTEM, max_turns=4)
    if research_tools.MODE == "on":
        for key in ("fetch", "arxiv", "papers"):
            assert key in opts.mcp_servers
        assert set(research_tools.DISALLOWED_RESEARCH) <= set(opts.disallowed_tools)
    # In every state the in-process servers must still be present.
    for key in ("vault", "news", "social"):
        assert key in opts.mcp_servers


def test_original_tools_survive():
    for name in (server.VAULT_TOOL, "WebSearch", "WebFetch"):
        assert name in server.ALLOWED_TOOLS


def test_system_prompt_still_byte_identical_with_research_on(monkeypatch):
    """The guidance lives in the USER message only. Under every research mode the
    system prompt handed to the SDK is the module literal, unchanged."""
    for mode in ("on", "off"):
        monkeypatch.setattr(research_tools, "MODE", mode)
        for name in ("ASK_SYSTEM", "EXPLAIN_SYSTEM", "DEFINE_SYSTEM"):
            literal = getattr(server, name)
            opts = server.options_for(model="claude-haiku-4-5",
                                      system_prompt=literal, max_turns=4)
            assert opts.system_prompt == literal


def test_health_reports_the_research_flag():
    import asyncio
    import json

    class _Req:
        pass

    resp = asyncio.get_event_loop_policy().new_event_loop().run_until_complete(
        server.handle_health(_Req()))
    body = json.loads(resp.body.decode())
    assert body["research"] == research_tools.MODE
