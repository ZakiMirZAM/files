"""External research MCP servers: web-page extraction and academic papers.

Three free, keyless, LOCAL stdio servers (no Docker, no cloud spend), spawned by
the Claude Code CLI per request exactly like the in-process tools:

  fetch   mcp-server-fetch (official MCP reference): URL -> clean markdown, with
          `start_index` pagination for long pages. Full-fidelity extraction where
          the built-in WebFetch summarises.
  arxiv   arxiv-mcp-server (PyPI): search arXiv, fetch abstracts, download and
          READ full paper text into managed local storage.
  papers  paper-search-mcp (PyPI): multi-source academic SEARCH (SSRN, Semantic
          Scholar, OpenAlex, Google Scholar, PubMed, ...).

CURATION IS THE POINT OF THIS MODULE. The three servers advertise 72 tools
between them; probing (probe_mcp_tools.py) is how the exact names below were
pinned. Only ALLOWED_RESEARCH is exposed; everything else is both excluded via
`disallowed_tools` and denied by the server's exact-match permission guard. The
exclusions are deliberate:
  * every `download_*` tool on the papers server takes a caller-chosen save_path
    (an arbitrary filesystem write the model does not need),
  * `download_scihub` is excluded on legal grounds,
  * watch/alert/reindex/BibTeX/LaTeX tooling is workflow machinery, not answering.
The arxiv server's own download_paper is kept because it writes only to its
managed storage dir, which we pin to rag/arxiv_papers via ARXIV_STORAGE_PATH.

The system prompts are IMMUTABLE, and unlike calc_tools these packages own their
tool descriptions, so the only steering lever is GUIDANCE, appended to the USER
message by the handlers. It restates the standing order: the vault remains the
primary voice and most of the answer; these tools extract and confirm.

Flag: RAG_RESEARCH in {on, off}, default ON (the owner asked for these to be used
on /ask and /explain). `off` restores today's tool surface exactly. Two-valued
because a tool the model can see has no honest shadow mode.
"""
from __future__ import annotations

import importlib.util
import os
import shutil
import sys

MODE = os.environ.get("RAG_RESEARCH", "on").lower()

_HERE = os.path.dirname(os.path.abspath(__file__))
ARXIV_STORAGE = os.path.join(_HERE, "arxiv_papers")

# --- probed inventories (probe_mcp_tools.py, 2026-07-28) ---------------------
# Full lists as advertised by each server. Re-run the probe after any package
# upgrade: a renamed tool here silently becomes a denied tool in production.
FETCH_ALL = ["mcp__fetch__fetch"]
ARXIV_ALL = [
    "mcp__arxiv__search_papers", "mcp__arxiv__download_paper", "mcp__arxiv__list_papers",
    "mcp__arxiv__read_paper", "mcp__arxiv__get_abstract", "mcp__arxiv__semantic_search",
    "mcp__arxiv__reindex", "mcp__arxiv__citation_graph", "mcp__arxiv__export_citations",
    "mcp__arxiv__watch_topic", "mcp__arxiv__check_alerts", "mcp__arxiv__get_paper_latex",
    "mcp__arxiv__list_paper_latex_sections", "mcp__arxiv__get_paper_latex_section",
]
PAPERS_ALL = [
    "mcp__papers__search_papers", "mcp__papers__search_arxiv", "mcp__papers__search_pubmed",
    "mcp__papers__search_biorxiv", "mcp__papers__search_medrxiv",
    "mcp__papers__search_google_scholar", "mcp__papers__search_iacr",
    "mcp__papers__download_arxiv", "mcp__papers__download_pubmed",
    "mcp__papers__download_biorxiv", "mcp__papers__download_medrxiv",
    "mcp__papers__download_iacr", "mcp__papers__read_arxiv_paper",
    "mcp__papers__read_pubmed_paper", "mcp__papers__read_biorxiv_paper",
    "mcp__papers__read_medrxiv_paper", "mcp__papers__read_iacr_paper",
    "mcp__papers__search_semantic", "mcp__papers__download_semantic",
    "mcp__papers__read_semantic_paper", "mcp__papers__search_crossref",
    "mcp__papers__get_crossref_paper_by_doi", "mcp__papers__download_crossref",
    "mcp__papers__download_scihub", "mcp__papers__download_with_fallback",
    "mcp__papers__read_crossref_paper", "mcp__papers__search_openalex",
    "mcp__papers__search_pmc", "mcp__papers__search_core", "mcp__papers__search_europepmc",
    "mcp__papers__search_dblp", "mcp__papers__search_openaire",
    "mcp__papers__search_citeseerx", "mcp__papers__search_doaj", "mcp__papers__search_base",
    "mcp__papers__search_zenodo", "mcp__papers__search_hal", "mcp__papers__search_ssrn",
    "mcp__papers__search_unpaywall", "mcp__papers__read_dblp_paper",
    "mcp__papers__download_dblp", "mcp__papers__read_openaire_paper",
    "mcp__papers__download_openaire", "mcp__papers__read_citeseerx_paper",
    "mcp__papers__download_citeseerx", "mcp__papers__read_doaj_paper",
    "mcp__papers__download_doaj", "mcp__papers__read_base_paper",
    "mcp__papers__download_base", "mcp__papers__read_zenodo_paper",
    "mcp__papers__download_zenodo", "mcp__papers__read_hal_paper",
    "mcp__papers__download_hal", "mcp__papers__read_ssrn_paper",
    "mcp__papers__download_ssrn", "mcp__papers__read_openalex_paper",
    "mcp__papers__download_openalex",
]

# --- the curated surface -----------------------------------------------------
ALLOWED_RESEARCH = [
    # Full-fidelity page extraction (the Firecrawl-role tool).
    "mcp__fetch__fetch",
    # arXiv: discover, pre-check with the abstract, then read the full text.
    "mcp__arxiv__search_papers",
    "mcp__arxiv__get_abstract",
    "mcp__arxiv__download_paper",
    "mcp__arxiv__read_paper",
    # Multi-source discovery. SSRN and Semantic Scholar carry most finance work.
    "mcp__papers__search_papers",
    "mcp__papers__search_ssrn",
    "mcp__papers__search_semantic",
    "mcp__papers__search_openalex",
    "mcp__papers__search_google_scholar",
]
DISALLOWED_RESEARCH = sorted(
    (set(FETCH_ALL) | set(ARXIV_ALL) | set(PAPERS_ALL)) - set(ALLOWED_RESEARCH))

TOOLS = list(ALLOWED_RESEARCH) if MODE == "on" else []


def _available() -> dict:
    """Only register a server whose runtime actually resolves. A bad `command`
    fails inside the CLI child (not here), so this is the graceful-degradation
    gate; a missing package just means that server's tools are absent."""
    out: dict = {}
    python = sys.executable
    if importlib.util.find_spec("mcp_server_fetch"):
        # A declared contact User-Agent, matching the repo's EDGAR convention
        # (backend/betas/edgar_client.py): SEC and several data hosts 403 anonymous
        # automated fetches but accept a bot that identifies itself.
        out["fetch"] = {"command": python,
                        "args": ["-m", "mcp_server_fetch", "--user-agent",
                                 "IntrinsicFinEd/1.0 (research tool; contact zakizamzaki08@gmail.com)"]}
    if importlib.util.find_spec("arxiv_mcp_server"):
        out["arxiv"] = {"command": python, "args": ["-m", "arxiv_mcp_server"],
                        "env": {"ARXIV_STORAGE_PATH": ARXIV_STORAGE}}
    if importlib.util.find_spec("paper_search_mcp"):
        out["papers"] = {"command": python, "args": ["-m", "paper_search_mcp.server"]}
    return out


def servers() -> dict:
    return _available() if MODE == "on" else {}


def disallowed() -> list[str]:
    """Names stripped from the model's tool listing. Belt to the guard's braces:
    even if a CLI version still lists them, the exact-match permission guard
    denies anything outside ALLOWED_TOOLS."""
    return list(DISALLOWED_RESEARCH) if MODE == "on" else []


# Appended to the USER message (never the system prompt) by handle_ask and
# handle_explain. The sourcing order it restates is the immutable prompt's own.
GUIDANCE = (
    "\n\nRESEARCH TOOLS AVAILABLE THIS REQUEST (in addition to the usual ones): "
    "fetch (read a specific web page in full as markdown, with start_index to page "
    "through long documents), arxiv search_papers/get_abstract/download_paper/"
    "read_paper (find and read academic papers in full), and papers search tools "
    "(search_papers, search_ssrn, search_semantic, search_openalex, "
    "search_google_scholar) for finding published research across sources. "
    "Use fetch when a specific page's full content matters and a summary is not "
    "enough. Use the paper tools when a claim rests on published research: find the "
    "paper, check the abstract, and read the relevant part before citing it. "
    "The standing rules are unchanged: the vault remains the primary voice and the "
    "majority of the answer, figures in the Computed data block stay authoritative "
    "over anything these tools return, and every tool source you rely on must be "
    "cited in the Sources line."
)
